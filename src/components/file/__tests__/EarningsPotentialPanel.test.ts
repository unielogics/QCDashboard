import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EarningsPotentialPanel } from "../cockpit/EarningsPotentialPanel";
import type { EarningsPotential } from "@/lib/financialMetrics";

const potential: EarningsPotential = {
  available: true,
  baseline: { revenue: 604785, earnings: -54369, kind: "tax_estimate", margin_pct: -8.9898, period: "2025", currency: "USD", basis: "cash", provisional: true },
  operating_break_even: { earnings_required: 0, improvement_required: 54369 },
  current: { annual_debt_service: 210939.12, dscr: -0.26, earnings_less_debt_service: -265308.12, funding_shortfall: 265308.12, targets: [{ ratio: 1.25, earnings_required: 263673.9, margin_pct: 43.598, improvement_required: 318042.9 }] },
  plan: { annual_debt_service: 20000, dscr: -2.72, targets: [{ ratio: 1.25, earnings_required: 25000, margin_pct: 4.13, improvement_required: 79369 }] },
  forecast: { status: "illustration", earnings: -50000, revenue: 650000, dscr_current: -0.24, dscr_plan: -2.5, assumptions: ["Explicit reviewed outlook; not a current earnings fact."] },
  notes: ["Refinancing does not change EBITDA by itself."],
};

describe("Earnings potential bridge", () => {
  it("shows loss baseline, break-even improvement and earnings needed without creating a positive forecast", () => {
    const html = renderToStaticMarkup(createElement(EarningsPotentialPanel, { value: potential }));
    expect(html).toContain("-$54,369");
    expect(html).toContain("-8.99%");
    expect(html).toContain("Tax earnings estimate");
    expect(html).toContain("43.6%");
    expect(html).toContain("$318,043");
    expect(html).toContain("Annual funding shortfall");
    expect(html).toContain("-$265,308");
    expect(html).toContain("A target is not a forecast");
    expect(html).toContain("-0.24x");
    expect(html).toContain("With saved loan plan");
    expect(html).toContain("Refinancing does not change EBITDA");
  });
  it("does not show saved plan values as the current unsaved scenario", () => {
    const html = renderToStaticMarkup(createElement(EarningsPotentialPanel, { value: potential, planIsCurrent: false }));
    expect(html).toContain("Save the working loan plan");
    expect(html).not.toContain("$25,000");
    expect(html).not.toContain("-2.50x");
    expect(html).toContain("Current obligations");
  });
  it("explains unavailable inputs and never renders absent values as zero", () => {
    const html = renderToStaticMarkup(createElement(EarningsPotentialPanel, { value: { available: false, reason: "Latest business source is incomplete.", notes: [] } }));
    expect(html).toContain("Latest business source is incomplete");
    expect(html).not.toContain("$0");
    expect(html).not.toContain("Annual earnings needed");
  });
});
