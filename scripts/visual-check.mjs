// Visual check — drives headless Chromium over raw CDP and asserts on what a
// diff cannot see.
//
//   npx next dev -p 3111 &
//   node scripts/visual-check.mjs /ds-gallery /terms /agreement
//   WIDTHS=1280,1440 node scripts/visual-check.mjs /ds-gallery
//
// It screenshots each route at each width and reports:
//   overflow     the page scrolls sideways, and which element is guilty
//   zeroHeight   an element with children that collapsed to nothing
//   transparent  a .card/.panel/.kpi/.itemrow that resolved to no background,
//                which means its class did not apply
//   clipped      content wider than its own overflow:hidden box — the silent
//                one, because nothing spills to give it away
//   invisible    text the same colour as the ground behind it
//
// This exists because the class migration was verified structurally the whole
// way and the first time anyone LOOKED at a page it turned up `Sub` rendering
// as an inline span — so every "<b>Title</b><Sub>caption</Sub>" in the app,
// the most common pattern in it, ran together on one line. Run this before a
// release.
//
// Authenticated routes redirect at the Clerk edge; pass a session cookie in
// CLERK_COOKIE to reach them, or point it at /ds-gallery, which renders the
// whole shared vocabulary with no session and no data.

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux/chrome";
const BASE = process.env.BASE || "http://127.0.0.1:3111";
const OUT = process.env.OUT || "/tmp/claude-1000/-home-ubuntu/51c1bcd1-9939-4b34-b224-93d555af5125/scratchpad/shots";
const WIDTHS = (process.env.WIDTHS || "1280,1440").split(",").map(Number);
const ROUTES = process.argv.slice(2);
const COOKIE = process.env.CLERK_COOKIE || "";

mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9222", "--no-sandbox",
  "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--force-device-scale-factor=1", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9222/json/version");
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error("chrome never came up");
}

let nextId = 1;
function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) {
      for (const l of listeners) l(m);
    }
  });
  const ready = new Promise((r) => ws.addEventListener("open", r));
  return {
    ready,
    on: (f) => listeners.push(f),
    send(method, params = {}, sessionId) {
      const id = nextId++;
      return new Promise((res, rej) => {
        pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
  };
}

// ── the assertions ───────────────────────────────────────────────────────
const PROBE = `(() => {
  const out = { overflow: null, zeroHeight: [], transparent: [], font: null,
                invisible: [], clipped: [], tinyTap: [] };
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    // Find who is actually wider than the viewport.
    const guilty = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > de.clientWidth + 1 || r.right > de.clientWidth + 1) {
        if (el.children.length === 0 || r.width > de.clientWidth + 1)
          guilty.push(sig(el) + " w=" + Math.round(r.width) + " right=" + Math.round(r.right));
      }
      if (guilty.length > 6) break;
    }
    out.overflow = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, guilty };
  }
  function sig(el) {
    const c = (el.className && typeof el.className === "string") ? "." + el.className.trim().split(/\\s+/).slice(0,3).join(".") : "";
    return el.tagName.toLowerCase() + c;
  }
  function isTransparent(c) { return !c || c === "transparent" || /rgba\\(\\s*0,\\s*0,\\s*0,\\s*0\\s*\\)/.test(c); }

  for (const el of document.querySelectorAll(".card, .panel, .kpi, .itemrow, .rung, .pick, .drawer, .callout")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;               // not rendered
    if (isTransparent(cs.backgroundColor) && !el.closest(".v-mca, .qc-marketing, .qc-authshell"))
      out.transparent.push(sig(el) + " bg=" + cs.backgroundColor);
    if (r.height < 2 && el.children.length > 0)
      out.zeroHeight.push(sig(el) + " children=" + el.children.length);
    // content wider than its own box while overflow is hidden = silent clipping
    if (cs.overflow === "hidden" || cs.overflowX === "hidden") {
      if (el.scrollWidth > el.clientWidth + 2)
        out.clipped.push(sig(el) + " scrollW=" + el.scrollWidth + " clientW=" + el.clientWidth);
    }
  }
  // text the same colour as what is behind it
  for (const el of document.querySelectorAll("body *")) {
    if (!el.firstChild || el.firstChild.nodeType !== 3 || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    let bgEl = el, bg = cs.backgroundColor;
    while (isTransparent(bg) && bgEl.parentElement) { bgEl = bgEl.parentElement; bg = getComputedStyle(bgEl).backgroundColor; }
    if (cs.color === bg && cs.opacity !== "0") out.invisible.push(sig(el) + " color=" + cs.color);
    if (out.invisible.length > 5) break;
  }
  out.font = getComputedStyle(document.body).fontFamily;
  const h1 = document.querySelector("h1");
  out.h1 = h1 ? h1.textContent.trim().slice(0, 60) : null;
  out.headings = [...document.querySelectorAll("h1,h2,h3")].map(h => h.tagName).join(",");
  return out;
})()`;

(async () => {
  const client = connect(await wsUrl());
  await client.ready;
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => client.send(m, p, sessionId);

  await S("Page.enable"); await S("Runtime.enable"); await S("Network.enable");
  const consoleErrors = [];
  client.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Runtime.exceptionThrown")
      consoleErrors.push("EXC " + (m.params.exceptionDetails?.exception?.description || "").slice(0, 200));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      consoleErrors.push("ERR " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200));
  });

  if (COOKIE) {
    const host = new URL(BASE).hostname;
    for (const kv of COOKIE.split(";")) {
      const i = kv.indexOf("="); if (i < 0) continue;
      await S("Network.setCookie", { name: kv.slice(0, i).trim(), value: kv.slice(i + 1).trim(), domain: host, path: "/" });
    }
  }

  const report = [];
  for (const route of ROUTES) {
    for (const w of WIDTHS) {
      await S("Emulation.setDeviceMetricsOverride", { width: w, height: 1000, deviceScaleFactor: 1, mobile: false });
      consoleErrors.length = 0;
      await S("Page.navigate", { url: BASE + route });
      // dev server compiles on first hit; give it room, then settle
      let ok = false;
      for (let i = 0; i < 100; i++) {
        await sleep(400);
        const r = await S("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
        if (r.result.value === "complete") { ok = true; break; }
      }
      await sleep(1200);
      const url = (await S("Runtime.evaluate", { expression: "location.pathname", returnByValue: true })).result.value;
      let probe = null, perr = null;
      try {
        probe = (await S("Runtime.evaluate", { expression: PROBE, returnByValue: true })).result.value;
      } catch (e) { perr = String(e).slice(0, 200); }
      const shot = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      const file = `${OUT}/${route.replace(/[^a-z0-9]+/gi, "_") || "root"}_${w}.png`;
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      report.push({ route, width: w, ready: ok, landedOn: url, file, probe, perr,
                    consoleErrors: consoleErrors.slice(0, 5) });
      process.stderr.write(`  ${route} @${w} -> ${url}\n`);
    }
  }
  console.log(JSON.stringify(report, null, 2));
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error("HARNESS FAIL", e); chrome.kill(); process.exit(1); });
