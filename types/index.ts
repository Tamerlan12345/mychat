export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'EMPLOYEE';

export type UserStatus = 'ONLINE' | 'OFFLINE' | 'AWAY' | 'DO_NOT_DISTURB' | 'BLOCKED';

export type ConversationType = 'DIRECT' | 'GROUP' | 'CHANNEL';

export type MessageType = 'TEXT' | 'FILE' | 'IMAGE' | 'SYSTEM';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  phone?: string;
  position?: string;
  department_id?: string;
  department_name?: string;
  status: UserStatus;
  role: UserRole;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  member_count?: number;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  avatar_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_private?: boolean;
  description?: string;
  last_message?: Message;
  unread_count?: number;
  members?: ConversationMember[];
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  user?: User;
  role: 'ADMIN' | 'MEMBER';
  joined_at: string;
  last_read_message_id?: string;
}

export interface Attachment {
  id: string;
  message_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size: number; // in bytes
  created_at: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  user_name?: string;
  reaction: string; // emoji e.g. 👍, ❤️, 🔥
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  sender_avatar?: string;
  content: string;
  message_type: MessageType;
  reply_to?: string;
  reply_message?: Message;
  edited_at?: string;
  deleted_at?: string;
  created_at: string;
  reactions?: MessageReaction[];
  attachments?: Attachment[];
}

export interface UserSettings {
  user_id: string;
  notifications: boolean;
  mentions_only: boolean;
  theme: 'dark' | 'light' | 'system';
  language: string;
  telegram_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandingConfig {
  company_name: string;
  app_title: string;
  logo_url: string;
  logo_small_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  login_background: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  target_type: string;
  target_id?: string;
  metadata?: Record<string, any>;
  ip: string;
  created_at: string;
}

export type TelegramIdentityStatus = 'active' | 'disconnected';
export type TelegramRelayDirection = 'inbound' | 'outbound';
export type TelegramOutboxStatus = 'pending' | 'leased' | 'sent' | 'failed';

export interface TelegramLinkToken {
  id: string;
  owner_profile_id: string;
  token_hash: string;
  expires_at: string;
  used_at?: string | null;
  created_at: string;
}

export interface TelegramIdentity {
  id: string;
  profile_id: string;
  telegram_user_id: number;
  telegram_chat_id: number;
  username?: string | null;
  status: TelegramIdentityStatus;
  linked_at: string;
  disconnected_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelegramRelayLog {
  id: string;
  profile_id: string;
  conversation_id: string;
  centras_message_id?: string | null;
  telegram_user_id: number;
  telegram_chat_id: number;
  telegram_message_id: number;
  direction: TelegramRelayDirection;
  created_at: string;
}

export interface TelegramNotificationOutbox {
  id: string;
  profile_id: string;
  idempotency_key: string;
  telegram_chat_id: number;
  payload: Record<string, unknown>;
  status: TelegramOutboxStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  lease_token?: string | null;
  leased_until?: string | null;
  telegram_message_id?: number | null;
  last_error_code?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}
