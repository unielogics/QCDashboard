import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SheetKind } from "../src/components/sheet/types";
import { WORKSPACE_INTAKE as INTAKE, WORKSPACE_PROFILE as PROFILE, WORKSPACE_BUSINESS as BUSINESS, workspaceDetail, workspaceFinancial, workspaceForms, marketplaceBudget, marketplaceCockpit, marketplacePlan, staffOperatingEvidence, staffOperatingEvaluation } from "./fixtures/fileWorkspaceNavigation";
import { marketplaceProduct, marketplaceListing } from "./fixtures/marketplacePanel";

const ORIGIN = "https://file-workspaces.test";
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
    "@/components/file/LeadDetailPanel": `import React,{useState}from'react';import{BusinessProfileFields}from'@/components/intake/BusinessProfileFields';import{UnderwritingFlow}from'@/components/file/UnderwritingFlow';import{RequirementUseOfFundsActions}from'@/components/application/RequirementUseOfFundsActions';import{emptyUnderwritingDraft}from'@/components/file/leadFile';import{FundingPackageWorkspace}from'@/components/file/FundingPackageWorkspace';import{OperatingPlanEntry}from'@/components/file/cockpit/OperatingPlanEntry';import{marketplaceCockpit}from'./tests/fixtures/marketplacePanel';import{FinancialFormsPanel}from'@/components/application/FinancialFormsPanel';import{FinancialCockpit}from'@/components/file/cockpit/FinancialCockpit';export function LeadDetailPanel({detail,initialView,onCommunicationNavigate,onEmailThreadNavigate}){window.fixtureFileProps={initialView,onCommunicationNavigate,onEmailThreadNavigate};const[draft,setDraft]=useState({business_street:'',business_city:'',business_state:'',business_zip:'',industry:'',business_website:'',business_description:''});if(!detail)return<p>Loading synthetic file</p>;return<><h1>{detail.intake.business_name}</h1><BusinessProfileFields value={draft} onChange={patch=>setDraft(old=>({...old,...patch}))} includeWebsiteDescription={false} includeIndustry={false}/><UnderwritingFlow profileId={detail.application_profile_id} terms={null} termsLoading={false} onEditTerms={()=>{throw new Error('Expected terms new-tab link')}} underwriting={null} statusLabel='Working file' draft={emptyUnderwritingDraft()} onDraftChange={()=>{}} saving={false} error={null} onRecordAcceptance={()=>{}} onStatusChange={()=>{}} onEditFees={()=>{}} forecastEarnings={null} feeInfo={{}} offer={{termsSelection:null,merchantSelection:null,merchantStatus:null,merchantStrip:null,selectedKeys:[],onSelectedKeys:()=>{},onCompose:()=>{},receipt:null,contactSuppressed:true}} loanId={null} onCreateFundingFile={()=>{}} canUnderwrite/><FinancialFormsPanel profileId={detail.application_profile_id} intakeId={detail.intake.id}/>{window.fixtureRequirementActions?<RequirementUseOfFundsActions profileId={detail.application_profile_id} canEdit onFill={()=>{throw new Error('Expected requirement owner new-tab link')}}/>:null}{window.fixtureSimpleParent?<OperatingPlanEntry profileId={detail.application_profile_id} businessName={detail.intake.business_name} onRefresh={()=>{}} onRequested={()=>{}} canEdit/>:<FinancialCockpit profileId={detail.application_profile_id} businessName={detail.intake.business_name} canPublish canUnderwrite canRecordTerms={false} programReadiness={window.fixtureReadiness} termSheet={null} packageState={{generated:false,inSync:false,summaryVersion:null,packetVersion:null}} focus={null} onFocusHandled={()=>{}} onRecordTerms={()=>{}} onOpenEvidence={()=>{}} onOpenPackage={()=>{}}/>}<div style={{height:900}}>End of synthetic file</div>{initialView==='financials'?<FundingPackageWorkspace profileId={detail.application_profile_id} cockpit={marketplaceCockpit()} activeTab='summary' onTab={()=>{}} busy={false} generated={false} current={false} onGenerate={()=>{throw new Error('Passive package navigation must not generate PDFs')}} packageContent={<p>No synthetic package generated.</p>} marketplaceContent={null} deliveryContent={null} historyContent={null}/>:null}</>}`,
    "./ClosingStipulationsPanel": "export const ClosingStipulationsPanel=()=>null;",
    "@/components/payments/FeeAllocationEditor": "export const FeeAllocationEditor=()=>null;",
    "@/components/communications/OfferDeliveryHistory": "export const OfferDeliveryHistory=()=>null;",
    "@/components/operator/UnifiedOperator": "export const BucketIntakeLinkDrawer=()=>null;",
    "next/link": "export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}",
    "next/navigation": `import{useSyncExternalStore}from'react';const listeners=new Set(),searchCache=new Map();const snapshot=()=>location.pathname+location.search;const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};const change=(url,replace=false)=>{history[replace?'replaceState':'pushState']({},'',url);listeners.forEach(fn=>fn())};const router={push:url=>change(url),replace:url=>change(url,true),back:()=>history.back()};export const useRouter=()=>router;export const useParams=()=>{useSyncExternalStore(subscribe,snapshot);return{id:location.pathname.split('/')[2]}};export const useSearchParams=()=>{const key=useSyncExternalStore(subscribe,snapshot);if(!searchCache.has(key))searchCache.set(key,new URLSearchParams(location.search));return searchCache.get(key)};export const usePathname=()=>{useSyncExternalStore(subscribe,snapshot);return location.pathname};`,
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
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import FilePage from'@/app/files/[id]/page';import WorkspacePage from'@/app/files/[id]/workspace/page';import{OperatingPlanEntry}from'@/components/file/cockpit/OperatingPlanEntry';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});window.fixtureApi=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff-token','Content-Type':'application/json'}});const data=await response.json();if(!response.ok){const error=new Error(typeof data.detail==='string'?data.detail:data.detail?.message||'Synthetic API failure');error.status=response.status;error.body=data;throw error}return data};const Page=location.pathname.endsWith('/workspace')?WorkspacePage:FilePage;createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto',minHeight:2200}}><ConfirmationProvider>{location.pathname==='/legacy'?<OperatingPlanEntry profileId='${PROFILE}' businessName='${BUSINESS}' onRefresh={()=>{}} onRequested={()=>{}} canEdit/>:<Page/>}</ConfirmationProvider></main></QueryClientProvider>);` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: ORIGIN }) }, external: ["node:module", "node:fs", "node:fs/promises", "node:url", "node:path", "@napi-rs/canvas"], loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-file-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path === "./useApi" ? "@/hooks/useApi" : args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

async function fixture(page: Page, options: { role?: string; missingProfile?: boolean; conflict?: boolean; holdPlan?: boolean; existingListing?: boolean; simpleParent?: boolean; requirementActions?: boolean; linkedDebt?: boolean; url?: string } = {}) {
  const requests: Array<{ method: string; path: string; body: Json }> = [], errors: string[] = [];
  let record = marketplacePlan(), current = workspaceFinancial(), created = 0;
  let releasePlan = () => {}; const planGate = options.holdPlan ? new Promise<void>(resolve => { releasePlan = resolve; }) : Promise.resolve();
  page.context().on("page", child => child.on("pageerror", error => errors.push(error.message))); page.on("pageerror", error => errors.push(error.message));
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== ORIGIN) throw new Error(`Unexpected workspace traffic: ${url.origin}`);
    if (url.pathname.startsWith("/admin/marketplace/")) return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head><meta name=viewport content=width=device-width></head><body>Intercepted synthetic marketplace editor destination</body></html>" });
    if (!url.pathname.startsWith("/api/v1/")) return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.fixtureSimpleParent=${JSON.stringify(Boolean(options.simpleParent))};window.fixtureRequirementActions=${JSON.stringify(Boolean(options.requirementActions))};window.fixtureMessages=[];window.fixtureDeliveries=0;const RealChannel=window.BroadcastChannel;window.BroadcastChannel=class extends RealChannel{constructor(...args){super(...args);this.addEventListener('message',()=>window.fixtureDeliveries++)}postMessage(data){window.fixtureMessages.push(structuredClone(data));super.postMessage(data)}};window.fixtureRole=${JSON.stringify(options.role ?? "super_admin")};window.fixtureReadiness=${JSON.stringify({ profile_id: PROFILE, lending_applicable: true, selections: [], candidates: [], requirements: [], programs: [], evidence_policies: [], available_evidence_files: [], evidence_summary: {}, can_advance: false, automation: {} })};</script><script src="/app.js"></script></body></html>` });
    const p = url.pathname.slice(7), body = request.postData() ? request.postDataJSON() as Json : {}; requests.push({ method, path: p + url.search, body });
    expect(request.headers().authorization).toBe("Bearer synthetic-staff-token");
    const json = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (p.startsWith("/admin/ai-underwriter-leads/")) return json(workspaceDetail(options.missingProfile ? null : PROFILE));
    if (p === "/application-profiles/resolve") return json({ id: PROFILE, intake_id: INTAKE, vertical: "mca", program_selections: [] });
    if (p.endsWith("/financial-forms")) return json({ forms: workspaceForms, packets: [] });
    if (p.endsWith("/financial-cockpit")) return json(marketplaceCockpit(record));
    if (p.endsWith("/program-readiness")) return json({ profile_id: PROFILE, lending_applicable: true, selection_mode: "auto", selections: [], evidence_policies: [], candidates: [], programs: [], requirements: [], available_evidence_files: [], evidence_summary: {}, can_advance: false, automatic_stage_status: "not_ready", automation: {} });
    if (p.endsWith("/operating-plan/summary")) return json({ has_plan: false, expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: 0, cost_mix: [], evaluation: staffOperatingEvaluation });
    if (p.endsWith("/operating-plan/evidence")) return json(staffOperatingEvidence);
    if (p.endsWith("/operating-plan/evaluate")) return json({ evaluation: staffOperatingEvaluation });
    if (p.endsWith("/financial-workspace")) { current = workspaceFinancial((url.searchParams.get("kind") ?? "debt_schedule") as SheetKind, 4, false, options.linkedDebt); return json(current); }
    if (p.endsWith("/financial-workspace/draft")) {
      if (options.conflict) return json({ detail: { code: "financial_draft_conflict", message: "Financial draft changed; reload before saving" } }, 409);
      expect(body.expected_revision).toBe(current.draft.revision); current = { ...current, body: body.body as Json, draft: { ...current.draft, revision: current.draft.revision + 1 } }; return json(current);
    }
    if (p.endsWith("/financial-workspace/versions")) { const saved = workspaceFinancial(current.kind, current.draft.revision, true); current = { ...saved, body: current.body }; return json(current); }
    if (p.endsWith("/financial-workspace/debt-batch-imports")) return json({ items: [] });
    if (p.endsWith("/deal-budget/preview")) { const amount = Number((body.loan as Json | undefined)?.amount ?? record.new_loan_amount); return json({ ...marketplaceBudget(amount), ...body, calculation: marketplaceBudget(amount).calculation }); }
    if (p.endsWith("/deal-budget")) { const value = marketplaceBudget(record.new_loan_amount); return json({ ...value, financing_context: { ...value.financing_context, plan_updated_at: record.updated_at } }); }
    if (p.endsWith("/collateral")) return json({ profile_id: PROFILE, enabled: false, revision: 1, can_edit: true, properties: [], assets: [], property_options: [], source_file_options: [] });
    if (p.endsWith("/client-terms")) return json({ profile_id: PROFILE, version: 0, status: "not_started", conditions: [], loan_type_options: [], calculation: {} });
    if (p.endsWith("/use-of-funds")) return json({ profile_id: PROFILE, revision: 1, currency: "USD", requested_amount: 175000, can_edit: true, items: [], complete: false, allocated_amount: 0, remaining_amount: 175000, warnings: [], requires_exact_allocation: false });
    if (p.endsWith("/sources/lookup")) return json({ listing: options.existingListing || created ? { id: "synthetic-listing", ref: "CP-SYNTHETIC", status: "draft" } : null });
    if (p.endsWith("/sources/suggest-terms")) return json({ profile_id: PROFILE, income_annual: 180000, existing_debt_service_monthly: 2000, products: [marketplaceProduct(record.new_loan_amount)] });
    if (p.endsWith("/marketplace-publication")) return json({ profile_id: PROFILE, listing: null, can_manage: options.role !== "loan_exec" });
    if (p.endsWith("/listings/ai-draft")) return json({ profile_id: PROFILE, draft_id: "example-ai-listing-draft", source_fingerprint: `source-${record.updated_at}`, deal_budget_revision: 1, draft: { name: body.current_title || "Example workspace financing", summary: body.current_summary || "Synthetic financing draft", vertical: "main_street" }, field_provenance: [], missing: [], warnings: [], preserved_fields: ["name", "summary"] });
    if (p.endsWith("/listings/prefill")) return json({ profile_id: PROFILE, source_kind: "profile", name: "Example workspace financing", vertical: "main_street", summary: "Saved synthetic financing", products: [marketplaceProduct(record.new_loan_amount)], existing_listing: null });
    if (p.endsWith("/listings") && method === "POST") { created += 1; return json(marketplaceListing(record.new_loan_amount)); }
    if (p === "/capital/admin/listings/synthetic-listing") return json(marketplaceListing(record.new_loan_amount));
    if (p.endsWith("/refresh-snapshot")) return json(marketplaceListing(record.new_loan_amount));
    if (p.endsWith("/financial-plan") && method === "PUT") { await planGate; record = { ...record, ...body, updated_at: "2026-11-11T17:00:02Z" }; return json({ profile_id: PROFILE, record }); }
    if (p === `/application-profiles/${PROFILE}`) return json({ id: PROFILE, intake_id: INTAKE, vertical: "mca" });
    throw new Error(`Unexpected workspace API: ${method} ${p}`);
  });
  await page.goto(ORIGIN + (options.url ?? `/files/${INTAKE}`));
  return { requests, errors, created: () => created, releasePlan };
}
const mutations = (f: Awaited<ReturnType<typeof fixture>>) => f.requests.filter(row => row.method !== "GET" && !/\/preview|\/evaluate|\/resolve|\/ai-draft/.test(row.path));
async function popup(page: Page, linkName: string) { const ready = page.waitForEvent("popup"); await page.getByRole("link", { name: linkName, exact: true }).click(); const child = await ready; await child.waitForLoadState(); expect(await child.evaluate(() => window.opener === null)).toBe(true); return child; }

