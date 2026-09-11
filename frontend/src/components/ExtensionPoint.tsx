// class:base — the only sanctioned way to add UI to a base-owned layout file.
//
// Region markers are forbidden inside JSX: a marker in attribute position is a
// syntax error, and injected content has to be valid in the exact position it
// lands in — neither is checkable without a parser. Extension points remove that
// problem by construction. Entries come from a generated barrel because
// Turbopack has no glob import.
//
// The attribute is `data-extension-point`, not `data-slot`: shadcn/Base UI
// components already emit `data-slot="button"` and friends to identify their own
// internal parts, and two unrelated meanings on one attribute makes every
// `[data-slot]` selector ambiguous.

import type { ExtensionEntry } from '@/lib/extensions';

export interface ExtensionPointProps {
  name: string;
  entries: ExtensionEntry[];
  className?: string;
}

export function ExtensionPoint({ name, entries, className }: ExtensionPointProps) {
  if (entries.length === 0) return null;
  return (
    <div data-extension-point={name} className={className}>
      {entries.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </div>
  );
}
