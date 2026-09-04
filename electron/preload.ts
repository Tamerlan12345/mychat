import { contextBridge, ipcRenderer } from 'electron';

// Explicit whitelist of permitted IPC channels
const ALLOWED_CHANNELS = [
  'safe-storage:is-available',
  'desktop:save-secret',
  'desktop:get-secret',
  'desktop:remove-secret',
  'safe-storage:encrypt',
  'safe-storage:decrypt',
  'desktop:get-platform-info',
  'desktop:set-badge-count',
  'desktop:ping-server',
] as const;

type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];

function validateChannel(channel: string): asserts channel is AllowedChannel {
  if (!(ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(`Unauthorized IPC channel invocation: ${channel}`);
  }
}

export interface DesktopBridge {
  isDesktop: boolean;
  isEncryptionAvailable: () => Promise<boolean>;
  encryptAndSaveSecret: (key: string, value: string) => Promise<boolean>;
  getAndDecryptSecret: (key: string) => Promise<string | null>;
  removeSecret: (key: string) => Promise<boolean>;
  getPlatformInfo: () => Promise<{
    platform: string;
    arch: string;
    version: string;
    isElectron: boolean;
  }>;
  setBadgeCount: (count: number) => Promise<boolean>;
  pingServer: (url: string) => Promise<{ ok: boolean; status?: number; error?: string }>;
}

const desktopBridge: DesktopBridge = {
  isDesktop: true,

  isEncryptionAvailable: async (): Promise<boolean> => {
    validateChannel('safe-storage:is-available');
    return ipcRenderer.invoke('safe-storage:is-available');
  },

  encryptAndSaveSecret: async (key: string, value: string): Promise<boolean> => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('Key and value must be strings');
    }
    validateChannel('desktop:save-secret');
    return ipcRenderer.invoke('desktop:save-secret', { key, value });
  },

  getAndDecryptSecret: async (key: string): Promise<string | null> => {
    if (typeof key !== 'string') {
      throw new Error('Key must be a string');
    }
    validateChannel('desktop:get-secret');
    return ipcRenderer.invoke('desktop:get-secret', { key });
  },

  removeSecret: async (key: string): Promise<boolean> => {
    if (typeof key !== 'string') {
      throw new Error('Key must be a string');
    }
    validateChannel('desktop:remove-secret');
    return ipcRenderer.invoke('desktop:remove-secret', { key });
  },

  getPlatformInfo: async () => {
    validateChannel('desktop:get-platform-info');
    return ipcRenderer.invoke('desktop:get-platform-info');
  },

  setBadgeCount: async (count: number): Promise<boolean> => {
    if (typeof count !== 'number') {
      throw new Error('Count must be a number');
    }
    validateChannel('desktop:set-badge-count');
    return ipcRenderer.invoke('desktop:set-badge-count', count);
  },

  pingServer: async (url: string): Promise<{ ok: boolean; status?: number; error?: string }> => {
    if (typeof url !== 'string') {
      throw new Error('URL must be a string');
    }
    validateChannel('desktop:ping-server');
    return ipcRenderer.invoke('desktop:ping-server', { url });
  },
};

contextBridge.exposeInMainWorld('desktopBridge', desktopBridge);
