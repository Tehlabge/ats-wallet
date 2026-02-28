'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import {
  getLockMethod,
  setLockMethod,
  getPinBlockedUntil,
  formatBlockedUntil,
  getAutoLockTimeout,
  setAutoLockTimeout,
  type LockMethod,
} from '@/lib/lockSession';
import {
  initBiometry,
  requestBiometryAccess,
  saveBiometryToken,
  type BiometryInfo,
} from '@/lib/telegramBiometry';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];
const MAX_LEN = 8;
const MIN_LEN = 4;

function vibrate(pattern: number | number[] = 10) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function PinDots({ value }: { value: string }) {
  const minDots = 4;
  const maxDots = 8;
  const len = value.length;
  const count = len === 0 ? minDots : Math.max(minDots, Math.min(maxDots, len));
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
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
      {DIGITS.map((key) =>
        key === '' ? (
          <div key="empty" />
        ) : key === 'backspace' ? (
          <button
            key="backspace"
            type="button"
            onClick={onBackspace}
            className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95"
          >
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">backspace</span>
          </button>
        ) : (
          <button
            key={key}
            type="button"
            onClick={() => onDigit(key)}
            className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white text-xl font-semibold active:scale-95"
          >
            {key}
          </button>
        )
      )}
    </div>
  );
}

