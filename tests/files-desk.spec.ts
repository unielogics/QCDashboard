import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The desk's home, a client's page and a file's suggestions, in a real browser:
// the real components with the app's own stylesheets, fed fictional files.
// Every hook is a stand-in, so no application records are read or changed.
//
// Three screens share one bundle, picked by ?view=:
//   desk    the operator dashboard (the intake files and their activity)
//   client  the Files and Messages panels on a client's page
//   file    one file's own AI suggestions
let script: Buffer;
let moduleCss: Buffer;
let globalCss: Buffer;
let extrasCss: Buffer;

const FIXTURES = String.raw`
const at=(minutes)=>new Date(Date.now()-minutes*60000).toISOString();
const lead=(id,business,person,extra={})=>({id,variant:'main_street_v1',client_id:'client-'+id,bucket_id:'bucket-'+id,bucket_name:business+' room',full_name:person,email:person.split(' ')[0].toLowerCase()+'@example.com',phone:'+17025550101',business_name:business,status:'reviewing',outcome_status:'submitted',underwriting_status:'collecting_docs',workspace_state:'active',workspace_state_reason:null,preferred_language:'en',booking_recommended:false,call_booked:false,file_count:4,missing_required_count:2,requested_loan_amount:250000,created_at:at(60*24*9),updated_at:at(35),last_message_at:at(20),archived_at:null,unseen_activity_count:0,...extra});
const leads=[
  lead('a','Harbor Auto Detail LLC','Dana Ruiz',{unseen_activity_count:3}),
  lead('b','Northside Bakery & Catering Company of Greater Las Vegas','Priyanka Venkataraman',{underwriting_status:'in_underwriting',status:'reviewed',file_count:11,missing_required_count:0,updated_at:at(60*5),last_message_at:null}),
  lead('c','Hale Holdings LLC','Lena Park, Esq.',{variant:'commercial_foreclosure_bailout_v1',client_id:'client-owner',underwriting_status:'term_sheet_provided',status:'reviewed',file_count:1,updated_at:at(60*30)}),
  lead('d','Sunrise Equipment Rental','Omar Haddad',{client_id:null,status:'collecting',underwriting_status:'submitted',file_count:0,missing_required_count:6,updated_at:at(60*24*3),last_message_at:null}),
];
const event=(id,kind,group,title,minutes,file,extra={})=>({id,occurred_at:at(minutes),kind,group,title,body:null,actor_label:null,visibility:'client',profile_id:'profile-'+file.id,intake_id:file.id,file_title:file.business_name,client_id:file.client_id,client_name:file.full_name,...extra});
const activity=[
  event('e1','document.received','documents','Bank statement received: October operating account',6,leads[0],{actor_label:'Dana Ruiz'}),
  event('e2','message.sent','messages','Dana Ruiz sent a message',18,leads[0]),
  event('e3','status.changed','status','Moved to In underwriting',95,leads[1],{actor_label:'Franco',visibility:'desk'}),
  event('e4','document.requested','documents','Asked for the 2025 business tax return',60*4,leads[1],{actor_label:'Franco'}),
  event('e5','offer.sent','messages','Term sheet sent to the client',60*26,leads[2],{client_name:'Marcus Hale'}),
  event('e6','review.completed','status','AI review completed',60*30,leads[2],{client_name:'Marcus Hale',visibility:'desk'}),
  ...Array.from({length:22},(_,index)=>event('more-'+index,'document.received','documents','Document received '+(index+1),60*40+index*30,leads[1])),
];
const suggestion=(id,title,days,extra={})=>({id,bucket_id:'bucket-a',status:'proposed',route:'admin',title,instructions:'The file has the 2024 return only; the program asks for the two most recent years.',rationale:'Recommended by the latest AI underwriting review.',created_by:'ai',created_at:at(60*24*days),updated_at:at(60*24*days),bucket_name:'Harbor Auto Detail LLC room',client_name:'Harbor Auto Detail LLC',intake_id:'a',href:'/admin/ai-underwriter-leads?lead=a',approvable_here:true,...extra});
const attentionItem=(key,kind,title,days,extra={})=>({item_key:key,queue_status:'active',queue_revision:1,queue_updated_at:null,queue_actor_name:null,queue_reason:null,duplicate_of:null,current_source_active:true,kind,severity:days>=14?'bad':'warn',title,detail:'No document has been uploaded since the file was opened.',age_days:days,count:1,href:'/admin/ai-underwriter-leads?lead=d',bucket_id:'bucket-d',intake_id:'d',profile_id:'profile-d',link_last_sent_at:null,actions:kind==='intake_no_files'?['resend_link']:[],...extra});
const unlinked=location.search.includes('unlinked');
const quiet=location.search.includes('quiet');
window.__fx={
  me:{id:'user-1',role:location.search.includes('underwriter')?'loan_exec':'super_admin',name:'Franco',ui_locale:'en'},
  summary:{generated_at:at(0),active:quiet?0:14,new_7d:quiet?0:3,no_documents:quiet?0:5,without_client:unlinked?2:0,stages:[['submitted',2],['collecting_docs',6],['in_underwriting',3],['term_sheet_provided',2],['approved',1],['closed_won',0]].map(([key,count])=>({key,count:quiet?0:count}))},
  attention:quiet?[]:[attentionItem('k1','intake_no_files','Sunrise Equipment Rental',16),attentionItem('k2','request_overdue','Northside Bakery & Catering Company of Greater Las Vegas',34,{detail:'4 checklist items have been open for more than 30 days.',count:4,intake_id:'b',href:'/admin/ai-underwriter-leads?lead=b'}),attentionItem('k3','action_items_stale','Harbor Auto Detail LLC',9,{detail:'2 AI suggestions have waited more than 7 days.',count:2,intake_id:'a',href:'/admin/ai-underwriter-leads?lead=a'})],
  leads:quiet?[]:leads,
  clients:[{id:'client-a',name:'Dana Ruiz'},{id:'client-b',name:'Priyanka Venkataraman'},{id:'client-owner',name:'Marcus Hale'}],
  activity:quiet?[]:activity,
  suggestions:quiet?[]:[suggestion('s1','Ask for the 2025 business tax return',16),suggestion('s2','Confirm the second owner on the application',3),suggestion('s3','Remind the client about the debt schedule',1,{route:'uploader',approvable_here:false,bucket_id:'bucket-b',client_name:'Northside Bakery & Catering Company of Greater Las Vegas',intake_id:'b'})],
  unread:[{intake_id:'a',sms:2,email:1},{intake_id:'b',sms:0,email:0},{intake_id:'c',sms:0,email:4},{intake_id:'d',sms:0,email:0},{intake_id:'e',sms:0,email:0}],
  economics:Object.fromEntries(['requested','underwriting','approved','funded'].map((key,index)=>[key,{count:[8,3,1,2][index],value:[1850000,920000,310000,640000][index],forecast_earnings:[0,27600,9300,19200][index],forecasted_count:[0,3,1,2][index],forecast_coverage_pct:[0,100,100,100][index]}])),
  events:quiet?[]:[{id:'cal-1',title:'Pre-call with Harbor Auto Detail',starts_at:new Date(new Date().setHours(14,30,0,0)).toISOString(),who:'Dana Ruiz',kind:'call',status:'pending'}],
  clientFiles:[
    {id:'a',profile_id:'profile-a',bucket_id:'bucket-a',variant:'main_street_v1',full_name:'Dana Ruiz',business_name:'Harbor Auto Detail LLC',loan_purpose:'Working capital',status:'reviewed',outcome_status:'submitted',underwriting_status:'in_underwriting',workspace_state:'active',workspace_state_reason:null,requested_loan_amount:250000,file_count:9,missing_required_count:2,created_at:at(60*24*20),updated_at:at(60*3),last_message_at:at(25),archived_at:null},
    {id:'e',profile_id:'profile-e',bucket_id:'bucket-e',variant:'mca_refi_v1',full_name:'Dana Ruiz',business_name:'Harbor Auto Detail LLC',loan_purpose:'MCA refinance',status:'denied',outcome_status:'denied',underwriting_status:'denied',workspace_state:'closed',workspace_state_reason:'denied',requested_loan_amount:null,file_count:1,missing_required_count:0,created_at:at(60*24*200),updated_at:at(60*24*150),last_message_at:null,archived_at:null},
  ],
  communications:{file_count:2,counts:{sms:3,email:3},items:[
    {id:'reply:1',channel:'email',direction:'inbound',occurred_at:at(25),counterpart:'dana@harborautodetail.example',subject:'Re: Two documents still needed for your file',snippet:'Attached are the October statements. The tax return is with my accountant and I should have it Thursday.',status:'received',detail:'',context:'reply',actor_name:null,delivered_at:null,opened_at:null,can_open:false,intake_id:'a',file_title:'Harbor Auto Detail LLC'},
    {id:'send:2',channel:'email',direction:'outbound',occurred_at:at(60*5),counterpart:'dana@harborautodetail.example',subject:'Two documents still needed for your file',snippet:null,status:'delivered',detail:'',context:'manual',actor_name:'Franco',delivered_at:at(60*5),opened_at:at(60*4),can_open:true,intake_id:'a',file_title:'Harbor Auto Detail LLC'},
    {id:'sms:3',channel:'sms',direction:'inbound',occurred_at:at(60*6),counterpart:'+17025550101',subject:null,snippet:'Got it, uploading tonight',status:'received',detail:'',context:'reply',actor_name:null,delivered_at:null,opened_at:null,can_open:false,intake_id:'a',file_title:'Harbor Auto Detail LLC'},
    {id:'sms:4',channel:'sms',direction:'outbound',occurred_at:at(60*7),counterpart:'+17025550101',subject:null,snippet:'Your secure document room is ready. Use the link we emailed to upload your statements.',status:'delivered',detail:'',context:'room_link',actor_name:null,delivered_at:at(60*7),opened_at:null,can_open:false,intake_id:'a',file_title:'Harbor Auto Detail LLC'},
    {id:'sms:5',channel:'sms',direction:'outbound',occurred_at:at(60*24*150),counterpart:'+17025550101',subject:null,snippet:null,status:'blocked',detail:'No transactional SMS consent on file for this number.',context:'intake_link',actor_name:null,delivered_at:null,opened_at:null,can_open:false,intake_id:'e',file_title:'Harbor Auto Detail LLC'},
    {id:'send:6',channel:'email',direction:'outbound',occurred_at:at(60*24*150),counterpart:'dana@harborautodetail.example',subject:'An update on your MCA refinance request',snippet:null,status:'sent',detail:'',context:'file_updates',actor_name:null,delivered_at:null,opened_at:null,can_open:false,intake_id:'e',file_title:'Harbor Auto Detail LLC'},
  ]},
  decided:[],
};`;

