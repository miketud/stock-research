// Replaced by the ui_ux injection.
//
// --font-app-sans / --font-app-mono are the contract semantic.css depends on;
// the families behind them are this injection's choice.

import { Inter, JetBrains_Mono } from 'next/font/google';

export const fontSans = Inter({
  variable: '--font-app-sans',
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
});

export const fontMono = JetBrains_Mono({
  variable: '--font-app-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const fontVariables = `${fontSans.variable} ${fontMono.variable}`;
