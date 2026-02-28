'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { getPublicSettings } from '@/lib/api';
import { APP_VERSION_FALLBACK } from '@/lib/version';

export default function AboutPage() {
  const [appVersion, setAppVersion] = useState(APP_VERSION_FALLBACK);
  useEffect(() => {
    getPublicSettings().then((s) => setAppVersion(s.appVersion || APP_VERSION_FALLBACK)).catch(() => {});
  }, []);

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-background-light dark:bg-neutral-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">О приложении</h1>
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30 mb-4">
            <span className="material-icons-round text-white text-5xl">account_balance_wallet</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">ATS WALLET</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Версия {appVersion}</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 mb-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">О кошельке</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            ATS WALLET — это современный криптокошелёк с поддержкой оплаты через СБП. 
            Храните USDT, оплачивайте товары и услуги по QR-коду, выводите средства 
            на карту или внешний кошелёк.
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 mb-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Возможности</h3>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-3">
              <span className="material-icons-round text-primary text-lg">check_circle</span>
              <span>Хранение USDT в безопасном кошельке</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-icons-round text-primary text-lg">check_circle</span>
              <span>Оплата по СБП QR-коду</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-icons-round text-primary text-lg">check_circle</span>
              <span>Вывод на карту или внешний кошелёк</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-icons-round text-primary text-lg">check_circle</span>
              <span>Переводы другим пользователям</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="material-icons-round text-primary text-lg">check_circle</span>
              <span>Реферальная программа</span>
            </li>
          </ul>
        </div>

        <div className="text-center text-xs text-slate-400 dark:text-slate-500">
          <p>© 2024-2026 ATS WALLET</p>
          <p className="mt-1">Все права защищены</p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
