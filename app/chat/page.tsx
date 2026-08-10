'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ChatWindow } from '@/components/chat/chat-window';
import { ChannelModal } from '@/components/chat/channel-modal';
import { Conversation } from '@/types';
import { ChatService } from '@/services/chat-service';

export default function ChatPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [modalType, setModalType] = useState<'GROUP' | 'CHANNEL' | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (user) {
      ChatService.getConversations(user.id).then(cList => {
        if (cList.length > 0 && !activeConversation) {
          setActiveConversation(cList[0]);
        }
      });
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-xs text-slate-400">
        Загрузка приложения...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 overflow-hidden">
      <Sidebar
        activeConversationId={activeConversation?.id}
        onSelectConversation={conv => setActiveConversation(conv)}
        onOpenCreateModal={type => setModalType(type)}
      />

      <ChatWindow conversation={activeConversation} />

      <ChannelModal
        isOpen={modalType !== null}
        onClose={() => setModalType(null)}
        type={modalType || 'CHANNEL'}
        currentUserId={user.id}
        onCreated={() => {
          ChatService.getConversations(user.id).then(cList => {
            if (cList.length > 0) setActiveConversation(cList[cList.length - 1]);
          });
        }}
      />
    </div>
  );
}
