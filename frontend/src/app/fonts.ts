// class:base-replaceable — font LOADING is base, the type SCALE is injection.
//
// next/font must be called at module scope and its result applied to <html> in
// layout.tsx, which the base owns. Sizes, leading and tracking are just tokens
// and belong to whichever injection owns the look.
//
// The CSS variable names below are the CONTRACT: semantic.css is class:base and
// hash-frozen, so it can only refer to --font-app-sans / --font-app-mono. An
// injection replacing this file may load any families it likes, as long as it
// exposes them under those two names.

import { Geist, Geist_Mono } from 'next/font/google';

export const fontSans = Geist({
  variable: '--font-app-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const fontMono = Geist_Mono({
  variable: '--font-app-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const fontVariables = `${fontSans.variable} ${fontMono.variable}`;
