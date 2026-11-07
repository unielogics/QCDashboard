import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinancialSourceReviewNotices } from "../cockpit/FinancialCalculationReview";
import type { FinancialMetricReview } from "@/lib/financialMetrics";

const review: Pick<FinancialMetricReview, "excluded_income_sources" | "comparative_conflicts"> = {
  excluded_income_sources: [{ file_id: "personal", file_name: "Owner return.pdf", reason: "Personal tax return; excluded from business earnings and DSCR." }],
  comparative_conflicts: [{ year: "2024", field: "income", file_id: "original", value: -193701, comparative_file_id: "later", comparative_value: -120000, difference: 73701, reason: "The later return's comparative differs. Review an amended or reconciled return; original figures have been preserved." }],
};

describe("financial source review notices", () => {
  it("shows the year and both figures, distinguishes excluded personal evidence, and exposes source actions", () => {
    const html = renderToStaticMarkup(createElement(FinancialSourceReviewNotices, { review, onPreview: () => {} }));
    expect(html).toContain("2024 · Business income differs between returns");
    expect(html).toContain("Original return: -193,701.00");
    expect(html).toContain("Later return comparison: -120,000.00");
    expect(html).toContain("Difference: 73,701.00");
    expect(html).toContain("original figures have been preserved");
    expect(html).toContain("1 tax file excluded from business earnings");
    expect(html).toContain("Owner return.pdf");
    expect(html).toContain("Open original 2024 return");
    expect(html).toContain("Open later return comparison");
    expect(html.match(/<button /g)).toHaveLength(3);
    expect(html).not.toContain("$");
  });

  it("keeps missing evidence read-only and leaves unaffected reviews uncluttered", () => {
    const html = renderToStaticMarkup(createElement(FinancialSourceReviewNotices, { review }));
    expect(html).not.toContain("<button");
    expect(html).toContain("Original return");
    expect(renderToStaticMarkup(createElement(FinancialSourceReviewNotices, { review: {} }))).toBe("");
  });
});
