import { describe, expect, it, vi } from "vitest";
import { updateOperatingExpense } from "../operatingGuidance";
import type { OperatingAction, OperatingEvaluation, OperatingPlanBody } from "../operatingPlan";
import { operatingUnitsUsed } from "../operatingUnitPlanning";
import { addOperatingCurrentItem } from "../operatingStep3";
import { documentedHistoricalCorrection, itemizePlannerExpense, plannerSaveIssues, removePlannerItem, setPlannerCommand, switchPlannerUnitProposal, undoPlannerAction, undoPlannerRemoval } from "../recognizablePlan";

type Command = NonNullable<OperatingAction["command"]>;
const command = (patch: Partial<Command> = {}): Command => ({ target: "total_cost", mode: "percent", direction: "decrease", value: "10", allocation: "none", ...patch });
const action = (patch: Partial<OperatingAction> = {}): OperatingAction => ({ id: "change", kind: "expense_reduction", expense_row_id: "parent", label: "Renew premises", driver_key: "negotiated-lease", cadence: "annual", current_amount: 12000, proposed_amount: null, command: command(), implementation_cost: 0, effective_date: "2026-01-01", source_file_ids: ["quote"], explanation: "Preserve proposal rationale", source_note: "Existing quote", status: "approved", reviewed_by_user_id: "staff", reviewed_at: "2026-01-01T00:00:00Z", review_reason: "Prior review", review_source_stamp: "old-stamp", baseline_treatment: "included_in_baseline", baseline_reconciliation_note: "Prior reconciliation", ...patch });
const body = (): OperatingPlanBody => ({ business_name: "Synthetic Company", period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", basis: "cash", projection_start: "2026-01-01", historical_noi: 50000, notes: "Keep handoff notes", category_confirmations: { rent: "confirmed", software: "confirmed" }, expenses: [{ id: "parent", category: "rent", label: "Source rent reference", current_amount: 12000, cadence: "annual", source_group_key: "irs:rent", source_candidate_key: "irs:rent", source_file_ids: ["source"], notes: "Original provenance" }, { id: "other", category: "software", label: "Other item", current_amount: 20, cadence: "monthly", notes: "Other notes" }], adjustments: [] });
const scope = (value: OperatingPlanBody) => ({ expense: value.expenses![0], category: "rent", sourceGroupKey: "irs:rent" });
const evaluation = (status: "balanced" | "unknown" | "unallocated" | "overallocated", childIds = ["child"]): OperatingEvaluation => ({ itemization: [{ parent_expense_row_id: "parent", expense_category: "rent", source_group_key: "irs:rent", reference_annual_amount: status === "unknown" ? null : 12000, children_annual_amount: null, remainder_annual_amount: null, status, child_expense_row_ids: childIds }] } as OperatingEvaluation);

describe("explicit source itemization and recovery", () => {
  it("retains the original reference once and adds an unknown child without guessed amounts or evidence", () => {
    const value = body(); value.adjustments = [action()];
    const before = structuredClone(value);
    const next = itemizePlannerExpense(value, "parent", "child");
    expect(next.expenses?.[0]).toEqual({ ...before.expenses![0], excluded: true });
    expect(next.expenses?.at(-1)).toMatchObject({ id: "child", itemization_parent_id: "parent", category: "rent", source_group_key: "irs:rent", cadence: "annual", current_amount: null, cost_basis: "total", source_file_ids: [] });
    expect(next.adjustments?.[0]).toMatchObject({ id: "change", excluded: true, status: "proposed", review_source_stamp: null });
    expect(next.category_confirmations?.rent).toBeUndefined();
    expect(next.category_confirmations?.software).toBe("confirmed");
    expect(next.historical_noi).toBe(50000);
    expect(value).toEqual(before);
  });

  it("can add a second child to retained lineage without adding the aggregate or duplicating a source total", () => {
    const first = itemizePlannerExpense(body(), "parent", "one");
    first.expenses!.at(-1)!.current_amount = "8000";
    const next = itemizePlannerExpense(first, "parent", "two");
    expect(next.expenses?.filter(row => row.id === "parent")).toHaveLength(1);
    expect(next.expenses?.filter(row => row.itemization_parent_id === "parent").map(row => [row.id, row.current_amount])).toEqual([["one", "8000"], ["two", null]]);
    expect(next.expenses?.[0].excluded).toBe(true);
  });

  it("refuses nested itemization and absent references without mutating the body", () => {
    const value = itemizePlannerExpense(body(), "parent", "child");
    expect(itemizePlannerExpense(value, "child", "grandchild")).toBe(value);
    expect(itemizePlannerExpense(value, "missing", "new")).toBe(value);
  });

  it("clears a stale no-expenses decision when explicitly recovering a source as a split", () => {
    const value = body(); value.no_operating_expenses_confirmed = true; value.expenses![0].excluded = true;
    const next = itemizePlannerExpense(value, "parent", "child");
    expect(next.no_operating_expenses_confirmed).toBe(false);
    expect(next.expenses?.at(-1)?.current_amount).toBeNull();
  });

  it("keeps independent Add current item separate from import dedup and also clears no-expenses", () => {
    const value = body(); value.no_operating_expenses_confirmed = true;
    const group = { key: "rent|irs:rent", category: "rent", sourceGroupKey: "irs:rent", label: "Rent", expenses: value.expenses!, activities: [] };
    const next = addOperatingCurrentItem(value, group, "manual");
    expect(next.no_operating_expenses_confirmed).toBe(false);
    expect(next.expenses?.at(-1)).toMatchObject({ id: "manual", source_group_key: "irs:rent", current_amount: null, source_file_ids: [] });
    expect(next.expenses?.at(-1)?.itemization_parent_id).toBeUndefined();
  });

  it("does not restore the aggregate while active leaf children would be double counted", () => {
    const removed = removePlannerItem(body(), "parent");
    const split = itemizePlannerExpense(removed.body, "parent", "child");
    expect(undoPlannerRemoval(split, removed.undo)).toBe(split);
    split.expenses!.at(-1)!.excluded = true;
    const restored = undoPlannerRemoval(split, removed.undo);
    expect(restored.expenses?.[0].excluded).toBe(false);
    expect(restored.expenses?.at(-1)?.excluded).toBe(true);
  });
});

describe("stable command intent, never a client-side price calculator", () => {
  it("stores a new command and current reference without inventing proposed amounts or setup costs", () => {
    const value = body(), before = structuredClone(value);
    const next = setPlannerCommand(value, scope(value), command(), () => "new-command");
    expect(next.adjustments).toHaveLength(1);
    expect(next.adjustments?.[0]).toMatchObject({ id: "new-command", kind: "expense_reduction", expense_row_id: "parent", current_amount: 12000, proposed_amount: null, proposed_unit_cost: null, proposed_units_per_period: null, implementation_cost: null, effective_date: "2026-01-01", command: command(), source_file_ids: ["source"], status: "proposed" });
    expect(next.expenses).toEqual(before.expenses);
    expect(next.historical_noi).toBe(before.historical_noi);
    expect(value).toEqual(before);
  });

  it("upserts the same identity and preserves custom rationale, zero setup, date and evidence", () => {
    const value = body(); value.adjustments = [action({ effective_date: "2026-05-15" })];
    const create = vi.fn(() => "wrong-new-id");
    const next = setPlannerCommand(value, scope(value), command({ direction: "increase", mode: "amount", value: "150.25" }), create);
    expect(create).not.toHaveBeenCalled();
    expect(next.adjustments).toHaveLength(1);
    expect(next.adjustments?.[0]).toMatchObject({ id: "change", driver_key: "negotiated-lease", label: "Renew premises", kind: "expense_increase", explanation: "Preserve proposal rationale", source_note: "Existing quote", implementation_cost: 0, effective_date: "2026-05-15", source_file_ids: ["quote"], status: "proposed", review_source_stamp: null, command: { direction: "increase", mode: "amount", value: "150.25" } });
    expect(next.adjustments?.[0].proposed_amount).toBeNull();
  });

  it.each([null, "", 0, "0", "12.3400"])("retains raw magnitude %s without zero substitution or formatting", magnitude => {
    const value = body();
    const next = setPlannerCommand(value, scope(value), command({ value: magnitude }), () => "cmd");
    expect(next.adjustments?.[0].command?.value).toBe(magnitude);
    expect(next.adjustments?.[0].proposed_amount).toBeNull();
  });

  it("uses an annual proportional group target without fabricating quantities, unit prices or an item link", () => {
    const value = body();
    const next = setPlannerCommand(value, { category: "rent", sourceGroupKey: "irs:rent", sourceFileIds: ["source"] }, command({ mode: "amount", value: "250", allocation: "proportional" }), () => "group-command");
    expect(next.adjustments?.[0]).toMatchObject({ id: "group-command", kind: "expense_group_change", cadence: "annual", expense_row_id: null, expense_category: "rent", source_group_key: "irs:rent", current_amount: null, proposed_amount: null, source_file_ids: ["source"], command: { allocation: "proportional", value: "250" } });
    expect(next.adjustments?.[0].proposed_units_per_period).toBeNull();
    expect(next.expenses).toEqual(value.expenses);
  });

  it("records annual pricing with source references while leaving absent volume, dates and costs unknown", () => {
    const value = body(); value.projection_start = null; value.currency = "";
    const next = setPlannerCommand(value, { category: "other", sourceGroupKey: "", annualPricing: true, sourceFileIds: ["source"] }, command({ target: "annual_price_revenue", direction: "increase" }), () => "annual-price");
    expect(next.adjustments?.[0]).toMatchObject({ kind: "price_change", price_basis: "annual_revenue", cadence: "annual", expense_row_id: null, current_amount: null, proposed_amount: null, effective_date: null, implementation_cost: null, source_file_ids: ["source"] });
    expect(next.historical_units_annual).toBeUndefined();
    expect(next.historical_revenue_annual).toBeUndefined();
    expect(next.currency).toBe("");
  });

  it("refuses an arbitrary first active duplicate and ignores retained rejected history when upserting", () => {
    const value = body(); value.adjustments = [action(), action({ id: "two" })];
    const create = vi.fn(() => "unexpected");
    expect(setPlannerCommand(value, scope(value), command(), create)).toBe(value);
    expect(create).not.toHaveBeenCalled();
    value.adjustments[0].status = "rejected";
    const rejected = structuredClone(value.adjustments[0]);
    const next = setPlannerCommand(value, scope(value), command({ value: "25" }), create);
    expect(next.adjustments?.[0]).toEqual(rejected);
    expect(next.adjustments?.[1]).toMatchObject({ id: "two", command: { value: "25" } });
  });
});

describe("current dimensions and review invalidation", () => {
  it.each([{ cadence: "monthly" as const }, { cost_basis: "per_unit" as const }, { unit_label: "consultation" }])("requires a new magnitude after changing %j while preserving rejected and annual-group intent", patch => {
    const value = body(); value.adjustments = [action(), action({ id: "rejected", status: "rejected" }), action({ id: "group", kind: "expense_group_change", expense_row_id: null, expense_category: "rent", source_group_key: "irs:rent", command: command({ allocation: "proportional" }) })];
    const rejected = structuredClone(value.adjustments[1]), group = structuredClone(value.adjustments[2]);
    const next = updateOperatingExpense(value, "parent", patch);
    expect(next.adjustments?.[0].command).toEqual({ ...command(), value: null });
    expect(next.adjustments?.[0].status).toBe("proposed");
    expect(next.adjustments?.[0].proposed_amount).toBeNull();
    expect(next.adjustments?.[1]).toEqual(rejected);
    expect(next.adjustments?.[2]).toEqual(group);
  });

  it("keeps the percentage or dollar intent when only current magnitude or notes change", () => {
    const value = body(); value.adjustments = [action()];
    const next = updateOperatingExpense(value, "parent", { current_amount: "13000", notes: "New supported current reference" });
    expect(next.adjustments?.[0].command).toEqual(command());
    expect(next.adjustments?.[0].status).toBe("proposed");
    expect(next.expenses?.[0].current_amount).toBe("13000");
    expect(next.historical_noi).toBe(50000);
  });
});

describe("explicit switch from a command to a physical-unit proposal", () => {
  const units = (): OperatingPlanBody => {
    const value = body();
    Object.assign(value.expenses![0], { cost_basis: "per_unit", unit_label: "consultation", current_amount: 1000, current_units_per_period: 100, current_unit_cost: 8, current_fixed_amount: 200 });
    value.adjustments = [action({ cost_basis: "per_unit", unit_label: "consultation", command: command({ target: "unit_cost" }) }), action({ id: "rejected", status: "rejected" })];
    return value;
  };

  it("copies only the canonical resolved value, retaining current drivers, existing identity, evidence and rejected history", () => {
    const value = units(), before = structuredClone(value);
    const resolved = { action_id: "change", proposed_value: 7.2 } as NonNullable<OperatingEvaluation["commands"]>[number];
    const next = switchPlannerUnitProposal(value, "parent", resolved, () => "unexpected");
    expect(next.expenses).toEqual(before.expenses);
    expect(next.adjustments?.[0]).toMatchObject({ id: "change", cost_basis: "per_unit", unit_label: "consultation", current_units_per_period: 100, current_unit_cost: 8, current_fixed_amount: 200, proposed_units_per_period: 100, proposed_unit_cost: 7.2, proposed_fixed_amount: 200, source_file_ids: ["quote"], source_note: "Existing quote", status: "proposed", review_source_stamp: null });
    expect(next.adjustments?.[0].command).toBeUndefined();
    expect(next.adjustments?.[1]).toEqual(before.adjustments![1]);
    expect(value).toEqual(before);
  });

  it("does not derive a percentage locally or substitute zero for an unknown physical component", () => {
    const value = units(); value.expenses![0].current_fixed_amount = null;
    value.adjustments![0].command = command({ target: "unit_quantity", value: "25" });
    const next = switchPlannerUnitProposal(value, "parent");
    expect(next.adjustments?.[0]).toMatchObject({ proposed_units_per_period: 100, proposed_unit_cost: 8, proposed_fixed_amount: null });
    const wrong = switchPlannerUnitProposal(value, "parent", { action_id: "other-command", proposed_value: 75 } as NonNullable<OperatingEvaluation["commands"]>[number]);
    expect(wrong.adjustments?.[0].proposed_units_per_period).toBe(100);
  });

  it("keeps existing manual proposed quantities/rates/fixed charges when no command is being converted", () => {
    const value = units(); Object.assign(value.adjustments![0], { command: undefined, cost_basis: "per_unit", unit_label: "consultation", cadence: "annual", proposed_units_per_period: "110", proposed_unit_cost: "7", proposed_fixed_amount: "50" });
    const next = switchPlannerUnitProposal(value, "parent");
    expect(next.adjustments?.[0]).toMatchObject({ proposed_units_per_period: "110", proposed_unit_cost: "7", proposed_fixed_amount: "50" });
  });

  it.each([{ cadence: "monthly" as const }, { cost_basis: "total" as const }, { unit_label: "hour" }])("does not reinterpret a prior manual proposal after a current dimension change %j", mismatch => {
    const value = units();
    Object.assign(value.adjustments![0], { command: undefined, cost_basis: "per_unit", unit_label: "consultation", cadence: "annual", proposed_units_per_period: "110", proposed_unit_cost: "7", proposed_fixed_amount: "50", ...mismatch });
    const before = structuredClone(value);
    const next = switchPlannerUnitProposal(value, "parent");
    expect(next.adjustments?.[0]).toMatchObject({ id: "change", cadence: "annual", cost_basis: "per_unit", unit_label: "consultation", proposed_units_per_period: 100, proposed_unit_cost: 8, proposed_fixed_amount: 200, status: "proposed", source_note: "Existing quote", review_source_stamp: null });
    expect(next.adjustments?.[1]).toEqual(before.adjustments![1]);
    expect(next.expenses).toEqual(before.expenses);
    expect(value).toEqual(before);
    value.adjustments![0].command = command({ target: "unit_quantity", value: "25" });
    const oldScopeValue = { action_id: "change", proposed_value: 75 } as NonNullable<OperatingEvaluation["commands"]>[number];
    expect(switchPlannerUnitProposal(value, "parent", oldScopeValue).adjustments?.[0].proposed_units_per_period).toBe(100);
  });

  it("refuses ambiguous active proposals and total-basis rows without creating an action", () => {
    const value = units(); value.adjustments!.push(action({ id: "duplicate" }));
    const create = vi.fn(() => "unexpected");
    expect(switchPlannerUnitProposal(value, "parent", undefined, create)).toBe(value);
    const total = body();
    expect(switchPlannerUnitProposal(total, "parent", undefined, create)).toBe(total);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("scoped reversible removal", () => {
  it("restores the captured item and linked active action without reviving approval or unrelated/rejected history", () => {
    const value = body(); value.adjustments = [action(), action({ id: "rejected", status: "rejected" }), action({ id: "unrelated", expense_row_id: "other" })];
    const removed = removePlannerItem(value, "parent");
    expect(removed.undo).toEqual({ expenseId: "parent", actionIds: ["change"] });
    removed.body.notes = "Later general note";
    removed.body.expenses![0].notes = "Later row note";
    removed.body.adjustments![0].command = command({ value: "25" });
    const next = undoPlannerRemoval(removed.body, removed.undo);
    expect(next.expenses?.[0]).toMatchObject({ id: "parent", excluded: false, notes: "Later row note" });
    expect(next.adjustments?.[0]).toMatchObject({ id: "change", excluded: false, status: "proposed", review_source_stamp: null, command: { value: "25" } });
    expect(next.adjustments?.[1]).toMatchObject({ id: "rejected", excluded: true, status: "rejected" });
    expect(next.adjustments?.[2]).toEqual(value.adjustments[2]);
    expect(next.notes).toBe("Later general note");
  });

  it("does not revive a command rejected or relinked while its old removal notice is visible", () => {
    const value = body(); value.adjustments = [action()];
    const removed = removePlannerItem(value, "parent");
    removed.body.adjustments![0].status = "rejected";
    expect(undoPlannerRemoval(removed.body, removed.undo).adjustments?.[0]).toMatchObject({ excluded: true, status: "rejected" });
    removed.body.adjustments![0] = { ...removed.body.adjustments![0], status: "proposed", expense_row_id: "other" };
    expect(undoPlannerRemoval(removed.body, removed.undo).adjustments?.[0]).toMatchObject({ expense_row_id: "other", excluded: true });
  });

  it("does not overwrite already-restored or newly-deduplicated item state", () => {
    const value = body(), removed = removePlannerItem(value, "parent");
    expect(undoPlannerRemoval(value, removed.undo)).toBe(value);
    removed.body.expenses![0].duplicate_of = "other";
    expect(undoPlannerRemoval(removed.body, removed.undo)).toBe(removed.body);
  });

  it("restores an action using its newest edits and clears review, while refusing rejected or unavailable links", () => {
    const value = body(); value.adjustments = [action({ excluded: true, source_note: "Newer edited evidence", command: command({ value: "7" }) })];
    const next = undoPlannerAction(value, "change");
    expect(next.adjustments?.[0]).toMatchObject({ excluded: false, status: "proposed", review_source_stamp: null, source_note: "Newer edited evidence", command: { value: "7" } });
    value.adjustments[0].status = "rejected";
    expect(undoPlannerAction(value, "change")).toBe(value);
    value.adjustments[0].status = "proposed"; value.expenses![0].excluded = true;
    expect(undoPlannerAction(value, "change")).toBe(value);
  });
});

describe("historical correction and canonical save gates", () => {
  it.each([{ reason: "", evidence_note: "" }, { reason: "R", evidence_note: "Ledger" }, { reason: "Valid reason", evidence_note: " " }])("does not treat incomplete %j as a documented exception", partial => {
    const value = body(); value.historical_corrections = [{ source_group_key: "irs:rent", source_file_ids: [], ...partial }];
    expect(documentedHistoricalCorrection(value, "irs:rent")).toBe(false);
    expect(plannerSaveIssues(value, evaluation("unknown"))).toContain("expenses.parent.itemization.unknown");
    expect(plannerSaveIssues(value, evaluation("balanced")).some(path => path.startsWith("historical_corrections.irs:rent."))).toBe(true);
  });

  it.each(["unallocated", "overallocated", "unknown"] as const)("blocks canonical %s without computing a balancing amount in the client", status => {
    expect(plannerSaveIssues(body(), evaluation(status))).toContain(`expenses.parent.itemization.${status}`);
  });

  it("uses the canonical nonbalanced ledger even when there are no active child IDs", () => {
    expect(plannerSaveIssues(body(), evaluation("unallocated", []))).toContain("expenses.parent.itemization.unallocated");
  });

  it.each([{ reason: "Reconcile classification", source_file_ids: ["source"], evidence_note: "" }, { reason: "Reconcile the allocation", source_file_ids: [], evidence_note: "Signed ledger" }])("allows only the explicitly documented matching exception %j", correction => {
    const value = body(); value.historical_corrections = [{ source_group_key: "irs:rent", ...correction }];
    const before = structuredClone(value);
    expect(documentedHistoricalCorrection(value, "irs:rent")).toBe(true);
    expect(plannerSaveIssues(value, evaluation("unallocated", []))).toEqual([]);
    expect(plannerSaveIssues(value, evaluation("balanced"))).toEqual([]);
    value.historical_corrections![0].source_group_key = "different-scope";
    expect(plannerSaveIssues(value, evaluation("unallocated"))).toContain("expenses.parent.itemization.unallocated");
    expect(before.historical_noi).toBe(value.historical_noi);
  });

  it("returns exact correction field paths and permits X-removal of an unfinished optional record", () => {
    const value = body(); value.historical_corrections = [{ source_group_key: "irs:rent", reason: "R", source_file_ids: [], evidence_note: "" }];
    expect(plannerSaveIssues(value, evaluation("balanced"))).toEqual(expect.arrayContaining(["historical_corrections.irs:rent.reason", "historical_corrections.irs:rent.evidence"]));
    expect(plannerSaveIssues({ ...value, historical_corrections: [] }, evaluation("balanced"))).toEqual([]);
  });
});

describe("annual pricing is independent of unrelated business unit counts", () => {
  it("retains legacy revenue-only unit usage but excludes the explicit annual-pricing basis", () => {
    const value = body(); value.historical_revenue_annual = 100000;
    expect(operatingUnitsUsed(value)).toBe(true);
    const priced = setPlannerCommand(value, { annualPricing: true, category: "other", sourceGroupKey: "" }, command({ target: "annual_price_revenue", direction: "increase", value: null }), () => "price");
    expect(operatingUnitsUsed(priced)).toBe(false);
    priced.adjustments![0].excluded = true;
    expect(operatingUnitsUsed(priced)).toBe(true);
  });

  it.each([{ unit_label: "consultation" }, { historical_units_annual: 0 }, { historical_units_annual: "1200" }])("keeps explicitly used units enabled for %j", patch => {
    const value = body(); Object.assign(value, { historical_revenue_annual: 100000, ...patch });
    value.adjustments = [action({ kind: "price_change", price_basis: "annual_revenue" })];
    expect(operatingUnitsUsed(value)).toBe(true);
  });

  it("keeps explicit volume behaviors and volume actions enabled without changing current disclosures", () => {
    const value = body(), before = structuredClone(value);
    value.expenses![0].volume_behavior = "fixed";
    expect(operatingUnitsUsed(value)).toBe(true);
    value.expenses![0].volume_behavior = "unknown";
    value.adjustments = [action({ kind: "unit_volume" })];
    expect(operatingUnitsUsed(value)).toBe(true);
    expect(before.adjustments).toEqual([]);
    expect(value.expenses?.[0].current_amount).toBe(before.expenses?.[0].current_amount);
  });

  it("read helpers do not mutate state or create proposals on entry", () => {
    const value = body(), before = structuredClone(value);
    operatingUnitsUsed(value); documentedHistoricalCorrection(value, "irs:rent"); plannerSaveIssues(value, evaluation("balanced"));
    expect(value).toEqual(before);
    expect(value.adjustments).toEqual([]);
  });
});
