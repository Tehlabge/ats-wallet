#!/usr/bin/env bash
# ATS WALLET — режим техработ / деплоя: показывает заглушку «Ведутся технические работы»
# Включить:  sudo ./work.sh on   (останавливает приложение, запускает заглушку на том же порту)
# Выключить: sudo ./work.sh off  (останавливает заглушку, запускает приложение снова)
# Статус:    sudo ./work.sh status

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
MAINTENANCE_DIR="$ROOT/maintenance"
FLAG_FILE="$ROOT/.maintenance"
NODEJS_USER="${NODEJS_USER:-nodejs}"
RUN_AS="sudo -u $NODEJS_USER"
WEB_PORT="${WEB_PORT:-3000}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите скрипт от root: sudo $0 on|off|status"
  exit 1
fi

case "${1:-}" in
  on)
    echo "=== Режим техработ: ВКЛ ==="
    if [ -f "$FLAG_FILE" ]; then
      echo "  Уже включён."
      exit 0
    fi
    echo "  Останавливаем приложение..."
    $RUN_AS pm2 stop ats-wallet-api 2>/dev/null || true
    $RUN_AS pm2 stop ats-wallet-web 2>/dev/null || true
    if $RUN_AS pm2 describe ats-wallet-maintenance &>/dev/null; then
      $RUN_AS pm2 start ats-wallet-maintenance 2>/dev/null || true
      echo "  Заглушка уже в PM2, запускаем."
    else
      echo "  Запускаем заглушку на порту $WEB_PORT..."
      $RUN_AS bash -c "cd $ROOT && pm2 start 'npx -y serve -s $MAINTENANCE_DIR -l $WEB_PORT' --name ats-wallet-maintenance"
    fi
    touch "$FLAG_FILE"
    $RUN_AS pm2 save 2>/dev/null || true
    echo "  Готово. Пользователи видят: «Ведутся технические работы»."
    ;;
  off)
    echo "=== Режим техработ: ВЫКЛ ==="
    if [ ! -f "$FLAG_FILE" ]; then
      echo "  Режим техработ не был включён."
    fi
    rm -f "$FLAG_FILE"
    echo "  Останавливаем заглушку..."
    $RUN_AS pm2 stop ats-wallet-maintenance 2>/dev/null || true
    $RUN_AS pm2 delete ats-wallet-maintenance 2>/dev/null || true
    echo "  Запускаем приложение..."
    $RUN_AS pm2 restart ats-wallet-api ats-wallet-web 2>/dev/null || true
    $RUN_AS pm2 save 2>/dev/null || true
    echo "  Готово. Приложение снова доступно."
    ;;
  status)
    if [ -f "$FLAG_FILE" ]; then
      echo "Режим техработ: ВКЛ (пользователи видят заглушку)"
    else
      echo "Режим техработ: ВЫКЛ (работает приложение)"
    fi
    $RUN_AS pm2 list 2>/dev/null || true
    ;;
  *)
    echo "Использование: sudo $0 on | off | status"
    echo "  on     — включить заглушку «Ведутся технические работы» (остановить приложение)"
    echo "  off    — выключить заглушку, запустить приложение"
    echo "  status — показать текущий режим и список PM2"
    exit 1
    ;;
esac
