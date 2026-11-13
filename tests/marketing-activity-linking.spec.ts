import { expect, test, type Page, type Route } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WORKSPACE_INTAKE as INTAKE, WORKSPACE_PROFILE as PROFILE, WORKSPACE_BUSINESS as BUSINESS, workspaceDetail, workspaceForms } from "./fixtures/fileWorkspaceNavigation";
import { createCanonicalEngine, marketingSnapshot, CanonicalBridgeError, canonicalBridgeConfigured, canonicalBridgeSetupMessage, type MarketingSeed, type CanonicalEngine } from "./fixtures/marketingActivityLinking";
import { pdfFontCompatibility } from "./fixtures/pdfFontCompatibility";
import type { OperatingPlanBody } from "../src/lib/operatingPlan";

const ORIGIN = "https://marketing-activity-linking.test";
let script: Buffer, css: Buffer;
type Json = Record<string, unknown>;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-file-workspaces-"));
  const names = [...(await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8")).matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useQuery,useMutation,useQueryClient}from'@tanstack/react-query';const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useCurrentUser" ? "export const useCurrentUser=()=>({data:{id:'example-staff',role:window.fixtureRole},isLoading:false,authReady:true,authScope:'example-staff:session-1'});" : name === "useFinancialCockpit" ? "export const useFinancialCockpit=id=>useQuery({queryKey:['financial-cockpit',id],queryFn:()=>call('/application-profiles/'+id+'/financial-cockpit')});" : name === "useSaveFinancialPlan" ? "export function useSaveFinancialPlan(id){const q=useQueryClient();return useMutation({mutationFn:body=>call('/application-profiles/'+id+'/financial-plan',{method:'PUT',body:JSON.stringify(body)}),onSuccess:()=>q.invalidateQueries({queryKey:['financial-cockpit',id]})})}" : name === "useClientTermsSummary" ? "export const useClientTermsSummary=id=>useQuery({queryKey:['application-client-terms',id],queryFn:()=>call('/application-profiles/'+id+'/client-terms')});" : name === "useDevUser" ? "export const useDevUser=()=>null;" : `export const ${name}=()=>({isPending:false,data:null,mutateAsync:async()=>({}),refetch:async()=>({})});`).join("\n")}`,
    "@/lib/consoleAuth": "export const isVisualQa=false;export const visualQaUser=()=>null;export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,userId:'example-staff',sessionId:'session-1',getToken:async()=> 'synthetic-staff-token'});",
    "@/components/file/useLeadFile": `import{useQuery}from'@tanstack/react-query';export const useLeadFile=({leadId})=>{const q=useQuery({queryKey:['lead-file',leadId],queryFn:()=>window.fixtureApi('/admin/ai-underwriter-leads/'+leadId+'?include_derived=false'),enabled:!!leadId});return{detail:q.data??null,loading:q.isPending,refreshing:q.isFetching,reload:()=>q.refetch(),requestDerived:()=>{}}};`,
    "./ClosingStipulationsPanel": "export const ClosingStipulationsPanel=()=>null;",
    "@/components/payments/FeeAllocationEditor": "export const FeeAllocationEditor=()=>null;",
    "@/components/communications/OfferDeliveryHistory": "export const OfferDeliveryHistory=()=>null;",
    "@/components/operator/UnifiedOperator": "export const BucketIntakeLinkDrawer=()=>null;",
    "next/link": "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}",
    "next/navigation": `import{useSyncExternalStore}from'react';const listeners=new Set(),searchCache=new Map();const snapshot=()=>location.pathname+location.search;const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};const change=(url,replace=false)=>{history[replace?'replaceState':'pushState']({},'',url);listeners.forEach(fn=>fn())};const router={push:url=>change(url),replace:url=>change(url,true),back:()=>history.back()};export const useRouter=()=>router;export const useParams=()=>{useSyncExternalStore(subscribe,snapshot);return{id:location.pathname.split('/')[2],kind:'operating_plan',token:'synthetic-edit-token'}};export const useSearchParams=()=>{const key=useSyncExternalStore(subscribe,snapshot);if(!searchCache.has(key))searchCache.set(key,new URLSearchParams(location.search));return searchCache.get(key)};export const usePathname=()=>{useSyncExternalStore(subscribe,snapshot);return location.pathname};`,
    "next/dynamic": "import React,{lazy,Suspense}from'react';export default(loader,options={})=>{const Component=lazy(async()=>{const value=await loader();return typeof value==='function'?{default:value}:value});return props=><Suspense fallback={options.loading?React.createElement(options.loading):null}><Component {...props}/></Suspense>};",
    "@/store/role": "export const useActiveProfile=()=>({email:'operator@example.test'});",
    "@/lib/financialKpiReview": "export const metricEntries=()=>[];",
    "@/components/application/ApplicationLenderSubmissions": "export const ApplicationLenderSubmissions=()=>null;",
    "./FinancialMetricReviewWorkspace": "export const FinancialMetricReviewWorkspace=()=>null;",
    "./EbitdaRefinanceComparison": "export const EbitdaRefinanceComparison=()=>null;",
    "./RevenueTrendPanel": "export const RevenueTrendPanel=()=>null;",
    "./CockpitCharts": "export const SERIES={};export const ChartCard=()=>null;export const ColumnChart=()=>null;export const LineChart=()=>null;export const Meter=()=>null;export const HBarList=()=>null;export const Sparkline=()=>null;",
  };
  mocks["./useApi"] = mocks["@/hooks/useApi"];
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import ClientPage from'@/app/forms/[kind]/[token]/page';import WorkspacePage from'@/app/files/[id]/workspace/page';import{OperatingPlanEntry}from'@/components/file/cockpit/OperatingPlanEntry';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff-token','Content-Type':'application/json'}});const data=await response.json();if(!response.ok){const error=new Error(typeof data.detail==='string'?data.detail:data.detail?.message||'Synthetic API failure');error.status=response.status;error.body=data;throw error}return data};const Page=location.pathname.startsWith('/forms/')?ClientPage:WorkspacePage;createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><ConfirmationProvider>{location.pathname==='/legacy'?<OperatingPlanEntry profileId='${PROFILE}' businessName='${BUSINESS}' onRefresh={()=>{}} onRequested={()=>{}} canEdit/>:<Page/>}</ConfirmationProvider></main></QueryClientProvider>);` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: ORIGIN }) }, external: ["node:module", "node:fs", "node:fs/promises", "node:url", "node:path", "@napi-rs/canvas"], loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-file-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path === "./useApi" ? "@/hooks/useApi" : args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});


