import { DEAL_COST_CATEGORIES, newDealCost, type DealCostRow, type DealInvestorScenarioRow } from "./dealBudget";

export const COMPANY_FEE_CATEGORIES = ["servicing", "management", "maintenance", "reporting", "software", "monitoring"] as const;
export type CompanyFeeCategory = typeof COMPANY_FEE_CATEGORIES[number];

export function isCompanyFee(row: DealCostRow): boolean {
  return (COMPANY_FEE_CATEGORIES as readonly string[]).includes(row.category);
}

/** Explicitly added, unpriced fee. The payer, basis and timing remain editable. */
export function newCompanyFee(category: CompanyFeeCategory): DealCostRow {
  return { ...newDealCost(), label: `${DEAL_COST_CATEGORIES[category]} fee`, category, payer: "investor", timing: "monthly", settlement: "withheld", recipient_role: "platform", applicability: "all" };
}

export function investorAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) { const number = Number(value); return Number.isFinite(number) ? number : null; }
  return null;
}

export function investorMoney(value: unknown, currency: string | null = "USD"): string {
  const amount = investorAmount(value);
  if (amount == null) return "Not established";
  if (!currency) return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · currency not confirmed`;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export function investorFeeStatus(row: DealCostRow, calculated?: DealInvestorScenarioRow, pending = false): string | null {
  if (pending) return "Calculating…";
  if (!row.enabled) return "Excluded by staff";
  if (calculated?.applies === false) return "Not charged for this servicing arrangement";
  if (calculated?.applies === null) return "Servicing arrangement needs confirmation";
  return null;
}

const PAYOFF_MISSING: Record<string, string> = {
  interest_policy: "Choose the contracted early payoff interest policy.",
  charge_amount: "Enter the additional payoff charge, or confirm 0 when none applies.",
  charge_recipient: "Choose who receives the additional payoff charge.",
  minimum_interest_months: "Enter the contractual minimum interest months within the loan term.",
  reserve_release: "Confirm when the investor reserve is returned.",
  repayment_schedule: "Complete the shared loan terms so a repayment schedule can be calculated.",
};
export const investorMissingAssumption = (code: string) => PAYOFF_MISSING[code] ?? code;
