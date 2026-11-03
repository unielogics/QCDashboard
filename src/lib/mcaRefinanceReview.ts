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

export type McaActiveAdvanceSummary = { text: string; tone: "ok" | "warn" | "bad" | "mut"; twoOrMore: boolean | null };

/**
 * How many merchant cash advances are active, as the desk should read it:
 * the borrower's declaration first, then what the documents or the chat
 * showed when that differs. Two or more is what an MCA refinance is for.
 */
export function mcaActiveAdvanceSummary(policy: McaRefinancePolicy | null | undefined): McaActiveAdvanceSummary | null {
  if (!policy) return null;
  const declared = typeof policy.declared_active_mca_count === "number" ? policy.declared_active_mca_count : null;
  const documented = typeof policy.documented_active_mca_count === "number" ? policy.documented_active_mca_count : null;
  const effective = typeof policy.active_mca_count === "number" ? policy.active_mca_count : null;
  if (declared === null && documented === null && effective === null) {
    return { text: "not declared yet", tone: "warn", twoOrMore: null };
  }
  const twoOrMore = typeof policy.two_or_more_active === "boolean" ? policy.two_or_more_active : effective !== null ? effective >= 2 : null;
  const parts: string[] = [];
  if (declared !== null) parts.push(`${declared} declared`);
  if (documented !== null && documented !== declared) parts.push(`${documented} on documents`);
  if (!parts.length && effective !== null) parts.push(`${effective} active`);
  const conflict = policy.active_mca_count_conflict === true || (declared !== null && documented !== null && declared !== documented);
  return {
    text: parts.join(" · ") + (conflict ? " — mismatch" : ""),
    tone: conflict ? "bad" : twoOrMore ? "ok" : "mut",
    twoOrMore,
  };
}

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
    activeAdvances: mcaActiveAdvanceSummary(policy),
    title: mode === "manual_review" ? "Manual MCA refinance review"
      : mode === "information_required" ? "MCA refinance details needed" : "MCA refinance screening",
    description: mode === "manual_review"
      ? "This application is accepted for manual desk review. Automatic underwriting is disabled. The standard MCA refinance program is limited to $350,000, terms up to 10 years, and no more than 2 active MCAs."
      : mode === "information_required"
        ? "Confirm the active MCA count and refinance amount before automatic screening. Missing or conflicting qualification details require desk review; the application remains accepted."
        : "The file is within the standard MCA refinance screening limits. Screening is not approval or a commitment to a 10-year term.",
  };
}
