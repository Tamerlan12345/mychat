import { globalDataProvider } from '@/lib/provider/mock-provider';
import { Conversation, Message, MessageReaction, Attachment } from '@/types';

export class ChatService {
  static async getConversations(userId: string): Promise<Conversation[]> {
    return globalDataProvider.getConversations(userId);
  }

  static async getConversationById(id: string): Promise<Conversation | null> {
    return globalDataProvider.getConversationById(id);
  }

  static async getMessages(conversationId: string): Promise<Message[]> {
    return globalDataProvider.getMessages(conversationId);
  }

  static async sendMessage(data: {
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type?: 'TEXT' | 'FILE' | 'IMAGE';
    reply_to?: string;
    attachments?: Partial<Attachment>[];
  }): Promise<Message> {
    return globalDataProvider.sendMessage(data);
  }

  static async editMessage(messageId: string, content: string): Promise<Message> {
    return globalDataProvider.editMessage(messageId, content);
  }

  static async deleteMessage(messageId: string): Promise<boolean> {
    return globalDataProvider.deleteMessage(messageId);
  }

  static async addReaction(messageId: string, userId: string, reaction: string): Promise<MessageReaction> {
    return globalDataProvider.addReaction(messageId, userId, reaction);
  }

  static async removeReaction(messageId: string, userId: string, reaction: string): Promise<boolean> {
    return globalDataProvider.removeReaction(messageId, userId, reaction);
  }

  static async markAsRead(conversationId: string, userId: string, messageId: string): Promise<boolean> {
    return globalDataProvider.markConversationAsRead(conversationId, userId, messageId);
  }

  static subscribeToMessages(conversationId: string, callback: (message: Message) => void): () => void {
    return globalDataProvider.subscribeToMessages(conversationId, callback);
  }
}
