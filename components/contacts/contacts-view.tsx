'use client';

import React, { useState, useEffect } from 'react';
import { Search, Mail, Phone, Building2, MessageSquare } from 'lucide-react';
import { User, Department } from '@/types';
import { UserService } from '@/services/user-service';
import { ChatService } from '@/services/chat-service';
import { Avatar } from '@/components/ui/avatar';
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

  const chip = (active: boolean) =>
    `h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
      active ? 'bg-slate-900 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
    }`;

  return (
    <main className="flex-1 min-w-0 bg-gray-100 flex flex-col h-full overflow-hidden">
      <div className="px-8 pt-7 pb-5 space-y-5 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Справочник сотрудников</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            {users.length} сотрудников · {departments.length} подразделений
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-[15px] h-[15px] absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Имя, должность или email"
              className="w-full h-[38px] bg-white border border-gray-200 text-slate-900 text-[13px] rounded-lg pl-9 pr-3 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-100 transition-colors"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button type="button" onClick={() => setSelectedDeptId('ALL')} className={chip(selectedDeptId === 'ALL')}>
              Все отделы
            </button>
            {departments.map(d => (
              <button key={d.id} type="button" onClick={() => setSelectedDeptId(d.id)} className={chip(selectedDeptId === d.id)}>
                {d.name}
                {typeof d.member_count === 'number' && (
                  <span className={`ml-1.5 tabular-nums ${selectedDeptId === d.id ? 'text-gray-300' : 'text-gray-400'}`}>
                    {d.member_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">Никого не найдено</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredUsers.map(u => {
              const fullName = `${u.first_name} ${u.last_name}`;
              return (
                <div
                  key={u.id}
                  className="bg-white rounded-2xl p-5 flex flex-col shadow-[0_0_0_1px_#e6e8ec,0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_0_0_1px_#d5d9e0,0_4px_12px_rgba(15,23,42,0.06)] transition-shadow"
                >
                  <div className="flex items-start gap-3.5">
                    <Avatar name={fullName} src={u.avatar_url} status={u.status} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 text-[15px] leading-tight truncate">{fullName}</h3>
                      {u.position && <p className="text-xs text-gray-700 truncate mt-0.5">{u.position}</p>}
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-1.5">
                        <Building2 className="w-3 h-3" />
                        <span className="truncate">{u.department_name || 'Подразделение не указано'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3.5 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                    <a href={`mailto:${u.email}`} className="flex items-center gap-2 truncate hover:text-blue-700 transition-colors">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{u.email}</span>
                    </a>
                    {u.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="tabular-nums">{u.phone}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStartDM(u)}
                    className="mt-4 h-9 w-full rounded-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Написать</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};
