'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Search, Plus, Lock, SquarePen } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Avatar } from '@/components/ui/avatar';
import { Conversation } from '@/types';
import { ChatService } from '@/services/chat-service';
import { NavRail, ChatFilter } from './nav-rail';

interface SidebarProps {
  activeConversationId?: string;
  onSelectConversation: (conv: Conversation) => void;
  onOpenCreateModal: (type: 'GROUP' | 'CHANNEL') => void;
  onSearchChange?: (q: string) => void;
  /** Bump to reload conversations (e.g. after a chat was marked as read). */
  refreshKey?: number;
}

function formatListTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeConversationId,
  onSelectConversation,
  onOpenCreateModal,
  onSearchChange,
  refreshKey = 0,
}) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ChatFilter>('ALL');

  useEffect(() => {
    if (!user) return;
    ChatService.getConversations(user.id).then(setConversations);
  }, [user, refreshKey]);

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

  const renderRow = (c: Conversation) => {
    const isActive = activeConversationId === c.id;
    const isGroup = c.type !== 'DIRECT';
    const name = c.name || (isGroup ? 'Группа' : 'Личный диалог');
    const last = c.last_message;
    const preview = last
      ? `${last.sender_id === user?.id ? 'Вы: ' : ''}${last.content}`
      : c.description || (isGroup ? 'Рабочая группа' : 'Диалог с коллегой');
    const unread = c.unread_count || 0;

    return (
      <button
        key={c.id}
        type="button"
        onClick={() => onSelectConversation(c)}
        className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
          isActive
            ? 'bg-white shadow-[0_0_0_1px_#e6e8ec,0_2px_6px_rgba(15,23,42,0.06)]'
            : 'hover:bg-gray-200/60'
        }`}
      >
        <Avatar name={name} src={c.avatar_url} size="md" shape={isGroup ? 'square' : 'circle'} />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-[13px] font-semibold text-slate-900">{name}</span>
              {c.is_private && <Lock className="w-3 h-3 text-gray-400 shrink-0" />}
            </div>
            <span
              className={`text-[11px] tabular-nums shrink-0 ${
                unread ? 'text-blue-700 font-semibold' : 'text-gray-500'
              }`}
            >
              {formatListTime(last?.created_at || c.updated_at)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-xs ${unread ? 'text-gray-700' : 'text-gray-500'}`}>{preview}</span>
            {unread ? (
              <span className="min-w-[19px] h-[19px] px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold tabular-nums flex items-center justify-center shrink-0">
                {unread}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  const sectionLabel = (label: string, action?: React.ReactNode) => (
    <div className="flex items-center justify-between px-2.5 pb-1.5">
      <span className="text-[10.5px] font-semibold text-gray-500 tracking-[0.07em] uppercase">{label}</span>
      {action}
    </div>
  );

  const createGroupButton = (
    <button
      type="button"
      onClick={() => onOpenCreateModal('GROUP')}
      className="w-6 h-6 rounded-md flex items-center justify-center text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
      title="Создать группу"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  );

  const groupsEmpty = (
    <div className="text-center py-8 px-4 rounded-xl border border-dashed border-gray-300">
      <Users className="w-7 h-7 mx-auto text-gray-300 mb-2" />
      <p className="text-xs text-gray-700 font-medium">Нет созданных групп</p>
      <p className="text-[11px] text-gray-500 mt-1">Создайте рабочую группу для совместной работы над проектом</p>
      <button
        type="button"
        onClick={() => onOpenCreateModal('GROUP')}
        className="mt-3 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
      >
        Создать первую группу
      </button>
    </div>
  );

  return (
    <div className="flex h-full shrink-0">
      <NavRail filter={activeTab} onFilterChange={setActiveTab} />

      <aside className="w-[312px] bg-gray-50 border-r border-gray-200 flex flex-col h-full select-none">
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            {activeTab === 'GROUPS' ? 'Группы' : activeTab === 'DIRECT' ? 'Личные' : 'Сообщения'}
          </h1>
          <button
            type="button"
            onClick={() => onOpenCreateModal('GROUP')}
            className="w-8 h-8 rounded-lg bg-white border border-gray-200 text-gray-700 hover:text-slate-900 hover:bg-gray-100 shadow-sm flex items-center justify-center transition-colors"
            title="Новая группа"
          >
            <SquarePen className="w-[15px] h-[15px]" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="w-[15px] h-[15px] absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Поиск"
              className="w-full h-[38px] bg-white border border-gray-200 text-slate-900 text-[13px] rounded-lg pl-9 pr-3 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-100 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
          {(activeTab === 'ALL' || activeTab === 'GROUPS') && (
            <div className="space-y-0.5">
              {sectionLabel('Рабочие группы', createGroupButton)}
              {groups.length === 0
                ? activeTab === 'GROUPS'
                  ? groupsEmpty
                  : <p className="px-2.5 py-2 text-xs text-gray-500">Групп пока нет</p>
                : groups.map(renderRow)}
            </div>
          )}

          {(activeTab === 'ALL' || activeTab === 'DIRECT') && (
            <div className="space-y-0.5">
              {sectionLabel(
                'Личные сообщения',
                <Link href="/contacts" className="text-[11px] text-blue-700 hover:text-blue-800 font-medium">
                  Справочник
                </Link>
              )}
              {dms.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-gray-500">
                  {searchQuery ? 'Ничего не найдено' : 'Личных диалогов пока нет'}
                </p>
              ) : (
                dms.map(renderRow)
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
