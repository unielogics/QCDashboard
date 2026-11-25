import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WORKSPACE_INTAKE as INTAKE, WORKSPACE_PROFILE as PROFILE } from "./fixtures/fileWorkspaceNavigation";

const ORIGIN = "https://internal-notes-access.test";
const OTHER_INTAKE = "99000000-0000-4000-8000-000000000099";
let script: Buffer, css: Buffer;
const componentMocks: Record<string,string> = {
  "@/components/ds/ActionIcon": "export const ActionIcon=()=>null;",
  "@/components/ds/PageActionMenu": "export const PageActionMenu=()=>null;",
  "@/components/design-system/ConfirmDialog": "export const ConfirmDialog=()=>null;",
  "@/components/design-system/PreparationProgress": "export const PreparationProgress=()=>null;",
  "@/components/file/FileTeamStrip": "export const FileTeamStrip=()=>null;",
  "@/components/file/FileTimeline": "export const FileTimeline=()=>null;",
  "@/components/admin/MerchantOfferStrip": "export const MerchantOfferStrip=()=>null;",
  "@/components/admin/DealerTermSheetDocumentActions": "export const DealerTermSheetDocumentActions=()=>null;",
  "@/components/marketplace/MarketplacePublishStrip": "export const MarketplacePublishStrip=()=>null;",
  "@/components/admin/LeadCockpit": "export const LeadCockpit=()=>null;",
  "@/components/admin/LeadCreditPanel": "export const LeadCreditPanel=()=>null;",
  "@/components/admin/LeadContractsPanel": "export const LeadContractsPanel=()=>null;",
  "@/components/admin/LeadProgramFitPanel": "export const LeadProgramFitPanel=()=>null;",
  "@/components/admin/LeadDscrPanel": "export const LeadDscrPanel=()=>null;",
  "@/components/application/FundingRequestControl": "export const FundingRequestControl=()=>null;",
  "@/components/file/FinancingProposalSummary": "export const FinancingProposalSummary=()=>null;",
  "@/components/communications/CommunicationUnreadBadge": "export const CommunicationUnreadBadge=()=>null;\nexport const CommunicationUnreadBar=()=>null;",
  "@/components/file/ContactActions": "export const EmailContact=()=>null;\nexport const PhoneContact=()=>null;",
  "@/components/file/PersonalUseReviewBanner": "export const PersonalUseReviewBanner=()=>null;",
  "@/components/file/ReApplicationPanel": "export const ReApplicationPanel=()=>null;",
  "@/components/file/FileSsnPanel": "export const FileSsnPanel=()=>null;",
  "@/components/operator/PipelineApprovalFields": "export const PipelineApprovalFields=()=>null;",
  "./FundingPackageWorkspace": "export const FundingPackageWorkspace=()=>null;",
  "./InvestorPackageDetails": "export const InvestorPackageDetails=()=>null;\nexport const InvestorReportReferenceButton=()=>null;",
  "./PackageDocumentActions": "export const PackageDocumentActions=()=>null;",
  "@/components/admin/BankerSubmissionModal": "export const BankerSubmissionModal=()=>null;",
  "@/components/admin/IntakeNotificationRoutingDrawer": "export const IntakeNotificationRoutingDrawer=()=>null;",
  "@/components/application/ApplicationVerificationWorkspace": "export const ApplicationVerificationWorkspace=()=>null;",
  "@/components/application/ApplicationEvidenceWorkspace": "export const ApplicationEvidenceWorkspace=()=>null;",
  "@/components/application/ApplicationClassificationPanel": "export const ApplicationClassificationPanel=()=>null;",
  "@/components/application/ApplicationIntelligencePanel": "export const ApplicationIntelligencePanel=()=>null;",
  "@/components/application/CapitalReadinessPanel": "export const CapitalReadinessPanel=()=>null;",
  "@/components/application/ExtractedFactsReview": "export const ExtractedFactsReview=()=>null;",
  "@/components/application/ApplicationAuditTimeline": "export const ApplicationAuditTimeline=()=>null;",
  "@/components/admin/ProductionPackageTab": "export const ProductionPackageTab=()=>null;",
  "@/components/application/ApplicationMissingItemCommunications": "export const ApplicationMissingItemCommunications=()=>null;",
  "@/components/application/ApplicationClientTermsPanel": "export const ApplicationClientTermsPanel=()=>null;",
  "@/components/file/UnderwritingFlow": "export const UnderwritingFlow=()=>null;",
  "@/components/communications/AIIntakeClientCommunications": "export const AIIntakeClientConversation=()=>null;\nexport const AIIntakeEmailWorkspace=()=>null;",
  "@/components/communications/OfferDeliveryComposer": "export const OfferDeliveryComposer=()=>null;",
  "@/components/communications/OfferDeliveryHistory": "export const OfferDeliveryHistory=()=>null;",
  "@/components/broker/LeadNotesPanel": "export const LeadNotesPanel=()=>null;",
  "@/components/buckets/BucketWorkspaceOverlay": "export const BucketWorkspaceOverlay=()=>null;",
  "@/components/payments/PaymentsWorkspace": "export const PaymentsWorkspace=()=>null;",
  "@/components/file/cockpit/FinancialCockpit": "export const FinancialCockpit=()=>null;",
  "@/components/application/ApplicationProgramReadiness": "export const ApplicationProgramReadiness=()=>null;"
};


