// Composite a colour against transparency.
//
// Lifted out of design-system/tokens.ts, which is being deleted. This is NOT a
// palette helper and never was: both remaining callers pass a colour the USER
// chose — a booking page's brand accent — which is exactly the case a CSS
// variable cannot cover, because the value is not known until runtime and the
// alpha has to be computed against a concrete hex.
//
// Design-token colours do not come through here any more; they are
// `var(--accent-100)` and its siblings, declared once in globals.css.

export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const c = color.trim();

  if (c.startsWith("#")) {
    const hex = c.slice(1);
    const expand = (s: string) => s.split("").map((ch) => ch + ch).join("");
    const full = hex.length === 3 || hex.length === 4 ? expand(hex) : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    const existing = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN)) return c;
    return `rgba(${r}, ${g}, ${b}, ${+(existing * a).toFixed(3)})`;
  }

  const m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i);
  if (m) {
    const [, r, g, b, existing] = m;
    const base = existing === undefined ? 1 : Number(existing);
    return `rgba(${r}, ${g}, ${b}, ${+(base * a).toFixed(3)})`;
  }

  // Unknown format (a CSS keyword, a gradient, a var()) — return unchanged
  // rather than emitting something invalid.
  return c;
}