export default function SecurityPage() {
  const [codeEnabled, setCodeEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('ats_pin_enabled') === '1';
  });
  const [lockMethod, setLockMethodState] = useState<LockMethod | null>(() => getLockMethod());
  const [blockedUntil, setBlockedUntil] = useState<number | null>(() => getPinBlockedUntil());
  const [step, setStep] = useState<'view' | 'change_pin' | 'confirm_pin' | 'success'>('view');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometryInfo, setBiometryInfo] = useState<BiometryInfo | null>(null);
  const [biometryLoading, setBiometryLoading] = useState(false);
  const [autoLockTimeout, setAutoLockTimeoutState] = useState<number>(() => getAutoLockTimeout());
  const isBlocked = blockedUntil !== null && Date.now() < blockedUntil;

  const autoLockOptions = [
    { value: 1 * 60 * 1000, label: '1 мин' },
    { value: 2 * 60 * 1000, label: '2 мин' },
    { value: 4 * 60 * 1000, label: '4 мин' },
    { value: 5 * 60 * 1000, label: '5 мин' },
    { value: 10 * 60 * 1000, label: '10 мин' },
    { value: 15 * 60 * 1000, label: '15 мин' },
    { value: 30 * 60 * 1000, label: '30 мин' },
  ];

  const handleAutoLockChange = (value: number) => {
    setAutoLockTimeout(value);
    setAutoLockTimeoutState(value);
  };

  const getCurrentAutoLockLabel = () => {
    const opt = autoLockOptions.find(o => o.value === autoLockTimeout);
    return opt?.label || '4 минуты';
  };

  useEffect(() => {
    initBiometry().then(setBiometryInfo);
  }, []);

  const currentValue = step === 'change_pin' ? pin : confirm;

  const addDigit = useCallback(
    (d: string) => {
      if (currentValue.length >= MAX_LEN) return;
      vibrate(10);
      const next = currentValue + d;
      if (step === 'change_pin') setPin(next);
      else setConfirm(next);
      setError(null);
    },
    [step, currentValue.length]
  );

  const backspace = useCallback(() => {
    vibrate(10);
    if (step === 'change_pin') setPin((p) => p.slice(0, -1));
    else setConfirm((c) => c.slice(0, -1));
    setError(null);
  }, [step]);

  const handleSave = () => {
    setError(null);
    if (pin.length < MIN_LEN) {
      setError(`Код должен быть от ${MIN_LEN} до ${MAX_LEN} цифр`);
      return;
    }
    if (pin !== confirm) {
      setError('Коды не совпадают');
      vibrate([50, 50, 50]);
      return;
    }
    vibrate([10, 30, 10, 30, 10]);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ats_pin', pin);
      localStorage.setItem('ats_pin_enabled', '1');
      if (getLockMethod() === null) setLockMethod('pin');
    }
    setLockMethodState(getLockMethod());
    setPin('');
    setConfirm('');
    setStep('success');
  };

  const handleDisable = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ats_pin');
      localStorage.removeItem('ats_pin_enabled');
      localStorage.removeItem('ats_lock_method');
      localStorage.removeItem('ats_pin_fail_count');
      localStorage.removeItem('ats_pin_blocked_until');
      localStorage.removeItem('ats_pin_block_level');
      localStorage.removeItem('ats_biometry_token');
    }
    setCodeEnabled(false);
    setLockMethodState(null);
    setBlockedUntil(null);
    setPin('');
    setConfirm('');
    setStep('view');
  };

  const handleSwitchMethod = async (method: LockMethod) => {
    if (method === 'biometric') {
      if (!biometryInfo?.available) {
        setError('Биометрия недоступна на этом устройстве');
        return;
      }
      setBiometryLoading(true);
      try {
        const granted = await requestBiometryAccess('Для быстрого входа в ATS WALLET');
        if (granted) {
          setLockMethod('biometric');
          setLockMethodState('biometric');
          const token = 'ats_bio_' + Date.now();
          await saveBiometryToken(token);
          localStorage.setItem('ats_biometry_token', token);
        } else {
          setError('Доступ к биометрии отклонён');
        }
      } catch {
        setError('Ошибка инициализации биометрии');
      } finally {
        setBiometryLoading(false);
      }
    } else {
      setLockMethod('pin');
      setLockMethodState('pin');
    }
  };

  const biometryTypeLabel = biometryInfo?.type === 'finger' ? 'Отпечаток пальца' : biometryInfo?.type === 'face' ? 'Face ID' : 'Биометрия';

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-background-light dark:bg-neutral-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Безопасность</h1>
        <div className="w-10 shrink-0" />
        <div className="w-10" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-5xl text-green-600 dark:text-green-400">check_circle</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Код обновлён</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-8 max-w-[260px]">
              Новый код для входа сохранён.
            </p>
            <button
              type="button"
              onClick={() => setStep('view')}
              className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              Назад
            </button>
          </div>
        )}

        {step === 'view' && (
          <>
            {/* Информация о защите */}
            <div className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5 border border-primary/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-xl">shield</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Защита входа</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {codeEnabled ? (lockMethod === 'biometric' ? biometryTypeLabel : 'Код-пароль') : 'Не настроена'}
                  </p>
                </div>
              </div>
            </div>

            {/* Предупреждение о блокировке */}
            {codeEnabled && isBlocked && blockedUntil !== null && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">lock_clock</span>
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Вход временно заблокирован</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">До {formatBlockedUntil(blockedUntil)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Способ входа (только если защита включена) */}
            {codeEnabled && (
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1">
                  Способ входа
                </p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleSwitchMethod('pin')}
                    disabled={biometryLoading}
                    className={`w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${
                      lockMethod === 'pin'
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lockMethod === 'pin' ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      <span className={`material-symbols-outlined ${lockMethod === 'pin' ? 'text-primary' : 'text-slate-500'}`}>pin</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`font-semibold ${lockMethod === 'pin' ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>Код-пароль</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">4–8 цифр для входа</p>
                    </div>
                    {lockMethod === 'pin' && (
                      <span className="material-symbols-outlined text-primary">check_circle</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSwitchMethod('biometric')}
                    disabled={biometryLoading || !biometryInfo?.available}
                    className={`w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all disabled:opacity-50 ${
                      lockMethod === 'biometric'
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lockMethod === 'biometric' ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      <span className={`material-symbols-outlined ${lockMethod === 'biometric' ? 'text-primary' : 'text-slate-500'}`}>fingerprint</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`font-semibold ${lockMethod === 'biometric' ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>
                        {biometryLoading ? 'Подключение...' : biometryTypeLabel}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {!biometryInfo?.available ? 'Недоступно на устройстве' : 'Быстрый вход + код как резерв'}
                      </p>
                    </div>
                    {lockMethod === 'biometric' && (
                      <span className="material-symbols-outlined text-primary">check_circle</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Автоблокировка (только если защита включена) */}
            {codeEnabled && (
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1">
                  Автоблокировка
                </p>
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <span className="material-symbols-outlined text-slate-500">timer</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white">Запрашивать код через</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">После неактивности в приложении</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {autoLockOptions.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleAutoLockChange(opt.value)}
                        className={`py-2 px-1 rounded-xl text-xs font-medium transition-all ${
                          autoLockTimeout === opt.value
                            ? 'bg-primary text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Изменить код-пароль (только если защита включена) */}
            {codeEnabled && (
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1">
                  Код-пароль
                </p>
                <button
                  type="button"
                  onClick={() => { setStep('change_pin'); setPin(''); setConfirm(''); setError(null); }}
                  className="w-full p-4 rounded-2xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <span className="material-symbols-outlined text-slate-500">password</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-slate-900 dark:text-white">Изменить код</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Установить новый код-пароль</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                </button>
              </div>
            )}

            {/* Отключить защиту */}
            {codeEnabled && (
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1">
                  Управление
                </p>
                <button
                  type="button"
                  onClick={handleDisable}
                  className="w-full p-4 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-red-500">lock_open</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-red-600 dark:text-red-400">Отключить защиту</p>
                    <p className="text-xs text-red-500/70 dark:text-red-400/70">Вход без кода и биометрии</p>
                  </div>
                </button>
              </div>
            )}

            {/* Включить защиту (если не включена) */}
            {!codeEnabled && (
              <div className="text-center py-8">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-4xl text-slate-400">lock_open</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Защита не настроена</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-[280px] mx-auto">
                  Включите защиту для безопасного входа в приложение
                </p>
                <button
                  type="button"
                  onClick={() => { setStep('change_pin'); setPin(''); setConfirm(''); setError(null); }}
                  className="px-8 py-4 bg-primary text-white font-bold rounded-2xl shadow-lg active:scale-[0.98]"
                >
                  Включить защиту
                </button>
              </div>
            )}

            {error && <p className="mt-4 text-center text-red-600 dark:text-red-400 text-sm">{error}</p>}
          </>
        )}

        {(step === 'change_pin' || step === 'confirm_pin') && (
          <div className="py-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">
              {step === 'change_pin' ? 'Придумайте код' : 'Повторите код'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-6">
              {step === 'change_pin' ? '4–8 цифр для входа' : 'Введите код ещё раз для подтверждения'}
            </p>

            <div className="mb-6">
              <PinDots value={currentValue} />
            </div>
            <NumKeypad onDigit={addDigit} onBackspace={backspace} />

            {step === 'change_pin' && pin.length >= MIN_LEN && (
              <button
                type="button"
                onClick={() => { vibrate([10, 50, 10]); setStep('confirm_pin'); setConfirm(''); }}
                className="w-full mt-6 py-3.5 rounded-2xl bg-primary text-white font-semibold active:scale-[0.98]"
              >
                Далее
              </button>
            )}
            {step === 'confirm_pin' && confirm.length >= MIN_LEN && (
              <button
                type="button"
                onClick={handleSave}
                className="w-full mt-6 py-3.5 rounded-2xl bg-primary text-white font-semibold active:scale-[0.98]"
              >
                Сохранить
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (step === 'confirm_pin') { setStep('change_pin'); setConfirm(''); setError(null); }
                else { setStep('view'); setPin(''); setError(null); }
              }}
              className="w-full mt-4 py-3 text-slate-500 dark:text-slate-400 text-sm"
            >
              Назад
            </button>

            {error && <p className="mt-4 text-center text-red-600 dark:text-red-400 text-sm">{error}</p>}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
