import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OperatingPlanBody } from "../src/lib/operatingPlan";
import type { OperatingGuidanceReply } from "../src/lib/operatingGuidance";
import { pdfFontCompatibility } from "./fixtures/pdfFontCompatibility";
import { operatingClientScenarios } from "./fixtures/operatingClientScenarios";

type Scenario = { body: OperatingPlanBody; reply: OperatingGuidanceReply };
type Write = { path: string; payload: { body: OperatingPlanBody; idempotency_key?: string } };
const ORIGIN = "https://operating-client.test";
const BASE = "/api/v1/application-profiles/public/financial-forms/synthetic-operating-token";
const SOURCE = "00000000-0000-4000-8000-000000000101";
let script: Buffer, css: Buffer, pdf: Buffer, pdfjsRoot: string;
let scenarios: Record<"initial" | "positive" | "negative", Scenario>;

// Full token page and shared form/viewer; only navigation context and API/storage
// are supplied by the harness. Scenario figures come from the backend evaluator.
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-guided-client-"));
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Page from'@/app/forms/[kind]/[token]/page';import'@/app/globals.css';import'@/app/app-extras.css';createRoot(document.getElementById('root')).render(<Page/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic",
    nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(ORIGIN) },
    external: ["node:module", "node:fs", "node:fs/promises", "node:url", "node:path", "@napi-rs/canvas"],
    loader: { ".module.css": "local-css" }, logLevel: "silent",
    plugins: [{ name: "token-route", setup(build: { onResolve: (options: { filter: RegExp }, callback: () => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: () => unknown) => void }) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "token-route" }));
      build.onLoad({ filter: /.*/, namespace: "token-route" }, () => ({ contents: "export const useParams=()=>({kind:'operating_plan',token:'synthetic-operating-token'});", loader: "js" }));
    } }],
  });
  [script, css, pdf] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css")), Promise.resolve(pdfFontCompatibility)]);
  scenarios = operatingClientScenarios as unknown as Record<"initial" | "positive" | "negative", Scenario>;
});

async function setup(page: Page, options: { prefill?: boolean; splitDetail?: boolean; unitMarketing?: "known" | "unknown"; readOnly?: boolean; failPreview?: boolean; failSubmit?: boolean; failSource?: boolean } = {}) {
  const writes: Write[] = [], previews: OperatingPlanBody[] = [], errors: string[] = [], headers: Record<string, string>[] = [];
  let body = structuredClone(options.prefill || options.unitMarketing ? scenarios.positive.body : scenarios.initial.body), revision = 4;
  if (options.splitDetail) body.expenses = [{ id: "00000000-0000-4000-8000-000000000211", label: "Location A rent", category: "rent", current_amount: 1000, cadence: "monthly", source_group_key: "tax-rent", source_candidate_key: "lease-detail-a", source_file_ids: [SOURCE] }];
  if (options.unitMarketing) {
    body.expenses![1] = { ...body.expenses![1], current_amount: 999, cost_basis: "per_unit", current_units_per_period: options.unitMarketing === "known" ? 10 : null, current_unit_cost: 20, current_fixed_amount: 50 };
    body.adjustments![0] = { ...body.adjustments![0], expense_row_id: null, current_amount: null };
  }
  let failPreview = options.failPreview, failSubmit = options.failSubmit;
  const workspace = () => ({ family_id: "00000000-0000-4000-8000-000000000401", revision, base_version_id: null, dirty: true, versions: [], current_version: null });
  const preview = (sent: OperatingPlanBody) => {
    const row = sent.adjustments?.find(item => !item.excluded);
    const complete = !options.unitMarketing && row?.proposed_amount != null && row?.revenue_return_multiple != null && row?.contribution_margin_pct != null && row?.implementation_cost != null && row?.effective_date;
    const reply = structuredClone(scenarios[complete ? Number(row.revenue_return_multiple) < 2 ? "negative" : "positive" : "initial"].reply);
    if (complete && row && reply.evaluation) {
      reply.evaluation.actions[0].id = row.id;
      reply.evaluation.actions[0].label = row.label || "Marketing investment";
    }
    return reply;
  };
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (pathname.startsWith(BASE)) {
      headers.push(request.headers());
      if (pathname === BASE) return route.fulfill({ json: { kind: "operating_plan", schema: {}, business_name: "Example Studio", completed: false, permission: options.readOnly ? "view" : "edit", can_edit: !options.readOnly, body, workspace: workspace(), operating_plan: preview(body) } });
      if (pathname === `${BASE}/evaluate`) {
        const payload = request.postDataJSON();
        expect(Object.keys(payload)).toEqual(["body"]);
        previews.push(payload.body);
        if (failPreview) { failPreview = false; return route.fulfill({ status: 500, json: { detail: "Preview temporarily unavailable" } }); }
        return route.fulfill({ json: preview(payload.body) });
      }
      if (pathname === `${BASE}/evidence/${SOURCE}`) return route.fulfill(options.failSource ? { status: 404, json: { detail: "Source document not found" } } : { json: { file: { id: SOURCE, file_name: "Example business return.pdf", content_type: "application/pdf" }, preview_url: `${ORIGIN}/sample.pdf`, expires_in: 300 } });
      if (pathname === `${BASE}/draft` || pathname === `${BASE}/submit`) {
        const payload = request.postDataJSON(); writes.push({ path: pathname, payload }); body = payload.body;
        if (pathname.endsWith("/submit") && failSubmit) { failSubmit = false; return route.fulfill({ status: 502, json: { detail: "PDF generation failed; your draft is retained" } }); }
        revision += 1;
        return route.fulfill({ json: { body, workspace: workspace(), operating_plan: preview(body), ...(pathname.endsWith("/submit") ? { completed: true, saved_version: { id: "saved-version", version_number: 1, created_at: "2027-01-01T12:00:00Z" } } : {}) } });
      }
      throw Error(`Unexpected public API request ${pathname}`);
    }
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (pathname === "/sample.pdf") return route.fulfill({ contentType: "application/pdf", body: pdf });
    if (pathname.startsWith("/pdfjs/")) {
      const relative = pathname.slice(7);
      const asset = relative === "pdf.worker.min.mjs" ? path.join(pdfjsRoot, "legacy/build/pdf.worker.min.mjs") : /^(wasm|standard_fonts|cmaps|iccs)\/[a-zA-Z0-9_.-]+$/.test(relative) ? path.join(pdfjsRoot, relative) : null;
      if (!asset) throw Error("Unexpected PDF asset");
      return route.fulfill({ contentType: relative.endsWith(".mjs") ? "text/javascript" : "application/octet-stream", body: await readFile(asset) });
    }
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
  await page.goto(`${ORIGIN}/forms/operating_plan/synthetic-operating-token`);
  await expect(page.getByRole("region", { name: "Guided operating expenses and earnings plan", exact: true })).toBeVisible();
  return { writes, previews, errors, headers, recoverPreview: () => { failPreview = false; } };
}

