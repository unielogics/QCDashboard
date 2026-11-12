import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PPM_LISTING_ID as ID } from "./fixtures/marketplacePpm";
import { fileCatalog } from "./fixtures/investorDocumentCockpit";
import { shellBudget, shellFeeCalculation, shellListing, shellPpm } from "./fixtures/marketplaceShell";

const ORIGIN = "https://marketplace-shell.test";
let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketplace-real-shell-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const data: Record<string, string> = { useCurrentUser: "window.fixtureUser", useContractStatus: "{required:false}", useAITasks: "[]", useGoogleConnection: "{gmail_connected:false}", useDealerChannelInbox: "{total_unread:0}", useProposedActionItems: "[]", useNotificationFeed: "{pages:[]}", useNotifications: "{unread_counts:{sms:0,email:0,general:0}}", useGlobalSearch: "[]" };
  const api = `const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : `export const ${name}=()=>({data:${data[name] ?? "undefined"},isLoading:false,isError:false,isFetching:false,authReady:true,authScope:'synthetic-shell-staff:session',refetch:async()=>({}),mutate:()=>{},mutateAsync:async()=>{}});`).join("\n")}`;
  const mocks: Record<string, string> = {
    "@/hooks/useApi": api, "./useApi": api,
    "next/navigation": `const router={push:url=>window.fixtureNavigation=url,replace:url=>window.fixtureNavigation=url};export const useParams=()=>({id:'${ID}'});export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname.startsWith('/forms/')?location.pathname:'/admin/marketplace/${ID}';`,
    "next/link": "export default function Link({href,children,prefetch,...props}){return <a href={href} {...props}>{children}</a>}",
    "next/dynamic": "import React,{lazy,Suspense}from'react';export default(loader,options={})=>{const C=lazy(async()=>{const v=await loader();return typeof v==='function'?{default:v}:v});return props=><Suspense fallback={options.loading?React.createElement(options.loading):null}><C {...props}/></Suspense>};",
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,userId:'synthetic-shell-staff',sessionId:'session',getToken:async()=> 'synthetic-shell-token'});export const visualQaUser=()=>null;",
    "@clerk/nextjs": "export const useClerk=()=>({signOut:async()=>{}});export const useUser=()=>({isLoaded:true,user:{twoFactorEnabled:true,passkeys:[]}});",
    "@/hooks/useRecordPendingConsent": "export const useRecordPendingConsent=()=>{};",
    "@/hooks/useRecordPendingSignupAttribution": "export const useRecordPendingSignupAttribution=()=>{};",
    "@/lib/liveInvalidation": "export const useLiveInvalidation=()=>{};",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import AppShell from'@/components/shell/AppShell';import ListingEditorPage from'@/app/admin/marketplace/[id]/page';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import{useUI}from'@/store/ui';import'@/app/globals.css';import'@/app/production-package.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.setShellTheme=theme=>useUI.getState().setTheme(theme);window.fixtureApi=async(url,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+url,{...options,headers:{Authorization:'Bearer synthetic-shell-token','Content-Type':'application/json'}});const body=await response.json();if(!response.ok){const error=new Error(typeof body.detail==='string'?body.detail:body.detail?.message||'Synthetic request failed');error.status=response.status;error.body=body;throw error}return body};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><ConfirmationProvider><AppShell>{location.pathname.startsWith('/forms/')?<article style={{minHeight:2400,padding:24}}><h1>Public document boundary</h1><p>The public shell retains native document scrolling.</p><div style={{marginTop:1800}}>End of synthetic public document</div></article>:<ListingEditorPage/>}</AppShell></ConfirmationProvider></QueryClientProvider>);` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: ORIGIN }) }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services-only", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path === "./useApi" ? "@/hooks/useApi" : args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
  const config = require("tailwindcss/loadConfig")(path.join(root, "tailwind.config.ts")); css = Buffer.from((await require("postcss")([require("tailwindcss")({ ...config, content: [path.join(root, "src/**/*.{ts,tsx}")] })]).process(css.toString(), { from: path.join(directory, "app.css") })).css);
});

