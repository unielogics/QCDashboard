import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The Financials tab as the File design draws it, in a real browser: the real
// cockpit and overview with the app's own stylesheets, fed the fictional file
// the design shows. The editors the cards open are probes; every request is
// intercepted, so no application records are read or changed.
let script: Buffer;
let moduleCss: Buffer;
let globalCss: Buffer;
let extrasCss: Buffer;

test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const vitestRequire = createRequire(projectRequire.resolve("vitest/package.json"));
  const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
  const esbuild = viteRequire("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-financials-overview-"));
  const hooksSource = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const hookNames = [...hooksSource.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map((match) => match[1]);
  const probe = (name: string, body: string) => `import {useEffect} from 'react';export function ${name}(props){${body}}`;
  const debtControls = "export const DebtScheduleControls=()=><button type='button'>Enter the schedule</button>;export const OPEN_DEBT_SCHEDULE_EVENT='fixture-only';";
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `let state;
      export function initialize(data){state={data,error:null,isLoading:false,isFetching:false,refetch:async()=>state}}
      ${hookNames.map((name) => name === "useFinancialCockpit" ? "export const useFinancialCockpit=()=>state;" : name === "useAuthedApi" ? "const call=async(path)=>{if(String(path).endsWith('/operating-plan/summary'))return window.__planSummary;throw new Error('Unexpected API request '+path)};export const useAuthedApi=()=>call;" : `export const ${name}=()=>({});`).join("\n")}`,
    "@/components/marketplace/shared": "export const errorMessage=(error,fallback)=>error&&error.message||fallback;",
    "@/components/application/FinancialWorkspace": "export function FinancialWorkspace(props){return <section role='dialog' aria-label={'Financial workspace: '+props.initialKind}><button type='button' onClick={props.onClose}>Close workspace</button></section>}",
    "@/components/application/RequestFilesDialog": "export function RequestFilesDialog(props){return props.open?<section role='dialog' aria-label='Request files'><button type='button' onClick={props.onClose}>Close request</button></section>:null}",
    "@/components/application/ApplicationProgramReadiness": "export const ApplicationProgramReadiness=()=>null;",
    "@/components/buckets/BucketFileReviewPanel": "export const BucketFileReviewPanel=()=>null;",
    "./CoverageCard": probe("CoverageCard", "useEffect(()=>{window.__coverage={reviewRequest:props.reviewRequest,reviewTab:props.reviewTab,showSummary:props.showSummary,termsRequest:props.termsRequest}});return null;"),
    "./OfferPanel": "export function OfferPanel(props){return <section id='fc-marketplace' ref={props.innerRef}>Offer panel probe</section>}",
    "./FinancialMetricReviewWorkspace": "export function FinancialMetricReviewWorkspace(props){return props.open?<section role='dialog' aria-label={'Metric review: '+props.metricKey}><button type='button' onClick={props.onClose}>Close review</button></section>:null}",
    "./DebtScheduleControls": debtControls,
    "@/lib/financialKpiReview": "export const metricEntries=()=>[];",
  };
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{FinancialCockpit}from'@/components/file/cockpit/FinancialCockpit';import{FileWorkspaceProvider}from'@/components/file/FileWorkspaceContext';import{initialize}from'@/hooks/useApi';import{harborCockpit,harborPlanSummary,emptyCockpit}from'@/lib/__tests__/fixtures/financialsOverviewFixture';
      const empty=location.search.includes('empty');
      const cockpit=empty?emptyCockpit():harborCockpit();
      window.__planSummary=empty?{has_plan:false,expense_count:0,action_count:0,reviewed_action_count:0,missing_count:0,cost_mix:[],evaluation:null}:harborPlanSummary();
      window.__events=[];
      initialize(cockpit);
      const readiness=empty?null:{profile_id:cockpit.profile_id,selections:[{id:'s1',program_key:'auto_refi',program_name:'Auto · refinance term loan'}],candidates:[{program_key:'auto_refi',rule_results:[{field:'business_age_years',operator:'gte',required:2,observed:6,status:'pass'},{field:'dscr',operator:'gte',required:1.25,observed:-0.03,status:'fail'}]}],programs:[],requirements:[]};
      // The file page gives the cockpit its workspace context (tools open in their own tabs); ?inpage is the bare cockpit.
      const inPage=location.search.includes('inpage');
      const client=new QueryClient();
      const noticeChanged=notice=>{window.__notice=notice};
      function App(){const cockpitView=<FinancialCockpit profileId={cockpit.profile_id} businessName="Harbor Auto Detail LLC" canPublish canRecordTerms={false} canUnderwrite programReadiness={readiness} termSheet={null} packageState={{generated:!empty,inSync:!empty,summaryVersion:empty?null:3,packetVersion:empty?null:3}} focus={null} onFocusHandled={()=>{}} onRecordTerms={()=>window.__events.push('record-terms')} onOpenEvidence={()=>window.__events.push('evidence')} onOpenPackage={()=>{}} onOpenUnderwriting={()=>window.__events.push('underwriting')} onCoverageNotice={noticeChanged}/>;
        return <QueryClientProvider client={client}>{inPage?cockpitView:<FileWorkspaceProvider value={{intakeId:'intake-1',profileId:cockpit.profile_id,pageMode:false}}>{cockpitView}</FileWorkspaceProvider>}</QueryClientProvider>};
      createRoot(document.getElementById('root')).render(<App/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" },
    plugins: [{ name: "overview-fixtures", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "overview-fixture" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "overview-fixture" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  script = await readFile(path.join(directory, "app.js"));
  moduleCss = await readFile(path.join(directory, "app.css"));
  // The app's own global styles: Tailwind over globals.css, then the console additions, in layout order.
  execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "src/app/globals.css", "-o", path.join(directory, "globals.css")], { cwd: root, stdio: "ignore" });
  globalCss = await readFile(path.join(directory, "globals.css"));
  extrasCss = await readFile(path.join(root, "src/app/app-extras.css"));
});

