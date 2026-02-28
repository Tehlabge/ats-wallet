'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getPendingPayments, takePaymentToWork } from '@/lib/api';
import { playNotificationSound } from '@/lib/notificationSound';

interface PendingItem {
  id: number;
  userId: string;
  rawPayload: string;
  sumRub: string;
  sumUsdt: string;
  commissionPercent: string;
  createdAt: string;
  assignedToAdminId?: number;
  mine?: boolean;
}

export default function AdminPayments() {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [takingId, setTakingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<number>>(new Set());

  const load = () => {
    setLoading(true);
    getPendingPayments()
      .then((next) => {
        const prevIds = prevIdsRef.current;
        const nextIds = new Set(next.map((p) => p.id));
        const hasNew = next.some((p) => !prevIds.has(p.id)) && prevIds.size > 0;
        if (hasNew) {
          playNotificationSound();
          setToast('Новый платёж');
          setTimeout(() => setToast(null), 4000);
        }
        prevIdsRef.current = nextIds;
        setPending(next);
      })
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 12000);
    return () => clearInterval(interval);
  }, []);

  const handleTake = async (id: number) => {
    setTakingId(id);
    try {
      await takePaymentToWork(id);
      window.location.href = `/admin/payments/${id}`;
    } catch {
      setTakingId(null);
      load();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl bg-primary text-white shadow-lg flex items-center gap-2">
          <span className="material-icons-round text-[22px]">notifications</span>
          <span className="font-medium">{toast}</span>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Платежи</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Подтверждение и отклонение платежей</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/payments/archive"
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-icons-round text-[18px]">archive</span>
            Архив
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <span className={`material-icons-round text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
            Обновить
          </button>
        </div>
      </div>

      {loading && pending.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-12 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <span className="material-icons-round text-emerald-600 dark:text-emerald-400 text-[32px]">check_circle</span>
          </div>
          <p className="text-lg font-medium text-slate-900 dark:text-white">Нет ожидающих платежей</p>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Все платежи обработаны</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-sm hover:shadow-md hover:border-slate-300/50 dark:hover:border-slate-700 transition-all"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <span className="material-icons-round text-amber-600 text-[20px]">pending</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {Number(p.sumRub).toLocaleString('ru-RU')} ₽ → {Number(p.sumUsdt).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT
                      </p>
                      <p className="text-sm text-slate-500">Комиссия: {p.commissionPercent}%</p>
                    </div>
                  </div>
                  <p className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all bg-slate-50 dark:bg-slate-800 rounded-lg p-3 mb-3">
                    {p.rawPayload}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <span className="material-icons-round text-[16px]">person</span>
                      {p.userId.slice(0, 8)}…
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-icons-round text-[16px]">schedule</span>
                      {new Date(p.createdAt).toLocaleString('ru-RU')}
                    </span>
                    {p.mine && <span className="text-primary font-medium">В работе у вас</span>}
                    <a
                      href={p.rawPayload}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <span className="material-icons-round text-[16px]">open_in_new</span>
                      Открыть ссылку
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.mine ? (
                    <Link
                      href={`/admin/payments/${p.id}`}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:opacity-90"
                    >
                      <span className="material-icons-round text-[18px]">qr_code</span>
                      Открыть · Оплатить / Отклонить
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleTake(p.id)}
                      disabled={takingId === p.id}
                      className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium disabled:opacity-50"
                    >
                      {takingId === p.id ? (
                        <span className="material-icons-round animate-spin text-[18px]">progress_activity</span>
                      ) : (
                        <span className="material-icons-round text-[18px]">work</span>
                      )}
                      Взять в работу
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