type RequestRow={method:string;path:string;payload:Json;canonical_body?:OperatingPlanBody;canonical_reply?:unknown};
const activeEngines:CanonicalEngine[]=[];
test.skip(!canonicalBridgeConfigured,canonicalBridgeSetupMessage);
test.afterEach(async({page})=>{for(const owned of page.context().pages())await owned.close();for(const engine of activeEngines.splice(0))await engine.close();});
async function fixture(page:Page,options:{client?:boolean;readOnly?:boolean;seed?:MarketingSeed;goalUnset?:boolean}={}){
 const engine=await createCanonicalEngine(options.seed||"base");activeEngines.push(engine);
 let quote=engine.initial,body=quote.body,revision=4;const requests:RequestRow[]=[],errors:string[]=[];
 let version:{id:string;version_number:number;created_at:string;pdf_url:string}|null=null,savedSignature:string|null=null;
 const versions:OperatingPlanBody[]=[];const keys=new Set<string>();
 const workspace=()=>({family_id:"synthetic-marketing-family",revision,base_version_id:version?.id||null,dirty:JSON.stringify(body)!==savedSignature,current_version:version,versions:version?[version]:[]});
 const snapshot=()=>{const value=marketingSnapshot(body,revision,quote);return version?{...value,current_version_id:version.id,saved_version:version,versions:[version],draft:{...value.draft,base_version_id:version.id,dirty:JSON.stringify(body)!==savedSignature}}:value;};
 const price=async(payload:OperatingPlanBody,operation:"preview"|"draft",record:RequestRow)=>{const value=await engine.quote(payload,operation);record.canonical_body=value.body;record.canonical_reply=value.reply;return value;};
 const saveVersion=(key:string)=>{if(!keys.has(key)){keys.add(key);versions.push(structuredClone(body));const id="73000000-0000-4000-8000-"+String(900+keys.size).padStart(12,"0");version={id,version_number:keys.size,created_at:"2026-11-13T12:00:00Z",pdf_url:ORIGIN+"/api/v1/application-profiles/public/financial-forms/synthetic-edit-token/versions/"+id+"/pdf"};savedSignature=JSON.stringify(body);}};
 page.on("pageerror",error=>errors.push(error.message));
 const handle=async(route:Route)=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();
  if(url.protocol==="chrome:"||url.protocol==="chrome-extension:"&&url.hostname==="mhjfbmdgcfjbbpaeojofohoefgiehjai")return route.continue();
  if(url.origin!==ORIGIN)throw Error("Unexpected synthetic traffic "+url.href);
  if(url.pathname==="/synthetic-source.pdf")return route.fulfill({contentType:"application/pdf",body:pdfFontCompatibility});
  if(!url.pathname.startsWith("/api/v1/"))return route.fulfill(url.pathname==="/app.js"?{contentType:"text/javascript",body:script}:url.pathname==="/app.css"?{contentType:"text/css",body:css}:{contentType:"text/html",body:'<!doctype html><html><head><meta name=viewport content=width=device-width><link rel=stylesheet href=/app.css></head><body><div id=root></div><script>window.fixtureRole="loan_exec";</script><script src=/app.js></script></body></html>'});
  const p=url.pathname.slice(7),payload=req.postData()?req.postDataJSON() as Json:{},record:RequestRow={method,path:p,payload};requests.push(record);const json=(value:unknown,status=200)=>route.fulfill({status,json:value});
  try{
   if(p.startsWith("/application-profiles/public/financial-forms/synthetic-edit-token")){
    expect(req.headers().authorization).toBeUndefined();
    const tail=p.slice("/application-profiles/public/financial-forms/synthetic-edit-token".length);
    if(tail==="/evaluate"){const value=await price(payload.body as OperatingPlanBody,"preview",record);return json(value.reply);}
    if(tail==="/draft"){expect(payload.expected_revision).toBe(revision);quote=await price(payload.body as OperatingPlanBody,"draft",record);body=quote.body;revision++;return json({body,workspace:workspace(),operating_plan:quote.reply});}
    if(tail==="/submit"){expect(payload.expected_revision).toBe(revision);quote=await price(payload.body as OperatingPlanBody,"draft",record);if(!quote.completion.complete)return json({detail:{message:"Complete the actual missing fields",missing:quote.completion.missing}},422);body=quote.body;saveVersion(String(payload.idempotency_key));return json({body,workspace:workspace(),saved_version:version,completed:true,operating_plan:quote.reply});}
    if(tail.includes("/versions/")&&tail.endsWith("/pdf"))return route.fulfill({contentType:"application/pdf",body:pdfFontCompatibility});
    if(!tail)return json({kind:"operating_plan",schema:{},goal:quote.reply.goal,business_name:"Example LLC",completed:false,permission:options.readOnly?"view":"edit",can_edit:!options.readOnly,body,workspace:workspace(),operating_plan:quote.reply});
    throw Error("Unexpected public callback "+p);
   }
   expect(req.headers().authorization).toBe("Bearer synthetic-staff-token");
   if(p.startsWith("/admin/ai-underwriter-leads/")){const detail=workspaceDetail(PROFILE);return json({...detail,intake:{...detail.intake,business_name:body.business_name}});}
   if(p==="/application-profiles/resolve")return json({id:PROFILE,intake_id:INTAKE,vertical:"mca",program_selections:[]});
   if(p.endsWith("/operating-plan/goal"))return json(options.goalUnset ? {...quote.reply.goal, amount: null, currency: null, status: "awaiting_staff"} : quote.reply.goal);
   if(p.endsWith("/operating-plan/evidence"))return json(quote.reply.evidence);
   if(p.endsWith("/operating-plan/evaluate")){const value=await price(payload.body as OperatingPlanBody,"preview",record);return json({...value.reply,context_stamp:"a".repeat(64)});}
   if(p.endsWith("/financial-workspace/draft")){expect(payload.expected_revision).toBe(revision);quote=await price(payload.body as OperatingPlanBody,"draft",record);body=quote.body;revision++;return json(snapshot());}
   if(p.endsWith("/financial-workspace/versions")){expect(payload.expected_revision).toBe(revision);quote=await price(body,"draft",record);if(!quote.completion.complete)return json({detail:{message:"Complete the actual missing fields",missing:quote.completion.missing}},422);body=quote.body;saveVersion(String(payload.idempotency_key));return json(snapshot());}
   if(p.includes("/financial-workspace/versions/")&&p.endsWith("/pdf"))return route.fulfill({contentType:"application/pdf",body:pdfFontCompatibility});
   if(p.endsWith("/financial-workspace"))return json(snapshot());
   if(p.endsWith("/financial-forms"))return json({forms:workspaceForms,packets:[]});
   if(p.endsWith("/operating-plan/summary"))return json({has_plan:false,evaluation:quote.reply.evaluation});
   if(p.endsWith("/evidence"))return json({files:quote.reply.evidence.files});
   throw Error("Unexpected staff callback "+p);
  }catch(error){if(error instanceof CanonicalBridgeError)return json({detail:error.detail},error.status);throw error;}
 };
 await page.route("**/*",handle);await page.context().route("**/*",handle);
 await page.goto(ORIGIN+(options.client?"/forms/operating_plan/synthetic-edit-token":"/files/"+INTAKE+"/workspace?tool=operating-plan"));
 await expect(page.getByRole("navigation",{name:"Guided operating plan steps"})).toBeVisible();await expect(page.getByLabel("Draft save and calculation status",{exact:true})).toContainText(options.seed==="malformed_marketing"?"Inputs needed":"Preview updated");
 return{engine,requests,errors,body:()=>body,lastReply:()=>quote.reply,versions};
}
const wizard=(page:Page)=>page.getByRole("region",{name:"Guided operating expenses and earnings plan",exact:true});
const changes=(page:Page)=>wizard(page).getByRole("region",{name:"Plan changes",exact:true});
const stage=(page:Page,name:string)=>wizard(page).getByRole("navigation",{name:"Guided operating plan steps"}).getByRole("button",{name:new RegExp(name)});
const config=(page:Page)=>page.getByRole("dialog",{name:"Configure planned change",exact:true});
const artifactRoot=()=>process.env.QC_MARKETING_ARTIFACT_DIR||path.resolve("test-results/marketing-activity-linking");
async function capture(page:Page,f:Awaited<ReturnType<typeof fixture>>,name:string){
 const dir=artifactRoot();await mkdir(dir,{recursive:true});
 await page.screenshot({path:path.join(dir,name+".png"),fullPage:true});
 const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,overflow:[...document.querySelectorAll("*")].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).display!=="none").map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,18)}));
 await writeFile(path.join(dir,name+"-geometry.json"),JSON.stringify(geometry,null,2));
 expect(geometry.document).toBeLessThanOrEqual(geometry.viewport+1);
 await writeFile(path.join(dir,name+".json"),JSON.stringify({geometry,body:f.body(),requests:f.requests,errors:f.errors,worker_pid:f.engine.pid},null,2));expect(f.errors).toEqual([]);
}

