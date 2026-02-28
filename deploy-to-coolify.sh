#!/usr/bin/env bash
# ATS Wallet — максимально автоматический деплой в Coolify
# Запуск: из корня проекта: bash deploy-to-coolify.sh
#
# Вариант 1 (полная автоматизация до GitHub):
#   export GITHUB_TOKEN=ghp_xxxx   # создать: GitHub → Settings → Developer settings → Personal access tokens
#   export GITHUB_REPO_NAME=ats-wallet
#   bash deploy-to-coolify.sh
#
# Вариант 2 (репо уже создан вручную):
#   export GITHUB_REPO_URL=https://github.com/USER/ats-wallet
#   bash deploy-to-coolify.sh
#
# После выполнения скрипт выведет ссылку на Coolify и что вставить в форму.

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

GITHUB_REPO_NAME="${GITHUB_REPO_NAME:-ats-wallet}"
GITHUB_REPO_URL="${GITHUB_REPO_URL:-}"

echo "=== ATS Wallet → Coolify ==="
echo ""

# --- 1. Проверка Git ---
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Ошибка: не найден Git-репозиторий в $ROOT"
  exit 1
fi

# --- 2. Создание репозитория на GitHub и push (если задан GITHUB_TOKEN) ---
if [ -n "$GITHUB_TOKEN" ]; then
  echo "[1/3] Создание репозитория на GitHub и отправка кода..."
  USER_LOGIN=$(curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user | grep '"login"' | head -1 | sed 's/.*"login": "\([^"]*\)".*/\1/')
  if [ -z "$USER_LOGIN" ]; then
    echo "Ошибка: не удалось получить логин GitHub (проверьте GITHUB_TOKEN)."
    exit 1
  fi
  # Создать репо (идемпотентно: если уже есть — получим ошибку, тогда только push)
  CREATE_RES=$(curl -s -w "\n%{http_code}" -X POST -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github.v3+json" \
    https://api.github.com/user/repos -d "{\"name\":\"$GITHUB_REPO_NAME\",\"private\":false,\"auto_init\":false}")
  HTTP_CODE=$(echo "$CREATE_RES" | tail -1)
  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "422" ]; then
    true
  else
    echo "Ответ GitHub (код $HTTP_CODE): $(echo "$CREATE_RES" | head -n -1)"
  fi
  GITHUB_REPO_URL="https://github.com/${USER_LOGIN}/${GITHUB_REPO_NAME}"
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://${GITHUB_TOKEN}@github.com/${USER_LOGIN}/${GITHUB_REPO_NAME}.git"
  else
    git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${USER_LOGIN}/${GITHUB_REPO_NAME}.git"
  fi
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git push -u origin "$BRANCH" 2>/dev/null || true
  echo "  Репозиторий: $GITHUB_REPO_URL"
  echo ""
elif [ -n "$GITHUB_REPO_URL" ]; then
  echo "[1/3] Используется указанный репозиторий: $GITHUB_REPO_URL"
  echo "      Если ещё не пушили: git remote add origin URL && git push -u origin main"
  echo ""
else
  echo "[1/3] GitHub: задайте GITHUB_TOKEN или GITHUB_REPO_URL (см. начало скрипта)."
  echo "      После push вручную укажите GITHUB_REPO_URL и запустите скрипт снова."
  echo ""
fi

# --- 3. Инструкция для Coolify ---
COOLIFY_URL="${COOLIFY_URL:-http://localhost:8000}"
echo "[2/3] Coolify (вручную в браузере):"
echo "  1. Откройте: $COOLIFY_URL"
echo "  2. Create New Resource → Public Repository"
echo "  3. Repository URL вставьте: ${GITHUB_REPO_URL:-https://github.com/USER/ats-wallet}"
echo "  4. Build Pack: Docker Compose"
echo "  5. Docker Compose Location: docker-compose.yml, Base Directory: /"
echo "  6. Continue → выберите сервер → в Environment добавьте переменные из .env.docker.example"
echo "  7. У сервиса frontend: Domains → укажите домен или оставьте URL Coolify"
echo "  8. Deploy"
echo ""
echo "[3/3] Переменные окружения для Coolify (скопируйте в Environment):"
echo "---"
grep -v '^#' .env.docker.example | grep -v '^$' | while read -r line; do
  echo "$line"
done
echo "---"
echo ""
echo "Готово. После добавления ресурса в Coolify нажмите Deploy."
