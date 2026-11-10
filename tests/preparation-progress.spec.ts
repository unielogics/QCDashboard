import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let script: Buffer, css: Buffer;
test.beforeAll(async () => {
  const root = process.cwd();
  const require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const output = await mkdtemp(path.join(os.tmpdir(), "qc-preparation-progress-"));
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{PreparationProgress}from'@/components/design-system/PreparationProgress';import{writePreparationPreview}from'@/lib/preparationPreview';
    function App(){const[state,setState]=useState('loading');const title='Preparing investor presentation and supporting documents';return <main><PreparationProgress title={title} description='Reviewing the current financial snapshot and generating dated PDF versions.' state={state} steps={[{label:'Request accepted',status:'complete'},{label:'Generate PDFs',status:state==='complete'?'complete':'active'},{label:'Preview',status:state==='complete'?'complete':'pending'}]}/><button onClick={()=>setState('complete')}>Finish request</button><button onClick={()=>setState('error')}>Fail request</button><button onClick={()=>setState('loading')}>Retry request</button><button onClick={()=>{const target=window.open('','_blank');if(target)writePreparationPreview(target,{title:'Preparing investor presentation',description:'Generating the presentation and supporting PDFs.'})}}>Preview loading tab</button></main>};createRoot(document.getElementById('root')).render(<App/>);` }, outfile: path.join(output, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" } });
  script = await readFile(path.join(output, "app.js")); css = await readFile(path.join(output, "app.css"));
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (pathname !== "/") throw new Error(`Unexpected external request: ${pathname}`);
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body style="margin:24px;background:#f5f7fb;font-family:system-ui"><div id="root" style="max-width:860px;margin:auto"></div><script src="/app.js"></script></body></html>' });
  });
});

test("a long request stays indeterminate, failure stops it and retry resets elapsed time", async ({ page }) => {
  await page.clock.install();
  await page.goto("http://preparation.test/");
  const bar = page.getByRole("progressbar");
  await expect(bar).not.toHaveAttribute("aria-valuenow");
  await page.clock.fastForward(46_000);
  await expect(page.getByText("Still preparing. Larger files can take a little longer.")).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuetext", "In progress");
  await expect(bar).not.toHaveAttribute("aria-valuenow");
  await page.getByRole("button", { name: "Fail request" }).click();
  await expect(bar).toHaveAttribute("aria-valuetext", "Needs attention");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText("Still preparing.", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry request" }).click();
  await expect(page.getByText("0:00", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Finish request" }).click();
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  await expect(bar).toHaveAttribute("aria-valuetext", "Ready");
});

test("progress visuals fit the viewport and respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://preparation.test/");
  await expect(page.getByRole("progressbar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.getByRole("progressbar").locator("span").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.screenshot({ path: test.info().outputPath("preparation-progress.png"), fullPage: true });
});

test("the preview tab has a visible preparation card while PDFs are pending", async ({ page }) => {
  await page.goto("http://preparation.test/");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Preview loading tab" }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Preparing investor presentation" })).toBeVisible();
  await expect(popup.getByRole("progressbar")).toBeVisible();
  await expect(popup.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await popup.close();
});
