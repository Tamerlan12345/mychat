'use client';

import React from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { Lock, Shield, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function AdminRolesPage() {
  const permissions = [
    { name: 'Отправка сообщений & файлов', roles: { SUPER_ADMIN: true, ADMIN: true, MODERATOR: true, EMPLOYEE: true } },
    { name: 'Создание групповых чатов', roles: { SUPER_ADMIN: true, ADMIN: true, MODERATOR: true, EMPLOYEE: true } },
    { name: 'Создание каналов', roles: { SUPER_ADMIN: true, ADMIN: true, MODERATOR: true, EMPLOYEE: false } },
    { name: 'Подключение Telegram Bot API relay', roles: { SUPER_ADMIN: true, ADMIN: true, MODERATOR: true, EMPLOYEE: true } },
    { name: 'Модерация & Удаление чужих сообщений', roles: { SUPER_ADMIN: true, ADMIN: true, MODERATOR: true, EMPLOYEE: false } },
    { name: 'Управление пользователями & Блокировки', roles: { SUPER_ADMIN: true, ADMIN: true, MODERATOR: false, EMPLOYEE: false } },
    { name: 'Управление брендингом (White-Label)', roles: { SUPER_ADMIN: true, ADMIN: true, MODERATOR: false, EMPLOYEE: false } },
    { name: 'Просмотр журнала аудита (Audit Logs)', roles: { SUPER_ADMIN: true, ADMIN: true, MODERATOR: false, EMPLOYEE: false } },
    { name: 'Управление подсистемами & Системные ключи', roles: { SUPER_ADMIN: true, ADMIN: false, MODERATOR: false, EMPLOYEE: false } },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-bold text-white">Матрица ролей и доступов (Tech Spec §19)</h2>
          <p className="text-xs text-slate-400">
            Контроль полномочий пользователей в системе (RBAC: SUPER_ADMIN, ADMIN, MODERATOR, EMPLOYEE)
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="p-3.5">Разрешение / Модуль</th>
                <th className="p-3.5 text-center">EMPLOYEE</th>
                <th className="p-3.5 text-center">MODERATOR</th>
                <th className="p-3.5 text-center">ADMIN</th>
                <th className="p-3.5 text-center">SUPER_ADMIN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {permissions.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5 font-medium text-slate-200">{p.name}</td>
                  <td className="p-3.5 text-center">
                    {p.roles.EMPLOYEE ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}
                  </td>
                  <td className="p-3.5 text-center">
                    {p.roles.MODERATOR ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}
                  </td>
                  <td className="p-3.5 text-center">
                    {p.roles.ADMIN ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}
                  </td>
                  <td className="p-3.5 text-center">
                    {p.roles.SUPER_ADMIN ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
