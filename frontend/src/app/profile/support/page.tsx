'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { openSupport, getSupportBotUrl } from '@/lib/support';
import { getPublicSettings } from '@/lib/api';

export default function SupportPage() {
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicSettings()
      .then((s) => {
        const fromApi = s.supportBotUsername ? `https://t.me/${s.supportBotUsername.replace(/^@/, '')}` : null;
        setSupportUrl(fromApi || getSupportBotUrl());
      })
      .catch(() => setSupportUrl(getSupportBotUrl()))
      .finally(() => setLoading(false));
  }, []);

  const hasBot = true;
  const urlToOpen = supportUrl || getSupportBotUrl();

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-slate-50 dark:bg-slate-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Техподдержка</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <div className="w-full max-w-sm flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-4xl text-primary" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>support_agent</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-[15px] leading-relaxed mb-8">
            Откроется чат в Telegram с нашей техподдержкой. Напишите туда — мы ответим в ближайшее время.
          </p>
          <button
            type="button"
            onClick={() => openSupport(urlToOpen)}
            disabled={loading}
            className={`
              w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold text-[17px]
              shadow-lg active:scale-[0.98] transition-all duration-200
              ${!loading
                ? 'bg-primary text-white shadow-primary/25 hover:shadow-primary/30'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed shadow-none'
              }
            `}
          >
            <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>chat_bubble_outline</span>
            {loading ? 'Загрузка…' : 'Написать в техподдержку'}
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