async function fixture(page: Page, options: { readOnly?: boolean; holdSave?: boolean; bare?: boolean } = {}) {
  const listing = shellListing(), ppm = shellPpm(); let budget = shellBudget(!options.readOnly);
  let releaseSave = () => {}; const saveGate = options.holdSave ? new Promise<void>(resolve => { releaseSave = resolve; }) : Promise.resolve();
  const requests: Array<{ path: string; method: string; body: Record<string, unknown> }> = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== ORIGIN) throw new Error(`Unexpected shell traffic: ${url.origin}`);
    if (!url.pathname.startsWith("/api/v1/")) return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.fixtureUser={id:"synthetic-shell-staff",role:"super_admin",first_name:"Synthetic",last_name:"Operator",email:"staff@example.test",account_status:"active",needs_acknowledgment:false,needs_phone:false};localStorage.setItem("qc.sidebarCollapsed","0");</script><script src="/app.js"></script></body></html>' });
    expect(request.headers().authorization).toBe("Bearer synthetic-shell-token");
    const p = url.pathname.slice(7), body = request.postData() ? request.postDataJSON() as Record<string, unknown> : {}; requests.push({ path: p, method, body }); const json = (value: unknown) => route.fulfill({ json: value });
    if (p === `/capital/admin/listings/${ID}`) return json(listing);
    if (p === `/capital/admin/listings/${ID}/ppm`) return json(ppm);
    if (p.endsWith("/file-documents")) return json(fileCatalog(true));
    if (p.endsWith("/deal-budget/preview")) { const rows = body.rows as typeof budget.rows; return json({ ...budget, ...body, calculation: shellFeeCalculation(rows[0].value) }); }
    if (p.endsWith("/deal-budget")) { if (method === "PATCH") { await saveGate; expect(body.expected_revision).toBe(budget.revision); const rows = body.rows as typeof budget.rows; budget = { ...budget, ...body, calculation: shellFeeCalculation(rows[0].value), revision: budget.revision + 1 } as typeof budget; ppm.status = "stale"; for (const version of ppm.history) version.stale = true; listing.updated_at = "2026-11-12T18:00:00Z"; } return json(budget); }
    throw new Error(`Unexpected shell API: ${method} ${p}`);
  });
  await page.goto(ORIGIN + (options.bare ? "/forms/synthetic-shell-boundary" : "")); if (!options.bare) await expect(page.getByRole("heading", { name: /CP-PPM-QA/ })).toBeVisible();
  return { requests, errors, releaseSave, budget: () => budget };
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("main.content")!, shell = document.querySelector<HTMLElement>(".app")!, sidebar = document.querySelector<HTMLElement>("aside.side")!, header = document.querySelector<HTMLElement>("header.top")!;
    const rect = (node: HTMLElement) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const escapingAbsolute = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter(node => getComputedStyle(node).position === "absolute" && node.getBoundingClientRect().bottom > innerHeight && (!node.offsetParent || !main.contains(node.offsetParent)))
      .map(node => ({ tag: node.tagName, className: node.className, text: node.textContent?.slice(0, 110), ...rect(node), offsetParent: node.offsetParent?.tagName + "." + node.offsetParent?.className, parent: node.parentElement?.tagName + "." + node.parentElement?.className })).slice(0, 20);
    return { viewport: { width: innerWidth, height: innerHeight }, document: { scrollTop: document.scrollingElement!.scrollTop, height: document.scrollingElement!.scrollHeight, clientHeight: document.scrollingElement!.clientHeight, width: document.documentElement.scrollWidth }, main: { ...rect(main), scrollTop: main.scrollTop, scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, position: getComputedStyle(main).position, overflowY: getComputedStyle(main).overflowY }, shell: rect(shell), shellChildren: Array.from(shell.children).map(node => ({ tag: node.tagName, className: node.className, ...rect(node as HTMLElement) })), sidebar: rect(sidebar), header: rect(header), escapingAbsolute, bodyOverflow: document.body.style.overflow };
  });
}
async function wheel(page: Page, delta: number) {
  const box = await page.locator("main.content").boundingBox(); await page.mouse.move(box!.x + Math.min(220, box!.width / 2), Math.min(page.viewportSize()!.height - 100, box!.y + 300)); await page.mouse.wheel(0, delta); await page.waitForTimeout(120);
}
async function docs(page: Page) { await page.getByRole("tab", { name: /^Documents/ }).click(); await expect(page.getByRole("region", { name: "Review saved PPM", exact: true })).toBeVisible(); }

