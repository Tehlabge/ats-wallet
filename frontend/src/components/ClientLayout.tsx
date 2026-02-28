'use client';

import AuthGuard from '@/components/AuthGuard';
import TelegramGate from '@/components/TelegramGate';
import SplashScreen from '@/components/SplashScreen';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <SplashScreen>
      <TelegramGate>
        <AuthGuard>{children}</AuthGuard>
      </TelegramGate>
    </SplashScreen>
  );
}
