import { describe, expect, it, vi } from "vitest";
import { applyDebtIntake, canDraftDebtIntake, debtIntakeIsEmpty, debtIntakeObservedWithdrawals, debtIntakeValue, hasPendingDebtIntakeReview, proposeDebtIntake, type DebtIntakeReview } from "../financialDebtIntake";
import type { FinancialWorkspaceSnapshot } from "../financialWorkspaceApi";

const workspace = (extra: Partial<FinancialWorkspaceSnapshot> = {}) => ({ family_id: "family", body: { debts: [] }, draft: { revision: 4 }, completion: { complete: false }, accepted_completion: null, ...extra } as FinancialWorkspaceSnapshot);
describe("debt schedule intake", () => {
  it("respects explicit no debt and both completed publication and completed human drafts", () => {
    expect(canDraftDebtIntake(workspace({ body: { no_debt: true, debts: [] } }))).toBe(false);
    expect(canDraftDebtIntake(workspace({ completion: { complete: true } as never }))).toBe(false);
    expect(canDraftDebtIntake(workspace({ accepted_completion: { complete: true } as never }))).toBe(false);
    expect(canDraftDebtIntake(workspace())).toBe(true);
  });
  it("treats blank placeholders as empty but preserves incomplete lender-only obligations", () => {
    expect(debtIntakeIsEmpty(workspace({ body: { debts: [{ id: "blank", status: "active" }] } }))).toBe(true);
    expect(debtIntakeIsEmpty(workspace({ body: { debts: [{ id: "lender", lender: "Lender", status: "active" }] } }))).toBe(false);
  });
  it("keeps an AI-complete draft available for review until saved, without re-enabling bulk drafting", () => {
    const ai = workspace({ body: { debt_intake_review: { status: "pending_review" } }, completion: { complete: true } as never, draft: { revision: 1, dirty: true } as never });
    expect(canDraftDebtIntake(ai)).toBe(false);
    expect(hasPendingDebtIntakeReview(ai)).toBe(true);
    expect(hasPendingDebtIntakeReview({ ...ai, accepted_completion: { complete: true } as never, draft: { ...ai.draft, dirty: false } })).toBe(false);
    expect(hasPendingDebtIntakeReview({ ...ai, body: { ...ai.body, no_debt: true } })).toBe(false);
    expect(debtIntakeValue(0)).toBe("0");
    expect(debtIntakeValue("")).toBe("needed");
  });
  it("previews evidence and applies only selected IDs with revision checks and a stable retry key", async () => {
    const api = vi.fn().mockResolvedValue({});
    await proposeDebtIntake(api, "profile", workspace(), "documents");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ mode: "documents", expected_revision: 4, family_id: "family" });
    const review = { family_id: "family", revision: 4, mode: "documents" } as DebtIntakeReview;
    await applyDebtIntake(api, "profile", review, ["reviewed-one"], "same-attempt");
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({ family_id: "family", mode: "documents", expected_revision: 4, selected_ids: ["reviewed-one"], idempotency_key: "same-attempt" });
    expect(api.mock.calls.every(([path]) => !path.includes("versions"))).toBe(true);
  });
  it("shows statement observations separately without inventing contractual payments", () => {
    const body = { id: "observation", monthly_payment: undefined, evidence: { observed_monthly_average: 1200.5 } };
    expect(debtIntakeObservedWithdrawals(body)).toBe(1200.5);
    expect(body.monthly_payment).toBeUndefined();
    expect(debtIntakeObservedWithdrawals({ ...body, evidence: { observed_monthly_average: 0 } })).toBe(0);
    expect(debtIntakeObservedWithdrawals({ ...body, evidence: { observed_monthly_average: "0" } })).toBe(0);
    for (const value of [null, undefined, "", "unknown", false, Infinity]) expect(debtIntakeObservedWithdrawals({ ...body, evidence: { observed_monthly_average: value } })).toBeNull();
    expect(debtIntakeObservedWithdrawals({ id: "contract", monthly_payment: "500" })).toBeNull();
  });
});
