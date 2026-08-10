'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { Bell, Shield, Moon, Globe, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const { user } = useAuth();
  const [newMsgNotif, setNewMsgNotif] = useState(true);
  const [mentionsNotif, setMentionsNotif] = useState(true);
  const [groupNotif, setGroupNotif] = useState(true);
  const [tgNotif, setTgNotif] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 overflow-hidden">
      <Sidebar onSelectConversation={() => {}} onOpenCreateModal={() => {}} />

      <div className="flex-1 bg-slate-950 p-6 overflow-y-auto space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Личные настройки и уведомления</h1>
            <p className="text-xs text-slate-400">
              Управление профилем сотрудника, уведомлениями веб-браузера и приватностью (Tech Spec §16)
            </p>
          </div>

          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
              <CheckCircle2 className="w-4 h-4" />
              Сохранено!
            </span>
          )}
        </div>

        <div className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Bell className="w-4 h-4 text-brand-primary" />
              <span>Настройки Web Notifications (🔔)</span>
            </h3>

            <div className="space-y-3 pl-2">
              <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-white">Новые личные сообщения</p>
                  <p className="text-[11px] text-slate-400">Всплывающие пуш-уведомления при входе личных сообщений</p>
                </div>
                <input
                  type="checkbox"
                  checked={newMsgNotif}
                  onChange={e => setNewMsgNotif(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-brand-primary"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-white">Упоминания (@mentions)</p>
                  <p className="text-[11px] text-slate-400">Уведомлять, когда коллеги упоминают вас по имени</p>
                </div>
                <input
                  type="checkbox"
                  checked={mentionsNotif}
                  onChange={e => setMentionsNotif(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-brand-primary"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-white">Группы и Каналы</p>
                  <p className="text-[11px] text-slate-400">Уведомления из рабочих групп и каналов</p>
                </div>
                <input
                  type="checkbox"
                  checked={groupNotif}
                  onChange={e => setGroupNotif(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-brand-primary"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-white">Telegram Сообщения</p>
                  <p className="text-[11px] text-slate-400">Уведомления о сообщениях из подключенного Telegram</p>
                </div>
                <input
                  type="checkbox"
                  checked={tgNotif}
                  onChange={e => setTgNotif(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-brand-primary"
                />
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <Button variant="primary" onClick={handleSave}>
              Сохранить настройки
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
