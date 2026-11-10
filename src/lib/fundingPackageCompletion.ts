import type { FinancialCockpit } from "./financialCockpit";

export type PackageEvidenceGap = { key: "request" | "noi" | "ebitda"; label: string; detail: string };

/** Explain missing source figures without treating a financing proposal as evidence. */
export function fundingPackageEvidenceGaps(cockpit: Pick<FinancialCockpit, "requested_amount" | "noi" | "ebitda">): PackageEvidenceGap[] {
  const gaps: PackageEvidenceGap[] = [];
  if (cockpit.requested_amount == null || !Number.isFinite(cockpit.requested_amount) || cockpit.requested_amount <= 0) {
    gaps.push({ key: "request", label: "Current request not entered", detail: "Use the pencil beside Current request to record the client's requested amount and reconcile its use of funds. A proposed loan and its net proceeds are separate amounts." });
  }
  const noi = cockpit.noi?.headline;
  if (noi?.annualized_value == null) {
    gaps.push({ key: "noi", label: "Annual NOI needs a P&L", detail: cockpit.noi?.reason || (noi?.value != null ? "A source-period operating result is available. Confirm a dated six-to-twelve-month P&L before using an annual comparison." : "Review or add the latest business P&L with operating income or revenue, COGS and operating expenses, plus its reporting period, currency and accounting basis.") });
  } else if (noi.provisional || !noi.complete) {
    gaps.push({ key: "noi", label: "NOI needs source review", detail: "The operating result is visible but provisional. Review its source and reconcile the operating expenses before relying on it." });
  }
  const ebitda = cockpit.ebitda?.headline;
  if (!ebitda || !["computed_ebitda", "reported_ebitda"].includes(ebitda.kind) || !ebitda.complete || ebitda.provisional || ebitda.annualized_value == null || cockpit.ebitda?.source_selection?.stale) {
    gaps.push({ key: "ebitda", label: "Validated P&L EBITDA needs review", detail: cockpit.ebitda?.reason || "Review the current P&L and its EBITDA inputs. Tax-derived earnings and bank cash retained do not populate validated P&L EBITDA." });
  }
  return gaps;
}
