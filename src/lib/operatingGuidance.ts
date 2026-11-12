import { OPERATING_CATEGORIES, cadenceFactor, clearOperatingReview, operatingExpenseAmount, operatingExpenseTotal, operatingNumber, type OperatingAction, type OperatingCadence, type OperatingEvaluation, type OperatingExpense, type OperatingPlanBody } from "./operatingPlan";

export type OperatingExpenseGroup = {
  key: string; category: string; label: string; baseline_annual_amount: number | null;
  currency: string | null; basis: string | null; year: string | number | null;
  period_start?: string | null; period_end?: string | null; source_file_ids: string[];
  source_label: string | null; source_fact_keys: string[]; notes: string[];
};
export type OperatingGuidance = {
  policy_version: string;
  business: { name?: string | null; naics_code?: string | null; industry?: string | null; questions?: string[] };
  reporting: { period_start?: string | null; period_end?: string | null; currency?: string | null; basis?: string | null; year?: string | number | null; source_file_id?: string | null; source_label?: string | null };
  expense_groups: OperatingExpenseGroup[];
  essentials: Array<{ category: string; label: string; prompt: string }>;
  action_templates: Array<{ key: string; label: string; kind: OperatingAction["kind"]; category?: string; explanation: string }>;
  warnings: string[];
};
export type OperatingExpenseCandidate = {
  id?: string; key?: string; source_key?: string; label?: string; payee?: string; category?: string;
  current_amount?: number | string | null; cadence?: string; source_file_ids?: string[]; bank_vendor_key?: string;
  source_note?: string; warning?: string; source_group_key?: string; source_candidate_key?: string;
  year?: number | string | null; currency?: string | null; basis?: string | null;
};
export type OperatingGuidanceEvidence = { files?: Array<{ file_id: string; file_name: string }>; expense_candidates?: OperatingExpenseCandidate[]; warnings?: string[] };
export type OperatingGuidanceReply = { guidance: OperatingGuidance; evidence: OperatingGuidanceEvidence; evaluation: OperatingEvaluation | null };
export const DEFAULT_OPERATING_ESSENTIALS = ["rent", "salaries", "marketing", "utilities", "insurance", "cogs"].map(category => ({ category, label: category === "salaries" ? "Payroll" : category.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()), prompt: `Confirm current ${category.replaceAll("_", " ")} costs, or tell your team this category does not apply.` }));
export function unansweredOperatingCategories(body: OperatingPlanBody, guidance?: OperatingGuidance | null) {
  return (guidance?.essentials?.length ? guidance.essentials : DEFAULT_OPERATING_ESSENTIALS).filter(question => !body.category_confirmations?.[question.category]);
}

/** An empty disclosure is unknown; an explicitly entered zero is a quantified recurring cost. */
export function operatingRecurringSubtotal(rows: OperatingExpense[]) {
  const current = rows.filter(row => !row.excluded && !row.duplicate_of);
  const total = operatingExpenseTotal(current);
  const quantifiedRecurring = current.some(row => row.cadence !== "one_time" && operatingExpenseAmount(row) != null);
  return { annual: quantifiedRecurring ? total.annual : null, missing: total.missing, incomplete: total.missing > 0 };
}

export const operatingCandidateKey = (row: OperatingExpenseCandidate) => row.source_candidate_key || row.source_key || row.bank_vendor_key || row.key || row.id || "";
const clearCategoryConfirmation = (body: OperatingPlanBody, ...categories: string[]) => {
  if (!body.category_confirmations) return {};
  const next = { ...body.category_confirmations };
  for (const category of categories) delete next[category];
  return { category_confirmations: next };
};

