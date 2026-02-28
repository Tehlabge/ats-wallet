'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { walletManagerAuth, getAdminHeaders } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function DepositSettingsPage() {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Settings
  const [masterWallet, setMasterWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      await walletManagerAuth(authPassword);
      setIsAuthenticated(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Неверный пароль');
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      fetch(`${API}/admin/deposit-settings`, { headers: getAdminHeaders() })
        .then(res => res.json())
        .then(data => {
          setMasterWallet(data.masterDepositWallet || '');
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isAuthenticated]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    
    try {
      const res = await fetch(`${API}/admin/deposit-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ masterDepositWallet: masterWallet.trim() }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Ошибка ${res.status}`);
      }
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  // Auth screen
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-8 w-full max-w-md shadow-sm hover:shadow-md transition-shadow">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-3xl text-white">settings</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Настройки депозитов</h1>
            <p className="text-slate-500 mt-2">Введите платёжный пароль для доступа</p>
          </div>
          
          <form onSubmit={handleAuth}>
            {authError && (
              <div className="p-3 mb-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {authError}
              </div>
            )}
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white mb-4"
              placeholder="Платёжный пароль"
              autoFocus
            />
            <button
              type="submit"
              disabled={authLoading || !authPassword}
              className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {authLoading ? 'Проверка...' : 'Войти'}
            </button>
          </form>
          
          <Link href="/admin/wallets" className="block mt-4 text-center text-sm text-primary hover:underline">
            ← К транзакциям
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-20">
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <Link href="/admin/wallets" className="text-primary">
          <span className="material-icons-round">arrow_back</span>
        </Link>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Настройки депозитов</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        {loading ? (
          <div className="text-center py-8 text-slate-500">Загрузка...</div>
        ) : (
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Мастер-кошелёк для депозитов</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Все пополнения USDT (TRC-20) принимаются на этот адрес. Пользователи добавляют свой Digital ID к сумме для идентификации.
            </p>
            
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Адрес кошелька (TRC-20)
            </label>
            <input
              type="text"
              value={masterWallet}
              onChange={(e) => setMasterWallet(e.target.value)}
              placeholder="T..."
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
            />
            
            {error && (
              <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            {saveSuccess && (
              <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm flex items-center gap-2">
                <span className="material-icons-round text-lg">check_circle</span>
                Настройки сохранены
              </div>
            )}
            
            <button
              type="submit"
              disabled={saving}
              className="mt-4 w-full px-4 py-3 bg-primary text-white font-semibold rounded-xl disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">Как это работает</h3>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary">1.</span>
                  Пользователь вводит сумму пополнения
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">2.</span>
                  Система добавляет его Digital ID после точки (напр. 50.1234)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">3.</span>
                  Бэкенд сканирует транзакции и по ID определяет пользователя
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">4.</span>
                  Баланс автоматически зачисляется
                </li>
              </ul>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
