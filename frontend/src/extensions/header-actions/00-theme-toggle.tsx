'use client';

// Replaced by the ui_ux injection.
//
// Two circles of equal radius. Concentric, the front one hides the back one
// entirely and reads as a sun. Slid right by one radius, it leaves a crescent
// of the back one showing — a moon. One number moves; the shape does the rest.
//
// The colors are custom properties rather than literals, so the control follows
// the theme like everything else. Ported from a reference implementation that
// used inline styles and hardcoded hex; both are why it could not theme.

import { motion, useReducedMotion } from 'motion/react';

import { useTheme } from '@/hooks/useTheme';

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const reduce = useReducedMotion();

  // Both circles are r=6. Offsetting by 5 — just under one radius — leaves a
  // crescent with enough weight to read at this size; a full-radius offset
  // thins it to a sliver, and much less stops looking like a moon at all.
  const sunCx = isDark ? 12 : 17;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
      data-ui-toggle
      className="-mr-1.5 inline-flex h-10 w-10 items-center justify-center transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-primary"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
        {/* Back: the moon body. Never moves. */}
        <circle cx="12" cy="12" r="6" fill="var(--ui-toggle-moon)" />

        {/* Front: the sun in dark mode. In light mode it takes the button's own
            background color, so it stops being a disc and becomes the bite out
            of the moon. */}
        <motion.circle
          cy="12"
          r="6"
          fill={isDark ? 'var(--ui-toggle-sun)' : 'var(--ui-toggle-cut)'}
          initial={false}
          animate={{ cx: sunCx }}
          transition={
            reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
          }
        />
      </svg>
    </button>
  );
}
