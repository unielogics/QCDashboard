import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pdfFontCompatibility } from "./fixtures/pdfFontCompatibility";

// The evidence review screen in a real browser: the real Evidence workspace and
// the real file reader with the app's own stylesheets, fed a made-up file. The
// API is a stand-in that keeps its own state, so approving, rejecting or
// answering the business-name question changes what the next read returns the
// way the backend would. No application record is read or changed.
//
// The checklist list is a stand-in that only opens a file; everything inside the
// review screen is the real thing.
let script: Buffer;
let moduleCss: Buffer;
let globalCss: Buffer;
let extrasCss: Buffer;
let pdfjsRoot: string;

const FIXTURES = String.raw`
const hex=(c)=>c.repeat(64);
const association=(id,name,status,observed,extra={})=>({file_id:id,file_name:name,content_hash:hex(extra.h||'a'),analysis_id:'analysis-'+id,expected_entity:'samplefabco',observed_entities:observed,status,automatic_status:status,allows_financial_use:status==='matched'||status==='accepted',document_accepted:true,source_stamp:hex(extra.s||'b'),can_review:true,current_decision:null,history:[],document_version_number:1});
const file=(id,name,extra={})=>({id,source_id:'source-1',bucket_id:'bucket-1',file_name:name,content_type:'application/pdf',size_bytes:342000,selected:true,included_in_review:true,preview_url:null,analysis_status:'completed',analysis_classification:'tax_return',analysis_confidence:'high',created_at:'2026-11-20T15:00:00Z',document_version_number:1,is_current_document_version:true,is_latest_document_version:true,...extra});
const evidence=(id,name,extra={})=>({file_id:id,file_name:name,bucket_id:'bucket-1',created_at:'2026-11-20T15:00:00Z',source:'automatic',verified:false,verified_at:null,ai_decision:'accepted',ai_reason_code:'validated',ai_explanation:'AI validated the document type, readable content, and applicable period.',ai_confidence:'high',decision_actor:'ai',analysis_id:'analysis-'+id,coverage_contribution:{},usability_status:'usable',...extra});
const requirement=(key,label,files,extra={})=>({requirement_key:key,requirement_kind:'document',label,category:'financials',required_level:'required',status:'received_unverified',requested_document_id:null,evidence_file_id:null,evidence_file_name:null,evidence_files:files,evidence_count:files.length,verified_evidence_count:0,coverage:{},verified_coverage:{},coverage_complete:true,verified_coverage_complete:false,allow_multiple_files:true,verification_required:false,source_program_keys:[],source_policy_keys:[],program_overrides:{},client_visible:true,can_waive:true,state_reason:null,last_requested_at:null,received_at:null,verified_at:null,provenance:{},...extra});
const RETURN='2025 Form 1120S - Client Copy (Sample Fabrication Co LLC).pdf';
const book={
  revision:4,
  files:[
    file('f-return',RETURN),
    file('f-pnl','Profit and Loss.pdf',{size_bytes:13000,analysis_classification:'profit_and_loss'}),
    file('f-license','Business license.pdf',{analysis_classification:'business_license'}),
    file('f-scan','Scan 0042.pdf',{analysis_status:'failed',analysis_classification:null,analysis_detail:'The pages could not be read.'}),
    file('f-loose','Vendor quote.pdf',{analysis_classification:'vendor_quote',analysis_summary:'A quote from a supplier.'}),
    file('f-both','Interim statements.pdf',{analysis_classification:'profit_and_loss'}),
  ],
  requirements:[
    requirement('ytd_financials','Year-to-date P&L and balance sheet',[
      evidence('f-return',RETURN,{verified:true,verified_at:'2026-11-21T10:00:00Z',ai_reason_code:'entity_mismatch_warning',usability_status:'usable_with_warning',detected_classification:'tax_return',analysis_confidence:'high',document_type_candidates:[{classification:'tax_return',confidence:'high'},{classification:'balance_sheet',confidence:'medium'}],evidence_claims:[{capability:'annual_financials',confidence:'high',entity:'SAMPLE FABRICATION CO LLC'}],ai_explanation:'AI validated the document type, readable content, and applicable period. Entity-name mismatch: this document names SAMPLE FABRICATION CO LLC, while the file names samplefabco. Usable evidence is retained; staff should confirm the association. Do not combine these figures with another entity\'s financial results.'}),
      evidence('f-pnl','Profit and Loss.pdf',{ai_decision:'needs_more',ai_reason_code:'wrong_period',ai_confidence:'medium',usability_status:'needs_review',detected_classification:'profit_and_loss',ai_explanation:'The statement covers January to June 2025. This item asks for the current year to date, so the latest months are missing.'}),
      evidence('f-both','Interim statements.pdf',{detected_classification:'profit_and_loss'}),
    ]),
    requirement('business_license','Business license',[
      evidence('f-license','Business license.pdf',{detected_classification:'business_license'}),
    ],{verification_required:true,category:'entity'}),
    requirement('business_tax_returns','Business tax returns',[
      evidence('f-scan','Scan 0042.pdf',{ai_decision:'failed',ai_reason_code:'analysis_unavailable',ai_confidence:null,usability_status:'needs_review',ai_explanation:'The automatic review could not read this file. The file is kept.'}),
      evidence('f-both','Interim statements.pdf',{ai_decision:'needs_more',ai_reason_code:'wrong_document',ai_confidence:'low',usability_status:'needs_review',ai_explanation:'This looks like an interim statement, not a filed tax return.'}),
    ]),
  ],
  associations:{
    'f-return':association('f-return',RETURN,'conflict',['SAMPLE FABRICATION CO LLC'],{h:'a',s:'b'}),
    'f-pnl':association('f-pnl','Profit and Loss.pdf','matched',['samplefabco'],{h:'c',s:'d'}),
    'f-license':association('f-license','Business license.pdf','matched',['samplefabco'],{h:'e',s:'f'}),
  },
};
const withAssociations=()=>{
  for(const item of book.files)item.identity_association=book.associations[item.id]||null;
  for(const row of book.requirements)for(const item of row.evidence_files)item.identity_association=book.associations[item.file_id]||null;
};
const readiness=()=>{withAssociations();return {profile_id:'profile-1',lending_applicable:true,selection_mode:'manual',selections:[],evidence_policies:[],candidates:[],programs:[],requirements:book.requirements,available_evidence_files:[],can_advance:false,automatic_stage_status:'not_ready',automation:{enabled:false,eligible:false,next_requirement_key:null,next_send_at:null,last_sent_at:null,attempts:0,max_attempts:0,stop_reason:null}}};
const workspace=()=>({profile_id:'profile-1',primary_bucket_id:'bucket-1',primary_bucket_name:'Sample Fabrication documents',program_readiness:readiness(),verification:{},banking:{manual_statement_files:[]},bank_evidence:{source:'none',connected_institutions:0,banking_access_complete:false,accepted_statement_months:[],required_statement_months:6,statement_coverage_complete:false,processing_files:0,needs_attention_files:0,reconnect_required:false,counted_accounts:[]},forms:{forms:[],packets:[]},evidence:{profile_id:'profile-1',sources:[],files:book.files,total_files:book.files.length,review_file_count:book.files.length,blockers:[]},supporting_group:null,processing:{total_files:book.files.length,analyzing_files:0,accepted_files:0,needs_attention_files:0,failed_files:0,has_processing:false},can_manage_evidence:true,can_manage_plaid_settings:false,can_upload:true});
const associations=()=>({profile_id:'profile-1',revision:book.revision,expected_entity:'samplefabco',documents:Object.values(book.associations)});
const copy=(value)=>JSON.parse(JSON.stringify(value));
const decisionOf=(key,id)=>book.requirements.find(row=>row.requirement_key===key).evidence_files.find(item=>item.file_id===id);
window.__calls=[];window.__failNext=null;window.__notices=[];
window.__api=async(path,options={})=>{
  const method=options.method||'GET';const body=options.body?JSON.parse(options.body):null;window.__calls.push([method,path,body]);
  if(window.__failNext&&new RegExp(window.__failNext).test(method+' '+path)){window.__failNext=null;throw Object.assign(new Error('You do not have permission to change this file.'),{status:403})}
  const rest=String(path).replace('/application-profiles/profile-1/','');let m;
  if(rest==='evidence-workspace')return copy(workspace());
  if(rest==='document-associations')return copy(associations());
  if((m=rest.match(/^evidence\/files\/([^/]+)\/url/)))return {url:location.origin+'/sample.pdf',expires_in:600};
  if((m=rest.match(/^documents\/([^/]+)\/association$/))){const record=book.associations[m[1]];book.revision+=1;const event={id:'event-'+book.revision,action:body.action,reason:body.reason,actor_name:'Sam Desk',at:'2026-11-28T15:00:00Z',source_stamp:record.source_stamp,revision:book.revision};record.history.push(event);if(body.action==='reset'){record.status=record.automatic_status;record.current_decision=null}else{record.status=body.action==='accept'?'accepted':'denied';record.current_decision=event}record.allows_financial_use=record.status==='matched'||record.status==='accepted';return copy(associations())}
  if((m=rest.match(/^requirements\/([^/]+)\/evidence\/([^/]+)$/))){const item=decisionOf(decodeURIComponent(m[1]),m[2]);item.ai_decision=body.decision;item.decision_actor='staff';item.ai_reason_code=body.reason_code;item.ai_explanation=body.reason;item.verified=body.decision==='accepted';item.verified_at=item.verified?'2026-11-28T15:00:00Z':null;return copy(readiness())}
  if((m=rest.match(/^requirements\/([^/]+)$/))){const key=decodeURIComponent(m[1]);const row=book.requirements.find(item=>item.requirement_key===key);for(const id of body.evidence_file_ids||[]){if(body.action==='verify'||body.action==='unverify'){const item=decisionOf(key,id);item.verified=body.action==='verify';item.verified_at=item.verified?'2026-11-28T15:00:00Z':null}if(body.action==='unlink_evidence')row.evidence_files=row.evidence_files.filter(item=>item.file_id!==id);if(body.action==='link_evidence'){const source=book.files.find(item=>item.id===id);row.evidence_files.push(evidence(id,source.file_name,{source:'operator'}))}}return copy(readiness())}
  if((m=rest.match(/^evidence\/([^/]+)\/reanalyze$/))){for(const row of book.requirements)for(const item of row.evidence_files)if(item.file_id===m[1]){item.ai_decision='processing';item.ai_reason_code='analysis_pending';item.ai_explanation='The AI is reading this file again.'}return {}}
  throw new Error('No stand-in for '+method+' '+path);
};`;

