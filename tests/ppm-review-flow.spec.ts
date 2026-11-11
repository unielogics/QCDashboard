import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PPM_LISTING_ID as ID } from "./fixtures/marketplacePpm";
import { fileCatalog } from "./fixtures/investorDocumentCockpit";
import { guidanceBudget } from "./fixtures/marketplaceErrorGuidance";
import { savedTermsTransportPdf } from "./fixtures/savedTermsDownload";
import { reviewListing, reviewState, reviewVersion, legacyBlankReviewState, customBlankReviewState } from "./fixtures/ppmReviewFlow";
import { presetFields } from "./fixtures/ppmPresetsMembership";

const ORIGIN = "https://ppm-review-flow.test";
let script: Buffer, css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketplace-ppm-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useSyncExternalStore}from'react';const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useCurrentUser" ? "export function useCurrentUser(){useSyncExternalStore(window.subscribeIdentity,()=>window.fixtureIdentity.revision);const a=window.fixtureIdentity;return{data:{id:a.actor,role:a.role},isLoading:false,authReady:true,authScope:a.actor+':session'}}" : `export const ${name}=()=>({});`).join("\n")}`,
    "next/navigation": `import{useSyncExternalStore}from'react';let current='${ID}';const listeners=new Set();window.switchListing=id=>{current=id;listeners.forEach(fn=>fn())};const router={push:url=>window.fixtureNavigation=url};export const useParams=()=>({id:useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>current,()=>current)});export const useRouter=()=>router;const search=new URLSearchParams(location.search);export const useSearchParams=()=>search;export const usePathname=()=>'/admin/marketplace/'+current;`,
    "@/lib/consoleAuth": "import{useSyncExternalStore}from'react';export function useConsoleAuth(){useSyncExternalStore(window.subscribeIdentity,()=>window.fixtureIdentity.revision);const a=window.fixtureIdentity;return{isLoaded:true,isSignedIn:true,userId:a.actor,sessionId:a.actor+'-session',getToken:async()=> 'synthetic-'+window.fixtureIdentity.actor}}export const visualQaUser=()=>null;",
    "next/dynamic": "import React,{lazy,Suspense}from'react';export default(loader,options={})=>{const Component=lazy(async()=>{const value=await loader();return typeof value==='function'?{default:value}:value});return props=><Suspense fallback={options.loading?React.createElement(options.loading):null}><Component {...props}/></Suspense>};",
  };
  mocks["./useApi"] = mocks["@/hooks/useApi"];
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Page from'@/app/admin/marketplace/[id]/page';import{MarketplacePpmWorkspace}from'@/components/marketplace/MarketplacePpmWorkspace';import{useCpListing}from'@/hooks/useCapitalPartners';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.refreshListing=()=>client.invalidateQueries({queryKey:['cp-listing']});window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-'+window.fixtureIdentity.actor,'Content-Type':'application/json'}});const body=await response.json();if(!response.ok){const error=new Error(typeof body.detail==='string'?body.detail:body.detail?.message||'Synthetic request failed');error.status=response.status;error.body=body;throw error}return body};function Isolated(){const q=useCpListing('${ID}');return q.data?<MarketplacePpmWorkspace listing={q.data} active onFix={()=>{}} onApproved={()=>window.approvedCallbacks++} onPublish={()=>window.publishCallbacks++}/>:<p>Loading isolated workspace</p>}createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><ConfirmationProvider>{location.pathname==='/isolated'?<Isolated/>:<Page/>}</ConfirmationProvider></main></QueryClientProvider>);` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: ORIGIN }) }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path === "./useApi" ? "@/hooks/useApi" : args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
  const config = require("tailwindcss/loadConfig")(path.join(root, "tailwind.config.ts"));
  css = Buffer.from((await require("postcss")([require("tailwindcss")({ ...config, content: [path.join(root, "src/**/*.{ts,tsx}")] })]).process(css.toString(), { from: path.join(directory, "app.css") })).css);
});

