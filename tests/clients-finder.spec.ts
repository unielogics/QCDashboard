import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Finding a client on the Clients page, in a real browser: the real page with
// the app's own stylesheets, inside a stand-in for the app shell, fed a
// made-up client book. Every hook is a stand-in, so no application records
// are read or changed.
//
// The address picks the fixture: ?role=loan_exec|broker, ?collapsed (the
// narrow rail), ?dark, ?failed (the list request fails), ?loading, ?none.
let script: Buffer;
let moduleCss: Buffer;
let globalCss: Buffer;
let extrasCss: Buffer;

const FIXTURES = String.raw`
const flags=new URLSearchParams(location.search);
const client=(id,name,extra={})=>({id,user_id:null,broker_id:null,broker_name:null,name,email:name.split(' ')[0].toLowerCase()+'@example.com',phone:null,city:null,since:null,tier:'standard',fico:null,avatar_color:null,funded_total:0,funded_count:0,stage:'lead',...extra});
const LABEL={real_estate:'Real estate',main_street:'Main Street',dealer:'Dealer',mca:'MCA'};
const file=(id,clientId,business,vertical,extra={})=>({id:'file-'+id,source_kind:'intake',source_id:String(id),label:business,subtitle:null,client_id:clientId,client_name:null,business_name:business,vertical,vertical_label:LABEL[vertical],origin:'ai_intake',origin_label:'AI intake',stage:'collecting',amount:100000,health:'On track',health_tone:'ok',coverage:'',...extra});
const access=(clientId,products,state)=>({subject_kind:'client',subject_id:clientId,client_id:clientId,user_id:null,client_name:'',businesses:[],email:null,phone:null,origin:'intake',login_state:state,account_types:products,account_status:null,file_count:1,last_active_at:null,status:'active'});
const authorization=(clientId,extra)=>({client_id:clientId,client_name:'',client_email:null,authorized:false,authorization_status:null,signed_at:null,completed_at:null,card_status:null,card_brand:null,card_last4:null,card_exp_month:null,card_exp_year:null,...extra});
const more=['Avery','Blake','Casey','Devon','Emery','Finley','Gray','Harper','Indigo','Jules','Kai','Logan','Morgan','Noel','Oakley','Parker','Quinn','Reese','Sage','Tatum','Uma','Vesper','Wren','Xen','Yael','Zion','Arden','Briar','Cleo','Dara'];
const clients=[
  client('c-dana','Dana Ruiz',{email:'dana@harborautodetail.example',phone:'+17025550101',city:'Las Vegas',broker_id:'agent-1',broker_name:'Sam Okafor',fico:742,stage:'processing'}),
  client('c-priyanka','Priyanka Venkataraman',{phone:'(702) 555-0117',city:'Las Vegas'}),
  client('c-marcus','Marcus Hale',{email:'marcus@haleholdings.example',city:'Reno',broker_id:'agent-2',broker_name:'Jordan Vale',fico:701,stage:'verified'}),
  client('c-omar','Omar Haddad',{phone:'+17755550144'}),
  client('c-ines','Inés Peña',{email:'ines@penatrucking.example',city:'Henderson'}),
  client('c-lena','Lena Park',{email:null,phone:'702-555-0199',city:'Henderson'}),
  ...more.map((first,index)=>client('c-more-'+index,first+' Sample',{city:'Elko'})),
];
const files=[
  file(1,'c-dana','Harbor Auto Detail LLC','main_street',{amount:250000,principal:'Dana Ruiz'}),
  file(2,'c-dana','Harbor Auto Detail LLC','mca',{amount:80000}),
  file(3,'c-priyanka','Northside Bakery & Catering Company of Greater Las Vegas','main_street',{amount:525000}),
  file(4,'c-marcus','Hale Holdings LLC','real_estate',{amount:1000000,principal:'Theo Marsh'}),
  file(5,'c-omar','Sunrise Equipment Rental','dealer',{amount:450000,phone:'(775) 555-0188'}),
  file(6,'c-ines','Peña Trucking','dealer',{amount:318800}),
  file(7,'c-ines','Desert Line Logistics','dealer',{amount:100000}),
  ...more.slice(0,8).map((first,index)=>file(20+index,'c-more-'+index,first+' Sample Works','main_street',{amount:40000+index*1000})),
];
window.__fx={
  me:{id:'user-1',role:flags.get('role')||'super_admin',name:'Franco',ui_locale:'en'},
  clients:flags.has('none')?[]:clients,
  failed:flags.has('failed'),
  loading:flags.has('loading'),
  files,
  access:[access('c-dana',['funding'],'active'),access('c-marcus',['funding','audit'],'invited'),access('c-ines',['audit'],'active'),access('c-priyanka',[],'no_login'),access('c-omar',[],'no_login')],
  auth:[authorization('c-dana',{authorized:true,authorization_status:'active',signed_at:'2026-01-05T00:00:00Z',completed_at:'2026-01-05T00:00:00Z',card_status:'active',card_brand:'Visa',card_last4:'4242'}),authorization('c-marcus',{signed_at:'2026-01-06T00:00:00Z'})],
  brokers:[{id:'agent-1',display_name:'Sam Okafor'},{id:'agent-2',display_name:'Jordan Vale'}],
};`;

