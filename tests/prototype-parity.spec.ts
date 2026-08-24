import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);
});

const ROUTES = [
  ["dashboard", "/"],
  ["pipeline", "/pipeline"],
  ["clients", "/clients"],
  ["buckets", "/admin/buckets"],
  ["ai-intake", "/admin/ai-underwriter-leads"],
  ["elara-inbox", "/ai-inbox"],
  ["messages", "/messages"],
  ["calendar", "/calendar"],
  ["vault", "/vault"],
  ["prequalifications", "/admin/prequal-requests"],
  ["lenders", "/admin/lenders"],
  ["analyzer", "/deal-analyzer"],
  ["simulator", "/simulator"],
  ["rates", "/rates"],
  ["reports", "/reports"],
  ["settings", "/settings"],
] as const;

const DETAIL_ROUTES: Array<readonly [string, string]> = [];
if (process.env.QC_E2E_DEAL_ID) DETAIL_ROUTES.push(["deal-file", `/deals/${process.env.QC_E2E_DEAL_ID}`]);
if (process.env.QC_E2E_LOAN_ID) DETAIL_ROUTES.push(["funding-file", `/loans/${process.env.QC_E2E_LOAN_ID}`]);
if (process.env.QC_E2E_INTAKE_ID) DETAIL_ROUTES.push(["intake-file", `/admin/ai-underwriter-leads?lead=${process.env.QC_E2E_INTAKE_ID}`]);
if (process.env.QC_E2E_BUCKET_ID) DETAIL_ROUTES.push(["bucket-room", `/admin/buckets?bucket=${process.env.QC_E2E_BUCKET_ID}`]);

async function openConsolePage(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toHaveCount(1);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(200);
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Permission denied");
  const openDialog = page.getByRole("dialog");
  if (await openDialog.isVisible().catch(() => false)) {
    await expect(openDialog.getByRole("button", { name: /^Close(?: \(Esc\))?$/ })).toHaveCount(1);
  }
  await page.locator("body").evaluate((body) => body.getBoundingClientRect());
}

async function assertStableGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const visibleControls = Array.from(document.querySelectorAll<HTMLElement>("button, [role='tab'], [role='menuitem']"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      clippedControls: visibleControls.filter((element) => element.scrollWidth > element.clientWidth + 3).map((element) => element.textContent?.trim()).filter(Boolean).slice(0, 8),
    };
  });
  expect(geometry.pageWidth, "document must not overflow horizontally").toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.clippedControls, "visible controls must not clip their labels").toEqual([]);
}

async function captureReviewImage(page: Page, name: string, testInfo: TestInfo) {
  const output = join(process.cwd(), "artifacts", "prototype-parity", "local", testInfo.project.name);
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
}

async function mockEmptyOperatorPipeline(page: Page) {
  await page.route(/\/api\/v1\/auth\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "10000000-0000-0000-0000-000000000001",
        clerk_id: "visual-qa",
        email: "franco@qualifiedcommercial.com",
        name: "Visual QA",
        role: "super_admin",
      }),
    });
  });
  await page.route(/\/api\/v1\/operator-files(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        rollup: { total: 0, promoted: 0, working: 0, needs_attention: 0, real_estate: 0, main_street: 0, dealer: 0, mca: 0 },
        limit: 500,
        filters: { vertical: "all", origin: "all", q: null },
      }),
    });
  });
  await page.route(/\/api\/v1\/settings$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
  });
}

