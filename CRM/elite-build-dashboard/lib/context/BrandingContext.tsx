"use client";
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/context/AuthContext';
import { useTheme } from '@/lib/context/ThemeContext';
import { contrastingTextColor } from '@/lib/utils/colorUtils';
import { CRMBranding, DEFAULT_BRANDING, normalizeBranding } from '@/lib/utils/branding';

export const BRANDING_UPDATED_EVENT = 'elite-build-branding-updated';

interface BrandingState {
  branding: CRMBranding;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingState | null>(null);

function applyBrandVariables(color: string) {
  const root = document.documentElement;
  root.style.setProperty('--mn-brand', color);
  root.style.setProperty('--mn-brand-contrast', contrastingTextColor(color));
  root.style.setProperty('--mn-brand-soft', `color-mix(in srgb, ${color} 16%, transparent)`);
  root.style.setProperty('--mn-brand-border', `color-mix(in srgb, ${color} 28%, transparent)`);
  root.style.setProperty('--mn-brand-gradient', `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 62%, var(--mn-accent)))`);
}

export function notifyBrandingUpdated() {
  window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT));
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { crmUser } = useAuth();
  const { activeColor } = useTheme();
  const [branding, setBranding] = useState<CRMBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    try {
      const response = await fetch('/api/branding', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Branding request failed with ${response.status}`);
      const payload = await response.json() as { branding?: unknown };
      setBranding(normalizeBranding(payload.branding));
    } catch (err) {
      console.error('Failed to refresh branding:', err);
      setBranding(DEFAULT_BRANDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  useEffect(() => {
    const refresh = () => {
      refreshBranding();
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, refresh);
  }, [refreshBranding]);

  useEffect(() => {
    if (!crmUser) return undefined;
    return onSnapshot(
      doc(db, 'crm_config', 'branding'),
      snapshot => {
        setBranding(normalizeBranding(snapshot.exists() ? snapshot.data() : null));
        setLoading(false);
      },
      err => {
        console.error('Failed to subscribe to branding:', err);
        refreshBranding();
      },
    );
  }, [crmUser, refreshBranding]);

  useEffect(() => {
    applyBrandVariables(branding.primaryColor);
  }, [branding.primaryColor, activeColor]);

  return (
    <BrandingContext.Provider value={{ branding, loading, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingState {
  const context = useContext(BrandingContext);
  if (!context) throw new Error('useBranding must be used inside BrandingProvider');
  return context;
}
