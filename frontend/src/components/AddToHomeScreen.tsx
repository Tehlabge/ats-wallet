'use client';

import { useState, useEffect } from 'react';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<{ outcome: string }>; userChoice: Promise<{ outcome: string }> };

export default function AddToHomeScreen() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone = (window as unknown as { standalone?: boolean }).standalone ?? window.matchMedia('(display-mode: standalone)').matches;
    if (standalone) {
      setInstalled(true);
      return;
    }
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallEvent(null);
  };

  if (installed || dismissed) return null;

  if (installEvent) {
    return (
      <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-2xl text-primary">add_to_home_screen</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-white">Добавить на главный экран</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Быстрый доступ к приложению с телефона</p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleInstall}
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold active:scale-[0.98]"
          >
            Добавить
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            Не сейчас
          </button>
        </div>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/50 p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-neutral-700 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-2xl text-slate-600 dark:text-slate-300">add_to_home_screen</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-white">Добавить на главный экран</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Нажмите <span className="font-medium">Поделиться</span> в Safari, затем «На экран „Домой“»
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 p-2 text-slate-400 dark:text-slate-500"
          aria-label="Скрыть"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
    );
  }

  return null;
}
