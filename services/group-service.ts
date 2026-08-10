import { globalDataProvider } from '@/lib/provider/mock-provider';
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
    return globalDataProvider.createConversation(data);
  }

  static async addMembers(conversationId: string, userIds: string[]): Promise<boolean> {
    return globalDataProvider.addMembers(conversationId, userIds);
  }

  static async removeMember(conversationId: string, userId: string): Promise<boolean> {
    return globalDataProvider.removeMember(conversationId, userId);
  }
}
