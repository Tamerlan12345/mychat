import { getSupabaseClient } from './supabase-client';
import type { IDataProvider } from './data-provider';
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
  ConversationMember,
} from '@/types';
import type { TelegramLink, MessageQueryOptions, ConnectionState } from './data-provider';

export function mapProfileRow(row: any): User {
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    avatar_url: row.avatar_url ?? undefined,
    phone: row.phone ?? undefined,
    position: row.position ?? undefined,
    department_id: row.department_id ?? undefined,
    department_name: row.departments?.name ?? undefined,
    status: row.status,
    role: row.role,
    last_seen: row.last_seen,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDepartmentRow(row: any): Department {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    created_at: row.created_at,
    member_count: row.member_count,
  };
}

export function mapMessageRow(row: any): Message {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_name: row.profiles ? `${row.profiles.first_name} ${row.profiles.last_name}` : undefined,
    sender_avatar: row.profiles?.avatar_url ?? undefined,
    content: row.content,
    message_type: row.message_type,
    reply_to: row.reply_to ?? undefined,
    edited_at: row.edited_at ?? undefined,
    deleted_at: row.deleted_at ?? undefined,
    created_at: row.created_at,
    reactions: (row.message_reactions ?? []).map((r: any) => ({
      id: r.id,
      message_id: r.message_id,
      user_id: r.user_id,
      user_name: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : undefined,
      reaction: r.reaction,
      created_at: r.created_at,
    })),
    attachments: (row.attachments ?? []).map((a: any) => ({
      id: a.id,
      message_id: a.message_id,
      file_name: a.file_name,
      file_path: a.file_path,
      mime_type: a.mime_type,
      size: a.size,
      created_at: a.created_at,
    })),
  };
}

export function mapConversationRow(row: any): Conversation {
  return {
    id: row.id,
    type: row.type,
    name: row.name ?? undefined,
    avatar_url: row.avatar_url ?? undefined,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_private: row.is_private ?? undefined,
    description: row.description ?? undefined,
  };
}

export function mapConversationMemberRow(row: any): ConversationMember {
  return {
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    role: row.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
    joined_at: row.joined_at,
    last_read_message_id: row.last_read_message_id ?? undefined,
    user: row.profiles ? mapProfileRow(row.profiles) : undefined,
  };
}

function mapOverviewRow(row: any): Conversation {
  const conversation = mapConversationRow(row.conversation ?? {});
  const lm = row.last_message;
  return {
    ...conversation,
    last_message: lm
      ? {
          ...mapMessageRow(lm),
          sender_name: lm.sender_name ?? undefined,
          sender_avatar: lm.sender_avatar ?? undefined,
        }
      : undefined,
    unread_count: typeof row.unread_count === 'number' ? row.unread_count : 0,
  };
}

function mapBrandingRow(row: any): BrandingConfig {
  return {
    company_name: row.company_name,
    app_title: row.app_title,
    logo_url: row.logo_url ?? '',
    logo_small_url: row.logo_small_url ?? '',
    favicon_url: row.favicon_url ?? '',
    primary_color: row.primary_color,
    secondary_color: row.secondary_color,
    background_color: row.background_color,
    login_background: row.login_background,
    updated_at: row.updated_at,
  };
}

function mapAuditRow(row: any): AuditLog {
  return {
    id: row.id,
    user_id: row.user_id,
    user_email: row.user_email,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id ?? undefined,
    metadata: row.metadata ?? {},
    ip: row.ip,
    created_at: row.created_at,
  };
}

const MESSAGE_SELECT = '*, profiles(first_name, last_name, avatar_url), message_reactions(*, profiles(first_name, last_name)), attachments(*)';

export class SupabaseDataProvider implements IDataProvider {
  private get client() {
    return getSupabaseClient();
  }

