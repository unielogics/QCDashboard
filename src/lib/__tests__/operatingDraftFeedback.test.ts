import { describe, expect, it } from "vitest";
import type { OperatingEvaluation, OperatingPlanBody } from "../operatingPlan";
import { operatingFeedbackLabel, operatingNumericProblems, operatingPlanContentKey, operatingWorkingFeedback, type OperatingDraftFeedback } from "../operatingPlanFeedback";

const body: OperatingPlanBody = { currency: "USD", expenses: [{ id: "rent", label: "Rent", current_amount: "1,000", cadence: "monthly" }], adjustments: [{ id: "change", kind: "expense_reduction", expense_row_id: "rent", command: { target: "total_cost", mode: "percent", direction: "decrease", value: "10.0" } }] };
function evaluation(patch: Partial<OperatingDraftFeedback["summary"]> = {}): OperatingEvaluation {
  return { draft_feedback: { basis: "before_implementation_costs_and_timing", actions: [], summary: { status: "calculated", complete: true, currency: "USD", noi_currency: "USD", source_comparable: true, current_noi: -15000, known_gross_annual_subtotal: 1200, gross_annual_delta: 1200, gross_monthly_run_rate_delta: 100, draft_noi: -13800, draft_noi_delta: 1200, draft_gap: 31800, qualified_noi_delta: null, qualified_first_year_noi_delta: null, dscr_current_debt_before: -1.25, dscr_current_debt_after: -1.15, dscr_current_debt_delta: 0.1, missing: [], ...patch } }, baseline: { noi: -15000, currency: "USD", noi_currency: "USD" }, projection: { proposed: { noi: -888 }, approved: { noi: null } }, goal_progress: { proposed_gap: 20000 } } as unknown as OperatingEvaluation;
}

describe("operating draft comparison keys", () => {
  it("normalizes formatted numeric input and ACK defaults without mutating the input", () => {
    const original = JSON.stringify(body);
    const ack: OperatingPlanBody = { ...body, no_operating_expenses_confirmed: false, client_attestation: false, expenses: [{ ...body.expenses![0], current_amount: 1000, cost_basis: "total", essential: true, excluded: false, notes: "", source_file_ids: [] }], adjustments: [{ ...body.adjustments![0], command: { ...body.adjustments![0].command!, value: 10 }, price_basis: "per_unit", unit_change_mode: "absolute", cost_basis: "total", implementation_cost_cadence: "one_time", current_processing_rate_basis: "unknown", proposed_processing_rate_basis: "unknown", baseline_treatment: "unreconciled", status: "proposed", excluded: false, source_file_ids: [], implementation_cost: null }] };
    expect(operatingPlanContentKey(ack)).toBe(operatingPlanContentKey(body));
    expect(JSON.stringify(body)).toBe(original);
  });
  it("keeps explicit zero, changed intent, sources, review and row order significant", () => {
    const key = operatingPlanContentKey(body), action = body.adjustments![0];
    for (const patch of [{ command: { ...action.command!, value: 0 } }, { command: { ...action.command!, direction: "increase" as const } }, { command: { ...action.command!, mode: "amount" as const } }, { implementation_cost_cadence: "monthly" as const }, { source_file_ids: ["source-a"] }, { status: "approved" as const }]) expect(operatingPlanContentKey({ ...body, adjustments: [{ ...action, ...patch }] })).not.toBe(key);
    expect(operatingPlanContentKey({ expenses: [{ id: "a" }, { id: "b" }] })).not.toBe(operatingPlanContentKey({ expenses: [{ id: "b" }, { id: "a" }] }));
    expect(operatingPlanContentKey({ expenses: [{ id: "a", current_amount: 0 }] })).not.toBe(operatingPlanContentKey({ expenses: [{ id: "a", current_amount: null }] }));
  });
  it("retains invalid input paths but accepts zero and unknown draft cells", () => {
    const invalid = operatingNumericProblems({ expenses: [{ id: "rent", current_amount: "-" }, { id: "old", current_amount: "bad", excluded: true }, { id: "duplicate", current_amount: "bad", duplicate_of: "rent" }, { id: "zero", current_amount: 0 }, { id: "blank", current_amount: "" }], adjustments: [{ id: "price", command: { target: "unit_price", mode: "amount", direction: "increase", value: "1e" } }], released_cash_flow: { source_fingerprint: null, allocations: [{ id: "reserve", label: "Reserve", amount_monthly: ".", notes: "" }] } });
    expect(invalid).toEqual(["expenses.rent.current_amount", "adjustments.price.command.value", "released_cash_flow.allocations.reserve.amount_monthly"]);
  });
});

