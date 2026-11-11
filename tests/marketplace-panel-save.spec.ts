import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MARKETPLACE_PROFILE as PROFILE, marketplaceBudget, marketplaceCockpit, marketplaceListing, marketplacePlan, marketplaceProduct } from "./fixtures/marketplacePanel";

const ORIGIN = "https://marketplace-panel.test";
let script: Buffer, css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketplace-panel-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useQuery,useMutation,useQueryClient}from'@tanstack/react-query';const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useFinancialCockpit" ? "export const useFinancialCockpit=id=>useQuery({queryKey:['financial-cockpit',id],queryFn:()=>call('/application-profiles/'+id+'/financial-cockpit')});" : name === "useSaveFinancialPlan" ? "export function useSaveFinancialPlan(id){const q=useQueryClient();return useMutation({mutationFn:body=>call('/application-profiles/'+id+'/financial-plan',{method:'PUT',body:JSON.stringify(body)}),onSuccess:()=>q.invalidateQueries({queryKey:['financial-cockpit',id]})})}" : name === "useClientTermsSummary" ? "export const useClientTermsSummary=id=>useQuery({queryKey:['application-client-terms',id],queryFn:()=>call('/application-profiles/'+id+'/client-terms')});" : `export const ${name}=()=>({isPending:false,data:null,mutateAsync:async()=>({}),refetch:async()=>({})});`).join("\n")}`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-staff-token'});export const visualQaUser=()=>null;",
    "@/store/role": "export const useActiveProfile=()=>({email:'synthetic@example.test'});",
    "@/lib/financialKpiReview": "export const metricEntries=()=>[];",
    "@/components/design-system/ConfirmationProvider": "export const useConfirmAction=()=>async()=>true;",
    "@/components/application/FinancialWorkspace": "export const FinancialWorkspace=()=>null;",
    "@/components/application/ApplicationLenderSubmissions": "export const ApplicationLenderSubmissions=()=>null;",
    "@/components/application/ApplicationProgramReadiness": "export const ApplicationProgramReadiness=()=>null;",
    "./OperatingPlanEntry": "export const OperatingPlanEntry=()=>null;",
    "./FinancialMetricReviewWorkspace": "export const FinancialMetricReviewWorkspace=()=>null;",
    "./EbitdaRefinanceComparison": "export const EbitdaRefinanceComparison=()=>null;",
    "./RevenueTrendPanel": "export const RevenueTrendPanel=()=>null;",
    "./CockpitCharts": "export const SERIES={};export const ChartCard=()=>null;export const ColumnChart=()=>null;export const LineChart=()=>null;export const Meter=()=>null;export const HBarList=()=>null;export const Sparkline=()=>null;",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{FinancialCockpit}from'@/components/file/cockpit/FinancialCockpit';import'@/app/globals.css';import'@/app/app-extras.css';
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff-token','Content-Type':'application/json'}});const data=await response.json();if(!response.ok){const error=new Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail));error.status=response.status;error.body=data;throw error}return data};
    function App(){const[coverage,setCoverage]=useState(0),[profile,setProfile]=useState('${PROFILE}');return <><nav><button onClick={()=>setCoverage(n=>n+1)}>Review actual coverage plan</button><button onClick={()=>setProfile('97000000-0000-0000-0000-000000000002')}>Another synthetic file</button></nav><FinancialCockpit key={profile} profileId={profile} businessName='Example Studio LLC' canPublish canRecordTerms canUnderwrite programReadiness={null} termSheet={null} packageState={{generated:!location.search.includes('no-package'),inSync:!location.search.includes('stale-package'),summaryVersion:1,packetVersion:1}} focus={null} onFocusHandled={()=>{}} coverageRequest={coverage} onRecordTerms={()=>{}} onOpenEvidence={()=>window.fixtureNavigation='evidence'} onOpenPackage={()=>window.fixtureNavigation='package'}/></>};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><App/></main></QueryClientProvider>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

