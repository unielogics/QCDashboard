import { expect, test, type Page } from "@playwright/test";
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
    import { ApiError } from "@/lib/api";
    export const useCurrentUser = () => ({
      authReady: true, authScope: "test", data: { id: "staff", role: location.search ? "loan_exec" : "super_admin" }
    });
    export const useAuthedApi = () => async (path, opts) => {
      const response = await fetch(path, opts);
      if (!response.ok) throw new ApiError(response.status, (await response.text()) || "Delivery request could not be confirmed");
      return response.json();
    };
  `);
  await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import '@/app/globals.css';
      import '@/app/app-extras.css';
      import Page from '@/app/admin/email-marketing/page';
      const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
    ` },
    outfile: path.join(directory, "app.js"), bundle: true, platform: "browser", jsx: "automatic",
    alias: { "@/hooks/useApi": hooks, "@": path.join(root, "src") },
    loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(origin) },
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

type Filters = { program?: string; outcome?: string; source?: string; locale?: string };
type Selection = { mode: "explicit" | "all"; included_ids?: string[]; excluded_ids?: string[]; search?: string };
type Audience = { filters: Filters; selection: Selection };
type Message = Audience & { subject: string; body: string; body_html?: string; sample_id?: string; sample_mode?: "recipient" | "example" };
type CampaignRequest = Message & { id: string; name: string; scheduled_at: string | null; expected_recipient_count: number };
type Contact = {
  id: string | null; name: string; email: string; source: string; eligible: boolean;
  reason: string | null; program: string; outcome: string; locale: string;
};
const contacts: Contact[] = Array.from({length: 32}, (_, index) => ({
  id: "00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
  name: index === 0 ? "Jordan Rivera" : index === 1 ? "Taylor Chen" : "Borrower " + index,
  email: index === 0 ? "jordan@example.test" : index === 1 ? "taylor@example.test" : "borrower" + index + "@example.test",
  source: "booking", program: index < 28 ? "sba" : "dscr", outcome: "funded", locale: "en",
  eligible: index !== 2, reason: index === 2 ? "Unsubscribed" : null,
}));

function matchesSearch(contact: Contact, search = "") {
  return (contact.email + " " + contact.name).toLowerCase().includes(search.toLowerCase());
}

function matching(filters: Filters) {
  return contacts.filter(c => Object.entries(filters).every(([k, v]) => !v || c[k as keyof Filters] === v));
}

function recipients({ filters, selection }: Audience) {
  return matching(filters).filter(c => c.eligible && c.id && (selection.mode === "explicit"
    ? selection.included_ids?.includes(c.id)
    : (matchesSearch(c, selection.search) || selection.included_ids?.includes(c.id)) && !selection.excluded_ids?.includes(c.id)));
}

async function apiFixture(page: Page, failFirstSend = false) {
  const attempts: CampaignRequest[] = [];
  const previews: Message[] = [];
  const directoryCalls: Array<Audience & {search?: string; page: number; selected_only?: boolean}> = [];
  let history: object[] = [];
  await page.route(origin + "/admin/email-marketing/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/options")) return route.fulfill({ json: {
      programs: [{value:"sba",label:"SBA"}, {value:"dscr",label:"DSCR"}],
      outcomes: [{value:"funded",label:"Funded"}, {value:"declined",label:"Declined"}],
      sources: [{value:"booking",label:"Booking"}], locales: [{value:"en",label:"English"}],
      delivery_enabled: true, sequence: [{day:0,subject:"Welcome to QC"}],
    }});
    if (pathname.endsWith("/directory")) {
      const input = request.postDataJSON();
      directoryCalls.push(input);
      const matches = matching(input.filters).filter(c => matchesSearch(c, input.search));
      const selected = new Set(recipients(input).map(c => c.id));
      const rows = matches.filter(c => (!input.selected_only || selected.has(c.id))
        && (!input.eligibility || input.eligibility === "all" || c.eligible === (input.eligibility === "eligible")));
      const pageSize = input.page_size ?? 25;
      const currentPage = input.page ?? 1;
      return route.fulfill({json: {
        rows: rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(c => ({...c, selected: selected.has(c.id), can_record_consent:false})),
        total_count: rows.length, eligible_count: matches.filter(c => c.eligible).length,
        selected_count: recipients(input).length, page: currentPage, page_size: pageSize,
      }});
    }
    if (pathname.endsWith("/campaigns/preview")) {
      const input: Message = request.postDataJSON();
      previews.push(input);
      const eligible = recipients(input);
      const sample = input.sample_mode === "example" ? {id:null, name:"Taylor Morgan", email:"taylor.morgan@example.invalid"}
        : eligible.find(c => c.id === input.sample_id) ?? eligible[0];
      const personalize = (s: string) => s.replaceAll("{{first_name}}", sample?.name.split(" ")[0] ?? "")
        .replaceAll("{{full_name}}", sample?.name ?? "").replaceAll("{{business_name}}", input.sample_mode === "example" ? "Example Company" : "Test Company");
      return route.fulfill({json: {
        subject: personalize(input.subject), body_text: personalize(input.body),
        body_html: personalize(input.body_html || "<p>" + input.body + "</p>") + '<footer><a href="https://instagram.com/qualifiedcommercial/">Instagram</a></footer>',
        sample_id: sample?.id ?? null, sample_email: sample?.email ?? null, eligible_count: eligible.length,
      }});
    }
    if (!pathname.endsWith("/campaigns")) return route.abort();
    if (request.method() === "GET") return route.fulfill({json: history});
    const input: CampaignRequest = request.postDataJSON();
    attempts.push(input);
    if (failFirstSend && attempts.length === 1) return route.fulfill({status: 503});
    const count = recipients(input).length;
    history = [{...input, recipient_count: count, queued: count, sending: 0, sent: 0, failed: 0, blocked: 0, uncertain: 0, created_at: new Date().toISOString()}];
    return route.fulfill({json: history[0]});
  });
  return {attempts, previews, directoryCalls};
}