// Cases below exercise actual page/context/editor trees; only auth/services and
// the unrelated intake-detail adapter are synthetic. No replacement editor buttons.

test("actual file editor links open internal workspaces in new tabs without mutating", async ({ page }) => {
  const f = await fixture(page, { requirementActions: true, linkedDebt: true }); await expect(page.getByRole("heading", { name: BUSINESS, exact: true })).toBeVisible();
  for (const tool of ["forms", "operating-plan", "coverage", "terms", "use-of-funds", "marketplace"]) {
    const link = page.locator(`a[href^="/files/${INTAKE}/workspace?tool=${tool}"]`).first(); await expect(link).toHaveAttribute("target", "_blank"); await expect(link).toHaveAttribute("rel", /noopener/);
  }
  const link = page.getByRole("link", { name: "Open worksheet", exact: true }); const ready = page.waitForEvent("popup"); await link.click(); const child = await ready;
  await expect(child.getByRole("heading", { name: "Financial forms", exact: true })).toBeVisible(); expect(child.url()).toContain("kind=debt_schedule"); expect(child.url()).toContain("view=worksheet"); expect(await child.evaluate(() => window.opener === null)).toBe(true);
  await expect(child.getByRole("tab", { name: "Worksheet", exact: true })).toHaveAttribute("aria-selected", "true"); await expect(child).toHaveTitle(`Financial forms · ${BUSINESS}`); await expect(child.getByRole("button", { name: "Documents for Example lender: 1 linked", exact: true })).toBeVisible(); await expect(child.getByRole("button", { name: /Restore workspace size|Expand workspace/ })).toHaveCount(0); await expect(child.getByRole("link", { name: "Back to file", exact: true })).toHaveAttribute("href", `/files/${INTAKE}`);
  expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]); await child.close();
  const requirement = page.getByRole("link", { name: "Fill in use of proceeds", exact: true }); await expect(requirement).toHaveAttribute("href", `/files/${INTAKE}/workspace?tool=use-of-funds`);
  const budgetChild = await popup(page, "Fill in use of proceeds"); await expect(budgetChild.getByRole("heading", { name: "Program criteria and use of funds", exact: true })).toBeVisible(); expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]); await budgetChild.close();
});

