import { describe, expect, it } from "vitest";
import { sharedFinancingOfferFields } from "../sharedFinancingOffer";
import { repaymentPreview } from "../repaymentConfig";
import type { SyncedLoan } from "../loanTermsSync";

describe("primary offering follows the coverage loan", () => {
  it("preserves independent maturity, amortization, multiple principal payments and their cash-flow risk", () => {
    const loan: SyncedLoan = { amount: 380000, ratePct: 29.99, termMonths: 24, structure: "amortizing", interestOnlyMonths: 6, paymentsPerYear: 12, repaymentConfig: { amortization_months: 60, after_balloon: "recast", balloons: [{ id: "a", month: 12, type: "percent_balance", value: 20 }, { id: "b", month: 18, type: "amount", value: 10000 }] } };
    const offer = sharedFinancingOfferFields(loan);
    const baseline = repaymentPreview(loan.amount, loan.ratePct, loan.termMonths, { structure: loan.structure, interestOnlyMonths: loan.interestOnlyMonths, periodsPerYear: loan.paymentsPerYear ?? 12, repaymentConfig: loan.repaymentConfig }).schedule!;
    const mirrored = repaymentPreview(Number(offer.amount), Number(offer.rate_pct), Number(offer.term_months), { structure: offer.structure, interestOnlyMonths: Number(offer.interest_only_months), periodsPerYear: 12, repaymentConfig: offer.repayment_config }).schedule!;
    expect(offer).toMatchObject({ term_months: "24", repayment_config: { amortization_months: 60 }, factor_rate: null });
    expect(mirrored.rows).toEqual(baseline.rows);
    expect(mirrored.balloon).toBe(baseline.balloon);
    expect(mirrored.coverage_annual_debt_service).toBe(baseline.coverage_annual_debt_service);
    offer.repayment_config!.balloons![0].value = 30;
    expect(loan.repaymentConfig!.balloons![0].value).toBe(20);
  });
  it("retains a zero rate and custom fractional payment cadence", () => {
    expect(sharedFinancingOfferFields({ amount: 100000, ratePct: 0, termMonths: 24, structure: "amortizing", interestOnlyMonths: 0, paymentsPerYear: 51.5 })).toMatchObject({ rate_pct: "0", payment_frequency: "custom", payments_per_year: "51.5" });
  });
});
