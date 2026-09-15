import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const ADMIN_ID = "10000000-0000-0000-0000-000000000001";
const AUTO_AGENT_ID = "10000000-0000-0000-0000-000000000002";
const HOUSE_ID = "10000000-0000-0000-0000-000000000010";
const DEALER_COMPANY_ID = "10000000-0000-0000-0000-000000000011";

async function mockTeam(page: Page) {
  const mutations: Array<{ method: string; url: string; body: unknown }> = [];

  await page.route(/\/api\/v1\/.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/api\/v1\/auth\/me$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: ADMIN_ID,
        clerk_id: "visual-qa",
        email: "admin@qualifiedcommercial.com",
        name: "Visual Admin",
        role: "super_admin",
        account_types: ["funding", "field_desk", "audit"],
        account_status: "active",
        can_access_funding: true,
        can_access_audit: true,
      }),
    });
  });
  await page.route(/\/api\/v1\/settings$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {} }),
    });
  });
  await page.route(/\/api\/v1\/users\/referral-companies$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: HOUSE_ID, name: "Qualified Commercial LLC", kind: "house", signed: true },
        { id: DEALER_COMPANY_ID, name: "Grace Auto Sales", kind: "referral_partner", signed: true },
      ]),
    });
  });
  await page.route(/\/api\/v1\/users$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: ADMIN_ID,
          email: "admin@qualifiedcommercial.com",
          name: "Visual Admin",
          phone: "+19735550100",
          role: "super_admin",
          account_types: ["funding", "field_desk", "audit"],
          inherited_account_types: ["funding", "field_desk", "audit"],
          referral_partner_company_id: HOUSE_ID,
          referral_partner_company_name: "Qualified Commercial LLC",
          company_kind: "house",
          company_agreement_signed: true,
          acknowledgment_status: "current",
          acknowledged_at: "2026-09-09T12:00:00Z",
          created_at: "2026-06-09T12:00:00Z",
          account_status: "active",
          login_state: "active",
          last_seen_at: "2026-09-15T13:30:00Z",
        },
        {
          id: "10000000-0000-0000-0000-000000000003",
          email: "realestate@example.com",
          name: "Robin Realty",
          phone: "+19735550101",
          role: "broker",
          account_types: ["funding"],
          inherited_account_types: ["funding"],
          referral_partner_company_id: null,
          referral_partner_company_name: null,
          company_kind: null,
          company_agreement_signed: false,
          acknowledgment_status: "current",
          acknowledged_at: "2026-09-10T12:00:00Z",
          created_at: "2026-07-10T12:00:00Z",
          account_status: "active",
          login_state: "active",
          last_seen_at: "2026-09-14T11:00:00Z",
        },
        {
          id: AUTO_AGENT_ID,
          email: "autoagent@example.com",
          name: "Avery Auto",
          phone: "+19735550102",
          role: "dealer_partner",
          account_types: [],
          inherited_account_types: [],
          referral_partner_company_id: DEALER_COMPANY_ID,
          referral_partner_company_name: "Grace Auto Sales",
          company_kind: "referral_partner",
          company_agreement_signed: true,
          platform_access_signed_at: "2026-09-11T12:00:00Z",
          platform_access_contract_number: "PAA-1002",
          acknowledgment_status: "not_asked",
          acknowledged_at: null,
          created_at: "2026-08-11T12:00:00Z",
          account_status: "active",
          login_state: "active",
          last_seen_at: "2026-09-15T12:15:00Z",
        },
      ]),
    });
  });
  await page.route(new RegExp(`/api/v1/users/${AUTO_AGENT_ID}/account-status$`), async (route) => {
    mutations.push({
      method: route.request().method(),
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: AUTO_AGENT_ID,
        account_status: "suspended",
        invitation_sent: false,
        sessions_revoked: true,
        reset_instructions_sent: false,
        message: "Login suspended and access blocked.",
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

  return mutations;
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "qc_visual_qa_user", value: "admin@qualifiedcommercial.com", url: BASE_URL }]);
});

test("team directory separates industry workspaces and exposes safe row actions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-390", "The operator Team table is a desktop workspace.");
  const mutations = await mockTeam(page);
  await page.goto("/settings?section=team", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Operator team" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Contact" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Role & workspace" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Joined & acknowledgment" })).toBeVisible();

  const realEstateRow = page.getByRole("row", { name: /Robin Realty/ });
  await expect(realEstateRow).toContainText("realestate@example.com");
  await expect(realEstateRow).toContainText("+19735550101");
  await expect(realEstateRow).toContainText("Real Estate Agent");
  await expect(realEstateRow).toContainText("Real Estate Funding");

  const autoRow = page.getByRole("row", { name: /Avery Auto/ });
  await expect(autoRow).toContainText("Auto Dealer Agent");
  await expect(autoRow).toContainText("Dealer AI Intake");
  await autoRow.click();

  const drawer = page.getByRole("dialog", { name: "Avery Auto" });
  await expect(drawer).toContainText("Only auto-industry leads referred by this user");
  await expect(drawer.getByRole("link", { name: "Open this agent’s auto files" })).toHaveAttribute(
    "href",
    `/admin/ai-underwriter-leads?partner=${AUTO_AGENT_ID}&variant=dealer`,
  );
  await expect(drawer.getByRole("button", { name: "Email password reset" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Revoke sessions" })).toBeVisible();

  await drawer.getByLabel("Reason for access changes").fill("Temporarily disable access for review");
  await drawer.getByRole("button", { name: "Suspend login" }).click();
  await expect(drawer).toContainText("Login suspended and access blocked.");
  expect(mutations).toEqual([
    expect.objectContaining({
      method: "PATCH",
      body: {
        account_status: "suspended",
        reason: "Temporarily disable access for review",
      },
    }),
  ]);

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
});