const status=(page:Page)=>page.getByLabel("Draft save and calculation status",{exact:true});
const currentAction=(f:Awaited<ReturnType<typeof fixture>>,label:string)=>f.body().adjustments?.find(row=>row.label===label&&!row.excluded);
async function closeConfiguration(page:Page){await config(page).getByRole("button",{name:"Done",exact:true}).click();await expect(config(page)).not.toBeVisible();}
async function fillMarketing(page:Page,id:string,proposed:string){
 await config(page).getByRole("textbox",{name:`Marketing product service ${id}`,exact:true}).fill("Example service");
 await config(page).getByRole("textbox",{name:`Activity proposed cost ${id}`,exact:true}).fill(proposed);
 await config(page).getByRole("textbox",{name:`Marketing revenue return multiple ${id}`,exact:true}).fill("2.5");
 await config(page).getByRole("textbox",{name:`Contribution margin percent ${id}`,exact:true}).fill("60");
 await config(page).getByRole("textbox",{name:`Setup or transition cost ${id}`,exact:true}).fill("0");
 await config(page).getByRole("textbox",{name:`Activity explanation ${id}`,exact:true}).fill("Test a defined campaign budget and expected customer demand");
}
async function assertCanonicalEffect(f:Awaited<ReturnType<typeof fixture>>,id:string,effect:number){
 await expect.poll(()=>f.lastReply().evaluation.draft_feedback?.actions.find(row=>row.action_id===id)?.noi_net_annual_delta).toBe(effect);
 expect(f.lastReply().evaluation.draft_feedback?.actions.find(row=>row.action_id===id)?.math_missing).toEqual([]);
}
async function saveAndReload(page:Page,f:Awaited<ReturnType<typeof fixture>>,client=false){
 await expect(status(page)).toContainText("Preview updated");await stage(page,"Review and save").click();
 await wizard(page).getByRole("button",{name:client?"Save version for your team":"Save version",exact:true}).click();
 try{await expect.poll(()=>f.versions.length).toBe(1);}catch(error){await capture(page,f,"save-failure-diagnostic");throw error;}const saved=structuredClone(f.versions[0]);await page.reload();
 await expect(page.getByRole("navigation",{name:"Guided operating plan steps"})).toBeVisible();await expect(status(page)).toContainText("Preview updated");
 expect(f.body().adjustments).toEqual(saved.adjustments);return saved;
}
test("staff actual Marketing Add creates priced activity and saves immutable intent",async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:1440,height:900});const f=await fixture(page);const original=structuredClone(f.body());
 await stage(page,"Plan changes").click();await changes(page).getByText("Add activity in another category",{exact:true}).click();
 await changes(page).getByRole("combobox",{name:"New activity category",exact:true}).selectOption("marketing");
 await changes(page).getByRole("textbox",{name:"New planned activity name",exact:true}).fill("Example campaign");
 await changes(page).getByRole("button",{name:"Add activity (current cost 0)",exact:true}).click();await expect(config(page)).toBeVisible();
 await expect.poll(()=>currentAction(f,"Example campaign")?.kind).toBe("marketing_investment");const action=currentAction(f,"Example campaign")!;
 await expect(config(page).getByRole("textbox",{name:`Marketing revenue return multiple ${action.id}`,exact:true})).toHaveAttribute("aria-invalid","true");
 await fillMarketing(page,action.id,"1000");await assertCanonicalEffect(f,action.id,6000);await expect(config(page).getByText("Conditional annual earnings change:")).toContainText("$6,000.00");
 await expect(config(page).getByRole("textbox",{name:`Activity explanation ${action.id}`,exact:true}).locator("xpath=..").getByText("Required",{exact:true})).toHaveCount(0);
 await expect(config(page).getByRole("combobox",{name:`Activity frequency ${action.id}`,exact:true})).toBeEnabled();
 const own=f.body().expenses!.find(row=>row.id===currentAction(f,"Example campaign")!.expense_row_id)!;expect(own.current_amount).toBe(0);expect(own.source_group_key||"").toBe("");expect(own.source_file_ids||[]).toEqual([]);
 await capture(page,f,"desktop-actual-add-configured");await closeConfiguration(page);
 expect(await changes(page).getByRole("article",{name:"Plan change Example campaign",exact:true}).count()).toBe(0);
 await expect(changes(page).locator(`[data-operating-action="${action.id}"]`)).toHaveCount(1);
 expect(f.body().source_group_confirmation_stamp).toBe(original.source_group_confirmation_stamp);expect(f.body().expenses?.filter(row=>row.id!==own.id)).toEqual(original.expenses);
 const saved=await saveAndReload(page,f);expect(saved.adjustments!.find(row=>row.id===action.id)?.kind).toBe("marketing_investment");expect(saved.adjustments!.find(row=>row.id===action.id)?.effective_date).toBeNull();
 await capture(page,f,"desktop-actual-add-saved");
});


