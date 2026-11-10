import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketplace-publication-"));
  await writeFile(path.join(directory, "api.js"), "export const useAuthedApi=()=>window.fixtureApi;export const useCurrentUser=()=>({data:{role:'super_admin'}});");
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{MarketplacePublishStrip}from'@/components/marketplace/MarketplacePublishStrip';import'@/app/globals.css';import'@/app/app-extras.css';
    window.requests=[];window.copied=[];window.publication=null;window.copyFails=false;let status='draft',denied=false;let releaseSecond=null;window.releaseSecond=()=>{releaseSecond?.();releaseSecond=null};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.copyFails)throw Error('Clipboard blocked');window.copied.push(value)}}});
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    window.fixtureApi=async(url,options)=>{window.requests.push({url,method:options?.method??'GET'});if(url.endsWith('/marketplace-publication')){if(denied)throw Error('Forbidden');if(url.includes('/second-file/'))await new Promise(resolve=>releaseSecond=resolve);return{profile_id:url.includes('/second-file/')?'second-file':'first-file',can_manage:true,listing:{id:'internal-id',ref:url.includes('/second-file/')?'QC-SECOND':'QC-0042',name:'Synthetic offering',status,published_at:status==='draft'?null:'2026-11-09T12:00:00Z'}}}if(url.includes('/sources/lookup'))return{listing:{id:'internal-id',ref:'QC-0042',name:'Synthetic offering',status},sync:{published:true,published_at:'2026-11-09T12:00:00Z',up_to_date:true,changed:[]}};if(url.endsWith('/publish-package')||url.endsWith('/refresh-snapshot'))return{id:'internal-id',ref:'QC-0042',status};throw Error('Unexpected request '+url)};
    function App(){const[canPublish,setCanPublish]=useState(!window.location.search.includes('readonly')),[profile,setProfile]=useState('first-file');const refresh=()=>client.invalidateQueries({queryKey:['cp-sources']});return <QueryClientProvider client={client}><main className='grid' style={{padding:24,maxWidth:1000,alignContent:'start'}}><div className='row' style={{flexWrap:'wrap'}}><button onClick={()=>{status='open';refresh()}}>Use published offer</button><button onClick={()=>{status='withdrawn';refresh()}}>Use withdrawn offer</button><button onClick={()=>setCanPublish(false)}>Read-only underwriter</button><button onClick={()=>{denied=true;refresh()}}>Deny status read</button><button onClick={()=>{denied=false}}>Restore read permission</button><button onClick={()=>setProfile('second-file')}>Open second file</button></div><MarketplacePublishStrip profileId={profile} packageInSync canPublish={canPublish} onPublicationState={state=>{window.publication=state}}/><output data-testid='role'>{canPublish?'Super admin':'Underwriter'}</output></main></QueryClientProvider>};createRoot(document.getElementById('root')).render(<App/>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@/hooks/useApi": path.join(directory, "api.js"), "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});
test.beforeEach(async ({ page }) => {
  await page.route("http://localhost:3405/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
});

test("a pushed draft package is not a published offer and cannot be shared", async ({ page }, info) => {
  await page.goto("http://localhost:3405/");
  await expect(page.getByText("Offer draft · not published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy investor link", exact: true })).toBeDisabled();
  await expect(page.getByText(/Listing package up to date/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).publication.isPublished)).toBe(false);
  await page.getByRole("button", { name: "Update listing package", exact: true }).click();
  await expect(page.getByText(/A draft still needs Publish offer/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).publication.isPublished)).toBe(false);
  expect(await page.evaluate(() => (window as any).requests.filter((request: any) => request.method !== "GET").map((request: any) => request.url))).toEqual(["/capital/admin/listings/internal-id/publish-package"]);
  await page.screenshot({ path: info.outputPath("draft-package-separate-from-publication.png"), fullPage: true });
});

test("a read-only underwriter can copy the gated investor URL without admin controls", async ({ page }, info) => {
  await page.goto("http://localhost:3405/?readonly");
  await page.getByRole("button", { name: "Use published offer", exact: true }).click();
  await expect(page.getByText("Offer published", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update listing package", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Manage listing|Review and publish/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open investor view", exact: true })).toHaveAttribute("href", "https://capital.qualifiedcommercial.com/marketplace/QC-0042");
  await page.getByRole("button", { name: "Copy investor link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Investor link copied", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).copied)).toEqual(["https://capital.qualifiedcommercial.com/marketplace/QC-0042"]);
  expect(await page.evaluate(() => (window as any).publication)).toMatchObject({ profileId: "first-file", listingId: "internal-id", isPublished: true, error: false });
  expect(await page.evaluate(() => (window as any).requests.filter((request: any) => request.url.startsWith("/capital/admin/")))).toEqual([]);
  await expect(page.getByText(/Client delivery and acceptance are tracked separately/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("published-investor-link.png"), fullPage: true });
});

test("withdrawn offers and failed status reads cannot complete publication", async ({ page }) => {
  await page.goto("http://localhost:3405/");
  await page.getByRole("button", { name: "Use withdrawn offer", exact: true }).click();
  await expect(page.getByText("Offer withdrawn", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy investor link", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).publication.isPublished)).toBe(false);
  await page.getByRole("button", { name: "Deny status read", exact: true }).click();
  await expect(page.getByText("Offer publication could not be verified.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).publication)).toMatchObject({ isPublished: false, error: true, memberUrl: null });
  await page.getByRole("button", { name: "Restore read permission", exact: true }).click();
  await page.getByRole("button", { name: "Retry publication status", exact: true }).click();
  await expect(page.getByText("Offer withdrawn", { exact: true })).toBeVisible();
});

test("copy failure exposes the same safe URL and switching files clears the prior link", async ({ page }) => {
  await page.goto("http://localhost:3405/");
  await page.getByRole("button", { name: "Use published offer", exact: true }).click();
  await expect(page.getByText("Offer published", { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).copyFails = true; });
  await page.getByRole("button", { name: "Copy investor link", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Investor link", exact: true })).toHaveValue("https://capital.qualifiedcommercial.com/marketplace/QC-0042");
  await page.getByRole("button", { name: "Open second file", exact: true }).click();
  await expect(page.getByText("Checking offer publication…", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open investor view", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).publication)).toMatchObject({ profileId: "second-file", isPublished: false, loading: true, memberUrl: null });
  await page.evaluate(() => (window as any).releaseSecond());
  await expect(page.getByRole("link", { name: "Open investor view", exact: true })).toHaveAttribute("href", "https://capital.qualifiedcommercial.com/marketplace/QC-SECOND");
  await expect(page.getByRole("textbox", { name: "Investor link", exact: true })).toHaveCount(0);
});

