import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PPM_LISTING_ID as ID, ppmListing } from "./fixtures/marketplacePpm";
import { membershipPolicy, presetFields, presetState, presetVersion, syntheticMember } from "./fixtures/ppmPresetsMembership";
import { fileCatalog } from "./fixtures/investorDocumentCockpit";
import { guidanceBudget } from "./fixtures/marketplaceErrorGuidance";

const ORIGIN = "https://ppm-presets.test";
let script: Buffer, css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketplace-ppm-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useCurrentUser" ? "export const useCurrentUser=()=>({data:{id:'synthetic-staff',role:new URLSearchParams(location.search).get('role')||'super_admin'},isLoading:false,authReady:true,authScope:'synthetic-staff:session'});" : `export const ${name}=()=>({});`).join("\n")}`,
    "next/navigation": `import{useSyncExternalStore}from'react';let current='${ID}';const listeners=new Set();window.switchListing=id=>{current=id;listeners.forEach(fn=>fn())};const router={push:url=>window.fixtureNavigation=url};export const useParams=()=>({id:useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>current,()=>current)});export const useRouter=()=>router;const search=new URLSearchParams(location.search);export const useSearchParams=()=>search;export const usePathname=()=>'/admin/marketplace/'+current;`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,userId:'synthetic-staff',sessionId:'session',getToken:async()=> 'synthetic-staff'});export const visualQaUser=()=>null;",
    "next/dynamic": "import React,{lazy,Suspense}from'react';export default(loader,options={})=>{const Component=lazy(async()=>{const value=await loader();return typeof value==='function'?{default:value}:value});return props=><Suspense fallback={options.loading?React.createElement(options.loading):null}><Component {...props}/></Suspense>};",
  };
  mocks["./useApi"] = mocks["@/hooks/useApi"];
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import ListingPage from'@/app/admin/marketplace/[id]/page';import MembersPage from'@/app/admin/marketplace/members/page';const Page=location.pathname.includes('/members')?MembersPage:ListingPage;import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.refreshListing=()=>client.invalidateQueries({queryKey:['cp-listing']});window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff','Content-Type':'application/json'}});const body=await response.json();if(!response.ok){const error=new Error(typeof body.detail==='string'?body.detail:body.detail?.message||'Synthetic request failed');error.status=response.status;error.body=body;throw error}return body};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><ConfirmationProvider><Page/></ConfirmationProvider></main></QueryClientProvider>);` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: ORIGIN }) }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path === "./useApi" ? "@/hooks/useApi" : args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
  const config = require("tailwindcss/loadConfig")(path.join(root, "tailwind.config.ts"));
  css = Buffer.from((await require("postcss")([require("tailwindcss")({ ...config, content: [path.join(root, "src/**/*.{ts,tsx}")] })]).process(css.toString(), { from: path.join(directory, "app.css") })).css);
});