test("public mobile actual Add links a real current Marketing cost without duplicate zero rows",async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:390,height:844});const f=await fixture(page,{client:true,seed:"marketing_existing"});const initial=structuredClone(f.body()),source=initial.expenses!.find(row=>row.label==="Current campaign")!;
 await stage(page,"Plan changes").click();await changes(page).getByRole("button",{name:"+ Add activity in Current campaign",exact:true}).click();
 await changes(page).getByRole("textbox",{name:"New planned activity name",exact:true}).fill("Linked campaign");await changes(page).getByRole("button",{name:"Add activity (current cost 0)",exact:true}).click();
 await expect(config(page)).toBeVisible();await expect.poll(()=>currentAction(f,"Linked campaign")?.kind).toBe("marketing_investment");const action=currentAction(f,"Linked campaign")!,ownId=action.expense_row_id;
 expect(ownId).not.toBe(source.id);expect(action.current_amount).toBe(0);
 await config(page).getByRole("combobox",{name:`Linked current cost ${action.id}`,exact:true}).selectOption(source.id);
 await fillMarketing(page,action.id,"2000");await assertCanonicalEffect(f,action.id,6000);await expect(config(page).getByText("Conditional annual earnings change:")).toContainText("$6,000.00");
 await expect(config(page).getByRole("textbox",{name:`Activity current cost ${action.id}`,exact:true})).toBeDisabled();await expect(config(page).getByRole("combobox",{name:`Activity frequency ${action.id}`,exact:true})).toBeDisabled();
 expect(currentAction(f,"Linked campaign")!.expense_row_id).toBe(source.id);expect(currentAction(f,"Linked campaign")!.current_amount).toBe(1000);expect(f.body().expenses!.find(row=>row.id===ownId)?.excluded).toBe(true);expect(f.body().expenses!.find(row=>row.id===source.id)).toEqual(source);
 await capture(page,f,"mobile-public-add-linked");await closeConfiguration(page);await expect(changes(page).getByRole("article",{name:"Plan change Current campaign",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"To finish: 0 required items",exact:true})).toBeVisible();
 const saved=await saveAndReload(page,f,true);expect(saved.adjustments!.find(row=>row.id===action.id)?.expense_row_id).toBe(source.id);await capture(page,f,"mobile-public-add-saved");
});

