"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export const THEME_COLORS = [
  { id: 'light', hex: '#F4F1EA', label: 'Light', dark: false },
  { id: 'dark', hex: '#101715', label: 'Dark', dark: true },
] as const;

export type ThemeColorId = typeof THEME_COLORS[number]['id'];

const STORAGE_KEY = 'crm_theme_color';

const PALETTES: Record<ThemeColorId, Record<string, string>> = {
  light: {
    '--mn-bg': '#F3EFE8',
    '--mn-surface': '#F7F3ED',
    '--mn-card': 'rgba(255, 252, 247, 0.9)',
    '--mn-card-hover': '#FFFFFF',
    '--mn-h1': '#17332D',
    '--mn-h2': '#275F53',
    '--mn-h3': '#60746D',
    '--mn-text': '#1A2723',
    '--mn-text-muted': '#72817B',
    '--mn-border': 'rgba(24, 53, 47, 0.11)',
    '--mn-border-subtle': 'rgba(24, 53, 47, 0.05)',
    '--mn-success': '#159A73',
    '--mn-warning': '#D78A16',
    '--mn-danger': '#D95757',
    '--mn-info': '#3A78B8',
    '--mn-sidebar-bg': 'rgba(246, 242, 234, 0.92)',
    '--mn-sidebar-active': '#245D51',
    '--mn-lane-panel': 'rgba(250, 247, 241, 0.86)',
    '--mn-input-bg': 'rgba(255, 255, 255, 0.9)',
    '--mn-input-border': 'rgba(24, 53, 47, 0.12)',
    '--mn-input-focus': '#2C7C68',
    '--mn-overlay': 'rgba(17, 28, 24, 0.3)',
    '--mn-accent': '#BE8D48',
    '--mn-lane-divider': 'rgba(24, 53, 47, 0.08)',
    '--mn-ring': 'rgba(44, 124, 104, 0.18)',
    '--mn-shadow': '0 26px 70px rgba(16, 31, 27, 0.1)',
    '--mn-shadow-soft': '0 12px 28px rgba(16, 31, 27, 0.06)',
    '--mn-radius-card': '24px',
  },
  dark: {
    '--mn-bg': '#0D1312',
    '--mn-surface': '#121A18',
    '--mn-card': 'rgba(20, 29, 27, 0.92)',
    '--mn-card-hover': 'rgba(25, 37, 34, 0.96)',
    '--mn-h1': '#F4F7F5',
    '--mn-h2': '#9AD8CB',
    '--mn-h3': '#C5D1CC',
    '--mn-text': '#EEF4F1',
    '--mn-text-muted': '#98AAA4',
    '--mn-border': 'rgba(224, 232, 228, 0.11)',
    '--mn-border-subtle': 'rgba(224, 232, 228, 0.05)',
    '--mn-success': '#6ADEB2',
    '--mn-warning': '#E8B063',
    '--mn-danger': '#FF9696',
    '--mn-info': '#9DC7F7',
    '--mn-sidebar-bg': 'rgba(10, 16, 15, 0.96)',
    '--mn-sidebar-active': '#94D8C8',
    '--mn-lane-panel': 'rgba(14, 20, 19, 0.9)',
    '--mn-input-bg': 'rgba(11, 16, 15, 0.8)',
    '--mn-input-border': 'rgba(220, 229, 225, 0.12)',
    '--mn-input-focus': '#94D8C8',
    '--mn-overlay': 'rgba(6, 11, 10, 0.68)',
    '--mn-accent': '#D8A560',
    '--mn-lane-divider': 'rgba(220, 229, 225, 0.08)',
    '--mn-ring': 'rgba(148, 216, 200, 0.22)',
    '--mn-shadow': '0 28px 72px rgba(0, 0, 0, 0.28)',
    '--mn-shadow-soft': '0 12px 28px rgba(0, 0, 0, 0.22)',
    '--mn-radius-card': '24px',
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

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeColorId | null;
    if (stored && THEME_COLORS.some(color => color.id === stored)) {
      setActiveColor(stored);
      applyPalette(stored);
      return;
    }
    applyPalette('light');
  }, []);

  const setColor = useCallback((id: ThemeColorId) => {
    setActiveColor(id);
    localStorage.setItem(STORAGE_KEY, id);
    applyPalette(id);
  }, []);

  const isDark = THEME_COLORS.find(color => color.id === activeColor)?.dark ?? false;

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
