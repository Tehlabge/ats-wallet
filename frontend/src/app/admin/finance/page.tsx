'use client';

import { useEffect, useState } from 'react';
import { getExtendedFinanceStats, type ExtendedFinanceStats } from '@/lib/api';

type Period = 7 | 14 | 30 | 90;

export default function AdminFinancePage() {
  const [period, setPeriod] = useState<Period>(30);
  const [stats, setStats] = useState<ExtendedFinanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getExtendedFinanceStats(period)
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [period]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-red-700 dark:text-red-300">
        {error || 'Не удалось загрузить данные'}
      </div>
    );
  }

  const formatNum = (n: number, decimals = 2) => n.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const formatRub = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Финансы</h1>
          <p className="text-slate-500 mt-1">Комиссии, обороты и прибыль за {period} дней</p>
        </div>
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
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <span className={`material-icons-round text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      {/* Итоговая прибыль */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 shadow-lg shadow-emerald-500/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-sm font-medium">Общая прибыль (комиссии)</p>
            <p className="text-4xl font-bold text-white mt-1">
              {formatNum(stats.totalCommission)} USDT
            </p>
            <p className="text-emerald-200 text-lg mt-1">
              ≈ {formatRub(stats.totalCommissionRub)} ₽
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
            <span className="material-icons-round text-white text-3xl">trending_up</span>
          </div>
        </div>
        <p className="text-emerald-200 text-xs mt-4">Курс: {stats.usdtRubRate} ₽/USDT</p>
      </div>

      {/* Платежи (Scan) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <span className="material-icons-round text-blue-600 dark:text-blue-400 text-2xl">qr_code_scanner</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Платежи (Scan)</h2>
            <p className="text-sm text-slate-500">Оплата по QR-кодам</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Количество</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.paymentsCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Оборот</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatNum(stats.paymentsTurnover)} USDT</p>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Комиссия</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatNum(stats.paymentsCommission)} USDT</p>
          </div>
        </div>
      </div>

      {/* Выводы по направлениям */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <span className="material-icons-round text-orange-600 dark:text-orange-400 text-2xl">payments</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Выводы</h2>
            <p className="text-sm text-slate-500">Обмен USDT на рубли и вывод на кошельки</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Карта */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary">credit_card</span>
              <span className="font-semibold text-slate-900 dark:text-white">Карта РФ</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Количество:</span>
                <span className="font-medium text-slate-900 dark:text-white">{stats.withdrawCard.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Сумма:</span>
                <span className="font-medium text-slate-900 dark:text-white">{formatNum(stats.withdrawCard.sum)} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">К выплате:</span>
                <span className="font-medium text-purple-600 dark:text-purple-400">{formatRub(stats.withdrawCard.sumRub)} ₽</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Комиссия:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatNum(stats.withdrawCard.commission)} USDT</span>
              </div>
            </div>
          </div>

          {/* СБП */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-emerald-600">phone_android</span>
              <span className="font-semibold text-slate-900 dark:text-white">СБП</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Количество:</span>
                <span className="font-medium text-slate-900 dark:text-white">{stats.withdrawSbp.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Сумма:</span>
                <span className="font-medium text-slate-900 dark:text-white">{formatNum(stats.withdrawSbp.sum)} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">К выплате:</span>
                <span className="font-medium text-purple-600 dark:text-purple-400">{formatRub(stats.withdrawSbp.sumRub)} ₽</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Комиссия:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatNum(stats.withdrawSbp.commission)} USDT</span>
              </div>
            </div>
          </div>

          {/* Внешний кошелёк */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-amber-600">account_balance_wallet</span>
              <span className="font-semibold text-slate-900 dark:text-white">Внешний кошелёк</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Количество:</span>
                <span className="font-medium text-slate-900 dark:text-white">{stats.withdrawWallet.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Сумма:</span>
                <span className="font-medium text-slate-900 dark:text-white">{formatNum(stats.withdrawWallet.sum)} USDT</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Комиссия:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatNum(stats.withdrawWallet.commission)} USDT</span>
              </div>
            </div>
          </div>
        </div>

        {/* Итого выводов */}
        <div className="mt-4 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-orange-700 dark:text-orange-300">Всего выводов: <span className="font-bold">{stats.withdrawTotal.count}</span></p>
              <p className="text-sm text-orange-700 dark:text-orange-300">Сумма: <span className="font-bold">{formatNum(stats.withdrawTotal.sum)} USDT</span></p>
            </div>
            <div className="text-right">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">Комиссия с выводов:</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatNum(stats.withdrawTotal.commission)} USDT</p>
            </div>
          </div>
        </div>
      </div>

      {/* Реферальная программа */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <span className="material-icons-round text-purple-600 dark:text-purple-400 text-2xl">group</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Реферальная программа</h2>
            <p className="text-sm text-slate-500">Выплаты партнёрам</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Новых рефералов</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.referral.newUsersCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">Выплат бонусов</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.referral.bonusCount}</p>
          </div>
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20">
            <p className="text-sm text-red-600 dark:text-red-400">Выплачено</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatNum(stats.referral.bonusSum)} USDT</p>
          </div>
        </div>
      </div>

      {/* Сводка по комиссиям */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Сводка по комиссиям</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-600">
                <th className="py-2 pr-4 text-slate-500 dark:text-slate-400 font-medium">Источник</th>
                <th className="py-2 pr-4 text-right text-slate-500 dark:text-slate-400 font-medium">Операций</th>
                <th className="py-2 pr-4 text-right text-slate-500 dark:text-slate-400 font-medium">Оборот</th>
                <th className="py-2 text-right text-slate-500 dark:text-slate-400 font-medium">Комиссия</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-blue-500 text-[18px]">qr_code_scanner</span>
                    Платежи (Scan)
                  </div>
                </td>
                <td className="py-3 pr-4 text-right">{stats.paymentsCount}</td>
                <td className="py-3 pr-4 text-right">{formatNum(stats.paymentsTurnover)} USDT</td>
                <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatNum(stats.paymentsCommission)} USDT</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-primary text-[18px]">credit_card</span>
                    Вывод на карту
                  </div>
                </td>
                <td className="py-3 pr-4 text-right">{stats.withdrawCard.count}</td>
                <td className="py-3 pr-4 text-right">{formatNum(stats.withdrawCard.sum)} USDT</td>
                <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatNum(stats.withdrawCard.commission)} USDT</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-emerald-500 text-[18px]">phone_android</span>
                    Вывод СБП
                  </div>
                </td>
                <td className="py-3 pr-4 text-right">{stats.withdrawSbp.count}</td>
                <td className="py-3 pr-4 text-right">{formatNum(stats.withdrawSbp.sum)} USDT</td>
                <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatNum(stats.withdrawSbp.commission)} USDT</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-amber-500 text-[18px]">account_balance_wallet</span>
                    Вывод на кошелёк
                  </div>
                </td>
                <td className="py-3 pr-4 text-right">{stats.withdrawWallet.count}</td>
                <td className="py-3 pr-4 text-right">{formatNum(stats.withdrawWallet.sum)} USDT</td>
                <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatNum(stats.withdrawWallet.commission)} USDT</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-red-500 text-[18px]">remove_circle</span>
                    Реферальные выплаты
                  </div>
                </td>
                <td className="py-3 pr-4 text-right">{stats.referral.bonusCount}</td>
                <td className="py-3 pr-4 text-right">—</td>
                <td className="py-3 text-right font-semibold text-red-600 dark:text-red-400">-{formatNum(stats.referral.bonusSum)} USDT</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 dark:bg-emerald-900/20">
                <td className="py-3 pr-4 font-bold text-slate-900 dark:text-white" colSpan={3}>ИТОГО прибыль</td>
                <td className="py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 text-lg">
                  {formatNum(stats.totalCommission - stats.referral.bonusSum)} USDT
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
