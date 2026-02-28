const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.dirname(process.env.DB_FILE || path.join(__dirname, 'data', 'requests.db'));
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'requests.db');
const db = new Database(dbFile);

// DB hardening/perf for SQLite in container
try {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
} catch (e) {
  // non-fatal
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

const localIps = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const isLocalRequest = (ip = '') => localIps.has(String(ip));
const suspiciousPath = /(?:^|\/)(?:wp-admin|wp-login\.php|xmlrpc\.php|vendor\/phpunit|cgi-bin|phpmyadmin|\.env|\.git)(?:$|\/)/i;
const safeTokenEqual = (left = '', right = '') => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const enableHttpsHeaders = String(process.env.ENABLE_HTTPS_HEADERS || 'false') === 'true';
const adminUser = String(process.env.ADMIN_USERNAME || '').trim();
const adminPass = String(process.env.ADMIN_PASSWORD || '').trim();
const adminSessionTtlMs = Math.max(10, Number(process.env.ADMIN_SESSION_TTL_MIN || 480)) * 60 * 1000;
const adminCookieName = 'bk_admin_sid';
const adminCookieSecure = String(process.env.ADMIN_COOKIE_SECURE || String(enableHttpsHeaders)) === 'true';
const submitCooldownMs = Math.max(3, Number(process.env.REQUEST_COOLDOWN_SEC || 15)) * 1000;
const adminSessions = new Map();
const lastRequestByIp = new Map();
const loginFailuresByIp = new Map();
const adminLoginLockSec = Math.max(10, Number(process.env.ADMIN_LOGIN_LOCK_SEC || 120));
setInterval(() => {
  const now = Date.now();
  for (const [sid, sess] of adminSessions.entries()) {
    if (!sess || sess.expiresAt < now) adminSessions.delete(sid);
  }
}, 10 * 60 * 1000).unref();

const parseCookies = (cookieHeader = '') => Object.fromEntries(
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, ...rest] = part.split('=');
      return [key, decodeURIComponent(rest.join('=') || '')];
    })
);


const hasTrustedOrigin = (req) => {
  const origin = String(req.get('origin') || '');
  const host = String(req.get('host') || '');
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
};

const getAdminSession = (req) => {
  const sid = parseCookies(req.get('cookie') || '')[adminCookieName];
  if (!sid) return null;
  const item = adminSessions.get(sid);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    adminSessions.delete(sid);
    return null;
  }
  return { sid, ...item };
};

const createAdminSession = (username) => {
  const sid = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  adminSessions.set(sid, { username, createdAt: now, expiresAt: now + adminSessionTtlMs });
  return sid;
};

const adminCookie = (sid, maxAgeSec = Math.floor(adminSessionTtlMs / 1000)) => `${adminCookieName}=${encodeURIComponent(sid)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${adminCookieSecure ? '; Secure' : ''}`;

const requireAdminSession = (req, res, next) => {
  const session = getAdminSession(req);
  if (!session) return res.status(401).json({ message: 'Unauthorized' });
  req.adminSession = session;
  res.setHeader('Cache-Control', 'no-store');
  return next();
};

app.use(
  helmet({
    hsts: enableHttpsHeaders,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        frameSrc: ["'self'", 'https://yandex.ru', 'https://*.yandex.ru'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null
      }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use((req, res, next) => {
  const reqId = crypto.randomUUID();
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много запросов, попробуйте позже.' }
});
const formLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Лимит заявок превышен. Повторите попытку через 10 минут.' }
});
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много запросов к административному API.' }
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много попыток входа. Попробуйте позже.' }
});

app.use('/api', apiLimiter);

app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'index, follow');
  next();
});

app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  if (suspiciousPath.test(req.path)) {
    return res.status(404).json({ message: 'Not found' });
  }
  return next();
});

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    organization TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    message TEXT,
    item TEXT,
    source TEXT,
    ip TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'new',
    manager_note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const requestColumns = db.prepare('PRAGMA table_info(requests)').all().map((c) => c.name);
