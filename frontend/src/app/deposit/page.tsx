'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getDepositAddress } from '@/lib/api';
import BottomNav from '@/components/BottomNav';

export default function DepositPage() {
  const [data, setData] = useState<{ address: string | null; network: string; digitalId?: string; hint?: string; message?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [showAddressCopyReminder, setShowAddressCopyReminder] = useState(false);
  const [desiredAmount, setDesiredAmount] = useState('');
  const [showWallet, setShowWallet] = useState(false);

  const fetchAddress = useCallback(() => {
    setLoading(true);
    setError(null);
    getDepositAddress()
      .then((res) => {
        setData(res as { address: string | null; network: string; digitalId?: string; hint?: string; message?: string });
        setError(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Не удалось загрузить адрес';
        setData({ address: null, network: 'TRC-20', message: msg });
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAddress();
  }, [fetchAddress]);

  const copyAddress = () => {
    if (!data?.address) return;
    navigator.clipboard.writeText(data.address);
    setCopied(true);
    setShowAddressCopyReminder(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const address = data?.address ?? null;
  const digitalId = data?.digitalId;

  const generateFullAmount = (): string => {
    if (!digitalId) return '';
    const baseAmount = parseFloat(desiredAmount) || 0;
    if (baseAmount <= 0) return '';
    return `${Math.floor(baseAmount)}.${digitalId}`;
  };

  const fullAmount = generateFullAmount();

  const copyFullAmount = () => {
    if (!fullAmount) return;
    navigator.clipboard.writeText(fullAmount);
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const handleContinue = () => {
    if (fullAmount) {
      setShowWallet(true);
    }
  };

  const handleBack = () => {
    setShowWallet(false);
  };

  return (
    <div className="w-full max-w-[430px] bg-white dark:bg-slate-900 min-h-screen shadow-2xl flex flex-col relative overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Пополнить</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 px-6 pt-6 pb-40 overflow-y-auto miniapp-fade-in">
        {!showWallet ? (
          <>
            {/* ——— Шаг 1 из 3: Ввод суммы ——— */}
            <div className="flex items-center gap-2 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-sm font-bold">1</span>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">из 3</span>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 border border-primary/20 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#26A17B]/15 dark:bg-[#26A17B]/25 flex items-center justify-center p-2">
                  <img src="/icons/tether-usdt-logo.png" alt="" className="w-full h-full object-contain" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">Пополнение USDT</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Сеть TRC-20 (Tron)</p>
                </div>
              </div>

              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">
                Введите сумму, которую хотите пополнить (целое число)
              </p>
              <div className="relative">
                <input
                  type="number"
                  value={desiredAmount}
                  onChange={(e) => setDesiredAmount(e.target.value)}
                  placeholder="Например: 50"
                  className="w-full px-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xl font-semibold pr-20 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
                  min="1"
                  step="1"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">USDT</span>
              </div>

              {digitalId && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Ваш цифровой ID: <span className="font-mono font-bold text-primary">{digitalId}</span>
                </p>
              )}

              {/* Пояснение: система сформирует точную сумму с вашим ID — её и нужно будет отправить */}
              {fullAmount && (
                <div className="mt-5 p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-1 font-medium">
                    На следующих шагах вы получите точную сумму для отправки:
                  </p>
                  <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200 font-mono">
                    {fullAmount} USDT
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                    Важно: отправлять нужно именно эту сумму (с цифрами после точки), не округляйте — иначе зачисление не найдёт ваш аккаунт.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleContinue}
                disabled={!fullAmount || loading}
                className="mt-5 w-full py-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    Дальше: скопировать сумму и адрес
                    <span className="material-icons-round text-[20px]">arrow_forward</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                <span className="material-icons-round text-lg mt-0.5 text-primary">info</span>
                <span>Дальше: скопируете точную сумму и адрес кошелька, затем отправите USDT из своего кошелька.</span>
              </p>
            </div>
          </>
        ) : (
          <>
            {/* ——— Шаги 2 и 3: Сумма и адрес ——— */}
            <button
              type="button"
              onClick={handleBack}
              className="mb-4 flex items-center gap-1 text-sm text-primary font-medium"
            >
              <span className="material-icons-round text-[18px]">arrow_back</span>
              Изменить сумму
            </button>

            {loading ? (
              <div className="flex flex-col items-center py-12">
                <div className="w-48 h-48 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <p className="mt-4 text-slate-500">Загрузка…</p>
              </div>
            ) : !address ? (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-[#26A17B]/15 dark:bg-[#26A17B]/25 flex items-center justify-center p-2">
                  <img src="/icons/tether-usdt-logo.png" alt="" className="w-full h-full object-contain" />
                </div>
                <p className="font-medium text-slate-800 dark:text-slate-200">Адрес для пополнения не настроен</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  Обратитесь в поддержку для настройки.
                </p>
                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
                )}
              </div>
            ) : (
              <>
                {/* Краткая памятка: порядок действий */}
                <div className="mb-4 rounded-2xl bg-primary/10 dark:bg-primary/20 border border-primary/30 p-4">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Порядок действий:</p>
                  <ol className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 list-decimal list-inside">
                    <li>Скопируйте <strong>точную сумму</strong> ниже (не округляйте).</li>
                    <li>В своём кошельке укажите эту сумму при отправке.</li>
                    <li>Скопируйте адрес и отправьте USDT (сеть TRC-20).</li>
                  </ol>
                </div>

                {/* Шаг 2 из 3: Сумма к отправке */}
                {fullAmount && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-bold">2</span>
                      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Скопируйте эту сумму и введите её в кошельке</span>
                    </div>
                    <div className="p-5 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700">
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-2 font-medium">
                        Отправьте именно эту сумму — целиком, с цифрами после точки:
                      </p>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-2xl font-bold text-emerald-800 dark:text-emerald-200 font-mono break-all">
                          {fullAmount}
                        </span>
                        <span className="text-sm text-emerald-600 dark:text-emerald-400 shrink-0">USDT</span>
                      </div>
                      <button
                        type="button"
                        onClick={copyFullAmount}
                        className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98]"
                      >
                        <span className="material-icons-round text-[18px]">{copiedAmount ? 'check' : 'content_copy'}</span>
                        {copiedAmount ? 'Скопировано! Вставьте в кошелёк' : 'Копировать сумму'}
                      </button>
                      <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                        Не отправляйте круглую сумму (например 50) — только {fullAmount} USDT.
                      </p>
                    </div>
                  </div>
                )}

                {/* Шаг 3 из 3: Адрес */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-xs font-bold">3</span>
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Адрес для получения (сеть TRC-20)</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 flex flex-col items-center">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Сеть: {data?.network || 'TRC-20'}</p>
                    <div className="w-44 h-44 rounded-2xl bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-600">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(address)}`}
                        alt="QR адреса"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="mt-4 text-xs font-mono text-slate-600 dark:text-slate-400 break-all text-center px-2">
                      {address}
                    </p>
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="mt-3 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl active:scale-[0.98] flex items-center gap-2 text-sm"
                    >
                      <span className="material-icons-round text-[18px]">{copied ? 'check' : 'content_copy'}</span>
                      {copied ? 'Адрес скопирован' : 'Копировать адрес'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 p-4">
                  <p className="text-sm text-red-800 dark:text-red-200 font-medium flex items-start gap-2">
                    <span className="material-icons-round text-lg mt-0.5 shrink-0">warning</span>
                    <span>Только USDT в сети TRC-20. Другие монеты или сеть приведут к потере средств.</span>
                  </p>
                </div>

                <div className="mt-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/50 p-4">
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium flex items-start gap-2">
                    <span className="material-icons-round text-lg mt-0.5 shrink-0">info</span>
                    <span>Сначала укажите в кошельке сумму <strong>{fullAmount}</strong> USDT, затем вставьте адрес и отправьте.</span>
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <BottomNav />

      {/* Попап-напоминание после копирования адреса: отправлять точную сумму */}
      {showAddressCopyReminder && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowAddressCopyReminder(false)}
          role="dialog"
          aria-labelledby="reminder-title"
          aria-modal="true"
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-amber-600 dark:text-amber-400 text-[28px]">info</span>
              </div>
              <h2 id="reminder-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Адрес скопирован
              </h2>
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-sm mb-1">
              Не забудьте: при отправке укажите <strong>точную сумму</strong>:
            </p>
            {fullAmount && (
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono mb-4">
                {fullAmount} USDT
              </p>
            )}
            <p className="text-slate-600 dark:text-slate-400 text-xs mb-5">
              Не округляйте — иначе зачисление не найдёт ваш аккаунт.
            </p>
            <button
              type="button"
              onClick={() => setShowAddressCopyReminder(false)}
              className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
