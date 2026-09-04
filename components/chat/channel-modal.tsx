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
      <div className="space-y-4 text-slate-200">
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-xs text-blue-300">
          <Users className="w-4 h-4 text-blue-400 shrink-0" />
          <span>Группы позволяют организовывать рабочие обсуждения, задачи и файлы между сотрудниками.</span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Название рабочей группы
          </label>
          <input
            type="text"
            placeholder="Например: Проект: Модернизация ИТ"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 text-slate-100 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Описание и цели группы
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание направления или проекта..."
            rows={2}
            className="w-full bg-slate-950 border border-slate-700/80 text-slate-100 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <input
            type="checkbox"
            id="privacy_checkbox"
            checked={isPrivate}
            onChange={e => setIsPrivate(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <label htmlFor="privacy_checkbox" className="text-xs text-slate-300 cursor-pointer flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Приватная группа (доступ только по явному приглашению)</span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Добавить участников ({selectedUserIds.length})
          </label>
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1 border border-slate-800 rounded-xl p-2 bg-slate-950/80">
            {users.map(u => (
              <label
                key={u.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    onChange={() => toggleUserSelection(u.id)}
                    className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span className="font-medium">{u.first_name} {u.last_name}</span>
                </div>
                <span className="text-[10px] text-slate-400">{u.position}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors shadow-sm"
          >
            {loading ? 'Создание...' : 'Создать группу'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