test("legacy generic Marketing conversion is explicit and preserves saved totals and identity",async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:1440,height:900});const f=await fixture(page,{seed:"legacy_generic"}),original=structuredClone(f.body().adjustments![0]);
 await stage(page,"Plan changes").click();expect(f.body().adjustments![0].kind).toBe("expense_increase");
 const row=changes(page).getByRole("article",{name:"Plan change Current campaign",exact:true});await row.getByRole("button",{name:"Configure change",exact:true}).click();
 await expect(config(page).getByRole("textbox",{name:/^Marketing revenue return multiple /})).toHaveCount(0);await config(page).getByRole("button",{name:"Model marketing returns",exact:true}).click();
 await expect(config(page).getByRole("textbox",{name:`Marketing revenue return multiple ${original.id}`,exact:true})).toBeVisible();
 await expect.poll(()=>f.body().adjustments![0].kind).toBe("marketing_investment");const converted=f.body().adjustments![0];for(const key of ["id","label","expense_row_id","current_amount","proposed_amount","cadence"] as const)expect(converted[key]).toBe(original[key]);
 expect(converted.revenue_return_multiple).toBeNull();expect(converted.contribution_margin_pct).toBeNull();expect(converted.command).toBeFalsy();
 await fillMarketing(page,original.id,"1800");await assertCanonicalEffect(f,original.id,4800);await expect(config(page).getByText("Conditional annual earnings change:")).toContainText("$4,800.00");await capture(page,f,"desktop-legacy-converted");await closeConfiguration(page);
 expect(await changes(page).getByRole("article",{name:"Plan change Current campaign",exact:true}).count()).toBe(1);
 const saved=await saveAndReload(page,f);expect(saved.adjustments![0].id).toBe(original.id);expect(saved.adjustments![0].cadence).toBe("monthly");await capture(page,f,"desktop-legacy-saved");
});

