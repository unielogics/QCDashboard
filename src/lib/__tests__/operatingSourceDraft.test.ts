import { describe, expect, it, vi } from "vitest";
import { draftOperatingSourceCosts, type OperatingExpenseGroup, type OperatingGuidance } from "../operatingGuidance";
import type { OperatingPlanBody } from "../operatingPlan";

const group = (extra: Partial<OperatingExpenseGroup> = {}): OperatingExpenseGroup => ({
  key: "source:tax:rent", category: "rent", label: "Rent", baseline_annual_amount: 12000,
  currency: "USD", basis: "cash", year: 2025, period_start: "2025-01-01", period_end: "2025-12-31",
  source_file_ids: ["tax-source"], source_label: "Business return", source_fact_keys: ["rent"], notes: ["Confirm current costs"], ...extra,
});
const guidance = (...groups: OperatingExpenseGroup[]): OperatingGuidance => ({
  policy_version: "operating-guidance-v1", business: { name: "Example LLC" },
  reporting: { period_start: "2025-01-01", period_end: "2025-12-31", year: 2025, currency: "USD", basis: "cash" },
  expense_groups: groups.length ? groups : [group()], essentials: [], action_templates: [], warnings: [],
});
const nextId = () => { let counter = 0; return () => `new-${++counter}`; };
const existing = (extra: OperatingPlanBody = {}): OperatingPlanBody => ({
  business_name: "Example LLC", period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", basis: "cash",
  notes: "Keep my notes", expenses: [], adjustments: [], ...extra,
});

