'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { getTransactions } from '@/lib/api';
import { vibrateLight } from '@/lib/vibrate';
import BottomNav from '@/components/BottomNav';
import { HistoryListSkeleton } from '@/components/Skeleton';

interface Tx {
  id: string;
  type: string;
  amount: string;
  symbol?: string;
  currency?: string;
  status?: string;
  createdAt: string;
  meta?: Record<string, unknown>;
  /** Метод вывода: card | sbp | wallet (для withdrawal_hold, withdrawal_refund) */
  method?: string;
  /** Реквизиты: номер карты, СБП или адрес кошелька */
  details?: string;
  /** Причина отклонения (для rejected платежей/выводов) */
  rejectReason?: string;
  /** ID в блокчейне (хэш транзакции TRON и т.д.) или refId с бэкенда */
  refId?: string;
  /** Сеть (TRC-20, ERC-20 и т.д.) — из meta или по умолчанию для deposit */
  network?: string;
}

const TRONSCAN_TX_URL = 'https://tronscan.org/#/transaction/';

/** Является ли строка хэшем транзакции TRON (64 hex-символа) */
function isTronTxHash(s: string | undefined): boolean {
  if (!s || s.length !== 64) return false;
  return /^[a-fA-F0-9]+$/.test(s);
}

function getTxNetwork(tx: Tx): string {
  const fromMeta = tx.meta?.network ?? tx.network;
  if (typeof fromMeta === 'string') return fromMeta;
  if (tx.type === 'deposit' || tx.type === 'balance_credit') return 'TRC-20';
  return '';
}

function getTxHashForExplorer(tx: Tx): string | null {
  const hash = (tx.meta?.txHash ?? tx.meta?.txId ?? tx.refId) as string | undefined;
  if (hash && isTronTxHash(hash)) return hash;
  if (typeof hash === 'string' && hash.length === 64 && /^[a-fA-F0-9]+$/.test(hash)) return hash;
  return null;
}

/** Нормализованный метод вывода: card | sbp | wallet (для иконок и подписей) */
function getWithdrawMethod(tx: Tx): 'card' | 'sbp' | 'wallet' | undefined {
  const raw = (tx.method ?? tx.meta?.method ?? tx.meta?.withdrawMethod) as string | undefined;
  if (!raw || typeof raw !== 'string') return undefined;
  const lower = raw.toLowerCase();
  if (lower === 'card' || lower === 'карта') return 'card';
  if (lower === 'sbp' || lower === 'сбп') return 'sbp';
  if (lower === 'wallet' || lower === 'кошелёк' || lower === 'кошелек') return 'wallet';
  return undefined;
}

const IN_TYPES = new Set(['transfer_in', 'referral_transfer_in', 'deposit', 'balance_credit']);
function isIncoming(tx: Tx): boolean {
  if (IN_TYPES.has(tx.type)) return true;
  const num = Number(tx.amount);
  return !Number.isNaN(num) && num > 0;
}

type Filter = 'all' | 'in' | 'out';

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
    withdraw: 'Вывод',
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
    confirmed: 'Выполнен',
    approved: 'Выполнен',
    failed: 'Ошибка',
    cancelled: 'Отменён',
    rejected: 'Отклонён',
    refunded: 'Возврат',
  };
  return status ? (labels[status] ?? status) : '';
}

