import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ORIGIN = "https://internal-notes.example.test";
let script: Buffer, css: Buffer;
type Note = { id: string; thread_id: string; body: string; include_in_ai_context?: boolean; sender_name: string; sender_type: string; direction: string; channel: string; transport: string; created_at: string; seen: boolean; delivery_status: null };

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-notes-thread-"));
  const mocks: Record<string, string> = {
    "@/hooks/useApi": `import{useSyncExternalStore}from'react';const subscribe=fn=>{window.addEventListener('actor-change',fn);return()=>window.removeEventListener('actor-change',fn)};export const useCurrentUser=()=>{const key=useSyncExternalStore(subscribe,()=>window.fixtureActor,()=>window.fixtureActor);return{data:{id:key,name:'Example operator',role:'loan_exec'},authScope:key,authReady:true}};const api=async(p,o={})=>{const r=await fetch('${ORIGIN}/api/v1'+p,{...o,headers:{'Content-Type':'application/json'}});const data=await r.json();if(!r.ok)throw Error(data.detail||'Request failed');return data};export const useAuthedApi=()=>api;`,
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{FileInternalNotesPanel}from'@/components/file/FileInternalNotesPanel';import{UnifiedThreadConversation}from'@/components/communications/UnifiedThreadConversation';import'@/app/globals.css';import'@/app/app-extras.css';const cache=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});function Harness(){const[open,setOpen]=useState(false),[file,setFile]=useState('example-file-a');return<main style={{padding:16,maxWidth:700,margin:'auto'}}><button onClick={()=>setOpen(v=>!v)}>{open?'Hide notes':'Open notes'}</button><button onClick={()=>setFile('example-file-b')}>Another file</button><button onClick={()=>{window.fixtureActor='operator-b';window.dispatchEvent(new Event('actor-change'))}}>Another operator</button><FileInternalNotesPanel intakeId={file} open={open} onOpenChange={setOpen}/>{new URLSearchParams(location.search).has('external')?<UnifiedThreadConversation threadId='intake:example-file-a:client'/>:null}</main>}createRoot(document.getElementById('root')).render(<QueryClientProvider client={cache}><Harness/></QueryClientProvider>);` }, outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") }, define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) }, loader: { ".module.css": "local-css" }, logLevel: "silent", plugins: [{ name: "notes-api", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: () => unknown) => void }) { build.onResolve({ filter: /^@\/hooks\/useApi$/ }, args => ({ path: args.path, namespace: "notes-mock" })); build.onLoad({ filter: /.*/, namespace: "notes-mock" }, () => ({ contents: mocks["@/hooks/useApi"], loader: "tsx", resolveDir: root })); } }] });
  [script, css] = await Promise.all([readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css"))]);
});

async function fixture(page: Page, external = false) {
  const state = { patches: [] as Array<{ thread: string; id: string; include_in_ai_context: boolean }>, posts: [] as Record<string, unknown>[], errors: [] as string[], failPatch: false, reads: 0 };
  const notes = new Map<string, Note[]>();
  const first = "intake:example-file-a:internal";
  const row = (id: string, thread: string, body: string, flag?: boolean): Note => ({ id, thread_id: thread, body, ...(flag === undefined ? {} : { include_in_ai_context: flag }), sender_name: "Example operator", sender_type: "operator", direction: "outbound", channel: thread.endsWith(":internal") ? "internal" : "client", transport: "internal", created_at: "2026-11-25T12:00:00Z", seen: true, delivery_status: null });
  notes.set(first, [row("example-old-note", first, "Confirm the revised opening hours.")]);
  const detail = (id: string) => ({ thread: { id, title: "Example file notes", participant_name: "Example business", participant_email: null, participant_phone: null, participant_type: "client", source_kind: "intake", source_id: id.split(":")[1], source_ref: null, source_label: "Example file", channel: id.endsWith(":internal") ? "internal" : "client", transport: "internal", unread_count: 0, message_count: (notes.get(id) ?? []).length, latest_snippet: null, latest_at: "2026-11-25T12:00:00Z", assigned_desk: null, href: "/files/example-file-a", can_reply: true }, messages: structuredClone(notes.get(id) ?? []) });
  page.on("pageerror", e => state.errors.push(e.message));
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== ORIGIN) throw Error("Unexpected notes request " + url.origin);
    if (!url.pathname.startsWith("/api/v1/")) return route.fulfill(url.pathname === "/app.js" ? { contentType: "text/javascript", body: script } : url.pathname === "/app.css" ? { contentType: "text/css", body: css } : { contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.fixtureActor='operator-a'</script><script src="/app.js"></script></body></html>` });
    const p = decodeURIComponent(url.pathname.slice(7));
    const patch = p.match(/^\/communications\/threads\/(.+)\/notes\/([^/]+)\/ai-context$/);
    if (request.method() === "PATCH" && patch) {
      const payload = request.postDataJSON();
      state.patches.push({ thread: patch[1], id: patch[2], include_in_ai_context: payload.include_in_ai_context });
      if (state.failPatch) { state.failPatch = false; return route.fulfill({ status: 503, json: { detail: "Example temporary save failure" } }); }
      const note = notes.get(patch[1])?.find(n => n.id === patch[2]);
      if (!note) return route.fulfill({ status: 404, json: { detail: "Note not found" } });
      note.include_in_ai_context = payload.include_in_ai_context;
      return route.fulfill({ json: detail(patch[1]) });
    }
    const post = p.match(/^\/communications\/threads\/(.+)\/messages$/);
    if (request.method() === "POST" && post) {
      const payload = request.postDataJSON(); state.posts.push(payload);
      const rows = notes.get(post[1]) ?? [];
      rows.push(row("example-created-" + state.posts.length, post[1], payload.body, payload.include_in_ai_context)); notes.set(post[1], rows);
      return route.fulfill({ json: detail(post[1]) });
    }
    if (request.method() === "GET" && p.startsWith("/communications/threads/")) { state.reads++; return route.fulfill({ json: detail(p.slice("/communications/threads/".length)) }); }
    if (p === "/communications/read-receipts") return route.fulfill({ json: { updated: 0 } });
    throw Error("Unexpected notes API " + request.method() + " " + p);
  });
  await page.goto(ORIGIN + (external ? "/?external=1" : "/"));
  return state;
}

