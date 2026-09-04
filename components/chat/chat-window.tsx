'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Hash, Users, Lock, Search, Phone, Video, MoreVertical, Sparkles } from 'lucide-react';
import { Conversation, Message, Attachment } from '@/types';
import { useAuth } from '@/lib/auth/auth-context';
import { ChatService } from '@/services/chat-service';
import { MessageItem } from './message-item';
import { MessageInput } from './message-input';

interface ChatWindowProps {
  conversation: Conversation | null;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversation }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversation) return;
    ChatService.getMessages(conversation.id).then(msgs => {
      setMessages(msgs);
      scrollToBottom();
    });

    // Realtime subscription for incoming messages
    const unsubscribe = ChatService.subscribeToMessages(conversation.id, newMsg => {
      setMessages(prev => [...prev, newMsg]);
      scrollToBottom();
    });

    return () => unsubscribe();
  }, [conversation]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
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
    if (conversation) {
      const updated = await ChatService.getMessages(conversation.id);
      setMessages(updated);
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    await ChatService.editMessage(messageId, content);
    if (conversation) {
      const updated = await ChatService.getMessages(conversation.id);
      setMessages(updated);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    await ChatService.deleteMessage(messageId);
    if (conversation) {
      const updated = await ChatService.getMessages(conversation.id);
      setMessages(updated);
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none relative overflow-hidden">
        <div className="absolute w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-blue-400 mb-4 shadow-xl shadow-black/40">
          <MessageSquareIcon className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-white mb-1 tracking-tight">Выберите диалог</h2>
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
          Выберите канал, проектную группу или сотрудника из левой панели для начала рабочего общения.
        </p>
      </div>
    );
  }

  const filteredMessages = messages.filter(m => {
    if (!searchInChat) return true;
    return m.content.toLowerCase().includes(searchInChat.toLowerCase());
  });

  return (
    <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden text-slate-100 relative">
      {/* Header */}
      <div className="px-6 py-3.5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between z-10">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-850 border border-slate-700/60 flex items-center justify-center text-blue-400 shadow-sm shrink-0">
            {conversation.type === 'CHANNEL' ? (
              <Hash className="w-5 h-5" />
            ) : conversation.type === 'GROUP' ? (
              <Users className="w-5 h-5 text-indigo-400" />
            ) : (
              <Hash className="w-5 h-5 text-emerald-400" />
            )}
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight truncate">{conversation.name || 'Диалог'}</h2>
              {conversation.is_private && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                  <Lock className="w-3 h-3" />
                  Приватный
                </span>
              )}
            </div>
            {conversation.description && (
              <p className="text-[11px] text-slate-400 truncate">{conversation.description}</p>
            )}
          </div>
        </div>

        {/* Top Header Actions (Search, Audio, Video) */}
        <div className="flex items-center gap-2 shrink-0">
          {showSearchInput ? (
            <div className="relative animate-in fade-in">
              <input
                type="text"
                value={searchInChat}
                onChange={e => setSearchInChat(e.target.value)}
                placeholder="Поиск в диалоге..."
                className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-xl pl-3 pr-8 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-52"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setShowSearchInput(false);
                  setSearchInChat('');
                }}
                className="absolute right-2 top-2 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSearchInput(true)}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              title="Поиск сообщений"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => alert('Аудиосвязь WebRTC подключена к каналу.')}
            className="p-2 text-slate-400 hover:text-emerald-400 rounded-xl hover:bg-slate-800 transition-colors"
            title="Голосовой звонок"
          >
            <Phone className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => alert('Видеоконференция WebRTC подключена.')}
            className="p-2 text-slate-400 hover:text-blue-400 rounded-xl hover:bg-slate-800 transition-colors"
            title="Видеозвонок"
          >
            <Video className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages List Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
        {filteredMessages.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-xs">
            {searchInChat ? (
              <p>По вашему запросу ничего не найдено</p>
            ) : (
              <div className="space-y-2">
                <Sparkles className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="font-medium text-slate-400">Начало диалога</p>
                <p className="text-[11px] text-slate-500">Отправьте первое сообщение, чтобы начать обсуждение задачи</p>
              </div>
            )}
          </div>
        ) : (
          filteredMessages.map(msg => (
            <MessageItem
              key={msg.id}
              message={msg}
              currentUser={user}
              onAddReaction={handleAddReaction}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onReplyMessage={msgToReply => setReplyingTo(msgToReply)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <MessageInput
        onSendMessage={handleSendMessage}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
};

function MessageSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  );
}
