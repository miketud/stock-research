// class:base — the shared shape of a nav entry.
//
// Hand-written for the same reason as lib/extensions.ts: nav/<id>.nav.ts files
// import this type, and nav.generated.ts imports those files. With the type
// declared in the barrel that cycle runs through generated code, so a stale
// barrel breaks the very files it is generated from.
//
// Nav entries are DATA, not JSX, so one registry feeds the site header, a
// sitemap, a command palette, and the conformance check that asserts every
// href resolves to a real page.tsx.

export interface NavEntry {
  id: string;
  href: string;
  label: string;
  order?: number;
  external?: boolean;
}