const PAGE = `<html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/extras.css"><link rel="stylesheet" href="/app.css"></head>
<body><div id="shell"><div id="rail"></div><main class="content content--wide"><div id="root"></div></main></div>
<style>#shell{display:grid;grid-template-columns:242px minmax(0,1fr);min-height:100vh}@media(max-width:900px){#shell{grid-template-columns:minmax(0,1fr)}#rail{display:none}}</style>
<script src="/app.js"></script></body></html>`;

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.route("**/*", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: moduleCss });
    if (pathname === "/globals.css") return route.fulfill({ contentType: "text/css", body: globalCss });
    if (pathname === "/extras.css") return route.fulfill({ contentType: "text/css", body: extrasCss });
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body: PAGE });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`http://financials.test/${query}`);
  await expect(page.getByRole("region", { name: "Debt coverage and financial review" })).toBeVisible();
  return errors;
}

/** How many cards share the first row of a grid, by their top edge. */
const firstRow = (page: Page, label: string) => page.getByRole("region", { name: label, exact: true }).evaluate((card) => {
  const row = card.parentElement!;
  const tops = [...row.children].map((child) => Math.round(child.getBoundingClientRect().top));
  return tops.filter((top) => top === tops[0]).length;
});

const CARDS = [
  "Operating expenses and earnings plan",
  "Debt service coverage and the plan", "Debt schedule and debt service",
  "Tax returns", "Profit and loss", "Balance sheet",
  "DSCR and earnings potential", "Revenue trend and outlook", "Net profit and EBITDA sources",
  "Expenses we can track", "Overdrafts and negative balances", "Movement between accounts",
  "Program criteria and use of funds", "Investor package and capital partners",
  "Bank trends and cash flow", "Statement payments and advances",
];

