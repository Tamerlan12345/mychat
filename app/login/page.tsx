'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ArrowRight, AlertCircle, ShieldCheck, CheckCircle2, MessageSquare, Users, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

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
      badgeColor: 'text-amber-700 bg-amber-50',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin',
    },
    {
      email: 'employee1@demo.local',
      name: 'Иван Петров',
      role: 'Senior AI Engineer',
      badge: 'AI Lab',
      badgeColor: 'text-blue-700 bg-blue-50',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ivan',
    },
    {
      email: 'employee2@demo.local',
      name: 'Анна Иванова',
      role: 'HR Lead & Communications',
      badge: 'HR',
      badgeColor: 'text-emerald-700 bg-emerald-50',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anna',
    },
  ];

  const inputClass =
    'w-full h-11 bg-white border border-gray-200 text-slate-900 text-sm rounded-[10px] pl-10 pr-3.5 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-100 transition-colors';

  return (
    <div className="h-full w-full flex bg-gray-100 overflow-hidden">
      {/* Brand panel */}
      <aside className="hidden lg:flex w-[46%] max-w-[640px] flex-col justify-between p-12 text-white bg-[radial-gradient(900px_600px_at_-10%_-10%,rgba(147,197,253,0.35),transparent),linear-gradient(160deg,#1d4ed8,#1e3a8a)] select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 text-white font-extrabold text-lg flex items-center justify-center backdrop-blur">
            C
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Centras Chat</span>
        </div>

        <div className="space-y-8">
          <h1 className="text-[40px] leading-[1.1] font-bold tracking-tight max-w-md">
            Рабочие разговоры компании — в одном защищённом месте
          </h1>
          <ul className="space-y-4 text-[15px] text-blue-100">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Users className="w-4 h-4" /></span>
              <span>Рабочие группы по проектам и отделам, личные диалоги с коллегами</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><MessageSquare className="w-4 h-4" /></span>
              <span>Файлы, ответы, реакции и уведомления на рабочем столе</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0"><Send className="w-4 h-4" /></span>
              <span>Мост с Telegram — важные сообщения доходят и вне офиса</span>
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-2 text-xs text-blue-100/90">
          <ShieldCheck className="w-4 h-4" />
          <span>Изоляция данных компании и шифрование сессии</span>
        </div>
      </aside>

      {/* Form */}
      <main className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-[400px] space-y-7">
          <div className="lg:hidden flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-extrabold flex items-center justify-center">C</div>
            <span className="text-[15px] font-semibold text-slate-900">Centras Chat</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Вход в мессенджер</h2>
            <p className="text-sm text-gray-500 mt-1">Используйте корпоративный email и пароль сотрудника.</p>
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-[10px] text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Корпоративный email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="employee@centras.internal"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Пароль</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group w-full h-11 rounded-[10px] bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-60 text-white text-sm font-semibold shadow-[0_2px_6px_rgba(37,99,235,0.35)] transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Авторизация…</span>
              ) : (
                <>
                  <span>Войти</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="pt-5 border-t border-gray-200 space-y-2.5">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.07em]">Демо-аккаунты для проверки</p>
            <div className="space-y-1.5">
              {demoAccounts.map(account => {
                const isSelected = email === account.email;
                return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => handleQuickSelect(account.email)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-white shadow-[0_0_0_1px_#bfdbfe,0_2px_6px_rgba(15,23,42,0.06)]'
                        : 'bg-white/60 hover:bg-white shadow-[0_0_0_1px_#e6e8ec]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img src={account.avatar} alt={account.name} className="w-9 h-9 rounded-lg bg-gray-100 object-cover" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-slate-900">{account.name}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${account.badgeColor}`}>
                            {account.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-tight">{account.role}</p>
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
