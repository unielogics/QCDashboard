import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unreadable } from "./support/readable";

// A personal financial statement for each owner, in a real browser: the real
// tracker with the app's own stylesheets, fed a made-up file. The API is a
// stand-in that keeps its own state, so a click changes what the next read
// returns the way the backend would, and no application record is touched.
//
// The address picks the fixture: ?state=one|fresh|complete|unassigned|minor|quiet
// (quiet: a file that asks for no personal statements), ?role=super_admin|broker,
// ?variant=inline.
let script: Buffer;
let moduleCss: Buffer;
let globalCss: Buffer;
let extrasCss: Buffer;

const FIXTURES = String.raw`
const flags=new URLSearchParams(location.search);
const state=flags.get('state')||'one';
const figures=(worth,liquid)=>({statement_date:'2026-11-01',total_assets:worth+190000,total_liabilities:190000,net_worth:worth,liquid_assets:liquid});
const version=(id,family,number,extra={})=>({id,family_id:family,version_number:number,created_at:'2026-11-16T14:00:00Z',source:'form',status:'filed',actor_name:null,by_staff:false,has_pdf:true,is_current:false,awaiting_review:false,figures:figures(510000,42000),...extra});
const statement=(family,name,versions,extra={})=>{const got=versions.find(v=>v.is_current||v.awaiting_review)||null;return {family_id:family,label:'Personal financial statement · '+name,applicant_name:name,received:Boolean(got),received_version:got,draft_in_progress:false,draft_updated_at:null,figures:got?got.figures:null,versions,link:null,...extra}};
const owner=(id,first,last,pct,extra={})=>({owner_id:id,full_name:first+' '+last,first_name:first,last_name:last,email:first.toLowerCase()+'@example.com',ownership_pct:pct,is_primary:false,required:pct>=20,reason:pct>=20?'ownership':'under_threshold',request_note:null,request_by:null,request_at:null,status:pct>=20?'not_started':'not_required',matched_by:null,joint_with:[],statement:null,other_statements:[],...extra});
const filed=statement('family-jordan','Jordan Sample',[
  version('v-jordan-2','family-jordan',2,{created_at:'2026-11-17T16:30:00Z',is_current:true,actor_name:'Jordan Sample',figures:figures(545000,61000)}),
  version('v-jordan-1','family-jordan',1,{created_at:'2026-11-12T10:00:00Z',actor_name:'Jordan Sample'}),
],{link:{sent_at:'2026-11-10T15:00:00Z',sent_to:'jordan@example.com',opened_at:'2026-11-11T09:00:00Z',use_count:3,completed_at:'2026-11-12T10:00:00Z',expires_at:'2026-12-10T15:00:00Z'}});
const jordan=owner('owner-jordan','Jordan','Sample',50,{is_primary:true,status:'received',matched_by:'assigned',statement:filed});
const alex=owner('owner-alex','Alex','Rivera',50);
const upload=statement('family-upload','',[version('v-upload-1','family-upload',1,{source:'original',status:'original',awaiting_review:true,created_at:'2026-11-15T12:00:00Z',figures:figures(250000,15000)})],{applicant_name:null,label:'Personal financial statement'});
const book={
  one:{owners:[jordan,alex],unassigned:[],loose:[]},
  fresh:{owners:[owner('owner-jordan','Jordan','Sample',50,{is_primary:true}),alex],unassigned:[],loose:[]},
  complete:{owners:[jordan,owner('owner-alex','Alex','Rivera',50,{status:'received',matched_by:'name',statement:statement('family-alex','Alex Rivera',[version('v-alex-1','family-alex',1,{is_current:true,by_staff:true,actor_name:'Sam Desk',figures:figures(120000,8000)})])})],unassigned:[],loose:[]},
  unassigned:{owners:[jordan,alex],unassigned:[upload],loose:[{file_id:'file-scan',file_name:'scan-0042.pdf',uploaded_at:'2026-11-14T12:00:00Z',applicant_name:null,figures:null}]},
  minor:{owners:[jordan,owner('owner-riley','Riley','Chen',40,{email:null}),owner('owner-morgan','Morgan','Lee',10)],unassigned:[],loose:[]},
  quiet:{owners:[owner('owner-jordan','Jordan','Sample',50,{is_primary:true,required:false,reason:'not_asked',status:'not_required'}),owner('owner-alex','Alex','Rivera',50,{required:false,reason:'not_asked',status:'not_required'})],unassigned:[],loose:[]},
}[state]||{owners:[jordan,alex],unassigned:[],loose:[]};
const snapshot=()=>{const needed=book.owners.filter(o=>o.required);const got=needed.filter(o=>o.status==='received');return JSON.parse(JSON.stringify({profile_id:'profile-1',needed:state!=='quiet',asked_by:state==='quiet'?[]:['SBA 7(a)'],threshold_pct:20,required_count:needed.length,received_count:got.length,complete:needed.length>0&&got.length===needed.length,missing_owner_ids:needed.filter(o=>o.status!=='received').map(o=>o.owner_id),owners:book.owners,unassigned:book.unassigned,on_checklist:state!=='fresh',loose_files:book.loose}))};
const find=id=>book.owners.find(o=>o.owner_id===id);
const send=o=>{o.status=o.status==='received'?'received':'sent';o.statement=o.statement||statement('family-'+o.owner_id,o.full_name,[]);o.statement.link={sent_at:'2026-11-18T15:00:00Z',sent_to:o.email,opened_at:null,use_count:0,completed_at:null,expires_at:'2026-12-18T15:00:00Z'};if(!o.required){o.required=true;o.reason='requested'}};
window.__calls=[];window.__refreshed=0;window.__opened=[];window.open=(url)=>{window.__opened.push(String(url));return null};
window.__api=async(path,options={})=>{
  const method=options.method||'GET';const body=options.body?JSON.parse(options.body):null;window.__calls.push([method,path,body]);
  const rest=(path.match(/owner-statements\/?(.*)$/)||[])[1]||'';let m;
  if(!rest)return snapshot();
  if(rest==='email-missing'){const items=book.owners.filter(o=>o.required&&o.status!=='received').map(o=>{if(!o.email)return {owner_id:o.owner_id,owner_name:o.full_name,sent:false,detail:'No personal email on file for this owner'};send(o);return {owner_id:o.owner_id,owner_name:o.full_name,sent:true,detail:null}});return {items}}
  if((m=rest.match(/^([^/]+)\/email-link$/))){const o=find(m[1]);send(o);return {owner_id:o.owner_id,owner_name:o.full_name,sent:true,detail:null}}
  if((m=rest.match(/^([^/]+)\/link$/)))return {url:'https://app.example.test/forms/pfs/made-up-token-'+m[1],expires_at:'2026-12-18T15:00:00Z'};
  if((m=rest.match(/^([^/]+)\/open$/)))return {family_id:'family-'+m[1],label:'Personal financial statement'};
  if((m=rest.match(/^([^/]+)\/requirement$/))){const o=find(m[1]);if(body.required){o.required=true;o.reason=o.ownership_pct>=20?'ownership':'requested';o.status=o.statement&&o.statement.received?'received':'not_started';o.request_note=null}else{o.required=false;o.reason='not_needed';o.status='not_needed';o.request_note=body.reason;o.request_by='Sam Desk'}return snapshot()}
  if((m=rest.match(/^statements\/([^/]+)\/owners$/))){const item=book.unassigned.find(s=>s.family_id===m[1])||book.owners.map(o=>o.statement).find(s=>s&&s.family_id===m[1]);book.unassigned=book.unassigned.filter(s=>s.family_id!==m[1]);for(const o of book.owners){if(o.statement&&o.statement.family_id===m[1]){o.statement=null;o.status=o.required?'not_started':'not_required';o.matched_by=null}}if(!body.owner_ids.length&&!body.set_aside)book.unassigned.push(item);for(const id of body.owner_ids){const o=find(id);o.statement=item;o.status='received';o.matched_by='assigned'}return snapshot()}
  if((m=rest.match(/^files\/([^/]+)\/assign$/))){const file=book.loose.find(f=>f.file_id===m[1]);book.loose=book.loose.filter(f=>f.file_id!==m[1]);const o=find(body.owner_id);o.statement=statement('family-'+o.owner_id,o.full_name,[version('v-'+m[1],'family-'+o.owner_id,1,{source:'original',status:'original',awaiting_review:true,figures:null})]);o.status='received';o.matched_by='assigned';return snapshot()}
  throw new Error('No stand-in for '+method+' '+path);
};
window.__fx={me:{id:'user-1',role:flags.get('role')||'super_admin',name:'Sam Desk'}};`;

