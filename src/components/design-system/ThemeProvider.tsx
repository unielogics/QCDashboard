"use client";

// Theme shim — light only.
//
// This app is being migrated from inline style objects onto the plain-CSS
// design system in globals.css, which QCDealerOS already runs. Dark mode was
// dropped in that move: two apps behind one login should not be two visual
// worlds, and Capital OS committed to a single light theme.
//
// `useTheme()` survives as a frozen constant rather than a context read,
// because ~205 files destructure `t` from it. Deleting it outright would break
// every one of them in a single commit; leaving it here lets routes migrate to
// classes one at a time. It has no provider state, no listener, and no storage.
//
// The values in QC_TOKENS.light are deliberately identical to the CSS custom
// properties in globals.css, so an un-migrated component renders the same
// surface as a migrated one sitting next to it. That is the whole reason this
// migration can be incremental. **If you change a colour, change it in BOTH
// places** until this file is deleted.
//
// This is scaffolding with an end date. When `grep -rl useTheme src` returns
// nothing, delete this file, tokens.ts and buttons.ts — see Phase 4 of the
// migration plan.

import { QC_DENSITY, QC_TOKENS, type Density, type QCTokens, type ThemeMode } from "./tokens";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeCtx {
  mode: ThemeMode;
  isDark: boolean;
  preference: ThemePreference;
  setMode: (m: ThemeMode) => void;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
  density: Density;
  setDensity: (d: Density) => void;
  t: QCTokens;
  d: (typeof QC_DENSITY)[Density];
}

const NOOP = () => {};

// Frozen so a stray `theme.t.ink = …` fails loudly rather than tinting one
// route and confusing whoever finds it later.
const LIGHT: ThemeCtx = Object.freeze({
  mode: "light" as ThemeMode,
  isDark: false,
  preference: "light" as ThemePreference,
  setMode: NOOP,
  setPreference: NOOP,
  toggle: NOOP,
  density: "comfortable" as Density,
  setDensity: NOOP,
  t: QC_TOKENS.light,
  d: QC_DENSITY.comfortable,
});

/**
 * Kept only so `layout.tsx` and `providers.tsx` need no change during the
 * migration. It renders nothing of its own: the background, colour and type
 * that used to be set on a wrapper div here are now owned by globals.css.
 *
 * The wrapper it used to render also hardcoded `fontFamily: -apple-system`,
 * which beat the Inter / Inter Tight faces layout.tsx loads — so the app never
 * rendered in its own typeface. Removing the div is what fixed that.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useTheme(): ThemeCtx {
  return LIGHT;
}
