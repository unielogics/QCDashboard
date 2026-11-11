import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OTHER_PPM_LISTING_ID, PPM_LISTING_ID as ID, ppmListing, ppmState, ppmVersion, ppmLegalFields, completeLegal } from "./fixtures/marketplacePpm";
import { fileCatalog } from "./fixtures/investorDocumentCockpit";
import { guidanceBudget } from "./fixtures/marketplaceErrorGuidance";
import { savedTermsTransportPdf } from "./fixtures/savedTermsDownload";
import type { MarketplacePpm } from "../src/lib/marketplacePpm";

const ORIGIN = "https://ppm-workspace.test";
let script: Buffer, css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketplace-ppm-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useCurrentUser" ? "export const useCurrentUser=()=>({data:{id:'synthetic-staff',role:'super_admin'},isLoading:false,authReady:true,authScope:'synthetic-staff:session'});" : `export const ${name}=()=>({});`).join("\n")}`,
    "next/navigation": `import{useSyncExternalStore}from'react';let current='${ID}';const listeners=new Set();window.switchListing=id=>{current=id;listeners.forEach(fn=>fn())};const router={push:url=>window.fixtureNavigation=url};export const useParams=()=>({id:useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>current,()=>current)});export const useRouter=()=>router;const search=new URLSearchParams(location.search);export const useSearchParams=()=>search;export const usePathname=()=>'/admin/marketplace/'+current;`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,userId:'synthetic-staff',sessionId:'session',getToken:async()=> 'synthetic-staff'});export const visualQaUser=()=>null;",
    "next/dynamic": "import React,{lazy,Suspense}from'react';export default(loader,options={})=>{const Component=lazy(async()=>{const value=await loader();return typeof value==='function'?{default:value}:value});return props=><Suspense fallback={options.loading?React.createElement(options.loading):null}><Component {...props}/></Suspense>};",
  };
  mocks["./useApi"] = mocks["@/hooks/useApi"];
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Page from'@/app/admin/marketplace/[id]/page';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.refreshListing=()=>client.invalidateQueries({queryKey:['cp-listing']});window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff','Content-Type':'application/json'}});const body=await response.json();if(!response.ok){const error=new Error(typeof body.detail==='string'?body.detail:body.detail?.message||'Synthetic request failed');error.status=response.status;error.body=body;throw error}return body};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><ConfirmationProvider><Page/></ConfirmationProvider></main></QueryClientProvider>);` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: ORIGIN }) }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path === "./useApi" ? "@/hooks/useApi" : args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
  const config = require("tailwindcss/loadConfig")(path.join(root, "tailwind.config.ts"));
  css = Buffer.from((await require("postcss")([require("tailwindcss")({ ...config, content: [path.join(root, "src/**/*.{ts,tsx}")] })]).process(css.toString(), { from: path.join(directory, "app.css") })).css);
});

