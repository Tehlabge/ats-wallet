'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const path = usePathname();
  const isWallet = path === '/';
  const isScan = path === '/scan';
  const isProfile = path === '/profile';

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[380px] z-40">
      <nav className="floating-nav-blur rounded-[24px] px-2 h-14 min-h-[56px] grid grid-cols-3 items-center border border-white/30 dark:border-slate-600/40 overflow-visible">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center py-0 flex-1 transition-all duration-200 active:scale-95 ${
            isWallet ? 'text-primary scale-100' : 'text-slate-400 hover:text-primary scale-100'
          }`}
        >
          <span
            className="material-symbols-outlined text-[24px] transition-transform duration-200"
            style={{ fontVariationSettings: isWallet ? "'FILL' 1" : "'FILL' 0" }}
          >
            account_balance_wallet
          </span>
          <span className="text-[10px] font-bold mt-0.5">Кошелёк</span>
        </Link>
        <div className="relative h-full min-h-[48px] flex justify-center items-center">
          <Link
            id="onboarding-scan"
            href="/scan"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[88px] h-[88px] rounded-full flex flex-col items-center justify-center gap-0.5 shadow-lg active:scale-90 transition-transform duration-200 bg-primary/80 dark:bg-primary/70 backdrop-blur-xl border border-white/30 dark:border-white/20 text-white"
          >
            <span className="material-icons-round text-[32px] leading-none">qr_code_scanner</span>
            <span className="text-[10px] font-bold leading-tight text-center">Оплатить</span>
          </Link>
        </div>
        <Link
          id="onboarding-profile"
          href="/profile"
          className={`flex flex-col items-center justify-center py-0 flex-1 transition-all duration-200 active:scale-95 ${
            isProfile ? 'text-primary' : 'text-slate-400 hover:text-primary'
          }`}
        >
          <span
            className="material-symbols-outlined text-[24px] transition-transform duration-200"
            style={{ fontVariationSettings: isProfile ? "'FILL' 1" : "'FILL' 0" }}
          >
            person
          </span>
          <span className="text-[10px] font-bold mt-0.5">Профиль</span>
        </Link>
      </nav>
    </div>
  );
}
