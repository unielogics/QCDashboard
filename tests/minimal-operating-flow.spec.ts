import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WORKSPACE_INTAKE as INTAKE, WORKSPACE_PROFILE as PROFILE, WORKSPACE_BUSINESS as BUSINESS, workspaceDetail, workspaceForms, staffOperatingEvidence, staffOperatingEvaluation } from "./fixtures/fileWorkspaceNavigation";
import { minimalSnapshot as operatingEditSnapshot, minimalReply as operatingEditReply, minimalInitial as operatingEditInitial, minimalScenario as recognizableScenario, PLAN_GOAL, UNSET_PLAN_GOAL, type MinimalCase as RecognizableCase } from "./fixtures/minimalOperatingFlow";
import { pdfFontCompatibility } from "./fixtures/pdfFontCompatibility";
import type { OperatingPlanBody } from "../src/lib/operatingPlan";

const ORIGIN = "https://minimal-operating-flow.test";
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


type RequestRow = { ms: number; method: string; path: string; payload: Json };
async function fixture(page: Page, options: { client?: boolean; readOnly?: boolean;caseName?:RecognizableCase; initialBody?:OperatingPlanBody; unsetGoal?:boolean; clientGoalBlocked?:boolean } = {}) {
 let goal=structuredClone(options.unsetGoal?UNSET_PLAN_GOAL:PLAN_GOAL),clientGoalBlocked=Boolean(options.clientGoalBlocked),failGoal=false,goalWrites=0,failSuggestion=false;let conflictCase:RecognizableCase|null=null;let replyCase:RecognizableCase=options.caseName??"no_changes";let body = options.initialBody??operatingEditInitial(replyCase), revision=4, failDraft=false, failPreview=false,failSource=false,failVersion=false;
 const versionBodies:OperatingPlanBody[]=[];let savedVersion:{id:string;version_number:number;created_at:string;actor_name:null;source:string;source_file_id:null;pdf_file_id:string;status:string;pdf_url:string}|null=null;let savedSerialized="";const successfulKeys=new Set<string>();
 const publicWorkspace=()=>({family_id:"synthetic-operating-family",revision,base_version_id:savedVersion?.id??null,dirty:JSON.stringify(body)!==savedSerialized,versions:savedVersion?[savedVersion]:[],current_version:savedVersion});
 const snapshot=()=>{const value=operatingEditSnapshot(body,revision,replyCase);return savedVersion?{...value,draft:{...value.draft,base_version_id:savedVersion.id,dirty:JSON.stringify(body)!==savedSerialized},current_version_id:savedVersion.id,saved_version:savedVersion,versions:[savedVersion]}:value};
 const acknowledgeVersion=(key:string,client:boolean)=>{if(!successfulKeys.has(key)){successfulKeys.add(key);expect(successfulKeys.size).toBe(1);savedSerialized=JSON.stringify(body);versionBodies.push(structuredClone(body));savedVersion={id:"99000000-0000-4000-8000-000000000900",version_number:1,created_at:"2026-11-12T12:00:00Z",actor_name:null,source:"form",source_file_id:null,pdf_file_id:"99000000-0000-4000-8000-000000000901",status:client?"client_submitted":"published",pdf_url:ORIGIN+"/api/v1/application-profiles/public/financial-forms/synthetic-edit-token/versions/99000000-0000-4000-8000-000000000900/pdf"}};return savedVersion};
 let releaseDraft=()=>{}, draftGate=Promise.resolve();let heldEvaluation:Promise<void>|null=null,releaseEvaluation=()=>{};const holdNextEvaluation=()=>{heldEvaluation=new Promise<void>(resolve=>{releaseEvaluation=resolve})};
 const holdDraft=()=>{draftGate=new Promise<void>(resolve=>{releaseDraft=()=>{resolve();draftGate=Promise.resolve()};})};
 const requests:RequestRow[]=[],errors:string[]=[];const started=Date.now();
 page.on('pageerror',error=>errors.push(error.message));
 await page.context().route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();if(url.protocol==='chrome:'||url.protocol==='chrome-extension:'&&url.hostname==='mhjfbmdgcfjbbpaeojofohoefgiehjai')return route.continue();if(url.origin!==ORIGIN)throw Error('Unexpected operating-plan traffic '+url.href);
  if(url.pathname==='/synthetic-source.pdf')return route.fulfill({contentType:'application/pdf',body:pdfFontCompatibility});
  if(!url.pathname.startsWith('/api/v1/'))return route.fulfill(url.pathname==='/app.js'?{contentType:'text/javascript',body:script}:url.pathname==='/app.css'?{contentType:'text/css',body:css}:{contentType:'text/html',body:`<!doctype html><html><head><meta name=viewport content=width=device-width><link rel=stylesheet href=/app.css></head><body><div id=root></div><script>window.fixtureRole='loan_exec';</script><script src=/app.js></script></body></html>`});
  const p=url.pathname.slice(7),payload=req.postData()?req.postDataJSON() as Json:{};requests.push({ms:Date.now()-started,method,path:p,payload});const json=(value:unknown,status=200)=>route.fulfill({status,json:value});
  if(p.startsWith('/application-profiles/public/financial-forms/')){
   if(clientGoalBlocked)return json({detail:{code:'operating_goal_required',state:'goal_awaiting_staff',message:'Your team needs to set the annual NOI goal before this operating plan can be opened or shared.',goal:UNSET_PLAN_GOAL}},409);
   const tail=p.slice('/application-profiles/public/financial-forms/synthetic-edit-token'.length);
   if(tail.startsWith('/evidence/')){const id=decodeURIComponent(tail.slice(10));expect(operatingEditReply(body,replyCase).evidence.files!.map(row=>row.file_id)).toContain(id);if(failSource){failSource=false;return json({detail:'Synthetic source temporarily unavailable'},503)}return json({file:{id,file_name:'Synthetic business return.pdf',content_type:'application/pdf'},preview_url:ORIGIN+'/synthetic-source.pdf'});}
   if(tail==='/evaluate'){const response=operatingEditReply(payload.body as OperatingPlanBody,replyCase),gate=heldEvaluation;heldEvaluation=null;if(gate)await gate;if(failPreview){failPreview=false;return json({detail:'Synthetic preview unavailable'},500)}return json(response);}
   if(tail.startsWith('/versions/')&&tail.endsWith('/pdf')){expect(tail).toContain(savedVersion?.id);return route.fulfill({contentType:'application/pdf',body:pdfFontCompatibility,headers:{'Content-Disposition':'inline; filename=Example-Operating-Plan-v1.pdf'}});}
   if(tail==='/submit'){expect(payload.expected_revision).toBe(revision);expect(typeof payload.idempotency_key).toBe('string');if(failVersion){failVersion=false;return json({detail:'Synthetic version temporarily unavailable'},503)}body=payload.body as OperatingPlanBody;const version=acknowledgeVersion(String(payload.idempotency_key),true);return json({body,workspace:publicWorkspace(),saved_version:version,completed:true,operating_plan:operatingEditReply(body,replyCase)});}
   if(tail==='/draft'){expect(payload.expected_revision).toBe(revision);await draftGate;if(conflictCase){replyCase=conflictCase;body=operatingEditInitial(replyCase);revision++;conflictCase=null;return json({detail:{code:'financial_draft_conflict',current_revision:revision,message:'This draft changed. Reload before saving.'}},409)}if(failDraft){failDraft=false;return json({detail:'Synthetic draft unavailable'},503)}body=payload.body as OperatingPlanBody;revision++;return json({body,workspace:publicWorkspace(),operating_plan:operatingEditReply(body,replyCase)});}
   if(tail==='')return json({goal,kind:'operating_plan',schema:{},business_name:'Example operating studio',completed:false,permission:options.readOnly?'view':'edit',can_edit:!options.readOnly,body,workspace:publicWorkspace(),operating_plan:operatingEditReply(body,replyCase)});
   throw Error('Unexpected public operating-plan request '+p);
  }
  expect(req.headers().authorization).toBe('Bearer synthetic-staff-token');
  if(p.endsWith('/operating-plan/goal')){if(method==='PUT'){goalWrites++;if(failGoal){failGoal=false;return json({detail:'Synthetic goal save temporarily unavailable'},503)}expect(payload.expected_revision).toBe(goal.revision);expect(typeof payload.idempotency_key).toBe('string');goal={...PLAN_GOAL,amount:Number(payload.amount),currency:String(payload.currency),revision:goal.revision+1};}return json(goal);}
  if(p.startsWith('/admin/ai-underwriter-leads/')){const detail=workspaceDetail(PROFILE);detail.intake.business_name=String(body.business_name??BUSINESS);return json(detail);}
  if(p==='/application-profiles/resolve')return json({id:PROFILE,intake_id:INTAKE,vertical:'mca',program_selections:[]});
  if(/\/evidence\/files\/[^/]+\/url$/.test(p)){const id=p.split('/').at(-2)!;expect(operatingEditReply(body,replyCase).evidence.files!.map(row=>row.file_id)).toContain(id);if(failSource){failSource=false;return json({detail:'Synthetic source temporarily unavailable'},503)}return json({url:ORIGIN+'/synthetic-source.pdf'});}
  if(p.endsWith('/operating-plan/evidence'))return json(operatingEditReply(body,replyCase).evidence);
  if(p.endsWith('/operating-plan/evaluate')){const response=operatingEditReply(payload.body as OperatingPlanBody,replyCase),gate=heldEvaluation;heldEvaluation=null;if(gate)await gate;if(failPreview){failPreview=false;return json({detail:'Synthetic preview unavailable'},500)}return json({...response,context_stamp:'a'.repeat(64)});}
  if(/\/financial-workspace\/versions\/[^/]+\/pdf$/.test(p)){expect(p).toContain(savedVersion?.id);return route.fulfill({contentType:'application/pdf',body:pdfFontCompatibility,headers:{'Content-Disposition':'attachment; filename=Example-Operating-Plan-v1.pdf'}});}
  if(p.endsWith('/financial-workspace/versions')&&method==='POST'){expect(payload.expected_revision).toBe(revision);expect(payload.kind).toBe('operating_plan');expect(typeof payload.idempotency_key).toBe('string');if(failVersion){failVersion=false;return json({detail:'Synthetic version temporarily unavailable'},503)}acknowledgeVersion(String(payload.idempotency_key),false);return json(snapshot());}
  if(p.endsWith('/financial-workspace/draft')){await draftGate;if(conflictCase){replyCase=conflictCase;body=operatingEditInitial(replyCase);revision++;conflictCase=null;return json({detail:{code:'financial_draft_conflict',current_revision:revision,message:'This draft changed. Reload before saving.'}},409)}if(failDraft){failDraft=false;return json({detail:'Synthetic draft unavailable'},503)}expect(payload.expected_revision).toBe(revision);body=payload.body as OperatingPlanBody;revision++;return json(snapshot());}
  if(p.endsWith('/financial-workspace'))return json(snapshot());
  if(p.endsWith('/financial-forms'))return json({forms:workspaceForms,packets:[]});
  if(p.endsWith('/evidence'))return json({files:staffOperatingEvidence.files});
  if(p.endsWith('/operating-plan/summary'))return json({has_plan:false,evaluation:staffOperatingEvaluation});
  throw Error('Unexpected staff operating-plan request '+method+' '+p);
 });
 await page.addInitScript(()=>{const audit=window as unknown as Window&{fixtureStatusEvents:{at:number;text:string}[];fixtureInputEvents:{at:number;label:string;value:string;focused:boolean;caret:number|null}[]};audit.fixtureStatusEvents=[];audit.fixtureInputEvents=[];let last='';new MutationObserver(()=>{const text=document.querySelector('[aria-label="Draft save and calculation status"]')?.textContent?.trim()??'';if(text&&text!==last){last=text;audit.fixtureStatusEvents.push({at:Date.now(),text});}}).observe(document,{childList:true,subtree:true,characterData:true});document.addEventListener('input',event=>{const el=event.target;if(el instanceof HTMLInputElement&&el.getAttribute('aria-label')?.startsWith('Command value '))audit.fixtureInputEvents.push({at:Date.now(),label:el.getAttribute('aria-label')!,value:el.value,focused:document.activeElement===el,caret:el.selectionStart});});});
 await page.goto(ORIGIN+(options.client?'/forms/operating_plan/synthetic-edit-token':`/files/${INTAKE}/workspace?tool=operating-plan`));await expect(options.clientGoalBlocked?page.getByRole('heading',{name:'Your team is setting the annual NOI goal'}):options.unsetGoal?page.getByRole('textbox',{name:'Annual NOI goal',exact:true}):page.getByRole('navigation',{name:'Guided operating plan steps'})).toBeVisible();
 if(!options.clientGoalBlocked&&!options.unsetGoal){await expect(page.getByLabel('Draft save and calculation status',{exact:true})).not.toContainText('Calculating');await page.waitForTimeout(100);}
 return {requests,errors,startedAt:started,body:()=>body,goal:()=>goal,goalWrites:()=>goalWrites,failNextGoal:()=>{failGoal=true},failNextSuggestion:()=>{failSuggestion=true},allowClientGoal:()=>{clientGoalBlocked=false},versionBodies,savedCount:()=>successfulKeys.size,failNextVersion:()=>{failVersion=true},failNextSource:()=>{failSource=true},setReply:(name:RecognizableCase)=>{replyCase=name},holdNextEvaluation,releaseEvaluation:()=>releaseEvaluation(),holdDraft,releaseDraft:()=>releaseDraft(),failNextDraft:()=>{failDraft=true},conflictNextDraft:(name:RecognizableCase)=>{conflictCase=name},failNextPreview:()=>{failPreview=true}};
}
const draftCalls=(f:Awaited<ReturnType<typeof fixture>>)=>f.requests.filter(r=>r.path.endsWith('/draft'));
const step=(page:Page,name:string)=>page.getByRole('navigation',{name:'Guided operating plan steps'}).getByRole('button',{name:new RegExp(name)});




