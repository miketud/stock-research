'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ThemeContext } from '@/lib/theme-context';
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme-script';

/**
 * Read-only on mount, by design.
 *
 * The inline script in layout.tsx has already resolved the theme before first
 * paint. If this provider also applied a theme in an effect, it would race the
 * script and reintroduce the flash the script exists to prevent. So on mount it
 * only READS what the script decided; it writes only on explicit user action.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const resolved = document.documentElement.getAttribute('data-theme');
    setThemeState(resolved === 'light' ? 'light' : 'dark');
  }, []);

  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;

    root.classList.add('no-transitions');
    root.setAttribute('data-theme', next);
    root.classList.toggle('dark', next === 'dark');

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing — the theme just won't persist.
    }

    setThemeState(next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('no-transitions'));
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      setTheme(next);
      return next;
    });
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>
  );
}
