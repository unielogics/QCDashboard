import { describe, expect, it } from "vitest";
import { FACILITY_CATALOG } from "../options";
import { computePaymentSummary, defaultProgramCoverage, effectiveAnnualRate, periodsPerYear } from "../termSheetStructure";

describe("term-sheet structured payment summary", () => {
  it("keeps the legacy fully-amortizing monthly calculation", () => {
    const summary = computePaymentSummary({
      amount: 500_000,
      termMonths: 36,
      annualRatePct: 10.25,
      repaymentStructure: "fully_amortizing",
      paymentFrequency: "monthly",
      amortizationMonths: 36,
    });
    expect(summary.periodic_payment).toBeCloseTo(16_192.34, 2);
    expect(summary.monthly_equivalent_payment).toBe(summary.periodic_payment);
    expect(summary.balloon_amount).toBe(0);
  });

  it("describes an interest-only line from the selected draw balance", () => {
    const summary = computePaymentSummary({
      amount: 500_000,
      paymentBasisAmount: 200_000,
      termMonths: 24,
      annualRatePct: 12,
      repaymentStructure: "revolving_interest_only",
      paymentFrequency: "monthly",
    });
    expect(summary.periodic_payment).toBe(2_000);
    expect(summary.monthly_equivalent_payment).toBe(2_000);
    expect(summary.balloon_amount).toBe(200_000);
    expect(summary.assumptions.join(" ")).toContain("draws");
  });

  it("shows both phases and the conservative program coverage for IO then amortizing", () => {
    const summary = computePaymentSummary({
      amount: 300_000,
      termMonths: 60,
      annualRatePct: 9,
      repaymentStructure: "interest_only_then_amortizing",
      paymentFrequency: "monthly",
      interestOnlyMonths: 12,
      amortizationMonths: 48,
    });
    expect(summary.periodic_payment).toBe(2_250);
    expect(summary.post_io_payment).toBeGreaterThan(summary.periodic_payment!);
    expect(defaultProgramCoverage(summary)).toBe(summary.post_io_monthly_equivalent);
    expect(summary.balloon_amount).toBe(0);
  });

  it("calculates the residual balloon when amortization exceeds maturity", () => {
    const summary = computePaymentSummary({
      amount: 1_000_000,
      termMonths: 60,
      annualRatePct: 8,
      repaymentStructure: "balloon",
      paymentFrequency: "monthly",
      amortizationMonths: 240,
    });
    expect(summary.periodic_payment).toBeCloseTo(8_364.4, 1);
    expect(summary.balloon_amount).toBeGreaterThan(850_000);
    expect(summary.balloon_amount).toBeLessThan(900_000);
  });

  it("recalculates the payment to reach an explicit maturity balance", () => {
    const summary = computePaymentSummary({
      amount: 500_000,
      termMonths: 60,
      annualRatePct: 9,
      repaymentStructure: "balloon",
      paymentFrequency: "monthly",
      amortizationMonths: 360,
      balloonAmountOverride: 400_000,
    });
    expect(summary.periodic_payment).toBeCloseTo(5_075.84, 2);
    expect(summary.balloon_amount).toBe(400_000);
  });

  it("preserves an explicit negative-amortization maturity balance above principal", () => {
    const summary = computePaymentSummary({
      amount: 500_000,
      termMonths: 12,
      annualRatePct: 10,
      repaymentStructure: "balloon",
      paymentFrequency: "monthly",
      amortizationMonths: 120,
      balloonAmountOverride: 540_000,
    });
    expect(summary.periodic_payment).toBeGreaterThan(0);
    expect(summary.balloon_amount).toBe(540_000);
  });

  it("recalculates the balloon from a lender-stated payment override", () => {
    const summary = computePaymentSummary({
      amount: 500_000,
      termMonths: 36,
      annualRatePct: 10.25,
      repaymentStructure: "fully_amortizing",
      paymentFrequency: "monthly",
      amortizationMonths: 36,
      periodicPaymentOverride: 15_000,
    });
    expect(summary.periodic_payment).toBe(15_000);
    expect(summary.balloon_amount).toBeGreaterThan(45_000);
  });

  it("shows negative amortization on a low fixed lender payment", () => {
    const summary = computePaymentSummary({
      amount: 500_000,
      termMonths: 12,
      annualRatePct: 10,
      repaymentStructure: "fixed_payment",
      paymentFrequency: "monthly",
      periodicPaymentOverride: 1_000,
    });
    expect(summary.periodic_payment).toBe(1_000);
    expect(summary.balloon_amount).toBeCloseTo(539_790.97, 2);
  });

  it("normalizes weekly lender payments to a monthly equivalent", () => {
    const summary = computePaymentSummary({
      amount: 100_000,
      termMonths: 12,
      annualRatePct: 0,
      repaymentStructure: "fixed_payment",
      paymentFrequency: "weekly",
      periodicPaymentOverride: 1_000,
    });
    expect(summary.periodic_payment).toBe(1_000);
    expect(summary.monthly_equivalent_payment).toBeCloseTo(4_330, 2);
  });

  it("uses the application cadence constants", () => {
    expect(periodsPerYear("daily")).toBe(252);
    expect(periodsPerYear("weekly")).toBe(51.96);
    expect(periodsPerYear("biweekly")).toBe(25.98);
    expect(periodsPerYear("monthly")).toBe(12);
  });

  it("builds the current all-in variable rate with floor and cap", () => {
    expect(effectiveAnnualRate({ structure: "variable", fixedOrCustomRatePct: 0, indexRatePct: 7.5, marginPct: 2.25, floorPct: 8, capPct: 9 })).toBe(9);
    expect(effectiveAnnualRate({ structure: "fixed", fixedOrCustomRatePct: 10.25 })).toBe(10.25);
  });

  it("classifies commercial HELOCs and revolving LOCs as revolving interest-only facilities", () => {
    expect(FACILITY_CATALOG).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "business_heloc", kind: "heloc", repayment: "revolving_interest_only" }),
      expect.objectContaining({ key: "revolving_loc", kind: "revolving_loc", repayment: "revolving_interest_only" }),
      expect.objectContaining({ key: "dscr_rental_loan", kind: "term_loan" }),
      expect.objectContaining({ key: "asset_based_loc", kind: "revolving_loc", repayment: "revolving_interest_only" }),
      expect.objectContaining({ key: "construction_loan", repayment: "interest_only" }),
      expect.objectContaining({ key: "revenue_based_financing", repayment: "custom" }),
    ]));
  });
});
