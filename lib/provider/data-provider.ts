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
  UserRole,
  ConversationMember,
} from '@/types';

export interface TelegramLink {
  deepLink: string;
  expiresAt: string;
}

export interface IDataProvider {
  // Authentication & Users
  getUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  searchUsers(query: string): Promise<User[]>;
  createUser(userData: Partial<User>): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  setUserStatus(id: string, status: UserStatus): Promise<User>;

  // Departments
  getDepartments(): Promise<Department[]>;
  createDepartment(name: string, description?: string): Promise<Department>;
  updateDepartment(id: string, name: string, description?: string): Promise<Department>;
  deleteDepartment(id: string): Promise<boolean>;

  // Conversations & Channels
  getConversations(userId: string): Promise<Conversation[]>;
  getConversationById(id: string): Promise<Conversation | null>;
  createConversation(data: {
    type: 'DIRECT' | 'GROUP' | 'CHANNEL';
    name?: string;
    description?: string;
    created_by: string;
    is_private?: boolean;
    member_ids: string[];
  }): Promise<Conversation>;
  getConversationMembers(conversationId: string): Promise<ConversationMember[]>;
  addMembers(conversationId: string, userIds: string[]): Promise<boolean>;
  removeMember(conversationId: string, userId: string): Promise<boolean>;
  markConversationAsRead(conversationId: string, userId: string, messageId: string): Promise<boolean>;

  // Messages
  getMessages(conversationId: string): Promise<Message[]>;
  sendMessage(data: {
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type?: 'TEXT' | 'FILE' | 'IMAGE';
    reply_to?: string;
    attachments?: Partial<Attachment>[];
  }): Promise<Message>;
  editMessage(messageId: string, newContent: string): Promise<Message>;
  deleteMessage(messageId: string): Promise<boolean>;
  addReaction(messageId: string, userId: string, reaction: string): Promise<MessageReaction>;
  removeReaction(messageId: string, userId: string, reaction: string): Promise<boolean>;

  // Branding (Dynamic Engine)
  getBranding(): Promise<BrandingConfig>;
  updateBranding(config: Partial<BrandingConfig>): Promise<BrandingConfig>;

  // Audit Logs
  getAuditLogs(): Promise<AuditLog[]>;
  logAudit(data: {
    user_id: string;
    user_email: string;
    action: string;
    target_type: string;
    target_id?: string;
    metadata?: Record<string, any>;
  }): Promise<AuditLog>;

  // Telegram Integration
  createTelegramLink(): Promise<TelegramLink>;
  getTelegramIdentity(): Promise<TelegramIdentity | null>;
  disconnectTelegram(): Promise<boolean>;
  getTelegramRelayLogs(limit?: number): Promise<TelegramRelayLog[]>;
  getUserSettings(): Promise<UserSettings>;
  updateUserSettings(updates: Partial<Pick<UserSettings, 'notifications' | 'mentions_only' | 'theme' | 'language' | 'telegram_enabled'>>): Promise<UserSettings>;

  // Realtime Subscriptions
  subscribeToMessages(conversationId: string, callback: (message: Message) => void): () => void;
  subscribeToBranding(callback: (branding: BrandingConfig) => void): () => void;
}
