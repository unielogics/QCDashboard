import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { coverageNotice } from "@/lib/financialsOverview";
import { harborCockpit, harborPlanSummary } from "@/lib/__tests__/fixtures/financialsOverviewFixture";
import { CoverageNotice } from "../CoverageNotice";

vi.mock("@/hooks/useApi", () => ({ useCurrentUser: () => ({}) }));

describe("coverage sentence on the Underwriting tab", () => {
  it("prints the sentence the Financials tab worked out, with a way to the plan", () => {
    const notice = coverageNotice(harborCockpit(), harborPlanSummary().evaluation);
    const html = renderToStaticMarkup(createElement(CoverageNotice, { notice, onOpenPlan: vi.fn() }));
    expect(html).toContain("Coverage after these terms is −0.13x on documented earnings and 1.03x with the earnings plan.");
    expect(html).toMatch(/<button[^>]*>Open earnings plan<\/button>/);
    expect(html).toContain('aria-label="Coverage after these terms"');
  });

  it("prints nothing until there is a sentence to print", () => {
    expect(renderToStaticMarkup(createElement(CoverageNotice, { notice: null }))).toBe("");
  });
});
