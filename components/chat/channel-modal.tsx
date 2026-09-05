'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User } from '@/types';
import { UserService } from '@/services/user-service';
import { GroupService } from '@/services/group-service';
import { Users, Lock } from 'lucide-react';

interface ChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'GROUP' | 'CHANNEL';
  currentUserId: string;
  onCreated: () => void;
}

export const ChannelModal: React.FC<ChannelModalProps> = ({
  isOpen,
  onClose,
  type = 'GROUP',
  currentUserId,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      UserService.getUsers().then(uList => {
        setUsers(uList.filter(u => u.id !== currentUserId));
      });
      setName('');
      setDescription('');
      setSelectedUserIds([]);
    }
  }, [isOpen, currentUserId]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await GroupService.createGroupOrChannel({
        type: 'GROUP',
        name: name.trim(),
        description: description.trim(),
        created_by: currentUserId,
        is_private: isPrivate,
        member_ids: [currentUserId, ...selectedUserIds],
      });
      onCreated();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Создать рабочую группу">
      <div className="space-y-4 text-slate-900">
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800">
          <Users className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Группы позволяют организовывать рабочие обсуждения, задачи и файлы между сотрудниками.</span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Название рабочей группы
          </label>
          <input
            type="text"
            placeholder="Например: Проект: Модернизация ИТ"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-white border border-gray-200 text-slate-900 rounded-lg px-3.5 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Описание и цели группы
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание направления или проекта..."
            rows={2}
            className="w-full bg-white border border-gray-200 text-slate-900 rounded-lg px-3.5 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-100"
          />
        </div>

        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gray-50 border border-gray-200">
          <input
            type="checkbox"
            id="privacy_checkbox"
            checked={isPrivate}
            onChange={e => setIsPrivate(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <label htmlFor="privacy_checkbox" className="text-xs text-gray-700 cursor-pointer flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            <span>Приватная группа (доступ только по явному приглашению)</span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Добавить участников ({selectedUserIds.length})
          </label>
          <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1 border border-gray-200 rounded-lg p-1.5 bg-white">
            {users.map(u => (
              <label
                key={u.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5 text-xs text-slate-900">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    onChange={() => toggleUserSelection(u.id)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span className="font-medium">{u.first_name} {u.last_name}</span>
                </div>
                <span className="text-[11px] text-gray-500">{u.position}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors shadow-sm"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="h-9 px-4 text-[13px] font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-lg transition-colors shadow-[0_2px_6px_rgba(37,99,235,0.35)]"
          >
            {loading ? 'Создание...' : 'Создать группу'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
