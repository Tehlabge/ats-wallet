'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { getMe, type MeUser } from '@/lib/api';
import { Skeleton } from '@/components/Skeleton';
import { clearSessionUnlocked } from '@/lib/lockSession';
import { useOnboarding } from '@/components/Onboarding';
import { openSupportFromApi } from '@/lib/support';
import { vibrateLight } from '@/lib/vibrate';

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [dark, setDark] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);
  const [homeScreenStatus, setHomeScreenStatus] = useState<'added' | 'missed' | 'unsupported' | 'unknown' | null>(null);
  const [addToHomeScreenMessage, setAddToHomeScreenMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [idCopied, setIdCopied] = useState(false);

  useEffect(() => {
    getMe()
      .then((user) => setMe(user ?? null))
      .catch((err) => {
        if (process.env.NODE_ENV !== 'production') console.error('[Profile] getMe error', err);
        setMe(null);
      })
      .finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const tg = (window as unknown as {
        Telegram?: {
          WebApp?: {
            addToHomeScreen?: () => void;
            checkHomeScreenStatus?: (cb: (status: string) => void) => void;
            onEvent?: (eventType: string, handler: () => void) => void;
            offEvent?: (eventType: string, handler: () => void) => void;
          };
        };
      }).Telegram?.WebApp;
      if (!tg) return;
      setIsTelegramWebApp(true);
      if (typeof tg.checkHomeScreenStatus === 'function') {
        try {
          tg.checkHomeScreenStatus((status: string) => {
            if (status === 'added' || status === 'missed' || status === 'unsupported' || status === 'unknown') {
              setHomeScreenStatus(status);
            }
          });
        } catch {
          setHomeScreenStatus('unsupported');
        }
      }
      const onAdded = () => {
        setHomeScreenStatus('added');
        setAddToHomeScreenMessage({ type: 'success', text: 'Ярлык добавлен на главный экран.' });
        const w = tg as { showAlert?: (msg: string) => void };
        if (typeof w.showAlert === 'function') w.showAlert('Ярлык создан');
      };
      const onFailed = () => {
        setAddToHomeScreenMessage({ type: 'error', text: 'Не удалось добавить ярлык. Попробуйте снова или используйте меню Telegram.' });
      };
      if (typeof tg.onEvent === 'function') {
        tg.onEvent('homeScreenAdded', onAdded);
        tg.onEvent('homeScreenFailed', onFailed);
      }
      return () => {
        if (typeof tg.offEvent === 'function') {
          tg.offEvent('homeScreenAdded', onAdded);
          tg.offEvent('homeScreenFailed', onFailed);
        }
      };
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.error('[Profile] Telegram effect error', e);
      setHomeScreenStatus('unsupported');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('ats_theme');
    const isDark = saved === 'dark' || (saved !== 'light' && document.documentElement.classList.contains('dark'));
    setDark(isDark);
  }, []);

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ats_token');
      localStorage.removeItem('ats_last_active_at');
      clearSessionUnlocked();
    }
    router.push('/login');
    router.refresh();
  };

  const setTheme = (isDark: boolean) => {
    if (typeof window === 'undefined') return;
    setDark(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('ats_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ats_theme', 'light');
    }
  };

  const { resetOnboarding } = useOnboarding();

  const mainItems = [
    { icon: 'settings', label: 'Настройки', href: '/profile/settings' },
    { icon: 'lock', label: 'Безопасность', href: '/profile/security' },
    { icon: 'devices', label: 'Мои сессии', href: '/profile/sessions' },
    { icon: 'newspaper', label: 'Новости', href: '/news' },
    { icon: 'payment', label: 'Как оплачивать', href: '/profile/how-to-pay' },
    { icon: 'groups', label: 'Реферальная программа', href: '/profile/referral' },
    { icon: 'chat_bubble_outline', label: 'Написать в поддержку', href: '/profile/support' },
    { icon: 'help_outline', label: 'Справка ATS WALLET', href: '/profile/help' },
  ];
  const legalItems = [
    { icon: 'description', label: 'Политика конфиденциальности', href: '/profile/privacy' },
    { icon: 'monetization_on', label: 'Политика AML', href: '/profile/aml' },
  ];

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-background-light dark:bg-neutral-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Настройки</h1>
      </header>

      <main className="flex-1 overflow-y-auto pb-32 miniapp-fade-in">
        {/* Карточка профиля: аватар из Telegram, ник, цифровой ID */}
        <div className="px-4 pt-6 pb-4">
          <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-5 flex items-center gap-4">
            {profileLoading ? (
              <>
                <Skeleton className="w-16 h-16 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </>
            ) : me ? (
              <>
                {me.telegramPhotoUrl ? (
                  <img
                    src={me.telegramPhotoUrl}
                    alt=""
                    className="w-16 h-16 rounded-2xl object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-2xl font-bold text-primary">
                      {(me.telegramUsername || me.phone || me.id).charAt(0).toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    {[me.telegramFirstName, me.telegramLastName].filter(Boolean).join(' ') || (me.telegramUsername ? `@${me.telegramUsername}` : me.phone || 'Пользователь')}
                  </p>
                  {(me.telegramUsername && (me.telegramFirstName || me.telegramLastName)) ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">@{me.telegramUsername}</p>
                  ) : null}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-sm text-slate-500 dark:text-slate-400">ID</span>
                    <span className="font-mono font-semibold text-primary text-sm">{me.digitalId || me.id}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const id = me.digitalId || me.id;
                        if (id && navigator.clipboard) {
                          navigator.clipboard.writeText(id);
                          setIdCopied(true);
                          setTimeout(() => setIdCopied(false), 2000);
                        }
                      }}
                      className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                      title={idCopied ? 'Скопировано' : 'Скопировать ID'}
                      aria-label={idCopied ? 'Скопировано' : 'Скопировать ID'}
                    >
                      <span className="material-symbols-outlined text-[20px]">{idCopied ? 'check' : 'content_copy'}</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-sm">Не удалось загрузить профиль</p>
            )}
          </div>
        </div>

        {isTelegramWebApp && homeScreenStatus !== 'added' && (
          <div className="px-4 pt-2 pb-4">
            <button
              type="button"
              onClick={() => {
                const tg = (window as unknown as { Telegram?: { WebApp?: { addToHomeScreen?: () => void } } }).Telegram?.WebApp;
                if (tg?.addToHomeScreen) {
                  setAddToHomeScreenMessage(null);
                  tg.addToHomeScreen();
                }
              }}
              disabled={homeScreenStatus === 'unsupported'}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-neutral-900 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[24px]">add_to_home_screen</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {homeScreenStatus === 'unsupported' ? 'Не поддерживается' : 'Добавить на главный экран'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Создать ярлык для быстрого доступа
                </p>
              </div>
              {homeScreenStatus !== 'unsupported' && (
                <span className="material-symbols-outlined text-slate-400">add_circle</span>
              )}
            </button>
            {addToHomeScreenMessage && (
              <div
                className={`mt-3 p-4 rounded-xl text-sm ${
                  addToHomeScreenMessage.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/20 text-green-800 dark:text-green-200'
                    : 'bg-red-500/10 border border-red-500/20 text-red-800 dark:text-red-200'
                }`}
              >
                {addToHomeScreenMessage.text}
              </div>
            )}
          </div>
        )}

        {profileLoading ? (
          <div className="mt-4 bg-white dark:bg-neutral-900 border-y border-slate-200 dark:border-neutral-800">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center px-4 py-3.5">
                <Skeleton className="w-8 h-8 rounded-lg shrink-0 mr-3" />
                <Skeleton className="h-4 flex-1 max-w-[160px]" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mt-8 bg-white dark:bg-neutral-900 border-y border-slate-200 dark:border-neutral-800">
              {mainItems.map((item, i) => (
                <div key={item.label}>
                  {i > 0 && (
                    <div className="h-[0.5px] ml-14 bg-slate-200 dark:bg-neutral-800" />
                  )}
                  {item.href === '/profile/support' ? (
                    <button
                      type="button"
                      onClick={() => openSupportFromApi()}
                      className="ios-list-item flex items-center w-full px-4 py-3.5 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center mr-3">
                        <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[20px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>chat_bubble_outline</span>
                      </div>
                      <span className="flex-1 text-[16px]">{item.label}</span>
                      <span className="material-symbols-outlined text-slate-300 dark:text-neutral-600 text-[20px]">chevron_right</span>
                    </button>
                  ) : (
                    <Link href={item.href} className="ios-list-item flex items-center px-4 py-3.5 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mr-3">
                        <span className="material-symbols-outlined text-primary text-[22px]">{item.icon}</span>
                      </div>
                      <span className="flex-1 text-[16px]">{item.label}</span>
                      <span className="material-symbols-outlined text-slate-300 dark:text-neutral-600 text-[20px]">chevron_right</span>
                    </Link>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 px-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500 mb-2">
                Юридические документы
              </p>
              <div className="rounded-2xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 overflow-hidden">
                {legalItems.map((item, i) => (
                  <div key={item.label}>
                    {i > 0 && (
                      <div className="h-[0.5px] ml-14 bg-slate-200 dark:bg-neutral-700" />
                    )}
                    <Link
                      href={item.href}
                      className="ios-list-item flex items-center px-4 py-3.5 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-neutral-700 flex items-center justify-center mr-3">
                        <span className="material-symbols-outlined text-slate-500 dark:text-neutral-400 text-[22px]">
                          {item.icon}
                        </span>
                      </div>
                      <span className="flex-1 text-[15px] text-slate-700 dark:text-neutral-300">{item.label}</span>
                      <span className="material-symbols-outlined text-slate-300 dark:text-neutral-600 text-[20px]">
                        chevron_right
                      </span>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-8 bg-white dark:bg-neutral-900 border-y border-slate-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setTheme(!dark)}
            className="ios-list-item flex items-center w-full px-4 py-3.5 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mr-3">
              <span className="material-symbols-outlined text-primary text-[22px]">dark_mode</span>
            </div>
            <span className="flex-1 text-[16px]">Тёмная тема</span>
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              onClick={(e) => { e.stopPropagation(); setTheme(!dark); }}
              className={`relative w-11 h-7 rounded-full transition-colors shrink-0 ${dark ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${dark ? 'left-5' : 'left-1'}`}
              />
            </button>
          </button>
          <div className="h-[0.5px] ml-14 bg-slate-200 dark:bg-neutral-800" />
          <button
            type="button"
            onClick={() => { vibrateLight(); logout(); }}
            className="ios-list-item flex items-center w-full px-4 py-3.5 transition-colors text-left text-red-600 dark:text-red-400"
          >
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center mr-3">
              <span className="material-symbols-outlined text-[22px]">logout</span>
            </div>
            <span className="flex-1 text-[16px] font-medium">Выход</span>
            <span className="material-symbols-outlined text-slate-300 dark:text-neutral-600 text-[20px]">
              chevron_right
            </span>
          </button>
        </div>

        <div className="mt-6 px-4">
          <div className="rounded-2xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                resetOnboarding();
                router.push('/');
              }}
              className="ios-list-item flex items-center w-full px-4 py-3.5 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-neutral-700 flex items-center justify-center mr-3">
                <span className="material-symbols-outlined text-slate-500 dark:text-neutral-400 text-[22px]">
                  school
                </span>
              </div>
              <span className="flex-1 text-[15px] text-slate-700 dark:text-neutral-300">Повторить обучение</span>
              <span className="material-symbols-outlined text-slate-300 dark:text-neutral-600 text-[20px]">
                chevron_right
              </span>
            </button>
            <div className="h-[0.5px] ml-14 bg-slate-200 dark:bg-neutral-700" />
            <Link
              href="/about"
              className="ios-list-item flex items-center px-4 py-3.5 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-neutral-700 flex items-center justify-center mr-3">
                <span className="material-symbols-outlined text-slate-500 dark:text-neutral-400 text-[22px]">
                  info
                </span>
              </div>
              <span className="flex-1 text-[15px] text-slate-700 dark:text-neutral-300">О приложении</span>
              <span className="material-symbols-outlined text-slate-300 dark:text-neutral-600 text-[20px]">
                chevron_right
              </span>
            </Link>
          </div>
        </div>

        <div className="mt-12 mb-12 px-6 text-center">
          <p className="text-[11px] text-slate-400 dark:text-neutral-500 uppercase tracking-widest font-semibold">
            @ATS WALLET v2.4.12
          </p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
