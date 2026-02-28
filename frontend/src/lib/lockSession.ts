/**
 * Блокировка код-паролем или биометрией.
 * По умолчанию запрашивается только после 4 минут неактивности.
 * Лимит 15 неверных попыток, блокировка 30 мин затем 12 ч.
 */

const KEY_METHOD = 'ats_lock_method';
const KEY_UNLOCKED_AT = 'ats_pin_unlocked_at';
const KEY_LAST_ACTIVE_AT = 'ats_last_active_at';
const KEY_FAIL_COUNT = 'ats_pin_fail_count';
const KEY_BLOCKED_UNTIL = 'ats_pin_blocked_until';
const KEY_BLOCK_LEVEL = 'ats_pin_block_level';
const KEY_AUTO_LOCK_TIMEOUT = 'ats_auto_lock_timeout';
const KEY_AUTH_AFTER_CLOSE = 'ats_auth_after_close';

export const SESSION_TTL_MS = 4 * 60 * 1000; // 4 минуты - таймаут автоблокировки по умолчанию

/** Запрашивать авторизацию после каждого закрытия мини-приложения */
export function isAuthAfterCloseEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(KEY_AUTH_AFTER_CLOSE) === '1';
}

export function setAuthAfterCloseEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY_AUTH_AFTER_CLOSE, enabled ? '1' : '0');
}
export const MAX_PIN_ATTEMPTS = 15;
const BLOCK_FIRST_MS = 30 * 60 * 1000;   // 30 минут
const BLOCK_SECOND_MS = 12 * 60 * 60 * 1000; // 12 часов

export type LockMethod = 'pin' | 'biometric';

const MIN_AUTO_LOCK_MS = 1 * 60 * 1000; // 1 минута - минимальный таймаут

/** Получить таймаут автоблокировки в мс (по умолчанию 4 минуты, минимум 1 минута) */
export function getAutoLockTimeout(): number {
  if (typeof window === 'undefined') return SESSION_TTL_MS;
  const v = localStorage.getItem(KEY_AUTO_LOCK_TIMEOUT);
  if (!v) return SESSION_TTL_MS;
  const n = parseInt(v, 10);
  if (Number.isNaN(n) || n < MIN_AUTO_LOCK_MS) return SESSION_TTL_MS;
  return n;
}

/** Установить таймаут автоблокировки в мс (минимум 1 минута) */
export function setAutoLockTimeout(ms: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY_AUTO_LOCK_TIMEOUT, String(ms));
}

/** Обновить время последней активности */
export function updateLastActiveTime(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY_LAST_ACTIVE_AT, String(Date.now()));
}

/** Получить время последней активности */
export function getLastActiveTime(): number | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(KEY_LAST_ACTIVE_AT);
  if (!v) return null;
  const t = parseInt(v, 10);
  return Number.isNaN(t) ? null : t;
}

export function getLockMethod(): LockMethod | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(KEY_METHOD);
  if (v === 'pin' || v === 'biometric') return v;
  return null;
}

export function setLockMethod(method: LockMethod): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY_METHOD, method);
}

export function isLockMethodRequired(): boolean {
  return getLockMethod() !== null;
}

/** 
 * Проверка: нужно ли запрашивать код-пароль.
 * Возвращает true если сессия валидна (код не нужен).
 * Логика: если прошло меньше autoLockTimeout с последней активности — код не нужен.
 */
export function isSessionValid(): boolean {
  if (typeof window === 'undefined') return false;
  
  const timeout = getAutoLockTimeout();
  
  // Проверяем время последней активности
  const lastActive = getLastActiveTime();
  if (lastActive !== null) {
    const elapsed = Date.now() - lastActive;
    if (elapsed < timeout) {
      return true; // Не прошло достаточно времени — код не нужен
    }
  }
  
  // Проверяем время разблокировки (для обратной совместимости)
  const at = sessionStorage.getItem(KEY_UNLOCKED_AT);
  if (at) {
    const t = parseInt(at, 10);
    if (!Number.isNaN(t) && Date.now() - t < timeout) {
      return true;
    }
  }
  
  return false;
}

export function setSessionUnlocked(): void {
  if (typeof window === 'undefined') return;
  const now = String(Date.now());
  sessionStorage.setItem(KEY_UNLOCKED_AT, now);
  localStorage.setItem(KEY_LAST_ACTIVE_AT, now);
  clearPinFailState();
}

export function clearSessionUnlocked(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY_UNLOCKED_AT);
}

/** Сбросить сессию (принудительно запросить авторизацию при следующем открытии) */
export function forceSessionExpire(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY_UNLOCKED_AT);
  localStorage.setItem(KEY_LAST_ACTIVE_AT, '0'); // давнее время — isSessionValid вернёт false
}

function clearPinFailState(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY_FAIL_COUNT);
}

export function getPinBlockedUntil(): number | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(KEY_BLOCKED_UNTIL);
  if (!v) return null;
  const t = parseInt(v, 10);
  return Number.isNaN(t) ? null : t;
}

export function getPinFailCount(): number {
  if (typeof window === 'undefined') return 0;
  const v = localStorage.getItem(KEY_FAIL_COUNT);
  if (!v) return 0;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function recordPinFailure(): void {
  if (typeof window === 'undefined') return;
  const count = getPinFailCount() + 1;
  localStorage.setItem(KEY_FAIL_COUNT, String(count));

  if (count >= MAX_PIN_ATTEMPTS) {
    const level = parseInt(localStorage.getItem(KEY_BLOCK_LEVEL) || '0', 10);
    const blockDuration = level === 0 ? BLOCK_FIRST_MS : BLOCK_SECOND_MS;
    const blockedUntil = Date.now() + blockDuration;
    localStorage.setItem(KEY_BLOCKED_UNTIL, String(blockedUntil));
    localStorage.setItem(KEY_BLOCK_LEVEL, String(level + 1));
    localStorage.removeItem(KEY_FAIL_COUNT);
  }
}

export function isPinBlockedNow(): boolean {
  const until = getPinBlockedUntil();
  if (until === null) return false;
  if (Date.now() < until) return true;
  localStorage.removeItem(KEY_BLOCKED_UNTIL);
  return false;
}

export function getBlockedRemainingMs(): number {
  const until = getPinBlockedUntil();
  if (until === null) return 0;
  return Math.max(0, until - Date.now());
}

export function formatBlockedUntil(until: number): string {
  return new Date(until).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
