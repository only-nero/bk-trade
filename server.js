const express = require('express');
const path = require('path');
const helmet = require('helmet');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');

const app = express();
const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'requests.db');
const db = new Database(dbFile);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'index, follow');
  next();
});

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    organization TEXT,
    phone TEXT,
    email TEXT,
    message TEXT,
    item TEXT,
    source TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertStmt = db.prepare(`
  INSERT INTO requests (name, organization, phone, email, message, item, source)
  VALUES (@name, @organization, @phone, @email, @message, @item, @source)
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
app.get('/uslugi/pomoshch-snabzhentsu', (req, res) => res.sendFile(page('service-1')));
app.get('/uslugi/kompleksnoe-snabzhenie', (req, res) => res.sendFile(page('service-2')));
app.get('/uslugi/poisk-materialov', (req, res) => res.sendFile(page('service-3')));

app.post('/api/requests', (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || '').trim();
  const organization = String(payload.organization || '').trim();
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim();
  const message = String(payload.message || '').trim();
  const item = String(payload.item || '').trim();
  const source = String(payload.source || '').trim();
  const website = String(payload.website || '').trim();

  if (website) return res.status(400).json({ message: 'Spam protection triggered.' });
  if (name.length < 2 || phone.length < 6) return res.status(400).json({ message: 'Укажите корректные имя и телефон.' });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Некорректный email.' });

  insertStmt.run({ name, organization, phone, email, message, item, source });
  transporter.sendMail({
    from: process.env.MAIL_FROM || 'noreply@bk-trade.local',
    to: process.env.MAIL_TO || 'sales@bk-trade.ru',
    subject: 'Новая заявка с сайта БК-Трейд',
    text: `Источник: ${source}\nИмя: ${name}\nОрганизация: ${organization}\nТелефон: ${phone}\nEmail: ${email}\nПозиция: ${item}\nСообщение: ${message}`
  });

  return res.json({ message: 'Спасибо! Заявка принята, менеджер свяжется с вами в течение часа.' });
});


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', dbFile });
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://bk-trade.ru/</loc></url>
  <url><loc>https://bk-trade.ru/catalog</loc></url>
  <url><loc>https://bk-trade.ru/about</loc></url>
  <url><loc>https://bk-trade.ru/contacts</loc></url>
</urlset>`);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://bk-trade.ru/sitemap.xml');
});

app.use((req, res) => res.status(404).sendFile(page('404')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`BK-Trade website is running at http://localhost:${port}`);
});
