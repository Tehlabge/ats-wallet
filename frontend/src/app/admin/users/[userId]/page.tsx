'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getAdminUserDetail, patchUserPartner, setUserCommission, getUserSeedCheck, getAdminRole, deleteAppUser, getAdminUserActionLogs } from '@/lib/api';

type Detail = Awaited<ReturnType<typeof getAdminUserDetail>>;
type SeedCheck = { userId: string; digitalId: string; telegramUsername: string; words: Array<{ position: number; word: string }> };

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.userId as string;
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refCommissionSaving, setRefCommissionSaving] = useState(false);
  const [refCommissionEdit, setRefCommissionEdit] = useState<string | null>(null);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [commissionEdit, setCommissionEdit] = useState<string | null>(null);
  const [seedCheck, setSeedCheck] = useState<SeedCheck | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'payments' | 'sessions'>('transactions');
  const [actionLogs, setActionLogs] = useState<Array<{ id: number; actionLabel: string; details: string; createdAt: string }>>([]);
  
  // Delete user state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  
  const role = typeof window !== 'undefined' ? getAdminRole() : null;
  const isSuper = role === 'super';

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    getAdminUserDetail(userId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    getAdminUserActionLogs(userId).then(setActionLogs);
  }, [userId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/users" className="inline-flex items-center gap-2 text-primary hover:underline">
          <span className="material-icons-round text-[20px]">arrow_back</span>
          К списку пользователей
        </Link>
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-6 text-red-700 dark:text-red-300">
          {error || 'Пользователь не найден'}
        </div>
      </div>
    );
  }

  const fullName = [data.telegramFirstName, data.telegramLastName].filter(Boolean).join(' ') || 'Без имени';
  const showRefCommission = refCommissionEdit ?? (data.referralCommissionPercent ?? '0');

  const saveRefCommission = async () => {
    const raw = refCommissionEdit ?? data.referralCommissionPercent ?? '0';
    const num = parseFloat(String(raw).replace(',', '.'));
    if (Number.isNaN(num) || num < 0 || num > 100) return;
    setRefCommissionSaving(true);
    try {
      await patchUserPartner(userId, { referralCommissionPercent: String(num) });
      const next = await getAdminUserDetail(userId);
      setData(next);
      setRefCommissionEdit(null);
      getAdminUserActionLogs(userId).then(setActionLogs);
    } finally {
      setRefCommissionSaving(false);
    }
  };

  const saveCommission = async () => {
    const raw = commissionEdit ?? data.commissionPercent;
    const num = parseInt(String(raw).replace(',', '.'), 10);
    if (Number.isNaN(num) || num < 0 || num > 100) return;
    setCommissionSaving(true);
    try {
      await setUserCommission(userId, num);
      const next = await getAdminUserDetail(userId);
      setData(next);
      setCommissionEdit(null);
      getAdminUserActionLogs(userId).then(setActionLogs);
    } finally {
      setCommissionSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletePassword) {
      setDeleteError('Введите платёжный пароль');
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteAppUser(userId, deletePassword);
      router.push('/admin/users');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Перевод типов транзакций на русский
  const getTransactionTypeLabel = (type: string) => {
    const types: Record<string, { label: string; color: string; icon: string }> = {
      'deposit': { label: 'Пополнение', color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: 'add_circle' },
      'withdraw': { label: 'Вывод', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: 'remove_circle' },
      'withdrawal_hold': { label: 'Заморозка (вывод)', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20', icon: 'pause_circle' },
      'withdrawal_refund': { label: 'Возврат (отмена вывода)', color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: 'replay' },
      'transfer_in': { label: 'Входящий перевод', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: 'call_received' },
      'transfer_out': { label: 'Исходящий перевод', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20', icon: 'call_made' },
      'referral': { label: 'Реферальный бонус', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20', icon: 'group_add' },
      'referral_transfer': { label: 'Перевод с реф. баланса', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20', icon: 'swap_horiz' },
      'exchange': { label: 'Обмен', color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20', icon: 'currency_exchange' },
      'balance_credit': { label: 'Начисление', color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: 'add_card' },
      'balance_debit': { label: 'Списание', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: 'credit_card_off' },
      'payment_credit': { label: 'Зачисление платежа', color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: 'payments' },
      'payment_debit': { label: 'Списание за покупку', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: 'shopping_cart' },
      'add': { label: 'Начисление', color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: 'add' },
      'remove': { label: 'Списание', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: 'remove' },
    };
    return types[type] || { label: type, color: 'text-slate-600 bg-slate-50 dark:bg-slate-700', icon: 'receipt' };
  };

  const totalDeposits = data.transactions
    .filter(t => ['deposit', 'balance_credit', 'payment_credit', 'transfer_in', 'withdrawal_refund'].includes(t.type) || parseFloat(t.amount) > 0)
    .reduce((sum, t) => sum + Math.max(0, parseFloat(t.amount)), 0);

  const totalWithdrawals = data.transactions
    .filter(t => ['withdraw', 'withdrawal_hold', 'transfer_out', 'payment_debit', 'balance_debit'].includes(t.type) || parseFloat(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Math.min(0, parseFloat(t.amount))), 0);

  const parseDeviceInfo = (userAgent: string) => {
    if (!userAgent) return { device: 'Неизвестно', browser: '' };
    const ua = userAgent.toLowerCase();
    
    let device = 'Desktop';
    if (ua.includes('iphone') || ua.includes('ipad')) device = 'iOS';
    else if (ua.includes('android')) device = 'Android';
    else if (ua.includes('mobile')) device = 'Mobile';
    
    let browser = '';
    if (ua.includes('telegram')) browser = 'Telegram';
    else if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari')) browser = 'Safari';
    else if (ua.includes('firefox')) browser = 'Firefox';
    
    return { device, browser };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/users" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400">
            <span className="material-icons-round">arrow_back</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{fullName}</h1>
            <p className="text-slate-500 text-sm">
              {data.telegramUsername ? `@${data.telegramUsername}` : 'Telegram не привязан'}
              {data.digitalId && <span className="ml-2 text-primary">ID: {data.digitalId}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data.telegramUsername && (
            <a 
              href={`https://t.me/${data.telegramUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
              title="Написать в Telegram"
            >
              <span className="material-icons-round text-lg">send</span>
            </a>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="material-icons-round text-green-600">account_balance_wallet</span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {Number(String(data.usdt ?? 0)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-500">Баланс USDT</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <span className="material-icons-round text-purple-600">redeem</span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {Number(String(data.usdtRef ?? 0)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-500">Реф. баланс</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <span className="material-icons-round text-blue-600">arrow_downward</span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {totalDeposits.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-500">Пополнено</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <span className="material-icons-round text-red-600">arrow_upward</span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {totalWithdrawals.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-500">Выведено</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="material-icons-round text-amber-600">group</span>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{data.referralsCount || 0}</p>
              <p className="text-xs text-slate-500">Рефералов</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Info Card */}
        <div className="lg:col-span-1 space-y-4">
          {/* Basic Info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">Информация</h3>
            </div>
            <div className="p-4 space-y-3">
              <InfoRow label="ID" value={data.id} copyable onCopy={copyToClipboard} />
              <InfoRow label="Digital ID" value={data.digitalId || '—'} copyable={!!data.digitalId} onCopy={copyToClipboard} />
              <InfoRow label="Telegram ID" value={data.telegramId || '—'} />
              <InfoRow label="Комиссия" value={`${data.commissionPercent}%`} />
              <InfoRow label="Регистрация" value={new Date(data.createdAt).toLocaleString('ru-RU')} />
              <InfoRow label="Последний вход" value={data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString('ru-RU') : '—'} />
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">Настройки</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Уведомления об акциях</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${data.notifPromo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {data.notifPromo ? 'Включены' : 'Выключены'}
                </span>
              </div>
            </div>
          </div>

          {/* Digital ID & Deposits */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">Пополнения</h3>
            </div>
            <div className="p-4 space-y-3">
              {data.digitalId ? (
                <>
                  <div className="p-4 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-xs text-slate-500 mb-1">Digital ID пользователя</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-mono font-bold text-primary">{data.digitalId}</span>
                      <button
                        onClick={() => copyToClipboard(data.digitalId!)}
                        className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-primary/10"
                      >
                        <span className="material-icons-round text-sm">content_copy</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Пользователь указывает этот ID в сумме пополнения (напр. 50.<strong>{data.digitalId}</strong>)
                  </p>
                  <Link
                    href={`/admin/wallets?search=${data.digitalId}`}
                    className="w-full py-3 px-4 rounded-xl bg-primary text-white font-medium flex items-center justify-center gap-2 hover:bg-primary/90"
                  >
                    <span className="material-icons-round text-lg">search</span>
                    Найти депозиты с этим ID
                  </Link>
                </>
              ) : (
                <p className="text-slate-500 text-sm">Digital ID не назначен</p>
              )}
            </div>
          </div>

          {/* Реферальная система */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">Реферальная система</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Рефералов</span>
                <span className="font-semibold text-slate-900 dark:text-white">{data.referralsCount || 0}</span>
              </div>
              {isSuper ? (
                <div className="pt-2 space-y-2">
                  <label className="block text-xs text-slate-500">Реф. комиссия %</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={showRefCommission}
                      onChange={(e) => setRefCommissionEdit(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={saveRefCommission}
                      disabled={refCommissionSaving}
                      className="px-4 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-50"
                    >
                      {refCommissionSaving ? '...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Реф. комиссия %</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{data.referralCommissionPercent ?? '0'}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Логи действий */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">Логи действий</h3>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto space-y-2">
              {actionLogs.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Нет записей</p>
              ) : (
                actionLogs.map((log) => (
                  <div key={log.id} className="text-sm border-l-2 border-slate-200 dark:border-slate-600 pl-3 py-1">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{log.actionLabel}</p>
                    {log.details && <p className="text-slate-500 dark:text-slate-400 truncate" title={log.details}>{log.details}</p>}
                    <p className="text-xs text-slate-400 dark:text-slate-500">{log.createdAt}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Referrer */}
          {data.referrerId && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-900 dark:text-white">Реферер</h3>
              </div>
              <div className="p-4">
                <Link 
                  href={`/admin/users/${data.referrerId}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="material-icons-round text-primary">person</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {data.referrerId.slice(0, 12)}...
                    </p>
                    <p className="text-xs text-slate-500">Пригласил этого пользователя</p>
                  </div>
                  <span className="material-icons-round text-slate-400">chevron_right</span>
                </Link>
              </div>
            </div>
          )}

          {/* Admin Actions */}
          {isSuper && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-900 dark:text-white">Управление</h3>
              </div>
              <div className="p-4 space-y-4">
                {/* Commission */}
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Комиссия %</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={commissionEdit ?? data.commissionPercent}
                      onChange={(e) => setCommissionEdit(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white"
                    />
                    <button
                      onClick={saveCommission}
                      disabled={commissionSaving}
                      className="px-4 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-50"
                    >
                      {commissionSaving ? '...' : 'Сохранить'}
                    </button>
                  </div>
                </div>

                {/* Seed Check */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">Проверка Seed</label>
                  {seedCheck ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {seedCheck.words.map((w) => (
                          <div key={w.position} className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                            <p className="text-xs text-amber-600 dark:text-amber-400">#{w.position}</p>
                            <p className="font-mono font-bold text-amber-800 dark:text-amber-200">{w.word}</p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setSeedCheck(null)}
                        className="text-sm text-slate-500 hover:text-slate-700"
                      >
                        Скрыть
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        onClick={async () => {
                          setSeedLoading(true);
                          setSeedError(null);
                          try {
                            const result = await getUserSeedCheck(userId);
                            setSeedCheck(result);
                            getAdminUserActionLogs(userId).then(setActionLogs);
                          } catch (e) {
                            setSeedError(e instanceof Error ? e.message : 'Ошибка');
                          } finally {
                            setSeedLoading(false);
                          }
                        }}
                        disabled={seedLoading}
                        className="w-full py-2 px-4 rounded-lg bg-amber-500 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <span className="material-icons-round text-lg">vpn_key</span>
                        {seedLoading ? 'Загрузка...' : 'Показать 4 слова'}
                      </button>
                      {seedError && <p className="mt-2 text-sm text-red-500">{seedError}</p>}
                    </div>
                  )}
                </div>

                {/* Delete User */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="w-full py-2 px-4 rounded-lg bg-red-500 text-white font-medium flex items-center justify-center gap-2 hover:bg-red-600"
                  >
                    <span className="material-icons-round text-lg">person_remove</span>
                    Удалить пользователя
                  </button>
                  <p className="mt-2 text-xs text-slate-500 text-center">
                    Удаляет пользователя и все его данные. Требуется платёжный пароль.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transactions & Payments & Sessions */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab('transactions')}
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'transactions'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Операции ({data.transactions.length})
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'payments'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Платежи ({data.pendingPayments.length})
              </button>
              <button
                onClick={() => setActiveTab('sessions')}
                className={`flex-1 py-3 px-4 text-sm font-medium ${
                  activeTab === 'sessions'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Сессии ({data.sessions?.length || 0})
              </button>
            </div>

            {/* Transactions Tab */}
            {activeTab === 'transactions' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-[600px] overflow-y-auto">
                {data.transactions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <span className="material-icons-round text-4xl mb-2 block">receipt_long</span>
                    Нет операций
                  </div>
                ) : (
                  data.transactions.map((t) => {
                    const typeInfo = getTransactionTypeLabel(t.type);
                    const amount = parseFloat(t.amount);
                    const isPositive = amount > 0;
                    return (
                      <div key={t.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeInfo.color}`}>
                              <span className="material-icons-round">{typeInfo.icon}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 dark:text-white">{typeInfo.label}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(t.createdAt).toLocaleString('ru-RU')}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-mono font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {isPositive ? '+' : ''}{amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                            </p>
                            <p className="text-xs text-slate-500">{t.symbol}</p>
                          </div>
                        </div>
                        {t.refId && (
                          <p className="mt-2 text-xs text-slate-400 truncate">
                            {t.refId}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Payments Tab */}
            {activeTab === 'payments' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-[600px] overflow-y-auto">
                {data.pendingPayments.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <span className="material-icons-round text-4xl mb-2 block">check_circle</span>
                    Нет ожидающих платежей
                  </div>
                ) : (
                  data.pendingPayments.map((p) => (
                    <div key={p.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <span className="material-icons-round text-amber-600">hourglass_empty</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white">
                              {Number(p.sumRub).toLocaleString('ru-RU')} ₽
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(p.createdAt).toLocaleString('ru-RU')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-bold text-green-600">
                            +{Number(p.sumUsdt).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT
                          </p>
                          <p className="text-xs text-slate-500">Комиссия: {p.commissionPercent}%</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium">
                          Ожидает
                        </span>
                        <Link href={`/admin/payments/${p.id}`} className="text-primary hover:underline text-sm">
                          Открыть
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Sessions Tab */}
            {activeTab === 'sessions' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-[600px] overflow-y-auto">
                {!data.sessions || data.sessions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <span className="material-icons-round text-4xl mb-2 block">devices</span>
                    Нет активных сессий
                  </div>
                ) : (
                  data.sessions.map((s, idx) => {
                    const deviceInfo = parseDeviceInfo(s.userAgent);
                    const isCurrentSession = idx === 0;
                    return (
                      <div key={s.id} className={`p-4 ${isCurrentSession ? 'bg-green-50/50 dark:bg-green-900/10' : ''}`}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              isCurrentSession 
                                ? 'bg-green-100 dark:bg-green-900/30' 
                                : 'bg-slate-100 dark:bg-slate-700'
                            }`}>
                              <span className={`material-icons-round ${isCurrentSession ? 'text-green-600' : 'text-slate-500'}`}>
                                {deviceInfo.device === 'iOS' || deviceInfo.device === 'Android' ? 'smartphone' : 'computer'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                {deviceInfo.device}
                                {deviceInfo.browser && <span className="text-slate-500 text-sm">• {deviceInfo.browser}</span>}
                                {isCurrentSession && (
                                  <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs">
                                    Текущая
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500">
                                IP: {s.ip || 'неизвестно'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                              {new Date(s.lastActiveAt).toLocaleString('ru-RU')}
                            </p>
                            <p className="text-xs text-slate-500">
                              Создана: {new Date(s.createdAt).toLocaleDateString('ru-RU')}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete User Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <span className="material-icons-round text-red-600 text-2xl">warning</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Удалить пользователя</h3>
                  <p className="text-sm text-slate-500">Это действие необратимо</p>
                </div>
              </div>
              
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-4">
                <p className="text-sm text-red-700 dark:text-red-300">
                  <strong>Внимание!</strong> Будут удалены:
                </p>
                <ul className="mt-2 text-sm text-red-600 dark:text-red-400 list-disc list-inside space-y-1">
                  <li>Все транзакции</li>
                  <li>Балансы и кошельки</li>
                  <li>Сессии и платежи</li>
                  <li>Сообщения в поддержку</li>
                  <li>Сам аккаунт пользователя</li>
                </ul>
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                  При повторном входе пользователь будет считаться <strong>новым</strong>.
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Платёжный пароль (WALLET_PASSWORD)
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Введите платёжный пароль"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {deleteError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  {deleteError}
                </div>
              )}
            </div>

            <div className="flex border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
                className="flex-1 py-4 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Отмена
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteLoading || !deletePassword}
                className="flex-1 py-4 text-white font-medium bg-red-500 hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <span className="material-icons-round animate-spin text-lg">progress_activity</span>
                    Удаление...
                  </>
                ) : (
                  <>
                    <span className="material-icons-round text-lg">delete_forever</span>
                    Удалить
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, copyable, onCopy }: { label: string; value: string; copyable?: boolean; onCopy?: (text: string) => void }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    if (onCopy && value && value !== '—') {
      onCopy(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-sm text-slate-900 dark:text-white truncate">{value}</span>
        {copyable && value && value !== '—' && (
          <button
            onClick={handleCopy}
            className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
          >
            <span className="material-icons-round text-sm">{copied ? 'check' : 'content_copy'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
