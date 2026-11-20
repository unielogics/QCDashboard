import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const origin = "https://email-marketing.test";
let script: Buffer;
let css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd();
  const require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-marketing-review-"));
  const hooks = path.join(directory, "api.ts");
  await writeFile(hooks, `
    export const useCurrentUser = () => ({
      authReady: true, authScope: "test", data: { id: "staff", role: location.search ? "loan_exec" : "super_admin" }
    });
    export const useAuthedApi = () => async (path, opts) => {
      const response = await fetch(path, opts);
      if (!response.ok) throw new Error("Delivery request could not be confirmed");
      return response.json();
    };
  `);
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import Page from '@/app/admin/email-marketing/page';
      const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
    ` },
    outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", jsx: "automatic",
    alias: { "@/hooks/useApi": hooks, "@": path.join(root, "src") },
    loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' },
  });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

test.beforeEach(async ({ page }) => {
  await page.route(origin + "/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js") return route.fulfill({ contentType: "application/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body: '<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>' });
    return route.abort();
  });
});

test("audience preview, explicit confirmation, retry and campaign receipt", async ({ page }) => {
  const attempts: { id: string; name: string; filters: object }[] = [];
  let queued: object[] = [];
  const options = {
    programs: [{value:"sba",label:"SBA"}], outcomes: [{value:"closed",label:"Closed"}], locales: [], sources: [],
    delivery_enabled: true, sequence: [{day:0,subject:"Welcome to QC"}],
  };
  await page.route(origin + "/admin/email-marketing/**", route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split("/").pop();
    if (endpoint === "options") return route.fulfill({ json: options });
    if (endpoint === "preview") {
      const filters = JSON.parse(request.postData()!);
      return route.fulfill({ json: { eligible_count: filters.outcome ? 0 : filters.program ? 2 : 7 } });
    }
    if (request.method() === "GET") return route.fulfill({ json: queued });
    const payload = JSON.parse(request.postData()!);
    attempts.push(payload);
    queued = [{ ...payload, recipient_count:2, queued:2, sent:0, failed:0, sending:0, uncertain:0, blocked:0, created_at:"2026-01-01T12:00:00Z" }];
    if (attempts.length === 1) return route.fulfill({ status:503, body:"" });
    return route.fulfill({ json: queued[0] });
  });
  await page.goto(origin);
  await expect(page.getByText("7 recipients", { exact:true })).toBeVisible();
  await page.getByLabel("Lending program").selectOption("sba");
  await page.getByLabel("Campaign name").fill("SBA preparation");
  await page.getByLabel("Subject line").fill("Your SBA documents");
  await page.getByLabel("Message", { exact:true }).fill("Prepare your most recent returns.");
  await page.getByLabel("Outcome").selectOption("closed");
  await expect(page.getByText("0 recipients", { exact:true })).toBeVisible();
  await expect(page.getByRole("button", {name:"Review campaign"})).toBeDisabled();
  await page.getByLabel("Outcome").selectOption("");
  await expect(page.getByText("2 recipients", { exact:true })).toBeVisible();
  await page.getByRole("button", {name:"Review campaign"}).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("2 recipients currently match")).toBeVisible();
  await expect(dialog.getByText("Prepare your most recent returns.")).toBeVisible();
  await dialog.getByRole("button", {name:"Back to editor"}).click();
  expect(attempts).toHaveLength(0);
  await page.getByRole("button", {name:"Review campaign"}).click();
  await dialog.getByRole("button", {name:"Confirm and queue"}).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", {name:"Confirm and queue"}).click();
  await expect(page.getByRole("status")).toContainText("Queued");
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[0].filters).toEqual({ program:"sba" });
  await expect(page.getByLabel("Campaign name")).toHaveValue("");
});

test("non-admins cannot load the audience or campaign data", async ({ page }) => {
  const calls: string[] = [];
  await page.route(origin + "/admin/email-marketing/**", route => { calls.push(route.request().url()); return route.abort(); });
  await page.goto(origin + "/?loan_exec");
  await expect(page.getByText("Only super admins can manage email marketing.")).toBeVisible();
  expect(calls).toEqual([]);
});
