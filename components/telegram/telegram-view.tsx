'use client';

import React, { useState, useEffect } from 'react';
import { Send, ShieldCheck, Lock, Smartphone, RefreshCw, CheckCircle2, MessageSquare } from 'lucide-react';
import { TelegramAccount, TelegramChat, TelegramMessage } from '@/types';
import { TelegramService } from '@/services/telegram-service';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const TelegramView: React.FC = () => {
  const { user } = useAuth();
  const [account, setAccount] = useState<TelegramAccount | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<TelegramChat | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');

  useEffect(() => {
    if (!user) return;
    TelegramService.getAccountStatus(user.id).then(acc => {
      setAccount(acc);
      if (acc.connected) {
        TelegramService.getTelegramChats(user.id).then(cList => {
          setChats(cList);
          if (cList.length > 0) setSelectedChat(cList[0]);
        });
      }
    });
  }, [user]);

  useEffect(() => {
    if (user && selectedChat) {
      TelegramService.getTelegramMessages(user.id, selectedChat.id).then(setMessages);
    }
  }, [user, selectedChat]);

  const handleConnect = async () => {
    if (!user || !phoneInput.trim()) return;
    setLoading(true);
    try {
      const acc = await TelegramService.connect(user.id, phoneInput.trim());
      setAccount(acc);
      const cList = await TelegramService.getTelegramChats(user.id);
      setChats(cList);
      if (cList.length > 0) setSelectedChat(cList[0]);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;
    await TelegramService.disconnect(user.id);
    setAccount({ user_id: user.id, connected: false, session_encrypted: false, last_sync: new Date().toISOString() });
    setChats([]);
    setSelectedChat(null);
  };

  const handleSendTgMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedChat || !msgInput.trim()) return;
    const newMsg = await TelegramService.sendMessage(user.id, selectedChat.id, msgInput.trim());
    setMessages(prev => [...prev, newMsg]);
    setMsgInput('');
  };

  return (
    <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Telegram User Bridge</h1>
            <p className="text-xs text-slate-400">
              Интеграция личного Telegram-аккаунта и корпоративных ботов
            </p>
          </div>
        </div>

        {account?.connected && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Подключен ({account.phone})
            </span>
            <Button variant="danger" size="sm" onClick={handleDisconnect}>
              Отключить Telegram
            </Button>
          </div>
        )}
      </div>

      {!account?.connected ? (
        /* Disconnected State / Connect Form */
        <div className="max-w-md mx-auto my-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Smartphone className="w-7 h-7" />
            </div>
            <h2 className="text-base font-bold text-white">Подключить Telegram аккаунт</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Получайте сообщения из Telegram прямо в интерфейсе Holding Chat с помощью безопасного моста Mautrix Bridge.
            </p>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Безопасность сессии:</span> Все ключи шифруются. Администратор системы не имеет доступа к вашей Telegram-сессии (Tech Spec §25).
            </div>
          </div>

          <div className="space-y-3">
            <Input
              label="Номер телефона Telegram"
              placeholder="+7 (999) 000-0000"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
            />
            <Button
              variant="primary"
              className="w-full bg-sky-600 hover:bg-sky-500"
              onClick={handleConnect}
              disabled={!phoneInput.trim() || loading}
            >
              {loading ? 'Авторизация...' : 'Подключить Telegram'}
            </Button>
          </div>
        </div>
      ) : (
        /* Connected State / Dual Pane Telegram Messenger */
        <div className="flex-1 flex bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Left Telegram Chat List */}
          <div className="w-72 border-r border-slate-800 flex flex-col bg-slate-950">
            <div className="p-3 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
              Telegram Чаты
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {chats.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChat(c)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors flex items-center justify-between ${
                    selectedChat?.id === c.id ? 'bg-sky-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <div className="truncate">
                    <p className="truncate">{c.title}</p>
                    <p className="text-[10px] text-slate-400 truncate font-normal">{c.last_message}</p>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="bg-sky-400 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                      {c.unread_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right Telegram Chat Window */}
          <div className="flex-1 flex flex-col bg-slate-900">
            {selectedChat ? (
              <>
                <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                  <span className="font-bold text-xs text-white">{selectedChat.title}</span>
                  <span className="text-[10px] text-sky-400 font-medium uppercase">Mautrix Telegram Bridge</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(m => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.is_outgoing ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-md p-3 rounded-xl text-xs ${
                          m.is_outgoing
                            ? 'bg-sky-600 text-white rounded-br-none'
                            : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                        }`}
                      >
                        <p className="font-semibold text-[10px] opacity-80 mb-1">{m.sender_name}</p>
                        <p>{m.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendTgMessage} className="p-3 border-t border-slate-800 flex gap-2 bg-slate-950">
                  <input
                    type="text"
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                    placeholder="Написать в Telegram..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:border-sky-500"
                  />
                  <Button type="submit" className="bg-sky-600 hover:bg-sky-500 text-xs">
                    Отправить
                  </Button>
                </form>
              </>
            ) : (
              <div className="m-auto text-xs text-slate-500">Выберите Telegram чат для просмотра</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
