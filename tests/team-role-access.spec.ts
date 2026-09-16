import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
const ADMIN_ID = "10000000-0000-0000-0000-000000000001";
const AUTO_AGENT_ID = "10000000-0000-0000-0000-000000000002";
const REAL_ESTATE_AGENT_ID = "10000000-0000-0000-0000-000000000003";
const HOUSE_ID = "10000000-0000-0000-0000-000000000010";
const DEALER_COMPANY_ID = "10000000-0000-0000-0000-000000000011";

async function mockTeam(page: Page, options: { failOutreachPatch?: boolean } = {}) {
  const mutations: Array<{ method: string; url: string; body: unknown }> = [];
  const outreachMutations: Array<{ method: string; url: string; body: unknown }> = [];
  let realEstateAccountTypes = ["funding"];
  let realEstateOutreachEnabled = false;

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
          id: REAL_ESTATE_AGENT_ID,
          email: "realestate@example.com",
          name: "Robin Realty",
          phone: "+19735550101",
          role: "broker",
          account_types: realEstateAccountTypes.includes("field_desk")
            ? [...new Set([...realEstateAccountTypes, "audit"])]
            : realEstateAccountTypes,
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
          dealer_prospect_pipeline_enabled: true,
        },
      ]),
    });
  });
  await page.route(new RegExp(`/api/v1/users/${REAL_ESTATE_AGENT_ID}$`), async (route) => {
    const body = route.request().postDataJSON() as { account_types?: string[] };
    if (body.account_types) realEstateAccountTypes = body.account_types;
    mutations.push({ method: route.request().method(), url: route.request().url(), body });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      id: REAL_ESTATE_AGENT_ID,
      email: "realestate@example.com",
      name: "Robin Realty",
      phone: "+19735550101",
      role: "broker",
      account_types: realEstateAccountTypes.includes("field_desk")
        ? [...new Set([...realEstateAccountTypes, "audit"])]
        : realEstateAccountTypes,
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
    }) });
  });
  await page.route(/\/api\/v1\/dealer-os\/admin\/prospect-access(?:\/[^/?]+)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as { enabled: boolean; reason?: string | null };
      outreachMutations.push({ method: request.method(), url: request.url(), body });
      if (options.failOutreachPatch) {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Outreach access save failed." }) });
        return;
      }
      realEstateOutreachEnabled = body.enabled;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        user_id: REAL_ESTATE_AGENT_ID,
        name: "Robin Realty",
        email: "realestate@example.com",
        role: "broker",
        account_status: "active",
        field_desk_access: realEstateAccountTypes.includes("field_desk"),
        eligible: realEstateAccountTypes.includes("field_desk"),
        enabled: realEstateOutreachEnabled,
        effective_enabled: realEstateOutreachEnabled && realEstateAccountTypes.includes("field_desk"),
        updated_at: "2026-09-16T17:30:00Z",
      }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      global_enabled: true,
      items: [
        {
          user_id: ADMIN_ID,
          name: "Visual Admin",
          email: "admin@qualifiedcommercial.com",
          role: "super_admin",
          account_status: "active",
          field_desk_access: true,
          eligible: true,
          enabled: false,
          effective_enabled: false,
          updated_at: null,
        },
        {
          user_id: REAL_ESTATE_AGENT_ID,
          name: "Robin Realty",
          email: "realestate@example.com",
          role: "broker",
          account_status: "active",
          field_desk_access: realEstateAccountTypes.includes("field_desk"),
          eligible: realEstateAccountTypes.includes("field_desk"),
          enabled: realEstateOutreachEnabled,
          effective_enabled: realEstateOutreachEnabled && realEstateAccountTypes.includes("field_desk"),
          updated_at: null,
        },
      ],
    }) });
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

  return { mutations, outreachMutations };
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "qc_visual_qa_user", value: "admin@qualifiedcommercial.com", url: BASE_URL }]);
});

