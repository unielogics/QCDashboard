import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { approvedMembers, DOC_LISTING_ID as ID, DOC_REF as REF, documentListing, fileCatalog, MEMBER_A, MEMBER_B, memberListing, offeringDocuments, SOURCE_ID } from "./fixtures/investorDocumentCockpit";
import { guidanceBudget } from "./fixtures/marketplaceErrorGuidance";
import { savedTermsTransportPdf } from "./fixtures/savedTermsDownload";

const ADMIN = "https://document-admin.test", PORTAL = "https://document-member.test", STORAGE = "https://document-storage.test";
const capitalRoot = process.env.QC_CAPITAL_SOURCE_ROOT;
let adminScript: Buffer, adminCss: Buffer, portalScript: Buffer, portalCss: Buffer;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-investor-documents-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const adminMocks: Record<string, string> = {
    "@/hooks/useApi": `const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useCurrentUser" ? "export const useCurrentUser=()=>({data:{id:'synthetic-staff',role:new URLSearchParams(location.search).get('role')||'super_admin'},isLoading:false,authReady:true,authScope:'synthetic-staff:synthetic-staff-session'});" : `export const ${name}=()=>({});`).join("\n")}`,
    "next/navigation": `export const useParams=()=>({id:'${ID}'});const router={push:url=>window.fixtureNavigation=url};export const useRouter=()=>router;const search=new URLSearchParams(location.search);export const useSearchParams=()=>search;export const usePathname=()=>'/admin/marketplace/${ID}';`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,userId:'synthetic-staff',sessionId:'synthetic-staff-session',getToken:async()=> 'synthetic-staff'});export const visualQaUser=()=>null;",
  };
  async function bundle(source: string, mocks: Record<string, string>, contents: string, name: string) {
    await esbuild.build({ stdin: { resolveDir: source, loader: "tsx", contents }, outfile: path.join(directory, `${name}.js`), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(source, "node_modules")], alias: { "@": path.join(source, "src") }, define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: name === "portal" ? PORTAL : ADMIN }) }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-auth", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path === "./useMe" ? "@/lib/useMe" : args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: source })); } }] });
    return Promise.all([readFile(path.join(directory, `${name}.js`)), readFile(path.join(directory, `${name}.css`))]);
  }
  [adminScript, adminCss] = await bundle(root, adminMocks, `import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Page from'@/app/admin/marketplace/[id]/page';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.refreshListing=()=>client.invalidateQueries({queryKey:['cp-listing']});window.fixtureApi=async(path,options={})=>{const response=await fetch('${ADMIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff','Content-Type':'application/json'}});const body=await response.json();if(!response.ok){const error=new Error(typeof body.detail==='string'?body.detail:body.detail?.message||'Synthetic request failed');error.status=response.status;error.body=body;throw error}return body};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><ConfirmationProvider><Page/></ConfirmationProvider></main></QueryClientProvider>);`, "admin");
  const adminConfig = require("tailwindcss/loadConfig")(path.join(root, "tailwind.config.ts"));
  const adminProcessed = await require("postcss")([require("tailwindcss")({ ...adminConfig, content: [path.join(root, "src/**/*.{ts,tsx}")] })]).process(adminCss.toString(), { from: path.join(directory, "admin.css") });
  adminCss = Buffer.from(adminProcessed.css);
  if (capitalRoot) {
    await stat(path.join(capitalRoot, "src/app/marketplace/[ref]/page.tsx"));
    const memberMocks: Record<string, string> = {
      "next/navigation": `export const useParams=()=>({ref:'${REF}'});const router={push:url=>window.fixtureNavigation=url,replace:url=>window.fixtureNavigation=url};export const useRouter=()=>router;`,
      "@clerk/nextjs": `import{useSyncExternalStore}from'react';const params=new URLSearchParams(location.search);let member=params.get('member')||'a';const listeners=new Set();window.switchInvestor=value=>{member=value;listeners.forEach(fn=>fn())};const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)},snapshot=()=>member;const getToken=async()=>member==='b'?'synthetic-member-b':'synthetic-member-a';export const useAuth=()=>{const current=useSyncExternalStore(subscribe,snapshot,snapshot);const anonymous=current==='unresolved'||current==='out';return{userId:anonymous?null:'synthetic-user-'+current,sessionId:anonymous?null:'synthetic-session-'+current,isLoaded:current!=='unresolved',isSignedIn:!anonymous,getToken}};export const useUser=()=>{const current=useSyncExternalStore(subscribe,snapshot,snapshot);return{isLoaded:current!=='unresolved'}};`,
    };
    [portalScript, portalCss] = await bundle(capitalRoot, memberMocks, `import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Page from'@/app/marketplace/[ref]/page';import'@/app/globals.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><Page/></QueryClientProvider>);`, "portal");
    const capitalRequire = createRequire(path.join(capitalRoot, "package.json"));
    const config = capitalRequire("tailwindcss/loadConfig")(path.join(capitalRoot, "tailwind.config.ts"));
    const processed = await capitalRequire("postcss")([capitalRequire("tailwindcss")({ ...config, content: [path.join(capitalRoot, "src/**/*.{ts,tsx}")] })]).process(portalCss.toString(), { from: path.join(directory, "portal.css") });
    portalCss = Buffer.from(processed.css);
  }
});

