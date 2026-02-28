# ATS WALLET

Мини-приложение: криптокошелёк с поддержкой сканирования QR СБП, оплатой по курсу USDT/RUB и админ-панелью.

## Стек

- **Backend:** NestJS, TypeORM, MySQL
- **Frontend:** Next.js 14, Tailwind CSS
- **Вход:** по ID пользователя; баланс в USDT и эквивалент в ₽ по курсу Rapira

## База данных (MySQL)

Настройки в `backend/.env`:

- `DB_HOST` — хост БД
- `DB_PORT` — 3306
- `DB_USERNAME` — пользователь
- `DB_PASSWORD` — пароль
- `DB_DATABASE` — имя БД

TypeORM при запуске создаёт таблицы: `users`, `balances`, `transactions`, `scan_logs`, `pending_payments`.

## Запуск локально

### Всё одной командой

```bash
./start.sh
```

Скрипт ставит зависимости, синхронизирует БД, поднимает бэкенд на `http://localhost:4000` и фронтенд на `http://localhost:3000`. Остановка: **Ctrl+C**.

### По отдельности

**Backend:**

```bash
cd backend
npm install
npm run db:sync
npm run start:dev
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

### Переменные окружения

**Backend** (`backend-go/.env`):

- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` — MySQL
- `PORT` — порт API (по умолчанию 4000)
- `JWT_SECRET` — секрет для JWT
- `TRONGRID_API_KEY` — (опционально) ключ TronGrid для балансов по пулу кошельков

**Frontend:**

- `NEXT_PUBLIC_API_URL` — URL бэкенда (по умолчанию `http://localhost:4000`)
- `NEXT_PUBLIC_SUPPORT_BOT_USERNAME` — (опционально) username бота техподдержки без @; используется, если бэкенд ещё не отдаёт его в `/public/settings`

