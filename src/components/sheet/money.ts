// Money as people type it. The cell holds the string the person typed and
// formatting is display-only, so these must agree with the server's
// `pfs_schema._amount` on every input: commas, dollar signs and spaces are
// noise; "(500)" and "($500)" are -500; blank is zero and *blank*; anything
// else is zero and *warned* — shown verbatim with a warning, never as $0.00,
// because "$0.00" for "1,2 50" is how a wrong number gets filed.

export type ParsedMoney = {
  /** The figure a total counts — zero when blank or unreadable, the server's rule. */
  value: number;
  /** Nothing typed. */
  blank: boolean;
  /** Something typed that is not a number. */
  warn: boolean;
};

const NOISE = /[,$\s]/g;
const PARENTHESISED = /^\((.*)\)$/;
// What Decimal() accepts of a cleaned string, minus the exotic (Infinity, NaN,
// exponents with no digits). Number() alone would read "0x10" as sixteen.
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** The number behind a typed money string, with whether it was blank or unreadable. */
export function parseMoney(raw: unknown): ParsedMoney {
  if (raw === null || raw === undefined) return { value: 0, blank: true, warn: false };
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { value: raw, blank: false, warn: false } : { value: 0, blank: false, warn: true };
  }
  let cleaned = String(raw).replace(NOISE, "");
  const wrapped = PARENTHESISED.exec(cleaned);
  if (wrapped) {
    // The parentheses carry the sign; an inner minus is the same statement
    // made twice, not a double negative.
    cleaned = "-" + wrapped[1].replace(/^-+/, "");
  }
  if (cleaned === "") return { value: 0, blank: true, warn: false };
  if (cleaned === "-" || cleaned === ".") return { value: 0, blank: false, warn: false };
  if (!NUMBER.test(cleaned)) return { value: 0, blank: false, warn: true };
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { value: 0, blank: false, warn: true };
  return { value, blank: false, warn: false };
}

/** A rate as typed: "7.25", "7.25%" and "7.25 %" are all 7.25. */
export function parseRate(raw: unknown): ParsedMoney {
  if (typeof raw === "string") return parseMoney(raw.replace(/%/g, ""));
  return parseMoney(raw);
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const twoPlaces = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Dollars and cents, negatives in accounting parentheses: 1250 → "$1,250.00",
 *  -500 → "($500.00)". A typed string is parsed first; blank stays blank and an
 *  unreadable string comes back verbatim so the cell can show it with a warning. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const parsed = parseMoney(value);
    if (parsed.blank) return "";
    if (parsed.warn) return value;
    return formatMoney(parsed.value);
  }
  if (!Number.isFinite(value)) return "—";
  const cents = Math.round(Math.abs(value) * 100) / 100;
  const text = usd.format(cents);
  // -0.001 rounds to zero and is not a negative number.
  return value < 0 && cents !== 0 ? `(${text})` : text;
}

/** A ratio to two places; "—" when there is none. */
export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return twoPlaces.format(value);
}

/** A count with no decimals; "—" when there is none. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return whole.format(value);
}

/** A plain number for the clipboard: no symbol, no grouping, a minus sign,
 *  at most two decimals. What Excel and our own parser both read back exactly. */
export function formatPlain(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
