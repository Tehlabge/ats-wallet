# ATS Wallet — бэкенд на Go

Фронт остаётся на **Next.js**. Этот бэкенд на **Go (Gin + GORM)** заменяет NestJS и использует ту же MySQL-базу.

## Требования

- Go 1.21+
- MySQL (та же БД, что и у старого бэкенда, или новая с теми же таблицами)

## Запуск

```bash
cd backend-go
cp .env.example .env
# Отредактируйте .env (DB_PASSWORD и т.д.)
go mod tidy
go run .
```

Сервер будет на `http://localhost:4000`.

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| PORT | Порт (по умолчанию 4000) |
| DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE | Подключение к MySQL |
| JWT_SECRET | Секрет для JWT пользователей |
| ADMIN_PASSWORD | Секрет для JWT админа (должен совпадать с фронтом) |
| CORS_ORIGIN | Разрешённый origin для CORS (например http://localhost:3000) |
| SUPPORT_BOT_TOKEN | Токен бота техподдержки (Telegram, от @BotFather). Вебхук: POST &lt;URL&gt;/webhook/support-bot |
| SUPPORT_GROUP_ID | ID группы/чата техподдержки (например -1003680704165), куда бот слает сообщения |

## API (совместимо с фронтом)

- **POST /admin-login** — вход админа (логин/пароль из `admin_users`), возвращает `{ "token": "..." }`
- **GET /admin/users** — список пользователей (нужен заголовок `Authorization: Bearer <admin_token>`)
- **GET /admin/user-by-login?loginKey=...**
- **PATCH /admin/user/:userId/balance**, **PATCH /admin/user/:userId/commission**
- **GET /admin/stats**, **GET /admin/pending-payments**, **POST /admin/confirm-payment/:id**, **POST /admin/reject-payment/:id**
- **POST /auth/register**, **POST /auth/login**, **POST /auth/login-by-id**, **GET /auth/me**
- **GET /wallet/balance**, **GET /wallet/transactions**, **GET /wallet/deposit-address**, **GET /wallet/rate**

При первом запуске создаётся админ **admin** / **123123**, если в `admin_users` никого нет.
