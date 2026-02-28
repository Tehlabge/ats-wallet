'use client';

import { useEffect, useState } from 'react';
import { getMe, getSeed, confirmSeedSeen, sendComponentLog } from '@/lib/api';

export default function SeedGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'need_seed' | 'done'>('loading');
  const [words, setWords] = useState<string[]>([]);
  const [phrase, setPhrase] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getMe()
      .then((me) => {
        if (me?.seedSeen) {
          setStatus('done');
          sendComponentLog('auth', 'seed_gate_skip_seen');
          return;
        }
        return getSeed().then((data) => {
          if (data) {
            setWords(data.words);
            setPhrase(data.phrase);
            setStatus('need_seed');
          } else {
            setStatus('done');
            sendComponentLog('auth', 'seed_gate_skip_no_seed');
          }
        });
      })
      .catch(() => {
        setStatus('done');
        sendComponentLog('auth', 'seed_gate_error');
      });
  }, []);

  const handleCopy = async () => {
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      // fallback: select and copy
      const el = document.createElement('textarea');
      el.value = phrase;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const ok = await confirmSeedSeen();
      if (ok) setStatus('done');
    } finally {
      setConfirming(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <span className="material-icons-round animate-spin text-4xl text-primary">progress_activity</span>
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Загрузка…</p>
      </div>
    );
  }

  if (status === 'done') {
    return <>{children}</>;
  }
  // status === 'need_seed' — показываем экран сида ниже

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-white dark:bg-slate-900">
      <div className="flex-1 flex flex-col px-5 pt-8 pb-10 max-w-[430px] mx-auto w-full">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <span className="material-icons-round text-amber-600 dark:text-amber-400 text-2xl">vpn_key</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Seed-фраза</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Сохраните её в надёжном месте</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Это 12 слов для восстановления доступа к кошельку. <strong className="text-amber-700 dark:text-amber-400">Восстановление без seed-фразы невозможно.</strong>
        </p>

        <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 mb-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {words.map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500 w-5 tabular-nums">{i + 1}.</span>
                <span className="font-medium text-slate-900 dark:text-white">{w}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="w-full py-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium flex items-center justify-center gap-2 mb-6 active:scale-[0.98]"
        >
          <span className="material-icons-round text-[20px]">{copyDone ? 'check' : 'content_copy'}</span>
          {copyDone ? 'Скопировано' : 'Копировать фразу'}
        </button>

        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4 mb-6">
          <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <span className="material-icons-round text-amber-600 dark:text-amber-400 text-lg shrink-0 mt-0.5">info</span>
            <span>
              <strong>Не рекомендуем</strong> хранить seed-фразу в доступном для других людей месте (скриншоты, облако, мессенджеры). Лучше записать на бумаге и хранить в безопасном месте.
            </span>
          </p>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
          После нажатия «Я сохранил» фраза больше не будет показываться. Доступ к кошельку без неё восстановить нельзя.
        </p>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/25 active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {confirming ? (
            <span className="material-icons-round animate-spin text-[20px]">progress_activity</span>
          ) : (
            <span className="material-icons-round text-[20px]">check_circle</span>
          )}
          {confirming ? 'Сохранение…' : 'Я сохранил'}
        </button>
      </div>
    </div>
  );
}
