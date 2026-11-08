import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSchedule, riskProfile } from "@/lib/loanSchedule";
import { coverageReview } from "@/lib/coverageReview";
import { LoanScheduleReview } from "../LoanScheduleReview";
import { LoanScheduleTable } from "../LoanScheduleTable";
import { CoverageFundingGap } from "../CoverageFundingGap";

describe("full loan schedule workspace", () => {
  it("shows actual principal and interest, paid-down progress and signed risk with negative earnings", () => {
    const schedule = buildSchedule(100000, 29.99, 24, { structure: "amortizing", repaymentConfig: { amortization_months: 60 } })!;
    const html = renderToStaticMarkup(createElement(LoanScheduleReview, { schedule, incomeMonthly: -5000, existingServiceMonthly: 1000, incomeCurrencyComparable: true }));
    expect(html).toContain("Principal and interest due");
    expect(html).toContain("Remaining principal");
    expect(html).toContain("Principal paid down");
    expect(html).toContain("100.0%");
    expect(html).toContain("Peak coverage shortfall · monthly equivalent");
    expect(html).toContain("Remaining principal continues to be credit exposure until it is paid");
    expect(html).toContain("-$");
    expect(html).not.toContain("nothing is at risk");
    expect(html.match(/Earnings are nonpositive/g)).toHaveLength(1);
  });

  it("bounds long schedules with payment pagination and keeps final balloon details visible on the last page", () => {
    const schedule = buildSchedule(100000, 12, 24, { structure: "amortizing", periodsPerYear: 51.96, repaymentConfig: { amortization_months: 60 } })!;
    const risk = riskProfile(schedule, 0, 1000);
    const first = renderToStaticMarkup(createElement(LoanScheduleTable, { schedule, risk, full: true, pageIndex: 0, onPageIndex: () => {} }));
    const last = renderToStaticMarkup(createElement(LoanScheduleTable, { schedule, risk, full: true, pageIndex: 4, onPageIndex: () => {} }));
    expect(first).toContain("Payments 1–24 of 104");
    expect(first.match(/<tr/g)).toHaveLength(25);
    expect(last).toContain("Payments 97–104 of 104");
    expect(last).toContain("Maturity balloon");
    expect(last).toContain("100.0%");
    expect(last).toContain("0.00x");
  });

  it("keeps unconfirmed currency shortfalls unavailable while exposing provisional ratios", () => {
    const schedule = buildSchedule(100000, 12, 24, { structure: "amortizing" })!;
    const html = renderToStaticMarkup(createElement(LoanScheduleReview, { schedule, incomeMonthly: -5000, existingServiceMonthly: 1000, incomeCurrencyComparable: false }));
    expect(html).toContain("-0.");
    expect(html).toContain("Peak coverage shortfall · monthly equivalent: —");
    expect(html.match(/Coverage shortfalls require earnings comparable with USD debt service/g)).toHaveLength(1);
  });

  it("explains negative-ratio movement using earnings shortfall and payment savings", () => {
    const value = coverageReview({ incomeAnnual: -20000, debtServiceAnnual: 100000 }, { incomeAnnual: -20000, debtServiceAnnual: 40000 });
    const html = renderToStaticMarkup(createElement(CoverageFundingGap, { value, basis: "Tax return 2025" }));
    expect(html).toContain("Tax return 2025");
    expect(html).toContain("$120,000");
    expect(html).toContain("$60,000");
    expect(html).toContain("Annual payment savings");
    expect(html).toContain("lower payments can make the signed ratio more negative");
    expect(html).toContain("Bank balances and dated cash movements are reviewed separately");
  });
});
