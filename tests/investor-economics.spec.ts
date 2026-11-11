import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-investor-net-"));
  await writeFile(path.join(directory, "api.js"), "export const useAuthedApi=()=>window.fixtureApi;");
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{DealBudgetSection}from'@/components/file/DealBudgetSection';import{investorEconomicsCases as cases}from'./tests/fixtures/investorEconomics';import'@/app/globals.css';import'@/app/app-extras.css';
    const base=structuredClone(cases.base);let record={...base.budget,profile_id:'synthetic-investor',can_edit:!location.search.includes('readonly'),investor_funding_amount:null,minimum_investor_contribution:null};window.writes=[];window.failPreview=false;window.previewDelay=0;window.failSave=false;
    const calc=value=>structuredClone((value.payoff_terms?.charge_amount==null?cases.unknown_charge:value.rows.some(row=>row.enabled&&row.value==null)?cases.unknown_rate:value.servicing_mode==='transferred'?cases.transferred:cases.company).calculation);
    window.fixtureApi=async(url,options)=>{if(url.endsWith('/deal-budget/preview')){const body=JSON.parse(options.body);window.lastPreview=body;await new Promise(resolve=>setTimeout(resolve,window.previewDelay));if(window.failPreview){window.failPreview=false;throw Error('Synthetic calculation unavailable')}return{...record,...body,calculation:calc(body)}}if(url.endsWith('/deal-budget')){if(options?.method==='PATCH'){const body=JSON.parse(options.body);window.writes.push(body);if(window.failSave){window.failSave=false;throw Error('Synthetic save unavailable')}record={...record,...body,revision:record.revision+1};window.saved=record;}return structuredClone({...record,calculation:calc(record)})}throw Error('Unexpected service '+url)};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><main className='app' style={{padding:16}}><DealBudgetSection profileId='synthetic-investor' compact={false}/></main></QueryClientProvider>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@/hooks/useApi": path.join(directory, "api.js"), "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});
test.beforeEach(async ({ page }) => { await page.route("http://localhost:3414/**", route => { const pathname = new URL(route.request().url()).pathname; return route.fulfill(pathname === "/app.js" ? { contentType: "text/javascript", body: script } : pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' }); }); });

test("server NET figures distinguish six-month payoff, full term and transferred servicing", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3414/"); await page.getByRole("button", { name: "Edit deal budget", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Deal budget editor" }), early = editor.getByRole("article", { name: "Six-month full payoff" }), full = editor.getByRole("article", { name: "Full contractual term" });
  await expect(early).toContainText("USD 5,880.00"); await expect(early).toContainText("5.88%"); await expect(full).toContainText("USD 11,760.00");
  await expect(editor.getByLabel("Company fee 1 full-term amount")).toContainText("USD 120.00");
  await editor.getByLabel("Servicing arrangement").selectOption("transferred");
  await expect(editor.getByLabel("Company fee 1 full-term amount")).toContainText("Not charged");
  await expect(early).toContainText("USD 5,940.00"); await expect(full).toContainText("USD 11,880.00");
  await early.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("investor-net-comparison.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("unknown payoff charge remains unconfirmed until staff explicitly enters zero", async ({ page }) => {
  await page.goto("http://localhost:3414/"); await page.getByRole("button", { name: "Edit deal budget", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Deal budget editor" });
  await editor.getByLabel("Additional early payoff charge", { exact: true }).fill("");
  const early = editor.getByRole("article", { name: "Six-month full payoff" });
  await expect(early).toContainText("Not established"); await expect(early).toContainText("Enter the additional payoff charge");
  await editor.getByRole("button", { name: "Confirm no additional payoff charge" }).click();
  await expect(editor.getByLabel("Additional early payoff charge", { exact: true })).toHaveValue("0"); await expect(early).toContainText("USD 5,880.00");
});

test("setup tracking and conditional fees save through the existing budget and survive reopen", async ({ page }) => {
  await page.goto("http://localhost:3414/"); await page.getByRole("button", { name: "Edit deal budget", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Deal budget editor" });
  await editor.getByLabel("Monitoring setup status").selectOption("in_progress"); await editor.getByLabel("Software and monitoring provider").fill("Synthetic system"); await editor.getByLabel("Software and monitoring setup notes").fill("Credentials still pending");
  await editor.getByLabel("Company fee 1 applicability").selectOption("company_managed");
  await editor.getByRole("button", { name: "Save budget", exact: true }).click(); await expect(editor).toContainText("revision 2 saved");
  await editor.getByRole("button", { name: "Close", exact: true }).last().click(); await page.getByRole("button", { name: "Edit deal budget", exact: true }).click();
  await expect(editor.getByLabel("Monitoring setup status")).toHaveValue("in_progress"); await expect(editor.getByLabel("Software and monitoring provider")).toHaveValue("Synthetic system");
  const writes = await page.evaluate(() => (window as unknown as { writes: Array<{ software_monitoring: { monitoring_status: string }; payoff_terms: { charge_amount: number } }> }).writes);
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ software_monitoring: { monitoring_status: "in_progress" }, payoff_terms: { charge_amount: 0 } });
});

test("new company fees start unknown, and pending or failed previews do not show stale NET figures", async ({ page }) => {
  await page.goto("http://localhost:3414/"); await page.getByRole("button", { name: "Edit deal budget", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Deal budget editor" });
  await expect(editor.getByRole("article", { name: "Full contractual term" })).toContainText("USD 11,760.00");
  await page.evaluate(() => { (window as unknown as { previewDelay: number }).previewDelay = 500; (window as unknown as { failPreview: boolean }).failPreview = true; });
  await editor.getByRole("button", { name: "Add maintenance fee", exact: true }).click(); await expect(editor.getByLabel("Company fee 3 value")).toHaveValue("");
  await expect(editor.getByRole("article", { name: "Full contractual term" })).not.toContainText("USD 11,760.00");
  await expect(editor).toContainText("Synthetic calculation unavailable"); await expect(editor.getByRole("button", { name: "Save budget", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Retry budget calculation" }).click(); await expect(editor.getByLabel("Company fee 3 value")).toHaveValue(""); await expect(editor.getByRole("article", { name: "Full contractual term" })).toContainText("Not established");
});

test("read-only budgets retain results but expose no editable fee or payoff controls", async ({ page }) => {
  await page.goto("http://localhost:3414/?readonly"); await page.getByRole("button", { name: "View deal budget", exact: true }).click(); const editor = page.getByRole("dialog", { name: "Deal budget editor" });
  await expect(editor.getByLabel("Servicing arrangement")).toBeDisabled(); await expect(editor.getByLabel("Company fee 1 value")).toBeDisabled(); await expect(editor.getByLabel("Additional early payoff charge", { exact: true })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Save budget", exact: true })).toHaveCount(0); await expect(editor.getByRole("article", { name: "Full contractual term" })).toContainText("USD 11,760.00");
});
