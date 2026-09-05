import { getDataProvider } from '@/lib/provider';
import type { ConnectionState, MessageQueryOptions } from '@/lib/provider/data-provider';
import { Conversation, Message, MessageReaction, Attachment, ConversationMember } from '@/types';

export class ChatService {
  static async getConversations(userId: string): Promise<Conversation[]> {
    return getDataProvider().getConversations(userId);
  }

  static async getConversationById(id: string): Promise<Conversation | null> {
    return getDataProvider().getConversationById(id);
  }

  static async getMessages(conversationId: string, options?: MessageQueryOptions): Promise<Message[]> {
    return getDataProvider().getMessages(conversationId, options);
  }

  static async sendMessage(data: {
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type?: 'TEXT' | 'FILE' | 'IMAGE';
    reply_to?: string;
    attachments?: Partial<Attachment>[];
  }): Promise<Message> {
    return getDataProvider().sendMessage(data);
  }

  static async editMessage(messageId: string, content: string): Promise<Message> {
    return getDataProvider().editMessage(messageId, content);
  }

  static async deleteMessage(messageId: string): Promise<boolean> {
    return getDataProvider().deleteMessage(messageId);
  }

  static async addReaction(messageId: string, userId: string, reaction: string): Promise<MessageReaction> {
    return getDataProvider().addReaction(messageId, userId, reaction);
  }

  static async removeReaction(messageId: string, userId: string, reaction: string): Promise<boolean> {
    return getDataProvider().removeReaction(messageId, userId, reaction);
  }

  static async getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    return getDataProvider().getConversationMembers(conversationId);
  }

  static async markAsRead(conversationId: string, userId: string, messageId: string): Promise<boolean> {
    return getDataProvider().markConversationAsRead(conversationId, userId, messageId);
  }

  static subscribeToMessages(conversationId: string, callback: (message: Message) => void): () => void {
    return getDataProvider().subscribeToMessages(conversationId, callback);
  }

  static subscribeToConversationActivity(userId: string, callback: (message: Message) => void): () => void {
    return getDataProvider().subscribeToConversationActivity(userId, callback);
  }

  static subscribeToConnectionState(callback: (state: ConnectionState) => void): () => void {
    return getDataProvider().subscribeToConnectionState(callback);
  }
}
