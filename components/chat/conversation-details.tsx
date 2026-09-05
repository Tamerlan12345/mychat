'use client';

import React from 'react';
import { X, Lock, Download, FileText } from 'lucide-react';
import { Conversation, ConversationMember, Message } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { FileService } from '@/services/file-service';

interface ConversationDetailsProps {
  conversation: Conversation;
  members: ConversationMember[];
  messages: Message[];
  onClose: () => void;
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export const ConversationDetails: React.FC<ConversationDetailsProps> = ({ conversation, members, messages, onClose }) => {
  const isGroup = conversation.type !== 'DIRECT';
  const name = conversation.name || (isGroup ? 'Группа' : 'Личный диалог');
  const onlineCount = members.filter(m => m.user?.status === 'ONLINE').length;

  const files = messages
    .filter(m => !m.deleted_at && m.attachments && m.attachments.length > 0)
    .flatMap(m => (m.attachments || []).map(a => ({ ...a, sender: m.sender_name, at: m.created_at })))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <aside className="w-[300px] shrink-0 bg-white border-l border-gray-100 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100 shrink-0">
        <span className="text-[13px] font-bold text-slate-900">{isGroup ? 'О группе' : 'О диалоге'}</span>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-slate-900 transition-colors"
          title="Скрыть панель"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        <div className="flex flex-col items-center text-center gap-2.5">
          <Avatar name={name} src={conversation.avatar_url} size="xl" shape={isGroup ? 'square' : 'circle'} />
          <div>
            <p className="text-[15px] font-bold text-slate-900 tracking-tight">{name}</p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
              {conversation.is_private && <Lock className="w-3 h-3" />}
              {isGroup
                ? `${conversation.is_private ? 'Приватная группа' : 'Рабочая группа'}${members.length ? ` · ${members.length} участников` : ''}`
                : 'Личный диалог'}
            </p>
          </div>
          {conversation.description && (
            <p className="text-xs leading-relaxed text-gray-600 max-w-[236px]">{conversation.description}</p>
          )}
        </div>

        {members.length > 0 && (
          <section className="space-y-0.5">
            <div className="flex items-center justify-between px-0.5 pb-1.5">
              <span className="text-xs font-bold text-slate-900">Участники</span>
              <span className="text-[11px] text-gray-500">
                {onlineCount > 0 ? <span className="text-emerald-600 font-medium">{onlineCount} в сети</span> : members.length}
              </span>
            </div>
            {members.map(m => {
              const label = m.user ? `${m.user.first_name} ${m.user.last_name}`.trim() : 'Сотрудник';
              return (
                <div key={m.user_id} className="flex items-center gap-2.5 py-1.5 px-0.5">
                  <Avatar name={label} src={m.user?.avatar_url} size="sm" status={m.user?.status} />
                  <span className="flex-1 truncate text-[13px] font-medium text-slate-900">{label}</span>
                  {m.role === 'ADMIN' && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">админ</span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <section className="space-y-0.5">
          <div className="flex items-center justify-between px-0.5 pb-1.5">
            <span className="text-xs font-bold text-slate-900">Файлы</span>
            <span className="text-[11px] text-gray-500">{files.length}</span>
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-gray-500 px-0.5 py-1">В этом диалоге ещё нет файлов</p>
          ) : (
            files.slice(0, 8).map(f => (
              <a
                key={f.id}
                href={f.file_path}
                download={f.file_name}
                className="group flex items-center gap-2.5 py-1.5 px-1 -mx-1 rounded-lg hover:bg-gray-50 transition-colors"
                title="Скачать файл"
              >
                <span className="w-[34px] h-[34px] rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <FileText className="w-[15px] h-[15px]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-xs font-medium text-slate-900">{f.file_name}</span>
                  <span className="block text-[11px] text-gray-500">
                    {formatDay(f.at)} · {f.sender || 'Сотрудник'} · {FileService.formatFileSize(f.size)}
                  </span>
                </span>
                <Download className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))
          )}
        </section>
      </div>
    </aside>
  );
};
