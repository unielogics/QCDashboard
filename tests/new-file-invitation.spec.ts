import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const INTAKE_ID = "20000000-0000-0000-0000-000000000001";
const ROOM_URL = `${BASE_URL}/buckets/request/room.invited-client?tab=application`;

type CreatePayload = Record<string, unknown>;

async function mockFiles(page: Page, delivery: "sent" | "partial" | "created" = "sent", options: { workspaceFailure?: boolean; createFailure?: boolean } = {}) {
  const creates: CreatePayload[] = [];
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => localStorage.setItem("test.copiedInvitation", text) },
    });
  });
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/+$/, "");
    let status = 200;
    let body: unknown = [];
    if (path.endsWith("/auth/me")) {
      body = {
        id: "10000000-0000-0000-0000-000000000001", clerk_id: "visual-qa",
        email: "franco@qualifiedcommercial.com", name: "Visual QA", role: "super_admin",
      };
    } else if (path.endsWith("/admin/ai-underwriter-leads") && request.method() === "POST") {
      const payload = request.postDataJSON() as CreatePayload;
      creates.push(payload);
      const channels = (payload.invitation_channels ?? []) as string[];
      body = {
        intake: {
          id: INTAKE_ID, variant: `${payload.variant}_v1`, full_name: payload.full_name,
          email: payload.email ?? "", phone: payload.phone ?? null,
          business_name: payload.business_name ?? null, bucket_id: "test-bucket",
          bucket_name: "Client application", status: "collecting", outcome_status: "pending",
          file_count: 0, missing_required_count: 0, preferred_language: payload.preferred_language,
          call_booked: false, booking_recommended: false,
          created_at: "2026-11-09T15:00:00Z", updated_at: "2026-11-09T15:00:00Z",
        },
        files: [], requested_documents: [], messages: [], artifacts: [], notes: [], email_sends: [],
        upload_url: ROOM_URL, room_delivery_status: delivery,
        room_delivery_detail: delivery === "partial" ? "File created; one invitation channel failed." : delivery === "created" ? "Application link created without sending." : "Invitation accepted by the selected providers.",
        room_deliveries: channels.map((channel, index) => ({
          id: `delivery-${index}`, channel,
          recipient_masked: channel === "email" ? "c***@example.com" : "***0148",
          status: delivery === "partial" && channel === "sms" ? "failed" : "sent",
          detail: delivery === "partial" && channel === "sms" ? "SMS provider unavailable." : `${channel.toUpperCase()} invitation accepted.`,
          provider_accepted: !(delivery === "partial" && channel === "sms"),
          created_at: "2026-11-09T15:00:00Z",
        })),
      };
      if (options.createFailure) {
        status = 422;
        body = { detail: "The invitation could not be created. Verify the client contact details." };
      }
    } else if (path.endsWith("/admin/ai-underwriter-leads")) {
      body = { items: [], total: 0, limit: 50, offset: 0 };
    } else if (path.endsWith("/operator-files")) {
      body = {
        items: [], limit: 500,
        rollup: { total: 0, promoted: 0, working: 0, needs_attention: 0, real_estate: 0, main_street: 0, dealer: 0, mca: 0 },
        filters: { vertical: "all", origin: "all", q: null },
      };
    } else if (path.endsWith("/application-profiles/resolve")) {
      body = { id: "test-profile", source_kind: "intake", source_id: INTAKE_ID };
      if (options.workspaceFailure) {
        status = 500;
        body = { detail: "Workspace preparation unavailable. The file has been saved." };
      }
    } else if (path.endsWith("/settings")) {
      body = { data: {} };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/admin/ai-underwriter-leads", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New file", exact: true }).click();
  return creates;
}

async function chooseFileType(page: Page, variant = "dealer", operator = false) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (operator) await dialog.getByLabel("Complete with staff", { exact: true }).check();
  await dialog.locator("select").first().selectOption(variant);
  await dialog.getByPlaceholder("000000").nth(0).fill("482691");
  await dialog.getByPlaceholder("000000").nth(1).fill("482691");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  return dialog;
}

async function reviewAndCreate(dialog: Locator) {
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "New file · Review", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /^Create / }).click();
}

test("invites by email and SMS and preserves the link when one channel fails", async ({ page }, testInfo) => {
  const creates = await mockFiles(page, "partial");
  const dialog = await chooseFileType(page, "real_estate");
  await dialog.getByPlaceholder("Jane Doe").fill("Jane Client");
  await dialog.getByPlaceholder("client@example.com").fill("client@example.com");
  await dialog.getByPlaceholder("(973) 555-0148").fill("9735550148");
  await dialog.getByLabel("SMS invitation", { exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath("invitation-details.png"), animations: "disabled" });
  await reviewAndCreate(dialog);

  await expect(page.getByRole("heading", { name: "Application invitation ready" })).toBeVisible();
  await expect(dialog).toContainText("SMS provider unavailable.");
  await expect(dialog).toContainText("EMAIL invitation accepted.");
  await page.screenshot({ path: testInfo.outputPath("invitation-ready.png"), animations: "disabled" });
  await expect(page).toHaveURL(/\/admin\/ai-underwriter-leads$/);
  expect(creates).toHaveLength(1);
  expect(creates[0]).toMatchObject({
    variant: "real_estate", full_name: "Jane Client", application_completion: "client",
    invitation_channels: ["email", "sms"], notify_client: false, secure_room_pin: "482691",
  });
  expect(creates[0].investor_name).toBeUndefined();
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("test.copiedInvitation"))).toBe(ROOM_URL);
  await expect(dialog.getByRole("button", { name: /^Create / })).toHaveCount(0);
  expect(creates).toHaveLength(1);
});

