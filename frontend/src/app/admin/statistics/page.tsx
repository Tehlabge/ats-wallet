'use client';

import { useEffect, useState, useMemo } from 'react';
import { getDetailedStatistics, getAdminRole, DayStatItem } from '@/lib/api';

type Period = 7 | 14 | 30 | 90;

export default function StatisticsPage() {
  const [period, setPeriod] = useState<Period>(30);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    days: DayStatItem[];
    totalPayments: number;
    totalPaymentsSum: number;
    totalWithdrawals: number;
    totalWithdrawalsSum: number;
    totalCommission: number;
  } | null>(null);

  const role = typeof window !== 'undefined' ? getAdminRole() : null;
  const isSuper = role === 'super';

  useEffect(() => {
    if (!isSuper) return;
    setLoading(true);
    getDetailedStatistics(period)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, isSuper]);

  const chartData = useMemo(() => {
    if (!data) return null;
    const maxPayments = Math.max(...data.days.map(d => d.payments), 1);
    const maxWithdrawals = Math.max(...data.days.map(d => d.withdrawals), 1);
    const maxSum = Math.max(...data.days.map(d => d.paymentsSum), 1);
    const maxCommission = Math.max(...data.days.map(d => d.commission), 1);
    return { maxPayments, maxWithdrawals, maxSum, maxCommission };
  }, [data]);

  if (!isSuper) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <span className="material-icons-round text-[48px] text-slate-300 dark:text-slate-600 mb-4 block">lock</span>
          <p className="text-slate-600 dark:text-slate-400">Доступ только для администраторов</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data || !chartData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-600 dark:text-slate-400">Нет данных</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Статистика</h2>
        <div className="flex gap-2">
          {([7, 14, 30, 90] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                period === p
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {p} дней
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon="payments"
          label="Платежей"
          value={data.totalPayments}
          color="emerald"
        />
        <StatCard
          icon="account_balance"
          label="Оборот (USDT)"
          value={data.totalPaymentsSum.toFixed(2)}
          color="blue"
        />
        <StatCard
          icon="request_quote"
          label="Выводов"
          value={data.totalWithdrawals}
          color="orange"
        />
        <StatCard
          icon="savings"
          label="Выведено (USDT)"
          value={data.totalWithdrawalsSum.toFixed(2)}
          color="purple"
        />
        <StatCard
          icon="trending_up"
          label="Комиссия (USDT)"
          value={data.totalCommission.toFixed(2)}
          color="rose"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Количество платежей" icon="payments" color="emerald">
          <div className="h-64 flex items-end gap-1 pt-8">
            {data.days.map((day, i) => {
              const height = (day.payments / chartData.maxPayments) * 100;
              const showLabel = period <= 14 || i % Math.ceil(period / 15) === 0;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full max-w-[40px] bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-lg transition-all hover:from-emerald-600 hover:to-emerald-500 cursor-pointer"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  {showLabel && (
                    <span className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">{formatShortDate(day.date)}</span>
                  )}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                      <p className="font-medium">{formatDate(day.date)}</p>
                      <p>Платежей: {day.payments}</p>
                      <p>Отклонено: {day.paymentsRejected}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard title="Оборот платежей (USDT)" icon="account_balance" color="blue">
          <div className="h-64 flex items-end gap-1 pt-8">
            {data.days.map((day, i) => {
              const height = (day.paymentsSum / chartData.maxSum) * 100;
              const showLabel = period <= 14 || i % Math.ceil(period / 15) === 0;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full max-w-[40px] bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg transition-all hover:from-blue-600 hover:to-blue-500 cursor-pointer"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  {showLabel && (
                    <span className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">{formatShortDate(day.date)}</span>
                  )}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                      <p className="font-medium">{formatDate(day.date)}</p>
                      <p>Сумма: {day.paymentsSum.toFixed(2)} USDT</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard title="Количество выводов" icon="request_quote" color="orange">
          <div className="h-64 flex items-end gap-1 pt-8">
            {data.days.map((day, i) => {
              const height = (day.withdrawals / chartData.maxWithdrawals) * 100;
              const showLabel = period <= 14 || i % Math.ceil(period / 15) === 0;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full max-w-[40px] bg-gradient-to-t from-orange-500 to-amber-400 rounded-t-lg transition-all hover:from-orange-600 hover:to-amber-500 cursor-pointer"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  {showLabel && (
                    <span className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">{formatShortDate(day.date)}</span>
                  )}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                      <p className="font-medium">{formatDate(day.date)}</p>
                      <p>Выводов: {day.withdrawals}</p>
                      <p>Отклонено: {day.withdrawalsRejected}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard title="Комиссия (USDT)" icon="trending_up" color="rose">
          <div className="h-64 flex items-end gap-1 pt-8">
            {data.days.map((day, i) => {
              const height = (day.commission / chartData.maxCommission) * 100;
              const showLabel = period <= 14 || i % Math.ceil(period / 15) === 0;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full max-w-[40px] bg-gradient-to-t from-rose-500 to-pink-400 rounded-t-lg transition-all hover:from-rose-600 hover:to-pink-500 cursor-pointer"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  {showLabel && (
                    <span className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">{formatShortDate(day.date)}</span>
                  )}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                      <p className="font-medium">{formatDate(day.date)}</p>
                      <p>Комиссия: {day.commission.toFixed(2)} USDT</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <span className="material-icons-round text-blue-500">table_chart</span>
          Детальная таблица
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Дата</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Платежей</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Сумма</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Выводов</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Сумма</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Комиссия</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Новых</th>
              </tr>
            </thead>
            <tbody>
              {[...data.days].reverse().map((day) => (
                <tr key={day.date} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{formatDate(day.date)}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-emerald-600 dark:text-emerald-400">{day.payments}</span>
                    {day.paymentsRejected > 0 && (
                      <span className="text-red-500 text-xs ml-1">(-{day.paymentsRejected})</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400">{day.paymentsSum.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-orange-600 dark:text-orange-400">{day.withdrawals}</span>
                    {day.withdrawalsRejected > 0 && (
                      <span className="text-red-500 text-xs ml-1">(-{day.withdrawalsRejected})</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-purple-600 dark:text-purple-400">{day.withdrawalsSum.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">{day.commission.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">{day.newUsers}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
                <td className="py-3 px-4 text-slate-900 dark:text-white">Итого</td>
                <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">{data.totalPayments}</td>
                <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400">{data.totalPaymentsSum.toFixed(2)}</td>
                <td className="py-3 px-4 text-right text-orange-600 dark:text-orange-400">{data.totalWithdrawals}</td>
                <td className="py-3 px-4 text-right text-purple-600 dark:text-purple-400">{data.totalWithdrawalsSum.toFixed(2)}</td>
                <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">{data.totalCommission.toFixed(2)}</td>
                <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  const colorClasses: Record<string, string> = {
    emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/20',
    blue: 'from-blue-500 to-indigo-600 shadow-blue-500/20',
    orange: 'from-orange-500 to-amber-600 shadow-orange-500/20',
    purple: 'from-purple-500 to-violet-600 shadow-purple-500/20',
    rose: 'from-rose-500 to-pink-600 shadow-rose-500/20',
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${colorClasses[color]} shadow-lg`}>
      <div className="relative z-10">
        <span className="material-icons-round text-white/30 text-[40px] absolute -top-1 -right-1">{icon}</span>
        <p className="text-white/80 text-sm mb-1">{label}</p>
        <p className="text-2xl lg:text-3xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  const iconColors: Record<string, string> = {
    emerald: 'text-emerald-500',
    blue: 'text-blue-500',
    orange: 'text-orange-500',
    rose: 'text-rose-500',
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span className={`material-icons-round ${iconColors[color]}`}>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
