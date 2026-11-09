import { describe, expect, it, vi } from "vitest";
import type { ApplicationRequirement } from "../applicationProfile";
import { isUseOfProceedsRequirement, prepareUseOfFundsLink, readUseOfFundsCollectionSummary, supportingUseOfFundsReviewIds } from "../requirementUseOfFunds";
import { collectionCompletionDraft, collectionCompletionWrite } from "../requirementCollectionCompletion";
import { triageRequirement } from "../evidenceTriage";

const requirement: ApplicationRequirement = {
  requirement_key: "policy_business_use", canonical_key: "use_of_proceeds", label: "Business use of proceeds", provenance: {},
  status: "received_unverified", verification_required: true, state_reason: null, evidence_files: [],
  category: "borrower_info", required_level: "required", requested_document_id: null, evidence_file_id: null, evidence_file_name: null,
  evidence_count: 0, verified_evidence_count: 0, coverage: {}, verified_coverage: {}, coverage_complete: false, verified_coverage_complete: false,
  allow_multiple_files: false, source_program_keys: [], source_policy_keys: [], program_overrides: {}, client_visible: true, can_waive: true,
  last_requested_at: null, received_at: null, verified_at: null,
  collection_completion: { source: "use_of_funds", complete: false, can_complete: true, fingerprint: "a".repeat(64),
    eligible_file_ids: [], suggested_file_ids: [], reason: null,
    summary: { allocated_amount: 75000, requested_amount: 75000, item_count: 2, complete: true, revision: 4, funding_request_revision: 2 } },
};

describe("use of proceeds requirement", () => {
  it("recognizes canonical aliases without redirecting an unrelated document by its label", () => {
    expect(isUseOfProceedsRequirement(requirement)).toBe(true);
    expect(isUseOfProceedsRequirement({ requirement_key: "use_of_proceeds" })).toBe(true);
    expect(isUseOfProceedsRequirement({ requirement_key: "supporting_costs", canonical_key: "equipment_quote" })).toBe(false);
  });
  it("prepares the exact budget room link without sending email or SMS", async () => {
    const url = "https://app.example.com/buckets/request/room-token?tab=budget";
    const api = vi.fn().mockResolvedValue({ room_url: url });
    expect(await prepareUseOfFundsLink(api, "profile")).toBe(url);
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile/room/reminders");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ purpose: "use_of_funds", email_room_link: false, sms_reminder: false });
  });
  it("rejects an unexpected destination rather than reporting the wrong link as ready", async () => {
    for (const url of ["javascript:alert(1)", "https://app.example.com/buckets/request/token?tab=todo", "https://app.example.com/sign-in", "missing-url"]) {
      await expect(prepareUseOfFundsLink(vi.fn().mockResolvedValue({ room_url: url }), "profile")).rejects.toThrow("link is unavailable");
    }
    await expect(prepareUseOfFundsLink(vi.fn().mockRejectedValue(new Error("No active application room")), "profile")).rejects.toThrow("No active application room");
  });
  it("shows the saved allocation and completes its current collection without invented files or qualification", () => {
    expect(readUseOfFundsCollectionSummary(requirement)).toMatchObject({ allocation: "$75,000 of $75,000 allocated", detail: "2 planned uses · Allocation balanced" });
    const payload = collectionCompletionWrite("profile", requirement, collectionCompletionDraft("profile", requirement));
    expect(payload.file_ids).toEqual([]);
    expect(payload.reason).toBe("Reviewed the saved itemized use-of-proceeds allocation");
    expect(payload).not.toHaveProperty("requested_amount");
    expect(payload).not.toHaveProperty("qualification_review");
    expect(triageRequirement(requirement)).toMatchObject({ group: "you", label: "Ready to complete", progress: null });
  });
  it("keeps partial allocations incomplete and stale reviews blocked", () => {
    const partial = { ...requirement, collection_completion: { ...requirement.collection_completion!, can_complete: false, reason: "Allocate the full requested amount", summary: { ...requirement.collection_completion!.summary!, complete: false, allocated_amount: 50000 } } };
    expect(triageRequirement(partial)).toMatchObject({ group: "you", label: "Complete allocation", progress: null });
    expect(() => collectionCompletionWrite("profile", partial, collectionCompletionDraft("profile", partial))).toThrow("Allocate the full requested amount");
    const changed = { ...requirement, collection_completion: { ...requirement.collection_completion!, fingerprint: "b".repeat(64) } };
    expect(() => collectionCompletionWrite("profile", changed, collectionCompletionDraft("profile", requirement))).toThrow("Evidence changed");
    const reviewed = { ...requirement, status: "verified" as const, collection_completion: { ...requirement.collection_completion!, complete: true } };
    expect(triageRequirement(reviewed)).toMatchObject({ group: "done", short: "Use of proceeds collection complete", progress: null });
  });
  it("directs an empty allocation to filling or sharing instead of uploading a first document", () => {
    const empty = { ...requirement, status: "missing" as const, collection_completion: { ...requirement.collection_completion!, can_complete: false, reason: "An itemized allocation is required.", summary: { ...requirement.collection_completion!.summary!, complete: false, item_count: 0, allocated_amount: 0 } } };
    const triage = triageRequirement(empty);
    expect(triage).toMatchObject({ group: "client", label: "Budget needed", progress: null });
    expect(triage.next).toContain("Fill in");
    expect(triage.next).toContain("share the secure link");
    expect(triage.next).not.toContain("upload");
  });
  it("preserves staff review for explicitly linked readable support while excluding failed, locked and already reviewed sources", () => {
    const base = { file_id: "pending", verified: false, is_password_protected: false, ai_decision: "needs_more" as const, ai_reason_code: "document_review_pending" };
    const sources = [base, { ...base, file_id: "accepted", ai_decision: "accepted" as const }, { ...base, file_id: "reviewed", verified: true }, { ...base, file_id: "locked", is_password_protected: true }, { ...base, file_id: "wrong-entity", ai_reason_code: "wrong_entity" }, { ...base, file_id: "failed", ai_decision: "failed" as const }];
    expect(supportingUseOfFundsReviewIds({ evidence_files: sources as ApplicationRequirement["evidence_files"] })).toEqual(["pending", "accepted"]);
    expect(supportingUseOfFundsReviewIds({ evidence_files: sources as ApplicationRequirement["evidence_files"], qualification_review: { status: "pending", blocking: true, reasons: ["Review against the changed allocation"], checks: [] } })).toEqual(["pending", "accepted", "reviewed"]);
  });
});