if (!requestColumns.includes('status')) db.exec("ALTER TABLE requests ADD COLUMN status TEXT DEFAULT 'new'");
if (!requestColumns.includes('manager_note')) db.exec("ALTER TABLE requests ADD COLUMN manager_note TEXT");

const insertStmt = db.prepare(`
  INSERT INTO requests (name, organization, phone, email, message, item, source, ip, user_agent)
  VALUES (@name, @organization, @phone, @email, @message, @item, @source, @ip, @user_agent)
`);
const listStmt = db.prepare(`
  SELECT id, name, organization, phone, email, message, item, source, status, manager_note, created_at
  FROM requests
  ORDER BY id DESC
  LIMIT ?
`);
const updateStatusStmt = db.prepare(`
  UPDATE requests
  SET status = @status, manager_note = @manager_note
  WHERE id = @id
`);

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    })
  : nodemailer.createTransport({ jsonTransport: true });

const page = (name) => path.join(__dirname, 'public', 'pages', `${name}.html`);
const adminUiPath = process.env.ADMIN_UI_PATH || '/internal/ops-panel';

app.get('/', (req, res) => res.sendFile(page('index')));
app.get('/catalog', (req, res) => res.sendFile(page('catalog')));
app.get('/about', (req, res) => res.sendFile(page('about')));
app.get('/contacts', (req, res) => res.sendFile(page('contacts')));
app.get('/privacy', (req, res) => res.sendFile(page('privacy')));
app.get(adminUiPath, (req, res) => { res.setHeader('Cache-Control', 'no-store'); return res.sendFile(page('admin-requests')); });
app.get('/uslugi/pomoshch-snabzhentsu', (req, res) => res.sendFile(page('service-1')));
app.get('/uslugi/kompleksnoe-snabzhenie', (req, res) => res.sendFile(page('service-2')));
app.get('/uslugi/poisk-materialov', (req, res) => res.sendFile(page('service-3')));

app.post('/api/requests', formLimiter, (req, res) => {
  const payload = req.body || {};
  const clean = (value, max = 255) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

  const name = clean(payload.name, 120);
  const organization = clean(payload.organization, 160);
  const phone = clean(payload.phone, 30);
  const email = clean(payload.email, 160).toLowerCase();
  const message = clean(payload.message, 2000);
  const item = clean(payload.item, 240);
  const source = clean(payload.source, 120);
  const website = clean(payload.website, 120);

  if (website) return res.status(400).json({ message: 'Spam protection triggered.' });
  if (name.length < 2 || name.length > 120) return res.status(400).json({ message: 'Укажите корректное имя.' });
  if (!/^\+?[\d\s\-()]{6,20}$/.test(phone)) return res.status(400).json({ message: 'Укажите корректный телефон.' });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Некорректный email.' });
  if (message.length > 2000) return res.status(400).json({ message: 'Сообщение слишком длинное.' });
  if (item.length > 240 || source.length > 120) return res.status(400).json({ message: 'Некорректные параметры заявки.' });

  const ipKey = String(req.ip || 'unknown');
  const now = Date.now();
  const last = lastRequestByIp.get(ipKey) || 0;
  if (now - last < submitCooldownMs) {
    return res.status(429).json({ message: 'Слишком частые отправки. Повторите через несколько секунд.' });
  }
  lastRequestByIp.set(ipKey, now);

  insertStmt.run({
    name,
    organization,
    phone,
    email,
    message,
    item,
    source,
    ip: req.ip,
    user_agent: String(req.get('user-agent') || '').slice(0, 255)
  });

  transporter
    .sendMail({
      from: process.env.MAIL_FROM || 'noreply@bk-trade.local',
      to: process.env.MAIL_TO || 'sales@bk-trade.ru',
      subject: 'Новая заявка с сайта БК-Трейд',
      text: `Источник: ${source}\nИмя: ${name}\nОрганизация: ${organization}\nТелефон: ${phone}\nEmail: ${email}\nПозиция: ${item}\nСообщение: ${message}`
    })
    .catch(() => null);

  return res.json({ message: 'Спасибо! Заявка принята, менеджер свяжется с вами в течение часа.' });
});