async function mockAiIntakeBankingWorkspace(page: Page) {
  const intakeId = "20000000-0000-0000-0000-000000000001";
  const profileId = "20000000-0000-0000-0000-000000000002";
  const bucketId = "20000000-0000-0000-0000-000000000003";
  const uploadedFiles: string[] = [];
  const lead = {
    id: intakeId,
    variant: "dealer_gatekeeper_v1",
    bucket_id: bucketId,
    bucket_name: "UnieLogics secure room",
    full_name: "Jonathan Franco",
    email: "franco@theceosnetwork.com",
    phone: "9735550188",
    business_name: "UnieLogics",
    referral_source: "Direct",
    opened_by_name: "House desk",
    opened_by_role: "Super admin",
    status: "reviewed",
    outcome_status: "submitted",
    preferred_language: "en",
    probability_status: "Promising but needs one clarification",
    confidence: "medium",
    one_next_step: "Complete business banking",
    latest_review_status: "completed",
    booking_recommended: false,
    call_booked: false,
    file_count: 6,
    missing_required_count: 1,
    requested_loan_amount: 1000000,
    estimated_credit_score: null,
    created_at: "2026-08-24T16:00:00Z",
    updated_at: "2026-08-24T17:30:00Z",
    last_message_at: null,
    delete_requested_at: null,
    unseen_activity_count: 0,
    delete_requested_by: null,
    loan_purpose: "Working capital",
    referral_source_detail: null,
    asset_rows: null,
    result_snapshot: {},
  };

  await page.route(/\/api\/v1\/auth\/me$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "10000000-0000-0000-0000-000000000001", clerk_id: "visual-qa", email: "franco@qualifiedcommercial.com", name: "Visual QA", role: "super_admin" }) });
  });
  await page.route(/\/api\/v1\/operator-files(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], rollup: { total: 0, promoted: 0, working: 0, needs_attention: 0, real_estate: 0, main_street: 0, dealer: 0, mca: 0 }, limit: 500, filters: { vertical: "all", origin: "all", q: null } }) });
  });
  await page.route(/\/api\/v1\/admin\/ai-underwriter-leads\?.*$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [lead], total: 1, limit: 25, offset: 0 }) });
  });
  await page.route(new RegExp(`/api/v1/admin/ai-underwriter-leads/${intakeId}$`), async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ intake: lead, requested_documents: [], files: [], latest_review: { status: "completed", result: {} }, messages: [], artifacts: [], email_sends: [], notes: [], upload_url: null, secure_room_pin: null, room_delivery_status: "sent", room_delivery_detail: "Emailed." }) });
  });
  await page.route(new RegExp(`/api/v1/admin/ai-underwriter-leads/${intakeId}/chat$`), async (route) => {
    const requestBody = route.request().postDataJSON() as { message?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: null,
        session_token: null,
        intake: lead,
        requested_documents: [],
        files: [],
        latest_review: { status: "completed", result: {} },
        messages: [
          { id: "chat-user", role: "user", content: requestBody.message || "", created_at: "2026-08-24T18:00:00Z" },
          { id: "chat-assistant", role: "assistant", content: "The response is grounded in the uploaded evidence.", created_at: "2026-08-24T18:00:01Z" },
        ],
        assistant_message: "The response is grounded in the uploaded evidence.",
        widget: null,
      }),
    });
  });
  await page.route(new RegExp(`/api/v1/admin/ai-underwriter-leads/${intakeId}/files/upload-init$`), async (route) => {
    const requestBody = route.request().postDataJSON() as { file_name: string };
    uploadedFiles.push(requestBody.file_name);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ file_id: `upload-${uploadedFiles.length}`, upload_url: `${BASE_URL}/mock-evidence-upload/${uploadedFiles.length}`, required_headers: {} }) });
  });
  await page.route(/\/mock-evidence-upload\/\d+$/, async (route) => {
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route(new RegExp(`/api/v1/admin/ai-underwriter-leads/${intakeId}/files/complete$`), async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/api\/v1\/application-profiles\/resolve$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: profileId, intake_id: intakeId, primary_bucket_id: bucketId, vertical: "dealer", owner_storage: "application" }) });
  });
  await page.route(new RegExp(`/api/v1/application-profiles/${profileId}/owners$`), async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route(new RegExp(`/api/v1/application-profiles/${profileId}/verification$`), async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ownership_total: 100, ownership_complete: true, owner_contact_complete: true, owner_count: 1, required_credit_owner_count: 1, completed_credit_owner_count: 0, pending_credit_owner_ids: [], missing_credit_contact_owner_ids: [], bank_linked: false, bank_connection_count: 0, bank_statement_months: 6, credit_returned: false, owner_credit_complete: false, business_banking_complete: false, evidence_complete: true, ready_for_step_2: true, unlocked: false, ownership_blockers: [], credit_blockers: [], banking_blockers: ["Business banking is pending"], blockers: [] }) });
  });
  await page.route(new RegExp(`/api/v1/application-profiles/${profileId}/banks$`), async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, environment: "production", consent_granted: false, disclosure_version: "2026-08", disclosure_text: "", items: [], manual_override: false, manual_override_reason: null, manual_statement_months: ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"], assets_enabled: true, asset_reports: [] }) });
  });
  await page.route(new RegExp(`/api/v1/application-profiles/${profileId}/room/deliveries$`), async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "30000000-0000-0000-0000-000000000001", action_kind: "business_banking_reminder", channel: "none", recipient_masked: "fr***@theceosnetwork.com", status: "created", detail: "Created without sending", provider_accepted: false, created_at: "2026-08-24T17:29:04Z" },
      { id: "30000000-0000-0000-0000-000000000002", action_kind: "business_banking_reminder", channel: "email", recipient_masked: "fr***@theceosnetwork.com", status: "sent", detail: "Emailed.", provider_accepted: true, created_at: "2026-08-24T17:28:07Z" },
    ]) });
  });
  await page.route(/\/api\/v1\/me\/booking-link$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, slug: null, url: null }) });
  });
  return { intakeId, uploadedFiles };
}

for (const [name, route] of [...ROUTES, ...DETAIL_ROUTES]) {
  test(`${name} keeps the prototype page geometry`, async ({ page }, testInfo) => {
    await openConsolePage(page, route);
    await assertStableGeometry(page);
    await captureReviewImage(page, name, testInfo);
  });
}