test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const vitestRequire = createRequire(projectRequire.resolve("vitest/package.json"));
  const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-owner-statements-"));
  const hooksSource = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const hookNames = [...hooksSource.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map((match) => match[1]);
  const standIns: Record<string, string> = {
    useAuthedApi: "()=>window.__api",
    useCurrentUser: "()=>({data:window.__fx.me,isLoading:false})",
    useDevUser: "()=>'fixture'",
  };
  const mocks: Record<string, string> = {
    "@/hooks/useApi": hookNames.map((name) => `export const ${name}=${standIns[name] ?? "()=>({})"};`).join("\n"),
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({getToken:async()=>null,isSignedIn:false,isLoaded:true});",
    // The forms workspace is its own screen with its own checks; here it only has to open on the right statement.
    "@/components/application/FinancialWorkspace": "export function FinancialWorkspace({initialKind,initialFamilyId,onClose}){return <div role='dialog' aria-label='Financial forms'>Statement {initialKind} {initialFamilyId}<button type='button' onClick={onClose}>Close forms</button></div>}",
    "next/dynamic": "import React from'react';export default function dynamic(loader){const Lazy=React.lazy(()=>loader().then((m)=>({default:m.default||m})));return function Dynamic(props){return React.createElement(React.Suspense,{fallback:null},React.createElement(Lazy,props))}}",
  };
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
      ${FIXTURES}
      import{OwnerStatementsPanel}from'@/components/application/OwnerStatementsPanel';
      const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
      const variant=new URLSearchParams(location.search).get('variant')||'section';
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><OwnerStatementsPanel profileId="profile-1" variant={variant} onChanged={()=>{window.__refreshed+=1}}/></QueryClientProvider>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    // Never the default API address: on the build box that is the production API.
    define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: "http://api.owner-statements.test" }), "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent",
    plugins: [{ name: "owner-statements-fixtures", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "owner-statements-fixture" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "owner-statements-fixture" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  script = await readFile(path.join(directory, "app.js"));
  moduleCss = await readFile(path.join(directory, "app.css")).catch(() => Buffer.from(""));
  execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "src/app/globals.css", "-o", path.join(directory, "globals.css")], { cwd: root, stdio: "ignore" });
  globalCss = await readFile(path.join(directory, "globals.css"));
  extrasCss = await readFile(path.join(root, "src/app/app-extras.css"));
});

