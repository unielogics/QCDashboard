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

// A phone number the API will accept. Mirrors app/schemas/phone.py so a form
// refuses the same numbers the server does: ten digits is a US number, eleven
// leading with 1 is the same number written out, and a leading + is an
// international number taken on trust between 8 and 15 digits.
export function validPhone(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1")) || (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15);
}
