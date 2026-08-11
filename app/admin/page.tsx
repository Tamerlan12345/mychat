'use client';

import React from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { Users, UserCheck, MessageSquare, Send, Layers } from 'lucide-react';

export default function AdminDashboardPage() {
  const metrics = [
    { label: 'Всего пользователей (Users)', value: '247', change: '+12 на этой неделе', icon: Users, color: 'text-blue-400' },
    { label: 'Активных сотрудников (Active)', value: '218', change: '88% онлайн сегодня', icon: UserCheck, color: 'text-emerald-400' },
    { label: 'Групп и Каналов (Groups)', value: '34', change: '4 рабочих отдела', icon: Layers, color: 'text-purple-400' },
    { label: 'Всего сообщений (Messages)', value: '12 483', change: '+1 450 сегодня', icon: MessageSquare, color: 'text-amber-400' },
    { label: 'Telegram мостов (Telegram)', value: '87', change: 'Активные интеграции', icon: Send, color: 'text-sky-400' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">ADMIN PANEL — Обзор системы</h2>
          <p className="text-xs text-slate-400">
            Метрики производительности корпоративного мессенджера (Tech Spec §17)
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {metrics.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">{m.label.split(' ')[0]}</span>
                  <Icon className={`w-5 h-5 ${m.color}`} />
                </div>
                <p className="text-2xl font-bold text-white tracking-tight">{m.value}</p>
                <p className="text-[10px] text-slate-500">{m.change}</p>
              </div>
            );
          })}
        </div>

        {/* System Architecture Info Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white">Архитектурный статус (Tech Spec §3)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Data Provider Layer</span>
              <p className="font-semibold text-emerald-400">Изолирован & Декуплирован</p>
              <p className="text-slate-400 text-[11px]">Готов к бесшовному переключению на Matrix Synapse API</p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Database & Storage</span>
              <p className="font-semibold text-blue-400">Supabase PostgreSQL</p>
              <p className="text-slate-400 text-[11px]">RLS & Realtime таблицы настроены</p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Telegram relay</span>
              <p className="font-semibold text-sky-400">Telegram Bot API relay</p>
              <p className="text-slate-400 text-[11px]">Ссылки привязки и доставка уведомлений через Bot API</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