test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const vitestRequire = createRequire(projectRequire.resolve("vitest/package.json"));
  const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-clients-finder-"));
  const hooksSource = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const hookNames = [...hooksSource.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map((match) => match[1]);
  // Stand-ins that answer from the fixture, and re-render when it changes.
  const standIns: Record<string, string> = {
    useCurrentUser: "()=>({data:window.__fx.me,isLoading:false})",
    useDevUser: "()=>'fixture'",
    useClients: "()=>{useVersion();const fx=window.__fx;return {data:fx.failed||fx.loading?undefined:fx.clients,isLoading:fx.loading,isError:fx.failed,refetch:async()=>{fx.failed=false;bump()}}}",
    useLoans: "()=>({data:[]})",
    useUnifiedOperatorFiles: "()=>({data:{items:window.__fx.files}})",
    useClientPaymentAuthorizationSummaries: "(options)=>({data:options?.enabled===false?undefined:window.__fx.auth})",
    useClientAccessDirectory: "(filters,options)=>({data:options?.enabled===false?undefined:{items:window.__fx.access,total:window.__fx.access.length,page:1,page_size:200,sources:[]}})",
    useBrokers: "()=>({data:window.__fx.brokers,isLoading:false})",
    useUpdateClient: "()=>({isPending:false,mutateAsync:async()=>({})})",
  };
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import {useSyncExternalStore} from 'react';
      let version=0;const listeners=new Set();const bump=()=>{version+=1;listeners.forEach(fn=>fn())};
      const useVersion=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>version);
      ${hookNames.map((name) => `export const ${name}=${standIns[name] ?? "()=>({})"};`).join("\n")}`,
    // The two dialogs the page can open are not what is being checked here.
    "@/app/pipeline/components/AgentLeadModal": "export function AgentLeadModal({open}){return open?<div role='dialog' aria-label='New client'>New client</div>:null}",
    "@/components/MultiLoanReassignModal": "export function MultiLoanReassignModal(){return null}",
    "next/link": "export default function Link({href,children,prefetch,...props}){return <a href={href} {...props}>{children}</a>}",
  };
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';
      ${FIXTURES}
      import ClientsPage from'@/app/clients/page';
      createRoot(document.getElementById('root')).render(<ClientsPage/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    // Never the default API address: on the build box that is the production API.
    define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: "http://api.clients-finder.test" }), "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent",
    plugins: [{ name: "clients-finder-fixtures", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "clients-finder-fixture" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "clients-finder-fixture" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  script = await readFile(path.join(directory, "app.js"));
  moduleCss = await readFile(path.join(directory, "app.css")).catch(() => Buffer.from(""));
  execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "src/app/globals.css", "-o", path.join(directory, "globals.css")], { cwd: root, stdio: "ignore" });
  globalCss = await readFile(path.join(directory, "globals.css"));
  extrasCss = await readFile(path.join(root, "src/app/app-extras.css"));
});

// The app shell, as AppShell builds it: the rail, the top bar, and one
// scrolling content column. Its classes are the app's own, so the sticky page
// head behaves here as it does there.
const page_ = (search: string) => {
  const flags = new URLSearchParams(search);
  // A doctype, as the app has: without one the browser lays the table out in
  // its old-pages mode and the cells stop taking the theme's text colour.
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/extras.css"><link rel="stylesheet" href="/app.css"></head>
<body><div class="app${flags.has("collapsed") ? " app--collapsed" : ""}" id="shell"${flags.has("dark") ? ' data-dark="1"' : ""}><div class="side" id="rail"></div>
<div style="display:flex;flex-direction:column;min-width:0;min-height:0"><div class="top" id="topbar" style="height:51px;box-sizing:border-box"></div>
<div style="display:flex;min-width:0;min-height:0;flex:1"><main class="content content--wide" id="scroller" style="flex:1;min-width:0;overflow-y:auto;overflow-x:hidden"><div id="root"></div></main></div></div></div>
<style>body{margin:0}@media(max-width:900px){#shell{grid-template-columns:minmax(0,1fr)}#rail{display:none}}</style>
<script src="/app.js"></script></body></html>`;
};

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (url.pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: moduleCss });
    if (url.pathname === "/globals.css") return route.fulfill({ contentType: "text/css", body: globalCss });
    if (url.pathname === "/extras.css") return route.fulfill({ contentType: "text/css", body: extrasCss });
    if (url.pathname === "/clients") return route.fulfill({ contentType: "text/html", body: page_(url.search) });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`http://clients-finder.test/clients${query}`);
  return errors;
}