describe("canonical working-plan selection", () => {
  it("has no fabricated result before evaluation exists", () => expect(operatingWorkingFeedback(null)).toBeNull());
  it("uses the server draft before setup when qualification details are missing", () => {
    expect(operatingWorkingFeedback(evaluation())).toMatchObject({ basis: "draft", current: -15000, after: -13800, delta: 1200, gap: 31800, firstYearDelta: null, dscrAfter: -1.15, dscrDelta: 0.1 });
  });
  it("uses qualified server NOI, deltas and matched qualified debt ratios", () => {
    const value = evaluation({ qualified_noi_delta: 1056, qualified_first_year_noi_delta: 532.34, qualified_dscr_current_debt_after: -0.7453, qualified_dscr_current_debt_delta: 0.088, qualified_first_year_dscr_current_debt_after: -0.789, qualified_first_year_dscr_current_debt_delta: 0.0444 });
    value.projection.proposed.noi = -13944;
    expect(operatingWorkingFeedback(value)).toMatchObject({ basis: "qualified", after: -13944, delta: 1056, gap: 20000, firstYearDelta: 532.34, dscrAfter: -0.7453, dscrDelta: 0.088, firstYearDscrAfter: -0.789, firstYearDscrDelta: 0.0444 });
  });
  it.each(["source_blocked", "incomplete"] as const)("never lets legacy projections bypass %s feedback", status => {
    const result = operatingWorkingFeedback(evaluation({ status, complete: status === "source_blocked", source_comparable: status !== "source_blocked", qualified_noi_delta: 1056, known_gross_annual_subtotal: 1200, dscr_current_debt_after: null, dscr_current_debt_delta: null }));
    expect(result).toMatchObject({ after: null, delta: null, gap: null, firstYearDelta: null, dscrAfter: null, dscrDelta: null, knownSubtotal: 1200 });
  });
  it("preserves explicitly unknown source NOI and currency instead of borrowing stale baseline values", () => {
    expect(operatingWorkingFeedback(evaluation({ current_noi: null, noi_currency: null, currency: "CAD", draft_noi: null, draft_noi_delta: null, draft_gap: null }))).toMatchObject({ current: null, currency: null, mathCurrency: "CAD", after: null, delta: null });
  });
  it("preserves explicit qualified ratio unknowns instead of using a gross ratio", () => {
    expect(operatingWorkingFeedback(evaluation({ qualified_noi_delta: 1056, qualified_dscr_current_debt_after: null, qualified_dscr_current_debt_delta: null }))).toMatchObject({ dscrAfter: null, dscrDelta: null, firstYearDscrAfter: null, firstYearDscrDelta: null });
  });
  it("shows an authoritative earnings-based debt ratio independently of unavailable NOI", () => {
    const value = evaluation({ status: "source_blocked", source_comparable: false, noi_currency: null, draft_noi: null, draft_noi_delta: null, draft_gap: null, dscr_current_debt_after: -0.7733, dscr_current_debt_delta: 0.06 });
    expect(operatingWorkingFeedback(value)).toMatchObject({ after: null, delta: null, gap: null, dscrAfter: -0.7733, dscrDelta: 0.06, dscrBasis: "draft" });
    expect(operatingWorkingFeedback({ ...value, draft_feedback: { ...value.draft_feedback!, summary: { ...value.draft_feedback!.summary, qualified_dscr_current_debt_after: -0.78, qualified_dscr_current_debt_delta: 0.0533 } } })).toMatchObject({ after: null, delta: null, dscrAfter: -0.78, dscrDelta: 0.0533, dscrBasis: "qualified" });
  });
  it("keeps a known zero change distinct from an unknown amount", () => {
    expect(operatingWorkingFeedback(evaluation({ status: "no_changes", gross_annual_delta: 0, draft_noi: -15000, draft_noi_delta: 0, draft_gap: 33000 }))).toMatchObject({ basis: "unchanged", after: -15000, delta: 0, gap: 33000 });
  });
  it("translates correction paths into concise field actions", () => {
    expect(operatingFeedbackLabel("adjustments.price.implementation_cost")).toBe("Enter setup cost");
    expect(operatingFeedbackLabel("adjustments.price.effective_date")).toBe("Set start date");
    expect(operatingFeedbackLabel("adjustments.price.command.value")).toBe("Enter the planned change");
    expect(operatingFeedbackLabel("source_comparable")).toBe("Review source");
  });
});
