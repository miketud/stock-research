'use client';

// class:base — the theme context object, separated from the provider that fills
// it for the same reason lib/extensions.ts and lib/nav.ts exist.
//
// The provider lives at providers/NN-ThemeProvider.tsx, and that NN is
// positional metadata: it is the nesting order, and it is expected to change
// when an injection needs to wrap the tree further out. An import path is the
// wrong place to encode a position — `import … from '@/providers/00-theme'`
// makes renumbering a breaking change to a hand-written base file. Consumers
// import the context from here, which never moves.

import { createContext } from 'react';

import type { Theme } from '@/lib/theme-script';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// The default mirrors what layout.tsx ships from the server: dark, with no-op
// writers. A consumer rendered outside the provider reads a coherent value
// rather than undefined.
export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});
