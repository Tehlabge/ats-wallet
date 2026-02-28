/**
 * Telegram WebApp Biometry API utility.
 * Логирование через authLogger. Включить: localStorage.setItem('ats_auth_debug', '1')
 * Используем нативный API биометрии Telegram Mini Apps (версия 7.2+).
 * Документация: https://core.telegram.org/bots/webapps#biometricmanager
 * 
 * ВАЖНО: На некоторых устройствах (особенно Android) callback init() может зависать.
 * Поэтому мы используем комбинированный подход: событие + callback + таймаут.
 */
import { authLogger } from './authLogger';

export interface BiometryInfo {
  available: boolean;
  type?: 'finger' | 'face' | 'unknown';
  tokenSaved?: boolean;
  accessRequested?: boolean;
  accessGranted?: boolean;
  deviceId?: string;
}

export interface BiometryResult {
  status: 'authorized' | 'failed' | 'unavailable';
  token?: string;
}

interface TelegramBiometricManager {
  isInited: boolean;
  isBiometricAvailable: boolean;
  biometricType: 'finger' | 'face' | 'unknown';
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  isBiometricTokenSaved: boolean;
  deviceId: string;
  init: (callback?: () => void) => TelegramBiometricManager;
  requestAccess: (params: { reason?: string }, callback?: (granted: boolean) => void) => TelegramBiometricManager;
  authenticate: (params: { reason?: string }, callback?: (success: boolean, token?: string) => void) => TelegramBiometricManager;
  updateBiometricToken: (token: string, callback?: (success: boolean) => void) => TelegramBiometricManager;
  openSettings: () => TelegramBiometricManager;
}

interface TelegramWebApp {
  BiometricManager?: TelegramBiometricManager;  // Правильное название!
  version?: string;
  platform?: string;
  isVersionAtLeast?: (version: string) => boolean;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
}

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') {
    console.log('[Biometry] getTelegramWebApp: window undefined (SSR)');
    return null;
  }
  
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  
  if (!tg) {
    const hasTelegramScript = typeof document !== 'undefined' && 
      document.querySelector('script[src*="telegram-web-app.js"]');
    
    console.log('[Biometry] getTelegramWebApp:', {
      hasTelegram: !!tg,
      hasScript: !!hasTelegramScript,
      telegram: (window as any).Telegram
    });
    
    if (hasTelegramScript) {
      return null;
    }
  } else {
    // Детальная диагностика всех доступных API
    const allKeys = Object.keys(tg);
    const biometryKeys = allKeys.filter(k => k.toLowerCase().includes('biom'));
    
    console.log('[Biometry] Telegram WebApp found:', {
      version: tg.version,
      platform: tg.platform,
      hasBiometricManager: !!tg.BiometricManager,
      allBiometryKeys: biometryKeys,
      availableAPIs: allKeys.slice(0, 20) // первые 20 для диагностики
    });
    
    // Проверяем все возможные варианты названия
    const possibleNames = [
      'BiometricManager',  // ← ПРАВИЛЬНОЕ название по документации!
      'BiometryManager',
      'biometricManager', 
      'biometryManager',
      'Biometric',
      'Biometry'
    ];
    
    for (const name of possibleNames) {
      if ((tg as any)[name]) {
        console.log(`[Biometry] ✅ Found biometry API as: ${name}`);
      }
    }
  }
  
  return tg ?? null;
}

function getBiometryManager(): TelegramBiometricManager | null {
  const tg = getTelegramWebApp();
  authLogger.debug('Biometry: getBiometryManager', {
    hasTg: !!tg,
    version: tg?.version,
    platform: tg?.platform,
    hasBiometricManager: !!tg?.BiometricManager,
    isVersionAtLeast: tg?.isVersionAtLeast ? tg.isVersionAtLeast('7.2') : 'no check',
  });
  if (!tg) {
    authLogger.warn('Biometry: No Telegram WebApp');
    return null;
  }
  if (tg.isVersionAtLeast && !tg.isVersionAtLeast('7.2')) {
    authLogger.warn('Biometry: Version too old', tg.version, 'need 7.2+');
    return null;
  }
  if (!tg.BiometricManager) {
    authLogger.warn('Biometry: BiometricManager not present');
    return null;
  }
  authLogger.debug('Biometry: BiometricManager available');
  return tg.BiometricManager;
}

