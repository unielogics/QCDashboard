import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileRequestItem, FileRequestRead } from "../src/lib/fileRequestsApi";
import { emptyStaffOperatingBody, staffOperatingEvidence, staffOperatingEvaluation, STAFF_FAMILY } from "./fixtures/staffOperatingSources";
import { REQUEST_PROFILE, syntheticFileRequest, syntheticRequestDelivery } from "./fixtures/fileRequestReceipts";

const ORIGIN = "https://request-files.test", ROOT = `/api/v1/application-profiles/${REQUEST_PROFILE}`;
let script: Buffer, css: Buffer;

// Real entry -> RequestFilesDialog and FinancialWorkspace; only staff identity
// and transport are synthetic. No real file request or notification can leave.
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-request-dialog-"));
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{OperatingPlanEntry}from'@/components/file/cockpit/OperatingPlanEntry';import'@/app/globals.css';import'@/app/app-extras.css';const client=new QueryClient({defaultOptions:{queries:{retry:false}}});function App(){const[count,setCount]=useState(0);return<QueryClientProvider client={client}><main style={{padding:20,maxWidth:1100,margin:'auto'}}><OperatingPlanEntry profileId='${REQUEST_PROFILE}' businessName='Example Studio' canEdit={!location.search.includes('view')} onRequested={()=>setCount(value=>value+1)} onRefresh={()=>{}}/><output aria-label='Request refresh count'>{count}</output></main></QueryClientProvider>}createRoot(document.getElementById('root')).render(<App/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(ORIGIN) }, external: ["node:module", "node:fs", "node:fs/promises", "node:url", "node:path", "@napi-rs/canvas"], loader: { ".module.css": "local-css" }, logLevel: "silent",
    plugins: [{ name: "staff-auth", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /^@\/(hooks\/useApi|lib\/consoleAuth)$/ }, args => ({ path: args.path, namespace: "staff-auth" }));
      build.onLoad({ filter: /.*/, namespace: "staff-auth" }, args => ({ loader: "js", resolveDir: root, contents: args.path.endsWith("consoleAuth") ? "export const useConsoleAuth=()=>({getToken:async()=> 'synthetic-staff-token',isSignedIn:true});" : `import{ApiError}from'@/lib/api';const api=async(path,options={})=>{const response=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic-staff-token',...options.headers}});const data=await response.json();if(!response.ok)throw new ApiError(response.status,typeof data.detail==='string'?data.detail:data.detail?.message||'Synthetic API failure',data);return data};export const useAuthedApi=()=>api;export const useDevUser=()=> 'staff-qa';export const useCurrentUser=()=>({data:{id:'synthetic-staff',role:'loan_exec'}});` }));
    } }],
  });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

type Create = { request_id: string; items: FileRequestItem[]; notify: boolean };
async function fixture(page: Page, options: { viewOnlyEntry?: boolean; createFailure?: boolean; deliveryFailure?: boolean; holdCreate?: boolean } = {}) {
  const creates: Create[] = [], retries: Array<{ retry_id: string }> = [], errors: string[] = [], requests: string[] = [];
  const rows = new Map<string, FileRequestRead>(); let createFailed = false;
  let releaseCreate = () => {};
  const gate = options.holdCreate ? new Promise<void>(resolve => { releaseCreate = resolve; }) : Promise.resolve();
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    if (pathname.startsWith(ROOT)) {
      requests.push(`${request.method()} ${pathname}`); expect(request.headers().authorization).toBe("Bearer synthetic-staff-token");
      if (pathname === `${ROOT}/operating-plan/summary`) return route.fulfill({ json: { has_plan: false, expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: 0, cost_mix: [], evaluation: null } });
      if (pathname === `${ROOT}/file-requests` && request.method() === "GET") return route.fulfill({ json: { requests: [...rows.values()] } });
      if (pathname === `${ROOT}/file-requests` && request.method() === "POST") {
        const payload = request.postDataJSON() as Create; creates.push(payload); await gate;
        if (options.createFailure && !createFailed) { createFailed = true; return route.fulfill({ status: 500, json: { detail: "Synthetic request creation failure" } }); }
        const notification = payload.notify ? syntheticRequestDelivery(options.deliveryFailure ? "failed" : "sent") : null;
        if (!rows.has(payload.request_id)) rows.set(payload.request_id, syntheticFileRequest(payload.request_id, payload.items, notification));
        return route.fulfill({ json: { requests: [...rows.values()], request_id: payload.request_id, notification } });
      }
      if (pathname.endsWith("/retry")) {
        retries.push(request.postDataJSON()); const notification = syntheticRequestDelivery("sent");
        const row = rows.get(pathname.split("/").at(-2)!); if (!row) throw Error("Retry did not target the saved request");
        row.deliveries.push(notification); return route.fulfill({ json: { notification } });
      }
      if (pathname === `${ROOT}/financial-workspace`) return route.fulfill({ json: { kind: "operating_plan", family_id: STAFF_FAMILY, label: "Operating expenses and earnings plan", body: emptyStaffOperatingBody, schema: {}, worksheet: { layout: { kind: "operating_plan", title: "Operating plan", schema_version: "test", layout_version: "test", name_prefix: "test", columns: [], rows: [], freeze: [0, 0] }, values: {}, computed: {} }, draft: { revision: 1, base_version_id: null, updated_at: "2027-01-01T12:00:00Z", dirty: false }, current_version_id: null, versions: [], families: [], evidence: [] } });
      if (pathname.endsWith("/operating-plan/evidence")) return route.fulfill({ json: staffOperatingEvidence });
      if (pathname.endsWith("/operating-plan/evaluate")) return route.fulfill({ json: { evaluation: staffOperatingEvaluation, evidence: staffOperatingEvidence, guidance: staffOperatingEvidence.guidance, context_stamp: "a".repeat(64) } });
      throw Error(`Unexpected request ${request.method()} ${pathname}`);
    }
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
  await page.goto(`${ORIGIN}/${options.viewOnlyEntry ? "?view" : ""}`);
  await expect(page.getByText("No plan yet", { exact: true })).toBeVisible();
  return { creates, retries, rows, requests, errors, releaseCreate };
}
async function openRequest(page: Page) {
  await page.getByRole("button", { name: "Request client plan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Request files", exact: true });
  await expect(dialog.getByLabel("Document 1 type", { exact: true })).toHaveValue("operating_plan");
  return dialog;
}