// The file's content column, as the app lays it out. A doctype, as the app has.
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/extras.css"><link rel="stylesheet" href="/app.css"></head>
<body><main class="content content--wide" style="padding:16px;min-width:0"><div class="application-verification"><div id="root"></div></div></main>
<style>body{margin:0}</style><script src="/app.js"></script></body></html>`;

async function open(page: Page, query = "", { heading = true } = {}) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (url.pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: moduleCss });
    if (url.pathname === "/globals.css") return route.fulfill({ contentType: "text/css", body: globalCss });
    if (url.pathname === "/extras.css") return route.fulfill({ contentType: "text/css", body: extrasCss });
    if (url.pathname === "/file") return route.fulfill({ contentType: "text/html", body: html });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.clock.setFixedTime(new Date("2026-11-18T15:00:00Z"));
  await page.goto(`http://owner-statements.test/file${query}`);
  if (heading) await expect(page.getByRole("heading", { name: "Owner financial statements" })).toBeVisible();
  return errors;
}

const card = (page: Page, name: string) => page.getByRole("article", { name: `${name} financial statement` });
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: [string, string, unknown][] }).__calls);
const spill = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function shot(page: Page, name: string) {
  const directory = process.env.SHOTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}-${test.info().project.name}.png`), fullPage: true });
}

test("each owner is tracked on their own: who is in, who is not, and what is still owed", async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByText("1 of 2 statements received")).toBeVisible();
  await expect(page.getByText(/^Asked for by SBA 7\(a\)\. Every owner at 20\.00% or more gives their own/)).toBeVisible();
  const mine = card(page, "Jordan Sample");
  await expect(mine.getByText("Received", { exact: true })).toBeVisible();
  await expect(mine.getByText("v2 · Filled in online by the owner · Nov 17")).toBeVisible();
  await expect(mine.getByText("Sent Nov 10 · opened Nov 11")).toBeVisible();
  await expect(mine.getByText("$545,000", { exact: true })).toBeVisible();
  await expect(mine.getByText("$61,000", { exact: true })).toBeVisible();
  const theirs = card(page, "Alex Rivera");
  await expect(theirs.getByText("Not sent yet")).toBeVisible();
  await expect(theirs.getByText("None yet")).toBeVisible();
  await expect(theirs.getByText("No link sent")).toBeVisible();
  // One person's figures are never shown against the other, and never added up.
  await expect(theirs.getByText("$545,000")).toHaveCount(0);
  await expect(page.getByText("$606,000")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send missing links" })).toBeEnabled();
  expect(await spill(page)).toBeLessThanOrEqual(0);
  expect(await unreadable(page)).toEqual([]);
  await shot(page, "one-of-two");
  expect(errors).toEqual([]);
});

test("emailing an owner their link, and sending every missing one at once", async ({ page }) => {
  const errors = await open(page);
  const theirs = card(page, "Alex Rivera");
  await theirs.getByRole("button", { name: "Email link" }).click();
  await expect(page.getByText("Emailed Alex Rivera the link to their own statement.")).toBeVisible();
  await expect(theirs.getByText("Link sent")).toBeVisible();
  await expect(theirs.getByText("Sent Nov 18 · not opened")).toBeVisible();
  await expect(theirs.getByRole("button", { name: "Resend link" })).toBeVisible();
  expect((await calls(page)).some(([method, address]) => method === "POST" && address.endsWith("/owner-statements/owner-alex/email-link"))).toBe(true);
  // The checklist reads the same statements, so it is told to reload.
  expect(await page.evaluate(() => (window as unknown as { __refreshed: number }).__refreshed)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Send missing links" }).click();
  await expect(page.getByText("Emailed Alex Rivera their own link.")).toBeVisible();
  await shot(page, "link-sent");
  expect(errors).toEqual([]);
});

test("an owner with no email cannot be sent a link, and the page says who", async ({ page }) => {
  const errors = await open(page, "?state=minor");
  await expect(page.getByText("Riley Chen has no personal email on file. Add it in the ownership table to send their link.")).toBeVisible();
  const riley = card(page, "Riley Chen");
  await expect(riley.getByText("No personal email on file", { exact: true })).toBeVisible();
  await expect(riley.getByRole("button", { name: "Email link" })).toBeDisabled();
  // Nobody reachable is waiting, so there is nothing for the batch to send.
  await expect(page.getByRole("button", { name: "Send missing links" })).toBeDisabled();
  // An owner under 20% owes none, until the desk sends them a link.
  const morgan = card(page, "Morgan Lee");
  await expect(morgan.getByText("Not required", { exact: true })).toBeVisible();
  await expect(morgan.getByText("Under 20.00%, so not required")).toBeVisible();
  await morgan.getByRole("button", { name: "Email link" }).click();
  await expect(morgan.getByText("Under 20.00%, asked by your team")).toBeVisible();
  await expect(page.getByText("1 of 3 statements received")).toBeVisible();
  expect(await unreadable(page)).toEqual([]);
  await shot(page, "no-email-and-under-twenty");
  expect(errors).toEqual([]);
});

test("copying an owner's private link, and opening their statement in the forms", async ({ page }) => {
  const errors = await open(page);
  const theirs = card(page, "Alex Rivera");
  await theirs.getByRole("button", { name: "Copy Alex Rivera's private link" }).click();
  // This page is not a secure origin, so the clipboard is refused and the link is shown instead of lost.
  await expect(page.getByText("Alex Rivera's private link is https://app.example.test/forms/pfs/made-up-token-owner-alex")).toBeVisible();
  await theirs.getByRole("button", { name: "Open statement" }).click();
  const forms = page.getByRole("dialog", { name: "Financial forms" });
  await expect(forms).toContainText("Statement pfs family-owner-alex");
  await forms.getByRole("button", { name: "Close forms" }).click();
  await expect(forms).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("every saved version stays in that owner's history, newest first", async ({ page }) => {
  const errors = await open(page);
  const mine = card(page, "Jordan Sample");
  await mine.getByText("History · 2 versions").click();
  const rows = mine.locator("details ol li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("v2");
  await expect(rows.nth(0)).toContainText("Current");
  await expect(rows.nth(0)).toContainText("net worth $545,000");
  await expect(rows.nth(1)).toContainText("v1");
  await expect(rows.nth(1)).toContainText("Nov 12");
  await rows.nth(1).getByRole("button", { name: "Open version 1 of Jordan Sample's statement" }).click();
  await expect(page.getByText("This version's PDF could not be opened. Try again.")).toBeVisible();
  expect(await unreadable(page)).toEqual([]);
  await shot(page, "history");
  // The stand-in has no PDF to serve: the failed request is the one error expected here.
  expect(errors.filter((line) => !/Failed to load resource|ERR_/i.test(line))).toEqual([]);
});

test("marking a statement not needed takes a reason, and can be taken back", async ({ page }) => {
  const errors = await open(page);
  const theirs = card(page, "Alex Rivera");
  await theirs.getByRole("button", { name: "Not needed", exact: true }).click();
  const save = theirs.getByRole("button", { name: "Mark not needed" });
  await expect(save).toBeDisabled();
  await theirs.getByLabel("Why is no statement needed from Alex Rivera?").fill("Silent partner, the lender waived it");
  await expect(save).toBeEnabled();
  await shot(page, "not-needed-reason");
  await save.click();
  await expect(theirs.getByText("Not needed", { exact: true })).toBeVisible();
  await expect(theirs.getByText("Marked not needed by Sam Desk: Silent partner, the lender waived it")).toBeVisible();
  await expect(page.getByText("1 of 1 statement received")).toBeVisible();
  await expect(theirs.getByRole("button", { name: "Email link" })).toHaveCount(0);
  await theirs.getByRole("button", { name: "Needed after all" }).click();
  await expect(page.getByText("1 of 2 statements received")).toBeVisible();
  await expect(theirs.getByText("Not sent yet")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a statement tied to no owner counts for nobody until the desk says whose it is", async ({ page }) => {
  const errors = await open(page, "?state=unassigned");
  const loose = page.getByRole("group", { name: "Statements not tied to an owner" });
  await expect(loose.getByText("2 statements are not tied to an owner")).toBeVisible();
  await expect(loose.getByText("No name on the statement")).toBeVisible();
  await expect(loose.getByText("scan-0042.pdf")).toBeVisible();
  expect(await unreadable(page)).toEqual([]);
  await shot(page, "unassigned");
  const assign = loose.getByRole("button", { name: "Assign" }).first();
  await expect(assign).toBeDisabled();
  await loose.getByLabel("Owner for this statement").selectOption("owner-alex");
  await assign.click();
  await expect(page.getByText("That statement is now in Alex Rivera's history.")).toBeVisible();
  await expect(page.getByText("2 of 2 statements received")).toBeVisible();
  await expect(card(page, "Alex Rivera").getByText("Uploaded · needs review")).toBeVisible();
  await expect(loose.getByText("1 statement is not tied to an owner")).toBeVisible();
  await loose.getByLabel("Owner for scan-0042.pdf").selectOption("owner-jordan");
  await loose.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByRole("group", { name: "Statements not tied to an owner" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a statement the system matched by itself says so, and the desk can say it is not theirs", async ({ page }) => {
  const errors = await open(page, "?state=complete");
  await expect(page.getByText("2 of 2 statements received")).toBeVisible();
  const theirs = card(page, "Alex Rivera");
  await expect(theirs.getByText("Matched by the name on the statement")).toBeVisible();
  await expect(theirs.getByText("v1 · Filled in by your team · Nov 16")).toBeVisible();
  await expect(card(page, "Jordan Sample").getByText("Matched by")).toHaveCount(0);
  await shot(page, "complete");
  // Taken off Alex, it waits to be assigned again rather than disappearing.
  await theirs.getByRole("button", { name: "Not theirs" }).click();
  await expect(page.getByText("1 of 2 statements received")).toBeVisible();
  await expect(page.getByText("That statement is off Alex Rivera's row. Say whose it is, or set it aside.")).toBeVisible();
  const loose = page.getByRole("group", { name: "Statements not tied to an owner" });
  await expect(loose.getByText("1 statement is not tied to an owner")).toBeVisible();
  await loose.getByRole("button", { name: "Not an owner's" }).click();
  await expect(page.getByText("That statement is set aside as no owner's on this file.")).toBeVisible();
  await expect(loose).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("someone who cannot underwrite sees every owner but cannot send or decide", async ({ page }) => {
  const errors = await open(page, "?role=broker&state=unassigned");
  await expect(page.getByRole("button", { name: "Send missing links" })).toHaveCount(0);
  const theirs = card(page, "Alex Rivera");
  await expect(theirs.getByRole("button", { name: "Email link" })).toHaveCount(0);
  await expect(theirs.getByRole("button", { name: "Not needed", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assign" })).toHaveCount(0);
  await expect(theirs.getByRole("button", { name: "Open statement" })).toBeVisible();
  await expect(theirs.getByRole("button", { name: "Copy Alex Rivera's private link" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("inside the checklist row, and on a file nobody has been asked on yet", async ({ page }) => {
  const errors = await open(page, "?variant=inline&state=fresh");
  await expect(page.getByText("0 of 2 statements received")).toBeVisible();
  await expect(page.getByText("The personal financial statement is not on this file's checklist yet. Sending an owner their link adds it.")).toBeVisible();
  await expect(page.locator(".verification-section-head")).toHaveCount(0);
  expect(await spill(page)).toBeLessThanOrEqual(0);
  expect(await unreadable(page)).toEqual([]);
  await shot(page, "inline-fresh");
  expect(errors).toEqual([]);
});

test("a file that asks for no personal statements shows no block at all", async ({ page }) => {
  const errors = await open(page, "?state=quiet", { heading: false });
  // The tracker was read, and said the file asks for none.
  await expect.poll(async () => (await calls(page)).length).toBeGreaterThan(0);
  await expect(page.locator("#root")).toBeEmpty();
  await expect(page.getByRole("heading", { name: "Owner financial statements" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send missing links" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
