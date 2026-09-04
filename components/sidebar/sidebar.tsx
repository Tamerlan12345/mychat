'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Users,
  Megaphone,
  Settings,
  Shield,
  Search,
  LogOut,
  Plus,
  ChevronDown,
  Hash,
  Sparkles,
  Layers
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

type TabType = 'ALL' | 'GROUPS' | 'CHANNELS' | 'DIRECT';

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
  const [activeTab, setActiveTab] = useState<TabType>('ALL');

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
    <aside className="w-80 bg-slate-900 border-r border-slate-800/80 flex flex-col h-full select-none text-slate-300">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 border border-blue-400/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm tracking-tight leading-tight">Centras Workspace</h1>
            <p className="text-[11px] text-slate-400">Корпоративный мессенджер</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Поиск по чатам и коллегам..."
            className="w-full bg-slate-950/70 border border-slate-800/80 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Navigation Filter Tabs (Primary Workspace Controls) */}
      <div className="px-3 py-2 border-b border-slate-800/80">
        <div className="grid grid-cols-4 gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/60 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 ${
              activeTab === 'ALL'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <span>Все</span>
            <span className="text-[10px] opacity-75">{filteredConversations.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('GROUPS')}
            className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 ${
              activeTab === 'GROUPS'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
            title="Рабочие проектные группы"
          >
            <Users className="w-3 h-3" />
            <span>Группы</span>
            <span className="text-[10px] opacity-75">{groups.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CHANNELS')}
            className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 ${
              activeTab === 'CHANNELS'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Hash className="w-3 h-3" />
            <span>Каналы</span>
            <span className="text-[10px] opacity-75">{channels.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DIRECT')}
            className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1 ${
              activeTab === 'DIRECT'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Личные</span>
            <span className="text-[10px] opacity-75">{dms.length}</span>
          </button>
        </div>
      </div>

      {/* Chat List Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* GROUPS TAB SPECIFIC VIEW */}
        {activeTab === 'GROUPS' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Рабочие группы</span>
              <button
                type="button"
                onClick={() => onOpenCreateModal('GROUP')}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать группу</span>
              </button>
            </div>

            {groups.length === 0 ? (
              <div className="text-center py-8 px-4 bg-slate-950/40 border border-slate-800/60 rounded-2xl">
                <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">Нет созданных групп</p>
                <p className="text-[11px] text-slate-400 mt-1">Создайте проектную группу для совместной работы</p>
                <button
                  type="button"
                  onClick={() => onOpenCreateModal('GROUP')}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-xl shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Создать первую группу
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {groups.map(c => {
                  const isActive = activeConversationId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectConversation(c)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition-all border ${
                        isActive
                          ? 'bg-blue-600/15 border-blue-500/40 text-white font-medium shadow-sm'
                          : 'border-transparent text-slate-300 hover:bg-slate-800/50 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="truncate text-left">
                          <p className="truncate font-medium">{c.name}</p>
                          {c.description && <p className="text-[10px] text-slate-400 truncate">{c.description}</p>}
                        </div>
                      </div>
                      {c.unread_count ? (
                        <span className="bg-blue-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full shrink-0">
                          {c.unread_count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CHANNELS TAB SPECIFIC VIEW */}
        {activeTab === 'CHANNELS' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Корпоративные каналы</span>
              <button
                type="button"
                onClick={() => onOpenCreateModal('CHANNEL')}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать канал</span>
              </button>
            </div>

            <div className="space-y-1">
              {channels.map(c => {
                const isActive = activeConversationId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelectConversation(c)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition-all border ${
                      isActive
                        ? 'bg-blue-600/15 border-blue-500/40 text-white font-medium shadow-sm'
                        : 'border-transparent text-slate-300 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        <Hash className="w-4 h-4" />
                      </div>
                      <div className="truncate text-left">
                        <p className="truncate font-medium">{c.name}</p>
                        {c.description && <p className="text-[10px] text-slate-400 truncate">{c.description}</p>}
                      </div>
                    </div>
                    {c.unread_count ? (
                      <span className="bg-blue-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full shrink-0">
                        {c.unread_count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* DIRECT TAB SPECIFIC VIEW */}
        {activeTab === 'DIRECT' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Личные сообщения</span>
              <Link href="/contacts" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                Справочник
              </Link>
            </div>

            <div className="space-y-1">
              {dms.map(c => {
                const isActive = activeConversationId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelectConversation(c)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition-all border ${
                      isActive
                        ? 'bg-blue-600/15 border-blue-500/40 text-white font-medium shadow-sm'
                        : 'border-transparent text-slate-300 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={c.name || 'Сотрудник'} size="sm" />
                      <div className="truncate text-left">
                        <p className="truncate font-medium">{c.name || 'Личный диалог'}</p>
                        <p className="text-[10px] text-slate-400 truncate">Нажмите для перехода</p>
                      </div>
                    </div>
                    {c.unread_count ? (
                      <span className="bg-emerald-500 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full shrink-0">
                        {c.unread_count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ALL TAB (OVERVIEW VIEW) */}
        {activeTab === 'ALL' && (
          <>
            {/* Groups Section in Overview */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1 mb-2 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  Рабочие группы
                </span>
                <button
                  type="button"
                  onClick={() => onOpenCreateModal('GROUP')}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  title="Создать группу"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {groups.map(c => {
                  const isActive = activeConversationId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectConversation(c)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                        isActive
                          ? 'bg-blue-600/15 border-blue-500/40 text-white font-medium shadow-sm'
                          : 'border-transparent text-slate-300 hover:bg-slate-800/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="truncate">{c.name}</span>
                      </div>
                      {c.unread_count ? (
                        <span className="bg-blue-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full shrink-0">
                          {c.unread_count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Channels Section in Overview */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1 mb-2 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-indigo-400" />
                  Каналы
                </span>
                <button
                  type="button"
                  onClick={() => onOpenCreateModal('CHANNEL')}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  title="Создать канал"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {channels.map(c => {
                  const isActive = activeConversationId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectConversation(c)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                        isActive
                          ? 'bg-blue-600/15 border-blue-500/40 text-white font-medium shadow-sm'
                          : 'border-transparent text-slate-300 hover:bg-slate-800/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-slate-500 text-sm font-semibold shrink-0">#</span>
                        <span className="truncate">{c.name}</span>
                      </div>
                      {c.unread_count ? (
                        <span className="bg-blue-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full shrink-0">
                          {c.unread_count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Direct Messages Section in Overview */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1 mb-2 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  Личные диалоги
                </span>
                <Link href="/contacts" className="text-blue-400 hover:text-blue-300 text-[11px] normal-case tracking-normal font-medium">
                  Все
                </Link>
              </div>
              <div className="space-y-1">
                {dms.map(c => {
                  const isActive = activeConversationId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectConversation(c)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                        isActive
                          ? 'bg-blue-600/15 border-blue-500/40 text-white font-medium shadow-sm'
                          : 'border-transparent text-slate-300 hover:bg-slate-800/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Avatar name={c.name || 'Сотрудник'} size="sm" />
                        <span className="truncate">{c.name || 'Личный диалог'}</span>
                      </div>
                      {c.unread_count ? (
                        <span className="bg-emerald-500 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full shrink-0">
                          {c.unread_count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Global Bottom Navigation Links */}
      <div className="px-3 py-2 border-t border-slate-800/80 space-y-1 bg-slate-950/40">
        <Link
          href="/contacts"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
            pathname === '/contacts'
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 font-semibold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Users className="w-4 h-4 text-slate-400" />
          <span>Справочник сотрудников</span>
        </Link>

        <Link
          href="/settings"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
            pathname === '/settings'
              ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 font-semibold'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Настройки профиля</span>
        </Link>

        {isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              pathname.startsWith('/admin')
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
                : 'text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10'
            }`}
          >
            <Shield className="w-4 h-4 text-amber-400" />
            <span>Панель Администратора</span>
          </Link>
        )}
      </div>

      {/* User Footer Profile & Status Selector */}
      {user && (
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/70 flex items-center justify-between relative">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={`${user.first_name} ${user.last_name}`} src={user.avatar_url} status={user.status} size="md" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100 truncate">{user.first_name} {user.last_name}</p>
              <button
                type="button"
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span>{user.status === 'ONLINE' ? 'В сети' : user.status === 'AWAY' ? 'Отошёл' : user.status === 'DO_NOT_DISTURB' ? 'Не беспокоить' : 'Не в сети'}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-slate-800 transition-colors"
            title="Выйти из аккаунта"
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* Status Dropdown */}
          {statusMenuOpen && (
            <div className="absolute bottom-16 left-3 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 w-52 z-50 animate-in fade-in slide-in-from-bottom-2">
              <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Мой статус
              </p>
              {statuses.map(st => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => {
                    setUserStatus(st.value);
                    setStatusMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800/80 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full ${st.color} shrink-0`} />
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
