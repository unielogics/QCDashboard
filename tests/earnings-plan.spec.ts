import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The four-step Earnings Plan in a real browser: the real workspace and engine
// with the app's own stylesheets, opened on the fictional file the design
// draws. The API is a stand-in that lives in the page (it keeps a revision,
// trims text the way the API does, and can be told to fail), so no application
// record is read or changed.
let script: Buffer;
let moduleCss: Buffer;
let globalCss: Buffer;
let extrasCss: Buffer;
// The page a business opens from its link, and the sample plan the stand-in API serves it.
let linkScript: Buffer;
let linkCss: Buffer;
let linkWorkspace: () => LinkWorkspace;

test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const vitestRequire = createRequire(projectRequire.resolve("vitest/package.json"));
  const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-earnings-plan-"));
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{EarningsPlanWorkspace}from'@/components/earnings-plan/EarningsPlanWorkspace';
      import{PlanError}from'@/lib/earningsPlan/api';
      import{evaluate}from'@/lib/earningsPlan/math';
      import{referenceWorkspace}from'@/lib/__tests__/fixtures/earningsPlanReferencePlan';
      const query=new URLSearchParams(location.search), client=query.has('client');
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      function start(){
        const workspace=referenceWorkspace();
        workspace.evaluation.plan.baseline.source.file_id='file-return';
        if(query.has('empty')){
          workspace.evaluation.plan.baseline={available:false,reason:'No filed business return or profit and loss statement is in use on this file yet.',revenue:null,cogs:null,operating_expenses:null,noi:null,ebitda:null,debt_service_current:777600,debt_service_with_terms:null,released_monthly:null,source_name:'source',source:{},groups:[]};
          workspace.evaluation.plan.questions=[];
          workspace.body={...workspace.body,streams:[],lines:[],changes:[],growth:[],activities:[],allocations:[],source:{stamp:null,confirmations:{},corrections:{}}};
          Object.assign(workspace,{origin:'seeded',draft:null,versions:[],current_version_id:null,family_id:null,goal:{status:'awaiting_staff',metric:'annual_noi',amount:null,currency:null,revision:0}});
        }
        if(query.has('carried')){
          workspace.origin='carried_over';workspace.draft.stored_model='operating-plan-v1';
          workspace.body.carried_over=[{id:'carried-1',kind:'change',label:'Second cut to the same lease',detail:'A second change to the same cost. The new plan keeps one change per cost; combine it with the first one in step 3.',annual_amount:6805,resolved:false}];
        }
        if(query.has('changed'))workspace.evaluation.plan.source_changed=true;
        if(query.has('viewonly'))workspace.can_edit=false;
        return workspace;
      }
      const server={workspace:start(),saves:[],calls:[],reviews:[],delay:140,fail:null};
      window.__server=server;
      // What the API does to a body: text is trimmed and figures are numbers, so its echo never matches the keystrokes exactly.
      const stored=body=>JSON.parse(JSON.stringify(body,(key,value)=>typeof value==='string'?value.trim():value));
      const transport={scope:'test:'+(client?'client':'staff'),viewer:client?'client':'staff',
        load:async()=>{server.calls.push('load');await wait(30);return structuredClone(server.workspace)},
        saveDraft:async(body,facts)=>{server.calls.push('draft');await wait(server.delay);
          if(server.fail){const error=server.fail;server.fail=null;throw new PlanError(error.status,error.message,error.code??null)}
          const draft=server.workspace.draft;
          if((draft?draft.revision:null)!==facts.revision)throw new PlanError(409,'This draft changed. Reload before saving.','financial_draft_conflict');
          server.saves.push(body);
          server.workspace={...server.workspace,origin:'saved',family_id:server.workspace.family_id??'family-new',body:stored(body),draft:{revision:(draft?draft.revision:0)+1,base_version_id:draft?draft.base_version_id:null,updated_at:new Date().toISOString(),stored_model:'operating-plan-v2',dirty:true}};
          return structuredClone(server.workspace)},
        saveVersion:async()=>{server.calls.push('version');await wait(server.delay);
          const number=server.workspace.versions.length+1,id='version-'+number;
          const version={id,version_number:number,created_at:'2026-11-14T14:02:00Z',actor_name:'Desk',source:'form',status:'published',pdf_file_id:'pdf-'+number,pdf_url:'/api/v1/x/'+id+'/pdf'};
          server.workspace={...server.workspace,versions:[version,...server.workspace.versions],current_version_id:id,draft:{...server.workspace.draft,base_version_id:id,dirty:false}};
          return{draft:server.workspace.draft,versions:server.workspace.versions,current_version_id:id,saved_version:version}},
        resync:async body=>{server.calls.push('resync');await wait(60);
          server.workspace={...server.workspace,evaluation:{...server.workspace.evaluation,plan:{...server.workspace.evaluation.plan,source_changed:false}}};
          return{body:{...body,source:{...body.source,confirmations:{},stamp:'f'.repeat(64)}},evaluation:server.workspace.evaluation,context_stamp:server.workspace.context_stamp}},
        openPdf:async version=>{window.__pdf=version.id}};
      if(!client){
        transport.review=async input=>{server.calls.push('review');await wait(server.delay);server.reviews.push(input);
          const body=structuredClone(server.workspace.body);
          for(const block of['changes','growth','activities'])for(const row of body[block])if(input.itemIds.includes(row.id)){row.status=input.decision;row.review_reason=input.reason}
          server.workspace={...server.workspace,body,draft:{...server.workspace.draft,revision:server.workspace.draft.revision+1}};
          return{body,draft:server.workspace.draft,context_stamp:server.workspace.context_stamp}};
        transport.setGoal=async(amount,currency,goal)=>{server.calls.push('goal');const next={status:'set',metric:'annual_noi',amount,currency,revision:(goal?goal.revision:0)+1,updated_at:null};server.workspace={...server.workspace,goal:next};return next};
        transport.openSource=async fileId=>{window.__source=fileId};
      }
      // What the engine says for the last body the API received: the screen must agree with it.
      window.__saved=()=>{const body=server.saves[server.saves.length-1];if(!body)return null;
        const plan=server.workspace.evaluation.plan,result=evaluate(body,plan.baseline,{goal:server.workspace.goal&&server.workspace.goal.amount,questions:plan.questions});
        return{body,ebitda:result.proposed.ebitda,reviewed:result.reviewed.ebitda,toFinish:result.to_finish.length}};
      createRoot(document.getElementById('root')).render(<EarningsPlanWorkspace transport={transport} lead={<a className="btn sm" href="#file">Back to file</a>}
        tools={state=>client?null:<button type="button" className="btn sm" disabled={state.busy}>Request client plan</button>} onVersionSaved={version=>{window.__published=version?version.id:null}}/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" },
  });
  script = await readFile(path.join(directory, "app.js"));
  moduleCss = await readFile(path.join(directory, "app.css"));
  // The link page as the route renders it: the real page component with its own transport. Its API address is a name
  // that resolves nowhere, so a request the test does not answer can never reach a running API.
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{ClientEarningsPlan}from'@/components/earnings-plan/ClientEarningsPlan';
      createRoot(document.getElementById('root')).render(<ClientEarningsPlan token="tok-1"/>);` },
    outfile: path.join(directory, "link.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(LINK_API) }, loader: { ".module.css": "local-css" },
  });
  linkScript = await readFile(path.join(directory, "link.js"));
  linkCss = await readFile(path.join(directory, "link.css"));
  // The design's plan with everything finished except the attestation, as the API would hold it.
  await esbuild.build({
    stdin: { resolveDir: root, loader: "ts", contents: `import{referenceWorkspace}from'@/lib/__tests__/fixtures/earningsPlanReferencePlan';
      import{answerCategory,confirmGroup,patchItem,toWire}from'@/lib/earningsPlan/edit';
      import{evaluate}from'@/lib/earningsPlan/math';
      export function linkWorkspace(){
        const workspace=referenceWorkspace({can_edit:true,completed:false}),plan=workspace.evaluation.plan;
        let body=workspace.body;
        for(const item of evaluate(body,plan.baseline,{goal:workspace.goal?.amount??null,questions:plan.questions}).to_finish){
          if(item.code==='confirm_source'&&item.key)body=confirmGroup(body,item.key);
          else if(item.code==='answer_category'&&item.key)body=answerCategory(body,item.key,'not_applicable');
          else if(item.item_id)body=patchItem(body,item.item_id,{note:'Contract signed; copy on file.'});
        }
        return{...workspace,body:toWire(body)};
      }` },
    outfile: path.join(directory, "fixture.cjs"), bundle: true, format: "cjs", platform: "node", alias: { "@": path.join(root, "src") },
  });
  linkWorkspace = (projectRequire(path.join(directory, "fixture.cjs")) as { linkWorkspace: () => LinkWorkspace }).linkWorkspace;
  execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "src/app/globals.css", "-o", path.join(directory, "globals.css")], { cwd: root, stdio: "ignore" });
  globalCss = await readFile(path.join(directory, "globals.css"));
  extrasCss = await readFile(path.join(root, "src/app/app-extras.css"));
});

// The plan's own page inside the console, laid out as AppShell lays it out: the rail on the left, the top bar, and
// under it the content area, which is the only thing that scrolls and brings the console's own padding.
// `full` unpins the page for a moment so a screenshot can show a whole step.
const PAGE = `<html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/extras.css"><link rel="stylesheet" href="/app.css"></head>
<body><div id="shell"><div id="rail"></div><div id="column"><div id="topbar"></div><main class="content content--wide" id="scroller"><div id="root"></div></main></div></div>
<style>body{margin:0}#shell{display:grid;grid-template-columns:242px minmax(0,1fr);height:100vh}#column{display:flex;flex-direction:column;min-width:0;min-height:0}#topbar{flex:none;height:51px;border-bottom:1px solid var(--line)}#scroller{flex:1;min-width:0;overflow-y:auto;overflow-x:hidden}
body.full #shell{height:auto}body.full #scroller{overflow:visible}
@media(max-width:900px){#shell{grid-template-columns:minmax(0,1fr)}#rail{display:none}}</style>
<script src="/app.js"></script></body></html>`;

type Body = { changes: Array<{ id: string; value: number | null; note: string }>; notes: string };
type LinkWorkspace = Record<string, unknown> & {
  body: Body & { attestation: boolean }; family_id: string | null; origin: string; completed?: boolean; current_version_id: string | null;
  draft: { revision: number; base_version_id: string | null; dirty: boolean }; versions: Array<Record<string, unknown>>;
};
type LinkRequest = { method: string; path: string; origin: string; signed: boolean; sent: Record<string, unknown> | null };
/** The API as a client link sees it, answered at the network. `state` says whether the link opens. */
type LinkStand = { state: "ok" | "goal" | "gone"; workspace: LinkWorkspace; requests: LinkRequest[] };
const LINK_API = "http://api.plan.test";
const LINK_ROOT = "/api/v1/application-profiles/public/financial-forms/tok-1";
// Public routes draw without the console's rail and top bar: the document itself scrolls.
const LINK_PAGE = `<html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/extras.css"><link rel="stylesheet" href="/link.css"></head>
<body style="margin:0"><div class="bareshell"><div id="root"></div></div><script src="/link.js"></script></body></html>`;
type Saved = { body: Body; ebitda: number; reviewed: number; toFinish: number } | null;
type Stand = { __server: { saves: unknown[]; calls: string[]; reviews: Array<{ itemIds: string[]; decision: string }>; fail: unknown; workspace: { draft: { revision: number; stored_model?: string }; body: Body } }; __saved: () => Saved; __pdf?: string; __published?: string | null; __source?: string };
/** Read or steer the stand-in API that lives in the page. */
const server = <T,>(page: Page, read: (stand: Stand) => T) => page.evaluate(`(${read.toString()})(window)`) as Promise<T>;

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.route("**/*", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: moduleCss });
    if (pathname === "/globals.css") return route.fulfill({ contentType: "text/css", body: globalCss });
    if (pathname === "/extras.css") return route.fulfill({ contentType: "text/css", body: extrasCss });
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body: PAGE });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`http://plan.test/${query}`);
  await expect(page.getByRole("heading", { name: "Operating expenses and earnings plan", level: 1 })).toBeVisible();
  return errors;
}

