import { describe, expect, it } from "vitest";
import { evaluatePlanLocally, PAYOFF_REPLAY_REVIEW_REQUIRED } from "../cockpitSimulation";
import type { CockpitMonth, FinancialCockpit, FinancialPlanWrite, Obligation } from "../financialCockpit";

const loan = (id: string, monthly: number, extra = {}): Obligation => ({ id, lender: "Example lender", monthly, balance: 10000, payoff: 10000, kind: "row", category: "term_loan", is_mca: false, in_debt_service: true, count_in_dscr: true, linked_payee_key: null, linked_payee: null, observed_monthly: null, cadence: "monthly", source: "debt_schedule", origin: "staff", ...extra });
const months = [{ month: "2026-01", label: "Jan", deposits: 30000, withdrawals: 28000, net: 2000, ending_balance: 3000, low_balance: -100 }] as CockpitMonth[];
const plan = (retire: string[]): FinancialPlanWrite => ({ retire, exclude: [], add_backs: [], overrides: null, new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null, note: null });
function cockpit(loans: Obligation[]): FinancialCockpit {
  return { debt: { obligations: loans, service: { monthly: 10000 } }, bank: { recurring: { payees: [{ key: "shared", monthly: { "2026-01": 9000 }, monthly_average: 9000, months: ["2026-01"] }], months_read: ["2026-01"] } }, plan: { evaluation: {} }, dscr: { headline: { key: "profit_and_loss", value: 1 }, candidates: [{ key: "profit_and_loss", numerator: 120000, label: "P&L", value: 1 }] } } as unknown as FinancialCockpit;
}

describe("loan-level bank replay evidence", () => {
  it.each([{ selected: ["first"] }, { selected: ["first", "second"] }])("does not assign an aggregate statement debit to selected loans $selected", ({ selected }) => {
    const source = cockpit([loan("first", 5000, { replay_requires_review: true, candidate_payee_keys: ["shared"], replay_review_reason: PAYOFF_REPLAY_REVIEW_REQUIRED }), loan("second", 3000, { replay_requires_review: true, candidate_payee_keys: ["shared"] }), loan("other", 2000)]);
    const result = evaluatePlanLocally(source, plan(selected), months);
    const removed = selected.length === 1 ? 5000 : 8000;
    expect(result.retiredMonthly).toBe(removed);
    expect(result.serviceAfter).toBe(10000 - removed);
    expect(result.headlineAfter).toBe(selected.length === 1 ? 2 : 5);
    expect(result).toMatchObject({ retirementReplayUnknown: true, replayProjectionAvailable: false, replayUnavailableReason: PAYOFF_REPLAY_REVIEW_REQUIRED, replayReviewRequiredIds: selected, cashKept: null, netAfterAverage: null, endingAfterLast: null, monthsDippingNegativeAfter: null });
    expect(result.rows[0]).toMatchObject({ net: 2000, ending: 3000, lowest: -100, withdrawalsAfter: null, netAfter: null, endingAfter: null, lowestAfter: null, removed: null, added: null, cumulative: null });
  });
  it("also guards a stale response where two loans share the same explicit aggregate key", () => {
    const source = cockpit([loan("first", 5000, { linked_payee_key: "shared" }), loan("second", 3000, { linked_payee_key: "shared" })]);
    expect(evaluatePlanLocally(source, plan(["first"]), months)).toMatchObject({ retirementReplayUnknown: true, replayProjectionAvailable: false, serviceAfter: 5000, cashKept: null });
  });
  it("does not guess ambiguity from a lender name when distinct loans have unique evidence", () => {
    const source = cockpit([loan("first", 5000, { linked_payee_key: "first-evidence" }), loan("second", 3000, { linked_payee_key: "second-evidence" })]);
    source.bank.recurring.payees = [{ key: "first-evidence", monthly: { "2026-01": 5100 } }, { key: "second-evidence", monthly: { "2026-01": 3100 } }] as unknown as FinancialCockpit["bank"]["recurring"]["payees"];
    const result = evaluatePlanLocally(source, plan(["first"]), months);
    expect(result).toMatchObject({ retirementReplayUnknown: false, replayProjectionAvailable: true, replayUnavailableReason: null, cashKept: 5100, netAfterAverage: 7100, serviceAfter: 5000 });
  });
  it("leaves bank figures unchanged with no ambiguous payoff selected and resumes after deselection", () => {
    const source = cockpit([loan("first", 5000, { replay_requires_review: true })]);
    evaluatePlanLocally(source, plan(["first"]), months);
    expect(evaluatePlanLocally(source, plan([]), months)).toMatchObject({ retirementReplayUnknown: false, replayProjectionAvailable: true, cashKept: 0, netAfterAverage: 2000, serviceAfter: 10000 });
  });
});
