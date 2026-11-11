import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MARKETPLACE_PROFILE as PROFILE, marketplaceBudget, marketplaceCockpit, marketplacePlan, marketplaceProduct } from "./fixtures/marketplacePanel";

const ORIGIN = "https://loan-dates.test";
let script: Buffer, css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketplace-panel-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useQuery,useMutation,useQueryClient}from'@tanstack/react-query';const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useFinancialCockpit" ? "export const useFinancialCockpit=id=>useQuery({queryKey:['financial-cockpit',id],queryFn:()=>call('/application-profiles/'+id+'/financial-cockpit')});" : name === "useSaveFinancialPlan" ? "export function useSaveFinancialPlan(id){const q=useQueryClient();return useMutation({mutationFn:body=>call('/application-profiles/'+id+'/financial-plan',{method:'PUT',body:JSON.stringify(body)}),onSuccess:()=>q.invalidateQueries({queryKey:['financial-cockpit',id]})})}" : name === "useClientTermsSummary" ? "export const useClientTermsSummary=id=>useQuery({queryKey:['application-client-terms',id],queryFn:()=>call('/application-profiles/'+id+'/client-terms')});" : `export const ${name}=()=>({isPending:false,data:null,mutateAsync:async()=>({}),refetch:async()=>({})});`).join("\n")}`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-staff-token'});export const visualQaUser=()=>null;",
    "@/store/role": "export const useActiveProfile=()=>({email:'synthetic@example.test'});",
    "@/lib/financialKpiReview": "export const metricEntries=()=>[];",
    "@/components/design-system/ConfirmationProvider": "export const useConfirmAction=()=>async()=>true;",
    "@/components/application/FinancialWorkspace": "export const FinancialWorkspace=()=>null;",
    "@/components/application/ApplicationLenderSubmissions": "export const ApplicationLenderSubmissions=()=>null;",
    "./OperatingPlanEntry": "export const OperatingPlanEntry=()=>null;",
    "./FinancialMetricReviewWorkspace": "export const FinancialMetricReviewWorkspace=()=>null;",
    "./EbitdaRefinanceComparison": "export const EbitdaRefinanceComparison=()=>null;",
    "./RevenueTrendPanel": "export const RevenueTrendPanel=()=>null;",
    "./CockpitCharts": "export const SERIES={};export const ChartCard=()=>null;export const ColumnChart=()=>null;export const LineChart=()=>null;export const Meter=()=>null;export const HBarList=()=>null;export const Sparkline=()=>null;",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{FinancialCockpit}from'@/components/file/cockpit/FinancialCockpit';import{parseMarketplaceFinancialAction}from'@/lib/marketplaceIssues';import'@/app/globals.css';import'@/app/app-extras.css';
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff-token','Content-Type':'application/json'}});const data=await response.json();if(!response.ok){const error=new Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail));error.status=response.status;error.body=data;throw error}return data};
    const readiness={profile_id:'${PROFILE}',lending_applicable:true,selection_mode:'auto',selections:[],evidence_policies:[],candidates:[],programs:[],requirements:[],available_evidence_files:[],evidence_summary:{},can_advance:false,automatic_stage_status:'not_ready',automation:{enabled:false,eligible:false,attempts:0,max_attempts:3}};
    function App(){const action=parseMarketplaceFinancialAction(new URLSearchParams(location.search).get('financial_action'));const editable=!location.search.includes('readonly');window.refreshCockpit=()=>client.invalidateQueries({queryKey:['financial-cockpit']});return <FinancialCockpit profileId='${PROFILE}' businessName='Example Studio LLC' canPublish={editable} canRecordTerms={false} canUnderwrite={editable} programReadiness={readiness} termSheet={null} packageState={{generated:false,inSync:false,summaryVersion:null,packetVersion:null}} focus={null} onFocusHandled={()=>{}} initialFinancialAction={action} onRecordTerms={()=>{throw new Error('Unexpected production terms action')}} onOpenEvidence={()=>{}} onOpenPackage={()=>{}}/>};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><App/></main></QueryClientProvider>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});



