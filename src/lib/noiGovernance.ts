import type { FinancialNoi } from "./financialMetrics";

export type NoiStatus = "source_supported" | "provisional" | "reviewed" | "stale" | "unavailable";
export type NoiGovernance = {
  policy_version: string; status: NoiStatus; review_needed: boolean; status_reason: string;
  reason_codes: string[]; authority_stamp?: string;
};
export type NoiBaselineGovernance = NoiGovernance & {
  kind?: string | null; label?: string | null; year?: string | number | null;
  period?: string | null; currency?: string | null;
};

const LABELS: Record<NoiStatus, string> = {
  source_supported: "Source supported", provisional: "Provisional NOI", reviewed: "Staff-reviewed NOI",
  stale: "NOI needs re-review", unavailable: "NOI unavailable",
};

/** The server owns the policy decision; a positive number is not a source-quality status. */
export function noiGovernancePresentation(governance: (Partial<Omit<NoiGovernance, "status">> & { status?: string | null }) | null | undefined) {
  const status = governance?.status;
  return {
    label: status && Object.hasOwn(LABELS, status) ? LABELS[status as NoiStatus] : "NOI review status unavailable",
    tone: status === "source_supported" || status === "reviewed" ? "ok" as const : "warn" as const,
    reason: governance?.status_reason || "Refresh the financial evidence to read the current NOI review status.",
    reviewNeeded: governance?.review_needed === true,
  };
}

export function noiBasisLabel(value: FinancialNoi | undefined): string {
  const headline = value?.headline;
  if (!headline) return "No current annual NOI basis";
  if (headline.kind === "tax_derived_noi" || headline.tax_derived_estimate)
    return headline.staff_reviewed ? "Reviewed business tax return estimate" : "Filed business return";
  if (headline.staff_reviewed || headline.kind === "staff_reviewed_noi")
    return value?.review?.current?.mode === "manual" ? "Manual annual NOI review" : "Staff-reviewed annual NOI";
  return "Automatic P&L operating income";
}
