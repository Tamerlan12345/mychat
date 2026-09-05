'use client';

import React from 'react';
import { NavRail } from '@/components/sidebar/nav-rail';
import { ContactsView } from '@/components/contacts/contacts-view';

export default function ContactsPage() {
  return (
    <div className="flex h-full w-full bg-gray-100 overflow-hidden">
      <NavRail />
      <ContactsView />
    </div>
  );
}
