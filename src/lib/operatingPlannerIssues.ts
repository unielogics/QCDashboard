import { operatingExpenseAmount, operatingNumber, type OperatingEvaluation, type OperatingPlanBody } from "./operatingPlan";
import { unansweredOperatingCategories, type OperatingGuidance } from "./operatingGuidance";
import { operatingFeedbackLabel } from "./operatingPlanFeedback";
import { plannerSaveIssues } from "./recognizablePlan";
export type OperatingPlannerIssue = { id: string; step: 0 | 1 | 2; field: string; label: string; expenseId?: string; actionId?: string; category?: string; sourceGroupKey?: string };
/** Required answers and canonical evaluator issues only. No projected amounts are calculated here. */
export function operatingPlannerIssues(body: OperatingPlanBody, evaluation?: OperatingEvaluation | null, guidance?: OperatingGuidance | null): OperatingPlannerIssue[] {
  const issues: OperatingPlannerIssue[] = [], seen = new Set<string>();
  const add = (row: Omit<OperatingPlannerIssue, "id">) => { const id = `${row.step}:${row.actionId || row.expenseId || row.category || ""}:${row.field}`; if (!seen.has(id)) { seen.add(id); issues.push({ ...row, id }); } };
  const baseline = evaluation?.baseline, feedback = evaluation?.draft_feedback;
  const currency = baseline?.noi_governance ? baseline.noi_governance.currency : baseline && "noi_currency" in baseline ? baseline.noi_currency : baseline?.currency;
  if (feedback?.summary.baseline_ready === false || !baseline || baseline.noi == null || !currency || baseline.noi_governance?.status === "stale" || baseline.noi_governance?.status === "unavailable") add({ step: 0, field: "baseline.noi", label: "Confirm the current annual operating income and its source" });
  if (!body.period_start || !body.period_end) add({ step: 0, field: "period_start", label: "Confirm the reporting period" });
  if (!body.currency || currency && body.currency !== currency) add({ step: 0, field: "currency", label: "Confirm the source and plan currency" });
  for (const question of unansweredOperatingCategories(body, guidance)) add({ step: 1, field: `category_confirmations.${question.category}`, category: question.category, label: `Confirm ${question.label.toLowerCase()} costs` });
  for (const [category, answer] of Object.entries(body.category_confirmations || {})) if (answer === "needs_help") add({ step: 1, field: `category_confirmations.${category}`, category, label: `Resolve the ${category.replaceAll("_", " ")} question with your team` });
  for (const row of body.expenses || []) {
    if (row.excluded || row.duplicate_of) continue;
    const name = row.label?.trim() || "Current item", common = { step: 1 as const, expenseId: row.id, category: row.category, sourceGroupKey: row.source_group_key || undefined };
    if (!row.label?.trim()) add({ ...common, field: `expenses.${row.id}.label`, label: "Name the current cost item" });
    if (row.cost_basis === "per_unit") {
      for (const [key, label] of [["current_units_per_period", "quantity"], ["current_unit_cost", "cost per unit"], ["current_fixed_amount", "fixed portion"]] as const) { const value = operatingNumber(row[key]); if (value == null || value < 0) add({ ...common, field: `expenses.${row.id}.${key}`, label: `${name}: enter the ${label}` }); }
    } else { const amount = operatingNumber(row.current_amount); if (amount == null || amount < 0) add({ ...common, field: `expenses.${row.id}.current_amount`, label: `${name}: enter the current amount` }); }
    const derived = row.cost_basis === "per_unit" ? operatingExpenseAmount(row) : null, recorded = operatingNumber(row.current_amount);
    if (derived != null && recorded != null && Math.abs(derived - recorded) > .01) add({ ...common, field: `expenses.${row.id}.reconcile_current_amount`, label: `${name}: confirm the derived current total` });
    if (body.category_confirmations?.[row.category || "other"] === "not_applicable") add({ step: 1, category: row.category || "other", field: `category_confirmations.${row.category || "other"}`, label: `Confirm ${row.category || "other"}; an active current item is present` });
  }
  for (const ledger of evaluation?.itemization || []) if (ledger.status !== "balanced") add({ step: 1, expenseId: ledger.parent_expense_row_id, sourceGroupKey: ledger.source_group_key, field: `expenses.${ledger.parent_expense_row_id}.itemization.${ledger.status}`, label: `${guidance?.expense_groups?.find(group => group.key === ledger.source_group_key)?.label || "Source itemization"}: reconcile the itemized total` });
  for (const path of plannerSaveIssues(body, evaluation).filter(field => field.startsWith("historical_corrections."))) add({ step: 1, field: path, sourceGroupKey: body.historical_corrections?.find(row => path.includes(row.source_group_key))?.source_group_key, label: path.endsWith(".reason") ? "Historical difference: enter a reason" : "Historical difference: add its supporting reference" });
  for (const action of body.adjustments || []) {
    if (action.excluded || action.duplicate_of || action.status === "rejected") continue;
    const name = action.label?.trim() || "Planned change";
    const missing: string[] = [];
    if (!action.label?.trim()) missing.push("label");
    if (!action.effective_date) missing.push("effective_date");
    if (operatingNumber(action.implementation_cost) == null || (operatingNumber(action.implementation_cost) ?? 0) < 0) missing.push("implementation_cost");
    if (!action.explanation?.trim()) missing.push("explanation");
    if (!action.source_note?.trim()) missing.push("source_note");
    if (action.command && operatingNumber(action.command.value) == null) missing.push("command.value");
    for (const key of missing) { const field = `adjustments.${action.id}.${key}`; add({ step: 2, actionId: action.id, field, label: `${name}: ${operatingPlannerFieldLabel(field).toLowerCase()}` }); }
  }
  if (feedback?.summary.metric_issues?.noi.length) add({ step: 0, field: "baseline.noi", label: "Confirm the operating-income definition for this source" });
  for (const row of feedback?.actions || []) {
    const action = body.adjustments?.find(item => item.id === row.action_id && !item.excluded && item.status !== "rejected"); if (!action) continue;
    for (const field of [...row.math_missing, ...row.qualification_missing]) add({ step: 2, actionId: action.id, field, label: `${action.label || "Planned change"}: ${operatingPlannerFieldLabel(field).toLowerCase()}` });
    if (row.metric_issues?.noi.length && !issues.some(issue => issue.step === 0 && issue.field === "baseline.noi")) add({ step: 0, actionId: action.id, field: "baseline.noi", label: `${action.label || "Planned change"}: confirm the source's treatment of depreciation` });
    if (row.source_issues.length) add({ step: 1, expenseId: action.expense_row_id || undefined, sourceGroupKey: action.source_group_key || undefined, category: action.expense_category || undefined, actionId: action.id, field: action.expense_row_id ? `expenses.${action.expense_row_id}.source_group_key` : "current_cost_source", label: `${action.label || "Planned change"}: reconcile its current cost source` });
  }
  const bridge = evaluation?.cash_bridge, funding = body.released_cash_flow;
  if (bridge && (bridge.required || funding?.allocations.length || funding?.source_fingerprint)) {
    if (bridge.loan_status && bridge.loan_status !== "calculated") add({ step: 0, field: "loan_source", label: "Confirm the saved loan payments and currency" });
    if (bridge.available && bridge.required && (bridge.source_fingerprint !== funding?.source_fingerprint || bridge.stale)) add({ step: 2, field: "released_cash_flow.source_fingerprint", label: "Confirm how the saved loan cash will be used" });
    if (bridge.unallocated_monthly != null && bridge.unallocated_monthly !== 0 && !(bridge.unallocated_monthly < 0 && bridge.allocations.some(row => row.issues.some(issue => /amount|capacity|exceed|overalloc/.test(issue))))) add({ step: 2, field: bridge.unallocated_monthly < 0 ? "released_cash_flow.allocations.overallocated" : "released_cash_flow.allocations.unallocated", label: bridge.unallocated_monthly < 0 ? "Reduce the overassigned loan cash" : "Retain or assign the remaining loan cash" });
    for (const row of funding?.allocations || []) {
      const common = { step: 2 as const }, prefix = `released_cash_flow.allocations.${row.id}`;
      if (!row.label.trim()) add({ ...common, field: `${prefix}.label`, label: "Name the cash assignment" });
      if (!row.purpose) add({ ...common, field: `${prefix}.purpose`, label: `${row.label || "Cash assignment"}: choose its purpose` });
      const amount = operatingNumber(row.amount_monthly); if (amount == null || amount <= 0) add({ ...common, field: `${prefix}.amount_monthly`, label: `${row.label || "Cash assignment"}: enter its monthly amount` });
      for (const issue of bridge.allocations.find(item => item.id === row.id)?.issues || []) {
        const linked = row.action_id ? feedback?.actions.find(action => action.action_id === row.action_id) : undefined;
        const linkedField = linked?.math_missing[0] || linked?.qualification_missing[0] || linked?.source_issues[0];
        if (row.action_id && linkedField && /unknown|incomplete|unresolved|missing/.test(issue)) { add({ step: 2, actionId: row.action_id, field: linkedField, label: `${row.label || "Cash assignment"}: finish the linked activity inputs` }); continue; }
        const field = /amount|capacity|exceed|overalloc/.test(issue) ? "amount_monthly" : /action/.test(issue) ? "action_id" : /expense/.test(issue) ? "expense_row_id" : /purpose/.test(issue) ? "purpose" : "label";
        add({ ...common, field: `${prefix}.${field}`, label: `${row.label || "Cash assignment"}: ${field === "amount_monthly" ? "review the assigned amount or linked capacity" : field === "purpose" ? "choose the funding purpose" : "repair the linked funding item"}` });
      }
    }
  }
  return issues;
}
export function operatingPlannerFieldLabel(field: string) {
  if (field.includes("contribution_margin")) return "Enter the contribution margin";
  if (field.includes("revenue_return_multiple")) return "Enter revenue per marketing dollar";
  if (field.includes("command.value")) return "Enter the change amount";
  if (field.includes("proposed_units")) return "Enter the proposed quantity";
  if (field.includes("proposed_unit_cost")) return "Enter the proposed cost per unit";
  if (field.includes("proposed_fixed")) return "Enter the proposed fixed portion";
  if (field.includes("proposed_amount")) return "Enter the proposed total";
  return operatingFeedbackLabel(field);
}
export function operatingPrerequisiteIssues(issues: OperatingPlannerIssue[]) { return issues.filter(row => row.step < 2); }
