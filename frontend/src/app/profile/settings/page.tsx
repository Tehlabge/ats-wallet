'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { getNotificationSettings, patchNotificationSettings, getPublicSettings, type NotificationSettings } from '@/lib/api';
import { APP_VERSION_FALLBACK } from '@/lib/version';
import { isAuthAfterCloseEnabled, setAuthAfterCloseEnabled } from '@/lib/lockSession';
import { isAuthDebugEnabled, setAuthDebugEnabled } from '@/lib/authLogger';

const NEWS_KEY = 'ats_news_on_main';

function useLocalSetting(key: string, defaultOn: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOn;
    const v = localStorage.getItem(key);
    if (v === null) return defaultOn;
    return v === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, value ? '1' : '0');
  }, [key, value]);
  return [value, setValue];
}

export default function SettingsPage() {
  const [notifDeposit, setNotifDeposit] = useState(true);
  const [notifWithdraw, setNotifWithdraw] = useState(true);
  const [notifSupport, setNotifSupport] = useState(true);
  const [notifPromo, setNotifPromo] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [newsOnMain, setNewsOnMain] = useLocalSetting(NEWS_KEY, true);
  const [authAfterClose, setAuthAfterClose] = useState(false);
  const [authDebug, setAuthDebug] = useState(false);
  const [appVersion, setAppVersion] = useState(APP_VERSION_FALLBACK);

  useEffect(() => {
    setAuthAfterClose(isAuthAfterCloseEnabled());
    setAuthDebug(isAuthDebugEnabled());
  }, []);

  useEffect(() => {
    getPublicSettings().then((s) => setAppVersion(s.appVersion || APP_VERSION_FALLBACK)).catch(() => {});
  }, []);

  useEffect(() => {
    getNotificationSettings()
      .then((s) => {
        setNotifDeposit(s.notifDeposit);
        setNotifWithdraw(s.notifWithdraw);
        setNotifSupport(s.notifSupport);
        setNotifPromo(s.notifPromo);
      })
      .catch(() => {})
      .finally(() => setNotifLoading(false));
  }, []);

  const updateNotif = useCallback(async (key: keyof NotificationSettings, value: boolean) => {
    // Оптимистичное обновление UI
    if (key === 'notifDeposit') setNotifDeposit(value);
    if (key === 'notifWithdraw') setNotifWithdraw(value);
    if (key === 'notifSupport') setNotifSupport(value);
    if (key === 'notifPromo') setNotifPromo(value);
    
    setNotifSaving(true);
    try {
      const patch = { [key]: value };
      const next = await patchNotificationSettings(patch);
      // Синхронизируем с сервером на всякий случай
      setNotifDeposit(next.notifDeposit);
      setNotifWithdraw(next.notifWithdraw);
      setNotifSupport(next.notifSupport);
      setNotifPromo(next.notifPromo);
    } catch {
      // При ошибке откатываем
      if (key === 'notifDeposit') setNotifDeposit(!value);
      if (key === 'notifWithdraw') setNotifWithdraw(!value);
      if (key === 'notifSupport') setNotifSupport(!value);
      if (key === 'notifPromo') setNotifPromo(!value);
    } finally {
      setNotifSaving(false);
    }
  }, []);

  const Toggle = ({
    checked,
    onChange,
    disabled,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );

  const SettingRow = ({
    icon,
    iconBg,
    iconColor,
    title,
    subtitle,
    checked,
    onChange,
    disabled,
  }: {
    icon: string;
    iconBg: string;
    iconColor: string;
    title: string;
    subtitle: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <div className="flex items-center gap-4 py-4">
      <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined ${iconColor} text-[22px]`}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 dark:text-white text-[15px]">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{subtitle}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-background-light dark:bg-neutral-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Настройки</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="material-symbols-outlined text-primary text-[20px]">notifications</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Уведомления
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 px-1">
            Получать сообщения в Telegram при указанных событиях
          </p>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 divide-y divide-slate-100 dark:divide-neutral-800 px-4 shadow-sm">
            {notifLoading ? (
              <div className="py-10 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-full border-3 border-primary/30 border-t-primary animate-spin" />
                <span className="text-sm text-slate-400">Загрузка настроек...</span>
              </div>
            ) : (
              <>
                <SettingRow
                  icon="account_balance_wallet"
                  iconBg="bg-emerald-500/10"
                  iconColor="text-emerald-600 dark:text-emerald-400"
                  title="Пополнение баланса"
                  subtitle="При зачислении средств на счёт"
                  checked={notifDeposit}
                  onChange={(v) => updateNotif('notifDeposit', v)}
                  disabled={notifSaving}
                />
                <SettingRow
                  icon="payments"
                  iconBg="bg-blue-500/10"
                  iconColor="text-blue-600 dark:text-blue-400"
                  title="Списание средств"
                  subtitle="Когда вывод выполнен"
                  checked={notifWithdraw}
                  onChange={(v) => updateNotif('notifWithdraw', v)}
                  disabled={notifSaving}
                />
                <SettingRow
                  icon="support_agent"
                  iconBg="bg-purple-500/10"
                  iconColor="text-purple-600 dark:text-purple-400"
                  title="Ответ поддержки"
                  subtitle="Сообщения от тех. поддержки"
                  checked={notifSupport}
                  onChange={(v) => updateNotif('notifSupport', v)}
                  disabled={notifSaving}
                />
                <SettingRow
                  icon="campaign"
                  iconBg="bg-amber-500/10"
                  iconColor="text-amber-600 dark:text-amber-400"
                  title="Акции и новости"
                  subtitle="Спецпредложения и рассылки"
                  checked={notifPromo}
                  onChange={(v) => updateNotif('notifPromo', v)}
                  disabled={notifSaving}
                />
              </>
            )}
          </div>
        </section>

        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="material-symbols-outlined text-primary text-[20px]">security</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Безопасность
            </h2>
          </div>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 px-4 shadow-sm mb-6">
            <SettingRow
              icon="lock"
              iconBg="bg-amber-500/10"
              iconColor="text-amber-600 dark:text-amber-400"
              title="Авторизация после закрытия"
              subtitle={authAfterClose ? 'Каждый раз при открытии приложения' : 'По таймауту неактивности'}
              checked={authAfterClose}
              onChange={(v) => {
                setAuthAfterClose(v);
                setAuthAfterCloseEnabled(v);
              }}
            />
            <SettingRow
              icon="bug_report"
              iconBg="bg-slate-100 dark:bg-slate-800"
              iconColor="text-slate-600 dark:text-slate-400"
              title="Лог авторизации"
              subtitle={authDebug ? 'При ошибке биометрии показывать отладочные логи' : 'Отключено'}
              checked={authDebug}
              onChange={(v) => {
                setAuthDebug(v);
                setAuthDebugEnabled(v);
              }}
            />
          </div>
        </section>

        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="material-symbols-outlined text-primary text-[20px]">dashboard</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Главный экран
            </h2>
          </div>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 px-4 shadow-sm">
            <SettingRow
              icon="newspaper"
              iconBg="bg-slate-100 dark:bg-slate-800"
              iconColor="text-slate-600 dark:text-slate-400"
              title="Блок новостей"
              subtitle={newsOnMain ? 'Отображается на главном экране' : 'Скрыт с главного экрана'}
              checked={newsOnMain}
              onChange={setNewsOnMain}
            />
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="material-symbols-outlined text-primary text-[20px]">info</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              О приложении
            </h2>
          </div>
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[28px]">account_balance_wallet</span>
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-lg">ATS WALLET</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Версия {appVersion}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Безопасный кошелёк для USDT. Пополняйте баланс, оплачивайте по QR-коду, выводите на карту или другой кошелёк.
              </p>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
