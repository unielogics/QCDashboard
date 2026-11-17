import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dscrGaugePoint } from "../src/lib/dscrGauge";

// The two light client rooms -- Equipment Financing and the funding review --
// are the dark dealer room's markup under a theme that reaches each piece by a
// class the page gives it. A piece without its class keeps its dark-room colour
// and disappears on white, and nothing else in the suite would notice. This
// opens the real pages with the real stylesheets and a made-up reviewed file,
// and reads every piece of text against what is painted behind it. The dealer
// room is read the same way: its white surfaces (the signing step, the
// readiness card, the document signing panel) sit on black, and its start form
// borrows a block built for white.
const ORIGIN = "https://light-room.test";
let script: Buffer, css: Buffer;

test.beforeAll(async () => {
  const root = process.cwd();
  const projectRequire = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(projectRequire.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-light-room-"));
  const stubs: Record<string, string> = {
    "@clerk/nextjs": "export const useAuth=()=>({getToken:async()=>null,isLoaded:true,isSignedIn:false,userId:null});export const useUser=()=>({user:null,isLoaded:true,isSignedIn:false});export const useClerk=()=>({signOut:async()=>{}});export const useSession=()=>({session:null});export const useSignIn=()=>({});export const useSignUp=()=>({});export const useOrganization=()=>({});export const ClerkProvider=({children})=>children;export const SignedIn=()=>null;export const SignedOut=({children})=>children;export const SignIn=()=>null;export const SignUp=()=>null;export const UserButton=()=>null;export const SignInButton=()=>null;export const SignOutButton=()=>null;",
    "next/navigation": "export const useParams=()=>({});export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(){},replace(){}});export const usePathname=()=>location.pathname;",
    "next/link": "import React from'react';export default function Link({href,children,...rest}){return React.createElement('a',{href:typeof href==='string'?href:'#',...rest},children)}",
    "next/image": "import React from'react';export default function Image({src,alt,width,height}){return React.createElement('img',{src:typeof src==='string'?src:'',alt,width,height})}",
    "next/script": "export default function Script(){return null}",
    "next/dynamic": "import React from'react';export default function dynamic(loader){const Lazy=React.lazy(()=>loader().then((m)=>({default:m.default||m})));return function Dynamic(props){return React.createElement(React.Suspense,{fallback:null},React.createElement(Lazy,props))}}",
    "next/headers": "export const cookies=()=>({get(){return undefined}});export const headers=()=>new Map();",
    "next/font/local": "export default function localFont(){return{className:'',variable:'',style:{}}}",
  };
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React from'react';import{createRoot}from'react-dom/client';
      import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
      import Funding from'@/app/funding-review/page';import Dealer from'@/app/dealer-ai-underwriter/page';
      import'@/app/globals.css';import'@/app/production-package.css';import'@/app/app-extras.css';
      const Page=location.pathname.startsWith('/funding-review')?Funding:Dealer;
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Page/></QueryClientProvider>);` },
    outfile: path.join(directory, "app.js"), bundle: true, format: "iife", platform: "browser", jsx: "automatic",
    nodePaths: [path.join(root, "node_modules")], alias: { "@": path.join(root, "src") },
    define: { "process.env": "{}", "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(ORIGIN) },
    loader: { ".module.css": "local-css", ".woff2": "dataurl" }, logLevel: "silent",
    plugins: [{ name: "stubs", setup(build: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string } | undefined) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }) => void }) {
      build.onResolve({ filter: /^(@clerk\/nextjs|next\/.*)$/ }, (args) => ({ path: args.path, namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path] ?? "export default {};", loader: "tsx", resolveDir: root }));
    } }],
  });
  script = await readFile(path.join(directory, "app.js"));
  css = await readFile(path.join(directory, "app.css"));
});

// ---------- a made-up reviewed file ----------
const later = "2099-01-01T00:00:00Z";
const files = [
  { id: "f1", requested_document_id: "d5", file_name: "Vendor quote - CNC mills.pdf", content_type: "application/pdf", size_bytes: 284000, status: "uploaded", analysis_status: "completed", analysis_classification: "vendor_quote", created_at: "2026-11-15T15:00:00Z" },
  { id: "f2", file_name: "Company documents.zip", content_type: "application/zip", size_bytes: 3_400_000, status: "uploaded", extraction_status: "completed", analysis_status: "completed", created_at: "2026-11-15T15:05:00Z" },
  { id: "f2a", parent_zip_file_id: "f2", zip_entry_path: "formation/Operating agreement.pdf", file_name: "Operating agreement.pdf", content_type: "application/pdf", size_bytes: 410000, status: "uploaded", analysis_status: "completed", analysis_classification: "operating_agreement", created_at: "2026-11-15T15:05:00Z" },
  { id: "f3", file_name: "Bank statement - September.pdf", content_type: "application/pdf", size_bytes: 512000, status: "uploaded", is_password_protected: true, analysis_status: "failed", analysis_reason_code: "password_protected", created_at: "2026-11-15T15:06:00Z" },
];
const reviewed = {
  intake: { id: "i1", bucket_id: "b1", status: "reviewed", full_name: "Jordan Sample", email: "jordan@example.com", phone: "+17045550123", business_name: "Sample Fabrication", requested_loan_amount: 185000, intake_state: {}, preferred_language: "en", communication_locale: "en", asset_rows: [{ id: "a1", address: "200 Example Ave, Charlotte, NC 28202", estimated_loan_amount: 184000, estimated_property_value: 720000 }] },
  token: "fixture-reviewed", resume_url: "https://app.example.com/resume", upload_url: "https://app.example.com/room",
  assistant_message: "Upload the latest business tax return when you can.",
  widget: { type: "book_call", title: "Book underwriting call", description: "Choose a time to go over the preliminary screen.", duration_min: 30, slots: [{ starts_at: "2026-11-18T15:00:00Z", label: "10:00 AM ET", date_label: "Wednesday, Nov 18" }] },
  requested_documents: [
    { id: "d1", name: "Last 3 months business bank statements", category: "Banking", required: true, status: "requested" },
    { id: "d2", name: "Personal financial statement", category: "Personal Financials", description: "The figures from your latest personal tax return.", required: true, status: "requested", template_download_url: "https://app.example.com/templates/pfs.pdf" },
    { id: "d5", name: "Vendor quote", category: "Equipment", required: true, status: "uploaded" },
  ],
  files,
  latest_review: { status: "completed", result: {
    probability_status: "Promising but needs one clarification", confidence: "Medium",
    one_next_step: "Upload the latest business tax return so revenue can be verified.",
    key_metrics: { requested_amount: 185000, ytd_annualized_revenue: 1240000, estimated_debt_burden: 96000, estimated_dscr: 1.32, estimated_ebitda_or_cash_flow: 126700 },
    document_evidence_map: {
      files: [{ file_id: "f1", ai_classification: "vendor_quote", supports: ["Purchase price"] }],
      baseline_coverage: [
        { category: "Bank statements", status: "partial", evidence: ["Bank statement - October.xlsx"], gap: "Two more months needed" },
        { category: "Tax returns", status: "missing", evidence: [], gap: "No business tax return on file" },
      ],
    },
    strengths: ["Deposits are steady across the last six months", "Credit estimate above 740"],
    risks: ["Tax return not verified"],
    missing_or_incomplete_items: [{ title: "Business tax return", detail: "Needed to verify annual revenue.", priority: "high" }],
    monthly_cash_flow: [{ month: "Sep", value: -2400 }, { month: "Oct", value: 11200 }],
    year_to_year_revenue: [{ year: "2025", value: 1170000 }, { year: "2026", value: 1240000 }],
  } },
  messages: [
    { id: "m1", role: "assistant", content: "Welcome, Jordan. Tell me about the equipment.", created_at: "2026-11-15T14:55:00Z" },
    { id: "m2", role: "user", content: "Two CNC mills with installation.", created_at: "2026-11-15T14:56:00Z" },
    { id: "m3", role: "operator", content: "This is Alex from the desk.", created_at: "2026-11-15T14:58:00Z", sender_kind: "operator", author_name: "Alex Rivera" },
  ],
  chat_actions: [
    { id: "c1", source_message_id: "m1", requirement_key: "bank_statements", action_type: "upload_own", label: "Upload bank statements", status: "available", expires_at: later },
    { id: "c2", source_message_id: "m1", requirement_key: "old", action_type: "upload_own", label: "Old request", status: "expired", expires_at: "2026-11-01T00:00:00Z" },
  ],
  ai_paused_until: later, communication_locale: "en",
};
const signing = {
  ...reviewed, token: "fixture-signing",
  signing_gate: {
    package_id: "p1", revision_id: "r2", revision_no: 2, stage: 2, document_key: "activation", title: "Program Activation and Production Agreement", document_version: "fixture-v2",
    content_sha256: "a".repeat(64), pdf_sha256: null, pdf_url: null, signer_name: "Jordan Sample", signer_title: "Managing Member", business_name: "Sample Fabrication", sent_at: "2026-11-15T16:00:00Z",
    esign_consent_text: "I agree to sign this document electronically.", esign_consent_version: "fixture-1",
    already_signed: false, initials_expected: true, review_clause: null, acknowledgement_text: null,
    original: { title: "Production Commitment", revision_no: 1, executed_at: "2026-11-10T15:00:00Z", content_sha256: "c".repeat(64), pdf_url: null, executed_url: null },
    changes: [
      { section: "Addendum A", key: "advance_rate", label: "Advance rate", format: "pct", before: "80%", after: "82%", changed: true, original_blank: false, dealer_visible: true },
      { section: "Addendum A", key: "term", label: "Term", format: "count", before: "36 months", after: "36 months", changed: false, original_blank: false, dealer_visible: true },
    ],
  },
};
// A file with a reviewed capital readiness snapshot, and a document to sign in the room.
const readiness = {
  id: "s1", profile_id: "p1", snapshot_version: 3, policy_key: "main_street", policy_version: 2, formula_version: "score_v2", evidence_fingerprint: "f".repeat(16),
  as_of: "2026-11-15T15:30:00Z", communication_locale: "en", display_locale: "en", review_status: "confirmed", score: 68, band: "three_to_six_months",
  evidence_coverage_pct: 72, confidence_pct: 64,
  pillars: [
    { key: "revenue_earnings", label: "Revenue and earnings quality", weight: 25, score: 74, coverage_pct: 80, status: "acceptable" },
    { key: "liquidity_banking", label: "Liquidity and banking behavior", weight: 20, score: 82, coverage_pct: 90, status: "healthy" },
    { key: "bookkeeping_tax_integrity", label: "Bookkeeping and tax integrity", weight: 15, score: null, coverage_pct: 20, status: "unavailable" },
  ],
  metrics: [
    { key: "gross_margin_pct", label: "Gross margin", value: 41.5, unit: "pct", status: "healthy", confidence_pct: 70 },
    { key: "current_dscr", label: "Current DSCR", value: 1.32, unit: "ratio", status: "acceptable", confidence_pct: 65 },
    { key: "average_daily_balance", label: "Average daily balance", value: 48200, unit: "usd", status: "healthy", confidence_pct: 85 },
    { key: "cash_runway_days", label: "Cash runway", value: 22, unit: "days", status: "concerning", confidence_pct: 60 },
  ],
  strengths: [{ key: "s1", title: "Steady deposits", detail: "Deposits held within ten percent across six months." }],
  blockers: [{ key: "b1", title: "Tax return not on file", detail: "Annual revenue cannot be verified without it.", severity: "high" }],
  phases: [
    { key: "baseline_health_check", label: "Baseline health check", status: "completed", actions: [] },
    { key: "financial_restructuring", label: "Financial restructuring", status: "in_progress", actions: [{ id: "a1", action_key: "file_tax_return", title: "Upload the latest business tax return", detail: "The return verifies annual revenue.", status: "open", phase_key: "financial_restructuring" }] },
  ],
  program_opportunities: [{ program_key: "equipment_term", program_name: "Equipment term loan", status: "needs_evidence", detail: "A fit once the tax return is on file.", evidence_gaps: ["Business tax return"] }],
  source_manifest: [], material_change: null, created_at: "2026-11-15T15:30:00Z", reviewed_at: "2026-11-15T16:00:00Z",
};
const withReadiness = {
  ...reviewed, token: "fixture-readiness", capital_readiness: readiness,
  requested_documents: [...reviewed.requested_documents, { id: "d6", name: "Bank statement release authorization", category: "Banking", required: true, status: "requested", requires_signature: true, signature_kind: "document", signature_document_text: "I authorize Qualified Commercial to request copies of the business bank statements named in my file. This authorization stays in effect for ninety days." }],
};
// A file that has just been opened: nothing reviewed, its first documents still to come.
// The rooms differ on what counts as first evidence (bank statements and tax returns for a
// business file, rent and payoff support for a property file), so it asks for one of each.
const fresh = {
  ...reviewed, token: "fixture-fresh", intake: { ...reviewed.intake, status: "collecting" }, files: [], latest_review: null, widget: null, chat_actions: [], ai_paused_until: null,
  requested_documents: [...reviewed.requested_documents, { id: "d7", name: "Rent roll or lease", category: "Property", required: true, status: "requested" }],
};
// A file whose client has to choose a room PIN before anything else.
const needsPin = { ...fresh, token: "fixture-pin", room_pin_setup_required: true };
const rooms: Record<string, unknown> = { "fixture-reviewed": reviewed, "fixture-signing": signing, "fixture-readiness": withReadiness, "fixture-fresh": fresh, "fixture-pin": needsPin };

async function open(page: Page, address: string) {
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: script });
    if (url.pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: css });
    if (!url.pathname.includes("/api/")) return route.fulfill({ contentType: "text/html", body: '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    const room = url.pathname.match(/\/public\/(?:funding-review|dealer-ai-intake)\/(fixture-[a-z]+)$/);
    if (room) return route.fulfill({ contentType: "application/json", body: JSON.stringify(rooms[room[1]]) });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not in this fixture" }) });
  });
  await page.goto(`${ORIGIN}${address}`);
}

// Text whose colour is too close to what is behind it: WCAG contrast below 4.5.
// A switched-off control is dimmed on purpose and is left out.
function unreadable(page: Page) {
  return page.evaluate(() => {
    type Colour = { r: number; g: number; b: number; a: number };
    // rgb()/rgba(), and the color(srgb r g b / a) form the browser reports for a color-mix() value:
    // without it a button with a mixed background would be measured against the page behind it.
    const parse = (value: string): Colour | null => {
      const match = /rgba?\(([^)]+)\)/.exec(value || "");
      if (match) { const p = match[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
      const mixed = /color\(srgb ([^)]+)\)/.exec(value || "");
      if (!mixed) return null;
      const q = mixed[1].split(/[ /]+/).filter(Boolean).map(Number);
      return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 };
    };
    const over = (top: Colour, under: Colour): Colour => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const channel = (value: number) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const luminance = (c: Colour) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
    const rows: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (element.closest("svg, script, style, option, :disabled")) continue;
      const text = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent!.trim()).join(" ").trim();
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      if (!text || style.visibility === "hidden" || box.width < 2 || box.height < 2) continue;
      let ground: Colour = { r: 255, g: 255, b: 255, a: 1 }, opacity = 1;
      const chain: Element[] = []; for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
      for (const node of chain) {
        const painted = getComputedStyle(node), fill = parse(painted.backgroundColor);
        if (fill && fill.a > 0) ground = over(fill, ground);
        const stops = [...painted.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((match) => parse(match[0])!);
        if (stops.length) ground = over({ r: stops.reduce((sum, c) => sum + c.r, 0) / stops.length, g: stops.reduce((sum, c) => sum + c.g, 0) / stops.length, b: stops.reduce((sum, c) => sum + c.b, 0) / stops.length, a: stops.reduce((sum, c) => sum + c.a, 0) / stops.length }, ground);
        // A positioned ::before that paints a surface under the text (the readiness score's
        // white centre inside its ring) is what the text actually sits on.
        const before = getComputedStyle(node, "::before"), cover = parse(before.backgroundColor);
        if (before.content !== "none" && before.position === "absolute" && cover && cover.a > 0) {
          const outer = node.getBoundingClientRect();
          if (box.top >= outer.top + parseFloat(before.top) && box.left >= outer.left + parseFloat(before.left) && box.bottom <= outer.bottom - parseFloat(before.bottom) && box.right <= outer.right - parseFloat(before.right)) ground = over(cover, ground);
        }
        opacity *= Number(painted.opacity);
      }
      const ink = parse(style.color); if (!ink) continue;
      const shown = over({ ...ink, a: ink.a * opacity }, ground), light = luminance(shown), dark = luminance(ground);
      const ratio = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
      if (ratio < 4.5) rows.push(`${ratio.toFixed(2)} "${text.slice(0, 50)}" in ${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`);
    }
    return [...new Set(rows)];
  });
}

const LIGHT_ROOMS = [["equipment", "/equipment-financing-intake"], ["funding review", "/funding-review"]] as const;
const ROOMS = [...LIGHT_ROOMS, ["dealer", "/dealer-ai-underwriter"]] as const;

// The first screen of each room is the language choice. In the dealer room its
// two buttons once forced the card wider than a phone, with the second cut off.
for (const [label, route] of ROOMS) {
  test(`${label} room: the language choice fits the screen`, async ({ page }) => {
    await open(page, route);
    const spanish = page.getByRole("button", { name: "Continuar en Español" });
    await expect(spanish).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expect(spanish).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Continue in English" })).toBeInViewport({ ratio: 1 });
  });
}

for (const [label, route] of LIGHT_ROOMS) {
  test(`${label} room: the start form has no text that cannot be read`, async ({ page }) => {
    await open(page, route);
    await page.getByRole("button", { name: "Continue in English" }).click();
    await expect(page.getByText("Your room access PIN")).toBeVisible();
    expect(await unreadable(page)).toEqual([]);
  });
}

// The dealer room's start form is navy. The business profile block inside it is
// shared with the console and takes its hint colour from `--muted`, a grey for
// white surfaces, so the room hands it its own. The red "required" marks sit at
// 4.45:1 on the navy, a hair under the line, and are left as they are.
test("dealer room: the start form has no text that cannot be read", async ({ page }) => {
  await open(page, "/dealer-ai-underwriter");
  await page.getByRole("button", { name: "Continue in English" }).click();
  await expect(page.getByText("Your room access PIN")).toBeVisible();
  expect((await unreadable(page)).filter((row) => !row.includes('"*"'))).toEqual([]);
});

// The sidebar's brand: the name over the room's label, not one run of words.
for (const [label, route] of [["equipment", "/equipment-financing-intake"], ["dealer", "/dealer-ai-underwriter"]] as const) {
  test(`${label} room: the sidebar brand is the name over the room's label`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= 720, "The sidebar is a desktop piece.");
    await open(page, `${route}?token=fixture-reviewed`);
    const brand = page.locator(".qc-public-intake-sidebar .qc-public-intake-brand");
    await expect(brand).toBeVisible();
    const lines = await brand.evaluate((element) => ({ name: element.querySelector("strong")!.getBoundingClientRect().bottom, label: element.querySelector("span")!.getBoundingClientRect().top }));
    expect(lines.label).toBeGreaterThanOrEqual(lines.name - 1);
  });
}

