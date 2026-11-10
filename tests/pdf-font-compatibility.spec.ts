import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pdfFontCompatibility } from "./fixtures/pdfFontCompatibility";

// The real shared reader, real PDF.js worker/assets, and a synthetic embedded
// CFF font. Only the file-review service and its allowed preview URL are fake.
let script: Buffer, css: Buffer, fixturePdf: Buffer, pdfjsRoot: string;

test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-pdf-fonts-"));
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React,{useCallback,useState}from'react';import{createRoot}from'react-dom/client';
      import{BucketFileReviewPanel}from'@/components/buckets/BucketFileReviewPanel';
      import'@/app/globals.css';import'@/app/app-extras.css';
      const file={id:'synthetic-font-source',file_name:'Synthetic font sample.pdf',content_type:'application/pdf'};
      function App(){const[open,setOpen]=useState(true),[page,setPage]=useState(1),[request,setRequest]=useState(0);
        const load=useCallback(async()=>({file,preview_url:location.search.includes('invalid')?'/invalid.pdf':'/sample.pdf',annotations:[]}),[]);
        return<><button onClick={()=>setOpen(true)}>Open preview</button>{open?<BucketFileReviewPanel title='Synthetic PDF review' reviewKey='font-fixture' loadReview={load} onClose={()=>setOpen(false)} annotationsEnabled={false}
          initialPage={page} pageRequestId={request} sourceHighlight={{file_id:file.id,page,quote:page===1?'Operating guidance evidence':'Reviewed source remains unchanged.'}}
          headerActions={<button onClick={()=>{setPage(2);setRequest(value=>value+1)}} aria-label='Go to next cited page'>Next cite</button>}/>:null}</>};
      createRoot(document.getElementById('root')).render(<App/>);
    ` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic",
    nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
    external: ["node:module", "node:fs", "node:fs/promises", "node:url", "node:path", "@napi-rs/canvas"],
    loader: { ".module.css": "local-css" }, logLevel: "silent",
  });
  [script, css, fixturePdf] = await Promise.all([
    readFile(path.join(directory, "app.js")), readFile(path.join(directory, "app.css")),
    Promise.resolve(pdfFontCompatibility),
  ]);
});

async function setup(page: Page, rejectPdfFonts: boolean, invalid = false) {
  const errors: string[] = [], consoleErrors: string[] = [], requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.addInitScript(({ reject }) => {
    const observed = { families: [] as string[], rejected: 0 };
    Object.assign(window, { pdfFontDiagnostics: observed });
    const NativeFontFace = window.FontFace;
    window.FontFace = new Proxy(NativeFontFace, {
      construct(target, args, newTarget) {
        const family = String(args[0]);
        if (/^g_d/.test(family)) {
          observed.families.push(family);
          if (reject) {
            observed.rejected += 1;
            throw new DOMException("OTS parsing error: CFF font rejected by synthetic sanitizer", "SyntaxError");
          }
        }
        return Reflect.construct(target, args, newTarget);
      },
    });
  }, { reject: rejectPdfFonts });
  await page.route("http://pdf-preview.test/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    requests.push(pathname);
    if (pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (pathname === "/sample.pdf") return route.fulfill({ contentType: "application/pdf", body: fixturePdf });
    if (pathname === "/invalid.pdf") return route.fulfill({ contentType: "application/pdf", body: "%PDF-1.7\nnot a valid document" });
    if (pathname.startsWith("/pdfjs/")) {
      const relative = pathname.slice("/pdfjs/".length);
      const allowed = relative === "pdf.worker.min.mjs" ? path.join(pdfjsRoot, "legacy/build/pdf.worker.min.mjs")
        : /^(wasm|standard_fonts|cmaps|iccs)\/[a-zA-Z0-9_.-]+$/.test(relative) ? path.join(pdfjsRoot, relative) : null;
      if (allowed && (await stat(allowed)).isFile()) {
        return route.fulfill({ contentType: relative.endsWith(".mjs") ? "text/javascript" : relative.endsWith(".wasm") ? "application/wasm" : "application/octet-stream", body: await readFile(allowed) });
      }
      return route.fulfill({ status: 404, body: "Unknown PDF asset" });
    }
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
  });
  await page.goto(`http://pdf-preview.test/${invalid ? "?invalid" : ""}`);
  return { errors, consoleErrors, requests };
}

