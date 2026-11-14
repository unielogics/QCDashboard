// The sample file the File design draws (a fictional auto-detail business),
// as the cockpit and the plan summary would return it. Used by the unit tests
// and by the browser check of the Financials grid. No client data.

import type { CockpitMonth, FinancialCockpit, Obligation, RecurringPayee } from "@/lib/financialCockpit";
import type { PlanSummary } from "@/lib/financialsOverview";
import type { OperatingEvaluation } from "@/lib/operatingPlan";

const MONTHS: Array<[string, string, number, number, number, number, number]> = [
  // month, label, deposits, withdrawals, low balance, negative days, NSF
  ["2026-05", "May 2026", 102_400, 120_900, -6_840, 5, 1],
  ["2026-06", "June 2026", 97_500, 114_600, 1_200, 0, 0],
  ["2026-07", "July 2026", 109_900, 118_400, -3_100, 4, 1],
  ["2026-08", "August 2026", 92_400, 112_100, -2_250, 3, 1],
  ["2026-09", "September 2026", 99_900, 125_900, -900, 2, 0],
  ["2026-10", "October 2026", 106_300, 115_500, 2_400, 0, 0],
];

export const harborMonths: CockpitMonth[] = MONTHS.map(([month, label, deposits, withdrawals, low, negativeDays, nsf]) => ({
  month, label, accounts: ["operating"], file_ids: [`statement-${month}`], accepted: true,
  deposits, withdrawals, net: deposits - withdrawals, beginning_balance: 12_000, ending_balance: 9_000, average_balance: 8_500, low_balance: low,
  deposit_count: 62, nsf, returned_checks: 0, negative_days: negativeDays, outflow_ratio: withdrawals / deposits, negative_dates: [], overdraft_items: [], fees: nsf * 35,
}));

export const harborBankSummary = {
  months: 6, accepted_months: 6, required_months: 6, first_month: "2026-05", last_month: "2026-10", gaps: [],
  avg_deposits: 101_400, avg_withdrawals: 117_900, avg_net: -16_500,
  annualized_deposits: 1_216_800, annualized_withdrawals: 1_414_800, annualized_net: -198_000,
  deposit_trend_pct: 1.2, deposit_volatility_pct: 6, highest_month: "2026-07", lowest_month: "2026-08",
  beginning_balance: 12_000, ending_balance: 9_000, average_balance: 8_500, average_balance_basis: "statement", lowest_balance: -6_840,
  avg_deposit_count: 62, nsf_total: 3, returned_checks_total: 0, negative_days_total: 14, avg_outflow_ratio: 1.16, estimates_available: true,
};

const debts: Array<[string, string, string, string, number, number, boolean]> = [
  ["northline", "Northline Capital", "merchant_cash_advance", "Advance", 286_000, 19_400, true],
  ["kestrel", "Kestrel Funding", "merchant_cash_advance", "Advance", 241_500, 16_900, true],
  ["bluewater", "Bluewater Advance", "merchant_cash_advance", "Advance", 198_000, 13_200, true],
  ["summit", "Summit Merchant", "merchant_cash_advance", "Advance", 142_300, 10_500, true],
  ["first-coast", "First Coast Equipment", "equipment_loan", "Equipment note", 212_400, 4_800, false],
];

const obligations: Obligation[] = debts.map(([id, lender, category, , balance, monthly, isMca]) => ({
  id: `row:${id}`, kind: "row", lender, category, is_mca: isMca, monthly, balance, payoff: balance, in_debt_service: true, count_in_dscr: true,
  linked_payee_key: null, linked_payee: null, observed_monthly: null, cadence: isMca ? "daily" : "monthly", source: "debt_schedule", origin: "staff",
}));

const payee = (key: string, name: string, cadence: string, average: number, monthly: number, kind: RecurringPayee["kind"] = "merchant_cash_advance"): RecurringPayee => ({
  key, payee: name, kind, kind_label: kind === "owner_draw" ? "Owner draw" : "Merchant cash advance", rationale: "", cadence, same_amount: true,
  occurrences: 60, total: monthly * 6, average_amount: average, monthly_average: monthly, monthly: {}, months: MONTHS.map((row) => row[0]), months_seen: 6,
  accounts: ["operating"], first_date: "2026-05-01", last_date: "2026-10-30", file_ids: [], accepted: true, is_debt: kind !== "owner_draw", is_card: false,
});

