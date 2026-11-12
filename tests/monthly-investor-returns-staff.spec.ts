import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PPM_LISTING_ID as ID } from "./fixtures/marketplacePpm";
import { fileCatalog } from "./fixtures/investorDocumentCockpit";
import { shellBudget, shellListing, shellPpm } from "./fixtures/marketplaceShell";
import { staffProjection, type StaffProjectionCase } from "./fixtures/monthlyInvestorReturnsStaff";
import type { InvestorProjectionRequest } from "../src/components/investor/investorReturnModel";
import { investorEconomicsCases } from "./fixtures/investorEconomics";

const ORIGIN = "https://monthly-staff.test";
let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-monthly-staff-"));
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

type RecordedRequest = { path: string; method: string; body: Record<string, unknown>; query: Record<string, string> };
async function fixture(page: Page, options: { scenario?: StaffProjectionCase } = {}) {
  const listing = shellListing(), ppm = shellPpm(), budget = shellBudget();
  const requests: RecordedRequest[] = [], errors: string[] = [];
  let fingerprint = "a".repeat(64), failNext = false, gate: Promise<void> | null = null, release = () => {};
  page.on("pageerror", error => errors.push(error.message));
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== ORIGIN) throw new Error(`Unexpected staff traffic: ${url.origin}`);
    if (!url.pathname.startsWith("/api/v1/")) return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.fixtureUser={id:"synthetic-shell-staff",role:"super_admin",first_name:"Synthetic",last_name:"Operator",email:"staff@example.test",account_status:"active",needs_acknowledgment:false,needs_phone:false};localStorage.setItem("qc.sidebarCollapsed","0");</script><script src="/app.js"></script></body></html>' });
    expect(request.headers().authorization).toBe("Bearer synthetic-shell-token");
    const p = url.pathname.slice(7), body = request.postData() ? request.postDataJSON() as Record<string, unknown> : {};
    requests.push({ path: p, method, body, query: Object.fromEntries(url.searchParams) });
    const json = (value: unknown) => route.fulfill({ json: value });
    if (p === `/capital/admin/listings/${ID}`) return json(listing);
    if (p === `/capital/admin/listings/${ID}/ppm`) return json(ppm);
    if (p.endsWith("/file-documents")) return json(fileCatalog(true));
    if (p.endsWith("/investor-returns") || p.endsWith("/investor-returns/preview")) {
      const currentGate = gate; gate = null; if (currentGate) await currentGate;
      if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { detail: "Synthetic projection service unavailable" } }); }
      const working = p.endsWith("/preview");
      const rows = body.rows as typeof budget.rows | undefined;
      const payoff = body.payoff_terms as { interest_policy?: string } | undefined;
      const kind = working && rows?.[0]?.value == null ? "unknown_fee" : working && payoff?.interest_policy === "unknown" ? "unknown_payoff_policy" : options.scenario ?? "saved";
      const input: InvestorProjectionRequest = { exit_month: Number(url.searchParams.get("exit_month") ?? 6), investment_amount: url.searchParams.has("investment_amount") ? Number(url.searchParams.get("investment_amount")) : null };
      return json(staffProjection(kind, input, working, working ? "c".repeat(64) : fingerprint));
    }
    if (p.endsWith("/deal-budget/preview")) {
      const rows = body.rows as typeof budget.rows, payoff = body.payoff_terms as { interest_policy?: string } | undefined;
      const calculation = structuredClone(rows[0].value == null ? investorEconomicsCases.unknown_rate.calculation : investorEconomicsCases.company.calculation);
      if (payoff?.interest_policy === "unknown") Object.assign(calculation.investor_scenarios.six_month_payoff, staffProjection("unknown_payoff_policy", { exit_month: 6, investment_amount: null }, true).selected_exit);
      return json({ ...budget, ...body, calculation });
    }
    if (p.endsWith("/deal-budget")) { expect(method).toBe("GET"); return json(budget); }
    throw new Error(`Unexpected staff API: ${method} ${p}`);
  });
  await page.goto(ORIGIN);
  await expect(page.getByRole("heading", { name: /CP-PPM-QA/ })).toBeVisible();
  return { requests, errors, budget, changeSource: () => { fingerprint = "b".repeat(64); }, failProjection: () => { failNext = true; }, holdProjection: () => { gate = new Promise<void>(resolve => { release = resolve; }); }, releaseProjection: () => release() };
}

