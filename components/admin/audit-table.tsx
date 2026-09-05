'use client';

import React, { useState, useEffect } from 'react';
import { FileText, ShieldAlert } from 'lucide-react';
import { AuditLog } from '@/types';
import { globalDataProvider } from '@/lib/provider/mock-provider';
import { Badge } from '@/components/ui/badge';

export const AuditTable: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    globalDataProvider.getAuditLogs().then(setLogs);
  }, []);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('ru-RU');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Журнал аудита</h2>
          <p className="text-xs text-gray-500">
            Хронология административных действий в системе
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              <th className="p-3.5">Время</th>
              <th className="p-3.5">Пользователь</th>
              <th className="p-3.5">Действие</th>
              <th className="p-3.5">Объект</th>
              <th className="p-3.5">IP</th>
              <th className="p-3.5">Метаданные</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs font-mono">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-3.5 text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td className="p-3.5 text-slate-900">{log.user_email}</td>
                <td className="p-3.5">
                  <Badge
                    variant={
                      log.action.includes('DELETED') || log.action.includes('BLOCKED')
                        ? 'danger'
                        : log.action.includes('BRANDING')
                        ? 'warning'
                        : 'primary'
                    }
                  >
                    {log.action}
                  </Badge>
                </td>
                <td className="p-3.5 text-gray-700">
                  {log.target_type} {log.target_id ? `(#${log.target_id.slice(0, 8)})` : ''}
                </td>
                <td className="p-3.5 text-gray-400">{log.ip}</td>
                <td className="p-3.5 text-gray-500 max-w-xs truncate">
                  {JSON.stringify(log.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