const TOTAL = 36;
const bar = (page: Page) => page.getByRole("search", { name: "Find a client" });
const box = (page: Page) => bar(page).getByRole("textbox", { name: "Search clients" });
const pick = (page: Page, name: string) => bar(page).getByRole("combobox", { name, exact: true });
const clear = (page: Page) => bar(page).getByRole("button", { name: "Clear", exact: true });
const names = (page: Page) => page.locator("table.tbl tbody tr td:first-child:not([colspan]) button.linky");
const count = (page: Page) => page.locator(".ckhead .ckrow .sub");
const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`^${name} \\d+$`) });

/** Nothing spills: the page does not scroll sideways and nothing in the page head leaves the content column. */
async function expectNoSpill(page: Page) {
  const spill = await page.evaluate(() => {
    const main = document.getElementById("scroller")!;
    const frame = main.getBoundingClientRect();
    const offenders: string[] = [];
    for (const element of main.querySelectorAll<HTMLElement>(".ckhead, .ckhead *")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // The stage tabs scroll inside their own strip by design.
      if (element.closest(".cktabs") && !element.classList.contains("cktabs")) continue;
      if (rect.right > frame.right + 1 || rect.left < frame.left - 1) offenders.push(`${element.tagName}.${element.className} ${Math.round(rect.left)}–${Math.round(rect.right)}`);
    }
    return { sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, offenders: offenders.slice(0, 5) };
  });
  expect(spill.sideways, "the page scrolls sideways").toBeLessThanOrEqual(0);
  expect(spill.offenders, "controls leave the content column").toEqual([]);
}

const shot = (page: Page, name: string, project: string) =>
  process.env.QC_SHOT_DIR ? page.screenshot({ path: path.join(process.env.QC_SHOT_DIR, `${name}-${project}.png`) }) : Promise.resolve();

