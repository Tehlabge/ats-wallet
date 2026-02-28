'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import BottomNav from '@/components/BottomNav';

type Article = {
  title: string;
  icon: string;
  content: string;
};

const ARTICLES: Record<string, Article> = {
  'yandex-food': {
    title: 'Яндекс Еда',
    icon: 'restaurant',
    content: `Оплатить заказ в Яндекс Еде через ATS WALLET можно по QR-коду СБП.

Удобнее всего делать это с компьютера: откройте сайт eda.yandex.ru в браузере, оформите заказ и на этапе оплаты выберите способ «СБП» или «Оплата по QR-коду». На экране появится QR-код.

Откройте ATS WALLET на телефоне, нажмите «Оплатить», отсканируйте этот QR-код или вставьте ссылку вручную — и подтвердите платёж. Средства спишутся с вашего USDT-баланса.

Важно: в Яндекс Еде оплата по QR-коду СБП доступна только при фиксированной сумме заказа. Если вы добавляете товары в корзину и сумма меняется после оформления, вариант с QR может не отображаться. В таком случае оформите заказ с уже известной итоговой суммой (например, после применения скидок и доставки) и на этапе оплаты выберите СБП — тогда появится QR-код для сканирования в приложении.`,
  },
};

export default function HowToPayArticlePage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const article = slug ? ARTICLES[slug] : null;

  if (!article) {
    return (
      <div className="w-full max-w-[430px] min-h-screen bg-white dark:bg-slate-900 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
        <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
          <Link href="/profile/how-to-pay" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
            <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Как оплачивать</h1>
          <div className="w-10 shrink-0" />
        </header>
        <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
          <p className="text-slate-500 dark:text-slate-400">Материал не найден.</p>
          <Link href="/profile/how-to-pay" className="text-primary font-medium mt-2 inline-block">Вернуться к списку</Link>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-white dark:bg-slate-900 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile/how-to-pay" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Как оплачивать</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32 px-5 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-[28px]">{article.icon}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{article.title}</h2>
        </div>
        <div className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
          {article.content}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
