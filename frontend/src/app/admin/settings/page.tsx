'use client';

import { useEffect, useState } from 'react';
import {
  getUsdtRubRate,
  setUsdtRubRate,
  getWithdrawCommissions,
  setWithdrawCommissions,
  getDefaultCommission,
  setDefaultCommission,
  getTelegramBotUsername,
  setTelegramBotUsername,
} from '@/lib/api';
import Link from 'next/link';


export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<'rate' | 'defaultCommission' | 'withdraw' | 'referral'>('rate');
  const [usdtRate, setUsdtRate] = useState<number | null>(null);
  const [rateEdit, setRateEdit] = useState('');
  const [rateLoading, setRateLoading] = useState(true);
  const [rateSaving, setRateSaving] = useState(false);

  const [defaultCommission, setDefaultCommissionVal] = useState<number | null>(null);
  const [defaultCommissionEdit, setDefaultCommissionEdit] = useState('');
  const [defaultCommissionLoading, setDefaultCommissionLoading] = useState(false);
  const [defaultCommissionSaving, setDefaultCommissionSaving] = useState(false);

  const [commissionCard, setCommissionCard] = useState<number | null>(null);
  const [commissionCardFixed, setCommissionCardFixed] = useState<number | null>(null);
  const [commissionSbp, setCommissionSbp] = useState<number | null>(null);
  const [commissionSbpFixed, setCommissionSbpFixed] = useState<number | null>(null);
  const [commissionWallet, setCommissionWallet] = useState<number | null>(null);
  const [commissionWalletFixed, setCommissionWalletFixed] = useState<number | null>(null);
  const [commissionCardEdit, setCommissionCardEdit] = useState('');
  const [commissionCardFixedEdit, setCommissionCardFixedEdit] = useState('');
  const [commissionSbpEdit, setCommissionSbpEdit] = useState('');
  const [commissionSbpFixedEdit, setCommissionSbpFixedEdit] = useState('');
  const [commissionWalletEdit, setCommissionWalletEdit] = useState('');
  const [commissionWalletFixedEdit, setCommissionWalletFixedEdit] = useState('');
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [commissionSaving, setCommissionSaving] = useState(false);

  const [telegramBotUsername, setTelegramBotUsernameVal] = useState('');
  const [telegramBotUsernameEdit, setTelegramBotUsernameEdit] = useState('');
  const [telegramBotUsernameLoading, setTelegramBotUsernameLoading] = useState(false);
  const [telegramBotUsernameSaving, setTelegramBotUsernameSaving] = useState(false);

  useEffect(() => {
    setRateLoading(true);
    getUsdtRubRate()
      .then((r) => setUsdtRate(r.usdtRub))
      .catch(() => setUsdtRate(null))
      .finally(() => setRateLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'defaultCommission') {
      setDefaultCommissionLoading(true);
      getDefaultCommission()
        .then((r) => { setDefaultCommissionVal(r.defaultCommissionPercent); setDefaultCommissionEdit(''); })
        .catch(() => setDefaultCommissionVal(null))
        .finally(() => setDefaultCommissionLoading(false));
    }
    if (activeTab === 'withdraw') {
      setCommissionLoading(true);
      getWithdrawCommissions()
        .then((r) => {
          setCommissionCard(r.commissionCardPercent);
          setCommissionCardFixed(r.commissionCardFixed ?? 0);
          setCommissionSbp(r.commissionSbpPercent ?? 0);
          setCommissionSbpFixed(r.commissionSbpFixed ?? 0);
          setCommissionWallet(r.commissionWalletPercent);
          setCommissionWalletFixed(r.commissionWalletFixed ?? 0);
          setCommissionCardEdit('');
          setCommissionCardFixedEdit('');
          setCommissionSbpEdit('');
          setCommissionSbpFixedEdit('');
          setCommissionWalletEdit('');
          setCommissionWalletFixedEdit('');
        })
        .catch(() => { setCommissionCard(null); setCommissionSbp(null); setCommissionWallet(null); })
        .finally(() => setCommissionLoading(false));
    }
    if (activeTab === 'referral') {
      setTelegramBotUsernameLoading(true);
      getTelegramBotUsername()
        .then((r) => { setTelegramBotUsernameVal(r.telegramBotUsername); setTelegramBotUsernameEdit(r.telegramBotUsername); })
        .catch(() => { setTelegramBotUsernameVal(''); setTelegramBotUsernameEdit(''); })
        .finally(() => setTelegramBotUsernameLoading(false));
    }
  }, [activeTab]);

  const tabs = [
    { id: 'rate' as const, label: 'Курс USDT', icon: 'currency_exchange' },
    { id: 'defaultCommission' as const, label: 'Комиссия по умолчанию', icon: 'percent' },
    { id: 'withdraw' as const, label: 'Комиссии вывода', icon: 'payments' },
    { id: 'referral' as const, label: 'Рефералы', icon: 'link' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Настройки</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-[15px]">Системные настройки и утилиты</p>
      </div>

      <div className="p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
        <div className="flex gap-1 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === t.id
                  ? 'bg-white dark:bg-slate-800 text-primary shadow-sm dark:shadow-none border border-slate-200/80 dark:border-slate-600'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="material-icons-round text-[20px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'rate' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Курс 1 USDT → RUB</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">
            Текущий курс для конвертации баланса USDT в рубли
          </p>
          {rateLoading ? (
            <div className="animate-pulse h-12 bg-slate-100 dark:bg-slate-800 rounded-xl w-48" />
          ) : usdtRate != null ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-3xl font-bold text-primary">
                {usdtRate.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="Новый курс"
                  value={rateEdit}
                  onChange={(e) => setRateEdit(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 w-28"
                />
                <button
                  onClick={async () => {
                    const v = parseFloat(rateEdit.replace(',', '.'));
                    if (Number.isNaN(v) || v <= 0) return;
                    setRateSaving(true);
                    try {
                      const r = await setUsdtRubRate(v);
                      setUsdtRate(r.usdtRub);
                      setRateEdit('');
                    } finally {
                      setRateSaving(false);
                    }
                  }}
                  disabled={rateSaving || !rateEdit.trim()}
                  className="px-4 py-2 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {rateSaving ? '…' : 'Сохранить'}
                </button>
              </div>
              <button
                onClick={() => {
                  setRateLoading(true);
                  getUsdtRubRate()
                    .then((r) => setUsdtRate(r.usdtRub))
                    .finally(() => setRateLoading(false));
                }}
                className="p-2 text-slate-500 hover:text-primary"
              >
                <span className="material-icons-round text-[20px]">refresh</span>
              </button>
            </div>
          ) : (
            <p className="text-red-500">Не удалось загрузить курс</p>
          )}
        </div>
      )}

      {activeTab === 'defaultCommission' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Комиссия по умолчанию (%)</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">
            Процент комиссии для новых пользователей при оплате (прибыль с оборота). Существующим пользователям можно менять в карточке пользователя.
          </p>
          {defaultCommissionLoading && defaultCommission == null ? (
            <div className="animate-pulse h-12 bg-slate-100 dark:bg-slate-800 rounded-xl w-48" />
          ) : defaultCommission != null ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-2xl font-bold text-primary">{defaultCommission}%</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  placeholder="Новый %"
                  value={defaultCommissionEdit}
                  onChange={(e) => setDefaultCommissionEdit(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 w-24"
                />
                <button
                  onClick={async () => {
                    const v = parseFloat(defaultCommissionEdit.replace(',', '.'));
                    if (Number.isNaN(v) || v < 0 || v > 100) return;
                    setDefaultCommissionSaving(true);
                    try {
                      const r = await setDefaultCommission(v);
                      setDefaultCommissionVal(r.defaultCommissionPercent);
                      setDefaultCommissionEdit('');
                    } finally {
                      setDefaultCommissionSaving(false);
                    }
                  }}
                  disabled={defaultCommissionSaving || !defaultCommissionEdit.trim()}
                  className="px-4 py-2 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {defaultCommissionSaving ? '…' : 'Сохранить'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-red-500">Не удалось загрузить</p>
          )}
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Комиссии за вывод / обмен</h2>
          <p className="text-slate-500 text-sm mb-4">
            Комиссии при выводе на карту, СБП и на другой кошелёк (TRC-20): в процентах и/или фиксированная (USDT). Перевод на счёт ATS WALLET — без комиссии.
          </p>
          {commissionLoading && commissionCard == null ? (
            <div className="animate-pulse h-24 bg-slate-100 dark:bg-slate-800 rounded-xl" />
          ) : (
            <div className="space-y-6">
              {/* Card commissions */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <span className="material-icons-round text-[18px]">credit_card</span>
                  На карту (РФ)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Процент (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={commissionCard != null ? String(commissionCard) : '—'}
                        value={commissionCardEdit}
                        onChange={(e) => setCommissionCardEdit(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 w-24 text-sm"
                      />
                      <span className="text-slate-400 text-xs">сейчас: {commissionCard ?? 0}%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Фиксированная (USDT)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={commissionCardFixed != null ? String(commissionCardFixed) : '0'}
                        value={commissionCardFixedEdit}
                        onChange={(e) => setCommissionCardFixedEdit(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 w-24 text-sm"
                      />
                      <span className="text-slate-400 text-xs">сейчас: {commissionCardFixed ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SBP commissions */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <span className="material-icons-round text-[18px]">phone_android</span>
                  СБП (по номеру телефона)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Процент (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={commissionSbp != null ? String(commissionSbp) : '—'}
                        value={commissionSbpEdit}
                        onChange={(e) => setCommissionSbpEdit(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 w-24 text-sm"
                      />
                      <span className="text-slate-400 text-xs">сейчас: {commissionSbp ?? 0}%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Фиксированная (USDT)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={commissionSbpFixed != null ? String(commissionSbpFixed) : '0'}
                        value={commissionSbpFixedEdit}
                        onChange={(e) => setCommissionSbpFixedEdit(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 w-24 text-sm"
                      />
                      <span className="text-slate-400 text-xs">сейчас: {commissionSbpFixed ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Wallet commissions */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <span className="material-icons-round text-[18px]">account_balance_wallet</span>
                  На другой кошелёк (TRC-20)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Процент (%)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={commissionWallet != null ? String(commissionWallet) : '—'}
                        value={commissionWalletEdit}
                        onChange={(e) => setCommissionWalletEdit(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 w-24 text-sm"
                      />
                      <span className="text-slate-400 text-xs">сейчас: {commissionWallet ?? 0}%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Фиксированная (USDT)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={commissionWalletFixed != null ? String(commissionWalletFixed) : '0'}
                        value={commissionWalletFixedEdit}
                        onChange={(e) => setCommissionWalletFixedEdit(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 w-24 text-sm"
                      />
                      <span className="text-slate-400 text-xs">сейчас: {commissionWalletFixed ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={async () => {
                  const card = commissionCardEdit.trim() ? parseFloat(commissionCardEdit.replace(',', '.')) : commissionCard ?? 0;
                  const cardFix = commissionCardFixedEdit.trim() ? parseFloat(commissionCardFixedEdit.replace(',', '.')) : commissionCardFixed ?? 0;
                  const sbp = commissionSbpEdit.trim() ? parseFloat(commissionSbpEdit.replace(',', '.')) : commissionSbp ?? 0;
                  const sbpFix = commissionSbpFixedEdit.trim() ? parseFloat(commissionSbpFixedEdit.replace(',', '.')) : commissionSbpFixed ?? 0;
                  const wallet = commissionWalletEdit.trim() ? parseFloat(commissionWalletEdit.replace(',', '.')) : commissionWallet ?? 0;
                  const walletFix = commissionWalletFixedEdit.trim() ? parseFloat(commissionWalletFixedEdit.replace(',', '.')) : commissionWalletFixed ?? 0;
                  if (Number.isNaN(card) || Number.isNaN(sbp) || Number.isNaN(wallet) || card < 0 || sbp < 0 || wallet < 0 || cardFix < 0 || sbpFix < 0 || walletFix < 0) return;
                  setCommissionSaving(true);
                  try {
                    const r = await setWithdrawCommissions(card, cardFix, sbp, sbpFix, wallet, walletFix);
                    setCommissionCard(r.commissionCardPercent);
                    setCommissionCardFixed(r.commissionCardFixed ?? 0);
                    setCommissionSbp(r.commissionSbpPercent ?? 0);
                    setCommissionSbpFixed(r.commissionSbpFixed ?? 0);
                    setCommissionWallet(r.commissionWalletPercent);
                    setCommissionWalletFixed(r.commissionWalletFixed ?? 0);
                    setCommissionCardEdit('');
                    setCommissionCardFixedEdit('');
                    setCommissionSbpEdit('');
                    setCommissionSbpFixedEdit('');
                    setCommissionWalletEdit('');
                    setCommissionWalletFixedEdit('');
                  } finally {
                    setCommissionSaving(false);
                  }
                }}
                disabled={commissionSaving || (!commissionCardEdit.trim() && !commissionSbpEdit.trim() && !commissionWalletEdit.trim() && !commissionCardFixedEdit.trim() && !commissionSbpFixedEdit.trim() && !commissionWalletFixedEdit.trim())}
                className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
              >
                {commissionSaving ? '…' : 'Сохранить изменения'}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'referral' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Имя бота для реферальной ссылки</h2>
            <p className="text-slate-500 text-sm mb-4">
              Укажите имя Telegram-бота (без @). После сохранения у партнёров в мини-приложении в профиле появится реферальная ссылка вида t.me/ИМЯ_БОТА?start=ref_...
            </p>
            {telegramBotUsernameLoading ? (
              <div className="animate-pulse h-10 bg-slate-100 dark:bg-slate-800 rounded-xl w-64" />
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={telegramBotUsernameEdit}
                  onChange={(e) => setTelegramBotUsernameEdit(e.target.value)}
                  placeholder="например MyWalletBot"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 w-64"
                />
                <button
                  onClick={async () => {
                    setTelegramBotUsernameSaving(true);
                    try {
                      const r = await setTelegramBotUsername(telegramBotUsernameEdit);
                      setTelegramBotUsernameVal(r.telegramBotUsername);
                      setTelegramBotUsernameEdit(r.telegramBotUsername);
                    } finally {
                      setTelegramBotUsernameSaving(false);
                    }
                  }}
                  disabled={telegramBotUsernameSaving}
                  className="px-4 py-2 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
                >
                  {telegramBotUsernameSaving ? '…' : 'Сохранить'}
                </button>
                {telegramBotUsername && (
                  <span className="text-slate-500 text-sm">Сейчас: @{telegramBotUsername}</span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-start gap-3">
              <span className="material-icons-round text-[20px] text-slate-500 mt-0.5">info</span>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Как работает реферальная система</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Пользователь получает реферальную ссылку в приложении (Профиль → Реферальная программа).
                  Формат: t.me/{telegramBotUsername || 'BOT_NAME'}?start=ref_USER_ID.
                  При переходе по ссылке новый пользователь автоматически привязывается к рефереру.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
