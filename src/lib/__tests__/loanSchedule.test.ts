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
