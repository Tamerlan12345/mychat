'use client';

import React from 'react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { TelegramView } from '@/components/telegram/telegram-view';

export default function TelegramPage() {
  return (
    <div className="flex h-screen w-screen bg-slate-950 overflow-hidden">
      <Sidebar
        onSelectConversation={() => {}}
        onOpenCreateModal={() => {}}
      />
      <TelegramView />
    </div>
  );
}