const explorer = (page: Page) => page.getByRole("dialog", { name: "Monthly investor returns explorer", exact: true });
async function openSaved(page: Page) {
  await page.getByRole("button", { name: "View monthly returns", exact: true }).click();
  const dialog = explorer(page);
  await expect(dialog.getByRole("article", { name: "Selected month 6 returns", exact: true })).toContainText("5,880.00");
  return dialog;
}
async function openBudget(page: Page) {
  await page.getByRole("button", { name: "Company fees & investor return", exact: true }).first().click();
  return page.getByRole("dialog", { name: "Deal budget editor", exact: true });
}
function projectionRequests(requests: RecordedRequest[]) { return requests.filter(item => item.path.includes("/investor-returns")); }

test("actual staff listing opens saved monthly returns lazily with keyboard, hover and bounded scrolling", async ({ page }, info) => {
  const f = await fixture(page);
  expect(projectionRequests(f.requests)).toHaveLength(0);
  const title = page.getByRole("textbox", { name: "Deal title", exact: true });
  await title.fill("Retained staff listing title");
  const dialog = await openSaved(page);
  expect(projectionRequests(f.requests)[0]).toMatchObject({ method: "GET", query: { exit_month: "6" } });
  await expect(dialog).toContainText("Saved loan and fee schedule");
  const directory = path.resolve(process.cwd(), "../../artifacts/monthly-investor-returns-staff-qa"); await mkdir(directory, { recursive: true });
  const themes: Record<string, unknown> = {};
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(value => (window as unknown as { setShellTheme: (theme: string) => void }).setShellTheme(value), theme);
    if (theme === "dark") await expect(page.locator(".app")).toHaveAttribute("data-dark", "1");
    else await expect(page.locator(".app")).not.toHaveAttribute("data-dark", "1");
    await dialog.locator(".drawer-b").evaluate(node => { node.scrollTop = 0; });
    themes[theme] = await dialog.evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, width: node.getBoundingClientRect().width, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth }));
    await page.screenshot({ path: path.join(directory, `${info.project.name}-staff-${theme}-chart.png`) });
  }
  await page.evaluate(() => (window as unknown as { setShellTheme: (theme: string) => void }).setShellTheme("light"));
  await writeFile(path.join(directory, `${info.project.name}-themes.json`), JSON.stringify(themes, null, 2));
  await dialog.getByRole("button", { name: "Month 8", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "Selected month 8 returns", exact: true })).toContainText("7,840.00");
  const slider = dialog.getByRole("slider", { name: "Selected return month", exact: true });
  await slider.focus(); await page.keyboard.press("End");
  await expect(dialog.getByRole("article", { name: "Selected month 12 returns", exact: true })).toContainText("100,000.00");
  const chart = dialog.getByRole("figure", { name: "Cumulative net profit chart", exact: true });
  await chart.locator("svg").hover();
  await expect(chart.getByText("Cumulative NET ROI", { exact: true })).toBeVisible();
  expect(projectionRequests(f.requests)).toHaveLength(1);
  await expect(chart.locator("svg")).toHaveCSS("touch-action", "pan-y");
  await dialog.getByText("Monthly figures table", { exact: true }).click();
  const table = dialog.getByRole("region", { name: "Monthly investor figures", exact: true });
  await expect(table).toBeVisible(); await table.focus(); await page.keyboard.press("ArrowRight");
  await page.screenshot({ path: path.join(directory, `${info.project.name}-staff-saved.png`) });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(title).toHaveValue("Retained staff listing title");
  const state = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, scroll: document.scrollingElement!.scrollTop, max: document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight }));
  expect(state.width).toBe(state.client); expect(state.max).toBe(0);
  await writeFile(path.join(directory, `${info.project.name}-staff-saved-geometry.json`), JSON.stringify(state, null, 2));
  expect(f.requests.filter(item => ["PATCH", "PUT", "DELETE"].includes(item.method))).toEqual([]);
  expect(f.errors).toEqual([]);
});

