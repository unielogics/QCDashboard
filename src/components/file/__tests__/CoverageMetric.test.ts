import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoverageMetric } from "../cockpit/CoverageMetric";

const render = (incomeAnnual: number | null, value: number | null, extra = {}) => renderToStaticMarkup(createElement(CoverageMetric, { incomeAnnual, value, ...extra }));
describe("coverage with losses", () => {
  it("keeps Body Good's signed ratios as context, with a loss as the primary status", () => {
    for (const ratio of [-0.26, -0.76]) {
      const html = render(-54369, ratio);
      expect(html).toContain("<strong>Negative earnings</strong>");
      expect(html).toContain(`Signed DSCR ${ratio.toFixed(2)}x`);
      expect(html).toContain("Operating loss remains");
    }
  });
  it("does not imply paying every debt creates earnings or an infinite coverage ratio", () => {
    const html = render(-54369, null, { noDebt: true });
    expect(html).toContain("No debt service");
    expect(html).toContain("DSCR not applicable");
    expect(html).toContain("Operating loss remains");
    expect(html).not.toContain("Infinity");
  });
  it("retains zero, positive and unknown earnings as distinct states", () => {
    expect(render(0, 0)).toContain("Break-even earnings");
    expect(render(120000, 1.25)).toContain("<strong>1.25x</strong>");
    expect(render(null, null)).not.toContain("Negative earnings");
    expect(render(-54369, -0.76, { pending: true })).toContain("<strong>Needs review</strong>");
    expect(render(-54369, -0.76, { pending: true })).not.toContain("Signed DSCR");
  });
});
