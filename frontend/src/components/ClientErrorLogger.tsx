'use client';

import { useEffect } from 'react';
import { sendClientError } from '@/lib/api';

/** Регистрирует глобальные обработчики ошибок и отправляет их в лог на сервер (вместо только консоли). */
export default function ClientErrorLogger() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message ?? String(event.error);
      const stack = event.error instanceof Error ? event.error.stack : undefined;
      sendClientError(message, stack, window.location.href);
    };

    const onUnhandled = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
      const stack = event.reason instanceof Error ? event.reason.stack : undefined;
      sendClientError(message, stack, window.location.href);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);

  return null;
}
