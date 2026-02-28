'use client';

import Link from 'next/link';
import BottomNav from '@/components/BottomNav';

type ServiceItem = {
  slug: string;
  title: string;
  shortDescription: string;
  icon: string;
};

const SERVICES: ServiceItem[] = [
  {
    slug: 'yandex-food',
    title: 'Яндекс Еда',
    shortDescription: 'Оплата заказа по QR-коду СБП',
    icon: 'restaurant',
  },
];

export default function HowToPayPage() {
  return (
    <div className="w-full max-w-[430px] min-h-screen bg-white dark:bg-slate-900 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Как оплачивать</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          Инструкции по оплате в популярных сервисах через ATS WALLET и СБП
        </p>
        <div className="space-y-4">
          {SERVICES.map((item) => (
            <Link
              key={item.slug}
              href={`/profile/how-to-pay/${item.slug}`}
              className="block p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-primary/30 dark:hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[28px]">{item.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-slate-900 dark:text-white mb-1">{item.title}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{item.shortDescription}</p>
                  <span className="text-xs text-primary font-medium mt-2 inline-flex items-center gap-0.5">
                    Подробнее
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
