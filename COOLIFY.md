# Развёртывание ATS Wallet в Coolify

Проект подготовлен для деплоя в [Coolify](https://coolify.io): все сервисы разнесены по контейнерам (PostgreSQL, Go API, Next.js).

---

## Быстрый старт: погрузить проект в Coolify v4

Coolify разворачивает приложения из **Git-репозитория**. Два варианта.

### Вариант A: Репозиторий уже на GitHub/GitLab

1. Откройте Coolify: **http://ВАШ_IP:8000**
2. Создайте **Project** (если ещё нет) → **Create New Resource**
3. **Source**: выберите **Public Repository** (или Deploy Key / GitHub App для приватного репо)
4. Вставьте **URL репозитория**, например: `https://github.com/username/ats-wallet`
5. **Build Pack**: в выпадающем списке вместо Nixpacks выберите **Docker Compose**
6. **Docker Compose Location**: `docker-compose.yml`  
   **Base Directory**: `/`
7. Нажмите **Continue**
8. Выберите **Server** (сервер, где установлен Coolify) → **Continue**
9. В настройках ресурса откройте **Environment** и добавьте переменные (см. раздел «Переменные окружения» ниже). Можно вставить построчно из `.env.docker.example`, заменив значения на свои.
10. **Expose в интернет**: в разделе сервисов стека найдите сервис **frontend**, откройте его → **Domains** → добавьте домен или оставьте сгенерированный URL Coolify.
11. Запустите **Deploy**. Coolify клонирует репо, соберёт образы и поднимет контейнеры.

### Вариант B: Код только на этом сервере (ещё не в Git)

1. Создайте пустой репозиторий на **GitHub** (или GitLab): например `ats-wallet`, без README.
2. На сервере выполните (подставьте свой URL репо):

```bash
cd /var/www/html
git remote add origin https://github.com/ВАШ_ЛОГИН/ats-wallet.git
git branch -M main
git push -u origin main
```

3. Дальше действуйте по **Варианту A** (шаги 1–11), указав URL вашего репозитория.

---

## Состав контейнеров

| Сервис     | Описание              | Порт  |
|------------|------------------------|-------|
| **postgres** | База данных PostgreSQL 16 | 5432 (внутренний) |
| **backend**  | Go API (Gin)             | 4000 (внутренний) |
| **frontend** | Next.js (standalone)    | 3000 (точка входа) |

Запросы к `/api/*` и `/webhook/*` проксируются с фронтенда на бэкенд (rewrites в Next.js).

## Вариант 1: Coolify — один стек (Docker Compose)

Используйте пошаговую инструкцию в разделе **«Быстрый старт»** выше. Кратко:

1. **New Resource** → источник **Git** (Public Repository или Deploy Key) → **Build Pack: Docker Compose**.
2. **Docker Compose Location**: `docker-compose.yml`, **Base Directory**: `/`.
3. В **Environment** добавьте переменные из `.env.docker.example` (см. ниже).
4. Для доступа снаружи: в стеке откройте сервис **frontend** → **Domains** → укажите домен или используйте URL Coolify.
5. Запустите **Deploy**.

Точка входа для пользователей — сервис **frontend** (порт 3000 внутри контейнера). Все запросы к сайту (включая `/api/*`) идут на фронт; Next.js проксирует API на backend.

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
