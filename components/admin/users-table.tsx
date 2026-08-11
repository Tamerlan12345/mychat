'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Ban, Trash2, Key, CheckCircle, Search } from 'lucide-react';
import { User, Department, UserRole } from '@/types';
import { UserService } from '@/services/user-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';

export const UsersTable: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [deptId, setDeptId] = useState('');
  const [role, setRole] = useState<UserRole>('EMPLOYEE');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    UserService.getUsers().then(setUsers);
    UserService.getDepartments().then(setDepartments);
  };

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPosition('');
    setDeptId(departments[0]?.id || '');
    setRole('EMPLOYEE');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: User) => {
    setEditingUser(u);
    setFirstName(u.first_name);
    setLastName(u.last_name);
    setEmail(u.email);
    setPosition(u.position || '');
    setDeptId(u.department_id || '');
    setRole(u.role);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!firstName || !lastName || !email) return;

    if (editingUser) {
      await UserService.updateUser(editingUser.id, {
        first_name: firstName,
        last_name: lastName,
        email,
        position,
        department_id: deptId,
        role,
      });
    } else {
      try {
        await UserService.createUser({
          first_name: firstName,
          last_name: lastName,
          email,
          position,
          department_id: deptId,
          role,
        });
      } catch (err: any) {
        // In Supabase mode, admin user creation goes through Supabase Auth invite/signup
        // instead of a direct profile insert — full admin-invite flow is a follow-up,
        // not silently swallowed here.
        alert(err.message);
        return;
      }
    }
    setIsModalOpen(false);
    loadData();
  };

  const handleToggleBlock = async (u: User) => {
    const newStatus = u.status === 'BLOCKED' ? 'OFFLINE' : 'BLOCKED';
    await UserService.setUserStatus(u.id, newStatus);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Вы уверены, что хотите удалить этого сотрудника?')) {
      await UserService.deleteUser(id);
      loadData();
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Table Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени или email..."
            className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-brand-primary"
          />
        </div>
        <Button variant="primary" onClick={handleOpenCreateModal} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          <span>Добавить сотрудника</span>
        </Button>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="p-3.5">Сотрудник</th>
              <th className="p-3.5">Отдел</th>
              <th className="p-3.5">Роль</th>
              <th className="p-3.5">Статус</th>
              <th className="p-3.5 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-xs">
            {filteredUsers.map(u => (
              <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={`${u.first_name} ${u.last_name}`} src={u.avatar_url} size="md" />
                    <div>
                      <p className="font-semibold text-slate-100">{u.first_name} {u.last_name}</p>
                      <p className="text-[11px] text-slate-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3.5 text-slate-300">{u.department_name || 'Не назначен'}</td>
                <td className="p-3.5">
                  <Badge variant={u.role === 'SUPER_ADMIN' ? 'danger' : u.role === 'ADMIN' ? 'warning' : 'neutral'}>
                    {u.role}
                  </Badge>
                </td>
                <td className="p-3.5">
                  <Badge variant={u.status === 'BLOCKED' ? 'danger' : u.status === 'ONLINE' ? 'success' : 'neutral'}>
                    {u.status}
                  </Badge>
                </td>
                <td className="p-3.5 text-right space-x-1">
                  <button
                    onClick={() => handleOpenEditModal(u)}
                    className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                    title="Редактировать"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleBlock(u)}
                    className={`p-1.5 rounded hover:bg-slate-800 ${
                      u.status === 'BLOCKED' ? 'text-emerald-400 hover:text-emerald-300' : 'text-amber-400 hover:text-amber-300'
                    }`}
                    title={u.status === 'BLOCKED' ? 'Разблокировать' : 'Заблокировать'}
                  >
                    {u.status === 'BLOCKED' ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal for Create/Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? 'Редактировать сотрудника' : 'Новый сотрудник'}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="Имя" value={firstName} onChange={e => setFirstName(e.target.value)} />
            <Input label="Фамилия" value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input label="Должность" value={position} onChange={e => setPosition(e.target.value)} />

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Отдел</label>
            <select
              value={deptId}
              onChange={e => setDeptId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none"
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Роль в системе</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none"
            >
              <option value="EMPLOYEE">EMPLOYEE (Пользователь)</option>
              <option value="MODERATOR">MODERATOR (Модератор)</option>
              <option value="ADMIN">ADMIN (Администратор)</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN (Суперадмин)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