test("All Tools uses the centered catalogue and closes with Escape", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-390", "Mobile uses the persistent bottom navigation instead of the desktop tools catalogue.");
  await openConsolePage(page, "/");
  const allTools = page.getByRole("button", { name: /^All tools/i });
  if (!(await allTools.isVisible())) {
    await page.getByRole("button", { name: /Expand sidebar/i }).click();
  }
  await allTools.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("All tools");
  await captureReviewImage(page, "overlay-all-tools", testInfo);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Pipeline primary action opens the shared centered drawer", async ({ page }, testInfo) => {
  await openConsolePage(page, "/pipeline");
  await page.getByRole("button", { name: /New file/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/New file|Choose a vertical/i);
  await captureReviewImage(page, "overlay-new-file", testInfo);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("shared drawer inputs retain focus through controlled rerenders", async ({ page }) => {
  await mockEmptyOperatorPipeline(page);
  await openConsolePage(page, "/pipeline");
  await page.getByRole("button", { name: /New file/i }).click();
  const dialog = page.getByRole("dialog", { name: "Smart Intake — new file" });
  const name = dialog.getByPlaceholder("Marcus Holloway");
  await name.pressSequentially("Jonathan Franco");
  await expect(name).toHaveValue("Jonathan Franco");
  await expect(name).toBeFocused();
});

test("AI intake banking separates actions from persisted delivery status", async ({ page }, testInfo) => {
  const { intakeId } = await mockAiIntakeBankingWorkspace(page);
  await page.goto(`/admin/ai-underwriter-leads?lead=${intakeId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Accepted by email provider")).toBeVisible();
  await expect(page.getByText(/room link was created later.*without sending/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend bank request" })).toBeVisible();

  const geometry = await page.locator(".bank-evidence-workspace").evaluate((section) => {
    const toolbar = section.querySelector<HTMLElement>(".bank-request-toolbar")!;
    const status = section.querySelector<HTMLElement>(".bank-delivery-strip")!;
    const tabs = section.querySelector<HTMLElement>(".bank-workspace-tabs")!;
    const toolbarBox = toolbar.getBoundingClientRect();
    const statusBox = status.getBoundingClientRect();
    const tabsBox = tabs.getBoundingClientRect();
    return {
      sectionOverflow: section.scrollWidth - section.clientWidth,
      toolbarOverlapsStatus: toolbarBox.bottom > statusBox.top + 1,
      statusOverlapsTabs: statusBox.bottom > tabsBox.top + 1,
    };
  });
  expect(geometry.sectionOverflow).toBeLessThanOrEqual(1);
  expect(geometry.toolbarOverlapsStatus).toBe(false);
  expect(geometry.statusOverlapsTabs).toBe(false);
  await captureReviewImage(page, "ai-intake-bank-delivery-status", testInfo);
});

test("AI intake contact editor accepts uninterrupted typing", async ({ page }) => {
  const { intakeId } = await mockAiIntakeBankingWorkspace(page);
  await page.goto(`/admin/ai-underwriter-leads?lead=${intakeId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Expand file details" }).click();
  await page.getByRole("button", { name: "Edit contact details" }).click();
  const email = page.getByRole("dialog", { name: "Edit contact and entity" }).getByLabel("Email");
  await email.press("ControlOrMeta+A");
  await email.pressSequentially("franco@theceosnetwork.com");
  await expect(email).toHaveValue("franco@theceosnetwork.com");
  await expect(email).toBeFocused();
});

test("AI intake chat responses preserve the active communications workspace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The live chat regression is exercised at the canonical viewport.");
  const { intakeId } = await mockAiIntakeBankingWorkspace(page);
  await page.goto(`/admin/ai-underwriter-leads?lead=${intakeId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Communications" }).click();
  const composer = page.getByLabel("Message the AI underwriter");
  await composer.fill("Summarize the current evidence");
  await composer.press("Enter");
  await expect(page.getByText("The response is grounded in the uploaded evidence.", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Communications" })).toHaveAttribute("aria-selected", "true");
  await expect(composer).toBeVisible();
  await expect(page.getByText("Business bank evidence", { exact: true })).toBeHidden();
});

test("AI intake Evidence accepts bulk files and ZIP archives", async ({ page }, testInfo) => {
  test.skip(!["desktop-1600", "mobile-390"].includes(testInfo.project.name), "The evidence upload workflow is exercised at desktop and mobile widths.");
  const { intakeId, uploadedFiles } = await mockAiIntakeBankingWorkspace(page);
  await page.goto(`/admin/ai-underwriter-leads?lead=${intakeId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Evidence\s/ }).click();
  const dropzone = page.getByRole("button", { name: /Drop evidence files or ZIP archives here/i });
  await expect(dropzone).toBeVisible();
  const input = page.getByLabel("Upload evidence files");
  await expect(input).toHaveAttribute("multiple", "");
  await expect(input).toHaveAttribute("accept", /\.zip/);
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["fixture zip"], "dragged-evidence.zip", { type: "application/zip" }));
    return transfer;
  });
  await dropzone.dispatchEvent("drop", { dataTransfer });
  await expect.poll(() => uploadedFiles).toEqual(["dragged-evidence.zip"]);
  await input.setInputFiles([
    { name: "initial-evidence.zip", mimeType: "application/zip", buffer: Buffer.from("fixture zip") },
    { name: "business-tax-return.pdf", mimeType: "application/pdf", buffer: Buffer.from("fixture pdf") },
  ]);
  await expect(page.getByText("2 files uploaded", { exact: true })).toBeVisible();
  expect(uploadedFiles).toEqual(["dragged-evidence.zip", "initial-evidence.zip", "business-tax-return.pdf"]);
  await expect(page.getByRole("tab", { name: "File workspace" })).toHaveAttribute("aria-selected", "true");
  await expect(dropzone).toBeVisible();
  await assertStableGeometry(page);
  await captureReviewImage(page, "ai-intake-evidence-upload", testInfo);
});

