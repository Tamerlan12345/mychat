export interface PlatformInfo {
  platform: string;
  arch: string;
  version: string;
  isElectron: boolean;
  /** False for dev-time electron.exe runs; login-item registration is only meaningful when true. */
  isPackaged?: boolean;
  /** True when the OS draws the caption buttons (Windows titleBarOverlay); the titlebar then only reserves space. */
  hasNativeWindowControls?: boolean;
}

export interface PingServerResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface DesktopPreferences {
  launchAtLogin: boolean;
  closeToTray: boolean;
  zoomFactor: number;
  trayHintShown: boolean;
}

export interface DesktopBridge {
  isDesktop: boolean;
  isEncryptionAvailable?: () => Promise<boolean>;
  encryptAndSaveSecret: (key: string, value: string) => Promise<boolean>;
  getAndDecryptSecret: (key: string) => Promise<string | null>;
  removeSecret: (key: string) => Promise<boolean>;
  getPlatform?: () => Promise<string>;
  getPlatformInfo?: () => Promise<PlatformInfo>;
  pingServer: (url: string) => Promise<PingServerResult>;
  setNotificationBadge?: (count: number) => Promise<void | boolean>;
  setBadgeCount?: (count: number) => Promise<boolean>;
  minimizeWindow?: () => Promise<boolean>;
  maximizeWindow?: () => Promise<boolean>;
  closeWindow?: () => Promise<boolean>;
  isWindowMaximized?: () => Promise<boolean>;
  showNotification?: (options: { title: string; body: string; silent?: boolean }) => Promise<boolean>;
  getPreferences?: () => Promise<DesktopPreferences>;
  setPreferences?: (update: Partial<DesktopPreferences>) => Promise<DesktopPreferences>;
  onWindowStateChanged?: (callback: (state: { isMaximized: boolean }) => void) => () => void;
}

export interface ISecureStorage {
  readonly isDesktop: boolean;
  setItem(key: string, value: string): Promise<boolean>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export interface ServerConnectionConfig {
  serverUrl: string;
  anonKey: string;
  isCustom: boolean;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
