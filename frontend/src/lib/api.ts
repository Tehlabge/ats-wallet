// В браузере всегда /api, чтобы Next.js проксировал на бэкенд (rewrite /api/:path*). Иначе POST /admin-login даёт 404.
const API =
  typeof window !== 'undefined'
    ? '/api'
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ats_token');
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ats_admin_token');
}

export function getAdminRole(): 'super' | 'operator' | null {
  if (typeof window === 'undefined') return null;
  const r = localStorage.getItem('ats_admin_role');
  return r === 'operator' ? 'operator' : r === 'super' ? 'super' : null;
}

export function getAdminHeaders(): Record<string, string> {
  const t = getAdminToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function adminLogin(login: string, password: string): Promise<{ token: string; role?: string }> {
  const url = `${API}/admin-login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: login.trim(), password }),
  });
  const text = await res.text();
  let data: { token?: string; role?: string; message?: string; error?: string } = {};
  try {
    if (text) data = JSON.parse(text);
  } catch {
    // не JSON — оставляем data пустым
  }
  if (!res.ok) {
    const msg = (data.message || data.error || text || 'Неверный логин или пароль').trim();
    throw new Error(msg);
  }
  return data as { token: string; role?: string };
}

function getDeviceInfo(): { userAgent: string; deviceType: string; browser: string; os: string } | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const ua = navigator.userAgent;
  let deviceType = 'desktop';
  if (/Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) deviceType = 'mobile';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) deviceType = 'tablet';
  let browser = 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';
  return { userAgent: ua, deviceType, browser, os };
}

export async function authLogin(phone: string, password: string) {
  const deviceInfo = getDeviceInfo();
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password, ...(deviceInfo && { deviceInfo }) }),
  });
  if (!res.ok) throw new Error('Ошибка входа');
  return res.json();
}

export async function authLoginById(loginId: string): Promise<{ access_token: string }> {
  const deviceInfo = getDeviceInfo();
  const res = await fetch(`${API}/auth/login-by-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: loginId.trim(), ...(deviceInfo && { deviceInfo }) }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || 'Ошибка входа');
  }
  return res.json();
}

/** Привязать реферера по start_param (ref_xxx). Для уже залогиненных, открывших приложение по реферальной ссылке. */
export async function attachReferrer(startParam: string): Promise<{ ok: boolean; attached?: boolean }> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/auth/attach-referrer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ startParam: startParam.trim() }),
  });
  if (!res.ok) throw new Error('Ошибка привязки реферера');
  return res.json();
}

/** Вход через Telegram Mini App (авторизация по initData). startParam — из WebApp.initDataUnsafe.start_param (ref_xxx). */
export async function authByTelegram(initData: string, startParam?: string): Promise<{ access_token: string; isNewUser?: boolean }> {
  const res = await fetch(`${API}/auth/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, ...(startParam && { startParam }) }),
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Ошибка входа через Telegram';
    try {
      const d = JSON.parse(t);
      if (d?.message) msg = d.message;
    } catch {
      if (t) msg = t.slice(0, 200);
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function authRegister(phone: string, password: string) {
  const deviceInfo = getDeviceInfo();
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password, ...(deviceInfo && { deviceInfo }) }),
  });
  if (!res.ok) throw new Error('Ошибка регистрации');
  return res.json();
}

export type MeUser = {
  id: string;
  phone: string;
  telegramId?: string;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  telegramPhotoUrl?: string;
  digitalId?: string;
  commissionPercent?: string;
  seedSeen?: boolean;
  isPartner?: boolean;
  referralCommissionPercent?: string;
  referralBalance?: string;
  referralCount?: number;
  botReferralLink?: string;
};

export type SeedResponse = { words: string[]; phrase: string };

export async function getMe(): Promise<MeUser | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Получить seed-фразу (только если пользователь ещё не подтвердил просмотр). */
export async function getSeed(): Promise<SeedResponse | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API}/auth/seed`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Подтвердить, что пользователь сохранил seed (больше не показывать). */
export async function confirmSeedSeen(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const res = await fetch(`${API}/auth/seed-seen`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export type SessionItem = {
  id: string;
  jti: string;
  device: string;
  ip?: string;
  current: boolean;
  lastActive: string;
  createdAt: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
};

export async function getSessions(): Promise<SessionItem[]> {
  const token = getToken();
  if (!token) return [];
  const res = await fetch(`${API}/auth/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function revokeSessions(sessionIds: string[]): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/auth/sessions/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionIds }),
  });
  if (!res.ok) throw new Error('Ошибка завершения сессий');
}

type BalanceResult = {
  usdt: string;
  assets: Array<{ symbol: string; name: string; amount: string; priceUsd: string; priceRub: string; change24h: string }>;
};

export async function getBalance(): Promise<BalanceResult> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Ошибка загрузки баланса');
  const data = await res.json();
  const balances = data.balances || {};
  const usdtAmount = balances.USDT || balances.usdt || '0';
  return {
    usdt: usdtAmount,
    assets: [
      { symbol: 'USDT', name: 'Tether', amount: usdtAmount, priceUsd: '1.00', priceRub: '0', change24h: '0' },
    ],
  };
}

export async function getPublicUsdtRubRate(): Promise<{ usdtRub: number }> {
  const res = await fetch(`${API}/wallet/rate`);
  if (!res.ok) throw new Error('Не удалось получить курс');
  const data = await res.json();
  const rate = parseFloat(data.rate || '0');
  return { usdtRub: rate };
}

export async function getTransactions() {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Ошибка загрузки транзакций');
  const data = await res.json();
  return data.transactions || [];
}

export type WithdrawFees = {
  commissionCardPercent: number;
  commissionCardFixed: number;
  commissionSbpPercent: number;
  commissionSbpFixed: number;
  commissionWalletPercent: number;
  commissionWalletFixed: number;
};

export async function getWithdrawFees(): Promise<WithdrawFees> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/withdraw-fees`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Ошибка загрузки комиссий');
  return res.json();
}

export type NotificationSettings = {
  notifDeposit: boolean;
  notifWithdraw: boolean;
  notifSupport: boolean;
  notifPromo: boolean;
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/notification-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Ошибка загрузки настроек');
  return res.json();
}

export async function patchNotificationSettings(settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/notification-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка сохранения');
  return data;
}

export async function transferToAtsWallet(toDigitalId: string, amountUsdt: number): Promise<{ ok: boolean }> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/transfer-internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ toDigitalId: toDigitalId.trim(), amountUsdt: amountUsdt.toString() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка перевода');
  return data;
}

export async function createWithdrawalRequest(amountUsdt: string, type: 'card' | 'sbp' | 'wallet', details: string): Promise<{ ok: boolean; id: number; message?: string }> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/withdraw-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amountUsdt: amountUsdt.trim(), type, details: details.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка создания заявки');
  return data;
}

/** Статистика реферальной программы: приглашения и комиссии по дням (последние 30 дней). Только для партнёров. */
export async function getReferralStats(): Promise<{
  invitationsByDay: Array<{ date: string; count: number }>;
  commissionsByDay: Array<{ date: string; amountUsdt: number }>;
}> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/referral/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { invitationsByDay: [], commissionsByDay: [] };
  return res.json();
}

/** Перевести реферальный баланс в основной USDT. Только для партнёров. */
export async function referralTransferToMain(): Promise<{ ok: boolean; amountUsdt: string }> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/referral/transfer-to-main`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка перевода');
  return data;
}

export async function scanSbp(payload: string) {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/scan/sbp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error('Ошибка сканирования');
  return res.json();
}

export async function getUsdRate(): Promise<{ usdRateRub: number; ok: boolean }> {
  const res = await fetch(`${API}/admin/usd-rate`);
  if (!res.ok) return { usdRateRub: 100, ok: false };
  return res.json();
}

export async function getNews(): Promise<Array<{ id: number; title: string; content: string; createdAt: string; imageUrl?: string }>> {
  const res = await fetch(`${API}/news`);
  if (!res.ok) return [];
  return res.json();
}

export async function getNewsItem(id: number): Promise<{ id: number; title: string; content: string; createdAt: string; imageUrl?: string } | null> {
  const res = await fetch(`${API}/news/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getAdminNews(): Promise<Array<{ id: number; title: string; text: string; date: string; createdAt: string }>> {
  const res = await fetch(`${API}/admin/news`, { headers: getAdminHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Ошибка загрузки');
  }
  return res.json();
}

export async function createNews(title: string, text: string, date: string): Promise<{ id: number }> {
  const res = await fetch(`${API}/admin/news`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ title, text, date }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Ошибка создания');
  }
  return res.json();
}

export async function updateNews(id: number, data: { title?: string; text?: string; date?: string }): Promise<unknown> {
  const res = await fetch(`${API}/admin/news/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Ошибка сохранения');
  }
  return res.json();
}

export async function deleteNews(id: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/admin/news/${id}`, { method: 'DELETE', headers: getAdminHeaders() });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || 'Ошибка удаления');
  }
  return res.json();
}