type Json = Record<string, unknown>;
async function fixture(page: Page, options: { existing?: boolean; failPlan?: boolean; failBudget?: boolean; failCreate?: boolean; holdPlan?: boolean; holdBudget?: boolean; holdPrefill?: boolean; holdRefresh?: boolean; failRefresh?: boolean; lostCreateResponse?: boolean; staleBudget?: boolean; missing?: string[]; noPackage?: boolean; stalePackage?: boolean } = {}) {
  let record = marketplacePlan(), budget = marketplaceBudget(), listing = options.existing ? marketplaceListing() : null;
  let failed = false, created = 0, budgetReads = 0;
  const requests: Array<{ method: string; path: string; body: Json }> = [], errors: string[] = [];
  let releasePlan = () => {}; const gate = options.holdPlan ? new Promise<void>(resolve => { releasePlan = resolve; }) : Promise.resolve();
  let releaseBudget = () => {}; const budgetGate = options.holdBudget ? new Promise<void>(resolve => { releaseBudget = resolve; }) : Promise.resolve();
  let releasePrefill = () => {}; const prefillGate = options.holdPrefill ? new Promise<void>(resolve => { releasePrefill = resolve; }) : Promise.resolve();
  let releaseRefresh = () => {}; const refreshGate = options.holdRefresh ? new Promise<void>(resolve => { releaseRefresh = resolve; }) : Promise.resolve();
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (!pathname.startsWith("/api/v1/")) return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    const api = pathname.slice(7), method = request.method(), body = request.postData() ? request.postDataJSON() as Json : {};
    requests.push({ method, path: api, body });
    expect(request.headers().authorization).toBe("Bearer synthetic-staff-token");
    if (/publish|\/send|issue/.test(api)) throw new Error(`Forbidden external action ${api}`);
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (api.endsWith("/financial-cockpit")) return json({ ...marketplaceCockpit(record), profile_id: api.split("/")[2] });
    if (api.endsWith("/financial-plan")) { await gate; if (options.failPlan && !failed) { failed = true; return json({ detail: "Synthetic plan save failed; retry retained entries" }, 503); } record = { ...record, ...body, updated_at: "2026-11-10T17:00:02Z" }; budget = { ...budget, calculation: marketplaceBudget(record.new_loan_amount).calculation, financing_context: { current_loan_amount: record.new_loan_amount, plan_updated_at: record.updated_at, terms_ref: null } }; return json({ profile_id: PROFILE, record }); }
    if (api.endsWith("/deal-budget/preview")) {
      const financed = (body.rows as Json[] | undefined)?.some(row => row.enabled && row.settlement === "financed");
      const amount = financed ? 235000 : Number((body.loan as Json | undefined)?.amount ?? record.new_loan_amount);
      const preview = { ...marketplaceBudget(amount, budget.revision), ...body };
      return json({ ...preview, calculation: { ...marketplaceBudget(amount, budget.revision).calculation,
        ...(financed ? { principal_solution: { status: "calculated", gross_loan_amount: amount, requires_apply: true } } : {}) } });
    }
    if (api.endsWith("/deal-budget")) {
      if (method === "PATCH" || method === "PUT") { await budgetGate; if (options.failBudget && !failed) { failed = true; return json({ detail: "Synthetic budget save failed; retained costs" }, 503); } budget = { ...budget, ...body, revision: budget.revision + 1 }; }
      else { budgetReads += 1; if (options.staleBudget && budgetReads > 1) budget = { ...budget, revision: 2 }; }
      return json(budget);
    }
    if (api.endsWith("/deal-budget/apply-principal")) {
      await budgetGate;
      if (options.failBudget && !failed) { failed = true; return json({ detail: "Synthetic budget save failed; retained costs" }, 503); }
      const submitted = body.financial_plan as Json | undefined;
      record = { ...record, ...submitted, new_loan_amount: 235000, updated_at: "2026-11-10T17:00:03Z" };
      budget = { ...budget, ...body, revision: budget.revision + 1, financing_context: { current_loan_amount: 235000, plan_updated_at: record.updated_at, terms_ref: null }, calculation: marketplaceBudget(235000).calculation };
      return json({ ...budget, financial_plan: { profile_id: PROFILE, record } });
    }
    if (api.endsWith("/collateral")) return json({ profile_id: PROFILE, enabled: false, revision: 1, can_edit: true, properties: [], assets: [], property_options: [], source_file_options: [] });
    if (api.endsWith("/client-terms")) return json({ profile_id: PROFILE, version: 0, status: "not_started", conditions: [], loan_type_options: [], calculation: {} });
    if (api.endsWith("/marketplace-publication")) return json({ profile_id: PROFILE, listing: listing ? { id: listing.id, ref: listing.ref, name: listing.name, status: listing.status, published_at: null } : null, can_manage: true });
    if (api.endsWith("/sources/lookup")) return json({ listing: listing ? { id: listing.id, ref: listing.ref, status: listing.status } : null });
    if (api.endsWith("/sources/suggest-terms")) return json({ profile_id: PROFILE, income_annual: 180000, existing_debt_service_monthly: 2000, products: [marketplaceProduct(record.new_loan_amount)] });
    if (api.endsWith("/listings/ai-draft")) return json({ profile_id: PROFILE, draft_id: "synthetic-ai-draft", source_fingerprint: `source-${record.updated_at}`, deal_budget_revision: budget.revision, draft: { name: body.current_title || "Example Studio financing", summary: body.current_summary || "Synthetic reviewed listing description", vertical: "main_street" }, field_provenance: [], missing: options.missing ?? [], warnings: [], preserved_fields: ["name", "summary"] });
    if (api.endsWith("/listings/prefill")) { await prefillGate; return json({ profile_id: PROFILE, source_kind: "profile", name: "Example Studio financing", vertical: "main_street", summary: "Synthetic reviewed listing description", products: [marketplaceProduct(record.new_loan_amount)], existing_listing: listing }); }
    if (api.endsWith("/refresh-snapshot")) { await refreshGate; if (options.failRefresh && !failed) { failed = true; return json({ detail: "Synthetic snapshot refresh failed" }, 503); } if (listing) listing = { ...listing, offered_amount: record.new_loan_amount, products: [marketplaceProduct(record.new_loan_amount)] }; return json(listing); }
    if (api.endsWith("/listings") && method === "POST") {
      if (options.failCreate && !failed) { failed = true; return json({ detail: "Synthetic create response unavailable" }, 503); }
      if (!listing) { created += 1; listing = { ...marketplaceListing(record.new_loan_amount), ...body } as ReturnType<typeof marketplaceListing>; }
      if (options.lostCreateResponse && !failed) { failed = true; return json({ detail: "Synthetic response lost after creating draft" }, 503); }
      return json(listing);
    }
    if (api.endsWith("/listings/synthetic-listing")) { if (method === "PATCH" && listing) listing = { ...listing, ...body } as ReturnType<typeof marketplaceListing>; return json(listing); }
    return json({});
  });
  await page.goto(`${ORIGIN}/?${options.noPackage ? "no-package" : options.stalePackage ? "stale-package" : ""}`);
  await expect(page.getByRole("heading", { name: "Financial cockpit", exact: true })).toBeVisible();
  return { requests, errors, releasePlan, releaseBudget, releasePrefill, releaseRefresh, state: () => ({ record, budget, listing, created }) };
}

