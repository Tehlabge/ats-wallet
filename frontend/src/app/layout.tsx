import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientErrorLogger from '@/components/ClientErrorLogger';
import ClientLayout from '@/components/ClientLayout';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'ATS WALLET',
  description: 'ATS WALLET — криптокошелёк и СБП',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;try{var s=localStorage.getItem('ats_theme');if(s==='dark')d.classList.add('dark');else if(s==='light')d.classList.remove('dark');}catch(e){}})();`,
          }}
        />
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ClientErrorLogger />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