type Json = Record<string, unknown>;
async function setup(context: BrowserContext, options: { missingPpm?: boolean; failGrant?: boolean; holdGrant?: boolean; inventoryError?: boolean; holdSecondInvestor?: boolean } = {}) {
  let listing = documentListing(!options.missingPpm), grant: Json | null = null, grantFailure = !!options.failGrant, inventoryFailure = !!options.inventoryError;
  const requests: Array<{ method: string; path: string; body: Json; auth: string }> = [], errors: string[] = [], storageRequests: string[] = [];
  let releaseGrant = () => {}; const gate = options.holdGrant ? new Promise<void>(resolve => { releaseGrant = resolve; }) : Promise.resolve();
  let releaseUrl = () => {}; let urlGate: Promise<void> = Promise.resolve();
  let releaseSecondInvestor = () => {}; const secondInvestorGate = options.holdSecondInvestor ? new Promise<void>(resolve => { releaseSecondInvestor = resolve; }) : Promise.resolve();
  const holdUrl = () => { urlGate = new Promise<void>(resolve => { releaseUrl = resolve; }); };
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  await context.route("**/*", async (route: Route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === STORAGE) {
      storageRequests.push(request.url());
      return route.fulfill(url.searchParams.get("download") === "true" ? { contentType: "application/pdf", headers: { "Content-Disposition": 'attachment; filename="Synthetic-Scoped-Document.pdf"' }, body: savedTermsTransportPdf(4) } : { contentType: "text/html", body: "<!doctype html><title>Synthetic scoped PDF transport</title><p>Authorized synthetic document transport</p>" });
    }
    if (![ADMIN, PORTAL].includes(url.origin)) throw new Error(`Unexpected external traffic: ${url.origin}`);
    if (!url.pathname.startsWith("/api/v1/")) {
      const portal = url.origin === PORTAL;
      return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: portal ? portalScript : adminScript } : url.pathname === "/app.css" ? { contentType: "text/css", body: portal ? portalCss : adminCss } : { contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    }
    const p = url.pathname.slice("/api/v1".length), body = request.postData() ? request.postDataJSON() as Json : {}, auth = request.headers().authorization ?? "";
    requests.push({ method, path: p + url.search, body, auth });
    if (url.origin === ADMIN) expect(auth).toBe("Bearer synthetic-staff"); else expect(["Bearer synthetic-member-a", "Bearer synthetic-member-b"]).toContain(auth);
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (p === "/auth/me") return json({ id: auth.endsWith("member-b") ? "synthetic-user-b" : "synthetic-user-a", name: "Example investor", email: "investor@example.test", role: "capital_partner", consoles: [{ key: "capital", label: "Capital", url: PORTAL }] });
    if (p === "/capital/me") return json({ user_id: auth.endsWith("member-b") ? "synthetic-user-b" : "synthetic-user-a", member_id: auth.endsWith("member-b") ? MEMBER_B : MEMBER_A, name: "Example investor", role: "capital_partner", entities: [], status: "approved", preview: false, gate: { cleared: !(request.headers().referer ?? "").includes("uncleared") } });
    if (p === `/capital/admin/listings/${ID}`) {
      if (method === "PATCH") listing = { ...listing, ...body } as typeof listing; else expect(method).toBe("GET");
      return json(listing);
    }
    if (p === `/capital/listings/${REF}`) { expect(method).toBe("GET"); return json({ ...memberListing(), documents: listing.documents }); }
    if (p === "/capital/admin/members") { expect(url.searchParams.get("status_filter")).toBe("approved"); return json(approvedMembers); }
    if (p.endsWith("/document-grants")) { expect(method).toBe("GET"); return json(grant ? [grant] : []); }
    if (p.includes("/document-grants/")) {
      expect(method).toBe("PUT"); await gate;
      if (grantFailure) { grantFailure = false; return json({ detail: "Synthetic access approval unavailable; no approval saved" }, 503); }
      grant = { id: "synthetic-grant", member_id: p.split("/").at(-1), listing_id: ID, status: body.status, file_count: 1, granted_at: "2026-11-11T14:00:00Z", reason: body.reason };
      return json(grant);
    }
    if (p.endsWith("/file-documents")) {
      expect(method).toBe("GET");
      if (auth.endsWith("member-b")) await secondInvestorGate;
      if (url.origin === ADMIN && inventoryFailure) { inventoryFailure = false; return json({ detail: "Synthetic inventory read unavailable" }, 503); }
      return json(fileCatalog(url.origin === ADMIN, grant?.status === "active" && grant.member_id === (auth.endsWith("member-b") ? MEMBER_B : MEMBER_A)));
    }
    if (p.includes("/file-documents/") && p.endsWith("/url")) {
      expect(method).toBe("POST"); await urlGate;
      if (url.origin === PORTAL && (grant?.status !== "active" || grant.member_id !== (auth.endsWith("member-b") ? MEMBER_B : MEMBER_A))) return json({ detail: "Document engagement access is not approved" }, 403);
      return json({ url: `${STORAGE}/original-${SOURCE_ID}.pdf?download=${url.searchParams.get("download")}`, expires_in: 60 });
    }
    if (p.includes("/documents/") && p.endsWith("/url")) { expect(method).toBe("POST"); await urlGate; return json({ url: `${STORAGE}/offering-${p.split("/").at(-2)}.pdf?download=${url.searchParams.get("download")}`, expires_in: 60 }); }
    if (p.endsWith("/publish-package")) {
      expect(method).toBe("POST"); listing = { ...listing, documents: offeringDocuments.filter(row => row.kind !== "ppm"), source_snapshot: { published: { package: { documents: [{ artifact_id: "synthetic-artifact", document_id: "synthetic-summary", version: 2 }] } } } };
      return json(listing);
    }
    if (p.endsWith("/deal-budget") || p.endsWith("/deal-budget/preview")) return json(guidanceBudget());
    throw new Error(`Unexpected document fixture API: ${method} ${p}`);
  });
  return { requests, errors, storageRequests, releaseGrant, releaseSecondInvestor, holdUrl, releaseUrl: () => releaseUrl(), revoke: () => { if (grant) grant.status = "revoked"; } };
}

