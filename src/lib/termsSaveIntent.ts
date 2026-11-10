import type { DealBudgetWrite } from "./dealBudget";
import type { FinancialPlanWrite } from "./financialCockpit";

const numericFields = new Set(["base_loan_amount", "target_net_amount", "investor_funding_amount", "minimum_investor_contribution", "value", "new_loan_amount", "new_loan_rate_pct", "new_loan_term_months", "new_loan_interest_only_months", "new_loan_payments_per_year", "new_payment_monthly", "amount_monthly", "income_annual", "debt_service_monthly"]);
function normalize(value: unknown, key = ""): unknown {
  if (numericFields.has(key) && typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (Array.isArray(value)) return value.map(item => normalize(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, normalize(item, name)]).sort(([a], [b]) => String(a).localeCompare(String(b))));
  return value;
}
/** Revision refreshes and Decimal serialization do not change the staff's save intent. */
export function termsSaveIntent(fields: unknown, plan?: FinancialPlanWrite | null, budget?: DealBudgetWrite | null) {
  return JSON.stringify(normalize({ fields, plan: plan ? { ...plan, expected_updated_at: undefined, expected_deal_budget_revision: undefined, updated_at: undefined, updated_by: undefined, terms_ref: undefined, new_payment_source: undefined } : null, budget: budget ? { ...budget, expected_revision: undefined } : null }));
}
