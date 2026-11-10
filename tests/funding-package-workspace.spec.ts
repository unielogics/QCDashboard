import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let script: Buffer;
let css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const viteRequire = createRequire(createRequire(projectRequire.resolve("vitest/package.json")).resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  const output = await mkdtemp(path.join(os.tmpdir(), "qc-funding-package-"));
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{FundingPackageWorkspace}from'@/components/file/FundingPackageWorkspace';
    function App(){const[tab,setTab]=useState('summary');const[profile,setProfile]=useState('file-a');const[result,setResult]=useState('');const[error,setError]=useState(null);const[ready,setReady]=useState(false);const[revision,setRevision]=useState(1);const[value,setValue]=useState('');const[busy,setBusy]=useState(false);const[generating,setGenerating]=useState(false);const[preparation,setPreparation]=useState(null);const asyncMode=new URLSearchParams(location.search).has('async');
      const dscr=new URLSearchParams(location.search).has('healthy')?1.2:-0.26;const cockpit={profile_id:profile,requested_amount:200000,dscr:{headline:{value:dscr,label:'2025 business return'}},plan:null};
      return <><button onClick={()=>setRevision(revision+1)}>Refresh figures</button><button onClick={()=>setProfile('file-b')}>Change file</button>{asyncMode?<><button onClick={()=>setBusy(!busy)}>Toggle unrelated operation</button><button onClick={()=>{setBusy(false);setGenerating(false);setError('Package generation failed');setPreparation({state:'error',title:'Package preparation needs attention',description:'Package generation failed. Your prior package remains available. Retry generation after correcting the issue.'})}}>Fail preparation</button><button onClick={()=>{setBusy(false);setGenerating(false);setReady(true);setPreparation({state:'complete',title:'Investor package ready',description:'Versioned PDFs are saved.',steps:[{label:'Create and save PDFs',status:'complete'},{label:'Preview opened',status:'complete'}]})}}>Finish preparation</button></>:null}<output aria-label="Generation options">{result}</output><FundingPackageWorkspace key={profile} profileId={profile} cockpit={cockpit} activeTab={tab} onTab={setTab} generated={ready} current={ready} busy={busy} generating={generating} preparation={preparation} error={error} onGenerate={options=>{setResult(JSON.stringify(options));setError(null);if(asyncMode){setBusy(true);setGenerating(true);setPreparation({state:'loading',title:'Preparing investor package',description:'Creating the versioned PDFs.',steps:[{label:'Create and save PDFs',status:'active'},{label:'Open preview',status:'pending'}]})}else if(new URLSearchParams(location.search).has('fail'))setError('Package generation failed');else setReady(true)}} packageContent={<a href="#saved">Prior immutable package</a>} marketplaceContent={<label>Offering amount<input value={value} onChange={e=>setValue(e.target.value)}/></label>} deliveryContent={<p>Delivery actions</p>} historyContent={<p>Immutable PDF versions</p>}/></>};createRoot(document.getElementById('root')).render(<App/>);` }, outfile: path.join(output, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
  script = await readFile(path.join(output, "app.js")); css = await readFile(path.join(output, "app.css"));
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const name = new URL(route.request().url()).pathname;
    if (name === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (name === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (name !== "/") throw new Error(`Unexpected external request: ${name}`);
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
});

test("low coverage recommends a plan while explicit choices survive refresh and are sent to generation", async ({ page }) => {
  await page.goto("http://funding.test/");
  const include = page.getByLabel("Include operating expenses and earnings plan", { exact: true });
  await expect(include).toBeChecked();
  await expect(page.getByText("Recommended: current DSCR", { exact: false })).toContainText("below 1.10x");
  await include.uncheck();
  await page.getByRole("button", { name: "Refresh figures", exact: true }).click();
  await expect(include).not.toBeChecked();
  await include.check();
  await page.getByLabel("Include the current working plan as an unreviewed draft", { exact: true }).check();
  await page.getByRole("button", { name: "Generate package + preview", exact: true }).click();
  await expect(page.getByLabel("Generation options", { exact: true })).toHaveText('{"include_operating_plan":true,"include_working_operating_plan":true}');
  await expect(page.getByRole("button", { name: "Continue to marketplace", exact: false })).toBeEnabled();
  await page.getByRole("tab", { name: "Marketplace listing", exact: false }).click();
  await page.getByLabel("Offering amount", { exact: true }).fill("200000");
  await page.getByRole("tab", { name: "Package & presentation", exact: false }).click();
  await page.getByRole("tab", { name: "Marketplace listing", exact: false }).click();
  await expect(page.getByLabel("Offering amount", { exact: true })).toHaveValue("200000");
});

test("a healthy file can opt into a plan and a generation error retains prior PDFs", async ({ page }) => {
  await page.goto("http://funding.test/?healthy&fail");
  const include = page.getByLabel("Include operating expenses and earnings plan", { exact: true });
  await expect(include).not.toBeChecked();
  await include.check();
  await page.getByRole("button", { name: "Generate package + preview", exact: true }).click();
  await expect(page.getByText("Package generation failed", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prior immutable package", exact: true })).toBeVisible();
  await expect(page.getByLabel("Generation options", { exact: true })).toHaveText('{"include_operating_plan":true,"include_working_operating_plan":false}');
  await expect(page.getByRole("button", { name: "Continue to marketplace", exact: false })).toBeDisabled();
});

test("package preparation stays pending until completion and supports failure and retry", async ({ page }) => {
  await page.goto("http://funding.test/?async");
  await page.getByRole("button", { name: "Generate package + preview", exact: true }).click();
  const pending = page.getByRole("progressbar", { name: "Preparing investor package", exact: true });
  await expect(pending).toBeVisible();
  await expect(pending).not.toHaveAttribute("aria-valuenow");
  await expect(page.getByRole("button", { name: "Building package…", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Include operating expenses and earnings plan", { exact: true })).toBeDisabled();
  await expect(page.getByText("Open preview", { exact: true }).locator("..")).toHaveAttribute("data-status", "pending");
  await page.getByRole("tab", { name: "Version history", exact: false }).click();
  await expect(pending).toBeVisible();
  await page.getByRole("button", { name: "Fail preparation", exact: true }).click();
  await expect(page.getByText("Package generation failed.", { exact: false })).toHaveCount(1);
  await expect(page.getByRole("progressbar", { name: "Package preparation needs attention", exact: true })).not.toHaveAttribute("aria-valuenow");
  await page.getByRole("tab", { name: "Package & presentation", exact: false }).click();
  await expect(page.getByRole("link", { name: "Prior immutable package", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate package + preview", exact: true }).click();
  await expect(pending).toBeVisible();
  await expect(page.getByText("Package generation failed.", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Finish preparation", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Investor package ready", exact: true })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByRole("button", { name: "Refresh package + preview", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continue to marketplace", exact: false })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("an unrelated operation disables generation without claiming the package is building", async ({ page }) => {
  await page.goto("http://funding.test/?async");
  await page.getByRole("button", { name: "Toggle unrelated operation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Generate package + preview", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Building package…", exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});
