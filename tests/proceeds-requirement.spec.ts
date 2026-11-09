import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const INTAKE_ID = "62000000-0000-0000-0000-000000000001";
const PROFILE_ID = "62000000-0000-0000-0000-000000000002";
const BUCKET_ID = "62000000-0000-0000-0000-000000000003";
const ROOM_URL = `${BASE_URL}/buckets/request/room.proceeds-test?tab=budget`;
type Row = { id: string; category: string; label: string; amount: string | number };
type RequestBody = Record<string, unknown>;

async function mockProceeds(page: Page, options: { saveFailure?: boolean; saveConflict?: boolean; deferSave?: boolean; shareFailure?: boolean; clipboardFailure?: boolean; readOnly?: boolean; deferShare?: boolean; supportingEvidence?: boolean; pendingSupportingReview?: boolean; changedAllocationReview?: boolean } = {}) {
  const saves: RequestBody[] = [];
  const shares: RequestBody[] = [];
  const reviews: RequestBody[] = [];
  const unexpectedWrites: string[] = [];
  const renderErrors: string[] = [];
  page.on("pageerror", (error) => renderErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /maximum update depth|too many re-renders|cannot update a component while rendering/i.test(message.text())) renderErrors.push(message.text());
  });
  let workspaceReads = 0;
  let saveFailed = false;
  let revision = 0;
  let supportingVerified = Boolean(options.changedAllocationReview);
  let qualificationPending = Boolean(options.changedAllocationReview);
  let releaseShare: (() => void) | undefined;
  const shareGate = new Promise<void>((resolve) => { releaseShare = resolve; });
  let releaseSave: (() => void) | undefined;
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
  let items: Row[] = options.readOnly ? [{ id: "budget-row-1", category: "equipment", label: "Delivery equipment", amount: "100000" }] : [];
  const total = () => items.reduce((sum, item) => sum + Number(item.amount), 0);
  const complete = () => total() === 100000;
  const budget = () => ({
    items, requested_amount: "100000", requested_amount_source: "funding_request",
    total: String(total()), category_totals: Object.fromEntries(items.map((item) => [item.category, String(item.amount)])),
    unallocated_amount: String(100000 - total()), complete: complete(),
    real_estate_equipment_amount: String(items.filter((item) => ["equipment", "real_estate"].includes(item.category)).reduce((sum, item) => sum + Number(item.amount), 0)),
    real_estate_equipment_pct: complete() ? 100 : null, revision,
    updated_at: revision ? "2026-11-09T22:00:00Z" : null, updated_by_user_id: null,
    can_edit: !options.readOnly, warnings: [], requires_exact_allocation: false,
  });
  const requirement = () => ({
    requirement_key: "business_use_of_proceeds", canonical_key: "use_of_proceeds", requirement_kind: "document",
    label: "Business use of proceeds", category: "borrower_info", required_level: "required",
    status: items.length ? "received_unverified" : "missing", requested_document_id: "62000000-0000-0000-0000-000000000004",
    evidence_file_id: options.supportingEvidence ? "62000000-0000-0000-0000-000000000006" : null,
    evidence_file_name: options.supportingEvidence ? "Equipment quote.pdf" : null,
    evidence_files: options.supportingEvidence ? [{ file_id: "62000000-0000-0000-0000-000000000006", file_name: "Equipment quote.pdf", bucket_id: BUCKET_ID, created_at: "2026-11-09T20:00:00Z", source: "manual", verified: supportingVerified, verified_at: supportingVerified ? "2026-11-09T22:00:00Z" : null, ai_decision: options.pendingSupportingReview ? "needs_more" : "accepted", ai_reason_code: options.pendingSupportingReview ? "document_review_pending" : "document_matches", ai_explanation: "Readable equipment quote supports the planned use.", ai_confidence: "high", decision_actor: "ai", analysis_id: null, coverage_contribution: {} }] : [],
    evidence_count: options.supportingEvidence ? 1 : 0, verified_evidence_count: supportingVerified ? 1 : 0,
    coverage: { current: complete() ? 1 : 0, required: 1, unit: "budgets" },
    verified_coverage: { current: 0, required: 1, unit: "budgets" },
    coverage_complete: complete(), verified_coverage_complete: false, allow_multiple_files: false,
    verification_required: Boolean(options.supportingEvidence), review_checks: options.supportingEvidence ? [{ key: "support", label: "Support for planned use", instructions: "Review the equipment quote against the proposed financing use.", severity: "review" }] : [], source_program_keys: [], source_policy_keys: ["business_baseline"],
    program_overrides: {}, client_visible: true, can_waive: true, can_remove: false,
    state_reason: items.length ? "Review the saved use of funds allocation before completing this requirement." : null,
    last_requested_at: null, received_at: items.length ? "2026-11-09T22:00:00Z" : null, verified_at: null, provenance: {},
    qualification_review: options.changedAllocationReview ? { status: qualificationPending ? "pending" : "met", blocking: qualificationPending, reasons: qualificationPending ? ["Review supporting evidence against the changed allocation."] : [], checks: [] } : undefined,
    collection_completion: {
      complete: false, can_complete: complete(), fingerprint: `budget-revision-${revision}`, source: "use_of_funds",
      reason: complete() ? null : "Complete the use of funds budget to match the requested amount.",
      eligible_file_ids: [], suggested_file_ids: [],
      summary: { allocated_amount: total(), requested_amount: 100000, item_count: items.length, complete: complete(), revision, funding_request_revision: 0 },
    },
  });
  const readiness = () => ({
    profile_id: PROFILE_ID, lending_applicable: true, selection_mode: "auto", selections: [], evidence_policies: [{
      id: "business-policy", policy_key: "business_baseline", policy_name: "Business financing evidence", playbook_id: "business-playbook", playbook_version: 1,
    }], candidates: [], programs: [], requirements: [requirement()], available_evidence_files: [],
    evidence_summary: { bank_statement_months: [], bank_statement_required_months: 6, bank_statement_file_count: 0, bank_statement_accepted_count: 0, bank_statement_processing_count: 0, bank_statement_needs_more_count: 0, bank_statement_rejected_count: 0, bank_statement_failed_count: 0, bank_statement_coverage_complete: false },
    can_advance: false, automatic_stage_status: "not_ready", automation: { enabled: false, eligible: false, next_requirement_key: null, next_send_at: null, last_sent_at: null, attempts: 0, max_attempts: 3, stop_reason: "disabled" },
  });
  const verification = {
    ownership_total: 100, ownership_complete: true, owner_contact_complete: true, owner_count: 1,
    required_credit_owner_count: 1, completed_credit_owner_count: 1, pending_credit_owner_ids: [], missing_credit_contact_owner_ids: [],
    bank_linked: false, bank_connection_count: 0, bank_statement_months: 0, credit_returned: true,
    owner_credit_complete: true, business_banking_complete: false, evidence_complete: false, ready_for_step_2: true,
    unlocked: false, ownership_blockers: [], credit_blockers: [], banking_blockers: [], blockers: [],
  };
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);
  await page.addInitScript(({ fail }) => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => {
        localStorage.setItem("test.proceedsClipboardAttempts", String(Number(localStorage.getItem("test.proceedsClipboardAttempts") || 0) + 1));
        if (fail) throw new Error("Clipboard unavailable");
        localStorage.setItem("test.proceedsCopiedLink", text);
      },
    } });
  }, { fail: Boolean(options.clipboardFailure) });
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/+$/, "");
    let status = 200;
    let body: unknown;
    if (path.endsWith("/auth/me")) {
      body = { id: "10000000-0000-0000-0000-000000000001", clerk_id: "visual-qa", email: "franco@qualifiedcommercial.com", name: "Visual QA", role: "super_admin" };
    } else if (path.endsWith(`/admin/ai-underwriter-leads/${INTAKE_ID}`)) {
      body = { intake: {
        id: INTAKE_ID, variant: "business_underwriting_v1", bucket_id: BUCKET_ID, bucket_name: "Northstar secure room",
        full_name: "Avery Morgan", email: "avery@example.com", phone: "9735550148", business_name: "Northstar Logistics LLC",
        status: "collecting", outcome_status: "pending", preferred_language: "en", booking_recommended: false, call_booked: false,
        file_count: 1, missing_required_count: complete() ? 0 : 1, requested_loan_amount: 100000,
        created_at: "2026-11-09T20:00:00Z", updated_at: "2026-11-09T21:00:00Z",
      }, requested_documents: [], files: [{ id: "62000000-0000-0000-0000-000000000005", file_name: "Application.pdf", content_type: "application/pdf", size_bytes: 128, status: "uploaded", created_at: "2026-11-09T20:00:00Z" }], latest_review: null, messages: [], artifacts: [], notes: [], email_sends: [] };
    } else if (path.endsWith("/application-profiles/resolve")) {
      body = { id: PROFILE_ID, intake_id: INTAKE_ID, primary_bucket_id: BUCKET_ID, vertical: "main_street", owner_storage: "application" };
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/use-of-funds`)) {
      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as RequestBody;
        saves.push(payload);
        if (options.deferSave) await saveGate;
        if (options.saveConflict && !saveFailed) {
          saveFailed = true; revision += 1; status = 409; body = { detail: "The budget changed in another session." };
        } else if (options.saveFailure && !saveFailed) {
          saveFailed = true; status = 503; body = { detail: "Budget save temporarily unavailable." };
        } else {
          expect(payload.expected_revision).toBe(revision);
          items = payload.items as Row[]; revision += 1; body = budget();
        }
      } else body = budget();
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/room/reminders`)) {
      shares.push(request.postDataJSON() as RequestBody);
      if (options.deferShare) await shareGate;
      if (options.shareFailure) {
        status = 503; body = { detail: "The secure room link could not be prepared." };
      } else body = { room_url: ROOM_URL, overall_status: "created", deliveries: [{ id: "no-send-receipt", channel: "none", status: "created", detail: "Created without sending", provider_accepted: false, created_at: "2026-11-09T22:00:00Z" }] };
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/requirements/business_use_of_proceeds`) && request.method() === "PATCH") {
      reviews.push(request.postDataJSON() as RequestBody);
      supportingVerified = true;
      qualificationPending = false;
      body = readiness();
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/evidence-workspace`)) {
      workspaceReads += 1;
      body = { profile_id: PROFILE_ID, primary_bucket_id: BUCKET_ID, primary_bucket_name: "Northstar secure room", program_readiness: readiness(), verification,
        banking: { enabled: false, environment: "sandbox", consent_granted: false, disclosure_text: "", items: [], manual_statement_months: [], assets_enabled: false, asset_reports: [] },
        bank_evidence: { source: "none", connected_institutions: 0, banking_access_complete: false, accepted_statement_months: [], required_statement_months: 6, statement_coverage_complete: false, processing_files: 0, needs_attention_files: 0, reconnect_required: false },
        forms: { forms: [], packets: [] }, evidence: { profile_id: PROFILE_ID, sources: [], files: [], total_files: 0, review_file_count: 0, blockers: [] },
        supporting_group: null, processing: { total_files: 0, analyzing_files: 0, accepted_files: 0, needs_attention_files: 0, failed_files: 0, has_processing: false },
        can_manage_evidence: !options.readOnly, can_manage_plaid_settings: false, can_upload: !options.readOnly,
      };
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/program-readiness`)) {
      body = readiness();
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/verification`)) {
      body = verification;
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/underwriting`)) {
      body = { profile_id: PROFILE_ID, source_kind: "intake", source_id: INTAKE_ID, underwriting_status: "submitted", approved_amount: null, term_sheet_amount: null, current_dscr: null, target_dscr: null, reviewer_notes: null };
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/collection-tasks`)) {
      body = { tasks: [] };
    } else if (path.endsWith(`/application-profiles/${PROFILE_ID}/owners`) || path.endsWith(`/application-profiles/${PROFILE_ID}/extracted-facts`)) {
      body = [];
    } else if (path.endsWith("/operator-files")) {
      body = { items: [], limit: 500, rollup: { total: 0, promoted: 0, working: 0, needs_attention: 0, real_estate: 0, main_street: 0, dealer: 0, mca: 0 }, filters: { vertical: "all", origin: "all", q: null } };
    } else if (path.endsWith("/settings")) {
      body = { data: {} };
    } else {
      if (!["GET", "HEAD"].includes(request.method())) unexpectedWrites.push(`${request.method()} ${path}`);
      status = 404; body = { detail: "This optional service is unavailable in the test fixture." };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/files/${INTAKE_ID}?section=documents`, { waitUntil: "domcontentloaded" });
  const row = page.locator(".requirement-row").filter({ has: page.getByText("Business use of proceeds", { exact: true }) });
  await expect(row).toBeVisible();
  const toggle = row.locator(".requirement-summary-toggle");
  if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
  return { row, saves, shares, reviews, unexpectedWrites, renderErrors, workspaceReads: () => workspaceReads, releaseShare: () => releaseShare?.(), releaseSave: () => releaseSave?.() };
}

test("the requirement opens a staff budget and refreshes the row after saving", async ({ page }, testInfo) => {
  const { row, saves, workspaceReads, unexpectedWrites, renderErrors } = await mockProceeds(page);
  await row.screenshot({ path: testInfo.outputPath("proceeds-requirement.png"), animations: "disabled" });
  const readsBefore = workspaceReads();
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in use of proceeds", exact: true });
  await expect(dialog).toBeVisible();
  const footerSave = dialog.locator(".drawer-f").getByRole("button", { name: "Save budget", exact: true });
  await expect(footerSave).toBeVisible();
  await expect(footerSave).toBeDisabled();
  await expect(dialog.locator(".drawer-b").getByRole("button", { name: "Save budget", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add a use", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Use 1", exact: true }).selectOption("equipment");
  await dialog.getByRole("textbox", { name: "Description for use 1", exact: true }).fill("Delivery equipment");
  await dialog.getByRole("textbox", { name: "Amount for use 1", exact: true }).fill("100000");
  await dialog.locator(".drawer-b").evaluate((element) => { element.scrollTop = 0; });
  const footerGeometry = await footerSave.evaluate((element) => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, viewport: innerHeight }; });
  expect(footerGeometry.top).toBeGreaterThanOrEqual(0);
  expect(footerGeometry.bottom).toBeLessThanOrEqual(footerGeometry.viewport);
  await expect(footerSave).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("proceeds-budget-editor.png"), animations: "disabled" });
  await footerSave.click();
  await expect(dialog).toContainText("Budget saved.");
  await expect.poll(workspaceReads).toBeGreaterThan(readsBefore);
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({ expected_revision: 0, items: [{ category: "equipment", label: "Delivery equipment", amount: "100000" }] });
  expect(Object.keys(saves[0]).sort()).toEqual(["expected_revision", "items"]);
  expect(unexpectedWrites.filter((write) => write.includes("/funding-request"))).toEqual([]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(row).toContainText("Ready to complete");
  await expect(row).toContainText("$100,000 of $100,000 allocated");
  await expect(row).toContainText("1 planned use");
  await expect(row.getByRole("button", { name: "Mark complete", exact: true })).toBeEnabled();
  expect(renderErrors).toEqual([]);
  await row.screenshot({ path: testInfo.outputPath("proceeds-saved-allocation.png"), animations: "disabled" });
});

test("sharing copies a budget-targeted secure room link without sending", async ({ page }, testInfo) => {
  const { row, shares, saves } = await mockProceeds(page);
  const measure = () => row.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { viewport: innerWidth, left: rect.left, right: rect.right };
  });
  const beforeShare = await measure();
  expect(beforeShare.left).toBeGreaterThanOrEqual(0);
  expect(beforeShare.right).toBeLessThanOrEqual(beforeShare.viewport + 1);
  await row.getByRole("button", { name: "Share link", exact: true }).click();
  await expect(row.getByRole("textbox", { name: "Client use of proceeds link", exact: true })).toHaveValue(ROOM_URL);
  await expect(row).toContainText("Link copied.");
  expect(shares).toEqual([{ purpose: "use_of_funds", email_room_link: false, sms_reminder: false }]);
  expect(saves).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("test.proceedsCopiedLink"))).toBe(ROOM_URL);
  const afterShare = await measure();
  expect(afterShare.left).toBeGreaterThanOrEqual(0);
  expect(afterShare.right).toBeLessThanOrEqual(afterShare.viewport + 1);
  await row.screenshot({ path: testInfo.outputPath("proceeds-share-link.png"), animations: "disabled" });
});

test("failed saving retains allocation entries and supports retry", async ({ page }) => {
  const { row, saves } = await mockProceeds(page, { saveFailure: true });
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in use of proceeds", exact: true });
  await dialog.getByRole("button", { name: "Add a use", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Description for use 1", exact: true }).fill("Inventory purchase");
  await dialog.getByRole("textbox", { name: "Amount for use 1", exact: true }).fill("100000");
  await dialog.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Description for use 1", exact: true })).toHaveValue("Inventory purchase");
  await expect(dialog.getByRole("textbox", { name: "Amount for use 1", exact: true })).toHaveValue("100000");
  await dialog.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(dialog).toContainText("Budget saved.");
  expect(saves).toHaveLength(2);
  expect(saves[1].expected_revision).toBe(0);
});

test("a failed link request never reports or attempts a clipboard success", async ({ page }) => {
  const { row, shares } = await mockProceeds(page, { shareFailure: true });
  await row.getByRole("button", { name: "Share link", exact: true }).click();
  await expect(row.getByRole("alert")).toBeVisible();
  await expect(row).not.toContainText("Link copied.");
  expect(shares).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("test.proceedsClipboardAttempts"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("test.proceedsCopiedLink"))).toBeNull();
});

test("clipboard denial keeps the direct link available for manual copying", async ({ page }) => {
  const { row } = await mockProceeds(page, { clipboardFailure: true });
  await row.getByRole("button", { name: "Share link", exact: true }).click();
  const link = row.getByRole("textbox", { name: "Client use of proceeds link", exact: true });
  await expect(link).toHaveValue(ROOM_URL);
  await expect(link).toHaveAttribute("readonly", "");
  await expect(row).toContainText(/copy.*manually|select.*copy|copy.*below/i);
  await expect(row).not.toContainText("Link copied.");
  expect(await page.evaluate(() => localStorage.getItem("test.proceedsCopiedLink"))).toBeNull();
});

test("a read-only budget can be reviewed without editing or saving", async ({ page }) => {
  const { row, saves } = await mockProceeds(page, { readOnly: true });
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in use of proceeds", exact: true });
  await expect(dialog).toContainText("You can review this budget.");
  await expect(dialog.getByRole("textbox", { name: "Amount for use 1", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "Use 1", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Save budget", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add a use", exact: true })).toHaveCount(0);
  expect(saves).toHaveLength(0);
});

test("a partial allocation refreshes the row without enabling completion", async ({ page }) => {
  const { row } = await mockProceeds(page);
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in use of proceeds", exact: true });
  await dialog.getByRole("button", { name: "Add a use", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Amount for use 1", exact: true }).fill("50000");
  await dialog.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(dialog).toContainText("Partial budget saved.");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(row).toContainText("$50,000 of $100,000 allocated");
  await expect(row).toContainText("Allocation incomplete");
  await expect(row.getByRole("button", { name: "Mark complete", exact: true })).toBeDisabled();
});

test("collapsing the requirement cancels clipboard work from a pending share", async ({ page }) => {
  const { row, shares, releaseShare } = await mockProceeds(page, { deferShare: true });
  await row.getByRole("button", { name: "Share link", exact: true }).click();
  await expect.poll(() => shares.length).toBe(1);
  const toggle = row.locator(".requirement-summary-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const shareResponse = page.waitForResponse((response) => response.url().endsWith(`/application-profiles/${PROFILE_ID}/room/reminders`));
  releaseShare();
  await (await shareResponse).finished();
  await toggle.click();
  await expect(row.getByRole("button", { name: "Share link", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("test.proceedsClipboardAttempts"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("test.proceedsCopiedLink"))).toBeNull();
  await expect(row).not.toContainText("Link copied.");
});

test("the sticky save control tracks pristine and invalid allocation states", async ({ page }) => {
  const { row, saves, renderErrors } = await mockProceeds(page);
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in use of proceeds", exact: true });
  const save = dialog.locator(".drawer-f").getByRole("button", { name: "Save budget", exact: true });
  await expect(save).toBeDisabled();
  await dialog.getByRole("button", { name: "Add a use", exact: true }).click();
  await expect(save).toBeDisabled();
  const amount = dialog.getByRole("textbox", { name: "Amount for use 1", exact: true });
  await amount.fill("100000.001");
  await expect(save).toBeDisabled();
  await amount.fill("100001");
  await expect(save).toBeDisabled();
  await amount.fill("50000");
  await expect(save).toBeEnabled();
  expect(saves).toHaveLength(0);
  expect(renderErrors).toEqual([]);
});

test("every dirty close path preserves entries until explicit discard", async ({ page }) => {
  const { row, saves, renderErrors } = await mockProceeds(page);
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in use of proceeds", exact: true });
  await dialog.getByRole("button", { name: "Add a use", exact: true }).click();
  const amount = dialog.getByRole("textbox", { name: "Amount for use 1", exact: true });
  await amount.fill("75000");
  for (const closePath of ["footer", "header", "escape", "backdrop"]) {
    if (closePath === "footer") await dialog.getByRole("button", { name: "Close budget", exact: true }).click();
    else if (closePath === "header") await dialog.getByRole("button", { name: "Close", exact: true }).click();
    else if (closePath === "escape") await page.keyboard.press("Escape");
    else await page.locator(".drawer-scrim").last().click({ position: { x: 2, y: 2 } });
    await expect(dialog.getByRole("alert")).toContainText("You have unsaved use of proceeds.");
    await expect(amount).toHaveValue("75000");
    await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(amount).toHaveValue("75000");
  }
  await dialog.getByRole("button", { name: "Close budget", exact: true }).click();
  await dialog.getByRole("button", { name: "Discard and close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Add a use", exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Amount for use 1", exact: true })).toHaveCount(0);
  expect(saves).toHaveLength(0);
  expect(renderErrors).toEqual([]);
});

test("an in-flight footer save blocks duplicate writes and closing", async ({ page }) => {
  const { row, saves, releaseSave, renderErrors } = await mockProceeds(page, { deferSave: true });
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in use of proceeds", exact: true });
  await dialog.getByRole("button", { name: "Add a use", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Amount for use 1", exact: true }).fill("100000");
  await dialog.locator(".drawer-f").getByRole("button", { name: "Save budget", exact: true }).dblclick();
  await expect.poll(() => saves.length).toBe(1);
  await expect(dialog.locator(".drawer-f").getByRole("button", { name: /^Saving/ })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close budget", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.locator(".drawer-scrim").last().click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Discard and close", exact: true })).toHaveCount(0);
  expect(saves).toHaveLength(1);
  releaseSave();
  await expect(dialog).toContainText("Budget saved.");
  await expect(dialog.locator(".drawer-f").getByRole("button", { name: "Save budget", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close budget", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("Ready to complete");
  expect(saves).toHaveLength(1);
  expect(renderErrors).toEqual([]);
});

test("conflicts retain entries and require reload before another footer save", async ({ page }) => {
  const { row, saves, renderErrors } = await mockProceeds(page, { saveConflict: true });
  await row.getByRole("button", { name: "Fill in use of proceeds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Fill in use of proceeds", exact: true });
  await dialog.getByRole("button", { name: "Add a use", exact: true }).click();
  const amount = dialog.getByRole("textbox", { name: "Amount for use 1", exact: true });
  await amount.fill("100000");
  const save = dialog.locator(".drawer-f").getByRole("button", { name: "Save budget", exact: true });
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("This budget changed while you were editing.");
  await expect(amount).toHaveValue("100000");
  await expect(save).toBeDisabled();
  await dialog.getByRole("button", { name: "Discard edits and reload saved budget", exact: true }).click();
  await expect(amount).toHaveCount(0);
  await expect(save).toBeDisabled();
  await dialog.getByRole("button", { name: "Add a use", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Amount for use 1", exact: true }).fill("100000");
  await save.click();
  await expect(dialog).toContainText("Budget saved.");
  expect(saves).toHaveLength(2);
  expect(saves[0].expected_revision).toBe(0);
  expect(saves[1].expected_revision).toBe(1);
  expect(renderErrors).toEqual([]);
});

for (const reviewCase of [
  { label: "AI-accepted", pendingSupportingReview: false, changedAllocationReview: false },
  { label: "Pending", pendingSupportingReview: true, changedAllocationReview: false },
  { label: "Previously verified", pendingSupportingReview: false, changedAllocationReview: true },
]) {
  test(`${reviewCase.label} supporting evidence keeps its review workflow separate from budget completion`, async ({ page }) => {
    const { row, reviews, saves } = await mockProceeds(page, { supportingEvidence: true, pendingSupportingReview: reviewCase.pendingSupportingReview, changedAllocationReview: reviewCase.changedAllocationReview });
    await expect(row).toContainText("Equipment quote.pdf");
    await expect(row.getByRole("button", { name: "Preview Equipment quote.pdf", exact: true })).toBeVisible();
    await row.getByRole("button", { name: "More actions for Equipment quote.pdf", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Reject this file", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Move to another requirement...", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await row.getByRole("button", { name: "Sign off supporting evidence", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Review before running", exact: true });
    await expect(confirmation).toContainText("Support for planned use");
    await confirmation.getByRole("button", { name: "Verify human-governed evidence", exact: true }).click();
    await expect(row.getByRole("button", { name: "Sign off supporting evidence", exact: true })).toHaveCount(0);
    expect(reviews).toEqual([{ action: "verify", evidence_file_ids: ["62000000-0000-0000-0000-000000000006"], confirmed: true }]);
    expect(saves).toHaveLength(0);
    await expect(row).toContainText("No planned uses yet");
    await expect(row.getByRole("button", { name: "Mark complete", exact: true })).toBeDisabled();
  });
}
