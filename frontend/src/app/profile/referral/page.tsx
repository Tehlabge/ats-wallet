'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { getReferralStats, getMe, referralTransferToMain } from '@/lib/api';

type InvDay = { date: string; count: number };
type CommDay = { date: string; amountUsdt: number };

function BarChartInvitations({ data }: { data: InvDay[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-1">
      {data.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">Нет данных за последние 30 дней</p>
      ) : (
        data.slice(-14).map((d) => (
          <div key={d.date} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-20 shrink-0">
              {new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
            </span>
            <div className="flex-1 h-6 bg-slate-100 dark:bg-neutral-800 rounded overflow-hidden flex">
              <div
                className="h-full bg-primary rounded min-w-[2px] transition-all"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 w-6 text-right">{d.count}</span>
          </div>
        ))
      )}
    </div>
  );
}

function BarChartCommissions({ data }: { data: CommDay[] }) {
  const max = Math.max(0.01, ...data.map((d) => d.amountUsdt));
  return (
    <div className="space-y-1">
      {data.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">Нет данных за последние 30 дней</p>
      ) : (
        data.slice(-14).map((d) => (
          <div key={d.date} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 w-20 shrink-0">
              {new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
            </span>
            <div className="flex-1 h-6 bg-slate-100 dark:bg-neutral-800 rounded overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 rounded min-w-[2px] transition-all"
                style={{ width: `${(d.amountUsdt / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 w-14 text-right">
              {d.amountUsdt.toFixed(2)} USDT
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export default function ReferralPage() {
  const [invitations, setInvitations] = useState<InvDay[]>([]);
  const [commissions, setCommissions] = useState<CommDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [referralLink, setReferralLink] = useState('');
  const [referralPercent, setReferralPercent] = useState('');
  const [referralCount, setReferralCount] = useState(0);
  const [referralBalance, setReferralBalance] = useState('0');
  const [linkCopied, setLinkCopied] = useState(false);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    getMe()
      .then((me) => {
        if (me?.botReferralLink) setReferralLink(me.botReferralLink);
        setReferralPercent(me?.referralCommissionPercent ?? '0.5');
        setReferralCount(me?.referralCount ?? 0);
        setReferralBalance(me?.referralBalance ?? '0');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getReferralStats()
      .then((r) => {
        setInvitations(r.invitationsByDay ?? []);
        setCommissions(r.commissionsByDay ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopyLink = () => {
    if (referralLink && navigator.clipboard) {
      navigator.clipboard.writeText(referralLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-background-light dark:bg-neutral-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Реферальная программа</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        {/* Как это работает */}
        <section className="mb-6">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">info</span>
              Как это работает
            </h2>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-primary font-bold">1.</span>
                <span>Поделитесь своей реферальной ссылкой с друзьями (в соцсетях, мессенджерах).</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">2.</span>
                <span>Когда приглашённый пользователь установит ATS WALLET и войдёт по вашей ссылке, он станет вашим рефералом.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">3.</span>
                <span>Вы получаете <strong>{referralPercent}%</strong> от комиссий с операций реферала: обмен на рубли (карта, СБП), оплата по СБП. Начисления приходят на реферальный баланс в USDT.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">4.</span>
                <span>Переведите накопленные средства с реферального баланса на основной в любой момент (Профиль или эта страница).</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Ваша ссылка */}
        <section className="mb-8">
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 border border-primary/20 p-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">link</span>
              Ваша реферальная ссылка
            </h2>
            {referralLink ? (
              <div className="flex gap-2">
                <input
                  readOnly
                  value={referralLink}
                  className="flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-mono text-slate-700 dark:text-slate-200 truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 active:scale-[0.98]"
                >
                  {linkCopied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Ссылка подгружается… Если не появляется, проверьте настройки бота в приложении.</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Отправьте эту ссылку тому, кого хотите пригласить. Переход по ссылке откроет бота и зарегистрирует пользователя как вашего реферала.</p>
          </div>
        </section>

        {/* Сводка */}
        <section className="mb-8 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-neutral-900 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Приглашено пользователей</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{referralCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-neutral-900 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Реферальный баланс</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {Number(referralBalance).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT
            </p>
            <button
              type="button"
              disabled={transferring || Number(referralBalance) <= 0}
              onClick={async () => {
                setTransferring(true);
                try {
                  await referralTransferToMain();
                  const me = await getMe();
                  if (me?.referralBalance != null) setReferralBalance(me.referralBalance);
                } finally {
                  setTransferring(false);
                }
              }}
              className="mt-2 w-full py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 active:scale-[0.98]"
            >
              {transferring ? '…' : 'Перевести на основной баланс'}
            </button>
          </div>
        </section>

        {/* Графики */}
        <section className="mb-8">
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 border border-primary/20 p-5 mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[24px]">group_add</span>
              Приглашения по дням
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Статистика за последние 14 дней</p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-4 shadow-sm mb-6">
            {loading ? (
              <div className="h-48 flex items-center justify-center text-slate-400">Загрузка…</div>
            ) : (
              <BarChartInvitations data={invitations} />
            )}
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:to-emerald-500/10 border border-emerald-500/20 p-5 mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500 text-[24px]">payments</span>
              Комиссии по дням
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Начисления с рефералов за последние 14 дней</p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-4 shadow-sm">
            {loading ? (
              <div className="h-48 flex items-center justify-center text-slate-400">Загрузка…</div>
            ) : (
              <BarChartCommissions data={commissions} />
            )}
          </div>
        </section>

        <Link
          href="/profile"
          className="block w-full py-3 rounded-2xl border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-slate-300 text-center font-medium"
        >
          Назад в профиль
        </Link>
      </main>

      <BottomNav />
    </div>
  );
}
