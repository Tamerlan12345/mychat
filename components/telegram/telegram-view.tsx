'use client';

import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Link as LinkIcon,
  RefreshCw,
  Send,
  Unplug,
  XCircle,
} from 'lucide-react';
import type { TelegramIdentity, TelegramRelayLog } from '@/types';
import { TelegramService } from '@/services/telegram-service';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

interface TelegramLink {
  deepLink: string;
  expiresAt: string;
}

export const TelegramView: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const [identity, setIdentity] = useState<TelegramIdentity | null>(null);
  const [relayLogs, setRelayLogs] = useState<TelegramRelayLog[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    if (!user) {
      setAccountLoading(false);
      setActivityLoading(false);
      return () => {
        active = false;
      };
    }

    setAccountLoading(true);
    setActivityLoading(true);
    setAccountError(null);
    setActivityError(null);

    TelegramService.getAccount()
      .then(result => {
        if (active) setIdentity(result);
      })
      .catch(() => {
        if (active) setAccountError('Не удалось загрузить статус Telegram.');
      })
      .finally(() => {
        if (active) setAccountLoading(false);
      });

    TelegramService.getRelayLogs()
      .then(result => {
        if (active) setRelayLogs(result);
      })
      .catch(() => {
        if (active) setActivityError('Не удалось загрузить активность relay.');
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const handleCreateLink = async () => {
    setLinkLoading(true);
    setActionError(null);
    setCopied(false);
    try {
      setLink(await TelegramService.createLink());
    } catch {
      setActionError('Не удалось создать ссылку. Попробуйте ещё раз.');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.deepLink);
      setCopied(true);
    } catch {
      setActionError('Ссылку не удалось скопировать. Откройте её через Telegram.');
    }
  };

  const handleDisconnect = async () => {
    setDisconnectLoading(true);
    setActionError(null);
    try {
      await TelegramService.disconnect();
      setIdentity(current =>
        current
          ? {
              ...current,
              status: 'disconnected',
              disconnected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : null,
      );
      setLink(null);
    } catch {
      setActionError('Не удалось отключить Telegram. Попробуйте ещё раз.');
    } finally {
      setDisconnectLoading(false);
    }
  };

  if (authLoading) {
    return <main className="flex-1 bg-gray-100 p-8 text-sm text-gray-500">Загрузка…</main>;
  }

  if (!user) {
    return <main className="flex-1 bg-gray-100 p-8 text-sm text-gray-600">Войдите, чтобы настроить Telegram.</main>;
  }

  const connected = identity?.status === 'active';

  return (
    <main className="flex-1 min-w-0 overflow-y-auto bg-gray-100 px-8 py-7">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
              <Send className="h-4 w-4" />
              Bot API
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Мост с Telegram</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Свяжите свой Telegram-чат с рабочими уведомлениями через бота.
            </p>
          </div>
          {accountLoading ? (
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Проверяем статус
            </span>
          ) : accountError ? (
            <span className="inline-flex items-center gap-2 text-xs text-rose-600">
              <XCircle className="h-3.5 w-3.5" /> Ошибка статуса
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                connected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Unplug className="h-3.5 w-3.5" />}
              {connected ? 'Подключен' : 'Не подключен'}
            </span>
          )}
        </header>

        {actionError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </div>
        )}

        {accountError ? (
          <section className="rounded-xl border border-rose-200 bg-white p-5 text-sm text-rose-700">
            {accountError}
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Связь с Telegram</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Одноразовая ссылка откроет чат с рабочим ботом. Токен бота и конфигурация не показываются.
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <LinkIcon className="h-4 w-4" />
                </div>
              </div>

              {accountLoading ? (
                <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Проверяем связь с Telegram…
                </div>
              ) : connected ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-xs font-medium text-emerald-800">Telegram-чат связан</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {identity?.username ? `@${identity.username.replace(/^@/, '')}` : 'Имя пользователя не указано'}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">Chat ID: {identity?.telegram_chat_id}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnectLoading}
                    className="text-rose-700 hover:bg-rose-50"
                  >
                    {disconnectLoading ? 'Отключаем…' : 'Отключить Telegram'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-700">Telegram пока не связан с вашим рабочим аккаунтом.</p>
                  <Button onClick={handleCreateLink} disabled={linkLoading}>
                    {linkLoading ? 'Создаём ссылку…' : 'Получить ссылку Telegram'}
                  </Button>
                </div>
              )}

              {link && !connected && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-medium text-slate-700">Ссылка действует до {formatDate(link.expiresAt)}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <a
                      href={link.deepLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Открыть в Telegram <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <Button variant="outline" size="sm" onClick={handleCopyLink}>
                      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Clipboard className="mr-1.5 h-3.5 w-3.5" />}
                      {copied ? 'Скопировано' : 'Копировать'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Активность relay</h2>
                  <p className="mt-1 text-xs text-slate-500">Последние операции доставки между рабочим чатом и Telegram.</p>
                </div>
                <span className="text-xs text-slate-400">{relayLogs.length} записей</span>
              </div>

              {activityLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Загружаем активность…
                </div>
              ) : activityError ? (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {activityError}
                </div>
              ) : relayLogs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Активность появится после первой доставки сообщения.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {relayLogs.map(log => (
                    <li key={log.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {log.direction === 'inbound' ? 'Входящее сообщение' : 'Исходящее уведомление'}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">Диалог {log.conversation_id}</p>
                      </div>
                      <time className="shrink-0 text-right text-xs text-slate-400" dateTime={log.created_at}>
                        {formatDate(log.created_at)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
};
