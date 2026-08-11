'use client';

import React from 'react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { TelegramView } from '@/components/telegram/telegram-view';

export default function TelegramPage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <Sidebar
        onSelectConversation={() => {}}
        onOpenCreateModal={() => {}}
      />
      <TelegramView />
    </div>
  );
}
