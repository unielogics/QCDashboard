import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const INTAKE = "71000000-0000-0000-0000-000000000001";
const PROFILE = "71000000-0000-0000-0000-000000000002";
const BUCKET = "71000000-0000-0000-0000-000000000003";
const FAMILY = "71000000-0000-0000-0000-000000000004";
type Json = Record<string, unknown>;
type Allocation = { id: string; label: string; amount_monthly: string | number | null; notes: string; expense_row_id?: string | null };
type PlanBody = { business_name: string; currency: string; no_operating_expenses_confirmed: boolean; expenses: unknown[]; adjustments: unknown[]; released_cash_flow: { source_fingerprint: string | null; allocations: Allocation[] } };
type ReviewMode = "automatic" | "source" | "manual";
type Receipt = { id: string; revision: number; at: string; mode: ReviewMode; selected_file_id: string | null; annual_value: number | null; year: number | null; currency: string | null; period_start: string | null; period_end: string | null; reason: string; source_refs: Json[]; source_stamp: string; actor_name: string; actor_id: string; source_metric: "noi" };
const TAX_2025 = "81000000-0000-0000-0000-000000000005";
const PNL_2025 = "81000000-0000-0000-0000-000000000006";
const TAX_2024 = "81000000-0000-0000-0000-000000000007";
const TAX_FORECAST = "81000000-0000-0000-0000-000000000008";

