# Развёртывание ATS Wallet в Coolify

Проект подготовлен для деплоя в [Coolify](https://coolify.io): все сервисы разнесены по контейнерам (MySQL, Go API, Next.js).

## Состав контейнеров

| Сервис     | Описание              | Порт  |
|------------|------------------------|-------|
| **postgres** | База данных PostgreSQL 16 | 5432 (внутренний) |
| **backend**  | Go API (Gin)             | 4000 (внутренний) |
| **frontend** | Next.js (standalone)    | 3000 (точка входа) |

Запросы к `/api/*` и `/webhook/*` проксируются с фронтенда на бэкенд (rewrites в Next.js).

## Вариант 1: Coolify — один стек (Docker Compose)

1. В Coolify создайте **New Resource** → **Docker Compose**.
2. Подключите репозиторий с проектом или загрузите файлы.
3. Укажите **Docker Compose Location**: `docker-compose.yml` (в корне).
4. Добавьте переменные окружения (см. ниже) в разделе **Environment** стека или в файле `.env` в корне (скопируйте из `.env.docker.example`).
5. Запустите деплой. Coolify соберёт образы и поднимет контейнеры.

Точка входа для пользователей — **frontend** (порт 3000). В настройках домена в Coolify привяжите домен к сервису **frontend**.

## Вариант 2: Coolify — три отдельных приложения

Можно разнести сервисы на три приложения:

1. **PostgreSQL** — тип "Database" или образ `postgres:16-alpine`, переменные `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, volume для данных.
2. **Backend** — тип "Dockerfile", контекст `backend-go`, порт 4000. В env задать `DB_HOST=<host Postgres из Coolify>`, `DB_PORT=5432`, остальные переменные из `backend-go/.env.example`.
3. **Frontend** — тип "Dockerfile", контекст `frontend`, порт 3000. В env задать `NEXT_PUBLIC_API_BACKEND=https://ваш-домен-api` или внутренний URL бэкенда (если Coolify даёт внутреннюю сеть).

Рекомендуется **Вариант 1** (один Docker Compose): проще управлять и все сервисы в одной сети.

## Переменные окружения

Скопируйте `.env.docker.example` в `.env` в корне и заполните:

- **POSTGRES_USER**, **POSTGRES_PASSWORD**, **POSTGRES_DB** — пользователь, пароль и имя БД для контейнера PostgreSQL.
- **JWT_SECRET**, **ADMIN_JWT_SECRET** — секреты для API и админки.
- **CORS_ORIGIN** — публичный URL фронта (например `https://wallet.example.com`).
- **TELEGRAM_***, **SUPPORT_BOT_*** — боты и вебхуки (см. README.md).
- **TRONGRID_API_KEY**, **WALLET_PASSWORD** — по необходимости.

В Coolify эти переменные можно задать в UI стека (Docker Compose) или в **Environment** для каждого сервиса.

## Домен и SSL

В Coolify для сервиса **frontend** укажите домен и включите SSL (Let's Encrypt). Все запросы к сайту (включая `/api/*` и `/webhook/*`) будут идти на один домен; Next.js проксирует их на контейнер `backend`.

Для вебхуков Telegram укажите URL вида:  
`https://ваш-домен.com/api/webhook/telegram-bot` и  
`https://ваш-домен.com/api/webhook/support-bot`.

## Локальный запуск через Docker

```bash
cp .env.docker.example .env
# отредактируйте .env
docker compose up -d
```

Фронт: http://localhost:3000, API проксируется по /api.

## Полезные команды

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
docker compose up -d --build
```
