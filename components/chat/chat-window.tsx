'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Lock, Search, Phone, Video, Bell, Info, MessageSquare, X } from 'lucide-react';
import { Conversation, Message, Attachment, ConversationMember } from '@/types';
import { useAuth } from '@/lib/auth/auth-context';
import { ChatService } from '@/services/chat-service';
import { Avatar } from '@/components/ui/avatar';
import { MessageItem } from './message-item';
import { MessageInput } from './message-input';
import { ConversationDetails } from './conversation-details';
import { notificationService } from '@/lib/notifications/notification-service';

interface ChatWindowProps {
  conversation: Conversation | null;
  /** Fired after the open conversation is marked as read, so the list can refresh its counters. */
  onConversationRead?: (conversationId: string) => void;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

type TimelineEntry =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: Message; compact: boolean };

function buildTimeline(messages: Message[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let prev: Message | null = null;
  for (const m of messages) {
    const sameDay = prev && new Date(prev.created_at).toDateString() === new Date(m.created_at).toDateString();
    if (!sameDay) {
      entries.push({ kind: 'day', key: `day-${m.created_at}`, label: dayLabel(m.created_at) });
    }
    const compact =
      !!prev &&
      !!sameDay &&
      prev.sender_id === m.sender_id &&
      !m.reply_message &&
      !m.reply_to &&
      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS;
    entries.push({ kind: 'message', key: m.id, message: m, compact });
    prev = m;
  }
  return entries;
}

function pluralMembers(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'участник';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'участника';
  return 'участников';
}

const headerButton = (active = false) =>
  `w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-colors ${
    active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-slate-900'
  }`;

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversation, onConversationRead }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const markRead = (conversationId: string, lastMessage: Message | undefined) => {
    if (!user || !lastMessage) return;
    ChatService.markAsRead(conversationId, user.id, lastMessage.id)
      .then(() => onConversationRead?.(conversationId))
      .catch(err => console.error('markAsRead failed:', err));
  };

  useEffect(() => {
    if (!conversation) return;
    setMembers([]);
    ChatService.getConversationMembers(conversation.id)
      .then(setMembers)
      .catch(err => console.error('getConversationMembers failed:', err));
    ChatService.getMessages(conversation.id).then(msgs => {
      setMessages(msgs);
      scrollToBottom();
      markRead(conversation.id, msgs[msgs.length - 1]);
    });

    // Realtime subscription for incoming messages with audio and desktop push alerts
    const unsubscribe = ChatService.subscribeToMessages(conversation.id, newMsg => {
      setMessages(prev => [...prev, newMsg]);
      scrollToBottom();
      if (user && newMsg.sender_id !== user.id) {
        void notificationService.notifyNewMessage(
          newMsg.sender_name || 'Коллега',
          newMsg.content,
          conversation.name
        );
        // The conversation is on screen, so what just arrived counts as read.
        markRead(conversation.id, newMsg);
      }
    });

    return () => unsubscribe();
  }, [conversation, user]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const refreshMessages = async () => {
    if (!conversation) return;
    const updated = await ChatService.getMessages(conversation.id);
    setMessages(updated);
  };

  const handleSendMessage = async (content: string, attachments?: Partial<Attachment>[]) => {
    if (!conversation || !user) return;
    const newMsg = await ChatService.sendMessage({
      conversation_id: conversation.id,
      sender_id: user.id,
      content,
      reply_to: replyingTo?.id,
      attachments,
    });
    setMessages(prev => [...prev, newMsg]);
    setReplyingTo(null);
    scrollToBottom();
  };

  const handleAddReaction = async (messageId: string, reaction: string) => {
    if (!user) return;
    await ChatService.addReaction(messageId, user.id, reaction);
    await refreshMessages();
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    await ChatService.editMessage(messageId, content);
    await refreshMessages();
  };

  const handleDeleteMessage = async (messageId: string) => {
    await ChatService.deleteMessage(messageId);
    await refreshMessages();
  };

  if (!conversation) {
    return (
      <div className="flex-1 bg-white flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
          <MessageSquare className="w-6 h-6" />
        </div>
        <h2 className="text-[15px] font-bold text-slate-900 mb-1 tracking-tight">Выберите диалог</h2>
        <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
          Выберите рабочую группу или коллегу в списке слева, чтобы начать общение.
        </p>
      </div>
    );
  }

  const isGroup = conversation.type !== 'DIRECT';
  const title = conversation.name || (isGroup ? 'Группа' : 'Диалог');
  const filteredMessages = messages.filter(m => {
    if (!searchInChat) return true;
    return m.content.toLowerCase().includes(searchInChat.toLowerCase());
  });
  const timeline = buildTimeline(filteredMessages);
  const onlineCount = members.filter(m => m.user?.status === 'ONLINE').length;

  return (
    <div className="flex-1 flex min-w-0 h-full overflow-hidden relative">
      <div className="flex-1 min-w-0 bg-white flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="h-16 px-6 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              name={title}
              src={conversation.avatar_url}
              size="md"
              shape={isGroup ? 'square' : 'circle'}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[15px] font-bold text-slate-900 tracking-tight truncate">{title}</h2>
                {conversation.is_private && <Lock className="w-3 h-3 text-gray-400 shrink-0" />}
              </div>
              <p className="text-xs text-gray-500 truncate">
                {isGroup && members.length > 0 ? (
                  <>
                    {members.length} {pluralMembers(members.length)}
                    {onlineCount > 0 && (
                      <>
                        {' · '}
                        <span className="text-emerald-600 font-medium">{onlineCount} в сети</span>
                      </>
                    )}
                    {conversation.description ? ` · ${conversation.description}` : ''}
                  </>
                ) : (
                  conversation.description || (isGroup ? (conversation.is_private ? 'Приватная группа' : 'Рабочая группа') : 'Личный диалог')
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {showSearchInput ? (
              <div className="relative mr-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchInChat}
                  onChange={e => setSearchInChat(e.target.value)}
                  placeholder="Поиск в диалоге"
                  className="h-[34px] w-60 bg-white border border-gray-200 text-[13px] text-slate-900 rounded-[10px] pl-8 pr-8 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-100"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowSearchInput(false);
                    setSearchInChat('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-slate-900"
                  title="Закрыть поиск"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowSearchInput(true)} className={headerButton()} title="Поиск сообщений">
                <Search className="w-[17px] h-[17px]" />
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                notificationService.playChime();
                await notificationService.requestPermission();
              }}
              className={headerButton()}
              title="Проверить звуковой сигнал и разрешить push-уведомления"
            >
              <Bell className="w-[17px] h-[17px]" />
            </button>

            <span className="w-px h-[18px] bg-gray-200 mx-1.5" />

            <button
              type="button"
              onClick={() => alert('Аудиосвязь WebRTC подключена к группе.')}
              className={headerButton()}
              title="Голосовой звонок"
            >
              <Phone className="w-[17px] h-[17px]" />
            </button>
            <button
              type="button"
              onClick={() => alert('Видеоконференция WebRTC подключена.')}
              className={headerButton()}
              title="Видеозвонок"
            >
              <Video className="w-[17px] h-[17px]" />
            </button>
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className={headerButton(showDetails)}
              title={isGroup ? 'О группе' : 'О диалоге'}
            >
              <Info className="w-[17px] h-[17px]" />
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {timeline.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              {searchInChat ? (
                <p className="text-xs text-gray-500">По запросу «{searchInChat}» ничего не найдено</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-700">Сообщений пока нет</p>
                  <p className="text-xs text-gray-500 mt-1">Напишите первое сообщение, чтобы начать обсуждение</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1 min-h-full justify-end">
              {timeline.map(entry =>
                entry.kind === 'day' ? (
                  <div key={entry.key} className="flex justify-center py-2">
                    <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-3 py-1">
                      {entry.label}
                    </span>
                  </div>
                ) : (
                  <MessageItem
                    key={entry.key}
                    message={entry.message}
                    compact={entry.compact}
                    currentUser={user}
                    onAddReaction={handleAddReaction}
                    onEditMessage={handleEditMessage}
                    onDeleteMessage={handleDeleteMessage}
                    onReplyMessage={msgToReply => setReplyingTo(msgToReply)}
                  />
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <MessageInput
          onSendMessage={handleSendMessage}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          targetName={conversation.name}
        />
      </div>

      {showDetails && (
        <>
          <button
            type="button"
            aria-label="Скрыть панель"
            onClick={() => setShowDetails(false)}
            className="xl:hidden absolute inset-0 z-20 bg-slate-900/20"
          />
          <div className="absolute right-0 top-0 bottom-0 z-30 shadow-[0_12px_32px_rgba(15,23,42,0.14)] xl:static xl:z-auto xl:shadow-none">
            <ConversationDetails conversation={conversation} members={members} messages={messages} onClose={() => setShowDetails(false)} />
          </div>
        </>
      )}
    </div>
  );
};
