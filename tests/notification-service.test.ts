import { describe, it, expect, beforeEach, vi } from 'vitest';
import { notificationService } from '../lib/notifications/notification-service';

describe('NotificationService', () => {
  beforeEach(() => {
    notificationService.setSoundEnabled(true);
    notificationService.setNotificationsEnabled(true);
  });

  it('toggles sound preferences correctly', () => {
    expect(notificationService.isSoundEnabled()).toBe(true);
    notificationService.setSoundEnabled(false);
    expect(notificationService.isSoundEnabled()).toBe(false);
    notificationService.setSoundEnabled(true);
    expect(notificationService.isSoundEnabled()).toBe(true);
  });

  it('toggles notification preferences correctly', () => {
    expect(notificationService.isNotificationsEnabled()).toBe(true);
    notificationService.setNotificationsEnabled(false);
    expect(notificationService.isNotificationsEnabled()).toBe(false);
    notificationService.setNotificationsEnabled(true);
    expect(notificationService.isNotificationsEnabled()).toBe(true);
  });

  it('safely invokes playChime without unhandled exceptions', () => {
    expect(() => {
      notificationService.playChime();
    }).not.toThrow();
  });

  it('handles notifyNewMessage safely in headless test environment', async () => {
    await expect(
      notificationService.notifyNewMessage('Иван Петров', 'Тестовое сообщение', 'Проектная группа')
    ).resolves.not.toThrow();
  });
});