const wizard=(page:Page)=>page.getByRole('region',{name:'Guided operating expenses and earnings plan',exact:true});
const nav=(page:Page)=>wizard(page).getByRole('navigation',{name:'Guided operating plan steps'});
const footer=(page:Page)=>wizard(page).locator('footer');
const stage=(page:Page,name:string)=>nav(page).getByRole('button',{name:new RegExp(name)});
const saves=(f:Awaited<ReturnType<typeof fixture>>)=>f.requests.filter(row=>row.path.endsWith('/submit')||row.path.endsWith('/financial-workspace/versions'));
const latestEvaluation=(f:Awaited<ReturnType<typeof fixture>>)=>f.requests.filter(row=>row.path.endsWith('/evaluate')).at(-1)?.payload.body as OperatingPlanBody|undefined;
async function assertWidth(page:Page){const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));expect(geometry.document).toBeLessThanOrEqual(geometry.viewport+1);expect(geometry.body).toBeLessThanOrEqual(geometry.viewport+1);const width=(await wizard(page).boundingBox())!.width;expect(width).toBeGreaterThanOrEqual(Math.min(900,geometry.viewport*.7));return{...geometry,wizardWidth:width};}
async function screenshot(page:Page,name:string){const directory=path.resolve(process.cwd(),'../../artifacts/minimal-operating-flow-qa');await mkdir(directory,{recursive:true});await page.screenshot({path:path.join(directory,name)});await writeFile(path.join(directory,name+'.json'),JSON.stringify(await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,devicePixelRatio,scrollY})),null,2));}


