'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, Webhook } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { hasGateway, serverApiFetch, getServerApiBase } from '@/lib/api/server-api';

interface OutboxRow {
  id: string;
  event_type: string;
  status: 'pending' | 'leased' | 'delivered' | 'dead';
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

const STATUS_LABEL: Record<OutboxRow['status'], { text: string; variant: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending: { text: 'в очереди', variant: 'primary' },
  leased: { text: 'доставляется', variant: 'warning' },
  delivered: { text: 'доставлено', variant: 'success' },
  dead: { text: 'не доставлено', variant: 'danger' },
};

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU') : '—');

export const OutboxTable: React.FC = () => {
  const [rows, setRows] = useState<OutboxRow[] | null>(null);
  const [filter, setFilter] = useState<'all' | OutboxRow['status']>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasGateway()) return;
    setError(null);
    try {
      const qs = filter === 'all' ? '' : `?status=${filter}`;
      const res = await serverApiFetch(`/api/v1/admin/outbox${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((await res.json()).items);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить очередь');
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (id: string) => {
    try {
      const res = await serverApiFetch(`/api/v1/admin/outbox/${id}/retry`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Событие поставлено в очередь повторно');
      void load();
    } catch (err) {
      toast.error('Не удалось повторить доставку', err instanceof Error ? err.message : undefined);
    }
  };

  if (!hasGateway()) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <Webhook className="mx-auto mb-3 h-7 w-7 text-gray-300" />
        <p className="text-sm font-semibold text-slate-900">Очередь интеграций доступна через шлюз</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-gray-500">
          Приложение сейчас подключено напрямую к базе данных или работает в демо-режиме. Укажите адрес сервера компании
          (шлюза) в настройках подключения — тогда здесь появятся события `integration_outbox`, их статус и ошибки доставки.
        </p>
      </div>
    );
  }

  const filters: Array<{ value: typeof filter; label: string }> = [
    { value: 'all', label: 'Все' },
    { value: 'pending', label: 'В очереди' },
    { value: 'dead', label: 'Не доставлено' },
    { value: 'delivered', label: 'Доставлено' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {filters.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
                filter === f.value ? 'bg-slate-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="truncate">Шлюз: {getServerApiBase()}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 font-medium text-gray-700 hover:bg-gray-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Обновить
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              <th className="p-3.5">Событие</th>
              <th className="p-3.5">Статус</th>
              <th className="p-3.5">Попытки</th>
              <th className="p-3.5">Создано</th>
              <th className="p-3.5">Ошибка</th>
              <th className="p-3.5 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs">
            {rows === null ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  Загрузка…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  Событий нет
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="p-3.5 font-mono text-slate-900">{r.event_type}</td>
                  <td className="p-3.5">
                    <Badge variant={STATUS_LABEL[r.status].variant}>{STATUS_LABEL[r.status].text}</Badge>
                  </td>
                  <td className="p-3.5 tabular-nums text-gray-700">
                    {r.attempts} / {r.max_attempts}
                  </td>
                  <td className="p-3.5 whitespace-nowrap text-gray-500">{formatDate(r.created_at)}</td>
                  <td className="max-w-xs truncate p-3.5 text-gray-500" title={r.last_error ?? ''}>
                    {r.last_error ?? '—'}
                  </td>
                  <td className="p-3.5 text-right">
                    {(r.status === 'dead' || r.status === 'pending') && (
                      <button
                        type="button"
                        onClick={() => void retry(r.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-slate-900"
                        title="Повторить доставку"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Повторить
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