/** Explicit adoption only: source facts remain separate from the client's current disclosure. */
export function addOperatingCandidate(body: OperatingPlanBody, candidate: OperatingExpenseCandidate, id: string): OperatingPlanBody {
  // Source candidates are group totals. Existing granular children already disclose that total.
  if (candidate.source_group_key && body.expenses?.some(row => row.source_group_key === candidate.source_group_key && !row.excluded && !row.duplicate_of)) return body;
  const key = operatingCandidateKey(candidate);
  const existing = key ? body.expenses?.find(row => row.source_candidate_key === key || candidate.bank_vendor_key && row.bank_vendor_key === candidate.bank_vendor_key) : undefined;
  if (existing) return existing.excluded || existing.duplicate_of ? updateOperatingExpense(body, existing.id, { excluded: false, duplicate_of: null }) : body;
  const cadence = ["weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "annual", "one_time"].includes(candidate.cadence ?? "") ? candidate.cadence as OperatingCadence : "monthly";
  return { ...body, ...clearCategoryConfirmation(body, candidate.category || "other"), no_operating_expenses_confirmed: false, expenses: [...(body.expenses ?? []), {
    id, label: candidate.label ?? candidate.payee ?? "Expense to confirm", category: candidate.category || "other",
    current_amount: candidate.current_amount ?? null, cadence, payee: candidate.payee,
    source_group_key: candidate.source_group_key || "", source_candidate_key: key,
    bank_vendor_key: candidate.bank_vendor_key || null, source_file_ids: candidate.source_file_ids ?? [],
    notes: [candidate.source_note, candidate.warning, candidate.year ? `Source year: ${candidate.year}` : null, candidate.currency ? `Source currency: ${candidate.currency}` : null].filter(Boolean).join(" · "),
  }] };
}

export function addOperatingGroup(body: OperatingPlanBody, group: OperatingExpenseGroup, id: string): OperatingPlanBody {
  const existing = body.expenses?.filter(row => row.source_group_key === group.key) ?? [];
  if (existing.some(row => !row.excluded && !row.duplicate_of)) return body;
  if (existing.length) return updateOperatingExpense(body, existing[0].id, { excluded: false, duplicate_of: null });
  return addOperatingCandidate(body, { label: group.label, category: group.category, current_amount: group.baseline_annual_amount,
    cadence: "annual", source_group_key: group.key, source_candidate_key: group.key, source_file_ids: group.source_file_ids,
    source_note: [group.source_label, ...group.notes].filter(Boolean).join(" · "), year: group.year, currency: group.currency, basis: group.basis }, id);
}

export type OperatingSourceDraftResult = {
  body: OperatingPlanBody; added: number; linked: number; skipped: number;
  reasons: string[]; filled_fields: string[]; blocked_reason?: string;
};
const blankSourceField = (value: unknown) => value == null || String(value).trim() === "";
const sourceScopeValue = (value: unknown, field: string) => {
  const text = String(value ?? "").trim();
  return field === "currency" ? text.toUpperCase() : field === "basis" && text === "unknown" ? "" : text;
};
const discardedOperatingPlaceholder = (row: OperatingExpense, body: OperatingPlanBody) => Boolean(
  row.excluded && !row.duplicate_of && (row.category || "other") === "other"
  && (!row.cost_basis || row.cost_basis === "total") && (!row.cadence || row.cadence === "monthly") && row.essential !== false
  && [row.label, row.payee, row.notes, row.unit_label, row.current_amount, row.current_units_per_period,
    row.current_unit_cost, row.current_fixed_amount, row.source_group_key, row.source_candidate_key, row.bank_vendor_key].every(blankSourceField)
  && !(row.source_file_ids?.length) && !body.adjustments?.some(action => action.expense_row_id === row.id)
);

/** Explicit source-cost drafting; bank observations and unknown source totals stay suggestions. */
export function draftOperatingSourceCosts(body: OperatingPlanBody, guidance: OperatingGuidance | null | undefined, idFactory: () => string): OperatingSourceDraftResult {
  const result: OperatingSourceDraftResult = { body, added: 0, linked: 0, skipped: 0, reasons: [], filled_fields: [] };
  const groups = guidance?.expense_groups ?? [];
  if (!guidance || !groups.length) return { ...result, blocked_reason: "No tax or P&L expense groups are available. Review sources or enter supported costs." };
  const reporting = guidance.reporting ?? {};
  const scopeFields = ["period_start", "period_end", "currency", "basis"] as const;
  for (const field of scopeFields) {
    const current = sourceScopeValue(body[field], field);
    const source = sourceScopeValue(reporting[field], field);
    if (current && source && current !== source) return { ...result,
      blocked_reason: `The plan's ${field.replaceAll("_", " ")} conflicts with the selected source. Reconcile the reporting period, currency and basis before drafting costs.` };
  }
  if (reporting.year != null && body.period_end && String(reporting.year) !== body.period_end.slice(0, 4)) return { ...result,
    blocked_reason: "The plan's reporting year conflicts with the selected source. Reconcile the period before drafting costs." };
  let next = body;
  const fill = (field: string, value: unknown) => {
    if (!blankSourceField(value)) {
      next = { ...next, [field]: value };
      result.filled_fields.push(field);
    }
  };
  if (blankSourceField(body.business_name)) fill("business_name", guidance.business?.name);
  for (const field of scopeFields) {
    if (!sourceScopeValue(body[field], field)) fill(field, sourceScopeValue(reporting[field], field));
  }
  const uniqueGroups = new Map(groups.filter(group => group.key).map(group => [group.key, group]));
  const categoryCounts = new Map<string, number>();
  for (const group of uniqueGroups.values()) categoryCounts.set(group.category, (categoryCounts.get(group.category) ?? 0) + 1);
  const seen = new Set<string>();
  for (const group of groups) {
    const skip = (reason: string) => { result.skipped += 1; result.reasons.push(`${group.label || group.category || "Source expense"}: ${reason}`); };
    if (!group.key) { skip("a stable source group is missing; review this source individually."); continue; }
    if (seen.has(group.key)) { skip("this source group is repeated in the source response."); continue; }
    seen.add(group.key);
    if (typeof group.baseline_annual_amount !== "number" || !Number.isFinite(group.baseline_annual_amount) || group.baseline_annual_amount < 0) {
      skip("the annual amount is unknown; it was not entered as zero."); continue;
    }
    if (!OPERATING_CATEGORIES.includes(group.category)) { skip("choose a supported expense category before adoption."); continue; }
    const conflictingScope = scopeFields.some(field => {
      const source = sourceScopeValue(group[field], field);
      const target = sourceScopeValue(next[field] || reporting[field], field);
      return source && target && source !== target;
    });
    const expectedYear = reporting.year ?? (next.period_end ? next.period_end.slice(0, 4) : null);
    if (conflictingScope || group.year != null && expectedYear != null && String(group.year) !== String(expectedYear)) {
      skip("its reporting period, currency or basis differs from this plan; reconcile it individually."); continue;
    }
    const rows = next.expenses ?? [];
    const scoped = rows.filter(row => row.source_group_key === group.key || row.source_candidate_key === group.key);
    if (scoped.length) {
      skip(scoped.some(row => !row.excluded && !row.duplicate_of)
        ? "existing detail already represents this source group; its values and splits were retained."
        : "this source group was excluded or marked duplicate; restore it explicitly if appropriate.");
      continue;
    }
    if (next.category_confirmations?.[group.category] === "not_applicable") {
      skip("this category is marked not applicable; review that decision before adding costs."); continue;
    }
    if (next.no_operating_expenses_confirmed) { skip("the plan confirms no operating expenses; reconcile that decision first."); continue; }
    const categoryRows = rows.filter(row => (row.category || "other") === group.category && !discardedOperatingPlaceholder(row, next));
    if (categoryRows.some(row => row.excluded || row.duplicate_of)) {
      skip("excluded or duplicate detail in this category needs explicit reconciliation."); continue;
    }
    if (categoryRows.some(row => row.source_group_key && !uniqueGroups.has(row.source_group_key))) {
      skip("existing detail refers to another source group; reconcile it before adding a new aggregate."); continue;
    }
    const unscoped = categoryRows.filter(row => !row.source_group_key);
    if (unscoped.length) {
      if (categoryCounts.get(group.category) !== 1 || unscoped.length !== 1) {
        skip("existing category detail or multiple source groups require manual reconciliation; no aggregate was added."); continue;
      }
      const row = unscoped[0];
      const amount = operatingExpenseAmount(row);
      const reference = operatingNumber(row.current_amount);
      const totalMismatch = row.cost_basis === "per_unit" && reference != null && amount != null && Math.abs(reference - amount) > .01;
      const annual = amount != null && amount >= 0 && row.cadence !== "one_time" ? amount * cadenceFactor(row.cadence) : null;
      if (totalMismatch || annual == null || !Number.isFinite(annual) || Math.abs(annual - group.baseline_annual_amount) > .01) {
        skip("the existing category amount differs or is unknown; reconcile it without adding the source aggregate again."); continue;
      }
      const files = [...new Set([...(row.source_file_ids ?? []), ...(group.source_file_ids ?? [])])];
      next = { ...next, expenses: rows.map(expense => expense.id === row.id ? { ...expense,
        source_group_key: group.key, source_candidate_key: expense.source_candidate_key || group.key, source_file_ids: files } : expense),
        adjustments: next.adjustments?.map(action => action.expense_row_id === row.id
          ? clearOperatingReview({ ...action, source_file_ids: [...new Set([...(action.source_file_ids ?? []), ...files])] }) : action) };
      result.linked += 1;
      continue;
    }
    next = addOperatingGroup(next, group, idFactory());
    result.added += 1;
  }
  return { ...result, body: next };
}

/** Changing a disclosure invalidates linked approvals without losing proposed values. */
export function updateOperatingExpense(body: OperatingPlanBody, id: string, patch: Partial<OperatingExpense>): OperatingPlanBody {
  const old = body.expenses?.find(row => row.id === id);
  if (!old) return body;
  const expense = { ...old, ...patch };
  const priorEvidence = new Set(old.source_file_ids ?? []);
  const dimensionChanged = (["cadence", "cost_basis", "unit_label"] as const).some(key => key in patch && old[key] !== expense[key]);
  return { ...body, no_operating_expenses_confirmed: false,
    ...clearCategoryConfirmation(body, old.category || "other", expense.category || "other"),
    expenses: body.expenses?.map(row => row.id === id ? expense : row),
    adjustments: body.adjustments?.map(row => row.expense_row_id !== id || row.status === "rejected" ? row : clearOperatingReview({ ...row,
      ...(!["expense_reduction", "expense_increase", "marketing_investment"].includes(row.kind ?? "") ? {} : row.kind === "marketing_investment" ? { cost_basis: "total" as const, current_amount: operatingExpenseAmount(expense), cadence: expense.cadence ?? "monthly" } : { cost_basis: expense.cost_basis ?? "total", unit_label: expense.unit_label ?? "", current_units_per_period: expense.current_units_per_period,
        current_unit_cost: expense.current_unit_cost, current_fixed_amount: expense.current_fixed_amount, current_amount: expense.cost_basis === "per_unit" ? null : expense.current_amount,
        ...(expense.cost_basis === "per_unit" ? { proposed_amount: null } : {}), cadence: expense.cadence }),
      ...(dimensionChanged && ["expense_reduction", "expense_increase", "marketing_investment"].includes(row.kind ?? "") ? { proposed_amount: null, proposed_units_per_period: null, proposed_unit_cost: null, proposed_fixed_amount: null, ...(row.command ? { command: { ...row.command, value: null } } : {}) } : {}),
      ...("label" in patch ? { label: expense.label } : {}),
      ...("source_file_ids" in patch ? { source_file_ids: [...new Set([...(row.source_file_ids ?? []).filter(file => !priorEvidence.has(file)), ...(expense.source_file_ids ?? [])])] } : {}),
    })),
  };
}

/** Explain signed server results; never turn a loss reduction into a percentage profit claim. */
export function operatingChangeExplanation(before: number | null | undefined, after: number | null | undefined) {
  if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after)) return { tone: "unknown", text: "More confirmed inputs are needed." };
  if (before < 0 && after > 0) return { tone: "improved", text: "This illustration crosses from a loss to positive operating income." };
  if (after > before && after < 0) return { tone: "improved", text: "The loss is smaller, but operating income remains below zero." };
  if (after < before) return { tone: "worse", text: "Operating income is lower in this illustration." };
  if (before === after) return { tone: "unchanged", text: "No change in operating income is shown." };
  return { tone: "improved", text: after === 0 ? "This illustration reaches break-even operating income." : "Operating income is higher in this illustration." };
}

export function operatingRatioChangeExplanation(before: number | null | undefined, after: number | null | undefined) {
  if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after)) return { tone: "unknown", text: "More confirmed earnings and debt inputs are needed." };
  const delta = Math.round((after - before) * 100) / 100;
  if (!delta) return { tone: "unchanged", text: "No change in debt-service coverage is shown." };
  return { tone: delta > 0 ? "improved" : "worse", text: `${delta > 0 ? "Improves" : "Declines"} by ${Math.abs(delta).toFixed(2)}x${after < 1 ? "; coverage remains below 1.00x" : ""}.` };
}
