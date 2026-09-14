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
      // Last cell of the nav's key strip: same height and hairline border, no
      // raised-button treatment. Background stays bg-surface on hover — the
      // crescent is cut with the button's own background color, so a hover
      // fill would break the moon.
      className="inline-flex h-7 w-10 items-center justify-center border border-border bg-surface text-text transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
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
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
        />
      </svg>
    </button>
  );
}
