import React from 'react';
import './globals.css';
import { AuthProvider } from '@/lib/auth/auth-context';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { AppTitlebar } from '@/components/desktop/titlebar';

export const metadata = {
  title: 'Centras Chat',
  description: 'Корпоративный чат для рабочих разговоров',
  applicationName: 'Centras Chat',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/icon-192.png',
  },
};

export const viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="flex flex-col h-screen overflow-hidden bg-gray-100 text-slate-900">
        <AuthProvider>
          <ThemeProvider>
            <AppTitlebar />
            <main className="flex-1 flex overflow-hidden">{children}</main>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