/**
 * Проверить поддержку и инициализировать биометрию.
 * Ожидает загрузки Telegram WebApp, если скрипт ещё не загружен.
 */
export function initBiometry(): Promise<BiometryInfo> {
  return new Promise((resolve) => {
    authLogger.debug('Biometry: INIT START');
    const maxWaitForTelegram = 5000;
    const startTime = Date.now();
    
    const tryInit = () => {
      const tg = getTelegramWebApp();
      const bm = tg?.BiometricManager;
      authLogger.debug('Biometry: tryInit', {
        elapsed: `${Date.now() - startTime}ms`,
        hasTg: !!tg,
        hasBm: !!bm,
      });
      if (!tg) {
        if (Date.now() - startTime < maxWaitForTelegram) {
          setTimeout(tryInit, 100);
          return;
        }
        authLogger.warn('Biometry: TIMEOUT waiting for Telegram WebApp');
        resolve({ available: false });
        return;
      }
      if (!bm) {
        authLogger.warn('Biometry: BiometricManager unavailable');
        resolve({ available: false });
        return;
      }
      const returnInfo = (): BiometryInfo => {
        const info: BiometryInfo = {
          available: bm.isBiometricAvailable,
          type: bm.biometricType,
          tokenSaved: bm.isBiometricTokenSaved,
          accessRequested: bm.isAccessRequested,
          accessGranted: bm.isAccessGranted,
          deviceId: bm.deviceId,
        };
        authLogger.debug('Biometry: init result', info);
        if (!info.available) {
          authLogger.warn('Biometry: isBiometricAvailable = FALSE');
        } else {
          authLogger.debug('Biometry: AVAILABLE', info.type);
        }
        return info;
      };
      if (bm.isInited) {
        authLogger.debug('Biometry: Already initialized');
        resolve(returnInfo());
        return;
      }
      authLogger.debug('Biometry: calling bm.init()');
      let resolved = false;
      const finalize = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        clearInterval(pollInterval);
        if (tg.offEvent) tg.offEvent('biometricManagerUpdated', handleBiometryUpdate);
        authLogger.debug('Biometry: INIT END');
        resolve(returnInfo());
      };
      const handleBiometryUpdate = () => {
        authLogger.debug('Biometry: event biometricManagerUpdated', { isInited: bm.isInited });
        if (bm.isInited) finalize();
      };
      if (tg.onEvent) tg.onEvent('biometricManagerUpdated', handleBiometryUpdate);
      const pollInterval = setInterval(() => {
        if (bm.isInited) finalize();
      }, 200);
      const timeout = setTimeout(() => {
        authLogger.debug('Biometry: init timeout 3s');
        finalize();
      }, 3000);
      try {
        bm.init(() => finalize());
      } catch (e) {
        authLogger.error('Biometry: init error', e);
        finalize();
      }
    };
    tryInit();
  });
}

/**
 * Запросить доступ к биометрии у пользователя.
 */
export function requestBiometryAccess(reason?: string): Promise<boolean> {
  return new Promise((resolve) => {
    authLogger.debug('Biometry: requestAccess', { reason });
    const bm = getBiometryManager();
    if (!bm) {
      authLogger.warn('Biometry: Cannot request access - no BiometricManager');
      resolve(false);
      return;
    }
    try {
      bm.requestAccess(
        { reason: reason ?? 'Для быстрого входа в приложение' },
        (granted) => {
          authLogger.debug('Biometry: access result', granted ? 'GRANTED' : 'DENIED');
          resolve(granted);
        }
      );
    } catch (e) {
      authLogger.error('Biometry: requestAccess error', e);
      resolve(false);
    }
  });
}

const AUTH_REQUESTED_MESSAGE = 'WebAppBiometricManagerAuthenticationRequested';
/** Таймаут ожидания callback после показа диалога (на первом запуске callback иногда не приходит). */
const AUTH_CALLBACK_WAIT_MS = 12000;

let authenticateInProgress = false;

export type AuthenticateBiometryOptions = {
  reason?: string;
  /** Вызов при показе нативного диалога (Android: throw AuthenticationRequested). Для логирования на сервер. */
  onAuthDialogShown?: () => void;
};

