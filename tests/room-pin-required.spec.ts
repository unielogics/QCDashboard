import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Actual public intake pages, room page, PIN components and signed-in PFS page.
// Only transport, auth and unrelated embedded workspaces are fictional.
let script: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-required-pin-"));
  const mocks: Record<string, string> = {
    "next/navigation": "const params=new URLSearchParams(location.search);export const useParams=()=>({token:'fictional-room'});export const useSearchParams=()=>params;export const usePathname=()=>location.pathname;export const useRouter=()=>({replace:()=>{}});",
    "@/lib/api": "export const apiBase=location.origin;export class ApiError extends Error{};export const api=(...args)=>window.fixtureApi(...args);",
    "@/hooks/useApi": "export const useAuthedApi=()=>window.fixtureApi;export const useCurrentUser=()=>({data:{role:'client',ui_locale:'en'}});",
    "@clerk/nextjs": "export const useAuth=()=>({getToken:async()=>'fictional-token'});",
    "@/lib/businessProfile": "export const DESCRIPTION_MAX=1200;export const emptyBusinessProfile=()=>({});export const newBusinessProfileProblem=()=>null;export const newBusinessProfileBody=()=>({});",
    "@/components/property/GoogleAddressInput": "export const AddressInput=()=>null;export const formatAddressParts=()=>'';",
    "@/components/ds": "export const Btn=({children,onClick,disabled})=><button onClick={onClick} disabled={disabled}>{children}</button>;export const Panel=({children,title})=><section><h1>{title}</h1>{children}</section>;export const StatusLine=({children})=><div>{children}</div>;export const PageHeader=()=>null;export const Field=({children,label})=><label>{label}{children}</label>;export const Input=props=><input {...props}/>;",
    "@/components/application/Pfs413Form": "export const Pfs413Form=({value,onChange})=>{window.formMounted=true;return <div>Fictional financial statement editor<label>Existing draft owner<input value={value.owner_name||''} onChange={event=>onChange({...value,owner_name:event.target.value})}/></label></div>};",
  };
  const keep = new Set(["@/components/room/RoomPinFields", "@/components/room/RoomPinSetup", "@/components/QCMark", "@/components/design-system/Icon", "@/components/intake/OnboardingConsent", "@/components/intake/LanguagePickerScreen", "@/components/intake/IntelligenceCharts", "@/components/design-system/cssVars", "@/components/intake/chatActionTargets"]);
  const exports: Record<string, string[]> = {
    "@/components/InlineImages": ["InlineImageStrip"],
    "@/components/application/LockedEvidenceStatus": ["LockedEvidenceBadge"],
    "@/components/intake/SignRequestedDocument": ["SignRequestedDocument"],
    "@/components/intake/ProductionSigningGate": ["ProductionSigningGate"],
    "@/components/intake/DraftFinancialFormModal": ["PfsFormModal", "DebtScheduleFormModal"],
    "@/components/application/CapitalReadinessPanel": ["CapitalReadinessSnapshotView"],
    "@/components/intake/IntakeChatActions": ["IntakeChatActions"],
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from'react';import{createRoot}from'react-dom/client';import Room from'@/app/buckets/request/[token]/page';import Dealer from'@/app/dealer-ai-underwriter/page';import RealEstate from'@/app/funding-review/page';import Mca from'@/app/mca-refinance-intake/page';import Pfs from'@/app/client/financial-forms/page';
    window.requests=[];window.childrenMounted=[];window.chosen=new URLSearchParams(location.search).get('configured')==='1';window.failPin=false;window.formMounted=false;window.requirePinOnSubmit=false;
    const minimal={room_kind:new URLSearchParams(location.search).get('kind')||'application',bucket:{name:'Fictional client file'},recipient_name:'Fictional client',requires_passcode:true,allow_notes:true,passcode_needs_setup:true,requested_documents:[],files:[]};
    const state={business_name:'Fictional client file',owners:[],verification:{ownership_complete:true,ownership_total:100,owner_contact_complete:true,business_banking_complete:true,bank_connection_count:1,bank_statement_months:6,owner_credit_complete:true,required_credit_owner_count:0,completed_credit_owner_count:0},precall:null,capabilities:['application']};
    window.fixtureApi=async(path,init={})=>{const response=await fetch(path.startsWith('/api/')?path:'/api/v1'+path,init);const data=await response.json();if(!response.ok){const error=new Error(typeof data.detail==='string'?data.detail:data.detail?.message||'Fictional request failed');error.body=data;throw error}return data};
    window.fetch=async(url,init={})=>{const pathname=new URL(url,location.origin).pathname;const method=init.method||'GET';const body=init.body?JSON.parse(init.body):null;window.requests.push({path:pathname,method,body});let status=200,data={};
      if(pathname.endsWith('/passcode')){if(window.failPin){window.failPin=false;status=503;data={detail:'Fictional retryable PIN save failure'}}else{window.chosen=true;data={ok:true}}}
      else if(pathname.endsWith('/secure-room')){if(method==='POST'){window.chosen=true;window.requirePinOnSubmit=false}data={room_pin_setup_required:!window.chosen,room_url:'/buckets/request/fictional-room'}}
      else if(pathname.endsWith('/session')){status=401;data={detail:'Fictional first visit'}}
      else if(pathname.endsWith('/financial-statement')){if(method==='PUT'&&body?.submit&&window.requirePinOnSubmit){window.chosen=false;status=409;data={detail:{code:'room_pin_setup_required',message:'Set your replacement room PIN to continue'}}}else data={schema:{},body:{owner_name:'Existing saved draft'},statement_id:'statement-a',status:'draft'}}
      else if(pathname==='/api/v1/buckets/client/intakes')data=[{id:'intake-a',business_name:'Fictional client file'}];
      else if(pathname.endsWith('/access')||pathname.endsWith('/status'))data={...minimal,passcode_needs_setup:!window.chosen};
      else if(pathname.endsWith('/state'))data=state;
      else if(pathname.endsWith('/features'))data={precall:null};
      else if(pathname.includes('/buckets/request/'))data=minimal;
      else if(pathname.endsWith('/start')){status=422;data={detail:'Fictional start request reached the server'}}
      else if(pathname.endsWith('/sms-disclosure')){status=503;data={detail:'No optional text disclosures in fixture'}}
      return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    };
    const route=location.pathname;const Component=route.includes('buckets/request')?Room:route.includes('financial-forms')?Pfs:route.includes('funding-review')?RealEstate:route.includes('mca-refinance')?Mca:Dealer;createRoot(document.getElementById('root')).render(<Component/>);
  ` }, bundle: true, outfile: path.join(directory, "fixture.js"), format: "iife", jsx: "automatic", platform: "browser", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, plugins: [{ name: "fictional-services", setup(build: { onResolve: (options: unknown, callback: (args: {path: string}) => unknown) => void; onLoad: (options: unknown, callback: (args: {path: string}) => unknown) => void }) {
    build.onResolve({ filter: /.*/ }, ({ path: name }) => {
      if (name.endsWith(".css")) { mocks[name] = "export default new Proxy({},{get:(_,key)=>String(key)});"; return { path: name, namespace: "fictional" }; }
      if (mocks[name]) return { path: name, namespace: "fictional" };
      if (name.startsWith("@/components/") && !keep.has(name)) {
        mocks[name] = (exports[name] || [name.split("/").at(-1)!]).map(symbol => `export const ${symbol}=()=>{window.childrenMounted.push('${symbol}');return null};`).join("");
        return { path: name, namespace: "fictional" };
      }
      if (name.startsWith("@/")) { const location = path.join(root, "src", name.slice(2)); return { path: [location, location + ".ts", location + ".tsx", path.join(location,"index.ts")].find(existsSync) ?? location }; }
    });
    build.onLoad({ filter: /.*/, namespace: "fictional" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx", resolveDir: root }));
  } }] });
  script = await readFile(path.join(directory, "fixture.js"));
});

test.beforeEach(async ({ page }) => {
  page.on("pageerror", error => console.log("Fictional PIN browser error:", error.message));
  await page.route("https://required-pin.test/**", route => route.fulfill({ contentType: route.request().url().endsWith("fixture.js") ? "application/javascript" : "text/html", body: route.request().url().endsWith("fixture.js") ? script : "<html><body><div id='root'></div><script src='/fixture.js'></script></body></html>" }));
});

for (const kind of ["basic", "dealer", "application"]) test(`${kind} room cannot skip PIN setup or mount other forms before successful save`, async ({ page }) => {
  await page.goto(`https://required-pin.test/buckets/request/fictional-room?kind=${kind}`);
  await page.getByLabel("Room PIN", { exact: true }).fill("482913");
  await page.getByRole("button", { name: "Open application room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create your 6-digit PIN" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Application room sections" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as {childrenMounted: string[]}).childrenMounted)).toEqual([]);
  const pin = page.getByLabel("Create a 6-digit room PIN", { exact: true }), confirm = page.getByLabel("Confirm room PIN", { exact: true });
  await expect(pin).toHaveAttribute("type", "password");
  await pin.fill("123456"); await confirm.fill("123456");
  await expect(page.getByRole("button", { name: "Save PIN and open my room" })).toBeDisabled();
  await pin.fill("638274"); await confirm.fill("638275");
  await expect(page.getByRole("button", { name: "Save PIN and open my room" })).toBeDisabled();
  await confirm.fill("638274"); await page.evaluate(() => { (window as unknown as {failPin: boolean}).failPin = true; });
  await page.getByRole("button", { name: "Save PIN and open my room" }).click();
  await expect(page.getByRole("alert")).toContainText("retryable PIN save failure");
  await expect(page.getByRole("navigation", { name: "Application room sections" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save PIN and open my room" }).click();
  await expect(page.getByRole("navigation", { name: "Application room sections" })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify([localStorage,sessionStorage,location.href]))).not.toContain("638274");
});

for (const pathname of ["dealer-ai-underwriter", "equipment-financing-intake", "funding-review", "mca-refinance-intake"]) test(`${pathname} requires a confirmed PIN when starting a new file`, async ({ page }) => {
  await page.goto(`https://required-pin.test/${pathname}?locale=en`);
  const pin = page.getByLabel("Create a 6-digit room PIN", { exact: true }), confirmation = page.getByLabel("Confirm room PIN", { exact: true });
  await expect(pin).toBeVisible(); await expect(confirmation).toBeVisible();
  await expect(pin).toHaveAttribute("required", ""); await expect(pin).toHaveAttribute("type", "password");
  await expect(confirmation).toHaveAttribute("autocomplete", "new-password");
  await pin.fill("638274"); await confirmation.fill("638275");
  await expect(page.getByText("The two room PIN entries do not match.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify([localStorage,sessionStorage,location.href]))).not.toContain("638274");
});

for (const pathname of ["dealer-ai-underwriter", "funding-review", "mca-refinance-intake"]) test(`${pathname} sends the chosen PIN atomically with creation and keeps answers on retry`, async ({ page }) => {
  await page.goto(`https://required-pin.test/${pathname}?locale=en`);
  await page.getByLabel("Full name", { exact: false }).fill("Fictional owner");
  await page.getByLabel("Email", { exact: false }).first().fill("owner@example.test");
  await page.getByLabel("Mobile number", { exact: false }).fill("+13055550123");
  await page.getByLabel("Business website", { exact: false }).fill("https://business.example.test");
  await page.getByLabel("What does your business do?", { exact: false }).fill("Fictional operating business for a transport-only test.");
  await page.getByRole("checkbox").first().check();
  if (pathname === "mca-refinance-intake") {
    await page.getByLabel("Number of active MCAs", { exact: false }).fill("2");
    await page.getByLabel("Years in business", { exact: false }).fill("3");
  }
  const submit = page.getByRole("button", { name: pathname === "mca-refinance-intake" ? "Start — 3 items, 10 minutes" : "Start my funding review ->", exact: true });
  const starts = () => page.evaluate(() => (window as unknown as {requests:Array<{path:string;method:string;body?:{secure_room_pin?:string}} >}).requests.filter(row=>row.method==='POST'&&row.path.endsWith('/start')&&!row.path.includes('/login/')));
  await submit.click(); expect(await starts()).toHaveLength(0);
  await page.getByLabel("Create a 6-digit room PIN", { exact: true }).fill("638274");
  await page.getByLabel("Confirm room PIN", { exact: true }).fill("638275");
  await submit.click(); expect(await starts()).toHaveLength(0);
  await page.getByLabel("Confirm room PIN", { exact: true }).fill("638274");
  await submit.click();
  await expect.poll(async () => (await starts()).length).toBe(1);
  expect((await starts())[0].body?.secure_room_pin).toBe("638274");
  await expect(page.getByLabel("Full name", { exact: false })).toHaveValue("Fictional owner");
  await expect(page.getByLabel("Create a 6-digit room PIN", { exact: true })).toHaveValue("638274");
  expect(await page.evaluate(() => JSON.stringify([localStorage,sessionStorage,location.href]))).not.toContain("638274");
});

test("signed-in PFS waits for PIN setup before loading or autosaving its existing draft", async ({ page }) => {
  await page.goto("https://required-pin.test/client/financial-forms?intake=intake-a");
  await expect(page.getByRole("heading", { name: "Save your room PIN to continue" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {requests:Array<{path:string}>}).requests.some(row=>row.path.endsWith('/financial-statement')))).toBe(false);
  await page.getByLabel("Create a 6-digit room PIN", { exact: true }).fill("638274"); await page.getByLabel("Confirm room PIN", { exact: true }).fill("638274");
  await page.getByRole("button", { name: "Save PIN and continue", exact: true }).click();
  await expect(page.getByText("Fictional financial statement editor")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {requests:Array<{path:string;method:string}>}).requests.filter(row=>row.path.endsWith('/secure-room')&&row.method==='POST').length)).toBe(1);
});

test("a mid-edit PIN rotation opens setup and preserves unsaved PFS answers", async ({ page }) => {
  await page.goto("https://required-pin.test/client/financial-forms?intake=intake-a&configured=1");
  await expect(page.getByLabel("Existing draft owner")).toHaveValue("Existing saved draft");
  await page.getByLabel("Existing draft owner").fill("Unsaved corrected owner");
  await page.evaluate(() => { (window as unknown as {requirePinOnSubmit:boolean}).requirePinOnSubmit=true; });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save your room PIN to continue" })).toBeVisible();
  await page.getByLabel("Create a 6-digit room PIN", { exact: true }).fill("638274");
  await page.getByLabel("Confirm room PIN", { exact: true }).fill("638274");
  await page.getByRole("button", { name: "Save PIN and continue", exact: true }).click();
  await expect(page.getByLabel("Existing draft owner")).toHaveValue("Unsaved corrected owner");
  await expect(page.getByText("Set your replacement room PIN to continue", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as {requests:Array<{path:string;method:string}>}).requests.filter(row=>row.path.endsWith('/financial-statement')&&row.method==='GET').length)).toBe(1);
});