test("the page opens with a search box and its filters in one bar under the title", async ({ page }, info) => {
  const errors = await open(page);
  await expect(bar(page)).toBeVisible();
  await expect(box(page)).toHaveAttribute("placeholder", "Search name, email, phone, business or city");
  for (const name of ["Vertical", "Desk", "Access", "Authorizations"]) await expect(pick(page, name)).toBeVisible();
  await expect(clear(page)).toBeDisabled();
  await expect(count(page)).toHaveText(`· ${TOTAL} of ${TOTAL}`);
  await expect(names(page)).toHaveCount(TOTAL);

  // The bar sits between the title row and the stage tabs, inside the page head.
  const order = await page.evaluate(() => [...document.querySelector(".ckhead")!.children].map((child) => child.className));
  expect(order).toEqual(["ckrow", "client-finder", "cktabs"]);
  // The head is as wide as the screen it is on, so New client is on it too:
  // on a phone the stage tabs used to stretch it to twice the screen.
  await expect(page.getByRole("button", { name: "New client" })).toBeInViewport({ ratio: 1 });

  // A search box reads as one: an icon, and room to type a name and a business.
  const search = await bar(page).locator(".client-finder__search").boundingBox();
  expect(search!.width).toBeGreaterThanOrEqual(240);
  await expect(bar(page).locator(".client-finder__search svg")).toHaveCount(1);
  const whole = (await bar(page).boundingBox())!;
  const filters = (await bar(page).locator(".client-finder__filters").boundingBox())!;
  const oneLine = Math.abs(filters.y + filters.height / 2 - (search!.y + search!.height / 2)) <= 2;
  // With room, everything is on one line and the search box takes what is left.
  if ((page.viewportSize()?.width ?? 0) >= 1600) expect(oneLine).toBe(true);
  if (oneLine) expect(search!.width).toBeGreaterThanOrEqual(300);
  // Without it, the filters drop to a second line together and the search box keeps the first.
  else expect(search!.width).toBeGreaterThanOrEqual(whole.width - 1);
  // A long business name is cut short, not wrapped: every row keeps the same height.
  const heights = await page.locator("table.tbl tbody tr").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  await expectNoSpill(page);
  await shot(page, "open", info.project.name);
  expect(errors).toEqual([]);
});

