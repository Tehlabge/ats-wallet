'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminChatRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin');
  }, [router]);

  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center p-6 text-center">
      <p className="text-slate-600 dark:text-slate-400 mb-4">
        Чат поддержки перенесён в Telegram. Общение с пользователями ведётся в группе бота техподдержки.
      </p>
      <Link
        href="/admin"
        className="text-primary font-medium hover:underline"
      >
        Вернуться в дашборд
      </Link>
    </div>
  );
}
