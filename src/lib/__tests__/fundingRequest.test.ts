import { describe, expect, it, vi } from "vitest";
import { Role } from "../enums.generated";
import { canCorrectFundingRequest, fundingRequestApi, fundingRequestDraft, fundingRequestPreview, fundingRequestSave, type FundingRequest } from "../fundingRequest";

const current: FundingRequest = {
  profile_id: "existing-profile", requested_amount: "70000.00", requested_amount_source: "original_submission", original_requested_amount: "70000.00",
  revision: 0, use_of_funds_revision: 4, complete: true, can_edit: true,
  items: [{ id: "same-use", category: "working_capital", amount: "70000.00", label: "Operating expenses" }],
  reason: null, updated_at: null, updated_by_user_id: null, payoff_only_alternative: false,
};
const draft = () => ({ ...fundingRequestDraft(current), requestedAmount: "200000.00", rows: [
  { id: "payoff", category: "debt_refinance" as const, label: "Reviewed payoff allocation", amount: "150000.00" },
  { id: "remainder", category: "working_capital" as const, label: "", amount: "50000.00" },
], reason: "Client revised the request and its planned uses.", payoffOnlyAlternative: true });

describe("current funding request correction", () => {
  it("requires both the underwriting role and the server edit permission", () => {
    for (const role of [Role.SUPER_ADMIN, Role.LOAN_EXEC]) expect(canCorrectFundingRequest(role, current)).toBe(true);
    for (const role of Object.values(Role).filter((value) => value !== Role.SUPER_ADMIN && value !== Role.LOAN_EXEC)) expect(canCorrectFundingRequest(role, current)).toBe(false);
    expect(canCorrectFundingRequest(Role.SUPER_ADMIN, { can_edit: false })).toBe(false);
    expect(canCorrectFundingRequest(undefined, current)).toBe(false);
    expect(canCorrectFundingRequest(Role.LOAN_EXEC, null)).toBe(false);
  });
  it("starts with current saved uses without mutating the original submission", () => {
    const edit = fundingRequestDraft(current);
    edit.rows[0].amount = "2";
    expect(current.items[0].amount).toBe("70000.00");
    expect(edit.reason).toBe("");
  });
  it("requires exact full allocation, including a single cent difference", () => {
    expect(fundingRequestPreview(draft()).valid).toBe(true);
    for (const value of ["49999.99", "50000.01"]) {
      const edit = draft(); edit.rows[1].amount = value;
      expect(fundingRequestPreview(edit).valid).toBe(false);
      expect(() => fundingRequestSave(current, edit, "retry-key")).toThrow(/balanced/);
    }
  });
  it("rejects unsafe money, missing uses, and a missing explanation", () => {
    for (const amount of ["0", "-1", "NaN", "Infinity", "1e5", "200000.001", "1,000", "1000000000000"]) expect(fundingRequestPreview({ ...draft(), requestedAmount: amount }).valid).toBe(false);
    expect(fundingRequestPreview({ ...draft(), rows: [] }).valid).toBe(false);
    expect(fundingRequestPreview({ ...draft(), reason: "short" }).errors.reason).toBeTruthy();
    expect(fundingRequestPreview({ ...draft(), reason: "x".repeat(2001) }).errors.reason).toBeTruthy();
    const edit = draft(); edit.rows[1].id = edit.rows[0].id;
    expect(fundingRequestPreview(edit).valid).toBe(false);
  });
  it("keeps the payoff-only alternative out of the primary amount and preserves concurrency and retry identity", () => {
    const edit = draft();
    const payload = fundingRequestSave(current, edit, "same-retry-key");
    expect(payload).toMatchObject({ requested_amount: "200000.00", expected_revision: 0, expected_use_of_funds_revision: 4, idempotency_key: "same-retry-key", payoff_only_alternative: true });
    expect(payload.items).toHaveLength(2);
    expect(payload.items[1].label).toBe("Working capital");
    expect(payload).not.toHaveProperty("approved_amount");
    expect(payload).not.toHaveProperty("accepted_amount");
    expect(payload).not.toHaveProperty("original_requested_amount");
    expect(fundingRequestSave(current, edit, "same-retry-key")).toEqual(payload);
  });
  it("loads and patches the existing profile without creating an application or sending a message", async () => {
    const call = vi.fn().mockResolvedValue(current);
    const service = fundingRequestApi(call, current.profile_id);
    await service.load();
    const payload = fundingRequestSave(current, draft(), "same-key");
    await service.save(payload);
    expect(call.mock.calls).toEqual([
      ["/application-profiles/existing-profile/funding-request"],
      ["/application-profiles/existing-profile/funding-request", { method: "PATCH", body: JSON.stringify(payload) }],
    ]);
  });
});
