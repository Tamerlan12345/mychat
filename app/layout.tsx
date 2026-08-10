import React from 'react';
import './globals.css';
import { AuthProvider } from '@/lib/auth/auth-context';
import { ThemeProvider } from '@/components/ui/theme-provider';

export const metadata = {
  title: 'Centras Chat — Corporate Messenger',
  description: 'Self-hosted / White-label corporate messenger with Telegram integration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
