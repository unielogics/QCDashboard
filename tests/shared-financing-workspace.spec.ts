import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The real CoverageCard, terms editor, dialogs and calculation engine run here.
// Only services/auth and unrelated financial panels are replaced; all records are fictional.
let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-shared-financing-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useQuery}from'@tanstack/react-query';const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useClientTermsSummary" ? "export const useClientTermsSummary=(id)=>useQuery({queryKey:['application-client-terms',id],queryFn:()=>call('/application-profiles/'+id+'/client-terms')});" : `export const ${name}=()=>({isPending:false,mutateAsync:async value=>({record:{...value,updated_at:'2026-11-09T15:00:00Z'}})});`).join("\n")}`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isSignedIn:false,getToken:async()=>null});export const visualQaUser=()=>null;",
    "@/store/role": "export const useActiveProfile=()=>({email:'qa@example.test'});",
    "@/components/application/FinancialWorkspace": "export const FinancialWorkspace=()=>null;",
    "./EbitdaRefinanceComparison": "export const EbitdaRefinanceComparison=()=>null;",
    "./RevenueTrendPanel": "export const RevenueTrendPanel=()=>null;",
    "./FinancialReviewDrawer": "import{Drawer}from'@/components/ds/Drawer';export function FinancialReviewDrawer(p){return <Drawer open={p.open} onClose={p.onClose} title='Coverage plan' ariaLabel='Coverage plan review' headerActions={p.planActions}>{p.planContent}</Drawer>}",
    "./CockpitCharts": "export const SERIES={};export const ChartCard=()=>null;export const ColumnChart=()=>null;export const LineChart=()=>null;export const Meter=()=>null;",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{CoverageCard}from'@/components/file/cockpit/CoverageCard';import{FinancingProposalSummary}from'@/components/file/FinancingProposalSummary';import{TermSheetDrawer}from'@/production-package/TermSheetDrawer';import'@/app/globals.css';import'@/app/app-extras.css';
    const initial={retire:[],exclude:[],add_backs:[],overrides:null,terms_ref:null,note:null,new_loan_amount:380000,new_loan_rate_pct:29.99,new_loan_term_months:24,new_loan_interest_only:false,new_loan_structure:'amortizing',new_loan_interest_only_months:6,new_loan_repayment_config:{amortization_months:60,balloons:[]},new_loan_payments_per_year:12,new_payment_monthly:null,new_payment_source:'manual_terms',updated_at:'2026-11-09T12:00:00Z'};
    let record=structuredClone(initial),revision=1;let terms={profile_id:'synthetic-a',version:1,status:'draft',term_sheet_id:'terms-a',amount:380000,apr_pct:29.99,term_months:24,loan_type:'private_loan_bridge',loan_type_label:'Private Loan / Bridge',loan_type_options:[{value:'private_loan_bridge',label:'Private Loan / Bridge'}],funder_type:'private_capital',repayment_frequency:'monthly',debt_service_treatment:'additive',loan_structure:'amortizing',interest_only_months:6,repayment_config:{amortization_months:60,balloons:[]},expiration_days:7,closing_estimate_days:5,co_brand_enabled:false,conditions:[],collateral_revision:1,current_collateral_revision:1,collateral_stale:false,calculation:{cash_flow_value:180000,current_annual_debt_service:24000,dscr_before:7.5,dscr_after:1,dscr_method:'business',source:'Synthetic P&L'}};
    window.fixtureApi=async(url,options)=>{if(url.endsWith('/deal-budget'))return{profile_id:'synthetic-a',revision:1,can_edit:true,funding_mode:'single_investor',costs_confirmed:true,investor_funding_amount:null,minimum_investor_contribution:null,currency:'USD',rows:[],calculation:{gross_loan_amount:380000,investor_funding_amount:380000,minimum_investor_contribution:380000}};if(url.endsWith('/collateral'))return{profile_id:'synthetic-a',enabled:false,properties:[],assets:[],revision,can_edit:true,property_options:[],source_file_options:[]};if(url.endsWith('/client-terms')){if(options?.method==='PUT'){const body=JSON.parse(options.body);window.lastTermsSave=body;record={...body.financial_plan,updated_at:'2026-11-09T15:00:00Z'};terms={...terms,...body,version:terms.version+1,collateral_revision:revision,current_collateral_revision:revision,deal_budget_revision:1,current_deal_budget_revision:1,financial_plan:{record}};}return structuredClone(terms);}throw Error('Unexpected fixture API: '+url)};
    window.changeCollateral=()=>{revision++};
    const basis={key:'profit_and_loss',label:'Synthetic P&L',period:'2025',numerator:180000,value:7.5,annual_debt_service:24000,status:'very_strong',currency_comparable:true};
    const cockpit=()=>({profile_id:'synthetic-a',tax:{years:[]},bank:{accounts:[],recurring:{payees:[],months_read:[]}},debt:{obligations:[],service:{monthly:2000,annual:24000}},dscr:{headline:basis,candidates:[basis],thresholds:{acceptable:1,healthy:1.25,very_strong:1.5},no_debt:false,annual_debt_service:24000},plan:{record,evaluation:{active:true},levers:[]},profit_and_loss:null,balance_sheet:null});
    const dealerClient={mode:'operator',termSheet:async()=>({current:null,history:[],can_edit:true,defaults:{funding_party_name:'Synthetic Capital',approved_amount:100000,min_activation_amount:100000,rate_pct:15,term_months:24},defaults_source:{},facility_types:[],funding_party_kinds:[],lenders:[]})};
    function DealerProbe(){const[open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open dealer terms</button><div hidden data-testid='dealer-production-host'>{open?<TermSheetDrawer open onClose={()=>setOpen(false)} profileId='synthetic-a' client={dealerClient}/>:null}</div></>}
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    function App(){const[view,setView]=useState('financials'),[profile,setProfile]=useState('synthetic-a'),[data,setData]=useState(cockpit),[value,setValue]=useState(null),[termsRequest,setTermsRequest]=useState(0),[reviewRequest,setReviewRequest]=useState(0);return <QueryClientProvider client={client}><main className='app' style={{padding:16}}><DealerProbe/><nav><button onClick={()=>setView('financials')}>Financials tab</button><button onClick={()=>setView('underwriting')}>Underwriting tab</button><button onClick={()=>{setProfile('synthetic-b');setValue(null);setTermsRequest(0);setReviewRequest(0)}}>Another file</button></nav><div hidden={view!=='financials'} data-testid='financials-host'><CoverageCard key={profile} profileId={profile} cockpit={data} months={[]} summary={{months:0}} accountLabel='All accounts' canEdit canReviewDebt canRecordTerms={false} onRecordTerms={()=>{}} termsKind='client' onRefresh={()=>setData(cockpit())} termsRequest={termsRequest} reviewRequest={reviewRequest} onWorkingPlanChange={setValue}/></div>{view==='underwriting'?<FinancingProposalSummary value={value} requestedAmount={200000} onEdit={()=>setTermsRequest(n=>n+1)} onCoverage={()=>setReviewRequest(n=>n+1)}/>:null}</main></QueryClientProvider>};createRoot(document.getElementById('root')).render(<App/>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, plugins: [{ name: "synthetic-services", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture" } : undefined); build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});
test.beforeEach(async ({ page }) => {
  await page.route("http://financing.test/**", route => { const pathname = new URL(route.request().url()).pathname; return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' }); });
});

test("underwriting opens the shared editor while Financials is hidden and retains repayment edits", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => { errors.push(error.message); });
  await page.goto("http://financing.test/");
  await page.getByRole("button", { name: "Underwriting tab", exact: true }).click();
  await expect(page.getByTestId("financials-host")).toBeHidden();
  await page.getByRole("button", { name: "Structure loan", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Client terms editor", exact: true });
  await expect(editor.getByLabel("Loan term / maturity in months", { exact: true })).toHaveValue("24");
  await expect(editor.getByLabel("Amortization after interest-only (months)", { exact: true })).toHaveValue("60");
  await editor.getByLabel("APR", { exact: true }).fill("20");
  await editor.getByText("Advanced repayment", { exact: false }).first().click();
  await editor.getByRole("button", { name: "Add principal payment", exact: true }).click();
  await editor.getByLabel("Principal payment 1 value", { exact: true }).fill("15000");
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Financials tab", exact: true }).click();
  await page.getByRole("button", { name: "Underwriting tab", exact: true }).click();
  await page.getByRole("button", { name: "Structure loan", exact: true }).click();
  await expect(editor.getByLabel("APR", { exact: true })).toHaveValue("20");
  await expect(editor.getByLabel("Amortization after interest-only (months)", { exact: true })).toHaveValue("60");
  await editor.getByRole("button", { name: "Apply loan to scenario", exact: true }).click();
  await expect(page.getByRole("region", { name: "Shared financing proposal" })).toContainText("Working plan · unsaved");
  await page.getByRole("button", { name: "Coverage plan", exact: true }).click();
  const plan = page.getByRole("dialog", { name: "Coverage plan review", exact: true });
  await expect(plan.getByLabel("New loan rate percent", { exact: true })).toHaveValue("20");
  await plan.getByText("Advanced repayment", { exact: false }).first().click();
  await expect(plan.getByLabel("Principal payment 1 value", { exact: true })).toHaveValue("15000");
  await expect(plan.getByLabel("New loan term in months", { exact: true })).toHaveValue("24");
  await expect(plan.getByLabel("Amortization after interest-only (months)", { exact: true })).toHaveValue("60");
  expect(errors).toEqual([]);
});

test("a new terms version snapshots the reviewed collateral revision", async ({ page }) => {
  await page.goto("http://financing.test/");
  await page.getByRole("button", { name: "Underwriting tab", exact: true }).click();
  await page.getByRole("button", { name: "Structure loan", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Client terms editor", exact: true });
  await editor.getByLabel("APR", { exact: true }).fill("20");
  await page.evaluate(() => (window as unknown as { changeCollateral: () => void }).changeCollateral());
  await editor.getByRole("button", { name: "Save new version", exact: true }).click();
  await expect(editor).toContainText("Collateral changed in another session");
  expect(await page.evaluate(() => (window as unknown as { lastTermsSave?: unknown }).lastTermsSave)).toBeUndefined();
  await editor.getByRole("button", { name: "Save new version", exact: true }).click();
  await expect(editor).toContainText("Client terms v2 saved");
  expect(await page.evaluate(() => (window as unknown as { lastTermsSave: { expected_collateral_revision: number } }).lastTermsSave.expected_collateral_revision)).toBe(2);
});

test("a different file does not inherit pending editor changes or open requests", async ({ page }) => {
  await page.goto("http://financing.test/");
  await page.getByRole("button", { name: "Underwriting tab", exact: true }).click();
  await page.getByRole("button", { name: "Structure loan", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Client terms editor", exact: true });
  await editor.getByLabel("APR", { exact: true }).fill("20");
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Another file", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Structure loan", exact: true }).click();
  await expect(editor.getByLabel("APR", { exact: true })).toHaveValue("29.99");
});

test("dealer terms and their collateral portal out of a hidden production tab and close normally", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://financing.test/");
  const opener = page.getByRole("button", { name: "Open dealer terms", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Production loan terms", exact: true });
  await expect(page.getByTestId("dealer-production-host")).toBeHidden();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Collateral", exact: true }).click();
  const collateral = dialog.getByRole("region", { name: "Loan collateral editor", exact: true });
  await expect(collateral).toBeVisible();
  await expect(collateral.getByRole("button", { name: "Add property", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});
