'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAdminUserByQuery, balanceOperation, walletManagerAuth } from '@/lib/api';

const USDT_FORMAT = { minimumFractionDigits: 0, maximumFractionDigits: 3 } as const;

function formatUsdt(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return '0';
  return n.toLocaleString('ru-RU', USDT_FORMAT);
}

type Operation = 'credit' | 'debit';

export default function AdminBonusesPage() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Main state
  const [query, setQuery] = useState('');
  const [user, setUser] = useState<{ id: string; digitalId?: string; telegramUsername?: string; usdt: string } | null>(null);
  const [amountUsdt, setAmountUsdt] = useState('');
  const [operation, setOperation] = useState<Operation>('credit');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAuth = async () => {
    if (!authPassword.trim()) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      await walletManagerAuth(authPassword);
      setIsAuthenticated(true);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Ошибка авторизации');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setError(null);
    setSuccess(null);
    setUser(null);
    setSearching(true);
    try {
      const data = await getAdminUserByQuery(q);
      if (data) {
        setUser({
          id: data.id,
          digitalId: data.digitalId,
          telegramUsername: data.telegramUsername,
          usdt: data.usdt,
        });
      } else {
        setError('Пользователь не найден');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка поиска');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !amountUsdt.trim()) return;
    const raw = amountUsdt.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(raw) || parseFloat(raw) <= 0) {
      setError('Укажите положительную сумму USDT');
      return;
    }
    const amount = Math.round(parseFloat(raw) * 1000) / 1000;
    const amountStr = amount.toFixed(3).replace(/\.?0+$/, '') || '0';
    if (operation === 'debit' && parseFloat(user.usdt || '0') < amount) {
      setError('Недостаточно средств для списания');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await balanceOperation(user.id, amountStr, operation, purpose.trim());
      const opLabel = operation === 'credit' ? 'Зачислено' : 'Списано';
      setSuccess(`${opLabel} ${formatUsdt(amountStr)} USDT. Новый баланс: ${formatUsdt(res.usdt)} USDT`);
      setUser((prev) => (prev ? { ...prev, usdt: res.usdt } : null));
      setAmountUsdt('');
      setPurpose('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка операции');
    } finally {
      setLoading(false);
    }
  };

  // Auth screen
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 w-full max-w-md shadow-lg">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-3xl text-white">payments</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Управление балансами</h1>
            <p className="text-slate-500 mt-2">Введите платёжный пароль для доступа</p>
          </div>
          
          <div className="space-y-4">
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              placeholder="Платёжный пароль"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400"
              autoFocus
            />
            {authError && (
              <p className="text-red-500 text-sm flex items-center gap-2">
                <span className="material-icons-round text-sm">error</span>
                {authError}
              </p>
            )}
            <button
              onClick={handleAuth}
              disabled={authLoading || !authPassword.trim()}
              className="w-full py-3 bg-primary text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {authLoading ? (
                <span className="material-icons-round animate-spin">progress_activity</span>
              ) : (
                <span className="material-icons-round">lock_open</span>
              )}
              {authLoading ? 'Проверка...' : 'Войти'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Зачисление баланса</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-[15px]">
          Найдите пользователя по цифровому ID или Telegram и выполните пополнение или списание USDT.
        </p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-icons-round text-primary text-[22px]">person_search</span>
            Поиск пользователя
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Цифровой ID (7 знаков) или Telegram ID</p>
        </div>
        <div className="p-6">
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(null); setUser(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Например: 1234567 или @username"
              className="flex-1 min-w-[220px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-shadow"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="px-6 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center"
            >
              {searching ? <span className="material-icons-round text-[20px] animate-spin">progress_activity</span> : <span className="material-icons-round text-[20px]">search</span>}
              {searching ? 'Поиск…' : 'Найти'}
            </button>
          </div>
        </div>
      </div>

      {user && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-icons-round text-primary text-[22px]">account_balance_wallet</span>
              Операция с балансом
            </h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Пользователь</p>
                  <Link href={`/admin/users/${user.id}`} className="font-mono text-slate-900 dark:text-white hover:text-primary hover:underline mt-0.5 inline-block">
                    {user.id}
                  </Link>
                  {(user.digitalId || user.telegramUsername) && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                      {user.digitalId && <span>ID: {user.digitalId}</span>}
                      {user.telegramUsername && <span> · @{user.telegramUsername}</span>}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Баланс USDT</p>
                  <p className="text-xl font-bold tabular-nums text-primary mt-0.5">{formatUsdt(user.usdt)}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Тип операции</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 hover:border-primary/40 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" name="op" checked={operation === 'credit'} onChange={() => setOperation('credit')} className="text-primary" />
                  <span className="font-medium text-slate-900 dark:text-white">Пополнение</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 hover:border-primary/40 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" name="op" checked={operation === 'debit'} onChange={() => setOperation('debit')} className="text-primary" />
                  <span className="font-medium text-slate-900 dark:text-white">Списание</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Сумма USDT (до 3 знаков после запятой)</label>
              <input
                type="text"
                value={amountUsdt}
                onChange={(e) => setAmountUsdt(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="0 или 0.001"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Назначение (отобразится в транзакции)</label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Например: возврат, штраф, промо"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                maxLength={128}
              />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !amountUsdt.trim() || parseFloat(amountUsdt.replace(',', '.')) <= 0}
              className="w-full py-4 bg-primary text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:opacity-95 active:scale-[0.99] transition-all"
            >
              {loading ? <span className="material-icons-round text-[22px] animate-spin">progress_activity</span> : <span className="material-icons-round text-[22px]">payments</span>}
              {loading ? 'Выполнение…' : operation === 'credit' ? 'Пополнить баланс' : 'Списать с баланса'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <span className="material-icons-round text-[20px]">error_outline</span>
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-2">
          <span className="material-icons-round text-[20px]">check_circle</span>
          {success}
        </div>
      )}
    </div>
  );
}
