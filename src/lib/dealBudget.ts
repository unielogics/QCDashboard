import type { RepaymentConfig } from "./loanSchedule";

export const DEAL_COST_CATEGORIES = { closing_cost: "Closing cost", escrow_reserve: "Escrow / reserve", referral: "Referral fee", origination: "Origination fee", consulting: "Consulting fee", servicing: "Servicing", management: "Management", maintenance: "Maintenance", reporting: "Reporting", software: "Software", monitoring: "Monitoring", other: "Other cost" } as const;
export const DEAL_COST_BASES = { loan_amount: "Gross loan", investor_funding: "Investor capital", outstanding_principal: "Outstanding principal", interest: "Interest received" } as const;
export type DealServicingMode = "not_set" | "company_managed" | "transferred";
export type DealSetupStatus = "not_set" | "planned" | "in_progress" | "configured";
export type DealSoftwareMonitoring = { software_status: DealSetupStatus; monitoring_status: DealSetupStatus; provider?: string | null; notes?: string | null };
export type DealPayoffTerms = { interest_policy: "unknown" | "accrued_only" | "minimum_months"; minimum_interest_months: number | null; charge_amount: number | null; charge_recipient: "unknown" | "investor" | "company" | "third_party"; reserve_release: "unknown" | "at_payoff" | "contract_maturity" };
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
  applicability?: "all" | "company_managed" | "transferred";
};
export type DealBudgetWrite = {
  expected_revision: number; funding_mode: "single_investor" | "multiple_investors";
  costs_confirmed: boolean;
  loan_amount_mode?: "gross_loan" | "base_loan" | "target_net";
  base_loan_amount?: number | null;
  target_net_amount?: number | null;
  investor_funding_amount: number | null; minimum_investor_contribution: number | null; currency: string;
  rows: DealCostRow[]; note?: string | null;
  servicing_mode?: DealServicingMode;
  software_monitoring?: DealSoftwareMonitoring;
  payoff_terms?: DealPayoffTerms;
};
export type DealInvestorScenarioRow = { id: string; total_amount?: number | null; status?: string; applies?: boolean | null; [key: string]: unknown };
export type DealInvestorScenario = { status: string; horizon_months?: number | null; payoff_month?: number | null; capped_at_maturity?: boolean; principal_returned?: number | null; gross_interest?: number | null; earned_interest?: number | null; minimum_interest_charge?: number | null; payoff_charge_income?: number | null; total_fees?: number | null; known_fee_subtotal?: number | null; initial_outlay?: number | null; scheduled_net_income?: number | null; net_income?: number | null; net_cash_profit?: number | null; net_cash_received?: number | null; net_roi_pct?: number | null; reserve_released?: number | null; reserve_held?: number | null; rows?: DealInvestorScenarioRow[]; cash_flows?: Array<Record<string, unknown>>; assumptions?: string[]; missing_assumptions?: string[] };
export type DealBudgetCalculation = Record<string, unknown> & { investor_scenarios?: { six_month_payoff?: DealInvestorScenario; full_term?: DealInvestorScenario } };
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
  return { expected_revision: budget.revision, funding_mode: budget.funding_mode ?? "single_investor", costs_confirmed: budget.costs_confirmed === true, loan_amount_mode: budget.loan_amount_mode ?? "gross_loan", base_loan_amount: budget.base_loan_amount ?? null, target_net_amount: budget.target_net_amount ?? null, investor_funding_amount: budget.investor_funding_amount ?? null, minimum_investor_contribution: budget.minimum_investor_contribution ?? null, currency: budget.currency || "USD", rows: budget.rows.map(row => ({ ...row })), note: budget.note ?? null, servicing_mode: budget.servicing_mode ?? "not_set", software_monitoring: { software_status: budget.software_monitoring?.software_status ?? "not_set", monitoring_status: budget.software_monitoring?.monitoring_status ?? "not_set", provider: budget.software_monitoring?.provider ?? null, notes: budget.software_monitoring?.notes ?? null }, payoff_terms: { interest_policy: budget.payoff_terms?.interest_policy ?? "unknown", minimum_interest_months: budget.payoff_terms?.minimum_interest_months ?? null, charge_amount: budget.payoff_terms?.charge_amount ?? null, charge_recipient: budget.payoff_terms?.charge_recipient ?? "unknown", reserve_release: budget.payoff_terms?.reserve_release ?? "unknown" } };
}
export function dealBudgetChanged(draft: DealBudgetWrite, saved: DealBudget) {
  return JSON.stringify({ ...draft, expected_revision: undefined }) !== JSON.stringify({ ...dealBudgetWrite(saved), expected_revision: undefined });
}
export function newDealCost(): DealCostRow {
  return { id: crypto.randomUUID(), label: "", category: "closing_cost", payer: "borrower", method: "fixed", value: null, basis: "loan_amount", timing: "closing", settlement: "withheld", enabled: true, recipient_role: "third_party", recipient: null, notes: null, reserve_release: "unknown", origin: "manual" };
}
