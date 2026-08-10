import React from 'react';
import { UserStatus } from '@/types';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: UserStatus;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  status,
  className = '',
}) => {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const statusColors: Record<UserStatus, string> = {
    ONLINE: 'bg-emerald-500',
    OFFLINE: 'bg-slate-500',
    AWAY: 'bg-amber-500',
    DO_NOT_DISTURB: 'bg-rose-500',
    BLOCKED: 'bg-slate-700 border-rose-500',
  };

  const getInitials = (n: string) => {
    if (!n) return 'U';
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return n.substring(0, 2).toUpperCase();
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={`${sizes[size]} rounded-full object-cover border border-slate-700 bg-slate-800`}
        />
      ) : (
        <div
          className={`${sizes[size]} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 select-none`}
        >
          {getInitials(name)}
        </div>
      )}

      {status && (
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-950 ${statusColors[status]}`}
          title={status}
        />
      )}
    </div>
  );
};