// The lifecycle cases below exercise the real page and PPM workspace. Only
// authentication and HTTP/storage responses are replaced with synthetic data.
type Json = Record<string, unknown>;
async function fixture(page: Page, options: { ready?: boolean; approved?: boolean; failure?: "generate" | "draft"; hold?: "generate" | "draft"; closed?: boolean; legacy?: boolean; failReadinessAfterReview?: boolean } = {}) {
  let listing = ppmListing(), failed = false, amount = 175000;
  let reviewSaved = false, readinessFailed = false;
  const other = ppmListing(true);
  if (options.closed) listing = { ...listing, status: "repaid" };
  let initial = options.ready ? ppmVersion(1, undefined, completeLegal()) : null;
  if (options.approved && initial) initial = { ...initial, status: "approved", reviewed_at: "2026-11-11T14:30:00Z" };
  if (options.legacy) {
    initial = { ...ppmVersion(3, "", {}), source: "uploaded", status: "approved" };
    listing = { ...listing, publish_blockers: [], publish_issues: [], documents: [{ id: initial.document_id, kind: "ppm", kind_label: "Private placement memorandum", name: "Synthetic existing uploaded PPM.pdf", content_type: "application/pdf", size_bytes: 688, version: 3, status: "ready", source: "uploaded" }] };
  }
  const initialState = ppmState(initial);
  if (options.legacy) { initialState.managed = false; initialState.auto_refresh = false; initialState.source_fingerprint = "a".repeat(64); initialState.generation_status = "not_generated"; }
  const states = new Map<string, MarketplacePpm>([[ID, initialState], [OTHER_PPM_LISTING_ID, ppmState()]]);
  const appliedKeys = new Set<string>();
  const requests: Array<{ method: string; path: string; body: Json }> = [], errors: string[] = [];
  let release = () => {}; const gate = options.hold ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve();
  let releaseUrl = () => {}; let urlGate = Promise.resolve();
  page.on("pageerror", error => errors.push(error.message));
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === "https://ppm-document.test") return route.fulfill({ contentType: "application/pdf", headers: { "Content-Disposition": `attachment; filename="Synthetic-PPM-v${url.searchParams.get("version")}.pdf"` }, body: savedTermsTransportPdf(Number(url.searchParams.get("version"))) });
    if (url.origin !== ORIGIN) throw new Error(`Unexpected external PPM traffic: ${url.origin}`);
    if (!url.pathname.startsWith("/api/v1/")) return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    const p = url.pathname.slice(7), body = request.postData() ? request.postDataJSON() as Json : {};
    requests.push({ method, path: p + url.search, body }); expect(request.headers().authorization).toBe("Bearer synthetic-staff");
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (p === `/capital/admin/listings/${ID}` || p === `/capital/admin/listings/${OTHER_PPM_LISTING_ID}`) {
      if (options.failReadinessAfterReview && reviewSaved && !readinessFailed) { readinessFailed = true; return json({ detail: "Synthetic listing readiness read failed after PPM review was saved" }, 503); }
      return json(p.endsWith(ID) ? listing : other);
    }
    const match = p.match(/\/capital\/admin\/listings\/([^/]+)\/ppm(?:\/(.*))?$/);
    if (match) {
      const [, id, action] = match, state = states.get(id)!;
      if (!action) { expect(method).toBe("GET"); return json(state); }
      if (action.startsWith("versions/")) { expect(method).toBe("POST"); await urlGate; const version = state.history.find(row => row.document_id === action.split("/")[1]); expect(version).toBeTruthy(); return json({ url: `https://ppm-document.test/download.pdf?version=${version!.version}`, expires_in_seconds: 60 }); }
      expect(method).toBe(action === "draft" ? "PATCH" : "POST");
      if (options.hold === action) await gate;
      if (options.failure === action && !failed) { failed = true; return json({ detail: { code: "synthetic_unavailable", message: "Synthetic PPM operation failed; no version was saved" } }, 503); }
      const requestKey = `${id}:${action}:${body.idempotency_key}`;
      if (appliedKeys.has(requestKey)) return json(state);
      if (body.expected_source_fingerprint !== state.source_fingerprint) return json({ detail: { code: "ppm_source_changed", message: "The saved source changed; reload current PPM facts" } }, 409);
      const editable = state.current_draft ?? state.current_approved;
      if (action !== "generate" && body.expected_version !== editable?.version) return json({ detail: { code: "ppm_version_changed", message: "A newer PPM version exists" } }, 409);
      const number = Math.max(0, ...state.history.map(row => row.version)) + 1;
      const legal = action === "draft" ? body.legal_inputs as Record<string, string> : { issuer_legal_name: "Example Lending LLC", ...editable?.legal_inputs };
      const next = ppmVersion(number, state.source_fingerprint, legal, action === "draft" ? body.narrative_sections as Record<string, string> : editable?.narrative_sections, amount);
      if (action === "generate" && !state.managed && editable?.source === "uploaded") editable.stale = true;
      if (action === "review") { expect(body.confirmed).toBe(true); expect(body.decision).toBe("approve"); next.status = "approved"; next.reviewed_at = "2026-11-11T15:00:00Z"; listing = { ...listing, publish_blockers: [], publish_issues: [] }; reviewSaved = true; }
      const updated = ppmState(next, state.history); states.set(id, updated); appliedKeys.add(requestKey); return json(updated);
    }
    if (p.endsWith("/file-documents")) return json(fileCatalog(true));
    if (p.endsWith("/deal-budget") || p.endsWith("/deal-budget/preview")) return json(guidanceBudget());
    throw new Error(`Unexpected PPM fixture request: ${method} ${p}`);
  });
  await page.goto(ORIGIN); await expect(page.getByRole("heading", { name: /CP-PPM-QA/ })).toBeVisible();
  return { requests, errors, states, release, holdUrl: () => { urlGate = new Promise<void>(resolve => { releaseUrl = resolve; }); }, releaseUrl: () => releaseUrl(),
    changeSource: async () => { const current = states.get(ID)!; current.source_fingerprint = "b".repeat(64); current.status = "stale"; for (const version of current.history) version.stale = true; if (current.current_draft) current.current_draft.legal_inputs.jurisdiction = "Remote confirmed jurisdiction update"; amount = 225000; listing = { ...listing, updated_at: "2026-11-11T16:00:00Z", loan_amount: "225000" }; await page.evaluate(() => (window as unknown as { refreshListing: () => Promise<void> }).refreshListing()); },
  };
}

