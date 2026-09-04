import React from 'react';
import './globals.css';
import { AuthProvider } from '@/lib/auth/auth-context';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { AppTitlebar } from '@/components/desktop/titlebar';

export const metadata = {
  title: 'Centras Chat',
  description: 'Корпоративный чат для рабочих разговоров',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="flex flex-col h-screen overflow-hidden bg-slate-950">
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
