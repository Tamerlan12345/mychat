import React from 'react';
import { UserStatus } from '@/types';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Groups are drawn as rounded squares, people as circles. */
  shape?: 'circle' | 'square';
  status?: UserStatus;
  className?: string;
}

// Pastel tint pairs; a name always maps to the same pair so identity stays stable across views.
const TINTS: Array<[string, string]> = [
  ['bg-blue-100', 'text-blue-700'],
  ['bg-emerald-100', 'text-emerald-700'],
  ['bg-violet-100', 'text-violet-700'],
  ['bg-amber-100', 'text-amber-700'],
  ['bg-pink-100', 'text-pink-700'],
  ['bg-sky-100', 'text-sky-700'],
  ['bg-rose-100', 'text-rose-700'],
  ['bg-teal-100', 'text-teal-700'],
];

export const STATUS_DOT: Record<UserStatus, string> = {
  ONLINE: 'bg-emerald-500',
  OFFLINE: 'bg-gray-300',
  AWAY: 'bg-amber-500',
  DO_NOT_DISTURB: 'bg-rose-500',
  BLOCKED: 'bg-gray-400',
};

export function getInitials(n: string): string {
  if (!n) return 'U';
  const parts = n.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return n.substring(0, 2).toUpperCase();
}

export function tintFor(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  shape = 'circle',
  status,
  className = '',
}) => {
  const sizes = {
    xs: 'w-7 h-7 text-[10px]',
    sm: 'w-8 h-8 text-[11px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-12 h-12 text-sm',
    xl: 'w-16 h-16 text-lg',
  };
  const radius = shape === 'square' ? 'rounded-xl' : 'rounded-full';
  const dotSize = size === 'xs' || size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const [bg, fg] = tintFor(name);

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      {src ? (
        <img src={src} alt={name} className={`${sizes[size]} ${radius} object-cover bg-gray-100`} />
      ) : (
        <div
          className={`${sizes[size]} ${radius} ${bg} ${fg} flex items-center justify-center font-bold tracking-wide select-none`}
        >
          {getInitials(name)}
        </div>
      )}

      {status && (
        <span
          className={`absolute bottom-0 right-0 ${dotSize} rounded-full border-2 border-white ${STATUS_DOT[status]}`}
          title={status}
        />
      )}
    </div>
  );
};
