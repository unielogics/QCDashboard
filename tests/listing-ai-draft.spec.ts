import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-listing-ai-"));
  await writeFile(path.join(directory, "api.js"), "export const useAuthedApi=()=>window.fixtureApi;export const useCurrentUser=()=>({data:{role:'super_admin'}});");
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState,useRef}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{OfferPanel}from'@/components/file/cockpit/OfferPanel';import'@/app/globals.css';import'@/app/app-extras.css';
    window.requests=[];let finish=null;let fail=false;
    const response={draft_id:'draft-a',status:'ai_draft',profile_id:'synthetic-listing',loan_id:null,draft:{name:'Private Bridge · Synthetic City',summary:'A reviewed fictional investor presentation.',loan_amount:100000,offered_amount:100000,minimum_investment:100000,program_label:'Private Loan / Bridge',city:'Synthetic City',state:'FL'},source_fingerprint:'reviewed-source',deal_budget_revision:1,field_provenance:[{field:'name',source:'shared terms',explanation:'Loan product and recorded location.'}],missing:[],warnings:[],preserved_fields:[]};
    window.releaseDraft=()=>{finish?.(structuredClone(response));finish=null};window.failNextDraft=()=>{fail=true};
    window.fixtureApi=async(url,options)=>{window.requests.push({url,method:options?.method??'GET'});if(url.endsWith('/deal-budget'))return{profile_id:'synthetic-listing',revision:1,can_edit:true,funding_mode:'single_investor',costs_confirmed:true,currency:'USD',investor_funding_amount:null,minimum_investor_contribution:null,rows:[],calculation:{gross_loan_amount:100000,investor_funding_amount:100000,minimum_investor_contribution:100000,net_client_cash:100000,investor_net_income:12000,investor_net_roi_pct:12}};if(url.includes('/sources/lookup'))return{listing:null};if(url.includes('/sources/suggest-terms'))return{products:[],income_annual:180000,existing_debt_service_monthly:1000,target_dscr:1.25};if(url.endsWith('/ai-draft')){if(fail){fail=false;throw Error('Synthetic AI unavailable')}return new Promise(resolve=>finish=resolve)}throw Error('Unexpected request '+url)};
    const plan={retire:[],exclude:[],add_backs:[],overrides:null,new_loan_amount:100000,new_loan_rate_pct:12,new_loan_term_months:24,new_loan_structure:'amortizing',new_loan_interest_only_months:0,new_loan_payments_per_year:12,new_loan_repayment_config:null};
    const cockpit={profile_id:'synthetic-listing',coverage:{bank_months_accepted:12,bank_months_required:12,tax_years:[2025],debt_schedule_status:'complete',debt_rows:1},dscr:{headline:{numerator:180000,key:'profit_and_loss'},candidates:[]},debt:{service:{monthly:1000,source:'accepted_debt_schedule'}},plan:{evaluation:{active:false}},proposed_terms:{program_key:'private_loan_bridge',program_name:'Private Loan / Bridge'}};
    function App(){const[show,setShow]=useState(false),ref=useRef(null);return <QueryClientProvider client={client}><main className='app' style={{padding:16}}><button onClick={()=>setShow(v=>!v)}>Toggle listing preparation</button><div hidden={!show}><OfferPanel cockpit={cockpit} props={{profileId:'synthetic-listing',canPublish:true,canRecordTerms:false,programReadiness:null,termSheet:null,packageState:{generated:false,inSync:false},onRecordTerms:()=>{},onOpenEvidence:()=>{},onOpenPackage:()=>{},onStructureLoan:()=>{}}} workingFinancing={{profileId:'synthetic-listing',plan,dirty:false,currentDscr:15,projectedDscr:4,projectedDebtServiceAnnual:45000,source:'Synthetic P&L'}} innerRef={ref}/></div></main></QueryClientProvider>};const client=new QueryClient({defaultOptions:{queries:{retry:false}}});createRoot(document.getElementById('root')).render(<App/>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@/hooks/useApi": path.join(directory, "api.js"), "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});
test.beforeEach(async ({ page }) => { await page.route("http://localhost:3402/**", route => { const pathname = new URL(route.request().url()).pathname; return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' }); }); });

test("prepares a draft once the listing is opened, preserves concurrent manual text and never publishes", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3402/");
  await expect.poll(() => page.evaluate(() => (window as unknown as { requests: unknown[] }).requests.length)).toBeGreaterThan(0);
  const aiCount = () => page.evaluate(() => (window as unknown as { requests: Array<{ url: string }> }).requests.filter(request => request.url.endsWith("/ai-draft")).length);
  expect(await aiCount()).toBe(0);
  await page.getByRole("button", { name: "Toggle listing preparation", exact: true }).click();
  await expect.poll(aiCount).toBe(1);
  await page.getByRole("textbox", { name: "Deal title", exact: true }).fill("Manual investor title");
  await page.getByRole("textbox", { name: "Listing summary", exact: true }).fill("Keep my edited summary.");
  await page.evaluate(() => (window as unknown as { releaseDraft: () => void }).releaseDraft());
  await expect(page.getByLabel("Use drafted deal title", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Use drafted listing summary", { exact: true })).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: "Deal title", exact: true })).toHaveValue("Manual investor title");
  await page.screenshot({ path: info.outputPath("listing-draft-controls.png"), fullPage: true });
  await page.getByLabel("Use drafted deal title", { exact: true }).check();
  await page.getByRole("button", { name: "Apply selected draft text", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Deal title", exact: true })).toHaveValue("Private Bridge · Synthetic City");
  await expect(page.getByRole("textbox", { name: "Listing summary", exact: true })).toHaveValue("Keep my edited summary.");
  await page.getByRole("button", { name: "Toggle listing preparation", exact: true }).click();
  await page.getByRole("button", { name: "Toggle listing preparation", exact: true }).click();
  expect(await aiCount()).toBe(1);
  const writes = await page.evaluate(() => (window as unknown as { requests: Array<{ url: string; method: string }> }).requests.filter(request => request.method !== "GET" && !request.url.endsWith("/ai-draft")));
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});
test("failed drafting offers retry without replacing the edited title", async ({ page }) => {
  await page.goto("http://localhost:3402/");
  await page.evaluate(() => (window as unknown as { failNextDraft: () => void }).failNextDraft());
  await page.getByRole("button", { name: "Toggle listing preparation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry listing draft", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Deal title", exact: true }).fill("Title survives failure");
  await page.getByRole("button", { name: "Retry listing draft", exact: true }).click();
  await page.evaluate(() => (window as unknown as { releaseDraft: () => void }).releaseDraft());
  await expect(page.getByLabel("Use drafted deal title", { exact: true })).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: "Deal title", exact: true })).toHaveValue("Title survives failure");
});
