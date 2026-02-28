import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">404</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">Страница не найдена</p>
        <Link
          href="/"
          className="inline-block py-3 px-6 bg-primary text-white font-medium rounded-xl hover:opacity-90"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
