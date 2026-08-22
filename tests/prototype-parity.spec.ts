import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);
});

const ROUTES = [
  ["dashboard", "/"],
  ["pipeline", "/pipeline"],
  ["clients", "/clients"],
  ["buckets", "/admin/buckets"],
  ["ai-intake", "/admin/ai-underwriter-leads"],
  ["elara-inbox", "/ai-inbox"],
  ["messages", "/messages"],
  ["calendar", "/calendar"],
  ["vault", "/vault"],
  ["prequalifications", "/admin/prequal-requests"],
  ["lenders", "/admin/lenders"],
  ["analyzer", "/deal-analyzer"],
  ["simulator", "/simulator"],
  ["rates", "/rates"],
  ["reports", "/reports"],
  ["settings", "/settings"],
] as const;

const DETAIL_ROUTES: Array<readonly [string, string]> = [];
if (process.env.QC_E2E_DEAL_ID) DETAIL_ROUTES.push(["deal-file", `/deals/${process.env.QC_E2E_DEAL_ID}`]);
if (process.env.QC_E2E_LOAN_ID) DETAIL_ROUTES.push(["funding-file", `/loans/${process.env.QC_E2E_LOAN_ID}`]);
if (process.env.QC_E2E_INTAKE_ID) DETAIL_ROUTES.push(["intake-file", `/admin/ai-underwriter-leads?lead=${process.env.QC_E2E_INTAKE_ID}`]);
if (process.env.QC_E2E_BUCKET_ID) DETAIL_ROUTES.push(["bucket-room", `/admin/buckets?bucket=${process.env.QC_E2E_BUCKET_ID}`]);

async function openConsolePage(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toHaveCount(1);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(200);
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Permission denied");
  const openDialog = page.getByRole("dialog");
  if (await openDialog.isVisible().catch(() => false)) {
    await expect(openDialog.getByRole("button", { name: /^Close(?: \(Esc\))?$/ })).toHaveCount(1);
  }
  await page.locator("body").evaluate((body) => body.getBoundingClientRect());
}

async function assertStableGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const visibleControls = Array.from(document.querySelectorAll<HTMLElement>("button, [role='tab'], [role='menuitem']"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
    return {
      viewportWidth: root.clientWidth,
      pageWidth: root.scrollWidth,
      clippedControls: visibleControls.filter((element) => element.scrollWidth > element.clientWidth + 3).map((element) => element.textContent?.trim()).filter(Boolean).slice(0, 8),
    };
  });
  expect(geometry.pageWidth, "document must not overflow horizontally").toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.clippedControls, "visible controls must not clip their labels").toEqual([]);
}

async function captureReviewImage(page: Page, name: string, testInfo: TestInfo) {
  const output = join(process.cwd(), "artifacts", "prototype-parity", "local", testInfo.project.name);
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled" });
}

for (const [name, route] of [...ROUTES, ...DETAIL_ROUTES]) {
  test(`${name} keeps the prototype page geometry`, async ({ page }, testInfo) => {
    await openConsolePage(page, route);
    await assertStableGeometry(page);
    await captureReviewImage(page, name, testInfo);
  });
}

