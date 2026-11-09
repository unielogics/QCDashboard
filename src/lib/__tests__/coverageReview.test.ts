import { describe, expect, it } from "vitest";
import { coverageCurrencyComparable, coverageReview } from "../coverageReview";
import type { FinancialCockpit } from "../financialCockpit";

describe("signed earnings and debt funding needs", () => {
  it("reconciles Body Good's exact saved schedule with the selected three payoffs", () => {
    const review = coverageReview({ incomeAnnual: -54369, debtServiceAnnual: 210939.12 }, { incomeAnnual: -54369, debtServiceAnnual: 71738.04 });
    expect(review.before.dscr).toBe(-0.26);
    expect(review.after.dscr).toBe(-0.76);
    expect(review.before.cashShortfallAnnual).toBe(265308.12);
    expect(review.after.cashShortfallAnnual).toBe(126107.04);
    expect(review.shortfallReductionAnnual).toBe(139201.08);
    expect(review.debtServiceSavingsAnnual).toBe(139201.08);
    expect(review.ratioDeltaDirectionMeaningful).toBe(false);
    expect(review.effect).toBe("cash_relief");
  });
  it("keeps a more-negative ratio when debt falls while recognizing cash relief", () => {
    const review = coverageReview({ incomeAnnual: -60000, debtServiceAnnual: 300000 }, { incomeAnnual: -60000, debtServiceAnnual: 120000 });
    expect(review.before.dscr).toBe(-0.2);
    expect(review.after.dscr).toBe(-0.5);
    expect(review.before.cashShortfallAnnual).toBe(360000);
    expect(review.after.cashShortfallAnnual).toBe(180000);
    expect(review.shortfallReductionAnnual).toBe(180000);
    expect(review.effect).toBe("cash_relief");
  });
  it("does not call higher payments an improvement for a loss", () => {
    const review = coverageReview({ incomeAnnual: -60000, debtServiceAnnual: 120000 }, { incomeAnnual: -60000, debtServiceAnnual: 300000 });
    expect(review.after.dscr).toBeGreaterThan(review.before.dscr!);
    expect(review.effect).toBe("cash_worsens");
    expect(review.cashSurplusChangeAnnual).toBe(-180000);
  });
  it("preserves zero income and still shows operating losses after full payoff", () => {
    const zero = coverageReview({ incomeAnnual: 0, debtServiceAnnual: 12000 }, { incomeAnnual: 0, debtServiceAnnual: 12000 });
    expect(zero.after.dscr).toBe(0);
    expect(zero.note).toContain("With zero earnings");
    expect(zero.ratioDeltaDirectionMeaningful).toBe(false);
    const review = coverageReview({ incomeAnnual: -12000, debtServiceAnnual: 12000 }, { incomeAnnual: -12000, debtServiceAnnual: 0 });
    expect(review.after.dscr).toBeNull();
    expect(review.after.cashShortfallAnnual).toBe(12000);
  });
  it("preserves unknown inputs, invalid debt and currency comparability", () => {
    for (const debtServiceAnnual of [null, undefined, Number.NaN, -100]) {
      expect(coverageReview({ incomeAnnual: -10, debtServiceAnnual }, { incomeAnnual: -10, debtServiceAnnual }).after.cashShortfallAnnual).toBeNull();
    }
    const review = coverageReview({ incomeAnnual: -10, debtServiceAnnual: 100 }, { incomeAnnual: -10, debtServiceAnnual: 50 }, false);
    expect(review.after.dscr).toBe(-0.2);
    expect(review.after.cashShortfallAnnual).toBeNull();
    expect(review.effect).toBe("unavailable");
    expect(review.ratioDeltaDirectionMeaningful).toBe(false);
  });
  it("uses signed nearest-even rounding consistently with Python", () => {
    expect(coverageReview({ incomeAnnual: -1375, debtServiceAnnual: 1000 }, { incomeAnnual: 0, debtServiceAnnual: 1000 }).before.dscr).toBe(-1.38);
  });
  it("requires the selected source currency and preserves explicit USD scenario hypotheses", () => {
    const cockpit = { dscr: { headline: { key: "tax_return", currency_comparable: true } }, metric_review: { calculations: [{ key: "dscr.tax_return", currency_comparable: false }] } } as FinancialCockpit;
    expect(coverageCurrencyComparable(cockpit)).toBe(false);
    expect(coverageCurrencyComparable(cockpit, true)).toBe(true);
    expect(coverageCurrencyComparable({ dscr: { headline: { key: "tax_return" } } } as FinancialCockpit)).toBe(false);
    const review = coverageReview({ incomeAnnual: -100, debtServiceAnnual: 1000 }, { incomeAnnual: -100, debtServiceAnnual: 500 }, { before: false, after: true });
    expect(review.before.cashShortfallAnnual).toBeNull();
    expect(review.after.cashShortfallAnnual).toBe(600);
    expect(review.shortfallReductionAnnual).toBeNull();
    expect(review.debtServiceSavingsAnnual).toBe(500);
  });
  it("uses the actual income candidate when zero current debt has no DSCR headline", () => {
    const cockpit = { dscr: { headline: null, candidates: [{ key: "profit_and_loss", numerator: -1000, currency_comparable: true }] }, metric_review: { calculations: [{ key: "dscr.profit_and_loss", currency_comparable: true }] } } as FinancialCockpit;
    expect(coverageCurrencyComparable(cockpit)).toBe(true);
  });
});
