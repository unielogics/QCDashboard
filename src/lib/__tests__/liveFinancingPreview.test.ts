import { describe, expect, it } from "vitest";
import type { TermsOnFile } from "@/components/file/UnderwritingFlow";
import type { WorkingFinancing } from "../workingFinancing";
import { liveFinancingPreview } from "../liveFinancingPreview";

const saved: TermsOnFile = { kind: "application_term_sheet", id: "saved-terms", version: 3, status: "draft", label: "Client terms v3",
  amount: 200567, ratePct: 29.99, termMonths: 24, structureLabel: "Amortizing", interestOnlyMonths: 6,
  paymentMonthly: null, paymentAmount: 1694.44, paymentLabel: "Payment · 48 payments per year",
  coverageAfter: -0.29, recordedAt: "2026-11-10T12:00:00Z", sentToClient: false };

function working(): WorkingFinancing {
  return { profileId: "fictional", dirty: true, currentDscr: -0.1, projectedDscr: -0.2, projectedDebtServiceAnnual: 449264,
    source: "Fictional reviewed earnings", plan: { retire: [], exclude: [], add_backs: [], overrides: null, note: null,
      new_payment_monthly: null, new_payment_source: "manual_terms", new_loan_amount: 137688, new_loan_rate_pct: 29.99,
      new_loan_term_months: 24, new_loan_interest_only: false, new_loan_structure: "amortizing", new_loan_interest_only_months: 6,
      new_loan_repayment_config: { amortization_months: 54 }, new_loan_payments_per_year: 48 } };
}

describe("the live underwriting preview", () => {
  it("prices the edited loan at its actual cadence and keeps coverage separate from the regular payment", () => {
    const value = liveFinancingPreview(working(), saved);
    const rate = 0.2999 / 48;
    const regularPayment = 137688 * rate / (1 - Math.pow(1 + rate, -54 * 48 / 12));
    expect(value.amount).toBe(137688);
    expect(value.paymentAmount).toBeCloseTo(regularPayment, 2);
    expect(value.paymentLabel).toBe("Payment · 48 payments per year");
    expect(value.coverageAfter).toBe(-0.2);
    expect(value.debtServiceAnnual).toBe(449264);
    expect(value.label).toBe("Working preview · unsaved");
    expect(saved.amount).toBe(200567);
  });

  it("uses the exact fee-adjusted principal instead of the pre-fee working amount", () => {
    const current = working();
    current.budgetEvaluation = { loan_terms: { amount: 150000, rate_pct: 29.99, term_months: 24, interest_only: false,
      structure: "amortizing", payments_per_year: 48 } } as WorkingFinancing["budgetEvaluation"];
    expect(liveFinancingPreview(current, saved).amount).toBe(150000);
    current.budgetPending = true;
    expect(liveFinancingPreview(current, saved)).toMatchObject({ pending: true, amount: null, paymentAmount: null, coverageAfter: null, debtServiceAnnual: null });
  });

  it("does not fill missing current inputs from the saved offer or an older evaluation", () => {
    const current = working();
    current.plan.new_loan_rate_pct = null;
    current.plan.new_loan_term_months = null;
    current.budgetEvaluation = { loan_terms: { amount: 137688, rate_pct: 29.99, term_months: 24, payments_per_year: 48 } } as WorkingFinancing["budgetEvaluation"];
    expect(liveFinancingPreview(current, saved)).toMatchObject({ amount: 137688, ratePct: null, termMonths: null, paymentAmount: null });
  });

  it("does not resurrect saved principal after clearing a loan, even if an older evaluation remains", () => {
    const current = working();
    current.plan = { retire: [], exclude: [], add_backs: [], overrides: null, note: null, new_payment_monthly: null, new_payment_source: null,
      new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null };
    current.budgetEvaluation = { loan_terms: { amount: 200567 } } as WorkingFinancing["budgetEvaluation"];
    expect(liveFinancingPreview(current, saved)).toMatchObject({ hasLoan: false, amount: null, ratePct: null, paymentAmount: null });
  });

  it("only uses recorded fallback values for the exact referenced version", () => {
    const current = working();
    current.dirty = false;
    current.plan = { retire: [], exclude: [], add_backs: [], overrides: null, note: null, new_payment_monthly: null, new_payment_source: "recorded_terms",
      new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null,
      terms_ref: { kind: "client_terms", id: saved.id, version: 3, label: "Saved v3" } };
    expect(liveFinancingPreview(current, saved)).toMatchObject({ amount: 200567, paymentAmount: 1694.44, coverageAfter: -0.2 });
    current.plan.terms_ref!.version = 2;
    expect(liveFinancingPreview(current, saved)).toMatchObject({ hasLoan: false, amount: null, paymentAmount: null });
  });

  it("keeps a manual monthly payment independent of an unknown principal", () => {
    const current = working();
    current.plan = { retire: [], exclude: [], add_backs: [], overrides: null, note: null, new_payment_source: "manual", new_payment_monthly: 1250,
      new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null };
    expect(liveFinancingPreview(current, saved)).toMatchObject({ amount: null, paymentAmount: 1250, paymentLabel: "Manual payment / month", ratePct: null });
  });

  it("retains a lender-stated payment only while the exact recorded loan is unchanged", () => {
    const current = working();
    current.plan = { ...current.plan, new_loan_amount: saved.amount, new_payment_source: "recorded_terms", new_loan_repayment_config: null,
      terms_ref: { kind: "client_terms", id: saved.id, version: saved.version, label: "Saved lender quote" } };
    const quote = { ...saved, paymentAmount: 1234.56, paymentLabel: "Lender-stated payment" };
    expect(liveFinancingPreview(current, quote).paymentAmount).toBe(1234.56);
    current.plan.new_loan_amount = 137688;
    expect(liveFinancingPreview(current, quote).paymentAmount).not.toBe(1234.56);
  });
});
