/**
 * Версия приложения ATS WALLET.
 * Основной источник — бэкенд (GET /public/settings → appVersion).
 * Здесь только fallback для SSR/до загрузки API.
 */
export const APP_VERSION_FALLBACK = '1.31';