test("a child saved version announces IDs only while the original file URL scroll and an unrelated contact draft stay intact", async ({ page }, info) => {
  const f = await fixture(page, { simpleParent: true }); await expect(page.getByText("No plan yet", { exact: true })).toBeVisible(); const title = page.getByRole("textbox", { name: /Business street address/ }); await title.fill("Unsubmitted operator street");
  const launch = page.getByRole("link", { name: "Open earnings plan", exact: true }); await launch.scrollIntoViewIfNeeded(); const original = { url: page.url(), scroll: await page.evaluate(() => scrollY), anchorTop: (await launch.boundingBox())!.y, inputTop: (await title.boundingBox())!.y };
  const child = await popup(page, "Open earnings plan"); await title.evaluate(node => (node as HTMLInputElement).focus({ preventScroll: true })); expect(await page.evaluate(() => scrollY)).toBe(original.scroll); await expect(child.getByRole("heading", { name: "Operating expenses and earnings plan", exact: true }).first()).toBeVisible(); await child.getByRole("button", { name: "Advanced tables", exact: true }).click(); await child.getByLabel("Business", { exact: true }).fill("Example edited workspace business");
  await expect.poll(() => f.requests.filter(row => row.path.endsWith("/financial-workspace/draft")).length).toBe(1);
  await child.getByRole("button", { name: "Save version", exact: true }).click(); await expect(child.getByText(/Saved v2/).first()).toBeVisible();
  await expect(page.getByText("Changes were saved in another tab.", { exact: true })).toBeVisible(); expect(page.url()).toBe(original.url); await info.attach("parent-position", { body: JSON.stringify({ before: original, after: { scroll: await page.evaluate(() => scrollY), anchorTop: (await launch.boundingBox())!.y, inputTop: (await title.boundingBox())!.y } }), contentType: "application/json" }); expect(Math.abs((await launch.boundingBox())!.y - original.anchorTop)).toBeLessThanOrEqual(1); expect(Math.abs((await title.boundingBox())!.y - original.inputTop)).toBeLessThanOrEqual(1); await expect(title).toHaveValue("Unsubmitted operator street"); await expect(title).toBeFocused();
  const messages = await child.evaluate(() => (window as unknown as { fixtureMessages: Json[] }).fixtureMessages); expect(messages.length).toBeGreaterThan(0);
  for (const event of messages) { expect(Object.keys(event).sort()).toEqual(["authScope", "eventId", "intakeId", "profileId", "tool", "type", "version"]); expect(event.intakeId).toBe(INTAKE); expect(event.profileId).toBe(PROFILE); expect(JSON.stringify(event)).not.toContain("Example edited workspace business"); }
  const bannerLink = page.getByRole("link", { name: "Refresh file in a new tab", exact: true }); await expect(bannerLink).toHaveAttribute("href", `/files/${INTAKE}`); await expect(bannerLink).toHaveAttribute("target", "_blank"); await expect(bannerLink).toHaveAttribute("rel", /noopener/);
  await child.getByRole("heading", { name: "Operating expenses and earnings plan", exact: true }).first().evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" })); await child.screenshot({ path: info.outputPath("operating-workspace.png"), fullPage: false });
  await child.getByRole("link", { name: "Back to file", exact: true }).click(); await child.waitForURL(`${ORIGIN}/files/${INTAKE}`); await expect(child.getByRole("heading", { name: BUSINESS, exact: true })).toBeVisible(); expect(f.errors).toEqual([]); await child.close();
});

