import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Real underwriting workspace, delivery history and response form. Services and
// unrelated closing/billing panels use fictional, in-memory records only.
let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-underwriting-workspace-"));
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `const call=(...args)=>window.fixtureApi(...args);export const useAuthedApi=()=>call;export const useClosingStipulations=()=>({data:{open_count:0,ready_to_close:true}});`,
    "@/lib/consoleAuth": `export const useConsoleAuth=()=>({isSignedIn:false,getToken:async()=>null});export const visualQaUser=()=>null;`,
    "@/store/role": `export const useActiveProfile=()=>({email:'qa@example.test'});`,
    "@/components/file/ClosingStipulationsPanel": `import{useState}from'react';export function ClosingStipulationsPanel(){const[text,setText]=useState('');return <label>Closing note<input aria-label='Closing note' value={text} onChange={e=>setText(e.target.value)}/></label>}`,
    "@/components/payments/FeeAllocationEditor": `export const FeeAllocationEditor=()=> <p>Fictional fee collection panel</p>;`,
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{UnderwritingFlow}from'@/components/file/UnderwritingFlow';import'@/app/globals.css';import'@/app/app-extras.css';
    const sent={id:'sent-a',subject:'Synthetic client offer',status:'sent',sent_at:'2026-11-09T15:00:00Z',expires_at:'2026-12-09T15:00:00Z',recipient_emails:['client@example.test'],items:[{id:'item-a',item_key:'application_term_sheet:terms-a:v2',source_id:'terms-a',source_version:2,kind:'application_term_sheet',label:'Financing terms',title:'Synthetic financing terms v2',file_name:'financing-terms-v2.pdf',content_type:'application/pdf',status:'pending',decision_status:'pending',expires_at:'2026-12-09T15:00:00Z'}]};
    let deliveries=[sent],saved={profile_id:'synthetic-a',accepted_amount:null,accepted_terms_ref:null,underwriting_status:'collecting_docs',forecast_fee_points:2,forecast_consulting_fee:1000,estimated_close_date:null};window.writes=[];window.editCount=0;
    window.fixtureApi=async(url,options)=>{if(url.endsWith('/offer-deliveries'))return structuredClone({deliveries});if(url.endsWith('/manual-response')){const body=JSON.parse(options.body);window.writes.push({url,body});if(window.failResponse)throw Error('Synthetic response failure');sent.items[0]={...sent.items[0],status:body.response,decision_status:body.response,responded_name:body.responder_name,responded_at:body.received_at};sent.status='completed';if(body.response==='accepted')saved={...saved,accepted_amount:200000,accepted_at:body.received_at,accepted_terms_ref:{kind:'application_term_sheet',id:'terms-a',version:2,amount:200000,rate_pct:15,term_months:24,label:'Synthetic terms'}};return structuredClone({delivery:sent,item:sent.items[0]})}throw Error('Unexpected synthetic request '+url)};
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    function App(){const[version,setVersion]=useState(2),[published,setPublished]=useState(false),[underwriting,setUnderwriting]=useState(saved),[draft,setDraft]=useState({accepted_amount:'',estimated_close_date:''}),[opened,setOpened]=useState(false);const terms={kind:'application_term_sheet',id:'terms-a',version,status:'draft',label:'Synthetic terms',amount:200000,ratePct:15,termMonths:24,structureLabel:'Amortizing',interestOnlyMonths:0,paymentMonthly:9697,coverageAfter:1.3,recordedAt:'2026-11-09T15:00:00Z',sentToClient:version===2};return <QueryClientProvider client={client}><main style={{padding:16,maxWidth:1300,margin:'auto'}}><h2>Synthetic underwriting review</h2><nav style={{display:'flex',gap:12,marginBottom:16}}><button onClick={()=>setVersion(3)}>New terms version</button><button onClick={()=>setPublished(true)}>Publish fixture offer</button></nav><UnderwritingFlow profileId='synthetic-a' terms={terms} termsLoading={false} onEditTerms={()=>{window.editCount++;setOpened(true)}} financing={null} requestedAmount={200000} underwriting={underwriting} statusLabel='Collecting docs' draft={draft} onDraftChange={patch=>setDraft(value=>({...value,...patch}))} saving={false} error={null} onRecordAcceptance={patch=>{window.writes.push({patch});setUnderwriting(value=>({...value,...patch}))}} onStatusChange={status=>window.writes.push({status})} onEditFees={()=>{}} onBudgetSaved={()=>{setUnderwriting({...saved});setDraft(value=>({...value,accepted_amount:saved.accepted_amount==null?'':String(saved.accepted_amount)}))}} forecastEarnings={5000} feeInfo={{label:'Origination fee'}} marketplace={<p>Synthetic marketplace offer controls</p>} publication={{published,label:published?'Offer published':'Offer draft · not published'}} offer={{termsSelection:{key:'terms-a-v'+version,ref:{kind:'application_term_sheet',term_sheet_id:'terms-a',expected_version:version},label:'Financing terms',description:'Synthetic terms v'+version},merchantSelection:null,merchantStatus:null,merchantStrip:null,selectedKeys:['terms-a-v'+version],onSelectedKeys:()=>{},onCompose:()=>{window.composeCount=(window.composeCount||0)+1},receipt:{id:'merchant-only',status:'sent',sent_at:'2026-11-09T15:00:00Z',expires_at:'2026-12-09T15:00:00Z'},contactSuppressed:false}} loanId={null} onCreateFundingFile={()=>{window.writes.push({funding:true})}} canUnderwrite/>{opened?<p data-testid='terms-opened'>Shared full terms requested</p>:null}</main></QueryClientProvider>};createRoot(document.getElementById('root')).render(<App/>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, plugins: [{ name: "synthetic-services", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture" } : undefined); build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});
test.beforeEach(async ({ page }) => {
  await page.route("http://underwriting.test/**", route => { const pathname = new URL(route.request().url()).pathname; return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' }); });
  await page.goto("http://underwriting.test/");
});

test("shows one focused step, shares the full editor entry point and retains hidden closing edits", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await page.getByRole("button", { name: "Open full terms", exact: true }).click();
  await expect(page.getByTestId("terms-opened")).toHaveText("Shared full terms requested");
  expect(await page.evaluate(() => (window as unknown as { editCount: number }).editCount)).toBe(1);
  await page.screenshot({ path: info.outputPath("underwriting-terms.png"), fullPage: true });
  await page.getByRole("tab", { name: /^Closing/ }).click();
  await page.getByLabel("Closing note").fill("Keep this draft while reviewing the offer");
  await page.getByRole("tab", { name: /^Client terms/ }).click();
  await page.getByRole("tab", { name: /^Closing/ }).click();
  await expect(page.getByLabel("Closing note")).toHaveValue("Keep this draft while reviewing the offer");
  await page.getByRole("tab", { name: /^Closing/ }).press("Home");
  await expect(page.getByRole("tab", { name: /^Client terms/ })).toBeFocused();
  await page.getByRole("tab", { name: /^Client terms/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Offer published/ })).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("client delivery does not mark the marketplace offer published", async ({ page }) => {
  const publication = page.getByRole("tab", { name: /^Offer published/ });
  await expect(publication).not.toHaveClass(/done/);
  await page.getByRole("tab", { name: /^Client response/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Available to client");
  await page.getByRole("button", { name: "Publish fixture offer" }).click();
  await expect(publication).toHaveClass(/done/);
  await publication.click();
  await expect(page.getByRole("tabpanel")).toContainText("Synthetic marketplace offer controls");
});

test("an old loan delivery or merchant receipt does not mark new client terms delivered", async ({ page }) => {
  await page.getByRole("button", { name: "New terms version" }).click();
  await page.getByRole("tab", { name: /^Client response/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Not delivered");
  await expect(page.getByRole("tabpanel")).not.toContainText("Available to client");
  await expect(page.getByRole("button", { name: "Prepare client delivery", exact: true })).toBeEnabled();
});

for (const response of ["accepted", "declined"] as const) test(`records a ${response} client response against its exact sent version`, async ({ page }, info) => {
  await page.getByRole("tab", { name: /^Client response/ }).click();
  await page.getByRole("button", { name: response === "accepted" ? "Record acceptance for Financing terms" : "Record decline for Financing terms", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Record client response", exact: true });
  await expect(dialog.getByLabel("Response", { exact: true })).toHaveValue(response);
  await dialog.getByLabel("Responder", { exact: true }).fill("Synthetic Client");
  await dialog.getByText("I attest that this accurately records", { exact: false }).click();
  await dialog.getByRole("button", { name: "Record response", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const writes = await page.evaluate(() => (window as unknown as { writes: { url?: string; body?: { response: string }; status?: string }[] }).writes);
  expect(writes).toHaveLength(1);
  expect(writes[0].url).toContain("/offer-deliveries/sent-a/items/item-a/manual-response");
  expect(writes[0].body?.response).toBe(response);
  expect(writes[0].status).toBeUndefined();
  await expect(page.getByRole("tabpanel")).toContainText(response === "accepted" ? "Client accepted." : "The client declined these terms.");
  await page.screenshot({ path: info.outputPath(`client-${response}.png`), fullPage: true });
  await page.getByRole("tab", { name: /^Closing/ }).click();
  if (response === "accepted") await expect(page.getByRole("button", { name: "Record funded closing", exact: true })).toBeEnabled();
  else await expect(page.getByRole("tabpanel")).toContainText("Confirm acceptance of the current terms");
  if (response === "accepted") {
    await page.getByRole("button", { name: "New terms version" }).click();
    await page.getByRole("tab", { name: /^Client response/ }).click();
    await expect(page.getByRole("tabpanel")).toContainText("recorded acceptance answers Synthetic terms v2");
    await page.getByRole("tab", { name: /^Closing/ }).click();
    await expect(page.getByRole("button", { name: "Record funded closing", exact: true })).toBeDisabled();
  }
});

test("failed response keeps the entered response available for retry", async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { failResponse: boolean }).failResponse = true; });
  await page.getByRole("tab", { name: /^Client response/ }).click();
  await page.getByRole("button", { name: "Record decline for Financing terms", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Record client response", exact: true });
  await dialog.getByLabel("Responder", { exact: true }).fill("Synthetic Client");
  await dialog.getByText("I attest that this accurately records", { exact: false }).click();
  await dialog.getByRole("button", { name: "Record response", exact: true }).click();
  await expect(dialog).toContainText("Synthetic response failure");
  await expect(dialog.getByLabel("Responder", { exact: true })).toHaveValue("Synthetic Client");
  await expect(dialog.getByLabel("Response", { exact: true })).toHaveValue("declined");
  await expect(dialog.getByRole("button", { name: "Record response", exact: true })).toBeEnabled();
});