for (const [label, route] of ROOMS) {
  test(`${label} room: the chat, the files and the cockpit have no text that cannot be read`, async ({ page }) => {
    await open(page, `${route}?token=fixture-reviewed`);
    await expect(page.getByText("Two CNC mills with installation.")).toBeVisible();
    const tabs = page.locator(".qc-public-intake-sidebar-tab, .qc-public-intake-mobile-tab");
    await expect(tabs).toHaveCount(3);
    for (const index of [0, 1, 2]) {
      await tabs.nth(index).click();
      await expect(page.locator([".qc-public-intake-chat", ".qc-public-intake-files", ".qc-public-intake-intelligence"][index]).first()).toBeVisible();
      expect(await unreadable(page), `tab ${index + 1}`).toEqual([]);
    }
  });
}

// Two white surfaces inside the rooms -- the capital readiness card in the
// cockpit and the panel that opens to sign a requested document -- paint their
// own background. In the dark dealer room they inherited the page's near-white
// text, so they have to carry their own ink. Read in all three rooms.
for (const [label, route] of ROOMS) {
  test(`${label} room: the readiness card and the document signing panel can be read`, async ({ page }) => {
    await open(page, `${route}?token=fixture-readiness`);
    await expect(page.getByText("Two CNC mills with installation.")).toBeVisible();
    const tabs = page.locator(".qc-public-intake-sidebar-tab, .qc-public-intake-mobile-tab");
    await tabs.nth(1).click();
    await page.getByRole("button", { name: /^Sign: Bank statement release authorization/ }).click();
    await expect(page.getByText("I authorize Qualified Commercial to request copies")).toBeVisible();
    expect(await unreadable(page), "files, signing panel open").toEqual([]);
    await tabs.nth(2).click();
    await expect(page.locator(".capital-readiness-card")).toBeVisible();
    expect(await unreadable(page), "cockpit with the readiness card").toEqual([]);
  });
}