function getStatusColor(status: string | undefined): { bg: string; text: string; border: string } {
  if (!status) return { bg: '', text: '', border: '' };
  switch (status) {
    case 'pending':
    case 'processing':
      return { bg: 'bg-amber-50/40 dark:bg-amber-950/15', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200/30 dark:border-amber-700/25' };
    case 'completed':
    case 'success':
      return { bg: 'bg-emerald-50/40 dark:bg-emerald-950/15', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200/30 dark:border-emerald-700/25' };
    case 'failed':
    case 'cancelled':
      return { bg: 'bg-red-50/40 dark:bg-red-950/15', text: 'text-red-600 dark:text-red-400', border: 'border-red-200/30 dark:border-red-700/25' };
    case 'refunded':
      return { bg: 'bg-blue-50/40 dark:bg-blue-950/15', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200/30 dark:border-blue-700/25' };
    default:
      return { bg: 'bg-slate-50/80 dark:bg-slate-800/40', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200/30 dark:border-slate-700/25' };
  }
}

export default function HistoryPage() {
  const [list, setList] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [detailTx, setDetailTx] = useState<Tx | null>(null);

  useEffect(() => {
    getTransactions()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return list;
    if (filter === 'in') return list.filter(isIncoming);
    return list.filter((tx) => !isIncoming(tx));
  }, [list, filter]);

  return (
    <div className="w-full max-w-[430px] bg-white dark:bg-slate-900 min-h-screen shadow-2xl flex flex-col mx-auto">
      {loading && <div className="loading-bar bg-primary/10" role="progressbar" aria-label="Загрузка" />}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">История транзакций</h1>
        <div className="w-10 shrink-0" />
      </header>
      <main className="flex-1 px-6 py-6 pb-40 overflow-y-auto">
        {!loading && list.length > 0 && (
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${filter === 'all' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400'}`}
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setFilter('in')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${filter === 'in' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}`}
            >
              Поступления
            </button>
            <button
              type="button"
              onClick={() => setFilter('out')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${filter === 'out' ? 'bg-rose-500 text-white' : 'bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'}`}
            >
              Списания
            </button>
          </div>
        )}
        {loading ? (
          <HistoryListSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-slate-400">
            <span className="material-icons-round text-5xl mb-2">history</span>
            <p className="text-sm font-medium">
              {list.length === 0 ? 'Транзакций пока нет' : 'Нет транзакций по выбранному фильтру'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3 miniapp-stagger">
            {filtered.map((tx) => {
              const incoming = isIncoming(tx);
              const currency = tx.symbol ?? tx.currency ?? 'USDT';
              const amountNum = Number(tx.amount);
              const amountDisplay = Number.isNaN(amountNum) ? tx.amount : Math.abs(amountNum).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
              const statusColors = getStatusColor(tx.status);
              const hasStatus = tx.status && tx.status !== 'completed' && tx.status !== 'success';
              
              return (
              <li
                key={tx.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    vibrateLight();
                    setDetailTx(tx);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (vibrateLight(), setDetailTx(tx))}
                  className={`relative overflow-hidden rounded-2xl border cursor-pointer active:scale-[0.99] transition-all duration-200 ${
                    hasStatus
                      ? `${statusColors.bg} ${statusColors.border}`
                      : incoming
                        ? 'bg-gradient-to-r from-emerald-50/30 to-white dark:from-emerald-950/15 dark:to-slate-900 border-emerald-200/30 dark:border-emerald-800/25'
                        : 'bg-gradient-to-r from-rose-50/30 to-white dark:from-rose-950/15 dark:to-slate-900 border-rose-200/30 dark:border-rose-800/25'
                  }`}
                >
                  {/* Status indicator bar */}
                  {hasStatus && (
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                      tx.status === 'pending' || tx.status === 'processing' ? 'bg-amber-400' :
                      tx.status === 'failed' || tx.status === 'cancelled' ? 'bg-red-400' : 'bg-blue-400'
                    }`} />
                  )}
                  
                  <div className="p-4 pl-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden ${
                          hasStatus && (tx.status === 'pending' || tx.status === 'processing')
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                            : (tx.type === 'deposit' || tx.type === 'balance_credit')
                              ? 'bg-[#26A17B]/20 dark:bg-[#26A17B]/30 p-1.5'
                              : incoming
                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                        }`}>
                          {(tx.type === 'deposit' || tx.type === 'balance_credit') ? (
                            <img src="/icons/tether-usdt-logo.png" alt="USDT" className="w-full h-full object-contain" />
                          ) : (
                            <span className="material-symbols-outlined text-xl">
                              {hasStatus && (tx.status === 'pending' || tx.status === 'processing')
                                ? 'schedule'
                                : incoming
                                  ? 'arrow_downward'
                                  : getWithdrawMethod(tx) === 'card'
                                    ? 'credit_card'
                                    : getWithdrawMethod(tx) === 'sbp'
                                      ? 'smartphone'
                                      : 'arrow_upward'}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white text-[15px] truncate">{txLabel(tx.type)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {new Date(tx.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {tx.status && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                tx.status === 'pending' || tx.status === 'processing'
                                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                                  : tx.status === 'completed' || tx.status === 'success'
                                    ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                                    : tx.status === 'failed' || tx.status === 'cancelled'
                                      ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}>
                                {statusLabel(tx.status)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className={`text-right shrink-0 font-bold tabular-nums ${
                        hasStatus && (tx.status === 'pending' || tx.status === 'processing')
                          ? 'text-amber-600 dark:text-amber-400'
                          : incoming
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        <span className="block text-[17px] leading-tight">{incoming ? '+' : '−'}{amountDisplay}</span>
                        <span className="block text-xs font-medium opacity-80 mt-0.5">{currency}</span>
                      </div>
                    </div>
                    
                    {/* Куда вывод: метод и реквизиты */}
                    {(tx.type === 'withdrawal_hold' || tx.type === 'withdrawal' || tx.type === 'withdraw') && (
                      <div className="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/30 space-y-1">
                        {getWithdrawMethod(tx) && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px]">
                              {getWithdrawMethod(tx) === 'card' ? 'credit_card' : getWithdrawMethod(tx) === 'sbp' ? 'smartphone' : 'account_balance_wallet'}
                            </span>
                            {getWithdrawMethod(tx) === 'card' ? 'Карта' : getWithdrawMethod(tx) === 'sbp' ? 'СБП' : getWithdrawMethod(tx) === 'wallet' ? 'Кошелёк' : tx.method ?? '—'}
                          </p>
                        )}
                        {tx.details && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 font-mono break-all">Куда: {tx.details}</p>
                        )}
                      </div>
                    )}
                    
                    {/* Reject reason */}
                    {tx.rejectReason && (tx.status === 'rejected' || tx.status === 'cancelled' || tx.status === 'failed') && (
                      <div className="mt-2 pt-2 border-t border-red-200/50 dark:border-red-900/30">
                        <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                          <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">info</span>
                          <span className="line-clamp-2">{tx.rejectReason}</span>
                  </p>
                </div>
                    )}
                  </div>
              </li>
              );
            })}
          </ul>
        )}

        {detailTx && (() => {
          const incoming = isIncoming(detailTx);
          const statusColors = getStatusColor(detailTx.status);
          const amountNum = Number(detailTx.amount);
          const amountDisplay = Number.isNaN(amountNum) ? detailTx.amount : Math.abs(amountNum).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
          
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setDetailTx(null)}>
              <div 
                className="w-full max-w-[420px] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-history-modal" 
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header with amount — без декора, чище */}
                <div className={`relative p-6 pt-14 pb-5 text-center ${
                  detailTx.status === 'pending' || detailTx.status === 'processing'
                    ? 'bg-slate-50 dark:bg-slate-800/50'
                    : incoming
                      ? 'bg-slate-50 dark:bg-slate-800/50'
                      : 'bg-slate-50 dark:bg-slate-800/50'
                }`}>
                  <button 
                    type="button" 
                    onClick={() => setDetailTx(null)} 
                    className="absolute right-4 top-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    aria-label="Закрыть"
                  >
                    <span className="material-icons-round text-[20px]">close</span>
                  </button>
                  
                  <div className="relative z-10">
                  <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center shadow-lg mb-3 overflow-hidden p-2 ${
                    detailTx.status === 'pending' || detailTx.status === 'processing'
                      ? 'bg-amber-500 text-white'
                      : (detailTx.type === 'deposit' || detailTx.type === 'balance_credit')
                        ? 'bg-[#26A17B]/20 dark:bg-[#26A17B]/30'
                        : incoming
                          ? 'bg-emerald-500 text-white'
                          : 'bg-rose-500 text-white'
                  }`}>
                    {(detailTx.type === 'deposit' || detailTx.type === 'balance_credit') ? (
                      <img src="/icons/tether-usdt-logo.png" alt="USDT" className="w-full h-full object-contain" />
                    ) : (
                      <span className="material-symbols-outlined text-2xl">
                        {detailTx.status === 'pending' || detailTx.status === 'processing'
                          ? 'schedule'
                          : incoming ? 'arrow_downward' : 'arrow_upward'}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">{txLabel(detailTx.type)}</p>
                  <p className={`text-3xl font-bold tabular-nums ${
                    detailTx.status === 'pending' || detailTx.status === 'processing'
                      ? 'text-amber-600 dark:text-amber-400'
                      : incoming
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {incoming ? '+' : '−'}{amountDisplay}
                    <span className="text-lg ml-1 opacity-80">{detailTx.symbol ?? detailTx.currency ?? 'USDT'}</span>
                  </p>
                  
                  {detailTx.status && (
                    <span className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      detailTx.status === 'pending' || detailTx.status === 'processing'
                        ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                        : detailTx.status === 'completed' || detailTx.status === 'success'
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                          : detailTx.status === 'failed' || detailTx.status === 'cancelled'
                            ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      <span className="material-symbols-outlined text-[14px]">
                        {detailTx.status === 'pending' || detailTx.status === 'processing' ? 'hourglass_empty' :
                         detailTx.status === 'completed' || detailTx.status === 'success' ? 'check_circle' :
                         detailTx.status === 'failed' || detailTx.status === 'cancelled' ? 'cancel' : 'info'}
                      </span>
                      {statusLabel(detailTx.status)}
                    </span>
                  )}
                  </div>
                </div>
                
                {/* Details */}
                <div className="p-6 space-y-4">
                  <div className="space-y-3">
                    {(detailTx.type === 'withdrawal_hold' || detailTx.type === 'withdrawal' || detailTx.type === 'withdraw' || detailTx.type === 'withdrawal_refund') && getWithdrawMethod(detailTx) && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          {getWithdrawMethod(detailTx) === 'card' ? (
                            <span className="material-symbols-outlined text-[18px]">credit_card</span>
                          ) : getWithdrawMethod(detailTx) === 'sbp' ? (
                            <span className="material-symbols-outlined text-[18px]">smartphone</span>
                          ) : (
                            <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                          )}
                          <span className="text-sm">Метод</span>
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {getWithdrawMethod(detailTx) === 'card' ? 'Карта РФ' : getWithdrawMethod(detailTx) === 'sbp' ? 'СБП' : getWithdrawMethod(detailTx) === 'wallet' ? 'Внешний кошелёк' : detailTx.method ?? '—'}
                        </span>
                      </div>
                    )}
                    {detailTx.details && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                          {(detailTx.type === 'withdrawal_hold' || detailTx.type === 'withdrawal' || detailTx.type === 'withdraw')
                            ? (getWithdrawMethod(detailTx) === 'wallet' ? 'На какой кошелёк / адрес' : 'Реквизиты (карта, СБП или счёт)')
                            : 'Реквизиты'}
                        </p>
                        <p className="font-mono text-sm text-slate-900 dark:text-white break-all">{detailTx.details}</p>
                      </div>
                    )}
                    {(detailTx.type === 'payment_debit' || detailTx.type === 'payment') && detailTx.meta && (detailTx.meta.sumRub != null || detailTx.meta.comment != null) && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                        {detailTx.meta.sumRub != null && (
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Сумма в рублях</p>
                            <p className="font-medium text-slate-900 dark:text-white">{String(detailTx.meta.sumRub)} ₽</p>
                          </div>
                        )}
                        {detailTx.meta.comment != null && detailTx.meta.comment !== '' && (
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Комментарий</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{String(detailTx.meta.comment)}</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                        <span className="text-sm">Дата</span>
                      </div>
                      <span className="font-medium text-slate-900 dark:text-white text-sm">
                        {new Date(detailTx.createdAt).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    
                    {(getTxNetwork(detailTx) || getTxHashForExplorer(detailTx)) && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                        {getTxNetwork(detailTx) && (
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Сеть</p>
                            <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">{getTxNetwork(detailTx)}</p>
                          </div>
                        )}
                        {getTxHashForExplorer(detailTx) ? (
                          <a
                            href={TRONSCAN_TX_URL + getTxHashForExplorer(detailTx)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                          >
                            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                            Смотреть в TronScan
                          </a>
                        ) : (
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">ID операции</p>
                            <p className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all">{detailTx.id}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {!getTxNetwork(detailTx) && !getTxHashForExplorer(detailTx) && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">ID операции</p>
                        <p className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all">{detailTx.id}</p>
                      </div>
                    )}
                    
                    {detailTx.rejectReason && (detailTx.status === 'rejected' || detailTx.status === 'cancelled' || detailTx.status === 'failed') && (
                      <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
                        <div className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0 mt-0.5">error</span>
                          <div>
                            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Комментарий (причина отклонения)</p>
                            <p className="text-sm text-red-600 dark:text-red-400">{detailTx.rejectReason}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {detailTx.meta && Object.keys(detailTx.meta).length > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Дополнительно</p>
                        <p className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all">
                          {JSON.stringify(detailTx.meta, null, 2)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </main>
      <BottomNav />
    </div>
  );
}
