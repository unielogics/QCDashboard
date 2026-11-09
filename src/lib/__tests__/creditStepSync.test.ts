import { describe, expect, it } from "vitest";
import type { ApplicationProgramReadiness, ApplicationRequirement, FileOwner, FileOwnerRequirementState } from "../applicationProfile";
import { creditRequirementReceipts, creditStepCollection, creditStepProgress, ownerReportCollection, ownerStepReportCollection } from "../creditStepSync";
import type { RequirementCreditCollection } from "../requirementCredit";

const owner = { id: "owner-a", credit_required: true, credit_complete: true, credit_pull_id: "pull-a", credit_report_available: true, credit_report_import_status: "completed", credit_collection_status: "collected", credit_score: 661, credit_score_verified: true } as FileOwner;
const collected: RequirementCreditCollection = { source: "linked_owner_credit_pulls", complete: true, required_owner_count: 1, collected_owner_count: 1, ownership_complete: true, owner_review_required: true, client_action_required: false, staff_review_reasons: [], owners: [{ owner_id: "owner-a", credit_pull_id: "pull-a", status: "collected", reason: null, report_available: true, report_import_status: "completed", pulled_at: null, expires_at: null, score: 661, score_models: [{ model: "FICO 4", score: 661 }], required_score_model: "Equifax FICO 9", required_score_model_present: false, backfill_needs_review: false }] };
const verification = { owner_count: 1, ready_for_step_2: true, owner_credit_complete: true } as FileOwnerRequirementState;
function readiness(credit = collected, status: ApplicationRequirement["status"] = "received_unverified", key = "soft_credit") {
  return { profile_id: "profile", selections: [{ program_key: "quidity", program_name: "Quidity term" }], requirements: [{ requirement_key: key, label: "Owner credit", status, source_program_keys: ["quidity"], program_overrides: {}, provenance: { credit_collection: credit } }] } as unknown as ApplicationProgramReadiness;
}

describe("shared Step 1 / Documents credit state", () => {
  it("shows the linked FICO 4 as received in both steps without passing the different program condition", () => {
    const data = readiness();
    expect(creditStepCollection([owner], creditRequirementReceipts(data))).toMatchObject({ required: 1, received: 1, complete: true });
    expect(creditStepProgress(verification, data)).toEqual({ status: "partial", sub: "Reports received · program review pending" });
  });
  it("finishes the visual step only when the actual requirement and ownership review are complete", () => {
    const met = readiness({ ...collected, can_mark_met: true, last_review: { decision: "met", reason: "Verified required source", reviewed_at: "2026-11-09", current: true } }, "verified");
    expect(creditStepProgress(verification, met).status).toBe("complete");
    expect(creditStepProgress({ ...verification, ready_for_step_2: false }, met).status).toBe("partial");
    expect(creditStepProgress(verification, readiness(collected, "failed")).status).toBe("partial");
  });
  it("uses the selected 30-day receipt even when the generic 90-day report remains current", () => {
    const stale = { ...collected, complete: false, collected_owner_count: 0, owners: [{ ...collected.owners[0], status: "stale" as const, reason: "Selected program requires a report from the last 30 days" }] };
    const receipts = creditRequirementReceipts(readiness(stale, "stale"));
    expect(ownerReportCollection(owner).status).toBe("collected");
    expect(ownerStepReportCollection(owner, receipts)).toMatchObject({ status: "stale", tone: "warn" });
    expect(creditStepCollection([owner], receipts)).toMatchObject({ received: 0, required: 1, complete: false, missingOwnerIds: [] });
    expect(creditStepProgress(verification, readiness(stale, "stale")).status).toBe("partial");
  });
  it("deduplicates owners across criteria and requires every applicable receipt to be collected", () => {
    const data = readiness();
    data.requirements.push({ ...data.requirements[0], requirement_key: "another_credit_condition" });
    const receipts = creditRequirementReceipts(data);
    expect(receipts).toHaveLength(2);
    expect(creditStepCollection([owner], receipts)).toMatchObject({ required: 1, received: 1 });
    receipts[1] = { ...receipts[1], credit: { ...collected, owners: [{ ...collected.owners[0], status: "processing" }] } };
    expect(creditStepCollection([owner], receipts)).toMatchObject({ received: 0, missingOwnerIds: [] });
  });
  it("does not count a removed owner or a different pull from stale receipt data", () => {
    const receipts = creditRequirementReceipts(readiness());
    expect(creditStepCollection([], receipts)).toMatchObject({ received: 0, complete: false });
    expect(creditStepCollection([{ ...owner, credit_pull_id: "new-pull" }], receipts)).toMatchObject({ received: 0, complete: false });
    expect(ownerStepReportCollection({ ...owner, credit_pull_id: "new-pull" }, receipts).status).toBe("needs_review");
  });
  it("requests authorization only for genuinely missing, unlinked owners", () => {
    const missing = { ...collected, complete: false, collected_owner_count: 0, owners: [{ ...collected.owners[0], credit_pull_id: null, status: "missing" as const }] };
    expect(creditStepCollection([{ ...owner, credit_pull_id: null }], creditRequirementReceipts(readiness(missing))).missingOwnerIds).toEqual(["owner-a"]);
    for (const status of ["processing", "stale", "needs_review", "collected"] as const) {
      const scope = readiness({ ...collected, owners: [{ ...collected.owners[0], status }] });
      expect(creditStepCollection([owner], creditRequirementReceipts(scope)).missingOwnerIds).toEqual([]);
    }
  });
  it("uses canonical source status instead of a cached verified score for uncovered owners", () => {
    const processing = { ...owner, credit_collection_status: "processing" as const, credit_score: 750 };
    expect(creditStepCollection([processing], [])).toMatchObject({ received: 0, complete: false });
    expect(ownerReportCollection(processing)).toMatchObject({ label: "Report processing", tone: "warn" });
  });
  it("keeps an unloaded review partial and removes duplicate requirement keys", () => {
    expect(creditStepProgress(verification, null).status).toBe("partial");
    const data = readiness(); data.requirements.push(data.requirements[0]);
    expect(creditRequirementReceipts(data)).toHaveLength(1);
  });
});
