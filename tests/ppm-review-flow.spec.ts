import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PPM_LISTING_ID as ID } from "./fixtures/marketplacePpm";
import { fileCatalog } from "./fixtures/investorDocumentCockpit";
import { guidanceBudget } from "./fixtures/marketplaceErrorGuidance";
import { savedTermsTransportPdf } from "./fixtures/savedTermsDownload";
import { reviewListing, reviewState, reviewVersion, legacyBlankReviewState, customBlankReviewState, publicationHistoryState, generatedPdfPreviewState } from "./fixtures/ppmReviewFlow";
import { presetFields } from "./fixtures/ppmPresetsMembership";
import type { CpListing } from "../src/hooks/useCapitalPartners";

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
type Options = { legacyBlank?: boolean; customBlank?: boolean; missingLaw?: boolean; otherBlocker?: boolean; closed?: boolean; failReview?: boolean; failDownload?: boolean; failSourceGenerate?: boolean; renderRace?: boolean; snapshotAuthorityChange?: boolean; lostReviewAck?: boolean; conflictReview?: boolean; reviewSourceChanged?: boolean; publicationHistory?: boolean; generatedPreview?: boolean; failReadiness?: boolean; holdReview?: boolean; holdGenerate?: boolean; holdSnapshot?: boolean; isolated?: boolean };
async function fixture(page: Page, options: Options = {}) {
  let listing: Omit<ReturnType<typeof reviewListing>, "documents"> & Pick<CpListing, "documents"> = reviewListing();
  let state = options.legacyBlank ? legacyBlankReviewState() : options.customBlank ? customBlankReviewState() : reviewState();
  if (options.publicationHistory) { state = publicationHistoryState(); listing = { ...reviewListing("none"), status: "open", loan_amount: "225000" }; }
  if (options.generatedPreview) { state = generatedPdfPreviewState(); listing = { ...listing, ref: "SYNTHETIC-PPM", name: "Synthetic Wellness Services LLC", loan_amount: "120000", offered_amount: "120000", minimum_investment: "120000", note_rate_pct: "12", term_months: 12, expected_funding_date: "2026-12-01", maturity_date: "2027-12-01" }; }
  if (options.missingLaw) { const v = reviewVersion(); v.legal_inputs.jurisdiction = presetFields().find(field => field.key === "jurisdiction")!.default_value!; v.legal_presets = { ...v.legal_presets, jurisdiction: "to_be_confirmed" }; state = reviewState(v); }
  if (options.closed) listing = { ...listing, status: "repaid" };
  const requests: Array<{ method: string; path: string; body: Json; actor: string }> = [], errors: string[] = [], nativeDialogs: string[] = [];
  let failed = false, reviewSaved = false, readinessFailed = false, downloadFailed = false, sourceGenerateFailed = false, renderFailed = false, reviewSourceFailed = false, remoteSubscription = false, amount = options.publicationHistory ? 225000 : options.generatedPreview ? 120000 : 175000;
  let activeId: string | null = state.active_version?.document_id ?? null;
  const actualPdf = options.generatedPreview ? await readFile(process.env.QC_PPM_GENERATED_PDF!) : null;
  const decorated = () => ({ ...state, active_version: state.history.find(version => version.document_id === activeId) ?? null, working_draft_document_id: state.current_draft?.document_id ?? null, latest_version: Math.max(0, ...state.history.map(version => version.version)) });
  const syncDocuments = () => { listing.documents = state.history.map(version => ({ id: version.document_id, kind: "ppm", kind_label: "Private placement memorandum", name: `Synthetic PPM v${version.version}.pdf`, content_type: "application/pdf", size_bytes: actualPdf?.length ?? 1000, version: version.version, status: version.document_id === state.current_draft?.document_id ? "pending" : version.document_id === activeId || version.document_id === state.current_approved?.document_id ? "ready" : "superseded", source: version.source === "generated_ppm" ? "generated_ppm" : "uploaded" })); };
  let releaseReview = () => {}; const reviewGate = options.holdReview ? new Promise<void>(resolve => { releaseReview = resolve; }) : Promise.resolve();
  let releaseGenerate = () => {}; const generateGate = options.holdGenerate ? new Promise<void>(resolve => { releaseGenerate = resolve; }) : Promise.resolve();
  let releaseSnapshot = () => {}; const snapshotGate = options.holdSnapshot ? new Promise<void>(resolve => { releaseSnapshot = resolve; }) : Promise.resolve();
  const applied = new Set<string>();
  page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => { nativeDialogs.push(dialog.type()); void dialog.dismiss(); });
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === "https://review-pdf.test") { const version = Number(url.searchParams.get("version")); return route.fulfill({ contentType: "application/pdf", headers: { "Content-Disposition": `${url.searchParams.get("download") === "true" ? "attachment" : "inline"}; filename="Synthetic-PPM-v${version}.pdf"` }, body: actualPdf ?? savedTermsTransportPdf(version) }); }
    if (["chrome-extension:", "chrome:", "data:"].includes(url.protocol)) return route.continue();
    if (url.origin !== ORIGIN) throw new Error(`Unexpected review fixture traffic: ${url.origin} (${url.protocol})`);
    if (url.pathname.startsWith("/files/")) return route.fulfill({ contentType: "text/html", body: "<p>Synthetic permissioned file destination</p>" });
    if (!url.pathname.startsWith("/api/v1/")) return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.fixtureIdentity={actor:"staff-a",role:"super_admin",revision:0};const listeners=new Set();window.subscribeIdentity=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};window.changeIdentity=(actor,role="super_admin")=>{window.fixtureIdentity={actor,role,revision:window.fixtureIdentity.revision+1};listeners.forEach(fn=>fn())};window.approvedCallbacks=0;window.publishCallbacks=0;</script><script src="/app.js"></script></body></html>' });
    const p = url.pathname.slice(7), body = request.postData() ? request.postDataJSON() as Json : {}, actor = request.headers().authorization ?? "";
    expect(actor).toMatch(/^Bearer synthetic-staff-[ab]$/); requests.push({ method, path: p + url.search, body, actor });
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    if (p === `/capital/admin/listings/${ID}`) {
      if (options.failReadiness && reviewSaved && !readinessFailed) { readinessFailed = true; return json({ detail: "Synthetic listing readiness temporarily unavailable" }, 503); }
      syncDocuments(); return json(listing);
    }
    if (p === `/capital/admin/listings/${ID}/publish`) { expect(method).toBe("POST"); expect(state.current_approved?.status).toBe("approved"); expect(state.current_draft).toBeNull(); expect(listing.publish_blockers).toEqual([]); expect(body.confirmed).toBe(true); expect(body.expected_ppm_document_id).toBe(state.current_approved!.document_id); expect(body.expected_ppm_source_fingerprint).toBe(state.source_fingerprint); activeId = state.current_approved!.document_id; listing = { ...listing, status: "open" }; syncDocuments(); return json(listing); }
    if (p === `/capital/admin/listings/${ID}/publish-package`) return json({ detail: "The file or program readiness changed. Refresh both PDFs before delivery." }, 409);
    if (p === `/capital/admin/listings/${ID}/refresh-snapshot`) {
      expect(method).toBe("POST"); expect(body).toEqual({}); await snapshotGate;
      if (options.snapshotAuthorityChange && state.source_fingerprint === "b".repeat(64)) state.source_fingerprint = "c".repeat(64);
      state.missing = state.missing.filter(item => item.key !== "listing_snapshot");
      if (remoteSubscription) listing = { ...listing, loan_amount: String(amount) };
      return json(listing);
    }
    if (p === `/application-profiles/${listing.profile_id}`) return json({ intake_id: "93000000-0000-0000-0000-000000000003" });
    const match = p.match(/\/capital\/admin\/listings\/[^/]+\/ppm(?:\/(.*))?$/);
    if (match) {
      const action = match[1]; if (!action) return json(decorated());
      if (action.startsWith("versions/") && action.endsWith("/url")) { if (options.failDownload && !downloadFailed) { downloadFailed = true; return json({ detail: "Synthetic saved PDF link temporarily unavailable" }, 503); } const version = state.history.find(row => row.document_id === action.split("/")[1]); expect(version).toBeTruthy(); return json({ url: `https://review-pdf.test/ppm.pdf?version=${version!.version}&download=${url.searchParams.get("download") ?? "false"}`, expires_in_seconds: 60 }); }
      if (action.startsWith("versions/") && action.endsWith("/reinstate")) {
        const target = state.history.find(row => row.document_id === action.split("/")[1]); expect(target).toBeTruthy();
        expect(body.expected_version).toBe(decorated().latest_version); expect(body.expected_source_fingerprint).toBe(state.source_fingerprint);
        const restored = reviewVersion(decorated().latest_version + 1, state.source_fingerprint); restored.legal_inputs = { ...target!.legal_inputs }; restored.legal_presets = { ...target!.legal_presets }; restored.narrative_sections = { ...target!.narrative_sections }; restored.document.sections[0].facts[0].value = `${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`;
        state = reviewState(restored, state.history); syncDocuments(); return json(decorated());
      }
      if (action === "review") await reviewGate; if (action === "generate") await generateGate;
      if (action === "generate" && options.renderRace && !renderFailed) { renderFailed = true; state.source_fingerprint = "d".repeat(64); state.missing.push({ key: "listing_snapshot", label: "Refresh the listing from the latest saved file before approving the PPM.", section: "snapshot", required: true }); return json({ detail: { code: "ppm_source_changed", message: "The saved file changed while rendering. Retry with current facts." } }, 409); }
      if (action === "generate" && options.failSourceGenerate && state.source_fingerprint === "b".repeat(64) && !sourceGenerateFailed) { sourceGenerateFailed = true; return json({ detail: "Synthetic source refresh failed before creating a draft" }, 503); }
      if (action === "review" && options.failReview && !failed) { failed = true; return json({ detail: "Synthetic review request failed before saving" }, 503); }
      if (action === "review" && options.conflictReview && !failed) { failed = true; state = reviewState(reviewVersion(3, "b".repeat(64)), state.history); return json({ detail: { code: "ppm_version_changed", message: "A newer saved PPM exists; review its current facts" } }, 409); }
      if (action === "review" && options.reviewSourceChanged && !reviewSourceFailed) { reviewSourceFailed = true; state.source_fingerprint = "c".repeat(64); state.status = "stale"; for (const version of state.history) version.stale = true; return json({ detail: { code: "ppm_source_changed", message: "The saved file changed while rendering. Retry with current facts." } }, 409); }
      const key = `${actor}:${action}:${body.idempotency_key}`; if (applied.has(key)) return json(decorated());
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
        const readiness = reviewListing(options.otherBlocker ? "budget" : "none"); listing = { ...listing, publish_blockers: readiness.publish_blockers, publish_issues: readiness.publish_issues };
      }
      next.document.issuer = next.legal_inputs.issuer_legal_name; next.document.sections[0].facts[0].value = `${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`;
      state = reviewState(next, state.history); applied.add(key); syncDocuments();
      if (action === "review" && options.lostReviewAck && !failed) { failed = true; return json({ detail: "Synthetic review acknowledgment was lost after saving" }, 503); }
      return json(decorated());
    }
    if (p.endsWith("/file-documents")) return json(fileCatalog(true));
    if (p.endsWith("/deal-budget") || p.endsWith("/deal-budget/preview")) return json(guidanceBudget());
    throw new Error(`Unexpected review API: ${method} ${p}`);
  });
  await page.goto(ORIGIN + (options.isolated ? "/isolated" : "/"));
  if (!options.isolated) await expect(page.getByRole("heading", { name: /CP-PPM-QA/ })).toBeVisible();
  return { requests, errors, nativeDialogs, releaseReview, releaseGenerate, releaseSnapshot, state: decorated, actualPdf, changeSource: async () => {
    state = { ...state, source_fingerprint: "b".repeat(64), status: "stale" }; for (const version of state.history) version.stale = true; remoteSubscription = true; amount = 225000; listing = { ...listing, updated_at: "2026-11-11T18:01:00Z" };
    if (options.snapshotAuthorityChange) state.missing.push({ key: "listing_snapshot", label: "Refresh the listing from the latest saved file before approving the PPM.", section: "snapshot", required: true });
    await page.evaluate(() => (window as unknown as { refreshListing: () => Promise<void> }).refreshListing());
  } };
}
const area = (page: Page) => page.getByRole("region", { name: "PPM draft and review", exact: true });
const summary = (page: Page) => area(page).getByRole("region", { name: "Review saved PPM", exact: true });
const calls = (f: Awaited<ReturnType<typeof fixture>>, action: string) => f.requests.filter(row => row.path.endsWith(`/ppm/${action}`));
async function open(page: Page, isolated = false) { if (!isolated) await page.getByRole("tab", { name: /^Documents/ }).click(); await expect(summary(page)).toBeVisible(); }
async function edit(page: Page, all = true) { await area(page).getByRole("button", { name: "Back to edits", exact: true }).click(); await expect(area(page).getByRole("region", { name: "Edit PPM draft", exact: true })).toBeVisible(); if (all && await area(page).getByRole("button", { name: "Show all disclosure fields", exact: true }).isVisible()) await area(page).getByRole("button", { name: "Show all disclosure fields", exact: true }).click(); }
async function approve(page: Page) { await area(page).getByRole("button", { name: "Approve current PPM", exact: true }).click(); await expect(area(page).getByText(/PPM v\d+ is approved\./)).toBeVisible(); }
async function theme(page: Page, dark: boolean) { await page.evaluate(value => { document.body.classList.add("app"); document.body.dataset.dark = value ? "1" : "0"; document.body.style.display = "block"; }, dark); }
async function red(control: ReturnType<Page["locator"]>, property: "borderTopColor" | "color" = "borderTopColor") {
  const colors = await control.evaluate((node, key) => { const probe = document.createElement("span"); probe.style.color = "var(--danger)"; node.parentElement!.append(probe); const danger = getComputedStyle(probe).color; probe.remove(); return { actual: getComputedStyle(node)[key], danger }; }, property);
  expect(colors.actual).toBe(colors.danger); expect(colors.danger).not.toBe("rgba(0, 0, 0, 0)");
}

