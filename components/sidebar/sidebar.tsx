'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Users,
  Megaphone,
  Send,
  Settings,
  Shield,
  Search,
  LogOut,
  Plus,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Avatar } from '@/components/ui/avatar';
import { Conversation, UserStatus } from '@/types';
import { ChatService } from '@/services/chat-service';

interface SidebarProps {
  activeConversationId?: string;
  onSelectConversation: (conv: Conversation) => void;
  onOpenCreateModal: (type: 'GROUP' | 'CHANNEL') => void;
  onSearchChange?: (q: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeConversationId,
  onSelectConversation,
  onOpenCreateModal,
  onSearchChange,
}) => {
  const pathname = usePathname();
  const { user, logout, setUserStatus, isAdmin } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'CORPORATE' | 'TELEGRAM'>('CORPORATE');

  useEffect(() => {
    if (!user) return;
    ChatService.getConversations(user.id).then(setConversations);
  }, [user]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (onSearchChange) onSearchChange(val);
  };

  const filteredConversations = conversations.filter(c => {
    if (!searchQuery) return true;
    const name = c.name || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const channels = filteredConversations.filter(c => c.type === 'CHANNEL');
  const groups = filteredConversations.filter(c => c.type === 'GROUP');
  const dms = filteredConversations.filter(c => c.type === 'DIRECT');

  const statuses: { label: string; value: UserStatus; color: string }[] = [
    { label: 'В сети', value: 'ONLINE', color: 'bg-emerald-500' },
    { label: 'Отошёл', value: 'AWAY', color: 'bg-amber-500' },
    { label: 'Не беспокоить', value: 'DO_NOT_DISTURB', color: 'bg-rose-500' },
    { label: 'Не в сети', value: 'OFFLINE', color: 'bg-slate-500' },
  ];

  return (
    <aside className="w-72 bg-white border-r border-slate-200 flex flex-col h-full select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 text-base leading-tight">Centras Chat</h1>
          </div>
        </div>
      </div>

      {/* Global Search Bar */}
      <div className="p-3 border-b border-slate-200">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Поиск"
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-md pl-9 pr-3 py-2 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {/* Mode Switcher: Corporate vs Telegram */}
      <div className="flex p-2 gap-1 bg-slate-50 border-b border-slate-200 text-xs">
        <button
          onClick={() => setActiveTab('CORPORATE')}
          className={`flex-1 py-1.5 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'CORPORATE'
              ? 'bg-white text-slate-900 border border-slate-200 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
           <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
           <span>Рабочие чаты</span>
        </button>
        <button
          onClick={() => setActiveTab('TELEGRAM')}
          className={`flex-1 py-1.5 rounded-md font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'TELEGRAM'
              ? 'bg-white text-slate-900 border border-slate-200 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
           <Send className="w-3.5 h-3.5 text-slate-500" />
          <span>Telegram</span>
        </button>
      </div>

      {/* Chat List Navigation */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {activeTab === 'CORPORATE' ? (
          <>
            {/* Direct Messages & Employee Shortcuts */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-2 mb-2 uppercase tracking-wider">
                <span>Личные диалоги</span>
                <Link href="/contacts" className="text-blue-600 hover:underline text-[11px] normal-case tracking-normal">
                  Все
                </Link>
              </div>
              <div className="space-y-1">
                {dms.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectConversation(c)}
                     className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors border-l-2 ${
                       activeConversationId === c.id
                         ? 'bg-blue-50 border-blue-600 text-slate-900 font-medium'
                         : 'border-transparent text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Avatar name={c.name || 'Сотрудник'} size="sm" />
                      <span className="truncate">{c.name || 'Личный чат'}</span>
                    </div>
                    {c.unread_count ? (
                      <span className="bg-emerald-500 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full">
                        {c.unread_count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {/* Channels Section */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-2 mb-2 uppercase tracking-wider">
                <span>Каналы</span>
                <button
                  onClick={() => onOpenCreateModal('CHANNEL')}
                   className="p-1 text-slate-400 hover:text-slate-900 rounded hover:bg-slate-100"
                  title="Создать канал"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {channels.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectConversation(c)}
                     className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors border-l-2 ${
                       activeConversationId === c.id
                         ? 'bg-blue-50 border-blue-600 text-slate-900 font-medium'
                         : 'border-transparent text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                       <Megaphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </div>
                    {c.unread_count ? (
                      <span className="bg-blue-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full">
                        {c.unread_count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {/* Groups Section */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-2 mb-2 uppercase tracking-wider">
                <span>Группы</span>
                <button
                  onClick={() => onOpenCreateModal('GROUP')}
                   className="p-1 text-slate-400 hover:text-slate-900 rounded hover:bg-slate-100"
                  title="Создать группу"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {groups.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectConversation(c)}
                     className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors border-l-2 ${
                       activeConversationId === c.id
                         ? 'bg-blue-50 border-blue-600 text-slate-900 font-medium'
                         : 'border-transparent text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </div>
                    {c.unread_count ? (
                      <span className="bg-blue-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full">
                        {c.unread_count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Telegram Section */
          <div className="space-y-3">
           <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2 text-slate-700 text-xs font-semibold mb-1">
                <Send className="w-4 h-4" />
                <span>Telegram</span>
              </div>
               <p className="text-[11px] text-slate-500 mb-3">
                  Связь с ботом и активность relay.
              </p>
              <Link
                href="/telegram"
                 className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white py-1.5 text-xs font-medium rounded-md transition-colors"
              >
                 Открыть Telegram
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Global Bottom Navigation Links */}
      <div className="px-3 py-2 border-t border-slate-200 space-y-1">
        <Link
          href="/contacts"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
             pathname === '/contacts' ? 'bg-blue-50 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4 text-slate-400" />
          <span>Справочник сотрудников</span>
        </Link>

        <Link
          href="/settings"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
             pathname === '/settings' ? 'bg-blue-50 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Настройки и уведомления</span>
        </Link>

        {isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              pathname.startsWith('/admin')
                 ? 'bg-amber-50 text-amber-700 border border-amber-200'
                 : 'text-amber-700/80 hover:text-amber-800 hover:bg-amber-50'
            }`}
          >
            <Shield className="w-4 h-4 text-amber-400" />
            <span>Панель Администратора</span>
          </Link>
        )}
      </div>

      {/* User Footer Profile & Status Selector */}
      {user && (
         <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between relative">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={`${user.first_name} ${user.last_name}`} src={user.avatar_url} status={user.status} size="md" />
            <div className="min-w-0">
               <p className="text-xs font-semibold text-slate-900 truncate">{user.first_name} {user.last_name}</p>
              <button
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span>{user.status}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <button
            onClick={logout}
             className="p-2 text-slate-400 hover:text-rose-600 rounded-md hover:bg-white transition-colors"
            title="Выйти из аккаунта"
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* Status Dropdown */}
          {statusMenuOpen && (
             <div className="absolute bottom-16 left-3 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 w-48 z-50 animate-in fade-in slide-in-from-bottom-2">
              <p className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Мой статус
              </p>
              {statuses.map(st => (
                <button
                  key={st.value}
                  onClick={() => {
                    setUserStatus(st.value);
                    setStatusMenuOpen(false);
                  }}
                   className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full ${st.color}`} />
                  <span>{st.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
