import type { ApplicationRequirement } from "./applicationProfile";

export type RequirementCreditOwner = { owner_id: string; credit_pull_id: string | null; status: "collected" | "missing" | "processing" | "stale" | "needs_review"; reason: string | null; report_available: boolean; report_import_status: string | null; pulled_at: string | null; expires_at: string | null; score: number | null; score_verified?: boolean; fico_source?: string | null; score_models: Array<{ model: string; score: number | null; bureau?: string | null }>; required_score_model: string | null; required_score_model_present: boolean; backfill_needs_review: boolean };
export type RequirementCreditDecision = "met" | "incomplete" | "failed";
export type RequirementCreditCollection = {
  source: "linked_owner_credit_pulls"; complete: boolean; required_owner_count: number; collected_owner_count: number;
  ownership_complete: boolean; owner_review_required: boolean; client_action_required: boolean; staff_review_reasons: string[];
  owners: RequirementCreditOwner[];
  review_fingerprint?: string;
  can_mark_met?: boolean;
  review_blockers?: string[];
  required_score_model?: string | null;
  required_minimum_score?: number | null;
  last_review?: { decision: RequirementCreditDecision; reason: string; reviewed_at: string; current: boolean } | null;
};

export function requirementCreditScoreWords(source: RequirementCreditOwner) {
  if (source.fico_source === "intelligence-proxy") return "Bureau score unavailable · provider identity check only";
  if (source.score_models?.length) return source.score_models.map((model) => `${model.bureau && !model.model.toLowerCase().includes(model.bureau.toLowerCase()) ? `${model.bureau} · ` : ""}${model.model}: ${model.score ?? "not supplied"}`).join(" · ");
  return source.score != null ? `Linked score ${source.score} · model not established` : "Score/model details not established";
}

export function creditReviewLabel(decision: RequirementCreditDecision) { return decision === "met" ? "Requirement met" : decision === "failed" ? "Requirement not met" : "More evidence needed"; }

/** Linked-source collection and program eligibility are separate backend decisions. */
export function requirementCreditCollection(requirement: Pick<ApplicationRequirement, "provenance">): RequirementCreditCollection | null {
  const value = requirement.provenance?.credit_collection;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<RequirementCreditCollection>;
  if (item.source !== "linked_owner_credit_pulls" || !Array.isArray(item.owners) || !Number.isInteger(item.required_owner_count) || (item.required_owner_count ?? -1) < 0 || !Number.isInteger(item.collected_owner_count) || (item.collected_owner_count ?? -1) < 0) return null;
  return item as RequirementCreditCollection;
}

/** Collected reports awaiting underwriting are not another request to the client. */
export function requirementAllowsClientRequest(requirement: Pick<ApplicationRequirement, "provenance">): boolean {
  const value = requirement.provenance?.credit_collection;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const credit = value as Partial<RequirementCreditCollection>;
  return credit.source !== "linked_owner_credit_pulls" || credit.client_action_required !== false;
}
