export type LoanDateMode = "automatic" | "manual";
export type LoanDates = { expected_funding_date: string; maturity_date: string; maturity_date_mode: LoanDateMode };
export const LOAN_DATE_NOTE = "Estimated dates may change with funding timing and final closing terms.";

function calendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999) return null;
  const result = new Date(0); result.setUTCHours(0, 0, 0, 0); result.setUTCFullYear(year, month - 1, day);
  return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day ? result : null;
}
const iso = (date: Date) => `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

export function addLoanMonths(value: string, months: number | null | undefined): string {
  if (!calendarDate(value) || !Number.isInteger(months) || !months || months < 1 || months > 600) return "";
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(0); target.setUTCFullYear(year, month - 1 + months, 1);
  const end = new Date(target); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const last = end.getUTCDate();
  if (target.getUTCFullYear() > 9999) return "";
  return `${String(target.getUTCFullYear()).padStart(4, "0")}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Closing estimates count weekdays only; holidays are not inferred. */
export function addLoanBusinessDays(value: string, days: number): string {
  const date = calendarDate(value);
  if (!date || !Number.isInteger(days) || days < 0 || days > 3650) return "";
  while (days > 0) { date.setUTCDate(date.getUTCDate() + 1); if (![0, 6].includes(date.getUTCDay())) days -= 1; }
  return date.getUTCFullYear() <= 9999 ? iso(date) : "";
}

export function loanDateProblem(value: LoanDates, termMonths: number | null | undefined): string | null {
  const dates = resolveLoanDates(value, termMonths);
  if (dates.expected_funding_date && !calendarDate(dates.expected_funding_date)) return "Enter a valid estimated funding date.";
  if (dates.maturity_date_mode === "manual" && !calendarDate(dates.maturity_date)) return "Enter a valid maturity date for the manual override.";
  if (dates.expected_funding_date && dates.maturity_date && dates.maturity_date <= dates.expected_funding_date) return "Maturity must be after the estimated funding date.";
  return null;
}

export function resolveLoanDates(value: LoanDates, termMonths: number | null | undefined): LoanDates {
  return value.maturity_date_mode === "manual" ? value : { ...value, maturity_date: addLoanMonths(value.expected_funding_date, termMonths) };
}

/** Preserve a historical explicit maturity when older records have no mode. */
export function savedLoanDates(value: { expected_funding_date?: string | null; maturity_date?: string | null; maturity_date_mode?: string | null }, termMonths: number | null | undefined): LoanDates {
  const funding = value.expected_funding_date ?? "", maturity = value.maturity_date ?? "";
  const mode = value.maturity_date_mode === "manual" || value.maturity_date_mode !== "automatic" && maturity && maturity !== addLoanMonths(funding, termMonths) ? "manual" : "automatic";
  return resolveLoanDates({ expected_funding_date: funding, maturity_date: maturity, maturity_date_mode: mode }, termMonths);
}

export function localDateToday(): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
