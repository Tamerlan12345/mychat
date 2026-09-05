'use client';

import React, { useState, useRef } from 'react';
import { Paperclip, Send, X, FileText, AlertCircle, Reply } from 'lucide-react';
import { Attachment, Message } from '@/types';
import { FileService } from '@/services/file-service';

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: Partial<Attachment>[]) => void;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  /** Shown inside the placeholder, e.g. the conversation name. */
  targetName?: string;
}

const MAX_ROWS = 6;

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  replyingTo,
  onCancelReply,
  targetName,
}) => {
  const [content, setContent] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Partial<Attachment>[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    const lineHeight = 21;
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * MAX_ROWS + 8)}px`;
  };

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

  const canSend = Boolean(content.trim()) || pendingAttachments.length > 0;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;

    onSendMessage(content.trim(), pendingAttachments);
    setContent('');
    setPendingAttachments([]);
    setErrorMsg(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (onCancelReply) onCancelReply();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && replyingTo && onCancelReply) {
      onCancelReply();
    }
  };

  return (
    <div className="px-6 pb-5 pt-2 shrink-0">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col bg-white border border-gray-200 rounded-2xl shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow] focus-within:border-blue-600 focus-within:shadow-[0_0_0_3px_#dbeafe,0_2px_8px_rgba(15,23,42,0.05)]"
      >
        {replyingTo && (
          <div className="flex items-center gap-2.5 px-3.5 py-2 border-b border-gray-100">
            <Reply className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <div className="flex-1 min-w-0 flex items-baseline gap-1.5 text-xs">
              <span className="font-semibold text-blue-700 shrink-0">Ответ · {replyingTo.sender_name || 'Сотрудник'}</span>
              <span className="text-gray-500 truncate">{replyingTo.content}</span>
            </div>
            {onCancelReply && (
              <button
                type="button"
                onClick={onCancelReply}
                className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-slate-900 hover:bg-gray-100 transition-colors"
                title="Отменить ответ"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={content}
          rows={1}
          onChange={e => {
            setContent(e.target.value);
            resize(e.target);
          }}
          onKeyDown={handleKeyDown}
          placeholder={targetName ? `Написать в «${targetName}»…` : 'Написать сообщение…'}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-[21px] text-slate-900 placeholder-gray-400 focus:outline-none"
        />

        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-1">
            {pendingAttachments.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg pl-1.5 pr-2 py-1 text-xs text-gray-700"
              >
                <span className="w-[18px] h-[18px] rounded bg-blue-50 text-blue-700 flex items-center justify-center">
                  <FileText className="w-[11px] h-[11px]" />
                </span>
                <span className="truncate max-w-[180px] font-medium">{att.file_name}</span>
                <span className="text-gray-400">{FileService.formatFileSize(att.size || 0)}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(idx)}
                  className="text-gray-400 hover:text-rose-600 transition-colors"
                  title="Убрать файл"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="mx-4 mt-1.5 flex items-center gap-2 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-between px-2.5 pb-2 pt-1.5">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-slate-900 transition-colors"
            title="Прикрепить файл (до 50 МБ)"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!canSend}
              className="w-9 h-9 rounded-[10px] bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_2px_6px_rgba(37,99,235,0.35)] hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center"
              title="Отправить (Enter). Новая строка — Shift+Enter"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
