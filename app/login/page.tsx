'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Lock, Mail, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        router.push('/chat');
      } else {
        setError(res.error || 'Ошибка входа в систему.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (demoEmail: string) => {
    setEmail(demoEmail);
    setError(null);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glow Overlay */}
      <div className="absolute w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl -top-32 -left-32 pointer-events-none" />
      <div className="absolute w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl -bottom-32 -right-32 pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl z-10 space-y-6">
        {/* Branding Logo Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-brand-primary flex items-center justify-center text-white mx-auto shadow-xl shadow-blue-500/20">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Centras Chat</h1>
          <p className="text-xs text-slate-400">Корпоративный мессенджер компании</p>
        </div>

        {/* Login Error Notification */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Email / Логин сотрудника"
            type="email"
            placeholder="admin@demo.local"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <Input
            label="Пароль"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3 text-sm font-semibold rounded-xl"
            disabled={loading}
          >
            {loading ? 'Вход в систему...' : 'Войти в корпоративный чат'}
          </Button>
        </form>

        {/* Demo Quick Account Selectors (Tech Spec §36 Seed Users) */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
            Быстрый вход (Тестовые записи MVP)
          </p>
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <button
              onClick={() => handleQuickSelect('admin@demo.local')}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-amber-400 font-medium truncate"
            >
              Админ
            </button>
            <button
              onClick={() => handleQuickSelect('employee1@demo.local')}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 font-medium truncate"
            >
              Иван (AI)
            </button>
            <button
              onClick={() => handleQuickSelect('employee2@demo.local')}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 font-medium truncate"
            >
              Анна (HR)
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Шифрование сессии & RLS Защита</span>
        </div>
      </div>
    </div>
  );
}