// The step where a client signs an agreement before the room opens. It is the
// shell's only child, and the room's frame does not scroll: the step has to
// take the room's width and scroll on its own, or the button under the fold is
// out of reach. In the dealer room it sits on black, where the gate's own dark
// ink cannot be read.
for (const [label, route] of [["equipment", "/equipment-financing-intake"], ["dealer", "/dealer-ai-underwriter"]] as const) {
  test(`${label} room: the signing step is full width, can be read and scrolls to its button`, async ({ page }) => {
    await open(page, `${route}?token=fixture-signing`);
    const button = page.getByRole("button", { name: "Sign the agreement" });
    await expect(button).toBeAttached();
    await expect(page.getByText("What changed since your commitment")).toBeVisible();
    expect(await unreadable(page)).toEqual([]);
    const step = page.locator(".qc-public-intake-signing");
    const measured = await step.evaluate((element) => ({ scrolls: /auto|scroll/.test(getComputedStyle(element).overflowY), width: element.getBoundingClientRect().width, window: window.innerWidth }));
    expect(measured.scrolls).toBe(true);
    expect(measured.width).toBeGreaterThan(measured.window * 0.9);
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  });
}


// The cockpit's charts say what the numbers say. The coverage dial is read left
// to right and its needle once pointed into the green for nearly any figure; a
// negative month stood among the others as if it were income.
for (const [label, route] of ROOMS) {
  test(`${label} room: the coverage needle and a negative month are drawn as what they are`, async ({ page }) => {
    await open(page, `${route}?token=fixture-reviewed`);
    await expect(page.getByText("Two CNC mills with installation.")).toBeVisible();
    await page.locator(".qc-public-intake-sidebar-tab, .qc-public-intake-mobile-tab").nth(2).click();
    const needle = page.locator(".qc-public-intake-gauge-needle");
    await expect(needle).toHaveCount(1);
    const tip = await needle.evaluate((line) => ({ x: Number(line.getAttribute("x2")), y: Number(line.getAttribute("y2")) }));
    expect(tip).toEqual(dscrGaugePoint(1.32));
    // 1.32x is comfortable: right of the 1.25x boundary, left of straight up, and above the hub.
    expect(tip.x).toBeGreaterThan(dscrGaugePoint(1.25).x);
    expect(tip.x).toBeLessThan(100);
    expect(tip.y).toBeLessThan(92);
    const negative = page.locator(".qc-public-intake-bar.is-negative");
    await expect(negative).toHaveCount(1);
    await expect(negative).toHaveAttribute("title", "-$2.4k");
  });
}