test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const vitestRequire = createRequire(projectRequire.resolve("vitest/package.json"));
  const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-files-desk-"));
  const hooksSource = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const hookNames = [...hooksSource.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map((match) => match[1]);
  // Stand-ins that answer from the fixture, and re-render when it changes.
  const standIns: Record<string, string> = {
    useCurrentUser: "()=>({data:window.__fx.me,isLoading:false})",
    useDevUser: "()=>'fixture'",
    useAuthedApi: "()=>call",
    useIntakeDeskSummary: "()=>({data:window.__fx.summary,isError:false,refetch:async()=>{}})",
    // One object per page of the queue, as a query cache would hand back: the panel keeps the last one it saw.
    useAttentionQueue: "(enabled,options)=>{const key=(options?.limit??60)+':'+(options?.offset??0);if(!queuePages.has(key)){const items=window.__fx.attention;queuePages.set(key,{generated_at:new Date().toISOString(),items:items.slice(options?.offset??0,(options?.offset??0)+(options?.limit??60)),counts:{},total:items.length,hidden_total:0,status_counts:{active:items.length,archived:0,dismissed:0,duplicate:0},filtered_total:items.length,limit:options?.limit??60,offset:options?.offset??0})}return {data:queuePages.get(key),isLoading:false,isFetching:false,isError:false,refetch:async()=>{}}}",
    useSendRoomReminder: "()=>({isPending:false,variables:null,mutateAsync:async()=>({overall_status:'sent'})})",
    useUpdateAttentionItem: "()=>({isPending:false,variables:null,mutateAsync:async()=>({})})",
    useProposedActionItems: "(enabled,status,bucketId)=>{useVersion();return {data:enabled===false?undefined:window.__fx.suggestions.filter(item=>!bucketId||item.bucket_id===bucketId),isLoading:false,isError:false,refetch:async()=>{}}}",
    useDecideActionItem: "()=>({isPending:false,mutateAsync:async(args)=>{window.__fx.decided.push(args);window.__fx.suggestions=window.__fx.suggestions.filter(item=>item.id!==args.itemId);bump();return {}}})",
    useUnifiedOperatorFiles: "()=>({data:{items:[],rollup:{total:14,working:9,pipeline_economics:window.__fx.economics}},isLoading:false})",
    useClients: "()=>({data:window.__fx.clients})",
    useFileActivity: "(group,options)=>{const all=window.__fx.activity.filter(item=>group==='all'||item.group===group);const limit=options?.limit??40;return {data:{items:all.slice(0,limit),next_before:all.length>limit?all[limit-1].occurred_at:null},isLoading:false,isFetching:false,isError:false,refetch:async()=>{}}}",
    useIntakeCommunicationUnreadBatch: "()=>({data:{items:window.__fx.unread},isLoading:false,isError:false})",
    useClientFiles: "()=>({data:window.__fx.clientFiles,isLoading:false,isError:false,refetch:async()=>{}})",
    useClientCommunications: "()=>({data:window.__fx.communications,isLoading:false,isError:false,refetch:async()=>{}})",
    useCommsMessage: "(id)=>({data:id?{id,source:'message_sends',channel:'email',direction:'outbound',context:'manual',to:'dana@harborautodetail.example',subject:'Two documents still needed for your file',status:'delivered',detail:'',provider:'ses',provider_message_id:'m-1',occurred_at:new Date().toISOString(),delivered_at:null,opened_at:null,actor_name:'Franco',actor_label:'operator',job:null,request_id:null,has_body:true,secrets_masked:true,body_text:'Hi Dana,\\n\\nTwo items are still open on your file: the October bank statement and your 2025 business tax return.\\n\\nYou can upload both in your secure room.',body_html:null,cc:[],attachments:[],caused_by:[]}:undefined,isLoading:false,isError:false})",
  };
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import {useSyncExternalStore} from 'react';
      let version=0;const listeners=new Set();const bump=()=>{version+=1;listeners.forEach(fn=>fn())};
      const queuePages=new Map();
      const useVersion=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>version);
      const call=async(path)=>{if(String(path).startsWith('/admin/ai-underwriter-leads?'))return {items:window.__fx.leads,total:window.__fx.summary.active,limit:10,offset:0};throw new Error('Unexpected API request '+path)};
      ${hookNames.map((name) => `export const ${name}=${standIns[name] ?? "()=>({})"};`).join("\n")}`,
    "next/link": "export default function Link({href,children,prefetch,...props}){return <a href={href} {...props}>{children}</a>}",
    "next/navigation": "const router={push:url=>{window.__navigated=url},replace:url=>{window.__navigated=url}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>'/';export const useParams=()=>({});",
  };
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
      ${FIXTURES}
      import{OperatorFilesDesk}from'@/app/components/OperatorFilesDesk';import{ClientFilesPanel,ClientMessagesPanel}from'@/components/client/ClientFilesAndMessages';import{AiSuggestionsPanel}from'@/components/operator/AiSuggestionsPanel';
      const view=new URLSearchParams(location.search).get('view')||'desk';
      const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
      function App(){
        if(view==='client')return <div className="grid"><ClientFilesPanel clientId="client-a" clientName="Dana Ruiz"/><ClientMessagesPanel clientId="client-a" clientName="Dana Ruiz"/></div>;
        if(view==='file')return <AiSuggestionsPanel bucketId="bucket-a"/>;
        return <OperatorFilesDesk firstName="Franco" greeting="Good morning" locale="en" events={window.__fx.events}/>;
      }
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><App/></QueryClientProvider>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    // Never the default API address: on the build box that is the production API.
    define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: "http://api.files-desk.test" }), "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent",
    plugins: [{ name: "files-desk-fixtures", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "files-desk-fixture" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "files-desk-fixture" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  script = await readFile(path.join(directory, "app.js"));
  moduleCss = await readFile(path.join(directory, "app.css"));
  execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "src/app/globals.css", "-o", path.join(directory, "globals.css")], { cwd: root, stdio: "ignore" });
  globalCss = await readFile(path.join(directory, "globals.css"));
  extrasCss = await readFile(path.join(root, "src/app/app-extras.css"));
});

// The shell the pages sit in: a 242px rail and one scrolling content column.
const PAGE = `<html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/extras.css"><link rel="stylesheet" href="/app.css"></head>
<body><div class="app" id="shell"><div id="rail"></div><main class="content content--wide" id="scroller"><div id="root"></div></main></div>
<style>#shell{display:grid;grid-template-columns:242px minmax(0,1fr);min-height:100vh}@media(max-width:900px){#shell{grid-template-columns:minmax(0,1fr)}#rail{display:none}}</style>
<script src="/app.js"></script></body></html>`;

async function open(page: Page, query: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: moduleCss });
    if (pathname === "/globals.css") return route.fulfill({ contentType: "text/css", body: globalCss });
    if (pathname === "/extras.css") return route.fulfill({ contentType: "text/css", body: extrasCss });
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body: PAGE });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`http://files-desk.test/${query}`);
  return errors;
}

