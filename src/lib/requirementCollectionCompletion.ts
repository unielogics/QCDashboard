import type { ApplicationProgramReadiness, ApplicationRequirement } from "./applicationProfile";
import type { AuthedApi } from "./worksheetApi";

export type CollectionCompletion = NonNullable<ApplicationRequirement["collection_completion"]>;
export type CollectionCompletionDraft = { profileId: string; requirementKey: string; fingerprint: string; fileIds: string[]; idempotencyKey: string };
export type QualificationReview = { status: "pending" | "met" | "failed" | "not_required"; blocking: boolean; reasons: string[]; checks: NonNullable<ApplicationRequirement["review_checks"]> };

export function requirementQualification(requirement: Pick<ApplicationRequirement, "provenance" | "qualification_review">): QualificationReview | null {
  const value = requirement.qualification_review ?? requirement.provenance.qualification_review;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const review = value as Partial<QualificationReview>;
  if (!["pending", "met", "failed", "not_required"].includes(review.status || "") || !Array.isArray(review.reasons) || !Array.isArray(review.checks)) return null;
  return review as QualificationReview;
}

export function collectionCompletionDraft(profileId: string, requirement: ApplicationRequirement): CollectionCompletionDraft {
  const collection = requirement.collection_completion;
  if (!collection) throw new Error("Refresh the current checklist before completing this item.");
  return { profileId, requirementKey: requirement.requirement_key, fingerprint: collection.fingerprint, fileIds: [...collection.suggested_file_ids], idempotencyKey: crypto.randomUUID() };
}

export function collectionCompletionWrite(profileId: string, requirement: ApplicationRequirement, draft: CollectionCompletionDraft) {
  const collection = requirement.collection_completion;
  if (profileId !== draft.profileId || requirement.requirement_key !== draft.requirementKey) throw new Error("Reopen this review on the current application.");
  if (!collection || !collection.can_complete || collection.complete) throw new Error(collection?.reason || "This collection item cannot be completed from the current evidence.");
  if (collection.fingerprint !== draft.fingerprint) throw new Error("Evidence changed. Reload before completing this item.");
  if (new Set(draft.fileIds).size !== draft.fileIds.length || draft.fileIds.some((id) => !collection.eligible_file_ids.includes(id))) throw new Error("Choose current evidence linked to this requirement.");
  if (collection.source === "files" && !draft.fileIds.length) throw new Error("Choose at least one current evidence file.");
  return { file_ids: draft.fileIds, reason: "Reviewed the linked evidence for this checklist item", expected_fingerprint: draft.fingerprint, idempotency_key: draft.idempotencyKey };
}

export function completeRequirementCollection(api: AuthedApi, profileId: string, requirement: ApplicationRequirement, draft: CollectionCompletionDraft) {
  return api<ApplicationProgramReadiness>(`/application-profiles/${encodeURIComponent(profileId)}/requirements/${encodeURIComponent(requirement.requirement_key)}/collection-completion`, { method: "POST", body: JSON.stringify(collectionCompletionWrite(profileId, requirement, draft)) });
}
