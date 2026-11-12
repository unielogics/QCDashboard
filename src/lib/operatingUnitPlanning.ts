import { clearOperatingReview, type OperatingAction, type OperatingEvaluation, type OperatingPlanBody } from "./operatingPlan";
import type { OperatingGuidance } from "./operatingGuidance";

export const operatingUnitAction = (body: OperatingPlanBody) => body.adjustments?.find(row => row.kind === "unit_volume" && !row.excluded && !row.duplicate_of);
export const operatingUnitsUsed = (body: OperatingPlanBody) => Boolean(body.unit_label?.trim() || body.historical_units_annual != null || body.historical_revenue_annual != null || operatingUnitAction(body) || body.expenses?.some(row => !row.excluded && !row.duplicate_of && row.volume_behavior && row.volume_behavior !== "unknown"));
export const operatingUnitPeriodMatches = (body: OperatingPlanBody) => {
  if (!body.period_start || !body.period_end || body.historical_units_period_start !== body.period_start || body.historical_units_period_end !== body.period_end) return false;
  const days = (Date.parse(`${body.period_end}T00:00:00Z`) - Date.parse(`${body.period_start}T00:00:00Z`)) / 86400000 + 1;
  return days >= 364 && days <= 366;
};

/** Offer an explicit copy only when the saved source identifies the same period and basis. */
export function operatingSourceRevenue(body: OperatingPlanBody, evaluation?: OperatingEvaluation | null, guidance?: OperatingGuidance | null): number | null {
  const source = guidance?.reporting, baseline = evaluation?.baseline;
  if (!baseline || baseline.revenue == null || !source?.period_start || !source.period_end || source.year == null || !source.currency || !source.basis || source.basis === "unknown") return null;
  return source.period_start === body.period_start && source.period_end === body.period_end && String(source.year) === baseline.period && source.currency === body.currency && source.currency === baseline.currency && source.basis === body.basis && source.basis === baseline.basis ? baseline.revenue : null;
}

function clearVolumeReviews(body: OperatingPlanBody): OperatingPlanBody {
  return { ...body, adjustments: body.adjustments?.map(row => row.kind === "unit_volume" ? clearOperatingReview(row) : row) };
}

/** Binding counts to a year is a deliberate edit, never an import/read side effect. */
export function updateOperatingUnitDisclosure(body: OperatingPlanBody, patch: Pick<Partial<OperatingPlanBody>, "unit_label" | "historical_units_annual" | "historical_revenue_annual">, bindPeriod = false): OperatingPlanBody {
  return clearVolumeReviews({ ...body, ...patch, ...(bindPeriod ? { historical_units_period_start: body.period_start || null, historical_units_period_end: body.period_end || null } : {}) });
}


/** An explicit edit can convert an action; its old expense quantities remain historical only. */
export function normalizeOperatingUnitAction(row: OperatingAction): OperatingAction {
  return row.kind === "unit_volume" ? { ...row, cadence: "annual", cost_basis: "total", expense_row_id: null } : row;
}

export function proposeOperatingUnitVolume(body: OperatingPlanBody, patch: Partial<OperatingAction>, id: () => string): OperatingPlanBody {
  const existing = operatingUnitAction(body);
  const next = clearOperatingReview(normalizeOperatingUnitAction({ ...(existing ? {} : { driver_key: "business_service_volume", effective_date: body.projection_start || null }), ...existing, id: existing?.id ?? id(), kind: "unit_volume" as const, label: existing?.label || "Annual business unit change", unit_change_mode: existing?.unit_change_mode ?? "absolute", unit_change_value: existing?.unit_change_value ?? null, ...patch, cadence: "annual" as const, excluded: false, duplicate_of: null }));
  return { ...body, adjustments: existing ? body.adjustments?.map(row => row.id === existing.id ? next : row) : [...body.adjustments ?? [], next] };
}

export function invalidateOperatingUnitVolume(body: OperatingPlanBody): OperatingPlanBody {
  return operatingUnitAction(body) ? clearVolumeReviews(body) : body;
}

export function operatingUnitMissingLabel(path: string, body: OperatingPlanBody): string {
  if (path.includes("historical_unit_reporting_period") || path.includes("historical_units_period") || path.includes("period_start") || path.includes("period_end")) return "Confirm a full reporting year and explicitly bind the units to that period.";
  if (path.includes("historical_units_annual")) return "Enter a positive annual unit count to calculate unit economics.";
  if (path.includes("historical_revenue_annual.source_reconciliation")) return "Reconcile annual revenue to the saved reporting source amount.";
  if (path.includes("historical_revenue_annual")) return "Confirm revenue for the same full reporting year.";
  if (path.includes("unit_label")) return "Define what one business unit means.";
  if (path.includes("volume_behavior")) { const row = body.expenses?.find(item => path.includes(item.id)); return `${row?.label || "Expense"}: choose how this cost changes with business volume.`; }
  if (path.includes("current_fixed_amount")) { const row = body.expenses?.find(item => path.includes(item.id)); return `${row?.label || "Mixed expense"}: confirm its fixed cost portion for the entered frequency.`; }
  if (path.includes("unit_volume_duplicate")) return "Keep one annual business unit action; remove or exclude duplicate volume actions.";
  if (path.includes("annual_cadence")) return "Use annual frequency for the business unit action.";
  if (path.includes("recurring_annual_amount")) return "Confirm this expense’s current amount, quantity and frequency.";
  if (path.includes("nonnegative_proposed_units")) return "Reduce the unit decrease so the proposed annual count is not negative.";
  if (path.includes("expenses_or_no_expenses")) return "Disclose the current expenses or explicitly confirm there are none.";
  if (path.includes("unit_change_value")) return "Enter the proposed unit change.";
  return path.replaceAll("_", " ");
}
