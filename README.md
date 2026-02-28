# ООО «БК-Трейд» — enterprise-ready fullstack сайт

Промышленный B2B-сайт на **Node.js (Express) + SQLite + Nginx + Docker Compose**.

## Что улучшено по сравнению с базовым scaffold

- Устранена критичная проблема `SQLITE_CANTOPEN` в Docker (инициализация и права на БД в entrypoint).
- `docker compose up` теперь поднимает **web + nginx**, и сайт доступен сразу на `:80`.
- Добавлена внутренняя **панель заявок** (`/admin/requests`) и защищённый API `GET /api/admin/requests` по токену.
- Усилены production-настройки (Helmet CSP, rate limiting, compress, logging, static cache, SQLite pragmas).

---

## Требования

- Docker 20.10+
- Docker Compose v2+

---

## Быстрый старт (как у INTERTEX)

### 1) Подготовка конфигурации

```bash
cp .env.example .env
```

Отредактируйте `.env` обязательно:

- `PUBLIC_URL`
- `ADMIN_API_TOKEN` (сложный токен)
- SMTP-параметры (если нужна реальная отправка email)

### 2) Запуск dev-стека

```bash
docker compose up -d --build
```

### 3) Проверка

```bash
docker compose ps
docker compose logs -f web
curl http://localhost/api/health
```

Сайт: `http://localhost`

### 4) Остановка

```bash
docker compose down
```

---

## Production запуск

```bash
cp .env.example .env
# настройте production значения

docker compose -f docker-compose.prod.yml up -d --build
```

Проверка:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
curl http://localhost/api/health
```

---

## Исправление ошибки из ваших логов: SQLITE_CANTOPEN

Причина: контейнер не мог открыть/создать SQLite файл (права/директория).

Что сделано:

1. В `entrypoint.sh` добавлена инициализация `DB_FILE`:
   - `mkdir -p /app/data`
   - `touch "$DB_FILE"`
   - `chmod 0777 /app/data` и `chmod 0666 "$DB_FILE"` (для совместимости с bind mount)
2. Убрана принудительная работа под `USER node` в Dockerfile (чтобы не ломаться на серверах с root-owned bind mount).
3. В `docker-compose.yml` добавлен nginx на `:80`, чтобы запуск был ожидаемым для прод-сценария.

---

## Внутренний кабинет заявок (операционный контур)

- Страница: `http://localhost${ADMIN_UI_PATH}` (по умолчанию `/internal/ops-panel`)
- API: `GET /api/admin/requests?limit=200`
- Доступ: header `x-admin-token: <ADMIN_API_TOKEN>`

Пример:

```bash
curl http://localhost/api/admin/requests?limit=50 \
  -H "x-admin-token: <your-token>"
```

---

## .env переменные

- `NODE_ENV` — `production`/`development`
- `PORT` — порт web-сервиса
- `PUBLIC_URL` — базовый URL для sitemap/robots
- `DB_FILE` — путь до SQLite
- `MAIL_FROM`, `MAIL_TO` — email уведомления
- `ADMIN_API_TOKEN` — токен для внутреннего admin API
- `ADMIN_UI_PATH` — нестандартный путь к странице менеджера/админ-панели
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` — SMTP

---

## Управление через Makefile

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

## Диагностика и устранение неполадок

### Контейнер web перезапускается

```bash
docker compose ps
docker compose logs -f web
```

Если ошибка SQLite:

```bash
mkdir -p data
chmod 777 data
```

и перезапуск:

```bash
docker compose down
docker compose up -d --build
```

### Порт 80 не слушает

```bash
docker compose ps
sudo ss -ltnp 'sport = :80'
```

Убедитесь что сервис `nginx` поднят.

### 401 в admin API

Проверьте `ADMIN_API_TOKEN` в `.env` и заголовок `x-admin-token`.

---

## Security checklist

- [x] Honeypot антиспам
- [x] API + form rate limit
- [x] CSP/Helmet
- [x] gzip/compression
- [x] token-protected admin API
- [x] ограничение body size
- [x] логирование запросов



## Почему мог отображаться "голый HTML" и как исправлено

### ERR_CERT_COMMON_NAME_INVALID для styles.css/app.js/logo

Это отдельная проблема: браузер пытался грузить ресурсы по `https`, но сертификат домена невалиден/не соответствует CN.

Что исправлено в коде:
- отключены принудительные HTTPS-заголовки по умолчанию (`HSTS`),
- отключён `upgrade-insecure-requests` в CSP,
- добавлен флаг `ENABLE_HTTPS_HEADERS` (по умолчанию `false`).

Если у вас пока нет корректного TLS-сертификата — оставляйте `ENABLE_HTTPS_HEADERS=false`.
После выпуска валидного сертификата можно включить: `ENABLE_HTTPS_HEADERS=true`.

Если браузер уже закешировал HSTS для домена, очистите HSTS-кеш/данные сайта и проверьте снова.


По вашим логам страница `/` открывалась, но статика (CSS/JS) не всегда корректно доходила до клиента через прокси-контур.

Что сделано:
- nginx теперь отдаёт статику (`/assets/*`, `manifest.json`, `robots.txt`, `sitemap.xml`) **напрямую**, а не только через proxy в web;
- добавлен `try_files ... @app` fallback;
- подключён отдельный volume с `public/` в nginx (`./public:/usr/share/nginx/html:ro`).

Это делает контур устойчивее и обычно полностью устраняет эффект "голого HTML".

После обновления на сервере:

```bash
docker compose down
docker compose up -d --build
docker compose logs -f nginx web
```

Проверьте, что CSS реально доступен:

```bash
curl -I http://localhost/assets/styles.css
curl -I http://localhost/assets/app.js
```


## Nginx edge-защита от DDoS/сканеров

В `nginx.conf` включены базовые защитные механики:

- per-IP `limit_req` для общих запросов и более строгий лимит для `/api/*`;
- `limit_conn` на количество одновременных соединений с одного IP;
- ограниченные `read/send/body/header` timeouts для отсечения slowloris-паттернов;
- блокировка типовых путей сканеров (`wp-admin`, `xmlrpc.php`, `vendor/phpunit`, `.env`, `cgi-bin` и т.д.);
- закрытие публичного доступа к `/api/health` на уровне Nginx (только localhost).

Для production рекомендуется дополнительно поставить внешний L3/L4/L7 shield (Cloudflare, DDoS-Guard, Yandex Cloud Smart Web Security и т.п.).


### Рекомендация для доступа менеджера

- Не используйте стандартный путь вроде `/admin` — задайте уникальный `ADMIN_UI_PATH`.
- Держите `ADMIN_API_TOKEN` длинным (32+ символа) и меняйте его регулярно.
- Для боевого контура лучше ограничить доступ к admin UI по IP на уровне Nginx/VPN.