const rowCheck = (page: Page, email: string) => page.getByRole("checkbox", {name: "Select " + email, exact: true});

async function setRow(page: Page, email: string, checked: boolean) {
  const checkbox = rowCheck(page, email);
  if (await checkbox.isChecked() !== checked) await checkbox.click();
  await expect(checkbox).toBeChecked({checked});
}

async function expectViewportFit(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("filter and select eligible contacts across pages, then exclude a recipient from all matches", async ({ page }) => {
  const {directoryCalls, attempts} = await apiFixture(page);
  await page.goto(origin);
  const compose = page.getByRole("button", {name: "Next: Compose"});
  await expect(compose).toBeDisabled();
  await expect(rowCheck(page, contacts[2].email)).toBeDisabled();
  await expectViewportFit(page);
  await page.getByLabel("Show eligibility").selectOption("ineligible");
  await expect(page.getByText("Unsubscribed", {exact:true})).toBeVisible();
  await expect(rowCheck(page, contacts[0].email)).toHaveCount(0);
  await page.getByLabel("Show eligibility").selectOption("all");
  await page.getByLabel("Lending program").selectOption("sba");
  await page.getByLabel("Outcome").selectOption("declined");
  await expect(rowCheck(page, contacts[0].email)).toHaveCount(0);
  await expect(compose).toBeDisabled();
  await page.getByLabel("Outcome").selectOption("");
  await expect(rowCheck(page, contacts[0].email)).toBeVisible();
  await page.getByRole("button", {name:"Select eligible on this page"}).click();
  await expect(rowCheck(page, contacts[0].email)).toBeChecked();
  await expect(rowCheck(page, contacts[2].email)).not.toBeChecked();
  await expect.poll(() => directoryCalls.at(-1)?.selection.included_ids?.length).toBe(24);
  await page.getByRole("button", {name:"Select all matching"}).click();
  await page.getByRole("button", {name:"Next page"}).click();
  await expect(rowCheck(page, contacts[25].email)).toBeChecked();
  await setRow(page, contacts[25].email, false);
  await expect.poll(() => directoryCalls.at(-1)?.selection.excluded_ids).toEqual([contacts[25].id]);
  expect(directoryCalls.at(-1)?.filters).toEqual({ program:"sba" });
  expect(directoryCalls.at(-1)?.selection.mode).toBe("all");
  await page.getByRole("button", {name:"Clear selection"}).click();
  await expect(compose).toBeDisabled();
  await page.getByLabel("Search contacts").fill("taylor");
  await expect(rowCheck(page, contacts[1].email)).toBeVisible();
  await expect(rowCheck(page, contacts[0].email)).toHaveCount(0);
  await setRow(page, contacts[1].email, true);
  await expect(compose).toBeEnabled();
  await expect.poll(() => directoryCalls.at(-1)?.selection.included_ids).toEqual([contacts[1].id]);
  expect(attempts).toHaveLength(0);
});

test("renders a personalized HTML sample and schedules an explicitly selected audience once after retry", async ({ page }) => {
  const {attempts, previews} = await apiFixture(page, true);
  await page.goto(origin);
  await setRow(page, contacts[0].email, true);
  await setRow(page, contacts[1].email, true);
  await page.getByRole("button", {name:"Next: Compose"}).click();
  await page.getByLabel("Campaign name").fill("Summer funding updates");
  await page.getByLabel("Subject line").fill("Your checklist, ");
  await page.getByRole("button", {name:"{{first_name}}", exact:true}).click();
  await expect(page.getByLabel("Subject line")).toHaveValue("Your checklist, {{first_name}}");
  await page.getByRole("button", {name:"HTML",exact:true}).click();
  const html = "<p>Hello <strong>{{full_name}}</strong>, here is your funding checklist.</p>";
  await page.getByLabel("Email HTML", {exact:true}).fill(html);
  await page.getByRole("combobox", {name:"Preview recipient", exact:true}).selectOption(contacts[1].id!);
  const preview = page.frameLocator('iframe[title="Email preview"]');
  await expect(preview.locator("strong")).toHaveText(contacts[1].name);
  await expect(preview.getByRole("link", {name:"Instagram"})).toBeVisible();
  await expect(page.locator('iframe[title="Email preview"]')).toHaveAttribute("sandbox", "");
  await expect(page.getByText("Your checklist, Taylor", {exact:true})).toBeVisible();
  await expectViewportFit(page);
  await expect.poll(() => previews.at(-1)?.sample_id).toBe(contacts[1].id);
  expect(previews.at(-1)?.body_html).toBe(html);
  expect(attempts).toHaveLength(0);
  await page.getByRole("button", {name:"Next: Schedule"}).click();
  await page.getByLabel("Delivery date").fill("2020-01-02");
  await page.getByLabel("Delivery time").fill("10:00");
  await page.getByLabel("Time zone").selectOption("America/New_York");
  await expectViewportFit(page);
  await expect(page.getByRole("button", {name:"Review campaign"})).toBeDisabled();
  await page.getByLabel("Delivery date").fill("2030-03-10");
  await page.getByLabel("Delivery time").fill("02:30");
  await expect(page.getByText(/This local time does not exist/)).toBeVisible();
  await expect(page.getByRole("button", {name:"Review campaign"})).toBeDisabled();
  await page.getByLabel("Delivery time").fill("10:00");
  await page.getByLabel("Delivery date").fill("2035-06-14");
  await page.getByRole("button", {name:"Review campaign"}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", {name:"Confirm schedule"}).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", {name:"Confirm schedule"}).click();
  await expect(page.getByRole("status")).toContainText(/scheduled/i);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[0].expected_recipient_count).toBe(2);
  expect(attempts[0].selection.mode).toBe("explicit");
  expect(attempts[0].selection.included_ids).toEqual([contacts[0].id, contacts[1].id]);
  expect(new Date(attempts[0].scheduled_at!).toISOString()).toBe("2035-06-14T14:00:00.000Z");
  expect(attempts[0].body_html).toBe(html);
});

