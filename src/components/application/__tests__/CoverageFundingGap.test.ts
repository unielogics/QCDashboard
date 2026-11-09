import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { coverageReview } from "@/lib/coverageReview";
import { CoverageFundingGap } from "../CoverageFundingGap";

const render = (income = -54369, before = 210939.12, after = 71738.04, comparable = true) => renderToStaticMarkup(createElement(CoverageFundingGap, {
  value: coverageReview({ incomeAnnual: income, debtServiceAnnual: before }, { incomeAnnual: income, debtServiceAnnual: after }, comparable), basis: "Tax return 2025",
}));
describe("funding relief presentation", () => {
  it("makes the real improvement explicit when Body Good's signed DSCR becomes more negative", () => {
    const html = render();
    expect(html).toContain("The plan reduces the funding shortfall");
    expect(html).toContain("$139,201.08");
    expect(html).toContain("$265,308.12");
    expect(html).toContain("$126,107.04");
    expect(html).toContain("$11,600.09");
    expect(html).toContain("refinancing alone does not change EBITDA");
  });
  it("calls a larger payment burden an increased shortfall even when the signed ratio rises", () => {
    const html = render(-54369, 71738.04, 210939.12);
    expect(html).toContain("The plan increases the funding shortfall");
    expect(html).toContain("Monthly debt-service increase (coverage basis)");
    expect(html).not.toContain("The plan reduces");
  });
  it("preserves an operating funding gap after every debt is paid", () => {
    expect(render(-54369, 210939.12, 0)).toContain("$54,369.00");
  });
  it("does not claim a funding improvement until currencies can be compared", () => {
    const html = render(-54369, 210939.12, 71738.04, false);
    expect(html).toContain("Review the coverage shortfall");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("less annual funding needed");
  });
});
