'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getWithdrawalRequests,
  approveWithdrawalRequest,
  rejectWithdrawalRequest,
  getUsdtRubRate,
  getWithdrawCommissions,
  type WithdrawalRequestItem,
  type WithdrawFees,
} from '@/lib/api';

const TYPE_LABEL: Record<string, string> = {
  card: 'Карта РФ',
  sbp: 'СБП',
  wallet: 'Внешний кошелёк',
};

export default function AdminWithdrawalsPage() {
  const [list, setList] = useState<WithdrawalRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [usdtRubRate, setUsdtRubRate] = useState<number>(0);
  const [fees, setFees] = useState<WithdrawFees | null>(null);
  const [selectedItem, setSelectedItem] = useState<WithdrawalRequestItem | null>(null);

  const load = () => {
    setLoading(true);
    const status = filter === 'all' ? undefined : filter;
    getWithdrawalRequests(status)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getUsdtRubRate().then((r) => setUsdtRubRate(r.usdtRub)).catch(() => {});
    getWithdrawCommissions().then(setFees).catch(() => {});
  }, [filter]);

  const getCommissionParams = (type: string): { percent: number; fixed: number } => {
    if (!fees) return { percent: 0, fixed: 0 };
    if (type === 'card') return { percent: fees.commissionCardPercent ?? 0, fixed: fees.commissionCardFixed ?? 0 };
    if (type === 'sbp') return { percent: fees.commissionSbpPercent ?? 0, fixed: fees.commissionSbpFixed ?? 0 };
    if (type === 'wallet') return { percent: fees.commissionWalletPercent ?? 0, fixed: fees.commissionWalletFixed ?? 0 };
    return { percent: 0, fixed: 0 };
  };

  const calcCommissionUsdt = (amountUsdt: string, type: string): number => {
    const amount = parseFloat(amountUsdt) || 0;
    const { percent, fixed } = getCommissionParams(type);
    return (amount * percent) / 100 + fixed;
  };

  const calcNetUsdt = (amountUsdt: string, type: string): number => {
    const amount = parseFloat(amountUsdt) || 0;
    const commission = calcCommissionUsdt(amountUsdt, type);
    return Math.max(0, amount - commission);
  };

  const calcRubAmount = (amountUsdt: string, type: string): number => {
    const netUsdt = calcNetUsdt(amountUsdt, type);
    if (usdtRubRate <= 0) return 0;
    return netUsdt * usdtRubRate;
  };

  const handleApprove = async (id: number) => {
    setApprovingId(id);
    try {
      await approveWithdrawalRequest(id);
      load();
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (id: number) => {
    setRejectingId(id);
    try {
      await rejectWithdrawalRequest(id, rejectReason.trim() || undefined);
      setRejectReason('');
      setRejectingId(null);
      load();
    } catch {
      setRejectingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Заявки на вывод</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Одобрение или отклонение заявок на карту, СБП или кошелёк</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['pending', 'all', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${
              filter === f ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {f === 'all' ? 'Все' : f === 'pending' ? 'Ожидают' : f === 'approved' ? 'Одобренные' : 'Отклонённые'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-12 text-center text-slate-500">
          Заявок нет
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="py-3 px-4">Дата</th>
                  <th className="py-3 px-4">Пользователь</th>
                  <th className="py-3 px-4">Сумма</th>
                  <th className="py-3 px-4">Тип</th>
                  <th className="py-3 px-4">Реквизиты</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4 w-40">Действия</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => setSelectedItem(r)}>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('ru-RU')}
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/admin/users/${r.userId}`} className="text-primary hover:underline">
                        {r.digitalId || r.userId.slice(0, 8)}…
                      </Link>
                      {r.telegramUsername && (
                        <span className="text-slate-500 dark:text-slate-400 ml-1">@{r.telegramUsername}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold">{r.amountUsdt} USDT</p>
                      {fees && (
                        <>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            Комиссия: {calcCommissionUsdt(r.amountUsdt, r.type).toFixed(2)} USDT
                          </p>
                          {(r.type === 'card' || r.type === 'sbp') && usdtRubRate > 0 ? (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                              К зачислению: {calcRubAmount(r.amountUsdt, r.type).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
                            </p>
                          ) : r.type === 'wallet' ? (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                              К переводу: {calcNetUsdt(r.amountUsdt, r.type).toFixed(2)} USDT
                            </p>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4">{TYPE_LABEL[r.type] ?? r.type}</td>
                    <td className="py-3 px-4 max-w-[220px]">
                      {r.type === 'card' && r.details.includes(' | ') ? (
                        <div>
                          <p className="font-mono text-xs">{r.details.split(' | ')[0]}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.details.split(' | ')[1]}</p>
                        </div>
                      ) : r.type === 'sbp' && r.details.includes(' | ') ? (
                        <div>
                          <p className="font-mono text-xs">+{r.details.split(' | ')[0]}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span className="material-icons-round text-[12px] align-middle mr-0.5">account_balance</span>
                            {r.details.split(' | ')[1]}
                          </p>
                        </div>
                      ) : r.type === 'sbp' ? (
                        <span className="font-mono text-xs">+{r.details}</span>
                      ) : (
                        <span className="font-mono text-xs truncate block" title={r.details}>{r.details}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          r.status === 'pending'
                            ? 'text-amber-600 dark:text-amber-400'
                            : r.status === 'approved'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {r.status === 'pending' ? 'Ожидает' : r.status === 'approved' ? 'Одобрена' : 'Отклонена'}
                      </span>
                      {r.rejectReason && (
                        <p className="text-xs text-slate-500 mt-0.5 max-w-[200px]" title={r.rejectReason}>
                          {r.rejectReason}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      {r.status === 'pending' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleApprove(r.id); }}
                            disabled={!!approvingId}
                            className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium disabled:opacity-50"
                          >
                            {approvingId === r.id ? '…' : 'Одобрить'}
                          </button>
                          {rejectingId === r.id ? (
                            <div className="flex gap-1 items-center flex-wrap">
                              <input
                                type="text"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Комментарий (причина)"
                                className="min-w-[120px] flex-1 max-w-[180px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleReject(r.id); }}
                                className="px-2 py-1 rounded bg-red-600 text-white text-xs"
                              >
                                Отклонить
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setRejectingId(null); }}
                                className="text-slate-500 text-xs"
                              >
                                Отмена
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setRejectingId(r.id); }}
                              className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-medium"
                            >
                              Отклонить
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модальное окно с подробностями */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedItem(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Заявка #{selectedItem.id}</h2>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
              >
                <span className="material-icons-round text-xl">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Тип</span>
                <span className="font-medium text-slate-900 dark:text-white">{TYPE_LABEL[selectedItem.type] ?? selectedItem.type}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Пользователь</span>
                <Link href={`/admin/users/${selectedItem.userId}`} className="text-primary font-medium">
                  {selectedItem.digitalId || selectedItem.userId.slice(0, 8)}
                </Link>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Сумма запроса</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedItem.amountUsdt} USDT</span>
              </div>

              {fees && (
                <>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Комиссия (удерживается)</p>
                    {(() => {
                      const { percent, fixed } = getCommissionParams(selectedItem.type);
                      const commissionUsdt = calcCommissionUsdt(selectedItem.amountUsdt, selectedItem.type);
                      return (
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Процент</span>
                            <span className="text-slate-900 dark:text-white">{percent}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Фиксированная</span>
                            <span className="text-slate-900 dark:text-white">{fixed} USDT</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-amber-600 dark:text-amber-400 font-medium">Итого комиссия</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">{commissionUsdt.toFixed(2)} USDT</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">
                      {(selectedItem.type === 'card' || selectedItem.type === 'sbp') ? 'К зачислению клиенту (в рублях)' : 'К переводу на кошелёк (USDT)'}
                    </p>
                    {(selectedItem.type === 'card' || selectedItem.type === 'sbp') && usdtRubRate > 0 ? (
                      <>
                        <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                          {calcRubAmount(selectedItem.amountUsdt, selectedItem.type).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
                        </p>
                        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                          {calcNetUsdt(selectedItem.amountUsdt, selectedItem.type).toFixed(2)} USDT × {usdtRubRate.toFixed(2)} ₽/USDT
                        </p>
                      </>
                    ) : (selectedItem.type === 'wallet' || (selectedItem.type !== 'wallet' && usdtRubRate <= 0)) ? (
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {calcNetUsdt(selectedItem.amountUsdt, selectedItem.type).toFixed(2)} USDT
                      </p>
                    ) : null}
                  </div>
                </>
              )}

              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Реквизиты</p>
                {selectedItem.type === 'card' && selectedItem.details.includes(' | ') ? (
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                    <p className="font-mono text-lg tracking-wider">{selectedItem.details.split(' | ')[0]}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{selectedItem.details.split(' | ')[1]}</p>
                  </div>
                ) : selectedItem.type === 'sbp' && selectedItem.details.includes(' | ') ? (
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                    <p className="font-mono text-lg">+{selectedItem.details.split(' | ')[0]}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1">
                      <span className="material-icons-round text-[16px]">account_balance</span>
                      {selectedItem.details.split(' | ')[1]}
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                    <p className="font-mono text-sm break-all">{selectedItem.details}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Дата</span>
                <span>{new Date(selectedItem.createdAt).toLocaleString('ru-RU')}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Статус</span>
                <span className={
                  selectedItem.status === 'pending' ? 'text-amber-600' :
                  selectedItem.status === 'approved' ? 'text-green-600' : 'text-red-600'
                }>
                  {selectedItem.status === 'pending' ? 'Ожидает' : selectedItem.status === 'approved' ? 'Одобрена' : 'Отклонена'}
                </span>
              </div>
            </div>

            {selectedItem.status === 'pending' && (
              <div className="mt-6 space-y-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { handleApprove(selectedItem.id); setSelectedItem(null); }}
                    className="flex-1 py-3 bg-green-600 text-white font-semibold rounded-xl"
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingId(selectedItem.id)}
                    className="flex-1 py-3 border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 font-semibold rounded-xl"
                  >
                    Отклонить
                  </button>
                </div>
                {rejectingId === selectedItem.id && (
                  <div className="flex gap-2 items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Комментарий (причина отклонения)"
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => { handleReject(selectedItem.id); setRejectingId(null); setSelectedItem(null); }}
                      className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium"
                    >
                      Подтвердить отклонение
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectingId(null)}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm"
                    >
                      Отмена
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
