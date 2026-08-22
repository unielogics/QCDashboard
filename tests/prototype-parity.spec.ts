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

test("floating page headers meet the global top bar without a ground gap", async ({ page }) => {
  await openConsolePage(page, "/pipeline");
  const edges = await page.evaluate(() => {
    const top = document.querySelector<HTMLElement>(".top")?.getBoundingClientRect();
    const pageHeader = document.querySelector<HTMLElement>(".ckhead")?.getBoundingClientRect();
    return { topBottom: top?.bottom, pageHeaderTop: pageHeader?.top };
  });
  expect(edges.topBottom).toBeDefined();
  expect(edges.pageHeaderTop).toBeDefined();
  expect(Math.abs((edges.topBottom ?? 0) - (edges.pageHeaderTop ?? 0))).toBeLessThanOrEqual(1);
});

test("bucket deep link closes and stays closed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The bucket workflow is exercised at the canonical viewport.");
  const bucketId = process.env.QC_E2E_BUCKET_ID;
  test.skip(!bucketId, "A bucket fixture is required.");
  await openConsolePage(page, `/admin/buckets?bucket=${bucketId}`);
  const bucketRoom = page.getByRole("dialog");
  await expect(bucketRoom).toBeVisible();
  await bucketRoom.getByRole("button", { name: "Close" }).click();
  await expect(bucketRoom).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/buckets$/);
  await page.waitForTimeout(300);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("bucket files open in a full-screen navigable review workspace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The bucket workflow is exercised at the canonical viewport.");
  const bucketId = process.env.QC_E2E_BUCKET_ID;
  test.skip(!bucketId, "A bucket fixture is required.");
  await openConsolePage(page, `/admin/buckets?bucket=${bucketId}`);
  const bucketRoom = page.getByRole("dialog");
  await bucketRoom.getByRole("button", { name: "Preview" }).first().click();
  const reviewer = page.locator(".bucket-review-shell");
  await expect(reviewer).toBeVisible();
  const bounds = await reviewer.boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.y).toBe(0);
  expect(bounds?.width).toBe(1600);
  expect(bounds?.height).toBe(1000);
  await expect(reviewer.locator(".bucket-review-file")).toHaveCount(2);
  await captureReviewImage(page, "bucket-file-review", testInfo);
  await reviewer.getByRole("button", { name: "Close" }).click();
  await expect(reviewer).toBeHidden();
});

test("operator AI intake exposes private underwriting chat and the client transcript", async ({ page }, testInfo) => {
  test.skip(!["desktop-1600", "mobile-390"].includes(testInfo.project.name), "The chat workspace is exercised at desktop and mobile widths.");
  const intakeId = process.env.QC_E2E_INTAKE_ID;
  test.skip(!intakeId, "An intake fixture is required.");
  await page.route(`**/admin/ai-underwriter-leads/${intakeId}/client-thread`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          { id: "client-turn", role: "user", author_name: "Fixture Client", content: "Did you receive the bank statements I uploaded?", created_at: "2026-08-22T13:00:00Z" },
          { id: "client-ai-turn", role: "assistant", author_name: "Bucket AI", content: "Yes. The statements are in your secure intake room.", created_at: "2026-08-22T13:00:01Z" },
        ],
      }),
    });
  });
  await openConsolePage(page, `/admin/ai-underwriter-leads?lead=${intakeId}`);
  const intakeFile = page.locator(".ai-intake-detail-shell");
  await expect(intakeFile).toBeVisible();
  await expect(intakeFile.getByRole("tab", { name: "Underwriter AI" })).toHaveAttribute("aria-selected", "true");
  await expect(intakeFile.getByText("Underwriter conversation", { exact: true })).toBeVisible();
  await expect(intakeFile.getByLabel("Message the AI underwriter")).toBeVisible();
  await assertStableGeometry(page);
  await captureReviewImage(page, "intake-underwriter-ai", testInfo);

  await intakeFile.getByRole("tab", { name: "Client conversation" }).click();
  await expect(intakeFile.getByText("Did you receive the bank statements I uploaded?", { exact: true })).toBeVisible();
  await expect(intakeFile.getByText("Yes. The statements are in your secure intake room.", { exact: true })).toBeVisible();
  await expect(intakeFile.getByLabel("Reply on behalf (as underwriter)")).toBeVisible();
  await assertStableGeometry(page);
  await captureReviewImage(page, "intake-client-conversation", testInfo);
});

