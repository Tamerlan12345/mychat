'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { connectionMonitor, type ConnectionState } from '@/lib/connection/connection-monitor';

/** Thin status strip under the titlebar; visible only while the connection is degraded. */
export const ConnectionBanner: React.FC = () => {
  const [state, setState] = useState<ConnectionState>('online');

  useEffect(() => connectionMonitor.subscribe(setState), []);

  if (state === 'online') return null;

  const offline = state === 'offline';
  return (
    <div
      role="status"
      className={`shrink-0 flex items-center justify-center gap-2 h-8 text-xs font-medium border-b ${
        offline ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'
      }`}
    >
      {offline ? <WifiOff className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
      <span>
        {offline
          ? 'Нет соединения. Сообщения отправятся автоматически, когда сеть появится.'
          : 'Переподключение к серверу…'}
      </span>
    </div>
  );
};
