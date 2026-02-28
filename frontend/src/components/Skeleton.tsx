'use client';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function LoadingSpinner({ size = 'md', text }: { size?: 'sm' | 'md' | 'lg'; text?: string }) {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <div className={`${sizeClass} rounded-full border-2 border-slate-200 dark:border-slate-700`} />
        <div className={`${sizeClass} rounded-full border-2 border-transparent border-t-primary absolute inset-0 animate-spin`} />
      </div>
      {text && <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">{text}</p>}
    </div>
  );
}

export function PulseLoader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-3 h-3' : 'w-2 h-2';
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${dotSize} rounded-full bg-primary animate-bounce`}
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '600ms' }}
        />
      ))}
    </div>
  );
}

export function WalletLoader({ text = 'Загрузка...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 animate-pulse" />
        <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
          <span className="material-symbols-outlined text-white text-2xl animate-bounce" style={{ animationDuration: '1s' }}>
            account_balance_wallet
          </span>
        </div>
        <div className="absolute -inset-1 rounded-2xl border-2 border-primary/30 animate-ping" style={{ animationDuration: '1.5s' }} />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">{text}</p>
      <PulseLoader size="sm" />
    </div>
  );
}

export function DataLoader({ message = 'Загружаем данные' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full animate-ping" />
      </div>
      <p className="mt-5 text-sm font-medium text-slate-700 dark:text-slate-300">{message}</p>
      <div className="mt-2 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"
            style={{
              animation: 'bounce 1s infinite',
              animationDelay: `${i * 200}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function BalanceSkeleton() {
  return (
    <div className="py-6 flex flex-col items-center justify-center text-center">
      <div className="relative">
        <div className="flex items-center justify-center gap-2">
          <div className="skeleton-shine h-10 w-48 rounded-xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700" />
          <div className="skeleton-shine h-6 w-6 rounded-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 shrink-0" />
        </div>
        <div className="skeleton-shine h-5 w-32 mx-auto mt-3 rounded-lg bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700" />
      </div>
    </div>
  );
}

export function AssetsListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50 dark:bg-slate-800/30">
          <Skeleton className="w-12 h-12 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistoryListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900 border border-slate-100 dark:border-slate-800"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="skeleton-shine w-11 h-11 rounded-xl bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-600 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton-shine h-4 w-28 rounded-lg bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700" />
            <div className="skeleton-shine h-3 w-20 rounded bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700" />
          </div>
          <div className="text-right space-y-2">
            <div className="skeleton-shine h-5 w-16 rounded-lg bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 ml-auto" />
            <div className="skeleton-shine h-3 w-10 rounded bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 ml-auto" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SessionsListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ProfileMenuSkeleton() {
  return (
    <div className="mt-8 bg-white dark:bg-neutral-900 border-y border-slate-200 dark:border-neutral-800">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center px-4 py-3.5">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0 mr-3" />
          <Skeleton className="h-4 flex-1 max-w-[180px]" />
        </div>
      ))}
    </div>
  );
}