/** Nothing spills: the page does not scroll sideways and nothing leaves the content column. */
async function expectNoSpill(page: Page) {
  const spill = await page.evaluate(() => {
    const main = document.getElementById("scroller")!;
    const frame = main.getBoundingClientRect();
    const offenders: string[] = [];
    for (const element of main.querySelectorAll<HTMLElement>("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Content inside a scrolling table wrapper is allowed to be wider than it.
      if (element.closest(".tblwrap") && !element.classList.contains("tblwrap")) continue;
      if (rect.right > frame.right + 1 || rect.left < frame.left - 1) offenders.push(`${element.tagName}.${element.className} ${Math.round(rect.left)}–${Math.round(rect.right)}`);
    }
    return { sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, offenders: offenders.slice(0, 5) };
  });
  expect(spill.sideways, "the page scrolls sideways").toBeLessThanOrEqual(0);
  expect(spill.offenders, "elements leave the content column").toEqual([]);
}

const shot = (page: Page, name: string, project: string) =>
  process.env.QC_SHOT_DIR ? page.screenshot({ path: path.join(process.env.QC_SHOT_DIR, `${name}-${project}.png`), fullPage: true }) : Promise.resolve();

test("the desk's home is the intake files and what happened on them", async ({ page }, info) => {
  const errors = await open(page, "?view=desk");
  await expect(page.getByRole("heading", { name: "Good morning, Franco." })).toBeVisible();
  await expect(page.getByText("14 files in flight · 3 need attention · 3 new this week")).toBeVisible();

  const tiles = page.getByRole("region", { name: "Files at a glance" });
  await expect(tiles).toContainText("Active files14");
  await expect(tiles).toContainText("New this week3");
  await expect(tiles).toContainText("Need attention3");
  await expect(tiles).toContainText("No documents yet5");
  await expect(tiles).toContainText("AI suggestions3");
  // Every file has its client, so the page says nothing about it.
  await expect(tiles).not.toContainText("Without a client");

  // Where files stand, in the underwriting lifecycle's own labels and order.
  const stages = page.locator(".panel", { hasText: "Where files stand" });
  for (const label of ["Submitted", "Collecting docs", "In underwriting", "Term sheet provided", "Approved", "Closed / funded"]) await expect(stages).toContainText(label);

  // The files that moved most recently: each opens its file and names its client.
  const motion = page.locator(".panel", { hasText: "Files in motion" });
  await expect(motion.getByRole("link", { name: "Harbor Auto Detail LLC", exact: true })).toHaveAttribute("href", "/files/a");
  await expect(motion.getByRole("link", { name: "Dana Ruiz", exact: true })).toHaveAttribute("href", "/clients/client-a");
  // A rescue an attorney sent in belongs to the owner, not to the attorney on the form.
  await expect(motion.getByRole("link", { name: "Marcus Hale", exact: true })).toHaveAttribute("href", "/clients/client-owner");
  await expect(motion).not.toContainText("Lena Park");
  await expect(motion).toContainText("Not linked yet");
  await expect(motion).toContainText("3 new since you looked");
  await expect(motion).toContainText("2 still needed");
  await expect(motion.getByRole("link", { name: /Open SMS for Harbor Auto Detail LLC/ })).toHaveAttribute("href", "/files/a?section=communications&channel=client");

  await expectNoSpill(page);
  await shot(page, "desk", info.project.name);

  // What happened, with the file and the client each line belongs to.
  const feed = page.locator(".panel", { hasText: "What happened on the files" });
  await expect(feed).toContainText("Bank statement received: October operating account");
  await expect(feed.getByRole("link", { name: "Harbor Auto Detail LLC" }).first()).toHaveAttribute("href", "/files/a?section=documents");
  await expect(feed.getByRole("link", { name: "Marcus Hale" }).first()).toHaveAttribute("href", "/clients/client-owner");
  await feed.getByRole("button", { name: "Messages" }).click();
  await expect(feed).toContainText("Dana Ruiz sent a message");
  await expect(feed).not.toContainText("Bank statement received");
  await feed.getByRole("button", { name: "All", exact: true }).click();
  await expect(feed.getByRole("button", { name: "Show more" })).toBeVisible();
  await feed.getByRole("button", { name: "Show more" }).click();
  await expect(feed).toContainText("Document received 22");

  // The stalled-file queue is still the desk's queue.
  await expect(page.getByText("Needs attention today")).toBeVisible();
  await expect(page.locator("#desk-attention")).toContainText("Sunrise Equipment Rental");

  // What the page no longer carries.
  for (const gone of ["Field Desk", "market rates", "Elara · pending approval", "By vertical", "Funding band"]) await expect(page.locator("#root")).not.toContainText(gone);
  await expect(page.locator('#root a[href*="ai-inbox"]')).toHaveCount(0);

  await expectNoSpill(page);
  expect(errors).toEqual([]);
});

test("an AI suggestion is answered on the dashboard, and only by someone who may", async ({ page }) => {
  const errors = await open(page, "?view=desk");
  const panel = page.locator("#ai-suggestions");
  await expect(panel).toContainText("3 waiting for a decision");
  await expect(panel.getByRole("link", { name: "Harbor Auto Detail LLC" }).first()).toHaveAttribute("href", "/files/a");
  // Addressed to the desk: approve or dismiss. Addressed to the client: dismiss only.
  await expect(panel.getByRole("button", { name: "Approve" })).toHaveCount(2);
  await expect(panel.getByRole("button", { name: "Dismiss" })).toHaveCount(3);

  await panel.getByRole("button", { name: "Ask for the 2025 business tax return" }).click();
  await expect(panel).toContainText("The file has the 2024 return only");
  await panel.getByRole("button", { name: "Approve" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Nothing is sent to the client by approving it");
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(panel).toContainText("Approved “Ask for the 2025 business tax return”.");
  await expect(panel).toContainText("2 waiting for a decision");
  expect(await page.evaluate(() => (window as unknown as { __fx: { decided: unknown[] } }).__fx.decided)).toEqual([{ bucketId: "bucket-a", itemId: "s1", status: "approved" }]);
  expect(errors).toEqual([]);
});

test("underwriting reads the suggestions without deciding them", async ({ page }) => {
  await open(page, "?view=desk&underwriter");
  const panel = page.locator("#ai-suggestions");
  await expect(panel).toContainText("Ask for the 2025 business tax return");
  await expect(panel.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
  // Only a super admin opens a file from here.
  await expect(page.getByRole("link", { name: "New file" })).toHaveCount(0);
});

test("a file with no client says so until the repair reaches it", async ({ page }, info) => {
  await open(page, "?view=desk&unlinked");
  const tiles = page.getByRole("region", { name: "Files at a glance" });
  await expect(tiles).toContainText("Without a client2");
  await expect(tiles).toContainText("within 30 minutes");
  await expectNoSpill(page);
  await shot(page, "desk-unlinked", info.project.name);
});

test("a desk with nothing on it says so plainly", async ({ page }, info) => {
  const errors = await open(page, "?view=desk&quiet");
  await expect(page.getByText("0 files in flight · 0 need attention · 0 new this week")).toBeVisible();
  await expect(page.getByText("No active files")).toBeVisible();
  await expect(page.getByText("Nothing yet", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing is waiting")).toBeVisible();
  await expect(page.getByText("Nothing is scheduled today.")).toBeVisible();
  await expectNoSpill(page);
  await shot(page, "desk-quiet", info.project.name);
  expect(errors).toEqual([]);
});

test("a client reads back as their files and their messages", async ({ page }, info) => {
  const errors = await open(page, "?view=client");
  const files = page.locator("#client-files");
  await expect(files).toContainText("1 open · 1 closed or archived");
  await expect(files.getByRole("link", { name: "Harbor Auto Detail LLC" }).first()).toHaveAttribute("href", "/files/a");
  await expect(files).toContainText("In underwriting");
  await expect(files).toContainText("Denied");
  await expect(files).toContainText("9 documents");
  await expect(files).toContainText("2 still needed");
  await expect(files).toContainText("$250,000");

  const messages = page.locator("#client-messages");
  await expect(messages.getByRole("button", { name: /All 6/ })).toBeVisible();
  await expect(messages).toContainText("From dana@harborautodetail.example");
  await expect(messages).toContainText("Attached are the October statements.");
  // A text that never went shows why.
  await expect(messages).toContainText("No transactional SMS consent on file for this number.");
  await messages.getByRole("button", { name: /Texts 3/ }).click();
  await expect(messages).toContainText("Got it, uploading tonight");
  await expect(messages).not.toContainText("Two documents still needed");
  await messages.getByRole("button", { name: /Email 3/ }).click();
  await expect(messages).toContainText("Opened");

  // Only the email this viewer may read offers to open it; the body comes from the log.
  await expect(messages.getByRole("button", { name: "Read the email" })).toHaveCount(1);
  await messages.getByRole("button", { name: "Read the email" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Two items are still open on your file");
  await expect(drawer).toContainText("Codes removed");
  await drawer.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await messages.getByRole("button", { name: /All 6/ }).click();
  await expectNoSpill(page);
  await shot(page, "client", info.project.name);
  expect(errors).toEqual([]);
});

test("a file shows its own suggestions and nobody else's", async ({ page }, info) => {
  const errors = await open(page, "?view=file");
  const panel = page.locator(".panel", { hasText: "AI suggestions" });
  await expect(panel).toContainText("2 waiting for a decision");
  await expect(panel).toContainText("Ask for the 2025 business tax return");
  await expect(panel).not.toContainText("Remind the client about the debt schedule");
  // On the file itself there is no need to name the file again.
  await expect(panel.getByRole("link", { name: "Harbor Auto Detail LLC" })).toHaveCount(0);
  await expectNoSpill(page);
  await shot(page, "file-suggestions", info.project.name);
  expect(errors).toEqual([]);
});