test("non-admins cannot load the audience or campaign data", async ({ page }) => {
  const calls: string[] = [];
  await page.route(origin + "/admin/email-marketing/**", route => { calls.push(route.request().url()); return route.abort(); });
  await page.goto(origin + "/?loan_exec");
  await expect(page.getByText("Only super admins can manage email marketing.")).toBeVisible();
  expect(calls).toEqual([]);
});

test("retries a plain-text preview and queues all matches except an excluded row", async ({ page }) => {
  const {attempts} = await apiFixture(page);
  await page.route(origin + "/admin/email-marketing/campaigns/preview", route => route.fulfill({status:503}), {times:1});
  await page.goto(origin);
  await page.getByLabel("Lending program").selectOption("sba");
  await page.getByRole("button", {name:"Select all matching"}).click();
  await expect(rowCheck(page, contacts[1].email)).toBeChecked();
  await setRow(page, contacts[1].email, false);
  await page.getByRole("button", {name:"Next: Compose"}).click();
  await page.getByLabel("Campaign name").fill("Filtered checklist");
  await page.getByLabel("Subject line").fill("Funding checklist");
  await page.getByRole("textbox", {name:"Message", exact:true}).fill("Hello {{first_name}}");
  const next = page.getByRole("button", {name:"Next: Schedule"});
  await expect(page.getByRole("button", {name:"Retry preview"})).toBeVisible();
  await expect(next).toBeDisabled();
  expect(attempts).toHaveLength(0);
  await page.getByRole("button", {name:"Retry preview"}).click();
  await expect(page.frameLocator('iframe[title="Email preview"]').getByText("Hello Jordan")).toBeVisible();
  await next.click();
  await page.getByRole("button", {name:"Send now"}).click();
  await page.getByRole("button", {name:"Review campaign"}).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("26 recipients selected")).toBeVisible();
  expect(attempts).toHaveLength(0);
  await dialog.getByRole("button", {name:"Confirm and queue"}).click();
  await expect(page.getByRole("status")).toContainText(/queued/i);
  expect(attempts).toHaveLength(1);
  expect(attempts[0].filters).toEqual({program:"sba"});
  expect(attempts[0].scheduled_at).toBeNull();
  expect(attempts[0].expected_recipient_count).toBe(26);
  expect(attempts[0].selection).toEqual({mode:"all", included_ids:[], excluded_ids:[contacts[1].id], search:""});
});