  // Self-logs an audit entry attributed to the currently authenticated user, mirroring
  // the mock provider's self-logging inside its mutating methods. Unlike the mock
  // provider (which hardcodes a fake 'u1'/admin@demo.local actor because the provider
  // interface doesn't receive the real caller's identity), this derives the actor from
  // the live Supabase session so the row satisfies insert_audit_log's
  // `p_user_id = auth.uid()` forgery guard. Best-effort: audit logging must never block
  // the primary mutation it records, so failures are swallowed and logged.
  private async selfLogAudit(
    action: string,
    target_type: string,
    target_id?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const { data: authData } = await this.client.auth.getUser();
      const actor = authData?.user;
      if (!actor) return;
      await this.logAudit({
        user_id: actor.id,
        user_email: actor.email ?? '',
        action,
        target_type,
        target_id,
        metadata,
      });
    } catch (err) {
      console.error(`selfLogAudit (${action}) failed:`, err);
    }
  }

  // --- USERS ---
  async getUsers(): Promise<User[]> {
    const { data, error } = await this.client.from('profiles').select('*, departments(name)').order('first_name');
    if (error) throw new Error(`getUsers failed: ${error.message}`);
    return (data ?? []).map(mapProfileRow);
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*, departments(name)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getUserById failed: ${error.message}`);
    return data ? mapProfileRow(data) : null;
  }

  async searchUsers(query: string): Promise<User[]> {
    const q = query.trim();
    if (!q) return this.getUsers();
    const { data, error } = await this.client
      .from('profiles')
      .select('*, departments(name)')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,position.ilike.%${q}%`);
    if (error) throw new Error(`searchUsers failed: ${error.message}`);
    return (data ?? []).map(mapProfileRow);
  }

  async createUser(userData: Partial<User>): Promise<User> {
    // Real signup happens via Supabase Auth (see docs/SUPABASE_SETUP.md and
    // scripts/seed-supabase.ts) — the handle_new_auth_user() trigger creates the
    // profiles row. This method covers admin edits to an existing profile's fields
    // that aren't part of signup (e.g. an admin pre-provisioning a department).
    throw new Error(
      'createUser: direct profile creation is not supported in Supabase mode — users are created via Supabase Auth signup, which auto-creates their profile.'
    );
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const { department_name, ...rest } = updates;
    const { data, error } = await this.client
      .from('profiles')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, departments(name)')
      .single();
    if (error) throw new Error(`updateUser failed: ${error.message}`);
    await this.selfLogAudit(
      updates.status === 'BLOCKED' ? 'ADMIN_BLOCKED_USER' : 'ADMIN_UPDATED_USER',
      'USER',
      id,
      updates
    );
    return mapProfileRow(data);
  }

  async deleteUser(id: string): Promise<boolean> {
    const { error } = await this.client.from('profiles').delete().eq('id', id);
    if (error) throw new Error(`deleteUser failed: ${error.message}`);
    await this.selfLogAudit('ADMIN_DELETED_USER', 'USER', id);
    return true;
  }

  // Status-only changes (login → ONLINE, logout → OFFLINE, manual status picker) are
  // routine presence updates, not admin activity — write directly rather than going
  // through updateUser, so they don't get mislabeled as ADMIN_UPDATED_USER/
  // ADMIN_BLOCKED_USER audit entries and flood audit_logs.
  async setUserStatus(id: string, status: User['status']): Promise<User> {
    const { data, error } = await this.client
      .from('profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, departments(name)')
      .single();
    if (error) throw new Error(`setUserStatus failed: ${error.message}`);
    return mapProfileRow(data);
  }

  // --- DEPARTMENTS ---
  async getDepartments(): Promise<Department[]> {
    const { data, error } = await this.client.from('departments').select('*, profiles(count)');
    if (error) throw new Error(`getDepartments failed: ${error.message}`);
    return (data ?? []).map((row: any) => ({
      ...mapDepartmentRow(row),
      member_count: row.profiles?.[0]?.count ?? 0,
    }));
  }

  async createDepartment(name: string, description?: string): Promise<Department> {
    const { data, error } = await this.client
      .from('departments')
      .insert({ name, description })
      .select()
      .single();
    if (error) throw new Error(`createDepartment failed: ${error.message}`);
    return mapDepartmentRow(data);
  }

  async updateDepartment(id: string, name: string, description?: string): Promise<Department> {
    const { data, error } = await this.client
      .from('departments')
      .update({ name, description })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`updateDepartment failed: ${error.message}`);
    return mapDepartmentRow(data);
  }

  async deleteDepartment(id: string): Promise<boolean> {
    const { error } = await this.client.from('departments').delete().eq('id', id);
    if (error) throw new Error(`deleteDepartment failed: ${error.message}`);
    return true;
  }

  // --- CONVERSATIONS ---
  async getConversations(userId: string): Promise<Conversation[]> {
    // One round trip via the conversations_overview() RPC (migration 004). Falls back to the
    // per-conversation queries when the function is not installed yet.
    const { data, error } = await this.client.rpc('conversations_overview');
    if (!error && Array.isArray(data)) {
      return data.map(mapOverviewRow);
    }
    console.warn('conversations_overview RPC unavailable, using per-conversation queries:', error?.message);
    return this.getConversationsLegacy(userId);
  }

  private async getConversationsLegacy(userId: string): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversation_members')
      .select('conversations(*)')
      .eq('user_id', userId);
    if (error) throw new Error(`getConversations failed: ${error.message}`);
    const conversations = (data ?? []).map((row: any) => mapConversationRow(row.conversations));

    return Promise.all(
      conversations.map(async conv => {
        const { data: lastMsgRows } = await this.client
          .from('messages')
          .select(MESSAGE_SELECT)
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const { data: memberRow } = await this.client
          .from('conversation_members')
          .select('last_read_message_id')
          .eq('conversation_id', conv.id)
          .eq('user_id', userId)
          .maybeSingle();

        let unreadCountQuery = this.client
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId);

        if (memberRow?.last_read_message_id) {
          const { data: lastReadRow } = await this.client
            .from('messages')
            .select('created_at')
            .eq('id', memberRow.last_read_message_id)
            .maybeSingle();
          if (lastReadRow) {
            unreadCountQuery = unreadCountQuery.gt('created_at', lastReadRow.created_at);
          }
        }

        const { count } = await unreadCountQuery;

        return {
          ...conv,
          last_message: lastMsgRows?.[0] ? mapMessageRow(lastMsgRows[0]) : undefined,
          unread_count: count ?? 0,
        };
      })
    );
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    const { data, error } = await this.client.from('conversations').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`getConversationById failed: ${error.message}`);
    return data ? mapConversationRow(data) : null;
  }

  async createConversation(data: {
    type: 'DIRECT' | 'GROUP' | 'CHANNEL';
    name?: string;
    description?: string;
    created_by: string;
    is_private?: boolean;
    member_ids: string[];
  }): Promise<Conversation> {
    const { data: convRow, error } = await this.client
      .from('conversations')
      .insert({
        type: data.type,
        name: data.name,
        description: data.description,
        created_by: data.created_by,
        is_private: data.is_private ?? false,
      })
      .select()
      .single();
    if (error) throw new Error(`createConversation failed: ${error.message}`);

    // The members_insert RLS policy relies on STABLE helper functions
    // (is_conversation_member / conversation_has_no_members) that only see rows
    // committed before the current statement started. Inserting every member in one
    // multi-row statement means only the creator's own bootstrap row can pass — every
    // other row is evaluated against a snapshot where the creator isn't a member yet.
    // Splitting into two statements lets the second insert see the creator's
    // now-committed membership row and pass via the normal "existing member adds
    // others" branch.
    const otherMemberIds = Array.from(new Set(data.member_ids)).filter(id => id !== data.created_by);

    const { error: creatorMemberError } = await this.client
      .from('conversation_members')
      .insert({ conversation_id: convRow.id, user_id: data.created_by });
    if (creatorMemberError) {
      await this.client.from('conversations').delete().eq('id', convRow.id);
      throw new Error(`createConversation (members) failed: ${creatorMemberError.message}`);
    }

    if (otherMemberIds.length > 0) {
      const { error: memberError } = await this.client
        .from('conversation_members')
        .insert(otherMemberIds.map(userId => ({ conversation_id: convRow.id, user_id: userId })));
      if (memberError) {
        await this.client.from('conversations').delete().eq('id', convRow.id);
        throw new Error(`createConversation (members) failed: ${memberError.message}`);
      }
    }

    return mapConversationRow(convRow);
  }

  async getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    const { data, error } = await this.client
      .from('conversation_members')
      .select('conversation_id, user_id, role, joined_at, last_read_message_id, profiles(*, departments(name))')
      .eq('conversation_id', conversationId)
      .order('joined_at', { ascending: true });
    if (error) throw new Error(`getConversationMembers failed: ${error.message}`);
    return (data ?? []).map(mapConversationMemberRow);
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<boolean> {
    const { error } = await this.client
      .from('conversation_members')
      .insert(userIds.map(userId => ({ conversation_id: conversationId, user_id: userId })));
    if (error) throw new Error(`addMembers failed: ${error.message}`);
    return true;
  }

  async removeMember(conversationId: string, userId: string): Promise<boolean> {
    const { error } = await this.client
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    if (error) throw new Error(`removeMember failed: ${error.message}`);
    return true;
  }

  async markConversationAsRead(conversationId: string, userId: string, messageId: string): Promise<boolean> {
    const { error } = await this.client
      .from('conversation_members')
      .update({ last_read_message_id: messageId })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    if (error) throw new Error(`markConversationAsRead failed: ${error.message}`);
    return true;
  }

  // --- MESSAGES ---
  async getMessages(conversationId: string, options?: MessageQueryOptions): Promise<Message[]> {
    if (!options) {
      const { data, error } = await this.client
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`getMessages failed: ${error.message}`);
      return (data ?? []).map(mapMessageRow);
    }

    let query = this.client
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, options.limit ?? 50));
    if (options.before) query = query.lt('created_at', options.before);
    const { data, error } = await query;
    if (error) throw new Error(`getMessages failed: ${error.message}`);
    return (data ?? []).map(mapMessageRow).reverse();
  }

  async sendMessage(data: {
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type?: 'TEXT' | 'FILE' | 'IMAGE';
    reply_to?: string;
    attachments?: Partial<Attachment>[];
  }): Promise<Message> {
    const { data: row, error } = await this.client
      .from('messages')
      .insert({
        conversation_id: data.conversation_id,
        sender_id: data.sender_id,
        content: data.content,
        message_type: data.message_type ?? 'TEXT',
        reply_to: data.reply_to,
      })
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw new Error(`sendMessage failed: ${error.message}`);

    if (data.attachments && data.attachments.length > 0) {
      const { error: attachmentError } = await this.client.from('attachments').insert(
        data.attachments.map(att => ({
          message_id: row.id,
          file_name: att.file_name,
          file_path: att.file_path,
          mime_type: att.mime_type,
          size: att.size,
        }))
      );
      if (attachmentError) throw new Error(`sendMessage (attachments) failed: ${attachmentError.message}`);
    }

    return mapMessageRow(row);
  }

  async editMessage(messageId: string, newContent: string): Promise<Message> {
    const { data, error } = await this.client
      .from('messages')
      .update({ content: newContent, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw new Error(`editMessage failed: ${error.message}`);
    return mapMessageRow(data);
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    const { error } = await this.client
      .from('messages')
      .update({ deleted_at: new Date().toISOString(), content: 'Сообщение удалено' })
      .eq('id', messageId);
    if (error) throw new Error(`deleteMessage failed: ${error.message}`);
    return true;
  }

  async addReaction(messageId: string, userId: string, reaction: string): Promise<MessageReaction> {
    const { data, error } = await this.client
      .from('message_reactions')
      .upsert({ message_id: messageId, user_id: userId, reaction }, { onConflict: 'message_id,user_id,reaction' })
      .select('*, profiles(first_name, last_name)')
      .single();
    if (error) throw new Error(`addReaction failed: ${error.message}`);
    return {
      id: data.id,
      message_id: data.message_id,
      user_id: data.user_id,
      user_name: data.profiles ? `${data.profiles.first_name} ${data.profiles.last_name}` : undefined,
      reaction: data.reaction,
      created_at: data.created_at,
    };
  }

  async removeReaction(messageId: string, userId: string, reaction: string): Promise<boolean> {
    const { error } = await this.client
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('reaction', reaction);
    if (error) throw new Error(`removeReaction failed: ${error.message}`);
    return true;
  }

  subscribeToMessages(conversationId: string, callback: (message: Message) => void): () => void {
    const channel = this.client
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        async (payload: any) => {
          // Fetch just the inserted row instead of refetching the entire
          // conversation's message list on every INSERT.
          const { data, error } = await this.client
            .from('messages')
            .select(MESSAGE_SELECT)
            .eq('id', payload.new.id)
            .single();
          if (!error && data) callback(mapMessageRow(data));
        }
      )
      .subscribe();
    return () => {
      this.client.removeChannel(channel);
    };
  }

  subscribeToConversationActivity(userId: string, callback: (message: Message) => void): () => void {
    // No conversation filter: Realtime applies RLS, so only rows from the user's conversations arrive.
    const channel = this.client
      .channel(`activity:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload: any) => {
        const { data, error } = await this.client
          .from('messages')
          .select(MESSAGE_SELECT)
          .eq('id', payload.new.id)
          .single();
        if (!error && data) callback(mapMessageRow(data));
      })
      .subscribe();
    return () => {
      this.client.removeChannel(channel);
    };
  }

  subscribeToConnectionState(callback: (state: ConnectionState) => void): () => void {
    const realtime: any = (this.client as any).realtime;
    const degraded = () =>
      callback(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'reconnecting');
    try {
      realtime?.onOpen?.(() => callback('online'));
      realtime?.onClose?.(degraded);
      realtime?.onError?.(degraded);
    } catch (err) {
      console.warn('Realtime state hooks unavailable:', err);
    }
    callback('online');
    // realtime-js keeps these hooks for the life of the singleton client; nothing to detach.
    return () => {};
  }

  // --- BRANDING ---
  async getBranding(): Promise<BrandingConfig> {
    const { data, error } = await this.client.from('branding_config').select('*').eq('id', 1).single();
    if (error) throw new Error(`getBranding failed: ${error.message}`);
    return mapBrandingRow(data);
  }

  async updateBranding(config: Partial<BrandingConfig>): Promise<BrandingConfig> {
    const { data, error } = await this.client
      .from('branding_config')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single();
    if (error) throw new Error(`updateBranding failed: ${error.message}`);
    const branding = mapBrandingRow(data);

    this.client.channel('branding-updates').send({
      type: 'broadcast',
      event: 'branding_changed',
      payload: branding,
    });

    await this.selfLogAudit('ADMIN_CHANGED_BRANDING', 'BRANDING', '1', config);

    return branding;
  }

  subscribeToBranding(callback: (branding: BrandingConfig) => void): () => void {
    const channel = this.client
      .channel('branding-updates')
      .on('broadcast', { event: 'branding_changed' }, (payload: any) => callback(payload.payload))
      .subscribe();
    return () => {
      this.client.removeChannel(channel);
    };
  }

  // --- AUDIT LOGS ---
  async getAuditLogs(): Promise<AuditLog[]> {
    const { data, error } = await this.client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`getAuditLogs failed: ${error.message}`);
    return (data ?? []).map(mapAuditRow);
  }

  async logAudit(data: {
    user_id: string;
    user_email: string;
    action: string;
    target_type: string;
    target_id?: string;
    metadata?: Record<string, any>;
  }): Promise<AuditLog> {
    let ip = '127.0.0.1';
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/audit-ip');
        const body = await res.json();
        ip = body.ip;
      } catch {
        // Best-effort — an unreachable IP endpoint shouldn't block the audited action.
      }
    }

    const { data: row, error } = await this.client.rpc('insert_audit_log', {
      p_user_id: data.user_id,
      p_user_email: data.user_email,
      p_action: data.action,
      p_target_type: data.target_type,
      p_target_id: data.target_id ?? null,
      p_metadata: data.metadata ?? {},
      p_ip: ip,
    });
    if (error) throw new Error(`logAudit failed: ${error.message}`);
    return mapAuditRow(row);
  }

  // --- TELEGRAM ---
  async createTelegramLink(): Promise<TelegramLink> {
    const accessToken = await this.currentTelegramAccessToken();
    try {
      const response = await fetch('/api/telegram/account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error('link endpoint rejected the request');
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== 'object' ||
        typeof (data as { deepLink?: unknown }).deepLink !== 'string' ||
        typeof (data as { expiresAt?: unknown }).expiresAt !== 'string'
      ) {
        throw new Error('link endpoint returned an invalid response');
      }
      return {
        deepLink: (data as { deepLink: string }).deepLink,
        expiresAt: (data as { expiresAt: string }).expiresAt,
      };
    } catch {
      throw new Error('createTelegramLink failed');
    }
  }

  private async currentTelegramAccessToken(): Promise<string> {
    const { data, error } = await this.client.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) throw new Error('Telegram authentication required');
    return accessToken;
  }

  private async currentTelegramProfileId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user?.id) throw new Error('Telegram authentication required');
    return data.user.id;
  }

  async getTelegramIdentity(): Promise<TelegramIdentity | null> {
    const profileId = await this.currentTelegramProfileId();
    const { data, error } = await this.client
      .from('telegram_identities')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) throw new Error(`getTelegramIdentity failed: ${error.message}`);
    return (data as TelegramIdentity | null) ?? null;
  }

  async disconnectTelegram(): Promise<boolean> {
    const accessToken = await this.currentTelegramAccessToken();
    const response = await fetch('/api/telegram/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('disconnectTelegram failed');
    return true;
  }

  async getTelegramRelayLogs(limit = 50): Promise<TelegramRelayLog[]> {
    const profileId = await this.currentTelegramProfileId();
    const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const { data, error } = await this.client
      .from('telegram_relay_log')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(boundedLimit);
    if (error) throw new Error(`getTelegramRelayLogs failed: ${error.message}`);
    return (data ?? []) as TelegramRelayLog[];
  }

  async getUserSettings(): Promise<UserSettings> {
    const profileId = await this.currentTelegramProfileId();
    const { data, error } = await this.client
      .from('user_settings')
      .select('*')
      .eq('user_id', profileId)
      .maybeSingle();
    if (error) throw new Error(`getUserSettings failed: ${error.message}`);

    const now = new Date().toISOString();
    return {
      user_id: profileId,
      notifications: data?.notifications ?? true,
      mentions_only: data?.mentions_only ?? false,
      theme: data?.theme ?? 'dark',
      language: data?.language ?? 'ru',
      telegram_enabled: data?.telegram_enabled ?? false,
      created_at: data?.created_at ?? now,
      updated_at: data?.updated_at ?? now,
    };
  }

  async updateUserSettings(
    updates: Partial<Pick<UserSettings, 'notifications' | 'mentions_only' | 'theme' | 'language' | 'telegram_enabled'>>,
  ): Promise<UserSettings> {
    const profileId = await this.currentTelegramProfileId();
    const current = await this.getUserSettings();
    const { data, error } = await this.client
      .from('user_settings')
      .upsert(
        {
          user_id: profileId,
          notifications: current.notifications,
          mentions_only: current.mentions_only,
          theme: current.theme,
          language: current.language,
          telegram_enabled: current.telegram_enabled,
          ...updates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();
    if (error) throw new Error(`updateUserSettings failed: ${error.message}`);

    return data as UserSettings;
  }

}
