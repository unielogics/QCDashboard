export const USE_OF_FUNDS_CATEGORIES = [
  ["real_estate", "Real estate purchase / improvements"],
  ["equipment", "Equipment"],
  ["working_capital", "Working capital"],
  ["inventory", "Inventory"],
  ["debt_refinance", "Debt refinance"],
  ["closing_fees", "Closing costs / fees"],
  ["other", "Other"],
] as const;

export type UseOfFundsCategory = typeof USE_OF_FUNDS_CATEGORIES[number][0];
export type UseOfFundsItem = { id: string; category: UseOfFundsCategory; label: string; amount: number | string };
export type UseOfFundsBudget = {
  items: UseOfFundsItem[];
  requested_amount: number | string | null;
  requested_amount_source: string | null;
  total: number | string;
  category_totals: Partial<Record<UseOfFundsCategory, number | string>>;
  unallocated_amount: number | string | null;
  complete: boolean;
  real_estate_equipment_amount: number | string;
  real_estate_equipment_pct: number | null;
  revision: number;
  updated_at: string | null;
  updated_by_user_id: string | null;
  can_edit?: boolean;
  warnings?: string[];
};
export type UseOfFundsRow = Omit<UseOfFundsItem, "amount"> & { amount: string };

/** Integer cents only: never silently round a third decimal or accept NaN/exponents. */
export function moneyCents(value: string | number | null): number | null {
  if (value === null || !/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())) return null;
  const [whole, fractional = ""] = String(value).trim().split(".");
  const cents = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function budgetPreview(rows: UseOfFundsRow[], requestedAmount: number | string | null) {
  const errors: Record<string, string> = {};
  let total = 0;
  let fixedAssets = 0;
  for (const row of rows) {
    const cents = moneyCents(row.amount);
    if (cents === null || cents <= 0) errors[row.id] = "Enter an amount above $0 with no more than two decimals.";
    else {
      total += cents;
      if (row.category === "real_estate" || row.category === "equipment") fixedAssets += cents;
    }
  }
  if (!Number.isSafeInteger(total)) errors.total = "The combined amount is too large.";
  const requested = moneyCents(requestedAmount);
  const remaining = requested === null ? null : requested - total;
  if (remaining !== null && remaining < 0) errors.total = "The allocated budget exceeds the requested amount. Adjust these rows or correct the file’s requested amount.";
  const complete = requested !== null && requested > 0 && remaining === 0 && !Object.keys(errors).length;
  return { errors, total, remaining, complete, fixedAssets, percent: complete ? fixedAssets / requested! * 100 : null };
}

export function budgetRows(items: UseOfFundsItem[]): UseOfFundsRow[] {
  return items.map((item) => ({ ...item, amount: String(item.amount) }));
}

/** Display is rounded down: 50.999999% must never look like it meets 51%. */
export function budgetShareLabel(preview: Pick<ReturnType<typeof budgetPreview>, "complete" | "fixedAssets" | "total">): string {
  if (!preview.complete || preview.total <= 0) return "Complete budget first";
  const basisPoints = BigInt(preview.fixedAssets) * BigInt(10000) / BigInt(preview.total);
  return `${Number(basisPoints) / 100}%`;
}
