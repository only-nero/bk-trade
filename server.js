const fs = require('fs');
const path = require('path');
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

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        frameSrc: ["'self'", 'https://yandex.ru', 'https://*.yandex.ru'],
        connectSrc: ["'self'"]
      }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
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

app.use('/api', apiLimiter);

app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'index, follow');
  next();
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertStmt = db.prepare(`
  INSERT INTO requests (name, organization, phone, email, message, item, source, ip, user_agent)
  VALUES (@name, @organization, @phone, @email, @message, @item, @source, @ip, @user_agent)
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
app.get('/', (req, res) => res.sendFile(page('index')));
app.get('/catalog', (req, res) => res.sendFile(page('catalog')));
app.get('/about', (req, res) => res.sendFile(page('about')));
app.get('/contacts', (req, res) => res.sendFile(page('contacts')));
app.get('/privacy', (req, res) => res.sendFile(page('privacy')));
app.get('/uslugi/pomoshch-snabzhentsu', (req, res) => res.sendFile(page('service-1')));
app.get('/uslugi/kompleksnoe-snabzhenie', (req, res) => res.sendFile(page('service-2')));
app.get('/uslugi/poisk-materialov', (req, res) => res.sendFile(page('service-3')));

app.post('/api/requests', formLimiter, (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || '').trim();
  const organization = String(payload.organization || '').trim();
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const message = String(payload.message || '').trim();
  const item = String(payload.item || '').trim();
  const source = String(payload.source || '').trim();
  const website = String(payload.website || '').trim();

  if (website) return res.status(400).json({ message: 'Spam protection triggered.' });
  if (name.length < 2 || name.length > 120) return res.status(400).json({ message: 'Укажите корректное имя.' });
  if (!/^\+?[\d\s\-()]{6,20}$/.test(phone)) return res.status(400).json({ message: 'Укажите корректный телефон.' });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Некорректный email.' });
  if (message.length > 2000) return res.status(400).json({ message: 'Сообщение слишком длинное.' });

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

  transporter.sendMail({
    from: process.env.MAIL_FROM || 'noreply@bk-trade.local',
    to: process.env.MAIL_TO || 'sales@bk-trade.ru',
    subject: 'Новая заявка с сайта БК-Трейд',
    text: `Источник: ${source}\nИмя: ${name}\nОрганизация: ${organization}\nТелефон: ${phone}\nEmail: ${email}\nПозиция: ${item}\nСообщение: ${message}`
  }).catch(() => null);

  return res.json({ message: 'Спасибо! Заявка принята, менеджер свяжется с вами в течение часа.' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', dbFile, env: process.env.NODE_ENV || 'development' });
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

app.listen(port, () => {
  console.log(`BK-Trade website is running at http://localhost:${port}`);
});