test("mobile malformed Marketing command repairs explicitly and filled group aliases stay clear",async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});const f=await fixture(page,{client:true,seed:"malformed_marketing"}),original=structuredClone(f.body().adjustments![0]);
 await stage(page,"Plan changes").click();await changes(page).locator(`[data-operating-action="${original.id}"]`).getByRole("button",{name:"Configure change",exact:true}).click();
 await expect(config(page).getByRole("textbox",{name:`Activity proposed cost ${original.id}`,exact:true})).toHaveValue("1800");await expect(config(page).getByRole("textbox",{name:`Marketing revenue return multiple ${original.id}`,exact:true})).toHaveValue("2.5");
 await expect(config(page).getByRole("button",{name:`Clear incompatible cost command ${original.id}`,exact:true})).toBeVisible();expect(f.lastReply().evaluation.draft_feedback?.actions[0].math_status).not.toBe("calculated");
 await config(page).getByRole("button",{name:`Clear incompatible cost command ${original.id}`,exact:true}).click();await assertCanonicalEffect(f,original.id,4800);
 expect(f.body().adjustments![0].command).toBeFalsy();for(const key of ["id","label","current_amount","proposed_amount","revenue_return_multiple","contribution_margin_pct"] as const)expect(f.body().adjustments![0][key]).toBe(original[key]);
 const proposed=config(page).getByRole("textbox",{name:`Activity proposed cost ${original.id}`,exact:true});await proposed.fill("");await expect(proposed).toHaveAttribute("aria-invalid","true");await proposed.fill("1800");await expect(proposed).toBeFocused();await expect(proposed).not.toHaveAttribute("aria-invalid","true");
 await config(page).getByRole("textbox",{name:`Marketing revenue return multiple ${original.id}`,exact:true}).fill("0");await assertCanonicalEffect(f,original.id,-9600);await config(page).getByRole("textbox",{name:`Marketing revenue return multiple ${original.id}`,exact:true}).fill("2.5");await assertCanonicalEffect(f,original.id,4800);
 await capture(page,f,"mobile-malformed-command-repaired");await closeConfiguration(page);await expect(page.getByRole("button",{name:"To finish: 0 required items",exact:true})).toBeVisible();await page.close();
 const groupPage=await page.context().newPage();await groupPage.setViewportSize({width:390,height:844});const g=await fixture(groupPage,{client:true,seed:"legacy_group"});await stage(groupPage,"Plan changes").click();
 const group=changes(groupPage).getByRole("article",{name:"Plan change Whole group: Premises",exact:true});const value=group.getByRole("textbox",{name:/^Command value /});await expect(value).toHaveValue("10");
 await value.fill("2.5");await expect(value).toBeFocused();await expect.poll(()=>g.body().adjustments!.find(row=>row.kind==="expense_group_change")?.command?.value).toBe(2.5);const groupId=g.body().adjustments!.find(row=>row.kind==="expense_group_change")!.id;await assertCanonicalEffect(g,groupId,300);await expect(groupPage.getByRole("button",{name:"To finish: 0 required items",exact:true})).toBeVisible();
 await value.fill("0");await assertCanonicalEffect(g,groupId,0);await expect(groupPage.getByRole("button",{name:"To finish: 0 required items",exact:true})).toBeVisible();expect(g.body().adjustments!.find(row=>row.label==="Inactive earlier item proposal")?.excluded).toBe(true);
 await capture(groupPage,g,"mobile-filled-group-no-false-errors");await saveAndReload(groupPage,g,true);await capture(groupPage,g,"mobile-filled-group-saved");
});

