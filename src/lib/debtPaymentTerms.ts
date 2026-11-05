export type DebtPaymentFrequency = "daily" | "weekly" | "biweekly" | "monthly";
export type DebtPaymentTerms = {
  payment_amount?: unknown; payment_frequency?: unknown; monthly_payment?: unknown;
  monthly_payment_source?: "native_terms" | "stated" | null;
};

/** The established refinance multipliers, represented as integers for half-up cent rounding. */
export const DEBT_MONTHLY_FACTORS: Record<DebtPaymentFrequency, number> = { daily: 21, weekly: 4.33, biweekly: 2.165, monthly: 1 };
const FACTORS: Record<DebtPaymentFrequency, bigint> = { daily: BigInt(21000), weekly: BigInt(4330), biweekly: BigInt(2165), monthly: BigInt(1000) };

export function debtMonthlyEquivalent(amount: unknown, frequency: unknown): string | null {
  if (typeof frequency !== "string" || !(frequency in FACTORS) || amount == null || typeof amount === "boolean") return null;
  const text = String(amount).replace(/[,$\s]/g, "");
  if (!/^\+?(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(/^\+/, "").split(".");
  const cents = BigInt(whole || "0") * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  const monthly = (cents * FACTORS[frequency as DebtPaymentFrequency] + BigInt(500)) / BigInt(1000);
  return `${monthly / BigInt(100)}.${String(monthly % BigInt(100)).padStart(2, "0")}`;
}

/** Only a native term edit recomputes monthly. A stated monthly amount is retained when terms are incomplete. */
export function updateDebtPaymentTerms<T extends DebtPaymentTerms>(row: T, changes: Partial<T>): T {
  const next = { ...row, ...changes };
  if ("monthly_payment" in changes && !("payment_amount" in changes) && !("payment_frequency" in changes)) {
    next.monthly_payment_source = changes.monthly_payment == null || String(changes.monthly_payment).trim() === "" ? null : "stated";
  } else if ("payment_amount" in changes || "payment_frequency" in changes) {
    const monthly = debtMonthlyEquivalent(next.payment_amount, next.payment_frequency);
    if (monthly !== null) { next.monthly_payment = monthly; next.monthly_payment_source = "native_terms"; }
    else if (row.monthly_payment_source === "native_terms") { next.monthly_payment = ""; next.monthly_payment_source = null; }
  }
  return next;
}
