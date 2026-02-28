'use client';

import { useEffect, useState } from 'react';
import {
  getLogUsers,
  setLogUsers,
  getComponentLog,
  getScanLinksLog,
  getPrometheusMetrics,
  getAdminUserByQuery,
  type LogUserItem,
  type ComponentLogComponent,
  type ScanLinkEntry,
} from '@/lib/api';

const COMPONENTS: { id: ComponentLogComponent; label: string }[] = [
  { id: 'scanner', label: 'Сканер' },
  { id: 'chat', label: 'Чат' },
  { id: 'biometry', label: 'Биометрия' },
  { id: 'miniapp', label: 'Запуск мини-аппа' },
  { id: 'auth', label: 'Авторизация' },
];

type Tab = 'prometheus' | 'components' | 'scanLinks';

export default function AdminLogPage() {
  const [tab, setTab] = useState<Tab>('prometheus');
  const [prometheusRaw, setPrometheusRaw] = useState<string>('');
  const [prometheusLoading, setPrometheusLoading] = useState(false);
  const [prometheusError, setPrometheusError] = useState<string | null>(null);
  const [prometheusOnline, setPrometheusOnline] = useState<boolean | null>(null);
  const [metricNames, setMetricNames] = useState<string[]>([]);

  const [users, setUsers] = useState<LogUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addQuery, setAddQuery] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<ComponentLogComponent>('scanner');
  const [logContent, setLogContent] = useState<string>('');
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const [scanLinksEntries, setScanLinksEntries] = useState<ScanLinkEntry[]>([]);
  const [scanLinksContent, setScanLinksContent] = useState<string>('');
  const [scanLinksLoading, setScanLinksLoading] = useState(false);
  const [scanLinksError, setScanLinksError] = useState<string | null>(null);
  const [scanLinksFilterUserId, setScanLinksFilterUserId] = useState('');
  const [scanLinksFilterFrom, setScanLinksFilterFrom] = useState('');
  const [scanLinksFilterTo, setScanLinksFilterTo] = useState('');

  /** Из сырого текста Prometheus извлекаем список имён метрик. */
  function parsePrometheusMetricNames(raw: string): string[] {
    const names = new Set<string>();
    const lines = raw.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('# HELP ') || t.startsWith('# TYPE ')) {
        const name = t.split(/\s+/)[2];
        if (name) names.add(name);
      } else if (t.length && !t.startsWith('#')) {
        const match = t.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/);
        if (match) names.add(match[1]);
      }
    }
    return Array.from(names).sort();
  }

  const loadPrometheus = () => {
    setPrometheusLoading(true);
    setPrometheusError(null);
    setPrometheusOnline(null);
    getPrometheusMetrics()
      .then((raw) => {
        setPrometheusRaw(raw);
        setPrometheusOnline(true);
        setMetricNames(parsePrometheusMetricNames(raw));
      })
      .catch((e) => {
        setPrometheusError(e instanceof Error ? e.message : 'Не удалось загрузить метрики');
        setPrometheusRaw('');
        setPrometheusOnline(false);
        setMetricNames([]);
      })
      .finally(() => setPrometheusLoading(false));
  };

  useEffect(() => {
    if (tab === 'prometheus') loadPrometheus();
  }, [tab]);

  const loadUsers = () => {
    setLoading(true);
    getLogUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tab === 'components') loadUsers();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'components' || !selectedComponent) return;
    setLogLoading(true);
    setLogError(null);
    getComponentLog(selectedComponent)
      .then((r) => {
        setLogContent(r.raw ?? '');
        setLogError(null);
      })
      .catch((e) => {
        setLogContent('');
        setLogError(e instanceof Error ? e.message : 'Не удалось загрузить лог');
      })
      .finally(() => setLogLoading(false));
  }, [tab, selectedComponent]);

  const loadScanLinks = () => {
    setScanLinksLoading(true);
    setScanLinksError(null);
    const params: { userId?: string; from?: string; to?: string } = {};
    if (scanLinksFilterUserId.trim()) params.userId = scanLinksFilterUserId.trim();
    if (scanLinksFilterFrom.trim()) params.from = scanLinksFilterFrom.trim();
    if (scanLinksFilterTo.trim()) params.to = scanLinksFilterTo.trim();
    getScanLinksLog(Object.keys(params).length ? params : undefined)
      .then((r) => {
        setScanLinksEntries(r.entries ?? []);
        setScanLinksContent(r.raw ?? '');
        setScanLinksError(null);
      })
      .catch((e) => {
        setScanLinksEntries([]);
        setScanLinksContent('');
        setScanLinksError(e instanceof Error ? e.message : 'Не удалось загрузить лог ссылок');
      })
      .finally(() => setScanLinksLoading(false));
  };

  useEffect(() => {
    if (tab === 'scanLinks') loadScanLinks();
  }, [tab]);

  const addUser = async () => {
    const q = addQuery.trim();
    if (!q) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const u = await getAdminUserByQuery(q);
      if (!u) {
        setAddError('Пользователь не найден');
        return;
      }
      const exists = users.some((x) => x.userId === u.id);
      if (exists) {
        setAddError('Уже в списке');
        return;
      }
      await setLogUsers([...users.map((x) => x.userId), u.id]);
      setAddQuery('');
      loadUsers();
    } catch {
      setAddError('Ошибка');
    } finally {
      setAddLoading(false);
    }
  };

  const removeUser = async (userId: string) => {
    const next = users.filter((u) => u.userId !== userId).map((u) => u.userId);
    await setLogUsers(next);
    loadUsers();
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl space-y-8 animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Лог и метрики</h1>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-4">
        <button
          type="button"
          onClick={() => setTab('prometheus')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'prometheus'
              ? 'bg-primary text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          Метрики Prometheus
        </button>
        <button
          type="button"
          onClick={() => setTab('components')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'components'
              ? 'bg-primary text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          Логи по компонентам
        </button>
        <button
          type="button"
          onClick={() => setTab('scanLinks')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'scanLinks'
              ? 'bg-primary text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          Лог ссылок сканера
        </button>
      </div>

      {tab === 'prometheus' && (
        <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-semibold text-slate-900 dark:text-white">Метрики Prometheus</h2>
              {prometheusOnline === true && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Сервер онлайн
                </span>
              )}
              {prometheusOnline === false && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Офлайн
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={loadPrometheus}
              disabled={prometheusLoading}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {prometheusLoading ? 'Загрузка…' : 'Обновить'}
            </button>
          </div>
          <div className="p-4 space-y-4">
            {metricNames.length > 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Список метрик ({metricNames.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {metricNames.map((name) => (
                    <code
                      key={name}
                      className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-mono"
                    >
                      {name}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {prometheusLoading && !prometheusRaw ? (
              <div className="py-8 text-slate-500">Загрузка метрик…</div>
            ) : prometheusError ? (
              <div className="py-6 px-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-red-600 dark:text-red-400 text-sm font-medium">Ошибка</p>
                <p className="text-red-500 dark:text-red-500 text-sm mt-1">{prometheusError}</p>
              </div>
            ) : (
              <pre
                className="text-xs font-mono bg-slate-50 dark:bg-slate-900 rounded-xl p-4 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all"
                style={{ wordBreak: 'break-word', unicodeBidi: 'embed' }}
              >
                {prometheusRaw || '(пусто)'}
              </pre>
            )}
          </div>
        </div>
      )}

      {tab === 'components' && (
        <>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Пользователи, для которых включено логирование по компонентам (сканер, чат, биометрия и т.д.).
          </p>

          <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-semibold text-slate-900 dark:text-white">Пользователи с включённым логированием</h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={addQuery}
                  onChange={(e) => { setAddQuery(e.target.value); setAddError(null); }}
                  placeholder="ID, Digital ID или @username"
                  className="flex-1 min-w-[200px] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={addUser}
                  disabled={addLoading}
                  className="px-4 py-2 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {addLoading ? '...' : 'Добавить'}
                </button>
              </div>
              {addError && <p className="text-red-500 text-sm">{addError}</p>}
              {loading ? (
                <div className="py-4 text-slate-500">Загрузка...</div>
              ) : users.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-sm">Нет пользователей. Добавьте по ID или Digital ID.</p>
              ) : (
                <ul className="space-y-2">
                  {users.map((u) => (
                    <li
                      key={u.userId}
                      className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-700/50"
                    >
                      <span className="font-medium text-slate-900 dark:text-white">{u.displayName}</span>
                      {u.digitalId && <span className="text-xs text-slate-500 font-mono">{u.digitalId}</span>}
                      <button
                        type="button"
                        onClick={() => removeUser(u.userId)}
                        className="text-slate-500 hover:text-red-500 text-sm"
                      >
                        Удалить
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Логи по компонентам</h2>
              <div className="flex flex-wrap gap-2">
                {COMPONENTS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedComponent(c.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      selectedComponent === c.id
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4">
              {logLoading ? (
                <div className="py-8 text-slate-500">Загрузка...</div>
              ) : logError ? (
                <div className="py-6 px-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">Ошибка</p>
                  <p className="text-red-500 dark:text-red-500 text-sm mt-1">{logError}</p>
                </div>
              ) : (
                <pre
                  className="text-xs font-mono bg-slate-50 dark:bg-slate-900 rounded-xl p-4 max-h-[480px] overflow-auto whitespace-pre-wrap break-all"
                  style={{ wordBreak: 'break-word', unicodeBidi: 'embed' }}
                >
                  {logContent || '(пусто)'}
                </pre>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'scanLinks' && (
        <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Лог распознанных ссылок (scan_links.log)</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">Время в формате ДД.ММ.ГГГГ ЧЧ:ММ:СС. Фильтр по пользователю (ID) и по периоду.</p>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <input
                type="text"
                placeholder="ID пользователя (поиск)"
                value={scanLinksFilterUserId}
                onChange={(e) => setScanLinksFilterUserId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm min-w-[160px]"
              />
              <input
                type="date"
                placeholder="С"
                value={scanLinksFilterFrom}
                onChange={(e) => setScanLinksFilterFrom(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
              <span className="text-slate-500 text-sm">по</span>
              <input
                type="date"
                placeholder="По"
                value={scanLinksFilterTo}
                onChange={(e) => setScanLinksFilterTo(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
              <button
                type="button"
                onClick={loadScanLinks}
                disabled={scanLinksLoading}
                className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {scanLinksLoading ? 'Загрузка…' : 'Применить'}
              </button>
            </div>
          </div>
          <div className="p-4 overflow-x-auto">
            {scanLinksLoading && scanLinksEntries.length === 0 ? (
              <div className="py-8 text-slate-500">Загрузка…</div>
            ) : scanLinksError ? (
              <div className="py-6 px-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-red-600 dark:text-red-400 text-sm font-medium">Ошибка</p>
                <p className="text-red-500 dark:text-red-500 text-sm mt-1">{scanLinksError}</p>
              </div>
            ) : scanLinksEntries.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm">Нет записей. Измените фильтры или нажмите «Применить».</p>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                    <tr>
                      <th className="text-left py-2 px-3 border-b border-slate-200 dark:border-slate-600 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Время</th>
                      <th className="text-left py-2 px-3 border-b border-slate-200 dark:border-slate-600 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Пользователь</th>
                      <th className="text-left py-2 px-3 border-b border-slate-200 dark:border-slate-600 font-medium text-slate-700 dark:text-slate-300">Ссылка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanLinksEntries.map((entry, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700/80">
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">{entry.timeFormatted}</td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-mono">{entry.userId || '—'}</td>
                        <td className="py-2 px-3 text-slate-900 dark:text-white break-all">{entry.link}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
