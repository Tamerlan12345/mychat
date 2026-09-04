'use client';

import React, { useState, useRef } from 'react';
import { Paperclip, Send, X, FileText, AlertCircle } from 'lucide-react';
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
    <div className="border-t border-slate-200 bg-white p-3 space-y-2">
      {/* Replying Preview Header */}
      {replyingTo && (
         <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-l-2 border-blue-600 rounded-r-md text-xs">
          <div className="truncate">
             <span className="font-semibold text-blue-700">Ответ для {replyingTo.sender_name}: </span>
             <span className="text-slate-500 truncate">{replyingTo.content}</span>
          </div>
          {onCancelReply && (
            <button onClick={onCancelReply} className="text-slate-500 hover:text-white ml-2">
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
               className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-600"
            >
               <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span className="truncate max-w-[150px] font-medium">{att.file_name}</span>
              <span className="text-[10px] text-slate-500">({FileService.formatFileSize(att.size || 0)})</span>
              <button
                onClick={() => handleRemoveAttachment(idx)}
                className="text-slate-500 hover:text-rose-400 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Validation Error Banner */}
      {errorMsg && (
         <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-md">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Input Form Controls */}
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
           className="p-2.5 text-slate-400 hover:text-slate-900 rounded-md hover:bg-slate-50 transition-colors"
          title="Прикрепить файл (до 50 МБ)"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Написать сообщение..."
           className="flex-1 bg-white border border-slate-200 focus:border-blue-500 text-slate-900 rounded-md px-4 py-2.5 text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
        />

        <button
          type="submit"
          disabled={!content.trim() && pendingAttachments.length === 0}
           className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          title="Отправить сообщение"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