export async function getTelegramBotUsername(): Promise<{ telegramBotUsername: string }> {
  const res = await fetch(`${API}/admin/telegram-bot-username`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить');
  return res.json();
}

export async function getPublicSettings(): Promise<{
  telegramBotUsername: string;
  supportBotUsername?: string;
  appVersion?: string;
}> {
  const res = await fetch(`${API}/public/settings`);
  if (!res.ok) throw new Error('Не удалось загрузить');
  return res.json();
}

export async function setTelegramBotUsername(telegramBotUsername: string): Promise<{ telegramBotUsername: string }> {
  const res = await fetch(`${API}/admin/telegram-bot-username`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ telegramBotUsername: telegramBotUsername.trim() }),
  });
  if (!res.ok) throw new Error('Не удалось сохранить');
  return res.json();
}

export async function getAdminStats(): Promise<{ usersCount: number; pendingCount: number; paymentsToday: number; totalPaymentsConfirmed: number }> {
  const res = await fetch(`${API}/admin/stats`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export type WalletCreationLogItem = {
  userId: string;
  userDisplay: string;
  addressMasked: string;
  createdAt: string;
};

export async function getWalletCreationLogs(): Promise<WalletCreationLogItem[]> {
  const res = await fetch(`${API}/admin/wallet-logs`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки логов');
  return res.json();
}

export async function getUsdtRubRate(): Promise<{ usdtRub: number }> {
  const res = await fetch(`${API}/admin/rate`, {
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error('Не удалось получить курс');
  return res.json();
}

export async function setUsdtRubRate(usdtRub: number): Promise<{ usdtRub: number }> {
  const res = await fetch(`${API}/admin/rate`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ usdtRub }),
  });
  if (!res.ok) throw new Error('Не удалось сохранить курс');
  return res.json();
}

export async function getWithdrawCommissions(): Promise<WithdrawFees> {
  const res = await fetch(`${API}/admin/withdraw-commissions`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить комиссии');
  return res.json();
}

export async function setWithdrawCommissions(
  commissionCardPercent: number,
  commissionCardFixed: number,
  commissionSbpPercent: number,
  commissionSbpFixed: number,
  commissionWalletPercent: number,
  commissionWalletFixed: number
): Promise<WithdrawFees> {
  const res = await fetch(`${API}/admin/withdraw-commissions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({
      commissionCardPercent,
      commissionCardFixed,
      commissionSbpPercent,
      commissionSbpFixed,
      commissionWalletPercent,
      commissionWalletFixed,
    }),
  });
  if (!res.ok) throw new Error('Не удалось сохранить комиссии');
  return res.json();
}

export async function getDefaultCommission(): Promise<{ defaultCommissionPercent: number }> {
  const res = await fetch(`${API}/admin/default-commission`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить');
  return res.json();
}

export async function setDefaultCommission(defaultCommissionPercent: number): Promise<{ defaultCommissionPercent: number }> {
  const res = await fetch(`${API}/admin/default-commission`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ defaultCommissionPercent }),
  });
  if (!res.ok) throw new Error('Не удалось сохранить');
  return res.json();
}

export type FinanceStats = {
  totalTurnoverUsdt: number;
  totalCommissionUsdt: number;
  totalCommissionRub: number;
  paymentsCount: number;
  usdtRubRate: number;
  byDay: Array<{ date: string; turnoverUsdt: number; commissionUsdt: number }>;
};

export async function getFinanceStats(): Promise<FinanceStats> {
  const res = await fetch(`${API}/admin/finance/stats`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить');
  return res.json();
}

export type ExtendedFinanceStats = {
  period: number;
  usdtRubRate: number;
  paymentsCount: number;
  paymentsTurnover: number;
  paymentsCommission: number;
  withdrawCard: { count: number; sum: number; commission: number; sumRub: number };
  withdrawSbp: { count: number; sum: number; commission: number; sumRub: number };
  withdrawWallet: { count: number; sum: number; commission: number };
  withdrawTotal: { count: number; sum: number; commission: number };
  referral: { bonusCount: number; bonusSum: number; newUsersCount: number };
  totalCommission: number;
  totalCommissionRub: number;
};

export async function getExtendedFinanceStats(days: number = 30): Promise<ExtendedFinanceStats> {
  const res = await fetch(`${API}/admin/finance/extended?days=${days}`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить');
  return res.json();
}

export type ScanLogEntry = {
  time: string;
  source: string;
  decoded: string;
  cleaned?: string;
  outcome: string;
  message?: string;
};

export async function sendScanLog(entry: {
  source: 'camera' | 'paste' | 'manual' | 'photo';
  decoded: string;
  cleaned?: string;
  outcome: 'ok' | 'not_nspk' | 'error' | 'throttle' | 'not_found';
  message?: string;
  userId?: string;
}): Promise<void> {
  try {
    await fetch(`${API}/scan-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // игнорируем ошибки отправки лога
  }
}

export function sendClientError(message: string, stack?: string, url?: string): void {
  try {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return;
    const payload = { message, stack: stack ?? '', url: url ?? (typeof window !== 'undefined' ? window.location.href : '') };
    fetch(`${API}/client-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

export async function getScanLogs(): Promise<{ lines: string[]; raw: string }> {
  const res = await fetch(`${API}/admin/scan-logs`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить лог');
  return res.json();
}

export type ScanLinkEntry = {
  time: string;
  timeFormatted: string;
  userId: string;
  link: string;
};

export async function getScanLinksLog(params?: {
  userId?: string;
  from?: string;
  to?: string;
}): Promise<{ entries: ScanLinkEntry[]; raw: string }> {
  const sp = new URLSearchParams();
  if (params?.userId?.trim()) sp.set('userId', params.userId.trim());
  if (params?.from?.trim()) sp.set('from', params.from.trim());
  if (params?.to?.trim()) sp.set('to', params.to.trim());
  const q = sp.toString();
  const url = q ? `${API}/admin/scan-links?${q}` : `${API}/admin/scan-links`;
  const res = await fetch(url, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить лог ссылок');
  return res.json();
}

export async function getSupportBotLog(): Promise<{ lines: string[]; raw: string }> {
  const res = await fetch(`${API}/admin/support-bot/log`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить лог бота');
  return res.json();
}

export async function getClientErrorLogs(): Promise<{ lines: string[]; raw: string }> {
  const res = await fetch(`${API}/admin/client-logs`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить лог');
  return res.json();
}

/** Компоненты для логов (сканер, чат, биометрия, запуск мини-аппа). */
export type ComponentLogComponent = 'scanner' | 'chat' | 'biometry' | 'miniapp' | 'auth';

/** Отправить запись в лог компонента. На сервере пишется в файл только для пользователей с включённым логированием в админке. */
export function sendComponentLog(component: ComponentLogComponent, message: string, extra?: Record<string, unknown>): void {
  const token = getToken();
  if (!token) return;
  fetch(`${API}/component-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ component, message, ...(extra && { extra }) }),
  }).catch(() => {});
}

export type LogUserItem = { userId: string; displayName: string; digitalId: string };

export async function getLogUsers(): Promise<LogUserItem[]> {
  const res = await fetch(`${API}/admin/log-users`, { headers: getAdminHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.users) ? data.users : [];
}

export async function setLogUsers(userIds: string[]): Promise<void> {
  const res = await fetch(`${API}/admin/log-users`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) throw new Error('Не удалось сохранить список');
}

export async function getComponentLog(component: ComponentLogComponent): Promise<{ lines: string[]; raw: string }> {
  const res = await fetch(`${API}/admin/log?component=${encodeURIComponent(component)}`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить лог');
  return res.json();
}

/** Метрики Prometheus (сырой текст с бэкенда /metrics). */
export async function getPrometheusMetrics(): Promise<string> {
  const res = await fetch(`${API}/metrics`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить метрики');
  return res.text();
}

export type AdminTransaction = {
  id: number;
  userId: string;
  symbol: string;
  amount: string;
  type: string;
  refId: string;
  rateUsdtRub: string;
  createdAt: string;
  /** Метод вывода: card | sbp | wallet (для withdrawal_hold, withdrawal_refund) */
  method?: string;
  /** Реквизиты вывода */
  details?: string;
  /** Дополнительная информация о пользователе */
  userDigitalId?: string;
  userPhone?: string;
  userTelegramUsername?: string;
  /** Статус транзакции (если есть) */
  status?: string;
  /** Баланс до транзакции */
  balanceBefore?: string;
  /** Баланс после транзакции */
  balanceAfter?: string;
};

export async function getAdminTransactions(params?: { userId?: string }): Promise<AdminTransaction[]> {
  const sp = new URLSearchParams();
  if (params?.userId) sp.set('userId', params.userId);
  const q = sp.toString();
  const url = `${API}/admin/transactions${q ? `?${q}` : ''}`;
  const res = await fetch(url, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки транзакций');
  return res.json();
}

export interface DepositAddressResponse {
  address: string | null;
  network: string;
  digitalId?: string;
  hint?: string;
  message?: string;
}

export async function getDepositAddress(): Promise<DepositAddressResponse> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/wallet/deposit-address`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Не удалось загрузить адрес');
  return data;
}

export interface WalletSettings {
  assignDurationMins: number;
  cooldownMins: number;
}

export async function getWalletSettings(): Promise<WalletSettings> {
  const res = await fetch(`${API}/wallet/settings`);
  const data = await res.json().catch(() => ({}));
  return data;
}

export interface SbpParsed {
  raw: string;
  type: string;
  valid: boolean;
  sumKopeks?: number;
  sumRub?: number;
  cur?: string;
  url?: string;
}

export async function parseSbp(payload: string): Promise<SbpParsed> {
  const res = await fetch(`${API}/scan/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: payload.trim() }),
  });
  if (!res.ok) throw new Error('Ошибка разбора');
  return res.json();
}

