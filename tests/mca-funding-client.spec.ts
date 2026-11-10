import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const CLIENT_ID = "30000000-0000-0000-0000-000000000001";
const INTAKE_ID = "30000000-0000-0000-0000-000000000002";

async function mockMcaClient(page: Page, options: { existing?: boolean; fail?: boolean } = {}) {
  const creates: Record<string, unknown>[] = [];
  const legacyCalls: string[] = [];
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/+$/, "");
    let status = 200;
    let body: unknown = [];
    if (path.endsWith("/auth/me")) body = { id: "test-operator", email: "franco@qualifiedcommercial.com", name: "Visual QA", role: "super_admin" };
    else if (path.endsWith(`/clients/${CLIENT_ID}`)) body = {
      id: CLIENT_ID, name: "MCA Test Client", email: "mca-client@example.com", phone: "9735550148",
      tier: "New", funded_total: 0, funded_count: 0, source_channel: "mca_funding", stage: "verified",
      client_experience_mode: "guided", lead_promotion_status: "not_ready", broker_id: null,
      realtor_profile: { client_type: "buyer", missing_facts: ["Purchase price"], readiness_score: 0 },
    };
    else if (path.endsWith("/admin/client-access")) body = { items: [], total: 0, page: 1, page_size: 10 };
    else if (path.endsWith("/notifications")) body = { items: [], total: 0, unread_count: 0, group_unread_counts: {} };
    else if (path.endsWith("/settings")) body = { data: {} };
    else if (path.endsWith("/admin/ai-underwriter-leads") && request.method() === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      creates.push(payload);
      if (options.existing) { status = 409; body = { detail: { intake_id: INTAKE_ID, message: "This client already has an MCA funding file." } }; }
      else if (options.fail) { status = 409; body = { detail: "Review this client's saved email before creating the MCA file." }; }
      else body = {
        intake: { id: INTAKE_ID, variant: "main_street_v1", full_name: payload.full_name, email: payload.email, business_name: payload.business_name },
        files: [], requested_documents: [], messages: [], artifacts: [], notes: [], email_sends: [],
        upload_url: `${BASE_URL}/buckets/request/test-mca-room?tab=application`,
        room_delivery_status: "created", room_delivery_detail: "Application link created without sending.",
      };
    }
    else if (path.endsWith("/application-profiles/resolve")) body = { id: "test-mca-profile", source_kind: "intake", source_id: INTAKE_ID };
    else if (path.includes("request-prequalification")) legacyCalls.push(path);
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`/clients/${CLIENT_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "MCA Test Client", exact: true })).toBeVisible();
  return { creates, legacyCalls };
}

async function startMca(page: Page, screenshotPath?: string) {
  await page.getByRole("button", { name: "Start Funding", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "File type" })).toHaveValue("mca_funding");
  await expect(dialog.getByRole("combobox", { name: "File type" })).toBeDisabled();
  await expect(dialog).toContainText("1.22–1.38×");
  if (screenshotPath) await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await dialog.getByPlaceholder("000000").nth(0).fill("482691");
  await dialog.getByPlaceholder("000000").nth(1).fill("482691");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Client full name" })).toHaveValue("MCA Test Client");
  await expect(dialog.getByRole("textbox", { name: "Personal email" })).toHaveValue("mca-client@example.com");
  await dialog.getByLabel("Email invitation", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Create file and get link", exact: true }).click();
  return dialog;
}

test("starts a dedicated MCA file from its existing CRM lead without a property prequal", async ({ page }, testInfo) => {
  const { creates, legacyCalls } = await mockMcaClient(page);
  await expect(page.getByText("Buyer Readiness", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Client AI Plan", { exact: true })).toHaveCount(0);
  const dialog = await startMca(page, testInfo.outputPath("mca-client-product-setup.png"));
  await expect(dialog.getByRole("heading", { name: "Application invitation ready" })).toBeVisible();
  expect(creates).toHaveLength(1);
  expect(creates[0]).toMatchObject({ client_id: CLIENT_ID, variant: "main_street", intent: "merchant_cash_advance", application_completion: "client", invitation_channels: [], email: "mca-client@example.com" });
  expect(legacyCalls).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath("mca-client-file-ready.png"), animations: "disabled" });
});

test("keeps the dialog and staff input when the existing client needs identity review", async ({ page }) => {
  const { creates, legacyCalls } = await mockMcaClient(page, { fail: true });
  const dialog = await startMca(page);
  await expect(dialog).toContainText("Review this client's saved email");
  await expect(dialog.getByRole("button", { name: "Create file and get link", exact: true })).toBeEnabled();
  expect(creates).toHaveLength(1);
  expect(legacyCalls).toHaveLength(0);
});

test("opens the existing MCA file instead of creating a parallel file", async ({ page }) => {
  const { creates, legacyCalls } = await mockMcaClient(page, { existing: true });
  await startMca(page);
  await expect(page).toHaveURL(new RegExp(`/files/${INTAKE_ID}$`));
  expect(creates).toHaveLength(1);
  expect(legacyCalls).toHaveLength(0);
});
