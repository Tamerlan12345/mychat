import { getDataProvider } from '@/lib/provider';
import type { TelegramIdentity, TelegramRelayLog, UserSettings } from '@/types';
import type { TelegramLink } from '@/lib/provider/data-provider';

export class TelegramService {
  static async createLink(): Promise<TelegramLink> {
    return getDataProvider().createTelegramLink();
  }

  static async getAccount(): Promise<TelegramIdentity | null> {
    return getDataProvider().getTelegramIdentity();
  }

  static async disconnect(): Promise<boolean> {
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

}