export interface PreviewPaymentResult {
  valid: boolean;
  sumRub?: string;
  sumUsdt?: string;
  commissionPercent?: string;
  error?: string;
}

export async function previewPayment(rawPayload: string): Promise<PreviewPaymentResult> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/scan/preview-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rawPayload: rawPayload.trim() }),
  });
  if (!res.ok) throw new Error('Ошибка');
  return res.json();
}

export async function createPayment(rawPayload: string): Promise<{
  id: number;
  sumRub: string;
  sumUsdt: string;
  commissionPercent: string;
  rawPayload: string;
}> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/scan/create-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rawPayload }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || 'Ошибка создания платежа');
  }
  return res.json();
}

export async function getPaymentStatus(
  paymentId: number
): Promise<{ status: string; sumRub?: string; sumUsdt?: string; rejectReason?: string } | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API}/scan/payment/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getPendingPayments(): Promise<
  Array<{
    id: number;
    userId: string;
    rawPayload: string;
    sumRub: string;
    sumUsdt: string;
    commissionPercent: string;
    createdAt: string;
    assignedToAdminId?: number;
    mine?: boolean;
  }>
> {
  const res = await fetch(`${API}/admin/pending-payments`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export type PaymentArchiveItem = {
  id: number;
  userId: string;
  sumRub: string;
  sumUsdt: string;
  commissionPercent: string;
  status: string;
  createdAt: string;
  confirmedAt: string;
  rejectedAt: string;
  rejectReason: string;
};

export async function getPaymentArchive(params?: { status?: string; search?: string; limit?: number }): Promise<PaymentArchiveItem[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.search) sp.set('search', params.search);
  if (params?.limit) sp.set('limit', String(params.limit));
  const q = sp.toString();
  const url = `${API}/admin/payments/archive${q ? `?${q}` : ''}`;
  const res = await fetch(url, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки архива');
  return res.json();
}

export async function getPaymentById(id: number): Promise<{
  id: number;
  userId: string;
  rawPayload: string;
  sumRub: string;
  sumUsdt: string;
  commissionPercent: string;
  status: string;
  createdAt: string;
  assignedToAdminId: number;
}> {
  const res = await fetch(`${API}/admin/payment/${id}`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Платёж не найден');
  return res.json();
}

export async function takePaymentToWork(paymentId: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/admin/payment/${paymentId}/take`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data.message as string) || 'Ошибка');
  }
  return res.json();
}

export async function confirmPayment(paymentId: number): Promise<{ ok: boolean }> {
  const token = getToken();
  const res = await fetch(`${API}/admin/confirm-payment/${paymentId}`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error('Ошибка подтверждения');
  return res.json();
}

export async function rejectPayment(paymentId: number, reason?: string): Promise<{ ok: boolean }> {
  const token = getToken();
  const res = await fetch(`${API}/admin/reject-payment/${paymentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ reason: reason ?? '' }),
  });
  if (!res.ok) throw new Error('Ошибка отклонения');
  return res.json();
}

