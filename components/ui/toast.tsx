'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];
let seq = 0;

function emit() {
  listeners.forEach(l => l(items));
}

function push(kind: ToastKind, title: string, description?: string, duration = 4500): number {
  const id = ++seq;
  items = [...items, { id, kind, title, description }].slice(-4);
  emit();
  window.setTimeout(() => dismiss(id), duration);
  return id;
}

function dismiss(id: number) {
  if (!items.some(t => t.id === id)) return;
  items = items.filter(t => t.id !== id);
  emit();
}

/** Non-blocking notifications; replaces window.alert() everywhere in the app. */
export const toast = {
  success: (title: string, description?: string) => push('success', title, description),
  info: (title: string, description?: string) => push('info', title, description),
  error: (title: string, description?: string) => push('error', title, description, 7000),
  dismiss,
};

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  error: <AlertCircle className="w-4 h-4 text-rose-600" />,
  info: <Info className="w-4 h-4 text-blue-600" />,
};

export const Toaster: React.FC = () => {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  if (list.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-40px)] pointer-events-none">
      {list.map(t => (
        <div
          key={t.id}
          role="status"
          className="toast-enter pointer-events-auto flex items-start gap-3 rounded-xl bg-white border border-gray-200 p-3 shadow-[0_12px_32px_rgba(15,23,42,0.10),0_2px_6px_rgba(15,23,42,0.06)]"
        >
          <span className="mt-0.5 shrink-0">{ICONS[t.kind]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-900 leading-snug">{t.title}</p>
            {t.description && <p className="mt-0.5 text-xs text-gray-500 leading-snug">{t.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="w-6 h-6 -mr-1 -mt-1 rounded-md flex items-center justify-center text-gray-400 hover:text-slate-900 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Закрыть уведомление"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