for (const [tool, label, control] of [
  ["coverage", "Coverage plan", "New loan amount"], ["terms", "Loan terms", null],
  ["use-of-funds", "Program criteria and use of funds", null], ["marketplace", "Marketplace setup", null],
] as const) test(`direct ${tool} workspace renders the actual owner without passive save create or publication`, async ({ page }, info) => {
  const f = await fixture(page, { url: `/files/${INTAKE}/workspace?tool=${tool}` }); await expect(page.getByRole("heading", { name: label, exact: true }).first()).toBeVisible(); await expect(page.getByRole("link", { name: "Back to file", exact: true })).toHaveAttribute("href", `/files/${INTAKE}`);
  if (control) await expect(page.getByLabel(control, { exact: true })).toBeVisible();
  if (tool === "use-of-funds") await expect(page.getByRole("heading", { name: "How will the requested funds be used?", exact: true })).toBeVisible();
  if (tool === "marketplace") { await expect(page.getByRole("button", { name: "Save & create listing draft", exact: true })).toBeEnabled(); expect(f.created()).toBe(0); }
  await expect(page.getByRole("dialog")).toHaveCount(0); expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe("hidden");
  const before = await page.evaluate(() => scrollY); await page.mouse.move(180, 450); await page.mouse.wheel(0, 450); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((await page.viewportSize())!.width); expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]);
  if (tool === "marketplace") { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: info.outputPath("marketplace-workspace.png"), fullPage: false }); }
});

