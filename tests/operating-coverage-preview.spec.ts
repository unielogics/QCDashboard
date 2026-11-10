import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Real summary component; fictional backend results, no external services.
let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-operating-coverage-"));
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{OperatingCoverageSummary}from'@/components/file/cockpit/OperatingCoverageSummary';
    const applied={status:'applied',applied:true,version_number:2,annual_impact:24000,first_year_impact:18000,applied_annual_impact:18000,projected_dscr:.25,reason:'One reviewed action is included after timing and implementation costs.'};
    const proposed={...applied,status:'awaiting_review',applied:false,proposed_dscr:.25,first_year_impact:null,proposed_first_year_impact:18000,reason:'The client submitted this plan. Staff review and a saved version are required.'};
    const blocked={...applied,status:'blocked',applied:false,reason:'Reconcile the manual earnings override with this plan before using both.'};
    function App(){const[coverage,setCoverage]=useState(applied),[pending,setPending]=useState(false),[review,setReview]=useState(false);return <main style={{maxWidth:680,margin:'24px auto',padding:16,fontFamily:'Arial,sans-serif'}}><h1 style={{fontSize:20}}>Earnings and coverage</h1><p>Synthetic verification only</p><nav style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}><button onClick={()=>{setCoverage(applied);setPending(false)}}>Reviewed plan</button><button onClick={()=>{setCoverage(proposed);setPending(false)}}>Client proposal</button><button onClick={()=>{setCoverage(blocked);setPending(false)}}>Conflicting override</button><button onClick={()=>setPending(true)}>Recalculate loan</button></nav><OperatingCoverageSummary coverage={coverage} currentDscr={-.5} projectedDscr={.25} currency='USD' pending={pending} onReview={()=>setReview(true)}/>{review?<p role='status'>Shared earnings plan opened</p>:null}</main>};createRoot(document.getElementById('root')).render(<App/>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

test.beforeEach(async ({ page }) => {
  await page.route("http://operating-coverage.test/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><style>body{margin:0;background:#f5f7fa}*{box-sizing:border-box}button{padding:8px;cursor:pointer}</style><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
  await page.goto("http://operating-coverage.test/");
});

test("applied results show the source loss, first-year improvement and separate run-rate", async ({ page }, info) => {
  const summary = page.getByRole("region", { name: "Earnings plan effect on coverage" });
  await expect(summary).toContainText("Reviewed earnings plan included · v2");
  await expect(summary).toContainText("-0.50x");
  await expect(summary).toContainText("0.25x");
  await expect(summary).toContainText("First-year earnings change applied");
  await expect(summary).toContainText("$18,000");
  await expect(summary).toContainText("Full-year run-rate change");
  await expect(summary).toContainText("$24,000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("reviewed-earnings-coverage.png"), fullPage: true });
  await page.getByRole("button", { name: "Recalculate loan", exact: true }).click();
  await expect(summary).toContainText("Calculating…");
  await expect(summary).not.toContainText("0.25x");
});

test("client proposals and overlaps explain the required next action", async ({ page }, info) => {
  const summary = page.getByRole("region", { name: "Earnings plan effect on coverage" });
  await page.getByRole("button", { name: "Client proposal", exact: true }).click();
  await expect(summary).toContainText("Earnings proposal awaiting review");
  await expect(summary).toContainText("Potential DSCR · if reviewed");
  await expect(summary).toContainText("$18,000");
  await expect(summary).not.toContainText("First-year earnings change applied");
  await page.screenshot({ path: info.outputPath("proposed-earnings-coverage.png"), fullPage: true });
  await page.getByRole("button", { name: "Review earnings plan", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Shared earnings plan opened");
  await page.getByRole("button", { name: "Conflicting override", exact: true }).click();
  await expect(summary).toContainText("Earnings plan needs reconciliation");
  await expect(summary).toContainText("Reconcile the manual earnings override");
  await expect(summary).not.toContainText("$18,000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("blocked-earnings-coverage.png"), fullPage: true });
});