type Json = Record<string, unknown>;
async function fixture(page: Page, options: { existingCustom?: boolean; policyFailure?: boolean; membersPage?: boolean } = {}) {
  let days = 17, currency = "USD", failed = false, listing = ppmListing(), version = options.existingCustom ? presetVersion(1, "a".repeat(64)) : null;
  if (version) { version.legal_inputs.issuer_legal_name = "Existing Example Issuer LLC"; version.legal_inputs.investor_eligibility = "Additional bespoke investor restriction."; version.legal_inputs.jurisdiction = ""; version.legal_presets = {}; }
  let state = presetState(version);
  const requests: Array<{ path: string; method: string; body: Json }> = [], errors: string[] = [];
  page.context().on("page", child => child.on("pageerror", error => errors.push(error.message))); page.on("pageerror", error => errors.push(error.message));
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== ORIGIN) throw new Error(`Unexpected preset fixture traffic: ${url.origin}`);
    if (!url.pathname.startsWith("/api/v1/")) return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    const p = url.pathname.slice(7), body = request.postData() ? request.postDataJSON() as Json : {};
    requests.push({ path: p + url.search, method, body }); expect(request.headers().authorization).toBe("Bearer synthetic-staff");
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (p === `/capital/admin/listings/${ID}`) return json(listing);
    if (p === "/capital/admin/membership-policy") { if (options.policyFailure && !failed) { failed = true; return json({ detail: "Synthetic membership policy unavailable" }, 503); } return json(membershipPolicy(days)); }
    if (p === "/capital/admin/members") return json([syntheticMember]);
    if (p === "/capital/admin/access-requests") return json([]);
    if (p.endsWith("/file-documents")) return json(fileCatalog(true));
    if (p.endsWith("/deal-budget") || p.endsWith("/deal-budget/preview")) return json(guidanceBudget());
    if (p === `/capital/admin/listings/${ID}/ppm`) return json(state);
    if (p.endsWith("/ppm/generate") || p.endsWith("/ppm/draft")) {
      expect(method).toBe(p.endsWith("/draft") ? "PATCH" : "POST");
      expect(body.expected_source_fingerprint).toBe(state.source_fingerprint);
      const old = state.current_draft ?? state.current_approved, generated = p.endsWith("/generate"), fields = presetFields(days, currency);
      if (!generated) expect(body.expected_version).toBe(old!.version);
      const legal: Record<string, string> = {}, selected: Record<string, string> = {};
      for (const field of fields) {
        const values = generated ? old?.legal_inputs ?? {} : body.legal_inputs as Record<string, string>;
        const ids = generated ? old?.legal_presets ?? {} : body.legal_presets as Record<string, string>;
        const choice = ids[field.key] ?? (generated && values[field.key]?.trim() ? "custom" : field.default_preset ?? "custom");
        selected[field.key] = choice;
        legal[field.key] = choice === "custom" ? values[field.key] ?? "" : field.options?.find(item => item.key === choice)?.text ?? "";
      }
      version = presetVersion(Math.max(0, ...state.history.map(row => row.version)) + 1, state.source_fingerprint, legal, selected, days, currency);
      state = presetState(version, state.history, days, currency); return json(state);
    }
    throw new Error(`Unexpected membership/preset fixture API: ${method} ${p}`);
  });
  await page.goto(ORIGIN + (options.membersPage ? "/admin/marketplace/members?tab=members" : "/"));
  await expect(page.getByRole("heading", { name: options.membersPage ? "Capital partners" : /CP-PPM-QA/ })).toBeVisible();
  return { requests, errors, changeSource: async (nextDays = 7, nextCurrency = "USD", remoteSubscription = false) => {
    days = nextDays; currency = nextCurrency;
    const old = state.current_draft!; old.stale = true;
    if (remoteSubscription) { old.legal_inputs.subscription_process = "Updated remote subscription workflow."; old.legal_presets = { ...old.legal_presets, subscription_process: "custom" }; }
    state = { ...state, status: "stale", source_fingerprint: "b".repeat(64), legal_fields: presetFields(days, currency), membership_policy: membershipPolicy(days) };
    listing = { ...listing, updated_at: "2026-11-11T17:00:00Z" };
    await page.evaluate(() => (window as unknown as { refreshListing: () => Promise<void> }).refreshListing());
  } };
}

const area = (page: Page) => page.getByRole("region", { name: "PPM draft and review", exact: true });
const field = (page: Page, label: string) => area(page).getByLabel(`PPM ${label}`, { exact: true });
const choice = (page: Page, label: string) => area(page).getByLabel(`PPM ${label} preset`, { exact: true });
const writes = (f: Awaited<ReturnType<typeof fixture>>) => f.requests.filter(row => row.method !== "GET" && !row.path.endsWith("/deal-budget/preview"));
async function open(page: Page) { await page.getByRole("tab", { name: /^Documents/ }).click(); await expect(area(page).getByText("Saved draft v1", { exact: true })).toBeVisible(); await backToEdits(page); }
async function backToEdits(page: Page) { await area(page).getByRole("button", { name: "Back to edits", exact: true }).click(); const show = area(page).getByRole("button", { name: "Show all disclosure fields", exact: true }); if (await show.isVisible()) await show.click(); }
async function openDetails(page: Page) { const toggle = area(page).getByText("PPM details and history", { exact: true }); if (!await toggle.evaluate(node => node.parentElement!.hasAttribute("open"))) await toggle.click(); }
async function approvalBlocked(page: Page) { await area(page).getByRole("button", { name: "Review saved PPM", exact: true }).first().click(); await expect(area(page).getByRole("button", { name: "Approve current PPM" })).toHaveCount(0); await backToEdits(page); }
async function save(page: Page, version: number) { await area(page).getByRole("button", { name: "Save and review", exact: true }).click(); await expect(area(page).getByText(`Saved draft v${version}`, { exact: true })).toBeVisible(); await backToEdits(page); }

