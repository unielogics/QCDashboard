import { expect, test } from "@playwright/test";

test("file directory keeps all eight columns visible at desktop widths", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.addCookies([{ name: "qc_visual_qa_user", value: "admin@qc.dev", url: new URL(test.info().project.use.baseURL as string ?? "http://127.0.0.1:3127").origin }]);
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const row = { id: "10000000-0000-0000-0000-000000000010", variant: "mca_refinance_v1", bucket_id: "bucket", bucket_name: "Example evidence room", full_name: "Example Owner", email: "long.example.owner@examplecompany.com", phone: "+13055550123", business_name: "Example Trading Company LLC", opened_by_name: "House desk", opened_by_role: "Internal", referral_source: "Direct", status: "collecting", outcome_status: "submitted", preferred_language: "en", probability_status: "Promising but needs one clarification", booking_recommended: false, call_booked: false, file_count: 23, missing_required_count: 3, created_at: "2026-11-05T12:00:00Z", updated_at: "2026-11-05T12:00:00Z" };
    const body = path.endsWith("/auth/me") ? { id: "staff", email: "admin@qc.dev", name: "QA Staff", role: "super_admin" }
      : path.endsWith("/admin/ai-underwriter-leads") ? { items: [row], total: 1, limit: 25, offset: 0 }
      : path.endsWith("/operator-files") ? { items: [], total: 0 }
      : path.endsWith("/ai-tasks") || path.includes("/tasks") ? []
      : { items: [], total: 0, unread_count: 0 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/admin/ai-underwriter-leads", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Example Trading Company LLC", exact: true })).toBeVisible();
  const table = page.locator(".file-list-table");
  await expect(table.locator("thead th")).toHaveCount(8);
  const geometry = await table.evaluate((node) => ({ width: node.getBoundingClientRect().width, available: node.parentElement!.clientWidth, document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
  if (geometry.viewport >= 1280) expect(geometry.width).toBeLessThanOrEqual(geometry.available + 1);
  await page.getByRole("button", { name: "Actions for Example Trading Company LLC" }).click();
  await expect(page.getByRole("menuitem", { name: "Open file" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Archive file" })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: `artifacts/credit-workspace-${test.info().project.name}.png`, fullPage: true });
});