async function confirmCategories(page:Page){const extra=wizard(page).locator('summary').filter({hasText:/^Other categories/});if(await extra.count()){const details=extra.locator('xpath=..');if(await details.getAttribute('open')===null)await extra.click();for(const select of await details.getByRole('combobox',{name:/^Confirm /}).all())await select.selectOption('not_applicable');}const categories=wizard(page).getByRole('region',{name:/^Current cost category /});for(const category of await categories.all()){const count=await category.getByRole('article',{name:/^Current item /}).count();await category.getByRole('combobox',{name:/^Confirm /}).selectOption(count?'confirmed':'not_applicable');}}
async function stageScreenshot(page:Page,role:string,index:number,project:string){if(index===4){await comparison(page).scrollIntoViewIfNeeded();await page.waitForTimeout(150);}await assertWidth(page);await screenshot(page,`${project}-${role}-stage${index}.png`);const directory=path.resolve(process.cwd(),'../../artifacts/minimal-operating-flow-qa');await page.screenshot({path:path.join(directory,`${project}-${role}-stage${index}-full.png`),fullPage:true});}
const ledger=(page:Page,id:string)=>wizard(page).getByLabel(`Itemization ledger ${id}`,{exact:true});
const rowInput=(page:Page,label:string,id:string)=>wizard(page).getByRole('textbox',{name:`${label} ${id}`,exact:true});
const currentItem=(page:Page,id:string)=>wizard(page).getByRole('article',{name:`Current item ${id}`,exact:true});