test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const vitestRequire = createRequire(projectRequire.resolve("vitest/package.json"));
  const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  pdfjsRoot = path.dirname(projectRequire.resolve("pdfjs-dist/package.json"));
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-evidence-review-"));
  const hooksSource = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const hookNames = [...hooksSource.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map((match) => match[1]);
  const standIns: Record<string, string> = {
    useAuthedApi: "()=>window.__api",
    useCurrentUser: "()=>({data:{id:'user-1',role:'super_admin',name:'Sam Desk'},isLoading:false})",
    useDevUser: "()=>'fixture'",
  };
  const nothing = (...names: string[]) => names.map((name) => `export const ${name}=()=>null;`).join("");
  const mocks: Record<string, string> = {
    "@/hooks/useApi": hookNames.map((name) => `export const ${name}=${standIns[name] ?? "()=>({})"};`).join("\n"),
    "@/lib/consoleAuth": "export const useConsoleAuth=()=>({getToken:async()=>null,isSignedIn:false,isLoaded:true});export const isVisualQa=()=>false;",
    // The checklist has its own specs; here it only has to open a file on a checklist item.
    "@/components/application/ApplicationProgramReadiness": "export function ApplicationProgramReadiness(props){return <ul aria-label='Checklist stand-in'>{props.value.requirements.flatMap(row=>row.evidence_files.map(item=><li key={row.requirement_key+item.file_id}><button type='button' onClick={()=>props.onPreviewEvidence(item.file_id,row.requirement_key)}>Open {item.file_name} for {row.label}</button></li>))}</ul>}",
    "@/components/application/EvidenceOverview": nothing("EvidenceOverview"),
    "@/components/application/ApplicationVerificationWorkspace": nothing("BankingPanel"),
    "@/components/application/FinancialWorkspace": nothing("FinancialWorkspace"),
    "@/components/application/ApplicationDebtPayees": nothing("ApplicationDebtPayees"),
    "@/components/application/BankAccountsCard": nothing("BankAccountsCard"),
    "@/components/application/PlaidRequestBar": nothing("PlaidRequestBar"),
    "@/components/buckets/BucketWorkspaceOverlay": nothing("BucketWorkspaceOverlay"),
    "@/hooks/useDebtScheduleReview": "export const useDebtScheduleReviewSummary=()=>({loading:true});",
    "@/lib/productionTrainingCall": "export const useProductionCall=()=>window.__api;",
    "@/components/design-system/ConfirmationProvider": "export const useConfirmAction=()=>async()=>true;",
    "@/components/file/FileWorkspaceContext": "export const useFileWorkspace=()=>null;export const FileWorkspaceLink=({children})=><span>{children}</span>;",
  };
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
      ${FIXTURES}
      import{ApplicationEvidenceWorkspace}from'@/components/application/ApplicationEvidenceWorkspace';
      const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
      const readOnly=new URLSearchParams(location.search).has('readonly');
      const upload=async()=>{};const notice=(message)=>{window.__notices.push(message)};
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><ApplicationEvidenceWorkspace profileId="profile-1" intakeId="intake-1" onUploadFiles={upload} onNotice={notice} canAddRequirements={!readOnly}/></QueryClientProvider>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    // Never the default API address: on the build box that is the production API.
    define: { "process.env": JSON.stringify({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: "http://api.evidence-review.test" }), "process.env.NODE_ENV": '"development"' },
    external: ["node:module", "node:fs", "node:fs/promises", "node:url", "node:path", "@napi-rs/canvas"],
    loader: { ".module.css": "local-css" }, logLevel: "silent",
    plugins: [{ name: "evidence-review-fixtures", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "evidence-review-fixture" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "evidence-review-fixture" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  script = await readFile(path.join(directory, "app.js"));
  moduleCss = await readFile(path.join(directory, "app.css")).catch(() => Buffer.from(""));
  execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "src/app/globals.css", "-o", path.join(directory, "globals.css")], { cwd: root, stdio: "ignore" });
  globalCss = await readFile(path.join(directory, "globals.css"));
  extrasCss = await readFile(path.join(root, "src/app/app-extras.css"));
});

