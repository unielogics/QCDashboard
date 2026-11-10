import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FinancialWorkspaceSnapshot } from "../src/lib/financialWorkspaceApi";
import type { OperatingPlanBody } from "../src/lib/operatingPlan";
import { pdfFontCompatibility } from "./fixtures/pdfFontCompatibility";
import { emptyStaffOperatingBody, staffOperatingEvidence, staffOperatingEvaluation, STAFF_BANK_SOURCE, STAFF_FAMILY, STAFF_PROFILE, STAFF_TAX_SOURCE } from "./fixtures/staffOperatingSources";

const ORIGIN = "https://staff-operating.test";
const ROOT = `/api/v1/application-profiles/${STAFF_PROFILE}`;
type Json = Record<string, unknown>;
let script: Buffer, css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-staff-operating-"));
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{FinancialWorkspace}from'@/components/application/FinancialWorkspace';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false}}});function App(){const[open,setOpen]=useState(false);return<QueryClientProvider client={client}><main style={{minHeight:2400,padding:24}}><h1>Staff file background</h1><button onClick={()=>setOpen(true)}>Open staff operating plan</button><FinancialWorkspace open={open} onClose={()=>setOpen(false)} profileId='${STAFF_PROFILE}' initialKind='operating_plan' initialView='form'/></main></QueryClientProvider>}createRoot(document.getElementById('root')).render(<App/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic",
    nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(ORIGIN) },
    external: ["node:module", "node:fs", "node:fs/promises", "node:url", "node:path", "@napi-rs/canvas"], loader: { ".module.css": "local-css" }, logLevel: "silent",
    plugins: [{ name: "staff-auth", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /^@\/(hooks\/useApi|lib\/consoleAuth)$/ }, args => ({ path: args.path, namespace: "staff-auth" }));
      build.onLoad({ filter: /.*/, namespace: "staff-auth" }, args => ({ loader: "js", resolveDir: root, contents: args.path.endsWith("consoleAuth")
        ? "export const useConsoleAuth=()=>({getToken:async()=> 'synthetic-staff-token',isSignedIn:true});"
        : `import{ApiError}from'@/lib/api';const api=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{'Content-Type':'application/json','Authorization':'Bearer synthetic-staff-token',...options.headers}});const data=await response.json();if(!response.ok)throw new ApiError(response.status,typeof data.detail==='string'?data.detail:'Synthetic API failure',data);return data};export const useAuthedApi=()=>api;export const useDevUser=()=> 'staff-qa';export const useCurrentUser=()=>({data:{id:'synthetic-staff',role:'loan_exec'}});` }));
    } }],
  });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

