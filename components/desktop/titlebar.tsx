'use client';

import React, { useEffect, useState } from 'react';
import { Minus, Square, X, ShieldCheck, Bell, BellOff, Volume2 } from 'lucide-react';
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
      className="h-9 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between px-3 select-none text-slate-400 text-xs z-50 shrink-0"
      style={{ WebkitAppRegion: isDesktop ? 'drag' : 'no-drag' } as React.CSSProperties}
    >
      {/* Left: Branding & Security Badge */}
      <div
        className="flex items-center gap-2.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-xs tracking-tight">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
          <span>Centras Workspace</span>
        </div>
        <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-medium">
          <ShieldCheck className="w-3 h-3" />
          <span>{isDesktop ? 'DPAPI Encrypted Client' : 'Zero-Trust Secure Web'}</span>
        </div>
      </div>

      {/* Center: Draggable Spacer */}
      <div className="flex-1 h-full" />

      {/* Right: Sound Chime Quick Toggle & Window Controls */}
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
              ? 'text-blue-400 hover:bg-blue-600/15 hover:text-blue-300'
              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-400'
          }`}
        >
          {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          <span className="hidden md:inline text-[10px] font-medium">
            {soundOn ? 'Звук активен' : 'Без звука'}
          </span>
        </button>

        {isDesktop && (
          <div className="flex items-center ml-2 border-l border-slate-800 pl-1">
            <button
              type="button"
              onClick={handleMinimize}
              className="w-8 h-7 flex items-center justify-center hover:bg-slate-800 hover:text-slate-200 rounded transition-colors text-slate-400"
              title="Свернуть"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleMaximize}
              className="w-8 h-7 flex items-center justify-center hover:bg-slate-800 hover:text-slate-200 rounded transition-colors text-slate-400"
              title={isMaximized ? 'Восстановить' : 'Развернуть'}
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-7 flex items-center justify-center hover:bg-rose-600 hover:text-white rounded transition-colors text-slate-400"
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