async function canvasInk(page: Page) {
  return page.locator("canvas").evaluateAll(canvases => canvases.map(canvas => {
    if (!(canvas instanceof HTMLCanvasElement)) return 0;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && pixels[i] < 220 && pixels[i + 1] < 220 && pixels[i + 2] < 220) ink += 1;
    return ink;
  }));
}

for (const reject of [false, true]) test(`${reject ? "rejected embedded CFF fonts" : "normal embedded fonts"} render readable pages and preserve citations without native font loading`, async ({ page }, info) => {
  const started = Date.now();
  const state = await setup(page, reject);
  const reader = page.getByRole("dialog", { name: "Synthetic PDF review", exact: true });
  await expect(reader.locator("canvas")).toHaveCount(3);
  await expect.poll(async () => (await canvasInk(page)).every(ink => ink > 500)).toBe(true);
  await expect(reader.locator("mark[data-source-citation]")).toHaveCount(1);
  await expect(reader).toContainText("Highlighted the text region containing the cited excerpt.");
  const initialInk = await canvasInk(page);
  const renderedMs = Date.now() - started;
  const fontDiagnostics = await page.evaluate(() => (window as unknown as { pdfFontDiagnostics: { families: string[]; rejected: number } }).pdfFontDiagnostics);
  expect(fontDiagnostics.families).toEqual([]);
  expect(fontDiagnostics.rejected).toBe(0);
  const documentWell = reader.locator(".bucket-review-document");
  const box = await documentWell.boundingBox();
  if (!box) throw Error("Document scroll surface missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await documentWell.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => documentWell.evaluate(element => element.scrollTop)).toBeGreaterThan(before);
  await reader.getByRole("button", { name: "Go to next cited page", exact: true }).click();
  await expect(reader).toContainText("Cited page 2.");
  await expect(reader.locator("mark[data-source-citation]")).toHaveCount(1);
  const width = await reader.locator("canvas").first().evaluate(canvas => (canvas as HTMLCanvasElement).width);
  await reader.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => reader.locator("canvas").first().evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBeGreaterThan(width);
  await expect.poll(async () => (await canvasInk(page)).every(ink => ink > 500)).toBe(true);
  await reader.getByRole("button", { name: "Reset the zoom to 100%", exact: true }).click();
  await expect.poll(() => reader.locator("canvas").first().evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBe(width);
  await page.screenshot({ path: info.outputPath(`pdf-${reject ? "rejected-font" : "normal-font"}.png`), animations: "disabled" });
  await reader.getByRole("button", { name: "Close review", exact: true }).click();
  await expect(reader).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  expect(state.errors).toEqual([]);
  expect(state.consoleErrors.filter(message => /OTS|FontFace|CFF/i.test(message))).toEqual([]);
  await test.info().attach("font-render-metrics", { body: JSON.stringify({ renderedMs, initialInk, fontDiagnostics, requests: state.requests }, null, 2), contentType: "application/json" });
});

test("invalid PDF remains a visible read error and unrelated console diagnostics are not suppressed", async ({ page }) => {
  const state = await setup(page, true, true);
  const reader = page.getByRole("dialog", { name: "Synthetic PDF review", exact: true });
  await expect(reader).toContainText(/Invalid PDF|Could not render PDF/i);
  await page.evaluate(() => console.error("Unrelated diagnostic must remain visible"));
  await expect.poll(() => state.consoleErrors.includes("Unrelated diagnostic must remain visible")).toBe(true);
  expect(state.errors).toEqual([]);
});
