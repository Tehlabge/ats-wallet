# Версия приложения ATS WALLET

**Текущая версия: 1.31**

При больших обновлениях обновите версию в трёх местах:

1. **Фронт** — `frontend/package.json`: поле `"version"`.
2. **Фронт** — `frontend/src/lib/version.ts`: константа `APP_VERSION`.
3. **Бэкенд** — `backend-go/internal/version/version.go`: константа `Version`.

Настройки техподдержки задаются в `backend-go/.env`: `SUPPORT_BOT_TOKEN`, `SUPPORT_GROUP_ID`.

После смены версии пересоберите фронт и перезапустите бэкенд (или выполните `./deploy-server.sh`).
