import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Bundle the actual cockpit and earnings entry. Other panels are irrelevant to
// this lifecycle regression; the editor probe exposes unsaved local React state.
// Every API/browser request is intercepted; no application records are read or changed.
let script: Buffer;
let stylesheet: Buffer;
test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const vitestRequire = createRequire(projectRequire.resolve("vitest/package.json"));
  const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-cockpit-refresh-"));
  const hooksSource = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const hookNames = [...hooksSource.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map((match) => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import {useSyncExternalStore} from 'react';
      const listeners=new Set();let state;
      export function updateQuery(patch){state={...state,...patch};listeners.forEach(fn=>fn())}
      export function initialize(data){state={data,error:null,isLoading:false,isFetching:false,refetch:async()=>{updateQuery({error:null});return state}};if(location.search.includes('initial=error'))state={...state,data:undefined,error:new Error('Initial fetch failed')}}
      const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
      ${hookNames.map((name) => name === "useFinancialCockpit" ? "export const useFinancialCockpit=()=>useSyncExternalStore(subscribe,()=>state);" : name === "useAuthedApi" ? "const call=async()=>{throw new Error('Unexpected API request')};export const useAuthedApi=()=>call;" : `export const ${name}=()=>({});`).join("\n")}`,
    "@/components/application/FinancialWorkspace": `import {useState,useEffect} from 'react';export function FinancialWorkspace(){const[text,setText]=useState('');useEffect(()=>{window.editorMounts=(window.editorMounts||0)+1;return()=>{window.editorUnmounts=(window.editorUnmounts||0)+1}},[]);return <section role="dialog" aria-label="Financial workspace probe"><label>Unsaved draft<textarea aria-label="Unsaved draft" value={text} onChange={e=>setText(e.target.value)}/></label></section>}`,
    "@/components/application/RequestFilesDialog": "export const RequestFilesDialog=()=>null;",
    // The plan card opens the saved PDF through the signed-in transport; no sign-in exists here.
    "@/components/earnings-plan/useStaffPlanTransport": "export const useStaffPlanTransport=()=>null;",
    "@/hooks/useCapitalPartners": "export const useCpSourceLookup=()=>({data:null});",
    "@/components/application/ApplicationLenderSubmissions": "export const ApplicationLenderSubmissions=()=>null;",
    "@/components/application/ApplicationProgramReadiness": "export const ApplicationProgramReadiness=()=>null;",
    "@/components/buckets/BucketFileReviewPanel": "export const BucketFileReviewPanel=()=>null;",
    "./CoverageCard": "export const CoverageCard=()=>null;",
    "./OfferPanel": "export const OfferPanel=()=>null;",
    "./FinancialMetricReviewWorkspace": "export const FinancialMetricReviewWorkspace=()=>null;",
    "./DebtScheduleControls": "export const DebtScheduleControls=()=>null;export const OPEN_DEBT_SCHEDULE_EVENT='fixture-only';",
    "@/lib/financialKpiReview": "export const metricEntries=()=>[];",
    "./CockpitCharts": "export const SERIES={one:'#345',two:'#678',context:'#abc'};export const ChartCard=()=>null;export const ColumnChart=()=>null;export const HBarList=()=>null;export const LineChart=()=>null;export const Meter=()=>null;export const Sparkline=()=>null;",
  };
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{FinancialCockpit}from'@/components/file/cockpit/FinancialCockpit';import{initialize,updateQuery}from'@/hooks/useApi';
      const summary={months:0,gaps:[],first_month:null,last_month:null};
      initialize({profile_id:'same-profile',generated_at:'2026-11-09T12:00:00Z',coverage:{files_analyzed:0,files_accepted:0,bank_months_accepted:0,bank_months_required:1,tax_years:[],has_profit_and_loss:false,debt_schedule_status:'missing',debt_rows:0},bank:{months:[],summary,accounts:[],all_months:null,all_summary:null},tax:{years:[]},profit_and_loss:null,balance_sheet:null,expenses:{lines:[]},dscr:{headline:null,no_debt:false},net_profit:{candidates:[],conclusion:null,note:null},notes:[]});
      function App(){const[profile,setProfile]=useState('same-profile');return <QueryClientProvider client={new QueryClient()}><button onClick={()=>updateQuery({error:new Error('Background failure')})}>Fail background refresh</button><button onClick={()=>setProfile('other-profile')}>Change file</button><FinancialCockpit profileId={profile} businessName={profile==='same-profile'?'Example Studio':'Other business'} canPublish={false} canRecordTerms={false} canUnderwrite={false} programReadiness={null} termSheet={null} packageState={{generated:false,inSync:false,summaryVersion:null,packetVersion:null}} focus={null} onFocusHandled={()=>{}} onRecordTerms={()=>{}} onOpenEvidence={()=>{}} onOpenPackage={()=>{}}/></QueryClientProvider>};createRoot(document.getElementById('root')).render(<App/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" },
    plugins: [{ name: "cockpit-fixtures", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "cockpit-fixture" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "cockpit-fixture" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  script = await readFile(path.join(directory, "app.js"));
  stylesheet = await readFile(path.join(directory, "app.css"));
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: stylesheet });
    if (pathname !== "/") throw new Error(`Unexpected request: ${pathname}`);
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
});

test("an open earnings editor retains its unsaved state across background failure and retry", async ({ page }) => {
  await page.goto("http://cockpit.test/");
  await page.getByRole("button", { name: "Open earnings plan", exact: true }).click();
  const draft = page.getByLabel("Unsaved draft", { exact: true });
  await draft.fill("Nineteen expenses and six unsaved earnings actions");
  await draft.evaluate((element) => { (window as unknown as { originalEditor: Element }).originalEditor = element; });
  await page.getByRole("button", { name: "Fail background refresh", exact: true }).click();
  await expect(page.getByText("Financial figures could not be refreshed.", { exact: false })).toBeVisible();
  await expect(draft).toHaveValue("Nineteen expenses and six unsaved earnings actions");
  expect(await draft.evaluate((element) => element === (window as unknown as { originalEditor: Element }).originalEditor)).toBe(true);
  expect(await page.evaluate(() => ({ mounts: (window as unknown as { editorMounts: number }).editorMounts, unmounts: (window as unknown as { editorUnmounts?: number }).editorUnmounts ?? 0 }))).toEqual({ mounts: 1, unmounts: 0 });
  await page.getByRole("button", { name: "Retry financial figures", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry financial figures", exact: true })).toHaveCount(0);
  await expect(draft).toHaveValue("Nineteen expenses and six unsaved earnings actions");
});

test("initial errors remain fatal and another profile's cached figures are never displayed", async ({ page }) => {
  await page.goto("http://cockpit.test/?initial=error");
  await expect(page.getByText("Initial fetch failed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open earnings plan", exact: true })).toHaveCount(0);
  await page.goto("http://cockpit.test/");
  await expect(page.getByRole("button", { name: "Open earnings plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change file", exact: true }).click();
  await expect(page.getByText("The financial cockpit could not be read.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open earnings plan", exact: true })).toHaveCount(0);
  await expect(page.getByText("Example Studio", { exact: false })).toHaveCount(0);
});
