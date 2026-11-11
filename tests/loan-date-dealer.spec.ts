import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-principal-dealer-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useQuery}from'@tanstack/react-query';const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useClientTermsSummary" ? "export const useClientTermsSummary=id=>useQuery({queryKey:['application-client-terms',id],queryFn:()=>call('/application-profiles/'+id+'/client-terms')});" : `export const ${name}=()=>({});`).join("\n")}`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isSignedIn:false,getToken:async()=>null});export const visualQaUser=()=>null;",
    "@/store/role": "export const useActiveProfile=()=>({email:'synthetic@example.test'});",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{ClientTermsDrawer}from'@/components/file/cockpit/ClientTermsStrip';import{TermSheetDrawer}from'@/production-package/TermSheetDrawer';import'@/app/globals.css';import'@/app/app-extras.css';

    const profile='dealer-principal';
    const defaults={funding_party_name:'Original Capital',funder_type:'private_credit',facility_type:'Private Loan / Bridge',facility_catalog_key:'other',facility_kind:'term_loan',approved_amount:195000,min_activation_amount:10000,rate_pct:29.99,term_months:24,rate_structure:'fixed',repayment_structure:'fully_amortizing',payment_frequency:'monthly',payments_per_year:12,interest_only_months:6,amortization_months:60,repayment_config:{amortization_months:60,balloons:[]},notes:'Original note'};
    let state={current:null,history:[],can_edit:true,defaults,defaults_source:{},facility_types:[],funding_party_kinds:[],lenders:[]};
    let budget={profile_id:profile,revision:2,can_edit:true,funding_mode:'single_investor',costs_confirmed:true,loan_amount_mode:'target_net',base_loan_amount:null,target_net_amount:195000,investor_funding_amount:null,minimum_investor_contribution:null,currency:'USD',rows:[{id:'00000000-0000-4000-8000-000000000001',label:'Financed closing charge',category:'closing_cost',payer:'borrower',method:'fixed',value:5000,basis:'loan_amount',timing:'closing',settlement:'financed',enabled:true,reserve_release:'unknown'}],note:null};
    const plan={profile_id:profile,record:{retire:['keep-reviewed-payoff'],exclude:[],new_loan_amount:195000,new_loan_rate_pct:29.99,new_loan_term_months:24,new_loan_structure:'amortizing',new_loan_interest_only:false,new_loan_interest_only_months:6,new_loan_repayment_config:{amortization_months:60},new_loan_payments_per_year:12,new_payment_monthly:null,new_payment_source:'manual_terms',add_backs:[],overrides:null,terms_ref:null,note:'Keep plan note',updated_at:'2026-11-10T12:00:00Z'}};
    let mode='mismatch';let required=200000;window.saveAttempts=[];window.savedTerms=[];
    const calc=()=>({gross_loan_amount:required,net_client_cash:195000,principal_solution:{status:mode==='unknown'?'unknown':'calculated',gross_loan_amount:mode==='unknown'?null:required,net_client_cash:mode==='unknown'?null:195000,issues:mode==='unknown'?['Enter the missing closing charge']:[]},scheduled_payment:{monthly_equivalent:2500},financing_fee_coverage:{with_financing_fees_dscr:1.15}});
    const read=()=>({...budget,calculation:calc(),financial_plan:plan,financing_context:{current_loan_amount:195000,plan_updated_at:plan.record.updated_at,terms_ref:null}});
    window.fixtureApi=async(url,options)=>{if(url.endsWith('/collateral'))return{profile_id:profile,enabled:false,revision:1,can_edit:true,properties:[],assets:[],property_options:[],source_file_options:[]};if(url.endsWith('/deal-budget/preview')){if(mode==='failed')throw Error('Synthetic preview unavailable');return structuredClone(read())}if(url.endsWith('/deal-budget'))return structuredClone(read());throw Error('Unexpected fixture API '+url)};
    const dealerClient={mode:'operator',termSheet:async()=>structuredClone(state),saveTermSheet:async(id,body)=>{window.saveAttempts.push(body);if(mode==='race'){mode='mismatch';required=200000;throw Object.assign(Error('Apply the calculated gross principal to the shared loan before saving these terms.'),{status:409})}window.savedTerms.push(body);state={...state,current:{...body,id:'synthetic-terms',version:1,status:'current'}};return{state:structuredClone(state)}}};
    const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});window.setMode=next=>{mode=next;required=next==='race'?195000:200000;queryClient.invalidateQueries({queryKey:['file-deal-budget',profile]});queryClient.invalidateQueries({queryKey:['file-deal-budget-preview',profile]})};
    function App(){const[open,setOpen]=useState(false);return<QueryClientProvider client={queryClient}><main className='app' style={{padding:16}}><button onClick={()=>setOpen(true)}>Open dealer terms</button>{open?<TermSheetDrawer open client={dealerClient} profileId={profile} financialPlanDraft={{...plan.record,expected_updated_at:plan.record.updated_at}} onClose={()=>setOpen(false)}/>:null}</main></QueryClientProvider>}createRoot(document.getElementById('root')).render(<App/>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, plugins: [{ name: "synthetic-services", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture" } : undefined); build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});
test.beforeEach(async ({ page }) => { await page.route("http://localhost:3410/**", route => { const path = new URL(route.request().url()).pathname; return route.fulfill(path === "/app.js" ? { contentType: "text/javascript", body: script } : path === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' }); }); });


async function openDealer(page: import('@playwright/test').Page){await page.goto('http://localhost:3410/');await page.getByRole('button',{name:'Open dealer terms',exact:true}).click();return page.getByRole('dialog',{name:'Production loan terms',exact:true})}

test('dealer automatically derives maturity and saves date mode in the existing version payload',async({page})=>{
 const editor=await openDealer(page);await editor.getByLabel('Estimated funding date',{exact:true}).fill('2026-01-31');
 await expect(editor.getByLabel('Estimated maturity date',{exact:true})).toHaveValue('2028-01-31');await expect(editor.getByLabel('Estimated maturity date',{exact:true})).toBeDisabled();
 const save=editor.getByRole('button',{name:'Record term sheet v1',exact:true});await expect(save).toBeEnabled();await save.click();await expect(editor).toContainText('Term sheet v1 recorded');
 const saved=await page.evaluate(()=>(window as unknown as {savedTerms:Array<Record<string,unknown>>}).savedTerms);expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({expected_funding_date:'2026-01-31',maturity_date:'2028-01-31',extra:{maturity_date_mode:'automatic'}});
});

test('dealer manual maturity is preserved through later term edits and save',async({page})=>{
 const editor=await openDealer(page);await editor.getByLabel('Estimated funding date',{exact:true}).fill('2026-01-31');await editor.getByLabel('Maturity calculation',{exact:true}).selectOption('manual');await editor.getByLabel('Estimated maturity date',{exact:true}).fill('2029-06-30');
 const save=editor.getByRole('button',{name:'Record term sheet v1',exact:true});await expect(save).toBeEnabled();await save.click();await expect(editor).toContainText('Term sheet v1 recorded');
 const saved=await page.evaluate(()=>(window as unknown as {savedTerms:Array<Record<string,unknown>>}).savedTerms);expect(saved[0]).toMatchObject({expected_funding_date:'2026-01-31',maturity_date:'2029-06-30',extra:{maturity_date_mode:'manual'}});
});
