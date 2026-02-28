'use client';

import Link from 'next/link';
import BottomNav from '@/components/BottomNav';

export default function AmlPage() {
  return (
    <div className="w-full max-w-[430px] min-h-screen bg-background-light dark:bg-neutral-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Политика AML</h1>
        <div className="w-10 shrink-0" />
        <div className="w-10" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-4">
          <p>ATS WALLET соблюдает требования по противодействию отмыванию денег (AML). Мы вправе запрашивать документы и данные для верификации операций.</p>
          <p>Подозрительные операции могут быть заблокированы до выяснения обстоятельств. Пользователь обязуется не использовать сервис для противоправной деятельности.</p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
