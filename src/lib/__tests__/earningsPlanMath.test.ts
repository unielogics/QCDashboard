/**
 * The TypeScript plan engine against the Earnings Plan design's own numbers.
 * The same checks run against the Python engine in the backend
 * (app/tests/test_earnings_plan_reference.py): the two must not drift.
 */
import { describe, expect, it } from "vitest";
import { Plan, changeKey, evaluate, number, startMonth } from "@/lib/earningsPlan/math";
import type { PlanChange } from "@/lib/earningsPlan/types";
import { QUESTIONS, REFERENCE, referenceBaseline, referenceBody } from "./fixtures/earningsPlanReferencePlan";

const EXPECTED = REFERENCE.expected;
const KINDS: Record<string, string> = { chg: "change", gr: "growth", na: "activity" };
const near = (value: number | null | undefined, expected: number) => expect(value).toBeCloseTo(expected, 3);
const nearAll = (got: Record<string, number>, expected: Record<string, number>) => {
  expect(Object.keys(got).sort()).toEqual(Object.keys(expected).sort());
  for (const [key, value] of Object.entries(expected)) near(got[key], value);
};
const result = evaluate(referenceBody(), referenceBaseline(), { goal: REFERENCE.plan.noi_goal, questions: QUESTIONS });

describe("earnings plan engine: the design's reference plan", () => {
  it("reproduces the source through the revenue model and reads each line's rate", () => {
    nearAll(result.model.volume, EXPECTED.model.volume);
    nearAll(result.model.revenue, EXPECTED.model.revenue);
    near(result.model.total, EXPECTED.model.total);
    expect(result.model.reconciles).toBe(true);
    for (const [key, value] of Object.entries(EXPECTED.rates)) expect(result.rates[key]).toBeCloseTo(value, 6);
    expect([result.behaviors.c1, result.behaviors.c2, result.behaviors.sal]).toEqual(["unit", "pct", "fixed"]);
  });

  it("keeps each item's area, start month and review state", () => {
    const got = new Map(result.items.map(row => [row.id, row]));
    expect(got.size).toBe(EXPECTED.items.length);
    for (const expected of EXPECTED.items) {
      const row = got.get(expected.id)!;
      expect([row.kind, row.area, row.start_month, row.included, row.reviewed]).toEqual([KINDS[expected.kind], expected.area, expected.start, expected.included, expected.reviewed]);
    }
  });

  it.each(["proposed", "reviewed"] as const)("matches the design's run-rate %s scenario", view => {
    const expected = EXPECTED[view], got = result[view];
    for (const key of ["revenue", "cogs", "opex", "noi", "ebitda", "activity_spend"] as const) near(got[key], expected[key]);
    nearAll(got.lines, expected.lines);
    nearAll(got.stream_revenue, expected.stream_revenue);
    nearAll(got.stream_volume, expected.stream_volume);
    for (const [stream, values] of Object.entries(expected.factors)) values.forEach((value, index) => near(got.factors[stream][index], value));
  });

  it.each(["proposed", "reviewed"] as const)("counts the first year from each change's start month (%s)", view => {
    result.months[view].forEach((month, index) => {
      near(month.ebitda, EXPECTED.months[view][index].ebitda);
      near(month.noi, EXPECTED.months[view][index].noi);
    });
    near(result.first_year[view].ebitda, EXPECTED.first_year[view].ebitda);
    near(result.first_year[view].noi, EXPECTED.first_year[view].noi);
  });

  it("shows for each change what the plan loses without it", () => {
    for (const [id, expected] of Object.entries(EXPECTED.effects)) {
      near(result.effects[id].ebitda, expected.ebitda);
      near(result.effects[id].revenue, expected.revenue);
      near(result.effects[id].first_year, expected.first_year);
    }
  });

  it("gives leave-one-out section totals and a bridge that adds up", () => {
    result.sections.forEach((section, index) => near(section.ebitda, EXPECTED.sections[index]));
    for (const [view, scenario] of [["proposed", "proposed_with_terms"], ["reviewed", "reviewed_with_terms"]] as const) {
      const expected = REFERENCE.scenarios[scenario].bridge;
      expect(result.bridge[view].map(row => row.label)).toEqual(expected.map(row => row.label));
      result.bridge[view].forEach((row, index) => near(row.value, expected[index].value));
      // Cumulative, so it lands exactly on the plan figure.
      near(REFERENCE.baseline.ebitda + result.bridge[view].reduce((sum, row) => sum + row.value, 0), result[view].ebitda);
    }
    // Changes interact, so the sections' own totals do not add up to the plan.
    const sections = result.sections.reduce((sum, row) => sum + row.ebitda, 0);
    expect(Math.abs(sections - (result.proposed.ebitda - REFERENCE.baseline.ebitda))).toBeGreaterThan(1);
  });

  it.each([
    ["proposed_with_terms", "proposed", "with_terms"],
    ["reviewed_with_terms", "reviewed", "with_terms"],
    ["proposed_current_debt", "proposed", "current_debt"],
  ] as const)("gives the six metrics before and after (%s)", (scenario, view, debt) => {
    const expected = new Map(REFERENCE.scenarios[scenario].metrics.map(row => [row.label, row]));
    const today = result.metrics.today.current_debt, after = result.metrics[view][debt]!;
    for (const [label, key] of [["EBITDA", "ebitda"], ["NOI", "noi"], ["DSCR", "dscr"], ["Free cash flow", "free_cash_flow"], ["Operating margin", "operating_margin"], ["Debt service", "debt_service"]] as const) {
      near(today[key], expected.get(label)!.before);
      near(after[key], expected.get(label)!.after);
    }
  });

  it("reads the goal, the released cash and what is still to find for 1.25x", () => {
    near(result.goal.amount, EXPECTED.goal.amount);
    near(result.goal.proposed_gap, EXPECTED.goal.gap);
    const released = REFERENCE.scenarios.proposed_with_terms.released;
    near(result.released.available_monthly, released.available_monthly);
    near(result.released.allocated_monthly, released.allocated_monthly);
    expect(result.released.over_allocated).toBe(false);
    expect(Math.round(result.target.proposed!)).toBe(39_103);
  });

  it("lists what is left to finish once, in the steps' order", () => {
    expect(result.to_finish.map(row => [row.label, row.step])).toEqual(EXPECTED.to_finish.map(row => [row.label, row.step]));
    expect(result.to_finish.map(row => row.code)).toEqual([
      "confirm_source", "confirm_source", "confirm_source", "answer_category", "answer_category", "explain_change", "explain_change", "attest",
    ]);
  });
});

