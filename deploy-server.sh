#!/usr/bin/env bash
# ATS WALLET — установка и запуск на сервере (бэкенд Go + фронт Next.js)
# Запуск от root: sudo bash deploy-server.sh
# На сервере будет установлен Go (если нет), собран бэкенд, собран фронт, запущены PM2-процессы.

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

NODEJS_USER="${NODEJS_USER:-nodejs}"
RUN_AS="sudo -u $NODEJS_USER"
GO_VERSION="${GO_VERSION:-1.22.4}"

chmod +x "$0" 2>/dev/null || true

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите скрипт от root: sudo $0"
  exit 1
fi

echo "=== ATS WALLET — установка на сервере ==="
echo "  Корень: $ROOT"
echo "  Пользователь: $NODEJS_USER"
echo "  Бэкенд: Go (backend-go), Фронт: Next.js (frontend)"
echo ""

# --- Go: проверить или установить ---
export PATH="$PATH:/usr/local/go/bin"
if ! command -v go >/dev/null 2>&1; then
  echo "[1/9] Установка Go ${GO_VERSION} (linux-amd64)..."
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    GO_ARCH="amd64"
  elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    GO_ARCH="arm64"
  else
    GO_ARCH="amd64"
  fi
  GO_TGZ="go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
  GO_URL="https://go.dev/dl/${GO_TGZ}"
  if command -v wget >/dev/null 2>&1; then
    wget -q "$GO_URL" -O "/tmp/$GO_TGZ" || { echo "  Ошибка: не удалось скачать Go. Установите Go вручную (https://go.dev/dl/)."; exit 1; }
  elif command -v curl >/dev/null 2>&1; then
    curl -sL "$GO_URL" -o "/tmp/$GO_TGZ" || { echo "  Ошибка: не удалось скачать Go."; exit 1; }
  else
    echo "  Ошибка: нужен wget или curl для загрузки Go. Установите Go вручную в /usr/local/go."
    exit 1
  fi
  rm -rf /usr/local/go
  tar -C /usr/local -xzf "/tmp/$GO_TGZ"
  rm -f "/tmp/$GO_TGZ"
  export PATH="$PATH:/usr/local/go/bin"
  echo "  OK (Go установлен в /usr/local/go)."
else
  echo "[1/9] Go уже установлен: $(go version)"
fi
# Полный путь к go, чтобы при запуске от nodejs (sudo -u) PATH был не нужен
GO_BIN="/usr/local/go/bin/go"
if [ ! -x "$GO_BIN" ]; then
  GO_BIN=$(command -v go 2>/dev/null || true)
fi
if [ -z "$GO_BIN" ] || [ ! -x "$GO_BIN" ]; then
  echo "  Ошибка: go не найден (ожидается /usr/local/go/bin/go)."
  exit 1
fi
echo "  Используется: $GO_BIN"

echo "[2/9] Права доступа (chown + chmod)..."
chown -R "$NODEJS_USER:$NODEJS_USER" "$ROOT"
chmod -R u+rX "$ROOT"
chmod -R u+w "$ROOT"
echo "  OK."

echo "[3/9] Сборка бэкенда (Go)..."
$RUN_AS bash -c "cd $ROOT/backend-go && $GO_BIN mod download && $GO_BIN build -o ats-wallet-api ." || {
  echo "  Ошибка: сборка бэкенда не удалась. Проверьте вывод выше и наличие backend-go/.env"
  exit 1
}
if [ ! -f "$ROOT/backend-go/ats-wallet-api" ]; then
  echo "  Ошибка: бинарник backend-go/ats-wallet-api не создан."
  exit 1
fi
chmod +x "$ROOT/backend-go/ats-wallet-api"
echo "  OK (backend-go/ats-wallet-api)."

echo "[4/9] Зависимости фронтенда..."
$RUN_AS bash -c "cd $ROOT/frontend && npm install"
echo "  OK."

echo "[5/9] Сборка фронтенда..."
$RUN_AS bash -c "cd $ROOT/frontend && npm run build"
echo "  OK."

echo "[6/9] PM2 — остановка старых процессов..."
$RUN_AS pm2 delete ats-wallet-api 2>/dev/null || true
$RUN_AS pm2 delete ats-wallet-web 2>/dev/null || true
echo "  OK."

echo "[7/9] PM2 — запуск API (Go)..."
# Запуск из каталога backend-go, чтобы подхватить .env
$RUN_AS bash -c "cd $ROOT/backend-go && pm2 start ./ats-wallet-api --name ats-wallet-api"
echo "  OK."

echo "[8/9] PM2 — запуск фронтенда..."
$RUN_AS bash -c "cd $ROOT/frontend && pm2 start npm --name ats-wallet-web -- run start:prod"
echo "  OK."

echo "[9/9] PM2 — сохранение списка..."
$RUN_AS pm2 save
echo "  OK."

echo ""
echo "=== Готово."
$RUN_AS pm2 list
echo ""
echo "  Логи:       $RUN_AS pm2 logs"
echo "  Рестарт:    $RUN_AS pm2 restart all"
echo "  Только API: $RUN_AS pm2 restart ats-wallet-api"
echo ""
echo "  Конфиг бэкенда: backend-go/.env (PORT, DB_*, JWT_SECRET, OXAPAY_MERCHANT_KEY, OXAPAY_WEBHOOK_BASE, CORS_ORIGIN)"
echo "  Конфиг фронта:  frontend/.env.local (NEXT_PUBLIC_API_URL или NEXT_PUBLIC_API_BACKEND)"
echo "  После смены .env: пересборка (шаги 3–5 или 4–5 для фронта) и pm2 restart all"
echo ""
echo "  Важно: при рестарте только веб-приложения сначала пересоберите фронт, иначе возможна"
echo "  ошибка «Критическая ошибка / Failed to find Server Action» у пользователей:"
echo "    cd $ROOT/frontend && npm run build && pm2 restart ats-wallet-web"
echo ""
