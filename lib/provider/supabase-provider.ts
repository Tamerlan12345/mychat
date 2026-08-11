import { getSupabaseClient } from './supabase-client';
import { User, Department, Conversation, Message, MessageReaction, Attachment } from '@/types';

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

const MESSAGE_SELECT = '*, profiles(first_name, last_name, avatar_url), message_reactions(*, profiles(first_name, last_name)), attachments(*)';

export class SupabaseDataProvider {
  private get client() {
    return getSupabaseClient();
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
    return mapProfileRow(data);
  }

  async deleteUser(id: string): Promise<boolean> {
    const { error } = await this.client.from('profiles').delete().eq('id', id);
    if (error) throw new Error(`deleteUser failed: ${error.message}`);
    return true;
  }

  async setUserStatus(id: string, status: User['status']): Promise<User> {
    return this.updateUser(id, { status });
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

    const memberIds = Array.from(new Set([...data.member_ids, data.created_by]));
    const { error: memberError } = await this.client
      .from('conversation_members')
      .insert(memberIds.map(userId => ({ conversation_id: convRow.id, user_id: userId })));
    if (memberError) throw new Error(`createConversation (members) failed: ${memberError.message}`);

    return mapConversationRow(convRow);
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
  async getMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`getMessages failed: ${error.message}`);
    return (data ?? []).map(mapMessageRow);
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
      await this.client.from('attachments').insert(
        data.attachments.map(att => ({
          message_id: row.id,
          file_name: att.file_name,
          file_path: att.file_path,
          mime_type: att.mime_type,
          size: att.size,
        }))
      );
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
          const full = await this.getMessages(conversationId);
          const inserted = full.find(m => m.id === payload.new.id);
          if (inserted) callback(inserted);
        }
      )
      .subscribe();
    return () => {
      this.client.removeChannel(channel);
    };
  }
}