test("theme control swaps between light and Obsidian without shifting the page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-390", "The compact shell does not expose the desktop theme control.");
  await openConsolePage(page, "/");
  const before = await page.locator("main").boundingBox();
  await page.getByRole("button", { name: /Obsidian theme/i }).click();
  await expect(page.getByRole("button", { name: /light theme/i })).toBeVisible();
  const after = await page.locator("main").boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.x).toBe(before?.x);
});

test("floating page headers meet the global top bar without a ground gap", async ({ page }) => {
  await openConsolePage(page, "/pipeline");
  const edges = await page.evaluate(() => {
    const top = document.querySelector<HTMLElement>(".top")?.getBoundingClientRect();
    const pageHeader = document.querySelector<HTMLElement>(".ckhead")?.getBoundingClientRect();
    return { topBottom: top?.bottom, pageHeaderTop: pageHeader?.top };
  });
  expect(edges.topBottom).toBeDefined();
  expect(edges.pageHeaderTop).toBeDefined();
  expect(Math.abs((edges.topBottom ?? 0) - (edges.pageHeaderTop ?? 0))).toBeLessThanOrEqual(1);
});

test("secure business banking offers Plaid and statement upload without staff controls", async ({ page }, testInfo) => {
  const verification = {
    business_name: "Northstar Logistics LLC",
    disclosure_version: "2026-08",
    disclosure_text: "I authorize Qualified Commercial to retrieve business account statements for underwriting and verification.",
    consent_granted: true,
    items: [
      {
        id: "50000000-0000-0000-0000-000000000001",
        institution_name: "Example Business Bank",
        accounts_label: "Operating checking ending 4021",
        status: "active",
        is_primary_operating: true,
        last_pulled_at: "2026-08-24T14:00:00Z",
        statement_months: ["2026-05", "2026-06", "2026-07"],
      },
    ],
    manual_statement_months: ["2026-05", "2026-06", "2026-07"],
    statement_upload_enabled: true,
    expires_at: "2026-08-31T14:00:00Z",
  };
  await page.route(/\/api\/v1\/application-profiles\/public\/bank-verification\/bank\.visual(?:\/.*)?$/, async (route) => {
    if (route.request().url().endsWith("/files/upload-init")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ file_id: "60000000-0000-0000-0000-000000000001", upload_url: `${BASE_URL}/mock-statement-upload`, required_headers: { "Content-Type": "application/pdf" } }) });
      return;
    }
    if (route.request().url().endsWith("/files/complete")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "60000000-0000-0000-0000-000000000001", bucket_id: "70000000-0000-0000-0000-000000000001", file_name: "bank-statement.pdf", content_type: "application/pdf", size_bytes: 12, status: "uploaded", created_at: "2026-08-24T14:00:00Z", updated_at: "2026-08-24T14:00:00Z" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(verification) });
  });
  await page.route(`${BASE_URL}/mock-statement-upload`, async (route) => route.fulfill({ status: 200, body: "" }));

  await page.goto("/application-verification#t=bank.visual", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Northstar Logistics LLC" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect another business bank" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Drop business bank statements here/ })).toBeVisible();
  await expect(page.getByText("Primary operating")).toBeVisible();
  await assertStableGeometry(page);
  await captureReviewImage(page, "secure-bank-verification", testInfo);
});

