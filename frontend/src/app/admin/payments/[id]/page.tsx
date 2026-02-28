'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getPaymentById,
  takePaymentToWork,
  confirmPayment,
  rejectPayment,
} from '@/lib/api';

export default function AdminPaymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [payment, setPayment] = useState<{
    id: number;
    userId: string;
    rawPayload: string;
    sumRub: string;
    sumUsdt: string;
    commissionPercent: string;
    status: string;
    createdAt: string;
    assignedToAdminId: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPaymentById(id)
      .then(setPayment)
      .catch(() => setPayment(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleTake = async () => {
    setError(null);
    setTaking(true);
    try {
      await takePaymentToWork(id);
      const p = await getPaymentById(id);
      setPayment(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setTaking(false);
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setConfirming(true);
    try {
      await confirmPayment(id);
      router.push('/admin/payments');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async () => {
    setError(null);
    setRejecting(true);
    try {
      await rejectPayment(id, rejectReason.trim() || undefined);
      router.push('/admin/payments');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRejecting(false);
    }
  };

  if (loading || !payment) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isPending = payment.status === 'pending';
  const isMine = payment.assignedToAdminId !== 0;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payment.rawPayload)}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/payments"
          className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="material-icons-round text-[24px]">arrow_back</span>
        </Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Платёж #{payment.id}</h1>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col items-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">QR ссылки для перевода</p>
            <img src={qrUrl} alt="QR" className="w-[200px] h-[200px] rounded-xl border border-slate-200 dark:border-slate-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
              {Number(payment.sumRub).toLocaleString('ru-RU')} ₽ → {Number(payment.sumUsdt).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT
            </p>
            <p className="text-sm text-slate-500">Комиссия: {payment.commissionPercent}%</p>
            <p className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all mt-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              {payment.rawPayload}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Пользователь: {payment.userId.slice(0, 8)}… · {new Date(payment.createdAt).toLocaleString('ru-RU')}
            </p>
            {payment.status !== 'pending' && (
              <p className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">Статус: {payment.status}</p>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 dark:text-red-400 text-sm mt-4">{error}</p>}

        {isPending && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-3">
            {!isMine ? (
              <button
                type="button"
                onClick={handleTake}
                disabled={taking}
                className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {taking ? <span className="material-icons-round animate-spin text-[18px]">progress_activity</span> : null}
                Взять в работу
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirming || rejecting}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  <span className="material-icons-round text-[18px]">check</span>
                  {confirming ? '…' : 'Оплатить'}
                </button>
                <div className="flex flex-col gap-3 w-full">
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Неверный QR-код',
                      'Истёк срок оплаты',
                      'Недостаточно средств',
                      'Ошибка банка получателя',
                      'Повторите попытку позже',
                    ].map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setRejectReason(reason)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          rejectReason === reason
                            ? 'bg-red-100 dark:bg-red-900/50 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="Причина отклонения (необязательно)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm flex-1 min-w-[200px]"
                    />
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={rejecting || confirming}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      <span className="material-icons-round text-[18px]">close</span>
                      {rejecting ? '…' : 'Отклонить'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