const workspace = (page: Page) => page.getByRole("region", { name: "PPM draft and review", exact: true });
const docs = (page: Page) => page.getByRole("tab", { name: /^Documents/ });
const terms = (page: Page) => page.getByRole("tab", { name: "Terms and narrative", exact: true });
const ppmCalls = (f: Awaited<ReturnType<typeof fixture>>, action: string) => f.requests.filter(row => row.path.endsWith(`/ppm/${action}`));
async function openPpm(page: Page, editing = true) { await docs(page).click(); await expect(workspace(page).getByText("Saved draft v1", { exact: true })).toBeVisible(); if (editing) await backToEdits(page); }
async function backToEdits(page: Page) { await workspace(page).getByRole("button", { name: "Back to edits", exact: true }).click(); }
async function completeAndSave(page: Page) { const area = workspace(page); if (await area.getByRole("region", { name: "Review saved PPM", exact: true }).isVisible()) await backToEdits(page); for (const field of ppmLegalFields) await area.getByLabel(`PPM ${field.label}`, { exact: true }).fill(`Synthetic staff confirmation: ${field.label}`); await area.getByRole("button", { name: "Save and review", exact: true }).click(); await expect(area.getByText("Saved draft v2", { exact: true })).toBeVisible(); }
async function approve(page: Page) { const area = workspace(page); if (await area.getByRole("region", { name: "Edit PPM draft", exact: true }).isVisible()) await area.getByRole("button", { name: "Review saved PPM", exact: true }).first().click(); await area.getByRole("button", { name: "Approve current PPM", exact: true }).click(); await expect(area.getByText("Reviewed version v3", { exact: true })).toBeVisible(); }

test("first Documents visit creates one draft from saved facts without publishing", async ({ page }, info) => {
  const f = await fixture(page); expect(f.requests.some(row => row.path.includes("/ppm"))).toBe(false);
  await openPpm(page, false); const area = workspace(page);
  await expect(area.getByRole("button", { name: "Approve current PPM" })).toBeDisabled();
  await area.getByText("Saved PPM preview · v1", { exact: true }).click(); await expect(area).toContainText("175,000.00 USD"); await expect(area).toContainText("2027-01-15");
  expect(ppmCalls(f, "generate")).toHaveLength(1); expect(ppmCalls(f, "review")).toEqual([]); expect(f.requests.some(row => row.path.endsWith("/publish"))).toBe(false);
  await expect(page.getByRole("heading", { name: /CP-PPM-QA/ })).toBeVisible();
  const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })); expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  await area.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("ppm-draft.png"), fullPage: false }); await area.evaluate(node => node.scrollIntoView({ block: "start" })); await page.screenshot({ path: info.outputPath("ppm-draft-overview.png"), fullPage: false }); expect(f.errors).toEqual([]);
});

