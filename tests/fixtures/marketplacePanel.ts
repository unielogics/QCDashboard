// Fictional financial and marketplace records. No customer data or external calls.
export const MARKETPLACE_PROFILE = "97000000-0000-0000-0000-000000000001";

export function marketplacePlan(amount = 175000, revision = 1) {
  return { retire: [], exclude: [], add_backs: [], overrides: null, terms_ref: null, note: null,
    new_loan_amount: amount, new_loan_rate_pct: 15, new_loan_term_months: 36,
    new_loan_interest_only: false, new_loan_structure: "amortizing", new_loan_interest_only_months: 0,
    new_loan_repayment_config: null, new_loan_payments_per_year: 12, new_payment_monthly: null,
    new_payment_source: "manual_terms", updated_at: `2026-11-10T17:00:0${revision}Z` };
}

export function marketplaceBudget(amount = 175000, revision = 1) {
  return { profile_id: MARKETPLACE_PROFILE, revision, can_edit: true, funding_mode: "single_investor", costs_confirmed: true,
    loan_amount_mode: "gross_loan", base_loan_amount: null, target_net_amount: null, investor_funding_amount: null,
    minimum_investor_contribution: null, currency: "USD", rows: [], note: null,
    financing_context: { current_loan_amount: amount, plan_updated_at: "2026-11-10T17:00:01Z", terms_ref: null },
    calculation: { status: "ready", gross_loan_amount: amount, investor_funding_amount: amount,
      minimum_investor_contribution: amount, net_client_cash: amount, rows: [], warnings: [] } };
}

export function marketplaceCockpit(record = marketplacePlan()) {
  const basis = { key: "profit_and_loss", kind: "profit_and_loss", label: "Synthetic P&L", period: "2025", numerator: 180000,
    numerator_label: "Operating income", value: 7.5, annual_debt_service: 24000, status: "very_strong", currency: "USD", currency_comparable: true };
  return { profile_id: MARKETPLACE_PROFILE, requested_amount: 175000, generated_at: "2026-11-10T17:00:00Z",
    coverage: { files_analyzed: 1, files_accepted: 1, bank_months_accepted: 6, bank_months_required: 6, tax_years: [2025], has_profit_and_loss: true, debt_schedule_status: "complete", debt_rows: 0 },
    bank: { months: [], summary: { months: 0, gaps: [], first_month: null, last_month: null }, accounts: [], all_months: null, all_summary: null, recurring: { payees: [], months_read: [] } },
    tax: { years: [] }, profit_and_loss: null, balance_sheet: null, expenses: { lines: [] }, net_profit: { candidates: [], conclusion: null, note: null }, notes: [],
    debt: { obligations: [], service: { monthly: 2000, annual: 24000, source: "debt_schedule" }, schedule: { status: "complete", label: "Complete schedule", rows: 0, has_document: true }, reconciliation: { items: [] } },
    dscr: { headline: basis, candidates: [basis], thresholds: { acceptable: 1, healthy: 1.25, very_strong: 1.5 }, no_debt: false, annual_debt_service: 24000 },
    ebitda: { headline: null, candidates: [], potential: null, revenue_trend: { periods: [], notes: [], forecast: null } },
    noi: { policy_version: "noi-v2", status: "unavailable", review_needed: true, status_reason: "Synthetic scenario", reason_codes: [], headline: null, candidates: [], years: [], scenario: null },
    plan: { record, evaluation: { active: true, income_after_annual: 180000, debt_service_before_new_payment_monthly: 2000, retired_count: 0, loan_amount_needed: 0 }, levers: [], modifications: [], impact: null, schedule_rows: [] },
    proposed_terms: { source: "financial_plan", active_proposal: true, amount: record.new_loan_amount, rate_pct: 15, term_months: 36, payment_monthly: 6000, deal_budget_calculation: marketplaceBudget(record.new_loan_amount).calculation },
    operating_plan: { available: false, state: "not_started", evaluation: null }, operating_evidence: { files: [], expense_candidates: [], merchant_sources: [], merchant_offers: [], warnings: [] } };
}

export function marketplaceProduct(amount = 175000) {
  return { id: "synthetic-product", financing_source: "canonical_financing" as const, program_key: "private_loan_bridge", label: "Private Loan / Bridge", amount,
    rate_pct: 15, factor_rate: null, term_months: 36, interest_only: false, structure: "amortizing", interest_only_months: 0,
    repayment_config: null, payment_frequency: "monthly", payments_per_year: null, monthly_payment: 6000,
    primary: true, notes: "Synthetic saved financing", eligible: true };
}

export function marketplaceListing(amount = 175000) {
  return { id: "synthetic-listing", ref: "CP-SYNTHETIC", status: "draft", profile_id: MARKETPLACE_PROFILE,
    source_kind: "profile", name: "Operator title", summary: "Operator summary retained", vertical: "main_street",
    offered_amount: amount, minimum_investment: amount, products: [marketplaceProduct(amount)], files: [],
    funding_request: { target_amount: amount }, financials: {}, published_at: null };
}