test("team directory separates industry workspaces and exposes safe row actions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-390", "The operator Team table is a desktop workspace.");
  const { mutations } = await mockTeam(page);
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
  const staleOutreachSwitch = drawer.getByRole("switch", { name: "Dealer outreach package for Avery Auto" });
  await expect(staleOutreachSwitch).toHaveAttribute("aria-checked", "true");
  await expect(staleOutreachSwitch).toBeEnabled();
  await expect(drawer).toContainText("Assigned · not eligible");

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

test("dealer outreach access is managed from the member modal", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-390", "The operator Team table is a desktop workspace.");
  const { mutations, outreachMutations } = await mockTeam(page);
  await page.goto("/settings?section=team", { waitUntil: "domcontentloaded" });

  await page.getByRole("row", { name: /Robin Realty/ }).click();
  const drawer = page.getByRole("dialog", { name: "Robin Realty" });
  await expect(drawer).toContainText("Dealer outreach package");
  await expect(drawer).toContainText("Field Desk → Contacts → Pipeline");

  const outreachSwitch = drawer.getByRole("switch", { name: "Dealer outreach package for Robin Realty" });
  await expect(outreachSwitch).toHaveAttribute("aria-checked", "false");
  await expect(outreachSwitch).toBeDisabled();

  await drawer.getByRole("button", { name: "Field Desk" }).click();
  await expect(outreachSwitch).toBeEnabled();
  await outreachSwitch.click();
  await expect(outreachSwitch).toHaveAttribute("aria-checked", "true");
  await expect(drawer).toContainText("Enabled");

  await drawer.getByRole("button", { name: "Save access" }).click();
  await expect(drawer).toContainText("Member access and dealer outreach package updated.");

  expect(mutations).toContainEqual(expect.objectContaining({
    method: "PATCH",
    body: expect.objectContaining({ account_types: ["funding", "field_desk"] }),
  }));
  expect(outreachMutations).toEqual([expect.objectContaining({
    method: "PATCH",
    url: expect.stringContaining(`/dealer-os/admin/prospect-access/${REAL_ESTATE_AGENT_ID}`),
    body: {
      enabled: true,
      reason: "Dealer outreach package changed from Team member access.",
    },
  })]);

  await drawer.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("row", { name: /Robin Realty/ }).click();
  const reopened = page.getByRole("dialog", { name: "Robin Realty" });
  const enabledSwitch = reopened.getByRole("switch", { name: "Dealer outreach package for Robin Realty" });
  await expect(enabledSwitch).toHaveAttribute("aria-checked", "true");
  await enabledSwitch.click();
  await reopened.getByRole("button", { name: "Save access" }).click();
  await expect(reopened).toContainText("Member access and dealer outreach package updated.");

  const memberPatches = mutations.filter((entry) => entry.url.endsWith(`/users/${REAL_ESTATE_AGENT_ID}`));
  expect(memberPatches).toHaveLength(2);
  for (const patch of memberPatches) {
    expect(patch.body).toEqual(expect.objectContaining({ account_types: ["funding", "field_desk"] }));
  }
  expect(outreachMutations[1]).toEqual(expect.objectContaining({ body: expect.objectContaining({ enabled: false }) }));
});

test("an outreach save failure preserves the retry state and warning", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-390", "The operator Team table is a desktop workspace.");
  await mockTeam(page, { failOutreachPatch: true });
  await page.goto("/settings?section=team", { waitUntil: "domcontentloaded" });

  await page.getByRole("row", { name: /Robin Realty/ }).click();
  const drawer = page.getByRole("dialog", { name: "Robin Realty" });
  await drawer.getByRole("button", { name: "Field Desk" }).click();
  const outreachSwitch = drawer.getByRole("switch", { name: "Dealer outreach package for Robin Realty" });
  await outreachSwitch.click();
  await drawer.getByRole("button", { name: "Save access" }).click();

  await expect(drawer).toContainText("The member profile was saved, but the dealer outreach package could not be updated.");
  await expect(outreachSwitch).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(250);
  await expect(drawer).toContainText("The member profile was saved, but the dealer outreach package could not be updated.");
  await expect(outreachSwitch).toHaveAttribute("aria-checked", "true");
});
