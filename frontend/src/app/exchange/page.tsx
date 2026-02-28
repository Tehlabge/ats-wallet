'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { getBalance, getWithdrawFees, createWithdrawalRequest, getPublicUsdtRubRate, type WithdrawFees } from '@/lib/api';
import { playPaySound } from '@/lib/sounds';

type ExchangeType = 'card' | 'sbp';

export default function ExchangePage() {
  const [type, setType] = useState<ExchangeType>('card');
  const [amount, setAmount] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [sbpPhone, setSbpPhone] = useState('');
  const [sbpBank, setSbpBank] = useState('');
  const [sbpFio, setSbpFio] = useState('');
  const [fees, setFees] = useState<WithdrawFees | null>(null);
  const [balanceUsdt, setBalanceUsdt] = useState<string>('0');
  const [usdtRubRate, setUsdtRubRate] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getWithdrawFees().then(setFees).catch(() => setFees(null));
    getBalance().then((b: { usdt?: string }) => setBalanceUsdt(b?.usdt ?? '0')).catch(() => {});
    getPublicUsdtRubRate().then((r) => setUsdtRubRate(r.usdtRub)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const sum = parseFloat(amount.replace(',', '.'));
    if (!sum || sum <= 0) {
      setMessage({ type: 'error', text: 'Укажите сумму' });
      return;
    }
    const minUsdt = 100;
    if (type === 'card' && sum < minUsdt) {
      setMessage({ type: 'error', text: 'Минимальная сумма вывода на карту — 100 USDT' });
      return;
    }
    if (type === 'sbp' && sum < minUsdt) {
      setMessage({ type: 'error', text: 'Минимальная сумма вывода в СБП — 100 USDT' });
      return;
    }
    const balance = parseFloat(balanceUsdt) || 0;
    if (sum > balance) {
      setMessage({ type: 'error', text: 'Недостаточно средств' });
      return;
    }

    if (type === 'card' && !cardNumber.trim()) {
      setMessage({ type: 'error', text: 'Укажите номер карты' });
      return;
    }
    if (type === 'card' && !cardholderName.trim()) {
      setMessage({ type: 'error', text: 'Укажите ФИО владельца карты' });
      return;
    }
    if (type === 'sbp' && !sbpPhone.trim()) {
      setMessage({ type: 'error', text: 'Укажите номер телефона СБП' });
      return;
    }
    if (type === 'sbp' && !sbpBank.trim()) {
      setMessage({ type: 'error', text: 'Укажите банк получателя' });
      return;
    }
    if (type === 'sbp' && !sbpFio.trim()) {
      setMessage({ type: 'error', text: 'Укажите ФИО получателя' });
      return;
    }

    setSubmitting(true);
    try {
      const details = type === 'card' 
        ? `${cardNumber.trim()} | ${cardholderName.trim()}` 
        : `${sbpPhone.trim()} | ${sbpBank.trim()} | ${sbpFio.trim()}`;
      await createWithdrawalRequest(amount.replace(',', '.'), type, details);
      playPaySound();
      setMessage({ type: 'ok', text: 'Заявка принята. Ожидайте обработки.' });
      setAmount('');
      setCardNumber('');
      setCardholderName('');
      setSbpPhone('');
      setSbpBank('');
      setSbpFio('');
      getBalance().then((b: { usdt?: string }) => setBalanceUsdt(b?.usdt ?? '0')).catch(() => {});
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка отправки. Попробуйте позже.' });
    } finally {
      setSubmitting(false);
    }
  };

  const sum = parseFloat(amount.replace(',', '.')) || 0;
  const balanceNum = parseFloat(balanceUsdt) || 0;
  const minUsdt = 100;
  const belowMinCard = type === 'card' && sum > 0 && sum < minUsdt;
  const belowMinSbp = type === 'sbp' && sum > 0 && sum < minUsdt;
  const aboveBalance = sum > 0 && sum > balanceNum;
  const percent = type === 'card' ? (fees?.commissionCardPercent ?? 0) : (fees?.commissionSbpPercent ?? 0);
  const fixed = type === 'card' ? (fees?.commissionCardFixed ?? 0) : (fees?.commissionSbpFixed ?? 0);
  const commission = (sum * percent) / 100 + fixed;
  const receive = Math.max(0, sum - commission);
  const hasCommission = percent > 0 || fixed > 0;

  return (
    <div className="w-full max-w-[430px] bg-white dark:bg-slate-900 min-h-screen shadow-2xl flex flex-col relative overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Обмен на рубли</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 px-4 pt-6 pb-40 overflow-y-auto">
        {/* Balance card */}
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/5 border border-primary/20 p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Доступно для обмена</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {Number(balanceUsdt).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 4 })} USDT
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-primary">currency_exchange</span>
            </div>
          </div>
        </div>

        {/* Type selector */}
        <div className="mb-6">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Куда получить рубли</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType('card')}
              className={`relative rounded-2xl border-2 p-4 text-left transition-all overflow-hidden ${
                type === 'card'
                  ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/5'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {type === 'card' && (
                <div className="absolute top-2 right-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                </div>
              )}
              <span className={`material-symbols-outlined text-[32px] block mb-2 ${type === 'card' ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}>
                credit_card
              </span>
              <span className={`font-semibold text-sm block ${type === 'card' ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>
                Карта РФ
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">По номеру карты</span>
            </button>

            <button
              type="button"
              onClick={() => setType('sbp')}
              className={`relative rounded-2xl border-2 p-4 text-left transition-all overflow-hidden ${
                type === 'sbp'
                  ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-emerald-50/30 dark:from-emerald-900/30 dark:to-emerald-900/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {type === 'sbp' && (
                <div className="absolute top-2 right-2">
                  <span className="material-symbols-outlined text-emerald-500 text-[20px]">check_circle</span>
                </div>
              )}
              <span className={`material-symbols-outlined text-[32px] block mb-2 ${type === 'sbp' ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'}`}>
                phone_android
              </span>
              <span className={`font-semibold text-sm block ${type === 'sbp' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                СБП
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">По номеру телефона</span>
            </button>
          </div>
        </div>

        {/* Commission info */}
        {hasCommission && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/40 p-3.5 mb-5 flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-500 text-[20px] mt-0.5">info</span>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Комиссия: {percent > 0 && `${percent}%`}{percent > 0 && fixed > 0 && ' + '}{fixed > 0 && `${fixed} USDT`}
              </p>
              {sum > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  С {sum.toFixed(2)} USDT удержим {commission.toFixed(2)} USDT
                </p>
              )}
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
                    : belowMinCard || belowMinSbp
                      ? 'border-amber-400 dark:border-amber-500'
                      : 'border-slate-200 dark:border-slate-600'
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">USDT</span>
            </div>
            {belowMinCard && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">info</span>
                Минимальная сумма вывода на карту — {minUsdt} USDT
              </p>
            )}
            {belowMinSbp && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">info</span>
                Минимальная сумма вывода в СБП — {minUsdt} USDT
              </p>
            )}
            {aboveBalance && (
              <p className="text-sm text-red-500 mt-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">error</span>
                Недостаточно средств. Доступно: {Number(balanceUsdt).toLocaleString('ru-RU', { maximumFractionDigits: 4 })} USDT
              </p>
            )}
            {sum > 0 && sum <= balanceNum && !belowMinCard && !belowMinSbp && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  К обмену: <span className="font-semibold">{receive.toFixed(2)} USDT</span>
                  {hasCommission && <span className="text-xs text-emerald-600 dark:text-emerald-400">(после комиссии)</span>}
                </p>
                {usdtRubRate > 0 && (
                  <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200 mt-1">
                    ≈ {(receive * usdtRubRate).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₽
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Card details */}
          {type === 'card' && (
            <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-800 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-primary">credit_card</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Банковская карта</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Только карты РФ. Мин. сумма 100 USDT</p>
                </div>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Номер карты</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={cardNumber.replace(/(\d{4})(?=\d)/g, '$1 ')}
                onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tracking-wider placeholder:text-slate-400 text-lg"
              />
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 mt-4">ФИО владельца карты</label>
              <input
                type="text"
                placeholder="Иванов Иван Иванович"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
          )}

          {/* SBP details */}
          {type === 'sbp' && (
            <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-900/10 dark:to-slate-800 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-emerald-600 dark:text-emerald-400">phone_android</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">СБП</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Система быстрых платежей. Мин. 100 USDT</p>
                </div>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Номер телефона</label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="+7 900 123 45 67"
                value={sbpPhone}
                onChange={(e) => setSbpPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-lg mb-4"
              />
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Банк получателя</label>
              <input
                type="text"
                value={sbpBank}
                onChange={(e) => setSbpBank(e.target.value)}
                placeholder="Например: Сбербанк, Тинькофф"
                className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-lg placeholder:text-slate-400 mb-4"
              />
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">ФИО получателя</label>
              <input
                type="text"
                value={sbpFio}
                onChange={(e) => setSbpFio(e.target.value)}
                placeholder="Иванов Иван Иванович"
                className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
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
              type === 'card' 
                ? 'bg-primary text-white shadow-primary/20' 
                : 'bg-emerald-500 text-white shadow-emerald-500/20'
            }`}
          >
            {submitting ? (
              <>
                <span className="material-icons-round animate-spin text-[20px]">progress_activity</span>
                Отправка заявки…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[22px]">currency_exchange</span>
                Обменять USDT на рубли
              </>
            )}
          </button>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