test("the Financials tab opens on the six metrics and the card grid", async ({ page }, info) => {
  const errors = await open(page);
  const width = page.viewportSize()!.width;
  const strip = page.getByRole("region", { name: "Debt coverage and financial review" });
  await expect(strip.locator("[data-metric]")).toHaveCount(6);
  await expect(strip.locator('[data-metric="ebitda"]')).toContainText("−$22,377");
  await expect(strip.locator('[data-metric="ebitda"]')).toContainText("$182,897 with plan");
  await expect(strip.locator('[data-metric="noi"]')).toContainText("$174,497 with plan");
  await expect(strip.locator('[data-metric="dscr"]')).toContainText("1.03x with plan and terms");
  await expect(strip.locator('[data-metric="free_cash_flow"]')).toContainText("$5,297 with plan and terms");
  await expect(strip.locator('[data-metric="operating_margin"]')).toContainText("11.6% with plan");
  await expect(strip.locator('[data-metric="debt_service"]')).toContainText("$177,600 with terms");

  // Every card of the design, in its order.
  const order = await page.locator('[class*="overview"] section[aria-label]').evaluateAll((sections) => sections.map((section) => section.getAttribute("aria-label")));
  expect(order.filter((label) => label !== "Debt coverage and financial review" && label !== "Earnings plan effect on coverage")).toEqual(CARDS);

  const plan = page.getByRole("region", { name: "Operating expenses and earnings plan", exact: true });
  await expect(plan).toContainText("−$22,377 → $182,897");
  await expect(plan).toContainText("$39,103 / year");
  await expect(plan.getByRole("table", { name: "Changes in the plan" }).getByRole("row")).toHaveCount(7);
  await expect(plan).toContainText("Client terms v3 · payments $64,800 → $14,800 / month");
  await expect(page.getByRole("region", { name: "Debt schedule and debt service", exact: true })).toContainText("5 rows · all paid off by plan");
  await expect(page.getByRole("region", { name: "Net profit and EBITDA sources", exact: true })).toContainText("IRS 2025 selected");
  await expect(page.getByRole("region", { name: "Program criteria and use of funds", exact: true })).toContainText("≥ 1.25x · not met");

  // Nothing spills: the page does not scroll sideways and no table outgrows its card.
  const layout = await page.evaluate(() => {
    const root = document.querySelector('[class*="overview"]')!;
    const cards = [...root.querySelectorAll("section[aria-label]")];
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      container: Math.round(root.getBoundingClientRect().width),
      outside: cards.filter((card) => card.getBoundingClientRect().right > root.getBoundingClientRect().right + 1).map((card) => card.getAttribute("aria-label")),
      scrolling: [...root.querySelectorAll("table")].filter((table) => table.parentElement!.scrollWidth > table.parentElement!.clientWidth + 1).map((table) => table.getAttribute("aria-label")),
      clipped: [...root.querySelectorAll("section[aria-label] h3")].filter((heading) => heading.scrollWidth > heading.clientWidth + 1).map((heading) => heading.textContent),
    };
  });
  expect(layout.pageOverflow).toBeLessThanOrEqual(0);
  expect(layout.outside).toEqual([]);
  expect(layout.clipped).toEqual([]);

  if (width >= 1280) {
    // Six metrics on one line, then rows of two and three as the design lays them out.
    const tops = await strip.locator("[data-metric]").evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    expect(layout.scrolling).toEqual([]);
    expect(await firstRow(page, "Debt service coverage and the plan")).toBe(2);
    expect(await firstRow(page, "Tax returns")).toBe(3);
    expect(await firstRow(page, "DSCR and earnings potential")).toBe(3);
    expect(await firstRow(page, "Expenses we can track")).toBe(3);
    expect(await firstRow(page, "Program criteria and use of funds")).toBe(2);
    expect(await firstRow(page, "Bank trends and cash flow")).toBe(2);
  } else {
    expect(await firstRow(page, "Tax returns")).toBe(1);
    expect(await firstRow(page, "Debt service coverage and the plan")).toBe(1);
  }

  // Underwriting is handed the same coverage, as one sentence.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __notice: unknown }).__notice)).toEqual({
    text: "Coverage after these terms is −0.13x on documented earnings and 1.03x with the earnings plan.", tone: "acc", profileId: "harbor-auto-detail",
  });

  // The detail that left the grid is folded away under it, not gone.
  await expect(page.getByText("Review financial source metrics", { exact: false })).toBeVisible();
  await expect(page.getByText("Statement detail", { exact: false })).toBeVisible();
  await expect(page.locator("#financials-package")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: "Financial cockpit", exact: true })).toHaveCount(1);
  await page.screenshot({ path: info.outputPath(`financials-overview-${width}.png`), fullPage: true });
  info.annotations.push({ type: "container", description: `${layout.container}px wide at a ${width}px viewport` });
  expect(errors).toEqual([]);
});

test("between the two layouts a row of three keeps no half-empty line", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1000, "phone widths stack every card");
  // 1,180px leaves the grid about 860px: two cards fit, so the third takes the row.
  await page.setViewportSize({ width: 1180, height: 800 });
  const errors = await open(page);
  const row = await page.getByRole("region", { name: "Tax returns", exact: true }).evaluate((card) => {
    const cards = [...card.parentElement!.children].map((child) => child.getBoundingClientRect());
    return { tops: cards.map((box) => Math.round(box.top)), widths: cards.map((box) => Math.round(box.width)), row: Math.round(card.parentElement!.getBoundingClientRect().width) };
  });
  expect(row.tops[0]).toBe(row.tops[1]);
  expect(row.tops[2]).toBeGreaterThan(row.tops[0]);
  expect(row.widths[2]).toBe(row.row);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => [...document.querySelectorAll('[class*="overview"] table')].filter((table) => table.parentElement!.scrollWidth > table.parentElement!.clientWidth + 1).length)).toBe(0);
  expect(errors).toEqual([]);
});

