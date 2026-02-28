'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { getNews } from '@/lib/api';

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function NewsPage() {
  const [items, setItems] = useState<Array<{ id: number; title: string; content: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNews()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-white dark:bg-slate-900 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Новости</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          Актуальные новости и обновления ATS WALLET
        </p>
        {loading ? (
          <p className="text-slate-500 text-sm">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-slate-500 text-sm">Пока нет новостей.</p>
        ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/news/${item.id}`}
              className="block p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-primary/30 dark:hover:border-primary/40 transition-colors"
            >
              <p className="text-xs text-primary font-semibold mb-1">{formatDate(item.createdAt)}</p>
              <h2 className="font-bold text-slate-900 dark:text-white mb-2">{item.title}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">{item.content}</p>
              <span className="text-xs text-primary font-medium mt-2 inline-flex items-center gap-0.5">
                Подробнее
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </span>
            </Link>
          ))}
        </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