test("old notes start excluded and each AI choice saves independently with retry", async ({ page }) => {
  const state = await fixture(page);
  expect(state.reads).toBe(0);
  await page.getByRole("button", { name: "Open notes", exact: true }).click();
  const panel = page.getByRole("region", { name: "Internal file notes", exact: true });
  const flags = panel.getByRole("checkbox", { name: "Include in AI context", exact: true });
  await expect(flags).toHaveCount(2);
  await expect(flags.nth(0)).not.toBeChecked(); await expect(flags.nth(1)).not.toBeChecked();
  state.failPatch = true;
  await flags.nth(0).click();
  await expect(panel.getByRole("alert")).toContainText("Example temporary save failure");
  await expect(flags.nth(0)).not.toBeChecked();
  await flags.nth(0).click(); await expect(flags.nth(0)).toBeChecked();
  expect(state.patches).toEqual([{ thread: "intake:example-file-a:internal", id: "example-old-note", include_in_ai_context: true }, { thread: "intake:example-file-a:internal", id: "example-old-note", include_in_ai_context: true }]);
  expect(state.posts).toHaveLength(0);
  await flags.nth(0).click(); await expect(flags.nth(0)).not.toBeChecked();
  expect(state.errors).toEqual([]);
});

test("collapse keeps an unsent note and AI creation choice; another file clears both", async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "Open notes", exact: true }).click();
  const panel = page.getByRole("region", { name: "Internal file notes", exact: true });
  const composer = panel.getByRole("textbox");
  await composer.fill("Example internal follow-up only.");
  const includeNew = panel.getByRole("checkbox", { name: "Include in AI context", exact: true }).last();
  await includeNew.check();
  await page.getByRole("button", { name: "Hide notes", exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Open notes", exact: true }).click();
  await expect(composer).toHaveValue("Example internal follow-up only."); await expect(includeNew).toBeChecked();
  await page.getByRole("button", { name: "Another file", exact: true }).click();
  await expect(composer).toHaveValue("");
  await expect(panel.getByRole("checkbox", { name: "Include in AI context", exact: true })).not.toBeChecked();
  await composer.fill("Example note for the second file.");
  await panel.getByRole("button", { name: "Add internal note", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toMatchObject({ body: "Example note for the second file.", include_in_ai_context: false });
  await expect(composer).toHaveValue("");
  await composer.fill("A note explicitly selected for future staff AI replies.");
  const newFlag = panel.getByRole("checkbox", { name: "Include in AI context", exact: true }).last();
  await newFlag.check();
  await panel.getByRole("button", { name: "Add internal note", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(2);
  expect(state.posts[1]).toMatchObject({ body: "A note explicitly selected for future staff AI replies.", include_in_ai_context: true });
  await expect(composer).toHaveValue("");
  await expect(panel.getByRole("checkbox", { name: "Include in AI context", exact: true }).last()).not.toBeChecked();
  expect(state.errors).toEqual([]);
});

test("external conversations have no AI-note controls and operator changes clear drafts", async ({ page }) => {
  const state = await fixture(page, true);
  await expect(page.getByRole("checkbox", { name: "Include in AI context", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open notes", exact: true }).click();
  const panel = page.getByRole("region", { name: "Internal file notes", exact: true });
  await panel.getByRole("textbox").fill("An unfinished operator note.");
  await page.getByRole("button", { name: "Another operator", exact: true }).click();
  await expect(panel.getByRole("textbox")).toHaveValue("");
  expect(state.posts).toHaveLength(0); expect(state.patches).toHaveLength(0); expect(state.errors).toEqual([]);
});