// The lifecycle cases below exercise the real page and PPM workspace. Only
// authentication and HTTP/storage responses are replaced with synthetic data.
type Json = Record<string, unknown>;
type Options = { legacyBlank?: boolean; customBlank?: boolean; missingLaw?: boolean; otherBlocker?: boolean; closed?: boolean; failReview?: boolean; lostReviewAck?: boolean; conflictReview?: boolean; failReadiness?: boolean; holdReview?: boolean; holdGenerate?: boolean; isolated?: boolean };
async function fixture(page: Page, options: Options = {}) {
  let listing = reviewListing(), state = options.legacyBlank ? legacyBlankReviewState() : options.customBlank ? customBlankReviewState() : reviewState();
  if (options.missingLaw) { const v = reviewVersion(); v.legal_inputs.jurisdiction = presetFields().find(field => field.key === "jurisdiction")!.default_value!; v.legal_presets = { ...v.legal_presets, jurisdiction: "to_be_confirmed" }; state = reviewState(v); }
  if (options.closed) listing = { ...listing, status: "repaid" };
  const requests: Array<{ method: string; path: string; body: Json; actor: string }> = [], errors: string[] = [], nativeDialogs: string[] = [];
  let failed = false, reviewSaved = false, readinessFailed = false, remoteSubscription = false, amount = 175000;
  let releaseReview = () => {}; const reviewGate = options.holdReview ? new Promise<void>(resolve => { releaseReview = resolve; }) : Promise.resolve();
  let releaseGenerate = () => {}; const generateGate = options.holdGenerate ? new Promise<void>(resolve => { releaseGenerate = resolve; }) : Promise.resolve();
  const applied = new Set<string>();
  page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => { nativeDialogs.push(dialog.type()); void dialog.dismiss(); });
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === "https://review-pdf.test") return route.fulfill({ contentType: "application/pdf", body: savedTermsTransportPdf(3) });
    if (url.origin !== ORIGIN) throw new Error(`Unexpected review fixture traffic: ${url.origin}`);
    if (!url.pathname.startsWith("/api/v1/")) return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.fixtureIdentity={actor:"staff-a",role:"super_admin",revision:0};const listeners=new Set();window.subscribeIdentity=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};window.changeIdentity=(actor,role="super_admin")=>{window.fixtureIdentity={actor,role,revision:window.fixtureIdentity.revision+1};listeners.forEach(fn=>fn())};window.approvedCallbacks=0;window.publishCallbacks=0;</script><script src="/app.js"></script></body></html>' });
    const p = url.pathname.slice(7), body = request.postData() ? request.postDataJSON() as Json : {}, actor = request.headers().authorization ?? "";
    expect(actor).toMatch(/^Bearer synthetic-staff-[ab]$/); requests.push({ method, path: p + url.search, body, actor });
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (p === `/capital/admin/listings/${ID}`) {
      if (options.failReadiness && reviewSaved && !readinessFailed) { readinessFailed = true; return json({ detail: "Synthetic listing readiness temporarily unavailable" }, 503); }
      return json(listing);
    }
    if (p === `/capital/admin/listings/${ID}/publish`) { expect(method).toBe("POST"); expect(state.current_approved?.status).toBe("approved"); expect(listing.publish_blockers).toEqual([]); expect(body.confirmed).toBe(true); listing = { ...listing, status: "open" }; return json(listing); }
    const match = p.match(/\/capital\/admin\/listings\/[^/]+\/ppm(?:\/(.*))?$/);
    if (match) {
      const action = match[1]; if (!action) return json(state);
      if (action.startsWith("versions/")) return json({ url: "https://review-pdf.test/saved-ppm.pdf", expires_in_seconds: 60 });
      if (action === "review") await reviewGate; if (action === "generate") await generateGate;
      if (action === "review" && options.failReview && !failed) { failed = true; return json({ detail: "Synthetic review request failed before saving" }, 503); }
      if (action === "review" && options.conflictReview && !failed) { failed = true; state = reviewState(reviewVersion(3, "b".repeat(64)), state.history); return json({ detail: { code: "ppm_version_changed", message: "A newer saved PPM exists; review its current facts" } }, 409); }
      const key = `${actor}:${action}:${body.idempotency_key}`; if (applied.has(key)) return json(state);
      if (body.expected_source_fingerprint !== state.source_fingerprint) return json({ detail: { code: "ppm_source_changed", message: "Saved source facts changed" } }, 409);
      const old = state.current_draft ?? state.current_approved;
      if (action !== "generate" && body.expected_version !== old?.version) return json({ detail: { code: "ppm_version_changed", message: "A newer PPM version exists" } }, 409);
      const number = Math.max(0, ...state.history.map(row => row.version)) + 1, next = reviewVersion(number, state.source_fingerprint);
      if (action === "draft" || action === "generate") {
        const values = action === "draft" ? body.legal_inputs as Record<string, string> : old?.legal_inputs ?? {}, selected = action === "draft" ? body.legal_presets as Record<string, string> : old?.legal_presets ?? {};
        next.legal_inputs = {}; next.legal_presets = {};
        for (const field of presetFields()) { const id = selected[field.key] ?? (values[field.key]?.trim() ? "custom" : field.default_preset ?? "custom"); next.legal_presets[field.key] = id; next.legal_inputs[field.key] = id === "custom" ? values[field.key] ?? "" : field.options?.find(option => option.key === id)?.text ?? ""; }
        next.narrative_sections = action === "draft" ? body.narrative_sections as Record<string, string> : old?.narrative_sections ?? {};
        if (action === "generate" && remoteSubscription) { next.legal_inputs.subscription_process = "Updated saved subscription process."; next.legal_presets.subscription_process = "custom"; }
      }
      if (action === "review") {
        expect(state.draft_upgrade_available).toBe(false); expect(state.missing.filter(row => row.required)).toEqual([]); expect(body.confirmed).toBe(true); expect(body.decision).toBe("approve");
        next.legal_inputs = { ...old!.legal_inputs }; next.legal_presets = { ...old!.legal_presets }; next.narrative_sections = { ...old!.narrative_sections }; next.status = "approved"; next.reviewed_at = "2026-11-11T18:00:00Z"; reviewSaved = true;
        listing = { ...reviewListing(options.otherBlocker ? "budget" : "none"), documents: [{ id: next.document_id, kind: "ppm", kind_label: "Private placement memorandum", name: "Synthetic reviewed PPM.pdf", content_type: "application/pdf", size_bytes: 64, version: number, status: "ready", source: "generated_ppm" }] };
      }
      next.document.issuer = next.legal_inputs.issuer_legal_name; next.document.sections[0].facts[0].value = `${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`;
      state = reviewState(next, state.history); applied.add(key);
      if (action === "review" && options.lostReviewAck && !failed) { failed = true; return json({ detail: "Synthetic review acknowledgment was lost after saving" }, 503); }
      return json(state);
    }
    if (p.endsWith("/file-documents")) return json(fileCatalog(true));
    if (p.endsWith("/deal-budget") || p.endsWith("/deal-budget/preview")) return json(guidanceBudget());
    throw new Error(`Unexpected review API: ${method} ${p}`);
  });
  await page.goto(ORIGIN + (options.isolated ? "/isolated" : "/"));
  if (!options.isolated) await expect(page.getByRole("heading", { name: /CP-PPM-QA/ })).toBeVisible();
  return { requests, errors, nativeDialogs, releaseReview, releaseGenerate, state: () => state, changeSource: async () => {
    state = { ...state, source_fingerprint: "b".repeat(64), status: "stale" }; for (const version of state.history) version.stale = true; remoteSubscription = true; amount = 225000; listing = { ...listing, updated_at: "2026-11-11T18:01:00Z" };
    await page.evaluate(() => (window as unknown as { refreshListing: () => Promise<void> }).refreshListing());
  } };
}
const area = (page: Page) => page.getByRole("region", { name: "PPM draft and review", exact: true });
const summary = (page: Page) => area(page).getByRole("region", { name: "Review saved PPM", exact: true });
const calls = (f: Awaited<ReturnType<typeof fixture>>, action: string) => f.requests.filter(row => row.path.endsWith(`/ppm/${action}`));
async function open(page: Page, isolated = false) { if (!isolated) await page.getByRole("tab", { name: /^Documents/ }).click(); await expect(summary(page)).toBeVisible(); }
async function edit(page: Page) { await summary(page).getByRole("button", { name: "Back to edits", exact: true }).click(); await expect(area(page).getByRole("region", { name: "Edit PPM draft", exact: true })).toBeVisible(); }
async function approve(page: Page) { await summary(page).getByRole("button", { name: "Approve current PPM", exact: true }).click(); await expect(area(page).getByText(/Current PPM v\d+ approved\./)).toBeVisible(); }

