/** How the earnings plan prints its figures and its dates. Words only: no arithmetic lives here. */
import { percent, signedTimes, signedUsd, times, usd } from "@/lib/financialsOverview";
import type { PlanFactor } from "./types";

export { signedTimes, signedUsd, times, usd };

const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** A ratio as a percent: 0.1158 → "11.6%". */
export function ratioPercent(value: number | null | undefined, digits = 1): string {
  return finite(value) ? percent(value * 100, digits) : "—";
}

/** A change in a ratio, in points: 0.141 → "+14.1 pts". */
export function points(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  const text = Math.abs(value * 100).toFixed(1);
  if (Number(text) === 0) return "0.0 pts";
  return `${value > 0 ? "+" : MINUS}${text} pts`;
}

/** 1250.5 → "1,250.5"; whole numbers print without decimals. */
export function plain(value: number, digits = 2): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** A stream metric in its own unit: "$262.00", "95.0%", "340 units / mo". */
export function factorValue(factor: Pick<PlanFactor, "unit">, value: number): string {
  if (factor.unit === "$") return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (factor.unit === "%") return `${plain(value, 1)}%`;
  return `${plain(value)} ${factor.unit}`.trim();
}

/** What "by an amount" means for a metric: dollars, points, or its own unit ("units"). */
export function factorAmountLabel(factor: Pick<PlanFactor, "unit">): string {
  if (factor.unit === "$") return "$";
  if (factor.unit === "%") return "pts";
  return factor.unit.split(" ")[0] || "amount";
}

/** "2027-01" and 0 → "Jan 2027"; month 3 of a plan starting in November 2026 is "Jan 2027". */
export function planMonth(planStart: string | null | undefined, index: number): string {
  const parsed = parsePlanStart(planStart);
  if (!parsed) return `Month ${index + 1}`;
  const at = parsed.month - 1 + index;
  return `${MONTHS[at % 12]} ${parsed.year + Math.floor(at / 12)}`;
}

/** The short month names along the twelve-month ramp. */
export function planMonthShort(planStart: string | null | undefined, index: number): string {
  const parsed = parsePlanStart(planStart);
  return parsed ? MONTHS[(parsed.month - 1 + index) % 12] : String(index + 1);
}

export function parsePlanStart(value: string | null | undefined): { year: number; month: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? "");
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

/** The months a plan may start in: last month through a year out, always including the one already chosen. */
export function planStartOptions(current: string | null | undefined, today: Date = new Date()): Array<{ value: string; label: string }> {
  const first = today.getFullYear() * 12 + today.getMonth() - 1;
  const values = Array.from({ length: 14 }, (_unused, offset) => {
    const at = first + offset;
    return `${String(Math.floor(at / 12)).padStart(4, "0")}-${String((at % 12) + 1).padStart(2, "0")}`;
  });
  if (current && parsePlanStart(current) && !values.includes(current)) values.push(current);
  return values.sort().map(value => ({ value, label: planMonth(value, 0) }));
}

/** "2026-11-11T21:05:00Z" → "Nov 11, 2026 · 4:05 PM" in the reader's own zone. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** "2025-01-01", "2025-12-31" → "Jan 1 – Dec 31, 2025". */
export function periodLabel(start: string | null | undefined, end: string | null | undefined): string | null {
  const from = day(start), to = day(end);
  if (!from || !to) return null;
  const sameYear = from.year === to.year;
  return `${MONTHS[from.month - 1]} ${from.day}${sameYear ? "" : `, ${from.year}`} – ${MONTHS[to.month - 1]} ${to.day}, ${to.year}`;
}

function day(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

/** 1 → "1 change", 3 → "3 changes". */
export function count(amount: number, word: string, plural = `${word}s`): string {
  return `${amount} ${amount === 1 ? word : plural}`;
}
