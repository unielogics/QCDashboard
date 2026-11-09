import { describe, expect, it, vi } from "vitest";
import type { ApplicationRequirement } from "../applicationProfile";
import { collectionCompletionDraft, collectionCompletionWrite, completeRequirementCollection, requirementQualification } from "../requirementCollectionCompletion";

const requirement = { requirement_key: "business_tax_returns", provenance: {}, collection_completion: { complete: false, can_complete: true, fingerprint: "a".repeat(64), source: "files", reason: null, eligible_file_ids: ["business-2025"], suggested_file_ids: ["business-2025"] } } as ApplicationRequirement;

describe("document collection completion", () => {
  it("completes the current selected evidence without asserting earnings or score conditions", () => {
    const draft = collectionCompletionDraft("profile", requirement);
    const payload = collectionCompletionWrite("profile", requirement, draft);
    expect(payload.file_ids).toEqual(["business-2025"]);
    expect(payload.reason).toBe("Reviewed the linked evidence for this checklist item");
    expect(payload.expected_fingerprint).toBe(requirement.collection_completion?.fingerprint);
    expect(payload).not.toHaveProperty("verified_checks");
    expect(payload).not.toHaveProperty("credit_score");
  });
  it("does not allow another profile, changed evidence, personal files or an empty file selection", () => {
    const draft = collectionCompletionDraft("profile", requirement);
    expect(() => collectionCompletionWrite("other", requirement, draft)).toThrow("current application");
    expect(() => collectionCompletionWrite("profile", { ...requirement, collection_completion: { ...requirement.collection_completion!, fingerprint: "b".repeat(64) } }, draft)).toThrow("Evidence changed");
    expect(() => collectionCompletionWrite("profile", requirement, { ...draft, fileIds: ["personal-2025"] })).toThrow("current evidence");
    expect(() => collectionCompletionWrite("profile", requirement, { ...draft, fileIds: [] })).toThrow("at least one");
    expect(() => collectionCompletionWrite("profile", { ...requirement, collection_completion: { ...requirement.collection_completion!, can_complete: false, reason: "A current business return is needed" } }, draft)).toThrow("current business return");
  });
  it("keeps the same idempotency receipt across failed-save retries", async () => {
    const draft = collectionCompletionDraft("profile", requirement);
    const api = vi.fn().mockRejectedValueOnce(new Error("storage failed")).mockResolvedValueOnce({ requirements: [] });
    await expect(completeRequirementCollection(api, "profile", requirement, draft)).rejects.toThrow("storage failed");
    await completeRequirementCollection(api, "profile", requirement, draft);
    expect(api.mock.calls[0]).toEqual(api.mock.calls[1]);
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile/requirements/business_tax_returns/collection-completion");
  });
  it("preserves a separate program failure when collection is complete", () => {
    const qualification = { status: "failed", blocking: true, reasons: ["The filed business return has negative earnings"], checks: [{ key: "positive_ebitda", label: "Positive EBITDA", severity: "block", instructions: "Check the business return" }] };
    expect(requirementQualification({ provenance: { qualification_review: qualification } })).toEqual(qualification);
    expect(requirementQualification({ provenance: { qualification_review: { status: "qualified" } } })).toBeNull();
  });
});
