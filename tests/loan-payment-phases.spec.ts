import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.QC_E2E_BASE_URL ?? "http://localhost:3138";
const terms = { profile_id: "loan-payments-qa", version: 1, status: "draft", amount: 89934, apr_pct: 29.99, term_months: 24, loan_type: "term", loan_type_label: "Term loan", loan_type_options: [{ value: "term", label: "Term loan" }], funder_type: "other", repayment_frequency: "monthly", debt_service_treatment: "additive", loan_structure: "amortizing", interest_only_months: 6, repayment_config: { amortization_months: 60 }, expiration_days: 7, closing_estimate_days: 5, co_brand_enabled: false, conditions: [], calculation: { cash_flow_value: 180000, current_annual_debt_service: 31626, dscr_method: "business", annual_property_carrying_costs: null, dscr_before: 5.69, dscr_after: 1.27, dscr_explanation: "Fictional annual earnings divided by annual debt service.", source: "Fictional P&L" } };

async function harness(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "admin@example.test", url: BASE }]);
  await page.route(/\/api\/v1\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/auth/me") ? { id: "qa-user", email: "admin@example.test", role: "super_admin" } : path.endsWith("/client-terms") ? terms : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(`${BASE}/qa/loan-payments`);
  return errors;
}

test.setTimeout(90_000);

test("ordinary IO and repayment amounts are visible separately from balloon stress", async ({ page }, info) => {
  const errors = await harness(page);
  const phases = page.getByRole("region", { name: "Scheduled loan payments" });
  await expect(phases).toContainText("$2,247.60");
  await expect(phases).toContainText("$2,909.12");
  await expect(phases).toContainText("$75,126.11");
  await expect(phases).toContainText("18 scheduled monthly payments");
  await expect(phases).toContainText("$9,169.63");
  await expect(page.getByRole("region", { name: "Selected loan and monthly payment totals" })).toContainText("Principal-and-interest monthly equivalent");
  await page.screenshot({ path: info.outputPath("payment-phases.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("full terms, expand, schedule and reopen preserve the same unsaved loan", async ({ page }, info) => {
  const errors = await harness(page);
  await page.getByRole("button", { name: "Expand full loan terms", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Client terms editor" });
  await expect(dialog.getByRole("textbox", { name: "Loan term / maturity in months" })).toHaveValue("24");
  await expect(dialog.getByRole("spinbutton", { name: "Amortization after interest-only (months)" })).toHaveValue("60");
  await dialog.getByRole("textbox", { name: "APR", exact: true }).fill("20");
  const scrollBeforeExpand = await dialog.locator(".drawer-b").evaluate((node) => { node.scrollTop = 250; return node.scrollTop; });
  await dialog.getByRole("button", { name: "Expand loan workspace", exact: true }).click();
  await expect(dialog).toHaveClass(/drawer--fullscreen/);
  expect(await dialog.locator(".drawer-b").evaluate((node) => node.scrollTop)).toBe(scrollBeforeExpand);
  await expect(dialog.getByRole("textbox", { name: "APR", exact: true })).toHaveValue("20");
  await dialog.getByRole("tab", { name: "Amortization & risk" }).click();
  await expect(dialog.getByRole("region", { name: "Amortization and loan risk review" })).toBeVisible();
  await expect(dialog).toContainText("Maturity stays at 24 months");
  await page.screenshot({ path: info.outputPath("expanded-loan-schedule.png"), fullPage: true });
  await dialog.getByRole("tab", { name: "Loan terms", exact: true }).click();
  await dialog.getByRole("button", { name: "Restore loan workspace size", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "APR", exact: true })).toHaveValue("20");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Expand full loan terms", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "APR", exact: true })).toHaveValue("20");
  await dialog.getByRole("textbox", { name: "Interest-only months first", exact: true }).fill("3");
  await dialog.getByRole("textbox", { name: "Loan term / maturity in months" }).fill("30");
  await dialog.getByRole("spinbutton", { name: "Amortization after interest-only (months)" }).fill("72");
  await dialog.getByRole("button", { name: "Apply loan to scenario", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Scheduled loan payments" })).toContainText("Maturity stays at 30 months");
  await expect(page.getByRole("region", { name: "Scheduled loan payments" })).toContainText("72-month amortization");
  expect(errors).toEqual([]);
});

test("zero APR is a valid quote while blank APR and fractional IO do not produce payments", async ({ page }) => {
  const errors = await harness(page);
  await page.getByRole("button", { name: "Expand full loan terms", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Client terms editor" });
  const apr = dialog.getByRole("textbox", { name: "APR", exact: true });
  const apply = dialog.getByRole("button", { name: "Apply loan to scenario", exact: true });
  await apr.fill("0");
  await expect(apply).toBeEnabled();
  await expect(dialog.getByRole("complementary", { name: "Live client terms preview" })).toContainText("$1,498.90");
  await apr.fill("");
  await expect(apply).toBeDisabled();
  await expect(dialog.getByRole("complementary", { name: "Live client terms preview" })).toContainText("Scheduled paymentsNot available");
  await apr.fill("29.99");
  await dialog.getByRole("textbox", { name: "Interest-only months first", exact: true }).fill("6.5");
  await expect(apply).toBeDisabled();
  await expect(dialog).toContainText("whole number");
  expect(errors).toEqual([]);
});
