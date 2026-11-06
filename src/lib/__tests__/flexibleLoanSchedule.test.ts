import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/flexibleLoanSchedule.json";
import { buildSchedule, effectiveRatePct, normalizeRepaymentConfig, riskProfile, scheduleCashFlows, type RepaymentConfig } from "../loanSchedule";

describe("flexible loan Python/TypeScript financial parity", () => {
  for (const [name, fixture] of Object.entries(fixtures)) it(`matches Python cash, principal, coverage, risk and IRR: ${name}`, () => {
    const input = fixture.input;
    const options = { structure: "structure" in input ? input.structure : undefined, interestOnlyMonths: "interest_only_months" in input ? input.interest_only_months : 0,
      periodsPerYear: "periods_per_year" in input ? input.periods_per_year : 12,
      repaymentConfig: "repayment_config" in input ? input.repayment_config as RepaymentConfig : undefined };
    const result = buildSchedule(input.amount, input.rate_pct, input.term_months, options)!;
    const { rows, cash_flows: cashFlows, ...summary } = result;
    expect(summary).toEqual(fixture.summary);
    for (const sample of fixture.rows) expect(rows[sample.index]).toEqual(sample.row);
    expect(result.principal_repaid).toBe(input.amount);
    expect(Math.round(scheduleCashFlows(result).reduce((sum, value) => sum + value, 0) * 100) / 100).toBe(result.total_paid);
    expect(cashFlows?.length).toBe(rows.length);
    const { coverage_by_period: coverage, cash_coverage_by_period: cashCoverage, words, ...risk } = riskProfile(result, 15000, 1000)!;
    expect(risk).toEqual(fixture.risk);
    expect(coverage).toHaveLength(rows.length);
    expect(cashCoverage).toHaveLength(rows.length);
    expect(words).toBeTruthy();
    expect(effectiveRatePct(input.amount, scheduleCashFlows(result), 0, result.periods_per_year)).toBe(fixture.effective_rate_pct);
    expect(effectiveRatePct(input.amount, rows.map((row) => row.payment), result.balloon, result.periods_per_year)).toBe(fixture.effective_rate_pct);
  });

  it("rejects overpayments and future events after early payoff instead of capping or ignoring them", () => {
    expect(() => buildSchedule(2400, 0, 12, { repaymentConfig: { balloons: [{ id: "too-big", month: 1, type: "amount", value: 2300 }] } })).toThrow("exceeds remaining principal");
    expect(() => buildSchedule(12000, 0, 12, { structure: "interest_only", repaymentConfig: { balloons: [{ id: "all", month: 3, type: "percent_balance", value: 100 }, { id: "extra", month: 4, type: "amount", value: 1 }] } })).toThrow("already been repaid");
  });
  it("requires finite integer compatible configuration and never silently truncates long schedules", () => {
    expect(() => normalizeRepaymentConfig({ amortization_months: 120 }, 12, { structure: "interest_only" })).toThrow("all-interest-only");
    expect(() => normalizeRepaymentConfig({ amortization_months: 1.5 }, 12)).toThrow("whole number");
    expect(() => buildSchedule(1000, 8, 601)).toThrow("Maturity months");
    expect(() => buildSchedule(1000, 8, 12, { periodsPerYear: Infinity })).toThrow("finite");
    const legacy = buildSchedule(100000, 8, 600, { periodsPerYear: 252 })!;
    expect(legacy.rows).toHaveLength(12600);
  });
  it("handles legacy projected null cash fields without duplicating the residual", () => {
    const source = { rows: [{ payment: 10, cash_payment: null }], balloon: 100 } as unknown as Parameters<typeof scheduleCashFlows>[0];
    expect(scheduleCashFlows(source)).toEqual([110]);
  });
});
