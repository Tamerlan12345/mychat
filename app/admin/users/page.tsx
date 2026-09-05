'use client';

import React from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { UsersTable } from '@/components/admin/users-table';

export default function AdminUsersPage() {
  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Пользователи</h2>
          <p className="text-xs text-gray-500">
            Создание сотрудников, редактирование профилей, назначение ролей и блокировка доступа
          </p>
        </div>
        <UsersTable />
      </div>
    </AdminLayout>
  );
}
