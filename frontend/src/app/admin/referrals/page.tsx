'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getReferralsLeaderboard, type ReferralLeaderboardItem } from '@/lib/api';

export default function AdminReferralsPage() {
  const [list, setList] = useState<ReferralLeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReferralsLeaderboard()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Рефералы</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Кто больше привёл пользователей и реф. баланс в USDT</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-8 text-center text-slate-500 dark:text-slate-400 shadow-sm">
          Нет данных о реферерах
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">#</th>
                  <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Пользователь</th>
                  <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Приведено</th>
                  <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Реф. баланс</th>
                  <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300 text-right">%</th>
                  <th className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((row, i) => (
                  <tr key={row.userId} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{i + 1}</td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-900 dark:text-white">{row.displayName}</span>
                      {row.digitalId && (
                        <span className="block text-xs text-slate-500 dark:text-slate-400 font-mono">{row.digitalId}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">{row.referralsCount}</td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {Number(row.referralBalance).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300">{row.referralCommissionPercent || '0'}%</td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/admin/users/${row.userId}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline text-sm font-medium"
                      >
                        Открыть
                        <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
