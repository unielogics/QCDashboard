import { addOperatingGroup, updateOperatingExpense, type OperatingExpenseGroup } from "./operatingGuidance";
import { operatingNumber, type OperatingPlanBody, type PlanAmount } from "./operatingPlan";

export type OperatingSourceReview = {
  source_fingerprint: string | null;
  reporting: Record<string, unknown>;
  active: boolean; complete: boolean; stale: boolean; missing: string[]; fix_fields: string[];
  groups: Array<{ key: string; category: string; label: string; source_amount: number | null; baseline_annual_amount: number | null; decision: "confirmed" | "needs_correction" | null; status: "confirmed" | "needs_correction" | "unreviewed" | "stale" }>;
};

/** Explicit source decisions never overwrite a tax/P&L fact or a retained disclosure. */
export function decideOperatingSourceGroup(body: OperatingPlanBody, group: OperatingExpenseGroup, fingerprint: string, decision: "confirmed" | "needs_correction", createId: () => string, reason?: string, correctedAmount?: PlanAmount): OperatingPlanBody {
  if (!fingerprint || decision === "needs_correction" && (reason?.trim().length || 0) < 3) return body;
  let next = body;
  if (decision === "confirmed" && !body.expenses?.some(row => row.source_group_key === group.key)) next = addOperatingGroup(body, group, createId());
  let correctionReason = reason?.trim();
  const corrected = operatingNumber(correctedAmount);
  if (decision === "needs_correction" && corrected != null && corrected >= 0) {
    const rows = body.expenses?.filter(row => row.source_group_key === group.key && !row.excluded && !row.duplicate_of) || [];
    const row = rows[0];
    if (rows.length === 1 && !row.itemization_parent_id && row.cadence === "annual" && row.cost_basis !== "per_unit" && !body.expenses?.some(child => child.itemization_parent_id === row.id)) next = updateOperatingExpense(body, row.id, { current_amount: correctedAmount });
    else correctionReason = `${correctionReason} · Corrected annual amount for review: ${group.currency || "currency unconfirmed"} ${correctedAmount}`;
  }
  const decisions = body.source_group_confirmation_stamp === fingerprint ? body.source_group_confirmations || {} : {};
  const corrections = next.historical_corrections || [];
  return { ...next, source_group_confirmation_stamp: fingerprint, source_group_confirmations: { ...decisions, [group.key]: decision },
    ...(decision === "needs_correction" ? { historical_corrections: corrections.some(row => row.source_group_key === group.key) ? corrections.map(row => row.source_group_key === group.key ? { ...row, reason: correctionReason! } : row) : [...corrections, { source_group_key: group.key, reason: correctionReason!, source_file_ids: [], evidence_note: "" }] } : {}) };
}

/** Explicit restoration is limited to one unsplit annual aggregate; it never revives a parent over children. */
export function restoreOperatingSourceGroup(body: OperatingPlanBody, group: OperatingExpenseGroup, fingerprint: string): OperatingPlanBody {
  const rows = body.expenses?.filter(row => row.source_group_key === group.key && !row.excluded && !row.duplicate_of) || [], row = rows[0];
  if (!fingerprint || group.baseline_annual_amount == null || rows.length !== 1 || row.itemization_parent_id || row.cadence !== "annual" || row.cost_basis === "per_unit" || body.expenses?.some(child => child.itemization_parent_id === row.id)) return body;
  const next = updateOperatingExpense(body, row.id, { current_amount: group.baseline_annual_amount });
  return decideOperatingSourceGroup({ ...next, historical_corrections: next.historical_corrections?.filter(item => item.source_group_key !== group.key) }, group, fingerprint, "confirmed", () => row.id);
}