test("new draft prefills issuer and finite preset choices but unknown governing law still blocks review", async ({ page }, info) => {
  const f = await fixture(page); await open(page);
  await expect(field(page, "Issuer legal name")).toHaveValue("Qualified Commercial LLC"); await expect(choice(page, "Issuer legal name")).toHaveValue("issuer_settings");
  await expect(choice(page, "Investor eligibility requirements")).toHaveValue("marketplace_membership_policy");
  await expect(field(page, "Investor eligibility requirements")).toHaveValue(/17 calendar days/);
  const jurisdiction = choice(page, "Governing law and offering jurisdictions"); await expect(jurisdiction).toHaveValue("to_be_confirmed");
  await expect(jurisdiction.locator("option")).toHaveCount(54); await expect(jurisdiction.locator('option[value="custom"]')).toHaveCount(1);
  await expect(field(page, "Governing law and offering jurisdictions")).toHaveValue(/remain to be confirmed/); await approvalBlocked(page);
  await area(page).getByRole("button", { name: "Complete Governing law and offering jurisdictions", exact: true }).click(); await expect(jurisdiction).toBeFocused(); await expect(jurisdiction).toBeInViewport();
  expect(writes(f).map(row => row.path)).toEqual([`/capital/admin/listings/${ID}/ppm/generate`]);
  await area(page).getByRole("heading", { name: "Private placement memorandum", exact: true }).evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" })); await page.screenshot({ path: info.outputPath("ppm-presets-overview.png"), fullPage: false });
  await choice(page, "Issuer legal name").evaluate(node => node.closest("label")?.scrollIntoView({ block: "start", behavior: "instant" })); await page.screenshot({ path: info.outputPath("ppm-preset-fields.png"), fullPage: false }); expect(f.errors).toEqual([]);
});

test("selected jurisdiction text and stable ID save and survive a policy source refresh", async ({ page }) => {
  const f = await fixture(page); await open(page); await choice(page, "Governing law and offering jurisdictions").selectOption("us_state_NJ"); await expect(field(page, "Governing law and offering jurisdictions")).toHaveValue(/New Jersey/); await save(page, 2);
  const sent = writes(f).find(row => row.path.endsWith("/ppm/draft"))!; expect((sent.body.legal_presets as Record<string, string>).jurisdiction).toBe("us_state_NJ");
  await f.changeSource(); await expect(area(page).getByText("Saved draft v3", { exact: true })).toBeVisible(); await expect(choice(page, "Governing law and offering jurisdictions")).toHaveValue("us_state_NJ"); await expect(field(page, "Investor eligibility requirements")).toHaveValue(/7 calendar days/);
  expect(writes(f).some(row => /\/members\/|\/ppm\/review|\/publish/.test(row.path))).toBe(false); expect(f.errors).toEqual([]);
});

test("saved custom issuer and eligibility wording are never replaced by a default preset", async ({ page }) => {
  const f = await fixture(page, { existingCustom: true }); await open(page); await expect(choice(page, "Issuer legal name")).toHaveValue("custom"); await expect(field(page, "Issuer legal name")).toHaveValue("Existing Example Issuer LLC");
  await openDetails(page); await area(page).getByRole("button", { name: "Regenerate AI wording", exact: true }).click(); await expect(area(page).getByText("Saved draft v2", { exact: true })).toBeVisible();
  await expect(field(page, "Issuer legal name")).toHaveValue("Existing Example Issuer LLC"); await expect(field(page, "Investor eligibility requirements")).toHaveValue("Additional bespoke investor restriction."); await expect(choice(page, "Investor eligibility requirements")).toHaveValue("custom"); expect(f.errors).toEqual([]);
});

test("same-text Custom intent pins wording during rebase and keeps unrelated remote field changes", async ({ page }) => {
  const f = await fixture(page); await open(page); const old = await field(page, "Investor eligibility requirements").inputValue(); await choice(page, "Investor eligibility requirements").selectOption("custom");
  await f.changeSource(7, "USD", true); await expect(area(page).getByText("Saved draft v2", { exact: true })).toBeVisible(); await area(page).getByRole("button", { name: "Apply my edits to latest facts" }).click(); await expect(area(page).getByText("Saved draft v3", { exact: true })).toBeVisible(); await backToEdits(page);
  await expect(field(page, "Investor eligibility requirements")).toHaveValue(old); await expect(choice(page, "Investor eligibility requirements")).toHaveValue("custom");
  await expect(field(page, "Subscription, acceptance and funding process")).toHaveValue("Updated remote subscription workflow."); await expect(choice(page, "Subscription, acceptance and funding process")).toHaveValue("custom"); await expect(area(page).getByRole("button", { name: "Save and review", exact: true })).toHaveCount(0);
  expect(f.errors).toEqual([]);
});

