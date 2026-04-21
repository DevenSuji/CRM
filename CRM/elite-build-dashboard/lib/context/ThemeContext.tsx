"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

/** The 2 theme color options */
export const THEME_COLORS = [
  { id: 'light', hex: '#EEF7FF', label: 'Light', dark: false },
  { id: 'dark',  hex: '#000000', label: 'Dark',  dark: true },
] as const;

export type ThemeColorId = typeof THEME_COLORS[number]['id'];

const STORAGE_KEY = 'crm_theme_color';

/** CSS variable palettes keyed by color ID */
const PALETTES: Record<ThemeColorId, Record<string, string>> = {
  light: {
    '--mn-bg': '#EEF7FF',
    '--mn-surface': '#F5FAFF',
    '--mn-card': '#FFFFFF',
    '--mn-card-hover': '#E8F2FC',
    '--mn-h1': '#1E40AF',
    '--mn-h2': '#2563EB',
    '--mn-h3': '#334155',
    '--mn-text': '#1E293B',
    '--mn-text-muted': '#64748B',
    '--mn-border': '#C7D9EC',
    '--mn-border-subtle': '#DDE8F3',
    '--mn-success': '#10B981',
    '--mn-warning': '#F59E0B',
    '--mn-danger': '#EF4444',
    '--mn-info': '#3B82F6',
    '--mn-sidebar-bg': '#E2EFFA',
    '--mn-sidebar-active': '#2563EB',
    '--mn-input-bg': '#FFFFFF',
    '--mn-input-border': '#BDD0E5',
    '--mn-input-focus': '#2563EB',
    '--mn-overlay': 'rgba(15, 23, 42, 0.5)',
    '--mn-accent': '#3B82F6',
    '--mn-lane-divider': '#C7D9EC',
  },
  dark: {
    '--mn-bg': '#000000',
    '--mn-surface': '#111111',
    '--mn-card': '#1A1A1A',
    '--mn-card-hover': '#242424',
    '--mn-h1': '#60A5FA',
    '--mn-h2': '#60A5FA',
    '--mn-h3': '#CBD5E1',
    '--mn-text': '#F1F5F9',
    '--mn-text-muted': '#94A3B8',
    '--mn-border': '#2A2A2A',
    '--mn-border-subtle': '#1F1F1F',
    '--mn-success': '#34D399',
    '--mn-warning': '#FBBF24',
    '--mn-danger': '#F87171',
    '--mn-info': '#60A5FA',
    '--mn-sidebar-bg': '#0A0A0A',
    '--mn-sidebar-active': '#60A5FA',
    '--mn-input-bg': '#1A1A1A',
    '--mn-input-border': '#333333',
    '--mn-input-focus': '#60A5FA',
    '--mn-overlay': 'rgba(0, 0, 0, 0.8)',
    '--mn-accent': '#60A5FA',
    '--mn-lane-divider': '#2A2A2A',
  },
};

interface ThemeState {
  activeColor: ThemeColorId;
  setColor: (id: ThemeColorId) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeState | null>(null);

function applyPalette(colorId: ThemeColorId) {
  const palette = PALETTES[colorId];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeColor, setActiveColor] = useState<ThemeColorId>('light');

  // Standard hydration-from-localStorage pattern. Running on mount to read
  // the persisted theme and sync React state requires setState in the effect
  // body — that's the point. Alternatives (useSyncExternalStore) would be a
  // larger refactor without correctness benefit here.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeColorId | null;
    if (stored && THEME_COLORS.some(c => c.id === stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveColor(stored);
      applyPalette(stored);
    } else {
      applyPalette('light');
    }
  }, []);

  const setColor = useCallback((id: ThemeColorId) => {
    setActiveColor(id);
    localStorage.setItem(STORAGE_KEY, id);
    applyPalette(id);
  }, []);

  const isDark = THEME_COLORS.find(c => c.id === activeColor)?.dark ?? false;

  return (
    <ThemeContext.Provider value={{ activeColor, setColor, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
