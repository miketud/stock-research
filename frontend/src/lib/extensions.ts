// class:base — the shared shape of an extension-point entry.
//
// Hand-written on purpose. Both directions import from here: the generated
// barrel under extensions/<name>/ declares its array as ExtensionEntry[], and
// ExtensionPoint.tsx consumes it. Declaring the type in a barrel instead would
// make the generic component depend on one concrete extension point — and
// ExtensionPoint.tsx is class:base, so removing that directory would stop the
// BASE from typechecking.

import type { ComponentType } from 'react';

export interface ExtensionEntry {
  /** Filename after the NN- order prefix: `00-theme-toggle.tsx` → `theme-toggle`. */
  id: string;
  /** The NN- prefix. Unprefixed files sort into the middle at 500. */
  order: number;
  Component: ComponentType;
}
