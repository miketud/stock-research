// class:base — the no-FOUC theme resolver.
//
// This string is injected into <head> and runs BEFORE first paint, so the page
// never renders in the wrong theme and then snaps. It is deliberately tiny,
// dependency-free, and wrapped in try/catch: localStorage throws in private
// browsing modes, and a theme preference is not worth a blank page.
//
// It writes BOTH selectors:
//   data-theme  — the source of truth, extensible to a third theme later
//   .dark       — so shadcn/Base UI components and Tailwind's dark: variant
//                 work unmodified
//
// layout.tsx server-renders class="dark" data-theme="dark", so with JavaScript
// disabled the page is simply dark; this script only ever needs to REMOVE the
// class, never add it on the happy path.

export const THEME_STORAGE_KEY = 'theme';

export type Theme = 'dark' | 'light';

export const themeInitScript = `(function(){try{
var s=localStorage.getItem('${THEME_STORAGE_KEY}');
var t=(s==='light'||s==='dark')?s:'dark';
var r=document.documentElement;
r.setAttribute('data-theme',t);
r.classList.toggle('dark',t==='dark');
}catch(e){}})();`;