type Obj=Record<string,unknown>;
async function fixture(page:Page,action='coverage'){
 let record={...marketplacePlan(),new_loan_expected_funding_date:null,new_loan_maturity_date:null,new_loan_maturity_mode:'automatic'} as Obj;
 let client:Obj={profile_id:PROFILE,version:4,status:'draft',loan_type:'term',loan_type_label:'Term loan',loan_type_options:[{value:'term',label:'Term loan'}],amount:175000,apr_pct:10,term_months:24,funder_type:'other',funder_name:'Synthetic fund',repayment_frequency:'monthly',debt_service_treatment:'additive',loan_structure:'amortizing',interest_only_months:0,expiration_days:7,closing_estimate_days:5,co_brand_enabled:false,conditions:[],calculation:{},expected_funding_date:null,maturity_date:null,maturity_date_mode:'automatic'};
 const requests:Array<{path:string;method:string;body:Obj}>=[],errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(`${ORIGIN}/**`,route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(!path.startsWith('/api/v1'))return route.fulfill(path==='/app.js'?{contentType:'text/javascript',body:script}:path==='/app.css'?{contentType:'text/css',body:css}:{contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'});
  const api=path.replace('/api/v1',''),method=req.method(),body=req.postData()?req.postDataJSON() as Obj:{};requests.push({path:api,method,body});
  const json=(v:unknown)=>route.fulfill({json:v});
  if(api.endsWith('/financial-cockpit'))return json(marketplaceCockpit(record as ReturnType<typeof marketplacePlan>));
  if(api.endsWith('/financial-plan')){record={...record,...body,updated_at:'2026-11-11T15:00:00Z'};return json({profile_id:PROFILE,record});}
  if(api.endsWith('/client-terms')){if(method==='PUT'){client={...client,...body,version:5};return json(client);}return json(client);}
  if(api.endsWith('/deal-budget')||api.endsWith('/deal-budget/preview'))return json(marketplaceBudget());
  if(api.endsWith('/use-of-funds'))return json({profile_id:PROFILE,revision:1,currency:'USD',requested_amount:175000,can_edit:true,items:[],complete:false,allocated_amount:0,remaining_amount:175000,warnings:[],requires_exact_allocation:false});
  if(api.endsWith('/collateral'))return json({profile_id:PROFILE,enabled:false,revision:1,can_edit:true,properties:[],assets:[],property_options:[],source_file_options:[]});
  if(api.endsWith('/sources/lookup'))return json({listing:null});
  if(api.endsWith('/sources/suggest-terms'))return json({profile_id:PROFILE,income_annual:180000,existing_debt_service_monthly:2000,products:[marketplaceProduct()]});
  if(api.endsWith('/marketplace-publication'))return json({profile_id:PROFILE,listing:null,can_manage:true});
  return json({});
 });
 await page.goto(`${ORIGIN}/?financial_action=${action}`);
 return{requests,errors};
}

test('coverage calendar dates clamp month-end and the saved plan carries the derived maturity',async({page})=>{
 const f=await fixture(page);const drawer=page.getByRole('dialog',{name:'Advanced financial review — Example Studio LLC',exact:true});await expect(drawer).toBeVisible();
 const funding=drawer.getByLabel('Estimated funding date',{exact:true});await funding.fill('2026-01-31');await drawer.getByLabel('New loan term in months',{exact:true}).fill('1');
 await expect(drawer.getByLabel('Estimated maturity date',{exact:true})).toHaveValue('2026-02-28');await expect(drawer.getByLabel('Estimated maturity date',{exact:true})).toBeDisabled();
 await drawer.getByRole('button',{name:'Save plan',exact:true}).click();await expect.poll(()=>f.requests.filter(r=>r.path.endsWith('/financial-plan')&&r.method==='PUT').length).toBe(1);
 expect(f.requests.find(r=>r.path.endsWith('/financial-plan')&&r.method==='PUT')?.body).toMatchObject({new_loan_expected_funding_date:'2026-01-31',new_loan_maturity_date:'2026-02-28',new_loan_maturity_mode:'automatic'});expect(f.errors).toEqual([]);
});

test('coverage manual dates survive term changes and saved reload without replacing the input',async({page})=>{
 const f=await fixture(page);let drawer=page.getByRole('dialog',{name:'Advanced financial review — Example Studio LLC',exact:true});await expect(drawer).toBeVisible();
 await drawer.getByLabel('Estimated funding date',{exact:true}).fill('2026-01-31');await drawer.getByLabel('Maturity calculation',{exact:true}).selectOption('manual');
 const maturity=drawer.getByLabel('Estimated maturity date',{exact:true});await maturity.fill('2028-06-30');await maturity.evaluate(node=>(window as unknown as {dateInput:Element}).dateInput=node);
 await drawer.getByLabel('New loan term in months',{exact:true}).fill('6');await expect(maturity).toHaveValue('2028-06-30');expect(await maturity.evaluate(node=>node===(window as unknown as {dateInput:Element}).dateInput)).toBe(true);
 await drawer.getByRole('button',{name:'Save plan',exact:true}).click();await expect.poll(()=>f.requests.filter(r=>r.path.endsWith('/financial-plan')&&r.method==='PUT').length).toBe(1);
 await page.reload();drawer=page.getByRole('dialog',{name:'Advanced financial review — Example Studio LLC',exact:true});await expect(drawer.getByLabel('Estimated maturity date',{exact:true})).toHaveValue('2028-06-30');await expect(drawer.getByLabel('Maturity calculation',{exact:true})).toHaveValue('manual');expect(f.errors).toEqual([]);
});

test('client terms date controls save the explicit manual date with its version',async({page})=>{
 const f=await fixture(page,'terms');const drawer=page.getByRole('dialog',{name:'Client terms editor',exact:true});await expect(drawer).toBeVisible();
 await drawer.getByLabel('Estimated funding date',{exact:true}).fill('2026-01-31');await drawer.getByLabel('Maturity calculation',{exact:true}).selectOption('manual');await drawer.getByLabel('Estimated maturity date',{exact:true}).fill('2028-06-30');
 const save=drawer.getByRole('button',{name:'Save new version',exact:true});await expect(save).toBeEnabled();await save.click();await expect.poll(()=>f.requests.filter(r=>r.path.endsWith('/client-terms')&&r.method==='PUT').length).toBe(1);
 expect(f.requests.find(r=>r.path.endsWith('/client-terms')&&r.method==='PUT')?.body).toMatchObject({expected_version:4,expected_funding_date:'2026-01-31',maturity_date:'2028-06-30',maturity_date_mode:'manual'});expect(f.errors).toEqual([]);
});