async function dirtyPlan(page: Page, amount = 225000) {
  await page.getByRole("button", { name: "Review actual coverage plan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Advanced financial review — Example Studio LLC", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("New loan amount", { exact: true }).fill(String(amount));
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#fc-marketplace")).toContainText(amount.toLocaleString("en-US"));
}

const primaryAction = (page: Page) => page.getByRole("button", { name: /Save & (create listing draft|refresh listing from file)/ });
const listingWrites = (f: Awaited<ReturnType<typeof fixture>>) => f.requests.filter(row => row.method !== "GET" && /\/listings(?:\/synthetic-listing(?:\/refresh-snapshot)?)?$/.test(row.path));
const planWrites = (f: Awaited<ReturnType<typeof fixture>>) => f.requests.filter(row => row.path.endsWith("/financial-plan") && row.method === "PUT");
const atomicWrites = (f: Awaited<ReturnType<typeof fixture>>) => f.requests.filter(row => row.path.endsWith("/deal-budget/apply-principal"));

async function editListingText(page: Page) {
  const panel = page.locator("#fc-marketplace");
  await panel.getByLabel("Deal title", { exact: true }).fill("Reviewed operator title");
  await panel.getByLabel("Listing summary", { exact: true }).fill("Reviewed operator summary that must survive file refresh.");
}

async function dirtyFinancedCost(page: Page) {
  await page.locator("#fc-marketplace").getByRole("button", { name: "Edit deal budget", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Deal budget editor", exact: true });
  await dialog.getByRole("button", { name: "Add cost", exact: true }).click();
  await dialog.getByLabel("Cost 1 label", { exact: true }).fill("Synthetic closing service");
  await dialog.getByLabel("Cost 1 value", { exact: true }).fill("10000");
  await dialog.getByLabel("Cost 1 collection", { exact: true }).selectOption("financed");
  await expect(dialog.getByRole("button", { name: "Save budget & loan", exact: true })).toBeEnabled();
  await dialog.locator(".drawer-f").getByRole("button", { name: "Close", exact: true }).click();
}

test("same-panel action saves real coverage edits then creates a draft without a package", async ({ page }, testInfo) => {
  const f = await fixture(page, { noPackage: true });
  await dirtyPlan(page); await editListingText(page);
  await expect(primaryAction(page)).toBeEnabled(); await primaryAction(page).click();
  await expect.poll(() => f.state().created).toBe(1);
  await expect(primaryAction(page)).toHaveText("Save & refresh listing from file");
  await expect(page.locator("#fc-marketplace")).toContainText("Offer draft · not published");
  expect(planWrites(f)).toHaveLength(1); expect(f.state().record.new_loan_amount).toBe(225000);
  const create = f.requests.find(row => row.method === "POST" && row.path.endsWith("/listings"));
  expect(create?.body.name).toBe("Reviewed operator title"); expect(create?.body.summary).toBe("Reviewed operator summary that must survive file refresh.");
  expect((create?.body.products as Json[])[0].amount).toBe(225000);
  expect(f.state().listing?.status).toBe("draft"); expect(f.state().listing?.name).toBe("Reviewed operator title");
  expect(f.requests.findIndex(row => row.path.endsWith("/financial-plan"))).toBeLessThan(f.requests.findIndex(row => row.path.endsWith("/listings") && row.method === "POST"));
  await primaryAction(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve(process.cwd(), "../../artifacts/marketplace-panel-qa", testInfo.project.name, "saved-draft.png") });
  expect(f.errors).toEqual([]);
});

test("held plan save blocks edits and duplicate creation until acknowledged", async ({ page }) => {
  const f = await fixture(page, { holdPlan: true });
  await dirtyPlan(page); await editListingText(page); await primaryAction(page).click();
  await expect.poll(() => planWrites(f).length).toBe(1);
  expect(listingWrites(f)).toHaveLength(0); await expect(page.getByLabel("Deal title", { exact: true })).toBeDisabled();
  await page.keyboard.press("Enter"); expect(listingWrites(f)).toHaveLength(0);
  f.releasePlan(); await expect.poll(() => f.state().created).toBe(1);
  expect(planWrites(f)).toHaveLength(1); expect(f.state().listing?.products[0].amount).toBe(225000); expect(f.errors).toEqual([]);
});

test("failed shared plan save retains edits and retries before any listing write", async ({ page }) => {
  const f = await fixture(page, { failPlan: true }); await dirtyPlan(page); await editListingText(page); await primaryAction(page).click();
  await expect(page.locator("#fc-marketplace")).toContainText("Synthetic plan save failed"); expect(listingWrites(f)).toHaveLength(0);
  await expect(page.getByLabel("Deal title", { exact: true })).toHaveValue("Reviewed operator title");
  await expect(page.locator("#fc-marketplace")).toContainText("225,000");
  await primaryAction(page).click(); await expect.poll(() => f.state().created).toBe(1);
  expect(planWrites(f)).toHaveLength(2); expect(f.state().listing?.products[0].amount).toBe(225000); expect(f.errors).toEqual([]);
});

test("closed financed-cost drawer is atomically saved before draft creation", async ({ page }) => {
  const f = await fixture(page, { holdBudget: true }); await dirtyPlan(page); await dirtyFinancedCost(page); await editListingText(page);
  await primaryAction(page).click(); await expect.poll(() => atomicWrites(f).length).toBe(1);
  expect(listingWrites(f)).toHaveLength(0); expect(planWrites(f)).toHaveLength(0);
  await expect(page.getByLabel("Listing summary", { exact: true })).toBeDisabled();
  f.releaseBudget(); await expect.poll(() => f.state().created).toBe(1);
  expect(atomicWrites(f)).toHaveLength(1); expect(planWrites(f)).toHaveLength(0);
  expect(f.state().record.new_loan_amount).toBe(235000); expect(f.state().budget.revision).toBe(2);
  const create = f.requests.find(row => row.method === "POST" && row.path.endsWith("/listings"));
  expect((create?.body.products as Json[])[0].amount).toBe(235000); expect(create?.body.expected_deal_budget_revision).toBe(2);
  expect(f.errors).toEqual([]);
});

test("failed atomic cost save retains the closed draft for an explicit retry", async ({ page }) => {
  const f = await fixture(page, { failBudget: true }); await dirtyPlan(page); await dirtyFinancedCost(page); await primaryAction(page).click();
  await expect(page.locator("#fc-marketplace")).toContainText("Synthetic budget save failed"); expect(listingWrites(f)).toHaveLength(0);
  await primaryAction(page).click(); await expect.poll(() => f.state().created).toBe(1);
  expect(atomicWrites(f)).toHaveLength(2); expect(planWrites(f)).toHaveLength(0); expect(f.state().listing?.products[0].amount).toBe(235000); expect(f.errors).toEqual([]);
});

test("a newer cost edit in the real coverage editor survives an older save acknowledgment", async ({ page }) => {
  const f = await fixture(page, { holdBudget: true }); await dirtyPlan(page); await dirtyFinancedCost(page); await primaryAction(page).click();
  await expect.poll(() => atomicWrites(f).length).toBe(1);
  await page.getByRole("button", { name: "Review actual coverage plan", exact: true }).click();
  const coverage = page.getByRole("dialog", { name: "Advanced financial review — Example Studio LLC", exact: true });
  await coverage.getByRole("button", { name: "Edit deal budget", exact: true }).click();
  const costs = page.getByRole("dialog", { name: "Deal budget editor", exact: true });
  await costs.getByLabel("Cost 1 value", { exact: true }).fill("11000");
  await costs.locator(".drawer-f").getByRole("button", { name: "Close", exact: true }).click();
  await coverage.getByRole("button", { name: "Close", exact: true }).click();
  f.releaseBudget();
  await expect(page.locator("#fc-marketplace")).toContainText(/newer.*cost|cost.*newer/i);
  expect(atomicWrites(f)).toHaveLength(1); expect(listingWrites(f)).toHaveLength(0); expect(planWrites(f)).toHaveLength(0);
  await page.locator("#fc-marketplace").getByRole("button", { name: "Edit deal budget", exact: true }).click();
  await expect(costs.getByLabel("Cost 1 value", { exact: true })).toHaveValue("11000");
  expect(f.errors).toEqual([]);
});

test("changing files during a held financial save cannot create either listing", async ({ page }) => {
  const f = await fixture(page, { holdPlan: true }); await dirtyPlan(page); await primaryAction(page).click();
  await expect.poll(() => planWrites(f).length).toBe(1);
  await page.getByRole("button", { name: "Another synthetic file", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Financial cockpit", exact: true })).toBeVisible();
  f.releasePlan(); await expect.poll(() => f.state().record.new_loan_amount).toBe(225000);
  await expect(primaryAction(page)).toBeEnabled();
  expect(listingWrites(f)).toHaveLength(0); expect(f.state().created).toBe(0); expect(f.errors).toEqual([]);
});

test("an existing draft refreshes saved file data without local listing edits", async ({ page }, testInfo) => {
  const f = await fixture(page, { existing: true, stalePackage: true });
  await expect(primaryAction(page)).toBeEnabled(); await primaryAction(page).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/refresh-snapshot")).length).toBe(1);
  expect(f.state().created).toBe(0); expect(f.state().listing?.name).toBe("Operator title"); expect(f.state().listing?.summary).toBe("Operator summary retained");
  await expect(page.getByLabel("Deal title", { exact: true })).toHaveValue("Operator title");
  await expect(page.locator("#fc-marketplace")).toContainText("Offer draft · not published");
  await primaryAction(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.resolve(process.cwd(), "../../artifacts/marketplace-panel-qa", testInfo.project.name, "refreshed-existing.png") });
  expect(f.errors).toEqual([]);
});

test("existing listing saves shared financing and preserves manual text through refresh", async ({ page }) => {
  const f = await fixture(page, { existing: true }); await dirtyPlan(page); await editListingText(page); await primaryAction(page).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/refresh-snapshot")).length).toBe(1);
  expect(f.state().created).toBe(0); expect(f.state().listing?.products[0].amount).toBe(225000);
  expect(f.state().listing?.name).toBe("Reviewed operator title"); expect(f.state().listing?.summary).toBe("Reviewed operator summary that must survive file refresh.");
  expect(f.errors).toEqual([]);
});

test("create failure retries the draft intent without discarding manual text", async ({ page }) => {
  const f = await fixture(page, { failCreate: true }); await editListingText(page); await primaryAction(page).click();
  await expect(page.locator("#fc-marketplace")).toContainText("Synthetic create response unavailable");
  await expect(page.getByLabel("Deal title", { exact: true })).toHaveValue("Reviewed operator title");
  await primaryAction(page).click(); await expect.poll(() => f.state().created).toBe(1);
  expect(f.state().listing?.name).toBe("Reviewed operator title"); expect(f.errors).toEqual([]);
});

test("a lost create response recovers the one existing draft instead of duplicating it", async ({ page }) => {
  const f = await fixture(page, { lostCreateResponse: true }); await editListingText(page); await primaryAction(page).click();
  await expect(page.locator("#fc-marketplace")).toContainText("Synthetic response lost after creating draft");
  await primaryAction(page).click(); await expect.poll(() => f.requests.filter(row => row.path.endsWith("/refresh-snapshot")).length).toBe(1);
  expect(f.state().created).toBe(1); expect(f.state().listing?.name).toBe("Reviewed operator title"); expect(f.errors).toEqual([]);
});

test("post-create refresh failure retries the saved listing without creating another", async ({ page }) => {
  const f = await fixture(page, { failRefresh: true }); await editListingText(page); await primaryAction(page).click();
  await expect(page.locator("#fc-marketplace")).toContainText("Synthetic snapshot refresh failed");
  await expect(primaryAction(page)).toHaveAccessibleName("Save & refresh listing from file");
  expect(f.state().created).toBe(1); await primaryAction(page).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/refresh-snapshot")).length).toBe(2);
  expect(f.requests.filter(row => row.path.endsWith("/listings") && row.method === "POST")).toHaveLength(1);
  expect(f.state().listing?.name).toBe("Reviewed operator title"); expect(f.errors).toEqual([]);
});

test("cost edits made while file prefill is pending are retained and halt listing writes", async ({ page }) => {
  const f = await fixture(page, { holdPrefill: true }); await dirtyPlan(page); await primaryAction(page).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/listings/prefill")).length).toBe(1);
  await page.locator("#fc-marketplace").getByRole("button", { name: "Edit deal budget", exact: true }).click();
  const costs = page.getByRole("dialog", { name: "Deal budget editor", exact: true });
  await costs.getByLabel("Budget explanation", { exact: true }).fill("Newer retained cost review");
  await costs.locator(".drawer-f").getByRole("button", { name: "Close", exact: true }).click();
  f.releasePrefill(); await expect(page.locator("#fc-marketplace")).toContainText("Newer cost changes remain unsaved");
  expect(listingWrites(f)).toHaveLength(0); expect(f.state().created).toBe(0);
  await page.locator("#fc-marketplace").getByRole("button", { name: "Edit deal budget", exact: true }).click();
  await expect(costs.getByLabel("Budget explanation", { exact: true })).toHaveValue("Newer retained cost review");
  expect(f.errors).toEqual([]);
});

test("late coverage edits survive the final snapshot response and require another save", async ({ page }) => {
  const f = await fixture(page, { holdRefresh: true }); await dirtyPlan(page); await primaryAction(page).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/refresh-snapshot")).length).toBe(1);
  await expect(primaryAction(page)).toHaveAccessibleName("Save & refresh listing from file");
  await dirtyPlan(page, 245000); f.releaseRefresh();
  await expect(primaryAction(page)).toBeEnabled();
  await expect(page.locator("#fc-marketplace")).toContainText("Listing CP-SYNTHETIC was saved; its file-data snapshot refresh still needs retry.");
  await expect(page.locator("#fc-marketplace")).toContainText("Newer financing edits remain unsaved");
  await expect(page.locator("#fc-marketplace")).not.toContainText("refreshed from the saved file. Your reviewed title");
  expect(f.state().created).toBe(1); expect(f.state().record.new_loan_amount).toBe(225000);
  await expect(page.locator("#fc-marketplace")).toContainText("245,000"); expect(planWrites(f)).toHaveLength(1); expect(f.errors).toEqual([]);
});

test("stale budget revision blocks writes until the retained plan is reviewed and retried", async ({ page }) => {
  const f = await fixture(page, { staleBudget: true }); await dirtyPlan(page); await editListingText(page); await primaryAction(page).click();
  await expect(page.locator("#fc-marketplace")).toContainText(/budget changed|budget.*another session/i);
  expect(listingWrites(f)).toHaveLength(0); expect(planWrites(f)).toHaveLength(0);
  await expect(page.getByLabel("Deal title", { exact: true })).toHaveValue("Reviewed operator title");
  await primaryAction(page).click(); await expect.poll(() => f.state().created).toBe(1); expect(f.errors).toEqual([]);
});

test("missing publish requirements remain actionable while saving a draft is allowed", async ({ page }) => {
  const f = await fixture(page, { noPackage: true, missing: ["Attach the PPM before publishing"] });
  const panel = page.locator("#fc-marketplace"); await panel.scrollIntoViewIfNeeded();
  await panel.getByRole("button", { name: /Draft new listing text|Regenerate text draft/ }).click();
  await expect(panel).toContainText("Attach the PPM before publishing");
  await panel.getByRole("button", { name: "Package readiness", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { fixtureNavigation: string }).fixtureNavigation)).toBe("package");
  await expect(primaryAction(page)).toBeEnabled(); expect(listingWrites(f)).toHaveLength(0); expect(f.errors).toEqual([]);
});
