/**
 * Ссылка на бота техподдержки и открытие чата с поддержкой.
 * URL берётся из API (public/settings → supportBotUsername) или из NEXT_PUBLIC_SUPPORT_BOT_USERNAME.
 * Если ни API, ни env не заданы — используется дефолт supatswallet_bot.
 */

const SUPPORT_BOT_USERNAME_ENV = process.env.NEXT_PUBLIC_SUPPORT_BOT_USERNAME || '';
const SUPPORT_BOT_USERNAME_DEFAULT = 'supatswallet_bot';

/** Ссылка на бота из env или дефолт. Для актуального значения используйте getSupportBotUrlFromApi(). */
export function getSupportBotUrl(): string {
  const username = SUPPORT_BOT_USERNAME_ENV || SUPPORT_BOT_USERNAME_DEFAULT;
  return `https://t.me/${username}`;
}

/** Всегда true: используется env или дефолт supatswallet_bot. */
export function isSupportBotConfigured(): boolean {
  return true;
}

/**
 * Открыть поддержку по URL или username.
 * В Mini App вызывается openTelegramLink; если не сработало — пробуем openLink (встроенный браузер).
 * @param urlOrUsername — полный URL (https://t.me/...) или username бота (без @). Если не передан — env или supatswallet_bot.
 */
export function openSupport(urlOrUsername?: string | null): void {
  if (typeof window === 'undefined') return;
  const raw = urlOrUsername ?? getSupportBotUrl();
  const url = raw.startsWith('http') ? raw : `https://t.me/${raw.replace(/^@/, '')}`;
  const tg = (window as unknown as {
    Telegram?: {
      WebApp?: {
        openTelegramLink?: (u: string) => void;
        openLink?: (u: string) => void;
      };
    };
  }).Telegram?.WebApp;

  if (tg?.openTelegramLink) {
    try {
      tg.openTelegramLink(url);
    } catch {
      if (tg.openLink) tg.openLink(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** Загрузить URL бота поддержки из API (public/settings), иначе env, иначе supatswallet_bot. */
export async function getSupportUrlFromApi(): Promise<string> {
  if (typeof window === 'undefined') return getSupportBotUrl();
  try {
    const { getPublicSettings } = await import('@/lib/api');
    const s = await getPublicSettings();
    if (s.supportBotUsername) return `https://t.me/${s.supportBotUsername.replace(/^@/, '')}`;
  } catch {
    // ignore
  }
  return getSupportBotUrl();
}

/** Открыть поддержку: сначала запросить URL из API, затем открыть. Вызывать по клику (PinGate, профиль). */
export async function openSupportFromApi(): Promise<void> {
  const url = await getSupportUrlFromApi();
  openSupport(url);
}
