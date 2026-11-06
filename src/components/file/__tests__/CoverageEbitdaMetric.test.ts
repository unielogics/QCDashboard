import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fixtures from "@/lib/__tests__/fixtures/ebitdaRefinance.json";
import type { RefinanceEbitda } from "@/lib/ebitdaRefinance";
import { CoverageEbitdaMetric } from "../cockpit/CoverageEbitdaMetric";

const projection = (name: keyof typeof fixtures) => fixtures[name].projection as RefinanceEbitda;
const render = (value: RefinanceEbitda | undefined, side: "today" | "plan", extra = {}) => renderToStaticMarkup(createElement(CoverageEbitdaMetric, { value, side, ...extra }));

describe("inline EBITDA beside current and planned DSCR", () => {
  it("shows the same factual annual EBITDA on both sides with source period and annualization", () => {
    for (const side of ["today", "plan"] as const) {
      const html = render(projection("refinance"), side, { scenarioActive: true });
      expect(html).toContain(side === "today" ? "Today EBITDA" : "With the plan EBITDA");
      expect(html).toContain("$52,000");
      expect(html).toContain("Jan–Jun 2026");
      expect(html).toContain("annualization × 2");
      expect(html).not.toContain("Adjusted EBITDA");
    }
  });
  it("keeps operating assumptions separate from factual before/after values", () => {
    const before = render(projection("operating"), "today");
    const after = render(projection("operating"), "plan", { unsaved: true });
    expect(before).toContain("$52,000");
    expect(before).not.toContain("$70,000");
    expect(after).toContain("$52,000");
    expect(after).toContain("$70,000");
    expect(after).toContain("Adjusted EBITDA · hypothetical annual");
    expect(after).toContain("Unsaved scenario preview");
    expect(after).toContain("unverified");
  });
  it("does not substitute a generic coverage income override for EBITDA", () => {
    const html = render(projection("override"), "plan");
    expect(html).toContain("$52,000");
    expect(html).not.toContain("999,999");
    expect(html).not.toContain("Adjusted EBITDA");
  });
  it("shows missing P&L EBITDA and a separately identified tax estimate without inventing USD", () => {
    for (const side of ["today", "plan"] as const) {
      const html = render(projection("tax-only"), side);
      expect(html).toContain("Not available");
      expect(html).toContain("Tax-derived earnings estimate");
      expect(html).toContain("currency unknown");
      expect(html).not.toContain("$");
    }
    expect(render(undefined, "today")).toContain("A reconciled P&amp;L is needed");
  });
  it("preserves short reporting periods and foreign source currency", () => {
    const short = render(projection("short"), "today");
    expect(short).toContain("$26,000");
    expect(short).toContain("source period");
    expect(short).not.toContain("$52,000");
    const foreign = render(projection("foreign"), "plan");
    expect(foreign).toContain("€52,000");
    expect(foreign).not.toContain("$");
  });
  it("retains zero, signed losses, source review and no-scenario labels", () => {
    const value = { ...projection("baseline"), annual_before: 0, annual_after: -8000, provisional: true };
    expect(render(value, "today", { corrected: true })).toContain(">$0<");
    const after = render(value, "plan");
    expect(after).toContain("-$8,000");
    expect(after).toContain("Provisional source");
    expect(after).toContain("No refinance scenario saved");
    expect(render(value, "today", { corrected: true })).toContain("staff-corrected source");
  });
});
