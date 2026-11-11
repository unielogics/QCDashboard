import { expect, test, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GUIDANCE_LISTING_ID as ID, OTHER_GUIDANCE_LISTING_ID as OTHER_ID, GUIDANCE_INTAKE_ID, PPM_BLOCKER, PPM_ISSUE, STALE_FILE_MESSAGE, BUDGET_ISSUES, COVERAGE_ISSUE, guidanceBudget, guidanceListing } from "./fixtures/marketplaceErrorGuidance";

const ORIGIN = "https://listing-guidance.test";
let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-listing-guidance-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useCurrentUser" ? "export const useCurrentUser=()=>({data:{role:'super_admin'},isLoading:false});" : `export const ${name}=()=>({});`).join("\n")}`,
    "next/navigation": `import{useSyncExternalStore}from'react';let current='${ID}';const listeners=new Set();window.switchListing=id=>{current=id;listeners.forEach(fn=>fn())};const router={push:url=>window.fixtureNavigation=url};export const useParams=()=>({id:useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>current,()=>current)});export const useRouter=()=>router;const search=new URLSearchParams(location.search);export const useSearchParams=()=>search;export const usePathname=()=>'/admin/marketplace/'+current;`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-staff-token'});export const visualQaUser=()=>null;",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import ListingEditorPage from'@/app/admin/marketplace/[id]/page';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.refreshListing=()=>client.invalidateQueries({queryKey:['cp-listing']});
    window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff-token','Content-Type':'application/json'}});const body=await response.json();if(!response.ok){const error=new Error(body.detail||'Synthetic request failed');error.status=response.status;error.body=body;throw error}return body};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><ConfirmationProvider><ListingEditorPage/></ConfirmationProvider></main></QueryClientProvider>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

