import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-inline-terms-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useQuery}from'@tanstack/react-query';const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useClientTermsSummary" ? "export const useClientTermsSummary=id=>useQuery({queryKey:['application-client-terms',id],queryFn:()=>call('/application-profiles/'+id+'/client-terms')});" : `export const ${name}=()=>({});`).join("\n")}`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isSignedIn:false,getToken:async()=>null});export const visualQaUser=()=>null;",
    "@/store/role": "export const useActiveProfile=()=>({email:'synthetic@example.test'});",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{ClientTermsDrawer}from'@/components/file/cockpit/ClientTermsStrip';import{TermSheetDrawer}from'@/production-package/TermSheetDrawer';import'@/app/globals.css';import'@/app/app-extras.css';
    let collateral={profile_id:'inline-a',enabled:false,revision:1,can_edit:true,properties:[],assets:[],property_options:[],source_file_options:[]};
    let budget={profile_id:'inline-a',revision:1,can_edit:true,funding_mode:'single_investor',costs_confirmed:true,investor_funding_amount:null,minimum_investor_contribution:null,currency:'USD',rows:[],note:null,calculation:{gross_loan_amount:380000,investor_funding_amount:380000,minimum_investor_contribution:380000,net_client_cash:380000}};
    let terms={profile_id:'inline-a',term_sheet_id:'terms-a',version:1,status:'draft',amount:380000,apr_pct:29.99,term_months:24,loan_type:'private_loan_bridge',loan_type_label:'Private Loan / Bridge',loan_type_options:[{value:'private_loan_bridge',label:'Private Loan / Bridge'}],funder_type:'private_capital',repayment_frequency:'monthly',debt_service_treatment:'additive',loan_structure:'amortizing',interest_only_months:6,repayment_config:{amortization_months:60,balloons:[]},expiration_days:7,closing_estimate_days:5,co_brand_enabled:false,conditions:[],collateral_revision:1,deal_budget_revision:1,calculation:{cash_flow_value:180000,current_annual_debt_service:24000,dscr_before:7.5,dscr_after:1,source:'Synthetic P&L',dscr_method:'business'}};
    window.fixtureApi=async(url,options)=>{const responseProfile=url.split('/')[2];if(url.endsWith('/collateral')){if(options?.method==='PATCH'){const body=JSON.parse(options.body);if(body.expected_revision!==collateral.revision)throw Error('Collateral revision conflict');collateral={...collateral,...body,revision:collateral.revision+1}}return structuredClone({...collateral,profile_id:responseProfile})}if(url.endsWith('/deal-budget/preview'))return structuredClone({...budget,profile_id:responseProfile});if(url.endsWith('/deal-budget')){if(options?.method==='PATCH'){const body=JSON.parse(options.body);if(body.expected_revision!==budget.revision)throw Error('Budget revision conflict');budget={...budget,...body,revision:budget.revision+1}}return structuredClone({...budget,profile_id:responseProfile})}if(url.endsWith('/client-terms')){if(options?.method==='PUT'){const body=JSON.parse(options.body);window.lastTermsSave=body;if(body.expected_version!==terms.version)throw Error('Terms revision conflict');terms={...terms,...body,version:terms.version+1,collateral_revision:collateral.revision,deal_budget_revision:budget.revision}}return structuredClone(terms)}throw Error('Unexpected service '+url)};
    const loan={amount:380000,ratePct:29.99,termMonths:24,structure:'amortizing',interestOnlyMonths:6,repaymentConfig:{amortization_months:60,balloons:[]},paymentsPerYear:12};
    let delayDealerA=false,releaseDealerA=null;window.delayDealerLoad=()=>{delayDealerA=true};window.releaseDealerLoad=()=>releaseDealerA?.();
    const dealerData=id=>({current:null,history:[],can_edit:true,defaults:{funding_party_name:'Synthetic Capital '+id,funder_type:'private_capital',approved_amount:id==='inline-b'?220000:100000,min_activation_amount:100000,rate_pct:id==='inline-b'?11:15,term_months:24},defaults_source:{},facility_types:[],funding_party_kinds:[],lenders:[]});
    const dealerClient={mode:'operator',termSheet:async id=>{if(id==='inline-a'&&delayDealerA){delayDealerA=false;return new Promise(resolve=>{releaseDealerA=()=>resolve(dealerData(id))})}return dealerData(id)}};
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});function App(){const[open,setOpen]=useState(false),[dealer,setDealer]=useState(false),[dealerProfile,setDealerProfile]=useState("inline-a"),[draft,setDraft]=useState(null);window.setDealerProfile=setDealerProfile;return <QueryClientProvider client={client}><main className='app' style={{padding:16}}><button onClick={()=>setOpen(true)}>Open standard full terms</button><button onClick={()=>setDealer(true)}>Open dealer full terms</button><ClientTermsDrawer open={open} onClose={()=>setOpen(false)} profileId='inline-a' prefillLoan={loan} workingDraft={draft} onWorkingDraftChange={setDraft}/>{dealer?<TermSheetDrawer open client={dealerClient} profileId={dealerProfile} onClose={()=>setDealer(false)}/>:null}</main></QueryClientProvider>};createRoot(document.getElementById('root')).render(<App/>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, plugins: [{ name: "synthetic-services", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture" } : undefined); build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});
test.beforeEach(async ({ page }) => { await page.route("http://localhost:3403/**", route => { const path = new URL(route.request().url()).pathname; return route.fulfill(path === "/app.js" ? { contentType: "text/javascript", body: script } : path === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' }); }); });

test("standard full terms edits collateral and costs inline, retains drafts and versions the reviewed snapshots", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3403/");
  await page.getByRole("button", { name: "Open standard full terms", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Client terms editor", exact: true });
  await expect(editor).toHaveClass(/drawer--fullscreen/);
  await editor.getByLabel("APR", { exact: true }).fill("20");
  await editor.getByRole("tab", { name: "Collateral", exact: true }).click();
  await editor.getByLabel("Include collateral in the financing proposal", { exact: true }).check();
  await editor.getByRole("button", { name: "Add asset", exact: true }).click();
  await editor.getByLabel("Asset 1 description", { exact: true }).fill("Synthetic collateral equipment");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Open standard full terms", exact: true }).click();
  await expect(editor.getByLabel("APR", { exact: true })).toHaveValue("20");
  await editor.getByRole("tab", { name: "Collateral", exact: true }).click();
  await expect(editor.getByLabel("Asset 1 description", { exact: true })).toHaveValue("Synthetic collateral equipment");
  await editor.getByRole("button", { name: "Save new version", exact: true }).click();
  await expect(editor).toContainText("Collateral has unsaved changes");
  await editor.getByRole("button", { name: "Save collateral", exact: true }).click();
  await expect(editor).toContainText("Collateral saved");
  await editor.getByRole("tab", { name: "Investment & closing costs", exact: true }).click();
  await editor.getByRole("button", { name: "Add cost", exact: true }).click();
  await editor.getByLabel("Cost 1 label", { exact: true }).fill("Documented closing cost");
  await editor.getByLabel("Cost 1 value", { exact: true }).fill("1000");
  await editor.getByRole("tab", { name: "Loan terms", exact: true }).click();
  await expect(editor.getByLabel("Loan term / maturity in months", { exact: true })).toHaveValue("24");
  await expect(editor.getByLabel("Amortization after interest-only (months)", { exact: true })).toHaveValue("60");
  await editor.getByRole("tab", { name: "Investment & closing costs", exact: true }).click();
  await expect(editor.getByLabel("Cost 1 value", { exact: true })).toHaveValue("1000");
  await editor.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(editor).toContainText("revision 2 saved");
  await page.screenshot({ path: info.outputPath("standard-full-terms-inline.png"), fullPage: true });
  await editor.getByRole("button", { name: "Save new version", exact: true }).click();
  await expect(editor).toContainText("Client terms v2 saved");
  const saved = await page.evaluate(() => (window as unknown as { lastTermsSave: { expected_collateral_revision: number; expected_deal_budget_revision: number; apr_pct: number } }).lastTermsSave);
  expect(saved).toMatchObject({ expected_collateral_revision: 2, expected_deal_budget_revision: 2, apr_pct: 20 });
  expect(errors).toEqual([]);
});
test("dealer full terms uses the same inline editors and retains its loan draft after closing", async ({ page }, info) => {
  await page.goto("http://localhost:3403/");
  await page.getByRole("button", { name: "Open dealer full terms", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Production loan terms", exact: true });
  await expect(editor).toHaveClass(/drawer--fullscreen/);
  await editor.getByLabel("Fixed interest rate %", { exact: true }).fill("18");
  await editor.getByRole("tab", { name: "Collateral", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Add property", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await editor.getByRole("tab", { name: "Investment & closing costs", exact: true }).click();
  await expect(editor.getByLabel("Funding format", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("dealer-full-terms-inline.png"), fullPage: true });
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Open dealer full terms", exact: true }).click();
  await expect(editor.getByLabel("Fixed interest rate %", { exact: true })).toHaveValue("18");
});
test("dealer profiles retain only their own drafts and ignore a late previous-file load", async ({ page }) => {
  await page.goto("http://localhost:3403/");
  await page.getByRole("button", { name: "Open dealer full terms", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Production loan terms", exact: true });
  await editor.getByLabel("Fixed interest rate %", { exact: true }).fill("18");
  await page.evaluate(() => (window as unknown as { setDealerProfile: (id: string) => void }).setDealerProfile("inline-b"));
  await expect(editor.getByLabel("Fixed interest rate %", { exact: true })).toHaveValue("11");
  await page.evaluate(() => (window as unknown as { setDealerProfile: (id: string) => void }).setDealerProfile("inline-a"));
  await expect(editor.getByLabel("Fixed interest rate %", { exact: true })).toHaveValue("18");
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => (window as unknown as { delayDealerLoad: () => void }).delayDealerLoad());
  await page.getByRole("button", { name: "Open dealer full terms", exact: true }).click();
  await page.evaluate(() => (window as unknown as { setDealerProfile: (id: string) => void }).setDealerProfile("inline-b"));
  await expect(editor.getByLabel("Fixed interest rate %", { exact: true })).toHaveValue("11");
  await page.evaluate(() => (window as unknown as { releaseDealerLoad: () => void }).releaseDealerLoad());
  await expect(editor.getByLabel("Fixed interest rate %", { exact: true })).toHaveValue("11");
});
