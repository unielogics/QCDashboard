import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { OperatingPlanEntry } from "../OperatingPlanEntry";

vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => vi.fn() }));
vi.mock("@/components/application/FinancialWorkspace", () => ({ FinancialWorkspace: () => null }));
vi.mock("@/components/application/RequestFilesDialog", () => ({ RequestFilesDialog: () => null }));

describe("operating plan entry actions", () => {
  it.each([true, false])("shows a readable workspace action when canEdit is %s", canEdit => {
    const client = new QueryClient();
    client.setQueryData(["operating-plan-summary", "synthetic-profile"], {
      has_plan: true, state: "draft", expense_count: 0, action_count: 0,
      reviewed_action_count: 0, missing_count: 0, cost_mix: [],
    });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(OperatingPlanEntry, { profileId: "synthetic-profile", businessName: "Synthetic business", canEdit, onRefresh: vi.fn(), onRequested: vi.fn() })));
    const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1]);
    const open = buttons.find(button => button.replace(/<[^>]+>/g, "") === "Open earnings plan");
    expect(open).toBeDefined();
    expect(open).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(open).toContain("<path d=");
    expect(buttons.every(button => button.replace(/<[^>]+>/g, "").trim())).toBe(true);
    expect(html.includes("Request client plan")).toBe(false);
    expect(html.includes("Set annual NOI goal")).toBe(canEdit);
    client.clear();
  });
});

it("makes requesting a client plan available after a saved staff goal", () => {
  const client = new QueryClient(); client.setQueryData(["operating-plan-summary", "configured-profile"], { has_plan: false, expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: 0, cost_mix: [], goal: { status: "set", metric: "annual_noi", amount: 18000, currency: "USD", revision: 1, updated_at: null } });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(OperatingPlanEntry, { profileId: "configured-profile", businessName: "Synthetic business", canEdit: true, onRefresh: vi.fn(), onRequested: vi.fn() })));
  expect(html).toContain("Request client plan"); expect(html).not.toContain("Set annual NOI goal"); client.clear();
});