test("prequalification review is one readable independently scrolling form", async ({ page }, testInfo) => {
  test.skip(
    !["desktop-1600", "compact-1280"].includes(testInfo.project.name),
    "The underwriting workspace is checked at its wide and shortest supported desktop sizes.",
  );
  const request = {
    id: "30000000-0000-0000-0000-000000000001",
    loan_id: null,
    requester_id: "30000000-0000-0000-0000-000000000002",
    client_id: "30000000-0000-0000-0000-000000000003",
    client_name: "Aisha Carter",
    target_property_address: "149 Pomona Ave, Newark NJ 07112",
    purchase_price: 120000,
    requested_loan_amount: 300000,
    arv_estimate: 525000,
    sow_items: [
      { category: "Structural", description: "Roof, framing, and masonry repairs", total_usd: 65000 },
      { category: "Mechanical", description: "HVAC, electrical, and plumbing systems", total_usd: 54000 },
      { category: "Interiors", description: "Kitchen, baths, flooring, and finishes", total_usd: 71000 },
    ],
    total_construction: 190000,
    approved_arv: null,
    approved_total_construction: null,
    approved_purchase_price: null,
    approved_loan_amount: null,
    approved_scenario: null,
    loan_type: "fix_flip",
    expected_closing_date: "2026-11-20",
    borrower_notes: "Rehabilitation includes structural, mechanical, and finish upgrades.",
    admin_notes: null,
    borrower_entity: "Pomona Avenue Holdings LLC",
    status: "pending",
    quote_number: null,
    pdf_url: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: "2026-08-22T16:00:00Z",
    updated_at: "2026-08-22T16:00:00Z",
    parent_prequal_request_id: null,
    superseded_by_id: null,
    source_analysis_run_id: null,
    version_num: 1,
  };
  await page.route(/\/api\/v1\/admin\/prequal-requests(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([request]) });
  });

  await openConsolePage(page, "/admin/prequal-requests");
  await page.locator(".gridrow.act", { hasText: request.target_property_address }).click();
  const dialog = page.getByRole("dialog", { name: "Review pre-qualification request" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".prequal-form-section")).toHaveCount(5);
  await expect(dialog.locator(".prequal-review-form-scroll .panel")).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: "Offer numbers" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Calculator scenario" })).toBeVisible();

  const form = dialog.locator(".prequal-review-form-scroll");
  const before = await form.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
  expect(before.overflowY).toBe("auto");
  await form.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));

  const after = await page.evaluate(() => {
    const form = document.querySelector<HTMLElement>(".prequal-review-form-scroll");
    const preview = document.querySelector<HTMLElement>(".prequal-review-body > :nth-child(2)");
    const lastSection = document.querySelector<HTMLElement>(".prequal-form-section:last-child");
    const footer = document.querySelector<HTMLElement>("[role='dialog'] > :last-child");
    return {
      formScrollTop: form?.scrollTop ?? 0,
      previewScrollTop: preview?.scrollTop ?? 0,
      lastSectionBottom: lastSection?.getBoundingClientRect().bottom ?? 0,
      footerTop: footer?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(after.formScrollTop).toBeGreaterThan(0);
  expect(after.previewScrollTop).toBe(0);
  expect(after.lastSectionBottom).toBeLessThanOrEqual(after.footerTop);
  await expect(dialog.getByRole("heading", { name: "Borrower’s submission" })).toBeVisible();
  await assertStableGeometry(page);
  await captureReviewImage(page, "prequalification-continuous-form", testInfo);
});

test("operator Vault groups bounded loan folders by borrower", async ({ page }, testInfo) => {
  test.skip(!["desktop-1600", "mobile-390"].includes(testInfo.project.name), "The Vault workspace is exercised at desktop and mobile widths.");
  const indexRequests: string[] = [];
  const documentRequests: string[] = [];
  const loans = [
    {
      loan_id: "10000000-0000-0000-0000-000000000001",
      deal_id: "QC-2026-0101",
      borrower_id: "20000000-0000-0000-0000-000000000001",
      borrower_name: "Jordan Rivera",
      entity_name: "Rivera Property Group LLC",
      address: "115 Market Street",
      city: "Newark",
      state: "NJ",
      stage: "collecting_docs",
      documents: 14,
      requested: 2,
      pending_review: 3,
      verified: 8,
      flagged: 1,
      updated_at: "2026-08-22T14:00:00Z",
    },
    {
      loan_id: "10000000-0000-0000-0000-000000000002",
      deal_id: "QC-2026-0098",
      borrower_id: "20000000-0000-0000-0000-000000000001",
      borrower_name: "Jordan Rivera",
      entity_name: "Rivera Newark Holdings LLC",
      address: "42 Broad Street",
      city: "Newark",
      state: "NJ",
      stage: "prequalified",
      documents: 6,
      requested: 0,
      pending_review: 1,
      verified: 5,
      flagged: 0,
      updated_at: "2026-08-21T14:00:00Z",
    },
    {
      loan_id: "10000000-0000-0000-0000-000000000003",
      deal_id: "QC-2026-0087",
      borrower_id: "20000000-0000-0000-0000-000000000002",
      borrower_name: "Avery Chen",
      entity_name: null,
      address: "8 Pine Avenue",
      city: "Trenton",
      state: "NJ",
      stage: "lender_connected",
      documents: 9,
      requested: 0,
      pending_review: 0,
      verified: 9,
      flagged: 0,
      updated_at: "2026-08-20T14:00:00Z",
    },
  ];
  await page.route(/\/documents\/vault(?:\?.*)?$/, async (route) => {
    indexRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: loans,
        totals: { borrowers: 2, loan_files: 3, documents: 29, need_attention: 3 },
        total: 3,
        limit: 20,
        offset: 0,
      }),
    });
  });
  await page.route(/\/documents\/vault\/[^/?]+(?:\?.*)?$/, async (route) => {
    documentRequests.push(route.request().url());
    const loanId = new URL(route.request().url()).pathname.split("/").at(-1);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: `doc-${loanId}`,
            loan_id: loanId,
            name: "Operating Account Statements.pdf",
            category: "experience",
            s3_key: "loans/fixture/statement.pdf",
            status: "verified",
            requested_on: null,
            received_on: "2026-08-22",
            verified_at: "2026-08-22T14:00:00Z",
            verified_by: "ai",
            checklist_key: "Bank statements",
            is_other: false,
            ai_notes: null,
            ai_scan_status: "scanned",
            ai_scan_confidence: 0.98,
            due_date: null,
          },
        ],
        total: 1,
        limit: 25,
        offset: 0,
      }),
    });
  });

  await openConsolePage(page, "/vault");
  await expect(page.locator(".vault-borrower-row")).toHaveCount(2);
  await expect(page.getByText("Jordan Rivera", { exact: true })).toBeVisible();
  await expect(page.getByText("Avery Chen", { exact: true })).toBeVisible();
  await expect(page.locator(".vault-loan-row")).toHaveCount(3);
  await expect(page.locator(".vault-loan-row").first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Operating Account Statements.pdf", { exact: true })).toBeVisible();
  expect(indexRequests.some((url) => url.includes("limit=20"))).toBeTruthy();
  expect(documentRequests.some((url) => url.includes("limit=25"))).toBeTruthy();

  await page.getByText("QC-2026-0098", { exact: true }).click();
  await expect(page.locator(".vault-loan-row").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => documentRequests.some((url) => url.includes("10000000-0000-0000-0000-000000000002"))).toBeTruthy();
  await assertStableGeometry(page);
  await captureReviewImage(page, "vault-borrower-loan-groups", testInfo);
});

