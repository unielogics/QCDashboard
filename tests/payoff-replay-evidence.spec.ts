import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.QC_E2E_BASE_URL ?? "http://localhost:3140";
async function harness(page: Page) {
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "admin@example.test", url: BASE }]);
  await page.route(/\/api\/v1\//, async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) writes.push(route.request().url());
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(path.endsWith("/auth/me") ? { id: "qa-user", email: "admin@example.test", role: "super_admin" } : []) });
  });
  await page.goto(`${BASE}/qa/payoff-replay`);
  return { errors, writes };
}
async function open(page: Page) {
  await page.getByRole("button", { name: "Open coverage review", exact: true }).click();
  return page.getByRole("dialog", { name: "Advanced financial review — Example Wellness Studio LLC", exact: true });
}
test.setTimeout(90_000);
test("one or both ambiguous same-lender payoffs retain scheduled DSCR but suppress bank benefits", async ({ page }, info) => {
  const result = await harness(page), dialog = await open(page);
  const loans = dialog.getByRole("checkbox", { name: "Pay off OnDeck with the new loan", exact: true });
  await expect(loans).toHaveCount(2);
  await loans.first().check();
  await expect(dialog).toContainText("2.00x");
  await expect(dialog).toContainText("Bank projection needs review.");
  await expect(dialog).toContainText("Statement payments cannot be allocated uniquely");
  await expect(dialog.locator(".fc-stat").filter({ hasText: "Net cash flow per month" })).toContainText("→ —");
  await expect(dialog.locator(".fc-stat").filter({ hasText: "Ending balance, last month" })).toContainText("→ —");
  await expect(dialog.locator(".fc-stat").filter({ hasText: "Months dipping below zero" })).toContainText("1 → —");
  await loans.last().check();
  await expect(dialog).toContainText("5.00x");
  await expect(dialog.locator(".fc-stat").filter({ hasText: "Net cash flow per month" })).toContainText("→ —");
  await dialog.locator(".fc-stat-list").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("ambiguous-loan-payoffs.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Bank projection needs review.", { exact: true })).toBeVisible();
  expect(result).toEqual({ errors: [], writes: [] });
});
test("the review action opens evidence and separate loan links restore observed replay", async ({ page }, info) => {
  const result = await harness(page), dialog = await open(page);
  await dialog.getByRole("checkbox", { name: "Pay off OnDeck with the new loan", exact: true }).first().check();
  await dialog.getByRole("button", { name: "Review bank evidence", exact: true }).first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Evidence and banking review" })).toBeVisible();
  await page.getByLabel("Statement evidence", { exact: true }).selectOption("reviewed");
  const reviewed = await open(page);
  await reviewed.getByRole("checkbox", { name: "Pay off OnDeck with the new loan", exact: true }).first().check();
  await expect(reviewed.getByText("Bank projection needs review.", { exact: true })).toHaveCount(0);
  await expect(reviewed).toContainText("2.00x");
  await expect(reviewed.locator(".fc-stat").filter({ hasText: "Net cash flow per month" })).toContainText("$7,100");
  await expect(reviewed.locator(".fc-stat").filter({ hasText: "Ending balance, last month" })).toContainText("$8,100");
  await expect(reviewed).not.toContainText("Filed return");
  await page.screenshot({ path: info.outputPath("reviewed-loan-payoff.png"), fullPage: true });
  expect(result).toEqual({ errors: [], writes: [] });
});