**Бот техподдержки** — см. раздел [Техподдержка в Telegram](#техподдержка-в-telegram) ниже.

---

## Техподдержка в Telegram

Логика бота техподдержки работает **внутри бэкенда** (Go): вебхук `POST /webhook/support-bot`. Отдельный процесс не нужен.

### Настройка

1. **Токен бота** — в админке: Настройки → Бот поддержки. Либо в БД: `app_settings` ключ `support_bot_token`.
2. **Вебхук** — в админке задайте URL вида `https://ваш-домен/api/webhook/support-bot` (или `/webhook/support-bot`, если запросы идут напрямую на бэкенд). Telegram будет слать обновления на этот URL.
3. **Режим «группа с темами»** (рекомендуется): в админке укажите **ID группы** (группа с включёнными Topics, бот добавлен как админ). Тогда: пользователь пишет боту в личку → в группе создаётся тема → ответы в теме пересылаются пользователю.
4. **Режим «один чат»**: не указывайте ID группы; напишите боту в Telegram `/start` — этот чат будет получать сообщения от пользователей приложения с кнопкой «Ответить».
5. **Переход на бота в приложении** — username бота берётся из бэкенда: при открытии админкой вкладки «Бот поддержки» бэкенд вызывает getMe и сохраняет `support_bot_username` в `app_settings`. Публичный API `/public/settings` отдаёт его клиенту — кнопки «Написать в поддержку» открывают `t.me/username` без пересборки фронта. Опционально можно задать `NEXT_PUBLIC_SUPPORT_BOT_USERNAME` в `.env` фронта (на случай, если API ещё не отдаёт username).

Папка **`telegram-support-bot/`** (Python) — опционально для справки или альтернативного запуска; для работы с фронтом и бэком достаточно настроек в админке и вебхука.

---

## Установка на сервер (Beget Node.js)

На Beget развёрнута среда **Node.js** с менеджером процессов **PM2** и веб-сервером **Nginx**.

### Состав приложения на сервере

- **Ubuntu 22.04.01**
- **Node.js 22.x**
- **nginx 1.18.0**
- **PM2 5.2.2**

При создании сервера указывается домен; на него автоматически ставится SSL. По умолчанию уже запущено тестовое приложение «Hello, World!».

**Быстрый запуск одним скриптом (рекомендуется):**

1. Подключитесь к серверу по SSH **как root** (или как пользователь с правом `sudo`).
2. Загрузите проект в `/var/www/html` (git, SFTP или архив). Создайте `backend/.env` и при необходимости `frontend/.env.local`.
3. Выполните одну команду (от root):

```bash
cd /var/www/html
sudo bash deploy-server.sh
```

Если скрипт ещё не исполняемый, сначала: `chmod +x deploy-server.sh`, затем `sudo ./deploy-server.sh`.

**От root всё и делается:** подключаться под пользователем `nodejs` не нужно. Скрипт сам выставит владельца файлов на `nodejs`, выдаст права, а все команды `npm` и `pm2` выполнит от его имени через `sudo -u nodejs`. В итоге приложения в PM2 будут работать от пользователя `nodejs`.

**Режим техработ (заглушка):** перед деплоем или во время обслуживания можно включить независимую заглушку «Ведутся технические работы»:
```bash
sudo ./work.sh on   # включить заглушку (остановить приложение, показать страницу техработ)
sudo ./work.sh off  # выключить заглушку, снова запустить приложение
sudo ./work.sh status
```

---

### Шаг 1. Подключение к серверу

Подключитесь по **SSH** или **SFTP** к вашему серверу Beget.

### Шаг 2. Остановка тестового приложения

```bash
sudo -u nodejs pm2 stop hello-world
```

### Шаг 3. Переход в рабочую директорию

```bash
cd /var/www/html
```

### Шаг 4. Загрузка проекта

Загрузите файлы ATS WALLET в `/var/www/html` (через git clone или SFTP), чтобы структура была такой:

```
/var/www/html/
  backend-go/
  frontend/
  telegram-support-bot/   # бот техподдержки (Python, опционально)
  start.sh
  README.md
```

Например, через git:

```bash
# если репозиторий доступен по git
sudo -u nodejs git clone https://ваш-репозиторий.git .
# или загрузите архив и распакуйте в /var/www/html
```

### Шаг 5. Переменные окружения бэкенда

Создайте файл `backend/.env`:

```bash
cd /var/www/html/backend
sudo -u nodejs nano .env
```

Укажите (подставьте свои значения):

```env
DB_HOST=ваш-хост-mysql.beget.com
DB_PORT=3306
DB_USERNAME=ваш_пользователь
DB_PASSWORD=ваш_пароль
DB_DATABASE=ваш_база
PORT=4000
JWT_SECRET=случайная-длинная-строка-секрета
```

Сохраните файл (в nano: Ctrl+O, Enter, Ctrl+X).

### Шаг 6. Сборка и зависимости бэкенда

```bash
cd /var/www/html/backend
sudo -u nodejs npm install
sudo -u nodejs npm run build
sudo -u nodejs npm run db:sync
```

### Шаг 7. Переменные окружения фронтенда

Фронтенд должен обращаться к API по вашему домену. Создайте или отредактируйте `frontend/.env.local`:

```bash
cd /var/www/html/frontend
sudo -u nodejs nano .env.local
```

Содержимое (замените на ваш домен):

```env
NEXT_PUBLIC_API_URL=https://ваш-домен.beget.app
```

Если API будет на том же домене по пути (например, `/api`), укажите полный URL, по которому Nginx проксирует на бэкенд.

### Шаг 8. Сборка и зависимости фронтенда

```bash
cd /var/www/html/frontend
sudo -u nodejs npm install
sudo -u nodejs npm run build
```

### Шаг 9. Запуск через PM2

Перед запуском убедитесь, что бэкенд собран — в папке `backend` должна появиться папка `dist` с файлом `main.js`:

```bash
ls -la /var/www/html/backend/dist/
# должен быть файл main.js
```

Если папки `dist` нет или она пустая, соберите бэкенд ещё раз от пользователя `nodejs`:

```bash
cd /var/www/html/backend
sudo -u nodejs npm run build
```

Запустите бэкенд и фронтенд отдельными процессами PM2.

**Бэкенд** (порт 4000). Вариант 1 — через npm-скрипт (рекомендуется):

```bash
cd /var/www/html/backend
sudo -u nodejs pm2 start npm --name ats-wallet-api -- run start:prod
```

Вариант 2 — напрямую указать файл:

```bash
cd /var/www/html/backend
sudo -u nodejs pm2 start dist/main.js --name ats-wallet-api
```

**Фронтенд** (порт 3000). Запускайте через скрипт `start:prod`, чтобы не было ошибки «next: Permission denied»:

```bash
cd /var/www/html/frontend
sudo -u nodejs pm2 start npm --name ats-wallet-web -- run start:prod
```

Либо создайте файл `ecosystem.config.js` в `/var/www/html`:

```javascript
module.exports = {
  apps: [
    {
      name: 'ats-wallet-api',
      cwd: '/var/www/html/backend',
      script: 'npm',
      args: 'run start:prod',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'ats-wallet-web',
      cwd: '/var/www/html/frontend',
      script: 'npm',
      args: 'run start:prod',
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
  ],
};
```

Запуск по конфигу:

```bash
cd /var/www/html
sudo -u nodejs pm2 start ecosystem.config.js
```

### Шаг 10. Настройка Nginx (если приложение не на порту 3000)

По умолчанию Nginx на Beget может быть настроен на порт 3000. Если фронтенд слушает 3000, проверьте конфиг Nginx (путь уточняйте в панели Beget). Если нужно сменить порт — измените в конфиге Nginx порт проксирования на тот, на котором слушает Next.js (например, 3000).

### Шаг 11. Удаление тестового приложения и сохранение конфигурации PM2

```bash
sudo -u nodejs pm2 delete hello-world
sudo -u nodejs pm2 save
```

Автозапуск после перезагрузки (если поддерживается):

```bash
sudo -u nodejs pm2 startup
```

### Шаг 12. Проверка

- В браузере откройте `https://ваш-домен.beget.app` — должна открыться главная ATS WALLET.
- Убедитесь, что запросы к API идут на правильный URL (тот, что указан в `NEXT_PUBLIC_API_URL`).

### Полезные команды PM2

```bash
sudo -u nodejs pm2 list          # список процессов
sudo -u nodejs pm2 logs          # логи
sudo -u nodejs pm2 restart all   # перезапуск всех приложений
```

### Устранение неполадок

**Ошибка `Cannot find module '/var/www/html/backend/dist/main'` (ats-wallet-api в статусе errored)**  
Папка `dist` не создана или пустая. Соберите бэкенд от пользователя `nodejs` и проверьте наличие файла:

```bash
cd /var/www/html/backend
sudo -u nodejs npm run build
ls -la dist/
# должен быть main.js
sudo -u nodejs pm2 restart ats-wallet-api
```

**Ошибка `next: Permission denied` (ats-wallet-web в статусе errored)**  
Запускайте фронтенд через скрипт `start:prod` (он вызывает Next через `node`, без прав на бинарник):

```bash
cd /var/www/html/frontend
sudo -u nodejs pm2 delete ats-wallet-web
sudo -u nodejs pm2 start npm --name ats-wallet-web -- run start:prod
sudo -u nodejs pm2 save
```

Убедитесь, что в `frontend/package.json` есть скрипт `"start:prod": "node node_modules/next/dist/bin/next start"`. Если его нет — добавьте и заново запустите PM2.

---

## Функционал приложения

- **Вход по ID** — на экране входа указывается ID пользователя (например, 1).
- **Главная** — баланс в USDT, ниже примерный эквивалент в ₽ по курсу (Rapira), скрытие баланса, активы.
- **Сканер СБП** — сканирование QR или вставка ссылки из буфера; расчёт суммы в USDT с комиссией; создание платежа и ожидание подтверждения в админке.
- **Профиль** — настройки, админ-панель, **Выход**.
- **Админ-панель** (`/admin`) — курс USDT/₽, ожидающие платежи (подтверждение оплаты), баланс и комиссия пользователей по ID, надбавка к балансу, логи сканирования.

## API (кратко)

- `POST /auth/login-by-id` — вход по ID пользователя (JWT)
- `GET /wallet/balance` — баланс USDT/RUB (Bearer)
- `GET /wallet/rate` — курс USDT/RUB (Rapira)
- `POST /scan/preview-payment` — превью платежа по QR (Bearer)
- `POST /scan/create-payment` — создание платежа (Bearer)
- `GET /admin/pending-payments` — ожидающие оплаты
- `POST /admin/confirm-payment/:id` — подтвердить оплату
