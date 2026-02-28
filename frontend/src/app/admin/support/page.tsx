'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { setSupportBotWebhook, getSupportBotLog } from '@/lib/api';

export default function AdminSupportPage() {
  const [supportBotToken, setSupportBotToken] = useState('');
  const [supportBotTokenEdit, setSupportBotTokenEdit] = useState('');
  const [supportGroupId, setSupportGroupId] = useState('');
  const [supportGroupIdEdit, setSupportGroupIdEdit] = useState('');
  const [supportBotUsername, setSupportBotUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [currentWebhookUrl, setCurrentWebhookUrl] = useState('');
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookSuccess, setWebhookSuccess] = useState<string | null>(null);

  const [supportBotLogRaw, setSupportBotLogRaw] = useState('');
  const [supportBotLogLoading, setSupportBotLogLoading] = useState(false);
  const [supportBotLogError, setSupportBotLogError] = useState<string | null>(null);

  const [chatCheckLoading, setChatCheckLoading] = useState(false);
  const [chatCheckResult, setChatCheckResult] = useState<{ ok: boolean; type?: string; title?: string; isForum?: boolean; error?: string; hint?: string; notForumHint?: string; isForumHint?: string } | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ats_admin_token') : null;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      fetch('/api/admin/settings/support-bot-token', { headers }).then((r) => r.json()),
      fetch('/api/admin/support-bot/info', { headers }).then((r) => r.json()),
    ])
      .then(([tokenData, infoData]) => {
        setSupportBotToken(tokenData.configured ? tokenData.supportBotToken : '');
        setSupportBotTokenEdit('');
        setSupportGroupId(infoData.supportGroupId || '');
        setSupportGroupIdEdit(infoData.supportGroupId || '');
        setSupportBotUsername(infoData.supportBotUsername || '');
        setCurrentWebhookUrl(infoData.webhookUrl || '');
        if (infoData.webhookUrl) setWebhookUrl((prev) => prev || infoData.webhookUrl);
      })
      .catch(() => {
        setSupportBotToken('');
        setSupportGroupId('');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !webhookUrl) {
      const base = window.location.origin;
      setWebhookUrl(base + '/api/webhook/support-bot');
    }
  }, [webhookUrl]);

  const handleSaveToken = async () => {
    if (!supportBotTokenEdit.trim()) return;
    setTokenSaving(true);
    try {
      const res = await fetch('/api/admin/settings/support-bot-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ats_admin_token')}`,
        },
        body: JSON.stringify({ token: supportBotTokenEdit.trim() }),
      });
      if (res.ok) {
        setSupportBotToken(supportBotTokenEdit.trim());
        setSupportBotTokenEdit('');
        alert('Токен сохранён');
      } else {
        alert('Ошибка сохранения');
      }
    } catch {
      alert('Ошибка сохранения');
    } finally {
      setTokenSaving(false);
    }
  };

  const handleSaveGroupId = async () => {
    setGroupSaving(true);
    try {
      const res = await fetch('/api/admin/support-bot/set-group-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ats_admin_token')}`,
        },
        body: JSON.stringify({ groupId: supportGroupIdEdit.trim() }),
      });
      if (res.ok) {
        setSupportGroupId(supportGroupIdEdit.trim());
        alert('ID группы сохранён');
      } else {
        alert('Ошибка сохранения');
      }
    } catch {
      alert('Ошибка сохранения');
    } finally {
      setGroupSaving(false);
    }
  };

  const handleSetWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setWebhookError(null);
    setWebhookSuccess(null);
    setSettingWebhook(true);
    try {
      await setSupportBotWebhook(webhookUrl);
      setWebhookSuccess(`Вебхук установлен: ${webhookUrl}`);
    } catch (e) {
      setWebhookError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSettingWebhook(false);
    }
  };

  const loadSupportBotLog = () => {
    setSupportBotLogLoading(true);
    setSupportBotLogError(null);
    getSupportBotLog()
      .then((r) => {
        setSupportBotLogRaw(r.raw ?? '');
      })
      .catch((e) => {
        setSupportBotLogError(e instanceof Error ? e.message : 'Ошибка загрузки');
      })
      .finally(() => setSupportBotLogLoading(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="material-icons-round animate-spin text-3xl text-slate-400">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Техподдержка</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-[15px]">
          Бот для приёма обращений в Telegram. Токен, вебхук и группа с темами.
        </p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Токен бота</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
          Создайте бота через @BotFather в Telegram и вставьте токен.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="password"
            value={supportBotTokenEdit}
            onChange={(e) => setSupportBotTokenEdit(e.target.value)}
            placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
            className="flex-1 min-w-[200px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm"
          />
          <button
            type="button"
            onClick={handleSaveToken}
            disabled={tokenSaving || !supportBotTokenEdit.trim()}
            className="px-4 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
          >
            {tokenSaving ? '…' : 'Сохранить'}
          </button>
        </div>
        {supportBotToken && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-2">
            Токен сохранён. Бот: {supportBotUsername ? `@${supportBotUsername}` : '—'}
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Вебхук</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
          Telegram шлёт обновления на этот URL (HTTPS). Путь с префиксом <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/api</code> — типичный вариант.
        </p>
        {currentWebhookUrl ? (
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 font-mono break-all bg-slate-100 dark:bg-slate-800/80 rounded-lg px-3 py-2">
            Сейчас в Telegram: <span className="text-primary">{currentWebhookUrl || '—'}</span>
          </p>
        ) : supportBotToken && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">Вебхук не установлен — бот не получает сообщения. Установите URL ниже.</p>
        )}
        <div className="space-y-3">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://yourdomain.com/api/webhook/support-bot"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={handleSetWebhook}
            disabled={settingWebhook || !supportBotToken || !webhookUrl.trim()}
            className="px-4 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2 hover:bg-primary/90 transition-colors"
          >
            {settingWebhook ? (
              <span className="material-icons-round animate-spin text-lg">progress_activity</span>
            ) : (
              <span className="material-icons-round text-lg">link</span>
            )}
            {settingWebhook ? 'Установка…' : 'Установить вебхук'}
          </button>
          {webhookError && <p className="text-sm text-red-600 dark:text-red-400">{webhookError}</p>}
          {webhookSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">{webhookSuccess}</p>}
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm hover:shadow-md transition-shadow">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">ID группы с темами (форум)</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
          Если указать ID группы с включёнными темами — для каждого пользователя создаётся тема, ответы в теме пересылаются ему в личку. Иначе сообщения приходят в один чат (оператор сначала пишет боту <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/start</code>).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={supportGroupIdEdit}
            onChange={(e) => setSupportGroupIdEdit(e.target.value)}
            placeholder="-1001234567890"
            className="flex-1 min-w-[180px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm"
          />
          <button
            type="button"
            onClick={handleSaveGroupId}
            disabled={groupSaving}
            className="px-4 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
          >
            {groupSaving ? '…' : 'Сохранить'}
          </button>
        </div>
        {supportGroupId && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Текущий ID: {supportGroupId} (из настроек или ENV)</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Если ID задан в ENV (SUPPORT_GROUP_ID), он имеет приоритет. Чтобы не подхватывать старый ID из БД — нажмите «Очистить данные группы».</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!confirm('Удалить из БД ID группы и все привязки тем? Будет использоваться только SUPPORT_GROUP_ID из .env.')) return;
              try {
                const res = await fetch('/api/admin/support-bot/clear-group-data', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${localStorage.getItem('ats_admin_token')}` },
                });
                const data = await res.json();
                if (res.ok) {
                  setSupportGroupId('');
                  setSupportGroupIdEdit('');
                  alert(data.message || 'Очищено');
                  fetch('/api/admin/support-bot/info', { headers: { Authorization: `Bearer ${localStorage.getItem('ats_admin_token')}` } })
                    .then((r) => r.json())
                    .then((infoData) => {
                      setSupportGroupId(infoData.supportGroupId || '');
                      setSupportGroupIdEdit(infoData.supportGroupId || '');
                    })
                    .catch(() => {});
                } else {
                  alert(data.message || 'Ошибка');
                }
              } catch {
                alert('Ошибка запроса');
              }
            }}
            className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-xl text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50"
          >
            Очистить данные группы
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              setChatCheckLoading(true);
              setChatCheckResult(null);
              const gid = supportGroupIdEdit.trim() || supportGroupId;
              try {
                const res = await fetch(`/api/admin/support-bot/chat-info${gid ? `?groupId=${encodeURIComponent(gid)}` : ''}`, {
                  headers: { Authorization: `Bearer ${localStorage.getItem('ats_admin_token')}` },
                });
                const data = await res.json();
                setChatCheckResult(data);
              } catch {
                setChatCheckResult({ ok: false, error: 'Ошибка запроса', hint: 'Проверьте сеть и токен бота.' });
              } finally {
                setChatCheckLoading(false);
              }
            }}
            disabled={chatCheckLoading || !supportBotToken}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            {chatCheckLoading ? 'Проверка…' : 'Проверить группу'}
          </button>
          {chatCheckResult && (
            <div className={`rounded-xl px-4 py-3 text-sm ${chatCheckResult.ok ? 'bg-slate-100 dark:bg-slate-800' : 'bg-red-50 dark:bg-red-900/20'}`}>
              {chatCheckResult.ok ? (
                <>
                  <p className="font-medium text-slate-900 dark:text-white">{chatCheckResult.title || '—'} (тип: {chatCheckResult.type})</p>
                  <p className={chatCheckResult.isForum ? 'text-emerald-600 dark:text-emerald-400 mt-1' : 'text-amber-600 dark:text-amber-400 mt-1'}>
                    {chatCheckResult.isForum ? chatCheckResult.isForumHint : chatCheckResult.notForumHint}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-red-600 dark:text-red-400 font-medium">Ошибка: {chatCheckResult.error}</p>
                  {chatCheckResult.hint && <p className="text-slate-600 dark:text-slate-400 mt-1">{chatCheckResult.hint}</p>}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Лог бота (support_bot.log)</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
          События вебхука и отправки сообщений. Помогает отладить, если бот не отвечает.
        </p>
        <button
          type="button"
          onClick={loadSupportBotLog}
          disabled={supportBotLogLoading}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 mb-3"
        >
          {supportBotLogLoading ? 'Загрузка…' : 'Обновить лог'}
        </button>
        {supportBotLogError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{supportBotLogError}</p>}
        <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-900 rounded-xl p-4 max-h-[320px] overflow-auto whitespace-pre-wrap break-all text-slate-700 dark:text-slate-300">
          {supportBotLogRaw || '(нажмите «Обновить лог»)'}
        </pre>
      </div>

      <div className="rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 p-6">
        <h3 className="font-medium text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <span className="material-icons-round text-lg">info</span>
          Как пользоваться
        </h3>
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside">
          <li>Сохраните токен бота и установите вебхук (URL должен быть доступен по HTTPS).</li>
          <li><strong>Режим «группа с темами»:</strong> создайте группу → включите Topics → добавьте бота админом → укажите ID группы выше.</li>
          <li><strong>Режим «один чат»:</strong> напишите боту в Telegram <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">/start</code> — этот чат будет получать сообщения с кнопкой «Ответить».</li>
          <li>Ответы пользователям отправляйте в личку бота или в теме группы; из приложения — в карточке пользователя в разделе <Link href="/admin/users" className="text-primary hover:underline">Пользователи</Link>.
          </li>
        </ul>
      </div>
    </div>
  );
}
