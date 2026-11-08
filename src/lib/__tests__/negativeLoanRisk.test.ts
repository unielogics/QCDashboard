import { describe, expect, it } from "vitest";
import { buildSchedule, riskProfile } from "../loanSchedule";

const schedule = () => buildSchedule(262529, 29.99, 24, { structure: "amortizing", interestOnlyMonths: 6, repaymentConfig: { amortization_months: 60 } })!;

describe("loan risk with loss, zero and unknown earnings", () => {
  it("retains signed ratios and identifies the balloon as peak funding stress", () => {
    const loan = schedule(), risk = riskProfile(loan, -1000, 0)!;
    expect(loan.payment_io).toBe(6561.04);
    expect(loan.payment_after).toBe(8492.09);
    expect(loan.maturity_balloon).toBe(219303);
    expect(risk.income_monthly).toBe(-1000);
    expect(risk.coverage_by_period).toHaveLength(24);
    expect(risk.coverage_by_period[0].coverage).toBe(-0.15);
    expect(risk.peak_cash_shortfall_period).toBe(24);
    expect(risk.peak_cash_shortfall_monthly).toBe(228795.09);
    expect(risk.cash_coverage_by_period![0].cash_shortfall_monthly).toBe(7561.04);
    expect(risk.coverage_note).toContain("does not rank cash stress");
  });
  it("keeps zero as known income with zero coverage and a known shortfall", () => {
    const risk = riskProfile(schedule(), 0, 0)!;
    expect(risk.income_monthly).toBe(0);
    expect(risk.coverage_by_period.every((row) => row.coverage === 0)).toBe(true);
    expect(risk.peak_cash_shortfall_monthly).toBe(227795.09);
  });
  it("does not assume unknown existing debt is zero", () => {
    for (const existing of [null, undefined, Number.NaN, -1]) {
      const risk = riskProfile(schedule(), -1000, existing)!;
      expect(risk.existing_service_monthly).toBeNull();
      expect(risk.coverage_by_period).toEqual([]);
      expect(risk.peak_cash_shortfall_monthly).toBeNull();
      expect(risk.coverage_unavailable_reason).toContain("Existing debt service is unknown");
    }
  });
  it("keeps provisional signed ratios without calculating incomparable dollar gaps", () => {
    const risk = riskProfile(schedule(), -1000, 0, false)!;
    expect(risk.coverage_by_period[0].coverage).toBe(-0.15);
    expect(risk.peak_cash_shortfall_monthly).toBeNull();
    expect(risk.coverage_by_period[0].cash_surplus_monthly).toBeNull();
    expect(risk.coverage_note).toContain("same currency");
  });
  it("rounds signed ratios consistently with the backend", () => {
    const risk = riskProfile(buildSchedule(1320, 0, 12)!, -151.25, 0)!;
    expect(risk.coverage_by_period[0].coverage).toBe(-1.38);
  });
  it("distinguishes receipts recovery from outstanding principal exposure", () => {
    const loan = buildSchedule(100000, 60, 36, { structure: "interest_only" })!;
    const risk = riskProfile(loan, 10000, 0)!;
    expect(loan.breakeven_month).toBe(20);
    expect(loan.rows[19].balance).toBe(100000);
    expect(risk.words).toContain("unpaid principal remains credit exposure");
    expect(risk.words).not.toContain("nothing is at risk");
  });
});