/** Open the link page. Every request, in this tab or one it opens, is answered here; nothing reaches a network. */
async function openLink(page: Page, stand: LinkStand) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  // A document opens in a new tab; record its address instead of opening it.
  await page.addInitScript("window.open = url => { window.__opened = String(url); return null; }");
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS", "Access-Control-Allow-Headers": "content-type" };
  await page.context().route("**/*", (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === "http://plan.test") {
      if (url.pathname === "/link.js") return route.fulfill({ contentType: "text/javascript", body: linkScript });
      if (url.pathname === "/link.css") return route.fulfill({ contentType: "text/css", body: linkCss });
      if (url.pathname === "/globals.css") return route.fulfill({ contentType: "text/css", body: globalCss });
      if (url.pathname === "/extras.css") return route.fulfill({ contentType: "text/css", body: extrasCss });
      if (url.pathname === "/link") return route.fulfill({ contentType: "text/html", body: LINK_PAGE });
      return route.fulfill({ status: 404, body: "" });
    }
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const tail = url.pathname.startsWith(LINK_ROOT) ? url.pathname.slice(LINK_ROOT.length) : url.pathname;
    const sent = request.postDataJSON() as Record<string, unknown> | null;
    stand.requests.push({ method, path: tail, origin: url.origin, signed: "authorization" in request.headers(), sent });
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    if (url.origin !== LINK_API || !url.pathname.startsWith(LINK_ROOT)) return reply(404, { detail: "Not found" });
    // The link's own checks come first on every route, as they do in the API.
    if (stand.state === "gone") return reply(404, { detail: "This link is no longer available" });
    if (stand.state === "goal") return reply(409, { detail: { code: "operating_goal_required", state: "goal_awaiting_staff", message: "Your team needs to set the annual NOI goal before this operating plan can be opened or shared." } });
    const workspace = stand.workspace;
    const stale = () => reply(409, { detail: { code: "financial_draft_conflict", current_revision: workspace.draft.revision, message: "This plan changed or needs to be refreshed. Reload before saving your changes." } });
    if (method === "GET" && tail === "/plan") return reply(200, workspace);
    if (method === "PUT" && tail === "/plan/draft") {
      if (!sent || sent.expected_revision !== workspace.draft.revision) return stale();
      stand.workspace = { ...workspace, origin: "saved", body: sent.body as LinkWorkspace["body"], draft: { ...workspace.draft, revision: workspace.draft.revision + 1, dirty: true } };
      return reply(200, stand.workspace);
    }
    if (method === "POST" && tail === "/submit") {
      if (!sent || sent.expected_revision !== workspace.draft.revision || sent.base_version_id !== workspace.draft.base_version_id) return stale();
      const number = workspace.versions.length + 1, id = `version-${number}`;
      const version = { id, version_number: number, created_at: "2026-11-14T14:02:00Z", source: "form", status: "client_submitted", pdf_url: `${LINK_ROOT}/versions/${id}/pdf` };
      stand.workspace = { ...workspace, completed: true, body: sent.body as LinkWorkspace["body"], versions: [version, ...workspace.versions], current_version_id: id, draft: { ...workspace.draft, base_version_id: id, dirty: false } };
      return reply(200, {
        completed: true, body: stand.workspace.body, permission: "edit", can_edit: true, saved_version: version,
        workspace: { family_id: workspace.family_id, revision: workspace.draft.revision, base_version_id: id, dirty: false, current_version: version, versions: stand.workspace.versions },
      });
    }
    return reply(404, { detail: "Not found" });
  });
  await page.goto("http://plan.test/link");
  return errors;
}

