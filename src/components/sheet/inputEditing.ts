/** Native date/number controls expose these methods but cannot select a text range. */
const TEXT_SELECTION_TYPES = new Set(["text", "search", "tel", "url", "password"]);

export function focusSheetInput(input: HTMLInputElement, seed: string | null): void {
  input.focus();
  if (!TEXT_SELECTION_TYPES.has(input.type)) return;
  if (seed === null) input.select();
  else input.setSelectionRange(input.value.length, input.value.length);
}

export const SHEET_DATE_ERROR = "Enter a complete, valid date in YYYY-MM-DD format, or clear the date.";

/** Financial dates are calendar days. Reject partial input and rollover dates, preserving explicit clears. */
export function isValidSheetDate(value: string, badInput = false): boolean {
  if (badInput) return false;
  if (value === "") return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || Number(match[1]) === 0) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]);
}
