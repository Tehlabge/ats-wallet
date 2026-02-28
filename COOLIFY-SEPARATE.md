# ATS Wallet — три отдельных приложения в Coolify (БД, Backend, Frontend)

Репозиторий один, в Coolify создаёте **три отдельных ресурса** (три приложения).

---

## 1. Приложение «БД» (PostgreSQL)

- **Project** → **Create New Resource** → **Public Repository**
- **Repository URL:** `https://github.com/Tehlabge/ats-wallet`
- **Branch:** `master`
- **Build Pack:** **Docker Compose**
- **Docker Compose Location:** `docker-compose.db.yml`
- **Base Directory:** `/`
- **Server** → выберите сервер → **Continue**

**Environment (переменные):**
```
POSTGRES_USER=wallet
POSTGRES_PASSWORD=ваш_надёжный_пароль
POSTGRES_DB=wallet
```

Сохраните. Запустите **Deploy**.  
После деплоя включите **Connect to predefined network** (чтобы к этой сети потом подключить Backend) и запомните **имя сети** или **UUID ресурса** — они понадобятся для Backend.

Хост для подключения к БД: в настройках ресурса БД посмотрите **Domains** или **Internal hostname**. Обычно это что‑то вроде `postgres-<uuid>` или домен вида `...coolify.io`. Либо, если Backend подключаете к той же сети — используйте имя сервиса **postgres** (если Coolify создаёт сеть по имени стека, хост может быть `postgres-<project-uuid>`).

---

## 2. Приложение «Backend» (Go API)

- **Create New Resource** → **Public Repository**
- **Repository URL:** `https://github.com/Tehlabge/ats-wallet`
- **Branch:** `master`
- **Build Pack:** **Docker Compose**
- **Docker Compose Location:** `docker-compose.backend.yml`
- **Base Directory:** `/`
- Включите **Connect to predefined network** и выберите **сеть приложения «БД»** (чтобы Backend видел контейнер Postgres).
- **Server** → выберите тот же сервер → **Continue**

**Environment (обязательно подставьте свои значения):**
```
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=wallet
DB_PASSWORD=тот_же_пароль_что_в_БД
DB_DATABASE=wallet
DB_SSLMODE=disable
JWT_SECRET=ваш_jwt_секрет
ADMIN_JWT_SECRET=ваш_admin_секрет
CORS_ORIGIN=https://ваш-домен-фронта
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBAPP_URL=https://ваш-домен-фронта
TRONGRID_API_KEY=
WALLET_PASSWORD=
SUPPORT_BOT_TOKEN=
SUPPORT_GROUP_ID=-1003782777869
```

Если после подключения к сети приложения «БД» хост Postgres не резолвится как `postgres`, замените `DB_HOST` на точное имя контейнера Postgres (видно в Coolify у приложения «БД»).

**Domains:** укажите домен для API (например `api.ваш-домен.com`).  
Задеплойте **Deploy**.

---

## 3. Приложение «Frontend» (Next.js)

- **Create New Resource** → **Public Repository**
- **Repository URL:** `https://github.com/Tehlabge/ats-wallet`
- **Branch:** `master`
- **Build Pack:** **Docker Compose**
- **Docker Compose Location:** `docker-compose.frontend.yml`
- **Base Directory:** `/`
- **Server** → тот же сервер → **Continue**

**Environment:**
```
NEXT_PUBLIC_API_BACKEND=https://api.ваш-домен.com
NEXT_PUBLIC_SUPPORT_BOT_USERNAME=ваш_бот
```

`NEXT_PUBLIC_API_BACKEND` — **публичный URL бэкенда** (тот же, что в Domains у приложения Backend).

**Domains:** укажите основной домен сайта (например `wallet.ваш-домен.com`).  
Задеплойте **Deploy**.

---

## Порядок деплоя

1. **БД** — сначала.
2. **Backend** — после БД, с подключением к сети БД и правильным `DB_HOST`/`DB_PASSWORD`.
3. **Frontend** — после Backend, с `NEXT_PUBLIC_API_BACKEND` = URL бэкенда.

---

## Если Backend не видит Postgres

- У приложения **Backend** включите **Connect to predefined network** и выберите сеть приложения **БД**.
- В качестве `DB_HOST` попробуйте: `postgres`, затем имя контейнера Postgres из Coolify (например `postgres-<uuid>-...`). Имя контейнера видно в логах или в деталях приложения «БД».

---

## Файлы в репозитории

| Файл | Назначение |
|------|------------|
| `docker-compose.db.yml` | Только PostgreSQL |
| `docker-compose.backend.yml` | Только Go API (backend) |
| `docker-compose.frontend.yml` | Только Next.js (frontend) |
| `docker-compose.yml` | Всё в одном стеке (альтернатива) |
