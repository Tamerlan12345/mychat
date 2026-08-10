import { globalDataProvider } from '@/lib/provider/mock-provider';
import { TelegramAccount, TelegramChat, TelegramMessage } from '@/types';

export class TelegramService {
  static async getAccountStatus(userId: string): Promise<TelegramAccount> {
    return globalDataProvider.getTelegramAccount(userId);
  }

  static async connect(userId: string, phone: string): Promise<TelegramAccount> {
    return globalDataProvider.connectTelegram(userId, phone);
  }

  static async disconnect(userId: string): Promise<boolean> {
    return globalDataProvider.disconnectTelegram(userId);
  }

  static async getTelegramChats(userId: string): Promise<TelegramChat[]> {
    return globalDataProvider.getTelegramChats(userId);
  }

  static async getTelegramMessages(userId: string, chatId: string): Promise<TelegramMessage[]> {
    return globalDataProvider.getTelegramMessages(userId, chatId);
  }

  static async sendMessage(userId: string, chatId: string, content: string): Promise<TelegramMessage> {
    return globalDataProvider.sendTelegramMessage(userId, chatId, content);
  }
}
