'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// URL для входа — с этой страницы всегда шлём на Next.js API route
const LOGIN_URL = '/api/admin-login';

export default function AdminLoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.message || data.error || 'Неверный логин или пароль').trim());
        return;
      }
      const token = data?.token;
      const role = data?.role;
      if (token && typeof window !== 'undefined') {
        localStorage.setItem('ats_admin_token', token);
        localStorage.setItem('ats_admin_role', role === 'operator' ? 'operator' : 'super');
      }
      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white dark:bg-slate-800/95 rounded-3xl shadow-2xl shadow-slate-200/50 dark:shadow-black/30 p-8 border border-slate-200/80 dark:border-slate-700/80 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5 dark:from-primary/10 dark:to-blue-500/10 pointer-events-none rounded-3xl" />
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/25">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <h1 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-1">Вход в админ-панель</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-8">
            Логин и пароль администратора
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Логин"
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
              required
              autoComplete="username"
              disabled={loading}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
              required
              autoComplete="current-password"
              disabled={loading}
            />
            {error && (
              <p className="text-red-500 dark:text-red-400 text-sm px-1">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors shadow-lg shadow-primary/25"
            >
              {loading ? 'Вход…' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
