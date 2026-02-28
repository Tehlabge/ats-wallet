'use client';

import { useEffect, useState, useMemo } from 'react';
import { getAdminSessions, deleteAdminSession, deleteAdminSessionsBatch, type AdminSessionItem } from '@/lib/api';

function parseDeviceLabel(ua: string): string {
  if (!ua || typeof ua !== 'string') return 'Неизвестно';
  const u = ua.toLowerCase();
  let browser = 'Браузер';
  if (u.includes('edg/')) browser = 'Edge';
  else if (u.includes('chrome') && !u.includes('edg')) browser = 'Chrome';
  else if (u.includes('firefox')) browser = 'Firefox';
  else if (u.includes('safari') && !u.includes('chrome')) browser = 'Safari';
  else if (u.includes('opera') || u.includes('opr/')) browser = 'Opera';
  let os = 'ОС';
  if (u.includes('windows')) os = 'Windows';
  else if (u.includes('mac os') || u.includes('macintosh')) os = 'macOS';
  else if (u.includes('android')) os = 'Android';
  else if (u.includes('iphone') || u.includes('ipad')) os = u.includes('ipad') ? 'iPad' : 'iPhone';
  else if (u.includes('linux')) os = 'Linux';
  return `${browser}, ${os}`;
}

function groupAdminSessionsByDevice(sessions: AdminSessionItem[]): Map<string, AdminSessionItem[]> {
  const map = new Map<string, AdminSessionItem[]>();
  for (const s of sessions) {
    const key = `${s.login}|${parseDeviceLabel(s.userAgent || '')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  Array.from(map.values()).forEach((arr) => {
    arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });
  return map;
}

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<AdminSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    getAdminSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => groupAdminSessionsByDevice(sessions), [sessions]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map(s => s.id)));
    }
  };

  const handleDeleteOne = async (id: number) => {
    if (!confirm('Удалить эту запись о сессии?')) return;
    setDeleting(true);
    try {
      await deleteAdminSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      alert('Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Удалить ${selectedIds.size} записей о сессиях?`)) return;
    setDeleting(true);
    try {
      await deleteAdminSessionsBatch(Array.from(selectedIds));
      setSessions(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } catch {
      alert('Ошибка удаления');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Сессии админов</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Группировка по логину и устройству · {sessions.length} записей
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <span className="material-icons-round text-lg">delete</span>
              Удалить ({selectedIds.size})
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <span className={`material-icons-round text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
            Обновить
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-12 text-center text-slate-500">
          Нет записей о сессиях
        </div>
      ) : (
        <div className="space-y-6">
          {/* Select all */}
          <div className="flex items-center gap-3 px-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={selectedIds.size === sessions.length && sessions.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              Выбрать все
            </label>
          </div>

          {Array.from(grouped.entries()).map(([key, items]) => {
            const [login, deviceLabel] = key.split('|');
            const device = deviceLabel || 'Устройство';
            const groupIds = items.map(s => s.id);
            const allSelected = groupIds.every(id => selectedIds.has(id));
            const someSelected = groupIds.some(id => selectedIds.has(id));

            const toggleGroup = () => {
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (allSelected) {
                  groupIds.forEach(id => next.delete(id));
                } else {
                  groupIds.forEach(id => next.add(id));
                }
                return next;
              });
            };

            return (
              <div key={key} className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 flex-wrap">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={toggleGroup}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="font-semibold text-slate-900 dark:text-white">{login}</span>
                  <span className="text-slate-500 dark:text-slate-400">·</span>
                  <span className="text-slate-600 dark:text-slate-300 text-sm">{device}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                    ({items.length} {items.length === 1 ? 'вход' : items.length < 5 ? 'входа' : 'входов'})
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary shrink-0"
                      />
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 flex-1 min-w-0">
                        <span className="font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {s.ip || '—'}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {new Date(s.createdAt).toLocaleString('ru-RU')}
                        </span>
                        {s.userAgent && (
                          <span className="text-slate-400 dark:text-slate-500 text-xs max-w-md truncate" title={s.userAgent}>
                            {s.userAgent}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteOne(s.id)}
                        disabled={deleting}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                        title="Удалить"
                      >
                        <span className="material-icons-round text-lg">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
