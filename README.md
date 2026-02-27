# ООО «БК-Трейд» — production-ready fullstack сайт

Корпоративный сайт для промышленного снабжения на **Node.js (Express) + SQLite + Vanilla JS/CSS**.

## 🚀 Что реализовано

- Многостраничный сайт: главная, каталог, 3 страницы услуг, о компании, контакты, 404, политика ПДн.
- Fullstack форма заявок (`POST /api/requests`) с:
  - серверной валидацией,
  - honeypot антиспамом,
  - rate limiting,
  - записью в SQLite,
  - email-уведомлениями через SMTP (или `jsonTransport` fallback).
- SEO/PWA: `sitemap.xml`, `robots.txt`, `manifest.json`, OG/meta.
- Production hardening: Helmet (CSP), gzip compression, proxy support, отключен `x-powered-by`, structured logging (morgan).
- Docker-инфраструктура для development и production (с Nginx reverse proxy).

---

## 📦 Требования

- Docker 20.10+
- Docker Compose v2+
- (опционально) Node.js 20+ для локального запуска без Docker

---

## ⚡ Быстрый старт (Development)

```bash
git clone <your-repo-url>
cd bk-trade
cp .env.example .env

docker compose up -d --build
```

Проверка:

```bash
docker compose ps
docker compose logs -f web
curl http://localhost:3000/api/health
```

Остановка:

```bash
docker compose down
```

---

## 🌐 Production запуск (Nginx + App)

```bash
cp .env.example .env
# отредактируйте .env под прод

docker compose -f docker-compose.prod.yml up -d --build
```

Сервисы:
- `nginx` — внешний вход на `:80`
- `web` — Node.js приложение (внутренний порт 3000)

Логи:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Остановка:

```bash
docker compose -f docker-compose.prod.yml down
```

---

## 🔐 Настройка `.env`

Ключевые переменные:

- `NODE_ENV=production`
- `PORT=3000`
- `PUBLIC_URL=https://bk-trade.ru`
- `DB_FILE=/app/data/requests.db`
- `MAIL_FROM=noreply@bk-trade.ru`
- `MAIL_TO=sales@bk-trade.ru`

SMTP (если нужна реальная отправка email):

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

Если SMTP не задан, используется безопасный fallback `jsonTransport`.

---

## 🧰 Управление через Makefile

```bash
make up
make down
make logs
make rebuild
make prod-up
make prod-down
make lint
```

---

## 🛠️ Локальный запуск без Docker

```bash
npm install
cp .env.example .env
npm start
```

Проверка API:

```bash
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","phone":"+79990000000","source":"manual"}'
```

---

## 🗄️ Данные и резервные копии

SQLite хранится в `./data/requests.db` (volume в Docker).

Бэкап:

```bash
cp data/requests.db backup_$(date +%Y%m%d_%H%M).db
```

Восстановление:

```bash
cp backup_YYYYMMDD_HHMM.db data/requests.db
```

---

## 🔎 Troubleshooting

### 1) Контейнеры не стартуют
```bash
docker compose ps
docker compose logs -f
```

### 2) Ошибка отправки email
- Проверьте SMTP переменные в `.env`
- Убедитесь, что SMTP доступен из сети сервера
- Смотрите логи `web`

### 3) Не сохраняются заявки
- Проверьте права на директорию `data/`
- Проверьте `DB_FILE` и `docker volume` монтирование

### 4) 429 Too Many Requests
Сработал rate limit на API. Подождите время окна и повторите.

---

## 📁 Структура проекта

```text
bk-trade/
├── public/
│   ├── assets/
│   └── pages/
├── data/
├── server.js
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── nginx.conf
├── entrypoint.sh
├── .env.example
├── Makefile
└── README.md
```

---

## ✅ Security checklist

- [x] `.env` исключён из git
- [x] `helmet` + CSP включены
- [x] API rate limiting включён
- [x] Honeypot антиспам включён
- [x] Ограничен размер body payload
- [x] `x-powered-by` отключён