test("missing legal facts focus their exact input and dirty edits survive listing tabs", async ({ page }) => {
  const f = await fixture(page); await openPpm(page); const area = workspace(page), label = "PPM Offering exemption and restrictions";
  await area.getByRole("button", { name: "Complete Offering exemption and restrictions", exact: true }).click(); const input = area.getByLabel(label, { exact: true }); await expect(input).toBeFocused(); await expect(input).toBeInViewport();
  await input.pressSequentially("Synthetic confirmed offering restrictions"); const original = await input.elementHandle(); expect(await original!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true);
  await terms(page).click(); await page.getByLabel("Valuation source", { exact: true }).pressSequentially(" with unsaved staff detail"); await docs(page).click(); await expect(input).toHaveValue("Synthetic confirmed offering restrictions"); await original?.dispose();
  expect(ppmCalls(f, "generate")).toHaveLength(1); expect(ppmCalls(f, "draft")).toEqual([]); expect(f.errors).toEqual([]);
});

test("only explicit current review approves a saved version and publication stays separate", async ({ page }, info) => {
  const f = await fixture(page); await openPpm(page); await completeAndSave(page); const area = workspace(page);
  await expect(area.getByRole("button", { name: "Approve current PPM" })).toBeEnabled(); await approve(page);
  expect(ppmCalls(f, "review")).toHaveLength(1); expect(ppmCalls(f, "review")[0].body).toMatchObject({ expected_version: 2, expected_source_fingerprint: "a".repeat(64), confirmed: true });
  expect(ppmCalls(f, "generate")).toHaveLength(1); expect(f.requests.some(row => row.path.endsWith("/publish"))).toBe(false);
  await area.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("ppm-reviewed.png"), fullPage: false }); await area.evaluate(node => node.scrollIntoView({ block: "start" })); await page.screenshot({ path: info.outputPath("ppm-reviewed-overview.png"), fullPage: false }); expect(f.errors).toEqual([]);
});

test("saved source refresh keeps unsaved wording and requires deliberate merge into latest facts", async ({ page }) => {
  const f = await fixture(page); await openPpm(page); const area = workspace(page); await area.getByText("Edit PPM wording", { exact: true }).click(); const input = area.getByLabel("PPM wording: Business and offering overview", { exact: true });
  await input.fill("Unsaved staff wording retained across source refresh."); await f.changeSource(); await expect(area.getByText("Saved draft v2", { exact: true })).toBeVisible(); await expect(input).toHaveValue("Unsaved staff wording retained across source refresh.");
  await expect(area.getByText("Saved facts or another PPM version changed.", { exact: true })).toBeVisible(); await expect(area.getByRole("button", { name: "Save and review", exact: true })).toBeDisabled();
  await area.getByRole("button", { name: "Apply my edits to latest facts", exact: true }).click(); await expect(area.getByText("Saved draft v3", { exact: true })).toBeVisible();
  expect(ppmCalls(f, "draft")[0].body).toMatchObject({ expected_version: 2, expected_source_fingerprint: "b".repeat(64), narrative_sections: { overview: "Unsaved staff wording retained across source refresh." } });
  await backToEdits(page); await expect(area.getByLabel("PPM Governing law and offering jurisdictions", { exact: true })).toHaveValue("Remote confirmed jurisdiction update"); await expect(area.getByRole("button", { name: "Save and review", exact: true })).toBeDisabled();
  await area.getByRole("button", { name: "Review saved PPM", exact: true }).first().click(); await area.getByText("Saved PPM preview · v3", { exact: true }).click(); await expect(area).toContainText("225,000.00 USD"); expect(ppmCalls(f, "review")).toEqual([]); expect(f.errors).toEqual([]);
});