const steps = (page: Page) => page.getByRole("navigation", { name: "Plan steps" }).getByRole("button");
const goTo = (page: Page, index: number) => steps(page).nth(index).click();
const aside = (page: Page) => page.getByRole("complementary", { name: "Live metrics" });
const metric = (page: Page, key: string) => aside(page).locator(`[data-metric="${key}"]`);
/** "−$22,377→$182,897": a metric's before and after as one string. */
const beforeAfter = async (page: Page, key: string) => (await metric(page, key).locator('[class*="metricValue"]').innerText()).replace(/\s+/g, "");
const after = (page: Page, key: string) => metric(page, key).locator("b");
const saveState = (page: Page) => page.locator("[data-save-state]");
const toFinish = (page: Page) => aside(page).getByRole("region", { name: "To finish" });
const row = (page: Page, key: string) => page.locator(`[data-row="${key}"]`);
const read = <T,>(page: Page, expression: string) => page.evaluate(expression) as Promise<T>;
/** How far anything reaches past the right edge: of the window, or of the content area that clips it. */
const overflow = (page: Page) => read<number>(page, "Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.getElementById('scroller').scrollWidth - document.getElementById('scroller').clientWidth)");
/** Tables that scroll sideways inside their card, by the card's name. */
const scrollingTables = (page: Page) => read<string[]>(page, `[...document.querySelectorAll('[data-earnings-plan] [class*="tableWrap"]')].filter(wrap => wrap.scrollWidth > wrap.clientWidth + 1).map(wrap => wrap.closest('section')?.getAttribute('aria-label') ?? 'table')`);
const money = (value: number) => `${value < -0.5 ? "−" : ""}$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
async function settled(page: Page) { await expect(saveState(page)).toHaveAttribute("data-save-state", "saved", { timeout: 15_000 }); }

test("opens on the design's figures and lays out as the design does", async ({ page }, info) => {
  const errors = await open(page);
  const width = page.viewportSize()!.width;
  await expect(page.locator("[data-earnings-plan]")).toContainText("Harbor Auto Detail LLC");
  await expect(page.locator("[data-earnings-plan]")).toContainText("Staff view");
  await expect(page.getByRole("button", { name: "Complete required items · 8" })).toBeVisible();

  // The six metrics, before → after, the same as the File page.
  for (const [key, text] of [["ebitda", "−$22,377→$182,897"], ["noi", "−$30,777→$174,497"], ["dscr", "−0.03x→1.03x"], ["free_cash_flow", "−$799,977→$5,297"], ["operating_margin", "−2.5%→11.6%"], ["debt_service", "$777,600→$177,600"]] as const) {
    expect(await beforeAfter(page, key)).toBe(text);
  }
  await expect(metric(page, "ebitda")).toContainText("+$205,274");
  await expect(aside(page)).toContainText("Covers debt");
  await expect(aside(page)).toContainText("Needs $39,103 more EBITDA");
  await expect(aside(page)).toContainText("81%");
  await expect(aside(page)).toContainText("Still to find");
  await expect(aside(page)).toContainText("$40,503");
  await expect(toFinish(page).getByRole("button")).toHaveCount(6);
  await expect(toFinish(page)).toContainText("Show all 8");

  // The four steps with their summaries and what is left in each.
  await expect(steps(page)).toHaveCount(4);
  await expect(steps(page).nth(0)).toContainText("IRS 2025 · NOI −$30,777");
  await expect(steps(page).nth(1)).toContainText("3 revenue streams · 14 costs");
  await expect(steps(page).nth(2)).toContainText("11 changes · +$205,274");
  await expect(steps(page).nth(3)).toContainText("DSCR 1.03x · goal 1.25x");
  expect(await steps(page).evaluateAll((buttons) => buttons.map((button) => button.querySelector("[aria-label$='to finish']")?.textContent ?? ""))).toEqual(["3", "2", "2", "1"]);

  // Step 1: the source beside the latest statement.
  const source = page.getByRole("region", { name: "Source amounts" });
  await expect(source.locator("tbody tr")).toHaveCount(10);
  await expect(source).toContainText("7 of 10 confirmed");
  await expect(source.locator('[data-group="cogs"]')).toContainText("$601,886");
  await expect(source.locator('[data-group="cogs"]')).toContainText("$588,400");
  await expect(source.locator('[data-group="cogs"]')).toContainText("−$13,486");
  await expect(page.getByRole("region", { name: "Loan terms on file" })).toContainText("−0.03x → −0.13x");
  await expect(page.getByRole("region", { name: "Selected reporting source" })).toContainText("$215,000 / yr");

  const layout = async () => {
    const boxes = await read<{ main: { top: number; right: number }; side: { top: number; left: number }; inside: boolean }>(page, `(() => {
      const main = document.querySelector('[data-earnings-plan] [class*="main"]').getBoundingClientRect();
      const side = document.querySelector('aside[aria-label="Live metrics"]').getBoundingClientRect();
      const root = document.querySelector('[data-earnings-plan]').getBoundingClientRect();
      const spill = [...document.querySelectorAll('[data-earnings-plan] section, [data-earnings-plan] nav')].some(card => card.getBoundingClientRect().right > root.right + 1);
      return { main: { top: main.top, right: main.right }, side: { top: side.top, left: side.left }, inside: !spill };
    })()`);
    return boxes;
  };
  // Every step holds its width: nothing spills and the page never scrolls sideways.
  for (const index of [0, 1, 2, 3]) {
    await goTo(page, index);
    await expect(steps(page).nth(index)).toHaveAttribute("aria-current", "step");
    expect(await overflow(page), `step ${index + 1} overflow at ${width}px`).toBeLessThanOrEqual(0);
    const boxes = await layout();
    expect(boxes.inside, `step ${index + 1} cards inside the workspace at ${width}px`).toBe(true);
    if (width >= 1280) {
      // The live figures sit beside the step, not under it, and no table hides a column behind a sideways scroll.
      expect(Math.abs(boxes.side.top - boxes.main.top)).toBeLessThan(3);
      expect(boxes.side.left).toBeGreaterThan(boxes.main.right - 1);
      expect(await scrollingTables(page), `step ${index + 1} tables at ${width}px`).toEqual([]);
    } else {
      expect(boxes.side.top).toBeGreaterThan(boxes.main.top + 50);
    }
    await read(page, "document.body.classList.add('full')");
    await page.screenshot({ path: info.outputPath(`earnings-plan-step${index + 1}-${width}.png`), fullPage: true });
    await read(page, "document.body.classList.remove('full')");
  }
  if (width >= 1280) {
    const tops = await steps(page).evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    // Scrolled to the end of a long step, the live figures are still on screen under the top bar, with "To finish" within reach.
    await goTo(page, 2);
    await read(page, "document.getElementById('scroller').scrollTo(0, 1e6)");
    const pinned = await read<{ top: number; bottom: number; view: number; reach: boolean }>(page, `(() => {
      const side = document.querySelector('aside[aria-label="Live metrics"]'), box = side.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, view: window.innerHeight, reach: side.scrollHeight <= side.clientHeight + 1 || getComputedStyle(side).overflowY === 'auto' };
    })()`);
    expect(pinned.top).toBeGreaterThanOrEqual(51);
    expect(pinned.top).toBeLessThan(51 + 40);
    expect(pinned.bottom).toBeLessThanOrEqual(pinned.view + 1);
    expect(pinned.reach).toBe(true);
  }
  expect(await server(page, (stand) => stand.__server.calls)).toEqual(["load"]);
  expect(errors).toEqual([]);
});

test("figures follow the keyboard, and a save never replaces what is being typed", async ({ page }) => {
  const errors = await open(page);
  await goTo(page, 2);
  const price = row(page, "f:s1:f1");
  const amount = price.getByLabel("Price per unit: change amount");
  await expect(amount).toHaveValue("12");
  await expect(price).toContainText("Plan $262.00");

  // Clearing the field mid-edit leaves every figure standing: no dash, no blank.
  await amount.fill("");
  await expect(after(page, "ebitda")).toHaveText(/^−?\$[\d,]+$/);
  await expect(after(page, "dscr")).toHaveText(/^−?\d+\.\d\dx$/);
  await expect(price).toContainText("EBITDA $0 / yr");
  for (const key of ["2", "0", "."]) {
    await amount.press(key);
    await expect(after(page, "ebitda")).toHaveText(/^−?\$[\d,]+$/);
  }
  await expect(amount).toHaveValue("20.");
  await expect(price).toContainText("Plan $270.00");
  await expect(saveState(page)).toHaveText("Unsaved changes");
  // Letters and signs cannot be typed into a figure.
  await amount.press("x");
  await amount.press("-");
  await expect(amount).toHaveValue("20.");

  await settled(page);
  await expect(saveState(page)).toHaveText(/^Draft saved \d/);
  // The API stored 20; the field still shows the keystrokes, and the caret was never moved.
  await expect(amount).toHaveValue("20.");
  await expect(amount).toBeFocused();
  const saved = (await server(page, (stand) => stand.__saved()))!;
  expect(saved.body.changes.find((change) => change.id === "f:s1:1")!.value).toBe(20);
  await expect(after(page, "ebitda")).toHaveText(money(saved.ebitda));
  // One request for the whole burst of keystrokes.
  expect(await server(page, (stand) => stand.__server.saves.length)).toBe(1);

  // Words: the trailing space typed while thinking survives the API's trimmed echo.
  await toFinish(page).getByRole("button", { name: /Show all/ }).click();
  await toFinish(page).getByRole("button", { name: "Explain Fleet maintenance contracts · Active contracts" }).click();
  const fleet = row(page, "f:s2:f0");
  await expect(fleet).toContainText("Explanation needed");
  const why = fleet.getByLabel("Why this will work");
  await why.pressSequentially("Two contracts signed for April ", { delay: 5 });
  await expect(fleet).toContainText("Proposed");
  await expect(toFinish(page)).toContainText("7");
  await settled(page);
  await expect(why).toHaveValue("Two contracts signed for April ");
  expect(await server(page, (stand) => stand.__server.workspace.body.changes.find((change) => change.id === "f:s2:0")!.note)).toBe("Two contracts signed for April");
  expect(await server(page, (stand) => stand.__server.saves.length)).toBe(2);
  expect(errors).toEqual([]);
});

test("a plan changed somewhere else is never overwritten", async ({ page }) => {
  const errors = await open(page);
  await goTo(page, 3);
  const notes = page.getByLabel("Plan and handoff notes");
  // Another tab saved meanwhile.
  await server(page, (stand) => { stand.__server.workspace.draft.revision += 1; stand.__server.workspace.body.notes = "Saved from another tab"; });
  await notes.fill("Typed here");
  const alert = page.getByRole("alert").filter({ hasText: "changed somewhere else" });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(saveState(page)).toHaveText("Changed somewhere else");
  expect(await server(page, (stand) => stand.__server.saves.length)).toBe(0);
  // What was typed is still on screen, and nothing more can be written over the other tab's work.
  await expect(notes).toHaveValue("Typed here");
  await expect(notes).toBeDisabled();
  await expect(page.getByRole("button", { name: /Complete required items/ }).first()).toBeDisabled();
  await alert.getByRole("button", { name: "Reload plan" }).click();
  await expect(notes).toHaveValue("Saved from another tab");
  await expect(alert).toHaveCount(0);
  await notes.fill("Continuing from the saved plan");
  await settled(page);
  expect((await server(page, (stand) => stand.__saved()))!.body.notes).toBe("Continuing from the saved plan");
  expect(errors).toEqual([]);
});

test("an outage keeps what was typed and saves when the API answers again", async ({ page }) => {
  const errors = await open(page);
  await goTo(page, 3);
  await server(page, (stand) => { stand.__server.fail = { status: 503, message: "The service is restarting." }; });
  const notes = page.getByLabel("Plan and handoff notes");
  await notes.fill("Keep this");
  const alert = page.getByRole("alert").filter({ hasText: "The draft is not saved yet" });
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText("The service is restarting.");
  await expect(saveState(page)).toHaveText("Not saved");
  await expect(notes).toHaveValue("Keep this");
  await expect(notes).toBeEnabled();
  await alert.getByRole("button", { name: "Try again" }).click();
  await settled(page);
  await expect(alert).toHaveCount(0);
  expect((await server(page, (stand) => stand.__saved()))!.body.notes).toBe("Keep this");
  expect(errors).toEqual([]);
});

test("every step is open, and the save button leads through what is left to a saved version", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await open(page);
  // Any step, in any order, with items still open elsewhere.
  await goTo(page, 3);
  await expect(page.getByRole("region", { name: "Before and after" })).toBeVisible();
  await goTo(page, 1);
  await expect(page.getByRole("region", { name: "Revenue model" })).toBeVisible();

  // The save button goes to the first thing left.
  await page.getByRole("button", { name: "Complete required items · 8" }).click();
  await expect(steps(page).nth(0)).toHaveAttribute("aria-current", "step");
  const source = page.getByRole("region", { name: "Source amounts" });
  for (const key of ["utl", "rep", "oth"]) await source.locator(`[data-group="${key}"]`).getByRole("button", { name: "Confirm" }).click();
  await expect(source).toContainText("10 of 10 confirmed");
  await expect(page.getByRole("button", { name: "Complete required items · 5" })).toBeVisible();

  await page.getByRole("button", { name: "Complete required items · 5" }).click();
  await expect(steps(page).nth(1)).toHaveAttribute("aria-current", "step");
  await page.getByRole("radiogroup", { name: "Payroll taxes: any current cost?" }).getByRole("radio", { name: "Included in another line" }).click();
  await page.getByRole("radiogroup", { name: "Transportation: any current cost?" }).getByRole("radio", { name: "Not applicable" }).click();
  await expect(page.locator('[data-category="ptx"]')).toContainText("Included in another line");

  for (const [issue, key] of [["Explain Fleet maintenance contracts · Active contracts", "f:s2:f0"], ["Explain Paint correction labor · Billable hours each", "f:s3:f1"]] as const) {
    await toFinish(page).getByRole("button", { name: issue }).click();
    await expect(steps(page).nth(2)).toHaveAttribute("aria-current", "step");
    await row(page, key).getByLabel("Why this will work").fill("Contract signed; copy on file.");
  }
  await expect(page.getByRole("button", { name: "Complete required items · 1" })).toBeVisible();
  await page.getByRole("button", { name: "Complete required items · 1" }).click();
  await expect(steps(page).nth(3)).toHaveAttribute("aria-current", "step");
  await page.getByLabel("I confirm these disclosures and proposals").check();
  await expect(toFinish(page)).toContainText("Required items complete");
  expect(await steps(page).evaluateAll((buttons) => buttons.filter((button) => button.querySelector("[aria-label$='to finish']")).length)).toBe(0);

  // The draft is not in the saved PDF until a version is saved.
  const report = page.getByRole("region", { name: "Plan report" });
  await expect(report).toContainText("Draft changes are not in this PDF");
  const save = page.getByRole("button", { name: "Save version and PDF" });
  await save.click();
  const done = page.getByRole("status").filter({ hasText: "Version 2 saved" });
  await expect(done).toBeVisible({ timeout: 20_000 });
  await expect(saveState(page)).toHaveText("Saved as v2");
  expect(await server(page, (stand) => stand.__published)).toBe("version-2");
  // The draft was saved before the version, in that order.
  const calls = await server(page, (stand) => stand.__server.calls);
  expect(calls.lastIndexOf("draft")).toBeLessThan(calls.indexOf("version"));
  expect((await server(page, (stand) => stand.__saved()))!.toFinish).toBe(0);
  await expect(report).not.toContainText("Draft changes are not in");
  await expect(report.getByLabel("Report version")).toContainText("v2");
  await report.getByRole("button", { name: "Open PDF v2" }).click();
  expect(await server(page, (stand) => stand.__pdf)).toBe("version-2");
  expect(errors).toEqual([]);
});

test("the revenue model reconciles to the source, and a split cost keeps adding up", async ({ page }) => {
  const errors = await open(page);
  await goTo(page, 1);
  const model = page.getByRole("region", { name: "Revenue model" });
  await expect(model).toContainText("Reconciles to IRS revenue");
  await expect(model.locator("[data-stream]")).toHaveCount(3);
  await expect(model.locator('[data-stream="s1"]')).toContainText("$75,000 / month");
  await expect(model.locator('[data-stream="s1"]')).toContainText("Business unit: unit · 3,600 a year · $250.00 revenue per unit");

  // Fewer units than the return's revenue implies: the model says by how much, and offers a place for the rest.
  await model.getByLabel("Detail packages: Units sold").fill("280");
  await expect(model).toContainText("Differs from IRS revenue by −$60,000");
  await expect(steps(page).nth(1).locator("[aria-label$='to finish']")).toHaveText("3");
  await expect(toFinish(page).getByRole("button", { name: "Reconcile the revenue model to IRS revenue" })).toBeVisible();
  await model.getByRole("button", { name: "Put the difference in “Other revenue”" }).click();
  await expect(model.locator("[data-stream]")).toHaveCount(4);
  await expect(model.locator('[data-stream="other-revenue"]')).toContainText("$5,000 / month");
  await expect(model).toContainText("Reconciles to IRS revenue");

  // A cost that follows a stream shows its rate; a fixed one says so.
  const costs = page.getByRole("region", { name: "Cost relationships" });
  await expect(costs.locator('[data-line="c2"]')).toContainText("55.00% of revenue");
  await expect(costs.locator('[data-line="rent"]')).toContainText("Fixed amount");
  await costs.getByLabel("Rent: behaves as").selectOption("pct");
  await expect(costs.locator('[data-line="rent"]')).toContainText("% of revenue");
  await costs.getByLabel("Rent: behaves as").selectOption("fixed");

  // Split rent into two leases: the group's own line becomes what the new item leaves.
  await costs.getByLabel("Cost group to split").selectOption("rent");
  await costs.getByRole("button", { name: "Add item" }).click();
  await costs.getByLabel("Cost item name").fill("Bay 2 lease");
  await costs.getByLabel("Bay 2 lease: annual amount").fill("76805");
  await expect(costs.locator('[data-line="rent"]')).toContainText("$120,000");
  await expect(costs).toContainText("Rent · 2 items total $196,805 against $196,805 on the source");
  await settled(page);
  expect(errors).toEqual([]);
});

test("a change is added, shows its own effect, and can be removed and restored", async ({ page }) => {
  const errors = await open(page);
  await goTo(page, 2);
  const before = await after(page, "ebitda").innerText();
  const utilities = row(page, "l:utl");
  await expect(utilities).toContainText("Current $14,300 / yr");
  await utilities.getByRole("button", { name: "Change" }).click();
  // A new cost change opens for its figures and its reason, as a 0% decrease that does nothing yet.
  await expect(utilities.getByLabel("Why this will work")).toBeVisible();
  await expect(utilities.getByRole("radio", { name: "Decrease −" })).toBeChecked();
  await expect(after(page, "ebitda")).toHaveText(before);
  await utilities.getByLabel("Utilities: change amount").fill("10");
  await expect(utilities).toContainText("Plan $12,870 / yr");
  await expect(utilities).toContainText("EBITDA +$1,430 / yr");
  await expect(utilities).toContainText("Moves Utilities −$1,430");
  await expect(utilities).toContainText("Explanation needed");
  await expect(steps(page).nth(2)).toContainText("12 changes");
  await expect(after(page, "ebitda")).not.toHaveText(before);

  // Switched off, it stays listed and stops counting.
  await utilities.getByLabel("Include").uncheck();
  await expect(after(page, "ebitda")).toHaveText(before);
  await utilities.getByLabel("Include").check();
  await utilities.getByRole("button", { name: "Remove" }).click();
  await expect(utilities.getByRole("button", { name: "Change" })).toBeVisible();
  await expect(after(page, "ebitda")).toHaveText(before);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(utilities).toContainText("EBITDA +$1,430 / yr");

  // A growth activity and a new cost, each with its own controls.
  await page.getByRole("button", { name: "Add growth activity" }).click();
  await expect(page.getByRole("region", { name: "Growth activities" }).getByLabel("Activity name")).toHaveCount(2);
  await page.getByRole("button", { name: "Add new activity" }).click();
  await expect(page.getByRole("region", { name: "New activities" }).getByLabel("Activity name")).toHaveCount(2);
  // Released cash: assigning more than there is warns and blocks nothing.
  const cash = page.getByRole("region", { name: "Released cash and reinvestment" });
  await expect(cash).toContainText("$35,800 / mo stays as cash");
  await cash.getByLabel("Operating reserve: monthly amount").fill("60000");
  await expect(cash).toContainText("Over-allocated by $14,200 / mo");
  await settled(page);
  expect(errors).toEqual([]);
});

test("staff approve a change, and editing its figure returns it to proposed", async ({ page }) => {
  const errors = await open(page);
  await goTo(page, 3);
  const review = page.getByRole("region", { name: "Staff review and reconciliation" });
  await expect(review.locator("tbody tr")).toHaveCount(11);
  await expect(review.locator('[data-review="l:rent"]')).toContainText("Approved");
  const approve = review.getByRole("button", { name: "Approve selected" });
  await review.getByLabel("Select Salaries").check();
  await expect(approve).toBeDisabled();
  await review.getByLabel("Review reason").fill("Offer letter for the part-time role is on file.");
  await expect(approve).toBeDisabled();
  await review.getByLabel("Relation to earnings baseline").selectOption("incremental_to_baseline");
  await review.getByLabel("Reconciliation to source and period").fill("Salaries on the 2025 return include the full-time role.");
  await approve.click();
  await expect(review.locator('[data-review="l:sal"]')).toContainText("Approved", { timeout: 15_000 });
  await expect(review).toContainText("Approved 1 change. Reviewed projection updated.");
  expect(await server(page, (stand) => stand.__server.reviews.map((entry) => [entry.itemIds, entry.decision]))).toEqual([[["l:sal"], "approved"]]);

  // The reviewed projection now counts it: $52,164 plus the $30,194 salary change.
  await aside(page).getByRole("radio", { name: "Reviewed" }).click();
  await expect(after(page, "ebitda")).toHaveText("$82,358");
  await expect(aside(page)).toContainText("reviewed");

  // Editing an approved figure is a new proposal.
  await goTo(page, 2);
  const salaries = row(page, "l:sal");
  await expect(salaries).toContainText("Reviewed");
  await salaries.getByLabel("Salaries: change amount").fill("25000");
  await expect(salaries).toContainText("Proposed");
  await expect(after(page, "ebitda")).toHaveText("$52,164");
  // Its words can change without losing a review.
  const rent = row(page, "l:rent");
  await rent.getByRole("button", { name: "Details" }).click();
  await rent.getByLabel("Owner").fill("Dana");
  await expect(rent).toContainText("Reviewed");
  await settled(page);
  expect(errors).toEqual([]);
});

test("staff set the goal and open the source; the business sees neither control", async ({ page }) => {
  const errors = await open(page);
  const card = page.getByRole("region", { name: "Selected reporting source" });
  await card.getByRole("button", { name: "View return" }).click();
  expect(await server(page, (stand) => stand.__source)).toBe("file-return");
  await card.getByRole("button", { name: "Edit goal" }).click();
  await card.getByLabel("Annual NOI goal").fill("180000");
  await card.getByRole("button", { name: "Save goal" }).click();
  await expect(card).toContainText("$180,000 / yr");
  await expect(aside(page)).toContainText("97%");
  // Unticking the terms measures the plan against today's payments.
  await page.getByRole("region", { name: "Loan terms on file" }).getByLabel("Apply to plan").uncheck();
  await expect(after(page, "dscr")).toHaveText("0.24x");
  await expect(after(page, "debt_service")).toHaveText("$777,600");
  expect(errors).toEqual([]);

  await page.goto("http://plan.test/?client");
  await expect(page.locator("[data-earnings-plan]")).toContainText("Client view");
  await expect(page.getByRole("button", { name: "Edit goal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View return" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request client plan" })).toHaveCount(0);
  await goTo(page, 3);
  await expect(page.getByRole("region", { name: "Staff review and reconciliation" })).toHaveCount(0);
  await expect(page.getByText("Underwriting reviews proposed changes before they can enter a reviewed projection.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a file with no earnings source says so instead of printing zeros", async ({ page }) => {
  const errors = await open(page, "?empty");
  await expect(page.getByRole("heading", { name: "This file has no earnings source yet" })).toBeVisible();
  await expect(steps(page).nth(0)).toContainText("No earnings source yet");
  expect(await beforeAfter(page, "ebitda")).toBe("—→—");
  await expect(toFinish(page).getByRole("button")).toHaveCount(2);
  await expect(saveState(page)).toHaveText("Nothing saved yet");
  for (const index of [1, 2, 3]) {
    await goTo(page, index);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  }
  // The first edit creates the plan.
  await page.getByLabel("Plan and handoff notes").fill("Waiting on the 2025 return.");
  await settled(page);
  expect(await server(page, (stand) => stand.__server.workspace.draft.revision)).toBe(1);
  expect(errors).toEqual([]);
});

test("a plan carried over from the earlier editor lists what to re-enter, and a changed source asks to be updated", async ({ page }) => {
  const errors = await open(page, "?carried");
  await expect(page.getByRole("status").filter({ hasText: "brought over from the earlier plan editor" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "1 item from the earlier plan could not be carried over" })).toBeVisible();
  await goTo(page, 2);
  const waiting = page.getByRole("region", { name: "Items from the earlier plan to re-enter" });
  await expect(waiting).toContainText("Second cut to the same lease");
  await waiting.getByLabel("Handled").check();
  await settled(page);
  expect(await server(page, (stand) => stand.__server.workspace.draft.stored_model)).toBe("operating-plan-v2");
  await expect(page.getByRole("status").filter({ hasText: "could not be carried over" })).toHaveCount(0);
  expect(errors).toEqual([]);

  await page.goto("http://plan.test/?changed");
  const source = page.getByRole("region", { name: "Source amounts" });
  await expect(source).toContainText("0 of 10 confirmed");
  await expect(source.locator('[data-group="cogs"]').getByRole("button", { name: "Confirm" })).toBeDisabled();
  await source.getByRole("button", { name: "Update to current figures" }).click();
  await expect(source.locator('[data-group="cogs"]').getByRole("button", { name: "Confirm" })).toBeEnabled({ timeout: 15_000 });
  await settled(page);
  expect(await server(page, (stand) => stand.__server.calls.filter((call) => call === "resync").length)).toBe(1);
  expect(errors).toEqual([]);
});

test("a view-only link shows the plan and lets nothing be changed", async ({ page }) => {
  const errors = await open(page, "?client&viewonly");
  await expect(page.locator("[data-earnings-plan]")).toContainText("View only");
  await expect(page.getByRole("button", { name: /Complete required items|Submit plan/ })).toHaveCount(0);
  const source = page.getByRole("region", { name: "Source amounts" });
  await expect(source.locator('[data-group="utl"]').getByRole("button", { name: "Confirm" })).toBeDisabled();
  await goTo(page, 2);
  await expect(row(page, "f:s1:f1").getByLabel("Price per unit: change amount")).toBeDisabled();
  // Reading is not blocked: details still open.
  await row(page, "l:rent").getByRole("button", { name: "Details" }).click();
  await expect(row(page, "l:rent").getByLabel("Why this will work")).toHaveValue("Lease amendment on bay 2 signed in October 2026.");
  await expect(after(page, "ebitda")).toHaveText("$182,897");
  expect(await server(page, (stand) => stand.__server.calls)).toEqual(["load"]);
  expect(errors).toEqual([]);
});

test("a client link opens the plan without a sign-in, keeps what is typed and sends it for review", async ({ page }, info) => {
  test.setTimeout(120_000);
  const stand: LinkStand = { state: "ok", workspace: linkWorkspace(), requests: [] };
  const errors = await openLink(page, stand);
  await expect(page.getByRole("heading", { name: "Operating expenses and earnings plan", level: 1 })).toBeVisible();
  await expect(page.locator(".fp-mark")).toHaveText("Qualified Commercial");
  const plan = page.locator("[data-earnings-plan]");
  await expect(plan).toHaveAttribute("data-earnings-plan", "client");
  await expect(plan).toContainText("Client view");
  expect(await beforeAfter(page, "ebitda")).toBe("−$22,377→$182,897");
  // Staff controls are not on this page.
  await expect(page.getByRole("button", { name: /Edit goal|View return|Request client plan/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`earnings-plan-link-${page.viewportSize()!.width}.png`), fullPage: true });
  // The page scrolls as a document and nothing reaches past its right edge on any step.
  for (const index of [0, 1, 2, 3]) {
    await goTo(page, index);
    expect(await read<number>(page, "document.documentElement.scrollWidth - document.documentElement.clientWidth")).toBeLessThanOrEqual(0);
  }

  // What is typed is kept through the link's own route, against the revision the page was given.
  await expect(page.getByRole("button", { name: "Complete required items · 1" })).toBeVisible();
  await page.getByLabel("Plan and handoff notes").fill("Sent from the link");
  await settled(page);
  const drafts = stand.requests.filter((request) => request.method === "PUT");
  expect(drafts.map((request) => [request.origin, request.path, request.sent?.expected_revision])).toEqual([[LINK_API, "/plan/draft", 7]]);
  expect((drafts[0].sent!.body as Body).notes).toBe("Sent from the link");

  await page.getByLabel("I confirm these disclosures and proposals").check();
  await page.getByRole("button", { name: "Submit plan for review" }).click();
  const thanks = page.getByRole("status").filter({ hasText: "Thank you. Version 2 was sent to your team for review." });
  await expect(thanks).toBeVisible({ timeout: 20_000 });
  const submit = stand.requests.find((request) => request.method === "POST")!;
  expect([submit.path, submit.sent!.owners, submit.sent!.expected_revision, submit.sent!.base_version_id]).toEqual(["/submit", [], 9, "22222222-2222-4222-8222-222222222222"]);
  expect(String(submit.sent!.idempotency_key).length).toBeGreaterThanOrEqual(8);
  expect((submit.sent!.body as LinkWorkspace["body"]).attestation).toBe(true);
  // Nothing went anywhere but the link's routes, and nothing carried a sign-in.
  expect(stand.requests.filter((request) => request.signed || request.origin !== LINK_API)).toEqual([]);
  // The saved version's PDF is opened from the API's own address for this link.
  await thanks.getByRole("button", { name: "Open PDF" }).click();
  expect(await read<string>(page, "window.__opened")).toBe(`${LINK_API}${LINK_ROOT}/versions/version-2/pdf`);
  expect(errors).toEqual([]);
});

test("a link that cannot open its plan says why, and opens once it can", async ({ page }) => {
  const stand: LinkStand = { state: "goal", workspace: linkWorkspace(), requests: [] };
  const errors = await openLink(page, stand);
  await expect(page.getByRole("heading", { name: "Your team is setting the annual NOI goal" })).toBeVisible();
  stand.state = "ok";
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { name: "Operating expenses and earnings plan", level: 1 })).toBeVisible();
  expect(await beforeAfter(page, "ebitda")).toBe("−$22,377→$182,897");

  stand.state = "gone";
  await page.reload();
  await expect(page.getByRole("heading", { name: "This link is no longer available" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  expect(errors).toEqual([]);
});