const metrics = (ebitda: number, annualDebt: number) => ({
  ebitda, noi: -30_777, dscr: Math.round((ebitda / annualDebt) * 100) / 100, free_cash_flow: ebitda - annualDebt, operating_margin: -2.49, debt_service: annualDebt,
});

/** The file as the design shows it: a filed 2025 return leads, client terms v3 are saved. */
export function harborCockpit(): FinancialCockpit {
  return {
    profile_id: "harbor-auto-detail",
    generated_at: "2026-11-11T15:00:00Z",
    requested_amount: 1_150_000,
    coverage: {
      files_analyzed: 12, files_accepted: 10, bank_months: 6, bank_months_accepted: 6, bank_months_required: 6, bank_accounts: [], bank_gaps: [],
      first_month: "2026-05", last_month: "2026-10", tax_years: ["2024", "2025"], has_profit_and_loss: true, has_balance_sheet: true,
      has_debt_schedule_document: false, debt_schedule_status: "rows", debt_rows: 5, documented_debts: 0, recurring_months_read: 6, statements_need_reread: 0, bank_files_need_reread: [],
    },
    bank: {
      months: harborMonths,
      summary: harborBankSummary,
      accounts: [],
      recurring: {
        payees: [
          payee("northline", "Northline Capital", "daily", 924, 19_400),
          payee("kestrel", "Kestrel Funding", "daily", 805, 16_900),
          payee("bluewater", "Bluewater Advance", "weekly", 3_046, 13_200),
          payee("summit", "Summit Merchant", "weekly", 2_423, 10_500),
          payee("owner", "Owner draw", "monthly", 3_600, 3_600, "owner_draw"),
        ],
        months_read: MONTHS.map((row) => row[0]), files_need_reread: [], total_monthly: 63_600,
        observed_debt_service_monthly: 60_000, observed_mca_monthly: 60_000, observed_loan_monthly: null, observed_card_monthly: null,
      },
      recurring_credits: { payees: [], months_read: [], files_need_reread: [], total_monthly: null, observed_debt_service_monthly: null, observed_mca_monthly: null, observed_loan_monthly: null, observed_card_monthly: null },
      overdrafts: { by_month: [], items: [], negative_days_total: 14, negative_months: ["2026-05", "2026-07", "2026-08", "2026-09"], nsf_total: 3, returned_total: 0, fees_total: 105, lowest_balance: -6_840 },
      account_movements: {
        schema_version: "qc_account_movements.v1", status: "available",
        nodes: [{ key: "operating", label: "Operating", counted: true, currencies: ["USD"], periods: [] }, { key: "payroll", label: "payroll account", counted: true, currencies: ["USD"], periods: [] }],
        links: [
          { id: "l1", from_account: "operating", to_account: "payroll", currency: "USD", period: "all", amount: 150_000, transaction_count: 26, status: "supported" },
          { id: "l2", from_account: "payroll", to_account: "operating", currency: "USD", period: "all", amount: 34_000, transaction_count: 6, status: "supported" },
        ],
        movements: [], coverage: { transaction_records: 900, files_with_detail: [], files_missing_detail: [], ignored_summary_records: 0, truncated: false },
        pagination: { offset: 0, limit: 0, total: 0, next_offset: null }, periods: MONTHS.map((row) => row[0]), notes: [],
      },
      counted_accounts: [], all_months: null, all_summary: null,
    },
    tax: {
      years: [
        { file_id: "return-2024", year: "2024", entity: "S corporation", basis: "accrual", period_start: "2024-01-01", period_end: "2024-12-31", gross_receipts: 1_301_050, gross_income: null, total_income: null, ordinary_business_income: 41_550, net_income: null, net_income_per_books: null, taxable_income: null, accepted: true, depreciation: 0, interest: 0, officer_compensation: null, cost_of_goods_sold: 618_200, salaries_and_wages: null, rent: null, taxes_and_licenses: null, advertising: null, total_deductions: 641_300, income: 41_550, income_basis: "ordinary income", ebitda: 41_550, ebitda_complete: true, net_margin: 0.032, gross_receipts_change_pct: null, income_change_pct: null },
        { file_id: "return-2025", year: "2025", entity: "S corporation", basis: "accrual", period_start: null, period_end: null, gross_receipts: 1_236_000, gross_income: null, total_income: 642_514, ordinary_business_income: -30_777, net_income: null, net_income_per_books: null, taxable_income: null, accepted: true, depreciation: 0, interest: 0, officer_compensation: null, cost_of_goods_sold: 601_886, salaries_and_wages: 348_194, rent: 196_805, taxes_and_licenses: 24_720, advertising: null, total_deductions: 664_891, income: -30_777, income_basis: "ordinary income", ebitda: -22_377, ebitda_complete: true, net_margin: -0.025, gross_receipts_change_pct: -5.0, income_change_pct: -174.1 },
      ],
    },
    profit_and_loss: {
      file_id: "pl-2026", business_name: "Harbor Auto Detail LLC", basis: "accrual", currency: "USD", period_start: "2026-01-01", period_end: "2026-09-30", period_label: "Jan–Sep 2026", months_covered: 9,
      gross_revenue: 878_400, cost_of_goods_sold: 441_300, gross_profit: 437_100, other_income: null, total_operating_expenses: 502_725, operating_income: -65_625, depreciation_and_amortization: null, interest: null, income_taxes: null, taxes_and_licenses: null, owner_salaries: null,
      net_income: -65_625, ebitda: -59_325, annualized_revenue: 1_171_200, annualized_ebitda: -79_100, typed: true, accepted: true, annualized_net_income: -87_500, annualized_operating_expenses: 670_300,
      gross_margin: 0.498, net_margin: -0.075, opex_ratio: 0.572, cogs_ratio: 0.502, statements: [],
    },
    balance_sheet: {
      file_id: "bs-2026", business_name: "Harbor Auto Detail LLC", as_of_date: "2026-09-30", basis: "accrual", currency: "USD", cash: 38_420, accounts_receivable: null, inventory: null, total_current_assets: null, total_fixed_assets: null, total_other_assets: null, total_assets: 612_900,
      accounts_payable: null, current_portion_long_term_debt: null, total_current_liabilities: null, total_long_term_liabilities: null, total_liabilities: 1_124_600, total_equity: -511_700, accepted: true, current_ratio: null, debt_to_equity: null,
    },
    expenses: { lines: [], outflow_ratio: 1.16, opex_ratio: 0.54, cogs_ratio: 0.49, debt_service_to_deposits: 0.64 },
    debt: {
      rows: debts.map(([id, lender, category, label, balance, monthly, isMca]) => ({ id, lender, category, category_label: label, is_mca: isMca, balance, monthly_payment: monthly, payment_amount: null, payment_frequency: null, rate: null, factor_rate: null, term_months: null, maturity_on: null, payoff_amount: balance, origin: "staff", count_in_dscr: true, source: "debt_schedule_row" as const })),
      documented: [], document: null,
      service: { monthly: 64_800, annual: 777_600, source: "accepted_debt_schedule", schedule_monthly: 64_800, schedule_balance: 1_080_200, schedule_rows_counted: 5, document_monthly: null, document_balance: null, documented_monthly: null, documented_balance: null, mca_count: 4, mca_monthly: 60_000, mca_balance: 867_800, observed_monthly: 60_000, observed_mca_monthly: 60_000, observed_loan_monthly: null, observed_card_monthly: null, unexplained_observed_monthly: null, declared_none: false, declaration_conflict: false },
      reconciliation: { rows: [], unmatched_observed: [], unmatched_documented: [], months_read: 6, matches: 4, differs: 0, not_seen: 1 },
      obligations,
      schedule: { status: "rows", label: "Saved debt schedule", rows: 5, documented: 0, has_document: false, voided: null, requested_at: null, received_at: null, requirement_status: null, requirement_present: true },
    },
    plan: {
      record: { retire: obligations.map((row) => row.id), exclude: [], new_payment_monthly: 14_800, new_payment_source: "term_sheet", new_loan_amount: 1_150_000, new_loan_rate_pct: 9.5, new_loan_term_months: 120, note: null },
      evaluation: { active: true, retired_ids: obligations.map((row) => row.id), excluded_ids: [], retired_monthly: 64_800, retired_count: 5, payoff_total: 1_080_200, payoff_unknown: 0, excluded_monthly: 0, new_payment_monthly: 14_800, new_payment_source: "term_sheet", loan_amount_needed: 1_150_000, debt_service_before_monthly: 64_800, debt_service_before_new_payment_monthly: 0, debt_service_after_monthly: 14_800, debt_service_after_annual: 177_600, candidates: [], headline_before: -0.03, headline_after: -0.13, headline_after_status: "concerning", headline_key: "tax_return", no_debt_left: false, replay: [], net_before_avg: -16_500, net_after_avg: 33_500, ending_before_last: 9_000, ending_after_last: 309_000, months_dipping_negative_before: 4, months_dipping_negative_after: 0, cash_kept: 300_000 },
      levers: [],
    },
    dscr: {
      candidates: [], headline: { key: "tax_return", label: "Tax return 2025", numerator: -22_377, numerator_label: "Filed return EBITDA", period: "2025", annual_debt_service: 777_600, value: -0.03, status: "concerning", pro_forma_value: null, pro_forma_status: "unavailable", confidence: "filed", note: null },
      pro_forma_headline: null, annual_debt_service: 777_600, debt_service_source: "accepted_debt_schedule", proposed: null, thresholds: { acceptable: 1, healthy: 1.25, very_strong: 1.5 }, reason: null, no_debt: false,
    },
    ebitda: {
      headline: null, candidates: [], reason: null,
      revenue_trend: {
        status: "available",
        periods: [
          { year: "2024", revenue: 1_301_050, average_monthly_revenue: 108_421, ebitda: 41_550, currency: "USD", file_id: "return-2024", file_name: "2024 1120-S.pdf", source_refs: [] },
          { year: "2025", revenue: 1_236_000, average_monthly_revenue: 103_000, ebitda: -22_377, currency: "USD", file_id: "return-2025", file_name: "2025 1120-S.pdf", source_refs: [] },
        ],
        comparison: { direction: "down", prior_year: "2024", current_year: "2025", prior_revenue: 1_301_050, current_revenue: 1_236_000, change_amount: -65_050, change_pct: -5.0, monthly_change: -5_421, comparable: true, reason: null },
        forecast: { status: "illustration", method: "p_and_l_run_rate", target_year: "2026", projected_revenue: 1_171_200, change_amount: -64_800, change_pct: -5.2, projected_ebitda: -79_100, ebitda_kind: "computed_ebitda", margin: -6.8, assumptions: [], source_refs: [], reason: null },
        notes: [],
      },
      potential: { available: true, baseline: { revenue: 1_236_000, earnings: -22_377, margin_pct: -1.81, period: "2025", currency: "USD" }, notes: [] },
    },
    baseline: {
      policy_version: "financial-baseline-v1", reason: null,
      source: { kind: "tax_return", label: "IRS 1120-S · 2025", file_id: "return-2025", selected_by: "rule", file_name: "2025 1120-S.pdf", form: "1120S", year: "2025", period_start: null, period_end: null, period_assumed: true, months_covered: 12, currency: "USD", basis: "accrual", income_basis: "ordinary income", accepted: true },
      ladder: [
        { key: "revenue", label: "Gross receipts", amount: 1_236_000, subtotal: false },
        { key: "cogs", label: "Cost of goods sold", amount: -601_886, subtotal: false },
        { key: "operating_expenses", label: "Operating deductions", amount: -664_891, subtotal: false },
        { key: "noi", label: "NOI", amount: -30_777, subtotal: true },
        { key: "other_income", label: "Other income", amount: 8_400, subtotal: false },
        { key: "depreciation_amortization", label: "Depreciation and amortization", amount: 0, subtotal: false },
        { key: "ebitda", label: "EBITDA", amount: -22_377, subtotal: true },
      ],
      figures: { revenue: 1_236_000, cogs: 601_886, other_income: 8_400, other_income_basis: "total_income", total_deductions: 664_891, interest: 0, depreciation_amortization: 0, income: -22_377, operating_expenses: 664_891, noi: -30_777, ebitda: -22_377, printed_operating_expenses: 664_891, reconciliation_difference: null, unread: [] },
      staff_adjustments: [],
      groups: {
        rows: [
          { key: "cogs", category: "cogs", label: "Cost of goods sold", amount: 601_886, fact_path: "cost_of_goods_sold" },
          { key: "salaries_and_wages", category: "salaries", label: "Salaries and wages", amount: 348_194, fact_path: "salaries_and_wages" },
          { key: "rent", category: "rent", label: "Rent", amount: 196_805, fact_path: "rent" },
          { key: "utilities", category: "utilities", label: "Utilities", amount: 31_400, fact_path: "utilities" },
          { key: "taxes_and_licenses", category: "other", label: "Taxes and licenses", amount: 24_720, fact_path: "taxes_and_licenses" },
          { key: "insurance", category: "insurance", label: "Insurance", amount: 22_600, fact_path: "insurance" },
          { key: "professional_fees", category: "professional_fees", label: "Professional fees", amount: 14_080, fact_path: "professional_fees" },
          { key: "other_deductions", category: "other", label: "Other deductions (rest of the return's total)", amount: 27_092, fact_path: "total_deductions", derived: true },
        ],
        outside_plan: [], status: "reconciled", listed: 1_266_777, total: 1_266_777, remainder: 27_092, reconciles: true,
      },
      debt_service: { source: "accepted_debt_schedule", currency: "USD", current_annual: 777_600, current_monthly: 64_800, obligations: 5, with_terms_annual: 177_600, with_terms_monthly: 14_800, released_monthly: 50_000, retired: 5, terms: { label: "Client terms v3", source: "client_terms", amount: 1_150_000, rate_pct: 9.5, term_months: 120, monthly_payment: 14_800 } },
      metrics: { current: metrics(-22_377, 777_600), with_terms: metrics(-22_377, 177_600) },
      targets: [
        { ratio: 1.0, current_debt: 799_977, with_terms: 199_977 },
        { ratio: 1.1, current_debt: 877_737, with_terms: 217_737 },
        { ratio: 1.25, current_debt: 994_377, with_terms: 244_377 },
      ],
      sources: [
        { key: "tax_return:return-2025", kind: "tax_return", label: "Filed return 2025", net_profit: -30_777, ebitda: -22_377, selected: true },
        { key: "profit_and_loss:pl-2026", kind: "profit_and_loss", label: "P&L Jan–Sep 2026 · annualized", net_profit: -87_500, ebitda: -79_100, selected: false },
        { key: "bank_cash_flow", kind: "bank_proxy", label: "Bank cash retained · proxy", net_profit: -198_000, ebitda: null, selected: false },
      ],
      notes: ["The return prints tax year 2025 without period dates; it is read as that full year."],
    },
    net_profit: { candidates: [], conclusion: null, note: null },
    notes: [],
  } as unknown as FinancialCockpit;
}