test("All Tools uses the centered catalogue and closes with Escape", async ({ page }, testInfo) => {
  await openConsolePage(page, "/");
  const allTools = page.getByRole("button", { name: /^All tools/i });
  if (!(await allTools.isVisible())) {
    await page.getByRole("button", { name: /Expand sidebar/i }).click();
  }
  await allTools.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("All tools");
  await captureReviewImage(page, "overlay-all-tools", testInfo);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Pipeline primary action opens the shared centered drawer", async ({ page }, testInfo) => {
  await openConsolePage(page, "/pipeline");
  await page.getByRole("button", { name: /New file/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/New file|Choose a vertical/i);
  await captureReviewImage(page, "overlay-new-file", testInfo);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("theme control swaps between light and Obsidian without shifting the page", async ({ page }) => {
  await openConsolePage(page, "/");
  const before = await page.locator("main").boundingBox();
  await page.getByRole("button", { name: /Obsidian theme/i }).click();
  await expect(page.getByRole("button", { name: /light theme/i })).toBeVisible();
  const after = await page.locator("main").boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.x).toBe(before?.x);
});

test("bucket and intake share the same reversible evidence-link workflow", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "desktop-1600", "The mutation workflow is exercised once at the canonical viewport.");
  const bucketId = process.env.QC_E2E_LINK_BUCKET_ID;
  const intakeId = process.env.QC_E2E_LINK_INTAKE_ID;
  test.skip(!bucketId || !intakeId, "Disposable bucket and intake fixtures are required.");

  await openConsolePage(page, `/admin/buckets?bucket=${bucketId}`);
  await page.getByRole("dialog").getByRole("button", { name: /Link bucket to AI intake/i }).click();
  let linkDialog = page.getByRole("dialog", { name: "Link bucket and AI intake" });
  await linkDialog.getByLabel("AI intake").selectOption(intakeId!);
  await linkDialog.getByRole("button", { name: "Continue" }).click();
  await expect(linkDialog).toContainText("Select files Elara may read");
  await linkDialog.getByRole("button", { name: "Continue" }).click();
  await expect(linkDialog).toContainText("Review before running");
  await captureReviewImage(page, "overlay-link-review", testInfo);
  await linkDialog.getByRole("button", { name: "Confirm link" }).click();
  await expect(linkDialog).toContainText("Evidence linked");
  await linkDialog.getByRole("button", { name: "Done" }).click();

  await page.goto(`/admin/ai-underwriter-leads?lead=${intakeId}`, { waitUntil: "domcontentloaded" });
  const intakeDialog = page.getByRole("dialog", { name: "AI intake file" });
  await expect(intakeDialog).toBeVisible();
  await intakeDialog.getByRole("button", { name: "More actions" }).click();
  await intakeDialog.getByRole("button", { name: "Attach another bucket" }).click();
  linkDialog = page.getByRole("dialog", { name: "Link bucket and AI intake" });
  await linkDialog.getByLabel("Document bucket").selectOption(bucketId!);
  await linkDialog.getByRole("button", { name: "Continue" }).click();
  await linkDialog.getByRole("button", { name: "Continue" }).click();
  await expect(linkDialog).toContainText("Update linked evidence");
  await linkDialog.getByRole("button", { name: "Unlink" }).click();
  await expect(linkDialog).toContainText("Evidence unlinked");
  await linkDialog.getByRole("button", { name: "Done" }).click();
});

const ROLE_CASES = [
  { role: "client", email: "marcus@qc.dev", route: "/", expected: /Dashboard|Good|Welcome/i, forbidden: /AI intake/i },
  { role: "vendor", email: "vendor@qc.dev", route: "/vendor/buckets", expected: /Bucket|Vendor/i, forbidden: /Pipeline/i },
  { role: "dealer-partner", email: "partner@qc.dev", route: "/broker/ai-underwriter-leads", expected: /Lead|Referral/i, forbidden: /Clients/i },
  { role: "broker", email: "daniel@qc.dev", route: "/", expected: /Dashboard|Good|Welcome/i, forbidden: /Buckets/i },
  { role: "regional-manager", email: "regional@qc.dev", route: "/regional-agents", expected: /Agent|Regional/i, forbidden: /AI intake/i },
  { role: "field-rep", email: "rep@qc.dev", route: "/", expected: /Dashboard|Good|Welcome/i, forbidden: /Settings/i },
] as const;

for (const roleCase of ROLE_CASES) {
  test(`${roleCase.role} sees only its scoped portal shell`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1600", "Role screenshot matrix is captured once at the canonical viewport.");
    await context.addCookies([{ name: "qc_visual_qa_user", value: roleCase.email, url: BASE_URL }]);
    await page.goto(roleCase.route, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await expect(page.locator("body")).toContainText(roleCase.expected);
    await expect(page.locator("nav")).not.toContainText(roleCase.forbidden);
    await assertStableGeometry(page);
    await captureReviewImage(page, `role-${roleCase.role}`, testInfo);
  });
}
