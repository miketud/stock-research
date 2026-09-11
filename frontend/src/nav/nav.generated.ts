// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not edit.
// Regenerate: pnpm gen:barrels   (also runs automatically on predev/prebuild)
// Source of truth: the sibling files in this directory.
// ─────────────────────────────────────────────────────────────────────────────

import type { NavEntry } from '@/lib/nav';

import N0_10_info_nav from './10-info.nav';

export type { NavEntry };

export const nav: NavEntry[] = [
  N0_10_info_nav,
].sort((a, b) => (a.order ?? 500) - (b.order ?? 500) || a.label.localeCompare(b.label));

export default nav;
