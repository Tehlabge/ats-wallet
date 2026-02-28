'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPaymentArchive, type PaymentArchiveItem } from '@/lib/api';

export default function AdminPaymentsArchivePage() {
  const [list, setList] = useState<PaymentArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    getPaymentArchive({
      status: status || undefined,
      search: search.trim() || undefined,
      limit: 200,
    })
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [status]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Архив платежей</h1>
          <p className="text-slate-500 mt-1">Все платежи с поиском и фильтром по статусу</p>
        </div>
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <span className="material-icons-round text-[18px]">list</span>
          Ожидающие
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
        >
          <option value="">Все статусы</option>
          <option value="pending">Ожидает</option>
          <option value="confirmed">Подтверждён</option>
          <option value="rejected">Отклонён</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Поиск по ID или сумме"
          className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
        >
          <span className={`material-icons-round text-[18px] ${loading ? 'animate-spin' : ''}`}>search</span>
          Найти
        </button>
      </div>

      {loading && list.length === 0 ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-12 text-center text-slate-500">
          Платежи не найдены
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">ID</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Пользователь</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Сумма</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Статус</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Создан</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-sm">{p.id}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.userId.slice(0, 8)}…</td>
                    <td className="px-4 py-3">
                      {Number(p.sumRub).toLocaleString('ru-RU')} ₽ → {Number(p.sumUsdt).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${
                          p.status === 'confirmed'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : p.status === 'rejected'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {p.status === 'confirmed' ? 'Подтверждён' : p.status === 'rejected' ? 'Отклонён' : 'Ожидает'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm">{new Date(p.createdAt).toLocaleString('ru-RU')}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/payments/${p.id}`} className="text-primary hover:underline text-sm">
                        Открыть
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
