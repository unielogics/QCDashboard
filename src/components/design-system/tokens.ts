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
  // Values are ported from QCWeb/src/styles/tokens.css, the canonical design
  // system shared with the marketing site and the auth pages. Keep the three
  // copies in step: QCWeb tokens.css, this file, and the `--ms-*` block in
  // src/app/globals.css (which the auth shell reads).
  //
  // Two accessibility failures were fixed in the move and should not regress:
  // `ink3` was 3.94:1 on the old cream ground — below AA, on the single
  // most-used token in the app — and `gold` on `goldSoft` was 2.63:1.
  light: {
    bg: "#F5F7FA",
    surface: "#FFFFFF",
    // Sunken, not raised. The old #FAF7F1 sat *above* bg and was invisible
    // against a white card (delta 1.03); this recedes, so table headers,
    // inputs and wells finally read as recessed.
    surface2: "#EEF1F6",
    elevated: "#FFFFFF",
    // Matched byte-for-byte to --line / --line2 in globals.css. The two palettes
    // coexist while routes migrate one at a time, and a hairline that differs by
    // 0.03 alpha is exactly the seam that makes a half-migrated page look broken.
    // tokens.ts is the copy that dies at the end; globals.css is the source of truth.
    line: "rgba(15, 23, 32, 0.09)",
    lineStrong: "rgba(15, 23, 32, 0.16)",

    ink: "#0F1720",
    ink2: "#353E4A",
    ink3: "#5A6675",
    ink4: "#8B97A6",
    inverse: "#FFFFFF",

    // The three accents stay distinct. They are categorical, not decorative:
    // DealChatThread renders a five-way actor scale off them, and StageBadge
    // puts petrol and brand on adjacent pipeline stages.
    brand: "#1B4B9E",
    brandSoft: "#EEF3FB",
    petrol: "#0D6E63",
    petrolSoft: "#E6F4F1",
    gold: "#8A6A1F",
    goldSoft: "#FAF5E8",

    profit: "#0F7B4F",
    profitBg: "#E6F4EC",
    warn: "#A15C07",
    warnBg: "#FDF2E2",
    danger: "#B42318",
    dangerBg: "#FDECEB",

    chip: "#E6EAEF",
    // Shallow. The old 0 8px 24px is what made every card read as an app tile
    // rather than a document.
    shadow: "0 1px 2px rgba(15,23,32,0.06), 0 1px 1px rgba(15,23,32,0.04)",
    shadowLg: "0 12px 32px rgba(15,23,32,0.10)",
    glass: "rgba(255,255,255,0.7)",
    spark: "#1B4B9E",
  },
  dark: {
    bg: "#0B1017",
    surface: "#141C26",
    // DELIBERATE DEVIATION from the shared system, which has its sunken step
    // *below* the ground. That is right in light and wrong here: AIRail's chat
    // bubbles and task tiles rely on surface2 sitting one step ABOVE surface,
    // and 550 references would flip from raised to a hole. One step up.
    surface2: "#1D2632",
    elevated: "#232D3B",
    line: "rgba(238, 242, 247, 0.14)",
    lineStrong: "rgba(238, 242, 247, 0.24)",

    ink: "#EEF2F7",
    ink2: "#D2D8E0",
    ink3: "#97A3B4",
    ink4: "#6B7787",
    inverse: "#0B1017",

    // brand flips teal -> blue here. Cosmetic, but it changes the "teal one"
    // mental model operators have; it needs a changelog line.
    brand: "#7FA8E0",
    brandSoft: "rgba(127, 168, 224, 0.16)",
    petrol: "#4BBFAE",
    petrolSoft: "rgba(75, 191, 174, 0.16)",
    gold: "#D1B268",
    goldSoft: "rgba(209, 178, 104, 0.16)",

    profit: "#4ADE80",
    profitBg: "rgba(74, 222, 128, 0.14)",
    warn: "#FBBF24",
    warnBg: "rgba(251, 191, 36, 0.14)",
    danger: "#FB7185",
    dangerBg: "rgba(251, 113, 133, 0.14)",

    chip: "rgba(238, 242, 247, 0.08)",
    shadow: "0 1px 2px rgba(0,0,0,0.5)",
    shadowLg: "0 12px 32px rgba(0,0,0,0.6)",
    glass: "rgba(20,28,38,0.55)",
    spark: "#7FA8E0",
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