test("real shell contains marketplace scrolling and stays anchored after saved-PPM expansion, collapse and shorter tabs", async ({ page }, info) => {
  const f = await fixture(page);
  if (process.env.QC_SHELL_PROBE) await page.addStyleTag({ content: `.app main.content { position: relative; }${process.env.QC_SHELL_PROBE === "both" ? ".app .rail { height: 100%; }" : ""}` });
  await docs(page);
  const phase = process.env.QC_SHELL_PROBE ? `probe-${process.env.QC_SHELL_PROBE}` : process.env.QC_SHELL_BASELINE ? "baseline" : "fixed";
  const directory = path.resolve(process.cwd(), "../../artifacts/marketplace-scroll-fees-qa"); await mkdir(directory, { recursive: true });
  const states: Record<string, Awaited<ReturnType<typeof geometry>>> = { initial: await geometry(page) };
  if (!process.env.QC_SHELL_BASELINE) {
    if (page.viewportSize()!.width > 760) { const identity = page.locator('aside.side .foot button[aria-haspopup="menu"]'); await identity.click(); await expect(page.getByRole("menu")).toBeInViewport(); await page.keyboard.press("Escape"); const nav = page.locator("aside.side nav"); await nav.evaluate(node => { node.scrollTop = node.scrollHeight; }); const box = await nav.boundingBox(); await page.mouse.move(box!.x + 30, Math.min(box!.y + 100, page.viewportSize()!.height - 150)); await page.mouse.wheel(0, 700); await page.waitForTimeout(100); states.sidebarBoundary = await geometry(page); }
    else { await expect(page.getByRole("navigation", { name: "Primary mobile navigation", exact: true })).toBeInViewport(); }
    await page.getByRole("button", { name: "Focus current offering document versions", exact: true }).click(); const focused = page.locator(".table-workspace.is-focused"); await expect(focused).toBeVisible(); const box = await focused.boundingBox(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1); await page.getByRole("button", { name: "Exit table focus", exact: true }).click(); await expect(focused).toHaveCount(0); states.afterTableFocus = await geometry(page);
    await page.locator("main.content").evaluate(node => { node.scrollTop = 0; }); await page.locator("main.content").focus(); await page.keyboard.press("PageDown"); await expect.poll(() => page.locator("main.content").evaluate(node => node.scrollTop)).toBeGreaterThan(0); states.afterPageDown = await geometry(page);
  }
  await page.getByText("Saved PPM text · v4", { exact: true }).click();
  await wheel(page, 850); states.afterWheel = await geometry(page);
  await page.locator("main.content").evaluate(node => { node.scrollTop = node.scrollHeight; }); await wheel(page, 800); states.atBottom = await geometry(page);
  await page.screenshot({ path: path.join(directory, `${info.project.name}-${phase}-bottom-escape.png`) });
  // Native details/focus navigation can scroll several ancestors, so test the
  // actual action in addition to mouse wheel on an already scrolled page.
  await page.getByText("Saved PPM text · v4", { exact: true }).click(); states.afterCollapse = await geometry(page);
  await page.getByRole("button", { name: "Back to edits", exact: true }).click(); await page.getByRole("button", { name: "Show all disclosure fields", exact: true }).click(); await page.getByLabel("PPM Issuer legal name", { exact: true }).focus(); states.afterFocus = await geometry(page);
  await page.getByRole("tab", { name: "Events", exact: true }).click(); await wheel(page, -1600); states.shortTab = await geometry(page);
  const elara = page.getByRole("button", { name: /^Elara/ });
  if (await elara.isVisible()) { await elara.click(); states.elaraOpen = await geometry(page); await wheel(page, 1000); states.elaraAfterWheel = await geometry(page); await elara.click(); }
  await writeFile(path.join(directory, `${info.project.name}-${phase}-geometry.json`), JSON.stringify(states, null, 2) + "\n"); await page.screenshot({ path: path.join(directory, `${info.project.name}-${phase}-shell.png`) });
  if (!process.env.QC_SHELL_BASELINE || process.env.QC_SHELL_PROBE) for (const [key, value] of Object.entries(states)) { if (process.env.QC_SHELL_PROBE === "main" && key.startsWith("elara")) continue; expect(value.document.scrollTop).toBeLessThanOrEqual(1); expect(value.document.height).toBeLessThanOrEqual(value.viewport.height + 1); expect(value.document.width).toBeLessThanOrEqual(value.viewport.width); if (value.viewport.width > 760) { expect(value.sidebar.top).toBeCloseTo(0, 0); expect(value.sidebar.bottom).toBeCloseTo(value.viewport.height, 0); expect(value.header.top).toBeCloseTo(0, 0); } }
  expect(f.requests.filter(row => row.method !== "GET" && !row.path.endsWith("/deal-budget/preview"))).toEqual([]); expect(f.errors).toEqual([]);
});

