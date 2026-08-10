'use client';

import React from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { AuditTable } from '@/components/admin/audit-table';

export default function AdminAuditPage() {
  return (
    <AdminLayout>
      <AuditTable />
    </AdminLayout>
  );
}