export async function getAdminUsers(params?: { search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }): Promise<
  Array<{ id: string; phone: string; commissionPercent: string; createdAt: string; usdt: string; digitalId?: string; telegramId?: string; telegramUsername?: string }>
> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set('search', params.search);
  if (params?.sortBy) sp.set('sortBy', params.sortBy);
  if (params?.sortOrder) sp.set('sortOrder', params.sortOrder);
  const url = `${API}/admin/users${sp.toString() ? `?${sp}` : ''}`;
  const res = await fetch(url, { headers: getAdminHeaders() });
  const text = await res.text();
  if (!res.ok) {
    let msg = 'Ошибка загрузки';
    try {
      const d = text ? JSON.parse(text) : {};
      if (d?.message) msg = typeof d.message === 'string' ? d.message : msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : [];
}

/** Поиск пользователя по цифровому ID (7 знаков) или Telegram ID. */
export async function getAdminUserByQuery(q: string): Promise<{
  id: string;
  digitalId?: string;
  telegramId?: string;
  telegramUsername?: string;
  usdt: string;
  commissionPercent: string;
} | null> {
  const res = await fetch(`${API}/admin/user-by-query?q=${encodeURIComponent(q.trim())}`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка поиска');
  const text = await res.text();
  if (!text || text === 'null') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Детальная информация о пользователе: профиль, транзакции, ожидающие платежи. */
export async function getAdminUserDetail(userId: string): Promise<{
  id: string;
  digitalId: string;
  telegramId: string;
  telegramUsername: string;
  telegramFirstName: string;
  telegramLastName: string;
  usdt: string;
  usdtRef: string;
  commissionPercent: string;
  createdAt: string;
  lastLoginAt: string;
  transactions: Array<{
    id: number;
    symbol: string;
    amount: string;
    type: string;
    refId: string;
    rateUsdtRub: string;
    createdAt: string;
  }>;
  pendingPayments: Array<{
    id: number;
    sumRub: string;
    sumUsdt: string;
    commissionPercent: string;
    status: string;
    createdAt: string;
  }>;
  sessions: Array<{
    id: string;
    userAgent: string;
    deviceType: string;
    ip: string;
    lastActiveAt: string;
    createdAt: string;
  }>;
  isPartner?: boolean;
  referralCommissionPercent?: string;
  referrerId?: string;
  referralsCount: number;
  depositAddress?: string;
  walletBalance?: string;
  notifPromo: boolean;
  hasSupportChat: boolean;
  supportMessagesCount: number;
}> {
  const res = await fetch(`${API}/admin/user/${userId}`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Пользователь не найден');
  return res.json();
}

export async function patchUserPartner(
  userId: string,
  data: { isPartner?: boolean; referralCommissionPercent?: string }
): Promise<{ isPartner: boolean; referralCommissionPercent: string }> {
  const res = await fetch(`${API}/admin/user/${userId}/partner`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Ошибка сохранения');
  return res.json();
}

export async function setUserBalance(
  userId: string,
  symbol: string,
  amount: string
): Promise<{ usdt: string }> {
  const res = await fetch(`${API}/admin/user/${userId}/balance`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ symbol, amount }),
  });
  if (!res.ok) throw new Error('Ошибка сохранения');
  return res.json();
}

export async function setUserCommission(
  userId: string,
  commissionPercent: number
): Promise<{ commissionPercent: string }> {
  const res = await fetch(`${API}/admin/user/${userId}/commission`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ commissionPercent }),
  });
  if (!res.ok) throw new Error('Ошибка сохранения');
  return res.json();
}

