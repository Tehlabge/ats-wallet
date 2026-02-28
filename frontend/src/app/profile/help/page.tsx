'use client';

import { useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';

type FAQItem = {
  q: string;
  a: string | string[];
  icon: string;
  category: 'deposit' | 'payment' | 'withdraw' | 'security' | 'general';
};

const FAQ: FAQItem[] = [
  {
    q: 'Как пополнить баланс?',
    icon: 'add_card',
    category: 'deposit',
    a: [
      'При первом пополнении для вас автоматически создаётся персональный USDT (TRC-20) кошелёк.',
      'Для пополнения перейдите в раздел «Пополнить» и скопируйте адрес вашего кошелька.',
      'Отправьте USDT (TRC-20) на этот адрес с любой биржи или другого кошелька.',
      'Средства зачисляются автоматически после подтверждения транзакции в сети TRON (обычно 1-3 минуты).',
      'Минимальная сумма пополнения — 1 USDT.',
    ],
  },
  {
    q: 'Какую сеть использовать для пополнения?',
    icon: 'currency_bitcoin',
    category: 'deposit',
    a: [
      'Используйте только сеть TRC-20 (TRON).',
      'Отправка USDT через другие сети (ERC-20, BEP-20 и др.) приведёт к потере средств!',
      'Убедитесь, что на бирже или в кошельке выбрана сеть TRC-20 перед отправкой.',
    ],
  },
  {
    q: 'Как оплатить по QR-коду СБП?',
    icon: 'qr_code_scanner',
    category: 'payment',
    a: [
      'Нажмите кнопку «Оплатить» на главном экране.',
      'Наведите камеру на QR-код СБП или вставьте ссылку вручную.',
      'Проверьте сумму платежа и нажмите «Оплатить».',
      'Оплата происходит автоматически — средства списываются с вашего USDT баланса.',
      'Обычно платёж проходит за 10-30 секунд.',
    ],
  },
  {
    q: 'Какие QR-коды поддерживаются?',
    icon: 'qr_code_2',
    category: 'payment',
    a: [
      'Поддерживаются QR-коды СБП (Система быстрых платежей) формата НСПК.',
      'Ссылка должна содержать qr.nspk.ru или sub.nspk.ru.',
      'Статические и динамические QR-коды с указанной суммой.',
    ],
  },
  {
    q: 'Как вывести средства?',
    icon: 'send',
    category: 'withdraw',
    a: [
      'Перейдите в раздел «Вывести» на главном экране.',
      'Выберите способ вывода: на банковскую карту или криптокошелёк.',
      'Укажите сумму и реквизиты для вывода.',
      'Заявка обрабатывается оператором вручную, обычно в течение 15-60 минут.',
      'При выводе взимается комиссия согласно тарифам.',
    ],
  },
  {
    q: 'Какая комиссия за операции?',
    icon: 'percent',
    category: 'general',
    a: [
      'Пополнение — бесплатно (только комиссия сети TRON ~1 TRX).',
      'Оплата по QR — комиссия указана в вашем профиле (обычно 0-5%).',
      'Вывод — комиссия зависит от способа и суммы вывода.',
      'Актуальные тарифы можно уточнить в поддержке.',
    ],
  },
  {
    q: 'Где посмотреть историю операций?',
    icon: 'history',
    category: 'general',
    a: [
      'На главной странице нажмите «История транзакций» внизу списка.',
      'Там отображаются все операции: пополнения, платежи, выводы, переводы.',
      'Нажмите на операцию для просмотра деталей.',
    ],
  },
  {
    q: 'Как работает код-пароль?',
    icon: 'lock',
    category: 'security',
    a: [
      'Код-пароль защищает доступ к вашему кошельку.',
      'По умолчанию код запрашивается после 4 минут неактивности.',
      'Вы можете изменить время автоблокировки в разделе «Безопасность».',
      'Также доступен вход по биометрии (отпечаток/Face ID) на поддерживаемых устройствах.',
    ],
  },
  {
    q: 'Что такое Seed-фраза?',
    icon: 'key',
    category: 'security',
    a: [
      'Seed-фраза — это 12 секретных слов для восстановления доступа к кошельку.',
      'Запишите её и храните в надёжном месте офлайн.',
      'Никогда не передавайте seed-фразу третьим лицам!',
      'Служба поддержки никогда не запрашивает seed-фразу.',
    ],
  },
  {
    q: 'Как связаться с поддержкой?',
    icon: 'support_agent',
    category: 'general',
    a: [
      'Перейдите в «Профиль» → «Поддержка».',
      'Опишите вашу проблему в чате — оператор ответит в ближайшее время.',
      'Время работы поддержки: ежедневно с 9:00 до 23:00 (МСК).',
    ],
  },
  {
    q: 'Платёж не прошёл, что делать?',
    icon: 'error_outline',
    category: 'payment',
    a: [
      'Если платёж отклонён — средства автоматически вернутся на баланс.',
      'Подождите 5-15 минут и попробуйте снова.',
      'Если проблема повторяется — обратитесь в поддержку с указанием времени и суммы платежа.',
    ],
  },
  {
    q: 'Безопасно ли использовать ATS WALLET?',
    icon: 'verified_user',
    category: 'security',
    a: [
      'Все данные передаются по защищённому соединению (TLS/SSL).',
      'Приватные ключи кошельков зашифрованы на сервере.',
      'Доступ к приложению защищён код-паролем или биометрией.',
      'Мы не храним данные банковских карт.',
    ],
  },
];

const categories = [
  { id: 'all', label: 'Все', icon: 'apps' },
  { id: 'deposit', label: 'Пополнение', icon: 'add_card' },
  { id: 'payment', label: 'Оплата', icon: 'qr_code_scanner' },
  { id: 'withdraw', label: 'Вывод', icon: 'send' },
  { id: 'security', label: 'Безопасность', icon: 'shield' },
  { id: 'general', label: 'Общее', icon: 'info' },
];

export default function HelpPage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const filteredFAQ = activeCategory === 'all' 
    ? FAQ 
    : FAQ.filter(item => item.category === activeCategory);

  return (
    <div className="w-full max-w-[430px] min-h-screen bg-background-light dark:bg-neutral-950 shadow-2xl relative flex flex-col overflow-hidden mx-auto">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 h-16 flex items-center border-b border-slate-100 dark:border-slate-800 relative">
        <Link href="/profile" className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center text-primary" aria-label="Назад">
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>west</span>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight absolute left-0 right-0 text-center pointer-events-none">Справка</h1>
        <div className="w-10 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        {/* Hero */}
        <div className="px-5 pt-6 pb-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 border border-primary/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">help</span>
              </div>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Как пользоваться ATS WALLET</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Ответы на частые вопросы</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Не нашли ответ? Напишите в <Link href="/profile/support" className="text-primary font-medium">поддержку</Link>.
            </p>
          </div>
        </div>

        {/* Category Filter */}
        <div className="px-5 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setActiveCategory(cat.id); setExpandedIndex(null); }}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                  activeCategory === cat.id
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ List */}
        <div className="px-5 space-y-3">
          {filteredFAQ.map((item, i) => {
            const isExpanded = expandedIndex === i;
            const answers = Array.isArray(item.a) ? item.a : [item.a];
            
            return (
              <div 
                key={i} 
                className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isExpanded ? null : i)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isExpanded ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'
                  }`}>
                    <span className={`material-symbols-outlined text-xl ${
                      isExpanded ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      {item.icon}
                    </span>
                  </div>
                  <span className={`flex-1 font-semibold text-sm ${
                    isExpanded ? 'text-primary' : 'text-slate-900 dark:text-white'
                  }`}>
                    {item.q}
                  </span>
                  <span className={`material-symbols-outlined text-slate-400 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}>
                    expand_more
                  </span>
                </button>
                
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                      <ul className="space-y-2">
                        {answers.map((answer, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <span className="material-symbols-outlined text-primary text-sm mt-0.5 shrink-0">check_circle</span>
                            <span>{answer}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Support CTA */}
        <div className="px-5 mt-6">
          <Link
            href="/profile/support"
            className="block p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">chat</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900 dark:text-white text-sm">Остались вопросы?</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Напишите в поддержку — поможем!</p>
              </div>
              <span className="material-symbols-outlined text-slate-400">chevron_right</span>
            </div>
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