test("drafts with zero eligible contacts, then keeps the draft when switching to a selected recipient", async ({ page }) => {
  const {directoryCalls, attempts, previews} = await apiFixture(page);
  await page.goto(origin);
  await page.getByLabel("Outcome").selectOption("declined");
  await expect(page.getByText(/0 contacts.*0 eligible/)).toBeVisible();
  await page.getByRole("button", {name:"Draft with an example contact"}).click();
  await expect(page.getByText("Fictional contact preview", {exact:true})).toBeVisible();
  await expect(page.getByRole("combobox", {name:"Preview recipient", exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"HTML", exact:true}).click();
  const markup = "<p>Hello <strong>{{full_name}}</strong> at {{business_name}}.</p>";
  await page.getByLabel("Email HTML").fill(markup);
  const frame = page.frameLocator('iframe[title="Email preview"]');
  await expect(frame.locator("p")).toHaveText("Hello Taylor Morgan at Example Company.");
  await expect(page.getByText("taylor.morgan@example.invalid", {exact:true})).toBeVisible();
  expect(previews.at(-1)?.sample_mode).toBe("example");
  expect(previews.at(-1)?.sample_id).toBeUndefined();
  expect(directoryCalls.some(c => c.selected_only)).toBe(false);
  await expect(page.getByRole("button", {name:"Next: Schedule"})).toBeDisabled();
  await page.getByLabel("Campaign name").fill("Funding notes");
  await page.getByLabel("Subject line").fill("Notes for {{first_name}}");
  await expect(page.getByRole("button", {name:"Next: Schedule"})).toBeDisabled();
  await page.getByRole("button", {name:"Back to audience"}).click();
  await page.getByLabel("Outcome").selectOption("funded");
  await setRow(page, contacts[0].email, true);
  await page.getByRole("button", {name:"Next: Compose"}).click();
  await expect(page.getByLabel("Campaign name")).toHaveValue("Funding notes");
  await expect(page.getByLabel("Email HTML")).toHaveValue(markup);
  await expect(frame.locator("p")).toHaveText("Hello Jordan Rivera at Test Company.");
  expect(previews.at(-1)?.sample_mode).toBe("recipient");
  await expect(page.getByRole("button", {name:"Next: Schedule"})).toBeEnabled();
  expect(attempts).toHaveLength(0);
});

test("reopens audience selection when a reviewed recipient becomes ineligible", async ({ page }) => {
  await apiFixture(page);
  let submissions = 0;
  await page.route(origin + "/admin/email-marketing/directory", route => !submissions ? route.fallback() : route.fulfill({json:{
    rows:[{...contacts[0], eligible:false, selected:false, can_record_consent:false, reason:"Unsubscribed"}],
    total_count:1, eligible_count:0, selected_count:0, page:1, page_size:25,
  }}));
  await page.route(origin + "/admin/email-marketing/campaigns", route => {
    if (route.request().method() !== "POST") return route.fallback();
    submissions++;
    expect(route.request().postDataJSON().expected_recipient_count).toBe(1);
    return route.fulfill({status:409, body:"The audience changed. Review the updated recipient count and confirm again."});
  });
  await page.goto(origin);
  await setRow(page, contacts[0].email, true);
  await page.getByRole("button", {name:"Next: Compose"}).click();
  await page.getByLabel("Campaign name").fill("Monthly program update");
  await page.getByLabel("Subject line").fill("Funding updates");
  await page.getByRole("textbox", {name:"Message", exact:true}).fill("Hello {{first_name}}.");
  await page.getByRole("button", {name:"Next: Schedule"}).click();
  await page.getByRole("button", {name:"Send now"}).click();
  await page.getByRole("button", {name:"Review campaign"}).click();
  await page.getByRole("dialog").getByRole("button", {name:"Confirm and queue"}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Your audience changed");
  await expect(rowCheck(page, contacts[0].email)).toBeDisabled();
  await expect(page.getByRole("button", {name:"Next: Compose"})).toBeDisabled();
  expect(submissions).toBe(1);
});
