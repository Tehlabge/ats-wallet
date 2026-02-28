'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getAdminHeaders } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

interface UnidentifiedDeposit {
  id: number;
  txId: string;
  amount: string;
  fromAddr: string;
  status: string;
  createdAt: string;
}

interface WalletTransaction {
  txId: string;
  amount: string;
  fromAddr: string;
  timestamp: string;
  identified: boolean;
  userId?: string;
  userDigitalId?: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function shortenAddr(addr: string) {
  if (!addr || addr.length < 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function AdminWalletsPage() {
  const [deposits, setDeposits] = useState<UnidentifiedDeposit[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [masterWallet, setMasterWallet] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'transactions' | 'unidentified'>('transactions');
  
  // Assign modal
  const [assignModal, setAssignModal] = useState<UnidentifiedDeposit | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Search - read from URL query
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  const loadDeposits = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/unidentified-deposits`, { headers: getAdminHeaders() });
      const data = await res.json();
      setDeposits(data.deposits || []);
    } catch {
      // ignore
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/wallet-transactions`, { headers: getAdminHeaders() });
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch {
      // ignore
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/deposit-settings`, { headers: getAdminHeaders() });
      const data = await res.json();
      setMasterWallet(data.masterDepositWallet || '');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDeposits(), loadSettings(), loadTransactions()]).finally(() => setLoading(false));
  }, [loadDeposits, loadSettings, loadTransactions]);

  const handleAssign = async () => {
    if (!assignModal || !assignUserId.trim()) return;
    setAssignLoading(true);
    try {
      const res = await fetch(`${API}/admin/unidentified-deposits/${assignModal.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify({ userId: assignUserId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      alert('Депозит зачислен');
      setAssignModal(null);
      setAssignUserId('');
      loadDeposits();
      loadTransactions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleReject = async (id: number) => {
    if (!confirm('Отметить как ошибочный платёж?')) return;
    try {
      await fetch(`${API}/admin/unidentified-deposits/${id}/reject`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      loadDeposits();
    } catch {
      alert('Ошибка');
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/admin/check-wallet-deposits`, { method: 'POST', headers: getAdminHeaders() });
      await Promise.all([loadDeposits(), loadTransactions()]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Filter transactions by search query (digitalId, txId, address)
  const filteredTransactions = transactions.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.txId.toLowerCase().includes(q) ||
      t.fromAddr.toLowerCase().includes(q) ||
      (t.userDigitalId && t.userDigitalId.includes(q)) ||
      t.amount.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-20">
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3">
        <Link href="/admin" className="text-primary">
          <span className="material-icons-round">arrow_back</span>
        </Link>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white flex-1">Депозиты</h1>
        <Link
          href="/admin/deposit-settings"
          className="p-2 text-slate-500 hover:text-primary"
          title="Настройки"
        >
          <span className="material-icons-round">settings</span>
        </Link>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-2 text-primary disabled:opacity-50"
          title="Проверить депозиты"
        >
          <span className={`material-icons-round ${loading ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4">
        <div className="flex gap-4 overflow-x-auto">
          <button
            onClick={() => setTab('transactions')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === 'transactions'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Транзакции
          </button>
          <button
            onClick={() => setTab('unidentified')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === 'unidentified'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Без ID
            {deposits.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 rounded-full">
                {deposits.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <main className="p-4 space-y-4 animate-fade-in">
        {loading ? (
          <div className="text-center py-8 text-slate-500">Загрузка...</div>
        ) : tab === 'transactions' ? (
          <>
            {masterWallet ? (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                Кошелёк: {masterWallet}
              </div>
            ) : (
              <Link 
                href="/admin/deposit-settings"
                className="block bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
              >
                <div className="flex items-center gap-2">
                  <span className="material-icons-round">warning</span>
                  <span className="font-medium">Мастер-кошелёк не настроен</span>
                </div>
                <p className="text-sm mt-1 text-amber-700 dark:text-amber-300">Нажмите, чтобы настроить</p>
              </Link>
            )}

            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-xl">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по Digital ID, TX, адресу..."
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
              />
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-6 text-center text-slate-500">
                {searchQuery ? 'Ничего не найдено' : 'Нет транзакций'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTransactions.map((t, i) => (
                  <div key={t.txId + i} className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg font-bold text-slate-900 dark:text-white">
                            +{Number(t.amount).toFixed(6)}
                          </span>
                          <span className="text-sm text-slate-500">USDT</span>
                          {t.identified ? (
                            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full">
                              ✓ ID: {t.userDigitalId}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                              Без ID
                            </span>
                          )}
                        </div>
                        {t.identified && t.userId && (
                          <Link 
                            href={`/admin/users/${t.userId}`}
                            className="text-sm text-primary hover:underline mt-1 inline-block"
                          >
                            Открыть пользователя →
                          </Link>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          От: {shortenAddr(t.fromAddr)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDate(t.timestamp)}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 font-mono break-all">
                      {t.txId}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {deposits.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl p-6 text-center text-slate-500">
                <span className="material-icons-round text-4xl mb-2 text-green-500">check_circle</span>
                <p>Все депозиты идентифицированы</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Эти депозиты пришли без корректного ID. Вы можете зачислить их вручную или отметить как ошибочные.
                </p>
                {deposits.map((d) => (
                  <div key={d.id} className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          +{Number(d.amount).toFixed(6)} USDT
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          От: {shortenAddr(d.fromAddr)}
                        </p>
                        <p className="text-xs text-slate-400">{formatDate(d.createdAt)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 font-mono break-all">
                      TX: {d.txId}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setAssignModal(d)}
                        className="flex-1 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg"
                      >
                        Зачислить пользователю
                      </button>
                      <button
                        onClick={() => handleReject(d.id)}
                        className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg"
                      >
                        Ошибочный
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 w-full max-w-md p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Зачислить депозит
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Сумма: <span className="font-bold">{assignModal.amount} USDT</span>
            </p>
            <p className="text-xs text-slate-500 font-mono mb-4 break-all">
              TX: {assignModal.txId}
            </p>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              User ID (UUID) или Digital ID пользователя
            </label>
            <input
              type="text"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              placeholder="UUID или 4–7 значный Digital ID"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setAssignModal(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl"
              >
                Отмена
              </button>
              <button
                onClick={handleAssign}
                disabled={assignLoading || !assignUserId.trim()}
                className="flex-1 px-4 py-2.5 bg-primary text-white font-medium rounded-xl disabled:opacity-50"
              >
                {assignLoading ? 'Зачисление...' : 'Зачислить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
