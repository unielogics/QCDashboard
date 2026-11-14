import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import { emptyCockpit, harborCockpit, harborPlanSummary } from "@/lib/__tests__/fixtures/financialsOverviewFixture";
import { EarningsPlanCard, usePlanSummary } from "../EarningsPlanCard";

vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => vi.fn(), useCurrentUser: () => ({}) }));
vi.mock("@/components/application/FinancialWorkspace", () => ({ FinancialWorkspace: () => null }));
vi.mock("@/components/earnings-plan/useStaffPlanTransport", () => ({ useStaffPlanTransport: () => ({ openPdf: vi.fn(async () => undefined) }) }));
vi.mock("@/components/application/RequestFilesDialog", () => ({ RequestFilesDialog: () => null }));

function Harness({ cockpit, profileId, canEdit }: { cockpit: FinancialCockpit; profileId: string; canEdit: boolean }) {
  const summary = usePlanSummary(profileId);
  return createElement(EarningsPlanCard, { cockpit, summary, profileId, businessName: "Synthetic business", canEdit, onRefresh: vi.fn(), onRequested: vi.fn() });
}

function markup(cockpit: FinancialCockpit, profileId: string, summary: unknown, canEdit = true) {
  const client = new QueryClient();
  client.setQueryData(["operating-plan-summary", profileId], summary);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Harness, { cockpit, profileId, canEdit })));
  client.clear();
  return html;
}

const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("earnings plan card actions", () => {
  it.each([true, false])("shows a readable workspace action when canEdit is %s", (canEdit) => {
    const html = markup(emptyCockpit(), "synthetic-profile", { has_plan: true, state: "draft", expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: 0, cost_mix: [] }, canEdit);
    const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1]);
    const open = buttons.find((button) => text(button) === "Open earnings plan");
    expect(open).toBeDefined();
    expect(open).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(open).toContain("<path d=");
    // Every button has words, or (the document thumbnail) a label.
    expect([...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].every((match) => text(match[2]).trim() || /aria-label="[^"]+"/.test(match[1]))).toBe(true);
    expect(html.includes("Request client plan")).toBe(false);
    expect(html.includes("Set annual NOI goal")).toBe(canEdit);
    expect(html).toContain("Working draft");
  });

  it("makes requesting a client plan available after a saved staff goal", () => {
    const html = markup(emptyCockpit(), "configured-profile", { has_plan: false, expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: 0, cost_mix: [], goal: { status: "set", metric: "annual_noi", amount: 18000, currency: "USD", revision: 1, updated_at: null } });
    expect(html).toContain("Request client plan");
    expect(html).not.toContain("Set annual NOI goal");
    expect(html).toContain("No plan yet");
  });
});

describe("earnings plan card figures", () => {
  it("prints the before and after, the changes and the plan document", () => {
    const html = markup(harborCockpit(), "harbor-auto-detail", harborPlanSummary());
    const words = text(html);
    expect(words).toContain("EBITDA · baseline → plan−$22,377 → $182,897");
    expect(words).toContain("DSCR · baseline → plan−0.03x → 1.03x");
    expect(words).toContain("Still to find for 1.25x$39,103 / year");
    expect(words).toContain("Client terms v3 · payments $64,800 → $14,800 / monthno change−0.03x → −0.13x");
    expect(words).toContain("Largest disclosed annual costs");
    expect(words).toContain("Published v1");
    expect(html).toContain('aria-label="Open latest plan PDF"');
    expect(words).toContain("Latest PDF · v1 · Nov 11, 2026");
    expect(html).toContain("Latest plan PDF");
  });

  it("never leaves the baseline side blank when there is no plan", () => {
    const words = text(markup(harborCockpit(), "harbor-auto-detail", { has_plan: false, expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: 0, cost_mix: [], evaluation: null }));
    expect(words).toContain("EBITDA · baseline → plan−$22,377 → —");
    expect(words).toContain("DSCR · baseline → plan−0.03x → −0.13x");
    expect(words).toContain("Largest annual costs on the source");
    expect(words).toContain("Save a version to create the plan PDF");
  });
});