test("Documents fee shortcut focuses the shared editor and explicit saved percentage updates the shared net return", async ({ page }, info) => {
  const f = await fixture(page, { holdSave: true }), valuation = page.getByLabel("Valuation source", { exact: true });
  await valuation.fill("Retained synthetic collateral narrative"); await docs(page);
  await page.getByRole("button", { name: "Company fees & investor return", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Deal budget editor", exact: true }), heading = editor.getByRole("heading", { name: "Company fees and loan setup", exact: true });
  await expect(heading).toBeFocused().catch(async error => { const directory = path.resolve(process.cwd(), "../../artifacts/marketplace-scroll-fees-qa"); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, `${info.project.name}-fee-focus-debug.json`), JSON.stringify(await heading.evaluate(node => ({ active: document.activeElement?.outerHTML.slice(0, 600), hasFocus: document.hasFocus(), target: node.outerHTML, inert: Boolean(node.closest("[inert]")), dialogHidden: node.closest('[role="dialog"]')?.getAttribute("aria-hidden") })), null, 2)); throw error; }); await expect(heading).toBeInViewport(); await expect(page.getByRole("tab", { name: "Terms and narrative", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(f.requests.filter(row => row.method !== "GET" && !row.path.endsWith("/deal-budget/preview"))).toEqual([]);
  await expect(editor.getByLabel("Company fee 1 method")).toHaveValue("percent"); await expect(editor.getByLabel("Company fee 1 basis")).toHaveValue("interest"); await expect(editor.getByLabel("Company fee 1 payer")).toHaveValue("investor");
  await editor.getByLabel("Company fee 1 value").fill("2");
  await expect(editor.getByRole("article", { name: "Full contractual term", exact: true })).toContainText("USD 11,640.00"); await expect(editor.getByRole("article", { name: "Full contractual term", exact: true })).toContainText("11.64%");
  await expect(editor.getByLabel("Company fee 1 full-term amount")).toContainText("USD 240.00");
  await editor.getByRole("button", { name: "Save budget", exact: true }).click(); await expect(editor.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled(); await expect(editor.getByRole("button", { name: "Close", exact: true }).last()).toBeDisabled();
  expect(f.requests.filter(row => row.path.endsWith("/deal-budget") && row.method === "PATCH")).toHaveLength(1);
  f.releaseSave(); await expect(editor).toContainText("revision 2 saved"); await editor.getByRole("button", { name: "Close", exact: true }).last().click();
  const saved = page.getByRole("region", { name: "Company fees & investor return", exact: true }); await expect(saved).toContainText("$11,640.00"); await expect(saved).toContainText("11.64%"); await expect(valuation).toHaveValue("Retained synthetic collateral narrative");
  await saved.getByRole("button", { name: "Edit deal budget", exact: true }).click(); await expect(editor.getByLabel("Company fee 1 value")).toHaveValue("2"); await expect(editor).toContainText("Saved budget · revision 2"); await editor.getByRole("button", { name: "Close", exact: true }).last().click();
  await saved.getByRole("button", { name: "Company fees & investor return", exact: true }).click(); await expect(heading).toBeFocused(); await expect(heading).toBeInViewport();
  const directory = path.resolve(process.cwd(), "../../artifacts/marketplace-scroll-fees-qa"); await mkdir(directory, { recursive: true }); await page.screenshot({ path: path.join(directory, `${info.project.name}-shared-company-fees.png`) });
  expect(f.budget().revision).toBe(2); expect(f.budget().rows[0]).toMatchObject({ value: 2, method: "percent", basis: "interest", payer: "investor" });
  expect(f.requests.filter(row => row.method !== "GET" && !row.path.endsWith("/deal-budget/preview")).map(row => row.path)).toEqual([`/application-profiles/${shellListing().profile_id}/deal-budget`]); expect(f.errors).toEqual([]);
});

test("read-only shared fees remain viewable without edits and modal close preserves native shell scrolling", async ({ page }) => {
  const f = await fixture(page, { readOnly: true }); await docs(page); await page.getByRole("button", { name: "Company fees & investor return", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Deal budget editor", exact: true }); await expect(editor.getByLabel("Company fee 1 value")).toBeDisabled(); await expect(editor.getByLabel("Company fee 1 basis")).toBeDisabled(); await expect(editor.getByRole("button", { name: "Save budget", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("article", { name: "Full contractual term", exact: true })).toContainText("USD 11,760.00"); await editor.getByRole("button", { name: "Close", exact: true }).last().click();
  await docs(page); const before = await geometry(page); await wheel(page, 650); const after = await geometry(page); expect(after.main.scrollTop).toBeGreaterThan(before.main.scrollTop); expect(after.document.scrollTop).toBe(0); expect(after.bodyOverflow).not.toBe("hidden"); expect(f.requests.filter(row => row.method !== "GET" && !row.path.endsWith("/deal-budget/preview"))).toEqual([]); expect(f.errors).toEqual([]);
});

// This checks the shared bare-shell boundary, not a substitute public form.
test("bare public routes retain native document scrolling without console chrome", async ({ page }) => {
  const f = await fixture(page, { bare: true }); await expect(page.getByRole("heading", { name: "Public document boundary", exact: true })).toBeVisible(); await expect(page.locator(".app")).toHaveCount(0); await page.mouse.move(180, 400); await page.mouse.wheel(0, 800); await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(0); expect(f.requests).toEqual([]); expect(f.errors).toEqual([]);
});
