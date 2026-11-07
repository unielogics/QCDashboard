import { describe, expect, it } from "vitest";
import { buildSchedule, type RepaymentConfig } from "../loanSchedule";
import { applyAmortizationMonths, repaymentPreview } from "../repaymentConfig";

// Independently checked with a 60-digit Decimal annuity oracle. Amounts are
// rounded per payment; residuals therefore must not be scaled between loans.
const cases = [
  { amount: 100000, payment: 3234.73, residual: 76207.67, finalCash: 79442.40 },
  { amount: 200000, payment: 6469.45, residual: 152415.68, finalCash: 158885.13 },
  { amount: 380000, payment: 12291.96, residual: 289589.65, finalCash: 301881.61 },
];
const roundedQuotient = (numerator: bigint, denominator: bigint) => {
  const quotient = numerator / denominator, remainder = numerator % denominator;
  return quotient + (remainder * 2n > denominator || remainder * 2n === denominator && quotient % 2n === 1n ? 1n : 0n);
};

describe("independent maturity and amortization", () => {
  it.each(cases)("prices $amount over 60 months but matures after 24 months at 29.99%", ({ amount, payment, residual, finalCash }) => {
    const schedule = buildSchedule(amount, 29.99, 24, { structure: "amortizing", periodsPerYear: 12, repaymentConfig: { amortization_months: 60, balloons: [] } })!;
    const rate = .2999 / 12, factor = Math.pow(1 + rate, 60);
    expect(schedule.payment_after).toBe(payment);
    expect(Math.abs(payment - amount * rate * factor / (factor - 1))).toBeLessThan(.0051);
    expect(schedule.term_months).toBe(24);
    expect(schedule.amortization_months).toBe(60);
    expect(schedule.rows).toHaveLength(24);
    let balanceCents = BigInt(amount * 100);
    const paymentCents = BigInt(Math.round(payment * 100));
    for (const row of schedule.rows) {
      const interest = roundedQuotient(balanceCents * 2999n, 120000n);
      balanceCents -= paymentCents - interest;
      expect(row.interest).toBe(Number(interest) / 100);
      expect(row.balance).toBe(Number(balanceCents) / 100);
    }
    expect(schedule.balloon).toBe(residual);
    expect(schedule.rows.at(-1)?.maturity_balloon).toBe(residual);
    expect(schedule.rows.at(-1)?.cash_payment).toBe(finalCash);
    expect(schedule.rows.slice(0, -1).every((row) => row.maturity_balloon === 0)).toBe(true);
    expect(schedule.principal_repaid).toBe(amount);
    expect(schedule.rows.at(-1)?.balance_after_cash).toBe(0);
    expect(schedule.coverage_annual_debt_service).toBeGreaterThan(payment * 12);
  });

  it("does not shorten a chosen 60-month amortization when an IO phase is present", () => {
    const schedule = buildSchedule(100000, 29.99, 24, { structure: "amortizing", interestOnlyMonths: 6, repaymentConfig: { amortization_months: 60, balloons: [] } })!;
    expect(schedule.interest_only_months).toBe(6);
    expect(schedule.amortization_months).toBe(60);
    expect(schedule.payment_io).toBe(2499.17);
    expect(schedule.payment_after).toBe(3234.73);
    expect(schedule.rows.filter((row) => row.phase === "amortizing")).toHaveLength(18);
    expect(schedule.balloon).toBe(83534.64);
    expect(schedule.rows.at(-1)?.cash_payment).toBe(86769.37);
  });

  it("uses the contractual maturity to end the schedule without changing the amortization basis", () => {
    const config = { amortization_months: 60, balloons: [] };
    const twoYears = buildSchedule(100000, 29.99, 24, { structure: "amortizing", repaymentConfig: config })!;
    const threeYears = buildSchedule(100000, 29.99, 36, { structure: "amortizing", repaymentConfig: config })!;
    expect(twoYears.payment_after).toBe(threeYears.payment_after);
    expect(threeYears.rows).toHaveLength(36);
    expect(threeYears.balloon).toBeLessThan(twoYears.balloon);
  });
});

describe("separate amortization draft edits", () => {
  const original: RepaymentConfig = { amortization_months: 60, after_balloon: "recast", balloons: [{ id: "partial", month: 12, type: "percent_balance", value: 20 }] };
  it("changes only amortization while retaining independent balloon events and recast choices", () => {
    const updated = applyAmortizationMonths(original, 84)!;
    expect(updated.amortization_months).toBe(84);
    expect(updated.after_balloon).toBe("recast");
    expect(updated.balloons).toEqual(original.balloons);
    updated.balloons![0].value = 25;
    expect(original.balloons![0].value).toBe(20);
    expect(original.amortization_months).toBe(60);
  });
  it("clears only amortization and preserves the configured repayment basis", () => {
    const cleared = applyAmortizationMonths(original, null)!;
    expect(cleared).not.toHaveProperty("amortization_months");
    expect(cleared.after_balloon).toBe("recast");
    expect(cleared.balloons).toEqual(original.balloons);
    expect(applyAmortizationMonths({ amortization_months: 60, balloons: [] }, null)).toEqual({ balloons: [] });
    expect(applyAmortizationMonths(null, null)).toBeNull();
  });
  it("keeps an invalid entered amortization visible for validation instead of reverting to another payment", () => {
    const invalid = applyAmortizationMonths(original, Number.NaN)!;
    expect(Number.isNaN(invalid.amortization_months)).toBe(true);
    expect(repaymentPreview(100000, 29.99, 24, { structure: "amortizing", repaymentConfig: invalid }).error).toMatch(/amortization/i);
    expect(original.amortization_months).toBe(60);
  });
});
