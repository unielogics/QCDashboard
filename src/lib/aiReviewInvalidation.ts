import type { QueryKey } from "@tanstack/react-query";

// A completed review can update more than the file breakdown: it can create
// extracted facts, reconcile evidence/readiness, and change derived profile
// intelligence. Invalidate by key prefix so every mounted view of the same
// application refreshes, even when the provider does not yet know its profile ID.
const AI_REVIEW_DERIVED_QUERY_ROOTS = [
  "operator-files",
  "operator-file",
  "application-profile",
  "application-profile-audit",
  "application-evidence-workspace",
  "application-extracted-facts",
  "application-draft-status",
  "application-intelligence",
  "application-profile-owners",
  "application-profile-verification",
  "application-profile-banks",
] as const;

export function aiReviewInvalidationKeys(intakeId: string): QueryKey[] {
  return [
    ...AI_REVIEW_DERIVED_QUERY_ROOTS.map((root) => [root] as const),
    ["lead-credit-status", intakeId],
    ["lead-program-fit", intakeId],
    ["lead-dscr-potential", intakeId],
  ];
}
