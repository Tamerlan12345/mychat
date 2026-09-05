import { IDataProvider, MessageQueryOptions, ConnectionState } from './data-provider';
import {
  User,
  Department,
  Conversation,
  Message,
  MessageReaction,
  Attachment,
  BrandingConfig,
  AuditLog,
  TelegramIdentity,
  TelegramRelayLog,
  UserSettings,
  UserStatus,
  ConversationMember,
} from '@/types';
import type { TelegramLink } from './data-provider';

// Initial Mock Seed State
const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'd1', name: 'IT', description: 'Департамент информационных технологий', created_at: new Date().toISOString() },
  { id: 'd2', name: 'AI', description: 'Лаборатория искусственного интеллекта', created_at: new Date().toISOString() },
  { id: 'd3', name: 'HR', description: 'Управление персоналом', created_at: new Date().toISOString() },
  { id: 'd4', name: 'Management', description: 'Руководство компании', created_at: new Date().toISOString() },
];

const INITIAL_USERS: User[] = [
  {
    id: 'u1',
    email: 'admin@demo.local',
    first_name: 'Администратор',
    last_name: 'Системный',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin',
    phone: '+7 (999) 000-0001',
    position: 'CTO / Системный Администратор',
    department_id: 'd1',
    department_name: 'IT',
    status: 'ONLINE',
    role: 'SUPER_ADMIN',
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'u2',
    email: 'employee1@demo.local',
    first_name: 'Иван',
    last_name: 'Петров',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ivan',
    phone: '+7 (999) 111-2233',
    position: 'Senior AI Engineer',
    department_id: 'd2',
    department_name: 'AI',
    status: 'ONLINE',
    role: 'EMPLOYEE',
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'u3',
    email: 'employee2@demo.local',
    first_name: 'Анна',
    last_name: 'Иванова',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anna',
    phone: '+7 (999) 444-5566',
    position: 'HR Lead',
    department_id: 'd3',
    department_name: 'HR',
    status: 'AWAY',
    role: 'ADMIN',
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'u4',
    email: 'employee3@demo.local',
    first_name: 'Сергей',
    last_name: 'Смирнов',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sergey',
    phone: '+7 (999) 777-8899',
    position: 'DevOps Specialist',
    department_id: 'd1',
    department_name: 'IT',
    status: 'OFFLINE',
    role: 'EMPLOYEE',
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    type: 'GROUP',
    name: 'Корпоративные события',
    description: 'Официальные анонсы, мероприятия и ключевые новости компании',
    created_by: 'u1',
    is_private: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c2',
    type: 'GROUP',
    name: 'Команда: IT & Архитектура',
    description: 'Инфраструктура, релизы, базы данных и серверная безопасность',
    created_by: 'u1',
    is_private: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c3',
    type: 'GROUP',
    name: 'AI Лаборатория & R&D',
    description: 'Разработка и внедрение моделей искусственного интеллекта',
    created_by: 'u2',
    is_private: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c4',
    type: 'GROUP',
    name: 'Проект: Десктоп-клиент',
    description: 'Рабочая группа разработки защищённого Windows приложения',
    created_by: 'u2',
    is_private: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c6',
    type: 'GROUP',
    name: 'Проект: Безопасность и RLS',
    description: 'Рабочая группа по аппаратной защите DPAPI и аудиту',
    created_by: 'u1',
    is_private: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c5',
    type: 'DIRECT',
    name: 'Иван Петров (Senior AI Engineer)',
    created_by: 'u1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c7',
    type: 'DIRECT',
    name: 'Анна Иванова (HR Lead)',
    created_by: 'u1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Membership seed: public groups include everyone, private projects and DMs are scoped.
const INITIAL_MEMBERS: ConversationMember[] = [
  ...['u1', 'u2', 'u3', 'u4'].map(uid => ({ conversation_id: 'c1', user_id: uid, role: uid === 'u1' ? 'ADMIN' : 'MEMBER', joined_at: new Date().toISOString() }) as ConversationMember),
  ...['u1', 'u4'].map(uid => ({ conversation_id: 'c2', user_id: uid, role: uid === 'u1' ? 'ADMIN' : 'MEMBER', joined_at: new Date().toISOString() }) as ConversationMember),
  ...['u1', 'u2'].map(uid => ({ conversation_id: 'c3', user_id: uid, role: uid === 'u2' ? 'ADMIN' : 'MEMBER', joined_at: new Date().toISOString() }) as ConversationMember),
  ...['u1', 'u2', 'u4'].map(uid => ({ conversation_id: 'c4', user_id: uid, role: uid === 'u2' ? 'ADMIN' : 'MEMBER', joined_at: new Date().toISOString() }) as ConversationMember),
  ...['u1', 'u4'].map(uid => ({ conversation_id: 'c6', user_id: uid, role: uid === 'u1' ? 'ADMIN' : 'MEMBER', joined_at: new Date().toISOString() }) as ConversationMember),
  ...['u1', 'u2'].map(uid => ({ conversation_id: 'c5', user_id: uid, role: 'MEMBER', joined_at: new Date().toISOString() }) as ConversationMember),
  ...['u1', 'u3'].map(uid => ({ conversation_id: 'c7', user_id: uid, role: 'MEMBER', joined_at: new Date().toISOString() }) as ConversationMember),
];

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'm1',
    conversation_id: 'c1',
    sender_id: 'u1',
    sender_name: 'Администратор Системный',
    sender_avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin',
    content: 'Добро пожаловать в новый корпоративный мессенджер Centras Chat!',
    message_type: 'TEXT',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    reactions: [
      { id: 'r1', message_id: 'm1', user_id: 'u2', user_name: 'Иван Петров', reaction: '👍', created_at: new Date().toISOString() },
      { id: 'r2', message_id: 'm1', user_id: 'u3', user_name: 'Анна Иванова', reaction: '❤️', created_at: new Date().toISOString() },
    ],
  },
  {
    id: 'm2',
    conversation_id: 'c4',
    sender_id: 'u2',
    sender_name: 'Иван Петров',
    sender_avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ivan',
    content: 'Привет команда! Развернули новый релиз модели AI Adjuster v1.0.',
    message_type: 'TEXT',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    reactions: [],
  },
  {
    id: 'm3',
    conversation_id: 'c5',
    sender_id: 'u2',
    sender_name: 'Иван Петров',
    sender_avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ivan',
    content: 'Привет! Документ по проекту готов к согласованию.',
    message_type: 'TEXT',
    created_at: new Date(Date.now() - 1800000).toISOString(),
    attachments: [
      {
        id: 'att1',
        message_id: 'm3',
        file_name: 'contract_v2.pdf',
        file_path: '/files/contract_v2.pdf',
        mime_type: 'application/pdf',
        size: 2516582, // 2.4 MB
        created_at: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'm4',
    conversation_id: 'c7',
    sender_id: 'u3',
    sender_name: 'Анна Иванова',
    sender_avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anna',
    content: 'Добрый день! График отпусков департамента на следующий квартал утверждён.',
    message_type: 'TEXT',
    created_at: new Date(Date.now() - 900000).toISOString(),
    reactions: [],
  },
];

const INITIAL_BRANDING: BrandingConfig = {
  company_name: 'Centras Chat',
  app_title: 'Корпоративный чат',
  logo_url: '',
  logo_small_url: '',
  favicon_url: '',
  primary_color: '#2563eb',
  secondary_color: '#6b7280',
  background_color: '#f3f4f6',
  login_background: 'linear-gradient(160deg, #1d4ed8 0%, #1e3a8a 100%)',
  updated_at: new Date().toISOString(),
};

const INITIAL_AUDIT: AuditLog[] = [
  {
    id: 'al1',
    user_id: 'u1',
    user_email: 'admin@demo.local',
    action: 'ADMIN_LOGIN',
    target_type: 'SYSTEM',
    metadata: { browser: 'Chrome', platform: 'Windows' },
    ip: '127.0.0.1',
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'al2',
    user_id: 'u1',
    user_email: 'admin@demo.local',
    action: 'ADMIN_CHANGED_BRANDING',
    target_type: 'BRANDING',
    target_id: '1',
    metadata: { company_name: 'Centras Chat' },
    ip: '127.0.0.1',
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
];

export class MockDataProvider implements IDataProvider {
  private users: User[] = [...INITIAL_USERS];
  private departments: Department[] = [...INITIAL_DEPARTMENTS];
  private conversations: Conversation[] = [...INITIAL_CONVERSATIONS];
  private messages: Message[] = [...INITIAL_MESSAGES];
  private members: ConversationMember[] = INITIAL_MEMBERS.map(m => ({ ...m }));
  private branding: BrandingConfig = { ...INITIAL_BRANDING };
  private auditLogs: AuditLog[] = [...INITIAL_AUDIT];
  private telegramIdentityMap: Map<string, TelegramIdentity> = new Map();
  private telegramRelayLogs: TelegramRelayLog[] = [];
  private userSettingsMap: Map<string, UserSettings> = new Map();
  private telegramLinkTokens: Map<string, { ownerUserId: string; expiresAt: number; used: boolean }> = new Map();
  private nextTelegramLinkToken = 1;
  private currentUserId: string;
  private messageSubscribers: Map<string, Set<(message: Message) => void>> = new Map();
  private activitySubscribers: Set<(message: Message) => void> = new Set();
  private brandingSubscribers: Set<(branding: BrandingConfig) => void> = new Set();

  constructor(currentUserId = 'u1') {
    if (!this.users.some(user => user.id === currentUserId)) throw new Error('Mock user not found');
    this.currentUserId = currentUserId;
    // Default Telegram mock account for u1
    this.telegramIdentityMap.set('u1', {
      id: 'telegram-identity-u1',
      profile_id: 'u1',
      telegram_user_id: 99881122,
      telegram_chat_id: 99881122,
      username: 'admin_telegram',
      status: 'active',
      linked_at: new Date().toISOString(),
      disconnected_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // --- USERS & AUTH ---
  async getUsers(): Promise<User[]> {
    return [...this.users];
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }

  async searchUsers(query: string): Promise<User[]> {
    const q = query.toLowerCase().trim();
    if (!q) return this.getUsers();
    return this.users.filter(
      u =>
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.position && u.position.toLowerCase().includes(q))
    );
  }

  async createUser(userData: Partial<User>): Promise<User> {
    const dept = this.departments.find(d => d.id === userData.department_id);
    const newUser: User = {
      id: `u_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      email: userData.email || 'user@company.local',
      first_name: userData.first_name || 'Сотрудник',
      last_name: userData.last_name || 'Новый',
      avatar_url: userData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.first_name}`,
      phone: userData.phone || '',
      position: userData.position || 'Специалист',
      department_id: userData.department_id || 'd1',
      department_name: dept ? dept.name : 'IT',
      status: 'OFFLINE',
      role: userData.role || 'EMPLOYEE',
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.users.push(newUser);
    await this.logAudit({
      user_id: 'u1',
      user_email: 'admin@demo.local',
      action: 'ADMIN_CREATED_USER',
      target_type: 'USER',
      target_id: newUser.id,
      metadata: { email: newUser.email, name: `${newUser.first_name} ${newUser.last_name}` },
    });
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) throw new Error(`User ${id} not found`);

    if (updates.department_id) {
      const dept = this.departments.find(d => d.id === updates.department_id);
      if (dept) updates.department_name = dept.name;
    }

    this.users[index] = {
      ...this.users[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await this.logAudit({
      user_id: 'u1',
      user_email: 'admin@demo.local',
      action: updates.status === 'BLOCKED' ? 'ADMIN_BLOCKED_USER' : 'ADMIN_UPDATED_USER',
      target_type: 'USER',
      target_id: id,
      metadata: updates,
    });

    return this.users[index];
  }

  async deleteUser(id: string): Promise<boolean> {
    this.users = this.users.filter(u => u.id !== id);
    await this.logAudit({
      user_id: 'u1',
      user_email: 'admin@demo.local',
      action: 'ADMIN_DELETED_USER',
      target_type: 'USER',
      target_id: id,
    });
    return true;
  }

  // Status-only changes (login → ONLINE, logout → OFFLINE, sidebar status picker) are
  // routine presence updates, not admin activity — apply directly rather than going
  // through updateUser, so they don't get mislabeled as ADMIN_UPDATED_USER/
  // ADMIN_BLOCKED_USER audit entries and flood audit_logs. Mirrors the same fix in
  // SupabaseDataProvider.setUserStatus. Admin block/unblock (users-table.tsx) calls
  // updateUser directly and still gets audited.
  async setUserStatus(id: string, status: UserStatus): Promise<User> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) throw new Error(`User ${id} not found`);

    this.users[index] = {
      ...this.users[index],
      status,
      updated_at: new Date().toISOString(),
    };

    return this.users[index];
  }

  // --- DEPARTMENTS ---
  async getDepartments(): Promise<Department[]> {
    return this.departments.map(d => ({
      ...d,
      member_count: this.users.filter(u => u.department_id === d.id).length,
    }));
  }

  async createDepartment(name: string, description?: string): Promise<Department> {
    const newDept: Department = {
      id: `d_${Date.now()}`,
      name,
      description: description || '',
      created_at: new Date().toISOString(),
      member_count: 0,
    };
    this.departments.push(newDept);
    return newDept;
  }

  async updateDepartment(id: string, name: string, description?: string): Promise<Department> {
    const dept = this.departments.find(d => d.id === id);
    if (!dept) throw new Error('Department not found');
    dept.name = name;
    if (description !== undefined) dept.description = description;
    return dept;
  }

  async deleteDepartment(id: string): Promise<boolean> {
    this.departments = this.departments.filter(d => d.id !== id);
    return true;
  }

  // --- CONVERSATIONS ---
  async getConversations(userId: string): Promise<Conversation[]> {
    return this.conversations.map(conv => {
      const convMsgs = this.messages.filter(m => m.conversation_id === conv.id);
      const lastMsg = convMsgs.length > 0 ? convMsgs[convMsgs.length - 1] : undefined;
      return {
        ...conv,
        last_message: lastMsg,
        unread_count: this.countUnread(conv.id, userId, convMsgs),
      };
    });
  }

  private countUnread(conversationId: string, userId: string, convMsgs: Message[]): number {
    const membership = this.members.find(m => m.conversation_id === conversationId && m.user_id === userId);
    const lastReadIdx = membership?.last_read_message_id
      ? convMsgs.findIndex(m => m.id === membership.last_read_message_id)
      : -1;
    return convMsgs.slice(lastReadIdx + 1).filter(m => m.sender_id !== userId && !m.deleted_at).length;
  }

  async getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    return this.members
      .filter(m => m.conversation_id === conversationId)
      .map(m => ({ ...m, user: this.users.find(u => u.id === m.user_id) }));
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    const conv = this.conversations.find(c => c.id === id);
    if (!conv) return null;
    const convMsgs = this.messages.filter(m => m.conversation_id === conv.id);
    return {
      ...conv,
      last_message: convMsgs.length > 0 ? convMsgs[convMsgs.length - 1] : undefined,
    };
  }

  async createConversation(data: {
    type: 'DIRECT' | 'GROUP' | 'CHANNEL';
    name?: string;
    description?: string;
    created_by: string;
    is_private?: boolean;
    member_ids: string[];
  }): Promise<Conversation> {
    const newConv: Conversation = {
      id: `c_${Date.now()}`,
      type: data.type,
      name: data.name,
      description: data.description,
      created_by: data.created_by,
      is_private: data.is_private ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      unread_count: 0,
    };
    this.conversations.push(newConv);
    const joinedAt = new Date().toISOString();
    Array.from(new Set([data.created_by, ...data.member_ids])).forEach(uid => {
      this.members.push({ conversation_id: newConv.id, user_id: uid, role: uid === data.created_by ? 'ADMIN' : 'MEMBER', joined_at: joinedAt });
    });
    return newConv;
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<boolean> {
    const joinedAt = new Date().toISOString();
    userIds.forEach(uid => {
      if (!this.members.some(m => m.conversation_id === conversationId && m.user_id === uid)) {
        this.members.push({ conversation_id: conversationId, user_id: uid, role: 'MEMBER', joined_at: joinedAt });
      }
    });
    return true;
  }

  async removeMember(conversationId: string, userId: string): Promise<boolean> {
    this.members = this.members.filter(m => !(m.conversation_id === conversationId && m.user_id === userId));
    return true;
  }

  async markConversationAsRead(conversationId: string, userId: string, messageId: string): Promise<boolean> {
    const membership = this.members.find(m => m.conversation_id === conversationId && m.user_id === userId);
    if (membership) {
      membership.last_read_message_id = messageId;
    } else {
      this.members.push({ conversation_id: conversationId, user_id: userId, role: 'MEMBER', joined_at: new Date().toISOString(), last_read_message_id: messageId });
    }
    return true;
  }

  // --- MESSAGES ---
  async getMessages(conversationId: string, options?: MessageQueryOptions): Promise<Message[]> {
    const all = this.messages
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (!options) return all;
    const before = options.before ? new Date(options.before).getTime() : Number.POSITIVE_INFINITY;
    const older = all.filter(m => new Date(m.created_at).getTime() < before);
    const limit = Math.max(1, options.limit ?? 50);
    return older.slice(Math.max(0, older.length - limit));
  }

  async sendMessage(data: {
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type?: 'TEXT' | 'FILE' | 'IMAGE';
    reply_to?: string;
    attachments?: Partial<Attachment>[];
  }): Promise<Message> {
    const sender = this.users.find(u => u.id === data.sender_id);
    const newMsg: Message = {
      id: `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversation_id: data.conversation_id,
      sender_id: data.sender_id,
      sender_name: sender ? `${sender.first_name} ${sender.last_name}` : 'Сотрудник',
      sender_avatar: sender?.avatar_url,
      content: data.content,
      message_type: data.message_type || 'TEXT',
      reply_to: data.reply_to,
      created_at: new Date().toISOString(),
      reactions: [],
      attachments: data.attachments?.map((att, idx) => ({
        id: `att_${Date.now()}_${idx}`,
        message_id: '',
        file_name: att.file_name || 'file',
        file_path: att.file_path || '#',
        mime_type: att.mime_type || 'application/octet-stream',
        size: att.size || 1024,
        created_at: new Date().toISOString(),
      })),
    };
    this.messages.push(newMsg);

    // Notify Subscribers (Realtime simulation)
    const subs = this.messageSubscribers.get(data.conversation_id);
    if (subs) {
      subs.forEach(cb => cb(newMsg));
    }
    this.activitySubscribers.forEach(cb => cb(newMsg));

    return newMsg;
  }

  async editMessage(messageId: string, newContent: string): Promise<Message> {
    const msg = this.messages.find(m => m.id === messageId);
    if (!msg) throw new Error('Message not found');
    msg.content = newContent;
    msg.edited_at = new Date().toISOString();
    return msg;
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.deleted_at = new Date().toISOString();
      msg.content = 'Сообщение удалено';
    }
    return true;
  }

  async addReaction(messageId: string, userId: string, reactionStr: string): Promise<MessageReaction> {
    const msg = this.messages.find(m => m.id === messageId);
    if (!msg) throw new Error('Message not found');
    if (!msg.reactions) msg.reactions = [];

    const existing = msg.reactions.find(r => r.user_id === userId && r.reaction === reactionStr);
    if (existing) return existing;

    const user = this.users.find(u => u.id === userId);
    const newReaction: MessageReaction = {
      id: `r_${Date.now()}`,
      message_id: messageId,
      user_id: userId,
      user_name: user ? `${user.first_name} ${user.last_name}` : 'Пользователь',
      reaction: reactionStr,
      created_at: new Date().toISOString(),
    };
    msg.reactions.push(newReaction);
    return newReaction;
  }

  async removeReaction(messageId: string, userId: string, reactionStr: string): Promise<boolean> {
    const msg = this.messages.find(m => m.id === messageId);
    if (!msg || !msg.reactions) return false;
    msg.reactions = msg.reactions.filter(r => !(r.user_id === userId && r.reaction === reactionStr));
    return true;
  }

  // --- BRANDING ENGINE ---
  async getBranding(): Promise<BrandingConfig> {
    return { ...this.branding };
  }

  async updateBranding(config: Partial<BrandingConfig>): Promise<BrandingConfig> {
    this.branding = {
      ...this.branding,
      ...config,
      updated_at: new Date().toISOString(),
    };

    // Notify all active theme subscribers
    this.brandingSubscribers.forEach(cb => cb(this.branding));

    await this.logAudit({
      user_id: 'u1',
      user_email: 'admin@demo.local',
      action: 'ADMIN_CHANGED_BRANDING',
      target_type: 'BRANDING',
      target_id: '1',
      metadata: config,
    });

    return { ...this.branding };
  }

  // --- AUDIT LOGS ---
  async getAuditLogs(): Promise<AuditLog[]> {
    return [...this.auditLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async logAudit(data: {
    user_id: string;
    user_email: string;
    action: string;
    target_type: string;
    target_id?: string;
    metadata?: Record<string, any>;
  }): Promise<AuditLog> {
    const newLog: AuditLog = {
      id: `al_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: data.user_id,
      user_email: data.user_email,
      action: data.action,
      target_type: data.target_type,
      target_id: data.target_id || '',
      metadata: data.metadata || {},
      ip: '127.0.0.1',
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(newLog);
    return newLog;
  }

  // --- TELEGRAM INTEGRATION ---
  async createTelegramLink(): Promise<TelegramLink> {
    const rawToken = `mock-link-${String(this.nextTelegramLinkToken++).padStart(4, '0')}`;
    const expiresAtMs = Date.now() + 10 * 60 * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();
    this.telegramLinkTokens.set(rawToken, { ownerUserId: this.currentUserId, expiresAt: expiresAtMs, used: false });
    return {
      deepLink: `https://t.me/mock_relay_bot?start=${rawToken}`,
      expiresAt,
    };
  }

  async getTelegramIdentity(): Promise<TelegramIdentity | null> {
    const identity = this.telegramIdentityMap.get(this.currentUserId);
    return identity ? { ...identity } : null;
  }

  async disconnectTelegram(): Promise<boolean> {
    const identity = this.telegramIdentityMap.get(this.currentUserId);
    if (!identity) return true;
    this.telegramIdentityMap.set(this.currentUserId, {
      ...identity,
      status: 'disconnected',
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return true;
  }

  async getTelegramRelayLogs(limit = 50): Promise<TelegramRelayLog[]> {
    const boundedLimit = Math.max(0, Math.min(Math.floor(limit), 100));
    return this.telegramRelayLogs
      .filter(log => log.profile_id === this.currentUserId)
      .slice(0, boundedLimit)
      .map(log => ({ ...log }));
  }

  async getUserSettings(): Promise<UserSettings> {
    const existing = this.userSettingsMap.get(this.currentUserId);
    if (existing) return { ...existing };

    const now = new Date().toISOString();
    const defaults: UserSettings = {
      user_id: this.currentUserId,
      notifications: true,
      mentions_only: false,
      theme: 'dark',
      language: 'ru',
      telegram_enabled: false,
      created_at: now,
      updated_at: now,
    };
    this.userSettingsMap.set(this.currentUserId, defaults);
    return { ...defaults };
  }

  async updateUserSettings(
    updates: Partial<Pick<UserSettings, 'notifications' | 'mentions_only' | 'theme' | 'language' | 'telegram_enabled'>>,
  ): Promise<UserSettings> {
    const current = await this.getUserSettings();
    const updated = { ...current, ...updates, updated_at: new Date().toISOString() };
    this.userSettingsMap.set(this.currentUserId, updated);
    return { ...updated };
  }

  setCurrentUser(userId: string): void {
    if (!this.users.some(user => user.id === userId)) throw new Error('Mock user not found');
    this.currentUserId = userId;
  }

  consumeMockTelegramLink(rawToken: string): boolean {
    const issued = this.telegramLinkTokens.get(rawToken);
    if (!issued || issued.ownerUserId !== this.currentUserId || issued.used || issued.expiresAt <= Date.now()) {
      return false;
    }
    issued.used = true;
    return true;
  }

  // --- REALTIME SUBSCRIBERS ---
  subscribeToMessages(conversationId: string, callback: (message: Message) => void): () => void {
    if (!this.messageSubscribers.has(conversationId)) {
      this.messageSubscribers.set(conversationId, new Set());
    }
    this.messageSubscribers.get(conversationId)!.add(callback);

    return () => {
      const subs = this.messageSubscribers.get(conversationId);
      if (subs) {
        subs.delete(callback);
      }
    };
  }

  subscribeToConversationActivity(_userId: string, callback: (message: Message) => void): () => void {
    this.activitySubscribers.add(callback);
    return () => {
      this.activitySubscribers.delete(callback);
    };
  }

  subscribeToConnectionState(callback: (state: ConnectionState) => void): () => void {
    // In-memory provider has no transport; it is online whenever the browser is.
    callback('online');
    return () => {};
  }

  subscribeToBranding(callback: (branding: BrandingConfig) => void): () => void {
    this.brandingSubscribers.add(callback);
    return () => {
      this.brandingSubscribers.delete(callback);
    };
  }
}

// Global Singleton Instance
export const globalDataProvider = new MockDataProvider();
