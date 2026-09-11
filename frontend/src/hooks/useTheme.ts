'use client';

import { useContext } from 'react';

import { ThemeContext } from '@/lib/theme-context';
import type { Theme } from '@/lib/theme-script';

export interface UseThemeReturn {
  theme: Theme;
  isDark: boolean;
  isLight: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export function useTheme(): UseThemeReturn {
  const context = useContext(ThemeContext);
  return {
    ...context,
    isDark: context.theme === 'dark',
    isLight: context.theme === 'light',
  };
}