const status=(page:Page)=>wizard(page).getByLabel('Draft save and calculation status',{exact:true});
const changes=(page:Page)=>wizard(page).getByRole('region',{name:'Plan changes',exact:true});
const comparison=(page:Page)=>wizard(page).getByRole('region',{name:'Guided before and after',exact:true});
const metric=(page:Page,name:string)=>comparison(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:name.startsWith('DSCR · current debt')?new RegExp('^DSCR · current debt'):name,exact:!name.startsWith('DSCR · current debt')})});
const activeValue=(body:OperatingPlanBody|undefined)=>body?.adjustments?.find(row=>!row.excluded)?.command?.value;
const evaluations=(f:Awaited<ReturnType<typeof fixture>>)=>f.requests.filter(row=>row.path.endsWith('/evaluate'));
async function command(page:Page,f:Awaited<ReturnType<typeof fixture>>,group=false){await stage(page,'Plan changes').click();const expense=f.body().expenses!.find(row=>row.label==='Noncash D&A')!;const id=group?'group:rent:source:synthetic-2025:rent':expense.id;const input=changes(page).getByRole('textbox',{name:`Command value ${id}`,exact:true});await input.focus();await input.press('End');return{id,input};}
async function expectMetric(page:Page,name:string,current:string,working:string,delta:string){const cells=metric(page,name).getByRole('cell');await expect(cells).toHaveText([current,working,delta]);}
async function evidence(page:Page,f:Awaited<ReturnType<typeof fixture>>,name:string){const directory=path.resolve(process.cwd(),'../../artifacts/minimal-operating-flow-qa');await mkdir(directory,{recursive:true});await writeFile(path.join(directory,name+'.json'),JSON.stringify({geometry:await assertWidth(page),requests:f.requests,startedAt:f.startedAt,observations:await page.evaluate(()=>{const audit=window as unknown as Window&{fixtureStatusEvents:unknown[];fixtureInputEvents:unknown[]};return{status:audit.fixtureStatusEvents,inputs:audit.fixtureInputEvents}}),errors:f.errors,body:f.body()},null,2));expect(f.errors).toEqual([]);expect(saves(f)).toHaveLength(0);}

async function redRequired(input:ReturnType<Page['getByRole']>){await expect(input).toHaveAttribute('aria-invalid','true');const color=await input.evaluate(el=>getComputedStyle(el).borderColor);const values=color.match(/[\d.]+/g)?.map(Number)??[];expect(values.length).toBeGreaterThanOrEqual(3);expect(values[0]).toBeGreaterThan(values[1]+25);expect(values[0]).toBeGreaterThan(values[2]+15);}
const cashPanel=(page:Page)=>wizard(page).getByRole('region',{name:'Loan cash flow and allocations',exact:true});

