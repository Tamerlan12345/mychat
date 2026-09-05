'use client';

import React, { useState } from 'react';
import { FileText, Download, Smile, Pencil, Trash2, Reply, CheckCheck } from 'lucide-react';
import { Message, User } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { FileService } from '@/services/file-service';

interface MessageItemProps {
  message: Message;
  currentUser: User | null;
  /** Consecutive message from the same sender: no avatar/header, time sits in the gutter on hover. */
  compact?: boolean;
  onAddReaction: (messageId: string, reaction: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: Message) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '😃', '🚀'];

const formatTime = (isoString: string) => {
  const d = new Date(isoString);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const iconButton =
  'w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-slate-900 transition-colors';

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  currentUser,
  compact = false,
  onAddReaction,
  onEditMessage,
  onDeleteMessage,
  onReplyMessage,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isOwner = currentUser?.id === message.sender_id;
  const isDeleted = !!message.deleted_at;
  const senderName = message.sender_name || 'Сотрудник';

  const handleSaveEdit = () => {
    if (editContent.trim()) {
      onEditMessage(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  // Group reactions by emoji; remember whether the current user is among them
  const reactionCounts: Record<string, { count: number; users: string[]; mine: boolean }> = {};
  (message.reactions || []).forEach(r => {
    if (!reactionCounts[r.reaction]) {
      reactionCounts[r.reaction] = { count: 0, users: [], mine: false };
    }
    reactionCounts[r.reaction].count += 1;
    reactionCounts[r.reaction].users.push(r.user_name || 'Сотрудник');
    if (r.user_id === currentUser?.id) reactionCounts[r.reaction].mine = true;
  });

  return (
    <div
      className={`group relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3.5 px-3 rounded-xl transition-colors hover:bg-gray-50 ${
        compact ? 'py-0.5' : 'py-1.5'
      } ${isDeleted ? 'opacity-50' : ''}`}
    >
      {compact ? (
        <span className="text-[10.5px] tabular-nums text-gray-400 text-center pt-[5px] opacity-0 group-hover:opacity-100 transition-opacity select-none">
          {formatTime(message.created_at)}
        </span>
      ) : (
        <Avatar name={senderName} src={message.sender_avatar} size="md" className="mt-0.5" />
      )}

      <div className="min-w-0 flex flex-col gap-1.5 max-w-[640px]">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13.5px] font-bold text-slate-900">{senderName}</span>
            {isOwner && (
              <span className="self-center text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-px">вы</span>
            )}
            <span className="text-[11px] tabular-nums text-gray-400">{formatTime(message.created_at)}</span>
            {isOwner && <CheckCheck className="self-center w-3.5 h-3.5 text-blue-600" />}
            {message.edited_at && <span className="text-[11px] text-gray-400">изменено</span>}
          </div>
        )}

        {message.reply_message && (
          <div className="border-l-2 border-blue-600 bg-blue-50 rounded-r-lg px-3 py-1.5 max-w-[460px]">
            <p className="text-[11.5px] font-semibold text-blue-700">
              {message.reply_message.sender_name || 'Сотрудник'}
            </p>
            <p className="text-xs text-gray-700 truncate">{message.reply_message.content}</p>
          </div>
        )}

        {isEditing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              autoFocus
              className="flex-1 bg-white border border-blue-600 ring-[3px] ring-blue-100 text-sm text-slate-900 rounded-lg px-3 py-1.5 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveEdit}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-gray-600 hover:text-slate-900 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Отмена
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-[1.55] break-words">{message.content}</p>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-0.5">
            {message.attachments.map(att => (
              <div
                key={att.id}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-200 max-w-[400px]"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{att.file_name}</p>
                  <p className="text-[11px] text-gray-500">{FileService.formatFileSize(att.size)}</p>
                </div>
                <a
                  href={att.file_path}
                  download={att.file_name}
                  className="w-[30px] h-[30px] rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-slate-900 hover:bg-gray-100 flex items-center justify-center transition-colors shrink-0"
                  title="Скачать файл"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        )}

        {Object.keys(reactionCounts).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {Object.entries(reactionCounts).map(([emoji, data]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onAddReaction(message.id, emoji)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full border text-xs transition-colors ${
                  data.mine
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
                title={`Отреагировали: ${data.users.join(', ')}`}
              >
                <span>{emoji}</span>
                <span className="text-[11px] font-semibold tabular-nums">{data.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {!isDeleted && (
        <div className="absolute right-4 -top-3.5 hidden group-hover:flex items-center gap-0.5 p-[3px] bg-white border border-gray-200 rounded-[10px] shadow-[0_4px_12px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.05)] z-10">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(v => !v)}
              className={iconButton}
              title="Добавить реакцию"
            >
              <Smile className="w-[15px] h-[15px]" />
            </button>

            {showEmojiPicker && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.10),0_2px_6px_rgba(15,23,42,0.06)] p-1.5 flex gap-0.5 z-50">
                {QUICK_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onAddReaction(message.id, emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="w-8 h-8 hover:bg-gray-100 rounded-lg text-base transition-transform hover:scale-110"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={() => onReplyMessage(message)} className={iconButton} title="Ответить">
            <Reply className="w-[15px] h-[15px]" />
          </button>

          {isOwner && (
            <>
              <button type="button" onClick={() => setIsEditing(true)} className={iconButton} title="Редактировать">
                <Pencil className="w-[14px] h-[14px]" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteMessage(message.id)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                title="Удалить"
              >
                <Trash2 className="w-[14px] h-[14px]" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