test("authorized staff resolves the intake profile and ignores forged profile query authority", async ({ page }) => {
  const f = await fixture(page, { role: "loan_exec", missingProfile: true, url: `/files/${INTAKE}/workspace?tool=operating-plan&profile_id=forged-profile` }); await expect(page.getByRole("button", { name: "Advanced tables", exact: true })).toBeVisible();
  const resolve = f.requests.filter(row => row.path === "/application-profiles/resolve"); expect(resolve).toHaveLength(1); expect(resolve[0].body).toEqual({ source_kind: "intake", source_id: INTAKE });
  expect(f.requests.filter(row => row.path.includes("/financial-workspace")).every(row => row.path.startsWith(`/application-profiles/${PROFILE}/`))).toBe(true); expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]);
});

test("non-desk role cannot render a standalone financial editor", async ({ page }) => {
  const f = await fixture(page, { role: "field_rep", url: `/files/${INTAKE}/workspace?tool=operating-plan` }); await expect(page.getByText("This workspace requires file access.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advanced tables", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Save version", exact: true })).toHaveCount(0);
  await expect.poll(() => f.requests.filter(row => /\/financial-workspace|\/financial-cockpit/.test(row.path)).length).toBe(0); expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]);
});

test("draft revision conflict retains entered values and never emits a saved-version notice", async ({ page }) => {
  const f = await fixture(page, { conflict: true, url: `/files/${INTAKE}/workspace?tool=operating-plan` }); await page.getByRole("button", { name: "Advanced tables", exact: true }).click(); await page.getByLabel("Business", { exact: true }).fill("Retained conflicted business");
  await expect(page.locator(".fw-alert").filter({ hasText: "Financial draft changed; reload before saving" })).toBeVisible(); await expect(page.getByLabel("Business", { exact: true })).toHaveValue("Retained conflicted business"); await expect(page.getByRole("button", { name: "Save version", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { fixtureMessages: unknown[] }).fixtureMessages)).toEqual([]); expect(f.requests.filter(row => row.path.endsWith("/financial-workspace/versions"))).toEqual([]); expect(f.errors).toEqual([]);
});

