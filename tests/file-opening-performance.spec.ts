import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Actual useLeadFile + session-scoped Providers. Only services/auth and unrelated
// global UI providers are fictional; no real client records or HTTP calls.
let script: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-file-opening-"));
  const passthrough = "({children})=>children";
  const mocks: Record<string, string> = {
    "@/lib/consoleAuth": "export const isVisualQa=false;export const visualQaUser=()=>null;export const useConsoleAuth=()=>window.fixtureAuth;",
    "@/lib/api": "export class ApiError extends Error{constructor(status){super('Access denied');this.status=status}};window.FixtureApiError=ApiError;export const api=(...args)=>window.fixtureApi(...args);",
    "@/components/admin/AIReviewProvider": `export const AIReviewProvider=${passthrough};export const useAIReview=()=>({requestReview:()=>{},isReviewing:()=>false});`,
    "@/components/design-system/ThemeProvider": `export const ThemeProvider=${passthrough};`,
    "@/components/design-system/ConfirmationProvider": `export const ConfirmationProvider=${passthrough};`,
    "@/components/shell/StaleBuildReload": "export default()=>null;",
  };
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import Providers from'@/app/providers';import{useLeadFile}from'@/components/file/useLeadFile';
    window.requests=[];window.abortedRequests=[];window.paints=[];window.delays={facts:180,analysis:700};window.fixtureRevision=1;window.deny=false;window.failRefresh=false;
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    window.fixtureApi=async(path,init={})=>{
      const actor=init.authToken||'none';const full=!path.includes('include_derived=false');const id=(path.match(/ai-underwriter-leads\\/([^/?]+)/)||[])[1];
      const request={path,actor,id,full,started:performance.now()};window.requests.push(request);await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);window.requests=window.requests.filter(row=>row!==request);window.abortedRequests.push(request);reject(new DOMException('Aborted','AbortError'))};const timer=setTimeout(()=>{init.signal?.removeEventListener('abort',abort);resolve()},full?window.delays.analysis:window.delays.facts);init.signal?.addEventListener('abort',abort,{once:true});if(init.signal?.aborted)abort()});
      if(window.deny)throw new window.FixtureApiError(window.denyStatus||403);if(window.failRefresh)throw new Error('Fictional refresh failure');request.finished=performance.now();
      return{application_profile_id:'profile-'+id,derived_pending:!full,intake:{id,business_name:actor+' / '+id+' / '+window.fixtureRevision,full_name:'Fictional owner',variant:'mca_refinance',status:'collecting_docs'},files:[],requested_documents:[],messages:[],notes:[],artifacts:[],latest_review:full?{status:'completed',result:{current:window.fixtureRevision}}:null};
    };
    function File({id}){const[notice,setNotice]=useState('');const file=useLeadFile({leadId:id,notify:setNotice});useEffect(()=>{if(file.detail)window.paints.push({id,at:performance.now()})},[id,file.detail]);return <section><div role='status'>{file.loading?'Opening':file.refreshing?'Refreshing':'Ready'}</div><h1>{file.detail?.intake.business_name||'No file'}</h1><p>{file.detail?.derived_pending?'Current analysis pending':'Analysis ready'}</p><p>{notice}</p><button onClick={()=>file.requestDerived()}>Load analysis</button><button onClick={()=>{window.fixtureRevision++;void file.reload()}}>Mutate and refresh</button><button onClick={()=>{window.deny=true;void file.reload()}}>Revoke access</button><button onClick={()=>{window.failRefresh=true;void file.reload()}}>Fail refresh</button></section>}
    const getToken=async()=>window.fixtureAuth.userId;
    function App(){const[id,setId]=useState(null),[actor,setActor]=useState('operator-a'),[signedIn,setSignedIn]=useState(true);window.fixtureAuth={isLoaded:true,isSignedIn:signedIn,userId:signedIn?actor:null,sessionId:'session-'+actor,orgId:'org-1',getToken};return <><nav><button onClick={()=>setId('file-a')}>Open A</button><button onClick={()=>setId('file-b')}>Open B</button><button onClick={()=>setId(null)}>Close</button><button onClick={()=>setActor('operator-b')}>Switch operator</button><button onClick={()=>setSignedIn(false)}>Sign out</button><button onClick={()=>setSignedIn(true)}>Sign in</button></nav><Providers>{id?<File id={id}/>:<p>Closed</p>}</Providers></>}
    createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
  ` }, bundle: true, outfile: path.join(directory, "fixture.js"), format: "iife", jsx: "automatic", platform: "browser", define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "fictional-services", setup(build: { onResolve: (options: unknown, callback: (args: {path: string}) => unknown) => void; onLoad: (options: unknown, callback: (args: {path: string}) => unknown) => void }) {
    build.onResolve({ filter: /^@\// }, ({ path: name }) => mocks[name] ? { path: name, namespace: "fixture" } : { path: path.join(root, "src", name.slice(2)) + (name.endsWith("providers") ? ".tsx" : name.includes("useLeadFile") ? ".ts" : ".ts") });
    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx" }));
  } }] });
  script = await readFile(path.join(directory, "fixture.js"));
});

test.beforeEach(async ({ page }) => {
  await page.route("https://file-opening.test/**", route => route.fulfill({ contentType: route.request().url().endsWith(".js") ? "application/javascript" : "text/html", body: route.request().url().endsWith(".js") ? script : "<html><body><div id='root'></div><script src='/fixture.js'></script></body></html>" }));
  await page.goto("https://file-opening.test");
});

test("cold facts paint without starting expensive analysis, while reopens paint from memory", async ({ page }) => {
  await page.getByRole("button", { name: "Open A", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-a / 1");
  expect(await page.evaluate(() => (window as unknown as {requests: Array<{full: boolean}>}).requests.filter(r => r.full).length)).toBe(0);
  await expect(page.getByText("Current analysis pending", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => { (window as unknown as {delays: {facts: number}}).delays.facts = 1000; });
  await page.getByRole("button", { name: "Open A", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-a / 1", { timeout: 500 });
  await expect(page.getByRole("status")).toHaveText("Refreshing");
  await expect.poll(() => page.evaluate(() => (window as unknown as {requests: unknown[]}).requests.length)).toBe(2);
  const timing = await page.evaluate(() => {
    const fixture = window as unknown as { requests: Array<{started: number}>; paints: Array<{at: number}> };
    return { coldFactsMs: fixture.paints[0].at - fixture.requests[0].started, cachedReopenMs: fixture.paints.at(-1)!.at - fixture.requests[1].started };
  });
  console.log("Synthetic file-opening timing (180ms factual response; cached reopen refresh delayed 1000ms):", timing);
});

test("only an explicit analysis request starts derived work and mutations refresh both stages", async ({ page }) => {
  await page.getByRole("button", { name: "Open A", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-a / 1");
  await page.getByRole("button", { name: "Load analysis", exact: true }).click();
  await expect(page.getByText("Analysis ready", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {requests: unknown[]}).requests.length)).toBe(2);
  await page.getByRole("button", { name: "Mutate and refresh", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-a / 2");
  await expect(page.getByText("Analysis ready", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {requests: unknown[]}).requests.length)).toBe(4);
});

test("file and authentication switches never show the preceding file or operator", async ({ page }) => {
  await page.getByRole("button", { name: "Open A", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-a / 1");
  await page.getByRole("button", { name: "Open B", exact: true }).click();
  await expect(page.getByRole("heading")).not.toContainText("file-a");
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-b / 1");
  await page.getByRole("button", { name: "Switch operator", exact: true }).click();
  await expect(page.getByRole("heading")).not.toContainText("operator-a");
  await expect(page.getByRole("heading")).toHaveText("operator-b / file-b / 1");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("No file");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-b / file-b / 1");
});

test("switching identity aborts an in-flight private analysis transport", async ({ page }) => {
  await page.getByRole("button", { name: "Open A", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-a / 1");
  await page.getByRole("button", { name: "Load analysis", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {requests: Array<{full: boolean}>}).requests.some(row => row.full))).toBe(true);
  await page.getByRole("button", { name: "Switch operator", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-b / file-a / 1");
  expect(await page.evaluate(() => (window as unknown as {abortedRequests: Array<{full: boolean; actor: string}>}).abortedRequests.some(row => row.full && row.actor === "operator-a"))).toBe(true);
});

for (const deniedStatus of [403, 404]) test(`permission failure ${deniedStatus} immediately clears cached facts and refresh errors do not repeat writes`, async ({ page }) => {
  await page.getByRole("button", { name: "Open A", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-a / 1");
  await page.getByRole("button", { name: "Fail refresh", exact: true }).click();
  await expect(page.getByText("Fictional refresh failure", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as {requests: unknown[]}).requests.length)).toBe(2);
  await page.evaluate(() => { (window as unknown as {failRefresh: boolean}).failRefresh = false; });
  await page.evaluate(status => { (window as unknown as {denyStatus: number}).denyStatus = status; }, deniedStatus);
  await page.getByRole("button", { name: "Revoke access", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("No file");
  await page.evaluate(() => { (window as unknown as {deny: boolean}).deny = false; });
  await page.getByRole("button", { name: "Mutate and refresh", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("operator-a / file-a / 2");
});