test("intake evidence, contact editing, and review controls share the file workspace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The intake workflow is exercised at the canonical viewport.");
  const intakeId = process.env.QC_E2E_INTAKE_ID;
  test.skip(!intakeId, "An intake fixture is required.");
  await openConsolePage(page, `/admin/ai-underwriter-leads?lead=${intakeId}`);
  const intakeFile = page.locator(".ai-intake-detail-shell");
  await expect(intakeFile).toBeVisible();

  await intakeFile.getByRole("tab", { name: "Workflow" }).click();
  await expect(intakeFile.locator(".submission-step.status-complete")).toHaveCount(1);
  await expect(intakeFile.locator(".submission-step.status-partial")).toHaveCount(1);
  await expect(intakeFile.locator(".submission-step.status-not-started")).toHaveCount(3);

  await intakeFile.getByRole("button", { name: /Evidence in/i }).click();
  const evidenceBrowser = intakeFile.locator(".evidence-browser");
  await expect(evidenceBrowser).toBeVisible();
  await expect(evidenceBrowser.locator(".evidence-file-row")).toHaveCount(2);
  await captureReviewImage(page, "intake-evidence-browser", testInfo);

  await intakeFile.getByRole("button", { name: "Edit contact details" }).click();
  const contactDrawer = page.getByRole("dialog", { name: "Edit contact and entity" });
  await expect(contactDrawer.getByLabel("Legal entity / LLC")).toHaveValue(/Sierra Pacific Freight/i);
  await expect(contactDrawer.getByLabel("Email")).toHaveValue("fixture0@qc.dev");
  await contactDrawer.getByRole("button", { name: "Cancel" }).click();

  await intakeFile.getByRole("button", { name: /AI review/i }).first().click();
  await intakeFile.getByRole("button", { name: /Run AI review/i }).first().click();
  const reviewDrawer = page.getByRole("dialog", { name: "Run AI review" });
  await expect(reviewDrawer).toContainText("continue working anywhere in the console");
  await reviewDrawer.getByRole("button", { name: "Cancel" }).click();
});

test("public client intake entry points retain the language and secure-start gate", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The public intake entry points are checked once at the canonical viewport.");
  for (const route of ["/dealer-ai-underwriter", "/funding-review", "/mca-refinance-intake"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByRole("heading", { name: "Choose your language / Elige tu idioma" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue in English" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar en Español" })).toBeVisible();
  }
});

test("AI review minimizes, survives navigation, and returns to the completed intake", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1600", "The background lifecycle is exercised at the canonical viewport.");
  const intakeId = process.env.QC_E2E_INTAKE_ID;
  test.skip(!intakeId, "An intake fixture is required.");
  let complete = false;
  await page.route(`**/admin/ai-underwriter-leads/${intakeId}/run-review`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review_id: "review-background-fixture", status: "queued" }) });
  });
  await page.route(`**/admin/ai-underwriter-leads/${intakeId}/review-progress?**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        review_id: "review-background-fixture",
        status: complete ? "completed" : "running",
        stage: complete ? "complete" : "analyzing",
        label: complete ? "Review complete" : "Analyzing linked evidence",
        percent: complete ? 100 : 48,
        files_total: 2,
        files_done: complete ? 2 : 1,
        error: null,
      }),
    });
  });

  await openConsolePage(page, `/admin/ai-underwriter-leads?lead=${intakeId}`);
  const intakeFile = page.locator(".ai-intake-detail-shell");
  await intakeFile.getByRole("tab", { name: "Workflow" }).click();
  await intakeFile.getByRole("button", { name: /AI review/i }).first().click();
  await intakeFile.getByRole("button", { name: /Run AI review/i }).first().click();
  await page.getByRole("dialog", { name: "Run AI review" }).getByRole("button", { name: "Run review" }).click();
  const progress = page.getByRole("dialog", { name: "Running AI review..." });
  await expect(progress).toContainText("Analyzing linked evidence");
  await progress.getByRole("button", { name: "Minimize" }).click();

  await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toHaveText("Pipeline");
  const dock = page.getByLabel("AI reviews");
  await expect(dock).toContainText("Sierra Pacific Freight LLC");
  await expect(dock).toContainText("48%");

  complete = true;
  await expect(dock.locator(".ai-review-job.done")).toBeVisible({ timeout: 6_000 });
  await dock.locator(".ai-review-job-main").click();
  await expect(page).toHaveURL(new RegExp(`/admin/ai-underwriter-leads\\?lead=${intakeId}`));
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
