import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE = process.env.QC_E2E_BASE_URL ?? "http://localhost:3139";
const EXAMPLE_COMPANY = "Example Wellness Studio LLC";
const LONG_COMPANY = "Example Therapy Services Incorporated and Affiliated Holdings LLC";

async function harness(page: Page) {
  const errors: string[] = [];
  const planWrites: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "admin@example.test", url: BASE }]);
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/financial-plan") && request.method() !== "GET") planWrites.push(path);
    const body = path.endsWith("/auth/me") ? { id: "qa-user", email: "admin@example.test", role: "super_admin" } : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`${BASE}/qa/negative-dscr`);
  await page.getByRole("button", { name: "Open coverage review", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Advanced financial review — ${EXAMPLE_COMPANY}`, exact: true });
  await expect(dialog).toBeVisible();
  return { dialog, errors, planWrites };
}

async function selectPayoffs(dialog: Locator) {
  await dialog.getByRole("checkbox", { name: "Pay off Wayflyer with the new loan", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Pay off Specialty Capital with the new loan", exact: true }).check();
  // These are distinct recorded loans at one lender; only the first is selected.
  const onDeck = dialog.getByRole("checkbox", { name: "Pay off OnDeck with the new loan", exact: true });
  await expect(onDeck).toHaveCount(2);
  await onDeck.nth(0).check();
  await expect(onDeck.nth(1)).not.toBeChecked();
}

test.setTimeout(90_000);

test("negative earnings show payment relief while preserving the signed ratio", async ({ page }, info) => {
  const { dialog, errors, planWrites } = await harness(page);
  await expect(dialog.getByText("Negative earnings", { exact: true })).toHaveCount(2);
  await expect(dialog).toContainText("Signed DSCR -0.26x");
  const gap = dialog.getByRole("region", { name: "Coverage with zero or negative earnings" });
  await expect(gap).toBeVisible();
  const initialBox = await gap.boundingBox();
  expect(initialBox && initialBox.y).toBeLessThan(page.viewportSize()!.height);
  await selectPayoffs(dialog);
  await expect(gap.getByRole("heading", { name: "The plan reduces the funding shortfall" })).toBeVisible();
  await expect(gap).toContainText(/\$139,201(?:\.08)? less annual funding needed/);
  await expect(gap).toContainText(/Monthly debt-service relief \(coverage basis\)\$11,600(?:\.09)?/);
  await expect(dialog).toContainText("Signed DSCR -0.76x");
  await expect(dialog.getByText("Negative earnings", { exact: true })).toHaveCount(2);
  await dialog.locator('[class*="reviewBody"]').evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: info.outputPath("negative-earnings-relief.png"), fullPage: true });
  expect(planWrites).toEqual([]);
  expect(errors).toEqual([]);
});

test("complete payoff removes the denominator without manufacturing positive earnings", async ({ page }) => {
  const { dialog, errors, planWrites } = await harness(page);
  const checkboxes = dialog.getByRole("checkbox", { name: /^Pay off .* with the new loan$/ });
  await expect(checkboxes).toHaveCount(5);
  for (const checkbox of await checkboxes.all()) await checkbox.check();
  await expect(dialog.getByText("No debt service", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("DSCR not applicable · Operating loss remains");
  await expect(dialog).not.toContainText("Nothing left to cover");
  await expect(dialog).not.toContainText("Very strong");
  const gap = dialog.getByRole("region", { name: "Coverage with zero or negative earnings" });
  await expect(gap).toContainText(/Annual shortfall with the plan\$54,369(?:\.00)?/);
  await expect(dialog.getByRole("img", { name: "Debt service coverage with the plan" })).toHaveCount(0);
  expect(planWrites).toEqual([]);
  expect(errors).toEqual([]);
});

test("increased payments worsen the shortfall even when signed DSCR moves toward zero", async ({ page }) => {
  const { dialog, errors, planWrites } = await harness(page);
  await dialog.getByRole("textbox", { name: "Or type the new monthly payment", exact: true }).fill("20000");
  const gap = dialog.getByRole("region", { name: "Coverage with zero or negative earnings" });
  await expect(gap.getByRole("heading", { name: "The plan increases the funding shortfall" })).toBeVisible();
  await expect(gap).toContainText(/\$240,000(?:\.00)? more annual funding needed/);
  await expect(gap).toContainText(/Monthly debt-service increase \(coverage basis\)\$20,000(?:\.00)?/);
  await expect(dialog).toContainText("Signed DSCR -0.12x");
  await expect(dialog.getByText("Negative earnings", { exact: true })).toHaveCount(2);
  expect(planWrites).toEqual([]);
  expect(errors).toEqual([]);
});

test("review header follows the current company through expansion and file switching", async ({ page }, info) => {
  const { dialog, errors, planWrites } = await harness(page);
  await expect(dialog.getByRole("heading", { name: `Advanced financial review ${EXAMPLE_COMPANY}` })).toBeVisible();
  await dialog.getByRole("button", { name: "Expand financial review", exact: true }).click();
  await expect(dialog).toHaveClass(/drawer--fullscreen/);
  await expect(dialog.getByRole("heading", { name: `Advanced financial review ${EXAMPLE_COMPANY}` })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("combobox", { name: "Fictional file", exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Open coverage review", exact: true }).click();
  const switched = page.getByRole("dialog", { name: `Advanced financial review — ${LONG_COMPANY}`, exact: true });
  const heading = switched.getByRole("heading", { name: `Advanced financial review ${LONG_COMPANY}` });
  await expect(heading).toBeVisible();
  await expect(heading).not.toContainText(EXAMPLE_COMPANY);
  const box = await heading.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath("company-header.png"), fullPage: true });
  await switched.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("combobox", { name: "Fictional file", exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Open coverage review", exact: true }).click();
  const missing = page.getByRole("dialog", { name: "Advanced financial review — Company name unavailable", exact: true });
  await expect(missing.getByRole("heading", { name: "Advanced financial review Company name unavailable" })).toBeVisible();
  await expect(missing.getByRole("heading", { name: /Advanced financial review/ })).not.toContainText(LONG_COMPANY);
  expect(planWrites).toEqual([]);
  expect(errors).toEqual([]);
});
