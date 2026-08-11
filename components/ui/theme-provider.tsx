'use client';

import React, { useEffect, useState } from 'react';
import { BrandingService } from '@/services/branding-service';
import { BrandingConfig } from '@/types';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<BrandingConfig | null>(null);

  useEffect(() => {
    // Initial fetch
    BrandingService.getBranding()
      .then(config => {
        setBranding(config);
        BrandingService.applyBrandingToDOM(config);
      })
      .catch(err => {
        // Best-effort — a transient network error or RLS hiccup shouldn't leave the
        // app permanently unbranded for the rest of the session (this effect only
        // runs on mount, so an unhandled failure here would never retry).
        console.error('Failed to load branding config:', err);
      });

    // Subscribe to live branding updates
    const unsubscribe = BrandingService.subscribeToBranding(updatedConfig => {
      setBranding(updatedConfig);
      BrandingService.applyBrandingToDOM(updatedConfig);
    });

    return () => unsubscribe();
  }, []);

  return <>{children}</>;
};
