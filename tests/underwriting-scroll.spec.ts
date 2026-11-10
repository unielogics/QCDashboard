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

async function fixture(page: Page, options: { programFailure?: boolean; releaseUnavailable?: boolean; noRelease?: boolean; staleAllocation?: boolean; publishFailure?: boolean; unavailableCriteriaId?: boolean; recurringFeeNetRelease?: boolean } = {}) {
  const programSaves: Json[] = [], draftSaves: Json[] = [], versionSaves: Json[] = [], principalSaves: Json[] = [], unexpectedWrites: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /maximum update depth|too many re-renders/i.test(message.text())) errors.push(message.text()); });
  let selected: string[] = options.unavailableCriteriaId ? ["special_review"] : [], manual = Boolean(options.unavailableCriteriaId), programFailed = false, publishFailed = false, revision = 1;
  const pinnedCriteria: Record<string, { id: string | null; version: number | null }> = {};
  let sharedAmount = 172488, budgetRevision = 1, planUpdatedAt = "2026-11-10T16:30:00Z";
  let costBudget: Json = { profile_id: PROFILE, revision: budgetRevision, can_edit: true, funding_mode: "single_investor", costs_confirmed: true, loan_amount_mode: "target_net", base_loan_amount: null, target_net_amount: 172488, investor_funding_amount: null, minimum_investor_contribution: null, currency: "USD", rows: [], note: null };
  const planRecord = () => ({ retire: [], exclude: [], add_backs: [], new_loan_amount: sharedAmount, new_loan_rate_pct: 15, new_loan_term_months: 24, new_loan_structure: "amortizing", new_loan_interest_only: false, new_loan_interest_only_months: 6, new_loan_repayment_config: { amortization_months: 24, balloons: [] }, new_loan_payments_per_year: 12, new_payment_monthly: null, new_payment_source: "manual_terms", terms_ref: null, overrides: null, note: "Preserve the reviewed coverage plan", updated_at: planUpdatedAt });
  const monthlyPayment = (amount: number) => amount * (0.15 / 12) / (1 - Math.pow(1 + 0.15 / 12, -24));
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
      scheduled_payment: { monthly_equivalent: monthlyPayment(gross) }, rows: rows.map(row => ({ id: row.id, total_amount: rowAmount(row) })), financing_fee_coverage: { with_financing_fees_dscr: -9000 / (36000 + monthlyPayment(gross) * 12) }, issues: [], assumptions: [] },
      financing_context: { current_loan_amount: sharedAmount, plan_updated_at: planUpdatedAt, terms_ref: null }, financial_plan: { profile_id: PROFILE, record: planRecord() }, financial_plan_evaluation: { active: true, headline_after: -9000 / (36000 + monthlyPayment(gross) * 12) } };
  };
  let versions: Json[] = [];
  let planBody: PlanBody = { business_name: "Example Therapy Services Inc", currency: "USD", no_operating_expenses_confirmed: true, expenses: [], adjustments: [],
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
    baseline: { period: "2025", currency: "USD", basis: "cash", revenue: null, earnings: null, earnings_kind: null, noi: null, dscr: -0.26, annual_debt_service: 36000, provisional: true },
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
    noi: { definition: { key: "business_operating_income", label: "Business operating income (NOI)", formula: "revenue - cost of goods sold - operating expenses" }, headline: null, candidates: [], years: [], reason: "A P&L for the latest business reporting period with operating income or complete revenue, COGS and operating expenses is needed. Tax net income and bank cash retained cannot establish NOI.", scenario: { notes: [], operating_adjustments: [] }, trend: {} },
    metric_review: { inputs: [], calculations: [], corrections: [], stale_corrections: [], exclusions: [] },
    plan: { record: planRecord(), evaluation: { active: true, debt_service_after_annual: 36000 + monthlyPayment(sharedAmount) * 12, current_annual_debt_service: 36000 }, levers: [], modifications: [], impact: null, schedule_rows: [] },
    proposed_terms: { source: "term_sheet", active_proposal: true, amount: 172488, rate_pct: 15, term_months: 24, payment_monthly: 2000, deal_budget_calculation: { gross_loan_amount: 172488, status: "ready" } },
    operating_plan: { available: versions.length > 0, state: versions.length ? "published" : "not_started", evaluation: evaluation(), package: { missing: release().missing, adjustments: [], risk_flags: [], all_actions_reviewed: true } }, operating_evidence: { files: [], expense_candidates: [], merchant_sources: [], merchant_offers: [], warnings: [] } });
  const verification = { ownership_total: 100, ownership_complete: true, owner_contact_complete: true, owner_count: 1, required_credit_owner_count: 1, completed_credit_owner_count: 1, pending_credit_owner_ids: [], missing_credit_contact_owner_ids: [], bank_linked: false, bank_connection_count: 0, bank_statement_months: 0, credit_returned: true, owner_credit_complete: true, business_banking_complete: false, evidence_complete: false, ready_for_step_2: true, unlocked: false, ownership_blockers: [], credit_blockers: [], banking_blockers: [], blockers: [] };
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);
  await page.route(/\/api\/v1\//, async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace(/\/+$/, "");
    let status = 200, body: unknown;
    if (path.endsWith("/auth/me")) body = { id: "10000000-0000-0000-0000-000000000001", clerk_id: "visual-qa", email: "franco@qualifiedcommercial.com", name: "Visual QA", role: "super_admin" };
    else if (path.endsWith(`/admin/ai-underwriter-leads/${INTAKE}`)) body = { intake: { id: INTAKE, variant: "business_underwriting_v1", bucket_id: BUCKET, bucket_name: "Example secure room", full_name: "Example Client", business_name: "Example Therapy Services Inc", email: "client@example.test", phone: "9735550148", status: "collecting", outcome_status: "pending", requested_loan_amount: null, file_count: 0, missing_required_count: 0, created_at: "2026-11-10T16:00:00Z", updated_at: "2026-11-10T16:30:00Z" }, requested_documents: [], files: [], latest_review: null, messages: [], artifacts: [], notes: [], email_sends: [] };
    else if (path.endsWith("/application-profiles/resolve")) body = { id: PROFILE, intake_id: INTAKE, primary_bucket_id: BUCKET, vertical: "main_street", owner_storage: "application", is_draft: false };
    else if (path.endsWith(`/${PROFILE}/financial-cockpit`)) body = cockpit();
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
    else if (path.endsWith(`/${PROFILE}/operating-plan/summary`)) body = { has_plan: versions.length > 0, state: versions.length ? "published" : "not_started", expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: release().missing.length, version_number: versions.length || null, cost_mix: [], evaluation: evaluation() };
    else if (path.endsWith(`/${PROFILE}/operating-plan/evidence`)) body = { files: [], expense_candidates: [], merchant_sources: [], merchant_offers: [], warnings: [] };
    else if (path.endsWith(`/${PROFILE}/operating-plan/evaluate`)) body = { evaluation: evaluation((request.postDataJSON() as { body: PlanBody }).body), context_stamp: "context-current", evidence: { files: [], expense_candidates: [], merchant_sources: [], merchant_offers: [], warnings: [] } };
    else if (path.endsWith(`/${PROFILE}/underwriting`)) body = { profile_id: PROFILE, source_kind: "intake", source_id: INTAKE, underwriting_status: "submitted", approved_amount: null, current_dscr: -0.25, target_dscr: 1.25, reviewer_notes: null };
    else if (path.endsWith(`/${PROFILE}/collateral`)) body = { profile_id: PROFILE, revision: 1, enabled: false, can_edit: true, properties: [], assets: [], property_options: [], source_file_options: [] };
    else if (path.endsWith(`/${PROFILE}/client-terms`)) body = { profile_id: PROFILE, version: 1, status: "draft", amount: 172488, apr_pct: 15, term_months: 24, loan_type: "private_loan_bridge", loan_type_label: "Private Loan / Bridge", loan_type_options: [], repayment_frequency: "monthly", conditions: [], financial_plan: { record: cockpit().plan.record }, can_edit: true };
    else if (path.endsWith(`/${PROFILE}/verification`)) body = verification;
    else if (path.endsWith(`/${PROFILE}/evidence-workspace`)) body = { profile_id: PROFILE, primary_bucket_id: BUCKET, primary_bucket_name: "Example secure room", program_readiness: readiness(), verification, forms: { forms: [], packets: [] }, evidence: { profile_id: PROFILE, sources: [], files: [], total_files: 0, review_file_count: 0, blockers: [] }, supporting_group: null, processing: { total_files: 0, analyzing_files: 0, accepted_files: 0, needs_attention_files: 0, failed_files: 0, has_processing: false }, can_manage_evidence: true, can_upload: true };
    else if (path.endsWith(`/${PROFILE}/collection-tasks`)) body = { tasks: [] };
    else if (/\/(owners|extracted-facts|deliveries|closing-stipulations)$/.test(path)) body = path.endsWith("closing-stipulations") ? { items: [], open_count: 0, ready_to_close: false } : [];
    else if (path.endsWith("/operator-files")) body = { items: [], limit: 500, rollup: { total: 0, promoted: 0, working: 0, needs_attention: 0, real_estate: 0, main_street: 0, dealer: 0, mca: 0 }, filters: {} };
    else if (path.endsWith("/settings")) body = { data: {} };
    else { if (!["GET", "HEAD"].includes(request.method())) unexpectedWrites.push(`${request.method()} ${path}`); status = 404; body = { detail: "Optional service unavailable in this synthetic fixture." }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/files/${INTAKE}?section=financials`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Financials", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open earnings plan", exact: true })).toBeVisible();
  return { programSaves, draftSaves, versionSaves, principalSaves, unexpectedWrites, errors, planBody: () => planBody,
    publishCriteria: () => { const row = candidates.find(candidate => candidate.program_key === "special_review")!; Object.assign(row, { playbook_id: "special-criteria", playbook_version: 1, recommendation_status: "not_eligible", reasons: ["New published criteria require underwriting review."] }); } };
}

type ScrollState = { outer: number; outerMax: number; inner: number; innerMax: number; overflowY: string; overscrollY: string; bodyOverflow: string; dialogs: number };

async function instrument(page: Page) {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/v1/")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await page.addInitScript(() => {
    const audit = { frames: [] as number[], longTasks: [] as number[], commits: 0, running: false };
    Object.assign(window, { scrollAudit: audit });
    const hook = { supportsFiber: true, renderers: new Map(), inject(renderer: unknown) { this.renderers.set(1, renderer); return 1; }, onCommitFiberRoot() { audit.commits += 1; }, onCommitFiberUnmount() {} };
    Object.assign(window, { __REACT_DEVTOOLS_GLOBAL_HOOK__: hook });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) new PerformanceObserver(list => { if (audit.running) audit.longTasks.push(...list.getEntries().map(entry => entry.duration)); }).observe({ type: "longtask", buffered: false });
    let previous = 0;
    function frame(now: number) { if (audit.running && previous) audit.frames.push(now - previous); previous = now; requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  });
  return requests;
}

async function state(page: Page): Promise<ScrollState> {
  return page.locator(".uw-step:not([hidden]) .uw-step-body").evaluate(element => {
    let parent = element.parentElement;
    while (parent && !(parent.scrollHeight > parent.clientHeight + 2 && /^(auto|scroll)$/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement;
    const outer = parent ?? document.scrollingElement!;
    const css = getComputedStyle(element);
    return { outer: outer.scrollTop, outerMax: outer.scrollHeight - outer.clientHeight, inner: element.scrollTop, innerMax: element.scrollHeight - element.clientHeight,
      overflowY: css.overflowY, overscrollY: css.overscrollBehaviorY, bodyOverflow: document.body.style.overflow, dialogs: document.querySelectorAll('[role="dialog"]').length };
  });
}

async function wheelInside(page: Page, delta: number, repeats = 7) {
  const box = await page.locator(".uw-step:not([hidden]) .uw-step-body").boundingBox();
  if (!box) throw new Error("Active main underwriting section missing");
  const viewport = page.viewportSize()!;
  await page.mouse.move(Math.max(10, Math.min(viewport.width - 10, box.x + box.width / 2)), Math.max(150, Math.min(viewport.height - 110, box.y + Math.min(180, box.height / 2))));
  for (let index = 0; index < repeats; index += 1) { await page.mouse.wheel(0, delta); await page.waitForTimeout(100); }
}

test("main Underwriting continues scrolling at section boundaries without dialogs or request loops", async ({ page }, testInfo) => {
  const requests = await instrument(page);
  await fixture(page, { unavailableCriteriaId: true });
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  const active = page.locator(".uw-step:not([hidden]) .uw-step-body");
  await expect(active).toBeVisible();
  await page.waitForTimeout(700);
  await page.evaluate(() => { const audit = (window as unknown as { scrollAudit: { frames: number[]; longTasks: number[]; commits: number; running: boolean } }).scrollAudit; audit.frames = []; audit.longTasks = []; audit.commits = 0; audit.running = true; });
  const start = await state(page), requestStart = requests.length;
  await wheelInside(page, 650);
  const down = await state(page);
  // Advance from the page gutter so reverse chaining is measured even on a
  // broken inner scrollport. Never write scrollTop or call scrollIntoView.
  await page.mouse.move(page.viewportSize()!.width - 3, 300);
  await page.mouse.wheel(0, 500); await page.waitForTimeout(150);
  const beforeReverse = await state(page);
  await wheelInside(page, -650);
  const reverse = await state(page);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press("Control+Home"); await page.waitForTimeout(150);
  await active.evaluate(element => { const section = element as HTMLElement; section.tabIndex = 0; section.focus({ preventScroll: true }); });
  const beforeKeyboard = await state(page);
  await page.keyboard.press("PageDown"); await page.waitForTimeout(150);
  await page.keyboard.press("PageDown"); await page.waitForTimeout(150);
  const keyboard = await state(page);
  const beforeIdleRequests = requests.length;
  await page.waitForTimeout(1000);
  const performance = await page.evaluate(() => {
    const audit = (window as unknown as { scrollAudit: { frames: number[]; longTasks: number[]; commits: number; running: boolean } }).scrollAudit;
    audit.running = false;
    const sorted = [...audit.frames].sort((a, b) => a - b);
    return { frames: sorted.length, p95FrameMs: sorted[Math.floor(sorted.length * .95)] ?? null, maxFrameMs: sorted.at(-1) ?? null, longTasks: audit.longTasks, commits: audit.commits };
  });
  const metrics = { start, down, beforeReverse, reverse, beforeKeyboard, keyboard, performance, requestsDuringGestures: requests.slice(requestStart), requestsDuringIdle: requests.slice(beforeIdleRequests) };
  await writeFile(testInfo.outputPath("underwriting-scroll-metrics.json"), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: testInfo.outputPath("underwriting-scroll-main.png"), animations: "disabled" });
  expect(start.dialogs).toBe(0);
  expect(down.outer - start.outer, "wheel must continue the main page instead of stopping at an inner section").toBeGreaterThan(40);
  expect(reverse.outer, "reverse wheel must leave the main page free to move upward").toBeLessThan(beforeReverse.outer);
  expect(keyboard.outer, "PageDown must advance the main page").toBeGreaterThan(beforeKeyboard.outer);
  expect(requests.length - beforeIdleRequests).toBeLessThanOrEqual(1);
});

test("a short Underwriting step does not consume wheel input when it has no inner scroll range", async ({ page }, testInfo) => {
  await fixture(page, { unavailableCriteriaId: true });
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  await page.locator("#uw-tab-close").click();
  await expect(page.locator("#uw-close")).toBeVisible();
  const start = await state(page);
  await wheelInside(page, 500, 4);
  const down = await state(page);
  await page.mouse.move(page.viewportSize()!.width - 3, 300);
  await page.mouse.wheel(0, 500); await page.waitForTimeout(150);
  const gutter = await state(page);
  await writeFile(testInfo.outputPath("underwriting-short-scroll-metrics.json"), JSON.stringify({ start, down, gutter }, null, 2));
  expect(start.dialogs).toBe(0);
  expect(start.innerMax).toBe(0);
  if (start.outerMax > 4) expect(down.outer, "a zero-range main section must not swallow the page's wheel gesture").toBeGreaterThan(start.outer);
});

test("all four main Underwriting steps keep native page scrolling available", async ({ page }, testInfo) => {
  const result = await fixture(page, { unavailableCriteriaId: true });
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  const metrics: unknown[] = [];
  for (const key of ["terms", "offer", "accepted", "close"]) {
    await page.locator(`#uw-tab-${key}`).click();
    await expect(page.locator(`#uw-${key}`)).toBeVisible();
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.keyboard.press("Control+Home"); await page.waitForTimeout(100);
    const start = await state(page);
    await wheelInside(page, 650, 3);
    const down = await state(page);
    metrics.push({ key, start, down });
    expect(start.dialogs).toBe(0);
    expect(start.bodyOverflow).toBe("");
    expect(start.innerMax).toBe(0);
    if (start.outerMax > 4) expect(down.outer, `${key} wheel input must reach the page`).toBeGreaterThan(start.outer);
  }
  await writeFile(testInfo.outputPath("all-underwriting-steps.json"), JSON.stringify(metrics, null, 2));
  expect(result.errors).toEqual([]);
});

