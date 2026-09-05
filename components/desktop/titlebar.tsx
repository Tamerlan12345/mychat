'use client';

import React, { useEffect, useState } from 'react';
import { Minus, Square, X, ShieldCheck, BellOff, Volume2 } from 'lucide-react';
import { notificationService } from '@/lib/notifications/notification-service';

export const AppTitlebar: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDesktop(Boolean(window.desktopBridge?.isDesktop));
      setSoundOn(notificationService.isSoundEnabled());

      if (window.desktopBridge?.isWindowMaximized) {
        window.desktopBridge.isWindowMaximized().then(setIsMaximized).catch(() => {});
      }
    }
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

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    notificationService.setSoundEnabled(next);
    if (next) {
      notificationService.playChime();
    }
  };

  // Only render desktop window title controls if running in Electron;
  // in web browser, render a subtle top security/branding bar
  return (
    <div
      className="h-9 bg-white border-b border-gray-200 flex items-center justify-between px-3 select-none text-gray-500 text-xs z-50 shrink-0"
      style={{ WebkitAppRegion: isDesktop ? 'drag' : 'no-drag' } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1.5 text-slate-900 font-semibold text-xs tracking-tight">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          <span>Centras Chat</span>
        </div>
        <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-700 font-medium">
          <ShieldCheck className="w-3 h-3" />
          <span>Защищённое соединение</span>
        </div>
      </div>

      <div className="flex-1 h-full" />

      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={toggleSound}
          title={soundOn ? 'Звук уведомлений включен (нажмите для проверки)' : 'Звук уведомлений выключен'}
          className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1.5 transition-colors ${
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

        {isDesktop && (
          <div className="flex items-center ml-2 border-l border-gray-200 pl-1">
            <button
              type="button"
              onClick={handleMinimize}
              className="w-8 h-7 flex items-center justify-center hover:bg-gray-100 hover:text-slate-900 rounded transition-colors text-gray-500"
              title="Свернуть"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleMaximize}
              className="w-8 h-7 flex items-center justify-center hover:bg-gray-100 hover:text-slate-900 rounded transition-colors text-gray-500"
              title={isMaximized ? 'Восстановить' : 'Развернуть'}
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-7 flex items-center justify-center hover:bg-rose-600 hover:text-white rounded transition-colors text-gray-500"
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