test("reference layout keeps all four stages usable and the impact rail beside desktop content", async ({ page }, testInfo) => {
 test.setTimeout(60000);
 const f = await fixture(page, {seed: "marketing_existing"});
 for (const [index, title] of ["Confirm source", "Confirm current costs", "Plan changes", "Review and save"].entries()) {
  await stage(page, title).click();
  await expect(wizard(page)).toBeVisible();
  const dimensions = await page.evaluate(() => {
   const wizard = document.querySelector('[aria-label="Guided operating expenses and earnings plan"]')!;
   const rail = wizard.querySelector('[aria-label="Plan metrics and required items"]')!.getBoundingClientRect();
   const nav = wizard.querySelector('nav')!.getBoundingClientRect();
   return {railWidth: rail.width, viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth, navWidth: nav.width};
  });
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
  if (dimensions.viewport >= 1000) expect(dimensions.railWidth).toBeGreaterThan(270);
  await capture(page, f, `reference-${testInfo.project.name}-step-${index + 1}`);
 }
 expect(f.versions).toHaveLength(0);
});

test("staff can inspect sources and plan changes while setting the first NOI goal", async ({ page }) => {
 test.setTimeout(45000);
 const f = await fixture(page, {goalUnset: true});
 await expect(page.getByRole("navigation", {name: "Guided operating plan steps"})).toBeVisible();
 await expect(page.getByLabel("Annual NOI goal", {exact: true})).toBeVisible();
 await expect(wizard(page).getByRole("table", {name: "Source cost comparison", exact: true})).toBeVisible();
 await stage(page, "Plan changes").click();
 await expect(changes(page)).toBeVisible();
 expect(f.versions).toHaveLength(0);
});

