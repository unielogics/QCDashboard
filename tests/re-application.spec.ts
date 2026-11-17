import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

// The real estate loan application in a real browser: the client's page (code gate, gaps first, "Looks right",
// review, submit, sign) and the desk's drawer (signing status, dropped values, sharing with a partner). The
// components are the real ones; only the API answers here, from replies the backend itself produced for a made-up
// file (tests/fixtures/re-application, regenerated from app/services/client_forms.py and signed_forms.py), and a
// stand-in that keeps the draft the way the server does. Nothing reaches a network.
const ORIGIN = "https://forms.test";
const TOKEN = "synthetic-application-token";
const FIXTURES = path.join(process.cwd(), "tests/fixtures/re-application");

type Json = Record<string, unknown>;
type View = Json & {
  schema: { sections: Array<Json & { key: string; per_role?: boolean; fields: Array<Json & { key: string; type: string; required: boolean; options?: Array<{ value: string }> }> }> };
  body: Json; provenance: Record<string, Json>; please_check: string[]; revision: number; status: string; version: Json | null;
  completion: { sections: Array<Json & { key: string }>; filled: number; total: number; missing: string[]; complete: boolean };
};
type Sent = { path: string; method: string; session: string | null; payload: Json | null };
type Lib = {
  applicableFields: (schema: unknown, body: Json) => Array<{ path: string; spec: { required: boolean }; section: { key: string; label: string } }>;
  getAt: (body: Json, path: string) => unknown; setAt: (body: Json, path: string, value: unknown) => Json; isBlank: (value: unknown) => boolean;
};

