// Direct port of .design/qualified-commercial/project/tokens.js
// Two themes: Paper White (light) + Obsidian (dark).

export type ThemeMode = "light" | "dark";

export interface QCTokens {
  bg: string;
  surface: string;
  surface2: string;
  elevated: string;
  line: string;
  lineStrong: string;

  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  inverse: string;

  brand: string;
  brandSoft: string;
  petrol: string;
  petrolSoft: string;
  gold: string;
  goldSoft: string;

  profit: string;
  profitBg: string;
  warn: string;
  warnBg: string;
  danger: string;
  dangerBg: string;

  chip: string;
  shadow: string;
  shadowLg: string;
  glass: string;
  spark: string;
}

export const QC_TOKENS: Record<ThemeMode, QCTokens> = {
  light: {
    bg: "#F4F1EA",
    surface: "#FFFFFF",
    surface2: "#FAF7F1",
    elevated: "#FFFFFF",
    line: "rgba(11, 22, 41, 0.08)",
    lineStrong: "rgba(11, 22, 41, 0.16)",

    ink: "#0B1629",
    ink2: "#3C4A60",
    ink3: "#6B7891",
    ink4: "#A2ABBD",
    inverse: "#FFFFFF",

    brand: "#0B1F3A",
    brandSoft: "#E6ECF5",
    petrol: "#0F5F66",
    petrolSoft: "#D9EAEB",
    gold: "#B98A2E",
    goldSoft: "#F5EBD3",

    profit: "#0B7A3E",
    profitBg: "#DCEFE2",
    warn: "#A86A12",
    warnBg: "#F8EAD1",
    danger: "#B0322F",
    dangerBg: "#F4DAD8",

    chip: "#EFEAE0",
    shadow: "0 1px 2px rgba(11,22,41,0.04), 0 8px 24px rgba(11,22,41,0.06)",
    shadowLg: "0 2px 6px rgba(11,22,41,0.06), 0 24px 48px rgba(11,22,41,0.10)",
    glass: "rgba(255,255,255,0.7)",
    spark: "#0B1F3A",
  },
  dark: {
    bg: "#06070B",
    surface: "#0D1018",
    surface2: "#11151F",
    elevated: "#161B27",
    line: "rgba(255,255,255,0.07)",
    lineStrong: "rgba(255,255,255,0.14)",

    ink: "#F1F5F9",
    ink2: "#C5CDDB",
    ink3: "#8892A6",
    ink4: "#5A6378",
    inverse: "#06070B",

    brand: "#5EEAD4",
    brandSoft: "rgba(94,234,212,0.10)",
    petrol: "#22D3C7",
    petrolSoft: "rgba(34,211,199,0.12)",
    gold: "#E0B85A",
    goldSoft: "rgba(224,184,90,0.12)",

    profit: "#34D399",
    profitBg: "rgba(52,211,153,0.13)",
    warn: "#F4B95A",
    warnBg: "rgba(244,185,90,0.13)",
    danger: "#F87171",
    dangerBg: "rgba(248,113,113,0.13)",

    chip: "rgba(255,255,255,0.06)",
    shadow: "0 1px 2px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4)",
    shadowLg: "0 2px 6px rgba(0,0,0,0.6), 0 24px 48px rgba(0,0,0,0.55)",
    glass: "rgba(20,24,34,0.55)",
    spark: "#5EEAD4",
  },
};

// Density presets — port of QC_DENSITY
export type Density = "comfortable" | "compact";
export const QC_DENSITY: Record<Density, { pad: number; gap: number; cardPad: number; rowH: number; fs: number }> = {
  comfortable: { pad: 16, gap: 14, cardPad: 18, rowH: 56, fs: 1.0 },
  compact:     { pad: 12, gap: 10, cardPad: 14, rowH: 48, fs: 0.94 },
};

// Money / number formatting — port of QC_FMT
export const QC_FMT = {
  usd: (n: number, dec = 0) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: dec,
      minimumFractionDigits: dec,
    }),
  pct: (n: number, dec = 2) => `${n.toFixed(dec)}%`,
  bps: (n: number) => `${n > 0 ? "+" : ""}${n} bps`,
  num: (n: number) => n.toLocaleString("en-US"),
  short: (n: number) => {
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
    return `$${n}`;
  },
};

// Map tokens → CSS variables so Tailwind classes (bg-surface, text-ink, etc.) work
export function tokensToCssVars(t: QCTokens): React.CSSProperties {
  return {
    "--qc-bg": t.bg,
    "--qc-surface": t.surface,
    "--qc-surface2": t.surface2,
    "--qc-elevated": t.elevated,
    "--qc-line": t.line,
    "--qc-line-strong": t.lineStrong,
    "--qc-ink": t.ink,
    "--qc-ink2": t.ink2,
    "--qc-ink3": t.ink3,
    "--qc-ink4": t.ink4,
    "--qc-inverse": t.inverse,
    "--qc-brand": t.brand,
    "--qc-brand-soft": t.brandSoft,
    "--qc-petrol": t.petrol,
    "--qc-petrol-soft": t.petrolSoft,
    "--qc-gold": t.gold,
    "--qc-gold-soft": t.goldSoft,
    "--qc-profit": t.profit,
    "--qc-profit-bg": t.profitBg,
    "--qc-warn": t.warn,
    "--qc-warn-bg": t.warnBg,
    "--qc-danger": t.danger,
    "--qc-danger-bg": t.dangerBg,
    "--qc-chip": t.chip,
  } as React.CSSProperties;
}

/**
 * Apply an alpha to a token colour.
 *
 * Call sites used to do `t.brand + "40"`, appending a hex alpha pair. That only
 * works while the token happens to be `#RRGGBB`, and it fails silently the
 * moment one is not: `t.warnBg` is already `rgba(244,185,90,0.13)` in dark, so
 * `t.warnBg + "55"` produced `rgba(244,185,90,0.13)55` — invalid, so the
 * browser dropped the declaration and the surface rendered transparent. That
 * bug is live today in the control room.
 *
 * This handles #RGB, #RRGGBB, #RRGGBBAA and rgb()/rgba(), and multiplies into
 * any alpha the colour already carries rather than replacing it.
 *
 * @param alpha 0–1.
 */
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
