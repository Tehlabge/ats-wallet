/**
 * Логирование авторизации и биометрии.
 * Использует loglevel: https://github.com/pimterry/loglevel
 * Для просмотра логов в DevTools: localStorage.setItem('ats_auth_debug', '1') и обновите страницу.
 * Логи появятся в консоли и на экране PinGate при ошибках.
 */
import log from 'loglevel';
import { sendComponentLog } from '@/lib/api';

const AUTH_PREFIX = '[Auth]';
const DEBUG_KEY = 'ats_auth_debug';
const MAX_BUFFER = 80;

const buffer: string[] = [];

function pushToBuffer(level: string, msg: string) {
  const line = `[${new Date().toISOString().slice(11, 23)}] ${level} ${msg}`;
  buffer.push(line);
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

export function isAuthDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DEBUG_KEY) === '1';
}

export function setAuthDebugEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEBUG_KEY, enabled ? '1' : '0');
}

export function getAuthLogs(): string[] {
  return [...buffer];
}

export function clearAuthLogs(): void {
  buffer.length = 0;
}

// В development или при ats_auth_debug — всегда debug-уровень
if (typeof window !== 'undefined') {
  if (process.env.NODE_ENV === 'development' || isAuthDebugEnabled()) {
    log.setLevel('debug');
  }
}

const authLog = log.getLogger('auth');
authLog.setDefaultLevel('debug');

function format(...args: unknown[]): string {
  return args.map((a) => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a))).join(' ');
}

function logWithBuffer(level: 'debug' | 'info' | 'warn' | 'error', msg: string, ...data: unknown[]) {
  const full = data.length ? `${msg} ${format(...data)}` : msg;
  authLog[level](`${AUTH_PREFIX} ${full}`, ...data);
  if (isAuthDebugEnabled()) {
    pushToBuffer(level.toUpperCase(), full);
  }
}

export const authLogger = {
  debug(msg: string, ...data: unknown[]) {
    logWithBuffer('debug', msg, ...data);
  },
  info(msg: string, ...data: unknown[]) {
    logWithBuffer('info', msg, ...data);
  },
  warn(msg: string, ...data: unknown[]) {
    logWithBuffer('warn', msg, ...data);
  },
  error(msg: string, ...data: unknown[]) {
    logWithBuffer('error', msg, ...data);
  },
  /** Отправить событие на backend + лог в консоль */
  event(component: 'auth' | 'biometry', event: string, extra?: Record<string, unknown>) {
    const line = extra ? `${event} ${format(extra)}` : event;
    logWithBuffer('info', `[${component}] ${line}`);
    try {
      sendComponentLog(component, event, extra);
    } catch {
      // ignore
    }
  },
};
