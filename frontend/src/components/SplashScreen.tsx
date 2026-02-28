'use client';

import { useEffect, useState } from 'react';
import { preloadSounds } from '@/lib/sounds';

export default function SplashScreen({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    preloadSounds();
    const minTime = new Promise((resolve) => setTimeout(resolve, 800));
    Promise.all([minTime]).then(() => {
      setFadeOut(true);
      setTimeout(() => setLoading(false), 250);
    });
  }, []);

  if (!loading) return <>{children}</>;

  return (
    <>
      <div
        className={`fixed z-[9999] flex flex-col items-center justify-center transition-opacity duration-250 ${
          fadeOut ? 'opacity-0' : 'opacity-100'
        } bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900`}
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          minHeight: '100dvh',
        }}
      >
        <div className="relative flex flex-col items-center justify-center w-[200px] h-[200px]">
          <div className="relative w-28 h-28 shrink-0">
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20 dark:shadow-primary/30">
              <span className="material-icons-round text-white text-4xl" style={{ display: 'block' }}>account_balance_wallet</span>
            </div>
          </div>
          <h1 className="mt-6 text-xl font-bold text-slate-900 dark:text-white tracking-tight shrink-0 leading-tight" style={{ minHeight: '1.75rem' }}>ATS WALLET</h1>
          <p className="mt-1.5 text-slate-500 dark:text-slate-400 text-sm shrink-0 leading-tight" style={{ minHeight: '1.25rem' }}>Загрузка...</p>
        </div>
      </div>
      <div className="opacity-0 pointer-events-none min-h-[100dvh]" aria-hidden="true">{children}</div>
    </>
  );
}
