'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Users, Settings, Shield, LogOut, Bell, BookUser, Send, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Avatar, STATUS_DOT } from '@/components/ui/avatar';
import { UserStatus } from '@/types';
import { notificationService } from '@/lib/notifications/notification-service';

export type ChatFilter = 'ALL' | 'GROUPS' | 'DIRECT';

interface NavRailProps {
  /** Current chat-list filter; when provided together with onFilterChange, the rail controls the list. */
  filter?: ChatFilter;
  onFilterChange?: (filter: ChatFilter) => void;
}

const STATUSES: { label: string; value: UserStatus }[] = [
  { label: 'В сети', value: 'ONLINE' },
  { label: 'Отошёл', value: 'AWAY' },
  { label: 'Не беспокоить', value: 'DO_NOT_DISTURB' },
  { label: 'Не в сети', value: 'OFFLINE' },
];

const itemClass = (active: boolean) =>
  `relative w-14 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] transition-colors ${
    active
      ? 'bg-blue-50 text-blue-700 font-semibold'
      : 'text-gray-500 hover:bg-gray-100 hover:text-slate-900 font-medium'
  }`;

const ActiveBar = () => <span className="absolute -left-1.5 top-3 bottom-3 w-[3px] rounded-full bg-blue-600" />;

export const NavRail: React.FC<NavRailProps> = ({ filter, onFilterChange }) => {
  const pathname = usePathname();
  const { user, logout, setUserStatus, isAdmin } = useAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const onChatPage = pathname === '/chat';
  const controlsList = onChatPage && !!onFilterChange;
  const currentStatus = STATUSES.find(s => s.value === user?.status) || STATUSES[0];
  const userName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Сотрудник';

  return (
    <nav className="w-[68px] shrink-0 bg-white border-r border-gray-200 flex flex-col items-center justify-between py-4 select-none">
      <div className="flex flex-col items-center gap-1">
        <Link
          href="/chat"
          className="w-9 h-9 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white font-extrabold text-base flex items-center justify-center shadow-[0_2px_6px_rgba(37,99,235,0.35)] mb-3"
          title="Centras Chat"
        >
          C
        </Link>

        {controlsList ? (
          <>
            <button type="button" onClick={() => onFilterChange?.('ALL')} className={itemClass(filter === 'ALL')} title="Все чаты">
              {filter === 'ALL' && <ActiveBar />}
              <MessageSquare className="w-5 h-5" />
              <span>Чаты</span>
            </button>
            <button type="button" onClick={() => onFilterChange?.('GROUPS')} className={itemClass(filter === 'GROUPS')} title="Рабочие группы">
              {filter === 'GROUPS' && <ActiveBar />}
              <Users className="w-5 h-5" />
              <span>Группы</span>
            </button>
            <button type="button" onClick={() => onFilterChange?.('DIRECT')} className={itemClass(filter === 'DIRECT')} title="Личные сообщения">
              {filter === 'DIRECT' && <ActiveBar />}
              <UserIcon className="w-5 h-5" />
              <span>Личные</span>
            </button>
          </>
        ) : (
          <Link href="/chat" className={itemClass(onChatPage)} title="Чаты">
            {onChatPage && <ActiveBar />}
            <MessageSquare className="w-5 h-5" />
            <span>Чаты</span>
          </Link>
        )}

        <Link href="/contacts" className={itemClass(pathname === '/contacts')} title="Справочник сотрудников">
          {pathname === '/contacts' && <ActiveBar />}
          <BookUser className="w-5 h-5" />
          <span>Контакты</span>
        </Link>
        <Link href="/telegram" className={itemClass(pathname === '/telegram')} title="Интеграция с Telegram">
          {pathname === '/telegram' && <ActiveBar />}
          <Send className="w-5 h-5" />
          <span>Telegram</span>
        </Link>
      </div>

      <div className="flex flex-col items-center gap-1 relative">
        <button
          type="button"
          onClick={async () => {
            notificationService.playChime();
            await notificationService.requestPermission();
          }}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-slate-900 transition-colors"
          title="Проверить звук и разрешить push-уведомления"
        >
          <Bell className="w-[18px] h-[18px]" />
        </button>
        {isAdmin && (
          <Link
            href="/admin"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              pathname.startsWith('/admin') ? 'bg-amber-50 text-amber-700' : 'text-amber-600 hover:bg-amber-50'
            }`}
            title="Панель администратора"
          >
            <Shield className="w-[18px] h-[18px]" />
          </Link>
        )}
        <Link
          href="/settings"
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            pathname === '/settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-slate-900'
          }`}
          title="Настройки профиля"
        >
          <Settings className="w-[18px] h-[18px]" />
        </Link>
        <button
          type="button"
          onClick={() => setProfileMenuOpen(v => !v)}
          className="mt-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          title={`${userName} · ${currentStatus.label}`}
        >
          <Avatar name={userName} src={user?.avatar_url} size="md" status={user?.status} />
        </button>

        {profileMenuOpen && (
          <div className="absolute left-16 bottom-0 w-60 bg-white border border-gray-200 rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.10),0_2px_6px_rgba(15,23,42,0.06)] p-1.5 z-30">
            <div className="px-2.5 py-2 flex items-center gap-2.5 border-b border-gray-100 mb-1">
              <Avatar name={userName} src={user?.avatar_url} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">{userName}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[currentStatus.value]}`} />
                  <span>{currentStatus.label}</span>
                  {isAdmin && (
                    <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Admin</span>
                  )}
                </div>
              </div>
            </div>
            <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Статус</div>
            {STATUSES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={async () => {
                  await setUserStatus(s.value);
                  setProfileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left ${
                  s.value === currentStatus.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s.value]}`} />
                <span>{s.label}</span>
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                type="button"
                onClick={() => logout()}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Выйти</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
