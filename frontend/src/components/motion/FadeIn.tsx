'use client';

// class:injection — owned entirely by ui_ux.
//
// Deliberately thin: it exists so pages do not each hand-roll an entrance, and
// so the reduced-motion decision is made in exactly one place.

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export interface FadeInProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}

export function FadeIn({ children, delay = 0, y = 8, className }: FadeInProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={{ duration: 0.45, delay, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