test("ordinary cost and pricing changes edit inline and preserve values when details open", async ({page}) => {
 test.setTimeout(60000);
 const f = await fixture(page);
 const original = structuredClone(f.body());
 const cost = original.expenses!.find(row => row.category === "rent" && !row.excluded)!;
 await stage(page, "Plan changes").click();
 const row = changes(page).getByRole("article", {name: "Plan change " + cost.label, exact: true});
 await row.getByRole("button", {name: "Change", exact: true}).click();
 await expect(config(page)).not.toBeVisible();
 const amount = row.getByRole("textbox", {name: "Command value " + cost.id, exact: true});
 await expect(amount).toBeVisible();
 expect(f.body().adjustments).toEqual(original.adjustments);
 await row.getByRole("combobox", {name: "Command direction " + cost.id, exact: true}).selectOption("decrease");
 await amount.fill("75");
 await expect.poll(() => Number(f.body().adjustments?.find(item => item.expense_row_id === cost.id && !item.excluded)?.command?.value)).toBe(75);
 await row.getByRole("button", {name: /^(Finish change|Configure change)$/}).click();
 await expect(config(page)).toBeVisible();
 const action = f.body().adjustments!.find(item => item.expense_row_id === cost.id && !item.excluded)!;
 await expect(config(page).getByRole("textbox", {name: "Setup or transition cost " + action.id, exact: true})).toBeVisible();
 await closeConfiguration(page);
 await expect(amount).toHaveValue("75");
 const source = changes(page).getByRole("button", {name: /^Use saved annual revenue for pricing/});
 if (await source.count()) await source.click();
 const pricing = changes(page).getByRole("article", {name: "Plan change Overall pricing", exact: true});
 const pricingChange = pricing.getByRole("button", {name: "Change", exact: true});
 if (await pricingChange.count()) await pricingChange.click();
 await expect(config(page)).not.toBeVisible();
 await pricing.getByRole("combobox", {name: "Command mode annual-pricing", exact: true}).selectOption("percent");
 await pricing.getByRole("textbox", {name: "Command value annual-pricing", exact: true}).fill("5");
 await expect.poll(() => Number(f.body().adjustments?.find(item => item.price_basis === "annual_revenue" && !item.excluded)?.command?.value)).toBe(5);
 expect(f.body().expenses).toEqual(original.expenses);
 expect(Number(f.body().adjustments!.find(item => item.id === action.id)!.command!.value)).toBe(75);
 expect(f.versions).toHaveLength(0);
 expect(f.errors).toEqual([]);
});
