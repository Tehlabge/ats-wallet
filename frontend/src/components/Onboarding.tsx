'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface OnboardingStep {
  targetId: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    targetId: 'onboarding-balance',
    title: 'Ваш баланс',
    description: 'Здесь отображается ваш текущий баланс в USDT и рублях по текущему курсу.',
    position: 'bottom',
  },
  {
    targetId: 'onboarding-deposit',
    title: 'Пополнение',
    description: 'Нажмите здесь, чтобы пополнить баланс USDT. Вы получите адрес кошелька для перевода.',
    position: 'bottom',
  },
  {
    targetId: 'onboarding-scan',
    title: 'Оплата по QR',
    description: 'Сканируйте СБП QR-код для оплаты. Просто наведите камеру на код или загрузите фото.',
    position: 'top',
  },
  {
    targetId: 'onboarding-withdraw',
    title: 'Перевод и вывод',
    description: 'Переведите USDT другому пользователю или выведите на внешний кошелёк.',
    position: 'top',
  },
  {
    targetId: 'onboarding-profile',
    title: 'Профиль и настройки',
    description: 'Управляйте аккаунтом, настройками безопасности и обращайтесь в поддержку.',
    position: 'top',
  },
];

const ONBOARDING_KEY = 'ats_onboarding_completed';

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      setTimeout(() => setShowOnboarding(true), 500);
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY);
    setShowOnboarding(true);
  }, []);

  return { showOnboarding, completeOnboarding, resetOnboarding };
}

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const step = ONBOARDING_STEPS[currentStep];

  const updateHighlight = useCallback(() => {
    const element = document.getElementById(step.targetId);
    if (element) {
      const rect = element.getBoundingClientRect();
      setHighlightRect(rect);
    }
  }, [step]);

  useEffect(() => {
    updateHighlight();
    window.addEventListener('resize', updateHighlight);
    window.addEventListener('scroll', updateHighlight, true);
    return () => {
      window.removeEventListener('resize', updateHighlight);
      window.removeEventListener('scroll', updateHighlight, true);
    };
  }, [updateHighlight]);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!highlightRect) return null;

  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[9998]">
      {/* Overlay с вырезом */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="onboarding-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={highlightRect.left - 8}
              y={highlightRect.top - 8}
              width={highlightRect.width + 16}
              height={highlightRect.height + 16}
              rx="16"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#onboarding-mask)"
        />
      </svg>

      {/* Highlight border */}
      <div
        className="absolute border-2 border-primary rounded-2xl pointer-events-none animate-pulse"
        style={{
          top: highlightRect.top - 8,
          left: highlightRect.left - 8,
          width: highlightRect.width + 16,
          height: highlightRect.height + 16,
        }}
      />

      {/* Тултип по центру экрана — не перекрывает подсвеченные элементы */}
      <div
        className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] max-w-[340px] max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5"
      >
        <div className="relative">
          <div className="flex items-center gap-1 mb-3">
            {ONBOARDING_STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentStep
                    ? 'w-6 bg-primary'
                    : idx < currentStep
                      ? 'w-1.5 bg-primary/50'
                      : 'w-1.5 bg-slate-200 dark:bg-slate-600'
                }`}
              />
            ))}
          </div>

          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{step.title}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{step.description}</p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 py-2.5 text-slate-500 dark:text-slate-400 text-sm font-medium"
            >
              Пропустить
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold active:scale-[0.98]"
            >
              {isLastStep ? 'Готово' : 'Далее'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
