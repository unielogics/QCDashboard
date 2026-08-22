"use client";

// A pass-through, kept only so `providers.tsx` needs no change.
//
// This used to be the app's theme: a context holding a 31-token JS palette
// that ~205 files destructured as `t` and wrote into inline styles, plus a
// light/dark/system preference. Both are gone.
//
// Dark mode went first: two apps behind one login should not be two visual
// worlds, and Capital OS had already committed to a single light theme.
// The palette went second — it was a SECOND copy of the colours that
// globals.css declares in `:root`, and two definitions of one colour is how
// someone tunes `--accent` and half the app does not move. Colour that is
// still inline reads `V` from ./cssVars, which is `var(--*)` references, so
// there is exactly one definition of every value in the design system.
//
// The wrapper this used to render also hardcoded `fontFamily: -apple-system`,
// which beat the Inter / Inter Tight faces `layout.tsx` loads — so the app
// never rendered in its own typeface. Removing the div is what fixed that.
//
// Nothing imports anything else from this file. It can be deleted outright by
// dropping <ThemeProvider> from providers.tsx.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