test("client Vault keeps the personal requested and asset sections", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "Client role confinement is checked once at the canonical viewport.");
  await context.addCookies([{ name: "qc_visual_qa_user", value: "marcus@qc.dev", url: BASE_URL }]);
  await openConsolePage(page, "/vault");
  await expect(page.getByRole("tab", { name: /^Requested/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Experience/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Active assets/ })).toBeVisible();
  await expect(page.getByText("Borrower loan folders", { exact: true })).toHaveCount(0);
  await expect(page.getByText("With Vault activity", { exact: true })).toHaveCount(0);
  await assertStableGeometry(page);
});

test("bucket deep link closes and stays closed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The bucket workflow is exercised at the canonical viewport.");
  const bucketId = process.env.QC_E2E_BUCKET_ID;
  test.skip(!bucketId, "A bucket fixture is required.");
  await openConsolePage(page, `/admin/buckets?bucket=${bucketId}`);
  const bucketRoom = page.getByRole("dialog");
  await expect(bucketRoom).toBeVisible();
  await bucketRoom.getByRole("button", { name: "Close" }).click();
  await expect(bucketRoom).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/buckets$/);
  await page.waitForTimeout(300);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("bucket files open in a full-screen navigable review workspace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The bucket workflow is exercised at the canonical viewport.");
  const bucketId = process.env.QC_E2E_BUCKET_ID;
  test.skip(!bucketId, "A bucket fixture is required.");
  await openConsolePage(page, `/admin/buckets?bucket=${bucketId}`);
  const bucketRoom = page.getByRole("dialog");
  await bucketRoom.getByRole("button", { name: "Preview" }).first().click();
  const reviewer = page.locator(".bucket-review-shell");
  await expect(reviewer).toBeVisible();
  const bounds = await reviewer.boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.y).toBe(0);
  expect(bounds?.width).toBe(1600);
  expect(bounds?.height).toBe(1000);
  await expect(reviewer.locator(".bucket-review-file")).toHaveCount(2);
  await captureReviewImage(page, "bucket-file-review", testInfo);
  await reviewer.getByRole("button", { name: "Close" }).click();
  await expect(reviewer).toBeHidden();
});

test("operator AI intake exposes private underwriting chat and the client transcript", async ({ page }, testInfo) => {
  test.skip(!["desktop-1600", "mobile-390"].includes(testInfo.project.name), "The chat workspace is exercised at desktop and mobile widths.");
  const intakeId = process.env.QC_E2E_INTAKE_ID;
  test.skip(!intakeId, "An intake fixture is required.");
  await page.route(`**/admin/ai-underwriter-leads/${intakeId}/client-thread`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          { id: "client-turn", role: "user", author_name: "Fixture Client", content: "Did you receive the bank statements I uploaded?", created_at: "2026-08-22T13:00:00Z" },
          { id: "client-ai-turn", role: "assistant", author_name: "Bucket AI", content: "Yes. The statements are in your secure intake room.", created_at: "2026-08-22T13:00:01Z" },
        ],
      }),
    });
  });
  await openConsolePage(page, `/admin/ai-underwriter-leads?lead=${intakeId}`);
  const intakeFile = page.locator(".ai-intake-detail-shell");
  await expect(intakeFile).toBeVisible();
  await expect(intakeFile.getByRole("tab", { name: "Underwriter AI" })).toHaveAttribute("aria-selected", "true");
  await expect(intakeFile.getByText("Underwriter conversation", { exact: true })).toBeVisible();
  await expect(intakeFile.getByLabel("Message the AI underwriter")).toBeVisible();
  await assertStableGeometry(page);
  await captureReviewImage(page, "intake-underwriter-ai", testInfo);

  await intakeFile.getByRole("tab", { name: "Client conversation" }).click();
  await expect(intakeFile.getByText("Did you receive the bank statements I uploaded?", { exact: true })).toBeVisible();
  await expect(intakeFile.getByText("Yes. The statements are in your secure intake room.", { exact: true })).toBeVisible();
  await expect(intakeFile.getByLabel("Reply on behalf (as underwriter)")).toBeVisible();
  await assertStableGeometry(page);
  await captureReviewImage(page, "intake-client-conversation", testInfo);
});

