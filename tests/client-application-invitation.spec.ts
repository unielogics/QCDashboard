import { expect, test, type Page } from "@playwright/test";

const TOKEN = "room.client-invitation";
const PIN = "482691";
type Application = Record<string, unknown>;

async function mockApplicationRoom(page: Page, vertical = "dealer", failFirstSubmit = false, amountEditable = true) {
  const patches: Application[] = [];
  const owners: Application[] = [];
  let application: Application = {
    vertical, full_name: "Jane Client", email: null, phone: null, business_name: null,
    business_street: null, business_city: null, business_state: null, business_zip: null,
    business_website: null, business_description: null, loan_purpose: null, requested_loan_amount: amountEditable ? null : 75000,
    years_in_business: null, target_property_address: null, transaction_type: null,
    estimated_value_or_purchase_price: null, monthly_rent: null, industry: null, funding_need: null,
    submitted_at: null, requested_amount_editable: amountEditable,
  };
  let submitRejected = false;
  const session = () => ({
    room_kind: "application", bucket: { name: application.business_name || "Jane's application", purpose: "Complete your financing application" },
    recipient_name: application.full_name, recipient_email: application.email,
    allow_notes: true, passcode_needs_setup: false, requested_documents: [], files: [],
  });
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200;
    let body: unknown;
    if (path.endsWith(`/buckets/request/${TOKEN}`)) {
      body = { ...session(), requires_passcode: true, status: "active" };
    } else if (path.endsWith(`/buckets/request/${TOKEN}/access`) || path.endsWith(`/buckets/request/${TOKEN}/status`)) {
      expect(request.postDataJSON()).toEqual({ passcode: PIN });
      body = session();
    } else if (path.endsWith(`/application-profiles/public/room/${TOKEN}/application`)) {
      const payload = request.postDataJSON() as Application;
      expect(payload.passcode).toBe(PIN);
      expect(request.headers().authorization).toBeUndefined();
      if (request.method() === "PATCH") {
        patches.push(payload);
        if (payload.submit && failFirstSubmit && !submitRejected) {
          submitRejected = true;
          status = 422;
          body = { detail: "The requested amount needs review. Correct it and submit again." };
        } else {
          const { passcode: _passcode, submit, ...answers } = payload;
          application = { ...application, ...answers, submitted_at: submit ? "2026-11-09T16:00:00Z" : application.submitted_at };
          body = application;
        }
      } else {
        body = application;
      }
    } else if (path.endsWith(`/application-profiles/public/room/${TOKEN}/owners`) && request.method() === "POST") {
      const payload = request.postDataJSON() as { passcode: string; owner: Application };
      expect(payload.passcode).toBe(PIN);
      owners.push({ id: `owner-${owners.length + 1}`, ...payload.owner, credit_required: true, credit_complete: false, has_invite: false, invite_opened_at: null });
      body = owners.at(-1);
    } else if (path.endsWith(`/application-profiles/public/room/${TOKEN}/state`)) {
      body = {
        business_name: application.business_name || "the business", owners,
        capabilities: ["application", "owners", "banking"], precall: null, merchant_offer: null,
        verification: {
          ownership_complete: owners.length > 0, ownership_total: owners.length ? 100 : 0,
          owner_contact_complete: owners.length > 0, business_banking_complete: false,
          bank_connection_count: 0, bank_statement_months: 0, owner_credit_complete: false,
          required_credit_owner_count: owners.length, completed_credit_owner_count: 0,
        },
        banking: { enabled: false, environment: "sandbox", consent_granted: false, disclosure_text: "", items: [], assets_enabled: false, statements_enabled: false, selected_products: [], available_products: [] },
        signable: [], contracts: [], envelopes: [],
      };
    } else if (path.endsWith(`/application-profiles/public/room/${TOKEN}/timeline`)) {
      body = { events: [] };
    } else if (path.endsWith(`/application-rooms/${TOKEN}/collection-tasks`)) {
      body = { tasks: [] };
    } else {
      status = 404;
      body = { detail: "This capability is not available in this test room." };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/buckets/request/${TOKEN}?tab=application`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Room PIN", { exact: true }).fill(PIN);
  await page.getByRole("button", { name: "Open application room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Complete your application details" })).toBeVisible();
  return { patches, owners };
}

async function fillBusinessApplication(page: Page, lending = true, industry = "auto_service") {
  const form = page.getByRole("region", { name: "Your application", exact: true });
  await form.getByLabel("Email *", { exact: true }).fill("jane@example.com");
  await form.getByLabel("Mobile number *", { exact: true }).fill("9735550148");
  await form.getByLabel(/Legal business name|Investor \/ entity name/).fill("Client Business LLC");
  await form.getByRole("textbox", { name: /^Business street address \*/ }).fill("100 Market Street");
  await form.getByRole("textbox", { name: "City *", exact: true }).fill("Newark");
  await form.getByRole("combobox", { name: /^State \*/ }).selectOption("NJ");
  await form.getByRole("textbox", { name: "ZIP code *", exact: true }).fill("07102");
  await form.getByRole("combobox", { name: /^Business industry \*/ }).selectOption(industry);
  await form.getByRole("textbox", { name: /^Business website \*/ }).fill("N/A");
  await form.getByRole("textbox", { name: /^What does your business do\? \*/ }).fill("We sell and service commercial vehicles for local businesses.");
  if (lending) {
    await form.getByLabel("Funding purpose *", { exact: true }).fill("Purchase inventory and working capital");
    await form.getByLabel("Requested amount ($) *", { exact: true }).fill("75000");
  }
  return form;
}

test("an invited client saves, resumes, and submits the application before any call is booked", async ({ page }, testInfo) => {
  const { patches, owners } = await mockApplicationRoom(page);
  await expect(page.locator(".application-room-count")).toHaveText("Application in progress");
  let form = page.getByRole("region", { name: "Your application", exact: true });
  await form.getByLabel("Legal business name *", { exact: true }).fill("Client Business LLC");
  await form.getByRole("button", { name: "Save progress", exact: true }).click();
  await expect(form).toContainText("Progress saved. You can return using this same link and PIN.");
  expect(patches[0]).toMatchObject({ passcode: PIN, submit: false, business_name: "Client Business LLC", email: null });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Room PIN", { exact: true }).fill(PIN);
  await page.getByRole("button", { name: "Open application room", exact: true }).click();
  await expect(form.getByLabel("Legal business name *", { exact: true })).toHaveValue("Client Business LLC");
  form = await fillBusinessApplication(page);
  await page.screenshot({ path: testInfo.outputPath("client-application-details.png"), fullPage: true, animations: "disabled" });
  await form.getByRole("button", { name: "Submit application details", exact: true }).click();
  await expect(form).toContainText("Application details received.");
  expect(patches).toHaveLength(2);
  expect(patches[1]).toMatchObject({ passcode: PIN, submit: true, full_name: "Jane Client", email: "jane@example.com", requested_loan_amount: 75000, business_website: "N/A", business_street: "100 Market Street", business_city: "Newark", business_state: "NJ", business_zip: "07102", industry: "auto_service" });
  await form.getByRole("button", { name: "Continue application", exact: true }).click();
  await expect(page.getByRole("heading", { name: "0 of 3 done", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Owners and verification", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Before your call", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Add another owner", exact: true }).click();
  await page.getByLabel("First name", { exact: true }).fill("Jane");
  await page.getByLabel("Last name", { exact: true }).fill("Client");
  await page.getByLabel("Ownership %", { exact: true }).fill("100");
  await page.getByLabel("Personal email", { exact: true }).fill("jane@example.com");
  await page.getByLabel("Mobile", { exact: true }).fill("9735550148");
  await page.getByRole("button", { name: "Add owner", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 of 3 done", exact: true })).toBeVisible();
  expect(owners[0]).toMatchObject({ first_name: "Jane", last_name: "Client", ownership_pct: 100, is_primary: true });
  await page.screenshot({ path: testInfo.outputPath("client-owners-progress.png"), fullPage: true, animations: "disabled" });
});

test("real estate invitations collect property details before submitting", async ({ page }) => {
  const { patches } = await mockApplicationRoom(page, "real_estate");
  const form = await fillBusinessApplication(page);
  await form.getByLabel("Target property address *", { exact: true }).fill("100 Main Street, Newark, NJ 07102");
  await form.getByLabel("Transaction type *", { exact: true }).fill("Purchase");
  await form.getByLabel("Property value / purchase price ($) *", { exact: true }).fill("500000");
  await form.getByLabel("Monthly rent ($)", { exact: true }).fill("6000");
  await form.getByRole("button", { name: "Submit application details", exact: true }).click();
  await expect(form).toContainText("Application details received.");
  expect(patches[0]).toMatchObject({ submit: true, target_property_address: "100 Main Street, Newark, NJ 07102", transaction_type: "Purchase", estimated_value_or_purchase_price: 500000, monthly_rent: 6000 });
});

test("a rejected application keeps the client's answers for correction and retry", async ({ page }) => {
  const { patches } = await mockApplicationRoom(page, "dealer", true);
  const form = await fillBusinessApplication(page);
  await form.getByRole("button", { name: "Submit application details", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("The requested amount needs review.");
  await expect(form.getByLabel("Requested amount ($) *", { exact: true })).toHaveValue("75000");
  await form.getByLabel("Requested amount ($) *", { exact: true }).fill("60000");
  await form.getByRole("button", { name: "Submit application details", exact: true }).click();
  await expect(form).toContainText("Application details received.");
  expect(patches).toHaveLength(2);
  expect(patches[1]).toMatchObject({ submit: true, requested_loan_amount: 60000 });
});

test("Main Street clients choose industry and a non-lending need without a loan amount", async ({ page }) => {
  const { patches } = await mockApplicationRoom(page, "main_street");
  const form = page.getByRole("region", { name: "Your application", exact: true });
  await form.getByRole("combobox", { name: "Funding need *", exact: true }).selectOption("business_systems");
  await fillBusinessApplication(page, false, "restaurant_food_service");
  await expect(form.getByLabel("Requested amount ($) *", { exact: true })).toHaveCount(0);
  await form.getByRole("button", { name: "Submit application details", exact: true }).click();
  await expect(form).toContainText("Application details received.");
  expect(patches).toHaveLength(1);
  expect(patches[0]).toMatchObject({ submit: true, industry: "restaurant_food_service", funding_need: "business_systems", requested_loan_amount: null, loan_purpose: null });
});

test("reviewed funding amounts stay read-only while the client saves other answers", async ({ page }) => {
  const { patches } = await mockApplicationRoom(page, "dealer", false, false);
  const form = page.getByRole("region", { name: "Your application", exact: true });
  const amount = form.getByLabel("Requested amount ($) *", { exact: true });
  await expect(amount).toHaveAttribute("readonly", "");
  await expect(amount).toHaveValue("75000");
  await expect(form).toContainText("Your advisor has reviewed this amount. Contact your advisor if it needs to change.");
  await form.getByLabel("Full name *", { exact: true }).fill("Jane Corrected");
  await form.getByRole("button", { name: "Save progress", exact: true }).click();
  await expect(form).toContainText("Progress saved.");
  expect(patches).toHaveLength(1);
  expect(patches[0]).toMatchObject({ submit: false, full_name: "Jane Corrected", requested_loan_amount: 75000 });
  expect(patches[0].requested_amount_editable).toBeUndefined();
  expect(patches[0].vertical).toBeUndefined();
  expect(patches[0].submitted_at).toBeUndefined();
});
