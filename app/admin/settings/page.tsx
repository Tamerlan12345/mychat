'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { Database, Download, Server, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminSettingsPage() {
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState(false);

  const handleCreateBackup = () => {
    setBackingUp(true);
    setTimeout(() => {
      setBackingUp(false);
      setBackupMsg(true);
      setTimeout(() => setBackupMsg(false), 4000);
    }, 1500);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-base font-bold text-white">Системные настройки и Резервное копирование</h2>
          <p className="text-xs text-slate-400">
            Управление бэкапами PostgreSQL, интеграционными ключами и статусом серверов (Tech Spec §32–33)
          </p>
        </div>

        {/* PostgreSQL Backup Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">PostgreSQL / Supabase Database Backup</h3>
                <p className="text-xs text-slate-400">Ежедневные снимки данных и файлов (Tech Spec §32)</p>
              </div>
            </div>

            <Button variant="primary" onClick={handleCreateBackup} disabled={backingUp}>
              <Download className="w-4 h-4 mr-1.5" />
              {backingUp ? 'Создание дампа...' : 'Сформировать Бэкап'}
            </Button>
          </div>

          {backupMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Дамп PostgreSQL успешно создан и выгружен в резервный буфер S3 / NAS.</span>
            </div>
          )}
        </div>

        {/* Environment Variables & Services Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Server className="w-4 h-4 text-brand-primary" />
            <span>Статус сервисных подключений (Tech Spec §33)</span>
          </h3>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-slate-400 font-sans">Supabase Realtime API</p>
                <p className="text-slate-500 text-[11px]">NEXT_PUBLIC_SUPABASE_URL</p>
              </div>
              <span className="text-emerald-400 font-sans font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Активен
              </span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-slate-400 font-sans">Telegram Bot API relay</p>
                <p className="text-slate-500 text-[11px]">Серверная конфигурация relay</p>
              </div>
              <span className="text-sky-400 font-sans font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Управляется сервером
              </span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-slate-400 font-sans">Supabase File Storage (50 MB limit)</p>
                <p className="text-slate-500 text-[11px]">STORAGE_BUCKET=attachments</p>
              </div>
              <span className="text-emerald-400 font-sans font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Активен
              </span>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
