import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const INTAKE = "71000000-0000-0000-0000-000000000001";
const PROFILE = "71000000-0000-0000-0000-000000000002";
const BUCKET = "71000000-0000-0000-0000-000000000003";
const FAMILY = "71000000-0000-0000-0000-000000000004";
type Json = Record<string, unknown>;
type Allocation = { id: string; label: string; amount_monthly: string | number | null; notes: string; expense_row_id?: string | null };
type PlanBody = { business_name: string; currency: string; no_operating_expenses_confirmed: boolean; expenses: unknown[]; adjustments: unknown[]; released_cash_flow: { source_fingerprint: string | null; allocations: Allocation[] } };

async function fixture(page: Page, options: { programFailure?: boolean; releaseUnavailable?: boolean; noRelease?: boolean; staleAllocation?: boolean; publishFailure?: boolean; unavailableCriteriaId?: boolean } = {}) {
  const programSaves: Json[] = [], draftSaves: Json[] = [], versionSaves: Json[] = [], unexpectedWrites: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /maximum update depth|too many re-renders/i.test(message.text())) errors.push(message.text()); });
  let selected: string[] = options.unavailableCriteriaId ? ["special_review"] : [], manual = Boolean(options.unavailableCriteriaId), programFailed = false, publishFailed = false, revision = 1;
  const pinnedCriteria: Record<string, { id: string | null; version: number | null }> = {};
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
    const amount = options.noRelease ? 0 : options.releaseUnavailable ? null : 1000;
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
      source: amount == null ? null : { updated_at: "2026-11-10T16:30:00Z", before_monthly: 3000, after_monthly: options.noRelease ? 3000 : 2000 }, allocations };
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
    plan: { record: { retire: [], exclude: [], add_backs: [], new_loan_amount: 172488, new_loan_rate_pct: 15, new_loan_term_months: 24, updated_at: "2026-11-10T16:30:00Z" }, evaluation: { active: true, debt_service_after_annual: 24000, current_annual_debt_service: 36000 }, levers: [], modifications: [], impact: null, schedule_rows: [] },
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
  return { programSaves, draftSaves, versionSaves, unexpectedWrites, errors, planBody: () => planBody,
    publishCriteria: () => { const row = candidates.find(candidate => candidate.program_key === "special_review")!; Object.assign(row, { playbook_id: "special-criteria", playbook_version: 1, recommendation_status: "not_eligible", reasons: ["New published criteria require underwriting review."] }); } };
}

