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
  'desktop:window-minimize',
  'desktop:window-maximize',
  'desktop:window-close',
  'desktop:window-is-maximized',
  'desktop:show-notification',
  'desktop:get-preferences',
  'desktop:set-preferences',
] as const;

// Main → renderer events the bridge is allowed to relay
const ALLOWED_EVENTS = ['desktop:window-state-changed'] as const;

type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];
type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

function validateChannel(channel: string): asserts channel is AllowedChannel {
  if (!(ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(`Unauthorized IPC channel invocation: ${channel}`);
  }
}

function validateEvent(channel: string): asserts channel is AllowedEvent {
  if (!(ALLOWED_EVENTS as readonly string[]).includes(channel)) {
    throw new Error(`Unauthorized IPC event subscription: ${channel}`);
  }
}

export interface DesktopPreferences {
  launchAtLogin: boolean;
  closeToTray: boolean;
  zoomFactor: number;
  trayHintShown: boolean;
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
    isPackaged: boolean;
    hasNativeWindowControls: boolean;
  }>;
  setBadgeCount: (count: number) => Promise<boolean>;
  pingServer: (url: string) => Promise<{ ok: boolean; status?: number; error?: string }>;
  minimizeWindow: () => Promise<boolean>;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<boolean>;
  isWindowMaximized: () => Promise<boolean>;
  showNotification: (options: { title: string; body: string; silent?: boolean }) => Promise<boolean>;
  getPreferences: () => Promise<DesktopPreferences>;
  setPreferences: (update: Partial<DesktopPreferences>) => Promise<DesktopPreferences>;
  onWindowStateChanged: (callback: (state: { isMaximized: boolean }) => void) => () => void;
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

  minimizeWindow: async (): Promise<boolean> => {
    validateChannel('desktop:window-minimize');
    return ipcRenderer.invoke('desktop:window-minimize');
  },

  maximizeWindow: async (): Promise<boolean> => {
    validateChannel('desktop:window-maximize');
    return ipcRenderer.invoke('desktop:window-maximize');
  },

  closeWindow: async (): Promise<boolean> => {
    validateChannel('desktop:window-close');
    return ipcRenderer.invoke('desktop:window-close');
  },

  isWindowMaximized: async (): Promise<boolean> => {
    validateChannel('desktop:window-is-maximized');
    return ipcRenderer.invoke('desktop:window-is-maximized');
  },

  showNotification: async (options: { title: string; body: string; silent?: boolean }): Promise<boolean> => {
    if (!options || typeof options.title !== 'string') {
      throw new Error('Notification options must have a title string');
    }
    validateChannel('desktop:show-notification');
    return ipcRenderer.invoke('desktop:show-notification', options);
  },

  getPreferences: async (): Promise<DesktopPreferences> => {
    validateChannel('desktop:get-preferences');
    return ipcRenderer.invoke('desktop:get-preferences');
  },

  setPreferences: async (update: Partial<DesktopPreferences>): Promise<DesktopPreferences> => {
    if (typeof update !== 'object' || update === null) {
      throw new Error('Preferences update must be an object');
    }
    validateChannel('desktop:set-preferences');
    return ipcRenderer.invoke('desktop:set-preferences', update);
  },

  onWindowStateChanged: (callback: (state: { isMaximized: boolean }) => void): (() => void) => {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    const channel = 'desktop:window-state-changed';
    validateEvent(channel);
    const listener = (_event: unknown, state: { isMaximized: boolean }) => {
      callback({ isMaximized: Boolean(state?.isMaximized) });
    };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('desktopBridge', desktopBridge);
