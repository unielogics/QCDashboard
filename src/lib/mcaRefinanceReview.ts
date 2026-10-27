import { mcaRefinanceReviewMode, type McaRefinancePolicy } from "./mcaRefinancePolicy";

export type McaRefinanceReviewResponse = {
  mca_refinance_policy?: McaRefinancePolicy | null;
  intake?: {
    variant?: string | null;
    funding_intent?: string | null;
    mca_refinance_policy?: McaRefinancePolicy | null;
    intake_state?: Record<string, unknown> | null;
  };
};

/** The current server policy takes precedence over any older AI result. */
export function mcaRefinanceReviewState(response: McaRefinanceReviewResponse | null | undefined) {
  if (!response) return null;
  const saved = response.intake?.intake_state?.mca_refinance_policy;
  const policy = response.mca_refinance_policy
    ?? response.intake?.mca_refinance_policy
    ?? (saved && typeof saved === "object" && !Array.isArray(saved) ? saved as McaRefinancePolicy : null);
  const variant = response.intake?.variant;
  const intent = response.intake?.funding_intent ?? response.intake?.intake_state?.funding_intent;
  if (!policy && !["mca_refi_v1", "mca_refinance", "mca_refi"].includes(variant ?? "") && intent !== "mca_refinance") return null;
  const mode = mcaRefinanceReviewMode(policy);
  return {
    mode,
    policy,
    title: mode === "manual_review" ? "Manual MCA refinance review"
      : mode === "information_required" ? "MCA refinance details needed" : "MCA refinance screening",
    description: mode === "manual_review"
      ? "This application is accepted for manual desk review. Automatic underwriting is disabled. The standard MCA refinance program is limited to $350,000, terms up to 10 years, and no more than 2 active MCAs."
      : mode === "information_required"
        ? "Confirm the active MCA count and refinance amount before automatic screening. Missing or conflicting qualification details require desk review; the application remains accepted."
        : "The file is within the standard MCA refinance screening limits. Screening is not approval or a commitment to a 10-year term.",
  };
}
