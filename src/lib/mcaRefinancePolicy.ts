/** The server owns underwriting routing. This client guard fails closed while
 * an older response or incomplete declaration is still on screen. */
export type McaRefinancePolicy = {
  review_mode: "automated_review" | "manual_review" | "information_required";
  auto_underwriting_allowed: boolean;
  reason_codes: string[];
  active_mca_count: number | null;
  requested_amount: number | null;
  requested_term_months?: number | null;
  max_amount: number;
  max_term_months: number;
  max_active_mcas: number;
  manual_review_requested?: boolean;
};

export const MCA_REFINANCE_LIMITS = { amount: 350_000, termMonths: 120, activeCount: 2, declarationCount: 50 } as const;

export function parseMcaRefinanceCount(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number(input);
  return Number.isInteger(value) && value >= 0 && value <= MCA_REFINANCE_LIMITS.declarationCount ? value : null;
}

export function parseMcaRefinanceAmount(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number(input.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseMcaRefinanceQualification(countInput: string, amountInput: string) {
  const active_mca_count = parseMcaRefinanceCount(countInput);
  const requested_amount = parseMcaRefinanceAmount(amountInput);
  if (active_mca_count === null || requested_amount === null) return null;
  return { active_mca_count, requested_amount };
}

export function mcaRefinanceReviewMode(policy: McaRefinancePolicy | null | undefined, manualPreference = false): McaRefinancePolicy["review_mode"] {
  // A manual-route arrival must not reuse an older eligible session while its
  // preference is being saved. Only the server can confirm the manual route.
  if (manualPreference && policy?.review_mode !== "manual_review") return "information_required";
  if (!policy) return "information_required";
  const count = policy.active_mca_count;
  const amount = policy.requested_amount;
  // A stale auto-review flag must never override the program boundaries.
  if ((typeof count === "number" && count > MCA_REFINANCE_LIMITS.activeCount)
    || (typeof amount === "number" && amount > MCA_REFINANCE_LIMITS.amount)
    || (typeof policy.requested_term_months === "number" && policy.requested_term_months > MCA_REFINANCE_LIMITS.termMonths)
    || policy.review_mode === "manual_review") return "manual_review";
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1
    || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "information_required";
  return policy.review_mode === "automated_review" && policy.auto_underwriting_allowed === true
    ? "automated_review"
    : "information_required";
}
