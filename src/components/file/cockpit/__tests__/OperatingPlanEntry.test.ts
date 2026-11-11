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
    expect(html.includes("Request client plan")).toBe(canEdit);
    client.clear();
  });
});
