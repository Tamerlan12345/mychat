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
          <h2 className="text-base font-bold text-white">Журнал аудита действий (Audit Logs)</h2>
          <p className="text-xs text-slate-400">
            Полный хронологический отпечаток всех критических административных действий в системе (Tech Spec §31)
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="p-3.5">Время</th>
              <th className="p-3.5">Пользователь</th>
              <th className="p-3.5">Действие</th>
              <th className="p-3.5">Объект</th>
              <th className="p-3.5">IP</th>
              <th className="p-3.5">Метаданные</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-xs font-mono">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3.5 text-slate-400 whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td className="p-3.5 text-slate-200">{log.user_email}</td>
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
                <td className="p-3.5 text-slate-300">
                  {log.target_type} {log.target_id ? `(#${log.target_id.slice(0, 8)})` : ''}
                </td>
                <td className="p-3.5 text-slate-500">{log.ip}</td>
                <td className="p-3.5 text-slate-400 max-w-xs truncate">
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
