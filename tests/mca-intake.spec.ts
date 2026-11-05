import { expect, test, type Page } from "@playwright/test";

const token = "synthetic-mca-token";
const documents = [
  { id: "bank", name: "Last 6 months bank statements", category: "Bank Statements", requirement_key: "business_bank_statements_6_months", required: true, allow_multiple_files: true, status: "missing" },
  { id: "credit", name: "Credit Report Authorization", category: "Compliance", requirement_key: "signed_credit_authorization", signature_kind: "credit_authorization", requires_signature: true, required: true, status: "missing" },
  { id: "terms", name: "Current MCA / advance terms", category: "Debts", requirement_key: "current_advance_terms", required: true, allow_multiple_files: true, status: "missing" },
];

async function mockIntake(page: Page, options: { failRestore?: boolean; failConfirmation?: boolean; failRefreshAfterComplete?: boolean } = {}) {
  let transientRestore = options.failRestore ?? false;
  let failConfirmation = options.failConfirmation ?? false;
  let failRefresh = options.failRefreshAfterComplete ?? false;
  const state = { starts: [] as Record<string, unknown>[], initCount: 0, puts: 0, completes: 0, getCount: 0, response: () => response() };
  const pending = new Map<string, Record<string, unknown>>();
  const files: Record<string, unknown>[] = [];
  const response = () => ({ token, intake: { id: "intake", bucket_id: "bucket", status: "collecting", full_name: "Example Applicant", email: "example@example.com", business_name: "Example Company", preferred_language: "en", years_in_business: 3 },
    requested_documents: documents, files, messages: [], assistant_message: "Your file is ready for documents.", widget: null,
    mca_refinance_policy: { review_mode: "manual_review", auto_underwriting_allowed: false, active_mca_count: 3, requested_amount: 100000, max_amount: 350000, max_term_months: 120, max_active_mcas: 2, manual_review_requested: true, reason_codes: [] } });
  await page.route("**/api/v1/public/sms-disclosure", (route) => route.fulfill({ json: {
    version: "test", brand: "Qualified Commercial", transactional: "Application updates by text.", marketing: "Optional promotional texts.",
    legal: "Terms and privacy", terms_url: "/terms", privacy_url: "/privacy", support_email: "support@example.com",
  } }));
  await page.route("**/api/v1/public/mca-refinance/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === "POST" ? route.request().postDataJSON() ?? {} : {};
    if (path.endsWith("/session")) return route.fulfill({ status: 401, json: { detail: "No session" } });
    if (path.endsWith("/start")) { state.starts.push(body); return route.fulfill({ status: 201, json: response() }); }
    if (path.endsWith("/upload-init")) {
      state.initCount++;
      const id = `file-${state.initCount}`;
      pending.set(id, { id, requested_document_id: body.requested_document_id, file_name: body.file_name, content_type: body.content_type, size_bytes: body.size_bytes, status: "uploaded", analysis_status: "pending", created_at: "2026-11-05T12:00:00Z" });
      return route.fulfill({ json: { file_id: id, upload_url: `http://127.0.0.1:8999/synthetic-storage/${id}`, required_headers: {} } });
    }
    if (path.endsWith("/files/complete")) {
      state.completes++;
      if (failConfirmation) { failConfirmation = false; return route.fulfill({ status: 503, json: { detail: "Temporary confirmation failure" } }); }
      const file = pending.get(body.file_id)!;
      if (!files.find((item) => item.id === file.id)) files.push(file);
      return route.fulfill({ json: file });
    }
    state.getCount++;
    if (failRefresh && state.completes) { failRefresh = false; return route.fulfill({ status: 503, json: { detail: "Temporary refresh failure" } }); }
    if (transientRestore) { transientRestore = false; return route.fulfill({ status: 503, json: { detail: "Temporary outage" } }); }
    return route.fulfill({ json: response() });
  });
  await page.route("**/synthetic-storage/**", async (route) => { state.puts++; await route.fulfill({ status: 200, body: "" }); });
  return state;
}