test("cross-tab receiver rejects wrong authority and financial payloads without replaying actions", async ({ page }) => {
  const f = await fixture(page); await expect(page.getByRole("heading", { name: BUSINESS, exact: true })).toBeVisible();
  await page.evaluate(({ intakeId, profileId }) => { const channel = new BroadcastChannel("qc-file-workspaces-v1"), base = { version: 1, type: "saved", eventId: "test-event", intakeId, profileId, authScope: "example-staff:session-1", tool: "forms" }; for (const value of [{ ...base, authScope: "other-staff:session" }, { ...base, intakeId: "other-file" }, { ...base, profileId: "other-profile" }, { ...base, body: { loan_amount: 999999 } }]) channel.postMessage(value); channel.close(); }, { intakeId: INTAKE, profileId: PROFILE });
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureDeliveries: number }).fixtureDeliveries)).toBeGreaterThanOrEqual(4); await expect(page.getByText("Changes were saved in another tab.", { exact: true })).toHaveCount(0); expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]);
});

test("non-file callers retain their existing financial workspace drawer and restore native page scrolling", async ({ page }) => {
  const f = await fixture(page, { url: "/legacy" }); await page.getByRole("button", { name: "Open earnings plan", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Financial workspace", exact: true }); await expect(dialog).toBeVisible(); await expect(dialog.getByRole("button", { name: /Restore workspace size|Expand workspace/ })).toBeVisible(); await dialog.getByRole("button", { name: "Close", exact: true }).click(); await expect(dialog).toHaveCount(0);
  await page.mouse.move(180, 450); await page.mouse.wheel(0, 400); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0); expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden"); expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]);
});

test("standalone marketplace reuses the real guarded loan save before creating a draft", async ({ page }) => {
  const f = await fixture(page, { holdPlan: true, url: `/files/${INTAKE}/workspace?tool=marketplace` }); await page.getByLabel("New loan amount", { exact: true }).fill("225000");
  const create = page.getByRole("button", { name: "Save & create listing draft", exact: true }); await expect(create).toBeEnabled(); await create.click();
  try { await expect.poll(() => f.requests.filter(row => row.method === "PUT" && row.path.endsWith("/financial-plan")).length).toBe(1); expect(f.created()).toBe(0); await expect(create).toBeDisabled(); }
  finally { f.releasePlan(); }
  await expect.poll(() => f.created()).toBe(1); const write = f.requests.find(row => row.method === "POST" && row.path.endsWith("/listings"))!; expect((write.body.products as Json[])[0].amount).toBe(225000);
  expect(f.requests.filter(row => /\/publish|\/issue|\/send/.test(row.path))).toEqual([]); expect(f.errors).toEqual([]);
});

test("coverage cross-tool debt and full-terms links open working owners while preserving its unsaved loan", async ({ page }) => {
  const f = await fixture(page, { url: `/files/${INTAKE}/workspace?tool=coverage` }); const amount = page.getByLabel("New loan amount", { exact: true }); await amount.fill("225000"); const original = page.url();
  for (const [name, tool, heading] of [["Open working debt schedule", "forms", "Financial forms"], ["Expand full loan terms", "terms", "Loan terms"]] as const) {
    const ready = page.waitForEvent("popup"); await page.getByRole("link", { name, exact: true }).click(); const child = await ready; await expect(child.getByRole("heading", { name: heading, exact: true })).toBeVisible(); expect(new URL(child.url()).searchParams.get("tool")).toBe(tool); expect(await child.evaluate(() => window.opener === null)).toBe(true); await expect(amount).toHaveValue("225000"); expect(page.url()).toBe(original); await child.close();
  }
  expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]);
});

