'use client';

import React from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { UsersTable } from '@/components/admin/users-table';

export default function AdminUsersPage() {
  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-white">Управление пользователями (Tech Spec §18)</h2>
          <p className="text-xs text-slate-400">
            Создание сотрудников, редактирование профилей, назначение ролей и блокировка доступа
          </p>
        </div>
        <UsersTable />
      </div>
    </AdminLayout>
  );
}