test("retained unknown fee draft cannot replace saved returns and working request opens the exact fee fix", async ({ page }) => {
  const f = await fixture(page);
  let budgetDialog = await openBudget(page);
  await budgetDialog.getByRole("spinbutton", { name: "Company fee 1 value", exact: true }).fill("");
  await expect.poll(() => f.requests.some(item => item.path.endsWith("/deal-budget/preview") && (item.body.rows as typeof f.budget.rows)?.[0]?.value == null)).toBe(true);
  await budgetDialog.getByRole("button", { name: "Close", exact: true }).last().click();
  const saved = await openSaved(page);
  expect(projectionRequests(f.requests).at(-1)?.method).toBe("GET");
  await saved.getByRole("button", { name: "Close", exact: true }).click();
  budgetDialog = await openBudget(page);
  await expect(budgetDialog.getByRole("spinbutton", { name: "Company fee 1 value", exact: true })).toHaveValue("");
  await budgetDialog.getByRole("button", { name: "View working monthly returns", exact: true }).click();
  const working = explorer(page);
  await expect(working).toContainText("Unsaved editor preview");
  await expect(working).toContainText("Confirm investor-paid fees and reserve return treatment.");
  const preview = projectionRequests(f.requests).at(-1)!;
  expect(preview.method).toBe("POST"); expect(preview.path).toMatch(/\/investor-returns\/preview$/);
  expect(preview.body.expected_revision).toBe(f.budget.revision);
  expect((preview.body.rows as typeof f.budget.rows)[0].value).toBeNull();
  await working.getByRole("button", { name: "Review fees / payoff assumptions", exact: true }).click();
  await expect(explorer(page)).toHaveCount(0);
  await expect(budgetDialog.getByRole("heading", { name: "Company fees and loan setup", exact: true })).toBeFocused();
  expect(f.requests.filter(item => ["PATCH", "PUT", "DELETE"].includes(item.method))).toEqual([]);
  expect(f.errors).toEqual([]);
});

test("staff payoff unknowns lead directly back to existing payoff controls without saving", async ({ page }) => {
  const f = await fixture(page);
  const budgetDialog = await openBudget(page);
  await budgetDialog.getByRole("combobox", { name: "Early payoff interest policy", exact: true }).selectOption("unknown");
  await budgetDialog.getByRole("button", { name: "View working monthly returns", exact: true }).click();
  const working = explorer(page);
  await working.getByRole("button", { name: "Full payoff at selected month", exact: true }).click();
  await expect(working).toContainText("Choose the contracted early payoff interest policy.");
  await working.getByRole("button", { name: "Review fees / payoff assumptions", exact: true }).click();
  await expect(budgetDialog.getByRole("heading", { name: "Confirm early payoff terms", exact: true })).toBeFocused();
  await expect(budgetDialog.getByRole("combobox", { name: "Early payoff interest policy", exact: true })).toHaveValue("unknown");
  expect(projectionRequests(f.requests).at(-1)?.body.payoff_terms).toMatchObject({ interest_policy: "unknown" });
  expect(f.requests.filter(item => ["PATCH", "PUT", "DELETE"].includes(item.method))).toEqual([]);
  expect(f.errors).toEqual([]);
});

test("saved source changes and failed payoff reads clear old numbers until explicit current-source retry", async ({ page }) => {
  const f = await fixture(page, { scenario: "on_demand" });
  const dialog = await openSaved(page);
  await dialog.getByRole("button", { name: "Full payoff at selected month", exact: true }).click();
  f.holdProjection(); f.changeSource();
  await dialog.getByRole("button", { name: "Month 7", exact: true }).click();
  await expect.poll(() => projectionRequests(f.requests).some(item => item.query.exit_month === "7")).toBe(true);
  await expect(dialog.getByRole("article", { name: "Selected month 7 returns", exact: true })).not.toContainText("5,880.00");
  f.releaseProjection();
  await expect(dialog).toContainText("Saved inputs changed. Reload the projection");
  await expect(dialog).not.toContainText("11,760.00");
  await expect(dialog.getByRole("figure")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Reload current projection", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "Selected month 7 returns", exact: true })).toContainText("6,860.00");
  f.failProjection(); await dialog.getByRole("button", { name: "Month 8", exact: true }).click();
  await expect(dialog).toContainText("Synthetic projection service unavailable");
  await expect(dialog).not.toContainText("6,860.00"); await expect(dialog).not.toContainText("11,760.00");
  await dialog.getByRole("button", { name: "Retry projection", exact: true }).click();
  await expect(dialog.getByRole("article", { name: "Selected month 8 returns", exact: true })).toContainText("7,840.00");
  expect(f.requests.filter(item => ["PATCH", "PUT", "DELETE"].includes(item.method))).toEqual([]);
  expect(f.errors).toEqual([]);
});