async function settled(page:Page){await expect(status(page)).toContainText('Preview updated');await expect(status(page)).not.toContainText('Calculating');}
const sourceCosts=(page:Page)=>wizard(page).getByRole('region',{name:'Source cost confirmations',exact:true});
const fundingPanel=(page:Page)=>wizard(page).getByRole('region',{name:'Plan funding and allocations',exact:true});
const sourceRow=(page:Page,key:string)=>sourceCosts(page).locator('[data-operating-source-group]').filter({has:page.getByRole('button',{name:'Confirm '+key,exact:true})});
const config=(page:Page)=>page.getByRole('dialog',{name:'Configure planned change',exact:true});
async function requiredItems(page:Page){
 const rail=page.getByRole('complementary',{name:'To finish',exact:true});
 if(await rail.isVisible())return rail;
 await page.getByRole('button',{name:/^To finish: /}).click();
 return page.getByRole('dialog',{name:'Required plan items',exact:true});
}
async function redBorder(locator:ReturnType<Page['locator']>){
 return locator.evaluate(el=>{const style=getComputedStyle(el);return ['Top','Right','Bottom','Left'].some(side=>{const color=style.getPropertyValue('border-'+side.toLowerCase()+'-color').match(/[\d.]+/g)?.map(Number)||[];return parseFloat(style.getPropertyValue('border-'+side.toLowerCase()+'-width'))>0&&color[0]>color[1]+25&&color[0]>color[2]+15;});});
}
async function redContainerOf(field:ReturnType<Page['getByRole']>){
 return field.evaluate(el=>{for(let node=el.parentElement;node&&node.getAttribute('role')!=='dialog';node=node.parentElement){const s=getComputedStyle(node),rgb=s.borderTopColor.match(/[\d.]+/g)?.map(Number)||[];if(parseFloat(s.borderTopWidth)>0&&rgb[0]>rgb[1]+25&&rgb[0]>rgb[2]+15)return true;}return false;});
}
async function assertReachableFooter(page:Page){
 const pill=page.getByRole('button',{name:/^To finish: /}),button=footer(page).getByRole('button').last();
 await button.scrollIntoViewIfNeeded();const p=await pill.isVisible()?await pill.boundingBox():null,b=await button.boundingBox();
 if(p&&b)expect(Math.max(0,Math.min(p.x+p.width,b.x+b.width)-Math.max(p.x,b.x))*Math.max(0,Math.min(p.y+p.height,b.y+b.height)-Math.max(p.y,b.y))).toBe(0);
}
async function closeDialog(page:Page){await config(page).getByRole('button',{name:'Done',exact:true}).click();await expect(config(page)).not.toBeVisible();}
const why=(page:Page)=>config(page).getByRole('textbox',{name:/^Activity explanation /});
const rentId=()=>recognizableScenario('change_ready').body.adjustments![0].expense_row_id!;
const changeCard=(page:Page)=>changes(page).getByRole('article',{name:'Plan change Premises',exact:true});

test('staff source confirmations are selected groups only and required repairs work without Continue',async({page},info)=>{
 const f=await fixture(page,{caseName:'source_pending'}),before=structuredClone(f.body());
 await stage(page,'Confirm current costs').click();const source=sourceCosts(page);
 await expect(source.getByRole('combobox')).toHaveCount(0);
 await expect(wizard(page).getByRole('button',{name:/Add item|Add activity|Add current cost|AI suggestion/})).toHaveCount(0);
 await expect(wizard(page).getByRole('region',{name:/Current cost category|New current cost item/})).toHaveCount(0);
 const groups=recognizableScenario('source_pending').guidance.expense_groups||[];expect(groups).toHaveLength(3);
 const first=sourceRow(page,groups[0].label);await expect.poll(()=>redBorder(first)).toBe(true);
 const required=await requiredItems(page);await expect(required.getByRole('button',{name:'Confirm '+groups[0].label,exact:true})).toBeVisible();
 await required.getByRole('button',{name:'Confirm '+groups[0].label,exact:true}).click();
 await expect(first.getByRole('button',{name:'Confirm '+groups[0].label,exact:true})).toBeFocused();
 expect(f.body()).toEqual(before);expect(draftCalls(f)).toHaveLength(0);
 const originalUrl=page.url(),opened=page.waitForEvent('popup');await first.getByRole('button',{name:'View source ↗',exact:true}).click();const popup=await opened;await expect.poll(()=>popup.url()).toBe(ORIGIN+'/synthetic-source.pdf');expect(await popup.evaluate(()=>window.opener===null)).toBe(true);await popup.close();expect(page.url()).toBe(originalUrl);expect(f.body()).toEqual(before);
 f.setReply('source_first_confirmed');await first.getByRole('button',{name:'Confirm '+groups[0].label,exact:true}).click();
 await expect.poll(()=>f.body().source_group_confirmations?.[groups[0].key]).toBe('confirmed');
 await expect.poll(()=>redBorder(first)).toBe(false);expect(f.body().expenses?.map(row=>row.id)).toEqual(before.expenses?.map(row=>row.id));
 await assertReachableFooter(page);await stageScreenshot(page,'staff-source-only',2,info.project.name);await evidence(page,f,info.project.name+'-source-confirmation');
});

