// Money, percentages and counts, formatted the same way everywhere.
//
// Lifted out of design-system/tokens.ts, which is being deleted: it held the
// app's second copy of the palette, and this had nothing to do with colour —
// it was only living there because that file happened to exist. Thirty-eight
// files import it.
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
