'use client';

// class:injection — owned entirely by ui_ux.
//
// Children animate on a shared timeline rather than each starting its own, so a
// list reads as one gesture instead of n unrelated ones.

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export interface StaggerGroupProps {
  children: ReactNode;
  stagger?: number;
  className?: string;
}

export function StaggerGroup({ children, stagger = 0.06, className }: StaggerGroupProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-64px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: reduce ? 0 : stagger } },
      }}
    >
      {children}
    </motion.div>
  );
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const } },
};

/**
 * A child of StaggerGroup.
 *
 * This is a component, not a variants object, on purpose: motion.div is created
 * by a client-only factory, so a Server Component cannot construct one. Pages
 * stay server-rendered and reach for <StaggerItem> instead.
 */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