let pageScript: Buffer;
let pageCss: Buffer;
let deskScript: Buffer;
let deskCss: Buffer;
let globalCss: Buffer;
let extrasCss: Buffer;
let lib: Lib;
const fixture = async <T,>(name: string): Promise<T> => JSON.parse(await readFile(path.join(FIXTURES, `${name}.json`), "utf8")) as T;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(projectRequire.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-re-application-"));
  const common = {
    bundle: true, platform: "browser", jsx: "automatic", nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    loader: { ".module.css": "local-css" }, logLevel: "silent",
  };
  // The client's page, with the route's token and an API on the page's own origin.
  await esbuild.build({
    ...common, format: "iife", outfile: path.join(directory, "page.js"),
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Page from'@/app/forms/re_application/[token]/page';import'@/app/globals.css';import'@/app/app-extras.css';createRoot(document.getElementById('root')).render(<Page/>);` },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(ORIGIN) },
    plugins: [{ name: "route", setup(build: { onResolve: (options: { filter: RegExp }, callback: () => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: () => unknown) => void }) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "route" }));
      build.onLoad({ filter: /.*/, namespace: "route" }, () => ({ contents: `export const useParams=()=>({token:${JSON.stringify(TOKEN)}});`, loader: "js" }));
    } }],
  });
  // The desk's drawer, with the signed-in API answered by window.__api.
  const hooksSource = await readFile(path.join(root, "src/hooks/useApi.ts"), "utf8");
  const hookNames = [...hooksSource.matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map((match) => match[1]);
  const mocks: Record<string, string> = {
    "@/hooks/useApi": hookNames.map((name) => name === "useAuthedApi" ? "export const useAuthedApi=()=>window.__api;" : `export const ${name}=()=>({});`).join("\n"),
    "@/lib/consoleAuth": "export const isVisualQa=false;export const useConsoleAuth=()=>({getToken:async()=>null,isLoaded:true,isSignedIn:true});",
  };
  await esbuild.build({
    ...common, format: "iife", outfile: path.join(directory, "desk.js"),
    stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import{ReApplicationPanel}from'@/components/file/ReApplicationPanel';
      createRoot(document.getElementById('root')).render(<div className="content content--wide" id="scroller"><ReApplicationPanel profileId="profile-1" open onClose={()=>{window.__closed=true}}/></div>);` },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": '"http://api.plan.test"' },
    plugins: [{ name: "desk-stubs", setup(build: { onResolve: (filter: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (filter: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
      build.onResolve({ filter: /.*/ }, (args) => args.path in mocks ? { path: args.path, namespace: "desk-stub" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "desk-stub" }, (args) => ({ contents: mocks[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  // The schema rules on the Node side, so the stand-in counts what is still needed the way the page does.
  await esbuild.build({ ...common, platform: "node", format: "cjs", outfile: path.join(directory, "lib.cjs"), entryPoints: [path.join(root, "src/lib/reApplication.ts")] });
  lib = projectRequire(path.join(directory, "lib.cjs")) as Lib;
  execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "src/app/globals.css", "-o", path.join(directory, "globals.css")], { cwd: root, stdio: "ignore" });
  [pageScript, pageCss, deskScript, deskCss, globalCss, extrasCss] = await Promise.all([
    readFile(path.join(directory, "page.js")), readFile(path.join(directory, "page.css")), readFile(path.join(directory, "desk.js")),
    readFile(path.join(directory, "desk.css")).catch(() => Buffer.from("")), readFile(path.join(directory, "globals.css")), readFile(path.join(root, "src/app/app-extras.css")),
  ]);
});

// The draft as the server keeps it: answers land on the body, "Looks right" clears a check, a value the AI suggested
// counts as missing until it is confirmed, and every save moves the revision on.
function recount(view: View): View {
  const refs = lib.applicableFields(view.schema, view.body).filter((ref) => ref.spec.required);
  const missing = refs.filter((ref) => lib.isBlank(lib.getAt(view.body, ref.path)) || view.please_check.includes(ref.path)).map((ref) => ref.path);
  const sections = view.completion.sections.map((section) => {
    const mine = refs.filter((ref) => ref.section.key === section.key);
    const gaps = mine.filter((ref) => missing.includes(ref.path)).map((ref) => ref.path);
    return { ...section, total: mine.length, filled: mine.length - gaps.length, missing: gaps, applies: mine.length > 0 };
  });
  return { ...view, completion: { sections, total: refs.length, filled: refs.length - missing.length, missing, complete: missing.length === 0 } };
}

type Stand = { view: View; signing: Json; executed: Json; sent: Sent[]; session: string; failDrafts?: number };

async function openClient(page: Page, stand: Stand) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const base = `/api/v1/public/forms/${TOKEN}`;
  await page.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/page.js") return route.fulfill({ contentType: "text/javascript", body: pageScript });
    if (url.pathname === "/page.css") return route.fulfill({ contentType: "text/css", body: pageCss });
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body style="margin:0"><div id="root"></div><script src="/page.js"></script></body></html>' });
    if (!url.pathname.startsWith(base)) return route.fulfill({ status: 404, body: "" });
    const tail = url.pathname.slice(base.length);
    const session = request.headers()["x-form-session"] ?? null;
    const payload = request.method() === "GET" ? null : (request.postDataJSON() as Json | null);
    stand.sent.push({ path: tail, method: request.method(), session, payload });
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (tail === "/code") return json(200, { sent: true, email_hint: "j*****@example.com" });
    if (tail === "/verify") return payload?.code === "246810" ? json(200, { session: stand.session, expires_at: "2026-11-18T03:00:00Z" }) : json(400, { detail: "That code is not right. Check the email and try again." });
    if (session !== stand.session) {
      if (tail === "" && request.method() === "GET") return json(200, { kind: "re_application", title: "Qualified Commercial Real Estate Loan Application", needs_code: true, email_hint: "j*****@example.com" });
      return json(401, { detail: "Open the application with the code we email you." });
    }
    if (tail === "" && request.method() === "GET") return json(200, { ...stand.view, needs_code: false });
    if (tail === "/draft") {
      if (stand.failDrafts) { stand.failDrafts -= 1; return json(503, { detail: "The service is busy." }); }
      if (payload?.revision !== stand.view.revision) return json(409, { detail: { code: "revision_conflict", message: "The application changed in another window. Reload to continue." } });
      let body = stand.view.body;
      for (const [key, value] of Object.entries((payload?.changes as Json) ?? {})) body = lib.setAt(body, key, value);
      if (typeof payload?.has_coborrower === "boolean") body = { ...body, has_coborrower: payload.has_coborrower };
      const confirmed = (payload?.confirm as string[]) ?? [];
      const provenance = { ...stand.view.provenance };
      for (const key of confirmed) provenance[key] = { ...provenance[key], confirmed: true };
      stand.view = recount({ ...stand.view, body, provenance, please_check: stand.view.please_check.filter((key) => !confirmed.includes(key)), revision: stand.view.revision + 1 });
      return json(200, { ...stand.view, needs_code: false });
    }
    if (tail === "/submit") {
      if (!stand.view.completion.complete) return json(409, { detail: { code: "incomplete", message: "A few answers are still needed." } });
      const version = (stand.signing.version as Json) ?? {};
      stand.view = { ...stand.view, status: "submitted", version: { id: version.id, number: 1, submitted_at: "2026-11-17T15:00:00Z", submitted_by: "client", body_sha256: version.body_sha256, pdf_available: true } };
      return json(200, { ...stand.view, needs_code: false });
    }
    if (tail === "/signing") return json(200, stand.signing);
    if (tail === "/sign") return json(200, stand.executed);
    return json(404, { detail: "Not found" });
  });
  await page.goto(`${ORIGIN}/`);
  return errors;
}

const overflow = (page: Page) => page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
const dashed = (key: string) => `#ra-${key.replace(/\./g, "-")}`;

function specFor(view: View, key: string) {
  const [first, second, name] = key.split(".");
  const section = view.schema.sections.find((item) => item.key === first)!;
  return section.fields.find((field) => field.key === (section.per_role ? name : second))!;
}

const SAMPLE: Record<string, string> = {
  text: "Sample", textarea: "Sample answer", money: "1000", integer: "3", year: "2001", percent: "50", score: "712", date: "2001-02-03",
  email: "sample@example.com", phone: "7045550123", ssn_last4: "1234", state: "NC", zip: "28202", ein: "12-3456789",
};

async function answer(page: Page, view: View, key: string) {
  const spec = specFor(view, key);
  const id = dashed(key);
  if (spec.type === "select") await page.locator(id).selectOption({ index: 1 });
  // A click, not check(): the answer is saved at once, and the page may move on (a save, or the code gate
  // when the session has ended) before a "stays checked" wait could be satisfied.
  else if (spec.type === "yesno") await page.locator(`[role="radiogroup"][aria-labelledby="${id.slice(1)}"]`).getByLabel(key.endsWith("business_purpose") ? "Yes" : "No").click();
  else if (spec.type === "multiselect") await page.locator(`[role="group"][aria-labelledby="${id.slice(1)}"] input[type="checkbox"]`).first().click();
  // Blur rather than Tab: Tab inside a date input moves between its month, day and year.
  else { await page.locator(id).fill(SAMPLE[spec.type] ?? "Sample"); await page.locator(id).blur(); }
}

async function passGate(page: Page) {
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Code from the email").fill("246810");
  await page.getByRole("button", { name: "Open my application" }).click();
  await expect(page.getByRole("heading", { name: "Qualified Commercial Real Estate Loan Application", level: 1 })).toBeVisible();
}

test("a save that fails waits and tries again instead of looping, and an ended session returns to the code", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1290, height: 900 });
  const stand: Stand = { view: await fixture<View>("client_initial"), signing: await fixture<Json>("signing_ready"), executed: await fixture<Json>("signing_executed"), sent: [], session: "session-1", failDrafts: 2 };
  const errors = await openClient(page, stand);
  await passGate(page);
  const drafts = () => stand.sent.filter((row) => row.path === "/draft").length;

  // The server is busy twice. The answer is kept and tried again later, not hammered.
  const first = stand.view.completion.missing.find((key) => !stand.view.please_check.includes(key))!;
  await answer(page, stand.view, first);
  await expect(page.getByText("Your last answer is not saved yet. Trying again…")).toBeVisible();
  await page.waitForTimeout(1_200);
  expect(drafts()).toBe(1);
  await expect.poll(() => stand.view.revision, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(drafts()).toBe(3);
  await expect(page.getByText("Your last answer is not saved yet. Trying again…")).toHaveCount(0);

  // The session ends (twelve hours, or the link was replaced): the page asks for a new code and stops saving.
  stand.session = "session-2";
  const before = drafts();
  await answer(page, stand.view, stand.view.completion.missing.find((key) => !stand.view.please_check.includes(key))!);
  await expect(page.getByRole("heading", { name: "Open your application" })).toBeVisible();
  await expect(page.getByText(/Your session ended/)).toBeVisible();
  await page.waitForTimeout(800);
  expect(drafts()).toBe(before + 1);
  expect(errors).toEqual([]);
});

for (const width of [1290, 390]) {
  test(`a client opens the application with a code, fills only the gaps, reviews, submits and signs (${width}px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    const stand: Stand = { view: await fixture<View>("client_initial"), signing: await fixture<Json>("signing_ready"), executed: await fixture<Json>("signing_executed"), sent: [], session: "session-1" };
    const errors = await openClient(page, stand);

    // The emailed link asks for a code before anything about the person is shown.
    await expect(page.getByRole("heading", { name: "Open your application" })).toBeVisible();
    expect(stand.sent.filter((row) => row.path === "").every((row) => row.session === null)).toBe(true);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await passGate(page);

    // The gaps come first; what onboarding already answered waits, folded, below them.
    await expect(page.getByText(/Already on your application \(\d+\)/)).toBeVisible();
    expect(stand.view.please_check.length).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Looks right" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Review my application" })).toBeDisabled();
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // Answer what is still needed, one gap at a time, the way the client would.
    for (let round = 0; round < 120 && (stand.view.please_check.length || !stand.view.completion.complete); round += 1) {
      const before = stand.view.revision;
      const check = stand.view.please_check[0];
      if (check) await page.locator(".fp-field, .ra-check-field").filter({ has: page.locator(dashed(check)) }).getByRole("button", { name: "Looks right" }).first().click();
      else await answer(page, stand.view, stand.view.completion.missing[0]);
      await expect.poll(() => stand.view.revision, { timeout: 10_000, message: `saving ${check ?? stand.view.completion.missing[0]}` }).toBeGreaterThan(before);
      if (round === 8) {
        // Answered fields stay in place while the client works, but the count says only what is still open.
        const left = stand.view.completion.total - stand.view.completion.filled;
        await expect(page.getByText(`${left} still needed`)).toBeVisible();
        await expect(page.getByText(`${left} answers left`)).toBeVisible();
      }
    }
    expect(stand.view.completion.complete).toBe(true);
    await expect(page.getByText("All changes saved")).toBeVisible();
    const drafts = stand.sent.filter((row) => row.path === "/draft");
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((row) => row.session === "session-1" && row.method === "PUT")).toBe(true);

    // The review reads everything back before anything is submitted.
    await page.getByRole("button", { name: "Review my application" }).click();
    await expect(page.getByRole("button", { name: "Submit application" })).toBeVisible();
    expect(stand.sent.some((row) => row.path === "/submit")).toBe(false);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Submit application" }).click();

    // Signing shows the server's own words and sends back exactly what was shown.
    await expect(page.getByRole("heading", { name: "Review and sign" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("What you agree to by signing")).toBeVisible();
    const consents = stand.signing.consents as Array<{ key: string; sha256: string; text: string }>;
    await expect(page.getByText(consents.find((item) => item.key === "information_sharing")!.text.slice(0, 60), { exact: false })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    for (const box of await page.locator(".ra-consent input[type=checkbox]").all()) await box.check();
    await page.getByLabel("Type your full legal name").fill(String(stand.signing.signer_name));
    const pad = page.locator("canvas").first();
    await pad.scrollIntoViewIfNeeded();
    const area = (await pad.boundingBox())!;
    await page.mouse.move(area.x + 20, area.y + area.height / 2);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width / 2, area.y + 15, { steps: 8 });
    await page.mouse.move(area.x + area.width - 20, area.y + area.height - 15, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Sign the application" }).click();
    await expect(page.getByRole("heading", { name: "Your application is signed" })).toBeVisible({ timeout: 15_000 });

    const sign = stand.sent.find((row) => row.path === "/sign")!;
    const version = stand.signing.version as Json;
    expect(sign.payload?.consents).toEqual(consents.map((item) => ({ key: item.key, sha256: item.sha256 })));
    expect([sign.payload?.version_id, sign.payload?.body_sha256, sign.payload?.esign_consent, sign.payload?.typed_name]).toEqual([version.id, version.body_sha256, true, stand.signing.signer_name]);
    expect(String(sign.payload?.signature_data_url)).toMatch(/^data:image\/png;base64,/);
    expect(errors).toEqual([]);
  });
}

async function openDesk(page: Page, reply: Json, share?: Json) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/desk.js") return route.fulfill({ contentType: "text/javascript", body: deskScript });
    if (url.pathname === "/globals.css") return route.fulfill({ contentType: "text/css", body: globalCss });
    if (url.pathname === "/extras.css") return route.fulfill({ contentType: "text/css", body: extrasCss });
    if (url.pathname === "/desk.css") return route.fulfill({ contentType: "text/css", body: deskCss });
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/extras.css"><link rel="stylesheet" href="/desk.css"></head><body style="margin:0"><div style="display:flex"><nav style="width:242px;flex:none;height:100vh;background:#f2f4f7"></nav><div style="flex:1;min-width:0"><div style="height:51px;border-bottom:1px solid #e4e7ec"></div><div id="root"></div></div></div><script>window.__sent=[];window.__reply=${JSON.stringify(reply)};window.__share=${JSON.stringify(share ?? null)};window.__links=0;window.__api=async(path,opts={})=>{const method=opts.method||'GET';const body=opts.body?JSON.parse(opts.body):null;window.__sent.push({path,method,body});if(method==='GET')return window.__reply;if(path.endsWith('/share'))return window.__share;if(path.endsWith('/link')){if(body.reset)window.__links+=1;return{url:'https://app.qualifiedcommercial.com/forms/re_application/example-link-'+window.__links,expires_at:'2026-12-17T00:00:00Z',email:'j*****@example.com',emailed:Boolean(body.send_email),role:body.role}}throw new Error('Unexpected '+method+' '+path)};</script><script src="/desk.js"></script></body></html>` });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("https://desk.test/");
  return errors;
}

test("the desk sees a signed application, can start a new version and shares it with a partner off the roster (1290px)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1290, height: 900 });
  const errors = await openDesk(page, await fixture<Json>("desk_executed"), await fixture<Json>("share_result"));
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Real estate loan application")).toBeVisible();
  await expect(drawer.getByText(/Signed by everyone/)).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Start a new version" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await drawer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);

  // The file's own link: one click copies it, it reads the same the next time, and it can be replaced.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const link = drawer.getByRole("region", { name: "Application link" });
  await link.getByRole("button", { name: "Copy the link" }).click();
  await expect(drawer.getByText(/Application link copied\. The client opens it with a code we email to j\*+@example\.com/)).toBeVisible();
  expect(await page.evaluate("navigator.clipboard.readText()")).toBe("https://app.qualifiedcommercial.com/forms/re_application/example-link-0");
  await expect(link.getByText("https://app.qualifiedcommercial.com/forms/re_application/example-link-0")).toBeVisible();
  await link.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate("navigator.clipboard.readText()")).toBe("https://app.qualifiedcommercial.com/forms/re_application/example-link-0");
  await link.getByRole("button", { name: "Replace this link with a new one" }).click();
  await link.getByRole("button", { name: "Make a new link" }).click();
  await expect(link.getByText("https://app.qualifiedcommercial.com/forms/re_application/example-link-1")).toBeVisible();
  expect(await drawer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);

  await drawer.getByRole("button", { name: "Share with a partner" }).click();
  await drawer.getByLabel("Who receives it").fill("Pat Lender");
  await drawer.getByLabel("Company (optional)").fill("Bridge Partners");
  await drawer.getByRole("button", { name: "Make the link" }).click();
  await expect(drawer.getByText(/Link for Pat Lender, Bridge Partners/)).toBeVisible();
  await expect(drawer.getByText("Copy code")).toBeVisible();
  await expect(drawer.locator(".ra-relay-list")).toContainText("Pat Lender, Bridge Partners");
  const sent = await page.evaluate("window.__sent") as Array<{ path: string; method: string; body: Json | null }>;
  const share = sent.find((row) => row.path.endsWith("/share"))!;
  expect([share.method, share.body]).toEqual(["POST", { recipient_name: "Pat Lender", organization: "Bridge Partners", recipient_email: null }]);
  expect(await drawer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("the desk sees what onboarding answered and the stored values it left blank (1290px)", async ({ page }) => {
  await page.setViewportSize({ width: 1290, height: 900 });
  const reply = await fixture<Json & { warnings: Array<{ message: string }> }>("desk_initial");
  const errors = await openDesk(page, reply);
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Values on the file that were left blank")).toBeVisible();
  expect(reply.warnings.length).toBeGreaterThan(0);
  for (const warning of reply.warnings) await expect(drawer.getByText(warning.message)).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Email the client a link" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
