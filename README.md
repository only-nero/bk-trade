# ООО «БК-Трейд» — корпоративный fullstack сайт

Проект: многостраничный корпоративный сайт на **Node.js + Express + SQLite + Vanilla JS/CSS**.

## Быстрый запуск через Docker Compose

```bash
docker compose up --build -d
```

Сайт будет доступен на `http://localhost:3000`.

Проверка здоровья:

```bash
curl http://localhost:3000/api/health
```

Остановка:

```bash
docker compose down
```

## Локальный запуск без Docker

```bash
npm install
npm start
```

## Переменные окружения

- `PORT` — порт приложения (по умолчанию `3000`)
- `DB_FILE` — путь к SQLite БД (по умолчанию `./data/requests.db`)
- `MAIL_FROM` — адрес отправителя
- `MAIL_TO` — адрес получателя заявок
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` — SMTP-настройки

Если SMTP не задан, используется `jsonTransport` (без реальной отправки, удобно для dev/qa).