test("on the file page the tools open in their own tabs and the reviews open in place", async ({ page }) => {
  const errors = await open(page);
  const coverage = () => page.evaluate(() => (window as unknown as { __coverage: Record<string, unknown> }).__coverage);
  // The coverage card stays mounted for its drawers, without its own summary.
  expect(await coverage()).toMatchObject({ showSummary: false, reviewRequest: 0 });

  const tool = (name: string) => page.getByRole("link", { name, exact: true });
  for (const [name, href] of [
    ["Open earnings plan", "/files/intake-1/workspace?tool=operating-plan"],
    ["Advanced review", "/files/intake-1/workspace?tool=coverage"],
    ["Edit debt schedule", "/files/intake-1/workspace?tool=forms&kind=debt_schedule&view=form"],
    ["Programs and use of funds", "/files/intake-1/workspace?tool=use-of-funds"],
    ["Review and publish offer", "/files/intake-1/workspace?tool=marketplace"],
  ]) {
    await expect(tool(name)).toHaveAttribute("href", href);
    await expect(tool(name)).toHaveAttribute("target", "_blank");
  }

  await page.getByRole("button", { name: "Open loan terms", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __events: string[] }).__events)).toEqual(["underwriting"]);
  await page.getByRole("button", { name: "Balance risk", exact: true }).click();
  await expect.poll(coverage).toMatchObject({ reviewRequest: 1, reviewTab: "risk" });
  await page.getByRole("button", { name: "Account movement", exact: true }).click();
  await expect.poll(coverage).toMatchObject({ reviewRequest: 2, reviewTab: "movements" });
  await page.getByRole("button", { name: "Statement payments", exact: true }).click();
  await expect.poll(coverage).toMatchObject({ reviewRequest: 3, reviewTab: "statements" });
  await page.getByRole("button", { name: "Review sources", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Metric review: ebitda" })).toBeVisible();
  await page.getByRole("button", { name: "Close review", exact: true }).click();
  await page.locator('[data-metric="dscr"]').click();
  await expect(page.getByRole("dialog", { name: "Metric review: dscr" })).toBeVisible();
  await page.getByRole("button", { name: "Close review", exact: true }).click();
  await page.getByRole("button", { name: "Latest plan PDF", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Financial workspace: operating_plan" })).toBeVisible();
  await page.getByRole("button", { name: "Close workspace", exact: true }).click();

  // The package workspace starts folded, unfolds from its card and comes into view.
  const fold = page.locator("#financials-package");
  await expect(fold).not.toHaveAttribute("open", "");
  await expect(page.getByText("Offer panel probe", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Review investor package", exact: true }).click();
  await expect(fold).toHaveAttribute("open", "");
  await expect(page.getByText("Offer panel probe", { exact: true })).toBeInViewport();
  expect(errors).toEqual([]);
});

test("without the file page around it the cockpit opens its editors in place", async ({ page }) => {
  const errors = await open(page, "?inpage");
  const coverage = () => page.evaluate(() => (window as unknown as { __coverage: Record<string, unknown> }).__coverage);
  // The cockpit is the only surface here, so the working package panel starts open.
  await expect(page.locator("#financials-package")).toHaveAttribute("open", "");
  await expect(page.getByText("Offer panel probe", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Advanced review", exact: true }).click();
  await expect.poll(coverage).toMatchObject({ reviewRequest: 1, reviewTab: "plan" });
  await page.getByRole("button", { name: "Programs and use of funds", exact: true }).click();
  await expect.poll(coverage).toMatchObject({ reviewRequest: 2, reviewTab: "plan" });

  await page.getByRole("button", { name: "Edit debt schedule", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Financial workspace: debt_schedule" })).toBeVisible();
  await page.getByRole("button", { name: "Close workspace", exact: true }).click();
  await page.getByRole("button", { name: "Open earnings plan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Financial workspace: operating_plan" })).toBeVisible();
  await page.getByRole("button", { name: "Close workspace", exact: true }).click();
  await page.getByRole("button", { name: "Set annual NOI goal", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Financial workspace: operating_plan" })).toBeVisible();
  await page.getByRole("button", { name: "Close workspace", exact: true }).click();
  await page.getByRole("button", { name: "Review and publish offer", exact: true }).click();
  await expect(page.getByText("Offer panel probe", { exact: true })).toBeInViewport();
  expect(errors).toEqual([]);
});

test("a file with nothing analyzed asks for what is missing instead of going blank", async ({ page }, info) => {
  const errors = await open(page, "?empty");
  const strip = page.getByRole("region", { name: "Debt coverage and financial review" });
  await expect(strip.locator('[data-metric="ebitda"]')).toContainText("No earnings source yet");
  await expect(strip.locator('[data-metric="debt_service"]')).toContainText("No loan terms saved");
  await expect(page.getByRole("region", { name: "Operating expenses and earnings plan", exact: true })).toContainText("No plan yet");
  await expect(page.getByRole("button", { name: "Request tax returns", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request profit and loss", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request balance sheet", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Debt schedule and debt service", exact: true }).getByRole("button", { name: "Enter the schedule", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Program criteria and use of funds", exact: true })).toContainText("No program chosen");
  await expect(page.getByRole("button", { name: "Prepare investor package", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: info.outputPath(`financials-overview-empty-${page.viewportSize()!.width}.png`), fullPage: true });
  expect(errors).toEqual([]);
});