test("each deliberate successful regeneration creates a new intent while retries keep their old key", async ({ page }) => {
  const f = await fixture(page); await openPpm(page); const area = workspace(page);
  await area.getByRole("button", { name: "Regenerate AI wording", exact: true }).click(); await expect(area.getByText("Saved draft v2", { exact: true })).toBeVisible();
  await area.getByRole("button", { name: "Regenerate AI wording", exact: true }).click(); await expect(area.getByText("Saved draft v3", { exact: true })).toBeVisible();
  const calls = ppmCalls(f, "generate"); expect(calls).toHaveLength(3); expect(new Set(calls.map(row => row.body.idempotency_key)).size).toBe(3); expect(calls.slice(1).every(row => row.body.force === true)).toBe(true); expect(f.errors).toEqual([]);
});

test("failed automatic generation retries the identical intent without duplicate versions", async ({ page }) => {
  const f = await fixture(page, { failure: "generate" }); await docs(page).click(); const area = workspace(page); await expect(area.getByRole("alert")).toContainText("no version was saved"); await area.getByRole("button", { name: "Retry previous generation" }).click(); await expect(area.getByText("Saved draft v1", { exact: true })).toBeVisible();
  const calls = ppmCalls(f, "generate"); expect(calls).toHaveLength(2); expect(calls[1].body).toEqual(calls[0].body); expect(f.states.get(ID)!.history).toHaveLength(1); expect(f.errors).toEqual([]);
});

test("failed draft save retains legal text and retries the same request", async ({ page }) => {
  const f = await fixture(page, { failure: "draft" }); await openPpm(page); const area = workspace(page), input = area.getByLabel("PPM Governing law and offering jurisdictions", { exact: true }); await input.fill("Retained synthetic jurisdiction text"); await area.getByRole("button", { name: "Save and review", exact: true }).click(); await expect(area.getByRole("alert")).toContainText("no version was saved"); await expect(input).toHaveValue("Retained synthetic jurisdiction text"); await area.getByRole("button", { name: "Retry previous save" }).click(); await expect(area.getByText("Saved draft v2", { exact: true })).toBeVisible(); const calls = ppmCalls(f, "draft"); expect(calls).toHaveLength(2); expect(calls[1].body).toEqual(calls[0].body); expect(f.errors).toEqual([]);
});

test("saved draft and approved history download their bound PDF versions through protected tabs", async ({ page }) => {
  const f = await fixture(page); await openPpm(page); const area = workspace(page);
  async function download(button: ReturnType<Page["getByRole"]>, version: number) {
    f.holdUrl(); const created = page.waitForEvent("popup"); await button.click(); const popup = await created; await expect.poll(() => popup.evaluate(() => window.opener === null)).toBe(true); const ready = popup.waitForEvent("download"); f.releaseUrl(); const file = await ready; expect(file.suggestedFilename()).toBe(`Synthetic-PPM-v${version}.pdf`); const stream = await file.createReadStream(), chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk)); expect(Buffer.concat(chunks)).toEqual(savedTermsTransportPdf(version)); await popup.close();
  }
  await download(area.getByRole("button", { name: "Download saved draft v1", exact: true }), 1); await completeAndSave(page); await approve(page); await download(area.getByRole("button", { name: "Download reviewed PPM v3", exact: true }), 3); await area.getByText("PPM version history · 3", { exact: true }).click(); await download(area.getByRole("button", { name: "Download PPM v1", exact: true }), 1);
  expect(f.requests.filter(row => row.path.includes("/ppm/versions/")).map(row => row.path.split("/versions/")[1])).toEqual(["synthetic-ppm-v1/url?download=true", "synthetic-ppm-v3/url?download=true", "synthetic-ppm-v1/url?download=true"]); expect(f.errors).toEqual([]);
});

