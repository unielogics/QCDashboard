import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const output = await mkdtemp(path.join(os.tmpdir(), "qc-collateral-sync-"));
  await writeFile(path.join(output, "api.js"), "export function useAuthedApi(){return window.fixtureApi}");
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{FileCollateralSection}from'@/components/file/FileCollateralSection';import'@/app/globals.css';import'@/app/app-extras.css';
    let record={profile_id:'synthetic-profile',enabled:false,revision:1,can_edit:true,properties:[],assets:[],property_options:[],source_file_options:[]};
    window.fixtureApi=async(_url,options)=>{if(options?.method==='PATCH'){const input=JSON.parse(options.body);if(input.expected_revision!==record.revision)throw Error('Stale collateral');record={...record,...input,revision:record.revision+1};}return structuredClone(record)};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><main style={{padding:16}}><FileCollateralSection profileId='synthetic-profile' title='Coverage collateral'/><FileCollateralSection profileId='synthetic-profile' title='Underwriting collateral'/></main></QueryClientProvider>);
  ` }, outfile: path.join(output, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@/hooks/useApi": path.join(output, "api.js"), "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
  [script, css] = await Promise.all([readFile(path.join(output, "app.js")), readFile(path.join(output, "app.css"))]);
});
test.beforeEach(async ({ page }) => {
  await page.route("http://localhost/**", route => {
    const url = new URL(route.request().url());
    return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
});
test("coverage and underwriting show the same saved collateral revision", async ({ page }) => {
  await page.goto("http://localhost/");
  const coverage = page.getByRole("region", { name: "Coverage collateral", exact: true });
  const underwriting = page.getByRole("region", { name: "Underwriting collateral", exact: true });
  await coverage.getByRole("button", { name: "Manage collateral", exact: true }).click();
  await page.getByLabel("Include collateral in the financing proposal", { exact: true }).check();
  await page.getByRole("button", { name: "Add asset", exact: true }).click();
  await page.getByLabel("Asset 1 description", { exact: true }).fill("Equipment for the proposed loan");
  await page.getByRole("button", { name: "Save collateral", exact: true }).click();
  await expect(coverage).toContainText("0 properties · 1 other asset · revision 2");
  await expect(underwriting).toContainText("0 properties · 1 other asset · revision 2");
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await underwriting.getByRole("button", { name: "Manage collateral", exact: true }).click();
  await expect(page.getByLabel("Asset 1 description", { exact: true })).toHaveValue("Equipment for the proposed loan");
  await page.getByLabel("Include collateral in the financing proposal", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save collateral", exact: true }).click();
  await expect(coverage.getByLabel("Collateral available", { exact: true })).not.toBeChecked();
  await expect(underwriting.getByLabel("Collateral available", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Asset 1 description", { exact: true })).toHaveValue("Equipment for the proposed loan");
});
