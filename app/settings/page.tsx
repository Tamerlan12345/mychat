'use client';

import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, RefreshCw, Save, Volume2, XCircle } from 'lucide-react';
import { features } from '@/lib/features';
import { notificationService } from '@/lib/notifications/notification-service';
import { toast } from '@/components/ui/toast';
import { NavRail } from '@/components/sidebar/nav-rail';
import { DesktopPreferences } from '@/components/desktop/desktop-preferences';
import { useAuth } from '@/lib/auth/auth-context';
import { TelegramService } from '@/services/telegram-service';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [newMsgNotif, setNewMsgNotif] = useState(true);
  const [mentionsNotif, setMentionsNotif] = useState(false);
  const [tgNotif, setTgNotif] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!user) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setLoadError(null);
    TelegramService.getUserSettings()
      .then(settings => {
        if (!active) return;
        setNewMsgNotif(settings.notifications);
        setMentionsNotif(settings.mentions_only);
        setTgNotif(settings.telegram_enabled);
      })
      .catch(() => {
        if (active) setLoadError('Не удалось загрузить настройки уведомлений.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await TelegramService.updateUserSettings({
        notifications: newMsgNotif,
        mentions_only: mentionsNotif,
        telegram_enabled: tgNotif,
      });
      setSaved(true);
    } catch {
      setSaveError('Не удалось сохранить настройки. Проверьте соединение и попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-gray-100">
      <NavRail />

      <main className="flex-1 min-w-0 overflow-y-auto px-8 py-7">
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="border-b border-gray-200 pb-5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Настройки</h1>
            <p className="mt-1 text-sm text-slate-500">Уведомления сохраняются для вашего аккаунта, параметры приложения — на этом компьютере.</p>
          </header>

          {authLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" /> Загружаем настройки…
            </div>
          ) : !user ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              Войдите, чтобы изменить настройки.
            </div>
          ) : loadError ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                {loadError}
              </div>
            </div>
          ) : (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
                <Bell className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-900">Уведомления</h2>
                {loading && <RefreshCw className="ml-auto h-3.5 w-3.5 animate-spin text-slate-400" />}
              </div>

              <div className="space-y-3">
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
                  <span>
                    <span className="block text-sm font-medium text-slate-800">Новые личные сообщения</span>
                    <span className="mt-1 block text-xs text-slate-500">Веб-уведомления о новых сообщениях.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={newMsgNotif}
                    onChange={event => {
                      setNewMsgNotif(event.target.checked);
                      setSaved(false);
                    }}
                    disabled={loading || saving}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
                  <span>
                    <span className="block text-sm font-medium text-slate-800">Упоминания</span>
                    <span className="mt-1 block text-xs text-slate-500">Уведомлять, когда коллеги упоминают вас.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={mentionsNotif}
                    onChange={event => {
                      setMentionsNotif(event.target.checked);
                      setSaved(false);
                    }}
                    disabled={loading || saving}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>

                {features.telegram && (
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <span>
                    <span className="block text-sm font-medium text-slate-800">Telegram-уведомления</span>
                    <span className="mt-1 block text-xs text-slate-600">Пересылать подходящие рабочие сообщения в связанный Telegram-чат.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={tgNotif}
                    onChange={event => {
                      setTgNotif(event.target.checked);
                      setSaved(false);
                    }}
                    disabled={loading || saving}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                )}

                <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
                  <span>
                    <span className="block text-sm font-medium text-slate-800">Звук и системные уведомления</span>
                    <span className="mt-1 block text-xs text-slate-500">Проверить сигнал и разрешить уведомления в системе.</span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      notificationService.playChime();
                      const granted = await notificationService.requestPermission();
                      toast.info(granted ? 'Уведомления включены' : 'Уведомления не разрешены', granted ? undefined : 'Разрешите их в настройках браузера или системы.');
                    }}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-100"
                  >
                    <Volume2 className="h-4 w-4" /> Проверить
                  </button>
                </div>
              </div>

              {saveError && (
                <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {saveError}
                </div>
              )}

              <div className="mt-5 flex flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                {saved && (
                  <span className="inline-flex items-center justify-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Сохранено
                  </span>
                )}
                <Button onClick={handleSave} disabled={loading || saving}>
                  {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {saving ? 'Сохраняем…' : 'Сохранить настройки'}
                </Button>
              </div>
            </section>
          )}

          <DesktopPreferences />
        </div>
      </main>
    </div>
  );
}
