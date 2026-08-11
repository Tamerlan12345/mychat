import { getDataProvider } from '@/lib/provider';
import { BrandingConfig } from '@/types';

export class BrandingService {
  static async getBranding(): Promise<BrandingConfig> {
    return getDataProvider().getBranding();
  }

  static async updateBranding(config: Partial<BrandingConfig>): Promise<BrandingConfig> {
    return getDataProvider().updateBranding(config);
  }

  static subscribeToBranding(callback: (branding: BrandingConfig) => void): () => void {
    return getDataProvider().subscribeToBranding(callback);
  }

  // Inject CSS root variables dynamically for instant White-Label styling
  static applyBrandingToDOM(config: BrandingConfig) {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    if (config.primary_color) {
      root.style.setProperty('--brand-primary', config.primary_color);
      root.style.setProperty('--brand-primary-hover', this.adjustColorBrightness(config.primary_color, -15));
    }
    if (config.secondary_color) {
      root.style.setProperty('--brand-secondary', config.secondary_color);
    }
    if (config.background_color) {
      root.style.setProperty('--brand-bg', config.background_color);
    }
    if (config.company_name) {
      document.title = `${config.company_name} — ${config.app_title || 'Messenger'}`;
    }
    if (config.favicon_url) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.head.appendChild(link);
      }
      link.href = config.favicon_url;
    }
  }

  private static adjustColorBrightness(hex: string, percent: number): string {
    let num = parseInt(hex.replace('#', ''), 16);
    if (isNaN(num)) return hex;
    let amt = Math.round(2.55 * percent);
    let R = (num >> 16) + amt;
    let G = (num >> 8 & 0x00FF) + amt;
    let B = (num & 0x0000FF) + amt;
    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
  }
}
