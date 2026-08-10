'use client';

import React from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { BrandingForm } from '@/components/admin/branding-form';

export default function AdminBrandingPage() {
  return (
    <AdminLayout>
      <BrandingForm />
    </AdminLayout>
  );
}
