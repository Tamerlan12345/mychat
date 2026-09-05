'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Search, Info, MessageSquare, X, ChevronUp, RefreshCw } from 'lucide-react';
import { Conversation, Message, Attachment, ConversationMember } from '@/types';
import { useAuth } from '@/lib/auth/auth-context';
import { ChatService } from '@/services/chat-service';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { connectionMonitor } from '@/lib/connection/connection-monitor';
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
const PAGE_SIZE = 50;
const LOAD_EARLIER_THRESHOLD_PX = 120;

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

/** Insert or replace a server message, absorbing the optimistic copy it confirms. */
function mergeServerMessage(list: Message[], incoming: Message, currentUserId?: string): Message[] {
  if (list.some(m => m.id === incoming.id)) {
    return list.map(m => (m.id === incoming.id ? { ...incoming } : m));
  }
  if (currentUserId && incoming.sender_id === currentUserId) {
    const tempIdx = list.findIndex(
      m => m.local_status && m.content === incoming.content && Math.abs(new Date(m.created_at).getTime() - new Date(incoming.created_at).getTime()) < 60_000
    );
    if (tempIdx !== -1) {
      const next = [...list];
      next[tempIdx] = incoming;
      return next;
    }
  }
  return [...list, incoming];
}

const headerButton = (active = false) =>
  `w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-colors ${
    active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-slate-900'
  }`;