app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  if (!hasTrustedOrigin(req)) return res.status(403).json({ message: 'Forbidden origin' });
  if (!adminUser || !adminPass) {
    return res.status(503).json({ message: 'Админ-доступ не настроен на сервере.' });
  }

  const ip = String(req.ip || 'unknown');
  const state = loginFailuresByIp.get(ip) || { fails: 0, blockedUntil: 0 };
  if (state.blockedUntil > Date.now()) {
    return res.status(429).json({ message: 'Вход временно заблокирован для этого IP. Попробуйте позже.' });
  }

  const username = String(req.body?.username || '').trim().slice(0, 80);
  const password = String(req.body?.password || '').slice(0, 160);
  const validUser = safeTokenEqual(username, adminUser);
  const validPass = safeTokenEqual(password, adminPass);

  if (!validUser || !validPass) {
    const fails = (state.fails || 0) + 1;
    const blockedUntil = fails >= 5 ? Date.now() + adminLoginLockSec * 1000 : 0;
    loginFailuresByIp.set(ip, { fails, blockedUntil });
    return res.status(401).json({ message: 'Неверный логин или пароль.' });
  }

  loginFailuresByIp.delete(ip);
  const sid = createAdminSession(username);
  res.setHeader('Set-Cookie', adminCookie(sid));
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ message: 'Вход выполнен.', username });
});

app.post('/api/admin/logout', adminLimiter, requireAdminSession, (req, res) => {
  if (!hasTrustedOrigin(req)) return res.status(403).json({ message: 'Forbidden origin' });
  adminSessions.delete(req.adminSession.sid);
  res.setHeader('Set-Cookie', adminCookie('', 0));
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ message: 'Вы вышли из кабинета.' });
});

app.get('/api/admin/me', adminLimiter, requireAdminSession, (req, res) => {
  return res.json({ username: req.adminSession.username, expiresAt: req.adminSession.expiresAt });
});

app.get('/api/admin/requests', adminLimiter, requireAdminSession, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 500);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ items: listStmt.all(limit) });
});


app.post('/api/admin/requests/:id/status', adminLimiter, requireAdminSession, (req, res) => {
  if (!hasTrustedOrigin(req)) return res.status(403).json({ message: 'Forbidden origin' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Некорректный ID заявки.' });

  const allowed = new Set(['new', 'in_progress', 'done']);
  const status = String(req.body?.status || '').trim();
  const manager_note = String(req.body?.manager_note || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 400);
  if (!allowed.has(status)) return res.status(400).json({ message: 'Некорректный статус.' });

  const result = updateStatusStmt.run({ id, status, manager_note });
  if (!result.changes) return res.status(404).json({ message: 'Заявка не найдена.' });
  return res.json({ message: 'Статус обновлён.' });
});

app.get('/api/version', (req, res) => {
  const commit = process.env.APP_COMMIT || 'dev';
  res.json({ name: 'bk-trade', version: '1.2.0', commit });
});

app.get('/api/health', (req, res) => {
  if (String(process.env.ALLOW_PUBLIC_HEALTH || 'false') !== 'true' && !isLocalRequest(req.ip)) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.json({ status: 'ok', dbFile, env: process.env.NODE_ENV || 'development', httpsHeaders: enableHttpsHeaders });
});

app.get('/sitemap.xml', (req, res) => {
  const host = process.env.PUBLIC_URL || 'https://bk-trade.ru';
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${host}/</loc></url>
  <url><loc>${host}/catalog</loc></url>
  <url><loc>${host}/about</loc></url>
  <url><loc>${host}/contacts</loc></url>
  <url><loc>${host}/privacy</loc></url>
</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  const host = process.env.PUBLIC_URL || 'https://bk-trade.ru';
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${host}/sitemap.xml`);
});

app.use((req, res) => res.status(404).sendFile(page('404')));
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
});

app.listen(port, () => {
  console.log(`BK-Trade website is running at http://localhost:${port}`);
});