const action = (id: string, kind: string, label: string, impact: number, reviewed = false) => ({
  id, kind, label, status: "proposed", review_state: reviewed ? "approved" : "proposed", gross_annual_impact: impact, implementation_recurring_annual: 0, implementation_one_time: 0,
  net_annual_impact: impact, first_year_impact: impact, monthly_impact: impact / 12, included_in_approved_projection: reviewed, proposed_math_valid: true, included_in_proposed_projection: true, issues: [], risk_flags: [], source_file_ids: [],
});

/** The saved plan evaluated against that file: the design's "after" side. */
export function harborPlanSummary(): PlanSummary {
  const evaluation = {
    comparison: {
      loan_basis: "saved_terms", proposed_basis: "after_setup_before_timing",
      baseline: { earnings: -22_377, noi: -30_777, dscr: -0.03, cash_after_debt: -799_977, operating_margin: -2.49, debt_service: 777_600 },
      proposed: { earnings: 182_896.64, noi: 174_496.64, dscr: 1.03, cash_after_debt: 5_296.64, operating_margin: 11.6, debt_service: 177_600 },
      approved: { earnings: -22_377, noi: -30_777, dscr: -0.13, cash_after_debt: -199_977, operating_margin: -2.49, debt_service: 177_600 },
      target_gap: { proposed: 39_103.36, approved: 244_377 },
    },
    disclosure: { operating_monthly: 105_565, cogs_monthly: 50_157, operating_cash_monthly: 98_872, non_operating_monthly: 0, one_time_total: 0, active_count: 14, excluded_count: 0, missing_inputs: [], complete: true },
    actions: [
      action("a1", "unit_volume", "4 fleet contracts and 20% more billable hours", 89_616),
      action("a2", "marketing_investment", "Google Ads $3,000 / month, 40 added units", 36_844.28),
      action("a3", "product_cost_change", "Detail supplies −5%", 21_420),
      action("a4", "expense_reduction", "Rent renegotiation", 30_000),
      action("a5", "expense_reduction", "Insurance re-quote", 6_780),
      action("a6", "expense_reduction", "Software consolidation", 11_493.36),
      action("a7", "processing_cost_change", "Card processing quote", 23_520),
      action("a8", "new_activity", "Weekend detailer", -14_400),
    ],
    totals: {
      proposed: { annual_impact: 205_273.64, monthly_impact: 17_106.14, first_year_impact: 168_040.28, one_time_cost: 0, complete: true, count: 8 },
      approved: { annual_impact: 0, monthly_impact: 0, first_year_impact: 0, one_time_cost: 0, complete: true, count: 0 },
    },
    baseline: { period: "2025", currency: "USD", basis: "accrual", revenue: 1_236_000, earnings: -22_377, earnings_kind: "tax_estimate", noi: -30_777, dscr: -0.03, annual_debt_service: 777_600, provisional: false },
    projection: {}, missing: [], risk_flags: [], notes: [], all_actions_reviewed: false,
  } as unknown as OperatingEvaluation;
  return {
    has_plan: true, state: "published", expense_count: 14, action_count: 11, reviewed_action_count: 3, missing_count: 8, version_number: 1, version_id: "plan-version-1", updated_at: "2026-11-11T14:30:00Z", pdf_file_id: "plan-pdf-1",
    cost_mix: [
      { category: "cogs", annual_amount: 601_886, missing_count: 0, count: 1 },
      { category: "salaries", annual_amount: 348_194, missing_count: 0, count: 4 },
      { category: "rent", annual_amount: 196_805, missing_count: 0, count: 1 },
      { category: "other", annual_amount: 27_092, missing_count: 0, count: 3 },
    ],
    evaluation,
  };
}