test("marketplace cross-tool links open terms package evidence and existing listing separately", async ({ page }) => {
  const f = await fixture(page, { existingListing: true, url: `/files/${INTAKE}/workspace?tool=marketplace` }); const summary = page.getByLabel("Listing summary", { exact: true }); await summary.fill("Retained marketplace workspace wording"); const original = page.url();
  for (const [name, expected] of [["Structure loan / Coverage plan", `/files/${INTAKE}/workspace?tool=terms`], ["Package readiness", `/files/${INTAKE}?workspace=package`], ["Open the evidence room", `/files/${INTAKE}?section=evidence`], ["Documents and publish", "/admin/marketplace/synthetic-listing"]] as const) {
    const child = await popup(page, name); const url = new URL(child.url()), destination = new URL(ORIGIN + expected); expect(url.pathname).toBe(destination.pathname); expect(url.search).toBe(destination.search);
    if (name === "Package readiness") { await expect(child.getByRole("heading", { name: "Investor package & capital partners", exact: true })).toBeVisible(); await expect(child.locator("#package-readiness")).toBeInViewport(); expect(await child.evaluate(() => (window as unknown as { fixtureFileProps: { initialView: string } }).fixtureFileProps.initialView)).toBe("financials"); await child.evaluate(() => (window as unknown as { fixtureFileProps: { onCommunicationNavigate: (channel: string) => void } }).fixtureFileProps.onCommunicationNavigate("client")); await expect.poll(() => new URL(child.url()).searchParams.get("section")).toBe("communications"); expect(new URL(child.url()).searchParams.has("workspace")).toBe(false); }
    await expect(summary).toHaveValue("Retained marketplace workspace wording"); expect(page.url()).toBe(original); await child.close();
  }
  expect(mutations(f)).toEqual([]); expect(f.errors).toEqual([]);
});
