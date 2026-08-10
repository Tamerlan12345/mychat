'use client';

import React from 'react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { ContactsView } from '@/components/contacts/contacts-view';

export default function ContactsPage() {
  return (
    <div className="flex h-screen w-screen bg-slate-950 overflow-hidden">
      <Sidebar
        onSelectConversation={() => {}}
        onOpenCreateModal={() => {}}
      />
      <ContactsView />
    </div>
  );
}