const TimelineSkeleton: React.FC = () => (
  <div className="flex flex-col gap-6 px-3 py-4" aria-label="Загрузка сообщений">
    {['w-56', 'w-80', 'w-44', 'w-72'].map((width, i) => (
      <div key={i} className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3.5">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className={`h-3.5 ${width}`} />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
    ))}
  </div>
);

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversation, onConversationRead }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAdjustRef = useRef<number | null>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  // The parent passes a fresh callback on every render; keep it in a ref so effects don't re-run on it.
  const onReadRef = useRef(onConversationRead);
  onReadRef.current = onConversationRead;

  useEffect(() => {
    if (!conversation) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearchInput(true);
      } else if (e.key === 'Escape') {
        if (showSearchInput) {
          setShowSearchInput(false);
          setSearchInChat('');
        } else if (showDetails) {
          setShowDetails(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [conversation, showSearchInput, showDetails]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }, 60);
  };

  const markRead = useCallback(
    (conversationId: string, lastMessage: Message | undefined) => {
      if (!user || !lastMessage || lastMessage.local_status) return;
      ChatService.markAsRead(conversationId, user.id, lastMessage.id)
        .then(() => onReadRef.current?.(conversationId))
        .catch(err => console.error('markAsRead failed:', err));
    },
    [user]
  );

  useEffect(() => {
    if (!conversation) return;
    let active = true;
    setMembers([]);
    setMessages([]);
    setHasMore(false);
    setLoadingMessages(true);

    ChatService.getConversationMembers(conversation.id)
      .then(list => active && setMembers(list))
      .catch(err => console.error('getConversationMembers failed:', err));

    ChatService.getMessages(conversation.id, { limit: PAGE_SIZE })
      .then(msgs => {
        if (!active) return;
        setMessages(msgs);
        setHasMore(msgs.length >= PAGE_SIZE);
        scrollToBottom('auto');
        markRead(conversation.id, msgs[msgs.length - 1]);
      })
      .catch(err => {
        console.error('getMessages failed:', err);
        if (active) toast.error('Не удалось загрузить сообщения', 'Проверьте соединение и попробуйте ещё раз.');
      })
      .finally(() => active && setLoadingMessages(false));

    // Realtime subscription for incoming messages with audio and desktop push alerts
    const unsubscribe = ChatService.subscribeToMessages(conversation.id, newMsg => {
      setMessages(prev => mergeServerMessage(prev, newMsg, user?.id));
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

    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversation, user, markRead]);

  // Keep the viewport anchored on the same message after older ones are prepended.
  useEffect(() => {
    const el = listRef.current;
    if (!el || scrollAdjustRef.current === null) return;
    el.scrollTop += el.scrollHeight - scrollAdjustRef.current;
    scrollAdjustRef.current = null;
  }, [messages]);

  const loadEarlier = useCallback(async () => {
    if (!conversation || loadingMore || !hasMore) return;
    const oldest = messagesRef.current.find(m => !m.local_status);
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const older = await ChatService.getMessages(conversation.id, { before: oldest.created_at, limit: PAGE_SIZE });
      scrollAdjustRef.current = listRef.current?.scrollHeight ?? null;
      setMessages(prev => {
        const known = new Set(prev.map(m => m.id));
        return [...older.filter(m => !known.has(m.id)), ...prev];
      });
      setHasMore(older.length >= PAGE_SIZE);
    } catch (err) {
      console.error('load earlier failed:', err);
      toast.error('Не удалось загрузить более ранние сообщения');
    } finally {
      setLoadingMore(false);
    }
  }, [conversation, loadingMore, hasMore]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < LOAD_EARLIER_THRESHOLD_PX && hasMore && !loadingMore && !searchInChat) {
      void loadEarlier();
    }
  };

  const refreshLoaded = async () => {
    if (!conversation) return;
    const loaded = messagesRef.current.filter(m => !m.local_status).length;
    const updated = await ChatService.getMessages(conversation.id, { limit: Math.max(PAGE_SIZE, loaded) });
    setMessages(prev => {
      const locals = prev.filter(m => m.local_status);
      return [...updated, ...locals];
    });
  };

  const deliver = useCallback(
    async (temp: Message, attachments?: Partial<Attachment>[]) => {
      if (!conversation || !user) return;
      try {
        const saved = await ChatService.sendMessage({
          conversation_id: conversation.id,
          sender_id: user.id,
          content: temp.content,
          reply_to: temp.reply_to,
          attachments,
        });
        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== temp.id);
          return withoutTemp.some(m => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved];
        });
      } catch (err) {
        console.error('sendMessage failed:', err);
        setMessages(prev => prev.map(m => (m.id === temp.id ? { ...m, local_status: 'failed' } : m)));
        toast.error('Сообщение не отправлено', 'Оно сохранено в диалоге — нажмите «Повторить» или дождитесь восстановления связи.');
      }
    },
    [conversation, user]
  );

  const pendingAttachmentsRef = useRef<Map<string, Partial<Attachment>[] | undefined>>(new Map());

  const handleSendMessage = async (content: string, attachments?: Partial<Attachment>[]) => {
    if (!conversation || !user) return;
    const now = new Date().toISOString();
    const temp: Message = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_name: `${user.first_name} ${user.last_name}`.trim(),
      sender_avatar: user.avatar_url,
      content,
      message_type: attachments && attachments.length > 0 ? 'FILE' : 'TEXT',
      reply_to: replyingTo?.id,
      reply_message: replyingTo ?? undefined,
      created_at: now,
      reactions: [],
      attachments: (attachments ?? []).map((a, idx) => ({
        id: a.id || `local-att-${idx}`,
        message_id: '',
        file_name: a.file_name || 'file',
        file_path: a.file_path || '#',
        mime_type: a.mime_type || 'application/octet-stream',
        size: a.size || 0,
        created_at: now,
      })),
      local_status: 'pending',
    };
    pendingAttachmentsRef.current.set(temp.id, attachments);
    setMessages(prev => [...prev, temp]);
    setReplyingTo(null);
    scrollToBottom();
    await deliver(temp, attachments);
    pendingAttachmentsRef.current.delete(temp.id);
  };

  const retryMessage = (message: Message) => {
    setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, local_status: 'pending' } : m)));
    void deliver({ ...message, local_status: 'pending' }, pendingAttachmentsRef.current.get(message.id));
  };

  // When the connection returns, re-send everything that failed while it was gone.
  useEffect(() => {
    return connectionMonitor.subscribe(state => {
      if (state !== 'online') return;
      const failed = messagesRef.current.filter(m => m.local_status === 'failed');
      failed.forEach(m => retryMessage(m));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const handleAddReaction = async (messageId: string, reaction: string) => {
    if (!user) return;
    try {
      await ChatService.addReaction(messageId, user.id, reaction);
      await refreshLoaded();
    } catch (err) {
      console.error(err);
      toast.error('Не удалось добавить реакцию');
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    try {
      await ChatService.editMessage(messageId, content);
      await refreshLoaded();
    } catch (err) {
      console.error(err);
      toast.error('Не удалось сохранить изменения');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await ChatService.deleteMessage(messageId);
      await refreshLoaded();
    } catch (err) {
      console.error(err);
      toast.error('Не удалось удалить сообщение');
    }
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
            <Avatar name={title} src={conversation.avatar_url} size="md" shape={isGroup ? 'square' : 'circle'} />
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
              <button type="button" onClick={() => setShowSearchInput(true)} className={headerButton()} title="Поиск сообщений (Ctrl+F)">
                <Search className="w-[17px] h-[17px]" />
              </button>
            )}


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
        <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 py-4">
          {loadingMessages ? (
            <TimelineSkeleton />
          ) : timeline.length === 0 ? (
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
              {hasMore && !searchInChat && (
                <div className="flex justify-center py-1">
                  <button
                    type="button"
                    onClick={() => void loadEarlier()}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-gray-100 hover:bg-gray-200 text-[11px] font-medium text-gray-600 transition-colors disabled:opacity-60"
                  >
                    {loadingMore ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ChevronUp className="w-3 h-3" />}
                    {loadingMore ? 'Загружаем…' : 'Более ранние сообщения'}
                  </button>
                </div>
              )}
              {timeline.map(entry =>
                entry.kind === 'day' ? (
                  <div key={entry.key} className="flex justify-center py-2">
                    <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-3 py-1">{entry.label}</span>
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
                    onRetry={retryMessage}
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
