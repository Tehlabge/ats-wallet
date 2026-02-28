'use client';

import { useEffect } from 'react';

const isServerActionMismatch = (err: Error) =>
  err?.message?.includes('Server Action') ||
  err?.message?.includes('workers');

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      reset();
    }
  };

  const isStaleBuild = isServerActionMismatch(error);

  return (
    <html lang="ru">
      <body className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 px-6 font-sans antialiased">
        <div className="max-w-sm text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-2">
            {isStaleBuild
              ? 'Версия приложения обновилась. Загрузите страницу заново.'
              : 'Критическая ошибка. Перезагрузите страницу.'}
          </p>
          {isStaleBuild && (
            <p className="text-slate-500 dark:text-slate-500 text-sm mb-4">
              Нажмите кнопку ниже — откроется актуальная версия.
            </p>
          )}
          <button
            type="button"
            onClick={handleReload}
            className="py-3 px-6 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700"
          >
            Перезагрузить
          </button>
        </div>
      </body>
    </html>
  );
}