const step = (page: Page, title: string) => page.getByRole("navigation", { name: "Guided operating plan steps" }).getByRole("button", { name: new RegExp(title) }).click();

test("source costs are adopted explicitly and one working plan survives guided and table views", async ({ page }, info) => {
  const state = await setup(page);
  const add = page.getByRole("button", { name: "Add Rent and premises for review", exact: true });
  await expect(add).toBeEnabled();
  expect(state.writes).toEqual([]);
  await page.getByRole("button", { name: "View Example business return.pdf", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "Operating plan source document", exact: true });
  await expect(reader.locator("canvas")).toHaveCount(3);
  await reader.getByRole("button", { name: "Close review", exact: true }).click();
  await expect(reader).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(120, 320); await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await add.click(); await expect(page.getByRole("button", { name: "Group added", exact: true })).toBeDisabled();
  await page.getByText("Suggestions from supporting documents", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Already added", exact: true })).toBeDisabled();
  await step(page, "Confirm current expenses");
  await expect(page.getByLabel("Current cost for Rent and premises", { exact: true })).toHaveValue("24000");
  await page.getByLabel("Confirm Rent", { exact: true }).selectOption("confirmed");
  await page.getByLabel("Confirm Marketing", { exact: true }).selectOption("not_applicable");
  await page.getByRole("button", { name: "Advanced tables", exact: true }).click();
  await expect(page.getByLabel("Expense name", { exact: true })).toHaveValue("Rent and premises");
  await page.getByRole("button", { name: "Guided steps", exact: true }).click();
  await step(page, "Confirm current expenses");
  await expect(page.getByLabel("Current cost for Rent and premises", { exact: true })).toHaveValue("24000");
  await expect(page.getByLabel("Confirm Rent", { exact: true })).toHaveValue("confirmed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("guided-current-expenses.png"), fullPage: true });
  expect(state.headers.every(headers => !headers.authorization && !headers["x-dev-user"])).toBe(true);
  expect(state.errors).toEqual([]);
});

test("marketing assumptions show positive and negative proposed NOI while current NOI stays fixed", async ({ page }, info) => {
  const state = await setup(page, { prefill: true });
  await step(page, "Compare results");
  const comparison = page.getByRole("region", { name: "Guided before and after", exact: true });
  const annual = comparison.locator("article").filter({ has: page.getByRole("heading", { name: "Annual NOI · run-rate", exact: true }) });
  await expect(annual).toContainText("-$6,000.00"); await expect(annual).toContainText("$6,000.00");
  await expect(comparison).toContainText("1.00x");
  await expect(comparison).toContainText("0.50x");
  const currentColor = await annual.locator("strong").first().evaluate(element => getComputedStyle(element).color);
  const proposedColor = await annual.locator("strong").nth(1).evaluate(element => getComputedStyle(element).color);
  expect(currentColor).not.toBe(proposedColor);
  await page.screenshot({ path: info.outputPath("guided-positive-noi.png"), fullPage: true });
  await step(page, "Plan your changes");
  await page.getByLabel("Revenue per $1 of additional marketing spend (assumption)", { exact: true }).fill("1");
  await expect.poll(() => state.previews.at(-1)?.adjustments?.[0].revenue_return_multiple).toBe(1);
  await step(page, "Compare results");
  await expect(annual).toContainText("-$12,000.00"); await expect(annual).toContainText("-$6,000.00");
  await expect(comparison).toContainText("0.25x");
  expect(await annual.locator("strong").first().evaluate(element => getComputedStyle(element).color)).toBe(currentColor);
  await page.screenshot({ path: info.outputPath("guided-negative-noi.png"), fullPage: true });
  expect(state.errors).toEqual([]);
});

test("preview errors preserve entries and explicit retry restores current comparison", async ({ page }) => {
  const state = await setup(page, { prefill: true, failPreview: true });
  await step(page, "Plan your changes");
  await page.getByLabel("Revenue per $1 of additional marketing spend (assumption)", { exact: true }).fill("1");
  await expect(page.getByRole("alert")).toContainText("Preview temporarily unavailable");
  await expect(page.getByLabel("Revenue per $1 of additional marketing spend (assumption)", { exact: true })).toHaveValue("1");
  await step(page, "Compare results");
  await expect(page.getByRole("region", { name: "Guided before and after", exact: true })).toContainText("The financial preview is not available yet");
  await expect(page.getByText("$6,000.00", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry financial preview", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Guided before and after", exact: true })).toContainText("-$12,000.00");
  expect(state.errors).toEqual([]);
});

test("failed version creation retains the same proposed plan and retry identity", async ({ page }) => {
  const state = await setup(page, { prefill: true, failSubmit: true });
  await page.getByLabel("Plan notes", { exact: true }).fill("Retain this proposed plan through PDF retry.");
  await page.getByRole("button", { name: "Review and save version", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save version and send", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save version and send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("PDF generation failed");
  await page.getByRole("button", { name: "Save version and send", exact: true }).click();
  await expect(page.getByText("Your operating expenses and earnings plan has been saved as a dated version for your team's review.", { exact: true })).toBeVisible();
  const submissions = state.writes.filter(write => write.path.endsWith("/submit"));
  expect(submissions).toHaveLength(2);
  expect(submissions[0].payload.idempotency_key).toBeTruthy();
  expect(submissions[1].payload.idempotency_key).toBe(submissions[0].payload.idempotency_key);
  expect(submissions[1].payload.body).toEqual(submissions[0].payload.body);
  expect(submissions[1].payload.body.notes).toBe("Retain this proposed plan through PDF retry.");
  expect(submissions[1].payload.body.adjustments?.[0].status).toBe("proposed");
  expect(state.errors).toEqual([]);
});

test("read-only links expose source context without editing or evaluating", async ({ page }) => {
  const state = await setup(page, { prefill: true, readOnly: true });
  await expect(page.getByRole("button", { name: "Review and save version", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Plan notes", { exact: true })).toBeDisabled();
  await step(page, "Plan your changes");
  await expect(page.getByLabel("Proposed marketing spend", { exact: true })).toBeDisabled();
  expect(state.writes).toEqual([]); expect(state.previews).toEqual([]); expect(state.errors).toEqual([]);
});

test("source access errors stay visible and closing the reader preserves the working plan", async ({ page }) => {
  const state = await setup(page, { failSource: true });
  await page.getByLabel("Plan notes", { exact: true }).fill("Keep these client notes.");
  await page.getByRole("button", { name: "View Example business return.pdf", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "Operating plan source document", exact: true });
  await expect(reader).toContainText("Source document not found");
  await reader.getByRole("button", { name: "Close review", exact: true }).click();
  await expect(reader).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Plan notes", exact: true })).toHaveValue("Keep these client notes.");
  expect(state.errors).toEqual([]);
});

test("guided review asks for category confirmation and preserves an explicit request for help", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "Review and save version", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm the current expense categories");
  await expect(page.getByRole("heading", { name: "Step 2: Confirm current expenses", exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
  await page.getByLabel("Confirm Rent", { exact: true }).selectOption("needs_help");
  await page.getByLabel("Confirm Marketing", { exact: true }).selectOption("not_applicable");
  await page.getByRole("button", { name: "Review and save version", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save version and send", exact: true })).toBeVisible();
  expect(state.writes.at(-1)?.payload.body.category_confirmations).toEqual({ rent: "needs_help", marketing: "not_applicable" });
  expect(state.writes.at(-1)?.payload.body.expenses).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("sequential decimal input retains fractional assumptions in the public preview request", async ({ page }) => {
  const state = await setup(page, { prefill: true });
  await step(page, "Plan your changes");
  const spend = page.getByLabel("Proposed marketing spend", { exact: true });
  await spend.fill(""); await spend.pressSequentially("1200.05");
  await expect(spend).toHaveValue("1200.05");
  const multiple = page.getByLabel("Revenue per $1 of additional marketing spend (assumption)", { exact: true });
  await multiple.fill(""); await multiple.pressSequentially("2.5");
  await expect(multiple).toHaveValue("2.5");
  await expect.poll(() => state.previews.at(-1)?.adjustments?.[0].proposed_amount).toBe(1200.05);
  await expect.poll(() => state.previews.at(-1)?.adjustments?.[0].revenue_return_multiple).toBe(2.5);
  expect(state.errors).toEqual([]);
});

test("an existing granular source breakdown cannot adopt its aggregate total a second time", async ({ page }) => {
  const state = await setup(page, { splitDetail: true });
  await page.getByText("Suggestions from supporting documents", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Already added", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add statement suggestion", exact: true })).toHaveCount(0);
  await step(page, "Confirm current expenses");
  await expect(page.getByLabel("Current cost for Location A rent", { exact: true })).toHaveValue("1000");
  await expect(page.getByRole("textbox", { name: /^Current expense .* name$/ })).toHaveCount(1);
  await expect(page.getByLabel("Current cost for Rent and premises", { exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

for (const units of ["known", "unknown"] as const) test(`per-unit marketing link uses ${units} current totals and preserves proposed assumptions`, async ({ page }) => {
  const state = await setup(page, { unitMarketing: units });
  await step(page, "Plan your changes");
  await page.getByLabel("Linked expense for Model a marketing investment", { exact: true }).selectOption("00000000-0000-4000-8000-000000000202");
  await expect(page.getByLabel("Current marketing spend", { exact: true })).toHaveValue(units === "known" ? "250" : "");
  await expect(page.getByLabel("Proposed marketing spend", { exact: true })).toHaveValue("1000");
  await expect(page.getByLabel("Revenue per $1 of additional marketing spend (assumption)", { exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Contribution margin percent (assumption)", { exact: true })).toHaveValue("50");
  await expect(page.getByLabel("Product or service", { exact: true })).toHaveValue("Service visits");
  await expect.poll(() => state.previews.at(-1)?.adjustments?.[0].expense_row_id).toBe("00000000-0000-4000-8000-000000000202");
  const sent = state.previews.at(-1)!;
  expect(sent.adjustments?.[0]).toMatchObject({ cost_basis: "total", current_amount: units === "known" ? 250 : null, proposed_amount: 1000, revenue_return_multiple: 4, contribution_margin_pct: 50, product_name: "Service visits" });
  expect(sent.expenses?.[1]).toMatchObject({ cost_basis: "per_unit", current_amount: 999, current_unit_cost: 20, current_fixed_amount: 50 });
  expect(state.errors).toEqual([]);
});

test("current expense subtotal distinguishes unknown amounts, explicit zero, and a partial known sum", async ({ page }, info) => {
  const state = await setup(page);
  await step(page, "Confirm current expenses");
  const marketing = page.getByRole("region", { name: "Marketing current expenses", exact: true });
  await expect(marketing).toContainText("Unknown");
  await expect(marketing).not.toContainText("$0.00");
  await page.screenshot({ path: info.outputPath("guided-unquantified-expenses.png"), fullPage: true });
  await marketing.getByRole("button", { name: "Add Marketing item", exact: true }).click();
  await marketing.getByRole("textbox", { name: /^Current expense .* name$/ }).fill("Campaign base");
  const current = marketing.getByLabel("Current cost for Campaign base", { exact: true });
  await expect(current).toHaveValue("");
  await expect(marketing).toContainText("Unknown");
  await current.fill("0");
  await expect(marketing).toContainText("$0.00");
  await page.screenshot({ path: info.outputPath("guided-zero-expense.png"), fullPage: true });
  await current.fill("120");
  await marketing.getByRole("button", { name: "Add Marketing item", exact: true }).click();
  await expect(marketing).toContainText("$1,440.00");
  await expect(marketing).toContainText(/incomplete/i);
  await expect(marketing.getByRole("textbox", { name: /^Current expense .* name$/ })).toHaveCount(2);
  expect(state.errors).toEqual([]);
});