// A doctype, as the app has, and the app's own shell classes.
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/extras.css"><link rel="stylesheet" href="/app.css"></head>
<body><main class="content content--wide" style="padding:16px;min-width:0"><div id="root"></div></main>
<style>body{margin:0}</style><script src="/app.js"></script></body></html>`;

async function start(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.route("https://evidence-review.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: moduleCss });
    if (pathname === "/globals.css") return route.fulfill({ contentType: "text/css", body: globalCss });
    if (pathname === "/extras.css") return route.fulfill({ contentType: "text/css", body: extrasCss });
    if (pathname === "/sample.pdf") return route.fulfill({ contentType: "application/pdf", body: pdfFontCompatibility });
    if (pathname.startsWith("/pdfjs/")) {
      const relative = pathname.slice("/pdfjs/".length);
      const allowed = relative === "pdf.worker.min.mjs" ? path.join(pdfjsRoot, "legacy/build/pdf.worker.min.mjs")
        : /^(wasm|standard_fonts|cmaps|iccs)\/[a-zA-Z0-9_.-]+$/.test(relative) ? path.join(pdfjsRoot, relative) : null;
      if (allowed && (await stat(allowed).catch(() => null))?.isFile()) {
        return route.fulfill({ contentType: relative.endsWith(".mjs") ? "text/javascript" : relative.endsWith(".wasm") ? "application/wasm" : "application/octet-stream", body: await readFile(allowed) });
      }
      return route.fulfill({ status: 404, body: "Unknown PDF asset" });
    }
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
    return route.fulfill({ status: 404, body: "" });
  });
  // A secure made-up origin: the review writes an idempotency key with crypto.randomUUID.
  await page.goto(`https://evidence-review.test/${query}`);
  await expect(page.getByRole("list", { name: "Checklist stand-in" })).toBeVisible();
  return errors;
}

