'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authByTelegram } from '@/lib/api';
import { vibrateLight } from '@/lib/vibrate';

function getTelegramInitData(): string | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData ?? null;
}

function isTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false;
  const tg = (window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram;
  return !!tg?.WebApp;
}

export default function LoginPage() {
  const router = useRouter();
  const [isTelegram, setIsTelegram] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsTelegram(isTelegramMiniApp());
  }, []);

  const loginByTelegram = async () => {
    const initData = getTelegramInitData();
    if (!initData) {
      setError('Данные Telegram недоступны. Откройте приложение из бота.');
      return;
    }
    let startParam: string | undefined;
    if (typeof window !== 'undefined') {
      const tg = (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }).Telegram;
      startParam = tg?.WebApp?.initDataUnsafe?.start_param ?? undefined;
      if (!startParam) {
        const params = new URLSearchParams(window.location.search);
        startParam = params.get('tgWebAppStartParam') ?? undefined;
      }
    }
    setError('');
    setLoading(true);
    try {
      const { access_token } = await authByTelegram(initData, startParam);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ats_token', access_token);
        try {
          const params = new URLSearchParams(initData);
          const userStr = params.get('user');
          if (userStr) {
            const user = JSON.parse(decodeURIComponent(userStr)) as { id?: number };
            if (user?.id != null) sessionStorage.setItem('ats_tg_user_id', String(user.id));
          }
        } catch {
          // ignore parse error
        }
        window.location.href = '/';
        return;
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  if (isTelegram === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isTelegram) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
        <div className="w-full max-w-[380px] bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-8 border border-slate-200 dark:border-slate-700 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="material-icons-round text-primary text-[40px]">telegram</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">ATS WALLET</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Откройте приложение в боте Telegram — войти можно только оттуда.
          </p>
          <p className="text-slate-500 dark:text-slate-500 text-xs mt-4">
            Запустите бота и нажмите «Открыть кошелёк» или перейдите по ссылке из бота.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-[380px] bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-bold text-center mb-2 text-slate-900 dark:text-white">ATS WALLET</h1>
        <p className="text-center text-slate-500 dark:text-slate-400 text-sm mb-6">
          Вход через Telegram
        </p>
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400 mb-4 text-center">{error}</p>
        )}
        <button
          type="button"
          onClick={() => { vibrateLight(); loginByTelegram(); }}
          disabled={loading}
          className="w-full py-3.5 bg-[#0088cc] hover:bg-[#0077b5] text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="material-icons-round animate-spin text-[22px]">progress_activity</span>
          ) : (
            <span className="material-icons-round text-[22px]">telegram</span>
          )}
          {loading ? 'Вход…' : 'Войти через Telegram'}
        </button>
      </div>
    </div>
  );
}
