// The single palette, as CSS variables.
//
// `tokens.ts` held a second copy of the design system's colours as JS strings,
// and `useTheme()` handed it to components so they could write them into
// inline styles. Two palettes for one design is the drift the whole migration
// exists to remove: someone tunes `--accent` in globals.css and half the app
// does not move.
//
// This is the bridge for the styles that are still inline. Every value is a
// `var(--*)` reference, so a colour has exactly one definition — the `:root`
// block in globals.css — and an inline style and a class agree by
// construction rather than by anyone remembering to update both.
//
// It is deliberately NOT a hook: there is nothing to subscribe to. The theme
// is light-only, and a CSS variable resolves in the browser, not in React.
export const V = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  surface2: "var(--sunken)",
  elevated: "var(--surface)",

  line: "var(--line)",
  lineStrong: "var(--line2)",

  ink: "var(--ink)",
  ink2: "var(--ink2)",
  ink3: "var(--muted)",
  ink4: "var(--faint)",
  inverse: "#fff",

  brand: "var(--accent)",
  brandSoft: "var(--accent-100)",
  spark: "var(--accent)",
  petrol: "var(--petrol)",
  petrolSoft: "var(--petrol-100)",
  gold: "var(--gold)",
  goldSoft: "var(--gold-100)",

  profit: "var(--ok)",
  profitBg: "var(--ok-tint)",
  warn: "var(--warn)",
  warnBg: "var(--warn-tint)",
  danger: "var(--danger)",
  dangerBg: "var(--danger-tint)",

  chip: "var(--chip)",
  glass: "var(--glass)",
  shadow: "var(--sh1)",
  shadowLg: "var(--sh2)",
} as const;

export type CssVars = typeof V;