async function fixture(page: Page, options: { sourceFailure?: boolean; manualRent?: boolean; scopeConflict?: boolean; holdPublish?: boolean; draftConflict?: boolean } = {}) {
  let body = structuredClone(emptyStaffOperatingBody) as unknown as OperatingPlanBody;
  if (options.manualRent) body.expenses = [{ id: "92000000-0000-4000-8000-000000000020", label: "Manually disclosed rent", category: "rent", current_amount: 777, cadence: "monthly", source_file_ids: [], notes: "Keep this existing disclosure." }];
  if (options.scopeConflict) body = { ...body, business_name: "Existing entity", currency: "CAD", period_start: "2024-01-01", period_end: "2024-12-31", basis: "accrual" };
  const requests: string[] = [], writes: Array<{ path: string; payload: Json }> = [], errors: string[] = [];
  const released = { required: true, available: true, status: "incomplete", source_fingerprint: "b".repeat(64), currency: "USD", amount_monthly: 2000, allocated_monthly: 0, unallocated_monthly: 2000, complete: false, missing: ["Allocate the recurring released cash flow."], source: { updated_at: "2027-01-01T12:00:00Z", before_monthly: 5000, after_monthly: 3000 } };
  const evaluation = { ...structuredClone(staffOperatingEvaluation), released_cash_flow: released };
  let revision = 4, sourceAttempts = 0, published = false;
  let releasePublish = () => {};
  const publishGate = options.holdPublish ? new Promise<void>(resolve => { releasePublish = resolve; }) : Promise.resolve();
  const version = { id: "92000000-0000-4000-8000-000000000030", version_number: 1, created_at: "2027-01-01T12:00:00Z", actor_name: "Synthetic staff", source: "staff", source_file_id: null, pdf_file_id: "92000000-0000-4000-8000-000000000031", status: "published" };
  const snapshot = (): FinancialWorkspaceSnapshot => ({ kind: "operating_plan", family_id: STAFF_FAMILY, label: "Operating expenses and earnings plan", body: body as unknown as Json, schema: {},
    worksheet: { layout: { kind: "operating_plan", title: "Operating plan", schema_version: "test", layout_version: "test", name_prefix: "test", columns: [], rows: [], freeze: [0, 0] }, values: {}, computed: {} },
    draft: { revision, base_version_id: published ? version.id : null, updated_at: "2027-01-01T12:00:00Z", dirty: !published }, current_version_id: published ? version.id : null,
    versions: published ? [version] : [], families: [{ id: STAFF_FAMILY, kind: "operating_plan", label: "Operating plan", current_version_id: published ? version.id : null }],
    evidence: staffOperatingEvidence.files.map(file => ({ ...file, content_type: "application/pdf" })), completion: { complete: false, missing_fields: [], reason: "Working plan", no_debt: false, active_rows: 0, released_cash_flow: released }, ...(published ? { saved_version: version } : {}),
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (pathname.startsWith(ROOT)) {
      requests.push(`${request.method()} ${pathname}`);
      expect(request.headers().authorization).toBe("Bearer synthetic-staff-token");
      if (pathname === `${ROOT}/financial-workspace`) return route.fulfill({ json: snapshot() });
      if (pathname === `${ROOT}/operating-plan/evidence`) { sourceAttempts += 1; return route.fulfill(options.sourceFailure && sourceAttempts === 1 ? { status: 500, json: { detail: "Source suggestions temporarily unavailable" } } : { json: staffOperatingEvidence }); }
      if (pathname === `${ROOT}/operating-plan/evaluate`) {
        const payload = request.postDataJSON(); expect(payload.family_id).toBe(STAFF_FAMILY);
        const expenseGroups = staffOperatingEvidence.guidance.expense_groups.map(group => {
          const drafted = (payload.body.expenses as OperatingPlanBody["expenses"])?.some(row => row.source_group_key === group.key && !row.excluded && !row.duplicate_of);
          return { key: group.key, category: group.category, label: group.label, baseline_annual_amount: group.baseline_annual_amount, disclosed_annual_amount: drafted ? group.baseline_annual_amount : null, difference_annual: drafted ? 0 : null, status: drafted ? "matches_source" : "no_detail", notes: ["A disclosed variance is a reconciliation question, not an automatic earnings improvement."] };
        });
        return route.fulfill({ json: { evaluation: { ...evaluation, expense_groups: expenseGroups }, ...(options.sourceFailure ? {} : { evidence: staffOperatingEvidence, guidance: staffOperatingEvidence.guidance }), context_stamp: "a".repeat(64) } });
      }
      if (pathname === `${ROOT}/financial-workspace/draft`) {
        const payload = request.postDataJSON(); writes.push({ path: pathname, payload });
        if (options.draftConflict) return route.fulfill({ status: 409, json: { detail: "Shared draft changed; reload before saving" } });
        body = payload.body; revision += 1; return route.fulfill({ json: snapshot() });
      }
      if (pathname === `${ROOT}/financial-workspace/versions`) { const payload = request.postDataJSON(); writes.push({ path: pathname, payload }); await publishGate; published = true; revision += 1; return route.fulfill({ json: snapshot() }); }
      if (pathname.endsWith(`/versions/${version.id}/pdf`)) return route.fulfill({ contentType: "application/pdf", body: pdfFontCompatibility });
      if (pathname === `${ROOT}/evidence/files/${STAFF_TAX_SOURCE}/url` || pathname === `${ROOT}/evidence/files/${STAFF_BANK_SOURCE}/url`) return route.fulfill({ json: { url: `${ORIGIN}/source.pdf` } });
      if (pathname === `${ROOT}/evidence`) return route.fulfill({ json: { files: staffOperatingEvidence.files } });
      throw Error(`Unexpected staff API ${request.method()} ${pathname}`);
    }
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (pathname === "/source.pdf") return route.fulfill({ contentType: "application/pdf", body: pdfFontCompatibility });
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
  await page.goto(ORIGIN);
  await page.getByRole("button", { name: "Open staff operating plan", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: "Financial workspace", exact: true });
  await expect(workspace.getByRole("button", { name: "Guided steps", exact: true })).toBeVisible();
  return { workspace, requests, writes, errors, body: () => body, sourceAttempts: () => sourceAttempts, releasePublish };
}

test("staff workspace loads source data and offers draft actions in both editing views", async ({ page }, info) => {
  const state = await fixture(page);
  await expect.poll(() => state.requests.some(request => request.endsWith("/operating-plan/evidence"))).toBe(true);
  await expect.poll(() => state.requests.some(request => request.endsWith("/operating-plan/evaluate"))).toBe(true);
  await page.screenshot({ path: info.outputPath("staff-operating-initial.png"), animations: "disabled" });
  await info.attach("staff-source-contract", { body: JSON.stringify({ sourceGroups: staffOperatingEvidence.guidance.expense_groups.length, statementHints: staffOperatingEvidence.expense_candidates.filter(row => "bank_vendor_key" in row).length, requests: state.requests }), contentType: "application/json" });
  await expect(state.workspace.getByRole("button", { name: "Guided steps", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true })).toBeInViewport({ ratio: 1 });
  await state.workspace.getByRole("button", { name: "Advanced tables", exact: true }).click();
  await expect(state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true })).toBeVisible();
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test("GET source failures remain actionable even when POST evaluation succeeds", async ({ page }) => {
  const state = await fixture(page, { sourceFailure: true });
  await expect.poll(() => state.requests.some(request => request.endsWith("/operating-plan/evaluate"))).toBe(true);
  await expect(state.workspace.getByRole("button", { name: "Retry source suggestions", exact: true })).toBeVisible();
  await expect(state.workspace).toContainText("Source suggestions temporarily unavailable");
  await state.workspace.getByRole("button", { name: "Retry source suggestions", exact: true }).click();
  await expect.poll(() => state.sourceAttempts()).toBe(2);
  await expect(state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true })).toBeEnabled();
  await expect(state.workspace.getByRole("button", { name: "Retry source suggestions", exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test("one selected source drafts its headers and eight costs without adopting bank hints, then saves and reloads", async ({ page }, info) => {
  const state = await fixture(page);
  await state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true }).click();
  await expect.poll(() => state.body().expenses?.length).toBe(8);
  await expect(state.workspace.getByRole("heading", { name: "Step 2: Confirm current expenses", exact: true })).toBeInViewport();
  await expect(state.workspace.getByLabel("Current cost for Rent and premises", { exact: true })).toBeInViewport({ ratio: 1 });
  expect(state.body()).toMatchObject({ business_name: "Example Studio", period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", basis: "cash" });
  expect(state.body().adjustments).toEqual([]);
  expect(state.body().expenses?.reduce((sum, row) => sum + Number(row.current_amount), 0)).toBe(48000);
  expect(state.body().expenses?.every(row => row.cadence === "annual" && row.source_file_ids?.length === 1 && row.source_file_ids[0] === STAFF_TAX_SOURCE)).toBe(true);
  expect(state.body().expenses?.map(row => row.source_group_key).sort()).toEqual(staffOperatingEvidence.guidance.expense_groups.map(group => group.key).sort());
  await state.workspace.getByRole("navigation", { name: "Guided operating plan steps" }).getByRole("button", { name: /Choose source costs/ }).click();
  const addedGroups = state.workspace.getByRole("button", { name: "Group added", exact: true });
  await expect(addedGroups).toHaveCount(8);
  expect(await addedGroups.evaluateAll(buttons => buttons.every(button => (button as HTMLButtonElement).disabled))).toBe(true);
  const before = structuredClone(state.body());
  await state.workspace.getByRole("button", { name: "Review statement suggestions", exact: true }).click();
  await expect(state.workspace).toContainText("Observed rent payment");
  expect(state.body()).toEqual(before);
  await state.workspace.getByRole("button", { name: "Advanced tables", exact: true }).click();
  await expect(state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("staff-drafted-advanced.png"), animations: "disabled" });
  await state.workspace.getByRole("button", { name: "Save version", exact: true }).click();
  await expect.poll(() => state.writes.filter(write => write.path.endsWith("/versions")).length).toBe(1);
  await expect(state.workspace.getByRole("button", { name: "Saving version…", exact: true })).toHaveCount(0);
  await state.workspace.getByRole("button", { name: "Close", exact: true }).click();
  await expect(state.workspace).toHaveCount(0);
  await page.getByRole("button", { name: "Open staff operating plan", exact: true }).click();
  await expect(state.workspace.getByRole("button", { name: "Guided steps", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(state.workspace.getByRole("button", { name: "Group added", exact: true })).toHaveCount(8);
  expect(state.body()).toEqual(before);
  expect(state.errors).toEqual([]);
});

test("drafting from Advanced tables keeps the chosen view and brings its first editable row into view", async ({ page }) => {
  const state = await fixture(page);
  await state.workspace.getByRole("button", { name: "Advanced tables", exact: true }).click();
  await state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true }).click();
  await expect.poll(() => state.body().expenses?.length).toBe(8);
  await expect(state.workspace.getByRole("button", { name: "Advanced tables", exact: true })).toHaveAttribute("aria-pressed", "true");
  const firstExpense = state.workspace.getByRole("textbox", { name: "Expense name", exact: true }).first();
  await expect(firstExpense).toBeInViewport({ ratio: 1 });
  await expect(firstExpense).toHaveValue("Rent and premises");
  expect(state.errors).toEqual([]);
});

test("existing manual rent is preserved instead of adding a second source rent total", async ({ page }) => {
  const state = await fixture(page, { manualRent: true });
  await state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true }).click();
  await expect.poll(() => state.body().expenses?.length).toBe(8);
  expect(state.body().expenses?.filter(row => row.category === "rent")).toEqual([expect.objectContaining({ label: "Manually disclosed rent", current_amount: 777, cadence: "monthly", notes: "Keep this existing disclosure.", source_file_ids: [] })]);
  await expect(state.workspace).toContainText(/existing category amount differs|reconcile/i);
  expect(state.errors).toEqual([]);
});

test("a conflicting existing reporting scope blocks source drafting without changing the plan", async ({ page }) => {
  const state = await fixture(page, { scopeConflict: true });
  const original = structuredClone(state.body());
  await state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true }).click();
  await expect(state.workspace.getByRole("alert")).toContainText(/conflicts with.*source/i);
  expect(state.body()).toEqual(original);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test("pending publication blocks source changes and closing until the same version finishes", async ({ page }) => {
  const state = await fixture(page, { holdPublish: true });
  await state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true }).click();
  await expect.poll(() => state.body().expenses?.length).toBe(8);
  await state.workspace.getByRole("button", { name: "Review statement suggestions", exact: true }).click();
  await state.workspace.getByRole("button", { name: "Save version", exact: true }).click();
  await expect.poll(() => state.writes.filter(write => write.path.endsWith("/versions")).length).toBe(1);
  await expect(state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true })).toBeDisabled();
  await expect(state.workspace.getByRole("button", { name: "View selected source", exact: true })).toBeDisabled();
  const add = state.workspace.getByRole("button", { name: "Add payment for review", exact: true });
  await expect(add).toHaveCount(11);
  expect(await add.evaluateAll(buttons => buttons.every(button => (button as HTMLButtonElement).disabled))).toBe(true);
  await state.workspace.getByRole("button", { name: "Close", exact: true }).click();
  await expect(state.workspace).toBeVisible();
  state.releasePublish();
  await expect(state.workspace.getByRole("button", { name: "Saving version…", exact: true })).toHaveCount(0);
  expect(state.writes.filter(write => write.path.endsWith("/versions"))).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test("a shared draft conflict retains local source costs and disables further draft actions", async ({ page }) => {
  const state = await fixture(page, { draftConflict: true });
  await state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true }).click();
  await expect(state.workspace).toContainText("Shared draft changed; reload before saving");
  await expect(state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true })).toBeDisabled();
  await state.workspace.getByRole("navigation", { name: "Guided operating plan steps" }).getByRole("button", { name: /Choose source costs/ }).click();
  await expect(state.workspace.getByRole("button", { name: "Group added", exact: true })).toHaveCount(8);
  expect(state.body().expenses).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("source preview closes back to an unlocked staff page with real wheel scrolling", async ({ page }) => {
  const state = await fixture(page);
  await state.workspace.getByRole("button", { name: "View selected source", exact: true }).click();
  await expect(state.workspace.getByTitle("Original financial source document", { exact: true })).toBeVisible();
  await state.workspace.getByRole("tab", { name: "Form", exact: true }).click();
  await expect(state.workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true })).toBeVisible();
  await state.workspace.getByRole("button", { name: "Close", exact: true }).click();
  await expect(state.workspace).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(120, 300); await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(state.errors).toEqual([]);
});
