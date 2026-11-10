import type { FinancialCockpit } from "./financialCockpit";

export type PackageEvidenceGap = { key: "request" | "noi" | "ebitda"; label: string; detail: string };

/** Explain missing source figures without treating a financing proposal as evidence. */
export function fundingPackageEvidenceGaps(cockpit: Pick<FinancialCockpit, "requested_amount" | "noi" | "ebitda">): PackageEvidenceGap[] {
  const gaps: PackageEvidenceGap[] = [];
  if (cockpit.requested_amount == null || !Number.isFinite(cockpit.requested_amount) || cockpit.requested_amount <= 0) {
    gaps.push({ key: "request", label: "Current request not entered", detail: "Use the pencil beside Current request to record the client's requested amount and reconcile its use of funds. A proposed loan and its net proceeds are separate amounts." });
  }
  const noi = cockpit.noi?.headline;
  const governance = cockpit.noi;
  if (governance?.status === "stale") {
    gaps.push({ key: "noi", label: "NOI needs re-review", detail: `${governance.status_reason || "Relevant NOI evidence changed; the earlier review is retained in history and is not the current annual NOI."} Open NOI > Calculate / override NOI to review the latest evidence and save the current annual basis.` });
  } else if (noi?.annualized_value == null) {
    const sourceReason = governance?.status_reason || cockpit.noi?.reason || (noi?.value != null ? "A source-period operating result is available, but its annual basis has not been established." : "An annual operating-income basis has not been saved.");
    gaps.push({ key: "noi", label: "Annual NOI needs review", detail: `${sourceReason} Open NOI > Calculate / override NOI to review a business tax return or P&L, or enter a manual annual amount with its year, currency and reason.` });
  } else if (governance?.review_needed || governance?.status === "provisional" || governance?.status === "unavailable" || (!governance?.status && (noi.provisional || !noi.complete))) {
    gaps.push({ key: "noi", label: "NOI needs source review", detail: governance?.status_reason || "The operating result is visible but provisional. Review its source and reconcile the operating expenses before relying on it." });
  }
  const ebitda = cockpit.ebitda?.headline;
  if (!ebitda || !["computed_ebitda", "reported_ebitda"].includes(ebitda.kind) || !ebitda.complete || ebitda.provisional || ebitda.annualized_value == null || cockpit.ebitda?.source_selection?.stale) {
    gaps.push({ key: "ebitda", label: "Validated P&L EBITDA needs review", detail: cockpit.ebitda?.reason || "Review the current P&L and its EBITDA inputs. Tax-derived earnings and bank cash retained do not populate validated P&L EBITDA." });
  }
  return gaps;
}
