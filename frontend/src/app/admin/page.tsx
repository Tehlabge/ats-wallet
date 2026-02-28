'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminStats, getPendingPayments, getAdminTransactions, getAdminRole, getOperatorStats, getAdminDashboardStats, getOperatorCalendarStats, getPublicSettings, type AdminTransaction, type CalendarDayItem } from '@/lib/api';

interface Stats {
  usersCount: number;
  pendingCount: number;
  paymentsToday: number;
  totalPaymentsConfirmed: number;
}

interface OperatorStats {
  paymentsToday: number;
  paymentsTotal: number;
  withdrawalsToday: number;
  withdrawalsTotal: number;
  paymentsSumUsdtToday: number;
  withdrawalsSumUsdtToday: number;
}

interface DashboardStats {
  usersCount: number;
  usersToday: number;
  pendingPayments: number;
  confirmedPaymentsToday: number;
  confirmedPaymentsTotal: number;
  paymentsSumUsdtToday: number;
  paymentsSumUsdtTotal: number;
  pendingWithdrawals: number;
  approvedWithdrawalsToday: number;
  approvedWithdrawalsTotal: number;
  withdrawalsSumUsdtToday: number;
  withdrawalsSumUsdtTotal: number;
  operatorsToday: Array<{ adminId: number; login: string; payments: number; withdrawals: number }>;
}

interface CalendarStats {
  month: string;
  daysInMonth: number;
  days: CalendarDayItem[];
  totalPayments: number;
  totalWithdrawals: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [operatorStats, setOperatorStats] = useState<OperatorStats | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [calendarStats, setCalendarStats] = useState<CalendarStats | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [adminVersion, setAdminVersion] = useState('—');
  const isSuper = getAdminRole() === 'super';

