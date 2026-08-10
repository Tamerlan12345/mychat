'use client';

import React, { useEffect, useState } from 'react';
import { BrandingService } from '@/services/branding-service';
import { BrandingConfig } from '@/types';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<BrandingConfig | null>(null);

  useEffect(() => {
    // Initial fetch
    BrandingService.getBranding().then(config => {
      setBranding(config);
      BrandingService.applyBrandingToDOM(config);
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
