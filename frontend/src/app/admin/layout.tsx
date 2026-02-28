'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { getAdminToken, getAdminRole, getPendingPayments, getPendingWithdrawals } from '@/lib/api';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jakarta',
  display: 'swap',
});

function playNewPaymentSound() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // ignore
  }
}

interface MenuItem {
  id: string;
  href: string;
  icon: string;
  label: string;
  superOnly: boolean;
  category: string;
  keywords?: string[];
  color?: string;
}

const ALL_MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', href: '/admin', icon: 'dashboard', label: 'Дашборд', superOnly: false, category: 'overview', keywords: ['главная'], color: 'from-violet-500 to-purple-600' },
  { id: 'statistics', href: '/admin/statistics', icon: 'bar_chart', label: 'Статистика', superOnly: true, category: 'overview', keywords: ['графики', 'аналитика'], color: 'from-blue-500 to-cyan-600' },
  { id: 'payments', href: '/admin/payments', icon: 'payments', label: 'Платежи', superOnly: false, category: 'sales', keywords: ['оплата', 'qr', 'сбп'], color: 'from-emerald-500 to-teal-600' },
  { id: 'payments-archive', href: '/admin/payments/archive', icon: 'archive', label: 'Архив платежей', superOnly: true, category: 'sales', keywords: ['история'], color: 'from-slate-500 to-slate-600' },
  { id: 'withdrawals', href: '/admin/withdrawals', icon: 'request_quote', label: 'Заявки на вывод', superOnly: false, category: 'sales', keywords: ['вывод', 'карта'], color: 'from-orange-500 to-amber-600' },
  { id: 'wallets', href: '/admin/wallets', icon: 'account_balance_wallet', label: 'Пополнения', superOnly: true, category: 'sales', keywords: ['депозит', 'пул'], color: 'from-cyan-500 to-blue-600' },
  { id: 'users', href: '/admin/users', icon: 'group', label: 'Пользователи', superOnly: false, category: 'customers', keywords: ['клиенты', 'баланс'], color: 'from-sky-500 to-blue-600' },
  { id: 'referrals', href: '/admin/referrals', icon: 'groups', label: 'Рефералы', superOnly: true, category: 'customers', keywords: ['реферальная'], color: 'from-purple-500 to-violet-600' },
  { id: 'bonuses', href: '/admin/bonuses', icon: 'account_balance_wallet', label: 'Операции с балансом', superOnly: true, category: 'customers', keywords: ['начисление', 'списание'], color: 'from-amber-500 to-orange-600' },
  { id: 'wallet-manager', href: '/admin/wallet-manager', icon: 'key', label: 'Экспорт ключей', superOnly: true, category: 'customers', keywords: ['seed', 'ключ'], color: 'from-teal-500 to-emerald-600' },
  { id: 'finance', href: '/admin/finance', icon: 'trending_up', label: 'Финансы', superOnly: true, category: 'reports', keywords: ['оборот', 'комиссия'], color: 'from-green-500 to-emerald-600' },
  { id: 'transactions', href: '/admin/transactions', icon: 'history', label: 'История транзакций', superOnly: true, category: 'reports', keywords: ['операции'], color: 'from-blue-500 to-indigo-600' },
  { id: 'news', href: '/admin/news', icon: 'newspaper', label: 'Новости', superOnly: true, category: 'content', keywords: ['объявления'], color: 'from-indigo-500 to-violet-600' },
  { id: 'telegram-bot', href: '/admin/telegram-bot', icon: 'smart_toy', label: 'Telegram бот', superOnly: true, category: 'integrations', keywords: ['бот', 'старт'], color: 'from-[#2AABEE] to-[#229ED9]' },
  { id: 'support', href: '/admin/support', icon: 'support_agent', label: 'Техподдержка', superOnly: true, category: 'integrations', keywords: ['поддержка', 'вебхук'], color: 'from-teal-500 to-cyan-600' },
  { id: 'settings', href: '/admin/settings', icon: 'settings', label: 'Настройки', superOnly: true, category: 'settings', keywords: ['курс', 'комиссия'], color: 'from-slate-500 to-zinc-600' },
  { id: 'notifications', href: '/admin/notifications', icon: 'notifications_active', label: 'Уведомления', superOnly: true, category: 'settings', keywords: ['telegram', 'шаблоны', 'уведомления'], color: 'from-rose-500 to-pink-600' },
  { id: 'operators', href: '/admin/operators', icon: 'admin_panel_settings', label: 'Операторы', superOnly: true, category: 'settings', keywords: ['админы'], color: 'from-cyan-500 to-teal-600' },
  { id: 'sessions', href: '/admin/sessions', icon: 'devices', label: 'Сессии', superOnly: true, category: 'settings', keywords: ['входы'], color: 'from-rose-500 to-pink-600' },
  { id: 'log', href: '/admin/log', icon: 'description', label: 'Лог', superOnly: true, category: 'settings', keywords: ['логи'], color: 'from-amber-500 to-orange-600' },
];

