import type { RepaymentConfig } from "./loanSchedule";

export const DEAL_COST_CATEGORIES = { closing_cost: "Closing cost", escrow_reserve: "Escrow / reserve", referral: "Referral fee", origination: "Origination fee", consulting: "Consulting fee", servicing: "Servicing", management: "Management", other: "Other cost" } as const;
export const DEAL_COST_BASES = { loan_amount: "Gross loan", investor_funding: "Investor capital", outstanding_principal: "Outstanding principal", interest: "Interest received" } as const;
export type DealCostRow = {
  id: string; label: string; category: keyof typeof DEAL_COST_CATEGORIES;
  payer: "borrower" | "investor" | "sponsor"; method: "fixed" | "percent"; value: number | null;
  recipient_role?: "platform" | "lender" | "third_party" | "escrow";
  basis: keyof typeof DEAL_COST_BASES; timing: "closing" | "monthly" | "annual";
  settlement: "withheld" | "separate" | "financed"; enabled: boolean; recipient?: string | null; notes?: string | null;
  reserve_release: "unknown" | "maturity";
  origin?: "manual" | "legacy_setting" | "program_default" | "production_arrangement";
  source_ref?: string | null;
  legacy_field?: "forecast_fee_points" | "forecast_consulting_fee" | null;
  coverage_treatment?: "new_cost" | "already_in_baseline";
  earnings_treatment?: "financing_cost" | "operating_expense";
};
export type DealBudgetWrite = {
  expected_revision: number; funding_mode: "single_investor" | "multiple_investors";
  costs_confirmed: boolean;
  loan_amount_mode?: "gross_loan" | "base_loan" | "target_net";
  base_loan_amount?: number | null;
  target_net_amount?: number | null;
  investor_funding_amount: number | null; minimum_investor_contribution: number | null; currency: string;
  rows: DealCostRow[]; note?: string | null;
};
export type DealBudgetCalculation = Record<string, unknown>;
export type DealBudget = Omit<DealBudgetWrite, "expected_revision"> & {
  profile_id: string; revision: number; can_edit: boolean; updated_at?: string | null;
  updated_by_user_id?: string | null; suggested_rows?: DealCostRow[]; calculation: DealBudgetCalculation;
  financing_context?: { plan_updated_at: string | null; terms_ref: { kind: string; id: string; version: number } | null; current_loan_amount: number | null };
  financial_plan?: import("./financialCockpit").FinancialPlanRead;
  financial_plan_evaluation?: import("./financialCockpit").PlanEvaluation | null;
};
export type DealBudgetDraft = { profileId: string; value: DealBudgetWrite; removed: DealCostRow[]; amountModeExplicit?: boolean };
export type DealBudgetLoan = { amount: number | null; rate_pct: number | null; term_months: number | null; structure: string; interest_only_months: number | null; repayment_config?: RepaymentConfig | null; payments_per_year?: number | null };
export const dealBudgetKey = (profileId: string) => ["file-deal-budget", profileId] as const;
export const dealBudgetDraftKey = (profileId: string) => ["file-deal-budget-draft", profileId] as const;
export function dealBudgetWrite(budget: DealBudget): DealBudgetWrite {
  return { expected_revision: budget.revision, funding_mode: budget.funding_mode ?? "single_investor", costs_confirmed: budget.costs_confirmed === true, loan_amount_mode: budget.loan_amount_mode ?? "gross_loan", base_loan_amount: budget.base_loan_amount ?? null, target_net_amount: budget.target_net_amount ?? null, investor_funding_amount: budget.investor_funding_amount ?? null, minimum_investor_contribution: budget.minimum_investor_contribution ?? null, currency: budget.currency || "USD", rows: budget.rows.map(row => ({ ...row })), note: budget.note ?? null };
}
export function dealBudgetChanged(draft: DealBudgetWrite, saved: DealBudget) {
  return JSON.stringify({ ...draft, expected_revision: undefined }) !== JSON.stringify({ ...dealBudgetWrite(saved), expected_revision: undefined });
}
export function newDealCost(): DealCostRow {
  return { id: crypto.randomUUID(), label: "", category: "closing_cost", payer: "borrower", method: "fixed", value: null, basis: "loan_amount", timing: "closing", settlement: "withheld", enabled: true, recipient_role: "third_party", recipient: null, notes: null, reserve_release: "unknown", origin: "manual" };
}