describe("earnings plan engine: behaviour around the edges", () => {
  it("reproduces the baseline exactly when nothing is proposed", () => {
    const body = { ...referenceBody(), changes: [], growth: [], activities: [] };
    const empty = evaluate(body, referenceBaseline());
    for (const view of ["proposed", "reviewed"] as const) {
      near(empty[view].ebitda, REFERENCE.baseline.ebitda);
      near(empty[view].noi, REFERENCE.baseline.noi);
      near(empty[view].revenue, REFERENCE.baseline.revenue);
    }
    for (const row of empty.bridge.proposed) expect(Math.abs(row.value)).toBeLessThan(1e-6);
  });

  it("starts from the source's own figures even when its lines are not fully itemized", () => {
    const body = { ...referenceBody(), changes: [], growth: [], activities: [] };
    body.lines = body.lines.filter(line => line.id !== "rep");
    const partial = evaluate(body, referenceBaseline());
    near(partial.proposed.noi, REFERENCE.baseline.noi);
    near(partial.proposed.ebitda, REFERENCE.baseline.ebitda);
  });

  it("drops a switched-off or rejected change from the plan and keeps its own effect", () => {
    const baseline = referenceBaseline();
    const full = evaluate(referenceBody(), baseline);
    const off = referenceBody();
    const rent = off.changes.find(row => row.id === "l:rent")!;
    rent.included = false;
    const without = evaluate(off, baseline);
    near(full.proposed.ebitda - without.proposed.ebitda, 28_805);
    near(without.effects["l:rent"].ebitda, 28_805);
    expect(without.items.find(row => row.id === "l:rent")!.included).toBe(false);
    rent.included = true;
    rent.status = "rejected";
    const rejected = evaluate(off, baseline);
    near(rejected.proposed.ebitda, without.proposed.ebitda);
    near(rejected.reviewed.ebitda, without.reviewed.ebitda);
  });

  it("applies overall pricing and whole-group changes", () => {
    const body = { ...referenceBody(), growth: [], activities: [] };
    const words = { start_month: 1, setup_cost: null, setup_cadence: "one_time" as const, evidence_note: "", owner: "", included: true, status: "proposed" as const };
    body.changes = [
      { ...words, id: "pricing", target: { kind: "pricing" }, direction: "up", mode: "percent", value: 2, note: "List prices rise 2%." },
      { ...words, id: "g:oth", target: { kind: "group", group: "oth" }, direction: "down", mode: "amount", value: 2_092, note: "Trim other costs." },
    ] satisfies PlanChange[];
    const priced = evaluate(body, referenceBaseline());
    // 2% on every stream; the percent-of-revenue lines (fleet parts, card processing) follow revenue up.
    near(priced.proposed.revenue, 1_236_000 * 1.02);
    near(priced.proposed.lines.c2, 118_800 * 1.02);
    // The group moves in proportion: card processing first follows revenue, then both lines share the cut.
    near(priced.proposed.lines.o1 + priced.proposed.lines.o2, 24_720 * 1.02 + 2_372 - 2_092);
    near(priced.proposed.lines.o1 / priced.proposed.lines.o2, (24_720 * 1.02) / 2_372);
    expect(priced.items.map(row => row.area)).toEqual([0, 4]);
    expect(priced.bridge.proposed[0].label).toBe("Pricing");
    expect(priced.bridge.proposed[0].value).toBeGreaterThan(0);
  });

  it("reads typed text the way it reads saved numbers, and never blanks on half-typed input", () => {
    expect([number("12."), number("1,250.50"), number(""), number("."), number(null), number(Number.NaN), number("abc")]).toEqual([12, 1250.5, 0, 0, 0, 0, 0]);
    const body = referenceBody();
    // The price increase is being retyped: the field is empty for a moment.
    body.changes.find(row => row.id === "f:s1:1")!.value = "";
    const midEdit = evaluate(body, referenceBaseline());
    expect(Number.isFinite(midEdit.proposed.ebitda)).toBe(true);
    expect(Number.isFinite(midEdit.metrics.proposed.with_terms!.dscr!)).toBe(true);
    near(midEdit.effects["f:s1:1"].ebitda, 0);
    // A stream with no figures yet is zero revenue, not an error.
    body.streams.push({ id: "s9", name: "New stream", type: "units", added: true, factors: [{ id: "f0", label: "Units sold", value: "", unit: "units / mo", volume: true }, { id: "f1", label: "Price per unit", value: "", unit: "$", volume: false }] });
    const grown = evaluate(body, referenceBaseline());
    expect(grown.model.revenue.s9).toBe(0);
    expect(grown.model.reconciles).toBe(true);
  });

  it("keeps one change per place and reads a start month from anything", () => {
    const body = referenceBody();
    const duplicate: PlanChange = { ...body.changes.find(row => row.id === "l:rent")!, id: "second", value: 100_000 };
    body.changes.push(duplicate);
    const plan = new Plan(body, referenceBaseline());
    expect(plan.items.filter(item => item.key === "l:rent").map(item => item.id)).toEqual(["l:rent"]);
    expect(changeKey({ target: { kind: "factor", stream_id: "s1", factor_id: "f1" } })).toBe("f:s1:f1");
    expect([startMonth({ start_month: "3" }), startMonth({ start_month: 0 }), startMonth({ start_month: 40 }), startMonth({}), startMonth({ start_month: "x" })]).toEqual([3, 1, 12, 1, 1]);
  });

  it("has no ratios without debt and no terms figures without saved terms", () => {
    const baseline = { ...referenceBaseline(), debt_service_current: null, debt_service_with_terms: null };
    const bare = evaluate(referenceBody(), baseline);
    expect(bare.metrics.proposed.with_terms).toBeNull();
    expect(bare.metrics.proposed.current_debt.dscr).toBeNull();
    expect(bare.target.proposed).toBeNull();
    expect(bare.released.available_monthly).toBe(0);
    near(bare.proposed.ebitda, result.proposed.ebitda);
  });

  it("asks for the earnings source first when the file has none", () => {
    const baseline = { ...referenceBaseline(), available: false, revenue: null, cogs: null, operating_expenses: null, noi: null, ebitda: null, groups: [] };
    const body = { ...referenceBody(), streams: [], lines: [], changes: [], growth: [], activities: [], attestation: true };
    expect(evaluate(body, baseline, { questions: [] }).to_finish.map(row => row.code)).toEqual(["no_source"]);
  });
});
