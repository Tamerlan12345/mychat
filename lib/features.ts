/**
 * Feature switches. Everything optional is off by default so the product stays lean;
 * a deployment turns a capability on explicitly (env at build time, later via /bootstrap).
 */
export const features = {
  /** Telegram relay UI (rail entry, settings toggle, admin tab). Server side stays available. */
  telegram: process.env.NEXT_PUBLIC_FEATURE_TELEGRAM === 'true',
  /** Admin «Интеграции» tab — only meaningful when a gateway is configured. */
  integrations: Boolean(process.env.NEXT_PUBLIC_SERVER_URL?.trim()),
};
