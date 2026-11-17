import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);
const RESOURCE = `resource.test.${"r".repeat(64)}`;
const ROOM = "room.business-resource-test";
const PIN = "482691";
const contact = { name: "Resource Owner", business_name: "Example Business LLC", email: "owner@example.com", phone: "9735550148" };

async function mockResource(page: Page, goal: "term_loan" | "merchant_cash_advance" | "mca_refinance", failOnce = false) {
  const starts: Array<Record<string, unknown>> = []; const chats: Array<Record<string, unknown>> = [];
  let failed = false;
  // Local keyless Clerk shows a setup widget over mobile submit controls.
  // This development-only chrome is outside the public intake under test.
  await page.addInitScript(() => {
    const hideSetup = () => { const style = document.createElement("style"); style.textContent = "#clerk-components { display: none !important; }"; document.head.append(style); };
    if (document.head) hideSetup(); else document.addEventListener("DOMContentLoaded", hideSetup, { once: true });
  });
  await page.addInitScript(() => { window.addEventListener("qc:conversion", ((event: CustomEvent) => { const prior = JSON.parse(sessionStorage.getItem("test.resource.conversions") || "[]"); prior.push(event.detail); sessionStorage.setItem("test.resource.conversions", JSON.stringify(prior)); }) as EventListener); });
  const review = () => ({ funding_intent: "working_capital", business_name: contact.business_name, status: "not_started", progress: { stage: "waiting", label: "Upload your business documents.", percent: null, files_total: 0, files_done: 0 }, messages: chats.length ? [{ id: "user", role: "user", content: chats[0].message, created_at: "2026-11-17T12:00:00Z" }, { id: "ai", role: "assistant", content: "We will review your business tax return and bank statements together.", created_at: "2026-11-17T12:00:01Z" }] : [], summary: null, requirements: [], actions: [{ kind: "upload", label: "Upload" }], policy_status: "needs_information" });
  await page.route(/\/api\/v1\//, async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const body = request.method() === "GET" ? {} : request.postDataJSON() || {};
    let status = 200; let data: unknown = {};
    if (path.endsWith("/public/resources/handoff")) {
      expect(body.resource_token).toBe(RESOURCE);
      data = { goal, contact, answers: { requested_amount: 50000, business_age_years: 4, active_mca_count: 1, modified_mca: false, tax_year: new Date().getFullYear() - 1, tax_income: 45000, annual_revenue: 600000, period_months: 12, industry: "construction_trades", state: "NJ", credit_band: "660_699" }, attribution: { source: "public_site", page: "/business-funding-check", campaign: "resource_launch" }, locale: "en" };
    } else if (path.endsWith("/public/sms-disclosure")) data = { version: "test-v1", brand: "Qualified Commercial", transactional: "Send application updates by text.", marketing: "Send optional marketing texts.", legal: "Terms apply.", terms_url: "/terms", privacy_url: "/privacy", support_email: "support@example.com" };
    else if (path.endsWith("/public/business/intake/start") || path.endsWith("/public/mca/intake/start")) {
      starts.push(body);
      if (failOnce && !failed) { failed = true; status = 503; data = { detail: "Temporary creation outage. Retry with these answers." }; }
      else data = { intake_id: "intake-resource", variant: "main_street_v1", funding_intent: goal === "term_loan" ? "working_capital" : "merchant_cash_advance", room_url: `${new URL(page.url()).origin}/buckets/request/${ROOM}` };
    } else if (path.endsWith(`/buckets/request/${ROOM}`)) data = { bucket: { name: "Business funding · Example Business LLC", purpose: "Business funding review" }, recipient_name: contact.name, requires_passcode: true, status: "active" };
    else if (path.endsWith(`/buckets/request/${ROOM}/access`) || path.endsWith(`/buckets/request/${ROOM}/status`)) {
      if (body.passcode !== PIN) { status = 401; data = { detail: "The room PIN did not work." }; }
      else data = { room_kind: "application", bucket: { name: "Business funding · Example Business LLC" }, recipient_name: contact.name, requested_documents: [], files: [], allow_notes: true };
    } else if (path.endsWith(`/application-profiles/public/room/${ROOM}/state`)) data = { business_name: contact.business_name, owners: [], capabilities: ["application", "business_ai_review"], precall: null, verification: { ownership_complete: false, ownership_total: 0, owner_contact_complete: false, business_banking_complete: false, bank_connection_count: 0, bank_statement_months: 0, owner_credit_complete: false, required_credit_owner_count: 0, completed_credit_owner_count: 0 }, merchant_offer: null, signable: [], contracts: [], envelopes: [] };
    else if (path.includes(`/public/business/room/${ROOM}/`)) { expect(body.passcode).toBe(PIN); if (path.endsWith("/chat")) chats.push(body); data = review(); }
    else if (path.endsWith(`/application-profiles/public/room/${ROOM}/timeline`)) data = { events: [] };
    else if (path.endsWith("/public/mca-refinance/session")) { status = 401; data = { detail: "No existing session" }; }
    else { status = 404; data = { detail: "Not part of this test room." }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  return { starts, chats };
}

async function missingProfile(page: Page) {
  await page.getByLabel("Business phone", { exact: false }).fill("9735550150");
  await page.getByLabel("Number of employees", { exact: false }).fill("8");
  await page.getByLabel("Business street address", { exact: false }).fill("10 Main Street");
  await page.getByLabel("City", { exact: false }).fill("Newark");
  await page.getByLabel("ZIP code", { exact: false }).fill("07102");
  await page.getByLabel("Business website", { exact: false }).fill("N/A");
  await page.getByLabel("What does your business do?", { exact: false }).fill("We provide commercial construction services.");
  await page.getByLabel("Choose a 6-digit room PIN", { exact: true }).fill(PIN);
  await page.getByLabel("Confirm room PIN", { exact: true }).fill(PIN);
  await page.getByRole("checkbox").nth(0).check();
  for (const input of await page.locator('input[type="checkbox"][required]').all()) await input.check();
}

test("term handoff fills editable answers, preserves retry and opens a genuine PIN-protected AI review", async ({ page }, testInfo) => {
  const state = await mockResource(page, "term_loan", true);
  await page.goto(`/business-funding-intake?page=/business-funding-check#resource=${RESOURCE}`);
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(contact.name);
  expect(page.url()).not.toContain(RESOURCE);
  expect(state.starts).toHaveLength(0);
  await page.getByLabel("Full name", { exact: true }).fill("Edited Owner");
  await missingProfile(page);
  await page.getByRole("button", { name: "Start my application", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Temporary creation outage" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("test.resource.conversions") || "[]"))).toEqual([]);
  await page.getByRole("button", { name: "Start my application", exact: true }).click();
  await expect(page.getByLabel("Room PIN", { exact: true })).toBeVisible();
  expect(state.starts).toHaveLength(2); expect(state.starts[0].idempotency_key).toBe(state.starts[1].idempotency_key);
  expect(state.starts[1]).toMatchObject({ full_name: "Edited Owner", resource_handoff_token: RESOURCE, requested_amount: 50000, years_in_business: 4, goal: "term_loan", sms_marketing_consent: false, attribution: { page: "/business-funding-check", program: "term_loan" } });
  expect(state.starts[1]).not.toHaveProperty("website"); expect(state.starts[1]).not.toHaveProperty("consent_version");
  const conversions = await page.evaluate(() => JSON.parse(sessionStorage.getItem("test.resource.conversions") || "[]"));
  expect(conversions).toHaveLength(1); expect(JSON.stringify(conversions)).not.toMatch(/owner@example.com|973555|signed.resource|482691/);
  await page.getByLabel("Room PIN", { exact: true }).fill(PIN); await page.getByRole("button", { name: "Open application room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your business file, with AI guidance", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Business AI review", exact: true })).toBeVisible();
  await expect(page.getByText("1.22–1.38× factor", { exact: true })).toHaveCount(0);
  await page.getByLabel("Message your AI reviewer").fill("Which financial statements should I upload?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("We will review your business tax return"); expect(state.chats).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("business-ai-room.png"), fullPage: true });
});

test("new MCA handoff confirms prior declarations and keeps application consent separate", async ({ page }) => {
  const state = await mockResource(page, "merchant_cash_advance");
  await page.goto(`/mca-funding-intake#resource=${RESOURCE}`);
  await expect(page.getByLabel("How many active MCAs does the business have now?")).toHaveValue("1");
  expect(page.url()).not.toContain(RESOURCE); expect(state.starts).toHaveLength(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Your full name", { exact: true })).toHaveValue(contact.name);
  await expect(page.getByRole("checkbox").nth(0)).not.toBeChecked();
  await missingProfile(page); await page.getByRole("button", { name: "Open my MCA review", exact: true }).click();
  await expect(page.getByLabel("Room PIN", { exact: true })).toBeVisible();
  expect(state.starts[0]).toMatchObject({ resource_handoff_token: RESOURCE, active_mca_count: 1, has_modified_mca: false, last_year_tax_earnings: "nonnegative", attribution: { page: "/business-funding-check", program: "merchant_cash_advance" } });
});

test("refinance handoff uses its existing public application and never starts on a resource view", async ({ page }) => {
  const state = await mockResource(page, "mca_refinance");
  await page.goto(`/mca-refinance-intake#resource=${RESOURCE}`);
  await expect(page.getByRole("textbox", { name: /full name/i })).toHaveValue(contact.name);
  expect(page.url()).not.toContain(RESOURCE); expect(state.starts).toHaveLength(0);
  await expect(page.getByRole("checkbox").nth(0)).not.toBeChecked();
  await expect(page.getByRole("spinbutton", { name: /active MCA/i })).toHaveValue("1");
});