test("typing narrows the list, and every number on the page follows", async ({ page }, info) => {
  const errors = await open(page);
  await box(page).fill("ruiz");
  await expect(names(page)).toHaveText(["Dana Ruiz"]);
  await expect(count(page)).toHaveText(`· 1 of ${TOTAL}`);
  // The stage tabs count the search, so they say where the matches are.
  await expect(tab(page, "All")).toHaveText("All 1");
  await expect(tab(page, "Processing")).toHaveText("Processing 1");
  await expect(tab(page, "Leads")).toHaveText("Leads 0");
  // So does every choice in the filters.
  await expect(pick(page, "Vertical").locator("option")).toHaveText(["All", "Real estate (0)", "Main Street (1)", "Dealer (0)", "MCA (1)"]);
  await expect(pick(page, "Desk").locator("option")).toHaveText(["All", "Unassigned (0)", "Jordan Vale (0)", "Sam Okafor (1)"]);
  await expect(clear(page)).toBeEnabled();
  await shot(page, "searched", info.project.name);

  // Escape empties the box; the list comes back whole.
  await box(page).press("Escape");
  await expect(box(page)).toHaveValue("");
  await expect(names(page)).toHaveCount(TOTAL);
  await expect(clear(page)).toBeDisabled();

  // The cross in the box does the same and leaves the cursor in it.
  await box(page).fill("lena");
  await expect(names(page)).toHaveText(["Lena Park"]);
  await bar(page).getByRole("button", { name: "Clear search" }).click();
  await expect(names(page)).toHaveCount(TOTAL);
  await expect(box(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("a client is found by business, phone, the other name on a file, or an unaccented spelling", async ({ page }) => {
  const errors = await open(page);
  const who = (name: string) => page.locator("table.tbl tbody tr", { has: page.getByRole("button", { name, exact: true }) }).locator(".client-finder__who");

  await box(page).fill("harbor");
  await expect(names(page)).toHaveText(["Dana Ruiz"]);
  // The row says which business matched: two files, one business, named once.
  await expect(who("Dana Ruiz")).toHaveText("Harbor Auto Detail LLC · dana@harborautodetail.example");

  await box(page).fill("bakery vegas");
  await expect(names(page)).toHaveText(["Priyanka Venkataraman"]);

  for (const typed of ["(702) 555-0101", "702.555.0101", "+1 702 555 0101", "0101"]) {
    await box(page).fill(typed);
    await expect(names(page), typed).toHaveText(["Dana Ruiz"]);
  }
  // A number that is only on the client's file, not on the client record.
  await box(page).fill("775 555 0188");
  await expect(names(page)).toHaveText(["Omar Haddad"]);

  await box(page).fill("pena");
  await expect(names(page)).toHaveText(["Inés Peña"]);
  await expect(who("Inés Peña")).toHaveText("Peña Trucking +1 more · ines@penatrucking.example");
  // Hovering gives all of it, including what a narrow column cuts short.
  await expect(who("Inés Peña")).toHaveAttribute("title", "Peña Trucking · Desert Line Logistics · ines@penatrucking.example");

  // The person a file names, when it is not the client.
  await box(page).fill("marsh");
  await expect(names(page)).toHaveText(["Marcus Hale"]);

  // A client with no email and no file still shows where they are.
  await box(page).fill("lena");
  await expect(who("Lena Park")).toHaveText("Henderson");
  expect(errors).toEqual([]);
});

test("the filters narrow the list, show what is picked, and work with the search", async ({ page }, info) => {
  const errors = await open(page);
  await expect(pick(page, "Desk").locator("option")).toHaveText(["All", `Unassigned (${TOTAL - 2})`, "Jordan Vale (1)", "Sam Okafor (1)"]);
  await expect(pick(page, "Access").locator("option")).toHaveText(["All", "Has access (3)", "Funding (2)", "Audit (2)", `No access (${TOTAL - 3})`]);
  await expect(pick(page, "Authorizations").locator("option")).toHaveText(["All", "Ready (1)", "In progress (1)", `Not started (${TOTAL - 2})`]);

  await pick(page, "Desk").selectOption("unassigned");
  await expect(count(page)).toHaveText(`· ${TOTAL - 2} of ${TOTAL}`);
  await expect(names(page).filter({ hasText: /^(Dana Ruiz|Marcus Hale)$/ })).toHaveCount(0);
  // A filter that is on is marked, and its name stays beside the choice.
  await expect(bar(page).locator(".client-finder__pick.on")).toHaveText(/^Desk/);
  await expect(bar(page).locator(".client-finder__pick.on")).toHaveCount(1);
  await expect(clear(page)).toBeEnabled();

  await pick(page, "Access").selectOption("has");
  await expect(names(page)).toHaveText(["Inés Peña"]);
  await expect(tab(page, "All")).toHaveText("All 1");
  // The other filters' numbers follow the two that are on.
  await expect(pick(page, "Vertical").locator("option")).toHaveText(["All", "Real estate (0)", "Main Street (0)", "Dealer (1)", "MCA (0)"]);
  await shot(page, "filtered", info.project.name);

  await clear(page).click();
  await expect(names(page)).toHaveCount(TOTAL);
  await expect(pick(page, "Desk")).toHaveValue("all");
  await expect(pick(page, "Access")).toHaveValue("all");
  await expect(bar(page).locator(".client-finder__pick.on")).toHaveCount(0);
  await expect(box(page)).toBeFocused();

  await pick(page, "Authorizations").selectOption("partial");
  await expect(names(page)).toHaveText(["Marcus Hale"]);
  await pick(page, "Authorizations").selectOption("ready");
  await expect(names(page)).toHaveText(["Dana Ruiz"]);
  await pick(page, "Authorizations").selectOption("all");

  // A client with files in two verticals is under both.
  await pick(page, "Vertical").selectOption("mca");
  await expect(names(page)).toHaveText(["Dana Ruiz"]);
  await pick(page, "Vertical").selectOption("dealer");
  await expect(names(page)).toHaveText(["Omar Haddad", "Inés Peña"]);

  // A stage tab is one more filter, and the search works inside all of them.
  await box(page).fill("example");
  await tab(page, "Leads").click();
  await expect(names(page)).toHaveText(["Omar Haddad", "Inés Peña"]);
  await box(page).fill("trucking");
  await expect(names(page)).toHaveText(["Inés Peña"]);
  expect(errors).toEqual([]);
});

test("finding nobody says so and offers the way back", async ({ page }, info) => {
  const errors = await open(page);
  await box(page).fill("zzz");
  const empty = page.locator("table.tbl tbody tr td[colspan]");
  await expect(empty).toContainText("No clients match “zzz”.");
  await expect(count(page)).toHaveText(`· 0 of ${TOTAL}`);
  await shot(page, "nobody", info.project.name);
  await empty.getByRole("button", { name: "Clear the search" }).click();
  await expect(names(page)).toHaveCount(TOTAL);
  await expect(box(page)).toBeFocused();

  await pick(page, "Desk").selectOption("agent:agent-1");
  await box(page).fill("peña");
  await expect(empty).toContainText("No clients match this search and these filters.");
  await empty.getByRole("button", { name: "Clear the search and filters" }).click();
  await expect(names(page)).toHaveCount(TOTAL);
  await expect(pick(page, "Desk")).toHaveValue("all");
  expect(errors).toEqual([]);
});

test("the address keeps the search and filters, so coming back returns to the same list", async ({ page }) => {
  const errors = await open(page, "?collapsed");
  await box(page).fill("sample works");
  await pick(page, "Desk").selectOption("unassigned");
  await tab(page, "Leads").click();
  await expect(names(page)).toHaveCount(8);
  await expect(page).toHaveURL(/[?&]q=sample\+works(&|$)/);
  await expect(page).toHaveURL(/[?&]desk=unassigned(&|$)/);
  await expect(page).toHaveURL(/[?&]stage=lead(&|$)/);
  // What was already in the address is still there.
  await expect(page).toHaveURL(/[?&]collapsed/);

  // Opening a client is a new page; Back loads this one again from its address.
  await page.reload();
  await expect(box(page)).toHaveValue("sample works");
  await expect(pick(page, "Desk")).toHaveValue("unassigned");
  await expect(tab(page, "Leads")).toHaveAttribute("aria-selected", "true");
  await expect(names(page)).toHaveCount(8);
  await expect(count(page)).toHaveText(`· 8 of ${TOTAL}`);

  await clear(page).click();
  await expect(page).not.toHaveURL(/[?&](q|desk|stage)=/);
  await expect(page).toHaveURL(/[?&]collapsed/);
  await expect(names(page)).toHaveCount(TOTAL);

  // An address someone made up is read for what it can mean and no more.
  await open(page, "?vertical=crypto&stage=won&access=root&q=hale");
  await expect(names(page)).toHaveText(["Marcus Hale"]);
  await expect(pick(page, "Vertical")).toHaveValue("all");
  await expect(tab(page, "All")).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("each role gets the filters it can use, and an address cannot switch on one it cannot see", async ({ page }) => {
  const errors = await open(page, "?role=loan_exec");
  await expect(pick(page, "Vertical")).toBeVisible();
  await expect(pick(page, "Desk")).toBeVisible();
  await expect(pick(page, "Authorizations")).toBeVisible();
  await expect(pick(page, "Access")).toHaveCount(0);

  await open(page, "?role=broker&desk=unassigned&access=has&auth=ready");
  await expect(box(page)).toBeVisible();
  await expect(pick(page, "Vertical")).toBeVisible();
  for (const name of ["Desk", "Access", "Authorizations"]) await expect(pick(page, name)).toHaveCount(0);
  await expect(names(page)).toHaveCount(TOTAL);
  await expect(clear(page)).toBeDisabled();
  await box(page).fill("harbor");
  await expect(names(page)).toHaveText(["Dana Ruiz"]);
  expect(errors).toEqual([]);
});

test("a list that could not be loaded says so, and an empty book says that", async ({ page }) => {
  await open(page, "?failed");
  const empty = page.locator("table.tbl tbody tr td[colspan]");
  await expect(empty.getByRole("alert")).toContainText("The client list could not be loaded.");
  await expect(empty).not.toContainText("No clients yet");
  await empty.getByRole("button", { name: "Try again" }).click();
  await expect(names(page)).toHaveCount(TOTAL);

  await open(page, "?loading");
  await expect(empty).toHaveText("Loading clients…");

  await open(page, "?none");
  await expect(empty).toContainText("No clients yet.");
  await expect(empty.getByRole("button", { name: "Start a deal →" })).toBeVisible();
  await expect(clear(page)).toBeDisabled();
});

test("the Access and Authorizations columns sort", async ({ page }) => {
  const errors = await open(page);
  // Both headings are sort buttons like the rest; Access used to be plain text.
  await page.getByRole("button", { name: "Sort by Access" }).click();
  await page.getByRole("button", { name: "Sort by Access" }).click();
  await expect(names(page).first()).toHaveText("Inés Peña");
  await page.getByRole("button", { name: "Sort by Authorizations" }).click();
  await expect(names(page).nth(0)).toHaveText("Dana Ruiz");
  await expect(names(page).nth(1)).toHaveText("Marcus Hale");
  expect(errors).toEqual([]);
});

test("the bar stays in reach down the list and fits a narrow rail, a dark theme and a phone", async ({ page }, info) => {
  const errors = await open(page, "?collapsed");
  await expectNoSpill(page);
  const before = (await bar(page).boundingBox())!;
  await page.locator("#scroller").evaluate((element) => element.scrollTo(0, 900));
  await expect.poll(async () => page.locator("#scroller").evaluate((element) => element.scrollTop)).toBeGreaterThan(400);
  // The page head is pinned under the top bar: the search box has not left the screen.
  const after = (await bar(page).boundingBox())!;
  expect(after.y).toBeGreaterThanOrEqual(40);
  expect(after.y).toBeLessThanOrEqual(before.y);
  await expect(box(page)).toBeInViewport();
  await box(page).fill("vale");
  await expect(names(page)).toHaveCount(0);
  await box(page).fill("okafor");
  // An agent's name is not a client's: the Desk filter is how to see an agent's clients.
  await expect(names(page)).toHaveCount(0);
  await box(page).fill("");
  await shot(page, "scrolled", info.project.name);

  await open(page, "?dark");
  await expectNoSpill(page);
  await pick(page, "Desk").selectOption("unassigned");
  // A marked filter stays readable on the dark surface.
  const contrast = await bar(page).locator(".client-finder__pick.on select").evaluate((element) => {
    const parse = (colour: string) => { const [red, green, blue, alpha = 1] = colour.match(/[\d.]+/g)!.map(Number); return { red, green, blue, alpha }; };
    const channel = (value: number) => { const unit = value / 255; return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4; };
    const luminance = (colour: { red: number; green: number; blue: number }) => 0.2126 * channel(colour.red) + 0.7152 * channel(colour.green) + 0.0722 * channel(colour.blue);
    // The mark is a see-through tint: what is painted is the tint over whatever is behind it.
    const layers: Array<ReturnType<typeof parse>> = [];
    for (let node: Element | null = element.parentElement; node; node = node.parentElement) {
      const layer = parse(getComputedStyle(node).backgroundColor);
      if (layer.alpha > 0) layers.push(layer);
      if (layer.alpha >= 1) break;
    }
    const ground = layers.reverse().reduce((under, over) => ({
      red: over.red * over.alpha + under.red * (1 - over.alpha),
      green: over.green * over.alpha + under.green * (1 - over.alpha),
      blue: over.blue * over.alpha + under.blue * (1 - over.alpha),
      alpha: 1,
    }), { red: 255, green: 255, blue: 255, alpha: 1 });
    const text = luminance(parse(getComputedStyle(element).color));
    const behind = luminance(ground);
    return (Math.max(text, behind) + 0.05) / (Math.min(text, behind) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await shot(page, "dark", info.project.name);
  expect(errors).toEqual([]);
});
