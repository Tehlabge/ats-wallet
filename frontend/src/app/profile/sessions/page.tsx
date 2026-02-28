'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { getSessions, revokeSessions, type SessionItem } from '@/lib/api';
import { SessionsListSkeleton } from '@/components/Skeleton';
import { vibrateLight, vibrateSuccess } from '@/lib/vibrate';

function parseUserAgent(ua?: string): { device: string; browser: string; os: string; icon: string } {
  if (!ua) return { device: 'Устройство', browser: '', os: '', icon: 'devices' };

  const lower = ua.toLowerCase();

  if (lower.includes('telegram') || lower.includes('tgweb')) {
    return { device: 'Telegram Mini App', browser: 'Telegram', os: '', icon: 'send' };
  }
  if (lower.includes('iphone')) {
    const browser = lower.includes('safari') ? 'Safari' : lower.includes('chrome') ? 'Chrome' : 'Браузер';
    return { device: 'iPhone', browser, os: 'iOS', icon: 'phone_iphone' };
  }
  if (lower.includes('ipad')) {
    return { device: 'iPad', browser: 'Safari', os: 'iPadOS', icon: 'tablet_mac' };
  }
  if (lower.includes('android')) {
    const browser = lower.includes('chrome') ? 'Chrome' : lower.includes('firefox') ? 'Firefox' : 'Браузер';
    return { device: 'Android', browser, os: 'Android', icon: 'phone_android' };
  }
  if (lower.includes('macintosh') || lower.includes('mac os')) {
    const browser = lower.includes('chrome') ? 'Chrome' : lower.includes('safari') ? 'Safari' : lower.includes('firefox') ? 'Firefox' : 'Браузер';
    return { device: 'Mac', browser, os: 'macOS', icon: 'laptop_mac' };
  }
  if (lower.includes('windows')) {
    const browser = lower.includes('chrome') ? 'Chrome' : lower.includes('edge') ? 'Edge' : lower.includes('firefox') ? 'Firefox' : 'Браузер';
    return { device: 'Windows', browser, os: 'Windows', icon: 'laptop_windows' };
  }
  if (lower.includes('linux')) {
    const browser = lower.includes('chrome') ? 'Chrome' : lower.includes('firefox') ? 'Firefox' : 'Браузер';
    return { device: 'Linux', browser, os: 'Linux', icon: 'computer' };
  }

  return { device: 'Устройство', browser: '', os: '', icon: 'devices' };
}

type DeviceGroup = {
  deviceLabel: string;
  icon: string;
  browser: string;
  os: string;
  lastActive: string;
  ip: string;
  current: boolean;
  sessionIds: string[];
};

function groupSessionsByDevice(sessions: SessionItem[]): DeviceGroup[] {
  const byKey = new Map<string, { sessions: SessionItem[]; icon: string; device: string; browser: string; os: string }>();
  for (const s of sessions) {
    const p = parseUserAgent(s.userAgent);
    const key = `${p.device}|${p.browser}`;
    if (!byKey.has(key)) {
      byKey.set(key, { sessions: [], icon: p.icon, device: p.device, browser: p.browser, os: p.os });
    }
    byKey.get(key)!.sessions.push(s);
  }
  const result: DeviceGroup[] = [];
  Array.from(byKey.values()).forEach((group) => {
    group.sessions.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
    const latest = group.sessions[0];
    result.push({
      deviceLabel: group.device + (group.browser ? ` · ${group.browser}` : ''),
      icon: group.icon,
      browser: group.browser,
      os: group.os,
      lastActive: latest.lastActive,
      ip: latest.ip || '',
      current: latest.current,
      sessionIds: group.sessions.map((s) => s.id),
    });
  });
  result.sort((a, b) => {
    if (a.current) return -1;
    if (b.current) return 1;
    return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
  });
  return result;
}

function formatLastActiveFull(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const deviceGroups = useMemo(() => groupSessionsByDevice(sessions), [sessions]);
  const otherDevices = deviceGroups.filter((d) => !d.current);

  const revokeDevice = async (group: DeviceGroup) => {
    if (group.current || group.sessionIds.length === 0) return;
    const key = group.sessionIds[0];
    setBusyIds((prev) => new Set(prev).add(key));
    vibrateLight();
    try {
      await revokeSessions(group.sessionIds);
      setSessions((prev) => prev.filter((s) => !group.sessionIds.includes(s.id)));
      vibrateSuccess();
    } catch {
      // ignore
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const revokeAllOthers = async () => {
    const ids = otherDevices.flatMap((d) => d.sessionIds);
    if (ids.length === 0) return;
    setBusyIds(new Set(ids));
    vibrateLight();
    try {
      await revokeSessions(ids);
      setSessions((prev) => prev.filter((s) => s.current));
      vibrateSuccess();
    } catch {
      // ignore
    } finally {
      setBusyIds(new Set());
    }
  };

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-background-light dark:bg-neutral-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      {loading && <div className="loading-bar bg-primary/10" role="progressbar" aria-label="Загрузка" />}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link
          href="/profile"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary"
          aria-label="Назад"
          onClick={() => vibrateLight()}
        >
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Мои сессии</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
          Устройства, с которых вы входили в аккаунт. Для каждого показан последний вход. Завершите сессию на устройстве, если им больше не пользуетесь.
        </p>

        {loading ? (
          <SessionsListSkeleton rows={4} />
        ) : (
          <>
            <div className="space-y-4">
              {deviceGroups.map((group) => (
                <div
                  key={group.deviceLabel + group.lastActive}
                  className={`rounded-2xl border overflow-hidden ${
                    group.current
                      ? 'bg-primary/10 dark:bg-primary/15 border-primary/30 dark:border-primary/40'
                      : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                          group.current ? 'bg-primary/20 dark:bg-primary/30' : 'bg-slate-100 dark:bg-neutral-800'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-2xl ${group.current ? 'text-primary' : 'text-slate-600 dark:text-slate-400'}`}
                          style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
                        >
                          {group.icon}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{group.deviceLabel}</p>
                        {(group.os || group.browser) && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {[group.os, group.browser].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                          Последний вход: {formatLastActiveFull(group.lastActive)}
                        </p>
                        {group.ip && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">IP: {group.ip}</p>
                        )}
                        {group.current && (
                          <span className="inline-block mt-2 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
                            Текущее устройство
                          </span>
                        )}
                      </div>
                    </div>
                    {!group.current && (
                      <button
                        type="button"
                        disabled={busyIds.has(group.sessionIds[0])}
                        onClick={() => revokeDevice(group)}
                        className="mt-4 w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm font-medium disabled:opacity-50 active:scale-[0.99]"
                      >
                        {busyIds.has(group.sessionIds[0]) ? 'Завершаем…' : 'Завершить сессию на этом устройстве'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {sessions.length === 0 && !loading && (
              <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-8">Нет активных сессий</p>
            )}

            {otherDevices.length > 0 && (
              <button
                type="button"
                onClick={revokeAllOthers}
                disabled={busyIds.size > 0}
                className="mt-6 w-full py-3 rounded-2xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-medium disabled:opacity-50 active:scale-[0.99]"
              >
                Завершить все другие сессии
              </button>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