/** Пополнение или списание баланса. operation: 'credit' | 'debit', purpose — назначение. */
export async function balanceOperation(
  userId: string,
  amountUsdt: string,
  operation: 'credit' | 'debit',
  purpose: string
): Promise<{ ok: boolean; usdt: string }> {
  const res = await fetch(`${API}/admin/user/${encodeURIComponent(userId)}/balance-operation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ amountUsdt: amountUsdt.trim(), operation, purpose: purpose.trim() }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d.message as string) || 'Ошибка операции');
  }
  return res.json();
}

export async function refreshWalletAddress(userId: string): Promise<{ address: string }> {
  const res = await fetch(`${API}/admin/user/${userId}/refresh-wallet-address`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error('Не удалось обновить адрес кошелька');
  return res.json();
}

/** Вернуть кошелёк пользователя в пул (отвязать адрес). */
export async function returnWalletToPool(userId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/admin/user/${userId}/return-wallet-to-pool`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d.message as string) || 'Не удалось вернуть кошелёк в пул');
  }
  return res.json();
}

export type SupportMessageItem = {
  id: number;
  message: string;
  isAdmin: boolean;
  createdAt: string;
  userId?: string;
  attachmentUrl?: string;
  attachmentType?: string;
};

export type SupportMessagesResponse = { messages: SupportMessageItem[]; threadClosed: boolean };

export async function getSupportMessages(): Promise<SupportMessagesResponse> {
  const token = getToken();
  if (!token) return { messages: [], threadClosed: false };
  const res = await fetch(`${API}/support/messages`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { messages: [], threadClosed: false };
  const data = await res.json();
  return {
    messages: Array.isArray(data.messages) ? data.messages : data,
    threadClosed: !!data.threadClosed,
  };
}

export async function postSupportMessage(payload: {
  message: string;
  attachmentUrl?: string;
  attachmentType?: string;
}): Promise<SupportMessageItem> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const { message, attachmentUrl, attachmentType } = payload;
  const msgText = typeof message === 'string' ? message : '';
  if (!msgText.trim() && !attachmentUrl) throw new Error('Введите сообщение или прикрепите файл');
  const res = await fetch(`${API}/support/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      message: msgText.trim() || '',
      ...(attachmentUrl && { attachmentUrl, attachmentType: attachmentType || 'image' }),
    }),
  });
  if (!res.ok) throw new Error('Ошибка отправки');
  return res.json();
}

export async function closeMySupportThread(): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/support/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось завершить чат');
}

export async function reopenMySupportThread(): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const res = await fetch(`${API}/support/reopen`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не удалось начать новый диалог');
}

export async function uploadSupportFile(file: File): Promise<{ url: string; attachmentType: string }> {
  const token = getToken();
  if (!token) throw new Error('Нет авторизации');
  const form = new FormData();
  form.append('file', file);
  let res: Response;
  try {
    res = await fetch(`${API}/support/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (e) {
    const msg = e instanceof TypeError && e.message === 'Failed to fetch'
      ? 'Нет связи с сервером. Проверьте интернет и попробуйте снова.'
      : (e instanceof Error ? e.message : 'Ошибка загрузки');
    throw new Error(msg);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data.message as string) || 'Ошибка загрузки');
  }
  return res.json();
}

export type SupportThread = {
  userId: string;
  lastMessage: string;
  lastTime: string;
  messageCount: number;
  hasUnread?: boolean;
  digitalId?: string;
  displayName?: string;
  telegramUsername?: string;
};

