'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { getBalance, getWithdrawFees, transferToAtsWallet, createWithdrawalRequest, type WithdrawFees } from '@/lib/api';
import { playPaySound } from '@/lib/sounds';

type WithdrawType = 'wallet' | 'ats';

export default function WithdrawPage() {
  const [type, setType] = useState<WithdrawType>('wallet');
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [atsRecipientId, setAtsRecipientId] = useState('');
  const [fees, setFees] = useState<WithdrawFees | null>(null);
  const [balanceUsdt, setBalanceUsdt] = useState<string>('0');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getWithdrawFees().then(setFees).catch(() => setFees(null));
    getBalance().then((b: { usdt?: string }) => setBalanceUsdt(b?.usdt ?? '0')).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const sum = parseFloat(amount.replace(',', '.'));
    if (!sum || sum <= 0) {
      setMessage({ type: 'error', text: 'Укажите сумму' });
      return;
    }
    if (type === 'wallet' && sum < 100) {
      setMessage({ type: 'error', text: 'Минимальная сумма вывода на внешний кошелёк — 100 USDT' });
      return;
    }
    const balance = parseFloat(balanceUsdt) || 0;
    if (sum > balance) {
      setMessage({ type: 'error', text: 'Недостаточно средств' });
      return;
    }

    if (type === 'ats') {
      const id = atsRecipientId.trim().replace(/\D/g, '');
      if (id.length !== 4) {
        setMessage({ type: 'error', text: 'Укажите 4-значный ID получателя' });
        return;
      }
      setSubmitting(true);
      try {
        await transferToAtsWallet(id, sum);
        playPaySound();
        setMessage({ type: 'ok', text: 'Перевод выполнен.' });
        setAmount('');
        setAtsRecipientId('');
        getBalance().then((b: { usdt?: string }) => setBalanceUsdt(b?.usdt ?? '0')).catch(() => {});
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка перевода' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (type === 'wallet' && !walletAddress.trim()) {
      setMessage({ type: 'error', text: 'Укажите адрес кошелька' });
      return;
    }

    // Проверяем что сумма больше фиксированной комиссии
    if (type === 'wallet' && fees) {
      const fixedFee = fees.commissionWalletFixed ?? 0;
      if (fixedFee > 0 && sum <= fixedFee) {
        setMessage({ type: 'error', text: `Минимальная сумма вывода: ${(fixedFee + 0.01).toFixed(2)} USDT` });
        return;
      }
    }

    setSubmitting(true);
    try {
      await createWithdrawalRequest(amount.replace(',', '.'), type, walletAddress.trim());
      playPaySound();
      setMessage({ type: 'ok', text: 'Заявка принята. Ожидайте обработки.' });
      setAmount('');
      setWalletAddress('');
      getBalance().then((b: { usdt?: string }) => setBalanceUsdt(b?.usdt ?? '0')).catch(() => {});
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка отправки. Попробуйте позже.' });
    } finally {
      setSubmitting(false);
    }
  };

  const sum = parseFloat(amount.replace(',', '.')) || 0;
  const balanceNum = parseFloat(balanceUsdt) || 0;
  const minWallet = 100;
  const belowMinWallet = type === 'wallet' && sum > 0 && sum < minWallet;
  const aboveBalance = sum > 0 && sum > balanceNum;
  const percent = type === 'wallet' ? (fees?.commissionWalletPercent ?? 0) : 0;
  const fixed = type === 'wallet' ? (fees?.commissionWalletFixed ?? 0) : 0;
  const commission = (sum * percent) / 100 + fixed;
  const receive = type === 'ats' ? sum : Math.max(0, sum - commission);
  const hasCommission = type !== 'ats' && (percent > 0 || fixed > 0);

  return (
    <div className="w-full max-w-[430px] bg-white dark:bg-slate-900 min-h-screen shadow-2xl flex flex-col relative overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Вывести USDT</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 px-4 pt-6 pb-40 overflow-y-auto">
        {/* Balance card */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-100 to-white dark:from-slate-800/70 dark:to-slate-800/30 border border-slate-200 dark:border-slate-700 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Доступно для вывода</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {Number(balanceUsdt).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 4 })} USDT
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-slate-200/50 dark:bg-slate-700/50 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-slate-600 dark:text-slate-300">account_balance_wallet</span>
            </div>
          </div>
        </div>

        {/* Redirect to exchange for ruble withdrawals */}
        <Link 
          href="/exchange"
          className="flex items-center gap-4 p-4 mb-6 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/60 dark:border-amber-700/40 hover:border-amber-300 dark:hover:border-amber-600 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <span className="material-symbols-outlined text-white text-2xl">currency_exchange</span>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900 dark:text-white">Нужны рубли?</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Обменяйте USDT на рубли и получите на карту или СБП</p>
          </div>
          <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">arrow_forward</span>
        </Link>

        {/* Type selector */}
        <div className="mb-6">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Способ вывода</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType('wallet')}
              className={`relative rounded-2xl border-2 p-4 text-left transition-all overflow-hidden ${
                type === 'wallet'
                  ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/5'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {type === 'wallet' && (
                <div className="absolute top-2 right-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                </div>
              )}
              <span className={`material-symbols-outlined text-[32px] block mb-2 ${type === 'wallet' ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
                account_balance_wallet
              </span>
              <span className={`font-semibold text-sm block ${type === 'wallet' ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>
                Другой кошелёк
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">TRC-20 USDT</span>
            </button>

            <button
              type="button"
              onClick={() => setType('ats')}
              className={`relative rounded-2xl border-2 p-4 text-left transition-all overflow-hidden ${
                type === 'ats'
                  ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-emerald-50/30 dark:from-emerald-900/30 dark:to-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {type === 'ats' && (
                <div className="absolute top-2 right-2">
                  <span className="material-symbols-outlined text-emerald-500 text-[20px]">check_circle</span>
                </div>
              )}
              <span className={`material-symbols-outlined text-[32px] block mb-2 ${type === 'ats' ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}`}>
                person
              </span>
              <span className={`font-semibold text-sm block ${type === 'ats' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                ATS WALLET
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">По ID получателя</span>
            </button>
          </div>
        </div>

        {/* Commission info */}
        {hasCommission && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40 p-3.5 mb-5 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-500 text-[20px] mt-0.5">info</span>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Комиссия сети: {percent > 0 && `${percent}%`}{percent > 0 && fixed > 0 && ' + '}{fixed > 0 && `${fixed} USDT`}
              </p>
              {sum > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  С {sum.toFixed(2)} USDT удержим {commission.toFixed(2)} USDT
                </p>
              )}
            </div>
          </div>
        )}

        {type === 'ats' && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/40 p-3.5 mb-5 flex items-start gap-3">
            <span className="material-symbols-outlined text-emerald-500 text-[20px] mt-0.5">bolt</span>
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                Без комиссии
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                Мгновенный перевод между пользователями ATS WALLET
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Amount input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Сумма USDT</label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                className={`w-full px-4 py-4 pr-16 rounded-2xl border-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-xl font-semibold ${
                  aboveBalance
                    ? 'border-red-400 dark:border-red-500'
                    : belowMinWallet
                      ? 'border-amber-400 dark:border-amber-500'
                      : 'border-slate-200 dark:border-slate-600'
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">USDT</span>
            </div>
            {belowMinWallet && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">info</span>
                Минимальная сумма вывода на внешний кошелёк — {minWallet} USDT
              </p>
            )}
            {aboveBalance && (
              <p className="text-sm text-red-500 mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">error</span>
                Недостаточно средств. Доступно: {Number(balanceUsdt).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} USDT
              </p>
            )}
            {type === 'wallet' && sum > 0 && sum <= balanceNum && !belowMinWallet && hasCommission && (
              <p className="text-sm text-slate-500 mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                К получению: <span className="font-semibold text-slate-700 dark:text-slate-300">{receive.toFixed(2)} USDT</span>
              </p>
            )}
          </div>

          {type === 'wallet' && (
            <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-800 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-primary">account_balance_wallet</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Внешний кошелёк</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">TRON (TRC-20). Мин. сумма 100 USDT</p>
                </div>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Адрес кошелька</label>
              <input
                type="text"
                placeholder="T..."
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value.trim())}
                className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-500 mt-2">Убедитесь, что адрес поддерживает USDT TRC-20</p>
            </div>
          )}

          {type === 'ats' && (
            <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-900/10 dark:to-slate-800 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-emerald-600 dark:text-emerald-400">person</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">ATS WALLET</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Перевод по ID пользователя</p>
                </div>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">ID получателя</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Цифровой ID из профиля получателя"
                value={atsRecipientId}
                onChange={(e) => setAtsRecipientId(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-lg placeholder:text-slate-400 placeholder:text-sm placeholder:font-normal"
              />
            </div>
          )}

          {message && (
            <div className={`p-4 rounded-xl flex items-start gap-3 ${
              message.type === 'ok' 
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' 
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <span className={`material-symbols-outlined text-[20px] ${message.type === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>
                {message.type === 'ok' ? 'check_circle' : 'error'}
              </span>
              <p className={`text-sm font-medium ${message.type === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {message.text}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-4 font-bold rounded-2xl active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg transition-all ${
              type === 'ats' 
                ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                : 'bg-primary text-white shadow-primary/20'
            }`}
          >
            {submitting ? (
              <>
                <span className="material-icons-round animate-spin text-[20px]">progress_activity</span>
                {type === 'ats' ? 'Перевод…' : 'Отправка заявки…'}
              </>
            ) : type === 'ats' ? (
              <>
                <span className="material-symbols-outlined text-[22px]">send</span>
                Перевести мгновенно
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[22px]">arrow_outward</span>
                Вывести USDT
              </>
            )}
          </button>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
