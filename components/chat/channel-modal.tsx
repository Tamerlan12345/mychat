'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User } from '@/types';
import { UserService } from '@/services/user-service';
import { GroupService } from '@/services/group-service';

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
  type,
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
        type,
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

  const titleText = type === 'CHANNEL' ? 'Создать рабочий канал' : 'Новый групповой чат';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titleText}>
      <div className="space-y-4">
        <Input
          label="Название"
           placeholder={type === 'CHANNEL' ? 'Новости IT' : 'Новая команда'}
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <div>
           <label className="block text-xs font-medium text-slate-600 mb-1.5">Описание</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
             placeholder="Коротко о чате"
            rows={2}
             className="w-full bg-white border border-slate-200 text-slate-900 rounded-md px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="privacy_checkbox"
            checked={isPrivate}
            onChange={e => setIsPrivate(e.target.checked)}
             className="rounded border-slate-300 bg-white text-blue-600"
          />
           <label htmlFor="privacy_checkbox" className="text-xs text-slate-700">
            Закрытый {type === 'CHANNEL' ? 'канал' : 'чат'} (только по приглашению)
          </label>
        </div>

        <div>
           <label className="block text-xs font-medium text-slate-600 mb-2">Участники</label>
           <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 border border-slate-200 rounded-md p-2 bg-slate-50">
            {users.map(u => (
              <label
                key={u.id}
                 className="flex items-center justify-between p-1.5 rounded hover:bg-white cursor-pointer"
              >
                 <div className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    onChange={() => toggleUserSelection(u.id)}
                     className="rounded border-slate-300 bg-white text-blue-600"
                  />
                  <span>{u.first_name} {u.last_name}</span>
                </div>
                <span className="text-[10px] text-slate-500">{u.position}</span>
              </label>
            ))}
          </div>
        </div>

         <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? 'Создание...' : 'Создать'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
