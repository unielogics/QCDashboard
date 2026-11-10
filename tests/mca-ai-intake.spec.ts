import { expect, test, type Page } from "@playwright/test";
test.setTimeout(60_000);

const TOKEN = "room.mca-ai-test";
const PIN = "482691";
const documents = [
  { id: "bank", name: "Last 6 complete months business bank statements", category: "Bank Statements", requirement_key: "business_bank_statements_6_months", required: true, allow_multiple_files: true, status: "missing" },
  { id: "debt", name: "Business debt schedule", category: "Debts", requirement_key: "business_debt_schedule", required: true, status: "missing" },
  { id: "tax", name: "Prior-year business tax return", category: "Tax Returns", requirement_key: "business_tax_returns_1_years", required: true, status: "missing" },
];

async function mockMca(page: Page, options: { failStartOnce?: boolean; failChatOnce?: boolean; failRunOnce?: boolean; mca?: boolean; locale?: "en" | "es"; assignedAgreements?: boolean; paymentMethods?: boolean; staffReply?: boolean } = {}) {
  const state = { starts: [] as Record<string, unknown>[], chats: [] as Record<string, unknown>[], resumes: [] as Record<string, unknown>[], reviewReads: 0, runs: 0, uploads: [] as Record<string, unknown>[], formLinks: 0 };
  let startFailure = options.failStartOnce; let chatFailure = options.failChatOnce; let runFailure = options.failRunOnce;
  let running = false; let finished = false;
  const files: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  if (options.staffReply) messages.push({ id: "staff-reply", role: "user", sender_kind: "operator", author_name: "Test Advisor", content: "I will review your original documents.", created_at: "2026-11-09T18:00:00Z" });
  const roomUrl = () => `${new URL(page.url()).origin}/buckets/request/${TOKEN}`;
  const session = () => ({ room_kind: "application", bucket: { name: "MCA · Example Business LLC", purpose: "Main Street MCA review" }, recipient_name: "Example Owner", recipient_email: "owner@example.com", allow_notes: true, passcode_needs_setup: false, requested_documents: documents, files,
    evidence_banking_summary: { requirements: documents.map((doc) => ({ requirement_key: doc.requirement_key, label: doc.name, required_level: "required", status: "missing", complete: false, evidence_count: doc.id === "bank" ? files.length : 0, accepted_evidence_count: 0, processing_evidence_count: 0 })), required_count: 3, completed_required_count: 0, missing_required_count: 3, processing_file_count: 0, supporting_file_count: 0, bank_evidence: { source: files.length ? "uploaded_statements" : "none", connected_institutions: 0, banking_access_complete: false, accepted_statement_months: [], required_statement_months: 6, statement_coverage_complete: false, processing_files: 0, needs_attention_files: 0, reconnect_required: false } },
  });
  const review = () => ({ funding_intent: "merchant_cash_advance", business_name: "Example Business LLC", preferred_language: options.locale || "en", payment_methods_enabled: options.paymentMethods === true, status: running ? "queued" : finished ? "completed" : "not_started", progress: { stage: running ? "queued" : finished ? "complete" : "waiting", label: running ? "Your file is queued for source review." : "Upload your documents to continue.", percent: running ? 10 : null, files_total: files.length, files_done: finished ? files.length : 0 }, messages, summary: finished ? "Two statement months were identified. Four more months and the other requested items still need review." : null, requirements: documents.map((doc) => ({ key: doc.requirement_key, label: doc.name, status: "missing", received: doc.id === "bank" && finished ? 2 : 0, required: doc.id === "bank" ? 6 : 1, unit: doc.id === "bank" ? "months" : "documents" })), actions: [{ kind: "upload", label: "Upload the requested documents" }, { kind: "debt_schedule", label: "Complete the business debt schedule" }, { kind: "application", label: "Complete application details" }], policy_status: "needs_information" });
  await page.addInitScript(() => { window.addEventListener("qc:conversion", ((event: CustomEvent) => { const items = JSON.parse(sessionStorage.getItem("test.mca.conversions") || "[]"); items.push(event.detail); sessionStorage.setItem("test.mca.conversions", JSON.stringify(items)); }) as EventListener); });
  await page.route("**/mock-mca-storage/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const body = request.method() === "GET" ? {} : request.postDataJSON() || {};
    let status = 200; let data: unknown = {};
    if (path.endsWith("/public/mca/intake/start")) {
      state.starts.push(body);
      if (startFailure) { startFailure = false; status = 503; data = { detail: "Temporary file creation outage. Retry with your saved answers." }; }
      else data = { intake_id: "mca-intake", variant: "main_street_v1", funding_intent: "merchant_cash_advance", room_url: roomUrl(), resume_url: roomUrl() };
    } else if (path.endsWith("/public/mca/intake/resume")) { state.resumes.push(body); data = { ok: true, message: "If a file exists, a link will be sent." }; }
    else if (path.endsWith(`/buckets/request/${TOKEN}`)) data = { ...session(), requires_passcode: true, status: "active" };
    else if (path.endsWith(`/buckets/request/${TOKEN}/access`) || path.endsWith(`/buckets/request/${TOKEN}/status`)) {
      if (body.passcode !== PIN) { status = 401; data = { detail: "The room PIN did not work." }; } else data = session();
    } else if (path.includes(`/public/mca/room/${TOKEN}/`)) {
      expect(body.passcode).toBe(PIN); expect(request.headers().authorization).toBeUndefined();
      if (path.endsWith("/review")) { state.reviewReads++; if (running) { running = false; finished = true; } data = review(); }
      else if (path.endsWith("/chat")) {
        state.chats.push(body);
        if (chatFailure) { chatFailure = false; status = 503; data = { detail: "The AI response is temporarily unavailable. Retry your message." }; }
        else { messages.push({ id: `user-${messages.length}`, role: "user", content: body.message, created_at: "2026-11-09T18:00:00Z" }, { id: `assistant-${messages.length}`, role: "assistant", content: options.locale === "es" ? "La elegibilidad sigue pendiente de revisión documental." : "Eligibility remains pending source review. Upload the prior-year business return and the remaining statements.", created_at: "2026-11-09T18:00:01Z" }); data = review(); }
      } else {
        state.runs++;
        if (runFailure) { runFailure = false; status = 503; data = { detail: "Review could not start. Try again." }; } else { running = true; data = review(); }
      }
    } else if (path.endsWith(`/application-profiles/public/room/${TOKEN}/state`)) data = {
      business_name: "Example Business LLC", owners: [], capabilities: ["application", "ownership", "owner_credit", "business_banking", "agreements", ...(options.mca === false ? [] : ["mca_ai_review"])], precall: null, merchant_offer: null,
      verification: { ownership_complete: false, ownership_total: 0, owner_contact_complete: false, business_banking_complete: false, bank_connection_count: 0, bank_statement_months: 0, owner_credit_complete: false, required_credit_owner_count: 0, completed_credit_owner_count: 0 },
      banking: { enabled: false, environment: "sandbox", consent_granted: false, disclosure_text: "", items: [], assets_enabled: false, statements_enabled: false, selected_products: [], available_products: [] }, signable: options.assignedAgreements ? [{ id: "lender-agreement", name: "Lender agreement", status: "pending" }] : [], contracts: [], envelopes: [],
    };
    else if (path.endsWith(`/application-profiles/public/room/${TOKEN}/timeline`)) data = { events: [] };
    else if (path.endsWith(`/application-profiles/public/room/${TOKEN}/application`)) data = { vertical: "main_street", full_name: "Example Owner", email: "owner@example.com", phone: "9735550148", business_name: "Example Business LLC", funding_need: "merchant_cash_advance", funding_need_editable: false, requested_amount_editable: true, submitted_at: null };
    else if (path.endsWith(`/application-rooms/${TOKEN}/collection-tasks`)) data = { tasks: [{ id: "debt-task", label: "Business debt schedule", action_type: "complete_form", status: "requested", assignee: "borrower", config: { form_kind: "debt_schedule", requested_document_ids: ["debt"] } }] };
    else if (path.endsWith(`/application-rooms/${TOKEN}/collection-tasks/debt-task/form-link`)) { state.formLinks++; expect(body.passcode).toBe(PIN); data = { url: "/forms/debt_schedule/test-mca-form" }; }
    else if (path.endsWith(`/buckets/request/${TOKEN}/upload-init`)) { state.uploads.push(body); expect(body.passcode).toBe(PIN); data = { file_id: "bank-file", upload_url: `${new URL(page.url()).origin}/mock-mca-storage/bank-file`, required_headers: {} }; }
    else if (path.endsWith(`/buckets/request/${TOKEN}/complete`)) { files.push({ id: "bank-file", requested_document_id: "bank", file_name: "statements.csv", content_type: "text/csv", size_bytes: 50, status: "uploaded", analysis_status: "completed", created_at: "2026-11-09T18:00:00Z" }); data = files[0]; }
    else { status = 404; data = { detail: "Not available in this synthetic test room." }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  return state;
}

async function eligibility(page: Page, unknown = false) {
  await page.getByLabel("How many active MCAs does the business have now?").selectOption(unknown ? "unknown" : "2");
  await page.getByLabel("Has any active MCA been modified?").selectOption(unknown ? "unknown" : "no");
  await page.getByLabel(/Reported ordinary business income/).selectOption(unknown ? "unknown" : "nonnegative");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function contact(page: Page) {
  await page.getByLabel("Your full name", { exact: true }).fill("Example Owner"); await page.getByLabel("Legal business name", { exact: true }).fill("Example Business LLC");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com"); await page.getByLabel("Mobile number", { exact: true }).fill("9735550148");
  await page.getByRole("combobox", { name: "Requested amount", exact: true }).selectOption("not_sure"); await page.getByRole("combobox", { name: "Average monthly revenue", exact: true }).selectOption("unknown"); await page.getByRole("combobox", { name: "Time in business", exact: true }).selectOption("unknown");
  await page.getByLabel("Choose a 6-digit room PIN", { exact: true }).fill(PIN); await page.getByLabel("Confirm room PIN", { exact: true }).fill(PIN); await page.getByRole("checkbox").check();
}
async function enterRoom(page: Page) {
  await expect(page.getByLabel("Room PIN", { exact: true })).toBeVisible();
  await page.getByLabel("Room PIN", { exact: true }).fill(PIN); await page.getByRole("button", { name: "Open application room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your MCA file, with AI guidance", exact: true })).toBeVisible();
}
async function openEvidence(review: ReturnType<Page["getByRole"]>) {
  const summary = review.locator("summary");
  if (await summary.isVisible() && await summary.locator("..").getAttribute("open") === null) await summary.click();
}

test("an unknown applicant opens a real PIN room, uploads, asks AI, reviews sources and opens the debt form", async ({ page }, testInfo) => {
  const state = await mockMca(page);
  await page.goto("/mca-funding-intake?locale=en&page=/industries/main-street&campaign=main_street_route_check&cta=new_mca_file&utm_source=google");
  await page.screenshot({ path: testInfo.outputPath("mca-start.png"), fullPage: true });
  await eligibility(page, true); await contact(page); await page.getByRole("button", { name: "Open my MCA review", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/buckets/request/${TOKEN}\\?tab=ai-review$`));
  expect(page.url()).not.toContain(PIN); expect(state.reviewReads).toBe(0); expect(state.starts).toHaveLength(1);
  expect(state.starts[0]).toMatchObject({ active_mca_count: null, has_modified_mca: null, last_year_tax_earnings: "unknown", monthly_revenue: null, time_in_business: null, consent_version: "mca-ai-intake-v3", attribution: { page: "/industries/main-street", campaign: "main_street_route_check", cta: "new_mca_file", vertical: "main_street", program: "merchant_cash_advance" } });
  const conversion = await page.evaluate(() => JSON.parse(sessionStorage.getItem("test.mca.conversions") || "[]"));
  expect(conversion).toHaveLength(1); expect(conversion[0]).toMatchObject({ event: "qc_application_start", program: "merchant_cash_advance", page: "/industries/main-street" }); expect(JSON.stringify(conversion)).not.toContain("owner@example.com"); expect(JSON.stringify(conversion)).not.toContain(PIN);
  await enterRoom(page);
  for (const name of ["Owners and verification", "Agreements", "Payments", "Use of funds"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  const review = page.getByRole("region", { name: "MCA AI review", exact: true }); await expect(review.getByText("More information needed", { exact: true })).toBeVisible();
  await review.getByLabel("Message your AI reviewer").fill("Can you help me understand the tax return requirement?"); await review.getByRole("button", { name: "Send", exact: true }).click(); await expect(review).toContainText("Eligibility remains pending source review.");
  await openEvidence(review); await review.getByRole("button", { name: "Upload the requested documents", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "statements.csv", mimeType: "text/csv", buffer: Buffer.from("month,deposits\n2026-09,1000\n2026-10,1100") });
  await page.locator(".application-room-queue select").selectOption("bank"); await page.getByRole("button", { name: "Submit 1 file", exact: true }).click(); await expect(page.getByText("1 file received.", { exact: true })).toBeVisible();
  expect(state.uploads).toHaveLength(1); expect(state.uploads[0]).toMatchObject({ requested_document_id: "bank", passcode: PIN });
  await page.getByRole("button", { name: "MCA AI review", exact: true }).click(); await review.getByRole("button", { name: "Review my documents", exact: true }).click(); await expect(review.getByRole("progressbar")).toBeVisible();
  await expect(review).toContainText("Source review complete", { timeout: 15_000 }); await expect(review).toContainText("2 of 6 months"); await expect(review).toContainText("More information needed");
  if (await review.locator("summary").isVisible()) await review.locator("summary").click();
  await page.screenshot({ path: testInfo.outputPath("mca-room-ai.png"), fullPage: true });
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth })); expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1);
  await openEvidence(review); await review.getByRole("button", { name: "Complete the business debt schedule", exact: true }).click(); await expect(page.getByRole("button", { name: "Complete form online", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Complete form online", exact: true }).click(); await expect(page).toHaveURL(/\/forms\/debt_schedule\/test-mca-form$/); expect(state.formLinks).toBe(1);
});

test("temporary start failures retain inputs and retry the same request without premature analytics", async ({ page }) => {
  const state = await mockMca(page, { failStartOnce: true }); await page.goto("/mca-funding-intake"); await eligibility(page); await contact(page);
  await page.getByRole("button", { name: "Open my MCA review", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Temporary file creation outage" })).toBeVisible(); await expect(page.getByLabel("Legal business name", { exact: true })).toHaveValue("Example Business LLC");
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("test.mca.conversions") || "[]"))).toEqual([]);
  await page.getByRole("button", { name: "Open my MCA review", exact: true }).click(); await expect(page.getByLabel("Room PIN", { exact: true })).toBeVisible(); expect(state.starts).toHaveLength(2); expect(state.starts[0].idempotency_key).toBe(state.starts[1].idempotency_key);
});

test("zero existing MCAs skip the modification question and known disqualifiers never create a file", async ({ page }) => {
  const state = await mockMca(page); await page.goto("/mca-funding-intake"); await page.getByLabel("How many active MCAs does the business have now?").selectOption("0"); await expect(page.getByLabel("Has any active MCA been modified?")).toHaveCount(0);
  await page.getByLabel("How many active MCAs does the business have now?").selectOption("2"); await expect(page.getByLabel("Has any active MCA been modified?")).toHaveValue("");
  await page.getByLabel("Has any active MCA been modified?").selectOption("yes"); await page.getByLabel(/Reported ordinary business income/).selectOption("nonnegative"); await page.getByRole("button", { name: "Continue", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "do not fit this MCA product" })).toBeVisible(); expect(state.starts).toHaveLength(0);
});

test("wrong PIN cannot load the AI review and ordinary rooms never show the MCA tab", async ({ page }) => {
  const state = await mockMca(page, { mca: false }); await page.goto(`/buckets/request/${TOKEN}?tab=ai-review`); await page.getByLabel("Room PIN", { exact: true }).fill("111111"); await page.getByRole("button", { name: "Open application room", exact: true }).click(); await expect(page.getByText("The room PIN did not work.", { exact: true })).toBeVisible(); expect(state.reviewReads).toBe(0);
  await page.getByLabel("Room PIN", { exact: true }).fill(PIN); await page.getByRole("button", { name: "Open application room", exact: true }).click(); await expect(page.getByRole("heading", { name: "Complete your application details" })).toBeVisible(); await expect(page.getByRole("button", { name: "MCA AI review", exact: true })).toHaveCount(0); expect(state.reviewReads).toBe(0);
});

test("AI chat and review failures can be retried without losing the draft", async ({ page }) => {
  const state = await mockMca(page, { failChatOnce: true, failRunOnce: true }); await page.goto(`/buckets/request/${TOKEN}`); await enterRoom(page);
  const review = page.getByRole("region", { name: "MCA AI review", exact: true }); await review.getByLabel("Message your AI reviewer").fill("What is still missing?"); await review.getByRole("button", { name: "Send", exact: true }).click(); await expect(review.getByRole("alert")).toContainText("AI response is temporarily unavailable"); await expect(review.getByLabel("Message your AI reviewer")).toHaveValue("What is still missing?");
  await review.getByRole("button", { name: "Send", exact: true }).click(); await expect(review).toContainText("Eligibility remains pending source review."); expect(state.chats).toHaveLength(2);
  await review.getByRole("button", { name: "Review my documents", exact: true }).click(); await expect(review.getByRole("alert")).toContainText("Review could not start"); await expect(review.getByRole("button", { name: "Review my documents", exact: true })).toBeEnabled();
  await page.reload(); await enterRoom(page); await expect(page.getByRole("log")).toContainText("What is still missing?"); expect(state.starts).toHaveLength(0);
});

test("Spanish entry and saved file language stay distinct from an explicit no-PIN email resume", async ({ page }) => {
  const state = await mockMca(page, { locale: "es" }); await page.goto("/mca-funding-intake?locale=es&resume=1"); await expect(page.getByRole("heading", { name: "Continuar un expediente existente", exact: true })).toBeVisible(); expect(state.resumes).toHaveLength(0);
  await page.getByLabel("Correo electrónico", { exact: true }).fill("owner@example.com"); await page.getByRole("button", { name: "Enviarme mi enlace por correo", exact: true }).click(); await expect(page.getByRole("status")).toContainText("El PIN no se incluye."); expect(state.resumes).toEqual([{ email: "owner@example.com" }]);
  await page.goto(`/buckets/request/${TOKEN}`); await page.getByLabel("Room PIN", { exact: true }).fill(PIN); await page.getByRole("button", { name: "Open application room", exact: true }).click(); await expect(page.getByRole("heading", { name: "Su expediente MCA, con guía de IA", exact: true })).toBeVisible(); await page.getByLabel("Mensaje a su revisor IA").fill("¿Qué falta?"); await page.getByRole("button", { name: "Enviar", exact: true }).click(); await expect(page.getByRole("log")).toContainText("La elegibilidad sigue pendiente");
});

test("explicit later-stage agreements and payments remain available and staff replies retain their identity", async ({ page }) => {
  await mockMca(page, { assignedAgreements: true, paymentMethods: true, staffReply: true }); await page.goto(`/buckets/request/${TOKEN}`); await enterRoom(page);
  await expect(page.getByRole("button", { name: "Agreements", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Payments", exact: true })).toBeVisible();
  const reply = page.getByRole("log").getByText("I will review your original documents.", { exact: true }).locator(".."); await expect(reply).toContainText("Test Advisor"); await expect(reply).not.toContainText("You");
  await expect(page.getByRole("button", { name: "Owners and verification", exact: true })).toHaveCount(0);
});