test("supports an SMS invitation without email or business details", async ({ page }) => {
  const creates = await mockFiles(page);
  const dialog = await chooseFileType(page, "mca_refinance");
  await dialog.getByPlaceholder("Jane Doe").fill("Mobile Client");
  await dialog.getByLabel("Email invitation", { exact: true }).uncheck();
  await dialog.getByLabel("SMS invitation", { exact: true }).check();
  await dialog.getByPlaceholder("(973) 555-0148").fill("9735550148");
  await reviewAndCreate(dialog);

  await expect(page.getByRole("heading", { name: "Application invitation ready" })).toBeVisible();
  expect(creates).toHaveLength(1);
  expect(creates[0]).toMatchObject({ variant: "mca_refinance", application_completion: "client", invitation_channels: ["sms"] });
  expect(creates[0].email).toBeUndefined();
  expect(creates[0].business_name).toBeUndefined();
});

test("creates a direct link without sending or requiring contact details", async ({ page }) => {
  const creates = await mockFiles(page, "created");
  const dialog = await chooseFileType(page);
  await dialog.getByPlaceholder("Jane Doe").fill("Link Client");
  await dialog.getByLabel("Email invitation", { exact: true }).uncheck();
  await reviewAndCreate(dialog);

  await expect(page.getByRole("heading", { name: "Application invitation ready" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Copy link", exact: true })).toBeEnabled();
  expect(creates).toHaveLength(1);
  expect(creates[0].invitation_channels).toEqual([]);
  expect(creates[0].email).toBeUndefined();
  expect(creates[0].phone).toBeUndefined();
});

test("validates the selected invitation destination before creating a file", async ({ page }) => {
  const creates = await mockFiles(page);
  const dialog = await chooseFileType(page);
  await dialog.getByPlaceholder("Jane Doe").fill("Missing Contact");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).toContainText(/valid.*email|email address|email.*required/i);
  await dialog.getByLabel("Email invitation", { exact: true }).uncheck();
  await dialog.getByLabel("SMS invitation", { exact: true }).check();
  await dialog.getByPlaceholder("(973) 555-0148").fill("123");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).toContainText(/number.*complete|valid.*mobile|valid.*phone/i);
  expect(creates).toHaveLength(0);
});

test("keeps the created invitation when workspace preparation fails", async ({ page }) => {
  const creates = await mockFiles(page, "created", { workspaceFailure: true });
  const dialog = await chooseFileType(page);
  await dialog.getByPlaceholder("Jane Doe").fill("Saved Client");
  await dialog.getByLabel("Email invitation", { exact: true }).uncheck();
  await reviewAndCreate(dialog);
  await expect(page.getByRole("heading", { name: "Application invitation ready" })).toBeVisible();
  await expect(dialog).toContainText("Workspace preparation unavailable. The file has been saved.");
  await expect(dialog.getByRole("textbox", { name: "Direct application link" })).toHaveValue(ROOM_URL);
  await expect(dialog.getByRole("button", { name: /^Create / })).toHaveCount(0);
  expect(creates).toHaveLength(1);
});

test("shows a failed create request inside the open invitation dialog", async ({ page }) => {
  const creates = await mockFiles(page, "created", { createFailure: true });
  const dialog = await chooseFileType(page);
  await dialog.getByPlaceholder("Jane Doe").fill("Failed Client");
  await dialog.getByLabel("Email invitation", { exact: true }).uncheck();
  await reviewAndCreate(dialog);
  await expect(dialog).toContainText("The invitation could not be created. Verify the client contact details.");
  await expect(dialog.getByRole("button", { name: /^Create / })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Application invitation ready" })).toHaveCount(0);
  expect(creates).toHaveLength(1);
});

test("keeps the staff workflow and optional initial evidence step", async ({ page }) => {
  const creates = await mockFiles(page, "created");
  const dialog = await chooseFileType(page, "dealer", true);
  await dialog.getByPlaceholder("Jane Doe").fill("Staff Client");
  await dialog.getByPlaceholder("client@example.com").fill("client@example.com");
  await dialog.getByPlaceholder("(973) 555-0148").fill("9735550148");
  await dialog.getByPlaceholder("Business LLC").fill("Example LLC");
  await dialog.getByRole("textbox", { name: /^Business street address \*/ }).fill("100 Market Street");
  await dialog.getByRole("textbox", { name: "City *", exact: true }).fill("Newark");
  await dialog.getByRole("combobox", { name: /^State \*/ }).selectOption("NJ");
  await dialog.getByRole("textbox", { name: "ZIP code *", exact: true }).fill("07102");
  await dialog.getByRole("combobox", { name: /^Business industry \*/ }).selectOption("auto_service");
  await dialog.getByRole("textbox", { name: /^Business website \*/ }).fill("N/A");
  await dialog.getByRole("textbox", { name: /^What does your business do\? \*/ }).fill("We sell and service commercial vehicles for local businesses.");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /Drop initial evidence/ })).toBeVisible();
  await reviewAndCreate(dialog);
  await expect(page.getByRole("heading", { name: "Application invitation ready" })).toBeVisible();
  expect(creates).toHaveLength(1);
  expect(creates[0]).toMatchObject({ application_completion: "operator", business_name: "Example LLC", business_street: "100 Market Street", business_city: "Newark", business_state: "NJ", business_zip: "07102", industry: "auto_service", business_website: "N/A" });
});
