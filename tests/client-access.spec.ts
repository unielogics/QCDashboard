import { expect, test, type Page, type TestInfo } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const CLIENT_ID = "10000000-0000-0000-0000-000000000010";
const USER_ID = "10000000-0000-0000-0000-000000000011";
const INTAKE_ID = "10000000-0000-0000-0000-000000000020";
const PROFILE_ID = "10000000-0000-0000-0000-000000000030";

const clientRow = {
  subject_kind: "client",
  subject_id: CLIENT_ID,
  client_id: CLIENT_ID,
  user_id: USER_ID,
  client_name: "Alex Morgan",
  businesses: ["Morgan Logistics LLC"],
  email: "alex@example.com",
  phone: "(973) 555-0101",
  origin: "public_site",
  login_state: "active",
  account_types: ["funding"],
  account_status: "active",
  file_count: 2,
  last_active_at: "2026-08-28T13:00:00Z",
  status: "active",
} as const;

const intakeRow = {
  subject_kind: "intake",
  subject_id: INTAKE_ID,
  client_id: null,
  user_id: null,
  client_name: "Taylor Reed",
  businesses: ["Reed Auto Group"],
  email: "taylor@example.com",
  phone: "(201) 555-0188",
  origin: "public_site",
  login_state: "no_login",
  account_types: [],
  account_status: null,
  file_count: 1,
  last_active_at: "2026-08-28T12:00:00Z",
  status: "draft",
} as const;

async function mockClientAccess(page: Page) {
  const mutations: Array<{ method: string; url: string; body: unknown }> = [];

  await page.route(/\/api\/v1\/.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/api\/v1\/auth\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "10000000-0000-0000-0000-000000000001",
        clerk_id: "visual-qa",
        email: "admin@qualifiedcommercial.com",
        name: "Visual QA",
        role: "super_admin",
        account_types: ["funding", "audit"],
        account_status: "active",
        can_access_funding: true,
        can_access_audit: true,
      }),
    });
  });
  await page.route(/\/api\/v1\/ai-tasks$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route(/\/api\/v1\/notifications\?.*$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], unread_count: 0, total: 0 }),
    });
  });
  await page.route(/\/api\/v1\/settings$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
  });
  await page.route(/\/api\/v1\/admin\/client-access\?.*$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [clientRow, intakeRow], total: 2, page: 1, page_size: 50, sources: ["public_site"] }),
    });
  });
  await page.route(new RegExp(`/api/v1/admin/client-access/subjects/client/${CLIENT_ID}$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        subject: clientRow,
        entitlements: [{ product: "funding", enabled: true, granted_at: "2026-08-20T12:00:00Z", revoked_at: null, reason: "Public signup" }],
        audit_scopes: [{
          profile_id: PROFILE_ID,
          dealer_id: null,
          business_name: "Morgan Logistics LLC",
          vertical: "main_street",
          source_kind: "intake",
          source_id: INTAKE_ID,
          bucket_id: "10000000-0000-0000-0000-000000000031",
          enabled_for_user: false,
        }],
        invitation_status: "active",
        invitation_error: null,
        access_history: [],
      }),
    });
  });
  await page.route(new RegExp(`/api/v1/admin/client-access/subjects/intake/${INTAKE_ID}$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        subject: intakeRow,
        entitlements: [],
        audit_scopes: [],
        invitation_status: null,
        invitation_error: null,
        access_history: [],
      }),
    });
  });
  await page.route(new RegExp(`/api/v1/admin/client-access/users/${USER_ID}$`), async (route) => {
    mutations.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: USER_ID,
        account_types: ["funding", "audit"],
        account_status: "active",
        login_state: "active",
        invitation_sent: false,
        clerk_synced: true,
        sessions_revoked: false,
        audit_scope_ids: [PROFILE_ID],
      }),
    });
  });
  await page.route(/\/api\/v1\/admin\/client-access\/invite$/, async (route) => {
    mutations.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: "10000000-0000-0000-0000-000000000021",
        account_types: ["funding"],
        account_status: "active",
        login_state: "invited",
        invitation_sent: true,
        clerk_synced: false,
        sessions_revoked: false,
        audit_scope_ids: [],
      }),
    });
  });

  return mutations;
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "qc_visual_qa_user", value: "admin@qualifiedcommercial.com", url: BASE_URL }]);
});

test("client access directory and review drawer stay usable at every viewport", async ({ page }, testInfo: TestInfo) => {
  await mockClientAccess(page);
  await page.goto("/settings?section=client_access", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Client access" })).toBeVisible();
  await expect(page.getByText("Morgan Logistics LLC", { exact: true })).toBeVisible();
  await expect(page.getByText("Reed Auto Group", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manage access" }).first().click();

  const drawer = page.getByRole("dialog", { name: "Manage client access" });
  await expect(drawer).toBeVisible();
  await drawer.locator(".client-access-product").filter({ hasText: "Audit" }).getByRole("checkbox").check();
  await drawer.locator(".client-access-scope-list").getByRole("checkbox").check();
  await drawer.getByLabel("Reason for change").fill("Enable Audit for the selected business");
  await drawer.getByRole("button", { name: "Review changes" }).click();
  await expect(page.getByRole("dialog", { name: "Review before running" })).toContainText("1 explicitly selected");

  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    dialogFits: Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']")).every((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= -1 && box.right <= document.documentElement.clientWidth + 1;
    }),
  }));
  expect(geometry.page).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.dialogFits).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("client-access-review.png"), animations: "disabled" });
});

test("super admin can grant dual access and invite a no-login intake", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "Mutation payloads are exercised once at the canonical viewport.");
  const mutations = await mockClientAccess(page);
  await page.goto("/settings?section=client_access", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Manage access" }).first().click();
  let drawer = page.getByRole("dialog", { name: "Manage client access" });
  await drawer.locator(".client-access-product").filter({ hasText: "Audit" }).getByRole("checkbox").check();
  await drawer.locator(".client-access-scope-list").getByRole("checkbox").check();
  await drawer.getByLabel("Reason for change").fill("Client purchased both products");
  await drawer.getByRole("button", { name: "Review changes" }).click();
  drawer = page.getByRole("dialog", { name: "Review before running" });
  await drawer.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByRole("dialog", { name: "Access updated" })).toContainText("Funding + Audit");
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Manage access" }).nth(1).click();
  drawer = page.getByRole("dialog", { name: "Manage client access" });
  await drawer.locator(".client-access-product").filter({ hasText: "Funding" }).getByRole("checkbox").check();
  await drawer.getByLabel("Reason for change").fill("Invite from public intake");
  await drawer.getByRole("button", { name: "Review changes" }).click();
  drawer = page.getByRole("dialog", { name: "Review before running" });
  await drawer.getByRole("button", { name: "Create and invite" }).click();
  await expect(page.getByRole("dialog", { name: "Access updated" })).toContainText("Accepted by provider");

  expect(mutations).toHaveLength(2);
  expect(mutations[0]).toMatchObject({ method: "PATCH", body: { account_types: ["funding", "audit"], audit_profile_ids: [PROFILE_ID] } });
  expect(mutations[1]).toMatchObject({ method: "POST", body: { subject_kind: "intake", subject_id: INTAKE_ID, account_types: ["funding"] } });
});