test("full terms collateral and cost views scroll and release the page lock on close", async ({ page }, testInfo) => {
  const result = await fixture(page, { unavailableCriteriaId: true });
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  const originalOverflow = await page.evaluate(() => document.body.style.overflow);
  await page.getByRole("button", { name: "Open full terms", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Client terms editor", exact: true });
  await expect(editor).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await editor.getByRole("tab", { name: "Collateral", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Add asset", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Add asset", exact: true }).click();
  await editor.getByLabel("Asset 1 description", { exact: true }).fill("Business equipment draft remains available after changing the view.");
  await editor.getByRole("tab", { name: "Investment & closing costs", exact: true }).click();
  for (let index = 0; index < 9; index += 1) await editor.getByRole("button", { name: "Add cost", exact: true }).click();
  const scrollTotal = () => editor.evaluate(element => [...element.querySelectorAll<HTMLElement>("*")].reduce((total, child) => total + child.scrollTop, 0));
  const box = await editor.locator(".drawer-b").boundingBox();
  if (!box) throw new Error("Terms body missing");
  await page.mouse.move(box.x + 30, box.y + Math.min(220, box.height / 2));
  await page.mouse.wheel(0, -1400); await page.waitForTimeout(150);
  const before = await scrollTotal();
  await page.mouse.wheel(0, 750); await page.waitForTimeout(200);
  const after = await scrollTotal();
  expect(after, "cost views must remain scrollable inside their intentional dialog").toBeGreaterThan(before);
  await writeFile(testInfo.outputPath("terms-scroll-recovery.json"), JSON.stringify({ before, after, originalOverflow }, null, 2));
  await editor.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".drawer-scrim")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press("Control+Home"); await page.waitForTimeout(100);
  const start = await state(page);
  await wheelInside(page, start.outer > start.outerMax / 2 ? -650 : 650, 3);
  const recovered = await state(page);
  expect(Math.abs(recovered.outer - start.outer)).toBeGreaterThan(10);
  await writeFile(testInfo.outputPath("terms-scroll-recovery.json"), JSON.stringify({ before, after, originalOverflow, pageBefore: start, pageAfter: recovered }, null, 2));
  expect(result.unexpectedWrites).toEqual([]);
  expect(result.errors).toEqual([]);
});

test("nested program picker returns wheel and focus ownership to the page after both dialogs close", async ({ page }) => {
  const result = await fixture(page, { unavailableCriteriaId: true });
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  await page.getByRole("button", { name: "Coverage plan", exact: true }).click();
  const review = page.getByRole("dialog", { name: /^Advanced financial review/ });
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Manage programs", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose funding programs", exact: true });
  await expect(picker).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.locator(".drawer-scrim")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press("Control+Home"); await page.waitForTimeout(100);
  const start = await state(page);
  await wheelInside(page, start.outer > start.outerMax / 2 ? -650 : 650, 3);
  expect(Math.abs((await state(page)).outer - start.outer)).toBeGreaterThan(10);
  expect(result.errors).toEqual([]);
});
