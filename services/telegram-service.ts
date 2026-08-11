import { getDataProvider } from '@/lib/provider';
import { TelegramAccount, TelegramChat, TelegramMessage } from '@/types';

export class TelegramService {
  static async getAccountStatus(userId: string): Promise<TelegramAccount> {
    return getDataProvider().getTelegramAccount(userId);
  }

  static async connect(userId: string, phone: string): Promise<TelegramAccount> {
    return getDataProvider().connectTelegram(userId, phone);
  }

  static async disconnect(userId: string): Promise<boolean> {
    return getDataProvider().disconnectTelegram(userId);
  }

  static async getTelegramChats(userId: string): Promise<TelegramChat[]> {
    return getDataProvider().getTelegramChats(userId);
  }

  static async getTelegramMessages(userId: string, chatId: string): Promise<TelegramMessage[]> {
    return getDataProvider().getTelegramMessages(userId, chatId);
  }

  static async sendMessage(userId: string, chatId: string, content: string): Promise<TelegramMessage> {
    return getDataProvider().sendTelegramMessage(userId, chatId, content);
  }
}