const CATEGORIES = [
  { id: 'overview', label: 'Обзор', icon: 'space_dashboard', gradient: 'from-violet-500/20 to-purple-500/10' },
  { id: 'sales', label: 'Сделки и платежи', icon: 'payments', gradient: 'from-emerald-500/20 to-teal-500/10' },
  { id: 'customers', label: 'Клиенты', icon: 'people', gradient: 'from-sky-500/20 to-blue-500/10' },
  { id: 'reports', label: 'Финансы и отчёты', icon: 'insights', gradient: 'from-blue-500/20 to-indigo-500/10' },
  { id: 'content', label: 'Контент', icon: 'article', gradient: 'from-indigo-500/20 to-violet-500/10' },
  { id: 'integrations', label: 'Интеграции', icon: 'link', gradient: 'from-teal-500/20 to-cyan-500/10' },
  { id: 'settings', label: 'Настройки', icon: 'tune', gradient: 'from-slate-500/20 to-zinc-500/10' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);
  const [pendingWithdrawalsCount, setPendingWithdrawalsCount] = useState(0);
  const [newPaymentToast, setNewPaymentToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['overview', 'sales']));
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const pendingCountRef = useRef<number | null>(null);
  const isLoginPage = pathname === '/admin/login';
  const role = typeof window !== 'undefined' ? getAdminRole() : null;
  const menuItems = useMemo(
    () => (role === 'operator' ? ALL_MENU_ITEMS.filter((m) => !m.superOnly) : ALL_MENU_ITEMS),
    [role]
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return menuItems;
    const q = searchQuery.toLowerCase();
    return menuItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [menuItems, searchQuery]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  useEffect(() => {
    setCurrentTime(new Date());
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = getAdminToken();
    if (!isLoginPage && !token) {
      router.replace('/admin/login');
    }
    setChecked(true);
  }, [isLoginPage, router]);

  useEffect(() => {
    if (isLoginPage || !getAdminToken()) return;
    const fetchCounts = () => {
      getPendingPayments().then((list) => setPendingPaymentsCount(list.length)).catch(() => {});
      getPendingWithdrawals().then((list) => setPendingWithdrawalsCount(list.length)).catch(() => {});
    };
    fetchCounts();
    const t = setInterval(fetchCounts, 30000);
    return () => clearInterval(t);
  }, [isLoginPage]);

  useEffect(() => {
    if (isLoginPage || !getAdminToken()) return;
    const poll = () => {
      getPendingPayments()
        .then((list) => {
          const count = list.length;
          if (pendingCountRef.current === null) {
            pendingCountRef.current = count;
            return;
          }
          if (count > pendingCountRef.current) {
            if (typeof window !== 'undefined' && localStorage.getItem('ats_admin_notify_new_payment') !== '0') {
              setNewPaymentToast(count - pendingCountRef.current === 1 ? 'Новый платёж!' : `Новых платежей: ${count - pendingCountRef.current}`);
            }
            if (typeof window !== 'undefined' && localStorage.getItem('ats_admin_sound_new_payment') !== '0') {
              playNewPaymentSound();
            }
          }
          pendingCountRef.current = count;
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [isLoginPage]);

  useEffect(() => {
    if (!newPaymentToast) return;
    const t = setTimeout(() => setNewPaymentToast(null), 6000);
    return () => clearTimeout(t);
  }, [newPaymentToast]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ats_admin_token');
      localStorage.removeItem('ats_admin_role');
      router.replace('/admin/login');
    }
  };

  if (isLoginPage) {
    return <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 ${jakarta.variable} font-admin`}>{children}</div>;
  }

  if (!checked) {
    return (
      <div className={`min-h-screen bg-slate-100 dark:bg-slate-950 flex ${jakarta.variable} font-admin`}>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-slate-400 dark:text-slate-500 text-sm animate-pulse">Проверка...</span>
        </div>
      </div>
    );
  }

  const getBadgeForItem = (itemId: string): number => {
    if (itemId === 'payments') return pendingPaymentsCount;
    if (itemId === 'withdrawals') return pendingWithdrawalsCount;
    return 0;
  };

  return (
    <div className={`min-h-screen bg-[#f1f5f9] dark:bg-[#0c1222] flex ${jakarta.variable} font-admin`}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 lg:hidden transition-opacity duration-200"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[280px] flex flex-col transition-[transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } bg-white/90 dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200/80 dark:border-slate-800/80 shadow-xl lg:shadow-none`}
      >
        <div className="px-5 py-6 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary via-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/25 ring-2 ring-white/20 dark:ring-slate-800/50">
              <span className="text-white font-bold text-xl tracking-tight">A</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-white text-base tracking-tight">ATS WALLET</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse ring-2 ring-emerald-500/30" />
                {role === 'super' ? 'Администратор' : 'Оператор'}
              </p>
            </div>
          </div>
          {currentTime && (
            <div className="mt-5 p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
              <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
                {currentTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 capitalize">
                {currentTime.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="relative group">
            <span className="material-icons-round text-[20px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors pointer-events-none">search</span>
            <input
              type="text"
              placeholder="Поиск по меню..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-white dark:focus:bg-slate-800 border border-transparent focus:border-primary/30 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
              >
                <span className="material-icons-round text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 overflow-y-auto overflow-x-hidden space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
          {searchQuery ? (
            filteredItems.length === 0 ? (
              <div className="text-center py-10">
                <span className="material-icons-round text-[48px] text-slate-300 dark:text-slate-600 mb-2 block">search_off</span>
                <p className="text-sm text-slate-500">Ничего не найдено</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredItems.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                  const badge = getBadgeForItem(item.id);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => { setSidebarOpen(false); setSearchQuery(''); }}
                      className={`group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? `bg-gradient-to-r ${item.color || 'from-primary to-blue-600'} text-white shadow-md shadow-primary/20`
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className={`material-icons-round text-[22px] ${isActive ? '' : 'group-hover:scale-105 transition-transform'}`}>{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {badge > 0 && (
                        <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${
                          isActive ? 'bg-white/25' : 'bg-red-500 text-white'
                        }`}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )
          ) : (
            CATEGORIES.map((cat) => {
              const categoryItems = menuItems.filter((m) => m.category === cat.id);
              if (categoryItems.length === 0) return null;
              const isExpanded = expandedCategories.has(cat.id);
              const hasActiveItem = categoryItems.some(
                (item) => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
              );
              const totalBadges = categoryItems.reduce((sum, item) => sum + getBadgeForItem(item.id), 0);

              return (
                <div key={cat.id} className="py-0.5">
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-semibold uppercase tracking-wider transition-all duration-200 ${
                      hasActiveItem
                        ? 'text-primary bg-primary/10 dark:bg-primary/15'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="material-icons-round text-[18px]">{cat.icon}</span>
                    <span className="flex-1 text-left">{cat.label}</span>
                    {!isExpanded && totalBadges > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center">
                        {totalBadges > 99 ? '99+' : totalBadges}
                      </span>
                    )}
                    <span className={`material-icons-round text-[18px] transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                      expand_more
                    </span>
                  </button>
                  <div className={`overflow-hidden transition-all duration-200 ease-out ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="mt-1 ml-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-0.5">
                      {categoryItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                        const badge = getBadgeForItem(item.id);
                        return (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={`group flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                              isActive
                                ? `bg-gradient-to-r ${item.color || 'from-primary to-blue-600'} text-white shadow-md shadow-primary/20`
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <span className={`material-icons-round text-[20px] ${isActive ? '' : 'group-hover:scale-105 transition-transform'}`}>{item.icon}</span>
                            <span className="flex-1">{item.label}</span>
                            {badge > 0 && (
                              <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${
                                isActive ? 'bg-white/25' : 'bg-red-500 text-white'
                              }`}>
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </nav>

        <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/60">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-200 group"
          >
            <span className="material-icons-round text-[22px] group-hover:translate-x-0.5 transition-transform">logout</span>
            Выйти из системы
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 lg:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 px-4 lg:px-8 flex items-center gap-4 sticky top-0 z-30 shadow-sm dark:shadow-none">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2.5 -ml-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-icons-round text-[24px]">menu</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {menuItems.find((m) => pathname === m.href || (m.href !== '/admin' && pathname.startsWith(m.href)))?.label || 'Админ-панель'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {(pendingPaymentsCount > 0 || pendingWithdrawalsCount > 0) && (
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200/80 dark:border-amber-500/30">
                <span className="material-icons-round text-[18px] text-amber-600 dark:text-amber-400">pending_actions</span>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {pendingPaymentsCount + pendingWithdrawalsCount} в ожидании
                </span>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">{children}</main>

        {newPaymentToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-[90vw] animate-fade-in-up">
            <Link
              href="/admin/payments"
              className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-primary text-white shadow-xl shadow-primary/35 font-semibold text-[15px] hover:shadow-2xl hover:shadow-primary/40 transition-shadow"
            >
              <span className="material-icons-round text-[28px]">payments</span>
              {newPaymentToast}
              <span className="material-icons-round text-[22px]">chevron_right</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
