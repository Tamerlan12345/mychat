/**
 * Centras Corporate Chat — Notification Service
 * Synthesizes harmonious audio chimes via Web Audio API (100% offline, zero asset dependencies)
 * Dispatches native OS notifications in Electron and HTML5 notifications in web browsers.
 */

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private notificationsEnabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedSound = localStorage.getItem('centras_sound_enabled');
        if (savedSound !== null) {
          this.soundEnabled = savedSound === 'true';
        }
        const savedNotif = localStorage.getItem('centras_notifications_enabled');
        if (savedNotif !== null) {
          this.notificationsEnabled = savedNotif === 'true';
        }
      } catch {}
    }
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('centras_sound_enabled', enabled ? 'true' : 'false');
      } catch {}
    }
  }

  public isNotificationsEnabled(): boolean {
    return this.notificationsEnabled;
  }

  public setNotificationsEnabled(enabled: boolean): void {
    this.notificationsEnabled = enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('centras_notifications_enabled', enabled ? 'true' : 'false');
      } catch {}
    }
  }

  /**
   * Harmonious, gentle two-tone corporate chime synthesized via Web Audio API
   */
  public playChime(): void {
    if (!this.soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      // Note 1: E5 (659.25 Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: A5 (880 Hz)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.08);
      gain2.gain.setValueAtTime(0.22, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.45);
    } catch (err) {
      console.warn('Notification audio playback failed:', err);
    }
  }

  /**
   * Request system desktop notification permissions
   */
  public async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        return true;
      }
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
    }
    return false;
  }

  /**
   * Dispatch notification and audio alert on new message
   */
  public async notifyNewMessage(senderName: string, text: string, conversationName?: string): Promise<void> {
    if (typeof window === 'undefined') return;

    // Trigger audio chime
    if (this.soundEnabled) {
      this.playChime();
    }

    if (!this.notificationsEnabled) return;

    const title = conversationName ? `${senderName} • ${conversationName}` : senderName;
    const body = text.length > 120 ? text.slice(0, 117) + '...' : text;

    // Electron desktop notification
    if (window.desktopBridge?.showNotification) {
      try {
        await window.desktopBridge.showNotification({ title, body, silent: true });
        return;
      } catch {}
    }

    // HTML5 browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          silent: true,
        });
      } catch {}
    }
  }
}

export const notificationService = new NotificationService();
