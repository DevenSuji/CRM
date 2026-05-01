"use client";
import { createContext, useContext, useEffect, useCallback, useSyncExternalStore, ReactNode } from 'react';

export const THEME_COLORS = [
  { id: 'light', hex: '#F4F4F2', label: 'Light', dark: false },
  { id: 'dark', hex: '#070809', label: 'Dark', dark: true },
] as const;

export type ThemeColorId = typeof THEME_COLORS[number]['id'];

const STORAGE_KEY = 'crm_theme_color';
const THEME_CHANGED_EVENT = 'crm_theme_color_changed';

const PALETTES: Record<ThemeColorId, Record<string, string>> = {
  light: {
    '--mn-bg': '#F4F5F3',
    '--mn-surface': '#FBFBFA',
    '--mn-card': 'rgba(255, 255, 255, 0.94)',
    '--mn-card-hover': 'rgba(255, 255, 255, 0.98)',
    '--mn-h1': '#101211',
    '--mn-h2': '#303634',
    '--mn-h3': '#4A514E',
    '--mn-text': '#171A18',
    '--mn-text-muted': '#4F5753',
    '--mn-border': 'rgba(45, 51, 48, 0.32)',
    '--mn-border-subtle': 'rgba(45, 51, 48, 0.16)',
    '--mn-success': '#2F6150',
    '--mn-warning': '#6C5740',
    '--mn-danger': '#7A3F3F',
    '--mn-danger-action': '#7A3F3F',
    '--mn-danger-contrast': '#FFFFFF',
    '--mn-info': '#3F596C',
    '--mn-sidebar-bg': 'rgba(248, 249, 247, 0.96)',
    '--mn-sidebar-active': '#202523',
    '--mn-lane-panel': 'rgba(251, 251, 250, 0.94)',
    '--mn-input-bg': 'rgba(255, 255, 255, 0.96)',
    '--mn-input-border': 'rgba(45, 51, 48, 0.34)',
    '--mn-input-focus': '#202523',
    '--mn-overlay': 'rgba(20, 21, 20, 0.34)',
    '--mn-accent': '#555F5A',
    '--mn-lane-divider': 'rgba(45, 51, 48, 0.18)',
    '--mn-ring': 'rgba(32, 37, 35, 0.28)',
    '--mn-shadow': '0 24px 70px rgba(35, 39, 37, 0.16)',
    '--mn-shadow-soft': '0 12px 30px rgba(35, 39, 37, 0.09)',
    '--mn-metal-sheen': 'rgba(255, 255, 255, 0.62)',
    '--mn-metal-grain': 'rgba(82, 86, 84, 0.12)',
    '--mn-metal-pit': 'rgba(108, 112, 110, 0.1)',
    '--mn-metal-ridge': 'rgba(255, 255, 255, 0.7)',
    '--mn-metal-overlay': 'rgba(255, 255, 255, 0.24)',
    '--mn-metal-contrast': 'rgba(76, 79, 77, 0.1)',
    '--mn-radius-card': '24px',
  },
  dark: {
    '--mn-bg': '#070809',
    '--mn-surface': '#101314',
    '--mn-card': 'rgba(16, 19, 20, 0.96)',
    '--mn-card-hover': 'rgba(25, 29, 30, 0.98)',
    '--mn-h1': '#FFFFFF',
    '--mn-h2': '#E8EEEC',
    '--mn-h3': '#CBD5D2',
    '--mn-text': '#F7FAF9',
    '--mn-text-muted': '#BAC5C2',
    '--mn-border': 'rgba(229, 239, 236, 0.28)',
    '--mn-border-subtle': 'rgba(229, 239, 236, 0.14)',
    '--mn-success': '#CBE7DD',
    '--mn-warning': '#E4D8C7',
    '--mn-danger': '#E6C7C7',
    '--mn-danger-action': '#8B4E4E',
    '--mn-danger-contrast': '#FFFFFF',
    '--mn-info': '#D2E0EA',
    '--mn-sidebar-bg': 'rgba(7, 8, 9, 0.96)',
    '--mn-sidebar-active': '#FFFFFF',
    '--mn-lane-panel': 'rgba(13, 16, 17, 0.96)',
    '--mn-input-bg': 'rgba(8, 10, 11, 0.94)',
    '--mn-input-border': 'rgba(229, 239, 236, 0.3)',
    '--mn-input-focus': '#FFFFFF',
    '--mn-overlay': 'rgba(1, 2, 3, 0.76)',
    '--mn-accent': '#D5DEDB',
    '--mn-lane-divider': 'rgba(229, 239, 236, 0.18)',
    '--mn-ring': 'rgba(246, 250, 249, 0.34)',
    '--mn-shadow': '0 30px 90px rgba(0, 0, 0, 0.62)',
    '--mn-shadow-soft': '0 14px 40px rgba(0, 0, 0, 0.44)',
    '--mn-metal-sheen': 'rgba(221, 234, 234, 0.08)',
    '--mn-metal-grain': 'rgba(215, 232, 232, 0.24)',
    '--mn-metal-pit': 'rgba(0, 0, 0, 0.42)',
    '--mn-metal-ridge': 'rgba(246, 253, 253, 0.18)',
    '--mn-metal-overlay': 'rgba(255, 255, 255, 0.025)',
    '--mn-metal-contrast': 'rgba(0, 0, 0, 0.5)',
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
  root.dataset.theme = colorId;
  root.classList.toggle('dark', colorId === 'dark');
}

function isThemeColorId(value: string | null): value is ThemeColorId {
  return THEME_COLORS.some(color => color.id === value);
}

function getStoredThemeColor(): ThemeColorId {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isThemeColorId(stored) ? stored : 'light';
}

function subscribeToThemeColor(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};

  const handleThemeChange = () => onStoreChange();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };

  window.addEventListener(THEME_CHANGED_EVENT, handleThemeChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(THEME_CHANGED_EVENT, handleThemeChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const activeColor = useSyncExternalStore(
    subscribeToThemeColor,
    getStoredThemeColor,
    () => 'light' as ThemeColorId,
  );

  useEffect(() => {
    applyPalette(activeColor);
  }, [activeColor]);

  const setColor = useCallback((id: ThemeColorId) => {
    window.localStorage.setItem(STORAGE_KEY, id);
    applyPalette(id);
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
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
