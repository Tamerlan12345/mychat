'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Users,
  Settings,
  Shield,
  Search,
  LogOut,
  Plus,
  ChevronDown,
  Sparkles,
  Lock,
  Circle,
  Volume2,
  Bell
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Avatar } from '@/components/ui/avatar';
import { Conversation, UserStatus } from '@/types';
import { ChatService } from '@/services/chat-service';
import { notificationService } from '@/lib/notifications/notification-service';

interface SidebarProps {
  activeConversationId?: string;
  onSelectConversation: (conv: Conversation) => void;
  onOpenCreateModal: (type: 'GROUP' | 'CHANNEL') => void;
  onSearchChange?: (q: string) => void;
}

type TabType = 'ALL' | 'GROUPS' | 'DIRECT';

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

  // Strict separation: only GROUPS and DIRECT chats exist. Channels are removed.
  const groups = filteredConversations.filter(c => c.type === 'GROUP' || c.type === 'CHANNEL');
  const dms = filteredConversations.filter(c => c.type === 'DIRECT');

  const statuses: { label: string; value: UserStatus; color: string }[] = [
    { label: 'В сети', value: 'ONLINE', color: 'bg-emerald-500' },
    { label: 'Отошёл', value: 'AWAY', color: 'bg-amber-500' },
    { label: 'Не беспокоить', value: 'DO_NOT_DISTURB', color: 'bg-rose-500' },
    { label: 'Не в сети', value: 'OFFLINE', color: 'bg-slate-500' },
  ];

  const currentStatusObj = statuses.find(s => s.value === user?.status) || statuses[0];

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
            <p className="text-[11px] text-slate-400">Корпоративный защищённый мессенджер</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            notificationService.playChime();
          }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800/60 transition-colors"
          title="Проверить звук уведомлений"
        >
          <Volume2 className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Поиск по группам и коллегам..."
            className="w-full bg-slate-950/70 border border-slate-800/80 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Navigation Filter Tabs: ONLY Все, Группы, Личные */}
      <div className="px-3 py-2 border-b border-slate-800/80">
        <div className="grid grid-cols-3 gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/60 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 ${
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
            className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 ${
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
            onClick={() => setActiveTab('DIRECT')}
            className={`py-1.5 px-2 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'DIRECT'
                ? 'bg-blue-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
            title="Личные сообщения"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Личные</span>
            <span className="text-[10px] opacity-75">{dms.length}</span>
          </button>
        </div>
      </div>

      {/* Main Chat Feed Area */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
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
              <div className="text-center py-8 px-4 bg-slate-950/40 rounded-xl border border-slate-800/60">
                <Users className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="text-xs text-slate-400 font-medium">Нет созданных групп</p>
                <p className="text-[11px] text-slate-500 mt-1">Создайте рабочую группу для совместной работы над проектом</p>
                <button
                  type="button"
                  onClick={() => onOpenCreateModal('GROUP')}
                  className="mt-3 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
                >
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
                          <div className="flex items-center gap-1.5">
                            <p className="truncate font-medium">{c.name}</p>
                            {c.is_private && <Lock className="w-2.5 h-2.5 text-slate-500 shrink-0" />}
                          </div>
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
                      <div className="relative shrink-0">
                        <Avatar name={c.name || 'Сотрудник'} size="sm" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900 absolute -bottom-0.5 -right-0.5" />
                      </div>
                      <div className="truncate text-left">
                        <p className="truncate font-medium">{c.name || 'Личный диалог'}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {c.last_message?.content || 'Диалог с коллегой'}
                        </p>
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

        {/* ALL TAB (OVERVIEW VIEW): ONLY GROUPS & DIRECT MESSAGES */}
        {activeTab === 'ALL' && (
          <>
            {/* Groups Section in Overview */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1 mb-2 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  Рабочие группы ({groups.length})
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
                        {c.is_private && <Lock className="w-2.5 h-2.5 text-slate-500 shrink-0" />}
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
            <div className="pt-2 border-t border-slate-800/50">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1 mb-2 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  Личные сообщения ({dms.length})
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

      {/* User Profile Footer & Actions */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="relative">
              <Avatar name={`${user?.first_name || ''} ${user?.last_name || ''}`} size="sm" />
              <span className={`w-2.5 h-2.5 rounded-full ${currentStatusObj.color} ring-2 ring-slate-900 absolute -bottom-0.5 -right-0.5`} />
            </div>

            <div className="truncate">
              <p className="text-xs font-semibold text-slate-100 truncate">
                {user?.first_name} {user?.last_name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  type="button"
                  onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${currentStatusObj.color}`} />
                  <span>{currentStatusObj.label}</span>
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
                {isAdmin && (
                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {isAdmin && (
              <Link
                href="/admin"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Панель администратора"
              >
                <Shield className="w-4 h-4 text-amber-400" />
              </Link>
            )}
            <Link
              href="/settings"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Настройки профиля"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <button
              onClick={() => logout()}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
              title="Выйти"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* User Status Switcher Popup */}
        {statusMenuOpen && (
          <div className="absolute bottom-16 left-3 right-3 bg-slate-900 border border-slate-700/80 rounded-xl shadow-xl p-1 z-30 space-y-0.5">
            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Ваш статус присутствия
            </div>
            {statuses.map(s => (
              <button
                key={s.value}
                onClick={async () => {
                  await setUserStatus(s.value);
                  setStatusMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full ${s.color}`} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