test("PPM edits are scoped to their listing and closed offerings have no write actions", async ({ page }) => {
  const f = await fixture(page); await openPpm(page); await workspace(page).getByLabel("PPM Issuer legal name", { exact: true }).fill("Unsaved first-listing issuer"); await page.evaluate(id => (window as unknown as { switchListing: (id: string) => void }).switchListing(id), OTHER_PPM_LISTING_ID); await expect(page.getByRole("heading", { name: /CP-PPM-OTHER-QA/ })).toBeVisible(); await docs(page).click(); await backToEdits(page); await expect(workspace(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("Example Lending LLC"); expect(f.errors).toEqual([]);
});

test("closed offering PPM remains readable without automatic generation or editing", async ({ page }) => {
  const f = await fixture(page, { ready: true, closed: true }); await openPpm(page, false); const area = workspace(page); await expect(area.getByRole("button", { name: "Back to edits", exact: true })).toHaveCount(0); await expect(area.getByRole("region", { name: "Review saved PPM", exact: true })).toContainText("Synthetic staff confirmation"); await expect(area.getByRole("button", { name: "Save and review", exact: true })).toHaveCount(0); await expect(area.getByRole("button", { name: "Regenerate AI wording", exact: true })).toHaveCount(0); await expect(area.getByRole("button", { name: "Approve current PPM", exact: true })).toBeDisabled(); expect(ppmCalls(f, "generate")).toEqual([]); expect(f.errors).toEqual([]);
});

test("legacy uploaded PPM is adopted only by an explicit action and remains in history", async ({ page }) => {
  const f = await fixture(page, { legacy: true }); await docs(page).click(); const area = workspace(page);
  await expect(area.getByText("Uploaded PPM · legacy current", { exact: true })).toBeVisible(); expect(ppmCalls(f, "generate")).toEqual([]);
  await area.getByRole("button", { name: "Create AI PPM draft", exact: true }).click(); await expect(area.getByText("Saved draft v4", { exact: true })).toBeVisible();
  expect(ppmCalls(f, "generate")).toHaveLength(1); expect(ppmCalls(f, "review")).toEqual([]);
  await area.getByText("PPM version history · 2", { exact: true }).click(); await expect(area.getByRole("button", { name: "Download PPM v3", exact: true })).toBeVisible(); expect(f.errors).toEqual([]);
});

test("PPM publication guidance focuses the heading on first and cached Documents navigation", async ({ page }) => {
  const f = await fixture(page); let chooserCount = 0; page.on("filechooser", () => { chooserCount += 1; });
  const valuation = page.getByLabel("Valuation source", { exact: true }); await valuation.click(); await valuation.press("End"); await valuation.pressSequentially(" with retained unsaved detail");
  await page.getByRole("button", { name: "Publish offer", exact: true }).click(); const heading = workspace(page).getByRole("heading", { name: "Private placement memorandum", exact: true });
  await expect(docs(page)).toHaveAttribute("aria-selected", "true"); await expect(heading).toBeFocused(); await expect(heading).toBeInViewport(); await expect(workspace(page).getByText("Saved draft v1", { exact: true })).toBeVisible();
  await terms(page).click(); await expect(valuation).toHaveValue("Saved synthetic appraisal with retained unsaved detail");
  await page.getByRole("button", { name: "Review PPM in Documents", exact: true }).click(); await expect(heading).toBeFocused(); await expect(heading).toBeInViewport();
  expect(chooserCount).toBe(0); expect(f.requests.some(row => row.path.endsWith("/publish") || row.path.includes("/documents/upload"))).toBe(false); expect(f.errors).toEqual([]);
});

test("post-review listing readiness failure retries only its read and keeps the approved version", async ({ page }) => {
  const f = await fixture(page, { failReadinessAfterReview: true }); await openPpm(page); await completeAndSave(page); await approve(page); const area = workspace(page);
  await expect(area.getByRole("alert")).toContainText("Refresh listing readiness to check the saved PPM before publishing");
  const writesBefore = f.requests.filter(row => row.method !== "GET"); await area.getByRole("button", { name: "Retry listing readiness", exact: true }).click();
  await expect(area.getByRole("button", { name: "Retry listing readiness", exact: true })).toHaveCount(0); await expect(area.getByText("Reviewed version v3", { exact: true })).toBeVisible();
  expect(f.requests.filter(row => row.method !== "GET")).toEqual(writesBefore); expect(ppmCalls(f, "review")).toHaveLength(1); expect(f.states.get(ID)!.history).toHaveLength(3); expect(f.errors).toEqual([]);
});
