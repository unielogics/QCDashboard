import { parseMoney } from "@/components/sheet/money";

/** Reduction in the recorded loan balance; payoff quotes, fees and factor rates are separate. */
export function loanPaidDownPct(originalAmount: unknown, currentBalance: unknown): number | null {
  const amount = (raw: unknown) => {
    if (typeof raw !== "number" && typeof raw !== "string") return null;
    if (["-", ".", "+"].includes(String(raw).trim())) return null;
    const parsed = parseMoney(raw);
    return parsed.blank || parsed.warn ? null : parsed.value;
  };
  const original = amount(originalAmount); const balance = amount(currentBalance);
  if (original == null || original <= 0 || balance == null || balance < 0) return null;
  const value = ((original - balance) / original) * 100;
  return Number.isFinite(value) ? value : null;
}

/** Percent values use units from 0 to 100, with negatives retained when balance grew. */
export function formatLoanPaidDownPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const scaled = Math.abs(value) * 10;
  if (!Number.isFinite(scaled)) return "—";
  const rounded = Math.round(scaled + Number.EPSILON * Math.max(1, scaled) * 4) / 10;
  return `${value < 0 && rounded !== 0 ? "-" : ""}${rounded.toFixed(1)}%`;
}

export const formatLoanPaidDown = (original: unknown, balance: unknown) => formatLoanPaidDownPct(loanPaidDownPct(original, balance));

export function loanPaidDownDescription(original: unknown, balance: unknown): string {
  const value = loanPaidDownPct(original, balance);
  if (value == null) return "Paid down needs a positive original loan amount and a valid current balance. Payoff quotes and credit limits are not used.";
  return `${value < 0 ? "Current balance is above the original amount. " : ""}Balance reduction: (original amount − current balance) ÷ original amount × 100. This does not measure interest, fees, cumulative payments, or reduction of a revolving credit limit.`;
}

/** A recorded calendar date stays that day in every time zone. Never infer it from upload time. */
export function formatLoanOriginationDate(value: unknown): string {
  if (typeof value !== "string") return "Not provided";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value.trim());
  if (!match) return "Not provided";
  const [, year, month, day] = match; const parsed = new Date(`${year}-${month}-${day}T12:00:00`);
  if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() !== Number(year) || parsed.getMonth() + 1 !== Number(month) || parsed.getDate() !== Number(day)) return "Not provided";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