async function fixture(page: Page, options: { programFailure?: boolean; releaseUnavailable?: boolean; noRelease?: boolean; staleAllocation?: boolean; publishFailure?: boolean; unavailableCriteriaId?: boolean; recurringFeeNetRelease?: boolean; noSources?: boolean; readOnly?: boolean; reviewFailure?: boolean; reviewConflict?: boolean; rawPnl?: boolean; staleReview?: boolean; deferredBudgetSave?: boolean; automaticNoi?: number; annualNoiUnknown?: boolean; forecastFirst?: boolean; reviewedOperatingCoverage?: boolean } = {}) {
  const programSaves: Json[] = [], draftSaves: Json[] = [], versionSaves: Json[] = [], principalSaves: Json[] = [], budgetSaves: Json[] = [], unexpectedWrites: string[] = [], errors: string[] = [];
  const noiSaves: Json[] = [];
  let useOfFundsItems = [{ id: "sample-use", category: "working_capital", label: "Inventory and business reserves", amount: 180000 }], useOfFundsRevision = 1;
  let releaseBudgetSave = () => {};
  const budgetSaveGate = options.deferredBudgetSave ? new Promise<void>(resolve => { releaseBudgetSave = resolve; }) : Promise.resolve();
  let cockpitReads = 0, noiRevision = options.staleReview ? 1 : 0, sourceStamp = (options.staleReview ? "b" : "a").repeat(64), reviewFailed = false, reviewStale = Boolean(options.staleReview);
  let current: Receipt | null = options.staleReview ? { id: "review-old", revision: 1, at: "2026-11-10T17:00:00Z", mode: "manual", selected_file_id: null, annual_value: 42000, year: 2025, currency: "USD", period_start: null, period_end: null, reason: "Prior working estimate requires a current evidence review.", source_refs: [], source_stamp: "a".repeat(64), actor_name: "Case reviewer", actor_id: "reviewer", source_metric: "noi" } : null;
  const history: Receipt[] = current ? [current] : [];
  let operatingReviewBlocked = false;
  const noiSources = options.noSources ? [] : [
    { file_id: TAX_2025, file_name: "Sample business tax 2025.pdf", kind: "business_tax_return", year: 2025, currency: "USD", basis: "cash", period_start: options.annualNoiUnknown ? null : "2025-01-01", period_end: options.annualNoiUnknown ? null : "2025-12-31", proposed_annual_value: options.automaticNoi ?? -41000, eligible: true, reason: null, accepted: true, notes: ["Tax-derived operating estimate. Depreciation remains in operating expenses; explicit staff review is required."] },
    { file_id: PNL_2025, file_name: "Sample business P&L 2025.pdf", kind: "profit_and_loss", year: 2025, currency: "USD", basis: "accrual", period_start: "2025-01-01", period_end: "2025-12-31", proposed_annual_value: 58000, eligible: true, reason: null, accepted: true, notes: [] },
    { file_id: TAX_2024, file_name: "Sample business tax 2024.pdf", kind: "business_tax_return", year: 2024, currency: "USD", basis: "cash", period_start: "2024-01-01", period_end: "2024-12-31", proposed_annual_value: 21000, eligible: true, reason: null, accepted: true, notes: ["Historical source; the reviewed year remains explicit."] },
  ].map(row => ({ ...row, automatic_eligible: true, automatic_reason: null as string | null, source_stamp: "c".repeat(64), source_refs: [{ file_id: row.file_id, file_name: row.file_name, kind: row.kind, period_start: row.period_start, period_end: row.period_end, currency: row.currency, basis: row.basis }] }));
  if (options.forecastFirst && noiSources.length) noiSources.unshift({
    ...noiSources[0], file_id: TAX_FORECAST, file_name: "Sample future forecast 2026.pdf", year: 2026,
    period_start: "2026-01-01", period_end: "2026-12-31", proposed_annual_value: 99000,
    automatic_eligible: false, automatic_reason: "Forecast source; not the current actual operating basis.",
    source_refs: [{ file_id: TAX_FORECAST, file_name: "Sample future forecast 2026.pdf", kind: "business_tax_return", period_start: "2026-01-01", period_end: "2026-12-31", currency: "USD", basis: "cash" }],
  });
  const sourceNoi = options.rawPnl ? { key: `noi:${PNL_2025}`, label: "Business operating income (NOI)", kind: "business_operating_income", value: 58000, annualized_value: 58000, year: "2025", period: "2025-01-01 – 2025-12-31", period_start: "2025-01-01", period_end: "2025-12-31", months_covered: 12, annualization_factor: 1, currency: "USD", basis: "accrual", complete: true, provisional: false, fundamentals: [], notes: [], source_refs: noiSources.find(row => row.file_id === PNL_2025)?.source_refs ?? [] } : null;
  const automaticTaxNoi = options.noSources ? null : {
    key: `noi:${TAX_2025}`, label: "Tax-derived operating-income estimate", kind: "tax_derived_noi",
    value: options.automaticNoi ?? -41000, annualized_value: options.annualNoiUnknown ? null : options.automaticNoi ?? -41000,
    year: "2025", period: "2025 business tax return", period_start: options.annualNoiUnknown ? null : "2025-01-01", period_end: options.annualNoiUnknown ? null : "2025-12-31",
    months_covered: options.annualNoiUnknown ? null : 12, annualization_factor: options.annualNoiUnknown ? null : 1,
    currency: "USD", basis: "cash", complete: true, provisional: true, staff_reviewed: false, tax_derived_estimate: true,
    fundamentals: [], notes: ["Tax classifications require staff review; this is not verified P&L income."], source_refs: noiSources.find(row => row.file_id === TAX_2025)?.source_refs ?? [],
  };
  const effectiveNoi = () => {
    if (current?.mode === "automatic" || !current) return sourceNoi ?? automaticTaxNoi;
    if (reviewStale) return null;
    const source = noiSources.find(row => row.file_id === current?.selected_file_id);
    return { key: `noi:review:${current.id}`, label: source?.kind === "business_tax_return" ? "Tax-derived NOI · staff reviewed" : "Staff-reviewed NOI", kind: source?.kind === "business_tax_return" ? "tax_derived_noi" : "staff_reviewed_noi", value: current.annual_value, annualized_value: current.annual_value,
      source_value: source?.proposed_annual_value ?? null, reviewed_value: current.annual_value, year: String(current.year), period: current.period_start ? `${current.period_start} – ${current.period_end}` : String(current.year), period_start: current.period_start, period_end: current.period_end,
      months_covered: 12, annualization_factor: 1, currency: current.currency, basis: source?.basis ?? "staff_reviewed", complete: true, provisional: false, staff_reviewed: true, staff_adjusted: true, tax_derived_estimate: source?.kind === "business_tax_return", source_accepted: source?.accepted ?? false,
      fundamentals: [], notes: ["Explicit staff review; historical sources and EBITDA remain separate."], formula: "Staff-reviewed annual operating income", source_refs: current.source_refs, review_receipt: { id: current.id, revision: current.revision, at: current.at, mode: current.mode } };
  };
  const noiGovernance = () => {
    const status = reviewStale ? "stale" : current && current.mode !== "automatic" ? "reviewed" : options.noSources ? "unavailable" : sourceNoi ? "source_supported" : "provisional";
    return {
      policy_version: "business-noi-v2", status, review_needed: !["reviewed", "source_supported"].includes(status),
      status_reason: status === "stale" ? "The saved NOI review is stale. Review the latest evidence before relying on it." : status === "reviewed" ? "Staff reviewed this annual NOI basis; source limitations and program qualification remain separate." : status === "source_supported" ? "The current supported business P&L supplies operating income." : status === "unavailable" ? "No current annual operating-income basis is available." : options.annualNoiUnknown ? "The source-period amount is visible, but its annual reporting dates remain unconfirmed." : "Tax-derived operating income requires staff review; it is not verified P&L income or program eligibility.",
      reason_codes: [status === "provisional" ? options.annualNoiUnknown ? "annual_period_unconfirmed" : "tax_estimate" : status],
      authority_stamp: `${sourceStamp.slice(0, 63)}${noiRevision % 10}`,
    };
  };
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /maximum update depth|too many re-renders/i.test(message.text())) errors.push(message.text()); });
  let selected: string[] = options.unavailableCriteriaId ? ["special_review"] : [], manual = Boolean(options.unavailableCriteriaId), programFailed = false, publishFailed = false, revision = 1;
  const pinnedCriteria: Record<string, { id: string | null; version: number | null }> = {};
  let sharedAmount = 180000, budgetRevision = 1, planUpdatedAt = "2026-11-10T16:30:00Z";
  let costBudget: Json = { profile_id: PROFILE, revision: budgetRevision, can_edit: true, funding_mode: "single_investor", costs_confirmed: true, loan_amount_mode: "target_net", base_loan_amount: null, target_net_amount: 180000, investor_funding_amount: null, minimum_investor_contribution: null, currency: "USD", rows: [], note: null };
  const planRecord = () => ({ retire: [], exclude: [], add_backs: [], new_loan_amount: sharedAmount, new_loan_rate_pct: 15, new_loan_term_months: 24, new_loan_structure: "amortizing", new_loan_interest_only: false, new_loan_interest_only_months: 6, new_loan_repayment_config: { amortization_months: 24, balloons: [] }, new_loan_payments_per_year: 12, new_payment_monthly: null, new_payment_source: "manual_terms", terms_ref: null, overrides: null, note: "Preserve the reviewed coverage plan", updated_at: planUpdatedAt });
  const monthlyPayment = (amount: number) => amount * (0.15 / 12) / (1 - Math.pow(1 + 0.15 / 12, -24));
  const operatingCoverage = () => options.reviewedOperatingCoverage ? {
    status: operatingReviewBlocked ? "blocked" : "applied", applied: !operatingReviewBlocked,
    version_number: 2, annual_impact: 24000, first_year_impact: 18000,
    applied_annual_impact: operatingReviewBlocked ? 0 : 18000, candidate_impacts: { tax_return: operatingReviewBlocked ? 0 : 18000 },
    baseline_annual: -9000, projected_dscr: operatingReviewBlocked ? null : 9000 / (36000 + monthlyPayment(sharedAmount) * 12),
    reason: operatingReviewBlocked ? "Review the operating action against the changed NOI authority." : "Reviewed first-year action included after timing; the source baseline stays unchanged.",
  } : null;
  const planEvaluation = (amount = sharedAmount) => ({
    active: true, income_before_annual: -9000, income_after_annual: -9000 + (options.reviewedOperatingCoverage && !operatingReviewBlocked ? 18000 : 0),
    current_annual_debt_service: 36000, debt_service_after_annual: 36000 + monthlyPayment(amount) * 12,
    debt_service_after_monthly: 3000 + monthlyPayment(amount), no_debt_left: false,
    headline_after: (-9000 + (options.reviewedOperatingCoverage && !operatingReviewBlocked ? 18000 : 0)) / (36000 + monthlyPayment(amount) * 12),
    operating_plan: operatingCoverage(),
  });
  const pricedBudget = (value = costBudget) => {
    const rows = (value.rows ?? []) as Array<{ id: string; enabled: boolean; payer: string; timing: string; settlement: string; method: string; value: number | null }>;
    const closing = rows.filter(row => row.enabled && row.payer === "borrower" && row.timing === "closing");
    const included = closing.filter(row => value.loan_amount_mode === "target_net" ? ["financed", "withheld"].includes(row.settlement) : value.loan_amount_mode === "base_loan" && row.settlement === "financed");
    const percent = included.filter(row => row.method === "percent").reduce((sum, row) => sum + Number(row.value ?? 0) / 100, 0);
    const fixed = included.filter(row => row.method === "fixed").reduce((sum, row) => sum + Number(row.value ?? 0), 0);
    const input = Number(value.loan_amount_mode === "target_net" ? value.target_net_amount : value.loan_amount_mode === "base_loan" ? value.base_loan_amount : sharedAmount);
    const gross = Math.round((input + fixed) / (1 - percent) * 100) / 100;
    const rowAmount = (row: typeof rows[number]) => Math.round((row.method === "percent" ? gross * Number(row.value ?? 0) / 100 : Number(row.value ?? 0)) * 100) / 100;
    const cost = (settlement: string) => closing.filter(row => row.settlement === settlement).reduce((sum, row) => sum + rowAmount(row), 0);
    const net = Math.round((gross - cost("financed") - cost("withheld")) * 100) / 100;
    return { ...value, calculation: { status: "ready", gross_loan_amount: gross, net_client_cash: net, borrower_cash_after_separate_costs: net - cost("separate"), borrower_withheld_fees: cost("withheld"), investor_funding_amount: gross, minimum_investor_contribution: gross,
      principal_solution: { mode: value.loan_amount_mode, status: "calculated", gross_loan_amount: gross, financed_closing_costs: cost("financed"), withheld_closing_costs: cost("withheld"), requires_apply: gross !== sharedAmount },
      scheduled_payment: { monthly_equivalent: monthlyPayment(gross) }, rows: rows.map(row => ({ id: row.id, total_amount: rowAmount(row) })), financing_fee_coverage: { with_financing_fees_dscr: planEvaluation(gross).headline_after }, issues: [], assumptions: [] },
      financing_context: { current_loan_amount: sharedAmount, plan_updated_at: planUpdatedAt, terms_ref: null }, financial_plan: { profile_id: PROFILE, record: planRecord() }, financial_plan_evaluation: planEvaluation(gross) };
  };
  let versions: Json[] = options.reviewedOperatingCoverage ? [{ id: "operating-version-2", version_number: 2, created_at: "2026-11-10T16:35:00Z", actor_name: "Visual QA", source: "operator", source_file_id: null, pdf_file_id: "saved-operating-pdf", status: "published" }] : [];
  let planBody: PlanBody = { business_name: "Sample Manufacturing LLC", currency: "USD", no_operating_expenses_confirmed: true, expenses: [], adjustments: [],
    released_cash_flow: { source_fingerprint: options.staleAllocation ? "coverage-old" : null, allocations: options.staleAllocation ? [{ id: "old-allocation", label: "Existing payroll reserve", amount_monthly: 1000, notes: "Preserve the working allocation while reviewing the changed coverage plan." }] : [] } };
  const candidates = [
    { program_key: "private_bridge", program_name: "Private bridge review", eligible: false, recommendation_status: "not_eligible", playbook_id: "private-criteria", playbook_version: 3, reasons: ["Current coverage is below the published program minimum."], rule_state: "fail" },
    { program_key: "special_review", program_name: "Special review program", eligible: false, recommendation_status: "criteria_unavailable", playbook_id: options.unavailableCriteriaId ? "unavailable-criteria" : null, playbook_version: options.unavailableCriteriaId ? 1 : null, reasons: ["Published criteria unavailable. Underwriting review is required."], rule_state: "unavailable" },
  ].map((row, index) => ({ ...row, catalog_id: `catalog-${index}`, public_slug: row.program_key, fit_score: 0, confidence: 0, priority: index, requires_review: true, evidence_gaps: [] }));
  const readiness = () => ({ profile_id: PROFILE, lending_applicable: true, selection_mode: manual ? "manual" : "auto", selections: selected.map(key => {
    const row = candidates.find(candidate => candidate.program_key === key)!;
    return { id: `selection-${key}`, program_key: key, program_name: row.program_name, playbook_id: pinnedCriteria[key]?.id ?? null, playbook_version: pinnedCriteria[key]?.version ?? null,
      source: "operator", fit_score: 0, fit_confidence: 0, fit_reasons: row.reasons, selected_at: "2026-11-10T16:30:00Z", needs_scope_review: true };
  }), candidates, programs: [], requirements: [], evidence_policies: [], available_evidence_files: [], can_advance: false, automatic_stage_status: "not_ready",
  evidence_summary: { bank_statement_months: [], bank_statement_required_months: 6, bank_statement_file_count: 0, bank_statement_accepted_count: 0, bank_statement_processing_count: 0, bank_statement_needs_more_count: 0, bank_statement_rejected_count: 0, bank_statement_failed_count: 0, bank_statement_coverage_complete: false },
  automation: { enabled: false, eligible: false, attempts: 0, max_attempts: 3, stop_reason: "disabled" } });
  const release = (body = planBody) => {
    const amount = options.noRelease ? 0 : options.releaseUnavailable ? null : options.recurringFeeNetRelease ? 700 : 1000;
    const allocations = body.released_cash_flow?.allocations ?? [];
    const total = allocations.reduce((sum, row) => sum + Number(row.amount_monthly ?? 0), 0);
    const current = body.released_cash_flow?.source_fingerprint === "coverage-current";
    const retained = allocations.length > 0 || Boolean(body.released_cash_flow?.source_fingerprint);
    const required = !options.noRelease && !options.releaseUnavailable || retained;
    const complete = !required || amount != null && current && total === amount && allocations.length > 0 && allocations.every(row => row.label.trim() && Number(row.amount_monthly) > 0);
    const missing = complete ? [] : [amount == null ? "Save a current coverage plan before allocating its released cash flow." : !current ? "Review released cash flow allocations against the current saved coverage plan." : total > amount ? "Released cash flow allocations exceed the saved plan's monthly release." : "Allocate the full monthly cash flow released by the saved coverage plan."];
    return { required, available: !options.releaseUnavailable, status: complete ? "complete" : amount == null ? "unavailable" : !current && body.released_cash_flow?.source_fingerprint ? "stale" : "incomplete",
      source_fingerprint: amount == null ? null : "coverage-current", currency: "USD", amount_monthly: amount, allocated_monthly: total,
      unallocated_monthly: amount == null ? null : amount - total, complete, missing,
      source: amount == null ? null : { updated_at: "2026-11-10T16:30:00Z", before_monthly: 3000, after_monthly: options.noRelease ? 3000 : options.recurringFeeNetRelease ? 2100 : 2000,
        ...(options.recurringFeeNetRelease ? { new_operating_expenses_monthly: 200, new_financing_fees_monthly: 100 } : {}) }, allocations };
  };
  const evaluation = (body = planBody) => ({ context_stamp: "context-current", released_cash_flow: release(body),
    baseline: { period: "2025", currency: "USD", basis: "cash", revenue: null, earnings: null, earnings_kind: null, noi: effectiveNoi()?.annualized_value ?? null, noi_governance: { ...noiGovernance(), kind: effectiveNoi()?.kind, label: effectiveNoi()?.label, year: effectiveNoi()?.year, period: effectiveNoi()?.period, currency: effectiveNoi()?.currency }, dscr: -0.26, annual_debt_service: 36000, provisional: true },
    disclosure: { operating_monthly: 0, cogs_monthly: 0, operating_cash_monthly: 0, non_operating_monthly: 0, one_time_total: 0, active_count: 0, excluded_count: 0, missing_inputs: [], complete: true },
    actions: [], totals: { proposed: { annual_impact: 0, monthly_impact: 0, first_year_impact: 0, one_time_cost: 0, complete: true, count: 0 }, approved: { annual_impact: 0, monthly_impact: 0, first_year_impact: 0, one_time_cost: 0, complete: true, count: 0 } },
    projection: { proposed: { earnings: null, noi: null, dscr_current: null, dscr_with_refinance: null, annual_debt_service: 36000, refinance_annual_debt_service: 24000, target_gap_current: null, target_gap_refinance: null }, approved: { earnings: null, noi: null, dscr_current: null, dscr_with_refinance: null, annual_debt_service: 36000, refinance_annual_debt_service: 24000, target_gap_current: null, target_gap_refinance: null } },
    targets: { current: [], refinance: [] }, missing: release(body).missing, risk_flags: [], notes: [], all_actions_reviewed: true });
  const workspace = (saved?: Json) => ({ kind: "operating_plan", family_id: FAMILY, label: "Operating expenses and earnings plan", body: planBody,
    schema: {}, worksheet: { layout: { kind: "operating_plan", title: "Operating plan", schema_version: "test", layout_version: "test", name_prefix: "test", columns: [], rows: [] }, values: {}, computed: {} },
    draft: { revision, base_version_id: versions.at(-1)?.id ?? null, updated_at: "2026-11-10T16:30:00Z", dirty: !saved },
    current_version_id: versions.at(-1)?.id ?? null, versions, families: [{ id: FAMILY, kind: "operating_plan", label: "Operating plan", current_version_id: versions.at(-1)?.id ?? null }], evidence: [],
    completion: { complete: release().complete, missing_fields: release().missing, reason: release().complete ? "Complete" : release().missing[0], no_debt: false, active_rows: 0, released_cash_flow: release() },
    ...(saved ? { saved_version: saved, accepted_version_id: saved.id, accepted_completion: { complete: release().complete, missing_fields: release().missing, reason: release().complete ? "Complete" : release().missing[0], no_debt: false, active_rows: 0 } } : {}) });
  const basis = { key: "tax_return", label: "2025 business tax-derived earnings estimate", period: "2025", numerator: -9000, denominator: 36000, value: -0.25, annual_debt_service: 36000, status: "negative", complete: false, provisional: true, currency: "USD", currency_comparable: true, source_refs: [] };
  const cockpit = () => ({ profile_id: PROFILE, requested_amount: null, generated_at: "2026-11-10T16:30:00Z",
    coverage: { files_analyzed: 1, files_accepted: 0, bank_months_accepted: 0, bank_months_required: 6, tax_years: [2025], has_profit_and_loss: false, debt_schedule_status: "complete", debt_rows: 0 },
    bank: { months: [], summary: { months: 0, gaps: [], first_month: null, last_month: null }, accounts: [], all_months: null, all_summary: null, recurring: { payees: [], months_read: [] } },
    tax: { years: [] }, profit_and_loss: null, balance_sheet: null, expenses: { lines: [] }, net_profit: { candidates: [], conclusion: null, note: null }, notes: [],
    debt: { obligations: [], service: { monthly: 3000, annual: 36000 }, schedule: { status: "complete", label: "Completed schedule", rows: 0, documented: 0, has_document: true, voided: null, requested_at: null, received_at: null, requirement_status: "verified", requirement_present: true, can_void: false }, reconciliation: { items: [] } },
    dscr: { headline: basis, candidates: [basis], thresholds: { acceptable: 1, healthy: 1.25, very_strong: 1.5 }, no_debt: false, annual_debt_service: 36000 },
    ebitda: { headline: { ...basis, kind: "tax_estimate", value: -9000, annualized_value: -9000 }, candidates: [], reason: "A validated current business P&L is needed for EBITDA.", source_selection: { selected_file_id: "tax-2025", latest_file_id: "tax-2025", mode: "automatic", stale: false, sources: [{ file_id: "tax-2025", file_name: "2025 business taxes.pdf", period: "2025", kind: "tax_return", eligible: true, included: true, selected: true }] }, potential: null, revenue_trend: { periods: [], notes: [], forecast: null } },
    noi: { ...noiGovernance(), definition: { key: "business_operating_income", label: "Business operating income (NOI)", formula: "revenue - cost of goods sold - operating expenses" }, headline: effectiveNoi(), source_headline: sourceNoi, source_reason: sourceNoi ? null : "No current business P&L operating-income source is available.", candidates: sourceNoi ? [sourceNoi] : [], years: sourceNoi ? [sourceNoi] : [], reason: reviewStale ? "The saved NOI review is stale. Review the latest evidence before relying on it." : effectiveNoi() ? null : "No current business P&L operating-income source is available.", scenario: { ...noiGovernance(), current: effectiveNoi()?.annualized_value ?? null, plan: effectiveNoi()?.annualized_value ?? null, annual_debt_service_current: 36000, annual_debt_service_plan: 36000 + monthlyPayment(sharedAmount) * 12, after_debt_service_current: effectiveNoi()?.annualized_value == null ? null : effectiveNoi()!.annualized_value! - 36000, after_debt_service_plan: effectiveNoi()?.annualized_value == null ? null : effectiveNoi()!.annualized_value! - 36000 - monthlyPayment(sharedAmount) * 12, notes: [], operating_adjustments: [] }, trend: {},
      review: { revision: noiRevision, source_stamp: sourceStamp, mode: current?.mode ?? "automatic", stale: reviewStale, sources: noiSources, current, history } },
    metric_review: { revision: 0, source_stamp: "d".repeat(64), inputs: [], calculations: [], history: [], composition_history: [], corrections: [], stale_corrections: [], exclusions: [] },
    plan: { record: planRecord(), evaluation: planEvaluation(), levers: [], modifications: [], impact: null, schedule_rows: [] },
    proposed_terms: { source: "term_sheet", active_proposal: true, amount: 180000, rate_pct: 15, term_months: 24, payment_monthly: 2000, deal_budget_calculation: { gross_loan_amount: 180000, status: "ready" } },
    operating_plan: { available: versions.length > 0, state: versions.length ? "published" : "not_started", evaluation: evaluation(), package: { missing: release().missing, adjustments: [], risk_flags: [], all_actions_reviewed: true } }, operating_evidence: { files: [], expense_candidates: [], merchant_sources: [], merchant_offers: [], warnings: [] } });
  const verification = { ownership_total: 100, ownership_complete: true, owner_contact_complete: true, owner_count: 1, required_credit_owner_count: 1, completed_credit_owner_count: 1, pending_credit_owner_ids: [], missing_credit_contact_owner_ids: [], bank_linked: false, bank_connection_count: 0, bank_statement_months: 0, credit_returned: true, owner_credit_complete: true, business_banking_complete: false, evidence_complete: false, ready_for_step_2: true, unlocked: false, ownership_blockers: [], credit_blockers: [], banking_blockers: [], blockers: [] };
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);
  await page.route(/\/api\/v1\//, async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace(/\/+$/, "");
    let status = 200, body: unknown;
    if (path.endsWith("/auth/me")) body = { id: "10000000-0000-0000-0000-000000000001", clerk_id: "visual-qa", email: "franco@qualifiedcommercial.com", name: "Visual QA", role: options.readOnly ? "broker" : "super_admin" };
    else if (path.endsWith(`/admin/ai-underwriter-leads/${INTAKE}`)) body = { intake: { id: INTAKE, variant: "business_underwriting_v1", bucket_id: BUCKET, bucket_name: "Example secure room", full_name: "Example Client", business_name: "Sample Manufacturing LLC", email: "client@example.test", phone: "9735550148", status: "collecting", outcome_status: "pending", requested_loan_amount: null, file_count: 0, missing_required_count: 0, created_at: "2026-11-10T16:00:00Z", updated_at: "2026-11-10T16:30:00Z" }, requested_documents: [], files: [], latest_review: null, messages: [], artifacts: [], notes: [], email_sends: [] };
    else if (path.endsWith("/application-profiles/resolve")) body = { id: PROFILE, intake_id: INTAKE, primary_bucket_id: BUCKET, vertical: "main_street", owner_storage: "application", is_draft: false };
    else if (path.endsWith(`/${PROFILE}/intelligence`)) {
      const noi = effectiveNoi(), governance = noiGovernance();
      body = { profile_id: PROFILE, metrics: [{ key: "noi", label: "Annual NOI", applicable: true,
        value: noi?.annualized_value ?? null, unit: noi?.currency ?? null, status: governance.review_needed ? "needs_evidence" : "ready",
        calculation_status: governance.status, review_needed: governance.review_needed, status_reason: governance.status_reason,
        period: noi?.period ?? null, source: noi?.label ?? null, action: governance.review_needed ? "review_noi" : null }], dscr_inputs: {} };
    }
    else if (path.endsWith(`/${PROFILE}/financial-cockpit`) || path.endsWith(`/${PROFILE}/financial-metrics`)) { cockpitReads += 1; body = cockpit(); }
    else if (path.endsWith(`/${PROFILE}/financial-metrics/noi-review`)) {
      const payload = request.postDataJSON() as Json; noiSaves.push(payload);
      if (options.reviewConflict && !reviewFailed) { reviewFailed = true; noiRevision += 1; sourceStamp = "b".repeat(64); status = 409; body = { detail: "Financial source evidence changed; review NOI again before saving" }; }
      else if (options.reviewFailure && !reviewFailed) { reviewFailed = true; status = 503; body = { detail: "NOI review temporarily unavailable. Your entries are retained." }; }
      else {
        expect(payload.expected_revision).toBe(noiRevision); expect(payload.source_stamp).toBe(sourceStamp);
        const source = noiSources.find(row => row.file_id === payload.selected_file_id);
        noiRevision += 1; reviewStale = false;
        current = { id: `review-${noiRevision}`, revision: noiRevision, at: "2026-11-10T19:00:00Z", mode: payload.mode as ReviewMode, selected_file_id: payload.selected_file_id as string | null, annual_value: payload.annual_value as number | null,
          year: payload.year as number | null, currency: payload.currency as string | null, period_start: payload.period_start as string | null, period_end: payload.period_end as string | null, reason: String(payload.reason), source_refs: source?.source_refs ?? [], source_stamp: sourceStamp,
          actor_name: "Case reviewer", actor_id: "10000000-0000-0000-0000-000000000001", source_metric: "noi" };
        history.push(current); body = cockpit();
      }
    }
    else if (path.endsWith(`/${PROFILE}/deal-budget/preview`)) body = pricedBudget({ ...costBudget, ...request.postDataJSON() as Json });
    else if (path.endsWith(`/${PROFILE}/deal-budget/apply-principal`)) {
      const payload = request.postDataJSON() as Json; principalSaves.push(payload);
      expect(payload.expected_revision).toBe(budgetRevision);
      expect(payload.expected_plan_updated_at).toBe(planUpdatedAt);
      const calculated = pricedBudget(payload);
      sharedAmount = calculated.calculation.gross_loan_amount;
      planUpdatedAt = "2026-11-10T16:40:00Z"; budgetRevision += 1;
      costBudget = { ...costBudget, ...payload, revision: budgetRevision };
      body = pricedBudget();
    } else if (path.endsWith(`/${PROFILE}/deal-budget`)) body = pricedBudget();
    else if (path.endsWith(`/${PROFILE}/programs`) && request.method() === "PATCH") {
      const payload = request.postDataJSON() as Json; programSaves.push(payload);
      if (options.programFailure && !programFailed) { programFailed = true; status = 503; body = { detail: "Program selection temporarily unavailable. Retry your saved choices." }; }
      else { selected = payload.program_keys as string[]; for (const key of selected) { const row = candidates.find(candidate => candidate.program_key === key)!; if (!pinnedCriteria[key]?.id && row.recommendation_status !== "criteria_unavailable") pinnedCriteria[key] = { id: row.playbook_id, version: row.playbook_version }; } manual = true; body = readiness(); }
    } else if (path.endsWith(`/${PROFILE}/program-readiness`)) body = readiness();
    else if (path.endsWith(`/${PROFILE}/financial-workspace/draft`)) {
      const payload = request.postDataJSON() as Json; draftSaves.push(payload); expect(payload.expected_revision).toBe(revision); planBody = payload.body as PlanBody; revision += 1; body = workspace();
    } else if (path.endsWith(`/${PROFILE}/financial-workspace/versions`)) {
      versionSaves.push(request.postDataJSON() as Json);
      if (options.publishFailure && !publishFailed) { publishFailed = true; status = 503; body = { detail: "Version PDF temporarily unavailable. Your working plan remains saved." }; }
      else { const saved = { id: `version-${versions.length + 1}`, version_number: versions.length + 1, created_at: "2026-11-10T16:35:00Z", actor_name: "Visual QA", source: "operator", source_file_id: null, pdf_file_id: "saved-pdf", status: "published" }; versions = [...versions, saved]; body = workspace(saved); }
    } else if (path.endsWith(`/${PROFILE}/financial-workspace`)) body = workspace();
    else if (path.endsWith(`/${PROFILE}/operating-plan/summary`)) body = { has_plan: versions.length > 0, state: versions.length ? "published" : "not_started", expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: release().missing.length, version_number: versions.at(-1)?.version_number ?? null, cost_mix: [], evaluation: evaluation() };
    else if (path.endsWith(`/${PROFILE}/operating-plan/evidence`)) body = { files: [], expense_candidates: [], merchant_sources: [], merchant_offers: [], warnings: [] };
    else if (path.endsWith(`/${PROFILE}/operating-plan/evaluate`)) body = { evaluation: evaluation((request.postDataJSON() as { body: PlanBody }).body), context_stamp: "context-current", evidence: { files: [], expense_candidates: [], merchant_sources: [], merchant_offers: [], warnings: [] } };
    else if (path.endsWith(`/${PROFILE}/underwriting`)) body = { profile_id: PROFILE, source_kind: "intake", source_id: INTAKE, underwriting_status: "submitted", approved_amount: null, current_dscr: -0.25, target_dscr: 1.25, reviewer_notes: null };
    else if (path.endsWith(`/${PROFILE}/client-terms`)) body = { profile_id: PROFILE, version: 1, status: "draft", amount: 180000, apr_pct: 15, term_months: 24, loan_type: "private_loan_bridge", loan_type_label: "Private Loan / Bridge", loan_type_options: [], repayment_frequency: "monthly", conditions: [], financial_plan: { record: cockpit().plan.record }, can_edit: true };
    else if (path.endsWith(`/${PROFILE}/verification`)) body = verification;
    else if (path.endsWith(`/${PROFILE}/use-of-funds`)) {
      if (request.method() !== "GET") {
        const payload = request.postDataJSON() as Json; budgetSaves.push(payload);
        expect(payload.expected_revision).toBe(useOfFundsRevision);
        await budgetSaveGate;
        useOfFundsItems = (payload.items as typeof useOfFundsItems).map(row => ({ ...row, amount: Number(row.amount) }));
        useOfFundsRevision += 1;
      }
      body = { profile_id: PROFILE, items: useOfFundsItems, requested_amount: 180000, requested_amount_source: "intake.requested_loan_amount", total: 180000, category_totals: { working_capital: 180000 }, unallocated_amount: 0, complete: true, real_estate_equipment_amount: 0, real_estate_equipment_pct: 0, revision: useOfFundsRevision, can_edit: !options.readOnly, source: "profile", warnings: [], requires_exact_allocation: false, funding_request_revision: 0, payoff_only_alternative: false };
    }
    else if (path.endsWith(`/${PROFILE}/collateral`)) body = { profile_id: PROFILE, enabled: false, properties: [], assets: [], revision: 1, can_edit: !options.readOnly, property_options: [], source_file_options: [] };
    else if (path.endsWith(`/${PROFILE}/evidence-workspace`)) body = { profile_id: PROFILE, primary_bucket_id: BUCKET, primary_bucket_name: "Example secure room", program_readiness: readiness(), verification, forms: { forms: [], packets: [] }, evidence: { profile_id: PROFILE, sources: [], files: [], total_files: 0, review_file_count: 0, blockers: [] }, supporting_group: null, processing: { total_files: 0, analyzing_files: 0, accepted_files: 0, needs_attention_files: 0, failed_files: 0, has_processing: false }, can_manage_evidence: true, can_upload: true };
    else if (path.endsWith(`/${PROFILE}/collection-tasks`)) body = { tasks: [] };
    else if (/\/(owners|extracted-facts|deliveries|closing-stipulations)$/.test(path)) body = path.endsWith("closing-stipulations") ? { items: [], open_count: 0, ready_to_close: false } : [];
    else if (path.endsWith("/operator-files")) body = { items: [], limit: 500, rollup: { total: 0, promoted: 0, working: 0, needs_attention: 0, real_estate: 0, main_street: 0, dealer: 0, mca: 0 }, filters: {} };
    else if (path.endsWith("/settings")) body = { data: {} };
    else { if (!["GET", "HEAD"].includes(request.method())) unexpectedWrites.push(`${request.method()} ${path}`); status = 404; body = { detail: "Optional service unavailable in this synthetic fixture." }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/files/${INTAKE}?section=financials`, { waitUntil: "domcontentloaded" });
  if (options.readOnly) await page.waitForURL(url => !url.pathname.startsWith("/files/"));
  else {
    await page.getByRole("tab", { name: "Financials", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open earnings plan", exact: true })).toBeVisible();
  }
  return { programSaves, draftSaves, versionSaves, principalSaves, budgetSaves, releaseBudgetSave, noiSaves, unexpectedWrites, errors,
    makeNoiReviewStale: () => {
      current = { id: "review-became-stale", revision: 1, at: "2026-11-10T17:00:00Z", mode: "manual", selected_file_id: null, annual_value: 58000, year: 2025, currency: "USD", period_start: null, period_end: null, reason: "Previous annual review retained for audit only.", source_refs: [], source_stamp: "a".repeat(64), actor_name: "Case reviewer", actor_id: "reviewer", source_metric: "noi" };
      history.push(current); noiRevision = 1; sourceStamp = "b".repeat(64); reviewStale = true; operatingReviewBlocked = true;
    }, planBody: () => planBody, cockpitReads: () => cockpitReads,
    publishCriteria: () => { const row = candidates.find(candidate => candidate.program_key === "special_review")!; Object.assign(row, { playbook_id: "special-criteria", playbook_version: 1, recommendation_status: "not_eligible", reasons: ["New published criteria require underwriting review."] }); } };
}

const NOI_TILE = "Review NOI · operating income: calculation and source documents";
async function openNoi(page: Page) {
  await page.getByRole("button", { name: NOI_TILE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Financial metric review", exact: true });
  const editor = dialog.getByRole("region", { name: "Calculate or override NOI", exact: true });
  await expect(editor).toBeVisible();
  return { dialog, editor };
}

async function mainScrollState(page: Page) {
  return page.locator(".uw-step:not([hidden]) .uw-step-body").evaluate(element => {
    let outer = element.parentElement;
    while (outer && !(outer.scrollHeight > outer.clientHeight + 2 && /^(auto|scroll)$/.test(getComputedStyle(outer).overflowY))) outer = outer.parentElement;
    const scroller = outer ?? document.scrollingElement!;
    return { top: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight, innerRange: element.scrollHeight - element.clientHeight,
      dialogs: document.querySelectorAll('[role="dialog"]').length, scrims: document.querySelectorAll(".drawer-scrim").length,
      bodyOverflow: document.body.style.overflow, pointerEvents: getComputedStyle(document.body).pointerEvents, inert: Boolean(element.closest("[inert]")) };
  });
}

async function mainWheel(page: Page, delta: number) {
  const box = await page.locator(".uw-step:not([hidden]) .uw-step-body").boundingBox();
  if (!box) throw Error("Main Underwriting section missing");
  const viewport = page.viewportSize()!;
  await page.mouse.move(box.x + box.width / 2, Math.max(150, Math.min(viewport.height - 110, box.y + Math.min(180, box.height / 2))));
  for (let index = 0; index < 3; index += 1) { await page.mouse.wheel(0, delta); await page.waitForTimeout(100); }
}

for (const amount of [-41000, 0, 60000]) test(`automatic annual NOI ${amount} stays provisional across financials, Coverage, operating plan and intelligence`, async ({ page }, testInfo) => {
  const state = await fixture(page, { automaticNoi: amount, forecastFirst: true });
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
  const tile = page.getByRole("button", { name: "Review NOI · operating income: calculation and source documents", exact: true });
  await expect(tile).toContainText("Provisional NOI");
  await expect(tile).toContainText(money);
  const { dialog, editor } = await openNoi(page);
  await expect(editor.getByRole("combobox", { name: "NOI source document", exact: true })).toHaveValue(TAX_2025);
  await expect(editor.getByLabel("Reviewed annual NOI", { exact: true })).toHaveValue(String(amount));
  const status = dialog.getByRole("region", { name: "Current NOI status", exact: true });
  await expect(status).toContainText("Provisional NOI");
  await expect(dialog.getByText("Current financial figure", { exact: true }).locator("..")).toContainText(money);
  await expect(status).toContainText("Automatic business tax return estimate");
  await expect(status).toContainText("2025");
  await expect(status).toContainText("USD");
  await expect(status).toContainText("not verified P&L income or program eligibility");
  await status.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`governance-automatic-${amount}.png`), animations: "disabled" });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Advanced review", exact: true }).click();
  const coverage = page.getByRole("dialog", { name: /^Advanced financial review/ });
  await coverage.getByRole("tab", { name: "Coverage plan", exact: true }).click();
  await expect(coverage.getByRole("region", { name: "Current NOI status", exact: true })).toContainText(`Current annual NOI: ${money}`);
  await expect(coverage.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("Provisional NOI");
  await coverage.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Open earnings plan", exact: true }).click();
  const operating = page.getByRole("dialog", { name: "Financial workspace", exact: true });
  await operating.getByRole("tab", { name: "Before and after", exact: true }).click();
  await expect(operating.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("Provisional NOI");
  await expect(operating.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("2025 business tax return · USD");
  await expect(operating.locator("tr").filter({ hasText: "Annual NOI" }).first()).toContainText(money);
  await operating.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.getByRole("tab", { name: "File workspace", exact: true }).click();
  await page.locator(".submission-steps-rail").getByRole("button", { name: /AI review/ }).click();
  await page.getByText("Full breakdown: capital readiness, intelligence and extracted facts", { exact: true }).click();
  const intelligence = page.getByRole("region", { name: "Evidence-grounded metrics", exact: true });
  const reviewAction = intelligence.getByRole("button", { name: /^Open Annual NOI:/ });
  await expect(reviewAction).toContainText("Provisional NOI");
  await expect(reviewAction).toContainText(money);
  await expect(reviewAction).toContainText("Review NOI");
  await reviewAction.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("Provisional NOI");
  expect(state.noiSaves).toEqual([]);
  expect(state.principalSaves).toEqual([]);
  expect(state.budgetSaves).toEqual([]);
  expect(state.unexpectedWrites).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("reviewed first-year coverage remains separate from current NOI and stale source authority", async ({ page }, testInfo) => {
  const state = await fixture(page, { rawPnl: true, reviewedOperatingCoverage: true });
  await page.getByRole("button", { name: "Advanced review", exact: true }).click();
  const coverage = page.getByRole("dialog", { name: /^Advanced financial review/ });
  await coverage.getByRole("tab", { name: "Coverage plan", exact: true }).click();
  const effect = coverage.getByRole("region", { name: "Earnings plan effect on coverage", exact: true });
  await expect(effect).toContainText("Reviewed earnings plan included · v2");
  await expect(effect).toContainText("-0.25x");
  await expect(effect).toContainText("First-year earnings change applied");
  await expect(effect).toContainText("$18,000");
  await expect(effect).toContainText("Full-year run-rate change");
  await expect(effect).toContainText("$24,000");
  const monthly = 180000 * (0.15 / 12) / (1 - Math.pow(1 + 0.15 / 12, -24));
  await expect(effect).toContainText(`${(9000 / (36000 + monthly * 12)).toFixed(2)}x`);
  const current = coverage.getByRole("region", { name: "Current NOI status", exact: true });
  await expect(current).toContainText("P&L source supported");
  await expect(current).toContainText("Current annual NOI: $58,000.00");
  await expect(current).toContainText("2025-01-01 – 2025-12-31 · USD");
  await effect.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("combined-noi-operating-coverage.png"), animations: "disabled" });
  await coverage.getByRole("button", { name: "Close", exact: true }).click();
  state.makeNoiReviewStale();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Financials", exact: true }).click();
  const tile = page.getByRole("button", { name: NOI_TILE, exact: true });
  await expect(tile).toContainText("Unavailable");
  await expect(tile).toContainText("NOI needs re-review");
  await expect(tile).not.toContainText("58,000");
  await page.getByRole("button", { name: "Advanced review", exact: true }).click();
  await coverage.getByRole("tab", { name: "Coverage plan", exact: true }).click();
  await expect(current).toContainText("Current annual NOI: Unknown");
  await expect(current).toContainText("NOI needs re-review");
  await expect(effect).toContainText("Earnings plan needs reconciliation");
  await expect(effect).not.toContainText("First-year earnings change applied");
  expect(state.noiSaves).toEqual([]);
  expect(state.principalSaves).toEqual([]);
  expect(state.unexpectedWrites).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("a source-period NOI amount without annual dates never fills the current annual KPI", async ({ page }, testInfo) => {
  const state = await fixture(page, { automaticNoi: 12345, annualNoiUnknown: true });
  const tile = page.getByRole("button", { name: "Review NOI · operating income: calculation and source documents", exact: true });
  await expect(tile).toContainText("Unavailable");
  await expect(tile).toContainText("Provisional NOI");
  await expect(tile).not.toContainText("12,345");
  const { dialog } = await openNoi(page);
  const status = dialog.getByRole("region", { name: "Current NOI status", exact: true });
  await expect(dialog.getByText("Current financial figure", { exact: true }).locator("..")).toContainText("Unavailable");
  await expect(status).toContainText("annual reporting dates remain unconfirmed");
  await status.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("governance-source-period-only.png"), animations: "disabled" });
  expect(state.noiSaves).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("the complete programs and use-of-funds panel lives in Coverage plan while Underwriting retains program selection", async ({ page }, testInfo) => {
  const state = await fixture(page, { unavailableCriteriaId: true });
  await expect(page.getByText("Program criteria and use of funds", { exact: true })).toHaveCount(0);
  const initialNoi = await openNoi(page);
  await initialNoi.dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(initialNoi.dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Advanced review", exact: true }).click();
  const review = page.getByRole("dialog", { name: /^Advanced financial review/ });
  await review.getByRole("tab", { name: "Coverage plan", exact: true }).click();
  await expect(review.getByText("Program criteria and use of funds", { exact: true })).toBeVisible();
  await expect(review.getByRole("heading", { name: "Program selection", exact: true })).toBeVisible();
  await expect(review.getByRole("heading", { name: "How will the requested funds be used?", exact: true })).toBeVisible();
  await expect(review.getByRole("heading", { name: "Program completion", exact: true })).toBeVisible();
  await review.getByRole("button", { name: "Review budget", exact: true }).click();
  await expect(review.getByRole("textbox", { name: "Description for use 1", exact: true })).toHaveValue("Inventory and business reserves");
  const closeGeometry = await review.getByRole("button", { name: "Close", exact: true }).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight,
      reachable: hit === element || Boolean(hit && element.contains(hit)), pagePan: document.documentElement.scrollLeft };
  });
  expect(closeGeometry.left).toBeGreaterThanOrEqual(0);
  expect(closeGeometry.right).toBeLessThanOrEqual(closeGeometry.viewportWidth);
  expect(closeGeometry.top).toBeGreaterThanOrEqual(0);
  expect(closeGeometry.bottom).toBeLessThanOrEqual(closeGeometry.viewportHeight);
  expect(closeGeometry.reachable).toBe(true);
  expect(closeGeometry.pagePan).toBe(0);
  await writeFile(testInfo.outputPath("coverage-close-geometry.json"), JSON.stringify(closeGeometry, null, 2));
  await page.screenshot({ path: testInfo.outputPath("coverage-programs-and-uses.png"), animations: "disabled" });
  await review.getByRole("button", { name: "Hide budget", exact: true }).click();
  await review.getByRole("button", { name: "Manage programs", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose funding programs", exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Program selection", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage programs", exact: true })).toBeVisible();
  const before = await mainScrollState(page);
  expect(before).toMatchObject({ dialogs: 0, scrims: 0, bodyOverflow: "", pointerEvents: "auto", inert: false, innerRange: 0 });
  await mainWheel(page, 650);
  const down = await mainScrollState(page);
  expect(down.top).toBeGreaterThan(before.top);
  await mainWheel(page, -650);
  const up = await mainScrollState(page);
  expect(up.top).toBeLessThan(down.top);
  await page.locator(".uw-step:not([hidden]) .uw-step-body").evaluate(element => { const section = element as HTMLElement; section.tabIndex = 0; section.focus({ preventScroll: true }); });
  await page.keyboard.press("PageDown"); await page.waitForTimeout(150);
  const keyboard = await mainScrollState(page);
  expect(keyboard.top).toBeGreaterThan(up.top);
  await writeFile(testInfo.outputPath("noi-coverage-scroll-recovery.json"), JSON.stringify({ before, down, up, keyboard }, null, 2));
  expect(state.unexpectedWrites).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("unsaved use-of-funds entries survive Coverage tab changes and drawer reopening", async ({ page }, testInfo) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "Advanced review", exact: true }).click();
  const review = page.getByRole("dialog", { name: /^Advanced financial review/ });
  const observed: Array<{ navigation: string; expected: string; actual: string }> = [];
  for (const navigation of ["tab", "close"] as const) {
    await review.getByRole("tab", { name: "Coverage plan", exact: true }).click();
    const description = review.getByRole("textbox", { name: "Description for use 1", exact: true });
    if (!await description.isVisible()) await review.getByRole("button", { name: "Review budget", exact: true }).click();
    const expected = `Unsaved budget retained after ${navigation}`;
    await description.fill(expected);
    if (navigation === "tab") {
      await review.getByRole("tab", { name: "Working debt schedule", exact: true }).click();
      await review.getByRole("tab", { name: "Coverage plan", exact: true }).click();
    } else {
      await review.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Advanced review", exact: true }).click();
      await review.getByRole("tab", { name: "Coverage plan", exact: true }).click();
    }
    if (!await description.isVisible()) await review.getByRole("button", { name: "Review budget", exact: true }).click();
    await expect(description).toBeVisible();
    const actual = await description.inputValue();
    observed.push({ navigation, expected, actual });
    expect.soft(actual, `Unsaved budget after ${navigation}`).toBe(expected);
  }
  await writeFile(testInfo.outputPath("use-of-funds-draft-lifecycle.json"), JSON.stringify(observed, null, 2));
  await review.getByRole("textbox", { name: "Description for use 1", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("use-of-funds-retained-draft.png"), animations: "disabled" });
  expect(state.budgetSaves).toEqual([]);
  expect(state.unexpectedWrites).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("Coverage budget discard restores saved entries and a pending save blocks close and duplicate writes", async ({ page }) => {
  const state = await fixture(page, { deferredBudgetSave: true });
  await page.getByRole("button", { name: "Advanced review", exact: true }).click();
  const review = page.getByRole("dialog", { name: /^Advanced financial review/ });
  await review.getByRole("tab", { name: "Coverage plan", exact: true }).click();
  await review.getByRole("button", { name: "Review budget", exact: true }).click();
  const description = review.getByRole("textbox", { name: "Description for use 1", exact: true });
  await description.fill("Discard this unsaved entry");
  await review.getByRole("button", { name: "Discard edits", exact: true }).click();
  await expect(description).toHaveValue("Inventory and business reserves");
  expect(state.budgetSaves).toEqual([]);
  await description.fill("Reviewed saved allocation");
  await review.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect.poll(() => state.budgetSaves.length).toBe(1);
  const saving = review.getByRole("button", { name: "Saving…", exact: true });
  await expect(saving).toBeDisabled();
  await expect(review.getByRole("tab", { name: "Working debt schedule", exact: true })).toBeDisabled();
  await review.getByRole("button", { name: "Close", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(review).toBeVisible();
  await saving.scrollIntoViewIfNeeded();
  const saveBox = await saving.boundingBox();
  if (!saveBox) throw Error("Pending budget save control missing");
  expect(saveBox.y).toBeGreaterThanOrEqual(0);
  expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.mouse.click(saveBox.x + saveBox.width / 2, saveBox.y + saveBox.height / 2, { clickCount: 2 });
  expect(state.budgetSaves).toHaveLength(1);
  state.releaseBudgetSave();
  await expect(review.getByRole("status")).toContainText("Budget saved.");
  await expect(review.getByRole("button", { name: "Save budget", exact: true })).toBeDisabled();
  await review.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Advanced review", exact: true }).click();
  await review.getByRole("tab", { name: "Coverage plan", exact: true }).click();
  await review.getByRole("button", { name: "Review budget", exact: true }).click();
  await expect(description).toHaveValue("Reviewed saved allocation");
  await description.fill("A later unsaved draft");
  await review.getByRole("button", { name: "Discard edits", exact: true }).click();
  await expect(description).toHaveValue("Reviewed saved allocation");
  expect(state.budgetSaves).toHaveLength(1);
  expect(state.principalSaves).toEqual([]);
  expect(state.unexpectedWrites).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("source review prefills the selected document year and updates current NOI, history, tile and report context", async ({ page }, testInfo) => {
  const state = await fixture(page);
  const { dialog, editor } = await openNoi(page);
  await expect(editor.getByLabel("Reviewed annual NOI", { exact: true })).toHaveValue("-41000");
  await expect(editor).toContainText("Tax-return NOI estimate");
  await editor.getByRole("combobox", { name: "NOI source document", exact: true }).selectOption(PNL_2025);
  await expect(editor.getByLabel("Reviewed annual NOI", { exact: true })).toHaveValue("58000");
  await expect(editor).toContainText("P&L operating-income calculation");
  await editor.getByRole("combobox", { name: "NOI source document", exact: true }).selectOption(TAX_2024);
  await expect(editor.getByLabel("Reviewed annual NOI", { exact: true })).toHaveValue("21000");
  await expect(editor.getByLabel("NOI reviewed year", { exact: true })).toHaveValue("2024");
  await expect(editor.getByLabel("NOI reviewed currency", { exact: true })).toHaveValue("USD");
  await expect(editor.getByLabel("NOI period end", { exact: true })).toHaveValue("2024-12-31");
  await editor.getByLabel("NOI review reason", { exact: true }).fill("Reviewed the selected historical business tax year and retained depreciation in expenses.");
  await page.screenshot({ path: testInfo.outputPath("noi-source-review.png"), animations: "disabled" });
  await editor.getByRole("button", { name: "Save current NOI", exact: true }).click();
  await expect(editor).toContainText("Current NOI saved.");
  expect(state.noiSaves).toHaveLength(1);
  expect(state.noiSaves[0]).toMatchObject({ mode: "source", selected_file_id: TAX_2024, annual_value: 21000, year: 2024, currency: "USD", expected_revision: 0, source_stamp: "a".repeat(64), period_start: "2024-01-01", period_end: "2024-12-31" });
  await expect(dialog.getByText("Current financial figure", { exact: true }).locator("..")).toContainText("$21,000");
  await dialog.getByRole("tab", { name: "Review history", exact: true }).click();
  const history = dialog.getByRole("region", { name: "NOI review history", exact: true });
  await expect(history).toContainText("Source-based annual NOI");
  await expect(history).toContainText("2024");
  await expect(history).toContainText("Sample business tax 2024.pdf");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: NOI_TILE, exact: true })).toContainText("$21,000");
  await expect(page.getByRole("button", { name: NOI_TILE, exact: true })).toContainText("2024");
  await expect(page.locator("#package-readiness")).not.toContainText("Annual NOI needs a P&L");
  expect(state.cockpitReads()).toBeGreaterThan(1);
  expect(state.principalSaves).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

for (const amount of [0, -25000]) test(`manual annual NOI ${amount} can be saved without a P&L or source document`, async ({ page }, testInfo) => {
  const state = await fixture(page, { noSources: true });
  const { dialog, editor } = await openNoi(page);
  await expect(dialog.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("NOI unavailable");
  await expect(editor.getByRole("combobox", { name: "NOI review method", exact: true })).toHaveValue("manual");
  await expect(editor).toContainText("No eligible source calculation is available");
  await editor.getByLabel("Reviewed annual NOI", { exact: true }).fill(String(amount));
  await editor.getByLabel("NOI reviewed year", { exact: true }).fill("2025");
  await editor.getByLabel("NOI reviewed currency", { exact: true }).fill("USD");
  await editor.getByLabel("NOI review reason", { exact: true }).fill("Documented annual operating-income review; source statement will remain a separate evidence condition.");
  await editor.getByRole("button", { name: "Save current NOI", exact: true }).click();
  await expect(editor).toContainText("Current NOI saved.");
  expect(state.noiSaves[0]).toMatchObject({ mode: "manual", selected_file_id: null, annual_value: amount, year: 2025, currency: "USD", period_start: null, period_end: null });
  await expect(dialog.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("Staff-reviewed NOI");
  expect(state.principalSaves).toHaveLength(0);
  await expect(dialog.getByText("Current financial figure", { exact: true }).locator("..")).toContainText(amount === 0 ? "$0" : "$25,000");
  await page.screenshot({ path: testInfo.outputPath(`noi-manual-${amount === 0 ? "zero" : "negative"}.png`), animations: "disabled" });
  expect(state.errors).toEqual([]);
});

test("restoring automatic NOI returns the preserved P&L value and keeps both audit receipts", async ({ page }) => {
  const state = await fixture(page, { rawPnl: true });
  const { dialog, editor } = await openNoi(page);
  await expect(dialog.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("P&L source supported");
  await editor.getByRole("combobox", { name: "NOI review method", exact: true }).selectOption("manual");
  await editor.getByRole("combobox", { name: "NOI source document", exact: true }).selectOption("");
  await editor.getByLabel("Reviewed annual NOI", { exact: true }).fill("63000");
  await editor.getByLabel("NOI review reason", { exact: true }).fill("Working staff estimate recorded separately from the original P&L operating income.");
  await editor.getByRole("button", { name: "Save current NOI", exact: true }).click();
  await expect(editor).toContainText("Current NOI saved.");
  await editor.getByRole("combobox", { name: "NOI review method", exact: true }).selectOption("automatic");
  await editor.getByLabel("NOI review reason", { exact: true }).fill("Restore the original current P&L calculation after reviewing the working estimate.");
  await editor.getByRole("button", { name: "Restore automatic NOI", exact: true }).click();
  await expect(editor).toContainText("Automatic NOI calculation restored.");
  await expect(dialog.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("P&L source supported");
  await expect(dialog.getByText("Current financial figure", { exact: true }).locator("..")).toContainText("$58,000");
  expect(state.noiSaves[1]).toMatchObject({ mode: "automatic", annual_value: null, selected_file_id: null, year: null, currency: null, expected_revision: 1 });
  await dialog.getByRole("tab", { name: "Review history", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "NOI review history", exact: true })).toContainText("Manual annual NOI");
  await expect(dialog.getByRole("region", { name: "NOI review history", exact: true })).toContainText("Automatic NOI restored");
  expect(state.errors).toEqual([]);
});

test("source-year and date validation prevent saving mismatched reviewed periods", async ({ page }) => {
  const state = await fixture(page);
  const { editor } = await openNoi(page);
  await editor.getByRole("combobox", { name: "NOI source document", exact: true }).selectOption(TAX_2024);
  await editor.getByLabel("NOI review reason", { exact: true }).fill("Review the exact business statement year.");
  await editor.getByLabel("NOI reviewed year", { exact: true }).fill("2025");
  await expect(editor).toContainText("The reviewed year must match the selected source year.");
  await expect(editor.getByRole("button", { name: "Save current NOI", exact: true })).toBeDisabled();
  await editor.getByLabel("NOI reviewed year", { exact: true }).fill("2024");
  await editor.getByLabel("NOI period end", { exact: true }).fill("2025-12-31");
  await expect(editor).toContainText("ending in the reviewed year");
  await expect(editor.getByRole("button", { name: "Save current NOI", exact: true })).toBeDisabled();
  expect(state.noiSaves).toHaveLength(0);
});

test("failed saving retains values and retries with the same request identity", async ({ page }) => {
  const state = await fixture(page, { reviewFailure: true });
  const { editor } = await openNoi(page);
  await editor.getByLabel("NOI review reason", { exact: true }).fill("Retain this source review through a temporary server failure.");
  await editor.getByRole("button", { name: "Save current NOI", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("NOI review temporarily unavailable");
  await expect(editor.getByLabel("Reviewed annual NOI", { exact: true })).toHaveValue("-41000");
  await expect(editor.getByLabel("NOI reviewed year", { exact: true })).toHaveValue("2025");
  await expect(editor.getByLabel("NOI review reason", { exact: true })).toHaveValue("Retain this source review through a temporary server failure.");
  await editor.getByRole("button", { name: "Save current NOI", exact: true }).click();
  await expect(editor).toContainText("Current NOI saved.");
  expect(state.noiSaves).toHaveLength(2);
  expect(state.noiSaves[1]).toEqual(state.noiSaves[0]);
});

test("a stale response preserves entries until the reviewer acknowledges the latest evidence", async ({ page }) => {
  const state = await fixture(page, { reviewConflict: true });
  const { editor } = await openNoi(page);
  await editor.getByRole("combobox", { name: "NOI source document", exact: true }).selectOption(TAX_2024);
  await editor.getByLabel("Reviewed annual NOI", { exact: true }).fill("22000");
  await editor.getByLabel("NOI review reason", { exact: true }).fill("Keep this revised historical-year estimate while checking the refreshed source.");
  await editor.getByRole("button", { name: "Save current NOI", exact: true }).click();
  await expect(editor).toContainText("Your entries are retained");
  await expect(editor.getByLabel("Reviewed annual NOI", { exact: true })).toHaveValue("22000");
  await expect(editor.getByLabel("NOI reviewed year", { exact: true })).toHaveValue("2024");
  await expect(editor.getByRole("button", { name: "Save current NOI", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Use latest evidence, keep entries", exact: true }).click();
  await editor.getByRole("button", { name: "Save current NOI", exact: true }).click();
  await expect(editor).toContainText("Current NOI saved.");
  expect(state.noiSaves[1]).toMatchObject({ annual_value: 22000, year: 2024, selected_file_id: TAX_2024, expected_revision: 1, source_stamp: "b".repeat(64) });
});

test("an old stale review remains in history while current NOI stays unavailable until an explicit new review", async ({ page }) => {
  const state = await fixture(page, { staleReview: true });
  await expect(page.getByRole("button", { name: NOI_TILE, exact: true })).toContainText("Unavailable");
  const { dialog, editor } = await openNoi(page);
  await expect(dialog.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("NOI needs re-review");
  await expect(editor).toContainText("Previous NOI review · not current");
  await expect(editor).toContainText("Relevant evidence changed since this NOI review");
  await expect(editor.getByLabel("Reviewed annual NOI", { exact: true })).toHaveValue("42000");
  await editor.getByLabel("NOI review reason", { exact: true }).fill("Reconfirmed the annual amount against the latest evidence without reviving an earlier source automatically.");
  await editor.getByRole("button", { name: "Save current NOI", exact: true }).click();
  await expect(editor).toContainText("Current NOI saved.");
  expect(state.noiSaves[0]).toMatchObject({ annual_value: 42000, expected_revision: 1, source_stamp: "b".repeat(64) });
  await expect(dialog.getByRole("region", { name: "Current NOI status", exact: true })).toContainText("Staff-reviewed NOI");
});

test("a role without financial access never exposes NOI save controls or writes", async ({ page }) => {
  const state = await fixture(page, { readOnly: true });
  await expect(page.getByRole("tab", { name: "Financials", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: NOI_TILE, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save current NOI", exact: true })).toHaveCount(0);
  expect(state.noiSaves).toHaveLength(0);
  expect(state.errors).toEqual([]);
});