async function admin(context: BrowserContext, query = "") { const page = await context.newPage(); await page.goto(ADMIN + query); await expect(page.getByRole("heading", { name: new RegExp(REF) })).toBeVisible(); return page; }
async function portal(context: BrowserContext, query = "") { const page = await context.newPage(); await page.goto(PORTAL + query); await expect(page.getByRole("dialog", { name: "Synthetic investor document offering" })).toBeVisible(); return page; }
async function openApproval(page: Page) { await page.getByText("Engagement approval and investor access", { exact: true }).click(); return page.getByRole("region", { name: "Investor document engagement approval" }); }
async function approve(page: Page) { const section = await openApproval(page); await section.getByLabel("Investor for document access").selectOption(MEMBER_A); await section.getByLabel("Document engagement reason").fill("Confirmed synthetic engagement for scoped review"); await section.getByRole("checkbox").check(); await section.getByRole("button", { name: "Release current eligible documents" }).click(); await expect(section.getByRole("status")).toContainText("Access approved for 1 current eligible documents"); return section; }
async function protectedPopup(page: Page, fixture: Awaited<ReturnType<typeof setup>>, button: ReturnType<Page["getByRole"]>) {
  fixture.holdUrl(); const popupReady = page.waitForEvent("popup"); await button.click(); const popup = await popupReady; await expect.poll(() => popup.evaluate(() => window.opener === null)).toBe(true); expect(popup.url()).toBe("about:blank");
  if ((await button.innerText()).includes("Download")) {
    const ready = popup.waitForEvent("download"); fixture.releaseUrl(); const download = await ready; expect(download.suggestedFilename()).toBe("Synthetic-Scoped-Document.pdf");
    const stream = await download.createReadStream(), chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk)); expect(Buffer.concat(chunks)).toEqual(savedTermsTransportPdf(4));
  } else { fixture.releaseUrl(); await popup.waitForURL(`${STORAGE}/**`); await expect(popup.getByText("Authorized synthetic document transport")).toBeVisible(); }
  await popup.close();
}

