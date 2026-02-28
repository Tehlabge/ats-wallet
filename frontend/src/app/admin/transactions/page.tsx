'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminTransactions, type AdminTransaction } from '@/lib/api';

function txLabel(type: string): string {
  const labels: Record<string, string> = {
    payment: 'Оплата СБП',
    payment_debit: 'Списание (оплата СБП)',
    transfer_in: 'Поступление',
    transfer_out: 'Перевод',
    referral_transfer_in: 'Реферальное зачисление',
    referral_transfer_out: 'Списание с реф. баланса',
    referral_commission: 'Реферальная комиссия',
    deposit: 'Пополнение',
    balance_credit: 'Пополнение баланса',
    balance_debit: 'Списание баланса',
    withdrawal: 'Вывод',
    withdrawal_hold: 'Заявка на вывод',
    withdrawal_refund: 'Возврат',
  };
  return labels[type] ?? type;
}

function statusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    pending: 'В обработке',
    processing: 'В обработке',
    completed: 'Выполнен',
    success: 'Выполнен',
    failed: 'Ошибка',
    cancelled: 'Отменён',
    refunded: 'Возврат',
  };
  return status ? (labels[status] ?? status) : '';
}

export default function AdminTransactionsPage() {
  const [list, setList] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userIdFilter, setUserIdFilter] = useState('');
  const [detailTx, setDetailTx] = useState<AdminTransaction | null>(null);

  const load = () => {
    setLoading(true);
    getAdminTransactions(userIdFilter.trim() ? { userId: userIdFilter.trim() } : undefined)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">История транзакций</h1>
          <p className="text-slate-500 mt-1">Все операции по балансам (пополнения, платежи, переводы)</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={userIdFilter}
          onChange={(e) => setUserIdFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Фильтр по ID пользователя"
          className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-sm"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
        >
          <span className={`material-icons-round text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
          Обновить
        </button>
      </div>

      {loading && list.length === 0 ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-12 text-center text-slate-500">
          Транзакции не найдены
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">ID</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Пользователь</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Тип</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Сумма</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Ref</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-400">Дата</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailTx(t)}
                    onKeyDown={(e) => e.key === 'Enter' && setDetailTx(t)}
                    className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-sm">{t.id}</td>
                    <td className="px-4 py-3">
                      {t.userId ? (
                        <Link href={`/admin/users/${t.userId}`} className="font-mono text-sm text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          {t.userId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{txLabel(t.type)}</td>
                    <td className="px-4 py-3 font-mono">{t.amount} {t.symbol}</td>
                    <td className="px-4 py-3 text-slate-500 text-sm">{t.refId || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-sm">{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                    <td className="px-4 py-3">
                      {t.userId ? (
                        <Link href={`/admin/users/${t.userId}`} className="text-primary hover:underline text-sm" onClick={(e) => e.stopPropagation()}>
                          Профиль
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetailTx(null)}>
          <div className="w-full max-w-[480px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Транзакция #{detailTx.id}</h3>
                <p className="text-sm text-slate-500">{txLabel(detailTx.type)}</p>
              </div>
              <button type="button" onClick={() => setDetailTx(null)} className="p-2 -m-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                <span className="material-icons-round text-[24px]">close</span>
              </button>
            </div>

            {/* Amount highlight */}
            <div className={`p-4 text-center ${parseFloat(detailTx.amount) >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <div className={`text-3xl font-bold tabular-nums ${parseFloat(detailTx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {parseFloat(detailTx.amount) >= 0 ? '+' : ''}{detailTx.amount} {detailTx.symbol}
              </div>
              {detailTx.rateUsdtRub && parseFloat(detailTx.rateUsdtRub) > 0 && (
                <div className="text-sm text-slate-500 mt-1">
                  ≈ {(parseFloat(detailTx.amount) * parseFloat(detailTx.rateUsdtRub)).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
                  <span className="text-xs ml-1">(курс {detailTx.rateUsdtRub})</span>
                </div>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* User info */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="text-xs font-medium text-slate-500 mb-2">Пользователь</div>
                <div className="flex items-center justify-between">
                  <div>
                    {detailTx.userDigitalId && (
                      <div className="text-primary font-mono font-medium">ID: {detailTx.userDigitalId}</div>
                    )}
                    {detailTx.userPhone && (
                      <div className="text-sm text-slate-600 dark:text-slate-400">{detailTx.userPhone}</div>
                    )}
                    {detailTx.userTelegramUsername && (
                      <div className="text-sm text-slate-500">@{detailTx.userTelegramUsername}</div>
                    )}
                    {!detailTx.userDigitalId && !detailTx.userPhone && !detailTx.userTelegramUsername && (
                      <div className="font-mono text-sm text-slate-600">{detailTx.userId ? `${detailTx.userId.slice(0, 12)}...` : '—'}</div>
                    )}
                  </div>
                  {detailTx.userId && (
                    <Link 
                      href={`/admin/users/${detailTx.userId}`} 
                      className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Профиль →
                    </Link>
                  )}
                </div>
              </div>

              {/* Details */}
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-700/50">
                  <dt className="text-slate-500 dark:text-slate-400">Тип операции</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">{txLabel(detailTx.type)}</dd>
                </div>

                {detailTx.status && (
                  <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-700/50">
                    <dt className="text-slate-500 dark:text-slate-400">Статус</dt>
                    <dd className={`font-medium ${
                      detailTx.status === 'completed' || detailTx.status === 'success' ? 'text-green-600' :
                      detailTx.status === 'pending' || detailTx.status === 'processing' ? 'text-amber-600' :
                      detailTx.status === 'failed' || detailTx.status === 'cancelled' ? 'text-red-600' : 'text-slate-700'
                    }`}>
                      {statusLabel(detailTx.status)}
                    </dd>
                  </div>
                )}

                {detailTx.refId && (
                  <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-700/50">
                    <dt className="text-slate-500 dark:text-slate-400">Ref ID</dt>
                    <dd className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all text-right max-w-[200px]">{detailTx.refId}</dd>
                  </div>
                )}

                <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-700/50">
                  <dt className="text-slate-500 dark:text-slate-400">Дата и время</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{new Date(detailTx.createdAt).toLocaleString('ru-RU')}</dd>
                </div>
              </dl>

              {/* Withdrawal details */}
              {(detailTx.type === 'withdrawal_hold' || detailTx.type === 'withdrawal' || detailTx.type === 'withdrawal_refund') && (detailTx.method || detailTx.details) && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">Реквизиты вывода</div>
                  {detailTx.method && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-icons-round text-amber-600 text-[18px]">
                        {detailTx.method === 'card' ? 'credit_card' : detailTx.method === 'sbp' ? 'phone_android' : 'account_balance_wallet'}
                      </span>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {detailTx.method === 'card' ? 'На карту' : detailTx.method === 'sbp' ? 'СБП' : detailTx.method === 'wallet' ? 'На кошелёк' : detailTx.method}
                      </span>
                    </div>
                  )}
                  {detailTx.details && (
                    <div className="font-mono text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 rounded-lg p-2 break-all">
                      {detailTx.details}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