export async function getSupportThreads(archived?: boolean): Promise<SupportThread[]> {
  const url = archived ? `${API}/admin/support/threads?archived=true` : `${API}/admin/support/threads`;
  const res = await fetch(url, { headers: getAdminHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function closeSupportThread(userId: string): Promise<void> {
  const res = await fetch(`${API}/admin/support/threads/${encodeURIComponent(userId)}/close`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error('Не удалось завершить диалог');
}

export async function getSupportCount(): Promise<number> {
  const res = await fetch(`${API}/admin/support/count`, { headers: getAdminHeaders() });
  if (!res.ok) return 0;
  const data = await res.json().catch(() => ({}));
  return typeof data.count === 'number' ? data.count : 0;
}

export type ReferralLeaderboardItem = {
  userId: string;
  referralsCount: number;
  referralBalance: string;
  referralCommissionPercent: string;
  digitalId: string;
  displayName: string;
};

export async function getReferralsLeaderboard(): Promise<ReferralLeaderboardItem[]> {
  const res = await fetch(`${API}/admin/referrals`, { headers: getAdminHeaders() });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.list) ? data.list : [];
}

export type AdminActionLogItem = {
  id: number;
  adminId: number;
  action: string;
  actionLabel: string;
  details: string;
  createdAt: string;
};

export async function getAdminUserActionLogs(userId: string): Promise<AdminActionLogItem[]> {
  const res = await fetch(`${API}/admin/user/${encodeURIComponent(userId)}/action-logs`, { headers: getAdminHeaders() });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.list) ? data.list : [];
}

export async function getSupportMessagesByUserId(userId: string): Promise<SupportMessageItem[]> {
  const res = await fetch(`${API}/admin/support/messages/${encodeURIComponent(userId)}`, { headers: getAdminHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function postSupportReply(userId: string, message: string): Promise<SupportMessageItem> {
  const res = await fetch(`${API}/admin/support/messages/${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ message: message.trim() }),
  });
  if (!res.ok) throw new Error('Ошибка отправки');
  return res.json();
}

export type AdminSessionItem = {
  id: number;
  adminId: number;
  login: string;
  ip: string;
  userAgent: string;
  createdAt: string;
};

export async function getAdminSessions(): Promise<AdminSessionItem[]> {
  const res = await fetch(`${API}/admin/sessions`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки сессий');
  return res.json();
}

export async function deleteAdminSession(id: number): Promise<void> {
  const res = await fetch(`${API}/admin/sessions/${id}`, { 
    method: 'DELETE',
    headers: getAdminHeaders() 
  });
  if (!res.ok) throw new Error('Ошибка удаления сессии');
}

export async function deleteAdminSessionsBatch(ids: number[]): Promise<void> {
  const res = await fetch(`${API}/admin/sessions/delete-batch`, { 
    method: 'POST',
    headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  if (!res.ok) throw new Error('Ошибка удаления сессий');
}

export type AdminUserItem = {
  id: number;
  login: string;
  role: string;
  createdAt: string;
};

/** Список пользователей админ-панели (операторы и супер-админы). */
export async function getAdminPanelUsers(): Promise<AdminUserItem[]> {
  const res = await fetch(`${API}/admin/admins`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function createAdminUser(login: string, password: string, role: 'super' | 'operator'): Promise<{ ok: boolean; login: string; role: string }> {
  const res = await fetch(`${API}/admin/admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ login: login.trim(), password, role }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d.message as string) || 'Ошибка создания');
  }
  return res.json();
}

export async function deleteAdminUser(id: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/admin/admins/${id}`, {
    method: 'DELETE',
    headers: getAdminHeaders(),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d.message as string) || 'Ошибка удаления');
  }
  return res.json();
}

export async function changeAdminPassword(id: number, password: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/admin/admins/${id}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d.message as string) || 'Ошибка смены пароля');
  }
  return res.json();
}

export async function loginAsAdmin(id: number): Promise<{ token: string; role: string; login: string }> {
  const res = await fetch(`${API}/admin/admins/${id}/login-as`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d.message as string) || 'Ошибка входа');
  }
  return res.json();
}

export async function deleteAppUser(userId: string, walletPassword: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API}/admin/user/${userId}`, {
    method: 'DELETE',
    headers: { ...getAdminHeaders(), 'X-Wallet-Password': walletPassword },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d.message as string) || 'Ошибка удаления');
  }
  return res.json();
}

