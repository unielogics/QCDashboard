import { expect, test, type Download, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SAVED_TERMS_PROFILE as PROFILE, savedClientTerms, savedDealerTerms, savedTermsTransportPdf } from "./fixtures/savedTermsDownload";

const ORIGIN = "https://saved-terms.test";
let script: Buffer, css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-saved-pdf-"));
  const hooks = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const names = [...hooks.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(match => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useQuery}from'@tanstack/react-query';const call=(...args)=>window.fixtureApi(...args);${names.map(name => name === "useAuthedApi" ? "export const useAuthedApi=()=>call;" : name === "useClientTermsSummary" ? "export const useClientTermsSummary=id=>useQuery({queryKey:['application-client-terms',id],queryFn:()=>call('/application-profiles/'+id+'/client-terms')});" : name === "useClosingStipulations" ? "export const useClosingStipulations=()=>({data:{open_count:0,ready_to_close:true}});" : `export const ${name}=()=>({});`).join("\n")}`,
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-staff-token'});export const visualQaUser=()=>null;",
    "@/store/role": "export const useActiveProfile=()=>({email:'synthetic@example.test'});",
    "@/hooks/useDealBudgetPreview": "export const useDealBudgetPreview=()=>({data:window.fixtureBudget,budget:{data:window.fixtureBudget,isPending:false,isError:false},value:window.fixtureBudgetWrite,fingerprint:'fixed-readonly-preview',pending:false,isFetching:false,isError:false,refetch:async()=>({data:window.fixtureBudget}),updateBudget:()=>window.forbidden.push('budget-edit')});",
    "@/components/file/ClosingStipulationsPanel": "export const ClosingStipulationsPanel=()=>null;",
    "@/components/payments/FeeAllocationEditor": "export const FeeAllocationEditor=()=>null;",
    "@/components/communications/OfferDeliveryHistory": "export const OfferDeliveryHistory=()=>null;",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider,useQuery}from'@tanstack/react-query';
    import{UnderwritingFlow}from'@/components/file/UnderwritingFlow';import{ClientTermsDrawer}from'@/components/file/cockpit/ClientTermsStrip';import{TermSheetDrawer}from'@/production-package/TermSheetDrawer';import{savedTermsOnFile}from'./tests/fixtures/savedTermsDownload';import'@/app/globals.css';import'@/app/app-extras.css';
    const profile='${PROFILE}',dealer=location.search.includes('dealer'),client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    window.forbidden=[];window.fixtureApi=async(path,options={})=>{if(options.method&&options.method!=='GET'){window.forbidden.push(options.method+' '+path);throw Error('Writes prohibited')}const r=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff-token'}});const data=await r.json();if(!r.ok)throw Error(data.detail||'Read failed');return data};
    window.fixtureBudgetWrite={expected_revision:1,funding_mode:'single_investor',costs_confirmed:true,loan_amount_mode:'gross_loan',base_loan_amount:null,target_net_amount:null,investor_funding_amount:225000,minimum_investor_contribution:225000,currency:'USD',rows:[],note:null};window.fixtureBudget={...window.fixtureBudgetWrite,profile_id:profile,revision:1,can_edit:true,calculation:{gross_loan_amount:225000,investor_funding_amount:225000,minimum_investor_contribution:225000,net_client_cash:225000}};
    const loan={amount:225000,ratePct:18,termMonths:36,structure:'amortizing',interestOnlyMonths:0,repaymentConfig:{amortization_months:36,balloons:[]},paymentsPerYear:12};
    const plan={retire:[],exclude:[],new_loan_amount:225000,new_loan_rate_pct:18,new_loan_term_months:36,new_loan_structure:'amortizing',new_loan_interest_only_months:0,new_loan_repayment_config:loan.repaymentConfig,new_loan_payments_per_year:12,new_payment_source:'manual_terms',add_backs:[],overrides:null,note:'Unsaved synthetic225k'};
    const working={profileId:profile,plan,dirty:true,currentDscr:.9,projectedDscr:1.2,projectedDebtServiceAnnual:140000,source:'Synthetic working loan',budgetPending:false,budgetEvaluation:{loan_terms:{amount:225000,rate_pct:18,term_months:36,structure:'amortizing',interest_only_months:0,repayment_config:loan.repaymentConfig,payments_per_year:12,regular_payment_monthly:8134.25},new_regular_payment_monthly:8134.25,headline_after:1.2}};
    const dealerClient={mode:'operator',termSheet:id=>window.fixtureApi('/production-packages/term-sheets/'+id),saveTermSheet:()=>window.forbidden.push('dealer-save'),withdrawTermSheet:()=>window.forbidden.push('dealer-withdraw')};
    function App(){const[open,setOpen]=useState(false),[draft,setDraft]=useState({accepted_amount:'',estimated_close_date:''}),[workingDraft,setWorkingDraft]=useState(null);const saved=useQuery({queryKey:[dealer?'dealer-saved-terms':'application-client-terms',profile],queryFn:()=>window.fixtureApi(dealer?'/production-packages/term-sheets/'+profile:'/application-profiles/'+profile+'/client-terms')});const version=dealer?saved.data?.current?.version:saved.data?.version;const terms=savedTermsOnFile(version||0,dealer);return<><UnderwritingFlow profileId={profile} terms={terms} termsLoading={saved.isPending} onEditTerms={()=>setOpen(true)} financing={working} requestedAmount={175000} underwriting={{profile_id:profile,accepted_amount:null,underwriting_status:'collecting_docs',financing:{proposed_amount:175000,current_dscr:.9,with_plan_dscr:1.15,with_plan_annual_debt_service:130000,source:'Saved synthetic terms'}}} statusLabel='Collecting docs' draft={draft} onDraftChange={patch=>setDraft(current=>({...current,...patch}))} saving={false} error={null} onRecordAcceptance={()=>window.forbidden.push('accept')} onStatusChange={()=>window.forbidden.push('status')} onEditFees={()=>{}} forecastEarnings={5000} feeInfo={{label:'Synthetic fee'}} offer={{termsSelection:null,merchantSelection:null,merchantStatus:null,merchantStrip:null,selectedKeys:[],onSelectedKeys:()=>{},onCompose:()=>window.forbidden.push('send'),receipt:null,contactSuppressed:false}} loanId={null} onCreateFundingFile={()=>window.forbidden.push('create-file')} canUnderwrite/>{dealer?open?<TermSheetDrawer open client={dealerClient} profileId={profile} onClose={()=>setOpen(false)}/>:null:<ClientTermsDrawer open={open} onClose={()=>setOpen(false)} profileId={profile} prefillLoan={loan} workingDraft={workingDraft} onWorkingDraftChange={setWorkingDraft} onSaved={()=>window.forbidden.push('saved-callback')}/>}</>};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><main style={{padding:16,maxWidth:1320,margin:'auto'}}><App/></main></QueryClientProvider>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(ORIGIN) }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-services", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

async function fixture(page: Page, options: { dealer?: boolean; noSaved?: boolean; fail?: boolean; hold?: boolean } = {}) {
  let version = options.noSaved ? 0 : 4, failed = false;
  const requests: Array<{ method: string; path: string; version: number }> = [], errors: string[] = [], downloads: Download[] = [];
  let releasePdf = () => {}; const gate = options.hold ? new Promise<void>(resolve => { releasePdf = resolve; }) : Promise.resolve();
  page.on("pageerror", error => errors.push(error.message)); page.on("download", download => downloads.push(download));
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (pathname.startsWith("/api/v1/")) {
      expect(request.method()).toBe("GET"); expect(request.headers().authorization).toBe("Bearer synthetic-staff-token"); expect(request.headers()["x-dev-user"]).toBeUndefined();
      if (pathname.endsWith(".pdf")) {
        const requested = Number(url.searchParams.get("expected_version")); requests.push({ method: request.method(), path: pathname, version: requested }); await gate;
        expect(request.headers().accept).toBe("application/pdf");
        const expected = options.dealer ? `/api/v1/production-packages/term-sheets/${PROFILE}/client.pdf` : `/api/v1/application-profiles/${PROFILE}/client-terms.pdf`;
        expect(pathname).toBe(expected); if (options.dealer) expect(url.searchParams.get("disposition")).toBe("attachment");
        if (options.fail && !failed) { failed = true; return route.fulfill({ status: 500, json: { detail: "Synthetic saved PDF unavailable" } }); }
        if (requested !== version) return route.fulfill({ status: 409, json: { detail: "Saved version changed" } });
        return route.fulfill({ contentType: "application/pdf", headers: { "Content-Disposition": `attachment; filename="Example-Studio-${options.dealer ? "Loan" : "Financing"}-Terms-v${version}.pdf"` }, body: savedTermsTransportPdf(version, options.dealer) });
      }
      if (pathname.endsWith("/client-terms")) return route.fulfill({ json: savedClientTerms(version) });
      if (pathname === `/api/v1/production-packages/term-sheets/${PROFILE}`) return route.fulfill({ json: savedDealerTerms(version) });
      if (pathname.endsWith("/collateral")) return route.fulfill({ json: { profile_id: PROFILE, enabled: false, revision: 1, can_edit: true, properties: [], assets: [], property_options: [], source_file_options: [] } });
      if (pathname.endsWith("/deal-budget")) return route.fulfill({ json: { profile_id: PROFILE, revision: 1, can_edit: true, funding_mode: "single_investor", costs_confirmed: true, loan_amount_mode: "gross_loan", investor_funding_amount: 225000, minimum_investor_contribution: 225000, currency: "USD", rows: [], note: null, calculation: { gross_loan_amount: 225000, net_client_cash: 225000 } } });
      throw Error(`Unexpected read ${pathname}`);
    }
    return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
  await page.goto(`${ORIGIN}/${options.dealer ? "?dealer" : ""}`);
  await expect(page.getByRole("button", { name: options.noSaved ? "Download saved terms" : "Download saved terms v4", exact: true })).toBeVisible();
  return { requests, errors, downloads, releasePdf, newer: () => { version = 5; } };
}
async function downloadAndCheck(page: Page, button: ReturnType<Page["getByRole"]>, version: number, dealer = false) {
  const pending = page.waitForEvent("download"); await button.click(); const download = await pending;
  expect(download.url()).toMatch(/^blob:/); expect(download.suggestedFilename()).toBe(`Example-Studio-${dealer ? "Loan" : "Financing"}-Terms-v${version}.pdf`);
  const file = await download.path(); expect(file).toBeTruthy(); expect(await readFile(file!)).toEqual(savedTermsTransportPdf(version, dealer));
}
async function assertReadOnly(page: Page, errors: string[]) { expect(errors).toEqual([]); expect(await page.evaluate(() => (window as unknown as { forbidden: string[] }).forbidden)).toEqual([]); }
async function openEditor(page: Page, dealer = false) {
  await page.getByRole("button", { name: "Open full terms", exact: true }).click();
  const editor = page.getByRole("dialog", { name: dealer ? "Production loan terms" : "Client terms editor", exact: true });
  await expect(editor.getByRole("button", { name: "Download saved terms v4", exact: true })).toBeInViewport({ ratio: 1 });
  if (!dealer) { const amount = editor.getByLabel("Amount", { exact: true }); await expect(amount).toHaveValue("225000"); await amount.fill("224000"); await amount.fill("225000"); await editor.getByLabel("APR", { exact: true }).fill("20"); }
  else await editor.getByLabel("Fixed interest rate %", { exact: true }).fill("20");
  return editor;
}

for (const dealer of [false, true]) {
  test(`${dealer ? "dealer" : "client"} inline downloads exact saved-v4 PDF despite unsaved225k preview`, async ({ page }, info) => {
    const state = await fixture(page, { dealer });
    await expect(page.getByRole("region", { name: "Shared financing proposal", exact: true })).toContainText("$225,000");
    await expect(page.getByLabel("Saved terms reference", { exact: true })).toContainText("$175,000");
    await downloadAndCheck(page, page.getByRole("button", { name: "Download saved terms v4", exact: true }), 4, dealer);
    expect(state.requests.map(request => request.version)).toEqual([4]); await assertReadOnly(page, state.errors);
    await page.screenshot({ path: info.outputPath("inline-saved-download.png"), animations: "disabled" });
  });
  test(`${dealer ? "dealer" : "client"} real expanded editor downloads saved PDF and retains its dirty fields`, async ({ page }, info) => {
    const state = await fixture(page, { dealer }), editor = await openEditor(page, dealer);
    await downloadAndCheck(page, editor.getByRole("button", { name: "Download saved terms v4", exact: true }), 4, dealer);
    await expect(editor.getByLabel(dealer ? "Fixed interest rate %" : "APR", { exact: true })).toHaveValue("20");
    if (!dealer) await expect(editor.getByLabel("Amount", { exact: true })).toHaveValue("225000");
    await assertReadOnly(page, state.errors); await page.screenshot({ path: info.outputPath("expanded-saved-download.png"), animations: "disabled" });
  });
  test(`${dealer ? "dealer" : "client"} stale409 refreshes saved-v5 for explicit retry without replacing dirty editor`, async ({ page }) => {
    const state = await fixture(page, { dealer }), editor = await openEditor(page, dealer); state.newer();
    await editor.getByRole("button", { name: "Download saved terms v4", exact: true }).click();
    await expect(editor.getByRole("alert").filter({ hasText: "Latest saved terms v5" })).toBeVisible(); expect(state.downloads).toHaveLength(0);
    await expect(editor.getByLabel(dealer ? "Fixed interest rate %" : "APR", { exact: true })).toHaveValue("20");
    if (!dealer) await expect(editor.getByLabel("Amount", { exact: true })).toHaveValue("225000");
    await downloadAndCheck(page, editor.getByRole("button", { name: "Download saved terms v5", exact: true }), 5, dealer);
    expect(state.requests.map(request => request.version)).toEqual([4, 5]);
    if (!dealer) await expect(editor.getByLabel("Amount", { exact: true })).toHaveValue("225000");
    await assertReadOnly(page, state.errors);
  });
}
test("failed saved PDF stays visible and retries via authenticated GET only", async ({ page }) => {
  const state = await fixture(page, { fail: true }); await page.getByRole("button", { name: "Download saved terms v4", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Synthetic saved PDF unavailable"); expect(state.downloads).toHaveLength(0);
  await downloadAndCheck(page, page.getByRole("button", { name: "Download saved terms v4", exact: true }), 4);
  expect(state.requests).toHaveLength(2); await assertReadOnly(page, state.errors);
});
test("no saved version disables inline and expanded download without issuing or saving", async ({ page }) => {
  const state = await fixture(page, { noSaved: true }); await expect(page.getByRole("button", { name: "Download saved terms", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Open full terms", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Client terms editor", exact: true }); await expect(editor.getByRole("button", { name: "Download saved terms", exact: true })).toBeDisabled();
  expect(state.requests).toEqual([]); await assertReadOnly(page, state.errors);
});
test("pending download blocks duplicate GETs and produces a single PDF", async ({ page }) => {
  const state = await fixture(page, { hold: true }); const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download saved terms v4", exact: true }).dblclick();
  await expect.poll(() => state.requests.length).toBe(1); await expect(page.getByRole("button", { name: "Downloading saved terms…", exact: true })).toBeDisabled();
  state.releasePdf(); const download = await pending; expect(await readFile((await download.path())!)).toEqual(savedTermsTransportPdf(4));
  expect(state.downloads).toHaveLength(1); await assertReadOnly(page, state.errors);
});
