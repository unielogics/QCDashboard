import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The page a borrower opens from a form link: the real page component, form, review and writer. Only the address
// (which form, which link) and the API's replies are supplied here, and nothing reaches a network. A debt schedule
// stands for the forms this page serves; the earnings plan has its own workspace (see earnings-plan.spec.ts), and
// this spec checks that a plan link is handed to it.
// A secure origin, as in production: the form's writer needs the browser's own id generator, which only secure pages have.
const ORIGIN = "https://forms.test";
const TOKEN = "synthetic-form-token";
const BASE = `/api/v1/application-profiles/public/financial-forms/${TOKEN}`;
let script: Buffer;
let css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(projectRequire.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-public-form-"));
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Page from'@/app/forms/[kind]/[token]/page';import'@/app/globals.css';import'@/app/app-extras.css';createRoot(document.getElementById('root')).render(<Page/>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic",
    nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(ORIGIN) },
    loader: { ".module.css": "local-css" }, logLevel: "silent",
    // The route's own parameters: which form the address names, and the link's token.
    plugins: [{ name: "form-route", setup(build: { onResolve: (options: { filter: RegExp }, callback: () => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: () => unknown) => void }) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "form-route" }));
      build.onLoad({ filter: /.*/, namespace: "form-route" }, () => ({ contents: `export const useParams=()=>({kind:new URLSearchParams(location.search).get('kind')||'debt_schedule',token:${JSON.stringify(TOKEN)}});`, loader: "js" }));
    } }],
  });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

type Debt = Record<string, unknown> & { id: string; lender: string; balance: string; monthly_payment: string };
type Sent = { path: string; method: string; signed: boolean; payload: { body?: { debts?: Debt[] }; expected_revision?: number; base_version_id?: string | null; idempotency_key?: string } | null };
type Stand = { open: "form" | "plan" | "goal" | "gone"; debts: Debt[]; revision: number; sent: Sent[]; versions: Array<{ id: string; version_number: number; created_at: string }> };

const debt = (overrides: Partial<Debt> = {}): Debt => ({
  id: "97000000-0000-4000-8000-000000000001", owner: "admin", editable: true, lender: "Example Lender", debt_type: "term_loan", original_amount: "20000",
  balance: "12000", rate: "9.5", monthly_payment: "500", payment_status: "current", secured: "unsecured", ...overrides,
});

