'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBalance, getPublicUsdtRubRate, getMe } from '@/lib/api';
import { vibrateLight } from '@/lib/vibrate';
import BottomNav from '@/components/BottomNav';
import HeaderUser from '@/components/HeaderUser';
import { BalanceSkeleton } from '@/components/Skeleton';
import NewsCarousel from '@/components/NewsCarousel';
import Onboarding, { useOnboarding } from '@/components/Onboarding';

const HIDDEN_PLACEHOLDER = '******';
const HIDDEN_PLACEHOLDER_SHORT = '****';

function useNewsOnMain(): boolean {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const v = typeof window !== 'undefined' ? localStorage.getItem('ats_news_on_main') : null;
    setShow(v !== '0');
  }, []);
  useEffect(() => {
    const onFocus = () => {
      const v = localStorage.getItem('ats_news_on_main');
      setShow(v !== '0');
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  return show;
}

export default function DashboardPage() {
  const [balance, setBalance] = useState<{ usdt: string; assets: Array<{ symbol: string; name: string; amount: string; priceUsd: string; priceRub: string; change24h: string }> } | null>(null);
  const [usdtRubRate, setUsdtRubRate] = useState<number | null>(null);
  const [commissionPercent, setCommissionPercent] = useState<number>(0);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const showNewsOnMain = useNewsOnMain();
  const { showOnboarding, completeOnboarding } = useOnboarding();

  useEffect(() => {
    getBalance()
      .then(setBalance)
      .catch(() => {
        setBalance({ usdt: '0', assets: [{ symbol: 'USDT', name: 'Tether', amount: '0', priceUsd: '0.999', priceRub: '98.5', change24h: '-0.03' }] });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getPublicUsdtRubRate().then((r) => setUsdtRubRate(r.usdtRub)).catch(() => {});
  }, []);

  useEffect(() => {
    getMe().then((me) => {
      const p = me?.commissionPercent;
      if (p != null && p !== '') {
        const num = parseFloat(String(p).replace(',', '.'));
        if (!Number.isNaN(num) && num >= 0) setCommissionPercent(num);
      }
    }).catch(() => {});
  }, []);

  const usdt = balance?.usdt ?? '0';
  const usdtNum = Number(usdt);
  const baseRate = usdtRubRate ?? 0;
  const effectiveRate = baseRate > 0 && commissionPercent > 0
    ? baseRate * (1 - commissionPercent / 100)
    : baseRate;
  const rubEquivalent = usdtNum * (effectiveRate > 0 ? effectiveRate : baseRate);
  const usdtDisplay = hidden ? HIDDEN_PLACEHOLDER : `${Number(usdt).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} USDT`;
  const rubDisplay = hidden ? HIDDEN_PLACEHOLDER : `≈ ${rubEquivalent.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}\u00A0руб.`;
  // Всегда показываем минимум USDT (Тезер) в «Мои активы»
  const assets = (balance?.assets?.length ? balance.assets : [{ symbol: 'USDT', name: 'Tether', amount: usdt, priceUsd: '0.999', priceRub: String(usdtRubRate ?? 98.5), change24h: '-0.03' }]);

  return (
    <div className="w-full max-w-[430px] bg-white dark:bg-slate-900 min-h-screen shadow-2xl flex flex-col relative overflow-hidden mx-auto">
      {loading && <div className="loading-bar bg-primary/10" role="progressbar" aria-label="Загрузка" />}

      <main className="flex-1 px-6 pt-0 pb-40 overflow-y-auto hide-scrollbar relative">
        <div className="flex justify-end mt-2 mb-1">
          <HeaderUser className="w-12 h-12 text-base" />
        </div>
        {loading ? (
          <BalanceSkeleton />
        ) : (
          <div id="onboarding-balance" className="py-6 flex flex-col items-center justify-center text-center miniapp-fade-in">
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-bold tabular-nums">
                {usdtDisplay}
              </span>
              <button
                type="button"
                onClick={() => setHidden(!hidden)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 mt-1 active:scale-95"
                aria-label={hidden ? 'Показать' : 'Скрыть'}
              >
                <span className="material-icons-round text-[24px]">
                  {hidden ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">
              {rubDisplay}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-8 miniapp-stagger">
          <Link id="onboarding-deposit" href="/deposit" onClick={() => vibrateLight()} className="flex flex-col items-center gap-2 active:scale-[0.96] transition-transform">
            <span className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 transition-transform active:scale-95">
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
            </span>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Пополнить</span>
          </Link>
          <Link id="onboarding-withdraw" href="/withdraw" onClick={() => vibrateLight()} className="flex flex-col items-center gap-2 active:scale-[0.96] transition-transform">
            <span className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 transition-transform active:scale-95">
              <span className="material-icons-round text-2xl">north_east</span>
            </span>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Вывести</span>
          </Link>
          <Link href="/exchange" onClick={() => vibrateLight()} className="flex flex-col items-center gap-2 active:scale-[0.96] transition-transform">
            <span className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 transition-transform active:scale-95">
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>currency_exchange</span>
            </span>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Обмен</span>
          </Link>
        </div>

        {showNewsOnMain && <NewsCarousel />}

        <h2 className="text-xl font-bold mb-4 miniapp-fade-in" style={{ animationDelay: '120ms' }}>Мои активы</h2>
        <div
          className="rounded-[28px] overflow-hidden border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-[#26A17B]/10 to-[#26A17B]/5 dark:from-[#26A17B]/20 dark:to-[#26A17B]/10 miniapp-scale-in"
          style={{ animationDelay: '160ms' }}
        >
          {loading ? (
            <div className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-200/50 dark:bg-slate-600/30 skeleton shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-24 rounded-lg" />
                <div className="skeleton h-6 w-28 rounded-lg" />
              </div>
            </div>
          ) : (
            <div className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#26A17B] flex items-center justify-center shrink-0 shadow-lg shadow-[#26A17B]/25">
                <img
                  src="/icons/tether-usdt-logo.png"
                  alt="USDT"
                  className="w-9 h-9 object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Tether</p>
                <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white truncate">
                  {hidden ? HIDDEN_PLACEHOLDER_SHORT : `${Number(assets[0]?.amount ?? usdt).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} USDT`}
                </p>
              </div>
            </div>
          )}
        </div>

        <Link
          href="/history"
          onClick={() => vibrateLight()}
          className="w-full mt-6 mb-8 py-4 bg-blue-50 dark:bg-slate-800 text-primary font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform miniapp-fade-in"
          style={{ animationDelay: '200ms' }}
        >
          <span className="material-icons-round text-[20px]">history</span>
          История транзакций
        </Link>
      </main>

      <BottomNav />

      <div className="fixed inset-0 -z-10 bg-slate-100 dark:bg-slate-950 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] absolute -top-40 -left-40" />
        <div className="w-[600px] h-[600px] bg-blue-400/10 rounded-full blur-[100px] absolute -bottom-20 -right-20" />
      </div>

      {showOnboarding && !loading && <Onboarding onComplete={completeOnboarding} />}
    </div>
  );
}