/**
 * Аутентифицировать пользователя по биометрии.
 * На Android Telegram может выбросить WebAppBiometricManagerAuthenticationRequested при показе
 * нативного диалога — это не ошибка, ждём callback от нативного слоя (до 12 с).
 */
export function authenticateBiometry(reasonOrOpts?: string | AuthenticateBiometryOptions): Promise<BiometryResult> {
  const opts: AuthenticateBiometryOptions = typeof reasonOrOpts === 'string' ? { reason: reasonOrOpts } : (reasonOrOpts ?? {});
  const reason = opts.reason ?? 'Вход в ATS WALLET';

  if (authenticateInProgress) {
    authLogger.warn('Biometry: authenticate already in progress, skipping');
    return Promise.resolve({ status: 'unavailable' });
  }

  return new Promise((resolve) => {
    let resolved = false;
    authenticateInProgress = true;
    const doResolve = (result: BiometryResult) => {
      if (resolved) return;
      resolved = true;
      authenticateInProgress = false;
      clearTimeout(timeoutId);
      resolve(result);
    };

    authLogger.debug('Biometry: authenticate', { reason });
    const bm = getBiometryManager();
    if (!bm) {
      authLogger.warn('Biometry: Cannot authenticate - no BiometricManager');
      authenticateInProgress = false;
      doResolve({ status: 'unavailable' });
      return;
    }

    const timeoutId = setTimeout(() => {
      if (resolved) return;
      authLogger.warn('Biometry: authenticate callback timeout');
      doResolve({ status: 'unavailable' });
    }, AUTH_CALLBACK_WAIT_MS);

    try {
      bm.authenticate(
        { reason },
        (success, token) => {
          authLogger.debug('Biometry: authenticate result', { success, hasToken: !!token });
          const authorized = success || (typeof token === 'string' && token.length > 0);
          if (authorized) {
            authLogger.info('Biometry: authorized');
            doResolve({ status: 'authorized', token: (token as string) || undefined });
          } else {
            authLogger.warn('Biometry: failed (not_recognized)');
            doResolve({ status: 'failed' });
          }
        }
      );
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const errName = e instanceof Error ? e.name : '';
      if (errMsg.includes(AUTH_REQUESTED_MESSAGE) || errMsg.includes('AuthenticationRequested')) {
        authLogger.debug('Biometry: auth dialog shown, waiting for callback', { message: errMsg });
        opts.onAuthDialogShown?.();
        return;
      }
      authLogger.error('Biometry: authenticate error', { message: errMsg, name: errName, raw: e });
      doResolve({ status: 'unavailable' });
    }
  });
}

/**
 * Сохранить токен для биометрии (используется для персистентной аутентификации).
 */
export function saveBiometryToken(token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const bm = getBiometryManager();
    if (!bm) {
      resolve(false);
      return;
    }

    try {
      bm.updateBiometricToken(token, (success) => resolve(success));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Открыть настройки биометрии (можно вызывать только по клику пользователя).
 */
export function openBiometrySettings(): void {
  const bm = getBiometryManager();
  if (bm) {
    try {
      bm.openSettings();
    } catch {
      // ignore
    }
  }
}

/**
 * Проверить доступность биометрии (quick check без init).
 */
export function isBiometryAvailable(): boolean {
  const bm = getBiometryManager();
  return bm?.isBiometricAvailable ?? false;
}

/**
 * Получить тип биометрии: 'finger', 'face', или null.
 */
export function getBiometryType(): 'finger' | 'face' | 'unknown' | null {
  const bm = getBiometryManager();
  return bm?.biometricType ?? null;
}

/**
 * Проверить, был ли доступ к биометрии уже разрешён.
 */
export function isBiometryAccessGranted(): boolean {
  const bm = getBiometryManager();
  return bm?.isAccessGranted ?? false;
}

/**
 * Получить информацию о Telegram версии и платформе для отладки.
 */
export function getTelegramInfo(): { version?: string; platform?: string } | null {
  const tg = getTelegramWebApp();
  if (!tg) return null;
  return { version: tg.version, platform: tg.platform };
}
