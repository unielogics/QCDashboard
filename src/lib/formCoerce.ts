// Form input coercion helpers — strip user-friendly chars before sending to API.

export function parseUSD(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parsePct(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseIntStrict(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  const cleaned = String(value).replace(/[^0-9\-]/g, "");
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

export function formatUSD(n: number): string {
  return n.toLocaleString("en-US");
}