test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-internal-notes-access-"));
  const names = [...(await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8")).matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks = { ...componentMocks,
    "@/hooks/useApi": `import{useSyncExternalStore}from'react';const call=(...args)=>window.fixtureApi(...args);const subscribe=fn=>{window.addEventListener('fixture-actor-change',fn);return()=>window.removeEventListener('fixture-actor-change',fn)};${names.map(name=>name==='useAuthedApi'?'export const useAuthedApi=()=>call;':name==='useCurrentUser'?"export const useCurrentUser=()=>{const data=useSyncExternalStore(subscribe,()=>window.fixtureActor);return{data,isLoading:false,authReady:true,authScope:data.id+':test-session'}};":name==='useDevUser'?'export const useDevUser=()=>null;':`export const ${name}=()=>({isPending:false,isLoading:false,data:null,mutateAsync:async()=>({}),refetch:async()=>({})});`).join('\n')}`,
    "@/lib/consoleAuth": "const token=async()=> 'synthetic-staff-token';export const isVisualQa=false;export const visualQaUser=()=>null;export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,userId:window.fixtureActor.id,sessionId:'test-session',getToken:token});",
    "@/hooks/usePackageArtifacts": "export const usePackageArtifacts=()=>({snapshot:null,denied:false,loading:false,error:null,refresh:async()=>{}});",
    "next/link": "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}",
    "next/navigation": "export const useParams=()=>({});export const usePathname=()=>'/files/test';export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push:()=>{},replace:()=>{},back:()=>{}});",
    "next/dynamic": "import React,{lazy,Suspense}from'react';export default(loader,options={})=>{const Component=lazy(async()=>{const value=await loader();return typeof value==='function'?{default:value}:value});return props=><Suspense fallback={options.loading?React.createElement(options.loading):null}><Component {...props}/></Suspense>};",
    "@/store/role": "export const useActiveProfile=()=>({email:'operator@example.test'});",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useMemo,useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{LeadDetailPanel}from'@/components/file/LeadDetailPanel';import{workspaceDetail}from'./tests/fixtures/fileWorkspaceNavigation';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.fixtureApi=async(p,o={})=>{const r=await fetch('${ORIGIN}/api/v1'+p,{...o,headers:{Authorization:'Bearer synthetic-staff-token','Content-Type':'application/json'}});const j=await r.json();if(!r.ok)throw Error(j.detail||'Synthetic read failed');return j};const noop=async()=>{};function App(){const[id,setId]=useState('${INTAKE}');const detail=useMemo(()=>{const d=workspaceDetail();return{...d,intake:{...d.intake,id,business_name:id==='${INTAKE}'?'Example one LLC':'Example two LLC'}}},[id]);return <main style={{padding:12,maxWidth:1440,margin:'auto'}}><div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:10}}><button onClick={()=>setId(id==='${INTAKE}'?'${OTHER_INTAKE}':'${INTAKE}')}>Switch synthetic file</button><button onClick={()=>{window.fixtureActor={...window.fixtureActor,id:window.fixtureActor.id==='staff-one'?'staff-two':'staff-one'};window.dispatchEvent(new Event('fixture-actor-change'))}}>Switch synthetic account</button><button onClick={()=>{window.fixtureActor={...window.fixtureActor,role:window.fixtureActor.role==='super_admin'?'dealer_partner':'super_admin'};window.dispatchEvent(new Event('fixture-actor-change'))}}>Switch synthetic role</button></div><LeadDetailPanel detail={detail} loading={false} initialView='workspace' initialActiveTab='workspace' canGovern canDelete onClose={()=>{}} onExport={noop} onRefresh={noop} onGenerateSummary={noop} onGeneratePacket={noop} onGeneratePackage={noop} onGeneratePrequalification={noop} onPreviewEmail={noop} onSendEmail={noop} onIngestFromDrive={noop} onRerun={()=>{}} rerunning={false} cockpitResponse={null} cockpitAdapter={null} onCockpitResponse={()=>{}} onDownloadZip={noop} onLinkBucketIntake={()=>{}} onPostNote={noop} onUpdateOutcomeStatus={noop} onUpdateLanguage={noop} onUpdateContact={noop} onCancelDeletionRequest={noop} onConfirmDeletion={noop}/></main>};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><ConfirmationProvider><App/></ConfirmationProvider></QueryClientProvider>);` }, outfile:path.join(directory,'app.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',nodePaths:[path.join(root,'node_modules')],alias:{'@':path.join(root,'src')},define:{'process.env':JSON.stringify({NODE_ENV:'development',NEXT_PUBLIC_API_URL:ORIGIN})},external:['node:module','node:fs','node:fs/promises','node:url','node:path','@napi-rs/canvas'],loader:{'.module.css':'local-css'},logLevel:'silent',plugins:[{name:'synthetic-related-workspaces',setup(build:{onResolve:(o:{filter:RegExp},cb:(a:{path:string})=>unknown)=>void;onLoad:(o:{filter:RegExp;namespace:string},cb:(a:{path:string})=>unknown)=>void}){build.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'synthetic'}:undefined);build.onLoad({filter:/.*/,namespace:'synthetic'},a=>({contents:mocks[a.path as keyof typeof mocks],loader:'tsx',resolveDir:root}));}}]});
  [script,css]=await Promise.all([readFile(path.join(directory,'app.js')),readFile(path.join(directory,'app.css'))]);
});

async function fixture(page:Page, role = "super_admin") {
  const requests:Array<{method:string;path:string}>=[],errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    expect(url.origin).toBe(ORIGIN);
    if(!url.pathname.startsWith('/api/v1/')) return route.fulfill(url.pathname==='/app.js'?{contentType:'text/javascript',body:script}:url.pathname==='/app.css'?{contentType:'text/css',body:css}:{contentType:'text/html',body:`<!doctype html><html><head><meta name=viewport content=width=device-width><link rel=stylesheet href=/app.css></head><body><div id=root></div><script>window.fixtureActor={id:'staff-one',role:${JSON.stringify(role)},email:'operator@example.test',full_name:'Example operator'};</script><script src=/app.js></script></body></html>`});
    const p=url.pathname.slice(7);requests.push({method,path:p});
    expect(method).toBe('GET');
    const json=(value:unknown)=>route.fulfill({json:value});
    if(p.startsWith('/communications/threads/')) {
      const id=decodeURIComponent(p.slice('/communications/threads/'.length));expect(id).toMatch(/^intake:[a-f0-9-]+:internal$/);
      return json({thread:{id,title:'Internal notes',source_kind:'intake',source_id:id.split(':')[1],source_label:'Internal notes',participant_name:'Example team',participant_email:null,participant_phone:null,participant_type:'staff',source_ref:null,channel:'internal',transport:'internal',unread_count:0,message_count:1,latest_snippet:'Synthetic internal note',latest_at:'2026-11-25T12:00:00Z',assigned_desk:null,href:'#',can_reply:true},messages:[{id:'note-example',thread_id:id,body:'Synthetic internal note',sender_name:'Example operator',sender_type:'staff',direction:'outbound',channel:'internal',transport:'internal',created_at:'2026-11-25T12:00:00Z',seen:true,delivery_status:null,include_in_ai_context:false}]});
    }
    if(p.endsWith('/room/invitation'))return json({can_resend:false,recipient_email:'operator@example.test'});
    if(p.includes('/underwriting'))return json({profile_id:PROFILE,underwriting_status:'review_pending',approved_amount:null,accepted_amount:null,financing:null});
    if(p.endsWith('/program-readiness'))return json({profile_id:PROFILE,selections:[],programs:[],candidates:[],requirements:[],evidence_policies:[],available_evidence_files:[],evidence_summary:{},automation:{},can_advance:false});
    throw Error('Unexpected notes access read '+p);
  });
  await page.goto(ORIGIN);
  await expect(page.getByRole('button',{name:'Expand file details',exact:true})).toBeVisible();
  return {requests,errors};
}

const notes=(page:Page)=>page.getByRole('region',{name:'Internal file notes',exact:true});

test('internal notes stay available across main file tabs and retain a collapsed draft',async({page})=>{
  const f=await fixture(page);
  await expect(page.getByRole('heading',{name:'Contact',exact:true})).toHaveCount(0);
  expect(f.requests.filter(row=>row.path.includes('/communications/threads/'))).toHaveLength(0);
  await page.getByRole('button',{name:'Expand internal notes',exact:true}).click();
  await expect(notes(page)).toContainText('Synthetic internal note');
  const composer=notes(page).getByRole('textbox');await composer.fill('Unsent internal draft');
  await page.getByRole('button',{name:'Expand file details',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Contact',exact:true})).toBeVisible();
  await expect(composer).toHaveValue('Unsent internal draft');
  await page.getByRole('button',{name:'Collapse file details',exact:true}).click();
  await expect(composer).toHaveValue('Unsent internal draft');
  await page.getByRole('button',{name:'Collapse internal notes',exact:true}).click();
  await expect(notes(page)).not.toBeVisible();
  await page.getByRole('button',{name:'Expand internal notes',exact:true}).click();
  await expect(composer).toHaveValue('Unsent internal draft');
  for(const name of ['Underwriting','Financials','Payments','Reviewer controls','Communications','Audit trail','File workspace']) {
    await page.getByRole('tab',{name,exact:true}).click();
    await expect(page.getByRole('button',{name:'Collapse internal notes',exact:true})).toBeVisible();
    await expect(notes(page)).toBeVisible();await expect(composer).toHaveValue('Unsent internal draft');
  }
  const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport+1);
  expect(f.errors).toEqual([]);
});

test('file and account switches clear the prior private note composer',async({page})=>{
  const f=await fixture(page);
  await page.getByRole('button',{name:'Expand internal notes',exact:true}).click();
  await expect(notes(page)).toContainText('Synthetic internal note');
  await notes(page).getByRole('textbox').fill('File one private draft');
  await page.getByRole('button',{name:'Switch synthetic file',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand internal notes',exact:true})).toBeVisible();
  await expect(notes(page)).not.toBeVisible();
  await page.getByRole('button',{name:'Expand internal notes',exact:true}).click();
  await expect(notes(page).getByRole('textbox')).toHaveValue('');
  await notes(page).getByRole('textbox').fill('Account one private draft');
  await page.getByRole('button',{name:'Switch synthetic account',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand internal notes',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand internal notes',exact:true}).click();
  await expect(notes(page).getByRole('textbox')).toHaveValue('');
  expect(f.requests.some(row=>row.path.includes(encodeURIComponent(OTHER_INTAKE))||decodeURIComponent(row.path).includes(OTHER_INTAKE))).toBe(true);
  expect(f.errors).toEqual([]);
});

test('partner users retain Contact access without an internal notes control or request',async({page})=>{
  const f=await fixture(page,'dealer_partner');
  await expect(page.getByRole('button',{name:/internal notes/i})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Internal file notes',exact:true,includeHidden:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Expand file details',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Contact',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Collapse file details',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand file details',exact:true})).toBeVisible();
  expect(f.requests.filter(row=>row.path.includes('/communications/threads/'))).toHaveLength(0);
  expect(f.errors).toEqual([]);
});

test('staff role loss removes the private rail and clears its draft before access returns',async({page})=>{
  const f=await fixture(page);
  await page.getByRole('button',{name:'Expand internal notes',exact:true}).click();
  await expect(notes(page)).toContainText('Synthetic internal note');
  await notes(page).getByRole('textbox').fill('Private staff draft');
  await page.getByRole('button',{name:'Switch synthetic role',exact:true}).click();
  await expect(page.getByRole('button',{name:/internal notes/i})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Internal file notes',exact:true,includeHidden:true})).toHaveCount(0);
  await expect(page.locator('.intake-file-body')).toHaveClass(/context-collapsed/);
  await expect(page.locator('.intake-file-body')).not.toHaveClass(/notesExpanded/);
  await page.getByRole('button',{name:'Expand file details',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Contact',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Switch synthetic role',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand internal notes',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand internal notes',exact:true}).click();
  await expect(notes(page).getByRole('textbox')).toHaveValue('');
  expect(f.errors).toEqual([]);
});
