'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Users, Building2, Lock, Palette, FileText, Settings, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { NavRail } from '@/components/sidebar/nav-rail';

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <div className="flex h-full w-full bg-gray-100 overflow-hidden">
        <NavRail />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="text-[15px] font-bold text-slate-900 mb-1">Доступ запрещён</h2>
          <p className="text-xs text-gray-500 mb-5 max-w-xs">
            Панель администратора доступна только пользователям с ролями ADMIN и SUPER_ADMIN.
          </p>
          <Link
            href="/chat"
            className="h-9 px-4 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold flex items-center transition-colors"
          >
            Вернуться в чат
          </Link>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: '/admin', label: 'Обзор', icon: Shield },
    { href: '/admin/users', label: 'Пользователи', icon: Users },
    { href: '/admin/departments', label: 'Подразделения', icon: Building2 },
    { href: '/admin/roles', label: 'Роли', icon: Lock },
    { href: '/admin/branding', label: 'Брендинг', icon: Palette },
    { href: '/admin/audit', label: 'Журнал аудита', icon: FileText },
    { href: '/telegram', label: 'Telegram-бот', icon: Send },
    { href: '/admin/settings', label: 'Система', icon: Settings },
  ];

  return (
    <div className="flex h-full w-full bg-gray-100 overflow-hidden">
      <NavRail />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b border-gray-200 shrink-0">
          <div className="px-8 pt-5 pb-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Shield className="w-[18px] h-[18px]" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-slate-900 tracking-tight leading-tight">Администрирование</h1>
              <p className="text-xs text-gray-500">Пользователи, структура, брендинг и аудит</p>
            </div>
          </div>

          <nav className="px-8 flex gap-1 overflow-x-auto">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-slate-900 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
      </div>
    </div>
  );
};
