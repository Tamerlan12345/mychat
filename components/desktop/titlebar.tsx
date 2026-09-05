'use client';

import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { connectionMonitor, type ConnectionState } from '@/lib/connection/connection-monitor';

// Width of the three OS-drawn caption buttons on Windows (3 × 46px) that overlay our titlebar.
const NATIVE_CONTROLS_WIDTH = 138;

const STATE_LABEL: Record<ConnectionState, string> = {
  online: 'Подключено',
  reconnecting: 'Переподключение…',
  offline: 'Нет сети',
};

export const AppTitlebar: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [nativeControls, setNativeControls] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('online');

  useEffect(() => connectionMonitor.subscribe(setConnection), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bridge = window.desktopBridge;
    setIsDesktop(Boolean(bridge?.isDesktop));
    if (!bridge?.isDesktop) return;

    bridge.getPlatformInfo?.().then(info => setNativeControls(Boolean(info.hasNativeWindowControls))).catch(() => {});
    bridge.isWindowMaximized?.().then(setIsMaximized).catch(() => {});
    const unsubscribe = bridge.onWindowStateChanged?.(state => setIsMaximized(state.isMaximized));
    return () => unsubscribe?.();
  }, []);

  const handleMinimize = () => {
    window.desktopBridge?.minimizeWindow?.();
  };

  const handleMaximize = async () => {
    await window.desktopBridge?.maximizeWindow?.();
    if (window.desktopBridge?.isWindowMaximized) {
      setIsMaximized(await window.desktopBridge.isWindowMaximized());
    }
  };

  const handleClose = () => {
    window.desktopBridge?.closeWindow?.();
  };

  // Native titlebars toggle maximize on double-click; buttons inside the bar must not trigger it.
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isDesktop) return;
    if ((e.target as HTMLElement).closest('button')) return;
    void handleMaximize();
  };

  const windowButton =
    'w-[46px] h-9 flex items-center justify-center transition-colors text-gray-500 hover:bg-gray-100 hover:text-slate-900';

  const dotClass =
    connection === 'online' ? 'bg-emerald-500' : connection === 'reconnecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500';

  return (
    <div
      className="h-9 bg-white border-b border-gray-200 flex items-center justify-between pl-3 select-none text-gray-500 text-xs z-50 shrink-0"
      style={{
        WebkitAppRegion: isDesktop ? 'drag' : 'no-drag',
        paddingRight: isDesktop && nativeControls ? NATIVE_CONTROLS_WIDTH : 0,
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center gap-2 text-slate-900 font-semibold text-xs tracking-tight">
        <span>Centras Chat</span>
        <span className="flex items-center gap-1.5" title={STATE_LABEL[connection]}>
          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
          {connection !== 'online' && (
            <span className={`font-medium ${connection === 'reconnecting' ? 'text-amber-700' : 'text-rose-700'}`}>
              {STATE_LABEL[connection]}
            </span>
          )}
        </span>
      </div>

      <div className="flex-1 h-full" />

      {isDesktop && !nativeControls && (
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button type="button" onClick={handleMinimize} className={windowButton} title="Свернуть">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={handleMaximize} className={windowButton} title={isMaximized ? 'Восстановить' : 'Развернуть'}>
            {isMaximized ? <Copy className="w-3 h-3 -scale-x-100" /> : <Square className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-[46px] h-9 flex items-center justify-center transition-colors text-gray-500 hover:bg-rose-600 hover:text-white"
            title="Закрыть"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
