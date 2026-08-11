import { getDataProvider } from '@/lib/provider';
import type { TelegramAccount, TelegramChat, TelegramIdentity, TelegramMessage, TelegramRelayLog, UserSettings } from '@/types';
import type { TelegramLink } from '@/lib/provider/data-provider';

export class TelegramService {
  static async createLink(): Promise<TelegramLink> {
    return getDataProvider().createTelegramLink();
  }

  static async getAccount(): Promise<TelegramIdentity | null> {
    return getDataProvider().getTelegramIdentity();
  }

  static async disconnect(_userId?: string): Promise<boolean> {
    return getDataProvider().disconnectTelegram();
  }

  static async getRelayLogs(limit?: number): Promise<TelegramRelayLog[]> {
    return getDataProvider().getTelegramRelayLogs(limit);
  }

  static async getUserSettings(): Promise<UserSettings> {
    return getDataProvider().getUserSettings();
  }

  static async updateUserSettings(
    updates: Partial<Pick<UserSettings, 'notifications' | 'mentions_only' | 'theme' | 'language' | 'telegram_enabled'>>,
  ): Promise<UserSettings> {
    return getDataProvider().updateUserSettings(updates);
  }

  // Compatibility shims keep the old, out-of-scope screen compiling without
  // forwarding profile IDs or exposing the former Telegram inbox operations.
  static async getAccountStatus(_userId?: string): Promise<TelegramAccount> {
    const identity = await this.getAccount();
    return identity
      ? {
          user_id: identity.profile_id,
          connected: identity.status === 'active',
          telegram_user_id: String(identity.telegram_user_id),
          username: identity.username ?? undefined,
          session_encrypted: false,
          last_sync: identity.updated_at,
        }
      : {
          user_id: '',
          connected: false,
          session_encrypted: false,
          last_sync: new Date().toISOString(),
        };
  }

  static async connect(_userId: string, _phone: string): Promise<TelegramAccount> {
    throw new Error('Phone-based Telegram linking is no longer supported.');
  }

  static async getTelegramChats(_userId?: string): Promise<TelegramChat[]> {
    return [];
  }

  static async getTelegramMessages(_userId?: string, _chatId?: string): Promise<TelegramMessage[]> {
    return [];
  }

  static async sendMessage(_userId: string, _chatId: string, _content: string): Promise<TelegramMessage> {
    throw new Error('Telegram inbox messaging is no longer supported.');
  }
}