test('public X correction is explicit, cancellable and preserves the imported facts through reload',async({page},info)=>{
 const f=await fixture(page,{client:true,caseName:'no_changes'}),initial=structuredClone(f.body()),group=recognizableScenario('no_changes').guidance.expense_groups![0];
 await stage(page,'Confirm current costs').click();await sourceCosts(page).getByRole('button',{name:'Correct '+group.label,exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Correct source amount',exact:true}),reason=dialog.getByRole('textbox',{name:'Source correction reason',exact:true});
 await expect(reason).toHaveAttribute('aria-invalid','true');await expect.poll(()=>redContainerOf(reason)).toBe(true);
 await reason.fill('Ask the preparer to verify this source amount');await dialog.getByRole('textbox',{name:'Corrected annual amount',exact:true}).fill('');await expect(dialog.getByRole('button',{name:'Save correction for review',exact:true})).toBeDisabled();await expect.poll(()=>redContainerOf(reason)).toBe(true);
 await dialog.getByRole('textbox',{name:'Corrected annual amount',exact:true}).fill('11400');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(f.body()).toEqual(initial);
 await sourceCosts(page).getByRole('button',{name:'Correct '+group.label,exact:true}).click();await dialog.getByRole('textbox',{name:'Corrected annual amount',exact:true}).fill('11400');
 await reason.fill('Ask the preparer to verify this source amount');f.setReply('source_corrected');await dialog.getByRole('button',{name:'Save correction for review',exact:true}).click();
 await expect.poll(()=>f.body().expenses?.find(row=>row.source_group_key===group.key)?.current_amount).toBe(11400);
 expect(f.body().historical_corrections?.[0].source_file_ids).toEqual([]);expect(f.body().adjustments).toEqual([]);
 await expect(sourceRow(page,group.label)).toContainText('$12,000.00');await expect(sourceRow(page,group.label)).toContainText('Difference noted');
 await page.reload();await expect(wizard(page)).toBeVisible();await settled(page);await stage(page,'Confirm current costs').click();await expect(sourceCosts(page)).toBeVisible();await sourceCosts(page).getByRole('button',{name:'Correct '+group.label,exact:true}).click();
 await expect(dialog.getByRole('textbox',{name:'Corrected annual amount',exact:true})).toHaveValue('11400');
 await expect(reason).toHaveValue('Ask the preparer to verify this source amount');
 await screenshot(page,info.project.name+'-client-correction.png');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(recognizableScenario('source_corrected').evaluation.baseline.noi).toBe(18000);
 await evidence(page,f,info.project.name+'-source-correction');
});

test('Change immediately requests Why, exact repairs clear red containers and undated math updates before blur',async({page},info)=>{
 const f=await fixture(page,{caseName:'no_changes'});await stage(page,'Plan changes').click();
 f.setReply('change_unconfigured');await changeCard(page).getByRole('button',{name:'Change',exact:true}).click();
 await expect(why(page)).toBeVisible();await expect(why(page)).toHaveAttribute('aria-invalid','true');await expect.poll(()=>redContainerOf(why(page))).toBe(true);
 await expect(config(page).getByLabel(/Effective date|Responsible|Owner name/)).toHaveCount(0);
 const whyBox=(await why(page).boundingBox())!;expect(whyBox.height).toBeGreaterThanOrEqual(70);expect(whyBox.width).toBeGreaterThanOrEqual(Math.min(280,(await config(page).boundingBox())!.width-80));
 await closeDialog(page);const required=await requiredItems(page);const issue=required.getByRole('button',{name:/explain.*why|why.*work|explain the change/i}).first();await expect(issue).toBeVisible();await issue.click();await expect(why(page)).toBeFocused();
 await why(page).fill('Renegotiate the premises contract');await expect(why(page)).not.toHaveAttribute('aria-invalid','true');
 f.setReply('change_why');const amount=config(page).getByRole('textbox',{name:'Command value '+rentId(),exact:true});expect((await amount.boundingBox())!.height).toBeGreaterThanOrEqual(32);await amount.fill('');await amount.pressSequentially('100',{delay:55});await expect(amount).toBeFocused();await expect(amount).toHaveValue('100');
 f.setReply('change_ready');await config(page).getByRole('textbox',{name:/^Setup or transition cost /}).fill('0');
 await expect.poll(()=>redContainerOf(why(page))).toBe(false);await screenshot(page,info.project.name+'-why-complete.png');await closeDialog(page);
 await settled(page);await stage(page,'Review and save').click();await expectMetric(page,'Annual NOI','$18,000.00','$19,200.00','+$1,200.00');
 await expect(comparison(page).getByRole('rowheader',{name:/First-year/})).toHaveCount(0);
 await expect.poll(()=>f.body().adjustments?.[0]?.explanation).toBe('Renegotiate the premises contract');
 expect(f.body().projection_start).toBeNull();expect(f.body().adjustments?.[0].effective_date).toBeNull();expect(f.body().adjustments?.[0].source_note).toBe('');
 await evidence(page,f,info.project.name+'-why-undated');
});

test('new items are added only in Plan changes and a cancelled named composer creates no blank rows',async({page},info)=>{
 const f=await fixture(page,{client:true,caseName:'no_changes'}),original=structuredClone(f.body());await stage(page,'Plan changes').click();
 const add=changes(page).getByRole('button',{name:'+ Add activity in Premises',exact:true});await add.click();
 const composer=changes(page).getByLabel('New planned activity',{exact:true});await expect(composer.getByRole('button',{name:'Add activity (current cost 0)',exact:true})).toBeDisabled();
 await composer.getByRole('textbox',{name:'New planned activity name',exact:true}).fill('Equipment care');await composer.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(f.body()).toEqual(original);expect(draftCalls(f)).toHaveLength(0);
 await add.click();await composer.getByRole('textbox',{name:'New planned activity name',exact:true}).fill('Equipment care');f.setReply('new_activity_unconfigured');await composer.getByRole('button',{name:'Add activity (current cost 0)',exact:true}).click();
 await expect.poll(()=>f.body().expenses?.filter(row=>row.label==='Equipment care').length).toBe(1);
 const added=f.body().expenses!.find(row=>row.label==='Equipment care')!;expect(added.current_amount).toBe(0);expect(added.source_file_ids).toEqual([]);
 expect(f.body().adjustments?.filter(row=>row.expense_row_id===added.id)).toHaveLength(1);await expect(why(page)).toBeVisible();await expect(why(page)).toHaveAttribute('aria-invalid','true');await closeDialog(page);
 await stage(page,'Confirm current costs').click();await expect(sourceCosts(page).locator('[data-operating-source-group]')).toHaveCount(3);
 await stageScreenshot(page,'client-addition',2,info.project.name);await evidence(page,f,info.project.name+'-addition-only');
});

test('freed cash is kept by default and optional reinvestment never charges its cost twice',async({page},info)=>{
 const f=await fixture(page,{caseName:'funding_unassigned'}),original=structuredClone(f.body());await stage(page,'Plan changes').click();const panel=fundingPanel(page);
 await expect(panel).toContainText('Cash kept from savings');await expect(panel).toContainText('$3,600.00');await expect(panel).toContainText('$43,200.00');await expect(panel).toContainText('Kept as cash by default');await expect.poll(()=>redBorder(panel)).toBe(false);
 expect(f.body().released_cash_flow).toEqual({source_fingerprint:null,allocations:[]});const complete=await requiredItems(page);await expect(complete.getByText('Required items complete',{exact:true})).toBeVisible();if(await page.getByRole('dialog',{name:'Required plan items',exact:true}).isVisible())await page.getByRole('dialog',{name:'Required plan items',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
 await settled(page);await stage(page,'Review and save').click();await expectMetric(page,'Annual NOI','$18,000.00','$19,200.00','+$1,200.00');await stageScreenshot(page,'staff-default-cash',4,info.project.name);await evidence(page,f,info.project.name+'-default-cash');expect(f.body().expenses).toEqual(original.expenses);
 const other=await page.context().newPage(),g=await fixture(other,{caseName:'growth_ready'}),before=structuredClone(g.body());await stage(other,'Plan changes').click();await expect(fundingPanel(other)).toContainText('$3,600.00');await fundingPanel(other).getByRole('button',{name:'Use some cash',exact:true}).click();
 const drawer=other.getByRole('dialog',{name:'Keep or use freed cash',exact:true});await drawer.getByRole('button',{name:'Fund a planned activity',exact:true}).click();await drawer.getByRole('textbox',{name:'New allocation purpose',exact:true}).fill('Fund proposed campaign');await drawer.getByRole('button',{name:'Add allocation',exact:true}).click();
 await drawer.getByRole('combobox',{name:'Allocation planned action 1',exact:true}).selectOption(g.body().adjustments!.find(row=>row.kind==='marketing_investment')!.id);g.setReply('growth_funded');await drawer.getByRole('textbox',{name:'Allocation monthly amount 1',exact:true}).fill('1000');
 await expect.poll(()=>g.body().released_cash_flow?.allocations[0]?.amount_monthly).toBe(1000);const acknowledge=drawer.getByRole('button',{name:'Use current funding',exact:true}),currentFingerprint=recognizableScenario('growth_funded').body.released_cash_flow?.source_fingerprint;if(g.body().released_cash_flow?.source_fingerprint!==currentFingerprint){await expect(acknowledge).toBeVisible();await acknowledge.click();await expect.poll(()=>g.body().released_cash_flow?.source_fingerprint).toBe(currentFingerprint);}
 await drawer.getByRole('button',{name:'Done',exact:true}).click();await expect(fundingPanel(other)).toContainText('$2,600.00');await expect(fundingPanel(other)).toContainText('$1,000.00');await expect.poll(()=>redBorder(fundingPanel(other))).toBe(false);
 expect(g.body().expenses).toEqual(before.expenses);expect(g.body().adjustments).toEqual(before.adjustments);expect(g.body().released_cash_flow?.allocations).toHaveLength(1);expect(recognizableScenario('growth_funded').evaluation.draft_feedback?.summary.working?.cash_delta_monthly).toBe(600);
 await settled(other);await stage(other,'Review and save').click();await expectMetric(other,'Annual NOI','$18,000.00','$25,200.00','+$7,200.00');await stageScreenshot(other,'staff-optional-reinvest',4,info.project.name);await evidence(other,g,info.project.name+'-optional-reinvest');await other.close();
});
test('true missing marketing inputs and selected stale or overassigned funding have exact red repairs',async({page},info)=>{
 const f=await fixture(page,{client:true,caseName:'marketing_missing_proposed'});await stage(page,'Plan changes').click();const required=await requiredItems(page);const issue=required.getByRole('button',{name:/proposed/i});await expect(issue).toHaveCount(1);await issue.click();const marketing=recognizableScenario('marketing_missing_proposed').body.adjustments!.find(row=>row.kind==='marketing_investment')!;
 const proposed=config(page).getByRole('textbox',{name:'Activity proposed cost '+marketing.id,exact:true});await expect(proposed).toBeFocused();await expect(proposed).toHaveAttribute('aria-invalid','true');await expect.poll(()=>redContainerOf(proposed)).toBe(true);
 const current=config(page).getByRole('textbox',{name:'Activity current cost '+marketing.id,exact:true}),roas=config(page).getByRole('textbox',{name:'Marketing revenue return multiple '+marketing.id,exact:true});await expect(current).toHaveValue('1000');await expect(current).not.toHaveAttribute('aria-invalid','true');await expect(roas).toHaveValue('2.5');await expect(roas).not.toHaveAttribute('aria-invalid','true');
 f.setReply('growth_ready');await proposed.fill('2000');await settled(page);await expect.poll(()=>redContainerOf(proposed)).toBe(false);await screenshot(page,info.project.name+'-marketing-exact-repair.png');await closeDialog(page);await evidence(page,f,info.project.name+'-marketing-exact-repair');
 const next=await page.context().newPage(),stale=await fixture(next,{client:true,caseName:'funding_stale'}),rows=structuredClone(stale.body().released_cash_flow?.allocations);await stage(next,'Plan changes').click();await fundingPanel(next).getByRole('button',{name:'Review cash',exact:true}).click();
 const editor=next.getByRole('dialog',{name:'Keep or use freed cash',exact:true});await expect(editor.getByRole('textbox',{name:'Allocation monthly amount 1',exact:true})).toHaveValue('1000');stale.setReply('growth_funded');await editor.getByRole('button',{name:'Use current funding',exact:true}).click();await expect.poll(()=>stale.body().released_cash_flow?.source_fingerprint).toBe(recognizableScenario('growth_funded').body.released_cash_flow?.source_fingerprint);expect(stale.body().released_cash_flow?.allocations).toEqual(rows);await editor.getByRole('button',{name:'Done',exact:true}).click();await expect.poll(()=>redBorder(fundingPanel(next))).toBe(false);await evidence(next,stale,info.project.name+'-stale-funding');await next.close();
 const excess=await page.context().newPage(),over=await fixture(excess,{caseName:'funding_overassigned'});await stage(excess,'Plan changes').click();await expect.poll(()=>redBorder(fundingPanel(excess))).toBe(true);await fundingPanel(excess).getByRole('button',{name:'Review cash',exact:true}).click();const allocation=excess.getByRole('dialog',{name:'Keep or use freed cash',exact:true}).getByRole('textbox',{name:'Allocation monthly amount 1',exact:true});await expect(allocation).toHaveAttribute('aria-invalid','true');expect(recognizableScenario('funding_overassigned').evaluation.cash_bridge?.funding_unallocated_monthly).toBe(-400);over.setReply('growth_funded');await allocation.fill('1000');await settled(excess);await expect(allocation).not.toHaveAttribute('aria-invalid','true');await excess.getByRole('dialog',{name:'Keep or use freed cash',exact:true}).getByRole('button',{name:'Done',exact:true}).click();await expect.poll(()=>redBorder(fundingPanel(excess))).toBe(false);await evidence(excess,over,info.project.name+'-overassignment-repair');await excess.close();
});
test('staff saves an undated run-rate version through failure and retry, then downloads immutable scoped PDF bytes',async({page},info)=>{
 const f=await fixture(page,{caseName:'funding_unassigned'});expect(f.body().released_cash_flow).toEqual({source_fingerprint:null,allocations:[]});await settled(page);await stage(page,'Review and save').click();await expectMetric(page,'Annual NOI','$18,000.00','$19,200.00','+$1,200.00');
 await expect(comparison(page).getByRole('rowheader',{name:/First-year/})).toHaveCount(0);await evidence(page,f,info.project.name+'-staff-before-save');
 f.failNextVersion();const save=footer(page).getByRole('button',{name:'Save version',exact:true});await save.click();await expect(page.getByText('Synthetic version temporarily unavailable').first()).toBeVisible();
 await save.click();await expect.poll(()=>f.savedCount()).toBe(1);expect(saves(f)[1].payload.idempotency_key).toBe(saves(f)[0].payload.idempotency_key);
 expect(f.versionBodies[0].adjustments?.[0].status).toBe('proposed');expect(f.versionBodies[0].adjustments?.[0].effective_date).toBeNull();expect(f.versionBodies[0].projection_start).toBeNull();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();const file=await downloaded;expect(await readFile((await file.path())!)).toEqual(pdfFontCompatibility);expect(f.errors).toEqual([]);
 await screenshot(page,info.project.name+'-staff-saved.png');
});

test('client saves directly for team review while read-only source and funding controls never write',async({page},info)=>{
 const view=await fixture(page,{client:true,readOnly:true,caseName:'funding_retained'});await stage(page,'Confirm current costs').click();await expect(sourceCosts(page).getByRole('button',{name:/^Confirm /}).first()).toBeDisabled();
 await stage(page,'Plan changes').click();await fundingPanel(page).getByRole('button',{name:'Use some cash',exact:true}).click();const modal=page.getByRole('dialog',{name:'Keep or use freed cash',exact:true});await expect(modal.getByRole('textbox',{name:'Allocation monthly amount 1',exact:true})).toBeDisabled();expect(draftCalls(view)).toHaveLength(0);expect(saves(view)).toHaveLength(0);await modal.getByRole('button',{name:'Done',exact:true}).click();await evidence(page,view,info.project.name+'-readonly');
 const edit=await page.context().newPage(),f=await fixture(edit,{client:true,caseName:'funding_unassigned'});expect(f.body().released_cash_flow).toEqual({source_fingerprint:null,allocations:[]});await settled(edit);await stage(edit,'Review and save').click();await expectMetric(edit,'Annual NOI','$18,000.00','$19,200.00','+$1,200.00');await assertReachableFooter(edit);
 await footer(edit).getByRole('button',{name:'Save version for your team',exact:true}).click();await expect.poll(()=>f.savedCount()).toBe(1);expect(f.versionBodies[0].adjustments?.[0].effective_date).toBeNull();expect(f.versionBodies[0].adjustments?.[0].source_note).toBe('');expect(f.versionBodies[0].adjustments?.[0].owner_name).toBe('');expect(f.versionBodies[0].adjustments?.[0].status).toBe('proposed');expect(f.errors).toEqual([]);await screenshot(edit,info.project.name+'-client-saved.png');await edit.close();
});
