'use client';

import { useState, useCallback, useEffect } from 'react';
import { openSupportFromApi } from '@/lib/support';
import { setLockMethod, setSessionUnlocked, type LockMethod } from '@/lib/lockSession';
import {
  initBiometry,
  requestBiometryAccess,
  saveBiometryToken,
  openBiometrySettings,
  getTelegramInfo,
  type BiometryInfo,
} from '@/lib/telegramBiometry';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];
const MIN_LEN = 4;
const MAX_LEN = 8;

function vibrate(pattern: number | number[] = 10) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function PinDots({ value }: { value: string }) {
  const count = value.length === 0 ? MIN_LEN : Math.max(MIN_LEN, Math.min(MAX_LEN, value.length));
  return (
    <div className="flex justify-center gap-2.5 flex-wrap max-w-[240px] mx-auto">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
            i < value.length ? 'bg-primary border-primary scale-110' : 'border-slate-300 dark:border-slate-600 bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

function NumKeypad({ onDigit, onBackspace }: { onDigit: (d: string) => void; onBackspace: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
      {DIGITS.map((key) =>
        key === '' ? (
          <div key="empty" />
        ) : key === 'backspace' ? (
          <button key="backspace" type="button" onClick={onBackspace} className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-95">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">backspace</span>
          </button>
        ) : (
          <button key={key} type="button" onClick={() => onDigit(key)} className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white text-xl font-semibold active:scale-95">
            {key}
          </button>
        )
      )}
    </div>
  );
}

type Step = 'welcome' | 'choice' | 'pin' | 'confirm' | 'biometry_setup' | 'biometry_confirm' | 'homescreen';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<{ outcome: string }>; userChoice: Promise<{ outcome: string }> };

export default function LockMethodChoice({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [chosenMethod, setChosenMethod] = useState<LockMethod | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometryBackupStep, setBiometryBackupStep] = useState<'create' | 'confirm'>('create');
  const [biometryInfo, setBiometryInfo] = useState<BiometryInfo | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [biometryLoading, setBiometryLoading] = useState(true);
  const [telegramInfo, setTelegramInfo] = useState<{ version?: string; platform?: string } | null>(null);

  useEffect(() => {
    const tgInfo = getTelegramInfo();
    console.log('[LockMethodChoice] Telegram Info:', tgInfo);
    setTelegramInfo(tgInfo);
    
    console.log('[LockMethodChoice] Starting biometry init...');
    initBiometry()
      .then((info) => {
        console.log('[LockMethodChoice] Biometry init result:', info);
        setBiometryInfo(info);
      })
      .finally(() => {
        console.log('[LockMethodChoice] Biometry loading done');
        setBiometryLoading(false);
      });

    // Проверка на standalone режим (уже установлено)
    if (typeof window !== 'undefined') {
      const standalone = (window as unknown as { standalone?: boolean }).standalone ?? window.matchMedia('(display-mode: standalone)').matches;
      setIsStandalone(standalone);
      
      const ua = navigator.userAgent;
      setIsIOS(/iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document));

      const onBeforeInstall = (e: Event) => {
        e.preventDefault();
        setInstallEvent(e as BeforeInstallPromptEvent);
      };
      window.addEventListener('beforeinstallprompt', onBeforeInstall);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }
  }, []);

  const currentValue = step === 'pin' ? pin : confirm;

  const addDigit = useCallback(
    (d: string) => {
      if (currentValue.length >= MAX_LEN) return;
      vibrate(10);
      if (step === 'pin') setPin((p) => p + d);
      else setConfirm((c) => c + d);
      setError(null);
    },
    [step, currentValue.length]
  );

  const backspace = useCallback(() => {
    vibrate(10);
    if (step === 'pin') setPin((p) => p.slice(0, -1));
    else setConfirm((c) => c.slice(0, -1));
    setError(null);
  }, [step]);

  const handleChoice = async (method: LockMethod) => {
    console.log('[LockMethodChoice] User chose method:', method);
    setChosenMethod(method);
    if (method === 'biometric') {
      console.log('[LockMethodChoice] Biometry check:', {
        available: biometryInfo?.available,
        type: biometryInfo?.type,
        accessGranted: biometryInfo?.accessGranted
      });
      
      if (!biometryInfo?.available) {
        console.log('[LockMethodChoice] ❌ Biometry not available, blocking');
        setError('Биометрия недоступна на этом устройстве. Используйте код-пароль.');
        return;
      }
      setBiometryLoading(true);
      try {
        console.log('[LockMethodChoice] Requesting biometry access...');
        const granted = await requestBiometryAccess('Для быстрого входа в ATS WALLET');
        console.log('[LockMethodChoice] Access granted:', granted);
        if (!granted) {
          setError('Доступ к биометрии отклонён. Можете использовать код-пароль.');
          setBiometryLoading(false);
          return;
        }
        console.log('[LockMethodChoice] ✅ Moving to biometry_setup step');
        setStep('biometry_setup');
        setBiometryBackupStep('create');
        setPin('');
        setConfirm('');
        setError(null);
      } catch (e) {
        console.error('[LockMethodChoice] ❌ Error requesting biometry:', e);
        setError('Ошибка инициализации биометрии');
      } finally {
        setBiometryLoading(false);
      }
    } else {
      setStep('pin');
      setPin('');
      setConfirm('');
      setError(null);
    }
  };

  const handlePinNext = () => {
    if (pin.length < MIN_LEN) {
      setError(`Введите от ${MIN_LEN} до ${MAX_LEN} цифр`);
      return;
    }
    vibrate([10, 50, 10]);
    setStep('confirm');
    setConfirm('');
    setError(null);
  };

  const finishSetup = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ats_pin', pin);
      localStorage.setItem('ats_pin_enabled', '1');
      setLockMethod(chosenMethod ?? 'pin');
      setSessionUnlocked();
    }
  };

  const handleConfirm = () => {
    if (confirm !== pin) {
      setError('Коды не совпадают');
      vibrate([50, 50, 50]);
      return;
    }
    vibrate([10, 30, 10, 30, 10]);
    finishSetup();
    // Показать предложение добавить ярлык, если не в standalone и есть возможность
    if (!isStandalone && (installEvent || isIOS)) {
      setStep('homescreen');
    } else {
      onDone();
    }
  };

  const handleBiometryConfirm = async () => {
    vibrate([10, 30, 10, 30, 10]);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ats_pin', pin);
      localStorage.setItem('ats_pin_enabled', '1');
      setLockMethod('biometric');
      setSessionUnlocked();
      const token = 'ats_bio_' + Date.now();
      await saveBiometryToken(token);
      localStorage.setItem('ats_biometry_token', token);
    }
    // Показать предложение добавить ярлык
    if (!isStandalone && (installEvent || isIOS)) {
      setStep('homescreen');
    } else {
      onDone();
    }
  };

  const handleInstallHomescreen = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === 'accepted') {
        vibrate([10, 30, 10]);
      }
      setInstallEvent(null);
    }
    onDone();
  };

  const handleSkipHomescreen = () => {
    onDone();
  };

  const biometryTypeLabel = biometryInfo?.type === 'finger' ? 'отпечаток' : biometryInfo?.type === 'face' ? 'Face ID' : 'биометрию';

  // Страница приветствия
  if (step === 'welcome') {
    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col bg-gradient-to-b from-primary/5 via-white to-slate-50 dark:from-primary/10 dark:via-neutral-950 dark:to-neutral-900 safe-area-inset">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          {/* Logo / Icon */}
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-2xl shadow-primary/30">
              <span className="material-symbols-outlined text-white text-5xl">account_balance_wallet</span>
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <span className="material-symbols-outlined text-white text-lg">verified</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-2">
            Добро пожаловать в ATS WALLET
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-center text-sm max-w-[280px] mb-10">
            Безопасный криптокошелёк для хранения и управления USDT
          </p>

          {/* Features */}
          <div className="w-full max-w-[300px] space-y-3 mb-10">
            <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-emerald-500 text-xl">shield</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Безопасное хранение</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Защита код-паролем или биометрией</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-xl">qr_code_scanner</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Быстрые платежи</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Оплата по QR-коду в один клик</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-amber-500 text-xl">currency_exchange</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Выгодный обмен</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Конвертация USDT в рубли</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom button */}
        <div className="px-6 pb-8">
          <button
            type="button"
            onClick={() => setStep('choice')}
            className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-lg active:scale-[0.98] shadow-xl shadow-primary/25 flex items-center justify-center gap-2"
          >
            Начать
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
            Продолжая, вы соглашаетесь с условиями использования
          </p>
        </div>

      </div>
    );
  }

  if (step === 'choice') {
    let biometryUnavailableReason = null;
    
    if (!biometryInfo?.available) {
      if (telegramInfo?.platform === 'macos' || telegramInfo?.platform === 'windows') {
        biometryUnavailableReason = 'Биометрия недоступна в десктопной версии Telegram';
      } else if (telegramInfo?.platform === 'android') {
        // На Android Telegram 9.1 BiometryManager может отсутствовать
        biometryUnavailableReason = 'Биометрия пока недоступна для Android в Telegram Mini Apps. Используйте код-пароль.';
      } else {
        biometryUnavailableReason = 'Биометрия недоступна на этом устройстве';
      }
    }

    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-neutral-950 dark:to-neutral-900 px-6 py-8 safe-area-inset">
        <div className="w-full max-w-[320px] flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-6 shrink-0">
            <span className="material-symbols-outlined text-3xl text-primary">lock</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-1">Способ входа</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-8">
            Для входа в приложение выберите один из способов
          </p>

          <button
            type="button"
            onClick={() => handleChoice('pin')}
            disabled={biometryLoading}
            className="w-full py-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center gap-4 px-4 mb-3 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-2xl">pin</span>
            </span>
            <div className="text-left">
              <p className="font-semibold text-slate-900 dark:text-white">Код-пароль</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">4–8 цифр для входа</p>
            </div>
            <span className="material-symbols-outlined text-slate-400 ml-auto">chevron_right</span>
          </button>

          <button
            type="button"
            onClick={() => handleChoice('biometric')}
            disabled={biometryLoading || !biometryInfo?.available}
            className="w-full py-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center gap-4 px-4 active:scale-[0.98] disabled:opacity-50"
          >
            <span className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-2xl">
                {biometryInfo?.type === 'face' ? 'face' : 'fingerprint'}
              </span>
            </span>
            <div className="text-left">
              <p className="font-semibold text-slate-900 dark:text-white">
                {biometryLoading ? 'Проверка...' : 'Биометрия'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {biometryLoading
                  ? 'Определение доступности...'
                  : biometryUnavailableReason
                  ? biometryUnavailableReason
                  : biometryInfo?.type === 'finger'
                  ? 'Отпечаток пальца + код как резерв'
                  : biometryInfo?.type === 'face'
                  ? 'Face ID + код как резерв'
                  : 'Отпечаток или Face ID (код как резерв)'}
              </p>
            </div>
            <span className="material-symbols-outlined text-slate-400 ml-auto">chevron_right</span>
          </button>

          {/* Кнопка открытия настроек биометрии для мобильных устройств */}
          {!biometryLoading && !biometryInfo?.available && telegramInfo?.platform !== 'macos' && telegramInfo?.platform !== 'windows' && (
            <button
              type="button"
              onClick={() => openBiometrySettings()}
              className="mt-3 text-primary text-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
              Открыть настройки биометрии
            </button>
          )}

          {error && <p className="mt-4 text-center text-red-600 dark:text-red-400 text-sm">{error}</p>}

          <button type="button" onClick={() => openSupportFromApi()} className="mt-6 flex items-center gap-2 py-3 text-slate-500 dark:text-slate-400 text-sm">
            <span className="material-symbols-outlined text-[20px]">support_agent</span>
            Поддержка
          </button>
        </div>
      </div>
    );
  }

  if (step === 'biometry_setup') {
    // Используем отдельный state для управления шагом
    const isCreatingPin = biometryBackupStep === 'create';
    const isConfirmingPin = biometryBackupStep === 'confirm';

    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-neutral-950 dark:to-neutral-900 px-6 py-4 safe-area-inset">
        <div className="w-full max-w-[320px] flex flex-col items-center">
          {/* Иконка: лицо (Face ID на iOS) или отпечаток */}
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center mb-4 shrink-0">
            <span className="material-symbols-outlined text-3xl text-emerald-500">
              {biometryInfo?.type === 'face' ? 'face' : 'fingerprint'}
            </span>
          </div>

          {/* Заголовок и подзаголовок */}
          <h1 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-1">
            Настройка биометрии
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs text-center mb-4">
            Создайте резервный код-пароль
          </p>

          {/* Описание текущего шага */}
          <div className="w-full p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-base shrink-0">info</span>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-tight">
                Резервный код на случай, если биометрия не сработает
              </p>
            </div>
          </div>

          {/* Заголовок шага */}
          <h2 className="text-base font-semibold text-slate-900 dark:text-white text-center mb-1">
            {isCreatingPin ? 'Придумайте резервный код' : 'Повторите код'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs text-center mb-4">
            {isCreatingPin ? `От ${MIN_LEN} до ${MAX_LEN} цифр` : 'Для подтверждения введите код ещё раз'}
          </p>

          {/* Точки-индикаторы */}
          <div className="mb-4 w-full flex justify-center">
            {isCreatingPin ? (
              <PinDots value={pin} />
            ) : (
              // На этапе подтверждения показываем столько точек, сколько было в оригинальном pin
              <div className="flex justify-center gap-2.5 flex-wrap max-w-[240px] mx-auto">
                {Array.from({ length: pin.length }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                      i < confirm.length ? 'bg-primary border-primary scale-110' : 'border-slate-300 dark:border-slate-600 bg-transparent'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Клавиатура */}
          <div className="w-full max-w-[260px] mb-4">
            <NumKeypad
              onDigit={(d) => {
                vibrate(10);
                if (isCreatingPin) {
                  if (pin.length < MAX_LEN) {
                    setPin((p) => p + d);
                  }
                } else {
                  if (confirm.length < MAX_LEN) {
                    setConfirm((c) => c + d);
                  }
                }
                setError(null);
              }}
              onBackspace={() => {
                vibrate(10);
                if (isCreatingPin) {
                  setPin((p) => p.slice(0, -1));
                } else {
                  setConfirm((c) => c.slice(0, -1));
                }
                setError(null);
              }}
            />
          </div>

          {/* Кнопка "Далее" после создания кода */}
          {isCreatingPin && (
            <button
              type="button"
              onClick={() => {
                if (pin.length < MIN_LEN) return;
                vibrate([10, 50, 10]);
                setBiometryBackupStep('confirm');
                setConfirm('');
                setError(null);
              }}
              disabled={pin.length < MIN_LEN}
              className={`w-full py-3 rounded-2xl font-semibold transition-all ${
                pin.length >= MIN_LEN
                  ? 'bg-primary text-white active:scale-[0.98]'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              }`}
            >
              Далее
            </button>
          )}

          {/* Кнопка "Готово" после подтверждения */}
          {isConfirmingPin && (
            <button
              type="button"
              onClick={() => {
                if (confirm.length < MIN_LEN) return;
                if (confirm !== pin) {
                  setError('Коды не совпадают. Попробуйте ещё раз');
                  vibrate([50, 50, 50]);
                  setConfirm('');
                  return;
                }
                handleBiometryConfirm();
              }}
              disabled={confirm.length < MIN_LEN}
              className={`w-full py-3 rounded-2xl font-semibold transition-all ${
                confirm.length >= MIN_LEN
                  ? 'bg-primary text-white active:scale-[0.98]'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              }`}
            >
              Готово
            </button>
          )}

          {/* Кнопка назад */}
          <button
            type="button"
            onClick={() => {
              if (isConfirmingPin) {
                // Возврат к созданию кода
                setBiometryBackupStep('create');
                setConfirm('');
                setError(null);
              } else {
                // Возврат к выбору метода
                setStep('choice');
                setPin('');
                setConfirm('');
                setBiometryBackupStep('create');
                setError(null);
              }
            }}
            className="mt-3 text-slate-500 dark:text-slate-400 text-sm flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Назад
          </button>

          {/* Ошибка */}
          {error && (
            <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
              <p className="text-center text-red-600 dark:text-red-400 text-xs">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Экран предложения добавить ярлык на главный экран
  if (step === 'homescreen') {
    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col bg-gradient-to-b from-emerald-50 via-white to-slate-50 dark:from-emerald-950/30 dark:via-neutral-950 dark:to-neutral-900 safe-area-inset">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          {/* Success Icon */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
              <span className="material-symbols-outlined text-white text-4xl">check_circle</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-2">
            Отлично!
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-10">
            Код-пароль успешно создан
          </p>

          {/* Homescreen Suggestion */}
          <div className="w-full max-w-[320px] p-5 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-3xl text-primary">add_to_home_screen</span>
              </div>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Добавить ярлык</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Быстрый доступ с главного экрана
                </p>
              </div>
            </div>

            {installEvent ? (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Добавьте ATS WALLET на главный экран телефона для мгновенного запуска одним нажатием.
                </p>
                <button
                  type="button"
                  onClick={handleInstallHomescreen}
                  className="w-full py-3.5 rounded-2xl bg-primary text-white font-bold active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-xl">add</span>
                  Добавить на экран
                </button>
              </>
            ) : isIOS ? (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Чтобы добавить ярлык на iOS:
                </p>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">1</span>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Нажмите <span className="font-semibold">Поделиться</span> <span className="material-symbols-outlined text-[16px] align-middle">ios_share</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">2</span>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Выберите «<span className="font-semibold">На экран „Домой"</span>»
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSkipHomescreen}
                  className="w-full py-3.5 rounded-2xl bg-primary text-white font-bold active:scale-[0.98]"
                >
                  Понятно, продолжить
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Skip button */}
        <div className="px-6 pb-8 text-center">
          {installEvent && (
            <button
              type="button"
              onClick={handleSkipHomescreen}
              className="text-slate-500 dark:text-slate-400 text-sm py-2"
            >
              Пропустить
            </button>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Вы всегда можете добавить ярлык позже в <span className="font-medium">Профиле</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-neutral-950 dark:to-neutral-900 px-6 py-8 safe-area-inset">
      <div className="w-full max-w-[320px] flex flex-col items-center">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-1">
          {step === 'pin' ? 'Придумайте код' : 'Повторите код'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-6">
          {step === 'pin' ? '4–8 цифр. Его нужно будет вводить при каждом входе.' : 'Введите код ещё раз для подтверждения.'}
        </p>

        <div className="mb-6 w-full flex justify-center">
          <PinDots value={currentValue} />
        </div>
        <div className="w-full max-w-[260px]">
          <NumKeypad onDigit={addDigit} onBackspace={backspace} />
        </div>

        {step === 'pin' && pin.length >= MIN_LEN && (
          <button type="button" onClick={handlePinNext} className="w-full mt-6 py-3.5 rounded-2xl bg-primary text-white font-semibold active:scale-[0.98]">
            Далее
          </button>
        )}
        {step === 'confirm' && confirm.length >= MIN_LEN && (
          <button type="button" onClick={handleConfirm} className="w-full mt-6 py-3.5 rounded-2xl bg-primary text-white font-semibold active:scale-[0.98]">
            Сохранить
          </button>
        )}

        {step === 'pin' && (
          <button type="button" onClick={() => setStep('choice')} className="mt-4 text-slate-500 dark:text-slate-400 text-sm">
            Назад
          </button>
        )}
        {step === 'confirm' && (
          <button type="button" onClick={() => { setStep('pin'); setConfirm(''); setError(null); }} className="mt-4 text-slate-500 dark:text-slate-400 text-sm">
            Назад
          </button>
        )}

        {error && <p className="mt-4 text-center text-red-600 dark:text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  );
}
