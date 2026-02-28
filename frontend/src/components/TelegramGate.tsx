'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getPublicSettings } from '@/lib/api';

interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: { user?: { id: number } };
  ready?: () => void;
  expand?: () => void;
}

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
}

export default function TelegramGate({ children }: { children: React.ReactNode }) {
  const [isTelegram, setIsTelegram] = useState<boolean | null>(null);
  const [botUsername, setBotUsername] = useState<string>('ats_wallet_bot');
  const pathname = usePathname();
  
  const isAdminRoute = pathname.startsWith('/admin');
  const isLoginRoute = pathname === '/login';

  // Загрузка имени бота из публичных настроек
  useEffect(() => {
    getPublicSettings()
      .then((data) => {
        if (data.telegramBotUsername) {
          setBotUsername(data.telegramBotUsername);
          // Сохраняем в localStorage для кеша
          localStorage.setItem('ats_telegram_bot_username', data.telegramBotUsername);
        }
      })
      .catch(() => {
        // Fallback на localStorage или дефолтное значение
        const cached = localStorage.getItem('ats_telegram_bot_username');
        if (cached) setBotUsername(cached);
      });
  }, []);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const hasTelegramData = !!(tg?.initData || tg?.initDataUnsafe?.user?.id);
    setIsTelegram(hasTelegramData);
    
    if (hasTelegramData && tg) {
      tg.ready?.();
      tg.expand?.();
    }
  }, []);

  if (isTelegram === null) {
    return <>{children}</>;
  }

  if (!isTelegram && !isAdminRoute && !isLoginRoute) {
    const telegramLink = `https://t.me/${botUsername}`;
    
    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 px-6 py-8 overflow-y-auto">
        <div className="w-full max-w-sm text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-[#2AABEE] to-[#229ED9] flex items-center justify-center shadow-xl shadow-[#2AABEE]/30">
            <svg viewBox="0 0 24 24" className="w-14 h-14 text-white" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </div>
          
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            ATS WALLET
          </h1>
          
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Это приложение работает только внутри Telegram. Откройте его через наш бот.
          </p>
          
          <a
            href={telegramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-3 w-full py-4 px-6 bg-gradient-to-r from-[#2AABEE] to-[#229ED9] text-white font-bold rounded-2xl shadow-lg shadow-[#2AABEE]/30 hover:shadow-xl hover:shadow-[#2AABEE]/40 transition-all active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Открыть в Telegram
          </a>
          
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-6">
            Если у вас нет Telegram, <a href="https://telegram.org/" target="_blank" rel="noopener noreferrer" className="text-[#2AABEE] hover:underline">скачайте его</a>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
