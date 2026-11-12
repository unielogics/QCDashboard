import { describe, expect, it, vi } from "vitest";
import { illustrativeActionImpact, type OperatingEvaluation, type OperatingPlanBody } from "../operatingPlan";
import type { OperatingGuidance } from "../operatingGuidance";
import { invalidateOperatingUnitVolume, normalizeOperatingUnitAction, operatingSourceRevenue, operatingUnitAction, operatingUnitMissingLabel, operatingUnitPeriodMatches, operatingUnitsUsed, proposeOperatingUnitVolume, updateOperatingUnitDisclosure } from "../operatingUnitPlanning";

function plan(): OperatingPlanBody {
  return {
    business_name: "Example business", period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", basis: "cash",
    unit_label: "completed visit", historical_units_annual: "1000", historical_revenue_annual: "100000",
    historical_units_period_start: "2025-01-01", historical_units_period_end: "2025-12-31", notes: "Retain this business explanation",
    expenses: [{ id: "delivery", category: "cogs", current_amount: "2050", cadence: "monthly", cost_basis: "per_unit", unit_label: "delivery hour", current_units_per_period: "200", current_unit_cost: "10", current_fixed_amount: "50", volume_behavior: "mixed", source_file_ids: ["business-source"], notes: "Physical hours remain separate from visits" }],
    adjustments: [
      { id: "volume", kind: "unit_volume", label: "Additional visits", driver_key: "service-capacity", cadence: "annual", unit_change_mode: "absolute", unit_change_value: "200", source_file_ids: ["business-source", "capacity-evidence"], source_note: "Current capacity and collections", explanation: "Add appointments within existing capacity", owner_name: "Operations", implementation_cost: "250", implementation_cost_cadence: "one_time", effective_date: "2026-04-01", status: "approved", reviewed_by_user_id: "reviewer", reviewed_at: "2026-01-01T00:00:00Z", review_source_stamp: "saved-review", review_reason: "Prior review", baseline_treatment: "included_in_baseline", baseline_reconciliation_note: "Current year reconciled" },
      { id: "fixed-cost", kind: "expense_reduction", status: "approved", review_source_stamp: "independent-review", explanation: "Separate fixed-cost negotiation" },
    ],
  };
}

