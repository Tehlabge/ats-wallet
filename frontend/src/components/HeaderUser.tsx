'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMe } from '@/lib/api';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            photo_url?: string;
          };
        };
      };
    };
  }
}

type HeaderUserProps = { className?: string };

export default function HeaderUser({ className }: HeaderUserProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [initial, setInitial] = useState('?');

  useEffect(() => {
    getMe()
      .then((user) => {
        if (user?.telegramPhotoUrl) {
          setPhotoUrl(user.telegramPhotoUrl);
        } else if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url) {
          setPhotoUrl(window.Telegram.WebApp.initDataUnsafe.user.photo_url);
        }
        const name = user?.telegramUsername
          ? `@${user.telegramUsername}`
          : user?.phone ?? '';
        setInitial(name ? name.charAt(0).toUpperCase() : '?');
      })
      .catch(() => setInitial('?'));
  }, []);

  const sizeClass = className ?? 'w-10 h-10';
  return (
    <Link
      href="/profile"
      className={`flex items-center justify-center rounded-full bg-primary/20 shrink-0 overflow-hidden text-primary hover:opacity-90 ${sizeClass}`.trim()}
      aria-label="Профиль"
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-sm font-bold text-primary">{initial}</span>
      )}
    </Link>
  );
}
