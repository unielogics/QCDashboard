import { expect, test, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FOCUS_LISTING_ID as ID, focusBudget, focusListing } from "./fixtures/marketplaceInputFocus";

const ORIGIN = "https://listing-focus.test";
let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-listing-focus-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useCurrentUser" ? "export const useCurrentUser=()=>({data:{role:'super_admin'},isLoading:false});" : `export const ${name}=()=>({});`).join("\n")}`,
    "next/navigation": `const router={push:url=>window.fixtureNavigation=url};export const useParams=()=>({id:'${ID}'});export const useRouter=()=>router;`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-staff-token'});export const visualQaUser=()=>null;",
    "@/components/design-system/ConfirmationProvider": "export const useConfirmAction=()=>async()=>{throw Error('Publication not authorized in this synthetic test')};",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import ListingEditorPage from'@/app/admin/marketplace/[id]/page';import'@/app/globals.css';import'@/app/app-extras.css';
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.refreshListing=()=>client.invalidateQueries({queryKey:['cp-listing','${ID}']});
    window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff-token','Content-Type':'application/json'}});const body=await response.json();if(!response.ok){const error=new Error(body.detail||'Synthetic request failed');error.status=response.status;error.body=body;throw error}return body};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><ListingEditorPage/></main></QueryClientProvider>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

async function fixture(page: Page, options: Parameters<typeof focusListing>[0] = {}) {
  let listing = focusListing(options);
  const writes: Array<Record<string, unknown>> = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (!pathname.startsWith("/api/v1/")) return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    expect(request.headers().authorization).toBe("Bearer synthetic-staff-token");
    if (pathname.endsWith(`/capital/admin/listings/${ID}`)) {
      if (request.method() === "PATCH") { const body = request.postDataJSON() as Record<string, unknown>; writes.push(body); listing = { ...listing, ...body } as typeof listing; }
      else expect(request.method()).toBe("GET");
      return route.fulfill({ json: listing });
    }
    if (pathname.endsWith("/deal-budget") && request.method() === "GET") return route.fulfill({ json: focusBudget() });
    if (pathname.endsWith("/deal-budget/preview") && request.method() === "POST") return route.fulfill({ json: focusBudget() });
    throw new Error(`Unexpected fixture request: ${request.method()} ${pathname}`);
  });
  await page.goto(ORIGIN);
  await expect(page.getByRole("heading", { name: /CP-FOCUS-QA/ })).toBeVisible();
  return { writes, errors, saved: () => listing, refresh: async () => { listing = { ...listing, name: "Background saved title", valuation_source: "Background source", updated_at: "2026-11-11T12:00:00Z" }; await page.evaluate(() => (window as unknown as { refreshListing: () => Promise<void> }).refreshListing()); } };
}

// Use the real visible label wrapper so this also reproduces the pre-fix page,
// where the nested fields did not yet have an accessible name.
const field = (page: Page, label: string) => page.locator("span.lbl").filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).locator("..").locator("input");
type FocusWindow = Window & { focusTarget?: HTMLInputElement };

async function mark(input: Locator) {
  await input.evaluate(node => { (window as FocusWindow).focusTarget = node as HTMLInputElement; });
}
async function sameFocusedInput(page: Page) {
  expect(await page.evaluate(() => { const target = (window as FocusWindow).focusTarget; return { connected: target?.isConnected, same: document.activeElement === target }; })).toEqual({ connected: true, same: true });
}
async function typeKeys(page: Page, input: Locator, text: string, clear = false) {
  await input.click(); await mark(input);
  if (clear) { await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.press("Backspace"); await sameFocusedInput(page); }
  for (const character of text) { await page.keyboard.type(character); await sameFocusedInput(page); }
  await expect(input).toHaveValue(text);
}

