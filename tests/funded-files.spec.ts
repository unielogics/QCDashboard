import { expect, test, type Page } from "@playwright/test";

const DIRECTORY = "/admin/ai-underwriter-leads";
const partnerId = "94000000-0000-4000-8000-000000000001";
type Visibility = "active" | "archived" | "funded";

function file(number: number, name: string, visibility: Visibility) {
  return {
    id: "93000000-0000-4000-8000-" + String(number).padStart(12, "0"),
    business_name: name, full_name: "Example Contact", email: "contact@example.test",
    variant: "dealer", status: "completed", outcome_status: "submitted",
    workspace_state: visibility, underwriting_status: visibility === "funded" ? "closed_won" : "approved",
    archived_at: visibility === "archived" ? "2026-10-01T14:00:00Z" : null,
    call_booked: false, file_count: 1, missing_required_count: 0,
    created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T14:00:00Z",
  };
}

async function directory(page: Page, records: ReturnType<typeof file>[], query = "") {
  const calls: URLSearchParams[] = [];
  const baseURL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "operator@example.test", url: baseURL }]);
  await page.route(/\/api\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(DIRECTORY)) {
      const params = url.searchParams;
      calls.push(params);
      const scope = params.get("archived_filter");
      const search = (params.get("q") ?? "").toLowerCase();
      const items = records.filter(row => row.workspace_state === scope && row.business_name.toLowerCase().includes(search));
      const limit = Number(params.get("limit")), offset = Number(params.get("offset"));
      return route.fulfill({ json: { items: items.slice(offset, offset + limit), total: items.length, limit, offset } });
    }
    if (url.pathname.endsWith("/auth/me")) {
      return route.fulfill({ json: { id: "operator", clerk_id: "visual-qa", role: "super_admin",
        name: "Example Operator", email: "operator@example.test", account_types: ["funding"], can_access_funding: true } });
    }
    const opened = records.find(row => url.pathname.endsWith(DIRECTORY + "/" + row.id));
    if (opened) {
      return route.fulfill({ json: { intake: opened, files: [], requested_documents: [], messages: [],
        artifacts: [], notes: [], email_sends: [], latest_review: null, application_profile_id: null } });
    }
    if (url.pathname.endsWith("/settings")) return route.fulfill({ json: { data: {} } });
    if (url.pathname.endsWith("/operator-files/link-options")) return route.fulfill({ json: { buckets: [], intakes: [] } });
    if (url.pathname.endsWith("/operator-files") || url.pathname.endsWith("/unread-batch")) {
      return route.fulfill({ json: { items: [] } });
    }
    return route.fulfill({ status: 404, json: { detail: "No fixture for this file resource." } });
  });
  await page.goto(DIRECTORY + query, { waitUntil: "domcontentloaded" });
  return calls;
}

test("active files and funded history have separate rows, pagination and file navigation", async ({ page }) => {
  test.slow(true, "The local server may compile both the directory and the file workspace on first navigation.");
  const active = file(100, "Approved Studio", "active");
  const archived = file(101, "Withdrawn Studio", "archived");
  const funded = Array.from({ length: 26 }, (_, i) => file(i + 1, "Funded Studio " + (i + 1), "funded"));
  funded[0].archived_at = "2026-10-01T14:00:00Z";
  funded[0].underwriting_status = "approved";
  const calls = await directory(page, [active, archived, ...funded]);
  const visibility = page.getByLabel("Record visibility");
  const rows = page.getByRole("table", { name: "AI intake files" });
  await expect(visibility).toHaveValue("active");
  await expect(rows).toContainText(active.business_name);
  await expect(rows).not.toContainText("Funded Studio");
  await expect(page.getByLabel("Status", { exact: true }).locator('option[value="funded"]')).toHaveCount(0);
  await visibility.selectOption({ label: "Closed & archived" });
  await expect(rows).toContainText(archived.business_name);
  await expect(rows).not.toContainText("Funded Studio");
  await page.getByLabel("Rows per page").selectOption("25");
  await visibility.selectOption({ label: "Funded" });
  await expect(page.getByText("1-25 of 26", { exact: true })).toBeVisible();
  const manualArchive = page.getByRole("row").filter({ has: page.getByRole("button", { name: funded[0].business_name, exact: true }) });
  await expect(manualArchive.getByRole("button", { name: funded[0].business_name, exact: true })).toBeDisabled();
  await expect(manualArchive.getByRole("cell", { name: "Funded", exact: true })).toBeVisible();
  await expect(rows).not.toContainText(active.business_name);
  await expect(rows).not.toContainText(archived.business_name);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("26-26 of 26", { exact: true })).toBeVisible();
  expect(calls.some(params => params.get("archived_filter") === "funded" && params.get("offset") === "25")).toBe(true);
  const target = funded[25];
  await page.getByRole("button", { name: target.business_name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/files/" + target.id), { timeout: 45_000 });
  await page.goBack({ waitUntil: "commit" });
  await expect(visibility).toHaveValue("funded");
  await expect(rows).toContainText(funded[0].business_name);
});

test("an active search can open its matching funded files without dropping the partner scope", async ({ page }) => {
  const records = [file(1, "Funded Search Company", "funded"), file(2, "Unrelated Company", "archived")];
  const calls = await directory(page, records, "?partner=" + partnerId);
  await page.getByLabel("Search leads").fill("Funded Search");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "View funded", exact: true }).click();
  await expect(page).toHaveURL(/visibility=funded/);
  await expect(page.getByLabel("Record visibility")).toHaveValue("funded");
  await expect(page.getByRole("button", { name: records[0].business_name, exact: true })).toBeVisible();
  const matches = calls.filter(params => params.get("q") === "Funded Search");
  expect(matches.map(params => params.get("archived_filter"))).toEqual(expect.arrayContaining(["active", "archived", "funded"]));
  expect(matches.every(params => params.get("partner_user_id") === partnerId)).toBe(true);
});

test("returning to the last page after funding moves the file and fixes the active page count", async ({ page }) => {
  const records = Array.from({ length: 26 }, (_, i) => file(i + 1, "Active Studio " + (i + 1), "active"));
  await directory(page, records);
  await page.getByLabel("Rows per page").selectOption("25");
  await expect(page.getByText("1-25 of 26", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const closing = page.getByRole("button", { name: records[25].business_name, exact: true });
  await expect(closing).toBeVisible();
  records[25] = file(26, records[25].business_name, "funded");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.getByText("1-25 of 25", { exact: true })).toBeVisible();
  await expect(closing).toHaveCount(0);
  await page.getByLabel("Record visibility").selectOption({ label: "Funded" });
  await expect(closing).toBeEnabled();
});
