'use client';

import { useEffect, useState } from 'react';
import {
  getNotificationRules,
  setNotificationRules,
  getNotificationTemplates,
  setNotificationTemplates,
  type AdminNotificationRule,
} from '@/lib/api';

const EVENT_OPTIONS = [
  { id: 'withdrawal_request', label: 'Заявка на вывод', vars: '{{user}}, {{message}}' },
  { id: 'payment_request', label: 'Заявка на платёж', vars: '{{user}}, {{message}}' },
  { id: 'support_message', label: 'Сообщение в поддержку', vars: '{{user}}, {{message}}' },
  { id: 'security_code_reset', label: 'Заявка на сброс кода', vars: '{{user}}, {{message}}' },
];

const DEFAULT_TEMPLATES: Record<string, string> = {
  payment_request: 'Заявка на платёж: {{message}}',
  support_message: 'Сообщение в поддержку от {{user}}: {{message}}',
  withdrawal_request: 'Заявка на вывод: {{message}}',
  security_code_reset: 'Заявка на сброс кода: {{user}} — {{message}}',
};

export default function AdminNotificationsPage() {
  const [rules, setRules] = useState<AdminNotificationRule[]>([]);
  const [templates, setTemplatesState] = useState<Record<string, string>>({});
  const [rulesLoading, setRulesLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [templatesSaving, setTemplatesSaving] = useState(false);

  useEffect(() => {
    getNotificationRules()
      .then((r) => setRules(r.rules || []))
      .catch(() => setRules([]))
      .finally(() => setRulesLoading(false));
    getNotificationTemplates()
      .then((r) => setTemplatesState(r.templates || {}))
      .catch(() => setTemplatesState({}))
      .finally(() => setTemplatesLoading(false));
  }, []);

  const saveRules = async () => {
    setRulesSaving(true);
    try {
      await setNotificationRules(rules);
    } finally {
      setRulesSaving(false);
    }
  };

  const saveTemplates = async () => {
    setTemplatesSaving(true);
    try {
      await setNotificationTemplates(templates);
    } finally {
      setTemplatesSaving(false);
    }
  };

  const [notifyNewPayment, setNotifyNewPayment] = useState(true);
  const [soundNewPayment, setSoundNewPayment] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setNotifyNewPayment(localStorage.getItem('ats_admin_notify_new_payment') !== '0');
    setSoundNewPayment(localStorage.getItem('ats_admin_sound_new_payment') !== '0');
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Уведомления</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-[15px]">
          В админ-панели — уведомления в браузере. Ниже — правила и шаблоны сообщений в Telegram.
        </p>
      </div>

      {/* В админ-панели */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">В админ-панели</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
          Уведомление и звук при появлении нового платежа на любой странице админки.
        </p>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-slate-700 dark:text-slate-300">Уведомление о новом платеже</span>
            <button
              type="button"
              role="switch"
              aria-checked={notifyNewPayment}
              onClick={() => {
                const v = !notifyNewPayment;
                setNotifyNewPayment(v);
                if (typeof window !== 'undefined') localStorage.setItem('ats_admin_notify_new_payment', v ? '1' : '0');
              }}
              className={`relative w-11 h-7 rounded-full transition-colors shrink-0 ${notifyNewPayment ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${notifyNewPayment ? 'left-5' : 'left-1'}`} />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-slate-700 dark:text-slate-300">Звук при новом платеже</span>
            <button
              type="button"
              role="switch"
              aria-checked={soundNewPayment}
              onClick={() => {
                const v = !soundNewPayment;
                setSoundNewPayment(v);
                if (typeof window !== 'undefined') localStorage.setItem('ats_admin_sound_new_payment', v ? '1' : '0');
              }}
              className={`relative w-11 h-7 rounded-full transition-colors shrink-0 ${soundNewPayment ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${soundNewPayment ? 'left-5' : 'left-1'}`} />
            </button>
          </label>
        </div>
      </div>

      {/* Правила: кому и когда */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Правила доставки</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
          Укажите Telegram Chat ID получателей и при каких событиях отправлять уведомления. Можно ограничить по пользователям и по времени (смена).
        </p>
        {rulesLoading ? (
          <div className="animate-pulse h-32 bg-slate-100 dark:bg-slate-800 rounded-xl" />
        ) : (
          <div className="space-y-6">
            {rules.map((rule, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Правило {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => setRules((r) => r.filter((_, i) => i !== idx))}
                    className="text-red-500 text-sm hover:underline"
                  >
                    Удалить
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Telegram Chat ID (через запятую)</label>
                  <input
                    type="text"
                    value={(rule.telegramChatIds || []).join(', ')}
                    onChange={(e) => {
                      const v = e.target.value.split(/[\s,]+/).filter(Boolean);
                      setRules((r) => {
                        const next = [...r];
                        next[idx] = { ...next[idx], telegramChatIds: v };
                        return next;
                      });
                    }}
                    placeholder="123456789, 987654321"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-2">События</label>
                  <div className="flex flex-wrap gap-3">
                    {EVENT_OPTIONS.map((ev) => (
                      <label key={ev.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(rule.events || []).includes(ev.id)}
                          onChange={(e) => {
                            const events = rule.events || [];
                            setRules((r) => {
                              const next = [...r];
                              next[idx] = {
                                ...next[idx],
                                events: e.target.checked ? [...events, ev.id] : events.filter((x) => x !== ev.id),
                              };
                              return next;
                            });
                          }}
                          className="rounded text-primary"
                        />
                        <span className="text-sm">{ev.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4 items-center flex-wrap">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Смена: с часа (0–23)</label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={rule.fromHour ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        setRules((r) => {
                          const next = [...r];
                          next[idx] = { ...next[idx], fromHour: v ?? null };
                          return next;
                        });
                      }}
                      placeholder="—"
                      className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">по час (0–23)</label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={rule.toHour ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                        setRules((r) => {
                          const next = [...r];
                          next[idx] = { ...next[idx], toHour: v ?? null };
                          return next;
                        });
                      }}
                      placeholder="—"
                      className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Пусто = круглосуточно</p>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setRules((r) => [
                  ...r,
                  { telegramChatIds: [], events: [], userIds: [], fromHour: null, toHour: null },
                ])
              }
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              + Добавить правило
            </button>
            <button
              type="button"
              onClick={saveRules}
              disabled={rulesSaving}
              className="ml-2 px-4 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
            >
              {rulesSaving ? 'Сохранение…' : 'Сохранить правила'}
            </button>
          </div>
        )}
      </div>

      {/* Шаблоны текста */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Шаблоны сообщений</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
          Текст уведомления в Telegram. Переменные: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">&#123;&#123;user&#125;&#125;</code> — короткий ID пользователя, <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">&#123;&#123;message&#125;&#125;</code> — текст события. Пустое поле = стандартный текст.
        </p>
        {templatesLoading ? (
          <div className="animate-pulse h-48 bg-slate-100 dark:bg-slate-800 rounded-xl" />
        ) : (
          <div className="space-y-4">
            {EVENT_OPTIONS.map((ev) => (
              <div key={ev.id} className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {ev.label}
                  <span className="text-xs font-normal text-slate-500 ml-2">({ev.vars})</span>
                </label>
                <textarea
                  value={templates[ev.id] ?? ''}
                  onChange={(e) =>
                    setTemplatesState((t) => ({
                      ...t,
                      [ev.id]: e.target.value,
                    }))
                  }
                  placeholder={DEFAULT_TEMPLATES[ev.id] ?? `{{user}}: {{message}}`}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono placeholder:text-slate-400"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={saveTemplates}
              disabled={templatesSaving}
              className="px-4 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
            >
              {templatesSaving ? 'Сохранение…' : 'Сохранить шаблоны'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
