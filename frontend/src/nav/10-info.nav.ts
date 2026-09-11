// class:base — nav entries are DATA, not JSX.
//
// One registry therefore feeds the site header, a sitemap, a command palette,
// and the conformance check that every href resolves to a real page.tsx. A JSX
// nav item could feed only the header.
//
// There is deliberately no "Home" entry: the wordmark in SiteHeader is the home
// link, and listing the same destination twice is noise.

import type { NavEntry } from '@/lib/nav';

const entry: NavEntry = {
  id: 'info',
  href: '/info',
  label: 'Info',
  order: 10,
};

export default entry;
