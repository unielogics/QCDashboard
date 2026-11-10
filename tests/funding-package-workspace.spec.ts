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
    function App(){const[tab,setTab]=useState('summary');const[profile,setProfile]=useState('file-a');const[result,setResult]=useState('');const[error,setError]=useState(null);const[ready,setReady]=useState(false);const[revision,setRevision]=useState(1);const[value,setValue]=useState('');
      const dscr=new URLSearchParams(location.search).has('healthy')?1.2:-0.26;const cockpit={profile_id:profile,requested_amount:200000,dscr:{headline:{value:dscr,label:'2025 business return'}},plan:null};
      return <><button onClick={()=>setRevision(revision+1)}>Refresh figures</button><button onClick={()=>setProfile('file-b')}>Change file</button><output aria-label="Generation options">{result}</output><FundingPackageWorkspace key={profile} profileId={profile} cockpit={cockpit} activeTab={tab} onTab={setTab} generated={ready} current={ready} busy={false} error={error} onGenerate={options=>{setResult(JSON.stringify(options));setError(null);if(new URLSearchParams(location.search).has('fail'))setError('Package generation failed');else setReady(true)}} packageContent={<a href="#saved">Prior immutable package</a>} marketplaceContent={<label>Offering amount<input value={value} onChange={e=>setValue(e.target.value)}/></label>} deliveryContent={<p>Delivery actions</p>} historyContent={<p>Immutable PDF versions</p>}/></>};createRoot(document.getElementById('root')).render(<App/>);` }, outfile: path.join(output, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
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