test("review-first approval needs no typed reason and hands off to the actual publish confirmation", async ({ page }, info) => {
  const f = await fixture(page); await open(page);
  await expect(page.getByText("Prepare and approve the private placement memorandum", { exact: true })).toHaveCount(0);
  await expect(area(page).locator("button.pri:visible")).toHaveCount(1);
  await expect(area(page).getByRole("heading", { name: "Private placement memorandum", exact: true })).toHaveCount(1);
  await expect(area(page).getByText("Saved legal disclosures", { exact: true }).locator("..")).not.toHaveAttribute("open", "");
  await expect(page.getByText("private placement memorandum not uploaded", { exact: true })).toHaveCount(0);
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveCount(0);
  await expect(area(page).getByRole("checkbox")).toHaveCount(0);
  await expect(area(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeEnabled();
  const directory = path.resolve(process.cwd(), "../../artifacts/ppm-approval-preview-qa"); await mkdir(directory, { recursive: true });
  await summary(page).getByRole("heading", { name: /Review saved PPM/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(directory, `${info.project.name}-review-first.png`) });
  expect(f.requests.filter(row => row.method !== "GET")).toEqual([]);
  await approve(page); expect(calls(f, "review")).toHaveLength(1);
  expect(calls(f, "review")[0].body).toMatchObject({ confirmed: true, decision: "approve", expected_version: 2 });
  expect(calls(f, "review")[0].body).not.toHaveProperty("reason");
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
  await area(page).getByRole("button", { name: "Publish offer", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(directory, `${info.project.name}-approved-actions.png`) });
  await area(page).getByRole("button", { name: "Publish offer", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("Publish CP-PPM-QA to members?");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
  await area(page).getByRole("button", { name: "Publish offer", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/publish")).length).toBe(1);
  await expect(area(page).getByRole("button", { name: "Publish offer", exact: true })).toHaveCount(0);
  await f.changeSource(); await expect(area(page).getByRole("button", { name: "Prepare latest offer", exact: true })).toBeEnabled();
  expect(f.requests.filter(row => row.path.endsWith("/refresh-snapshot"))).toEqual([]); expect(calls(f, "generate")).toEqual([]);
  await theme(page, false); await area(page).getByRole("heading", { name: "Private placement memorandum", exact: true }).evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.screenshot({ path: path.join(directory, `${info.project.name}-published-explicit-prepare.png`) });
  await area(page).getByRole("button", { name: "Prepare latest offer", exact: true }).click(); await expect(area(page).getByText("Working draft v4", { exact: true })).toBeVisible();
  expect(f.requests.filter(row => row.path.endsWith("/refresh-snapshot"))).toHaveLength(1); expect(calls(f, "generate")).toHaveLength(1);
  expect(calls(f, "review")).toHaveLength(1); expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(1);
  expect(f.nativeDialogs).toEqual([]); expect(f.errors).toEqual([]);
});

test("Back to edits retains local wording while the review summary remains the saved version", async ({ page }) => {
  const f = await fixture(page); await open(page); await edit(page);
  await area(page).getByLabel("PPM Issuer legal name", { exact: true }).fill("Example Custom Issuer LLC");
  await area(page).getByRole("button", { name: "Review saved PPM", exact: true }).first().click();
  await expect(summary(page)).not.toContainText("Example Custom Issuer LLC");
  await expect(area(page).getByRole("button", { name: "Approve current PPM", exact: true })).toHaveCount(0);
  await edit(page, false); await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toBeVisible(); await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("Example Custom Issuer LLC");
  await area(page).getByRole("button", { name: "Save and review", exact: true }).click();
  await expect(summary(page)).toContainText("Example Custom Issuer LLC");
  expect(calls(f, "draft")[0].body.legal_presets).toMatchObject({ issuer_legal_name: "custom" });
  expect(calls(f, "review")).toEqual([]); expect(f.errors).toEqual([]);
});

test("missing facts reveal and focus the exact preset without approving or publishing", async ({ page }, info) => {
  const f = await fixture(page, { missingLaw: true }); await open(page);
  await mkdir(path.resolve(process.cwd(), "../../artifacts/ppm-approval-preview-qa"), { recursive: true });
  await expect(area(page).locator("button.pri:visible")).toHaveCount(1);
  await expect(area(page).getByRole("textbox")).toHaveCount(0);
  for (const dark of [false, true]) { await theme(page, dark); await area(page).getByRole("heading", { name: "Private placement memorandum", exact: true }).evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" })); await page.screenshot({ path: path.resolve(process.cwd(), `../../artifacts/ppm-approval-preview-qa/${info.project.name}-${dark ? "obsidian" : "light"}-checklist.png`) }); }
  await area(page).getByRole("button", { name: "Fix required items", exact: true }).click();
  const law = area(page).getByLabel(/PPM Governing law.*preset/); await expect(law).toBeFocused(); await expect(law).toBeInViewport();
  const wording = area(page).getByLabel("PPM Governing law and offering jurisdictions", { exact: true }), group = wording.locator("xpath=ancestor::fieldset");
  await expect(law).toHaveAttribute("aria-invalid", "true"); await expect(wording).toHaveAttribute("aria-invalid", "true");
  await expect(group.getByText("Required", { exact: true })).toBeVisible(); await expect(area(page).locator('[aria-label="PPM offering legal details"] fieldset:visible')).toHaveCount(1);
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveCount(0);
  for (const dark of [false, true]) { await theme(page, dark); await red(group); await red(group.getByText("Required", { exact: true }), "color"); await wording.focus(); await red(law); await law.focus(); await law.scrollIntoViewIfNeeded(); const width = page.viewportSize()!.width; expect((await area(page).boundingBox())!.width).toBeGreaterThan(Math.min(900, width - 60)); expect((await law.boundingBox())!.width).toBeGreaterThan(Math.min(300, width * .6)); await page.screenshot({ path: path.resolve(process.cwd(), `../../artifacts/ppm-approval-preview-qa/${info.project.name}-${dark ? "obsidian" : "light"}-required.png`) }); }
  const pendingWords = await wording.inputValue(); await law.selectOption("custom"); await expect(wording).toHaveValue(pendingWords); await expect(law).toHaveAttribute("aria-invalid", "true");
  await law.selectOption("us_state_NJ"); await expect(law).not.toHaveAttribute("aria-invalid", "true"); await expect(group.getByText("Required", { exact: true })).toHaveCount(0);
  await expect(group).toContainText("Save to update checks"); await expect(area(page).getByRole("region", { name: "PPM facts still needed" })).toContainText("Governing law");
  await expect(area(page).getByRole("button", { name: "Approve current PPM", exact: true })).toHaveCount(0);
  await expect(area(page).locator("button.pri:visible")).toHaveCount(1); await area(page).getByRole("button", { name: "Save and review", exact: true }).click();
  await expect(area(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeEnabled();
  expect(calls(f, "review")).toEqual([]); expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
});

test("approved PPM still uses the real page's independent publication requirements", async ({ page }) => {
  const f = await fixture(page, { otherBlocker: true }); await open(page); await approve(page);
  await area(page).getByRole("button", { name: "Publish offer", exact: true }).click();
  await expect(page.getByText("deal budget is incomplete", { exact: true }).first()).toBeVisible();
  await red(page.getByText("deal budget is incomplete", { exact: true }).first(), "color");
  await expect(page.getByRole("tab", { name: "Terms and narrative", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog", { name: /Publish CP-PPM-QA/ })).toHaveCount(0);
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]); expect(f.errors).toEqual([]);
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("tab", { name: /^Documents/ }).click();
  await page.locator("summary:visible").filter({ hasText: /^Package tools$/ }).click();
  await page.getByRole("button", { name: "Update listing package", exact: true }).click();
  await expect(page.getByText("Refresh the file's document package", { exact: true })).toBeVisible();
  const originalUrl = page.url(), popupReady = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open package in new tab", exact: true }).click();
  const popup = await popupReady; await popup.waitForURL(`${ORIGIN}/files/93000000-0000-0000-0000-000000000003?workspace=package#package-readiness`);
  expect(await popup.evaluate(() => window.opener === null)).toBe(true); expect(page.url()).toBe(originalUrl);
  expect(f.requests.filter(row => row.method !== "GET" && !row.path.endsWith("/deal-budget/preview")).map(row => row.path)).toEqual([`/capital/admin/listings/${ID}/ppm/review`, `/capital/admin/listings/${ID}/publish-package`]);
  await popup.close(); expect(f.errors).toEqual([]);
});

test("same-fingerprint legacy blank upgrade prepares once and preserves the saved summary", async ({ page }) => {
  const f = await fixture(page, { legacyBlank: true, holdGenerate: true, failSourceGenerate: true }); await open(page);
  await expect.poll(() => calls(f, "generate").length).toBe(1);
  await expect(summary(page)).toContainText("Existing Example Issuer LLC");
  await expect(area(page).getByRole("button", { name: "Preparing latest offer…", exact: true })).toBeDisabled();
  f.releaseGenerate(); await expect(area(page).getByText("Working draft v2", { exact: true })).toBeVisible();
  await expect(summary(page)).toContainText("Existing Example Issuer LLC");
  expect(calls(f, "generate")).toHaveLength(1); expect(calls(f, "review")).toEqual([]);
  await f.changeSource(); await expect(area(page).getByRole("alert")).toContainText("Synthetic source refresh failed");
  await area(page).getByRole("button", { name: "Prepare latest offer", exact: true }).click(); await expect(area(page).getByText("Working draft v3", { exact: true })).toBeVisible();
  expect(calls(f, "generate")).toHaveLength(3); expect(calls(f, "generate")[2].body).toEqual(calls(f, "generate")[1].body);
  expect(calls(f, "draft")).toEqual([]); expect(calls(f, "review")).toEqual([]);
});

test("explicit Custom blank is retained and never triggers legacy auto-upgrade", async ({ page }) => {
  const f = await fixture(page, { customBlank: true }); await open(page);
  await area(page).getByRole("button", { name: "Complete Issuer legal name", exact: true }).click();
  await expect(area(page).getByLabel("PPM Issuer legal name preset", { exact: true })).toBeFocused();
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("");
  await expect(area(page).getByLabel("PPM Issuer legal name preset", { exact: true })).toHaveValue("custom");
  const input = area(page).getByLabel("PPM Issuer legal name", { exact: true }); await expect(input).toHaveAttribute("aria-invalid", "true"); await theme(page, false); await red(input);
  await input.focus(); const original = await input.elementHandle();
  for (const key of "Example Confirmed Issuer LLC") { await input.pressSequentially(key); expect(await original!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true); }
  await expect(input).toHaveValue("Example Confirmed Issuer LLC"); await expect(input).toBeVisible(); await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await expect(input.locator("xpath=ancestor::fieldset")).toContainText("Save to update checks"); await expect(area(page).getByRole("button", { name: "Approve current PPM", exact: true })).toHaveCount(0);
  await area(page).getByRole("button", { name: "Save and review", exact: true }).click(); await expect(area(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeEnabled(); await original?.dispose();
  expect(calls(f, "generate")).toEqual([]); expect(calls(f, "review")).toEqual([]);
});

test("source refresh retains dirty edits and rebases only local changes onto the new saved facts", async ({ page }, info) => {
  const f = await fixture(page, { holdGenerate: true, holdSnapshot: true, snapshotAuthorityChange: true, renderRace: true }); await open(page); await edit(page);
  await area(page).getByLabel("PPM Issuer legal name", { exact: true }).fill("Example Retained Draft LLC");
  await f.changeSource(); await expect.poll(() => f.requests.filter(row => row.path.endsWith("/refresh-snapshot")).length).toBe(1);
  expect(calls(f, "generate")).toEqual([]); expect(calls(f, "review")).toEqual([]);
  await expect(area(page).getByRole("region", { name: "PPM facts still needed" })).toHaveCount(0);
  f.releaseSnapshot(); await expect.poll(() => calls(f, "generate").length).toBe(1);
  expect(calls(f, "generate")[0].body.expected_source_fingerprint).toBe("c".repeat(64));
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("Example Retained Draft LLC");
  f.releaseGenerate(); await expect(area(page).getByRole("button", { name: "Apply my edits to latest facts", exact: true })).toBeEnabled();
  expect(calls(f, "generate")).toHaveLength(2); expect(calls(f, "generate")[1].body.expected_source_fingerprint).toBe("d".repeat(64));
  expect(calls(f, "generate")[1].body.idempotency_key).not.toBe(calls(f, "generate")[0].body.idempotency_key);
  await area(page).getByRole("button", { name: "Apply my edits to latest facts", exact: true }).click();
  await expect(summary(page)).toBeVisible(); await edit(page);
  await expect(area(page).getByLabel("PPM Issuer legal name", { exact: true })).toHaveValue("Example Retained Draft LLC");
  await expect(area(page).getByLabel("PPM Subscription, acceptance and funding process", { exact: true })).toHaveValue("Updated saved subscription process.");
  expect(calls(f, "draft")[0].body.expected_source_fingerprint).toBe("d".repeat(64)); expect(calls(f, "review")).toEqual([]);
  await area(page).getByRole("button", { name: "Review saved PPM", exact: true }).first().click();
  await expect(area(page).getByRole("button", { name: "Approve current PPM", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Upload a document (optional)", exact: true })).toBeVisible();
  await expect(page.getByText(/private placement memorandum is required before publishing/)).toHaveCount(0);
  await expect(page.getByText("No documents yet.", { exact: true })).toHaveCount(0);
  await mkdir(path.resolve(process.cwd(), "../../artifacts/ppm-approval-preview-qa"), { recursive: true });
  for (const dark of [false, true]) { await theme(page, dark); await area(page).getByRole("heading", { name: "Private placement memorandum", exact: true }).evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" })); await page.screenshot({ path: path.resolve(process.cwd(), `../../artifacts/ppm-approval-preview-qa/${info.project.name}-${dark ? "obsidian" : "light"}-latest-offer-ready.png`) }); }
  await approve(page); expect(calls(f, "review")[0].body).toMatchObject({ expected_version: 4, expected_source_fingerprint: "d".repeat(64) });
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
  await area(page).getByRole("button", { name: "Publish offer", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/publish")).length).toBe(1);
  expect(f.state().history.find(version => version.version === 2)?.legal_inputs.issuer_legal_name).toBe("Qualified Commercial LLC"); expect(f.errors).toEqual([]);
});

test("optional short note and a failed review retry retain exactly the same intent", async ({ page }) => {
  const f = await fixture(page, { failReview: true, failDownload: true }); await open(page);
  await summary(page).getByText("Add review note (optional)", { exact: true }).click();
  await summary(page).getByLabel("PPM review note (optional)").fill("ok");
  await area(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
  await area(page).getByRole("button", { name: "Retry previous review", exact: true }).click();
  await expect(area(page).getByText(/PPM v3 is approved\./)).toBeVisible();
  expect(calls(f, "review")).toHaveLength(2); expect(calls(f, "review")[0].body).toEqual(calls(f, "review")[1].body);
  expect(calls(f, "review")[0].body.reason).toBe("ok"); expect(f.errors).toEqual([]);
  await area(page).getByRole("button", { name: "Download PDF v3", exact: true }).click();
  await expect(area(page).getByRole("alert")).toContainText("PDF preview: Synthetic saved PDF link temporarily unavailable");
  await expect(area(page).getByRole("button", { name: "Publish offer", exact: true })).toBeEnabled();
  await expect(area(page).getByRole("button", { name: "Preview saved PPM v3", exact: true })).toBeEnabled();
  await expect(area(page).getByRole("button", { name: "Download PDF v3", exact: true })).toBeEnabled();
  expect(calls(f, "review")).toHaveLength(2);
});

test("pending approval blocks repeated clicks and cannot publish before acknowledgment", async ({ page }) => {
  const f = await fixture(page, { holdReview: true }); await open(page);
  const button = area(page).getByRole("button", { name: "Approve current PPM", exact: true });
  await button.dblclick(); await expect.poll(() => calls(f, "review").length).toBe(1); await expect(area(page).getByRole("button", { name: "Approving…", exact: true })).toBeDisabled();
  await expect(area(page).getByRole("button", { name: "Publish offer", exact: true })).toHaveCount(0);
  f.releaseReview(); await expect(area(page).getByText(/PPM v3 is approved\./)).toBeVisible(); expect(calls(f, "review")).toHaveLength(1);
});

test("changed versions and review-render source conflicts keep the saved preview and require fresh explicit approval", async ({ page }, info) => {
  const f = await fixture(page, { conflictReview: true, reviewSourceChanged: true, failDownload: true }); await open(page);
  await area(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
  await expect(area(page).getByText("Working draft v3", { exact: true })).toBeVisible();
  await area(page).getByRole("button", { name: "Review latest PPM", exact: true }).click(); expect(calls(f, "review")).toHaveLength(1);
  await area(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
  await expect(area(page).getByRole("alert")).toContainText("Approval could not finish against these saved facts");
  await expect(area(page).getByRole("button", { name: "Preview saved PPM v3", exact: true })).toBeEnabled();
  const saved = area(page).getByText("Saved PPM text · v3", { exact: true }).locator(".."); await expect(saved).toHaveAttribute("open", ""); await expect(saved).toContainText("175,000.00 USD");
  expect(calls(f, "generate")).toEqual([]); expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
  await area(page).getByRole("button", { name: "Preview saved PPM v3", exact: true }).click(); await expect(area(page).getByText(/PDF preview: Synthetic saved PDF link/)).toBeVisible(); await expect(area(page).getByText(/Approval could not finish against these saved facts/)).toBeVisible();
  const popupReady = page.waitForEvent("popup"); await area(page).getByRole("button", { name: "Preview saved PPM v3", exact: true }).click(); const popup = await popupReady; await popup.waitForURL(/review-pdf.test/); expect(await popup.evaluate(() => window.opener === null)).toBe(true); await popup.close();
  await area(page).getByRole("heading", { name: "Private placement memorandum", exact: true }).scrollIntoViewIfNeeded();
  await mkdir(path.resolve(process.cwd(), "../../artifacts/ppm-approval-preview-qa"), { recursive: true }); for (const dark of [false, true]) { await theme(page, dark); await area(page).getByRole("heading", { name: "Private placement memorandum", exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.resolve(process.cwd(), `../../artifacts/ppm-approval-preview-qa/${info.project.name}-${dark ? "obsidian" : "light"}-approval-source-error-preview.png`) }); }
  await area(page).getByRole("button", { name: "Prepare latest offer", exact: true }).click(); await expect(area(page).getByText("Working draft v4", { exact: true })).toBeVisible();
  expect(calls(f, "review")).toHaveLength(2); await approve(page); const attempts = calls(f, "review"); expect(attempts).toHaveLength(3);
  expect(attempts[1].body).toMatchObject({ expected_version: 3, expected_source_fingerprint: "b".repeat(64) });
  expect(attempts[2].body).toMatchObject({ expected_version: 4, expected_source_fingerprint: "c".repeat(64) });
  expect(new Set(attempts.map(attempt => attempt.body.idempotency_key)).size).toBe(3); expect(f.errors).toEqual([]);
});

for (const recovery of ["lost review acknowledgment", "failed listing readiness"] as const) test(`${recovery} recovers through GET only without approving a second version`, async ({ page }) => {
  const f = await fixture(page, recovery === "lost review acknowledgment" ? { lostReviewAck: true } : { failReadiness: true }); await open(page);
  await area(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
  await expect(area(page).getByRole("button", { name: "Retry listing readiness", exact: true })).toBeVisible();
  await expect(area(page).getByRole("button", { name: "Publish offer", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish offer", exact: true })).toHaveCount(0);
  await area(page).getByRole("button", { name: "Retry listing readiness", exact: true }).click();
  await expect(area(page).getByRole("button", { name: "Publish offer", exact: true })).toBeEnabled();
  expect(calls(f, "review")).toHaveLength(1); expect(f.requests.filter(row => row.method !== "GET").every(row => row.path.endsWith("/ppm/review"))).toBe(true); expect(f.errors).toEqual([]);
});

test("actual workspace auth-scope changes discard the previous staff member's local draft and retry intent", async ({ page }) => {
  const f = await fixture(page, { failReview: true, isolated: true }); await open(page, true);
  await summary(page).getByText("Add review note (optional)", { exact: true }).click();
  await summary(page).getByLabel("PPM review note (optional)").fill("Private local staff A note");
  await area(page).getByRole("button", { name: "Approve current PPM", exact: true }).click();
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

test("published, working and historical PPMs stay distinct through restore, review and explicit Publish update", async ({ page }, info) => {
  const f = await fixture(page, { publicationHistory: true }); await open(page);
  const current = page.getByRole("table", { name: "Current offering document versions", exact: true });
  await expect(current.getByRole("row", { name: /Private placement memorandum.*v2.*Published version · update needed/ })).toBeVisible();
  await expect(current.getByRole("row", { name: /Private placement memorandum.*v3.*Working draft · not approved/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Supersede", exact: true })).toHaveCount(0);
  await page.getByText("Version history · 1", { exact: true }).click();
  const history = page.getByRole("table", { name: "Historical offering document versions", exact: true });
  const original = history.getByRole("row", { name: /Private placement memorandum.*v1/ });
  await edit(page); await area(page).getByLabel("PPM Issuer legal name", { exact: true }).fill("Synthetic unsaved issuer");
  await expect(original.getByRole("button", { name: "Use this version as draft", exact: true })).toBeDisabled();
  await expect(original.getByRole("button", { name: "Preview Private placement memorandum v1", exact: true })).toBeEnabled();
  await area(page).getByRole("button", { name: "Discard PPM edits", exact: true }).click();
  await original.getByRole("button", { name: "Use this version as draft", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Use PPM v1 as a new draft?"); await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(f.requests.filter(row => row.path.endsWith("/reinstate"))).toEqual([]);
  await original.getByRole("button", { name: "Use this version as draft", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "Create draft from this version", exact: true }).click();
  await expect(area(page).getByText("Working draft v4", { exact: true })).toBeVisible();
  expect(f.state().current_draft?.narrative_sections.overview).toBe("Historical manual disclosure to retain.");
  expect(f.state().current_draft?.document.sections[0].facts[0].value).toBe("225,000.00 USD"); expect(f.state().active_version?.version).toBe(2);
  expect(f.requests.filter(row => row.path.endsWith("/reinstate"))[0].body).toMatchObject({ expected_version: 3, expected_source_fingerprint: "b".repeat(64) });
  expect(calls(f, "review")).toEqual([]); expect(f.requests.filter(row => row.path.endsWith("/publish"))).toEqual([]);
  await expect(summary(page)).toBeVisible(); await approve(page);
  await expect(current.getByRole("row", { name: /Private placement memorandum.*v5.*Reviewed · not published/ })).toBeVisible();
  await expect(current.getByRole("row", { name: /Private placement memorandum.*v2.*Published version · update needed/ })).toBeVisible();
  expect(f.state().active_version?.version).toBe(2);
  const directory = path.resolve(process.cwd(), "../../artifacts/ppm-approval-preview-qa"); await mkdir(directory, { recursive: true });
  for (const dark of [false, true]) { await theme(page, dark); await current.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(directory, `${info.project.name}-${dark ? "obsidian" : "light"}-reviewed-not-published.png`) }); }
  await area(page).getByRole("button", { name: "Publish update", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText(/Publish/); await page.getByRole("dialog").getByRole("button", { name: /Publish/, exact: false }).click();
  await expect(current.getByRole("row", { name: /Private placement memorandum.*v5.*Published PPM/ })).toBeVisible();
  await expect(current.getByRole("row").filter({ hasText: "Published PPM" })).toHaveCount(1); expect(f.state().active_version?.version).toBe(5);
  const oldRow = history.getByRole("row", { name: /Private placement memorandum.*v2/ });
  const popupReady = page.waitForEvent("popup"); await oldRow.getByRole("button", { name: "Download Private placement memorandum v2", exact: true }).click(); const popup = await popupReady; const file = await popup.waitForEvent("download"); const stream = await file.createReadStream(), chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk)); expect(Buffer.concat(chunks)).toEqual(savedTermsTransportPdf(2)); expect(file.suggestedFilename()).toBe("Synthetic-PPM-v2.pdf"); expect(await popup.evaluate(() => window.opener === null)).toBe(true); await popup.close();
  expect(f.requests.filter(row => row.path.includes("/versions/") && row.path.endsWith("/url?download=true")).at(-1)?.path).toContain("synthetic-ppm-v2/url?download=true");
  expect(calls(f, "review")).toHaveLength(1); expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(1); expect(f.errors).toEqual([]);
});

test("private generated-PDF proof binds v1 metadata, preview and downloaded immutable bytes", async ({ page }, info) => {
  test.skip(!process.env.QC_PPM_GENERATED_PDF, "Optional private, previously generated synthetic PDF; no customer bytes or binary fixture committed.");
  const f = await fixture(page, { generatedPreview: true, isolated: true }); await open(page, true);
  await expect(summary(page)).toContainText("120,000.00 USD"); await expect(summary(page)).toContainText("2026-12-01"); await expect(area(page).getByText("Working draft v1", { exact: true })).toBeVisible();
  const popupReady = page.waitForEvent("popup"); await area(page).getByRole("button", { name: "Preview saved PPM v1", exact: true }).click(); const popup = await popupReady; await popup.waitForURL(/review-pdf.test/); expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  // Chrome renders its native PDF extension outside the page DOM. Wait for a
  // substantive painted frame; exact text is checked by the private PDF parse receipt.
  await expect.poll(async () => (await popup.screenshot()).length).toBeGreaterThan(18000);
  const directory = path.resolve(process.cwd(), "../../artifacts/ppm-approval-preview-qa/generated-pdf-proof"); await mkdir(directory, { recursive: true }); await popup.screenshot({ path: path.join(directory, `${info.project.name}-real-generated-pdf-preview.png`) }); await popup.close();
  const downloaded = page.waitForEvent("popup"); await area(page).getByRole("button", { name: "Download PDF v1", exact: true }).click(); const downloadTab = await downloaded; const file = await downloadTab.waitForEvent("download"); const stream = await file.createReadStream(), chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk)); const bytes = Buffer.concat(chunks); expect(bytes).toEqual(f.actualPdf); expect(createHash("sha256").update(bytes).digest("hex")).toBe("604fd276ed93c15081d4f43f0c8593780fee46da6f5255f00199249955ef287a"); expect(file.suggestedFilename()).toBe("Synthetic-PPM-v1.pdf"); await downloadTab.close();
  expect(f.requests.filter(row => row.path.includes("/versions/")).map(row => row.path.split("/versions/")[1])).toEqual(["synthetic-generated-preview-v1/url?download=false", "synthetic-generated-preview-v1/url?download=true"]); expect(f.requests.filter(row => row.method !== "GET" && !row.path.includes("/versions/"))).toEqual([]); expect(f.errors).toEqual([]);
});
