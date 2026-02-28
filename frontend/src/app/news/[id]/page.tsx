'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getNewsItem } from '@/lib/api';

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function NewsItemPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? parseInt(params.id, 10) : NaN;
  const [item, setItem] = useState<{ id: number; title: string; content: string; createdAt: string; imageUrl?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError(true);
      setLoading(false);
      return;
    }
    getNewsItem(id)
      .then((data) => {
        setItem(data ?? null);
        setError(!data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-white dark:bg-slate-900 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/news" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Новость</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-8 w-full bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        ) : error || !item ? (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400 mb-4">Новость не найдена</p>
            <Link href="/news" className="text-primary font-medium">Вернуться к списку</Link>
          </div>
        ) : (
          <article className="pb-6">
            <p className="text-sm text-primary font-semibold mb-2">{formatDate(item.createdAt)}</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{item.title}</h2>
            {item.imageUrl && (
              <div className="rounded-2xl overflow-hidden mb-4 bg-slate-100 dark:bg-slate-800">
                <img src={item.imageUrl} alt="" className="w-full h-auto object-cover" />
              </div>
            )}
            <div className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {item.content}
            </div>
          </article>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