test("staff cockpit has safe totals, protected-file guards and stable dirty Terms inputs", async ({ context }, info) => {
  const f = await setup(context), page = await admin(context);
  await expect(page.getByRole("table", { name: "Source document inventory" })).toContainText("Business tax returns");
  await page.getByText("Aggregate bank activity · 2 months", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Aggregate bank activity", exact: true })).toContainText("1,000.00 · currency not confirmed");
  const firstBankRow = page.getByRole("table", { name: "Aggregate bank activity", exact: true }).locator("tbody tr").first();
  await expect(firstBankRow.locator("td").nth(0)).toHaveCSS("white-space", "nowrap"); await expect(firstBankRow.locator("td").nth(1)).toHaveCSS("white-space", "nowrap");
  await page.getByText("Year-over-year business tax summary", { exact: true }).click(); await expect(page.getByRole("table", { name: "Business tax year comparison" })).toContainText("+20.00%");
  await page.getByText("Staff source-document preview · 2", { exact: true }).click();
  const protectedRow = page.getByRole("row").filter({ hasText: "Synthetic-Protected-Statement.pdf" }); await expect(protectedRow.getByRole("button", { name: "View", exact: true })).toBeDisabled();
  const input = page.getByLabel("Valuation source", { exact: true }); await input.scrollIntoViewIfNeeded(); await input.click(); const original = await input.elementHandle();
  for (const letter of "Unsaved source review") { await page.keyboard.type(letter); expect(await original!.evaluate(node => node.isConnected && document.activeElement === node)).toBe(true); }
  await page.getByRole("tab", { name: /^Documents/ }).click(); await expect(page.getByRole("table", { name: "Offering documents", exact: true })).toContainText("Generated listing package");
  await page.getByRole("tab", { name: "Terms and narrative", exact: true }).click(); await expect(input).toHaveValue("Unsaved source review"); await original?.dispose();
  await page.getByText("Engagement approval and investor access", { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("staff-document-cockpit.png"), fullPage: false });
  const layout = await page.evaluate(() => ({ width: innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, scale: visualViewport?.scale, overflowing: [...document.querySelectorAll("body *")].filter(node => node.getBoundingClientRect().right > document.documentElement.clientWidth + 4).slice(0, 12).map(node => ({ tag: node.tagName, className: node.className, width: node.getBoundingClientRect().width })) }));
  const geometry = JSON.stringify(layout);
  await writeFile(info.outputPath("staff-layout.json"), geometry); await info.attach("staff-layout.json", { contentType: "application/json", body: geometry });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1); expect(layout.width).toBeLessThanOrEqual(layout.clientWidth + 1);
  const tabs = page.getByRole("tablist", { name: "Listing sections" }); await expect(tabs).toHaveCSS("overflow-x", "auto");
  await expect(page.getByRole("table", { name: "Source document inventory" }).locator("..")).toHaveCSS("overflow-x", "auto");
  await page.getByRole("heading", { name: "File document cockpit", exact: true }).evaluate(node => node.scrollIntoView({ block: "start" })); await page.screenshot({ path: info.outputPath("staff-cockpit-overview.png"), fullPage: false });
  expect(f.requests.filter(row => row.method !== "GET")).toEqual([]); expect(f.errors).toEqual([]);
});

