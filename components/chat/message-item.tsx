'use client';

import React, { useState } from 'react';
import { FileText, Download, Smile, Edit2, Trash2, Reply } from 'lucide-react';
import { Message, User } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { FileService } from '@/services/file-service';

interface MessageItemProps {
  message: Message;
  currentUser: User | null;
  onAddReaction: (messageId: string, reaction: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: Message) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  currentUser,
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

  const quickEmojis = ['👍', '❤️', '🔥', '🎉', '😃', '🚀'];

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSaveEdit = () => {
    if (editContent.trim()) {
      onEditMessage(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  // Group reactions by emoji count
  const reactionCounts: Record<string, { count: number; users: string[] }> = {};
  if (message.reactions) {
    message.reactions.forEach(r => {
      if (!reactionCounts[r.reaction]) {
        reactionCounts[r.reaction] = { count: 0, users: [] };
      }
      reactionCounts[r.reaction].count += 1;
      reactionCounts[r.reaction].users.push(r.user_name || 'Сотрудник');
    });
  }

  return (
    <div className={`group flex gap-3 p-2 rounded-xl transition-colors hover:bg-slate-900/60 relative ${isDeleted ? 'opacity-50' : ''}`}>
      <Avatar
        name={message.sender_name || 'Сотрудник'}
        src={message.sender_avatar}
        size="md"
        className="mt-0.5 shrink-0"
      />

      <div className="flex-1 min-w-0">
        {/* Header: Sender name, time, edited indicator */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-xs text-slate-200">
            {message.sender_name || 'Сотрудник'}
          </span>
          <span className="text-[10px] text-slate-500">{formatTime(message.created_at)}</span>
          {message.edited_at && <span className="text-[10px] text-slate-500 italic">(изменено)</span>}
        </div>

        {/* Content or Edit Form */}
        {isEditing ? (
          <div className="flex gap-2 my-1">
            <input
              type="text"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 text-xs text-white rounded px-2 py-1 focus:outline-none"
            />
            <button
              onClick={handleSaveEdit}
              className="bg-brand-primary text-white text-xs px-2.5 py-1 rounded hover:bg-brand-primary-hover"
            >
              Сохранить
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="text-slate-400 text-xs px-2 py-1 hover:text-white"
            >
              Отмена
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        )}

        {/* Attachments Section */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.attachments.map(att => (
              <div
                key={att.id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800 max-w-sm"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-brand-accent shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate text-xs">
                    <p className="font-medium text-slate-200 truncate">{att.file_name}</p>
                    <p className="text-[10px] text-slate-500">{FileService.formatFileSize(att.size)}</p>
                  </div>
                </div>
                <a
                  href={att.file_path}
                  download={att.file_name}
                  className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                  title="Скачать файл"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Reactions Counter Bar */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(reactionCounts).map(([emoji, data]) => (
              <button
                key={emoji}
                onClick={() => currentUser && onAddReaction(message.id, emoji)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition-colors"
                title={data.users.join(', ')}
              >
                <span>{emoji}</span>
                <span className="font-bold text-[11px] text-brand-accent">{data.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover Message Action Bar */}
      {!isDeleted && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-2 flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 shadow-lg z-10">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
            title="Поставить реакцию"
          >
            <Smile className="w-4 h-4" />
          </button>
          <button
            onClick={() => onReplyMessage(message)}
            className="p-1 text-slate-400 hover:text-blue-400 rounded hover:bg-slate-800"
            title="Ответить"
          >
            <Reply className="w-4 h-4" />
          </button>

          {isOwner && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-800"
                title="Редактировать"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDeleteMessage(message.id)}
                className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                title="Удалить"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Quick Emoji Reaction Popup */}
          {showEmojiPicker && (
            <div className="absolute right-0 top-8 bg-slate-950 border border-slate-800 rounded-xl p-2 shadow-2xl flex gap-1 z-50">
              {quickEmojis.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    onAddReaction(message.id, emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="p-1.5 hover:bg-slate-800 rounded text-base transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
