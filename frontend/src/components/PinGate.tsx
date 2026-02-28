'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { openSupportFromApi } from '@/lib/support';
import {
  setSessionUnlocked,
  isPinBlockedNow,
  formatBlockedUntil,
  getPinBlockedUntil,
  recordPinFailure,
  MAX_PIN_ATTEMPTS,
  getPinFailCount,
  getLockMethod,
} from '@/lib/lockSession';
import {
  initBiometry,
  authenticateBiometry,
  type BiometryInfo,
} from '@/lib/telegramBiometry';
import { sendComponentLog } from '@/lib/api';
import { authLogger, isAuthDebugEnabled, getAuthLogs, clearAuthLogs } from '@/lib/authLogger';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

function vibrateOnDigit() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

function vibrateOnBackspace() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([8, 40, 8]);
  }
}
const MAX_LEN = 8;
const MIN_LEN = 4;

function PinDots({ value }: { value: string }) {
  const count = value.length === 0 ? MIN_LEN : Math.max(MIN_LEN, Math.min(MAX_LEN, value.length));
  return (
    <div className="flex justify-center gap-2.5 flex-wrap max-w-[240px] mx-auto">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
            i < value.length
              ? 'bg-primary border-primary scale-110'
              : 'border-slate-300 dark:border-slate-600 bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

function NumKeypad({
  onDigit,
  onBackspace,
  onBiometry,
  showBiometry,
  biometryLoading,
  biometryIcon = 'fingerprint',
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onBiometry?: () => void;
  showBiometry?: boolean;
  biometryLoading?: boolean;
  /** Иконка по типу биометрии: отпечаток или лицо (Face ID на iOS) */
  biometryIcon?: 'fingerprint' | 'face';
}) {
  return (
    <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
      {DIGITS.map((key) =>
        key === '' ? (
          showBiometry && onBiometry ? (
            <button
              key="biometry"
              type="button"
              onClick={onBiometry}
              disabled={biometryLoading}
              className="h-14 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center active:scale-95 disabled:opacity-50"
              title={biometryIcon === 'face' ? 'Войти по Face ID' : 'Войти по отпечатку'}
            >
              <span className={`material-symbols-outlined text-2xl text-primary ${biometryLoading ? 'animate-pulse' : ''}`}>{biometryIcon}</span>
            </button>
          ) : (
            <div key="empty" />
          )
        ) : key === 'backspace' ? (
          <button
            key="backspace"
            type="button"
            onClick={() => {
              vibrateOnBackspace();
              onBackspace();
            }}
            className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95"
          >
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">backspace</span>
          </button>
        ) : (
          <button
            key={key}
            type="button"
            onClick={() => {
              vibrateOnDigit();
              onDigit(key);
            }}
            className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white text-xl font-semibold active:scale-95"
          >
            {key}
          </button>
        )
      )}
    </div>
  );
}

export default function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(() =>
    typeof window !== 'undefined' ? getPinBlockedUntil() : null
  );
  const [failCount, setFailCount] = useState(() =>
    typeof window !== 'undefined' ? getPinFailCount() : 0
  );
  const [biometryInfo, setBiometryInfo] = useState<BiometryInfo | null>(null);
  const [biometryAuthenticating, setBiometryAuthenticating] = useState(false);
  const lockMethod = typeof window !== 'undefined' ? getLockMethod() : null;
  const isBlocked = blockedUntil !== null && Date.now() < blockedUntil;
  const biometryAuthInProgressRef = useRef(false);

  // Показываем только форму: биометрию пользователь запускает сам кнопкой на клавиатуре, либо вводит PIN
  useEffect(() => {
    if (lockMethod !== 'biometric' || isBlocked) return;
    let cancelled = false;
    initBiometry().then((info) => {
      if (cancelled) return;
      authLogger.debug('PinGate: initBiometry result', info);
      setBiometryInfo(info);
    });
    return () => { cancelled = true; };
  }, [lockMethod, isBlocked]);

  const handleBiometryAuth = async () => {
    if (biometryAuthInProgressRef.current) {
      authLogger.debug('PinGate: handleBiometryAuth skipped, already in progress');
      return;
    }
    authLogger.debug('PinGate: handleBiometryAuth start');
    if (isPinBlockedNow()) {
      authLogger.warn('PinGate: blocked, skipping biometry');
      setBlockedUntil(getPinBlockedUntil());
      return;
    }
    biometryAuthInProgressRef.current = true;
    setBiometryAuthenticating(true);
    authLogger.event('biometry', 'attempt');
    try {
      const result = await authenticateBiometry({
        reason: 'Вход в ATS WALLET',
        onAuthDialogShown: () => sendComponentLog('biometry', 'auth_dialog_shown'),
      });
      authLogger.debug('PinGate: authenticateBiometry result', result);
      if (result.status === 'authorized') {
        authLogger.event('biometry', 'ok');
        authLogger.info('Biometry authorized, calling onSuccess');
        setSessionUnlocked();
        try {
          onSuccess();
        } catch (e) {
          authLogger.error('PinGate: onSuccess (biometry) threw', e);
        }
      } else if (result.status === 'failed') {
        authLogger.warn('PinGate: biometry failed not_recognized');
        authLogger.event('biometry', 'fail', { reason: 'not_recognized' });
        recordPinFailure();
        const newCount = getPinFailCount();
        setFailCount(newCount);
        const until = getPinBlockedUntil();
        if (until !== null) setBlockedUntil(until);
        setError('Биометрия не распознана. Используйте код-пароль.');
      } else {
        authLogger.warn('PinGate: biometry unavailable');
        authLogger.event('biometry', 'fail', { reason: 'unavailable' });
        sendComponentLog('biometry', 'fail_unavailable');
        setError('Биометрия недоступна. Введите код-пароль.');
      }
    } catch (e) {
      authLogger.error('PinGate: biometry catch', e);
      authLogger.event('biometry', 'fail', { reason: 'error' });
      setError('Ошибка биометрии');
    } finally {
      biometryAuthInProgressRef.current = false;
      setBiometryAuthenticating(false);
    }
  };

  const addDigit = useCallback((d: string) => {
    setPin((prev) => {
      if (prev.length >= MAX_LEN) return prev;
      return prev + d;
    });
    setError(null);
  }, []);

  const backspace = useCallback(() => {
    setPin((p) => p.slice(0, -1));
    setError(null);
  }, []);

  const handleSubmit = () => {
    if (pin.length < MIN_LEN) {
      setError(`Введите от ${MIN_LEN} до ${MAX_LEN} цифр`);
      return;
    }
    if (isPinBlockedNow()) {
      setBlockedUntil(getPinBlockedUntil());
      return;
    }
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ats_pin') : null;
    authLogger.debug('PinGate: handleSubmit', { pinLen: pin.length, hasSaved: !!saved, match: saved ? pin === saved : false });
    if (saved && pin === saved) {
      authLogger.info('PIN unlock ok, calling onSuccess');
      authLogger.event('biometry', 'pin_unlock_ok');
      setSessionUnlocked();
      try {
        onSuccess();
      } catch (e) {
        authLogger.error('PinGate: onSuccess threw', e);
      }
      return;
    }
    recordPinFailure();
    const newCount = getPinFailCount();
    setFailCount(newCount);
    const until = getPinBlockedUntil();
    if (until !== null) setBlockedUntil(until);
    setError(`Неверный код. Осталось попыток: ${Math.max(0, MAX_PIN_ATTEMPTS - newCount)}`);
    setPin('');
  };

  if (isBlocked && blockedUntil !== null) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-neutral-950 dark:to-neutral-900 px-6 py-8 safe-area-inset">
        <div className="w-full max-w-[320px] flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-6 shrink-0">
            <span className="material-symbols-outlined text-3xl text-amber-600 dark:text-amber-400">lock_clock</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Вход временно заблокирован</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">
            Превышено количество неверных попыток. Повторите попытку после:
          </p>
          <p className="text-lg font-bold text-primary">{formatBlockedUntil(blockedUntil)}</p>
          <button
            type="button"
            onClick={() => setBlockedUntil(getPinBlockedUntil())}
            className="mt-8 py-3 text-slate-500 dark:text-slate-400 text-sm"
          >
            Обновить
          </button>
          <button type="button" onClick={() => openSupportFromApi()} className="mt-6 flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
            <span className="material-symbols-outlined text-[20px]">support_agent</span>
            Поддержка
          </button>
        </div>
      </div>
    );
  }

  const biometryTypeLabel = biometryInfo?.type === 'finger' ? 'отпечаток' : biometryInfo?.type === 'face' ? 'Face ID' : 'биометрию';
  const biometryIcon = lockMethod === 'biometric' && biometryInfo?.type === 'face' ? 'face' : 'fingerprint';

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-neutral-950 dark:to-neutral-900 px-6 py-8 safe-area-inset">
      <div className="w-full max-w-[320px] flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-6 shrink-0">
          <span className="material-symbols-outlined text-3xl text-primary">
            {lockMethod === 'biometric' ? biometryIcon : 'lock'}
          </span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-1">
          {lockMethod === 'biometric' ? 'Вход по биометрии' : 'Код безопасности'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-2">
          {lockMethod === 'biometric'
            ? `Используйте ${biometryTypeLabel} или введите код`
            : 'Введите код для входа в приложение'}
        </p>
        {failCount > 0 && (
          <p className="text-amber-600 dark:text-amber-400 text-xs mb-4">
            Осталось попыток: {MAX_PIN_ATTEMPTS - failCount}
          </p>
        )}

        <div className="mb-6 w-full flex justify-center">
          <PinDots value={pin} />
        </div>
        <div className="w-full max-w-[260px]">
          <NumKeypad
            onDigit={addDigit}
            onBackspace={backspace}
            onBiometry={lockMethod === 'biometric' && biometryInfo?.available ? handleBiometryAuth : undefined}
            showBiometry={lockMethod === 'biometric' && !!biometryInfo?.available}
            biometryLoading={biometryAuthenticating}
            biometryIcon={biometryIcon}
          />
        </div>

        {pin.length >= MIN_LEN && (
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full mt-6 py-3.5 rounded-2xl bg-primary text-white font-semibold active:scale-[0.98]"
          >
            Войти
          </button>
        )}

        {error && (
          <p className="mt-4 text-center text-red-600 dark:text-red-400 text-sm">{error}</p>
        )}

        {error && isAuthDebugEnabled() && (
          <div className="mt-4 w-full max-w-[320px] rounded-xl bg-slate-800 text-slate-200 p-3 font-mono text-[10px] max-h-32 overflow-y-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-400 text-xs">Лог (ats_auth_debug)</span>
              <button type="button" onClick={() => { clearAuthLogs(); }} className="text-slate-500">Очистить</button>
            </div>
            {getAuthLogs().length === 0 ? (
              <div className="text-slate-500">Нет записей. Включите до ошибки.</div>
            ) : (
              getAuthLogs().map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
              ))
            )}
          </div>
        )}

        <div className="mt-10 w-full">
          <button
            type="button"
            onClick={() => openSupportFromApi()}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 text-sm font-medium active:scale-[0.99]"
          >
            <span className="material-symbols-outlined text-[20px]">support_agent</span>
            Написать в тех. поддержку
          </button>
        </div>
      </div>
    </div>
  );
}