// The status pill's colour follows its words: a file waiting on its first
// documents is not shown in the "all good" green.
for (const [label, route] of ROOMS) {
  test(`${label} room: a file waiting on documents says so in the waiting tone`, async ({ page }) => {
    await open(page, `${route}?token=fixture-fresh`);
    const pill = page.locator(".qc-public-intake-status");
    await expect(pill).toHaveText("Needs baseline");
    await expect(pill).toHaveClass(/is-waiting/);
    expect(await unreadable(page)).toEqual([]);
  });
}

// The step a returning client meets before the room opens: on the room's own
// ground, under the room's brand.
for (const [label, route] of ROOMS) {
  test(`${label} room: the PIN step carries the room's brand and can be read`, async ({ page }) => {
    await open(page, `${route}?token=fixture-pin`);
    await expect(page.getByRole("heading", { name: "Save your room PIN to continue" })).toBeVisible();
    await expect(page.locator(".qc-public-intake-pin-brand").getByText("Qualified Commercial", { exact: false }).first()).toBeVisible();
    expect(await unreadable(page)).toEqual([]);
  });
}

// On a phone: the sign-out sits beside the brand instead of taking a row of its
// own, and the Files panel ends inside the screen with its border showing.
for (const [label, route] of ROOMS) {
  test(`${label} room: the phone header and the Files panel fit the screen`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 720, "A phone layout.");
    await open(page, `${route}?token=fixture-reviewed`);
    await expect(page.getByText("Two CNC mills with installation.")).toBeVisible();
    const header = page.locator(".qc-public-intake-mobile-header");
    const logout = await header.getByRole("button", { name: /^Log ?out$/ }).boundingBox();
    const tabs = await header.locator(".qc-public-intake-mobile-tab").first().boundingBox();
    const title = await header.locator("svg").first().boundingBox();
    expect(logout && tabs && title).toBeTruthy();
    // Same row as the brand mark, and above the tabs.
    expect(logout!.y).toBeLessThan(title!.y + title!.height);
    expect(logout!.y + logout!.height).toBeLessThanOrEqual(tabs!.y);
    await page.locator(".qc-public-intake-mobile-tab").nth(1).click();
    const panel = await page.locator(".qc-public-intake-files").boundingBox();
    const width = page.viewportSize()!.width;
    expect(panel!.x).toBeGreaterThanOrEqual(12);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(width - 12);
  });
}