test("review-first approval needs no typed reason and hands off to the actual publish confirmation", async ({ page }, info) => {
  const f = await fixture(page); await open(page);
  await expect(page.getByText("Prepare and approve the private placement memorandum", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("private placement memorandum not uploaded", { exact: true })).toHaveCount(0);
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveCount(0);
  await expect(area(page).getByRole("checkbox")).toHaveCount(0);
  await expect(summary(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeEnabled();
  const directory = path.resolve(process.cwd(), "../../artifacts/ppm-review-flow-qa"); await mkdir(directory, { recursive: true });
  await summary(page).getByRole("heading", { name: /Review saved PPM/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(directory, `${info.project.name}-review-first.png`) });
  expect(f.requests.filter(row => row.method !== "GET")).toEqual([]);
  await approve(page); expect(calls(f, "review")).toHaveLength(1);
  expect(calls(f, "review")[0].body).toMatchObject({ confirmed: true, decision: "approve", expected_version: 2 });
  expect(calls(f, "review")[0].body).not.toHaveProperty("reason");
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
  await summary(page).getByRole("button", { name: "Publish offer", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(directory, `${info.project.name}-approved-actions.png`) });
  await summary(page).getByRole("button", { name: "Publish offer", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("Publish CP-PPM-QA to members?");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
  await summary(page).getByRole("button", { name: "Publish offer", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/publish")).length).toBe(1);
  expect(f.nativeDialogs).toEqual([]); expect(f.errors).toEqual([]);
});

test("Back to edits retains local wording while the review summary remains the saved version", async ({ page }) => {
  const f = await fixture(page); await open(page); await edit(page);
  await area(page).getByLabel("PPM Issuer legal name", { exact: true }).fill("Example Custom Issuer LLC");
  await area(page).getByRole("button", { name: "Review saved PPM", exact: true }).first().click();
  await expect(summary(page)).not.toContainText("Example Custom Issuer LLC");
  await expect(summary(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeDisabled();
  await edit(page); await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("Example Custom Issuer LLC");
  await area(page).getByRole("button", { name: "Save and review", exact: true }).click();
  await expect(summary(page)).toContainText("Example Custom Issuer LLC");
  expect(calls(f, "draft")[0].body.legal_presets).toMatchObject({ issuer_legal_name: "custom" });
  expect(calls(f, "review")).toEqual([]); expect(f.errors).toEqual([]);
});

test("missing facts reveal and focus the exact preset without approving or publishing", async ({ page }, info) => {
  const f = await fixture(page, { missingLaw: true }); await open(page);
  await expect(summary(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeDisabled();
  await area(page).getByRole("button", { name: /Complete Governing law/ }).click();
  const law = area(page).getByLabel(/PPM Governing law.*preset/); await expect(law).toBeFocused(); await expect(law).toBeInViewport();
  await page.screenshot({ path: path.resolve(process.cwd(), `../../artifacts/ppm-review-flow-qa/${info.project.name}-missing-fact.png`) });
  await law.selectOption("us_state_NJ"); await area(page).getByRole("button", { name: "Save and review", exact: true }).click();
  await expect(summary(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeEnabled();
  expect(calls(f, "review")).toEqual([]); expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
});

test("approved PPM still uses the real page's independent publication requirements", async ({ page }) => {
  const f = await fixture(page, { otherBlocker: true }); await open(page); await approve(page);
  await summary(page).getByRole("button", { name: "Publish offer", exact: true }).click();
  await expect(page.getByText("deal budget is incomplete", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Terms and narrative", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog", { name: /Publish CP-PPM-QA/ })).toHaveCount(0);
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]); expect(f.errors).toEqual([]);
});

test("same-fingerprint legacy blank upgrade prepares once and preserves the saved summary", async ({ page }) => {
  const f = await fixture(page, { legacyBlank: true, holdGenerate: true }); await open(page);
  await expect.poll(() => calls(f, "generate").length).toBe(1);
  await expect(summary(page)).toContainText("Existing Example Issuer LLC");
  await expect(summary(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeDisabled();
  f.releaseGenerate(); await expect(area(page).getByText("Saved draft v2", { exact: true })).toBeVisible();
  await expect(summary(page)).toContainText("Existing Example Issuer LLC");
  expect(calls(f, "generate")).toHaveLength(1); expect(calls(f, "review")).toEqual([]);
});

test("explicit Custom blank is retained and never triggers legacy auto-upgrade", async ({ page }) => {
  const f = await fixture(page, { customBlank: true }); await open(page);
  await area(page).getByRole("button", { name: "Complete Issuer legal name", exact: true }).click();
  await expect(area(page).getByLabel("PPM Issuer legal name preset", { exact: true })).toBeFocused();
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("");
  await expect(area(page).getByLabel("PPM Issuer legal name preset", { exact: true })).toHaveValue("custom");
  expect(calls(f, "generate")).toEqual([]); expect(calls(f, "review")).toEqual([]);
});

test("source refresh retains dirty edits and rebases only local changes onto the new saved facts", async ({ page }) => {
  const f = await fixture(page, { holdGenerate: true }); await open(page); await edit(page);
  await area(page).getByLabel("PPM Issuer legal name", { exact: true }).fill("Example Retained Draft LLC");
  await f.changeSource(); await expect.poll(() => calls(f, "generate").length).toBe(1);
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("Example Retained Draft LLC");
  f.releaseGenerate(); await expect(area(page).getByRole("button", { name: "Apply my edits to latest facts", exact: true })).toBeEnabled();
  await area(page).getByRole("button", { name: "Apply my edits to latest facts", exact: true }).click();
  await expect(summary(page)).toBeVisible(); await edit(page);
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("Example Retained Draft LLC");
  await expect(area(page).getByLabel("PPM Subscription, acceptance and funding process", { exact: true })).toHaveValue("Updated saved subscription process.");
  expect(calls(f, "draft")[0].body.expected_source_fingerprint).toBe("b".repeat(64)); expect(calls(f, "review")).toEqual([]); expect(f.errors).toEqual([]);
});

test("optional short note and a failed review retry retain exactly the same intent", async ({ page }) => {
  const f = await fixture(page, { failReview: true }); await open(page);
  await summary(page).getByText("Add review note (optional)", { exact: true }).click();
  await summary(page).getByLabel("PPM review note (optional)").fill("ok");
  await summary(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
  await area(page).getByRole("button", { name: "Retry previous review", exact: true }).click();
  await expect(area(page).getByText(/Current PPM v3 approved\./)).toBeVisible();
  expect(calls(f, "review")).toHaveLength(2); expect(calls(f, "review")[0].body).toEqual(calls(f, "review")[1].body);
  expect(calls(f, "review")[0].body.reason).toBe("ok"); expect(f.errors).toEqual([]);
});

test("pending approval blocks repeated clicks and cannot publish before acknowledgment", async ({ page }) => {
  const f = await fixture(page, { holdReview: true }); await open(page);
  const button = summary(page).getByRole("button", { name: "Approve current PPM", exact: true });
  await button.dblclick(); await expect.poll(() => calls(f, "review").length).toBe(1); await expect(summary(page).getByRole("button", { name: "Approving…", exact: true })).toBeDisabled();
  await expect(summary(page).getByRole("button", { name: "Publish offer", exact: true })).toHaveCount(0);
  f.releaseReview(); await expect(area(page).getByText(/Current PPM v3 approved\./)).toBeVisible(); expect(calls(f, "review")).toHaveLength(1);
});

test("a changed saved version requires an explicit new approval rather than replaying the old intent", async ({ page }) => {
  const f = await fixture(page, { conflictReview: true }); await open(page);
  await summary(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
  await expect(area(page).getByText("Saved draft v3", { exact: true })).toBeVisible();
  await approve(page); const attempts = calls(f, "review"); expect(attempts).toHaveLength(2);
  expect(attempts[1].body).toMatchObject({ expected_version: 3, expected_source_fingerprint: "b".repeat(64) });
  expect(attempts[1].body.idempotency_key).not.toBe(attempts[0].body.idempotency_key); expect(f.errors).toEqual([]);
});

for (const recovery of ["lost review acknowledgment", "failed listing readiness"] as const) test(`${recovery} recovers through GET only without approving a second version`, async ({ page }) => {
  const f = await fixture(page, recovery === "lost review acknowledgment" ? { lostReviewAck: true } : { failReadiness: true }); await open(page);
  await summary(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
  await expect(area(page).getByRole("button", { name: "Retry listing readiness", exact: true })).toBeVisible();
  await expect(summary(page).getByRole("button", { name: "Publish offer", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish offer", exact: true }).first()).toBeDisabled();
  await area(page).getByRole("button", { name: "Retry listing readiness", exact: true }).click();
  await expect(summary(page).getByRole("button", { name: "Publish offer", exact: true })).toBeEnabled();
  expect(calls(f, "review")).toHaveLength(1); expect(f.requests.filter(row => row.method !== "GET").every(row => row.path.endsWith("/ppm/review"))).toBe(true); expect(f.errors).toEqual([]);
});

test("actual workspace auth-scope changes discard the previous staff member's local draft and retry intent", async ({ page }) => {
  const f = await fixture(page, { failReview: true, isolated: true }); await open(page, true);
  await summary(page).getByText("Add review note (optional)", { exact: true }).click();
  await summary(page).getByLabel("PPM review note (optional)").fill("Private local staff A note");
  await summary(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
  await expect(area(page).getByRole("button", { name: "Retry previous review", exact: true })).toBeVisible();
  await edit(page); await area(page).getByLabel("PPM Issuer legal name", { exact: true }).fill("Private local staff A issuer");
  await page.evaluate(() => (window as unknown as { changeIdentity: (actor: string) => void }).changeIdentity("staff-b"));
  await expect(summary(page)).toBeVisible(); await expect(area(page).getByRole("button", { name: "Retry previous review", exact: true })).toHaveCount(0);
  await summary(page).getByText("Add review note (optional)", { exact: true }).click(); await expect(summary(page).getByLabel("PPM review note (optional)")).toHaveValue("");
  await edit(page); await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("Qualified Commercial LLC");
  expect(f.requests.filter(row => row.actor.endsWith("staff-b") && row.method !== "GET")).toEqual([]); expect(f.errors).toEqual([]);
  await page.evaluate(() => (window as unknown as { changeIdentity: (actor: string, role: string) => void }).changeIdentity("staff-b", "loan_exec"));
  await expect(summary(page)).toHaveCount(0); await expect(area(page).getByRole("button", { name: /Approve current PPM|Save and review|Retry previous/ })).toHaveCount(0);
  expect(f.requests.filter(row => row.actor.endsWith("staff-b") && row.method !== "GET")).toEqual([]);
});
