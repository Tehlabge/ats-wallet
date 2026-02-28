#!/usr/bin/env bash
# Запуск: бэкенд Go (backend-go) + фронт Next.js (frontend).
# Старый бэкенд Nest удалён; если осталась папка backend — удалите вручную: rm -rf backend
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== ATS WALLET - start ==="

# .env бэкенда (Go)
if [ -f backend-go/.env ]; then
  set -a
  source backend-go/.env
  set +a
  echo "  .env loaded (backend-go/.env)"
elif [ -f .env ]; then
  set -a
  source .env
  set +a
  echo "  .env loaded (.env)"
fi

# Фронт: зависимости
if [ ! -d frontend/node_modules ]; then
  echo "  Installing frontend deps..."
  (cd frontend && npm install)
fi

# Бэкенд Go: найти go в PATH или в типичных путях
export PATH="$PATH:/usr/local/go/bin:/opt/homebrew/bin:$HOME/go/bin"
if ! command -v go >/dev/null 2>&1; then
  echo "  Go не найден в PATH."
  echo "  Установите Go 1.21+ одним из способов:"
  echo "    macOS (Homebrew):  brew install go"
  echo "    Или скачайте:      https://go.dev/dl/"
  echo "  После установки перезапустите терминал и снова выполните ./start.sh"
  exit 1
fi
if [ -d backend-go ]; then
  echo "  Go backend: go mod tidy..."
  (cd backend-go && go mod tidy) || true
  echo "  Starting backend (Go) at http://localhost:4000 ..."
  BACKEND_LOG="$ROOT/backend-go/backend.log"
  (cd backend-go && go run . > "$BACKEND_LOG" 2>&1) &
  BACKEND_PID=$!
  sleep 2
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "  ERROR: Go backend crashed on startup. Log:"
    cat "$BACKEND_LOG" | tail -30
    echo ""
    echo "  Проверьте backend-go/.env (DB_HOST, DB_PASSWORD, DB_DATABASE)."
    exit 1
  fi
else
  echo "  Error: папка backend-go не найдена."
  exit 1
fi

cleanup() {
  echo ""
  echo "  Stopping backend (PID $BACKEND_PID)..."
  kill $BACKEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "  Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:4000 2>/dev/null; then
    echo "  Backend ready."
    break
  fi
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "  ERROR: Go backend crashed. Log:"
    cat "$BACKEND_LOG" | tail -30
    echo ""
    echo "  Проверьте backend-go/.env (DB_HOST, DB_PASSWORD, DB_DATABASE)."
    exit 1
  fi
  if [ "$i" -eq 30 ]; then
    echo "  Timeout waiting for backend. Last log lines:"
    cat "$BACKEND_LOG" | tail -10
    echo "  Starting frontend anyway..."
  fi
  sleep 1
done

echo "  Starting frontend at http://localhost:3000 ..."
echo "  Press Ctrl+C to stop"
(cd frontend && PORT=3000 npm run dev)
