'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Hash, Users, Lock, Search } from 'lucide-react';
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
      <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
          <Hash className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-semibold text-slate-200 mb-1">Выберите диалог для общения</h2>
        <p className="text-xs text-slate-500 max-w-sm">
          Используйте левую панель, чтобы открыть личный чат, рабочую группу или корпоративный канал.
        </p>
      </div>
    );
  }

  const filteredMessages = messages.filter(m => {
    if (!searchInChat) return true;
    return m.content.toLowerCase().includes(searchInChat.toLowerCase());
  });

  return (
    <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-brand-accent">
            {conversation.type === 'CHANNEL' ? (
              <Hash className="w-5 h-5" />
            ) : conversation.type === 'GROUP' ? (
              <Users className="w-5 h-5" />
            ) : (
              <Hash className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">{conversation.name || 'Диалог'}</h2>
              {conversation.is_private && <Lock className="w-3.5 h-3.5 text-slate-500" />}
            </div>
            {conversation.description && (
              <p className="text-[11px] text-slate-400">{conversation.description}</p>
            )}
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-2">
          {showSearchInput ? (
            <div className="relative animate-in fade-in">
              <input
                type="text"
                value={searchInChat}
                onChange={e => setSearchInChat(e.target.value)}
                placeholder="Поиск в этом чате..."
                className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none"
                autoFocus
              />
              <button
                onClick={() => {
                  setShowSearchInput(false);
                  setSearchInChat('');
                }}
                className="absolute right-2 top-2 text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearchInput(true)}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Поиск сообщений"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages List Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredMessages.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            {searchInChat ? 'Сообщения не найдены' : 'Сообщений пока нет. Напишите первое сообщение!'}
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
