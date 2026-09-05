'use client';

import React from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { OutboxTable } from '@/components/admin/outbox-table';

export default function AdminIntegrationsPage() {
  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Интеграции</h2>
          <p className="text-xs text-gray-500">
            Очередь событий `integration_outbox`: что произошло в чате, доставлено ли внешним системам и почему нет.
          </p>
        </div>
        <OutboxTable />
      </div>
    </AdminLayout>
  );
}