/** The least a cockpit response can hold (older fixtures and partial responses look like this). */
export function bareCockpit(): FinancialCockpit {
  return {
    profile_id: "empty-file", generated_at: "2026-11-11T15:00:00Z", requested_amount: null,
    coverage: { files_analyzed: 0, files_accepted: 0, bank_months_accepted: 0, bank_months_required: 6, tax_years: [], has_profit_and_loss: false, debt_schedule_status: "missing", debt_rows: 0 },
    bank: { months: [], summary: { months: 0, gaps: [], first_month: null, last_month: null }, accounts: [], all_months: null, all_summary: null },
    tax: { years: [] }, profit_and_loss: null, balance_sheet: null, expenses: { lines: [] },
    dscr: { headline: null, no_debt: false }, net_profit: { candidates: [], conclusion: null, note: null }, notes: [],
  } as unknown as FinancialCockpit;
}

/** A file the desk has only just opened: nothing analyzed, no plan, no terms, the debt schedule not asked for yet. */
export function emptyCockpit(): FinancialCockpit {
  return {
    ...bareCockpit(),
    debt: {
      rows: [], documented: [], document: null, obligations: [],
      service: { monthly: null, annual: null, source: "none", schedule_monthly: null, schedule_balance: null, schedule_rows_counted: 0, document_monthly: null, document_balance: null, documented_monthly: null, documented_balance: null, mca_count: 0, mca_monthly: null, mca_balance: null, observed_monthly: null, observed_mca_monthly: null, observed_loan_monthly: null, observed_card_monthly: null, unexplained_observed_monthly: null, declared_none: false, declaration_conflict: false },
      reconciliation: { rows: [], unmatched_observed: [], unmatched_documented: [], months_read: 0, matches: 0, differs: 0, not_seen: 0 },
      schedule: { status: "missing", label: "Not requested yet", rows: 0, documented: 0, has_document: false, voided: null, requested_at: null, received_at: null, requirement_status: null, requirement_present: false, can_void: true },
    },
    plan: { record: { retire: [], exclude: [], new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, note: null }, evaluation: { active: false, retired_ids: [], excluded_ids: [], candidates: [], replay: [] }, levers: [] },
  } as unknown as FinancialCockpit;
}
