'use client';

import React, { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { Building2, Plus, Edit2, Trash2 } from 'lucide-react';
import { Department } from '@/types';
import { UserService } from '@/services/user-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    UserService.getDepartments().then(setDepartments);
  };

  const handleOpenModal = (d?: Department) => {
    if (d) {
      setEditingDept(d);
      setName(d.name);
      setDesc(d.description || '');
    } else {
      setEditingDept(null);
      setName('');
      setDesc('');
    }
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (editingDept) {
      await UserService.updateDepartment(editingDept.id, name.trim(), desc.trim());
    } else {
      await UserService.createDepartment(name.trim(), desc.trim());
    }
    setIsOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Удалить это подразделение?')) {
      await UserService.deleteDepartment(id);
      loadData();
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Управление подразделениями</h2>
            <p className="text-xs text-gray-500">
              Структура отделов и департаментов компании
            </p>
          </div>
          <Button variant="primary" onClick={() => handleOpenModal()} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Создать отдел</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map(d => (
            <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{d.name}</h3>
                    <span className="text-[11px] text-gray-500">{d.member_count || 0} сотрудников</span>
                  </div>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => handleOpenModal(d)}
                    className="p-1 text-gray-500 hover:text-slate-900 rounded hover:bg-gray-100"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="p-1 text-gray-500 hover:text-rose-600 rounded hover:bg-gray-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {d.description && <p className="text-xs text-gray-500">{d.description}</p>}
            </div>
          ))}
        </div>

        <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editingDept ? 'Редактировать отдел' : 'Создать отдел'}>
          <div className="space-y-4">
            <Input label="Название подразделения" value={name} onChange={e => setName(e.target.value)} />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Описание</label>
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                rows={2}
                className="w-full bg-gray-50 border border-gray-300 text-slate-900 rounded-lg px-3 py-2 text-xs focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={() => setIsOpen(false)}>Отмена</Button>
              <Button variant="primary" onClick={handleSave}>Сохранить</Button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  );
}