test("intake evidence, contact editing, and review controls share the file workspace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The intake workflow is exercised at the canonical viewport.");
  const intakeId = process.env.QC_E2E_INTAKE_ID;
  test.skip(!intakeId, "An intake fixture is required.");
  await openConsolePage(page, `/admin/ai-underwriter-leads?lead=${intakeId}`);
  const intakeFile = page.locator(".ai-intake-detail-shell");
  await expect(intakeFile).toBeVisible();

  await intakeFile.getByRole("tab", { name: "Workflow" }).click();
  await expect(intakeFile.locator(".submission-step.status-complete")).toHaveCount(1);
  await expect(intakeFile.locator(".submission-step.status-partial")).toHaveCount(1);
  await expect(intakeFile.locator(".submission-step.status-not-started")).toHaveCount(3);

  await intakeFile.getByRole("button", { name: /Evidence in/i }).click();
  const evidenceBrowser = intakeFile.locator(".evidence-browser");
  await expect(evidenceBrowser).toBeVisible();
  await expect(evidenceBrowser.locator(".evidence-file-row")).toHaveCount(2);
  await captureReviewImage(page, "intake-evidence-browser", testInfo);

  await intakeFile.getByRole("button", { name: "Edit contact details" }).click();
  const contactDrawer = page.getByRole("dialog", { name: "Edit contact and entity" });
  await expect(contactDrawer.getByLabel("Legal entity / LLC")).toHaveValue(/Sierra Pacific Freight/i);
  await expect(contactDrawer.getByLabel("Email")).toHaveValue("fixture0@qc.dev");
  await contactDrawer.getByRole("button", { name: "Cancel" }).click();

  await intakeFile.getByRole("button", { name: /AI review/i }).first().click();
  const probabilityMetric = intakeFile.locator(".intake-review-grid .knum.prose").first();
  await expect(probabilityMetric).toBeVisible();
  const probabilityContained = await probabilityMetric.evaluate((element) => {
    const tile = element.closest(".kpi");
    if (!(tile instanceof HTMLElement)) return false;
    const valueRect = element.getBoundingClientRect();
    const tileRect = tile.getBoundingClientRect();
    return valueRect.left >= tileRect.left && valueRect.right <= tileRect.right + 1;
  });
  expect(probabilityContained).toBe(true);
  await intakeFile.getByRole("button", { name: /Run AI review/i }).first().click();
  const reviewDrawer = page.getByRole("dialog", { name: "Run AI review" });
  await expect(reviewDrawer).toContainText("continue working anywhere in the console");
  await reviewDrawer.getByRole("button", { name: "Cancel" }).click();
});

test("public client intake entry points retain the language and secure-start gate", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The public intake entry points are checked once at the canonical viewport.");
  for (const route of ["/dealer-ai-underwriter", "/funding-review", "/mca-refinance-intake"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByRole("heading", { name: "Choose your language / Elige tu idioma" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue in English" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar en Español" })).toBeVisible();
  }
});