test("marketing language is honored and source survives URL cleanup", async ({ page }) => {
  const state = await mockIntake(page);
  await page.goto("/mca-refinance-intake?locale=en&source=public_site&page=%2Fmca-refinance&campaign=mca_refinance&cta=start_mca_review");
  await expect(page.getByRole("heading", { name: "Start your refinance file" })).toBeVisible();
  await expect(page).toHaveURL(/\/mca-refinance-intake$/);
  await page.getByLabel("Full name").fill("Example Applicant");
  await page.getByLabel(/^Email/).fill("example@example.com");
  await page.getByLabel("Mobile number").fill("3055550123");
  await page.getByLabel(/^Business website/).fill("N/A");
  await page.getByLabel(/^What does your business do/).fill("We repair commercial HVAC equipment.");
  await page.locator('input[inputmode="numeric"]').fill("3");
  await page.getByPlaceholder("e.g. 3 or 1.5").fill("3");
  await page.getByRole("checkbox", { name: /Terms and privacy/ }).check();
  await expect(page.getByRole("checkbox", { name: /Application messages/ })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Marketing messages/ })).not.toBeChecked();
  const geometry = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  await page.screenshot({ path: `test-results/mca-start-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: /Start.*3 items/ }).click();
  await expect(page.getByRole("region", { name: "Bank statements" })).toBeVisible();
  await expect(page.getByLabel("Years in business")).toHaveValue("3");
  expect(state.starts).toHaveLength(1);
  expect(state.starts[0]).toMatchObject({ source: "public_site", page: "/mca-refinance", preferred_language: "en", campaign: "mca_refinance", sms_transactional_consent: false, sms_marketing_consent: false, business_website: "N/A", business_description: "We repair commercial HVAC equipment." });
});

test("a temporary resume error retains access and can be retried", async ({ page }) => {
  const state = await mockIntake(page, { failRestore: true });
  await page.goto(`/mca-refinance-intake?token=${token}&locale=en`);
  await expect(page.getByRole("alert").filter({ hasText: "saved access has been kept" })).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("region", { name: "Bank statements" })).toBeVisible();
  expect(state.starts).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem("qc.mca.token"))).toBe(token);
});

test("Spanish arrival does not require a second language selection", async ({ page }) => {
  await mockIntake(page);
  await page.goto("/mca-refinance-intake?locale=es&source=public_site&page=%2Fmca-refinance");
  await expect(page.getByRole("heading", { name: "Comienza tu expediente de refinanciamiento" })).toBeVisible();
});

test("restricted browser storage does not break a token-based room", async ({ page }) => {
  await mockIntake(page);
  await page.addInitScript(() => { Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } }); });
  await page.goto(`/mca-refinance-intake?token=${token}&locale=en`);
  await expect(page.getByRole("region", { name: "Bank statements", exact: true })).toBeVisible();
});

test("the room refreshes background document updates without another user action", async ({ page }) => {
  const state = await mockIntake(page);
  await page.goto(`/mca-refinance-intake?token=${token}&locale=en`);
  await expect(page.getByRole("region", { name: "Bank statements", exact: true })).toBeVisible();
  await expect.poll(() => state.getCount, { timeout: 9000 }).toBeGreaterThan(1);
});

test("failed confirmation retries without duplicate uploads and other files can queue", async ({ page }) => {
  const state = await mockIntake(page, { failConfirmation: true });
  await page.goto(`/mca-refinance-intake?token=${token}&locale=en`);
  const bank = page.getByRole("region", { name: "Bank statements", exact: true });
  await expect(bank).toBeVisible();
  await bank.locator('input[type="file"]').setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from("date,amount\n2026-11-01,100") });
  await expect(bank.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await bank.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(bank.getByText("statement.csv", { exact: true })).toBeVisible();
  await expect.poll(() => state.completes).toBe(2);
  expect(state.puts).toBe(1);
  expect(state.initCount).toBe(1);
  await bank.locator('input[type="file"]').setInputFiles([
    { name: "statement-2.csv", mimeType: "text/csv", buffer: Buffer.from("date,amount\n2026-10-01,100") },
    { name: "statement-3.csv", mimeType: "text/csv", buffer: Buffer.from("date,amount\n2026-09-01,100") },
  ]);
  const terms = page.getByRole("region", { name: "Current advance terms", exact: true });
  await terms.locator('input[type="file"]').setInputFiles({ name: "agreement.csv", mimeType: "text/csv", buffer: Buffer.from("balance\n1000") });
  await expect.poll(() => state.completes).toBe(5);
  await expect(terms.getByText("agreement.csv", { exact: true })).toBeVisible();
  expect(state.puts).toBe(4);
  expect(state.initCount).toBe(4);
  const geometry = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  await page.screenshot({ path: `test-results/mca-intake-${test.info().project.name}.png`, fullPage: true });
});

test("a received file stays visible when the next status refresh fails", async ({ page }) => {
  const state = await mockIntake(page, { failRefreshAfterComplete: true });
  await page.goto(`/mca-refinance-intake?token=${token}&locale=en`);
  const bank = page.getByRole("region", { name: "Bank statements", exact: true });
  await bank.locator('input[type="file"]').setInputFiles({ name: "received.csv", mimeType: "text/csv", buffer: Buffer.from("date,amount\n2026-11-01,100") });
  await expect.poll(() => state.getCount).toBeGreaterThan(1);
  await expect(bank.locator(".vm-file").getByText("received.csv", { exact: true })).toBeVisible();
  expect(state.puts).toBe(1);
  expect(state.completes).toBe(1);
});

test("an empty file is rejected before transfer and can be removed", async ({ page }) => {
  const state = await mockIntake(page);
  await page.goto(`/mca-refinance-intake?token=${token}&locale=en`);
  const bank = page.getByRole("region", { name: "Bank statements", exact: true });
  await bank.locator('input[type="file"]').setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) });
  await expect(bank.getByRole("alert")).toHaveText("This file is empty. Choose the original document.");
  await expect(bank.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await bank.getByRole("button", { name: "Remove empty.csv", exact: true }).click();
  await expect(bank.getByText("empty.csv", { exact: true })).toHaveCount(0);
  expect(state.initCount).toBe(0);
  expect(state.puts).toBe(0);
});

test("an older background refresh cannot replace a newer upload receipt", async ({ page }) => {
  const state = await mockIntake(page);
  let gets = 0;
  let release: () => void = () => undefined;
  let sent = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/v1/public/mca-refinance/${token}`, async (route) => {
    if (++gets !== 2) return route.fallback();
    const older = JSON.parse(JSON.stringify(state.response()));
    await held;
    await route.fulfill({ json: older });
    sent = true;
  });
  await page.goto(`/mca-refinance-intake?token=${token}&locale=en`);
  await expect.poll(() => gets, { timeout: 9000 }).toBe(2);
  const bank = page.getByRole("region", { name: "Bank statements", exact: true });
  try {
    await bank.locator('input[type="file"]').setInputFiles({ name: "newer.csv", mimeType: "text/csv", buffer: Buffer.from("date,amount\n2026-11-01,100") });
    await expect(bank.locator(".vm-file").getByText("newer.csv", { exact: true })).toBeVisible();
  } finally { release(); }
  await expect.poll(() => sent).toBe(true);
  await expect(bank.locator(".vm-file").getByText("newer.csv", { exact: true })).toBeVisible();
});
