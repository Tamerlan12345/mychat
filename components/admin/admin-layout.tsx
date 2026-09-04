'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Users, Building2, Lock, Palette, FileText, Settings, ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <Shield className="w-12 h-12 text-rose-500 mb-3" />
        <h2 className="text-base font-bold text-white mb-1">Доступ запрещен (403)</h2>
        <p className="text-xs text-slate-400 mb-4">
          Панель администратора доступна только пользователям с ролями ADMIN и SUPER_ADMIN.
        </p>
        <Link
          href="/chat"
          className="bg-slate-800 text-white text-xs px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
        >
          Вернуться в чат
        </Link>
      </div>
    );
  }

  const navItems = [
    { href: '/admin', label: 'Дашборд', icon: Shield },
    { href: '/admin/users', label: 'Пользователи', icon: Users },
    { href: '/admin/departments', label: 'Подразделения', icon: Building2 },
    { href: '/admin/roles', label: 'Роли', icon: Lock },
    { href: '/admin/branding', label: 'Брендинг', icon: Palette },
    { href: '/admin/audit', label: 'Журнал аудита', icon: FileText },
    { href: '/telegram', label: 'Telegram Бот', icon: Send },
    { href: '/admin/settings', label: 'Настройки', icon: Settings },
  ];

  return (
    <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden">
      {/* Admin Top Header */}
      <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/chat"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Вернуться в корпоративный мессенджер"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold text-white text-sm">Панель управления (ADMIN PANEL)</h1>
            <p className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">
              Holding Chat White-Label Engine
            </p>
          </div>
        </div>
      </div>

      {/* Admin Navigation Bar */}
      <div className="flex px-6 border-b border-slate-800 bg-slate-900/50 gap-1 overflow-x-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
};
