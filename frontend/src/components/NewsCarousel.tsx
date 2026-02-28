'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getNews } from '@/lib/api';

type NewsItem = { id: number; title: string; content: string; createdAt: string };

export default function NewsCarousel() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    getNews()
      .then((list) => setItems(list.slice(0, 5)))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    const width = el.offsetWidth;
    const targetLeft = index * width;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const start = el.scrollLeft;
    const startTime = performance.now();
    const duration = 400;
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - (1 - t) * (1 - t);
      el.scrollLeft = start + (targetLeft - start) * ease;
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [index, items.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    const width = el.offsetWidth;
    const i = Math.round(el.scrollLeft / (width || 1));
    const safe = (i % items.length + items.length) % items.length;
    setIndex(safe);
  };

  if (items.length === 0) {
    return (
      <Link
        href="/news"
        className="mb-6 relative overflow-hidden rounded-2xl bg-blue-50 dark:bg-slate-800 p-4 flex items-center border border-blue-100 dark:border-slate-700 active:scale-[0.99] transition-transform block"
      >
        <div className="flex-1 z-10 min-w-0">
          <h3 className="text-primary font-bold text-base leading-tight">Новости</h3>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">Актуальные новости ATS WALLET</p>
        </div>
        <span className="material-icons-round text-4xl text-primary">newspaper</span>
      </Link>
    );
  }

  return (
    <div className="mb-6 rounded-2xl overflow-hidden border border-blue-100 dark:border-slate-700 bg-blue-50 dark:bg-slate-800">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar scroll-smooth"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item, i) => (
          <Link
            key={`${item.id}-${i}`}
            href="/news"
            className="flex-shrink-0 w-full snap-start snap-always p-4 flex items-center gap-4 active:scale-[0.99] transition-transform min-h-[88px] box-border"
            style={{ minWidth: '100%' }}
          >
            <div className="flex-1 min-w-0 z-10">
              <h3 className="text-primary font-bold text-base leading-tight truncate">{item.title}</h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{item.content}</p>
            </div>
            <span className="material-icons-round text-4xl text-primary shrink-0">newspaper</span>
          </Link>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 pb-3 pt-1">
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Слайд ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-primary' : 'w-1.5 bg-primary/30'}`}
          />
        ))}
      </div>
    </div>
  );
}