describe("explicit drafting from known source costs", () => {
  it("fills only missing source headers and drafts annual costs without changing assumptions or source data", () => {
    const source = guidance();
    const original = structuredClone(source);
    const body: OperatingPlanBody = { business_name: "  ", basis: "unknown", notes: "Retain this note",
      projection_start: "2027-04-01", adjustments: [{ id: "proposal", kind: "price_change", proposed_unit_price: "12.50", status: "approved", review_reason: "Keep untouched review" }] };
    const before = structuredClone(body);
    const result = draftOperatingSourceCosts(body, source, nextId());
    expect(result).toMatchObject({ added: 1, linked: 0, skipped: 0 });
    expect(result.filled_fields).toEqual(["business_name", "period_start", "period_end", "currency", "basis"]);
    expect(result.body).toMatchObject({ business_name: "Example LLC", period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", basis: "cash", notes: "Retain this note", projection_start: "2027-04-01" });
    expect(result.body.expenses![0]).toMatchObject({ current_amount: 12000, cadence: "annual", source_group_key: group().key, source_candidate_key: group().key, source_file_ids: ["tax-source"] });
    expect(result.body.adjustments).toBe(body.adjustments);
    expect(body).toEqual(before);
    expect(source).toEqual(original);
  });

  it("keeps known headers and proposed inputs, and never uses a current date as a reporting or projection period", () => {
    const body = existing({ business_name: "Trading name", projection_start: null });
    const result = draftOperatingSourceCosts(body, guidance(), nextId());
    expect(result.filled_fields).toEqual([]);
    expect(result.body.business_name).toBe("Trading name");
    expect(result.body.projection_start).toBeNull();
  });

  it.each(["period_start", "period_end", "currency", "basis"] as const)("blocks the complete action on a conflicting known %s", field => {
    const body = existing({ [field]: field === "currency" ? "EUR" : field === "basis" ? "accrual" : "2024-01-01" });
    const id = vi.fn(() => "unused");
    const result = draftOperatingSourceCosts(body, guidance(), id);
    expect(result.blocked_reason).toContain("conflicts");
    expect(result.body).toBe(body);
    expect(result.filled_fields).toEqual([]);
    expect(result.added).toBe(0);
    expect(id).not.toHaveBeenCalled();
  });

  it("recognizes explicit zero, skips unknown/invalid annual amounts and does not book bank hints", () => {
    const source = { ...guidance(group({ baseline_annual_amount: 0 }), group({ key: "unknown", category: "marketing", baseline_annual_amount: null }),
      group({ key: "invalid", category: "supplies", baseline_annual_amount: Number.NaN })),
      expense_candidates: [{ key: "bank:vendor", category: "other", current_amount: 999 }] };
    const result = draftOperatingSourceCosts(existing(), source, nextId());
    expect(result).toMatchObject({ added: 1, skipped: 2 });
    expect(result.body.expenses).toHaveLength(1);
    expect(result.body.expenses![0].current_amount).toBe(0);
    expect(result.reasons.every(reason => reason.includes("unknown"))).toBe(true);
  });

  it("deduplicates repeated guidance, repeat clicks and candidate-linked rows", () => {
    const source = guidance(group(), group());
    const first = draftOperatingSourceCosts(existing(), source, nextId());
    expect(first).toMatchObject({ added: 1, skipped: 1 });
    const id = vi.fn(() => "unused");
    const second = draftOperatingSourceCosts(first.body, source, id);
    expect(second.body).toBe(first.body);
    expect(second).toMatchObject({ added: 0, linked: 0, skipped: 2 });
    expect(id).not.toHaveBeenCalled();
    const candidate = existing({ expenses: [{ id: "retained", category: "rent", source_candidate_key: group().key, current_amount: "999.25", cadence: "monthly" }] });
    expect(draftOperatingSourceCosts(candidate, guidance(), nextId()).body).toBe(candidate);
  });

  it("retains scoped granular splits instead of adding their aggregate source total", () => {
    const body = existing({ expenses: [{ id: "a", category: "rent", source_group_key: group().key, current_amount: 500, cadence: "monthly" },
      { id: "b", category: "rent", source_group_key: group().key, current_amount: 500, cadence: "monthly" }] });
    const result = draftOperatingSourceCosts(body, guidance(), nextId());
    expect(result.body).toBe(body);
    expect(result).toMatchObject({ added: 0, linked: 0, skipped: 1 });
    expect(result.reasons[0]).toContain("splits were retained");
  });

  it("never resurrects excluded or duplicate source costs", () => {
    const body = existing({ expenses: [{ id: "removed", category: "rent", source_group_key: group().key, excluded: true, current_amount: 12000, cadence: "annual" }] });
    const result = draftOperatingSourceCosts(body, guidance(), nextId());
    expect(result.body).toBe(body);
    expect(result.reasons[0]).toContain("restore it explicitly");
  });

  it("links a unique equal manual annual cost while retaining notes, raw values, cadence and all proposed drivers", () => {
    const body = existing({ expenses: [{ id: "manual", category: "rent", current_amount: "1,000.00", cadence: "monthly", notes: "My breakdown", source_file_ids: ["bank-source"], source_candidate_key: "bank:rent" }],
      adjustments: [{ id: "linked", kind: "expense_reduction", expense_row_id: "manual", current_amount: "1000.00", proposed_amount: "875.25", cadence: "monthly", explanation: "Keep this proposal", status: "approved", reviewed_by_user_id: "reviewer", review_source_stamp: "old-stamp", source_file_ids: ["quote"] },
        { id: "unrelated", kind: "price_change", proposed_unit_price: "19.75", status: "approved", review_reason: "Keep review" }] });
    const before = structuredClone(body);
    const result = draftOperatingSourceCosts(body, guidance(), nextId());
    expect(result).toMatchObject({ added: 0, linked: 1, skipped: 0 });
    expect(result.body.expenses![0]).toMatchObject({ current_amount: "1,000.00", cadence: "monthly", notes: "My breakdown", source_group_key: group().key, source_candidate_key: "bank:rent", source_file_ids: ["bank-source", "tax-source"] });
    expect(result.body.adjustments![0]).toMatchObject({ current_amount: "1000.00", proposed_amount: "875.25", cadence: "monthly", explanation: "Keep this proposal", status: "proposed", reviewed_by_user_id: null, review_source_stamp: null, source_file_ids: ["quote", "bank-source", "tax-source"] });
    expect(result.body.adjustments![1]).toBe(body.adjustments![1]);
    expect(body).toEqual(before);
  });

  it("retains granular proposed amounts when an equal unit-based manual cost gains source provenance", () => {
    const body = existing({ expenses: [{ id: "manual", category: "rent", cost_basis: "per_unit", current_units_per_period: "10", current_unit_cost: "100", current_fixed_amount: "0", cadence: "monthly" }],
      adjustments: [{ id: "proposal", expense_row_id: "manual", cost_basis: "per_unit", proposed_amount: "900", proposed_units_per_period: "9", proposed_unit_cost: "100", proposed_fixed_amount: "0", status: "approved" }] });
    const result = draftOperatingSourceCosts(body, guidance(), nextId());
    expect(result.linked).toBe(1);
    expect(result.body.adjustments![0]).toMatchObject({ proposed_amount: "900", proposed_units_per_period: "9", proposed_unit_cost: "100", proposed_fixed_amount: "0", status: "proposed" });
  });

  it.each(["different", "unknown", "split", "one_time", "old_source", "excluded_manual"])("skips an unreconciled %s category instead of adding an aggregate duplicate", fault => {
    const body = existing({ expenses: [{ id: "manual", category: "rent", current_amount: 900, cadence: "monthly" }] });
    if (fault === "unknown") body.expenses![0].current_amount = null;
    if (fault === "split") body.expenses!.push({ id: "second", category: "rent", current_amount: 100, cadence: "monthly" });
    if (fault === "one_time") body.expenses![0].cadence = "one_time";
    if (fault === "old_source") body.expenses![0].source_group_key = "source:older:return";
    if (fault === "excluded_manual") body.expenses![0].excluded = true;
    const result = draftOperatingSourceCosts(body, guidance(), nextId());
    expect(result.body).toBe(body);
    expect(result).toMatchObject({ added: 0, linked: 0, skipped: 1 });
  });

  it("requires manual reconciliation when multiple payroll source groups share an unscoped row", () => {
    const source = guidance(group({ key: "source:wages", category: "salaries", label: "Employee wages" }),
      group({ key: "source:officers", category: "salaries", label: "Officer compensation" }));
    const body = existing({ expenses: [{ id: "payroll", category: "salaries", current_amount: 12000, cadence: "annual" }] });
    const result = draftOperatingSourceCosts(body, source, nextId());
    expect(result).toMatchObject({ added: 0, linked: 0, skipped: 2 });
    expect(result.body).toBe(body);
    expect(result.reasons.every(reason => reason.includes("multiple source groups"))).toBe(true);
  });

  it("adds distinct payroll source groups once when there is no unscoped manual total", () => {
    const source = guidance(group({ key: "source:wages", category: "salaries" }), group({ key: "source:officers", category: "salaries" }));
    const result = draftOperatingSourceCosts(existing(), source, nextId());
    expect(result).toMatchObject({ added: 2, linked: 0, skipped: 0 });
    expect(result.body.expenses!.map(row => row.source_group_key)).toEqual(["source:wages", "source:officers"]);
  });

  it("preserves explicit no-expense and not-applicable decisions", () => {
    const noCosts = existing({ no_operating_expenses_confirmed: true });
    expect(draftOperatingSourceCosts(noCosts, guidance(), nextId()).body).toBe(noCosts);
    const notApplicable = existing({ category_confirmations: { rent: "not_applicable" } });
    expect(draftOperatingSourceCosts(notApplicable, guidance(), nextId()).body).toBe(notApplicable);
  });

  it("treats an omitted expense category as the schema's other category when checking manual duplicates", () => {
    const body = existing({ expenses: [{ id: "manual", current_amount: 500, cadence: "monthly" }] });
    const result = draftOperatingSourceCosts(body, guidance(group({ category: "other" })), nextId());
    expect(result.body).toBe(body);
    expect(result).toMatchObject({ added: 0, linked: 0, skipped: 1 });
  });

  it("keeps a discarded empty default placeholder excluded while drafting a real tax Other source cost", () => {
    const placeholder = { id: "empty", category: "other", label: "", current_amount: null, cadence: "monthly" as const, excluded: true };
    const body = existing({ expenses: [placeholder] });
    const result = draftOperatingSourceCosts(body, guidance(group({ key: "source:tax:licenses", category: "other", label: "Taxes and licenses" })), nextId());
    expect(result).toMatchObject({ added: 1, linked: 0, skipped: 0 });
    expect(result.body.expenses).toHaveLength(2);
    expect(result.body.expenses![0]).toBe(placeholder);
    expect(result.body.expenses![0]).toMatchObject({ excluded: true, current_amount: null });
    expect(result.body.expenses![1]).toMatchObject({ category: "other", label: "Taxes and licenses", current_amount: 12000, source_group_key: "source:tax:licenses" });
    for (const change of [{ notes: "Removed intentionally" }, { current_amount: 0 }, { source_file_ids: ["source"] }, { label: "Prior cost" }]) {
      const removed = existing({ expenses: [{ ...placeholder, ...change }] });
      expect(draftOperatingSourceCosts(removed, guidance(group({ category: "other" })), nextId()).body).toBe(removed);
    }
  });

  it("skips incompatible source-group scope and refuses a known source year conflict without inventing dates", () => {
    const result = draftOperatingSourceCosts(existing(), guidance(group({ year: 2024 })), nextId());
    expect(result).toMatchObject({ added: 0, skipped: 1 });
    const source = guidance(); source.reporting.period_start = null; source.reporting.period_end = null;
    const body = existing({ period_start: "2026-01-01", period_end: "2026-12-31" });
    expect(draftOperatingSourceCosts(body, source, nextId())).toMatchObject({ body, added: 0, blocked_reason: expect.stringContaining("reporting year") });
  });

  it("returns a blocked unchanged body when no source groups are available", () => {
    const body = existing();
    expect(draftOperatingSourceCosts(body, null, nextId())).toMatchObject({ body, added: 0, blocked_reason: expect.any(String) });
  });
});