type Json = Record<string, unknown>;
async function fixture(page: Page, options: { ready?: boolean; linked?: boolean; failure?: "fields" | "canonical" | "unknown"; duplicates?: boolean; pendingUpload?: boolean; serverPublishBlocked?: boolean; stalePublish?: boolean; budgetIssues?: boolean; coverageIssue?: boolean; uploadFailure?: boolean; realPopup?: boolean; holdProfile?: boolean; failRefresh?: boolean } = {}) {
  let listing = guidanceListing({ ...options, ...(options.budgetIssues ? { issues: BUDGET_ISSUES } : options.coverageIssue ? { issues: [COVERAGE_ISSUE] } : options.failRefresh ? { issues: [{ code: "financing_stale", message: "Refresh financing from the file before publishing", section: "snapshot" }] } : {}) }), other = guidanceListing({ other: true });
  if (options.duplicates) listing = { ...listing, publish_issues: [PPM_ISSUE, PPM_ISSUE], publish_blockers: [PPM_BLOCKER, PPM_BLOCKER] };
  let failed = false, chooserCount = 0;
  let releaseProfile = () => {}; const profileGate = options.holdProfile ? new Promise<void>(resolve => { releaseProfile = resolve; }) : Promise.resolve();
  const requests: Array<{ method: string; path: string; body: Json }> = [], errors: string[] = [], prompts: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("filechooser", () => { chooserCount += 1; });
  page.on("dialog", dialog => { prompts.push(dialog.type()); void dialog.accept("Synthetic approval for isolated QA"); });
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname, method = request.method();
    if (pathname === "/mock-upload") { requests.push({ method, path: pathname, body: {} }); expect(method).toBe("PUT"); return route.fulfill({ status: 200, body: "" }); }
    if (!pathname.startsWith("/api/v1/")) return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    const body = request.postData() ? request.postDataJSON() as Json : {};
    requests.push({ method, path: pathname, body }); expect(request.headers().authorization).toBe("Bearer synthetic-staff-token");
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (pathname.endsWith(`/listings/${ID}`) || pathname.endsWith(`/listings/${OTHER_ID}`)) {
      if (method === "PATCH") {
        if (options.failure && !failed) {
          failed = true;
          if (options.failure === "unknown") return json({ detail: "Synthetic service unavailable while reading valuation_source; no field target was provided" }, 503);
          const detail = options.failure === "canonical" ? [{ type: "value_error", loc: ["body", "offered_amount"], msg: "Shared investor funding needs review", input: body.offered_amount }] : [
            { type: "value_error", loc: ["body", "valuation_source"], msg: "Valuation source needs detail", input: body.valuation_source },
            { type: "value_error", loc: ["body", "title_status"], msg: "Title status needs detail", input: body.title_status },
            { type: "value_error", loc: ["body", "valuation_source"], msg: "Valuation source needs detail", input: body.valuation_source },
          ];
          return json({ detail }, 422);
        }
        if (pathname.endsWith(ID)) listing = { ...listing, ...body } as typeof listing; else other = { ...other, ...body } as typeof other;
      } else expect(method).toBe("GET");
      return json(pathname.endsWith(ID) ? listing : other);
    }
    if (pathname.endsWith("/documents/upload-init")) {
      if (options.uploadFailure) return json({ detail: [{ type: "value_error", loc: ["body", "s3_key"], msg: "Synthetic document storage path requires review" }] }, 422);
      return json({ document_id: "synthetic-ppm", upload_url: `${ORIGIN}/mock-upload`, headers: { "Content-Type": "application/pdf" }, s3_key: "synthetic-only" });
    }
    if (pathname.endsWith("/documents/upload-complete")) {
      listing = guidanceListing({ ...options, ready: true });
      if (options.pendingUpload) listing = { ...listing, publish_blockers: [PPM_BLOCKER], publish_issues: [PPM_ISSUE], documents: listing.documents.map(document => ({ ...document, status: "pending" })) };
      return json(listing.documents[0]);
    }
    if (pathname.endsWith("/publish")) {
      if (options.stalePublish) return json({ detail: STALE_FILE_MESSAGE }, 409);
      if (options.serverPublishBlocked) { listing = guidanceListing({ ...options, ready: false }); return json({ detail: { code: "incomplete", message: `Fill in: ${PPM_BLOCKER}`, publish_issues: [PPM_ISSUE] } }, 409); }
      listing = { ...listing, status: "open", published_at: "2026-11-11T13:00:00Z" }; return json(listing);
    }
    if (pathname.endsWith("/refresh-snapshot")) {
      if (options.failRefresh && !failed) { failed = true; return json({ detail: "Synthetic snapshot refresh failed" }, 503); }
      listing = { ...listing, publish_blockers: [], publish_issues: [] }; return json(listing);
    }
    if (pathname.endsWith("/deal-budget") && method === "GET") return json(guidanceBudget());
    if (pathname.endsWith("/deal-budget/preview") && method === "POST") return json(guidanceBudget());
    if (/\/application-profiles\/[^/]+$/.test(pathname) && method === "GET") { await profileGate; return json({ id: pathname.split("/").at(-1), intake_id: GUIDANCE_INTAKE_ID }); }
    throw new Error(`Unexpected guidance fixture request: ${method} ${pathname}`);
  });
  if (!options.realPopup) await page.addInitScript(() => {
    const opened: Array<{ url: string; target: string }> = []; (window as unknown as { openedOwners: typeof opened }).openedOwners = opened;
    window.open = (url, target) => {
      const record = { url: String(url ?? ""), target: target ?? "" }; opened.push(record); let closed = false;
      return { opener: null, document: { title: "", body: { textContent: "" } }, get closed() { return closed; }, close() { closed = true; }, location: { replace(value: string) { record.url = String(value); } } } as unknown as Window;
    };
  });
  else await page.context().route("**/*", route => route.fulfill({ contentType: "text/html", body: "<html><body><h1>Synthetic linked-file destination</h1></body></html>" }));
  await page.goto(ORIGIN);
  await expect(page.getByRole("heading", { name: /CP-GUIDANCE-QA/ })).toBeVisible();
  return { requests, errors, prompts, releaseProfile, chooserCount: () => chooserCount,
    refresh: async () => { listing = { ...listing, updated_at: "2026-11-11T13:00:00Z" }; await page.evaluate(() => (window as unknown as { refreshListing: () => Promise<void> }).refreshListing()); },
    readyPpm: async () => { listing = { ...listing, publish_blockers: [], publish_issues: [], documents: listing.documents.map(document => ({ ...document, status: "ready" })) }; await page.evaluate(() => (window as unknown as { refreshListing: () => Promise<void> }).refreshListing()); } };
}

