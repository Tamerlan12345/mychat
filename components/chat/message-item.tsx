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
    <div className={`group flex gap-3.5 p-3 rounded-2xl transition-colors hover:bg-slate-900/60 relative ${isDeleted ? 'opacity-50' : ''}`}>
      <Avatar
        name={message.sender_name || 'Сотрудник'}
        src={message.sender_avatar}
        size="md"
        className="mt-0.5 shrink-0 border border-slate-700/60"
      />

      <div className="flex-1 min-w-0">
        {/* Header: Sender name, time, edited indicator */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-xs text-slate-200 tracking-tight">
            {message.sender_name || 'Сотрудник'}
          </span>
          <span className="text-[10px] text-slate-400">{formatTime(message.created_at)}</span>
          {message.edited_at && <span className="text-[10px] text-slate-400 italic">(изменено)</span>}
        </div>

        {/* Content or Edit Form */}
        {isEditing ? (
          <div className="flex gap-2 my-1">
            <input
              type="text"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 text-xs text-slate-100 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleSaveEdit}
              className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-xl hover:bg-blue-500 font-medium"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-slate-400 text-xs px-2.5 py-1.5 hover:text-white"
            >
              Отмена
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        )}

        {/* Attachments Section */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {message.attachments.map(att => (
              <div
                key={att.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 max-w-md shadow-sm"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate text-xs">
                    <p className="font-medium text-slate-200 truncate">{att.file_name}</p>
                    <p className="text-[10px] text-slate-400">{FileService.formatFileSize(att.size)}</p>
                  </div>
                </div>
                <a
                  href={att.file_path}
                  download={att.file_name}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
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
                type="button"
                onClick={() => onAddReaction(message.id, emoji)}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 transition-colors shadow-sm"
                title={`Отреагировали: ${data.users.join(', ')}`}
              >
                <span>{emoji}</span>
                <span className="text-[10px] font-semibold text-slate-400">{data.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Actions on Hover */}
      <div className="absolute right-3 -top-3 hidden group-hover:flex items-center bg-slate-900 border border-slate-800 rounded-xl shadow-xl px-1 py-0.5 z-10 transition-all">
        {/* Quick Emoji Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800 transition-colors"
            title="Добавить реакцию"
          >
            <Smile className="w-4 h-4" />
          </button>

          {showEmojiPicker && (
            <div className="absolute right-0 top-8 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 flex gap-1 z-50 animate-in fade-in zoom-in-95">
              {quickEmojis.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onAddReaction(message.id, emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-sm transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reply Action */}
        <button
          type="button"
          onClick={() => onReplyMessage(message)}
          className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition-colors"
          title="Ответить"
        >
          <Reply className="w-4 h-4" />
        </button>

        {/* Edit & Delete Actions for message author */}
        {isOwner && !isDeleted && (
          <>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
              title="Редактировать"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteMessage(message.id)}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
              title="Удалить"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