async function open(page: Page, stand: Stand, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const workspace = () => ({ family_id: "97000000-0000-4000-8000-000000000010", revision: stand.revision, base_version_id: stand.versions[0]?.id ?? null,
    dirty: !stand.versions.length, current_version: stand.versions[0] ?? null, versions: stand.versions });
  await page.route("**/*", (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (url.pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="margin:0"><div class="bareshell"><div id="root"></div></div><script src="/app.js"></script></body></html>' });
    if (!url.pathname.startsWith(BASE)) return route.fulfill({ status: 404, body: "" });
    const tail = url.pathname.slice(BASE.length);
    const payload = request.postDataJSON() as Sent["payload"];
    stand.sent.push({ path: tail, method: request.method(), signed: "authorization" in request.headers(), payload });
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (stand.open === "gone") return json(404, { detail: "This link is no longer available" });
    if (stand.open === "goal") return json(409, { detail: { code: "operating_goal_required", state: "goal_awaiting_staff", message: "Your team needs to set the annual NOI goal before this operating plan can be opened or shared." } });
    if (tail === "/plan") return json(409, { detail: { code: "operating_goal_required", message: "Your team needs to set the annual NOI goal before this operating plan can be opened or shared." } });
    if (stand.open === "plan") return json(200, { kind: "operating_plan", completed: false, business_name: "Example Studio LLC", body: {}, can_edit: true, permission: "edit", workspace: workspace() });
    const reply = () => ({ body: { business_name: "Example Studio LLC", debts: stand.debts }, workspace: workspace(), permission: "edit", can_edit: true });
    if (request.method() === "GET" && tail === "") return json(200, { kind: "debt_schedule", completed: false, business_name: "Example Studio LLC", schema: {}, ...reply(), prefill: { business_name: "Example Studio LLC", owner_name: null, home_address: null, business_phone: null, owner_count: 1 } });
    if (!payload || payload.expected_revision !== stand.revision) return json(409, { detail: { code: "financial_draft_conflict", message: "This form changed or needs to be refreshed. Reload before saving your corrections." } });
    stand.debts = payload.body?.debts ?? stand.debts;
    if (tail === "/draft") { stand.revision += 1; return json(200, { saved: true, ...reply() }); }
    if (tail === "/submit") {
      const version = { id: `97000000-0000-4000-8000-00000000002${stand.versions.length + 1}`, version_number: stand.versions.length + 1, created_at: "2026-11-14T15:00:00Z" };
      stand.versions = [version, ...stand.versions];
      return json(200, { completed: true, ...reply(), saved_version: version });
    }
    return json(404, { detail: "Not found" });
  });
  await page.goto(`${ORIGIN}/${query}`);
  return errors;
}

const fresh = (overrides: Partial<Stand> = {}): Stand => ({ open: "form", debts: [debt()], revision: 4, sent: [], versions: [], ...overrides });

test("a borrower corrects a debt schedule from a link: progress saves, the review reads it back, and the version is sent", async ({ page }) => {
  test.setTimeout(90_000);
  const stand = fresh();
  const errors = await open(page, stand);
  await expect(page.getByRole("heading", { name: "Business Debt Schedule", level: 1 })).toBeVisible();
  await expect(page.getByText("For Example Studio LLC")).toBeVisible();
  await expect(page.locator("#lender-0")).toHaveValue("Example Lender");
  expect(await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")).toBeLessThanOrEqual(0);

  // Typing saves by itself as a working draft, against the revision the page was given.
  await page.locator("#balance-0").fill("11500");
  await expect(page.getByText(/Progress saved at/)).toBeVisible({ timeout: 15_000 });
  const draft = stand.sent.find((row) => row.path === "/draft")!;
  expect([draft.method, draft.signed, draft.payload?.expected_revision, draft.payload?.body?.debts?.[0].balance]).toEqual(["POST", false, 4, "11500"]);

  // The review reads the answers back before anything is sent.
  await page.getByRole("button", { name: "Review and save version" }).click();
  await expect(page.getByRole("heading", { name: "Check this over", level: 1 })).toBeVisible();
  await expect(page.locator(".fpr")).toContainText("Example Lender");
  expect(stand.sent.some((row) => row.path === "/submit")).toBe(false);
  await page.getByRole("button", { name: "Save version and send" }).click();
  await expect(page.getByRole("heading", { name: "Thank you — you can close this window." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Your debt schedule has been received and added to your file.")).toBeVisible();
  const submit = stand.sent.find((row) => row.path === "/submit")!;
  expect([submit.signed, submit.payload?.expected_revision, submit.payload?.base_version_id, submit.payload?.body?.debts?.[0].balance]).toEqual([false, 5, null, "11500"]);
  expect(String(submit.payload?.idempotency_key).length).toBeGreaterThanOrEqual(8);
  expect(stand.sent.filter((row) => row.path === "/submit")).toHaveLength(1);

  // The link still works: the borrower can come back to the answers.
  await page.getByRole("button", { name: "Edit my answers" }).click();
  await expect(page.locator("#balance-0")).toHaveValue("11500");
  expect(stand.sent.every((row) => !row.signed)).toBe(true);
  expect(errors).toEqual([]);
});

test("a row missing a required answer is named before anything is sent", async ({ page }) => {
  const stand = fresh({ debts: [debt({ monthly_payment: "" })] });
  const errors = await open(page, stand);
  await expect(page.locator("#lender-0")).toHaveValue("Example Lender");
  await page.getByRole("button", { name: "Review and save version" }).click();
  await expect(page.getByRole("alert")).toContainText("Example Lender");
  await expect(page.locator("#monthly-0")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("heading", { name: "Check this over" })).toHaveCount(0);
  expect(stand.sent.filter((row) => row.method === "POST")).toEqual([]);
  // Answering it lets the review open.
  await page.locator("#monthly-0").fill("450");
  await page.getByRole("button", { name: "Review and save version" }).click();
  await expect(page.getByRole("heading", { name: "Check this over", level: 1 })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("an earnings plan link is handed to the plan workspace, whatever form the address names", async ({ page }) => {
  // The address names a debt schedule; the link is a plan. The plan workspace takes over and asks its own route.
  const stand = fresh({ open: "plan" });
  const errors = await open(page, stand);
  await expect(page.getByRole("heading", { name: "Your team is setting the annual NOI goal" })).toBeVisible();
  expect(stand.sent.map((row) => row.path)).toEqual(["", "/plan"]);

  // A plan link whose goal is not set is refused before the form loads: same handoff.
  const waiting = fresh({ open: "goal" });
  await page.unrouteAll({ behavior: "ignoreErrors" });
  errors.push(...await open(page, waiting));
  await expect(page.getByRole("heading", { name: "Your team is setting the annual NOI goal" })).toBeVisible();
  expect(waiting.sent.map((row) => row.path)).toEqual(["", "/plan"]);

  // An address that names the plan goes straight to it.
  const direct = fresh({ open: "goal" });
  await page.unrouteAll({ behavior: "ignoreErrors" });
  errors.push(...await open(page, direct, "?kind=operating_plan"));
  await expect(page.getByRole("heading", { name: "Your team is setting the annual NOI goal" })).toBeVisible();
  expect(direct.sent.map((row) => row.path)).toEqual(["/plan"]);
  expect(errors).toEqual([]);
});

test("a link that has expired says so", async ({ page }) => {
  const stand = fresh({ open: "gone" });
  const errors = await open(page, stand);
  await expect(page.getByRole("heading", { name: "This link is no longer available" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  expect(errors).toEqual([]);
});
