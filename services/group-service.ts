import { getDataProvider } from '@/lib/provider';
import { Conversation } from '@/types';

export class GroupService {
  static async createGroupOrChannel(data: {
    type: 'GROUP' | 'CHANNEL';
    name: string;
    description?: string;
    created_by: string;
    is_private?: boolean;
    member_ids: string[];
  }): Promise<Conversation> {
    return getDataProvider().createConversation(data);
  }

  static async addMembers(conversationId: string, userIds: string[]): Promise<boolean> {
    return getDataProvider().addMembers(conversationId, userIds);
  }

  static async removeMember(conversationId: string, userId: string): Promise<boolean> {
    return getDataProvider().removeMember(conversationId, userId);
  }
}