describe("annual business-unit disclosure and proposal edits", () => {
  it("never prices a converted volume action from retained legacy expense totals", () => {
    const result = illustrativeActionImpact({ id: "converted-volume", kind: "unit_volume", current_amount: 1000,
      proposed_amount: 800, cadence: "annual", implementation_cost: 0 });
    expect(result).toBeNull();
  });

  it("normalizes an explicitly converted volume action without changing its retained evidence or physical expense", () => {
    const body = plan();
    const oldExpense = structuredClone(body.expenses![0]);
    const action = { ...body.adjustments![0], cost_basis: "per_unit" as const, cadence: "monthly" as const,
      expense_row_id: "delivery", current_units_per_period: "200", current_unit_cost: "10", current_fixed_amount: "50" };
    const before = structuredClone(action);
    const result = normalizeOperatingUnitAction(action);
    expect(result).toMatchObject({ kind: "unit_volume", cadence: "annual", cost_basis: "total", expense_row_id: null,
      current_units_per_period: "200", current_unit_cost: "10", current_fixed_amount: "50", source_file_ids: ["business-source", "capacity-evidence"] });
    expect(action).toEqual(before);
    expect(body.expenses![0]).toEqual(oldExpense);
    expect(illustrativeActionImpact(result)).toBeNull();
  });

  it("leaves ordinary per-unit expense actions on their original basis and cadence", () => {
    const action = { id: "rent", kind: "expense_reduction" as const, cadence: "monthly" as const,
      cost_basis: "per_unit" as const, expense_row_id: "delivery" };
    expect(normalizeOperatingUnitAction(action)).toBe(action);
  });
  it("leaves an untouched legacy plan outside the unit model", () => {
    const body: OperatingPlanBody = { expenses: [], adjustments: [], notes: "Legacy" };
    expect(operatingUnitsUsed(body)).toBe(false);
    expect(invalidateOperatingUnitVolume(body)).toBe(body);
    expect(body).toEqual({ expenses: [], adjustments: [], notes: "Legacy" });
  });

  it("recognizes explicit zero units as a disclosed value without converting it to unknown", () => {
    expect(operatingUnitsUsed({ historical_units_annual: 0 })).toBe(true);
    const body = updateOperatingUnitDisclosure({}, { historical_units_annual: 0 });
    expect(body.historical_units_annual).toBe(0);
    expect(body.historical_units_period_start).toBeUndefined();
    expect(body.historical_units_period_end).toBeUndefined();
  });

  it("preserves the old year binding when current reporting dates change", () => {
    const body = { ...plan(), period_start: "2026-01-01", period_end: "2026-12-31" };
    const before = structuredClone(body);
    const result = updateOperatingUnitDisclosure(body, { unit_label: "collected visit" });
    expect(result.historical_units_annual).toBe("1000");
    expect(result.historical_units_period_start).toBe("2025-01-01");
    expect(result.historical_units_period_end).toBe("2025-12-31");
    expect(operatingUnitPeriodMatches(result)).toBe(false);
    expect(body).toEqual(before);
  });

  it("binds a deliberately confirmed count to the current period and clears only volume review", () => {
    const body = { ...plan(), period_start: "2026-01-01", period_end: "2026-12-31" };
    const before = structuredClone(body);
    const result = updateOperatingUnitDisclosure(body, { historical_units_annual: "1200.5" }, true);
    expect(result).toMatchObject({ historical_units_annual: "1200.5", historical_units_period_start: "2026-01-01", historical_units_period_end: "2026-12-31" });
    expect(operatingUnitPeriodMatches(result)).toBe(true);
    expect(result.adjustments![0]).toMatchObject({ status: "proposed", reviewed_by_user_id: null, reviewed_at: null, review_source_stamp: null, review_reason: "", baseline_treatment: "unreconciled", baseline_reconciliation_note: "" });
    expect(result.adjustments![1]).toBe(body.adjustments![1]);
    expect(result.expenses).toBe(body.expenses);
    expect(result.notes).toBe(body.notes);
    expect(body).toEqual(before);
  });

  it.each([
    ["2025-01-01", "2025-12-31"], ["2024-01-01", "2024-12-31"], ["2025-01-01", "2025-12-30"],
  ])("accepts a fully bound annual reporting period %s–%s", (start, end) => {
    expect(operatingUnitPeriodMatches({ period_start: start, period_end: end, historical_units_period_start: start, historical_units_period_end: end })).toBe(true);
  });

  it.each([
    { ...plan(), historical_units_period_start: null },
    { ...plan(), period_end: "2025-06-30", historical_units_period_end: "2025-06-30" },
    { ...plan(), period_end: "2026-12-31", historical_units_period_end: "2026-12-31" },
    { ...plan(), historical_units_period_end: "2024-12-31" },
  ])("does not confirm missing, partial, multi-year or stale unit reporting dates", body => {
    expect(operatingUnitPeriodMatches(body)).toBe(false);
  });

  it("creates one annual action without manufacturing business evidence or changing physical row quantities", () => {
    const body = { ...plan(), adjustments: [] };
    const before = structuredClone(body);
    const result = proposeOperatingUnitVolume(body, { unit_change_mode: "percent", unit_change_value: "20" }, () => "new-volume");
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments![0]).toMatchObject({ id: "new-volume", kind: "unit_volume", cadence: "annual", unit_change_mode: "percent", unit_change_value: "20", status: "proposed", excluded: false, duplicate_of: null });
    expect(result.adjustments![0].source_file_ids).toBeUndefined();
    expect(result.expenses).toBe(body.expenses);
    expect(result.expenses![0]).toMatchObject({ current_units_per_period: "200", current_unit_cost: "10", current_fixed_amount: "50", current_amount: "2050" });
    expect(body).toEqual(before);
  });

  it("upserts the existing annual action while preserving its evidence, implementation and business intent", () => {
    const body = plan();
    const before = structuredClone(body);
    const mintId = vi.fn(() => "should-not-mint");
    const result = proposeOperatingUnitVolume(body, { unit_change_mode: "percent", unit_change_value: "10", cadence: "monthly" }, mintId);
    expect(mintId).not.toHaveBeenCalled();
    expect(result.adjustments).toHaveLength(2);
    expect(result.adjustments![0]).toMatchObject({ id: "volume", kind: "unit_volume", label: "Additional visits", driver_key: "service-capacity", cadence: "annual", unit_change_mode: "percent", unit_change_value: "10", source_file_ids: ["business-source", "capacity-evidence"], source_note: "Current capacity and collections", explanation: "Add appointments within existing capacity", owner_name: "Operations", implementation_cost: "250", implementation_cost_cadence: "one_time", effective_date: "2026-04-01", status: "proposed", review_source_stamp: null });
    const repeated = proposeOperatingUnitVolume(result, { unit_change_value: "12" }, mintId);
    expect(repeated.adjustments!.filter(row => row.kind === "unit_volume" && !row.excluded)).toHaveLength(1);
    expect(repeated.adjustments![1]).toBe(body.adjustments![1]);
    expect(body).toEqual(before);
  });

  it("gives a new volume action a stable driver and only the explicitly saved projection date", () => {
    const body: OperatingPlanBody = { projection_start: "2026-04-01", adjustments: [] };
    const result = proposeOperatingUnitVolume(body, { unit_change_value: "100" }, () => "volume");
    expect(result.adjustments![0]).toMatchObject({ driver_key: "business_service_volume", effective_date: "2026-04-01", cadence: "annual", status: "proposed" });
    expect(result.adjustments![0].implementation_cost).toBeUndefined();
    expect(result.adjustments![0].source_file_ids).toBeUndefined();
    expect(body).toEqual({ projection_start: "2026-04-01", adjustments: [] });
  });

  it("keeps a missing effective date unknown instead of inventing today's date", () => {
    const result = proposeOperatingUnitVolume({}, {}, () => "volume");
    expect(result.adjustments![0]).toMatchObject({ driver_key: "business_service_volume", effective_date: null });
    const custom = proposeOperatingUnitVolume(plan(), {}, () => "unused");
    expect(custom.adjustments![0]).toMatchObject({ driver_key: "service-capacity", effective_date: "2026-04-01" });
  });

  it("preserves intentionally cleared existing driver and date rather than reapplying creation defaults", () => {
    const body = plan();
    body.projection_start = "2026-07-01";
    body.adjustments![0] = { ...body.adjustments![0], driver_key: "", effective_date: null };
    const result = proposeOperatingUnitVolume(body, { unit_change_value: "100" }, () => "unused");
    expect(result.adjustments![0]).toMatchObject({ driver_key: "", effective_date: null });
  });

  it("does not silently restore an excluded or duplicate historical action", () => {
    const body = plan();
    body.adjustments![0] = { ...body.adjustments![0], excluded: true };
    body.adjustments!.push({ id: "old-duplicate", kind: "unit_volume", duplicate_of: "old", status: "proposed" });
    expect(operatingUnitAction(body)).toBeUndefined();
    const result = proposeOperatingUnitVolume(body, { unit_change_value: "100" }, () => "fresh-volume");
    expect(result.adjustments![0]).toBe(body.adjustments![0]);
    expect(result.adjustments![2]).toBe(body.adjustments![2]);
    expect(operatingUnitAction(result)?.id).toBe("fresh-volume");
  });

  it("invalidates volume approval after a cost edit without changing rates, notes or unrelated reviews", () => {
    const body = plan();
    const before = structuredClone(body);
    const result = invalidateOperatingUnitVolume(body);
    expect(result.adjustments![0].status).toBe("proposed");
    expect(result.adjustments![1]).toBe(body.adjustments![1]);
    expect(result.expenses).toBe(body.expenses);
    expect(result.adjustments![0].source_file_ids).toEqual(body.adjustments![0].source_file_ids);
    expect(body).toEqual(before);
  });

  it.each([
    ["historical_unit_reporting_period", "bind the units"],
    ["historical_units_annual.positive", "positive annual unit count"],
    ["historical_revenue_annual.source_reconciliation", "saved reporting source"],
    ["historical_revenue_annual", "same full reporting year"],
    ["unit_label", "one business unit"],
    ["expenses.delivery.volume_behavior", "choose how this cost changes"],
    ["expenses.delivery.current_fixed_amount", "fixed cost portion"],
    ["adjustments.volume.unit_change_value", "proposed unit change"],
  ])("explains the required repair for %s", (path, explanation) => {
    expect(operatingUnitMissingLabel(path, plan())).toContain(explanation);
  });
});