test("explicit generated-package update stays distinct from PPM and uses scoped protected links", async ({ context }) => {
  const f = await setup(context, { missingPpm: true }), page = await admin(context); await page.getByRole("tab", { name: /^Documents/ }).click();
  for (let i = 0; i < 2; i++) { await page.getByRole("button", { name: "Update listing package", exact: true }).click(); await expect(page.getByRole("table", { name: "Offering documents", exact: true })).toContainText("Synthetic-Summary.pdf"); }
  const table = page.getByRole("table", { name: "Offering documents", exact: true }); await expect(table.getByRole("row")).toHaveCount(2); await expect(table).toContainText("Generated listing package"); await expect(table).toContainText("v2");
  await expect(page.getByRole("region", { name: "Marketplace issues to resolve" })).toContainText("private placement memorandum not uploaded");
  await protectedPopup(page, f, table.getByRole("button", { name: "View PDF", exact: true }));
  await protectedPopup(page, f, table.getByRole("button", { name: "Download PDF", exact: true }));
  expect(f.requests.filter(row => row.method !== "GET").map(row => row.path)).toEqual([`/capital/admin/listings/${ID}/publish-package`, `/capital/admin/listings/${ID}/publish-package`, `/capital/admin/listings/${ID}/documents/synthetic-summary/url?download=false`, `/capital/admin/listings/${ID}/documents/synthetic-summary/url?download=true`]); expect(f.errors).toEqual([]);
});

test("approval requires explicit engagement, retains failed reason and blocks double submission", async ({ context }, info) => {
  const f = await setup(context, { failGrant: true, holdGrant: true }), page = await admin(context), section = await openApproval(page), save = section.getByRole("button", { name: "Release current eligible documents" });
  await expect(save).toBeDisabled(); await section.getByLabel("Investor for document access").selectOption(MEMBER_A); await section.getByLabel("Document engagement reason").fill("Confirmed synthetic engagement"); await expect(save).toBeDisabled(); await section.getByRole("checkbox").check(); await save.click();
  await expect(section.getByRole("button", { name: "Updating access…" })).toBeDisabled(); await expect(section.getByLabel("Investor for document access")).toBeDisabled(); f.releaseGrant();
  await expect(section.getByRole("alert")).toContainText("no approval saved"); await expect(section.getByLabel("Document engagement reason")).toHaveValue("Confirmed synthetic engagement"); await save.click(); await expect(section.getByRole("status")).toContainText("Access approved for 1");
  const writes = f.requests.filter(row => row.method === "PUT"); expect(writes).toHaveLength(2); expect(writes[0].body).toEqual({ status: "active", reason: "Confirmed synthetic engagement", engagement_confirmed: true }); expect(writes[1].body).toEqual(writes[0].body); expect(f.errors).toEqual([]);
  await section.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("staff-engagement-approval.png"), fullPage: false });
});

