import { normalizeOperatingPlanBody, operatingNumber, OPERATING_NUMERIC_FIELDS, type OperatingEvaluation, type OperatingPlanBody } from "./operatingPlan";
export type OperatingDraftAction = { action_id: string; expense_row_id?: string | null; kind?: string; math_status: "calculated" | "incomplete" | "conflict" | "outside_operating"; gross_annual_delta: number | null; gross_monthly_run_rate_delta: number | null; gross_one_time_delta?: number | null; net_annual_delta: number | null; first_year_delta: number | null; math_missing: string[]; qualification_missing: string[]; source_issues: string[]; fix_fields?: string[] };
export type OperatingDraftFeedback = { basis: "before_implementation_costs_and_timing"; actions: OperatingDraftAction[]; summary: { status: "no_changes" | "incomplete" | "source_blocked" | "calculated"; complete: boolean; current_noi?: number | null; currency?: string | null; noi_currency?: string | null; source_comparable?: boolean | null; source_issues?: string[]; notes?: string[]; known_gross_annual_subtotal: number | null; gross_annual_delta: number | null; gross_monthly_run_rate_delta: number | null; draft_noi: number | null; draft_noi_delta: number | null; draft_gap: number | null; qualified_noi_delta: number | null; qualified_first_year_noi_delta: number | null; dscr_current_debt_before: number | null; dscr_current_debt_after: number | null; dscr_current_debt_delta: number | null; qualified_dscr_current_debt_after?: number | null; qualified_dscr_current_debt_delta?: number | null; qualified_first_year_dscr_current_debt_after?: number | null; qualified_first_year_dscr_current_debt_delta?: number | null; missing: string[] } };
export type OperatingDraftSaveStatus = { state: "saved" | "saving" | "unsaved" | "error"; at?: string | null; error?: string; retry?: () => void; reload?: () => void };
export type OperatingCalculationStatus = { pending: boolean; at?: string | null; error?: string; retry?: () => void; invalid?: string[] };
/** Comparison only: ACK defaults/key ordering do not restart the same calculation. Array order, explicit zero and non-default intent remain significant. */
export function operatingPlanContentKey(body: OperatingPlanBody): string {
  const defaults: Record<string, unknown> = { cost_basis: "total", price_basis: "per_unit", unit_change_mode: "absolute", implementation_cost_cadence: "one_time", current_processing_rate_basis: "unknown", proposed_processing_rate_basis: "unknown", baseline_treatment: "unreconciled", volume_behavior: "unknown" };
  const canonical = (value: unknown, key = ""): unknown => {
    if (key in defaults && value === defaults[key]) return undefined;
    if (value == null || value === "" || value === false && ["excluded", "no_operating_expenses_confirmed", "client_attestation"].includes(key) || value === true && key === "essential" || value === "proposed" && key === "status") return undefined;
    if (Array.isArray(value)) return value.length ? value.map(item => canonical(item) ?? null) : undefined;
    if (typeof value === "object") { const rows = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([name, input]) => [name, canonical(input, name)] as const).filter(([, input]) => input !== undefined); return rows.length ? Object.fromEntries(rows) : undefined; }
    return value;
  };
  return JSON.stringify(canonical(normalizeOperatingPlanBody(body)) || {});
}
/** Invalid punctuation is retained locally; unknown/blank values remain valid draft inputs. */
export function operatingNumericProblems(body: OperatingPlanBody): string[] {
  const result: string[] = [], invalid = (input: unknown) => typeof input === "string" && input.trim() !== "" && operatingNumber(input) == null;
  for (const key of ["historical_units_annual", "historical_revenue_annual"]) if (invalid(body[key])) result.push(key);
  for (const collection of ["expenses", "adjustments"] as const) for (const row of body[collection] || []) {
    if (row.excluded || row.duplicate_of) continue;
    for (const key of OPERATING_NUMERIC_FIELDS) if (invalid((row as Record<string, unknown>)[key])) result.push(`${collection}.${row.id}.${key}`);
    if (collection === "adjustments" && invalid((row as { command?: { value?: unknown } }).command?.value)) result.push(`${collection}.${row.id}.command.value`);
  }
  for (const row of body.released_cash_flow?.allocations || []) if (invalid(row.amount_monthly)) result.push(`released_cash_flow.allocations.${row.id}.amount_monthly`);
  return result;
}
/** Select canonical values only; no projection, sum, percentage or difference is calculated here. */
export function operatingWorkingFeedback(evaluation?: OperatingEvaluation | null) {
  const feedback = evaluation?.draft_feedback, summary = feedback?.summary;
  if (!summary) return null;
  const safe = summary.complete && summary.status !== "source_blocked" && summary.source_comparable !== false;
  const qualified = safe && summary.qualified_noi_delta != null && evaluation?.projection.proposed.noi != null;
  const ratioReady = summary.complete && summary.status !== "incomplete";
  const qualifiedRatio = qualified || summary.qualified_dscr_current_debt_after != null || summary.qualified_dscr_current_debt_delta != null;
  return { dscrBasis: qualifiedRatio ? "qualified" as const : "draft" as const, basis: qualified ? "qualified" as const : summary.status === "no_changes" ? "unchanged" as const : "draft" as const, complete: summary.complete, sourceBlocked: summary.status === "source_blocked" || summary.source_comparable === false,
    current: "current_noi" in summary ? summary.current_noi ?? null : evaluation?.baseline.noi ?? null, after: qualified ? evaluation!.projection.proposed.noi : safe ? summary.draft_noi : null,
    delta: safe ? qualified ? summary.qualified_noi_delta : summary.draft_noi_delta : null,
    gap: safe ? qualified ? evaluation?.goal_progress?.proposed_gap ?? null : summary.draft_gap : null,
    grossAnnual: summary.gross_annual_delta, grossMonthly: summary.gross_monthly_run_rate_delta, knownSubtotal: summary.known_gross_annual_subtotal,
    firstYearDelta: safe ? summary.qualified_first_year_noi_delta : null, dscrBefore: summary.dscr_current_debt_before, dscrAfter: ratioReady ? qualifiedRatio ? summary.qualified_dscr_current_debt_after ?? null : summary.dscr_current_debt_after : null, dscrDelta: ratioReady ? qualifiedRatio ? summary.qualified_dscr_current_debt_delta ?? null : summary.dscr_current_debt_delta : null, firstYearDscrAfter: ratioReady ? summary.qualified_first_year_dscr_current_debt_after ?? null : null, firstYearDscrDelta: ratioReady ? summary.qualified_first_year_dscr_current_debt_delta ?? null : null,
    currency: "noi_currency" in summary ? summary.noi_currency : evaluation?.baseline.noi_governance ? evaluation.baseline.noi_governance.currency : evaluation?.baseline && "noi_currency" in evaluation.baseline ? evaluation.baseline.noi_currency : evaluation?.baseline.currency, mathCurrency: summary.currency, missing: summary.missing };
}
export function operatingFeedbackLabel(field: string) {
  const text = field.toLowerCase();
  if (/annual_debt_service|debt_service_currency/.test(text)) return "Review saved debt payments";
  if (text.includes("source") && !text.includes("source_note") && !text.includes("source_file_ids")) return "Review source";
  if (text.includes("implementation")) return "Enter setup cost";
  if (text.includes("effective") || text.includes("projection_start")) return "Set start date";
  if (text.includes("explanation")) return "Explain the change";
  if (text.includes("source_note") || text.includes("source_file_ids") || text.includes("evidence")) return "Add supporting details";
  if (text.includes("command") || text.includes("proposed")) return "Enter the planned change";
  if (text.includes("current") || text.includes("unit_cost") || text.includes("quantity")) return "Confirm current cost";
  if (text.includes("label") || text.includes("name")) return "Name this change";
  return "Review change inputs";
}
