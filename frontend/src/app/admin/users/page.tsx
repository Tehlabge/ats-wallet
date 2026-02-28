'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAdminUsers, getAdminUserByQuery, getAdminRole } from '@/lib/api';

interface User {
  id: string;
  phone: string;
  digitalId?: string;
  telegramId?: string;
  telegramUsername?: string;
  commissionPercent: string;
  createdAt: string;
  usdt: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [quickQuery, setQuickQuery] = useState('');
  const [quickQueryLoading, setQuickQueryLoading] = useState(false);
  const [quickQueryError, setQuickQueryError] = useState<string | null>(null);
  const router = useRouter();
  
  const role = typeof window !== 'undefined' ? getAdminRole() : null;
  const isSuper = role === 'super';

  const load = () => {
    setLoading(true);
    setError(null);
    getAdminUsers({ sortBy, sortOrder })
      .then(setUsers)
      .catch((e) => {
        setUsers([]);
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [sortBy, sortOrder]);

  const findByIdOrTelegram = async () => {
    const q = quickQuery.trim();
    if (!q) return;
    setQuickQueryError(null);
    setQuickQueryLoading(true);
    try {
      const data = await getAdminUserByQuery(q);
      if (data) {
        router.push(`/admin/users/${data.id}`);
      } else {
        setQuickQueryError('Пользователь не найден');
      }
    } catch (e) {
      setQuickQueryError(e instanceof Error ? e.message : 'Ошибка поиска');
    } finally {
      setQuickQueryLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Пользователи</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{isSuper ? 'Управление балансами и комиссиями' : 'Просмотр данных пользователей'}</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
          <input
            type="text"
            value={quickQuery}
            onChange={(e) => { setQuickQuery(e.target.value); setQuickQueryError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && findByIdOrTelegram()}
            placeholder="Цифровой ID, Telegram ID, телефон, @username..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={findByIdOrTelegram}
          disabled={quickQueryLoading || !quickQuery.trim()}
          className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
        >
          <span className={`material-icons-round text-[18px] ${quickQueryLoading ? 'animate-spin' : ''}`}>
            {quickQueryLoading ? 'hourglass_empty' : 'person_search'}
          </span>
          Найти
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-xl font-medium disabled:opacity-50"
        >
          <span className={`material-icons-round text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
        </button>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="createdAt">По дате</option>
          <option value="id">По ID</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          <option value="desc">↓</option>
          <option value="asc">↑</option>
        </select>
      </div>
      {quickQueryError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          {quickQueryError}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">Нет пользователей</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-5 py-4 text-sm font-semibold text-slate-600 dark:text-slate-400">ID / Login / Digital ID</th>
                  <th className="text-left px-5 py-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Телефон / Telegram</th>
                  <th className="text-left px-5 py-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Баланс</th>
                  {isSuper && <th className="text-left px-5 py-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Комиссия</th>}
                  <th className="text-left px-5 py-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Дата</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-4">
                      <p className="font-mono text-sm text-slate-900 dark:text-white">{u.id.slice(0, 8)}…</p>
                      {u.digitalId && <p className="text-xs text-primary font-mono">ID: {u.digitalId}</p>}
                      {u.telegramUsername && <p className="text-xs text-slate-500">@{u.telegramUsername}</p>}
                    </td>
                    <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                      {u.phone || (u.telegramUsername ? `@${u.telegramUsername}` : '—')}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-slate-900 dark:text-white">{Number(String(u.usdt ?? 0)).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USDT</span>
                    </td>
                    {isSuper && <td className="px-5 py-4 text-slate-700 dark:text-slate-300">{u.commissionPercent}%</td>}
                    <td className="px-5 py-4 text-sm text-slate-500">{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="flex items-center gap-1 text-primary hover:underline text-sm font-medium"
                      >
                        <span className="material-icons-round text-[16px]">person</span>
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
