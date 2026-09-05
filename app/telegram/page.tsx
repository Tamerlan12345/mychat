'use client';

import React from 'react';
import { NavRail } from '@/components/sidebar/nav-rail';
import { TelegramView } from '@/components/telegram/telegram-view';

export default function TelegramPage() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-gray-100">
      <NavRail />
      <TelegramView />
    </div>
  );
}
