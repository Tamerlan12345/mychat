'use client';

import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, ShieldCheck, BellOff, Volume2, RefreshCw, WifiOff } from 'lucide-react';
import { notificationService } from '@/lib/notifications/notification-service';
import { connectionMonitor, type ConnectionState } from '@/lib/connection/connection-monitor';

// Width of the three OS-drawn caption buttons on Windows (3 × 46px) that overlay our titlebar.
const NATIVE_CONTROLS_WIDTH = 138;

export const AppTitlebar: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [nativeControls, setNativeControls] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>('online');

  useEffect(() => connectionMonitor.subscribe(setConnection), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bridge = window.desktopBridge;
    setIsDesktop(Boolean(bridge?.isDesktop));
    setSoundOn(notificationService.isSoundEnabled());
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
      const max = await window.desktopBridge.isWindowMaximized();
      setIsMaximized(max);
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

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    notificationService.setSoundEnabled(next);
    if (next) {
      notificationService.playChime();
    }
  };

  const windowButton =
    'w-[46px] h-9 flex items-center justify-center transition-colors text-gray-500 hover:bg-gray-100 hover:text-slate-900';

  return (
    <div
      className="h-9 bg-white border-b border-gray-200 flex items-center justify-between pl-3 select-none text-gray-500 text-xs z-50 shrink-0"
      style={{
        WebkitAppRegion: isDesktop ? 'drag' : 'no-drag',
        paddingRight: isDesktop && nativeControls ? NATIVE_CONTROLS_WIDTH : 0,
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="flex items-center gap-2.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1.5 text-slate-900 font-semibold text-xs tracking-tight">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          <span>Centras Chat</span>
        </div>
        <div
          className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${
            connection === 'online'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : connection === 'reconnecting'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
          title={connection === 'online' ? 'Соединение с сервером установлено' : connection === 'reconnecting' ? 'Восстанавливаем соединение' : 'Сеть недоступна'}
        >
          {connection === 'online' ? (
            <ShieldCheck className="w-3 h-3" />
          ) : connection === 'reconnecting' ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          <span>{connection === 'online' ? 'Защищённое соединение' : connection === 'reconnecting' ? 'Переподключение…' : 'Нет сети'}</span>
        </div>
      </div>

      <div className="flex-1 h-full" />

      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={toggleSound}
          title={soundOn ? 'Звук уведомлений включен (нажмите для проверки)' : 'Звук уведомлений выключен'}
          className={`px-2 py-1 mr-1 rounded-md text-[11px] flex items-center gap-1.5 transition-colors ${
            soundOn
              ? 'text-blue-700 hover:bg-blue-50'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
        >
          {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          <span className="hidden md:inline text-[10px] font-medium">
            {soundOn ? 'Звук активен' : 'Без звука'}
          </span>
        </button>

        {isDesktop && !nativeControls && (
          <div className="flex items-center h-full ml-1">
            <button type="button" onClick={handleMinimize} className={windowButton} title="Свернуть">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleMaximize}
              className={windowButton}
              title={isMaximized ? 'Восстановить' : 'Развернуть'}
            >
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
    </div>
  );
};