test("typing and intentionally clearing custom issuer keeps it blank through save and regeneration", async ({ page }) => {
  const f = await fixture(page); await open(page); await field(page, "Issuer legal name").fill(""); await expect(choice(page, "Issuer legal name")).toHaveValue("custom"); await save(page, 2); await f.changeSource(); await expect(area(page).getByText("Saved draft v3", { exact: true })).toBeVisible();
  await expect(field(page, "Issuer legal name")).toHaveValue(""); await expect(choice(page, "Issuer legal name")).toHaveValue("custom"); await expect(area(page).getByRole("region", { name: "PPM facts still needed" })).toContainText("Issuer legal name"); await approvalBlocked(page); expect(f.errors).toEqual([]);
});

test("PPM membership link opens the actual Members tab with the identical server policy", async ({ page }, info) => {
  const f = await fixture(page); await open(page); await openDetails(page); const policy = area(page).getByRole("region", { name: "Investor membership policy", exact: true }); await policy.getByText("View membership requirements", { exact: true }).click();
  const policyText = membershipPolicy(); for (const item of policyText.requirements) await expect(policy).toContainText(item.detail);
  const created = page.waitForEvent("popup"); await policy.getByRole("link", { name: /Manage members and eligibility/ }).click(); const members = await created; await members.waitForURL(`${ORIGIN}/admin/marketplace/members?tab=members`); expect(await members.evaluate(() => window.opener === null)).toBe(true);
  await expect(members.getByRole("heading", { name: "Capital partners", exact: true })).toBeVisible(); await expect(members.getByRole("tab", { name: "Members", exact: true })).toHaveAttribute("aria-selected", "true"); const shown = members.getByRole("region", { name: "Investor membership policy", exact: true });
  for (const item of policyText.requirements) await expect(shown).toContainText(item.detail); await expect(members.getByRole("table", { name: "Members", exact: true })).toContainText("Example waiting investor");
  const geometry = await members.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, viewport: window.visualViewport?.width, devicePixelRatio: window.devicePixelRatio, policyFontSize: getComputedStyle(document.querySelector('[aria-label="Investor membership policy"] p')!).fontSize, policyHeadingFontSize: getComputedStyle(document.querySelector('[aria-label="Investor membership policy"] h3')!).fontSize, grids: [...document.querySelectorAll("main .grid")].map(node => ({ className: node.className, width: node.getBoundingClientRect().width, scroll: node.scrollWidth })) })); await info.attach("members-geometry", { body: JSON.stringify(geometry), contentType: "application/json" }); expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width); expect(geometry.viewport).toBeCloseTo(geometry.width, 0);
  await shown.evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" })); await members.screenshot({ path: info.outputPath("members-policy.png"), fullPage: false });
  const lastColumn = members.getByRole("columnheader", { name: "Activity", exact: true });
  await lastColumn.evaluate(node => { let parent = node.parentElement; while (parent) { if (parent.scrollWidth > parent.clientWidth && /auto|scroll/.test(getComputedStyle(parent).overflowX)) { parent.scrollLeft = parent.scrollWidth; break; } parent = parent.parentElement; } }); await lastColumn.scrollIntoViewIfNeeded(); await expect(lastColumn).toBeInViewport({ ratio: 0.99 }); expect(await members.evaluate(() => document.documentElement.scrollLeft)).toBe(0);
  expect(writes(f).filter(row => !row.path.endsWith("/ppm/generate"))).toEqual([]); expect(f.errors).toEqual([]); await members.close();
});

test("membership policy read failure retries only the policy and keeps member review separate", async ({ page }) => {
  const f = await fixture(page, { membersPage: true, policyFailure: true }); const panel = page.getByRole("region", { name: "Investor membership policy", exact: true }); await expect(panel).toContainText("could not be loaded"); await expect(page.getByRole("table", { name: "Members", exact: true })).toContainText("Example waiting investor"); await panel.getByRole("button", { name: "Retry membership policy" }).click(); await expect(panel).toContainText(membershipPolicy().summary); expect(writes(f)).toEqual([]); expect(f.errors).toEqual([]);
});

test("saved currency preset follows canonical currency changes without turning into Custom", async ({ page }) => {
  const f = await fixture(page); await open(page); const currency = choice(page, "Offering currency"); await expect(currency).toHaveValue("saved_financing_currency"); await f.changeSource(7, "EUR"); await expect(area(page).getByText("Saved draft v2", { exact: true })).toBeVisible(); await expect(currency).toHaveValue("saved_financing_currency"); await expect(field(page, "Offering currency")).toHaveValue("EUR"); expect(f.errors).toEqual([]);
});
