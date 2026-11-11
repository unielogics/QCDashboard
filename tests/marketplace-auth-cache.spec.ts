import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ORIGIN = "https://marketplace-auth.test";
let script: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-admin-auth-cache-"));
  const mocks: Record<string, string> = {
    "@/lib/consoleAuth": `import{useSyncExternalStore}from'react';let state={isLoaded:true,isSignedIn:true,userId:'user-a',sessionId:'session-a'};const listeners=new Set();window.changeAuth=patch=>{state={...state,...patch};listeners.forEach(fn=>fn())};const getToken=async()=> 'synthetic-'+state.userId;export const useConsoleAuth=()=>({...useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>state,()=>state),getToken});export const visualQaUser=x=>x;`,
    "next/navigation": "export const useRouter=()=>({push:()=>{}});",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{useCurrentUser}from'@/hooks/useApi';import{SuperAdminOnly}from'@/components/marketplace/shared';
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});client.setQueryData(['auth-me',true],{id:'old-global-cache',role:'super_admin'});window.unmounts=0;window.refreshIdentity=()=>client.invalidateQueries({queryKey:['auth-me']});
    function Approval(){const{data}=useCurrentUser();const[reason,setReason]=useState('');useEffect(()=>()=>{window.unmounts++},[]);return<section><h2>Private approval data for {data?.id}</h2><label>Private approval draft<input aria-label='Private approval draft' value={reason} onChange={e=>setReason(e.target.value)}/></label></section>}
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><SuperAdminOnly><Approval/></SuperAdminOnly></QueryClientProvider>);
  ` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(ORIGIN), "process.env": "{}", "process.env.NODE_ENV": '"development"' }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "synthetic-auth", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) { build.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "synthetic" } : undefined); build.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root })); } }] });
  script = await readFile(path.join(directory, "app.js"));
});

async function fixture(page: Page) {
  const calls: string[] = [], errors: string[] = [];
  let fail = false;
  let release = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/v1/auth/me", async route => {
    const actor = (route.request().headers().authorization ?? "").replace("Bearer synthetic-", "");
    calls.push(actor);
    if (actor === "user-b") await hold;
    if (fail) return route.fulfill({ status: 401, json: { detail: "Synthetic expired session" } });
    return route.fulfill({ json: { id: actor, email: `${actor}@example.test`, name: actor, role: actor === "user-b" ? "loan_exec" : "super_admin" } });
  });
  await page.route(`${ORIGIN}/**`, route => new URL(route.request().url()).pathname.startsWith("/api/v1") ? route.fallback() : route.fulfill(new URL(route.request().url()).pathname === "/app.js" ? { contentType: "text/javascript", body: script } : { contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' }));
  await page.goto(ORIGIN);
  await expect(page.getByRole("heading", { name: "Private approval data for user-a", exact: true })).toBeVisible();
  return { calls, errors, release, fail: (value: boolean) => { fail = value; } };
}
const change = (page: Page, patch: Record<string, unknown>) => page.evaluate(value => (window as unknown as { changeAuth: (input: typeof value) => void }).changeAuth(value), patch);

test("account switch unmounts private approvals before the new role read completes", async ({ page }) => {
  const f = await fixture(page);
  await page.getByLabel("Private approval draft").fill("Staff A private draft");
  await change(page, { userId: "user-b", sessionId: "session-b" });
  await expect(page.getByLabel("Private approval draft")).toHaveCount(0);
  await expect(page.getByText("Staff A private draft")).toHaveCount(0);
  f.release();
  await expect(page.getByText("Super-admin only", { exact: true })).toBeVisible();
  expect(f.calls).toContain("user-b");
  expect(f.errors).toEqual([]);
});

test("a new authorized session receives a fresh subtree and cannot reuse the previous draft", async ({ page }) => {
  const f = await fixture(page);
  await page.getByLabel("Private approval draft").fill("Staff A private draft");
  await change(page, { userId: "user-c", sessionId: "session-c" });
  await expect(page.getByRole("heading", { name: "Private approval data for user-c", exact: true })).toBeVisible();
  await expect(page.getByLabel("Private approval draft")).toHaveValue("");
  expect(f.calls).toEqual(["user-a", "user-c"]);
  expect(f.errors).toEqual([]);
});

test("sign-out and unresolved auth immediately remove private content without an anonymous read", async ({ page }) => {
  const f = await fixture(page);
  await change(page, { isSignedIn: false, userId: null, sessionId: null });
  await expect(page.getByLabel("Private approval draft")).toHaveCount(0);
  await change(page, { isLoaded: false, isSignedIn: true, userId: "user-a", sessionId: "session-a" });
  await expect(page.getByLabel("Private approval draft")).toHaveCount(0);
  expect(f.calls).toEqual(["user-a"]);
  expect(f.errors).toEqual([]);
});

test("failed permission refresh hides cached staff metadata and offers a scoped retry", async ({ page }) => {
  const f = await fixture(page);
  f.fail(true);
  await page.evaluate(() => (window as unknown as { refreshIdentity: () => Promise<void> }).refreshIdentity());
  await expect(page.getByLabel("Private approval draft")).toHaveCount(0);
  const retry = page.getByRole("button", { name: "Retry access check", exact: true });
  await expect(retry).toBeVisible();
  f.fail(false); await retry.click();
  await expect(page.getByRole("heading", { name: "Private approval data for user-a", exact: true })).toBeVisible();
  expect(f.errors).toEqual([]);
});
