import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MARKETPLACE_PROFILE as PROFILE, marketplaceBudget, marketplaceCockpit, marketplacePlan, marketplaceProduct } from "./fixtures/marketplacePanel";

const ORIGIN = "https://marketplace-owner.test";
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


async function fixture(page: Page, action: string, readonly = false) {
  const requests: Array<{ method: string; path: string }> = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${ORIGIN}/**`, route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (!pathname.startsWith("/api/v1")) return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    const path = pathname.replace("/api/v1", ""); requests.push({ method: request.method(), path });
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path.endsWith("/financial-cockpit")) return json(marketplaceCockpit());
    if (path.endsWith("/deal-budget") || path.endsWith("/deal-budget/preview")) return json(marketplaceBudget());
    if (path.endsWith("/client-terms")) return json({ profile_id: PROFILE, version: 0, status: "not_started", conditions: [], loan_type_options: [], calculation: {} });
    if (path.endsWith("/use-of-funds")) return json({ profile_id: PROFILE, revision: 1, currency: "USD", requested_amount: 175000, can_edit: true, items: [], complete: false, allocated_amount: 0, remaining_amount: 175000, warnings: [], requires_exact_allocation: false });
    if (path.endsWith("/sources/lookup")) return json({ listing: null });
    if (path.endsWith("/sources/suggest-terms")) return json({ profile_id: PROFILE, income_annual: 180000, existing_debt_service_monthly: 2000, products: [marketplaceProduct()] });
    if (path.endsWith("/marketplace-publication")) return json({ profile_id: PROFILE, listing: null, can_manage: !readonly });
    if (path.endsWith("/collateral")) return json({ profile_id: PROFILE, enabled: false, revision: 1, can_edit: !readonly, properties: [], assets: [], property_options: [], source_file_options: [] });
    return json({});
  });
  await page.goto(`${ORIGIN}/?financial_action=${encodeURIComponent(action)}${readonly ? "&readonly" : ""}`);
  await expect(page.getByRole("heading", { name: "Financial cockpit", exact: true })).toBeVisible();
  return { requests, errors };
}

function expectNoSaves(f: Awaited<ReturnType<typeof fixture>>) {
  expect(f.requests.filter(row => row.method !== "GET" && !row.path.endsWith("/preview"))).toEqual([]);
  expect(f.errors).toEqual([]);
}

test("coverage action opens the actual plan and stays closed after dismissal and a fresh read", async ({ page }) => {
  const f = await fixture(page, "coverage");
  const drawer = page.getByRole("dialog", { name: "Advanced financial review — Example Studio LLC", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("tab", { name: "Coverage plan", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByLabel("New loan amount", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => (window as unknown as { refreshCockpit: () => Promise<void> }).refreshCockpit());
  await expect(drawer).not.toBeVisible();
  expectNoSaves(f);
});

test("terms action opens the actual saved client-terms editor without saving or issuing", async ({ page }) => {
  const f = await fixture(page, "terms");
  await expect(page.getByRole("dialog", { name: /full loan terms|financing terms|client terms/i })).toBeVisible();
  expectNoSaves(f);
});

test("use-of-funds action opens the coverage setup and actual expanded itemized budget", async ({ page }) => {
  const f = await fixture(page, "use-of-funds");
  const drawer = page.getByRole("dialog", { name: "Advanced financial review — Example Studio LLC", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "How will the requested funds be used?", exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Hide budget", exact: true })).toHaveAttribute("aria-expanded", "true");
  expectNoSaves(f);
});

for (const action of ["unknown", "coverage&save=true"]) test(`unknown action ${action} does not open or mutate an owner`, async ({ page }) => {
  const f = await fixture(page, action);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expectNoSaves(f);
});

test("a financial action preserves the existing read-only permissions", async ({ page }) => {
  const f = await fixture(page, "coverage", true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expectNoSaves(f);
});

test.describe("FilePage communication navigation", () => {
  let navigationScript: Buffer, navigationCss: Buffer;
  const navigationOrigin = "https://marketplace-navigation.test";
  const intake = "99100000-0000-0000-0000-000000000001";
  const thread = "synthetic-email-thread-2";

  test.beforeAll(async () => {
    const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
    const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
    const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketplace-navigation-"));
    // Real FilePage owns query mutation and the remount key. Only its child boundary
    // exposes those actual callbacks; the original tests above retain real editors.
    const mocks: Record<string, string> = {
      "next/navigation": `import{useMemo,useSyncExternalStore}from'react';const listeners=new Set();const update=(method,url,options)=>{history[method==='push'?'pushState':'replaceState'](null,'',url);window.routeEvents.push({method,url,scroll:options?.scroll});listeners.forEach(fn=>fn())};const router={push:(url,options)=>update('push',url,options),replace:(url,options)=>update('replace',url,options)};export const useRouter=()=>router;export const useParams=()=>({id:'${intake}'});export function useSearchParams(){const search=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>location.search,()=>location.search);return useMemo(()=>new URLSearchParams(search),[search])}`,
      "next/link": "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}",
      "@/hooks/useApi": "export const useCurrentUser=()=>({data:{role:'super_admin'},isLoading:false});",
      "@/components/file/useLeadFile": `export const useLeadFile=()=>({detail:{intake:{id:'${intake}',business_name:'Example navigation file',full_name:'Synthetic Client'}},loading:false,reload:async()=>{}});`,
      "@/components/operator/UnifiedOperator": "export const BucketIntakeLinkDrawer=()=>null;",
      "@/components/file/LeadDetailPanel": `import{useEffect}from'react';export function LeadDetailPanel(props){useEffect(()=>{window.ownerProps.push(props.initialFinancialAction??null)},[props.initialFinancialAction]);return <section aria-label='FilePage child contract'><output data-testid='owner-action'>{props.initialFinancialAction??'none'}</output><output data-testid='communication-channel'>{props.initialCommunicationChannel}</output><output data-testid='email-thread'>{props.initialEmailThreadId??'none'}</output><button onClick={()=>props.onCommunicationNavigate('email')}>Email channel</button><button onClick={()=>props.onCommunicationNavigate('client')}>Client channel</button><button onClick={()=>props.onCommunicationNavigate('underwriter')}>Underwriter channel</button><button onClick={()=>props.onEmailThreadNavigate('${thread}')}>Open email thread</button></section>}`,
    };
    await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import FilePage from'@/app/files/[id]/page';import'@/app/globals.css';import'@/app/app-extras.css';window.routeEvents=[];window.ownerProps=[];createRoot(document.getElementById('root')).render(<main style={{padding:16}}><FilePage/></main>);` }, outfile: path.join(directory, "navigation.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "file-route-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture-navigation" } : undefined); build.onLoad({ filter: /.*/, namespace: "fixture-navigation" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
    [navigationScript, navigationCss] = await Promise.all([readFile(path.join(directory, "navigation.js")), readFile(path.join(directory, "navigation.css"))]);
  });

  for (const action of ["coverage", "terms", "use-of-funds"] as const) test(`${action} owner action is consumed before channel and thread navigation`, async ({ page }, info) => {
    const errors: string[] = [], unexpectedRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== navigationOrigin || url.pathname.startsWith("/api/")) { unexpectedRequests.push(route.request().url()); return route.fulfill({ status: 500, body: "Unexpected synthetic navigation request" }); }
      return route.fulfill(url.pathname === "/navigation.js" ? { contentType: "text/javascript", body: navigationScript } : url.pathname === "/navigation.css" ? { contentType: "text/css", body: navigationCss } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/navigation.css"></head><body><div id="root"></div><script src="/navigation.js"></script></body></html>' });
    });
    await page.goto(`${navigationOrigin}/files/${intake}?section=overview&financial_action=${action}&channel=email&thread=synthetic-old-thread&notes=1`);
    await expect(page.getByTestId("owner-action")).toHaveText(action);
    const assertRoute = async (channel: string, expectedThread: string | null, method: "push" | "replace") => {
      await expect.poll(() => new URL(page.url()).searchParams.get("channel")).toBe(channel);
      const url = new URL(page.url()); expect(url.pathname).toBe(`/files/${intake}`); expect(url.searchParams.get("section")).toBe("communications"); expect(url.searchParams.get("financial_action")).toBeNull(); expect(url.searchParams.get("thread")).toBe(expectedThread); expect(url.searchParams.get("notes")).toBe("1");
      await expect(page.getByTestId("owner-action")).toHaveText("none"); await expect(page.getByTestId("communication-channel")).toHaveText(channel);
      await expect(page.getByTestId("email-thread")).toHaveText(expectedThread && channel === "email" ? expectedThread : "none");
      const events = await page.evaluate(() => (window as unknown as { routeEvents: Array<{ method: string; scroll: boolean }>; ownerProps: Array<string | null> }).routeEvents);
      expect(events.at(-1)).toMatchObject({ method, scroll: false });
      expect(await page.evaluate(value => (window as unknown as { ownerProps: Array<string | null> }).ownerProps.filter(item => item === value).length, action)).toBe(1);
    };
    await page.getByRole("button", { name: "Email channel", exact: true }).click(); await assertRoute("email", "synthetic-old-thread", "push");
    await page.getByRole("button", { name: "Client channel", exact: true }).click(); await assertRoute("client", null, "push");
    await page.getByRole("button", { name: "Open email thread", exact: true }).click(); await assertRoute("email", thread, "replace");
    await page.getByRole("button", { name: "Underwriter channel", exact: true }).click(); await assertRoute("underwriter", null, "push");
    expect(errors).toEqual([]); expect(unexpectedRequests).toEqual([]);
    await page.screenshot({ path: path.resolve(process.cwd(), "../../artifacts/marketplace-guidance-navigation-qa", info.project.name, `${action}-communications.png`) });
  });
});