test("AI review minimizes, survives navigation, and returns to the completed intake", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The background lifecycle is exercised at the canonical viewport.");
  const intakeId = process.env.QC_E2E_INTAKE_ID;
  test.skip(!intakeId, "An intake fixture is required.");
  let complete = false;
  await page.route(`**/admin/ai-underwriter-leads/${intakeId}/run-review`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review_id: "review-background-fixture", status: "queued" }) });
  });
  await page.route(`**/admin/ai-underwriter-leads/${intakeId}/review-progress?**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        review_id: "review-background-fixture",
        status: complete ? "completed" : "running",
        stage: complete ? "complete" : "analyzing",
        label: complete ? "Review complete" : "Analyzing linked evidence",
        percent: complete ? 100 : 48,
        files_total: 2,
        files_done: complete ? 2 : 1,
        error: null,
      }),
    });
  });

  await openConsolePage(page, `/admin/ai-underwriter-leads?lead=${intakeId}`);
  const intakeFile = page.locator(".ai-intake-detail-shell");
  await intakeFile.getByRole("tab", { name: "Workflow" }).click();
  await intakeFile.getByRole("button", { name: /AI review/i }).first().click();
  await intakeFile.getByRole("button", { name: /Run AI review/i }).first().click();
  await page.getByRole("dialog", { name: "Run AI review" }).getByRole("button", { name: "Run review" }).click();
  const progress = page.getByRole("dialog", { name: "Running AI review..." });
  await expect(progress).toContainText("Analyzing linked evidence");
  await progress.getByRole("button", { name: "Minimize" }).click();

  await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toHaveText("Pipeline");
  const dock = page.getByLabel("AI reviews");
  await expect(dock).toContainText("Sierra Pacific Freight LLC");
  await expect(dock).toContainText("48%");

  complete = true;
  await expect(dock.locator(".ai-review-job.done")).toBeVisible({ timeout: 6_000 });
  await dock.locator(".ai-review-job-main").click();
  await expect(page).toHaveURL(new RegExp(`/admin/ai-underwriter-leads\\?lead=${intakeId}`));
});

test("bucket and intake share the same reversible evidence-link workflow", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "desktop-1600", "The mutation workflow is exercised once at the canonical viewport.");
  const bucketId = process.env.QC_E2E_LINK_BUCKET_ID;
  const intakeId = process.env.QC_E2E_LINK_INTAKE_ID;
  test.skip(!bucketId || !intakeId, "Disposable bucket and intake fixtures are required.");

  await openConsolePage(page, `/admin/buckets?bucket=${bucketId}`);
  await page.getByRole("dialog").getByRole("button", { name: /Link bucket to AI intake/i }).click();
  let linkDialog = page.getByRole("dialog", { name: "Link bucket and AI intake" });
  await linkDialog.getByLabel("AI intake").selectOption(intakeId!);
  await linkDialog.getByRole("button", { name: "Continue" }).click();
  await expect(linkDialog).toContainText("Select files Elara may read");
  await linkDialog.getByRole("button", { name: "Continue" }).click();
  await expect(linkDialog).toContainText("Review before running");
  await captureReviewImage(page, "overlay-link-review", testInfo);
  await linkDialog.getByRole("button", { name: "Confirm link" }).click();
  await expect(linkDialog).toContainText("Evidence linked");
  await linkDialog.getByRole("button", { name: "Done" }).click();

  await page.goto(`/admin/ai-underwriter-leads?lead=${intakeId}`, { waitUntil: "domcontentloaded" });
  const intakeDialog = page.getByRole("dialog", { name: "AI intake file" });
  await expect(intakeDialog).toBeVisible();
  await intakeDialog.getByRole("button", { name: "More actions" }).click();
  await intakeDialog.getByRole("button", { name: "Attach another bucket" }).click();
  linkDialog = page.getByRole("dialog", { name: "Link bucket and AI intake" });
  await linkDialog.getByLabel("Document bucket").selectOption(bucketId!);
  await linkDialog.getByRole("button", { name: "Continue" }).click();
  await linkDialog.getByRole("button", { name: "Continue" }).click();
  await expect(linkDialog).toContainText("Update linked evidence");
  await linkDialog.getByRole("button", { name: "Unlink" }).click();
  await expect(linkDialog).toContainText("Evidence unlinked");
  await linkDialog.getByRole("button", { name: "Done" }).click();
});

const ROLE_CASES = [
  { role: "client", email: "marcus@qc.dev", route: "/", expected: /Dashboard|Good|Welcome/i, forbidden: /AI intake/i },
  { role: "vendor", email: "vendor@qc.dev", route: "/vendor/buckets", expected: /Bucket|Vendor/i, forbidden: /Pipeline/i },
  { role: "dealer-partner", email: "partner@qc.dev", route: "/broker/ai-underwriter-leads", expected: /Lead|Referral/i, forbidden: /Clients/i },
  { role: "broker", email: "daniel@qc.dev", route: "/", expected: /Dashboard|Good|Welcome/i, forbidden: /Buckets/i },
  { role: "regional-manager", email: "regional@qc.dev", route: "/regional-agents", expected: /Agent|Regional/i, forbidden: /AI intake/i },
  { role: "field-rep", email: "rep@qc.dev", route: "/", expected: /Dashboard|Good|Welcome/i, forbidden: /Settings/i },
] as const;

for (const roleCase of ROLE_CASES) {
  test(`${roleCase.role} sees only its scoped portal shell`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1600", "Role screenshot matrix is captured once at the canonical viewport.");
    await context.addCookies([{ name: "qc_visual_qa_user", value: roleCase.email, url: BASE_URL }]);
    await page.goto(roleCase.route, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await expect(page.locator("body")).toContainText(roleCase.expected);
    const navigationText = (await page.locator("nav").allTextContents()).join(" ");
    expect(navigationText).not.toMatch(roleCase.forbidden);
    await assertStableGeometry(page);
    await captureReviewImage(page, `role-${roleCase.role}`, testInfo);
  });
}
