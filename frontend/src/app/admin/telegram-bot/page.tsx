'use client';

import { useEffect, useState } from 'react';
import {
  getTelegramBotStarts,
  getTelegramWebhookInfo,
  setTelegramWebhook,
  telegramBroadcast,
  type TelegramBotStartItem,
  type TelegramWebhookInfo,
} from '@/lib/api';

export default function AdminTelegramBotPage() {
  const [list, setList] = useState<TelegramBotStartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [webhookInfo, setWebhookInfo] = useState<TelegramWebhookInfo | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(true);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookSuccess, setWebhookSuccess] = useState<string | null>(null);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastOnlyPromo, setBroadcastOnlyPromo] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getTelegramBotStarts()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setWebhookLoading(true);
    getTelegramWebhookInfo()
      .then(setWebhookInfo)
      .catch(() => setWebhookInfo(null))
      .finally(() => setWebhookLoading(false));
  }, []);

  const handleSetWebhook = async () => {
    setWebhookError(null);
    setWebhookSuccess(null);
    setSettingWebhook(true);
    try {
      const res = await setTelegramWebhook();
      setWebhookSuccess(res.webhookUrl ? `Вебхук установлен: ${res.webhookUrl}` : 'Готово');
      getTelegramWebhookInfo().then(setWebhookInfo).catch(() => {});
    } catch (e) {
      setWebhookError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSettingWebhook(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setBroadcastError(null);
    setBroadcastResult(null);
    setBroadcastSending(true);
    try {
      const res = await telegramBroadcast(broadcastText, broadcastOnlyPromo);
      setBroadcastResult({ sent: res.sent, failed: res.failed, total: res.total });
      setBroadcastText('');
    } catch (e) {
      setBroadcastError(e instanceof Error ? e.message : 'Ошибка рассылки');
    } finally {
      setBroadcastSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Telegram-бот</h1>
        <p className="text-slate-500 mt-1">Подключение вебхука и список тех, кто нажал /start</p>
      </div>

      {/* Блок: информация о подключении бота */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Подключение бота</h2>
        {webhookLoading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <span className="material-icons-round animate-spin text-xl">progress_activity</span>
            Загрузка…
          </div>
        ) : webhookInfo ? (
          <div className="space-y-3">
            {!webhookInfo.hasToken ? (
              <p className="text-amber-600 dark:text-amber-400 text-sm">{webhookInfo.message ?? 'Токен не задан'}</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {webhookInfo.connected ? (
                    <span className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      Вебхук подключён
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      Вебхук не установлен
                    </span>
                  )}
                </div>
                {webhookInfo.webhookUrl && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-mono break-all">{webhookInfo.webhookUrl}</p>
                )}
                {webhookInfo.lastErrorMessage && (
                  <div className="text-sm text-red-600 dark:text-red-400 space-y-1">
                    <p>Ошибка Telegram: {webhookInfo.lastErrorMessage}</p>
                    {webhookInfo.lastErrorMessage.includes('404') && webhookInfo.suggestedWebhookUrl && (
                      <div className="text-amber-600 dark:text-amber-400 mt-2 space-y-2">
                        <p>
                          На некоторых хостингах бэкенд доступен по префиксу <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/api</code>. Нажмите кнопку ниже, чтобы установить вебхук на путь <code>/api/webhook/telegram-bot</code>:
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            const url = webhookInfo.suggestedWebhookUrl!.replace('/webhook/telegram-bot', '/api/webhook/telegram-bot');
                            setWebhookError(null);
                            setWebhookSuccess(null);
                            setSettingWebhook(true);
                            try {
                              const res = await setTelegramWebhook(url);
                              setWebhookSuccess(res.webhookUrl ? `Вебхук установлен: ${res.webhookUrl}` : 'Готово');
                              getTelegramWebhookInfo().then(setWebhookInfo).catch(() => {});
                            } catch (e) {
                              setWebhookError(e instanceof Error ? e.message : 'Ошибка');
                            } finally {
                              setSettingWebhook(false);
                            }
                          }}
                          disabled={settingWebhook}
                          className="px-3 py-2 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-200 text-sm font-medium"
                        >
                          Установить вебхук на /api/webhook/telegram-bot
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {webhookInfo.pendingUpdateCount != null && webhookInfo.pendingUpdateCount > 0 && (
                  <p className="text-sm text-slate-500">Ожидающих обновлений: {webhookInfo.pendingUpdateCount}</p>
                )}
                {webhookInfo.suggestedWebhookUrl && (
                  <div className="pt-2">
                    {!webhookInfo.connected && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Укажите в TELEGRAM_WEBHOOK_BASE публичный URL бэкенда, затем нажмите кнопку:</p>
                    )}
                    <button
                      type="button"
                      onClick={handleSetWebhook}
                      disabled={settingWebhook || !webhookInfo.webhookBase || webhookInfo.webhookBase.includes('yourdomain')}
                      className="px-4 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      {settingWebhook ? (
                        <span className="material-icons-round animate-spin text-lg">progress_activity</span>
                      ) : (
                        <span className="material-icons-round text-lg">link</span>
                      )}
                      {settingWebhook ? 'Установка…' : webhookInfo.connected ? 'Переустановить вебхук' : 'Установить вебхук'}
                    </button>
                  </div>
                )}
              </>
            )}
            {webhookError && <p className="text-sm text-red-600 dark:text-red-400">{webhookError}</p>}
            {webhookSuccess && <p className="text-sm text-green-600 dark:text-green-400">{webhookSuccess}</p>}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">Не удалось загрузить данные</p>
        )}
      </div>

      {/* Рассылка всем пользователям бота */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Рассылка всем пользователям бота</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Сообщение получит каждый, кто запускал бота (/start) или заходил в приложение через Telegram. Можно отправить только тем, у кого в настройках включены «Акции».
        </p>
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={broadcastOnlyPromo}
            onChange={(e) => setBroadcastOnlyPromo(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">Только подписчики акций</span>
        </label>
        <textarea
          value={broadcastText}
          onChange={(e) => setBroadcastText(e.target.value)}
          placeholder="Текст сообщения (поддерживается HTML)"
          rows={4}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-4 py-3 text-sm resize-y"
        />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleBroadcast}
            disabled={broadcastSending || !broadcastText.trim()}
            className="px-4 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {broadcastSending ? (
              <span className="material-icons-round animate-spin text-lg">progress_activity</span>
            ) : (
              <span className="material-icons-round text-lg">send</span>
            )}
            {broadcastSending ? 'Отправка…' : 'Отправить всем'}
          </button>
          {broadcastResult && (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Отправлено: {broadcastResult.sent} из {broadcastResult.total}
              {broadcastResult.failed > 0 && `, ошибок: ${broadcastResult.failed}`}
            </span>
          )}
        </div>
        {broadcastError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{broadcastError}</p>}
      </div>

      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Кто запустил бота</h2>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-12 text-center text-slate-500">
          Пока никого нет
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="py-3 px-4">Telegram ID</th>
                  <th className="py-3 px-4">Имя</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Язык</th>
                  <th className="py-3 px-4">Дата</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono text-slate-900 dark:text-white">{s.telegramId}</td>
                    <td className="py-3 px-4">{[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td className="py-3 px-4">{s.username ? `@${s.username}` : '—'}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{s.languageCode || '—'}</td>
                    <td className="py-3 px-4 text-slate-500">{new Date(s.startedAt).toLocaleString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
