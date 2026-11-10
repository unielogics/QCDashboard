import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const output = await mkdtemp(path.join(os.tmpdir(), "qc-investor-collateral-"));
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useCallback,useState}from'react';import{createRoot}from'react-dom/client';import{InvestorCollateralEditor}from'@/components/file/InvestorCollateralEditor';import{InvestorSourceReferences}from'@/components/file/InvestorSourceReferences';import{ApiError}from'@/lib/api';import'@/app/globals.css';import'@/app/app-extras.css';
    const property={id:'11111111-1111-4111-8111-111111111111',address:{street:'12 Example St',city:'Miami',state:'FL',postal_code:'33101'},owner_name:'Example LLC',estimated_value:'250000.00',existing_liens_total:'0.00',available_lien_amount:null,proposed_lien_position:1,currency:'USD',source_file_ids:[]};
    const initial={profile_id:'profile',enabled:true,revision:2,can_edit:true,properties:[property],property_options:[{...property,id:'22222222-2222-4222-8222-222222222222',label:'34 Schedule Ave',address:{street:'34 Schedule Ave',city:'Miami',state:'FL',postal_code:'33102'},currency:null}],source_file_options:[{id:'source',label:'Property valuation.pdf'}]};
    function App(){const[open,setOpen]=useState(true),[refs,setRefs]=useState(false),[data,setData]=useState(initial),[saved,setSaved]=useState(null),[attempt,setAttempt]=useState(0);const loadRefs=useCallback(async()=>({available:true,artifact_id:'report',generation_id:'generation-one',analysis_notes:[{section:'operating_plan',label:'Frozen proposal notes',text:'Full documented assumptions and explanations remain frozen with this report version, even after the working plan changes.'}],references:Array.from({length:31},(_,index)=>({id:'S'+(index+1),label:index===0?'Private owner name and 123-45-6789':'Business bank statement '+index,kind:index===0?'owner_credit':'bank_statement',period:'2025-12',version_number:2,pages:[1,2],metric_keys:index===0?['credit_summary']:['monthly_activity'],status:'used'}))}),[]);return <><button onClick={()=>setOpen(true)}>Open collateral</button><button onClick={()=>setRefs(true)}>Open references</button><output aria-label="Saved collateral payload" style={{display:"block",maxHeight:80,overflow:"auto",overflowWrap:"anywhere"}}>{JSON.stringify(saved)}</output><InvestorCollateralEditor open={open} data={data} load={async()=>data} save={async input=>{setAttempt(attempt+1);if(new URLSearchParams(location.search).has('fail')&&attempt===0)throw Error('Temporary save failure');if(new URLSearchParams(location.search).has('conflict'))throw new ApiError(409,'Changed');setSaved(input);const next={...data,...input,revision:3};setData(next);return next}} onSaved={()=>{}} onClose={()=>setOpen(false)}/><InvestorSourceReferences open={refs} artifact={{id:'report',created_at:'2026-11-10T00:00:00Z',version:2}} load={loadRefs} onClose={()=>setRefs(false)}/></>};createRoot(document.getElementById('root')).render(<App/>);` }, outfile: path.join(output, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
  script = await readFile(path.join(output, "app.js")); css = await readFile(path.join(output, "app.css"));
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (pathname !== "/") throw Error(`Unexpected external request: ${pathname}`);
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body style="font-family:system-ui;--surface:#fff;--line:#ddd;--ink:#15202d;--muted:#667;--accent:#3853a4;--sunken2:#f4f6fa"><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
});

test("collateral keeps unknowns and entries through disable, remove/restore and failed-save retry", async ({ page }) => {
  await page.goto("http://localhost/?fail");
  await expect(page.getByLabel("Property 1 estimated property value", { exact: true })).toHaveValue("250000.00");
  await expect(page.getByLabel("Property 1 available lien amount", { exact: true })).toHaveValue("");
  await page.getByLabel("Include collateral in the financing proposal", { exact: true }).uncheck();
  await expect(page.getByLabel("Property 1 street address", { exact: true })).toHaveValue("12 Example St");
  await page.getByRole("button", { name: "Remove collateral property 1", exact: true }).click();
  await page.getByText("Removed in this edit", { exact: false }).click();
  await page.getByRole("button", { name: "Restore property", exact: true }).click();
  await page.getByRole("button", { name: "Save collateral", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Temporary save failure");
  await expect(page.getByLabel("Property 1 street address", { exact: true })).toHaveValue("12 Example St");
  await page.getByRole("button", { name: "Save collateral", exact: true }).click();
  const saved = JSON.parse(await page.getByLabel("Saved collateral payload").innerText());
  expect(saved.expected_revision).toBe(2); expect(saved.enabled).toBe(false); expect(saved.properties).toHaveLength(1); expect(saved.properties[0].available_lien_amount).toBeNull(); expect(saved.properties[0].existing_liens_total).toBe(0);
});

test("an existing schedule property needs an explicit currency and is not added twice", async ({ page }) => {
  await page.goto("http://localhost/");
  await page.getByLabel("Use existing real estate property", { exact: true }).selectOption('22222222-2222-4222-8222-222222222222');
  await expect(page.getByLabel("Property 2 currency", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save collateral", exact: true })).toBeDisabled();
  await page.getByLabel("Use existing real estate property", { exact: true }).selectOption('22222222-2222-4222-8222-222222222222');
  await expect(page.getByLabel("Property 3 street address", { exact: true })).toHaveCount(0);
  await page.getByLabel("Property 2 currency", { exact: true }).fill("USD");
  await page.getByRole("button", { name: "Save collateral", exact: true }).click();
  await expect(page.getByLabel("Saved collateral payload")).toContainText('real_estate_property_id');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("collateral-editor.png") });
});

test("a conflict retains edits until an explicit reload", async ({ page }) => {
  await page.goto("http://localhost/?conflict");
  await page.getByLabel("Property 1 available lien amount", { exact: true }).fill("100000");
  await page.getByRole("button", { name: "Save collateral", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("changed in another session");
  await expect(page.getByLabel("Property 1 available lien amount", { exact: true })).toHaveValue("100000");
  await expect(page.getByRole("button", { name: "Save collateral", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Discard edits and reload saved collateral", exact: true }).click();
  await expect(page.getByLabel("Property 1 available lien amount", { exact: true })).toHaveValue("");
});

test("other assets can be offered without real estate and keep supporting files through removal and restoration", async ({ page }) => {
  await page.goto("http://localhost/");
  await page.getByRole("button", { name: "Remove collateral property 1", exact: true }).click();
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  await page.getByLabel("Asset 1 type", { exact: true }).selectOption("equipment");
  await page.getByLabel("Asset 1 description", { exact: true }).fill("Commercial equipment and fixtures");
  await page.getByLabel("Asset 1 estimated asset value", { exact: true }).fill("42500.75");
  await page.getByLabel("Asset 1 existing liens", { exact: true }).fill("0");
  await page.getByText("Supporting files · 0 linked", { exact: true }).click();
  await page.getByLabel("Property valuation.pdf", { exact: true }).check();
  await page.getByRole("button", { name: "Remove collateral asset 1", exact: true }).click();
  await page.getByText("Assets removed in this edit · 1", { exact: true }).click();
  await page.getByRole("button", { name: "Restore asset", exact: true }).click();
  await expect(page.getByLabel("Asset 1 description", { exact: true })).toHaveValue("Commercial equipment and fixtures");
  await page.getByRole("button", { name: "Save collateral", exact: true }).click();
  const saved = JSON.parse(await page.getByLabel("Saved collateral payload").innerText());
  expect(saved.properties).toEqual([]); expect(saved.assets).toHaveLength(1);
  expect(saved.assets[0]).toMatchObject({ estimated_value: 42500.75, existing_liens_total: 0, available_lien_amount: null, source_file_ids: ["source"] });
  expect(saved.assets[0]).not.toHaveProperty("address");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("other-asset-collateral.png") });
});

test("source references are bounded, searchable and keep credit labels private", async ({ page }) => {
  await page.goto("http://localhost/");
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open references", exact: true }).click();
  await expect(page.getByText("Linked owner credit report", { exact: true })).toBeVisible();
  await expect(page.getByText("Private owner name", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("Saved report references").locator("article")).toHaveCount(25);
  await page.getByLabel("Search report source references", { exact: true }).fill("Business bank statement 30");
  await expect(page.getByLabel("Saved report references").locator("article")).toHaveCount(1);
  await expect(page.getByText("Business bank statement 30", { exact: true })).toBeVisible();
  expect(await page.getByLabel("Saved report references").evaluate(el=>el.clientHeight)).toBeLessThanOrEqual(640);
  await page.getByRole("tab", { name: "Analysis & assumptions", exact: false }).click();
  await expect(page.getByText("Frozen proposal notes", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Saved report analysis", { exact: true })).toContainText("even after the working plan changes");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("saved-analysis.png") });
});
