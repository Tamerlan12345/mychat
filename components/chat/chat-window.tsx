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
      <div className="flex-1 bg-[#f6f7f9] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 mb-4">
          <Hash className="w-5 h-5" />
        </div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Выберите диалог</h2>
        <p className="text-xs text-slate-500 max-w-sm">Откройте чат из списка слева.</p>
      </div>
    );
  }

  const filteredMessages = messages.filter(m => {
    if (!searchInChat) return true;
    return m.content.toLowerCase().includes(searchInChat.toLowerCase());
  });

  return (
    <div className="flex-1 bg-[#f6f7f9] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-blue-600">
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
              <h2 className="text-sm font-semibold text-slate-900">{conversation.name || 'Диалог'}</h2>
              {conversation.is_private && <Lock className="w-3.5 h-3.5 text-slate-500" />}
            </div>
            {conversation.description && (
              <p className="text-[11px] text-slate-500">{conversation.description}</p>
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
                 className="bg-white border border-slate-200 text-xs text-slate-800 rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
              <button
                onClick={() => {
                  setShowSearchInput(false);
                  setSearchInChat('');
                }}
                 className="absolute right-2 top-2 text-slate-400 hover:text-slate-900"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearchInput(true)}
               className="p-2 text-slate-400 hover:text-slate-900 rounded-md hover:bg-slate-50 transition-colors"
              title="Поиск сообщений"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages List Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {filteredMessages.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
             {searchInChat ? 'Ничего не найдено' : 'Сообщений пока нет'}
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