const writes = (f: Awaited<ReturnType<typeof fixture>>) => f.requests.filter(row => row.method !== "GET" && !row.path.endsWith("/deal-budget/preview"));
const uploadInput = (page: Page) => page.locator('input[type="file"]');
const termsTab = (page: Page) => page.getByRole("tab", { name: "Terms and narrative", exact: true });
const documentsTab = (page: Page) => page.getByRole("tab", { name: /^Documents/ });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

async function typeContinuously(page: Page, input: Locator, value: string) {
  await input.click(); const target = await input.elementHandle();
  for (const character of value) { await page.keyboard.type(character); expect(await target!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true); }
  await expect(input).toHaveValue(value); await target?.dispose();
}

const summary = (page: Page) => page.getByRole("region", { name: "Marketplace issues to resolve", exact: true });
const tinyPdf = { name: "Synthetic-Offering.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% Synthetic transport fixture, no customer data.\n%%EOF\n") };
const documentKind = (page: Page) => page.locator("select:visible");

test("Publish guides missing PPM to its visible control once and retains the dirty Terms draft", async ({ page }, info) => {
  const f = await fixture(page, { duplicates: true, linked: true });
  await typeContinuously(page, field(page, "Valuation source"), "Unsaved appraisal source");
  await typeContinuously(page, field(page, "Title"), "Unsaved title review");
  await expect(summary(page).locator("li")).toHaveCount(1);
  await page.getByRole("button", { name: "Publish offer", exact: true }).click();
  await expect(documentsTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(documentKind(page)).toHaveValue("ppm"); await expect(uploadInput(page)).toBeFocused(); await expect(uploadInput(page)).toBeInViewport();
  await expect(uploadInput(page)).toHaveClass(/highlight/);
  expect(f.chooserCount()).toBe(0); expect(writes(f)).toEqual([]); expect(f.prompts).toEqual([]);
  await expect(page.getByText(/^Before publishing:/)).toHaveCount(0);
  await page.screenshot({ path: path.resolve(process.cwd(), "../../artifacts/marketplace-error-guidance-qa", info.project.name, "ppm-guidance.png") });
  await termsTab(page).click(); await expect(field(page, "Valuation source")).toHaveValue("Unsaved appraisal source"); await expect(field(page, "Title")).toHaveValue("Unsaved title review");
  await field(page, "Valuation source").click(); await page.keyboard.press("End"); await page.keyboard.type(" kept"); await expect(field(page, "Valuation source")).toBeFocused();
  await expect(field(page, "Valuation source")).toHaveValue("Unsaved appraisal source kept"); expect(f.errors).toEqual([]);
});

test("422 errors dedupe, focus exact fields, stay inline and clear after a successful retry", async ({ page }, info) => {
  const f = await fixture(page, { ready: true, failure: "fields" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(summary(page).locator("li")).toHaveCount(2);
  await expect(field(page, "Valuation source")).toBeFocused();
  await expect(field(page, "Valuation source")).toBeInViewport();
  await expect(field(page, "Valuation source")).toHaveAttribute("aria-invalid", "true");
  await expect(field(page, "Title")).toHaveAttribute("aria-invalid", "true");
  const inlineId = await field(page, "Valuation source").getAttribute("aria-describedby"); expect(inlineId).toBeTruthy();
  await expect(page.locator(`[id="${inlineId}"]`)).toContainText("Valuation source needs detail");
  // A successful document operation must not erase unrelated Terms errors.
  await documentsTab(page).click(); await uploadInput(page).setInputFiles(tinyPdf);
  await expect(page.getByText(/Synthetic-Offering.pdf uploaded as/)).toBeVisible();
  await expect(summary(page).locator("li")).toHaveCount(2); await expect(documentsTab(page)).toHaveAttribute("aria-selected", "true"); await termsTab(page).click();
  await summary(page).getByRole("button", { name: "Fix Title", exact: true }).click(); await expect(field(page, "Title")).toBeFocused(); await expect(field(page, "Title")).toBeInViewport();
  await expect(field(page, "Title")).toHaveClass(/highlight/); await expect(field(page, "Title")).toHaveCSS("outline-style", "solid"); await expect(field(page, "Title")).toHaveCSS("outline-width", "3px");
  await page.screenshot({ path: path.resolve(process.cwd(), "../../artifacts/marketplace-error-guidance-qa", info.project.name, "exact-field-errors.png") });
  await typeContinuously(page, field(page, "Title"), "Lien search reviewed"); await typeContinuously(page, field(page, "Valuation source"), "Independent appraisal reviewed");
  await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(summary(page)).toHaveCount(0);
  expect(writes(f).filter(row => row.method === "PATCH")).toHaveLength(2); expect(f.errors).toEqual([]);
});

test("a protected funding validation opens the real shared budget owner", async ({ page }) => {
  const f = await fixture(page, { linked: true, ready: true, failure: "canonical" });
  await typeContinuously(page, field(page, "Valuation source"), "Preserved linked-file edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(field(page, "Capital to raise from investors, $")).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "Deal budget editor", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Deal budget editor", exact: true })).toBeInViewport();
  await page.getByRole("dialog", { name: "Deal budget editor", exact: true }).locator(".drawer-f").getByRole("button", { name: "Close", exact: true }).click();
  await expect(field(page, "Valuation source")).toHaveValue("Preserved linked-file edit");
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(0); expect(f.errors).toEqual([]);
});

test("passive blockers and background listing refresh never steal input focus", async ({ page }) => {
  const f = await fixture(page); await expect(termsTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(uploadInput(page)).not.toBeVisible();
  const input = field(page, "Servicer, as shown"); await typeContinuously(page, input, "Draft servicer");
  const target = await input.elementHandle(); await f.refresh();
  expect(await target!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true);
  await page.keyboard.type(" retained"); await expect(input).toHaveValue("Draft servicer retained"); await expect(termsTab(page)).toHaveAttribute("aria-selected", "true");
  expect(f.chooserCount()).toBe(0); expect(writes(f)).toEqual([]); expect(f.errors).toEqual([]); await target?.dispose();
});

test("PPM upload remains blocked while pending and clears only after server READY refresh", async ({ page }) => {
  const f = await fixture(page, { pendingUpload: true });
  await page.getByRole("button", { name: "Publish offer", exact: true }).click(); expect(writes(f)).toEqual([]);
  await uploadInput(page).setInputFiles(tinyPdf);
  await expect(page.getByText("pending", { exact: true })).toBeVisible(); await expect(summary(page)).toContainText(PPM_BLOCKER);
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(0);
  await f.readyPpm(); await expect(page.getByText("ready", { exact: true })).toBeVisible(); await expect(summary(page)).toHaveCount(0);
  expect(f.requests.filter(row => row.path.endsWith("/documents/upload-init"))).toHaveLength(1);
  expect(f.requests.filter(row => row.path === "/mock-upload")).toHaveLength(1);
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(0); expect(f.chooserCount()).toBe(0); expect(f.errors).toEqual([]);
});

test("eligible Publish still requires the real confirmation before its mocked request", async ({ page }) => {
  const f = await fixture(page, { ready: true });
  await page.getByRole("button", { name: "Publish offer", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Review before running", exact: true });
  await expect(confirmation).toContainText("Publish CP-GUIDANCE-QA to members?"); expect(writes(f)).toEqual([]);
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click(); expect(writes(f)).toEqual([]);
  await page.getByRole("button", { name: "Publish offer", exact: true }).click(); await confirmation.getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/publish")).length).toBe(1);
  expect(f.requests.find(row => row.path.endsWith("/publish"))?.body.confirmed).toBe(true); expect(f.prompts).toEqual(["prompt", "prompt"]); expect(f.errors).toEqual([]);
});

test("a server incomplete response uses structured PPM guidance after an explicit publish attempt", async ({ page }) => {
  const f = await fixture(page, { ready: true, serverPublishBlocked: true });
  await page.getByRole("button", { name: "Publish offer", exact: true }).click();
  await page.getByRole("dialog", { name: "Review before running", exact: true }).getByRole("button", { name: "Publish", exact: true }).click();
  await expect(documentsTab(page)).toHaveAttribute("aria-selected", "true"); await expect(uploadInput(page)).toBeFocused(); await expect(documentKind(page)).toHaveValue("ppm");
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(1); expect(f.requests.filter(row => row.path.includes("upload-init"))).toHaveLength(0); expect(f.chooserCount()).toBe(0); expect(f.errors).toEqual([]);
  await uploadInput(page).setInputFiles(tinyPdf); await expect(page.getByText("ready", { exact: true })).toBeVisible();
  await expect(summary(page)).toHaveCount(0); expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(1);
});

test("unknown service errors show their message without inventing an input target", async ({ page }) => {
  const f = await fixture(page, { ready: true, failure: "unknown" }); await typeContinuously(page, field(page, "Valuation source"), "Preserved on unknown error");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(summary(page)).toContainText("Synthetic service unavailable while reading valuation_source"); await expect(summary(page).getByRole("button")).toHaveCount(0);
  await expect(field(page, "Valuation source")).not.toBeFocused(); await expect(field(page, "Valuation source")).not.toHaveAttribute("aria-invalid", "true");
  await expect(field(page, "Valuation source")).toHaveValue("Preserved on unknown error"); await expect(termsTab(page)).toHaveAttribute("aria-selected", "true"); expect(f.errors).toEqual([]);
});

test("listing switches scope both validation issues and unsaved Terms values", async ({ page }) => {
  const f = await fixture(page, { ready: true, failure: "fields" });
  // Warm the second query first: loading/unmounting must not conceal a draft leak.
  await page.evaluate(id => (window as unknown as { switchListing: (id: string) => void }).switchListing(id), OTHER_ID);
  await expect(page.getByRole("heading", { name: /CP-OTHER-QA/ })).toBeVisible();
  await page.evaluate(id => (window as unknown as { switchListing: (id: string) => void }).switchListing(id), ID);
  await expect(page.getByRole("heading", { name: /CP-GUIDANCE-QA/ })).toBeVisible();
  await typeContinuously(page, field(page, "Valuation source"), "Only first listing draft");
  await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(summary(page)).toContainText("Valuation source needs detail");
  await page.evaluate(id => (window as unknown as { switchListing: (id: string) => void }).switchListing(id), OTHER_ID);
  await expect(page.getByRole("heading", { name: /CP-OTHER-QA/ })).toBeVisible(); await termsTab(page).click();
  await expect(field(page, "Valuation source")).toHaveValue(""); await expect(field(page, "Deal title")).toHaveValue("Other synthetic listing");
  await expect(summary(page)).not.toContainText("Valuation source needs detail"); expect(f.errors).toEqual([]);
});

test("distinct budget reasons stay visible while sharing one correct owner action", async ({ page }) => {
  const f = await fixture(page, { linked: true, budgetIssues: true });
  for (const issue of BUDGET_ISSUES) await expect(summary(page)).toContainText(issue.message);
  await expect(summary(page).getByRole("button", { name: "Review shared deal budget", exact: true })).toHaveCount(1);
  await summary(page).getByRole("button", { name: "Review shared deal budget", exact: true }).click();
  const budget = page.getByRole("dialog", { name: "Deal budget editor", exact: true });
  await expect(budget).toBeVisible(); expect(writes(f)).toEqual([]);
  await budget.locator(".drawer-f").getByRole("button", { name: "Close", exact: true }).click();
  await summary(page).getByRole("button", { name: "Review shared deal budget", exact: true }).click();
  await expect(budget).toBeVisible(); expect(writes(f)).toEqual([]); expect(f.errors).toEqual([]);
});

test("unknown document validation retains the non-PPM document kind without guessing PPM", async ({ page }) => {
  const f = await fixture(page, { ready: true, uploadFailure: true }); await documentsTab(page).click();
  await documentKind(page).selectOption("valuation"); await uploadInput(page).setInputFiles(tinyPdf);
  await expect(summary(page)).toContainText("Synthetic document storage path requires review");
  await expect(documentKind(page)).toHaveValue("valuation"); await expect(summary(page).getByRole("button", { name: "Upload PPM in Documents", exact: true })).toHaveCount(0);
  expect(f.requests.filter(row => row.path === "/mock-upload")).toHaveLength(0); expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(0); expect(f.errors).toEqual([]);
});

test("explicit owner navigation resolves the linked file and opens a new tab without losing Terms", async ({ page }) => {
  const f = await fixture(page, { linked: true, coverageIssue: true }); await typeContinuously(page, field(page, "Valuation source"), "Retained beside owner tab");
  await expect(summary(page)).toContainText("new tab so your unsaved listing edits stay here");
  expect(f.requests.filter(row => /\/application-profiles\/[^/]+$/.test(row.path))).toHaveLength(0);
  await summary(page).getByRole("button", { name: "Open coverage plan in new tab", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { openedOwners: unknown[] }).openedOwners.length)).toBe(1);
  const opened = await page.evaluate(() => (window as unknown as { openedOwners: Array<{ url: string; target: string }> }).openedOwners[0]);
  expect(opened.target).toBe("_blank"); const ownerUrl = new URL(opened.url, ORIGIN);
  expect(ownerUrl.pathname).toBe(`/files/${GUIDANCE_INTAKE_ID}`); expect(ownerUrl.searchParams.get("section")).toBe("overview"); expect(ownerUrl.searchParams.get("financial_action")).toBe("coverage");
  await expect(field(page, "Valuation source")).toHaveValue("Retained beside owner tab"); expect(page.url()).toBe(`${ORIGIN}/`); expect(writes(f)).toEqual([]); expect(f.errors).toEqual([]);
});

test("real owner popup reaches the resolved destination with opener protection and no network escape", async ({ page }) => {
  const f = await fixture(page, { linked: true, coverageIssue: true, realPopup: true, holdProfile: true });
  await typeContinuously(page, field(page, "Valuation source"), "Draft stays in real opener");
  const popupPromise = page.context().waitForEvent("page");
  await summary(page).getByRole("button", { name: "Open coverage plan in new tab", exact: true }).click();
  const popup = await popupPromise;
  await expect.poll(() => f.requests.filter(row => /\/application-profiles\/[^/]+$/.test(row.path)).length).toBe(1);
  expect(popup.url()).toBe("about:blank"); expect(await popup.evaluate(() => window.opener === null)).toBe(true); f.releaseProfile();
  await expect(popup).toHaveURL(new RegExp(`/files/${GUIDANCE_INTAKE_ID}\\?`));
  const destination = new URL(popup.url()); expect(destination.searchParams.get("section")).toBe("overview"); expect(destination.searchParams.get("financial_action")).toBe("coverage");
  await expect(popup.getByRole("heading", { name: "Synthetic linked-file destination" })).toBeVisible();
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await expect(field(page, "Valuation source")).toHaveValue("Draft stays in real opener"); expect(page.url()).toBe(`${ORIGIN}/`); expect(writes(f)).toEqual([]); expect(f.errors).toEqual([]); await popup.close();
});

test("successful snapshot retry removes the corresponding action error without publishing", async ({ page }) => {
  const f = await fixture(page, { linked: true, failRefresh: true });
  await summary(page).getByRole("button", { name: "Refresh saved file figures", exact: true }).click();
  await expect(summary(page)).toContainText("Synthetic snapshot refresh failed");
  await summary(page).getByRole("button", { name: "Refresh saved file figures", exact: true }).click();
  await expect(summary(page)).toHaveCount(0); expect(f.requests.filter(row => row.path.endsWith("/refresh-snapshot"))).toHaveLength(2);
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(0); expect(f.errors).toEqual([]);
});

test("the exact stale-file publish error requires an explicit snapshot fix and clears after success", async ({ page }) => {
  const f = await fixture(page, { linked: true, ready: true, stalePublish: true });
  await page.getByRole("button", { name: "Publish offer", exact: true }).click();
  await page.getByRole("dialog", { name: "Review before running", exact: true }).getByRole("button", { name: "Publish", exact: true }).click();
  await expect(summary(page)).toContainText(STALE_FILE_MESSAGE); expect(f.requests.filter(row => row.path.endsWith("/refresh-snapshot"))).toHaveLength(0);
  await summary(page).getByRole("button", { name: "Refresh saved file figures", exact: true }).click();
  await expect(summary(page)).toHaveCount(0); expect(f.requests.filter(row => row.path.endsWith("/refresh-snapshot"))).toHaveLength(1);
  expect(f.requests.filter(row => row.path.endsWith("/publish"))).toHaveLength(1); expect(f.errors).toEqual([]);
});
