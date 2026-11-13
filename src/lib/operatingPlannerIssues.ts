import { operatingFundingState } from "./operatingFundingState";
import { operatingActionMissingFields, operatingActionFieldLabel } from "./operatingActionFields";
import { operatingExpenseAmount, operatingNumber, type OperatingEvaluation, type OperatingPlanBody } from "./operatingPlan";
import { unansweredOperatingCategories, type OperatingGuidance } from "./operatingGuidance";
import { operatingFeedbackLabel } from "./operatingPlanFeedback";
import { plannerSaveIssues } from "./recognizablePlan";
export type OperatingPlannerIssue = { id: string; step: 0 | 1 | 2; field: string; label: string; expenseId?: string; actionId?: string; category?: string; sourceGroupKey?: string };
/** Required answers and canonical evaluator issues only. No projected amounts are calculated here. */
export function operatingPlannerIssues(body: OperatingPlanBody, evaluation?: OperatingEvaluation | null, guidance?: OperatingGuidance | null, options: { serverCurrent?: boolean } = {}): OperatingPlannerIssue[] {
  const issues: OperatingPlannerIssue[] = [], seen = new Set<string>();
  const add = (row: Omit<OperatingPlannerIssue, "id">) => { const id = `${row.step}:${row.actionId || row.expenseId || row.category || ""}:${row.field}`; if (!seen.has(id)) { seen.add(id); issues.push({ ...row, id }); } };
  const baseline = evaluation?.baseline, feedback = evaluation?.draft_feedback;
  const currency = baseline?.noi_governance ? baseline.noi_governance.currency : baseline && "noi_currency" in baseline ? baseline.noi_currency : baseline?.currency;
  if (feedback?.summary.baseline_ready === false || !baseline || baseline.noi == null || !currency || baseline.noi_governance?.status === "stale" || baseline.noi_governance?.status === "unavailable") add({ step: 0, field: "baseline.noi", label: "Confirm the current annual operating income and its source" });
  if (!body.period_start || !body.period_end) add({ step: 0, field: "period_start", label: "Confirm the reporting period" });
  if (!body.currency || currency && body.currency !== currency) add({ step: 0, field: "currency", label: "Confirm the source and plan currency" });
  const sourceReview = evaluation?.source_review;
  const sourceGroups = guidance?.expense_groups || sourceReview?.groups || [];
  const sourceFlow = Boolean(sourceReview || sourceGroups.length || body.source_group_confirmation_stamp);
  if (sourceGroups.length) {
    for (const group of sourceGroups) {
      const stampMatches = Boolean(sourceReview?.source_fingerprint && body.source_group_confirmation_stamp === sourceReview.source_fingerprint);
      const decision = stampMatches ? body.source_group_confirmations?.[group.key] : !sourceReview?.stale ? sourceReview?.groups.find(row => row.key === group.key)?.decision : undefined;
      if (!decision || sourceReview?.stale && !stampMatches) add({ step: 1, sourceGroupKey: group.key, category: group.category, field: `source_group_confirmations.${group.key}`, label: `Confirm ${group.label}` });
      if (decision === "needs_correction" && (body.historical_corrections?.find(row => row.source_group_key === group.key)?.reason.trim().length || 0) < 3) add({ step: 1, sourceGroupKey: group.key, field: `historical_corrections.${group.key}.reason`, label: `${group.label}: explain the correction` });
    }
  }
  if (!sourceFlow) for (const question of unansweredOperatingCategories(body, guidance)) add({ step: 1, field: `category_confirmations.${question.category}`, category: question.category, label: `Confirm ${question.label.toLowerCase()} costs` });
  if (!sourceFlow) for (const [category, answer] of Object.entries(body.category_confirmations || {})) if (answer === "needs_help") add({ step: 1, field: `category_confirmations.${category}`, category, label: `Resolve the ${category.replaceAll("_", " ")} question with your team` });
  for (const row of body.expenses || []) {
    if (row.excluded || row.duplicate_of) continue;
    const name = row.label?.trim() || "Current item", common = { step: (sourceFlow ? 2 : 1) as 1 | 2, expenseId: row.id, category: row.category, sourceGroupKey: row.source_group_key || undefined };
    if (!row.label?.trim()) add({ ...common, field: `expenses.${row.id}.label`, label: "Name the current cost item" });
    if (row.cost_basis === "per_unit") {
      for (const [key, label] of [["current_units_per_period", "quantity"], ["current_unit_cost", "cost per unit"], ["current_fixed_amount", "fixed portion"]] as const) { const value = operatingNumber(row[key]); if (value == null || value < 0) add({ ...common, field: `expenses.${row.id}.${key}`, label: `${name}: enter the ${label}` }); }
    } else { const amount = operatingNumber(row.current_amount); if (amount == null || amount < 0) add({ ...common, field: `expenses.${row.id}.current_amount`, label: `${name}: enter the current amount` }); }
    const derived = row.cost_basis === "per_unit" ? operatingExpenseAmount(row) : null, recorded = operatingNumber(row.current_amount);
    if (derived != null && recorded != null && Math.abs(derived - recorded) > .01) add({ ...common, field: `expenses.${row.id}.reconcile_current_amount`, label: `${name}: confirm the derived current total` });
    if (!sourceFlow && body.category_confirmations?.[row.category || "other"] === "not_applicable") add({ step: 1, category: row.category || "other", field: `category_confirmations.${row.category || "other"}`, label: `Confirm ${row.category || "other"}; an active current item is present` });
  }
  for (const ledger of evaluation?.itemization || []) if (ledger.status !== "balanced" && !(sourceFlow && body.historical_corrections?.some(row => row.source_group_key === ledger.source_group_key && row.reason.trim().length >= 3))) add({ step: sourceFlow ? 2 : 1, expenseId: ledger.parent_expense_row_id, sourceGroupKey: ledger.source_group_key, field: `expenses.${ledger.parent_expense_row_id}.itemization.${ledger.status}`, label: `${guidance?.expense_groups?.find(group => group.key === ledger.source_group_key)?.label || "Source itemization"}: reconcile the itemized total` });
  for (const path of plannerSaveIssues(body, evaluation).filter(field => field.startsWith("historical_corrections.") && !field.endsWith(".evidence"))) add({ step: 1, field: path, sourceGroupKey: body.historical_corrections?.find(row => path.includes(row.source_group_key))?.source_group_key, label: path.endsWith(".reason") ? "Historical difference: enter a reason" : "Historical difference: add its supporting reference" });
  for (const action of body.adjustments || []) {
    if (action.excluded || action.duplicate_of || action.status === "rejected") continue;
    const name = action.label?.trim() || "Planned change";
    for (const key of operatingActionMissingFields(action, body)) { const field = `adjustments.${action.id}.${key}`; add({ step: 2, actionId: action.id, field, label: `${name}: ${operatingActionFieldLabel(field, action).toLowerCase()}` }); }
  }
  if (feedback?.summary.metric_issues?.noi.length) add({ step: 0, field: "baseline.noi", label: "Confirm the operating-income definition for this source" });
  for (const row of options.serverCurrent === false ? [] : feedback?.actions || []) {
    const action = body.adjustments?.find(item => item.id === row.action_id && !item.excluded && item.status !== "rejected"); if (!action) continue;
    const liveMissing = operatingActionMissingFields(action, body);
    for (const path of [...row.math_missing, ...row.qualification_missing].filter(field => !/effective_date|projection_start|source_note|source_file_ids|owner_name/.test(field))) {
      const suffix = path.replace(new RegExp(`^adjustments\\.${action.id}\\.`), "");
      if (["current_proposed_math", "marketing_return_assumptions", "proposed_cost", "current_cost"].includes(suffix) && liveMissing.length) continue;
      if (["label", "driver_key", "explanation", "implementation_cost", "effective_date", "source_note", "source_file_ids", "owner_name", "command.value", "proposed_amount", "current_amount", "product_name", "revenue_return_multiple", "contribution_margin_pct", "units_per_period", "current_unit_cost", "proposed_unit_cost", "current_unit_price", "proposed_unit_price", "current_units_per_period", "proposed_units_per_period", "current_fixed_amount", "proposed_fixed_amount"].includes(suffix) && !liveMissing.includes(suffix)) continue;
      const field = path.startsWith("adjustments.") ? path : `adjustments.${action.id}.${suffix}`;
      add({ step: 2, actionId: action.id, field, label: `${action.label || "Planned change"}: ${operatingActionFieldLabel(field, action).toLowerCase()}` });
    }
    if (row.metric_issues?.noi.length && !issues.some(issue => issue.step === 0 && issue.field === "baseline.noi")) add({ step: 0, actionId: action.id, field: "baseline.noi", label: `${action.label || "Planned change"}: confirm the source's treatment of depreciation` });
    if (row.source_issues.length) add({ step: sourceFlow ? 2 : 1, expenseId: action.expense_row_id || undefined, sourceGroupKey: action.source_group_key || undefined, category: action.expense_category || undefined, actionId: action.id, field: action.expense_row_id ? `expenses.${action.expense_row_id}.source_group_key` : "current_cost_source", label: `${action.label || "Planned change"}: reconcile its current cost source` });
  }
  const bridge = options.serverCurrent === false ? undefined : evaluation?.cash_bridge, funding = body.released_cash_flow;
  const funds = operatingFundingState(bridge);
  if (funds.required || funding?.allocations.length || funding?.source_fingerprint) {
    if (bridge && !funds.enhanced && bridge.loan_status && bridge.loan_status !== "calculated") add({ step: 0, field: "loan_source", label: "Confirm the saved loan payments and currency" });
    if (!funds.enhanced && funds.available && funds.required && (funds.fingerprint !== funding?.source_fingerprint || funds.stale)) add({ step: 2, field: "released_cash_flow.source_fingerprint", label: "Confirm how plan funding will be used" });
    if (funds.unallocated != null && (funds.enhanced ? funds.unallocated < 0 : funds.unallocated !== 0) && !(funds.unallocated < 0 && bridge?.allocations.some(row => row.issues.some(issue => /amount|capacity|exceed|overalloc/.test(issue))))) add({ step: 2, field: funds.unallocated < 0 ? "released_cash_flow.allocations.overallocated" : "released_cash_flow.allocations.unallocated", label: funds.unallocated < 0 ? "Reduce overassigned funding" : "Retain or assign remaining funding" });
    for (const path of funds.missing) {
      if (bridge?.loan_missing?.includes(path) || /loan_source|loan_currency|debt_service|source_unavailable/.test(path)) { add({ step: 0, field: "loan_source", label: "Confirm the saved loan payments and currency" }); continue; }
      if (/source_fingerprint|source_changed|acknowledge|stale/.test(path)) { if (!funds.complete && (!funds.enhanced || funding?.allocations.length)) add({ step: 2, field: "released_cash_flow.source_fingerprint", label: "Confirm how plan funding will be used" }); continue; }
      if (/full_release|unallocated|unassigned|overalloc/.test(path)) { if (funds.unallocated != null && (funds.enhanced ? funds.unallocated < 0 : funds.unallocated !== 0)) add({ step: 2, field: funds.unallocated < 0 ? "released_cash_flow.allocations.overallocated" : "released_cash_flow.allocations.unallocated", label: funds.unallocated < 0 ? "Reduce overassigned funding" : "Retain or assign remaining funding" }); continue; }
      if (funding?.allocations.some(row => path.includes(row.id))) continue;
      if (path.startsWith("adjustments.")) { const action = body.adjustments?.find(row => path.includes(row.id) && !row.excluded && row.status !== "rejected"); if (action) add({ step: 2, actionId: action.id, field: path, label: `${action.label || "Planned change"}: ${operatingActionFieldLabel(path, action).toLowerCase()}` }); continue; }
      if (path.startsWith("released_cash_flow.") && !funds.complete) add({ step: 2, field: path, label: "Review the funding assignment" });
    }
    for (const row of funding?.allocations || []) {
      const common = { step: 2 as const }, prefix = `released_cash_flow.allocations.${row.id}`;
      if (!row.label.trim()) add({ ...common, field: `${prefix}.label`, label: "Name the cash assignment" });
      if (!row.purpose) add({ ...common, field: `${prefix}.purpose`, label: `${row.label || "Cash assignment"}: choose its purpose` });
      const amount = operatingNumber(row.amount_monthly); if (amount == null || amount <= 0) add({ ...common, field: `${prefix}.amount_monthly`, label: `${row.label || "Cash assignment"}: enter its monthly amount` });
      for (const issue of bridge?.allocations.find(item => item.id === row.id)?.issues || []) {
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
