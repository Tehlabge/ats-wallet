'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 px-6">
      <div className="max-w-sm text-center">
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Что-то пошло не так.
        </p>
        <button
          type="button"
          onClick={reset}
          className="py-3 px-6 bg-primary text-white font-medium rounded-xl hover:opacity-90"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
