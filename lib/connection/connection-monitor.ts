import { getDataProvider } from '@/lib/provider';
import type { ConnectionState } from '@/lib/provider/data-provider';

type Listener = (state: ConnectionState) => void;

/**
 * Single source of truth for "are we connected": combines the browser's network status with
 * the data provider's realtime socket state. UI (titlebar badge, banner, composer queue)
 * subscribes here instead of each piece guessing on its own.
 */
class ConnectionMonitor {
  private state: ConnectionState = 'online';
  private listeners = new Set<Listener>();
  private started = false;
  private providerUnsubscribe: (() => void) | null = null;

  get current(): ConnectionState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(next: ConnectionState): void {
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach(l => l(next));
  }

  private start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    if (!navigator.onLine) this.set('offline');

    window.addEventListener('offline', () => this.set('offline'));
    window.addEventListener('online', () => {
      // The browser sees a network again; show "reconnecting" briefly, then assume online unless
      // the provider's socket reports otherwise (a real transport emits its own open/close events).
      this.set('reconnecting');
      if (this.confirmTimer) window.clearTimeout(this.confirmTimer);
      this.confirmTimer = window.setTimeout(() => {
        if (this.state === 'reconnecting') this.set('online');
      }, 1500);
    });

    try {
      this.providerUnsubscribe = getDataProvider().subscribeToConnectionState(state => {
        if (state === 'online' && !navigator.onLine) return;
        this.set(state);
      });
    } catch (err) {
      console.warn('Connection state subscription unavailable:', err);
    }
  }

  private confirmTimer: number | undefined;

  stop(): void {
    this.providerUnsubscribe?.();
    this.providerUnsubscribe = null;
    if (this.confirmTimer) window.clearTimeout(this.confirmTimer);
    this.started = false;
  }
}

export const connectionMonitor = new ConnectionMonitor();
export type { ConnectionState };