function sourceContext(revenue: number | null = 100000): { body: OperatingPlanBody; evaluation: OperatingEvaluation; guidance: OperatingGuidance } {
  const total = { annual_impact: null, monthly_impact: null, first_year_impact: null, one_time_cost: null, complete: false, count: 0 };
  const projection = { earnings: null, noi: null, dscr_current: null, dscr_with_refinance: null, annual_debt_service: null, refinance_annual_debt_service: null, target_gap_current: null, target_gap_refinance: null };
  return {
    body: plan(),
    evaluation: { baseline: { period: "2025", currency: "USD", basis: "cash", revenue, earnings: null, earnings_kind: null, noi: null, dscr: null, annual_debt_service: null, provisional: true },
      disclosure: { operating_monthly: null, cogs_monthly: null, operating_cash_monthly: null, non_operating_monthly: null, one_time_total: null, active_count: 0, excluded_count: 0, missing_inputs: [], complete: false },
      actions: [], totals: { proposed: total, approved: total }, projection: { proposed: projection, approved: projection }, missing: [], risk_flags: [], notes: [], all_actions_reviewed: false },
    guidance: { policy_version: "synthetic", business: { name: "Example business" }, reporting: { period_start: "2025-01-01", period_end: "2025-12-31", year: 2025, currency: "USD", basis: "cash" }, expense_groups: [], essentials: [], action_templates: [], warnings: [] },
  };
}