const RETURN = "2025 Form 1120S - Client Copy (Sample Fabrication Co LLC).pdf";
const YTD = "Year-to-date P&L and balance sheet";

const shell = (page: Page) => page.locator(".bucket-review-shell");
const decision = (page: Page) => shell(page).getByRole("group", { name: "Checklist decision", exact: true });
const businessName = (page: Page) => shell(page).getByRole("group", { name: "Business name on this document", exact: true });
const calls = (page: Page, method: string) => page.evaluate((wanted) => (window as unknown as { __calls: [string, string, Record<string, unknown> | null][] }).__calls.filter((call) => call[0] === wanted), method);

async function openFile(page: Page, fileName: string, requirement: string) {
  await page.getByRole("button", { name: `Open ${fileName} for ${requirement}`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Evidence review", exact: true })).toBeVisible();
  await expect(shell(page).locator("canvas").first()).toBeVisible();
  await expect(decision(page)).toBeVisible();
}

/**
 * The strip above the document reads as rows and leaves the document its room.
 * These are the things the squeezed layout got wrong: a block one word wide,
 * blocks drawn over each other, and a strip so tall the document was off screen.
 */
async function expectRoomForTheDocument(page: Page, info: { project: { name: string } }, { detailsOpen = false } = {}) {
  const phone = info.project.name.startsWith("mobile");
  await expect(shell(page).locator("canvas").first()).toBeVisible();
  const measured = await page.evaluate(() => {
    const box = (element: Element) => { const rect = element.getBoundingClientRect(); return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; };
    const strip = document.querySelector(".bucket-review-context")!;
    const well = document.querySelector(".bucket-review-document")!;
    const canvas = well.querySelector("canvas");
    const words = [...strip.querySelectorAll("p, b, summary")].filter((element) => (element.textContent ?? "").trim().split(/\s+/).length >= 4 && element.getClientRects().length);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      sideways: document.documentElement.scrollWidth - innerWidth,
      strip: { ...box(strip), sideways: strip.scrollWidth - strip.clientWidth },
      well: box(well),
      canvasTop: canvas ? canvas.getBoundingClientRect().top : null,
      close: box(document.querySelector('button[aria-label="Close review"]')!),
      rows: [...strip.querySelectorAll('[role="group"]')].map(box),
      narrow: words.map((element) => ({ text: (element.textContent ?? "").trim().slice(0, 48), width: Math.round(element.getBoundingClientRect().width) })).filter((item) => item.width < 170),
      buttons: [...strip.querySelectorAll("button")].filter((element) => element.getClientRects().length).map((element) => ({ name: (element.textContent ?? "").trim(), ...box(element) })),
    };
  });
  expect(measured.sideways, "the page does not scroll sideways").toBeLessThanOrEqual(0);
  expect(measured.strip.sideways, "the strip does not scroll sideways").toBeLessThanOrEqual(1);
  expect(measured.narrow, "no sentence is squeezed into a column of single words").toEqual([]);
  expect(measured.rows.length).toBeGreaterThan(0);
  for (const row of measured.rows) expect(row.width, "each row spans the strip").toBeGreaterThanOrEqual(measured.strip.width - 40);
  for (let index = 1; index < measured.rows.length; index += 1) expect(measured.rows[index].top, "rows are not drawn over each other").toBeGreaterThanOrEqual(measured.rows[index - 1].bottom - 1);
  for (const button of measured.buttons) {
    expect(button.name, "every button in the strip says what it does").not.toBe("");
    expect(button.left, `${button.name} is inside the strip`).toBeGreaterThanOrEqual(measured.strip.left - 1);
    expect(button.right, `${button.name} is inside the strip`).toBeLessThanOrEqual(measured.strip.right + 1);
  }
  expect(measured.close.right, "the close button is on screen").toBeLessThanOrEqual(measured.viewport.width);
  expect(measured.strip.height, "the strip stays well under half the screen").toBeLessThanOrEqual(measured.viewport.height * 0.41);
  // More than half the screen as the file opens; opening the details may take some of it.
  expect(measured.well.height, "the document keeps its room").toBeGreaterThanOrEqual(phone ? 200 : measured.viewport.height * (detailsOpen ? 0.4 : 0.5));
  if (!phone) expect(measured.canvasTop, "the first page starts on screen").toBeLessThan(measured.viewport.height - 120);
}

test("an accepted file whose business name differs asks one plain question and leaves the document its room", async ({ page }, info) => {
  const errors = await start(page);
  await openFile(page, RETURN, YTD);
  await expect(decision(page)).toContainText("Accepted by AI");
  await expect(decision(page)).toContainText(`Accepted for ${YTD}. Nothing more is needed unless you disagree.`);
  await expect(decision(page).getByRole("button", { name: "Reject", exact: true })).toBeVisible();
  await expect(decision(page).getByRole("button", { name: /Approve/ })).toHaveCount(0);
  await expect(businessName(page)).toContainText("Business name differs");
  await expect(businessName(page)).toContainText("The document names SAMPLE FABRICATION CO LLC. This file's business is samplefabco. Is it the same business?");
  await expect(businessName(page)).toContainText("Its figures are left out of this file's numbers until someone answers.");
  await expect(businessName(page).getByRole("button", { name: "Yes, same business", exact: true })).toBeVisible();
  await expect(businessName(page).getByRole("button", { name: "No, different business", exact: true })).toBeVisible();
  // The details the AI read are one click away, not in the document's way.
  const details = shell(page).locator("details").filter({ hasText: "Document details and next step" });
  await expect(details).not.toHaveAttribute("open", "");
  await expectRoomForTheDocument(page, info);
  await page.screenshot({ path: info.outputPath("name-differs.png"), animations: "disabled" });
  await details.locator("summary").click();
  await expect(details).toContainText("Business named in evidence");
  await expect(details).toContainText("Could also be");
  await expect(details).toContainText("Usable with warning");
  await expectRoomForTheDocument(page, info, { detailsOpen: true });
  await page.screenshot({ path: info.outputPath("name-differs-details.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("the business-name question is answered in its own panel and the answer shows on the file", async ({ page }, info) => {
  const errors = await start(page);
  await openFile(page, RETURN, YTD);
  await businessName(page).getByRole("button", { name: "Yes, same business", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Business name on this document" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("samplefabco");
  await expect(panel).toContainText("SAMPLE FABRICATION CO LLC");
  // The answer the reviewer clicked is already chosen; only the reason is left.
  await expect(panel.getByRole("radio", { name: "Yes, it belongs to this business", exact: true })).toBeChecked();
  await expect(panel.getByRole("radio", { name: /Clear the answer/ })).toHaveCount(0);
  const save = panel.getByRole("button", { name: "Save answer", exact: true });
  await expect(save).toBeDisabled();
  await expect(panel).toContainText("Pick a reason above, or write one of at least 8 characters.");
  await page.screenshot({ path: info.outputPath("business-name-panel.png"), animations: "disabled" });
  const reason = "Same business; its name is written differently on this document";
  await panel.getByRole("button", { name: reason, exact: true }).click();
  await expect(panel.getByRole("textbox")).toHaveValue(reason);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(panel).toHaveCount(0);
  const posted = (await calls(page, "POST")).filter((call) => call[1].endsWith("/documents/f-return/association"));
  expect(posted).toHaveLength(1);
  expect(posted[0][2]).toMatchObject({ action: "accept", reason, expected_revision: 4, source_stamp: "b".repeat(64) });
  await expect(businessName(page)).toContainText("Same business");
  await expect(businessName(page)).toContainText("Sam Desk confirmed this document belongs to samplefabco");
  await expect(businessName(page)).toContainText(`Reason: ${reason}.`);
  await expect(businessName(page).getByRole("button", { name: "Yes, same business", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __notices: string[] }).__notices)).toContain("Saved: this document belongs to this file's business.");
  await expectRoomForTheDocument(page, info);
  await page.screenshot({ path: info.outputPath("business-name-answered.png"), animations: "disabled" });

  // A recorded answer can be changed, or cleared back to the automatic check.
  await businessName(page).getByRole("button", { name: "Change answer", exact: true }).click();
  await expect(panel.getByRole("radio", { name: /Clear the answer/ })).toBeVisible();
  await expect(panel.getByRole("radio", { checked: true })).toHaveCount(0);
  // The answer is kept outside the panel, so the radio settles a moment after the click.
  const different = panel.getByRole("radio", { name: "No, it belongs to a different business", exact: true });
  await different.click();
  await expect(different).toBeChecked();
  await panel.getByRole("button", { name: "A different business from this file's", exact: true }).click();
  await panel.getByRole("button", { name: "Save answer", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(businessName(page)).toContainText("Different business");
  await expect(businessName(page)).toContainText("Sam Desk marked this document as a different business");
  expect(errors).toEqual([]);
});

test("choosing the other answer does not carry over the first answer's reason", async ({ page }) => {
  await start(page);
  await openFile(page, RETURN, YTD);
  const panel = page.getByRole("dialog", { name: "Business name on this document" });
  await businessName(page).getByRole("button", { name: "Yes, same business", exact: true }).click();
  await panel.getByRole("button", { name: "A trade name (DBA) of this business", exact: true }).click();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await businessName(page).getByRole("button", { name: "No, different business", exact: true }).click();
  await expect(panel.getByRole("radio", { name: "No, it belongs to a different business", exact: true })).toBeChecked();
  await expect(panel.getByRole("textbox")).toHaveValue("");
  await expect(panel.getByRole("button", { name: "A different business from this file's", exact: true })).toBeVisible();
  expect((await calls(page, "POST")).filter((call) => call[1].includes("/association"))).toEqual([]);
});

test("a file the AI could not accept offers Approve anyway and Reject in words", async ({ page }, info) => {
  const errors = await start(page);
  await openFile(page, "Profit and Loss.pdf", YTD);
  await expect(decision(page)).toContainText("Needs review");
  await expect(decision(page)).toContainText(`The AI could not accept this file for ${YTD}. Approve it if it is right, or reject it.`);
  await expect(decision(page)).toContainText("Period needs confirmation. The statement covers January to June 2025.");
  await expect(decision(page).getByRole("button", { name: "Approve anyway", exact: true })).toBeVisible();
  await expect(decision(page).getByRole("button", { name: "Reject", exact: true })).toBeVisible();
  // The name matched on its own, so there is nothing to ask about it.
  await expect(businessName(page)).toHaveCount(0);
  await expectRoomForTheDocument(page, info);
  await page.screenshot({ path: info.outputPath("needs-review.png"), animations: "disabled" });

  await decision(page).getByRole("button", { name: "Reject", exact: true }).click();
  const reject = page.getByRole("dialog", { name: "Reject this file" });
  await expect(reject).toBeVisible();
  const confirm = reject.getByRole("button", { name: "Reject file", exact: true });
  await expect(confirm).toBeDisabled();
  await expect(reject).toContainText("Pick a reason, or write one of at least 8 characters.");
  await reject.getByRole("combobox", { name: "What is wrong with it", exact: true }).selectOption("wrong_period");
  await reject.getByRole("button", { name: "This covers the wrong dates for this item", exact: true }).click();
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: info.outputPath("reject-panel.png"), animations: "disabled" });
  await confirm.click();
  await expect(reject).toHaveCount(0);
  const rejected = (await calls(page, "PATCH")).filter((call) => call[1].endsWith("/requirements/ytd_financials/evidence/f-pnl"));
  expect(rejected).toHaveLength(1);
  expect(rejected[0][2]).toEqual({ decision: "rejected", reason_code: "wrong_period", reason: "This covers the wrong dates for this item", confirmed: true });
  await expect(decision(page)).toContainText("Staff requested another copy");
  await expect(decision(page)).toContainText(`A team member rejected this file for ${YTD}.`);
  await expect(decision(page).getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);

  // A person's rejection can be overruled the same way, with a reason.
  await decision(page).getByRole("button", { name: "Approve anyway", exact: true }).click();
  const approve = page.getByRole("dialog", { name: "Approve this file" });
  await expect(approve.getByRole("button", { name: "Approve file", exact: true })).toBeDisabled();
  await approve.getByRole("textbox", { name: "Reason", exact: true }).fill("The client sent the missing months by email");
  await approve.getByRole("button", { name: "Approve file", exact: true }).click();
  await expect(approve).toHaveCount(0);
  const approved = (await calls(page, "PATCH")).filter((call) => call[1].endsWith("/requirements/ytd_financials/evidence/f-pnl"));
  expect(approved[1][2]).toEqual({ decision: "accepted", reason_code: "ai_override", reason: "The client sent the missing months by email", confirmed: true });
  await expect(decision(page)).toContainText("Accepted by staff");
  await expect(decision(page)).toContainText(`A team member approved this file for ${YTD}. Nothing more is needed.`);
  expect(await page.evaluate(() => (window as unknown as { __notices: string[] }).__notices)).toEqual(["Rejected Profit and Loss.pdf.", "Approved Profit and Loss.pdf."]);
  expect(errors).toEqual([]);
});

test("a change that does not save says so where the reviewer is looking", async ({ page }) => {
  await start(page);
  await openFile(page, "Profit and Loss.pdf", YTD);
  await page.evaluate(() => { (window as unknown as { __failNext: string }).__failNext = "^PATCH .*/evidence/f-pnl$"; });
  await decision(page).getByRole("button", { name: "Reject", exact: true }).click();
  const reject = page.getByRole("dialog", { name: "Reject this file" });
  await reject.getByRole("button", { name: "This is not the document this item asks for", exact: true }).click();
  await reject.getByRole("button", { name: "Reject file", exact: true }).click();
  await expect(reject).toContainText("You do not have permission to change this file.");
  await expect(reject).toBeVisible();
  // Nothing changed, and a second try works.
  await reject.getByRole("button", { name: "Reject file", exact: true }).click();
  await expect(reject).toHaveCount(0);
  await expect(decision(page)).toContainText("Staff requested another copy");
});

test("a checklist item that needs a person asks for Approve, and the approval can be removed", async ({ page }, info) => {
  const errors = await start(page);
  await openFile(page, "Business license.pdf", "Business license");
  await expect(decision(page)).toContainText("Needs your approval");
  await expect(decision(page)).toContainText("The AI accepted this file for Business license. This item also needs a person to approve it.");
  await expectRoomForTheDocument(page, info);
  await page.screenshot({ path: info.outputPath("needs-approval.png"), animations: "disabled" });
  await decision(page).getByRole("button", { name: "Approve", exact: true }).click();
  const approve = page.getByRole("dialog", { name: "Approve this file" });
  await approve.getByRole("button", { name: "Approve file", exact: true }).click();
  await expect(approve).toHaveCount(0);
  const patched = (await calls(page, "PATCH")).filter((call) => call[1].endsWith("/requirements/business_license"));
  expect(patched[0][2]).toEqual({ action: "verify", evidence_file_ids: ["f-license"], confirmed: true });
  await expect(decision(page)).toContainText("Accepted by AI");
  await expect(decision(page).getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await shell(page).getByRole("button", { name: "More actions for Business license.pdf", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove the approval", exact: true }).click();
  const remove = page.getByRole("dialog", { name: "Remove the approval" });
  await remove.getByRole("button", { name: "Remove approval", exact: true }).click();
  await expect(remove).toHaveCount(0);
  await expect(decision(page)).toContainText("Needs your approval");
  expect(errors).toEqual([]);
});

test("a file the AI could not read offers a new reading first", async ({ page }, info) => {
  await start(page);
  await openFile(page, "Scan 0042.pdf", "Business tax returns");
  await expect(decision(page)).toContainText("Automatic review unavailable");
  await expect(decision(page)).toContainText("The AI could not read this file, so it has not been checked for Business tax returns.");
  for (const name of ["Read it again", "Approve anyway", "Reject"]) await expect(decision(page).getByRole("button", { name, exact: true })).toBeVisible();
  await expectRoomForTheDocument(page, info);
  await decision(page).getByRole("button", { name: "Read it again", exact: true }).click();
  await expect(decision(page)).toContainText("The AI is still reading this file.");
  expect((await calls(page, "POST")).map((call) => call[1])).toContain("/application-profiles/profile-1/evidence/f-scan/reanalyze");
});

test("a file on two checklist items shows one decision at a time", async ({ page }, info) => {
  await start(page);
  await openFile(page, "Interim statements.pdf", "Business tax returns");
  const item = decision(page).getByRole("combobox", { name: "Checklist item this decision is for", exact: true });
  await expect(item).toHaveValue("business_tax_returns");
  await expect(decision(page)).toContainText("On 2 checklist items.");
  await expect(decision(page)).toContainText("The AI could not accept this file for Business tax returns.");
  await expectRoomForTheDocument(page, info);
  await item.selectOption("ytd_financials");
  await expect(decision(page)).toContainText(`Accepted for ${YTD}.`);
  await expect(decision(page).getByRole("button", { name: "Approve anyway", exact: true })).toHaveCount(0);
});

test("a file on no checklist item is sent to be attached", async ({ page }, info) => {
  await start(page);
  await page.getByRole("tab", { name: /All files/ }).click();
  await page.getByRole("button", { name: "Preview Vendor quote.pdf", exact: true }).click();
  await expect(decision(page)).toContainText("Not on the checklist");
  await expect(decision(page)).toContainText("AI analysis complete. A quote from a supplier. Read as vendor quote (high confidence).");
  await expect(decision(page).getByRole("button", { name: /Approve|Reject/ })).toHaveCount(0);
  await expectRoomForTheDocument(page, info);
  await decision(page).getByRole("button", { name: "Attach to a checklist item", exact: true }).click();
  const attach = page.getByRole("dialog", { name: "Attach to a checklist item" });
  await expect(attach.getByRole("button", { name: "Attach file", exact: true })).toBeDisabled();
  await attach.getByRole("combobox", { name: "Attach it to", exact: true }).selectOption("business_license");
  await attach.getByRole("button", { name: "Attach file", exact: true }).click();
  await expect(attach).toHaveCount(0);
  const linked = (await calls(page, "PATCH")).filter((call) => call[1].endsWith("/requirements/business_license"));
  expect(linked[0][2]).toEqual({ action: "link_evidence", evidence_file_ids: ["f-loose"], confirmed: true });
  await expect(decision(page)).toContainText("Needs your approval");
});

test("someone who cannot answer the business-name question can still read it", async ({ page }) => {
  await start(page, "?readonly");
  await openFile(page, RETURN, YTD);
  await expect(businessName(page)).toContainText("Is it the same business?");
  await expect(businessName(page).getByRole("button", { name: "Yes, same business", exact: true })).toHaveCount(0);
  await businessName(page).getByRole("button", { name: "See details", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Business name on this document" });
  await expect(panel).toContainText("Only underwriting staff can answer this.");
  await expect(panel.getByRole("radio")).toHaveCount(0);
});
