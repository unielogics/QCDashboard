import { clearOperatingReview, operatingExpenseAmount, operatingExpenseTotal, type OperatingAction, type OperatingCadence, type OperatingEvaluation, type OperatingExpense, type OperatingPlanBody } from "./operatingPlan";

export type OperatingExpenseGroup = {
  key: string; category: string; label: string; baseline_annual_amount: number | null;
  currency: string | null; basis: string | null; year: string | number | null;
  period_start?: string | null; period_end?: string | null; source_file_ids: string[];
  source_label: string | null; source_fact_keys: string[]; notes: string[];
};
export type OperatingGuidance = {
  policy_version: string;
  business: { name?: string | null; naics_code?: string | null; industry?: string | null; questions?: string[] };
  reporting: { period_start?: string | null; period_end?: string | null; currency?: string | null; basis?: string | null; source_file_id?: string | null; source_label?: string | null };
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

/** Changing a disclosure invalidates linked approvals without losing proposed values. */
export function updateOperatingExpense(body: OperatingPlanBody, id: string, patch: Partial<OperatingExpense>): OperatingPlanBody {
  const old = body.expenses?.find(row => row.id === id);
  if (!old) return body;
  const expense = { ...old, ...patch };
  const priorEvidence = new Set(old.source_file_ids ?? []);
  return { ...body, no_operating_expenses_confirmed: false,
    ...clearCategoryConfirmation(body, old.category || "other", expense.category || "other"),
    expenses: body.expenses?.map(row => row.id === id ? expense : row),
    adjustments: body.adjustments?.map(row => row.expense_row_id !== id ? row : clearOperatingReview({ ...row,
      ...(row.kind === "processing_cost_change" ? {} : row.kind === "marketing_investment" ? { cost_basis: "total" as const, current_amount: operatingExpenseAmount(expense), cadence: expense.cadence ?? "monthly" } : { cost_basis: expense.cost_basis ?? "total", unit_label: expense.unit_label ?? "", current_units_per_period: expense.current_units_per_period,
        current_unit_cost: expense.current_unit_cost, current_fixed_amount: expense.current_fixed_amount, current_amount: expense.cost_basis === "per_unit" ? null : expense.current_amount,
        ...(expense.cost_basis === "per_unit" ? { proposed_amount: null } : {}), cadence: expense.cadence }),
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