for (const viewOnlyEntry of [false, true]) test(`empty plan has a visible opening action (${viewOnlyEntry ? "view" : "edit"} entry)`, async ({ page }, info) => {
  const state = await fixture(page, { viewOnlyEntry });
  const open = page.getByRole("button", { name: "Open earnings plan", exact: true });
  await expect(open).toHaveText("Open earnings plan"); await expect(open).toBeInViewport();
  if (viewOnlyEntry) await expect(page.getByRole("button", { name: "Request client plan", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("empty-plan-action.png"), animations: "disabled" });
  await open.click();
  const workspace = page.getByRole("dialog", { name: "Financial workspace", exact: true });
  await expect(workspace.getByRole("button", { name: "Guided steps", exact: true })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Draft from tax/P&L", exact: true })).toBeEnabled();
  expect(state.requests.some(path => path.includes("/financial-workspace"))).toBe(true);
  expect(state.creates).toEqual([]); expect(state.errors).toEqual([]);
});

test("request dialog submits the operating form and displays the accepted delivery receipt", async ({ page }, info) => {
  const state = await fixture(page), dialog = await openRequest(page);
  await dialog.getByRole("button", { name: "Save and email request", exact: true }).click();
  await expect(dialog).toContainText("Requests saved. The client email was accepted for delivery.");
  expect(state.creates).toHaveLength(1);
  expect(state.creates[0]).toMatchObject({ notify: true, items: [{ document_type: "operating_plan", name: "Operating expenses and earnings plan", quantity: 1, unit: "files", subject: "Example Studio", period: "current" }] });
  expect(state.creates[0].request_id).toMatch(/^[a-f0-9-]{36}$/);
  await expect(dialog.getByRole("region", { name: "File request history" })).toContainText("Operating expenses and earnings plan");
  await expect(page.getByLabel("Request refresh count", { exact: true })).toHaveText("1");
  await page.screenshot({ path: info.outputPath("request-created.png"), animations: "disabled" });
  expect(state.errors).toEqual([]);
});

test("failed creation preserves edits and retries the same request identity", async ({ page }) => {
  const state = await fixture(page, { createFailure: true }), dialog = await openRequest(page);
  await dialog.getByLabel("Document 1 instructions", { exact: true }).fill("Retain this operating-plan request after a failed response.");
  await dialog.getByRole("button", { name: "Save and email request", exact: true }).click();
  await expect(dialog).toContainText("Synthetic request creation failure");
  await expect(dialog.getByLabel("Document 1 instructions", { exact: true })).toHaveValue("Retain this operating-plan request after a failed response.");
  await dialog.getByRole("button", { name: "Save and email request", exact: true }).click();
  await expect(dialog).toContainText("Requests saved. The client email was accepted for delivery.");
  expect(state.creates).toHaveLength(2); expect(state.creates[1]).toEqual(state.creates[0]); expect(state.rows.size).toBe(1);
  expect(state.errors).toEqual([]);
});

test("notification failure is a saved request and retry targets only its delivery", async ({ page }) => {
  const state = await fixture(page, { deliveryFailure: true }), dialog = await openRequest(page);
  await dialog.getByRole("button", { name: "Save and email request", exact: true }).click();
  await expect(dialog).toContainText("Requests saved. The email could not be delivered; retry it below.");
  await dialog.getByRole("button", { name: "Retry email", exact: true }).click();
  await expect(dialog).toContainText("The request email was sent.");
  expect(state.creates).toHaveLength(1); expect(state.retries).toHaveLength(1); expect(state.rows.size).toBe(1);
  expect(state.retries[0].retry_id).toMatch(/^[a-f0-9-]{36}$/); expect(state.errors).toEqual([]);
});

test("room-only request does not ask the service to notify the client", async ({ page }) => {
  const state = await fixture(page), dialog = await openRequest(page);
  await dialog.getByRole("checkbox", { name: "Email the client one message with every requested item", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(dialog).toContainText("Requests saved in the client’s secure room.");
  expect(state.creates[0].notify).toBe(false); expect(state.retries).toEqual([]); expect([...state.rows.values()][0].deliveries).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("pending creation blocks double submission and keeps the request dialog open", async ({ page }) => {
  const state = await fixture(page, { holdCreate: true }), dialog = await openRequest(page);
  await dialog.getByRole("button", { name: "Save and email request", exact: true }).dblclick();
  await expect.poll(() => state.creates.length).toBe(1);
  await expect(dialog.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(dialog.locator(".drawer-f").getByRole("button", { name: "Close", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  state.releaseCreate();
  await expect(dialog).toContainText("Requests saved. The client email was accepted for delivery.");
  expect(state.creates).toHaveLength(1); expect(state.errors).toEqual([]);
});