test("valuation, title and servicer keep focus and the same DOM node for each typed character", async ({ page }, info) => {
  const f = await fixture(page);
  for (const [label, text] of [["Valuation source", "Independent appraisal"], ["Title", "Lien search clear"], ["Servicer, as shown", "Example Servicing"]]) await typeKeys(page, field(page, label), text);
  await page.screenshot({ path: path.resolve(process.cwd(), "../../artifacts/marketplace-input-focus-qa", info.project.name, "collateral-fields.png") });
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test("mid-string typing preserves caret position and Tab advances through collateral fields", async ({ page }) => {
  const f = await fixture(page), source = field(page, "Valuation source");
  await typeKeys(page, source, "Third party appraisal");
  await source.evaluate(node => (node as HTMLInputElement).setSelectionRange(6, 6));
  let caret = 6;
  for (const character of "independent ") { await page.keyboard.type(character); caret += 1; await sameFocusedInput(page); expect(await source.evaluate(node => (node as HTMLInputElement).selectionStart)).toBe(caret); }
  await expect(source).toHaveValue("Third independent party appraisal");
  await page.keyboard.press("Tab"); await expect(field(page, "Title")).toBeFocused();
  await page.keyboard.type("Clear"); await expect(field(page, "Title")).toBeFocused();
  await page.keyboard.press("Tab"); await expect(field(page, "Servicer, as shown")).toBeFocused();
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test("every other controlled text field retains identity during sequential keyboard edits", async ({ page }) => {
  const f = await fixture(page);
  for (const [label, text] of [["Program label", "Equipment"], ["Deal title", "Reviewed financing title"], ["City", "Example City"], ["State (2 letters)", "NY"], ["Collateral type", "Equipment"], ["Guarantee, as shown", "Full personal guarantee"], ["Borrower track record", "Twelve years operating"]]) await typeKeys(page, field(page, label), text, true);
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test("number decimals and native date fields retain focus through repeated edits", async ({ page }) => {
  const f = await fixture(page);
  for (const [label, text] of [["Note rate, % paid to participants", "12.75"], ["Term, months", "48"], ["LTV / LTC / CLTV, %", "62.5"], ["Loan amount, $", "200000.05"], ["Capital to raise from investors, $", "190000.25"], ["Smallest investor contribution, $", "25000.75"], ["Valuation, $", "1200.05"]]) await typeKeys(page, field(page, label), text, true);
  for (const label of ["Maturity date", "Subscriptions close"]) {
    const input = field(page, label), before = await input.inputValue();
    await input.focus(); await mark(input);
    await page.keyboard.press("ArrowUp"); await sameFocusedInput(page); await expect(input).not.toHaveValue(before);
    await page.keyboard.press("ArrowUp"); await sameFocusedInput(page);
    await page.keyboard.press("ArrowDown"); await sameFocusedInput(page);
  }
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test("background listing reads retain a focused dirty draft and Save/reopen round-trips its fields", async ({ page }) => {
  const f = await fixture(page), source = field(page, "Valuation source");
  await typeKeys(page, source, "Reviewed appraisal"); await f.refresh(); await sameFocusedInput(page);
  await page.keyboard.type(" report"); await sameFocusedInput(page); await expect(source).toHaveValue("Reviewed appraisal report");
  await expect(field(page, "Deal title")).toHaveValue("Example collateral financing");
  await typeKeys(page, field(page, "Title"), "Search complete"); await typeKeys(page, field(page, "Servicer, as shown"), "Example Servicer");
  await typeKeys(page, field(page, "Valuation, $"), "1200.05", true);
  await page.getByRole("button", { name: "Save", exact: true }).click(); await expect.poll(() => f.writes.length).toBe(1);
  expect(f.writes[0]).toMatchObject({ name: "Example collateral financing", valuation_source: "Reviewed appraisal report", title_status: "Search complete", servicer_label: "Example Servicer", valuation_amount: "1200.05" });
  await page.getByRole("tab", { name: /^Documents/ }).click(); await page.getByRole("tab", { name: "Terms and narrative", exact: true }).click();
  await expect(source).toHaveValue("Reviewed appraisal report"); await expect(field(page, "Title")).toHaveValue("Search complete"); await expect(field(page, "Valuation, $")).toHaveValue("1200.05");
  expect(f.saved().status).toBe("draft"); expect(f.errors).toEqual([]);
});

test("linked-file financing fields keep their canonical locks while narrative remains editable", async ({ page }) => {
  const f = await fixture(page, { linked: true });
  for (const label of ["Loan amount, $", "Note rate, % paid to participants", "Term, months", "Capital to raise from investors, $", "Smallest investor contribution, $"]) await expect(field(page, label)).toBeDisabled();
  await typeKeys(page, field(page, "Valuation source"), "Linked source review");
  await expect(field(page, "Valuation, $")).toBeEnabled(); expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

for (const status of ["repaid", "withdrawn"] as const) test(`${status} listings retain read-only inputs and no Save action`, async ({ page }) => {
  const f = await fixture(page, { status });
  for (const label of ["Valuation source", "Title", "Servicer, as shown", "Valuation, $", "Maturity date", "Deal title"]) await expect(field(page, label)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});
