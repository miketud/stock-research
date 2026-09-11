'use client';

// class:base — folds the generated provider barrel.
//
// Adding a React context means dropping providers/NN-name.tsx into the
// directory. The NN prefix is the nesting order (lowest is outermost) and the
// barrel is regenerated on predev/prebuild. Nothing here ever changes.

import type { ReactNode } from 'react';

import { providers } from '@/providers/index.generated';

export function Providers({ children }: { children: ReactNode }) {
  return providers.reduceRight<ReactNode>(
    (acc, Provider) => <Provider>{acc}</Provider>,
    children
  );
}
