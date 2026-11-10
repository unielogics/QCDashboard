import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let script: Buffer;
let stylesheet: Buffer;
test.beforeAll(async () => {
  const root = process.cwd();
  const require = createRequire(path.join(root, "package.json"));
  const vitestRequire = createRequire(require.resolve("vitest/package.json"));
  const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-operating-granular-"));
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{OperatingPlanForm}from'@/components/application/OperatingPlanForm';import{normalizeOperatingPlanBody}from'@/lib/operatingPlan';import{SheetGrid}from'@/components/sheet/SheetGrid';import'@/app/app-extras.css';
      const title='Cost of goods sold for specialized services and consumable materials from the latest complete tax year, with the full source description preserved for staff and client review';
      function App(){const[grid,setGrid]=useState(false);const[gridValues,setGridValues]=useState({'cost.label':title,'cost.notes':'Detailed source evidence and operating assumptions remain readable across the worksheet without hiding text at the right edge.'});const[value,setValue]=useState({business_name:'Example Studio',currency:'USD',expenses:[{id:'cost',label:title,category:'cogs',current_amount:250,cadence:'monthly',source_file_ids:['tax']}],adjustments:[]});if(grid)return <div style={{width:550,maxWidth:'100%'}}><SheetGrid layout={{kind:'operating_plan',title:'Operating cost worksheet',schema_version:'test',layout_version:'test',name_prefix:'test',freeze:[1,1],columns:[{c:1,width:32},{c:2,width:45}],rows:[{r:1,kind:'data',block:'expenses',row_key:'cost',ordinal:1,cells:[{c:1,type:'text',key:'cost.label',label:'Expense label',editable:true,path:['expenses','cost','label']},{c:2,type:'text',key:'cost.notes',label:'Expense evidence notes',editable:true,path:['expenses','cost','notes']}]}]}} values={gridValues} computed={{}} canEdit onEdits={edits=>setGridValues(previous=>({...previous,...Object.fromEntries(edits.map(edit=>[edit.key,edit.value]))}))}/></div>;return <main><button onClick={()=>setGrid(true)}>Show worksheet</button><OperatingPlanForm value={value} onChange={body=>setValue(normalizeOperatingPlanBody(body))} sources={[{file_id:'tax',file_name:'Example business return.pdf'}]}/><pre data-testid='draft'>{JSON.stringify(value)}</pre></main>};createRoot(document.getElementById('root')).render(<App/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" },
  });
  script = await readFile(path.join(directory, "app.js")); stylesheet = await readFile(path.join(directory, "app.css"));
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: stylesheet });
    if (pathname !== "/") throw Error(`Unexpected request ${pathname}`);
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
});
test("unit cost controls create one linked proposal, preserve the source total and retain unknowns", async ({ page }) => {
  await page.goto("http://localhost/");
  await page.getByLabel(/^Cost basis for /).selectOption("per_unit");
  await page.getByLabel("Expense unit name", { exact: true }).fill("service");
  await page.getByLabel("Current expense quantity", { exact: true }).fill("10");
  await page.getByLabel("Current expense unit cost", { exact: true }).fill("20");
  await expect(page.getByLabel("Current expense fixed cost", { exact: true })).toHaveValue("");
  await page.getByLabel("Current expense fixed cost", { exact: true }).fill("50");
  await page.getByLabel("Proposed expense quantity", { exact: true }).fill("8");
  await page.getByLabel("Proposed expense unit cost", { exact: true }).fill("15");
  await page.getByLabel("Proposed expense fixed cost", { exact: true }).fill("20");
  await expect(page.getByLabel("Reported expense source total", { exact: true })).toHaveValue("250");
  let draft = JSON.parse(await page.getByTestId("draft").innerText());
  expect(draft.expenses[0]).toMatchObject({ current_amount: 250, current_units_per_period: 10, current_unit_cost: 20, current_fixed_amount: 50 });
  expect(draft.adjustments).toHaveLength(1);
  expect(draft.adjustments[0]).toMatchObject({ expense_row_id: "cost", cost_basis: "per_unit", current_amount: null, proposed_amount: null, proposed_units_per_period: 8, proposed_unit_cost: 15, proposed_fixed_amount: 20, source_file_ids: ["tax"], status: "proposed" });
  await page.getByLabel("Proposed expense fixed cost", { exact: true }).fill("");
  draft = JSON.parse(await page.getByTestId("draft").innerText());
  expect(draft.adjustments).toHaveLength(1); expect(draft.adjustments[0].proposed_fixed_amount).toBeNull();
  await page.getByLabel("Proposed expense fixed cost", { exact: true }).fill("0");
  draft = JSON.parse(await page.getByTestId("draft").innerText()); expect(draft.adjustments[0].proposed_fixed_amount).toBe(0);
  await page.getByRole("tab", { name: "Earnings actions", exact: true }).click();
  await expect(page.getByLabel("Action name", { exact: true })).toHaveValue(draft.expenses[0].label);
});
test("long cell titles wrap in a bounded table and remain editable in full", async ({ page }) => {
  await page.goto("http://localhost/");
  const name = page.getByLabel("Expense name", { exact: true });
  await expect(name).toHaveValue(/full source description preserved/);
  const dimensions = await name.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight, width: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(dimensions.height).toBeGreaterThan(60); expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1); expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height + 2);
  await name.fill("Software subscriptions with an equally long explanation covering seat counts, rates, fixed fees and annual business use without clipping any of this text");
  await expect(name).toHaveValue(/without clipping any of this text/);
  const region = page.getByLabel("Operating expenses table. Scroll across columns or down rows.", { exact: true });
  expect(await region.evaluate(element => element.clientHeight)).toBeLessThanOrEqual(440);
});


test("operating worksheet text wraps and uses a multiline editor without changing other grids", async ({ page }) => {
  await page.goto("http://localhost/");
  await page.getByRole("button", { name: "Show worksheet", exact: true }).click();
  const grid = page.getByRole("grid", { name: "Operating cost worksheet", exact: true });
  const title = grid.getByRole("gridcell").first();
  await expect(title).toContainText("full source description preserved");
  const displayed = await title.locator(".sg-text").evaluate(element => ({ height: element.clientHeight, scrollWidth: element.scrollWidth, width: element.clientWidth, whiteSpace: getComputedStyle(element).whiteSpace }));
  expect(displayed.height).toBeGreaterThan(60); expect(displayed.scrollWidth).toBeLessThanOrEqual(displayed.width + 1); expect(displayed.whiteSpace).toBe("pre-wrap");
  await title.dblclick();
  const editor = page.getByRole("textbox", { name: "Expense label", exact: true });
  expect(await editor.evaluate(element=>element.tagName)).toBe("TEXTAREA");
  await editor.fill("Updated multiline expense title retains all the detailed source description in a wrapped editable cell without dropping any words");
  await editor.press("Tab");
  await expect(title).toContainText("without dropping any words");
});