test("inventory retry and existing staff role boundary expose no unintended controls", async ({ context }) => {
  const f = await setup(context, { inventoryError: true }), page = await admin(context); await expect(page.getByRole("alert")).toContainText("inventory could not be loaded"); await page.getByRole("button", { name: "Retry file inventory" }).click(); await expect(page.getByRole("table", { name: "Source document inventory" })).toBeVisible();
  const denied = await context.newPage(); await denied.goto(`${ADMIN}/?role=loan_exec`); await expect(denied.getByRole("heading", { name: new RegExp(REF) })).not.toBeVisible(); await expect(denied.getByText("Engagement approval and investor access", { exact: true })).toHaveCount(0); expect(f.requests.filter(row => row.method !== "GET")).toEqual([]); expect(f.errors).toEqual([]);
});

test.describe("actual cleared-member offering page", () => {
  test.skip(!capitalRoot, "Set QC_CAPITAL_SOURCE_ROOT to the matching Capital Partners source checkout for cross-app browser QA.");
  test("locked originals expose only aggregate catalog while PPM and NET/date summaries remain available", async ({ context }, info) => {
    const f = await setup(context), page = await portal(context), cockpit = page.getByRole("region", { name: "File document cockpit", exact: true });
    await expect(cockpit).toContainText("Original financial documents are locked"); await expect(cockpit.getByRole("table", { name: "Source documents on file" })).toContainText("Business tax returns"); await expect(cockpit.getByRole("button", { name: "View", exact: true })).toHaveCount(0);
    expect(await cockpit.innerHTML()).not.toMatch(new RegExp(`${SOURCE_ID}|Synthetic-Business-Tax|s3_key|account_number|taxpayer_id`));
    await cockpit.locator("summary").filter({ hasText: /^Aggregate bank activity$/ }).click(); await expect(cockpit.getByRole("table", { name: "Aggregate bank activity", exact: true })).toContainText("1,000.00 · currency not confirmed");
    await cockpit.getByText("Year-over-year business tax summary", { exact: true }).click(); await expect(cockpit.getByRole("table", { name: "Business tax comparison" })).toContainText("+20.00%");
    await expect(page.getByRole("region", { name: "Investor net return comparison" })).toContainText(/USD\s+12,600\.00/); await expect(page.getByRole("region", { name: "Investor net return comparison" })).toContainText("7.20%"); await expect(page.getByText("2027-01-15", { exact: true })).toBeVisible(); await expect(page.getByText("2028-01-15", { exact: true })).toBeVisible();
    await protectedPopup(page, f, page.getByRole("button", { name: /Private placement memorandum/ })); await cockpit.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("member-locked-document-cockpit.png"), fullPage: false });
    expect(f.requests.filter(row => row.method !== "GET").map(row => row.path)).toEqual([`/capital/listings/${REF}/documents/synthetic-ppm/url`]); expect(f.errors).toEqual([]);
  });

  test("staff grant is per investor; revocation denies stale download and refresh removes originals", async ({ context }, info) => {
    const f = await setup(context), staff = await admin(context), section = await approve(staff), member = await portal(context), cockpit = member.getByRole("region", { name: "File document cockpit", exact: true });
    await expect(cockpit.getByText("Synthetic-Business-Tax-2025.pdf", { exact: false })).toBeVisible(); await protectedPopup(member, f, cockpit.getByRole("button", { name: "Download", exact: true }));
    const other = await portal(context, "/?member=b"); await expect(other.getByRole("region", { name: "File document cockpit", exact: true })).toContainText("Original financial documents are locked"); await expect(other.getByText("Synthetic-Business-Tax-2025.pdf", { exact: false })).toHaveCount(0);
    await cockpit.scrollIntoViewIfNeeded(); await member.screenshot({ path: info.outputPath("member-approved-document-cockpit.png"), fullPage: false });
    await section.getByLabel("Document engagement reason").fill("Engagement ended; revoke synthetic access"); await section.getByRole("button", { name: "Revoke document access" }).click(); await expect(section.getByRole("status")).toContainText("Document access revoked");
    const before = f.storageRequests.length, closed = member.waitForEvent("popup"); await cockpit.getByRole("button", { name: "View", exact: true }).click(); const rejected = await closed; await expect.poll(() => rejected.isClosed()).toBe(true); await expect(cockpit.getByRole("alert")).toContainText("not approved"); expect(f.storageRequests).toHaveLength(before);
    await cockpit.getByRole("button", { name: "Refresh document access" }).click(); await expect(cockpit).toContainText("Original financial documents are locked"); await expect(cockpit.getByText("Synthetic-Business-Tax-2025.pdf", { exact: false })).toHaveCount(0);
    expect(f.requests.filter(row => row.method !== "GET" && !row.path.includes("/url")).map(row => row.method)).toEqual(["PUT", "PUT"]); expect(f.errors).toEqual([]);
  });

  test("uncleared account does not fetch listing or document inventory", async ({ context }) => {
    const f = await setup(context), page = await context.newPage(); await page.goto(`${PORTAL}/?uncleared=1`); await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureNavigation?: string }).fixtureNavigation)).toBe("/"); expect(f.requests.map(row => row.path)).toEqual(["/auth/me", "/capital/me"]); expect(f.errors).toEqual([]);
  });

  test("account switch hides previous approved original metadata while the next catalog is pending", async ({ context }) => {
    const f = await setup(context, { holdSecondInvestor: true }), staff = await admin(context); await approve(staff);
    const page = await portal(context), cockpit = page.getByRole("region", { name: "File document cockpit", exact: true });
    await expect(cockpit.getByText("Synthetic-Business-Tax-2025.pdf", { exact: false })).toBeVisible();
    await page.evaluate(() => (window as unknown as { switchInvestor: (value: string) => void }).switchInvestor("b"));
    await expect.poll(() => f.requests.some(row => row.path.endsWith("/file-documents") && row.auth === "Bearer synthetic-member-b")).toBe(true);
    await expect(cockpit).toContainText("Loading document inventory"); await expect(cockpit.getByText("Synthetic-Business-Tax-2025.pdf", { exact: false })).toHaveCount(0); expect(await cockpit.innerHTML()).not.toContain(SOURCE_ID);
    f.releaseSecondInvestor(); await expect(cockpit).toContainText("Original financial documents are locked"); await expect(cockpit.getByRole("button", { name: "View", exact: true })).toHaveCount(0); expect(f.errors).toEqual([]);
  });

  test("unresolved identity and signout remove original metadata and cancel a pending protected link", async ({ context }) => {
    const f = await setup(context), staff = await admin(context); await approve(staff); const page = await portal(context);
    const cockpit = page.getByRole("region", { name: "File document cockpit", exact: true }); await expect(cockpit.getByText("Synthetic-Business-Tax-2025.pdf", { exact: false })).toBeVisible();
    f.holdUrl(); const created = page.waitForEvent("popup"); await cockpit.getByRole("button", { name: "View", exact: true }).click(); const popup = await created; await expect.poll(() => popup.evaluate(() => window.opener === null)).toBe(true);
    const calls = f.requests.length; await page.evaluate(() => (window as unknown as { switchInvestor: (value: string) => void }).switchInvestor("unresolved"));
    await expect(page.getByText("Synthetic-Business-Tax-2025.pdf", { exact: false })).toHaveCount(0); await expect(page.getByRole("region", { name: "File document cockpit", exact: true })).toHaveCount(0); await expect.poll(() => popup.isClosed()).toBe(true);
    f.releaseUrl(); await page.evaluate(() => (window as unknown as { switchInvestor: (value: string) => void }).switchInvestor("out")); await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureNavigation?: string }).fixtureNavigation)).toBe("/");
    expect(f.requests).toHaveLength(calls); expect(f.storageRequests).toEqual([]); expect(f.errors).toEqual([]);
  });
});
