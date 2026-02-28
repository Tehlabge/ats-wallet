'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authByTelegram, attachReferrer, sendComponentLog } from '@/lib/api';
import { authLogger } from '@/lib/authLogger';
import PinGate from '@/components/PinGate';
import SeedGate from '@/components/SeedGate';
import LockMethodChoice from '@/components/LockMethodChoice';
import { getLockMethod, isSessionValid, setSessionUnlocked, updateLastActiveTime, getAutoLockTimeout, isAuthAfterCloseEnabled, forceSessionExpire } from '@/lib/lockSession';

const TOKEN_KEY = 'ats_token';
const TG_USER_ID_KEY = 'ats_tg_user_id';
const PROTECTED_PATHS = ['/', '/scan', '/history', '/profile', '/deposit', '/withdraw', '/exchange'];

function hasToken(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(TOKEN_KEY);
}

/** Извлекает Telegram user id из initData (query string с полем user — JSON). */
function getTelegramUserIdFromInitData(initData: string): string | null {
  try {
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    if (!userStr) return null;
    const user = JSON.parse(decodeURIComponent(userStr)) as { id?: number };
    return user?.id != null ? String(user.id) : null;
  } catch {
    return null;
  }
}

function getTelegramInitData(): string | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData ?? null;
}

/** start_param из ссылки (ref_<userId> реферера). Нужен для привязки реферала. */
function getTelegramStartParam(): string | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }).Telegram;
  let p = tg?.WebApp?.initDataUnsafe?.start_param ?? null;
  if (!p && typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    p = params.get('tgWebAppStartParam') ?? null;
  }
  return p && p.startsWith('ref_') ? p : null;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [pinUnlocked, setPinUnlockedState] = useState(false);
  const [pinCheckDone, setPinCheckDone] = useState(false);
  const miniappLaunchLoggedRef = useRef(false);

  useEffect(() => {
    const token = hasToken();
    const isProtected = PROTECTED_PATHS.some((p) => pathname === p || (p !== '/' && (pathname ?? '').startsWith(p)));
    const isLogin = pathname === '/login';

    if (isLogin && token) {
      router.replace('/');
      return;
    }
    const initData = getTelegramInitData();
    if (isProtected && initData) {
      const currentTgUserId = getTelegramUserIdFromInitData(initData);
      const storedTgUserId = typeof window !== 'undefined' ? sessionStorage.getItem(TG_USER_ID_KEY) : null;
      const accountChanged = currentTgUserId != null && currentTgUserId !== storedTgUserId;
      const needReauth = !token || accountChanged;

      if (needReauth) {
        const startParam = getTelegramStartParam();
        authByTelegram(initData, startParam ?? undefined)
          .then((r) => {
            localStorage.setItem(TOKEN_KEY, r.access_token);
            if (currentTgUserId && typeof window !== 'undefined') {
              sessionStorage.setItem(TG_USER_ID_KEY, currentTgUserId);
            }
            // Если это новый пользователь (в т.ч. удалённый и пересозданный) — сбрасываем lockMethod
            if (r.isNewUser) {
              localStorage.removeItem('ats_lock_method');
              localStorage.removeItem('ats_pin');
              localStorage.removeItem('ats_pin_enabled');
              localStorage.removeItem('ats_biometry_token');
              sessionStorage.removeItem('ats_pin_unlocked_at');
            }
            window.location.reload();
          })
          .catch(() => {
            if (typeof window !== 'undefined') sessionStorage.removeItem(TG_USER_ID_KEY);
            router.replace('/login');
          });
        return;
      }
    }
    if (isProtected && !token) {
      router.replace('/login');
      return;
    }
    setChecked(true);
    // Уже залогиненный пользователь открыл приложение по реферальной ссылке — привязать реферера один раз
    if (token && initData) {
      const startParam = getTelegramStartParam();
      if (startParam && typeof window !== 'undefined') {
        const sentKey = 'ats_ref_sent_' + startParam;
        if (!sessionStorage.getItem(sentKey)) {
          sessionStorage.setItem(sentKey, '1');
          attachReferrer(startParam).catch(() => {});
        }
      }
    }
  }, [pathname, router]);

  useEffect(() => {
    if (!checked) return;
    if (!hasToken()) {
      authLogger.debug('No token, skipping lock check');
      authLogger.event('auth', 'no_token_skip_lock');
      setPinUnlockedState(true);
      setPinCheckDone(true);
      return;
    }
    const lockMethod = getLockMethod();
    authLogger.debug('Lock method:', lockMethod);
    authLogger.event('auth', 'lock_check', { lockMethod: lockMethod ?? 'none' });
    // Если метод не выбран - не проверяем PIN, покажем выбор метода
    if (lockMethod === null) {
      authLogger.debug('No lock method set, will show LockMethodChoice');
      setPinCheckDone(true);
      return;
    }
    // Метод выбран - проверяем сессию
    const sessionValid = isSessionValid();
    authLogger.debug('Session valid:', sessionValid);
    authLogger.event('auth', 'session_check', { valid: sessionValid });
    setPinUnlockedState(sessionValid);
    setPinCheckDone(true);
  }, [checked]);

  // Отслеживание активности пользователя для сброса таймера автоблокировки
  useEffect(() => {
    if (!pinUnlocked || getLockMethod() === null) return;
    
    const timeout = getAutoLockTimeout();
    // Если таймаут = 0, автоблокировка отключена
    if (timeout === 0) return;
    
    // Обновляем время активности при взаимодействии
    const handleActivity = () => {
      updateLastActiveTime();
    };

    // Слушаем события активности
    const events = ['click', 'touchstart', 'keydown', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Обновляем время при загрузке
    updateLastActiveTime();

    // Проверяем неактивность каждые 30 секунд
    const checkInterval = setInterval(() => {
      if (!isSessionValid()) {
        setPinUnlockedState(false);
      }
    }, 30000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      clearInterval(checkInterval);
    };
  }, [pinUnlocked]);

  // Запрашивать авторизацию после каждого закрытия мини-приложения
  useEffect(() => {
    if (!isAuthAfterCloseEnabled()) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        forceSessionExpire();
        sendComponentLog('auth', 'session_expired_visibility_hidden');
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const isProtected = PROTECTED_PATHS.some((p) => pathname === p || (p !== '/' && (pathname ?? '').startsWith(p)));
  const showingApp = checked && hasToken() && !(pathname ?? '').startsWith('/admin') && (!getLockMethod() || pinUnlocked) && pinCheckDone;
  useEffect(() => {
    if (showingApp && isProtected && !miniappLaunchLoggedRef.current) {
      miniappLaunchLoggedRef.current = true;
      sendComponentLog('miniapp', 'launch');
    }
  }, [showingApp, isProtected]);

  const handlePinSuccess = () => {
    authLogger.info('[AuthGuard] handlePinSuccess: unlocking session');
    sendComponentLog('auth', 'pin_unlock_success');
    setSessionUnlocked();
    setPinUnlockedState(true);
    router.refresh();
  };

  const handleLockMethodDone = () => {
    setPinUnlockedState(true);
    setPinCheckDone(true);
  };

  const isAdminPath = (pathname ?? '').startsWith('/admin');
  if (!checked && PROTECTED_PATHS.some((p) => pathname === p || (p !== '/' && (pathname ?? '').startsWith(p)))) {
    return (
      <div
        className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900"
        style={{ minHeight: '100dvh' }}
      >
        <span className="text-slate-500 dark:text-slate-400 text-sm">Загрузка…</span>
      </div>
    );
  }

  // Админ-панель: код-пароль не требуем
  if (isAdminPath) {
    return <>{children}</>;
  }

  // Показываем выбор метода, если lockMethod не установлен
  const needLockMethod = checked && hasToken() && getLockMethod() === null;
  // Показываем PinGate, если метод установлен и сессия не разблокирована
  const needPin = checked && hasToken() && getLockMethod() !== null && pinCheckDone && !pinUnlocked;

  if (needLockMethod) {
    return <LockMethodChoice onDone={handleLockMethodDone} />;
  }
  if (needPin) {
    return <PinGate onSuccess={handlePinSuccess} />;
  }
  if (checked && hasToken() && getLockMethod() !== null && !pinCheckDone) {
    return (
      <div
        className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900"
        style={{ minHeight: '100dvh' }}
      >
        <span className="text-slate-500 dark:text-slate-400 text-sm">Проверка доступа…</span>
      </div>
    );
  }

  if (checked && hasToken() && isProtected) {
    return <SeedGate>{children}</SeedGate>;
  }

  return <>{children}</>;
}
