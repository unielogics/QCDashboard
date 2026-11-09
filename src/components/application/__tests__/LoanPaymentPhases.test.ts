import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSchedule } from "@/lib/loanSchedule";
import { LoanPaymentPhases } from "../LoanPaymentPhases";

describe("contractual payment phases", () => {
  it("shows the screenshot installments, independent timeline, balloon and stress separately", () => {
    const schedule = buildSchedule(89934, 29.99, 24, { structure: "amortizing", interestOnlyMonths: 6, repaymentConfig: { amortization_months: 60 } })!;
    const html = renderToStaticMarkup(createElement(LoanPaymentPhases, { schedule }));
    expect(html).toContain("$2,247.60");
    expect(html).toContain("$2,909.12");
    expect(html).toContain("$75,126.11");
    expect(html).toContain("18 scheduled monthly payments");
    expect(html).toContain("60-month amortization");
    expect(html).toContain("Maturity stays at 24 months");
    expect(html).toContain("$30,940.32");
    expect(html).toContain("$9,169.63");
    expect(html).toContain("This stress figure is not the regular installment");
  });

  it("shows changed installments after a curtailment instead of claiming a fixed IO phase", () => {
    const schedule = buildSchedule(100000, 12, 24, { structure: "amortizing", interestOnlyMonths: 6, repaymentConfig: { amortization_months: 60, after_balloon: "recast", balloons: [{ id: "curtail", month: 3, type: "percent_balance", value: 80 }] } })!;
    const html = renderToStaticMarkup(createElement(LoanPaymentPhases, { schedule }));
    expect(html).toContain("Installments vary from $200.00 to $1,000.00");
    expect(html).toContain("$444.89");
  });

  it("uses the actual end of an early-payoff IO phase", () => {
    const schedule = buildSchedule(100000, 12, 24, { structure: "amortizing", interestOnlyMonths: 6, repaymentConfig: { amortization_months: 60, after_balloon: "recast", balloons: [{ id: "payoff", month: 3, type: "percent_balance", value: 100 }] } })!;
    const html = renderToStaticMarkup(createElement(LoanPaymentPhases, { schedule }));
    expect(html).toContain("Through month 3");
    expect(html).not.toContain("2. Principal and interest");
  });
});