export async function getOperatorStats(): Promise<{
  paymentsToday: number;
  paymentsTotal: number;
  withdrawalsToday: number;
  withdrawalsTotal: number;
  paymentsSumUsdtToday: number;
  withdrawalsSumUsdtToday: number;
}> {
  const res = await fetch(`${API}/admin/operator/stats`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function getAdminDashboardStats(): Promise<{
  usersCount: number;
  usersToday: number;
  pendingPayments: number;
  confirmedPaymentsToday: number;
  confirmedPaymentsTotal: number;
  paymentsSumUsdtToday: number;
  paymentsSumUsdtTotal: number;
  pendingWithdrawals: number;
  approvedWithdrawalsToday: number;
  approvedWithdrawalsTotal: number;
  withdrawalsSumUsdtToday: number;
  withdrawalsSumUsdtTotal: number;
  operatorsToday: Array<{
    adminId: number;
    login: string;
    payments: number;
    withdrawals: number;
  }>;
}> {
  const res = await fetch(`${API}/admin/dashboard/stats`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export type DayStatItem = {
  date: string;
  payments: number;
  paymentsSum: number;
  paymentsRejected: number;
  withdrawals: number;
  withdrawalsSum: number;
  withdrawalsRejected: number;
  commission: number;
  newUsers: number;
};

export async function getDetailedStatistics(days: number = 30): Promise<{
  days: DayStatItem[];
  totalPayments: number;
  totalPaymentsSum: number;
  totalWithdrawals: number;
  totalWithdrawalsSum: number;
  totalCommission: number;
}> {
  const res = await fetch(`${API}/admin/dashboard/detailed-stats?days=${days}`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export type CalendarDayItem = {
  day: number;
  payments: number;
  withdrawals: number;
};

export async function getOperatorCalendarStats(month?: string): Promise<{
  month: string;
  daysInMonth: number;
  days: CalendarDayItem[];
  totalPayments: number;
  totalWithdrawals: number;
}> {
  const url = month 
    ? `${API}/admin/operator/calendar?month=${month}` 
    : `${API}/admin/operator/calendar`;
  const res = await fetch(url, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function getUserSeedCheck(userId: string): Promise<{
  userId: string;
  digitalId: string;
  telegramUsername: string;
  words: Array<{ position: number; word: string }>;
}> {
  const res = await fetch(`${API}/admin/user/${userId}/seed-check`, { headers: getAdminHeaders() });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d.message as string) || 'Ошибка загрузки');
  }
  return res.json();
}

export type TelegramBotStartItem = {
  id: number;
  telegramId: number;
  username: string;
  firstName: string;
  lastName: string;
  languageCode: string;
  startedAt: string;
};

export async function getTelegramBotStarts(): Promise<TelegramBotStartItem[]> {
  const res = await fetch(`${API}/admin/telegram-bot-starts`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export type TelegramWebhookInfo = {
  hasToken: boolean;
  message?: string;
  connected?: boolean;
  webhookUrl?: string;
  pendingUpdateCount?: number;
  lastErrorMessage?: string;
  webhookBase?: string;
  suggestedWebhookUrl?: string;
  error?: string;
};

export async function getTelegramWebhookInfo(): Promise<TelegramWebhookInfo> {
  const res = await fetch(`${API}/admin/telegram-bot/webhook-info`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function setTelegramWebhook(customUrl?: string): Promise<{ ok: boolean; webhookUrl?: string; message?: string }> {
  const res = await fetch(`${API}/admin/telegram-bot/set-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify(customUrl ? { url: customUrl } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка установки вебхука');
  return data;
}

export async function setSupportBotWebhook(webhookUrl: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API}/admin/support-bot/set-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка установки вебхука');
  return data;
}

export async function telegramBroadcast(text: string, onlyPromo?: boolean): Promise<{ ok: boolean; sent: number; failed: number; total: number }> {
  const res = await fetch(`${API}/admin/telegram-bot/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ text: text.trim(), onlyPromo: !!onlyPromo }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка рассылки');
  return data;
}

export type WithdrawalRequestItem = {
  id: number;
  userId: string;
  digitalId: string;
  telegramUsername: string;
  amountUsdt: string;
  type: string;
  details: string;
  status: string;
  rejectReason: string;
  processedAt: string;
  createdAt: string;
};

export async function getWithdrawalRequests(status?: string): Promise<WithdrawalRequestItem[]> {
  const url = `${API}/admin/withdrawal-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`;
  const res = await fetch(url, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки заявок');
  return res.json();
}

export async function getPendingWithdrawals(): Promise<WithdrawalRequestItem[]> {
  return getWithdrawalRequests('pending');
}

export async function approveWithdrawalRequest(id: number): Promise<void> {
  const res = await fetch(`${API}/admin/withdrawal-requests/${id}/approve`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error('Ошибка одобрения заявки');
}

export async function rejectWithdrawalRequest(id: number, reason?: string): Promise<void> {
  const res = await fetch(`${API}/admin/withdrawal-requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ reason: reason ?? '' }),
  });
  if (!res.ok) throw new Error('Ошибка отклонения заявки');
}

export type AdminNotificationRule = {
  telegramChatIds: string[];
  events: string[];
  userIds: string[];
  fromHour: number | null;
  toHour: number | null;
};

export async function getNotificationRules(): Promise<{ rules: AdminNotificationRule[] }> {
  const res = await fetch(`${API}/admin/notification-rules`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function setNotificationRules(rules: AdminNotificationRule[]): Promise<void> {
  const res = await fetch(`${API}/admin/notification-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) throw new Error('Ошибка сохранения');
}

export async function getNotificationTemplates(): Promise<{ templates: Record<string, string> }> {
  const res = await fetch(`${API}/admin/notification-templates`, { headers: getAdminHeaders() });
  if (!res.ok) throw new Error('Ошибка загрузки');
  return res.json();
}

export async function setNotificationTemplates(templates: Record<string, string>): Promise<void> {
  const res = await fetch(`${API}/admin/notification-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ templates }),
  });
  if (!res.ok) throw new Error('Ошибка сохранения');
}

// ============ Wallet Manager API ============

export type ManagedWalletInfo = {
  id: number;
  address: string;
  userId: string | null;
  lastBalance: string;
  lastCheckedAt: string | null;
  createdAt: string;
};

export type WalletManagerStats = {
  total: number;
  assigned: number;
  withBalance: number;
  totalBalance: string;
};

export async function walletManagerAuth(password: string): Promise<{ authenticated: boolean }> {
  const res = await fetch(`${API}/admin/wallet-manager/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Неверный пароль');
  return data;
}

export async function getWalletManagerStats(password: string): Promise<WalletManagerStats> {
  const res = await fetch(`${API}/admin/wallet-manager/stats`, { 
    headers: { 'X-Wallet-Password': password, ...getAdminHeaders() }
  });
  if (!res.ok) throw new Error('Ошибка загрузки статистики');
  return res.json();
}

export async function getWalletManagerWallets(password: string): Promise<{ wallets: ManagedWalletInfo[] }> {
  const res = await fetch(`${API}/admin/wallet-manager/wallets`, { 
    headers: { 'X-Wallet-Password': password, ...getAdminHeaders() }
  });
  if (!res.ok) throw new Error('Ошибка загрузки кошельков');
  return res.json();
}

export async function createManagedWallet(password: string): Promise<{
  wallet: { id: number; address: string; createdAt: string };
  seed: string;
  message: string;
}> {
  const res = await fetch(`${API}/admin/wallet-manager/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Wallet-Password': password, ...getAdminHeaders() },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка создания кошелька');
  return data;
}

export async function getWalletSeed(id: number, password: string): Promise<{ seed: string }> {
  const res = await fetch(`${API}/admin/wallet-manager/${id}/seed`, {
    headers: { 'X-Wallet-Password': password, ...getAdminHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка получения seed');
  return data;
}

export async function getWalletPrivateKey(id: number, password: string): Promise<{ privateKey: string }> {
  const res = await fetch(`${API}/admin/wallet-manager/${id}/private-key`, {
    headers: { 'X-Wallet-Password': password, ...getAdminHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка получения ключа');
  return data;
}

export async function exportWallet(id: number, password: string): Promise<Blob> {
  const res = await fetch(`${API}/admin/wallet-manager/${id}/export`, {
    headers: { 'X-Wallet-Password': password, ...getAdminHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data.message as string) || 'Ошибка экспорта');
  }
  return res.blob();
}

export async function exportAllWallets(password: string): Promise<Blob> {
  const res = await fetch(`${API}/admin/wallet-manager/export-all`, {
    headers: { 'X-Wallet-Password': password, ...getAdminHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data.message as string) || 'Ошибка экспорта');
  }
  return res.blob();
}

export async function refreshAllBalances(password: string): Promise<{ updated: number; failed: number }> {
  const res = await fetch(`${API}/admin/wallet-manager/refresh-balances`, {
    method: 'POST',
    headers: { 'X-Wallet-Password': password, ...getAdminHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка обновления');
  return data;
}

export type TransferResult = {
  message: string;
  txId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  status: string;
};

export async function transferFromManagedWallet(
  password: string,
  fromWalletId: number,
  toAddress: string,
  amountUsdt: number
): Promise<TransferResult> {
  const res = await fetch(`${API}/admin/wallet-manager/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Wallet-Password': password, ...getAdminHeaders() },
    body: JSON.stringify({ fromWalletId, toAddress, amountUsdt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка перевода');
  return data;
}

export async function getManagedWalletBalance(id: number, password: string): Promise<{ id: number; address: string; balance: string }> {
  const res = await fetch(`${API}/admin/wallet-manager/${id}/balance`, { 
    headers: { 'X-Wallet-Password': password, ...getAdminHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка получения баланса');
  return data;
}

export type CollectOneResult = {
  walletId: number;
  address: string;
  balance: string;
  collected: string;
  txId?: string;
  error?: string;
  status: 'success' | 'failed' | 'skipped';
};

export type CollectAllResult = {
  totalWallets: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalCollected: string;
  results: CollectOneResult[];
};

export async function collectAllToAddress(password: string, toAddress: string, minBalance?: number): Promise<CollectAllResult> {
  const res = await fetch(`${API}/admin/wallet-manager/collect-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Wallet-Password': password, ...getAdminHeaders() },
    body: JSON.stringify({ toAddress, minBalance: minBalance || 0.1 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка сбора');
  return data;
}

export type ClearAllWalletsResult = {
  managedWalletsDeleted: number;
  walletPoolDeleted: number;
  userWalletsDeleted: number;
  usersUpdated: number;
};

export async function clearAllWallets(password: string): Promise<ClearAllWalletsResult> {
  const res = await fetch(`${API}/admin/wallet-manager/clear-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Wallet-Password': password, ...getAdminHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка очистки');
  return data;
}

// Ручная проверка депозитов для пользователя
export async function checkUserDeposits(userId: string): Promise<{
  user_id: string;
  address: string;
  transfers_found: number;
  credited: number;
  skipped: number;
  details: Array<{ txid: string; amount?: number; status: string }>;
}> {
  const res = await fetch(`${API}/admin/user/${userId}/check-deposits`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка проверки депозитов');
  return data;
}

// === Управление временными кошельками (новая логика) ===

export interface PoolWalletInfo {
  id: number;
  address: string;
  status: string;
  lastBalance: string;
  userId?: string;
  userDigitalId?: string;
  userTelegramUsername?: string;
  assignedAt?: string;
  releasedAt?: string;
  lastCheckedAt?: string;
  createdAt: string;
}

export interface ManagedWalletsResponse {
  wallets: PoolWalletInfo[];
  total: number;
  page: number;
  limit: number;
  stats: {
    free: number;
    assigned: number;
    cooldown: number;
  };
}

export async function getManagedWallets(page = 1, limit = 50): Promise<ManagedWalletsResponse> {
  const res = await fetch(`${API}/admin/managed-wallets?page=${page}&limit=${limit}`, {
    headers: getAdminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка загрузки кошельков');
  return data;
}

export interface WalletAssignmentLog {
  id: number;
  userId: string;
  userDigitalId?: string;
  userTelegramUsername?: string;
  assignedAt: string;
  releasedAt?: string;
}

export async function getWalletAssignmentHistory(walletId: number): Promise<{ wallet: PoolWalletInfo; history: WalletAssignmentLog[] }> {
  const res = await fetch(`${API}/admin/managed-wallets/${walletId}/history`, {
    headers: getAdminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка загрузки истории');
  return data;
}

export async function forceReleaseWallet(walletId: number): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API}/admin/managed-wallets/${walletId}/force-release`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка освобождения');
  return data;
}

export interface UnverifiedDeposit {
  id: number;
  walletId: number;
  walletAddress: string;
  txId: string;
  amount: string;
  fromAddress: string;
  status: string;
  createdAt: string;
}

export async function getUnverifiedDeposits(): Promise<{ deposits: UnverifiedDeposit[] }> {
  const res = await fetch(`${API}/admin/unverified-deposits`, {
    headers: getAdminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка загрузки');
  return data;
}

export async function verifyDeposit(depositId: number, userId: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API}/admin/unverified-deposits/${depositId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify({ userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка подтверждения');
  return data;
}

export async function rejectUnverifiedDeposit(depositId: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/admin/unverified-deposits/${depositId}/reject`, {
    method: 'POST',
    headers: getAdminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка отклонения');
  return data;
}

export interface AdminWalletSettings {
  walletAssignDurationMinutes: number;
  walletCooldownMinutes: number;
}

export async function getAdminWalletSettings(): Promise<AdminWalletSettings> {
  const res = await fetch(`${API}/admin/wallet-settings`, {
    headers: getAdminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка загрузки настроек');
  return data;
}

export async function setAdminWalletSettings(settings: AdminWalletSettings): Promise<AdminWalletSettings> {
  const res = await fetch(`${API}/admin/wallet-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
    body: JSON.stringify(settings),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Ошибка сохранения');
  return data;
}

export async function searchWalletByTransaction(txId: string): Promise<{
  type: 'transaction' | 'unverified_deposit';
  transaction?: object;
  unverifiedDeposit?: UnverifiedDeposit;
  user?: { id: string; digitalId?: string; telegramUsername?: string };
  wallet?: PoolWalletInfo;
  assignmentHistory?: WalletAssignmentLog[];
}> {
  const res = await fetch(`${API}/admin/search-wallet-by-tx?txId=${encodeURIComponent(txId)}`, {
    headers: getAdminHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message as string) || 'Не найдено');
  return data;
}