  useEffect(() => {
    getPublicSettings().then((s) => setAdminVersion(s.appVersion || '—')).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getAdminStats().catch(() => null),
      getPendingPayments().catch(() => []),
      isSuper ? getAdminTransactions().catch(() => []) : Promise.resolve([]),
      getOperatorStats().catch(() => null),
      isSuper ? getAdminDashboardStats().catch(() => null) : Promise.resolve(null),
      getOperatorCalendarStats(calendarMonth).catch(() => null),
    ])
      .then(([s, pending, txs, opStats, dashStats, calStats]) => {
        setStats(s);
        setPendingCount(pending.length);
        setTransactions(Array.isArray(txs) ? txs.slice(0, 15) : []);
        setOperatorStats(opStats);
        setDashboardStats(dashStats);
        setCalendarStats(calStats);
      })
      .finally(() => setLoading(false));
  }, [isSuper, calendarMonth]);

  const changeMonth = (delta: number) => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCalendarMonth(d.toISOString().slice(0, 7));
  };

  const statCards = [
    ...(isSuper ? [{ label: 'Пользователей', value: stats?.usersCount ?? 0, icon: 'group', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' as const }] : []),
    { label: 'Ожидают оплаты', value: pendingCount, icon: 'hourglass_top', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', href: '/admin/payments' },
    { label: 'Платежей сегодня', value: stats?.paymentsToday ?? 0, icon: 'today', color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
    { label: 'Всего подтверждено', value: stats?.totalPaymentsConfirmed ?? 0, icon: 'check_circle', color: 'text-primary bg-primary/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {pendingCount > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-5 text-white shadow-xl shadow-amber-500/25 border border-amber-400/20">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="material-icons-round text-[28px]">payments</span>
              </div>
              <div>
                <p className="font-bold text-lg">{pendingCount} платеж{pendingCount === 1 ? '' : pendingCount < 5 ? 'а' : 'ей'} ожида{pendingCount === 1 ? 'ет' : 'ют'}</p>
                <p className="text-white/80 text-sm">Требуется подтверждение</p>
              </div>
            </div>
            <Link
              href="/admin/payments"
              className="px-5 py-2.5 bg-white text-amber-600 font-bold rounded-xl hover:bg-white/90 transition-colors"
            >
              Открыть
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const content = (
            <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-5 hover:shadow-xl hover:border-slate-300/50 dark:hover:border-slate-700/80 transition-all duration-300">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">{card.label}</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {loading ? '—' : card.value.toLocaleString('ru-RU')}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.color}`}>
                  <span className="material-icons-round text-[22px]">{card.icon}</span>
                </div>
              </div>
            </div>
          );

          return card.href ? (
            <Link key={card.label} href={card.href} className="animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>{content}</Link>
          ) : (
            <div key={card.label} className="animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>{content}</div>
          );
        })}
      </div>

      {operatorStats && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Моя статистика за сегодня</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{operatorStats.paymentsToday}</p>
              <p className="text-sm text-slate-500">Платежей</p>
            </div>
            <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/30">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{operatorStats.withdrawalsToday}</p>
              <p className="text-sm text-slate-500">Выводов</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{operatorStats.paymentsTotal}</p>
              <p className="text-sm text-slate-500">Всего платежей</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{operatorStats.withdrawalsTotal}</p>
              <p className="text-sm text-slate-500">Всего выводов</p>
            </div>
          </div>
        </div>
      )}

      {calendarStats && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-icons-round text-primary">calendar_month</span>
              Календарь активности
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeMonth(-1)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="material-icons-round text-slate-600 dark:text-slate-400">chevron_left</span>
              </button>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 min-w-[120px] text-center">
                {new Date(calendarStats.month + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => changeMonth(1)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                disabled={calendarMonth >= new Date().toISOString().slice(0, 7)}
              >
                <span className={`material-icons-round ${calendarMonth >= new Date().toISOString().slice(0, 7) ? 'text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-400'}`}>chevron_right</span>
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {(() => {
              const [y, m] = calendarStats.month.split('-').map(Number);
              const firstDay = new Date(y, m - 1, 1).getDay();
              const offset = firstDay === 0 ? 6 : firstDay - 1;
              const today = new Date();
              const isCurrentMonth = y === today.getFullYear() && m === today.getMonth() + 1;
              
              const cells = [];
              for (let i = 0; i < offset; i++) {
                cells.push(<div key={`empty-${i}`} className="aspect-square" />);
              }
              
              for (let day = 1; day <= calendarStats.daysInMonth; day++) {
                const dayData = calendarStats.days.find((d) => d.day === day);
                const total = (dayData?.payments || 0) + (dayData?.withdrawals || 0);
                const isToday = isCurrentMonth && day === today.getDate();
                
                let bgColor = 'bg-slate-50 dark:bg-slate-800/50';
                if (total > 0) {
                  if (total >= 10) bgColor = 'bg-emerald-500 dark:bg-emerald-600';
                  else if (total >= 5) bgColor = 'bg-emerald-400 dark:bg-emerald-500';
                  else if (total >= 2) bgColor = 'bg-emerald-300 dark:bg-emerald-700';
                  else bgColor = 'bg-emerald-200 dark:bg-emerald-800';
                }
                
                cells.push(
                  <div
                    key={day}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center relative group cursor-default ${bgColor} ${isToday ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                  >
                    <span className={`text-sm font-medium ${total > 4 ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{day}</span>
                    {total > 0 && (
                      <>
                        <span className={`text-[10px] ${total > 4 ? 'text-white/80' : 'text-slate-500'}`}>{total}</span>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                          <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                            <p className="font-medium">{day} {new Date(calendarStats.month + '-01').toLocaleDateString('ru-RU', { month: 'long' })}</p>
                            <p>Платежей: {dayData?.payments || 0}</p>
                            <p>Выводов: {dayData?.withdrawals || 0}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              }
              
              return cells;
            })()}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-emerald-200 dark:bg-emerald-800" />
                <span className="text-slate-500">1</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-emerald-300 dark:bg-emerald-700" />
                <span className="text-slate-500">2-4</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-emerald-400 dark:bg-emerald-500" />
                <span className="text-slate-500">5-9</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-emerald-500 dark:bg-emerald-600" />
                <span className="text-slate-500">10+</span>
              </div>
            </div>
            <div className="text-slate-600 dark:text-slate-400">
              Итого: <span className="font-semibold text-emerald-600">{calendarStats.totalPayments}</span> платежей, <span className="font-semibold text-orange-600">{calendarStats.totalWithdrawals}</span> выводов
            </div>
          </div>
        </div>
      )}

      {isSuper && dashboardStats && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Общая статистика</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <p className="text-2xl font-bold text-blue-600">{dashboardStats.usersCount}</p>
              <p className="text-sm text-slate-500">Пользователей</p>
              <p className="text-xs text-slate-400">+{dashboardStats.usersToday} сегодня</p>
            </div>
            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20">
              <p className="text-2xl font-bold text-green-600">{dashboardStats.paymentsSumUsdtToday.toFixed(2)}</p>
              <p className="text-sm text-slate-500">USDT сегодня</p>
              <p className="text-xs text-slate-400">{dashboardStats.confirmedPaymentsToday} платежей</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <p className="text-2xl font-bold text-amber-600">{dashboardStats.withdrawalsSumUsdtToday.toFixed(2)}</p>
              <p className="text-sm text-slate-500">Выводы сегодня</p>
              <p className="text-xs text-slate-400">{dashboardStats.approvedWithdrawalsToday} заявок</p>
            </div>
            <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20">
              <p className="text-2xl font-bold text-purple-600">{dashboardStats.paymentsSumUsdtTotal.toFixed(2)}</p>
              <p className="text-sm text-slate-500">USDT всего</p>
              <p className="text-xs text-slate-400">{dashboardStats.confirmedPaymentsTotal} платежей</p>
            </div>
          </div>
          {dashboardStats.operatorsToday.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Активность операторов сегодня</p>
              <div className="space-y-2">
                {dashboardStats.operatorsToday.map((op) => (
                  <div key={op.adminId} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <span className="font-medium text-slate-900 dark:text-white">{op.login || `ID ${op.adminId}`}</span>
                    <div className="flex gap-4 text-slate-600 dark:text-slate-400">
                      <span>{op.payments} платежей</span>
                      <span>{op.withdrawals} выводов</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Быстрые действия</h2>
          <div className="space-y-2">
            <Link
              href="/admin/payments"
              className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="material-icons-round text-primary text-[20px]">payments</span>
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Управление платежами</p>
                <p className="text-sm text-slate-500">Подтверждение и отклонение</p>
              </div>
              <span className="material-icons-round text-slate-400 ml-auto">chevron_right</span>
            </Link>
            {isSuper && (
              <Link
                href="/admin/users"
                className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors active:scale-[0.99]"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <span className="material-icons-round text-blue-600 text-[20px]">group</span>
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">Пользователи</p>
                  <p className="text-sm text-slate-500">Балансы и комиссии</p>
                </div>
                <span className="material-icons-round text-slate-400 ml-auto">chevron_right</span>
              </Link>
            )}
          </div>
        </div>

        {isSuper && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Последние транзакции (курс на момент операции)</h2>
          {transactions.length === 0 ? (
            <p className="text-slate-500 text-sm">Нет транзакций</p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 px-2">Тип</th>
                    <th className="py-2 px-2">Сумма</th>
                    <th className="py-2 px-2">Курс USDT/RUB</th>
                    <th className="py-2 px-2">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 px-2 font-medium">{t.type === 'deposit' ? 'Пополнение' : t.type === 'payment' ? 'Платёж СБП' : t.type}</td>
                      <td className="py-2 px-2">{t.amount} {t.symbol}</td>
                      <td className="py-2 px-2 text-slate-600 dark:text-slate-400">{t.rateUsdtRub || '—'}</td>
                      <td className="py-2 px-2 text-slate-500 text-xs">{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Система</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-slate-600 dark:text-slate-400">Статус бэкенда</span>
              <span className="flex items-center gap-2 text-green-600">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Онлайн
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-slate-600 dark:text-slate-400">Версия</span>
              <span className="text-slate-900 dark:text-white font-mono text-sm">{adminVersion}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-slate-600 dark:text-slate-400">База данных</span>
              <span className="text-slate-900 dark:text-white text-sm">MySQL 8.0</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
