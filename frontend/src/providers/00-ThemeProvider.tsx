'use client';

// class:base — but it lives in providers/ under exactly the same mechanism any
// injection would use. No special case: if the barrel breaks, the base breaks
// first, which is what keeps the extension point honest.
//
// The filename carries the component name because the barrel imports a DEFAULT
// export — the filename is this file's only identity, in the generated
// identifier and in a stack trace. The 00- prefix is the nesting order, nothing
// more; the context itself lives in lib/theme-context.ts so that nothing has to
// import through that number.

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

    // Suppress the palette cross-fade for the duration of the swap itself,
    // otherwise every element on the page animates at once and the toggle feels
    // like lag. Two rAFs: one to let the class-swap paint, one to re-enable.
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