test("a poor-fit and criteria-unavailable program can be selected without a note and persist across both workspaces", async ({ page }, testInfo) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "Advanced review", exact: true }).click(); await page.getByRole("dialog", { name: /^Advanced financial review/ }).getByRole("tab", { name: "Coverage plan", exact: true }).click();
  const plan = page.getByRole("dialog", { name: /^Advanced financial review/ });
  await plan.getByRole("button", { name: "Choose programs", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose funding programs", exact: true });
  await picker.getByRole("checkbox", { name: /Private bridge review/ }).check();
  await picker.getByRole("checkbox", { name: /Special review program/ }).check();
  await expect(picker.getByRole("textbox", { name: "Review note (optional)", exact: true })).toHaveValue("");
  await expect(picker).toContainText("AI fit is advisory");
  await expect(picker.getByRole("button", { name: "Apply manual selection", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("manual-program-selection.png"), animations: "disabled" });
  await picker.getByRole("button", { name: "Apply manual selection", exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(state.programSaves).toEqual([{ program_keys: ["private_bridge", "special_review"], return_to_ai: false, confirmed: true, reason: "Operator reviewed program selection" }]);
  await expect(plan).toContainText("Private bridge review");
  await expect(plan).toContainText("Special review program");
  await plan.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Program selection", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manage programs", exact: true }).click();
  await expect(picker.getByRole("checkbox", { name: /Private bridge review/ })).toBeChecked();
  await expect(picker.getByRole("checkbox", { name: /Special review program/ })).toBeChecked();
  expect(state.errors).toEqual([]);
});

test("failed program selection retains selected programs and a short optional note for retry", async ({ page }) => {
  const state = await fixture(page, { programFailure: true });
  await page.getByRole("button", { name: "Advanced review", exact: true }).click(); await page.getByRole("dialog", { name: /^Advanced financial review/ }).getByRole("tab", { name: "Coverage plan", exact: true }).click();
  await page.getByRole("dialog", { name: /^Advanced financial review/ }).getByRole("button", { name: "Choose programs", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose funding programs", exact: true });
  await picker.getByRole("checkbox", { name: /Special review program/ }).check();
  await picker.getByRole("textbox", { name: "Review note (optional)", exact: true }).fill("OK");
  await picker.getByRole("button", { name: "Apply manual selection", exact: true }).click();
  await expect(picker).toContainText("Program selection temporarily unavailable");
  await expect(picker.getByRole("checkbox", { name: /Special review program/ })).toBeChecked();
  await expect(picker.getByRole("textbox", { name: "Review note (optional)", exact: true })).toHaveValue("OK");
  await picker.getByRole("button", { name: "Apply manual selection", exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(state.programSaves).toHaveLength(2);
  expect(state.programSaves[1].reason).toBe("OK");
});

test("a retained program can explicitly adopt its first published criteria without changing selected keys", async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  await page.getByRole("button", { name: "Choose programs", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose funding programs", exact: true });
  await picker.getByRole("checkbox", { name: /Special review program/ }).check();
  await picker.getByRole("button", { name: "Apply manual selection", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByText("Criteria unavailable · Staff selected", { exact: true }).filter({ visible: true })).toBeVisible();
  state.publishCriteria();
  await page.reload();
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  await page.getByRole("button", { name: "Manage programs", exact: true }).click();
  await expect(picker.getByRole("checkbox", { name: /Special review program/ })).toBeChecked();
  await expect(picker.getByRole("button", { name: "Apply criteria", exact: true })).toBeEnabled();
  await picker.getByRole("button", { name: "Apply criteria", exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(state.programSaves).toHaveLength(2);
  expect(state.programSaves.map(save => save.program_keys)).toEqual([["special_review"], ["special_review"]]);
});

test("an unavailable criteria ID never offers adoption but the program remains selectable", async ({ page }) => {
  const state = await fixture(page, { unavailableCriteriaId: true });
  await page.getByRole("tab", { name: "Underwriting", exact: true }).click();
  await page.getByRole("button", { name: "Manage programs", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose funding programs", exact: true });
  const selected = picker.getByRole("checkbox", { name: /Special review program/ });
  await expect(selected).toBeChecked();
  await expect(selected).toBeEnabled();
  await expect(picker.getByRole("button", { name: "Apply criteria", exact: true })).toHaveCount(0);
  await expect(picker).not.toContainText("First published criteria are now available");
  await expect(picker.getByRole("button", { name: "Apply selection", exact: true })).toBeDisabled();
  expect(state.programSaves).toHaveLength(0);
  await picker.getByRole("checkbox", { name: /Private bridge review/ }).check();
  await expect(selected).toBeChecked();
  await expect(picker.getByRole("button", { name: "Apply selection", exact: true })).toBeEnabled();
  await expect(picker.getByRole("button", { name: "Apply criteria", exact: true })).toHaveCount(0);
  await picker.getByRole("button", { name: "Apply selection", exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(state.programSaves).toHaveLength(1);
  expect(state.programSaves[0].program_keys).toEqual(["special_review", "private_bridge"]);
  expect(state.errors).toEqual([]);
});

async function openAllocation(page: Page) {
  await page.getByRole("button", { name: "Allocate released cash flow", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Financial workspace", exact: true });
  await expect(workspace.getByRole("region", { name: "Released cash flow allocation", exact: true })).toBeVisible();
  return workspace;
}

test("a positive saved-plan release is required before a plan exists and a balanced saved version refreshes the requirement", async ({ page }, testInfo) => {
  const state = await fixture(page);
  await expect(page.getByText("Required: allocate released cash flow", { exact: true })).toBeVisible();
  const workspace = await openAllocation(page);
  const allocation = workspace.getByRole("region", { name: "Released cash flow allocation", exact: true });
  await expect(allocation).toContainText("$1,000");
  await allocation.getByRole("button", { name: "Use saved coverage plan", exact: true }).click();
  await allocation.getByRole("button", { name: "Add cash flow allocation", exact: true }).click();
  await allocation.getByRole("textbox", { name: "Allocation purpose 1", exact: true }).fill("Payroll reserve");
  await allocation.getByLabel("Allocation monthly amount 1", { exact: true }).fill("1000");
  await expect(allocation).toContainText("The saved-plan release is fully allocated.");
  await expect(allocation.getByRole("textbox", { name: "Allocation explanation 1", exact: true })).toHaveValue("");
  await allocation.screenshot({ path: testInfo.outputPath("released-cash-flow-balanced.png"), animations: "disabled" });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("released-cash-flow-workspace.png"), animations: "disabled" });
  await workspace.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(workspace).toContainText("Version 1 saved");
  expect(state.versionSaves).toHaveLength(1);
  expect(state.versionSaves[0]).toMatchObject({ kind: "operating_plan", family_id: FAMILY, submit: false });
  expect(state.planBody().released_cash_flow).toMatchObject({ source_fingerprint: "coverage-current", allocations: [{ label: "Payroll reserve", amount_monthly: 1000, expense_row_id: null, notes: "" }] });
  await workspace.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Released cash flow allocated", { exact: true })).toBeVisible();
  expect(state.unexpectedWrites.filter(write => /funding-request|use-of-funds|client-terms/.test(write))).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("partial and overallocated working versions retain entries without clearing the allocation requirement", async ({ page }) => {
  const state = await fixture(page);
  const workspace = await openAllocation(page), allocation = workspace.getByRole("region", { name: "Released cash flow allocation", exact: true });
  await allocation.getByRole("button", { name: "Use saved coverage plan", exact: true }).click();
  await allocation.getByRole("button", { name: "Add cash flow allocation", exact: true }).click();
  await allocation.getByRole("textbox", { name: "Allocation purpose 1", exact: true }).fill("New hiring");
  await allocation.getByLabel("Allocation monthly amount 1", { exact: true }).fill("500");
  await expect(allocation).toContainText("Still to allocate");
  await expect(allocation).toContainText("$500");
  await allocation.getByLabel("Allocation monthly amount 1", { exact: true }).fill(""); await allocation.getByLabel("Allocation monthly amount 1", { exact: true }).pressSequentially("1200.05");
  await expect(allocation).toContainText("Over allocated");
  await expect(allocation).toContainText("$200.05");
  await expect(allocation).toContainText("Allocate the full monthly release");
  await workspace.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(workspace).toContainText("Version 1 saved");
  expect(state.planBody().released_cash_flow.allocations[0].amount_monthly).toBe(1200.05);
  await workspace.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Required: allocate released cash flow", { exact: true })).toBeVisible();
});

test("changed saved coverage requires acknowledging the current source while preserving existing allocations", async ({ page }) => {
  const state = await fixture(page, { staleAllocation: true });
  const workspace = await openAllocation(page), allocation = workspace.getByRole("region", { name: "Released cash flow allocation", exact: true });
  await expect(allocation).toContainText("The saved coverage plan has changed.");
  await expect(allocation.getByRole("textbox", { name: "Allocation purpose 1", exact: true })).toHaveValue("Existing payroll reserve");
  await expect(allocation).not.toContainText("The saved-plan release is fully allocated.");
  await allocation.getByRole("button", { name: "Use saved coverage plan", exact: true }).click();
  await expect(allocation).toContainText("The saved-plan release is fully allocated.");
  await workspace.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(workspace).toContainText("Version 1 saved");
  expect(state.planBody().released_cash_flow.source_fingerprint).toBe("coverage-current");
  expect(state.planBody().released_cash_flow.allocations[0].notes).toContain("Preserve the working allocation");
});

test("an unavailable current source preserves allocations and never announces completion", async ({ page }) => {
  const state = await fixture(page, { releaseUnavailable: true, staleAllocation: true });
  const workspace = await openAllocation(page), allocation = workspace.getByRole("region", { name: "Released cash flow allocation", exact: true });
  await expect(allocation).toContainText("A current saved coverage plan is needed");
  await expect(allocation.getByRole("textbox", { name: "Allocation purpose 1", exact: true })).toHaveValue("Existing payroll reserve");
  await expect(allocation.getByRole("button", { name: "Use saved coverage plan", exact: true })).toHaveCount(0);
  await expect(allocation).not.toContainText("The saved-plan release is fully allocated.");
  await allocation.getByRole("button", { name: "Clear previous allocation", exact: true }).click();
  await expect(allocation).toHaveCount(0);
  await workspace.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(workspace).toContainText("Version 1 saved");
  expect(state.planBody().released_cash_flow).toEqual({ source_fingerprint: null, allocations: [] });
});

test("a failed version keeps the allocation and supports a successful retry", async ({ page }) => {
  const state = await fixture(page, { staleAllocation: true, publishFailure: true });
  const workspace = await openAllocation(page), allocation = workspace.getByRole("region", { name: "Released cash flow allocation", exact: true });
  await allocation.getByRole("button", { name: "Use saved coverage plan", exact: true }).click();
  await workspace.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(workspace).toContainText("Version PDF temporarily unavailable");
  await expect(allocation.getByLabel("Allocation monthly amount 1", { exact: true })).toHaveValue("1000");
  await workspace.getByRole("button", { name: "Save version", exact: true }).click();
  await expect(workspace).toContainText("Version 1 saved");
  expect(state.versionSaves).toHaveLength(2);
});

test("a plan without positive recurring release does not create an allocation requirement", async ({ page }) => {
  const state = await fixture(page, { noRelease: true });
  await expect(page.getByText("Required: allocate released cash flow", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open earnings plan", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Financial workspace", exact: true });
  await expect(workspace.getByRole("region", { name: "Released cash flow allocation", exact: true })).toHaveCount(0);
  expect(state.versionSaves).toHaveLength(0);
});

test("report completion guidance distinguishes absent request, tax earnings and the missing latest-period P&L", async ({ page }, testInfo) => {
  const state = await fixture(page);
  const checklist = page.locator("#package-readiness details").filter({ has: page.getByText(/^Complete this report/) });
  await expect(checklist).toBeVisible();
  await expect(checklist).toContainText("Current request not entered");
  await expect(checklist).toContainText("A P&L for the latest business reporting period");
  await expect(checklist).toContainText("Tax net income and bank cash retained cannot establish NOI");
  await expect(page.getByLabel("Package financial context")).toContainText("2025 business tax-derived earnings estimate");
  await expect(checklist.locator("ol > li")).toHaveCount(4);
  await expect(checklist).toContainText("Finalize file does not fill missing financial inputs");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await checklist.screenshot({ path: testInfo.outputPath("report-completion-guidance.png"), animations: "disabled" });
  await checklist.locator("summary").click();
  await expect(checklist).not.toHaveAttribute("open", "");
  expect(state.versionSaves).toHaveLength(0);
  expect(state.errors).toEqual([]);
});