describe("explicit source-revenue adoption gate", () => {
  it.each([0, 100000])("offers known revenue %s only from the matching saved reporting context", revenue => {
    const values = sourceContext(revenue);
    const before = structuredClone(values);
    expect(operatingSourceRevenue(values.body, values.evaluation, values.guidance)).toBe(revenue);
    expect(values).toEqual(before); // The helper never overwrites manual revenue or infers units.
  });

  it.each(["source_start", "source_end", "source_year", "baseline_year", "source_currency", "body_currency", "baseline_currency", "source_basis", "body_basis", "baseline_basis", "unknown_basis", "unknown_currency"])("rejects %s instead of mixing source and plan scopes", change => {
    const { body, evaluation, guidance } = sourceContext();
    if (change === "source_start") guidance.reporting.period_start = "2024-01-01";
    if (change === "source_end") guidance.reporting.period_end = "2025-06-30";
    if (change === "source_year") guidance.reporting.year = 2024;
    if (change === "baseline_year") evaluation.baseline.period = "2024";
    if (change === "source_currency") guidance.reporting.currency = "CAD";
    if (change === "body_currency") body.currency = "CAD";
    if (change === "baseline_currency") evaluation.baseline.currency = "CAD";
    if (change === "source_basis") guidance.reporting.basis = "accrual";
    if (change === "body_basis") body.basis = "accrual";
    if (change === "baseline_basis") evaluation.baseline.basis = "accrual";
    if (change === "unknown_basis") guidance.reporting.basis = "unknown";
    if (change === "unknown_currency") guidance.reporting.currency = null;
    expect(operatingSourceRevenue(body, evaluation, guidance)).toBeNull();
  });

  it("keeps missing revenue and absent source context unknown", () => {
    const { body, evaluation, guidance } = sourceContext(null);
    expect(operatingSourceRevenue(body, evaluation, guidance)).toBeNull();
    expect(operatingSourceRevenue(body, null, guidance)).toBeNull();
    expect(operatingSourceRevenue(body, evaluation, null)).toBeNull();
  });
});
