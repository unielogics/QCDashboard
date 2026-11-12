import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Render the production section, hooks and design system. Only identity and the
// remote transport are fictional; no merchant catalog or SFTP server is touched.
let script: string, css: string;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-chatgpt-feed-"));
  const mocks: Record<string, string> = {
    "@/hooks/useApi": "export const useAuthedApi=()=>window.fixtureApi;export const useDevUser=()=> 'admin@qc.dev';export const useCurrentUser=()=>({authReady:true,isLoading:false,data:{id:'fictional-admin',role:new URLSearchParams(location.search).get('role')||'super_admin',account_status:'active'}});",
    "@/lib/consoleAuth": "const getToken=async()=> 'fictional-token';export const useConsoleAuth=()=>({getToken});",
    "@/lib/api": "export const apiBase=location.origin;export class ApiError extends Error{};",
  };
  const result = await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{ChatgptProductFeedSection}from'@/components/settings/ChatgptProductFeedSection';
      window.requests=[];window.failSave=false;window.failSync=false;
      const valid=new URLSearchParams(location.search).get('valid')==='1';
      let settings={revision:1,enabled:false,acceptance_confirmed:valid,acceptance_reference:valid?'Fictional acceptance and price instructions':'',sftp_host:'sftp.example.com',sftp_port:22,sftp_username:'qc',server_fingerprint:'SHA256:fictional',remote_directory:'/import',staging_directory:'/staging',staging_isolation_confirmed:false,filename:'qualified-commercial.csv.gz',schedule_hour_utc:10,brand:'Qualified Commercial',seller_name:'Qualified Commercial',catalog_overrides:{},public_key:null,private_key_configured:valid,delivery_verified_at:valid?'2026-11-12T15:00:00Z':null};
      const offers=[{item_id:'merchant_cash_advance',kind:'funding_program',priority:1,title:'MCA working capital',description:'Published factor pricing is not APR.',url:'https://example.com/mca',image_url:'https://example.com/mca.png',source_revision:'source-v1',commercial_terms_version:2},{item_id:'ez_term',kind:'funding_program',priority:2,title:'EZ Term loan',description:'Published term loan.',url:'https://example.com/ez',image_url:'https://example.com/ez.png',source_revision:'source-v1',commercial_terms_version:1},{item_id:'capital_os',kind:'service',priority:3,title:'Capital OS consulting',description:'Software plus working sessions.',url:'https://example.com/audit',image_url:'https://example.com/audit.png',source_revision:'source-v1'}];
      const preview=(s)=>{const items=offers.map(item=>{const o=s.catalog_overrides[item.item_id]||{};const issues=valid?[]:['An actual payable price has not been confirmed.','Review the public copy and source.'];return {...item,title:o.title??item.title,description:o.description??item.description,brand:s.brand,seller_name:s.seller_name,availability:'unknown',price:o.actual_price?o.actual_price+' USD':null,included:o.included!==false,eligible:valid&&o.included!==false,issues}});return{generated_at:'2026-11-12T15:00:00Z',source_count:3,eligible_count:items.filter(x=>x.eligible).length,excluded_count:items.filter(x=>!x.eligible).length,ready_for_upload:valid,blockers:valid?[]:['OpenAI financing acceptance and pricing instructions are pending.'],items}};
      let runs=[];window.fixtureApi=async(url,init={})=>{const path=new URL(url,location.origin).pathname;const method=init.method||'GET';const body=init.body?JSON.parse(init.body):null;window.requests.push({path,method,body});await new Promise(resolve=>setTimeout(resolve,20));
        if(path.endsWith('/settings')){if(method==='PUT'){if(window.failSave){window.failSave=false;throw new Error('Fictional save failed. Retry without losing edits.')}settings={...settings,...body,revision:settings.revision+1}}return structuredClone(settings)}
        if(path.endsWith('/key-pair')){settings={...settings,revision:settings.revision+1,public_key:'ssh-ed25519 FICTIONAL-PUBLIC',private_key_configured:true};return structuredClone(settings)}
        if(path.endsWith('/preview'))return preview(body?.settings||settings);
        if(path.endsWith('/runs'))return runs;
        if(path.endsWith('/test-connection')){settings={...settings,delivery_verified_at:'2026-11-12T15:00:00Z'};return{ok:true,message:'Fictional completed-file delivery verified.',settings:structuredClone(settings)}}
        if(path.endsWith('/sync')){const run={id:'fictional-run',status:'uploaded',trigger:'manual',attempt_count:1,created_at:'2026-11-12T15:00:00Z',eligible_count:3,excluded_count:0,processing_status:'not_verified'};runs=[run];if(window.failSync){window.failSync=false;throw new Error('Fictional response lost after upload was queued.')}return run}throw new Error('Unexpected fixture endpoint');
      };createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ChatgptProductFeedSection/></QueryClientProvider>);
    ` }, bundle: true, write: false, outfile: path.join(directory, "fixture.js"), format: "iife", jsx: "automatic", platform: "browser",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    plugins: [{ name: "fictional-identity", setup(build: { onResolve: (options: unknown, callback: (args: { path: string }) => unknown) => void; onLoad: (options: unknown, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /.*/ }, ({ path: name }) => mocks[name] ? { path: name, namespace: "fictional" } : name.startsWith("@/") ? { path: require.resolve(path.join(root, "src", name.slice(2))) } : null);
      build.onLoad({ filter: /.*/, namespace: "fictional" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx" }));
    } }],
  });
  script = result.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  css = (await readFile(path.join(root, "src/app/globals.css"), "utf8")) + "\n" + (await readFile(path.join(root, "src/app/app-extras.css"), "utf8")) + "\n" + result.outputFiles.find((file: { path: string }) => file.path.endsWith(".css")).text;
});

test.beforeEach(async ({ page }) => {
  await page.route("https://example.com/**", async (route) => { await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6kE8AAAAASUVORK5CYII=", "base64") }); });
  await page.route("https://fictional-feed.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({ contentType: pathname === "/fixture.js" ? "application/javascript" : pathname === "/fixture.css" ? "text/css" : "text/html", body: pathname === "/fixture.js" ? script : pathname === "/fixture.css" ? css : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main style="padding:20px;max-width:1400px;margin:auto"><div id="root"></div></main><script src="/fixture.js"></script></body></html>' });
  });
});

test("pending acceptance stays paused; failed saves and key setup preserve the working copy", async ({ page }) => {
  await page.goto("https://fictional-feed.test/");
  await expect(page.getByRole("button", { name: "Sync now", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: /MCA working capital/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Offer image: MCA working capital" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open product page", exact: true })).toHaveAttribute("href", "https://example.com/mca");
  await page.getByLabel("Public description", { exact: true }).fill("My reviewed underwriting and funding copy.");
  await page.getByRole("button", { name: "Create dedicated key" }).click();
  await expect(page.getByLabel("SSH public key")).toHaveValue("ssh-ed25519 FICTIONAL-PUBLIC");
  await expect(page.getByLabel("Public description", { exact: true })).toHaveValue("My reviewed underwriting and funding copy.");
  await page.evaluate(() => { (window as unknown as { failSave: boolean }).failSave = true; });
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Fictional save failed");
  await expect(page.getByLabel("Public description", { exact: true })).toHaveValue("My reviewed underwriting and funding copy.");
  await page.getByLabel("I reviewed this copy and its current published source.").check();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save settings", exact: true })).toBeDisabled();
  const payload = await page.evaluate(() => (window as unknown as { requests: Array<{method: string; body: unknown}> }).requests.filter((request) => request.method === "PUT").at(-1)?.body);
  expect(payload).toMatchObject({ revision: 2, catalog_overrides: { merchant_cash_advance: { description: "My reviewed underwriting and funding copy.", content_approved: true, approved_source_revision: "source-v1" } } });
  expect(payload).not.toHaveProperty("public_key");
  await expect(page.getByRole("button", { name: "Sync now", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("chatgpt-feed-settings.png"), fullPage: true });
});

test("a validated saved catalog uploads with a durable idempotency key and distinct processing status", async ({ page }) => {
  await page.goto("https://fictional-feed.test/?valid=1");
  await expect(page.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.getByText("Uploaded · processing not verified", { exact: true })).toBeVisible();
  const requests = await page.evaluate(() => (window as unknown as { requests: Array<{path: string; body: {idempotency_key?: string}}> }).requests.filter((request) => request.path.endsWith("/sync")));
  expect(requests).toHaveLength(1);
  expect(requests[0].body.idempotency_key).toMatch(/^[a-f0-9-]{36}$/);
});

test("a non-admin direct link never loads or mutates the catalog connection", async ({ page }) => {
  await page.goto("https://fictional-feed.test/?role=client");
  await expect(page.getByText("Super-admin access is required", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { requests: unknown[] }).requests)).toHaveLength(0);
});

test("retrying a lost sync response keeps the same upload identity", async ({ page }) => {
  await page.goto("https://fictional-feed.test/?valid=1");
  await expect(page.getByRole("button", { name: "Sync now", exact: true })).toBeEnabled();
  await page.evaluate(() => { (window as unknown as { failSync: boolean }).failSync = true; });
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Fictional response lost");
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.getByText("Uploaded · processing not verified", { exact: true })).toBeVisible();
  const keys = await page.evaluate(() => (window as unknown as { requests: Array<{path: string; body: {idempotency_key?: string}}> }).requests.filter((request) => request.path.endsWith("/sync")).map((request) => request.body.idempotency_key));
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});
