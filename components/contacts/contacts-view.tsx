'use client';

import React, { useState, useEffect } from 'react';
import { Search, Mail, Phone, Building2, MessageSquare } from 'lucide-react';
import { User, Department } from '@/types';
import { UserService } from '@/services/user-service';
import { ChatService } from '@/services/chat-service';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';

export const ContactsView: React.FC = () => {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    UserService.getUsers().then(setUsers);
    UserService.getDepartments().then(setDepartments);
  }, []);

  const handleStartDM = async (targetUser: User) => {
    if (!currentUser) return;
    const conv = await ChatService.getConversations(currentUser.id);
    const existingDM = conv.find(c => c.type === 'DIRECT');
    if (existingDM) {
      router.push(`/chat?id=${existingDM.id}`);
    } else {
      router.push('/chat');
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesDept = selectedDeptId === 'ALL' || u.department_id === selectedDeptId;
    const matchesSearch =
      !searchQuery ||
      u.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.position && u.position.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesDept && matchesSearch;
  });

  return (
    <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Справочник сотрудников</h1>
          <p className="text-xs text-slate-400">
            Корпоративная книга контактов и структура подразделений компании
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, должности, email..."
            className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2.5 placeholder-slate-500 focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setSelectedDeptId('ALL')}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              selectedDeptId === 'ALL'
                ? 'bg-brand-primary text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Все отделы ({users.length})
          </button>
          {departments.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDeptId(d.id)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                selectedDeptId === d.id
                  ? 'bg-brand-primary text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {d.name} ({d.member_count})
            </button>
          ))}
        </div>
      </div>

      {/* Employee Cards Grid */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-1">
        {filteredUsers.map(u => (
          <div
            key={u.id}
            className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition-all shadow-lg"
          >
            <div className="flex items-start gap-3">
              <Avatar name={`${u.first_name} ${u.last_name}`} src={u.avatar_url} status={u.status} size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-100 text-sm truncate">
                  {u.first_name} {u.last_name}
                </h3>
                <p className="text-xs text-brand-accent font-medium truncate mb-1">{u.position}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Building2 className="w-3 h-3 text-slate-500" />
                  <span>{u.department_name || 'Департамент'}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5 text-xs text-slate-400">
              <div className="flex items-center gap-2 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{u.email}</span>
              </div>
              {u.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{u.phone}</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <Button
                variant="secondary"
                size="sm"
                className="w-full flex items-center justify-center gap-1.5"
                onClick={() => handleStartDM(u)}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Написать сообщение</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
