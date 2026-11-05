import { describe, expect, it } from "vitest";
import { buildSchedule, defaultStructure, describeSchedule } from "../loanSchedule";

describe("loan schedule", () => {
  it("defaults to simple interest under three years and amortizing from three", () => {
    expect(defaultStructure(24)).toBe("simple_interest");
    expect(defaultStructure(35)).toBe("simple_interest");
    expect(defaultStructure(36)).toBe("amortizing");
    expect(defaultStructure(null)).toBe("simple_interest");
  });

  it("prices a two-year 200k loan with six interest-only months the way the server does", () => {
    const s = buildSchedule(200000, 12, 24, { interestOnlyMonths: 6 })!;
    expect(s.structure).toBe("simple_interest");
    expect(s.payment_io).toBe(2000);
    expect(s.payment_after).toBe(13111.11);
    expect(s.coverage_payment_monthly).toBe(13111.11);
    expect(s.coverage_annual_debt_service).toBe(157333.32);
    expect(s.annual_debt_service).toBe(90666.66);
    expect(s.total_interest).toBe(48000);
    expect(s.total_paid).toBe(248000);
    expect(s.rows).toHaveLength(24);
    expect(s.rows[23].balance).toBe(0);
    expect(s.rows[23].principal).toBe(11111.13); // the last row carries the cents the even split rounds away
    expect(describeSchedule(s)).toBe("over 24 months, 6 interest-only then simple interest");
  });

  it("amortizes a five-year loan to a zero balance and keeps interest-only to maturity as a balloon", () => {
    const amortizing = buildSchedule(100000, 10, 60)!;
    expect(amortizing.structure).toBe("amortizing");
    expect(amortizing.payment_after).toBe(2124.7);
    expect(amortizing.rows[59].balance).toBe(0);
    expect(amortizing.balloon).toBe(0);
    const io = buildSchedule(100000, 10, 12, { structure: "interest_only" })!;
    expect(io.payment_io).toBe(833.33);
    expect(io.payment_after).toBeNull();
    expect(io.balloon).toBe(100000);
    expect(describeSchedule(io)).toBe("interest-only over 12 months, principal due at maturity");
  });

  it("rounds period counts half up, as the server does", () => {
    expect(buildSchedule(100000, 10, 6, { periodsPerYear: 5, structure: "amortizing" })!.periods).toBe(3);
    expect(buildSchedule(52000, 10, 12, { periodsPerYear: 51.96, structure: "amortizing" })!.periods).toBe(52);
  });
});

describe("principal at risk", () => {
  it("says how long the principal is at risk and the coverage on every payment, like the server", async () => {
    const { riskProfile, effectiveRatePct } = await import("../loanSchedule");
    const s = buildSchedule(200000, 12, 24, { interestOnlyMonths: 6 })!;
    expect(s.full_exposure_months).toBe(6);
    expect(s.rows[5].exposure_pct).toBe(100);
    expect(s.rows[6].exposure_pct).toBe(94.4);
    expect(s.rows[23].exposure_pct).toBe(0);
    expect(s.weighted_average_life_months).toBe(15.5);
    expect(s.recovery_milestones).toEqual({ "25": 11, "50": 15, "75": 20, "100": 24 });
    const risk = riskProfile(s, 20000, 2000)!;
    expect(risk.coverage_during_interest_only).toBe(5);
    expect(risk.coverage_after_interest_only).toBe(1.32);
    expect(risk.lowest_coverage).toBe(1.32);
    expect(risk.lowest_coverage_month).toBe(7);
    expect(risk.words).toContain("fully exposed for the first 6 months");
    expect(risk.words).toContain("half by month 15");
    expect(risk.words).toContain("5.00x during the interest-only months, 1.32x once principal starts");
    expect(riskProfile(s)!.coverage_by_period).toEqual([]);
    expect(s.rows[5].cash_at_risk_pct).toBe(94);
    expect(s.breakeven_month).toBe(21);
    expect(s.rows[20].cash_at_risk_pct).toBe(0);
    expect(risk.words).toContain("capital is back by month 21");
    expect(buildSchedule(100000, 10, 12, { structure: "interest_only" })!.breakeven_month).toBe(12);
    expect(effectiveRatePct(100000, Array(12).fill(8791.59))).toBe(10);
    expect(effectiveRatePct(200000 - 5500, s.rows.map((r) => r.payment))!).toBeGreaterThan(16);
  });
});
