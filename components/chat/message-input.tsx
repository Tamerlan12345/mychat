'use client';

import React, { useState, useRef } from 'react';
import { Paperclip, Send, X, FileText, AlertCircle, Smile } from 'lucide-react';
import { Attachment, Message } from '@/types';
import { FileService } from '@/services/file-service';

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: Partial<Attachment>[]) => void;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  replyingTo,
  onCancelReply,
}) => {
  const [content, setContent] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Partial<Attachment>[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploaded = await FileService.uploadFile(file);
        setPendingAttachments(prev => [...prev, uploaded]);
      } catch (err: any) {
        setErrorMsg(err.message || 'Ошибка загрузки файла');
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && pendingAttachments.length === 0) return;

    onSendMessage(content.trim(), pendingAttachments);
    setContent('');
    setPendingAttachments([]);
    setErrorMsg(null);
    if (onCancelReply) onCancelReply();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-slate-800/80 bg-slate-900/90 backdrop-blur-md p-3.5 space-y-2.5">
      {/* Replying Preview Header */}
      {replyingTo && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-blue-600/10 border-l-2 border-blue-500 rounded-r-xl text-xs">
          <div className="truncate">
            <span className="font-semibold text-blue-400">Ответ для {replyingTo.sender_name}: </span>
            <span className="text-slate-300 truncate">{replyingTo.content}</span>
          </div>
          {onCancelReply && (
            <button type="button" onClick={onCancelReply} className="text-slate-400 hover:text-white ml-2">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Pending Attachments List */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {pendingAttachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span className="truncate max-w-[160px] font-medium">{att.file_name}</span>
              <span className="text-[10px] text-slate-400">({FileService.formatFileSize(att.size || 0)})</span>
              <button
                type="button"
                onClick={() => handleRemoveAttachment(idx)}
                className="text-slate-400 hover:text-rose-400 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Error Banner */}
      {errorMsg && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Input Field and Action Toolbar */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
          title="Прикрепить файл (до 50МБ)"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <div className="flex-1 relative">
          <input
            type="text"
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишите сообщение в чат... (Enter для отправки)"
            className="w-full bg-slate-950/80 border border-slate-800 text-slate-100 text-sm rounded-xl px-4 py-2.5 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={!content.trim() && pendingAttachments.length === 0}
          className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-xl shadow-md shadow-blue-600/20 transition-all shrink-0 flex items-center justify-center"
          title="Отправить сообщение"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
