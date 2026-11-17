import { expect, test } from "@playwright/test";

const programs = [
  { program_key: "sba_7a", name: "SBA 7(a)", variants: ["main_street", "dealer"] },
  { program_key: "dscr", name: "DSCR Rental", variants: ["real_estate"] },
  { program_key: "mca_refinance", name: "MCA Refinance", variants: ["mca_refinance"] },
];

for (const role of ["dealer_partner", "professional_referral_partner"]) {
  test(`${role} starts a non-dealer file and sees their own clients`, async ({ page }) => {
    const posts: Record<string, unknown>[] = [];
    await page.route(/\/api\/v1\/.*/, async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      if (path.endsWith("/auth/me")) body = {
        id: "partner-1", name: "Pat Referral", email: "partner@example.com", role,
        account_types: ["funding"], account_status: "active", can_access_funding: true,
        consoles: [{ key: "funding", label: "Funding", url: "http://localhost:3146" }],
      };
      else if (path.endsWith("/status")) body = { required: false };
      else if (path.endsWith("/programs")) body = programs;
      else if (path.endsWith("/ai-underwriter-leads") && route.request().method() === "POST") {
        posts.push(route.request().postDataJSON());
        body = { intake: { id: "created-file" }, upload_url: "http://localhost:3146/buckets/request/example", room_delivery_detail: "Room created without sending" };
      }
      else if (path.endsWith("/ai-underwriter-leads")) body = {
        items: [{ id: "own-file", client_id: "own-client", full_name: "Morgan Owner", business_name: "Morgan Holdings", email: "morgan@example.com", status: "collecting", outcome_status: "submitted", variant: "real_estate_dscr_v1", updated_at: "2026-11-16T12:00:00Z", file_count: 0, missing_required_count: 0 }], total: 1,
      };
      else if (path.endsWith("/messages")) body = { items: [], total_unread: 0 };
      else if (path.endsWith("/ai-tasks")) body = [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("/broker/programs");
    await expect(page.getByRole("heading", { name: "Active programs" })).toBeVisible();
    const dscrCard = page.locator(".card").filter({ has: page.getByRole("heading", { name: "DSCR Rental" }) });
    await dscrCard.getByRole("link", { name: "Start file" }).click();
    const dialog = page.getByRole("dialog", { name: "Start a referral file" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Program", { exact: true })).toHaveValue("dscr");
    await expect(dialog.getByLabel("Application type")).toHaveValue("real_estate");
    await dialog.getByLabel("Client full name", { exact: true }).fill("Morgan Owner");
    await dialog.getByLabel("Client email", { exact: true }).fill("morgan@example.com");
    await dialog.getByLabel("Client mobile", { exact: true }).fill("9735550148");
    await dialog.getByLabel("Property address").fill("123 Main St, Newark, NJ");
    await dialog.getByLabel("Six-digit room PIN", { exact: true }).fill("123456");
    await dialog.getByLabel("Confirm room PIN", { exact: true }).fill("123456");
    await dialog.getByLabel("Business phone", { exact: false }).fill("9735550148");
    await dialog.getByLabel("Number of employees", { exact: false }).fill("4");
    await dialog.getByLabel("Business street address", { exact: false }).fill("123 Example Road");
    await dialog.getByLabel("City", { exact: false }).fill("Newark");
    await dialog.getByLabel("State", { exact: false }).selectOption("NJ");
    await dialog.getByLabel("ZIP code", { exact: false }).fill("07102");
    await dialog.getByLabel("Business industry", { exact: false }).selectOption("other");
    await dialog.getByRole("textbox", { name: /website/i }).fill("N/A");
    await dialog.getByRole("textbox", { name: /description|describe/i }).fill("We own and manage commercial investment properties.");
    await dialog.getByRole("button", { name: "Create file", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Referral file created" })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ variant: "real_estate", program_key: "dscr", secure_room_pin: "123456", invitation_channels: [] });
    expect(posts[0]).not.toHaveProperty("broker_user_id");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.goto("/broker/clients");
    await expect(page.getByRole("heading", { name: "My clients", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Morgan Holdings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open file", exact: true })).toHaveAttribute("href", "/broker/ai-underwriter-leads?lead=own-file");
  });
}
