'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Lock, Mail, ArrowRight, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
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
        setError(res.error || 'Неверный email или пароль сотрудника.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (demoEmail: string) => {
    setEmail(demoEmail);
    setError(null);
  };

  const demoAccounts = [
    {
      email: 'admin@demo.local',
      name: 'Администратор',
      role: 'Системный администратор / CTO',
      badge: 'Admin',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin',
    },
    {
      email: 'employee1@demo.local',
      name: 'Иван Петров',
      role: 'Senior AI Engineer',
      badge: 'AI Lab',
      badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ivan',
    },
    {
      email: 'employee2@demo.local',
      name: 'Анна Иванова',
      role: 'HR Lead & Communications',
      badge: 'HR',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anna',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] -top-40 -left-40 pointer-events-none" />
      <div className="absolute w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] -bottom-40 -right-40 pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="w-full max-w-[440px] bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl shadow-black/60 z-10 space-y-6">
        {/* Branding Header */}
        <div className="text-center space-y-3">
          <div className="relative inline-block">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-500/25 border border-blue-400/30">
              <Sparkles className="w-7 h-7" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900"></span>
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Centras Chat</h1>
            <p className="text-xs text-slate-400 mt-1">Корпоративное защищённое пространство для рабочих коммуникаций</p>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="flex items-center gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Корпоративный Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="employee@centras.internal"
                required
                className="w-full bg-slate-950/70 border border-slate-800 text-slate-100 text-sm rounded-xl pl-10 pr-3.5 py-2.5 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Пароль</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full bg-slate-950/70 border border-slate-800 text-slate-100 text-sm rounded-xl pl-10 pr-3.5 py-2.5 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 group"
            disabled={loading}
          >
            {loading ? (
              <span>Авторизация...</span>
            ) : (
              <>
                <span>Войти в систему</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </Button>
        </form>

        {/* Corporate Profile Quick Selector for Testing */}
        <div className="pt-4 border-t border-slate-800/70 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-medium text-slate-400">Быстрый выбор сотрудника для проверки:</span>
          </div>

          <div className="space-y-1.5">
            {demoAccounts.map(account => {
              const isSelected = email === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => handleQuickSelect(account.email)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-blue-600/10 border-blue-500/40 shadow-sm'
                      : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/40 hover:border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img src={account.avatar} alt={account.name} className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 object-cover" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">{account.name}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded border ${account.badgeColor}`}>
                          {account.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-tight">{account.role}</p>
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Security Assurance Footer */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Сквозная изоляция данных & аппаратное шифрование сессии</span>
        </div>
      </div>
    </div>
  );
}
