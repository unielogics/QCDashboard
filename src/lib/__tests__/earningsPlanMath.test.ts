/**
 * The TypeScript plan engine against the Earnings Plan design's own numbers.
 * The same checks run against the Python engine in the backend
 * (app/tests/test_earnings_plan_reference.py): the two must not drift.
 */
import { describe, expect, it } from "vitest";
import { Plan, changeKey, evaluate, number, startMonth } from "@/lib/earningsPlan/math";
import type { PlanChange } from "@/lib/earningsPlan/types";
import { QUESTIONS, REFERENCE, measuredBody, referenceBaseline, referenceBody } from "./fixtures/earningsPlanReferencePlan";

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

  it("lets a cost that follows revenue be changed by dollars a year", () => {
    // The same figures as the backend's test_earnings_plan_reference.py.
    const body = { ...referenceBody(), growth: [], activities: [] };
    const words = { start_month: 1, setup_cost: null, setup_cadence: "one_time" as const, evidence_note: "", owner: "", included: true, status: "proposed" as const, note: "Agreed with the owner." };
    body.changes = [
      { ...words, id: "pricing", target: { kind: "pricing" }, direction: "up", mode: "percent", value: 2 },
      // Card processing is 2.0% of all revenue ($24,720 on the source): $4,720 a year less is $20,000 at the source's revenue.
      { ...words, id: "l:o1", target: { kind: "line", line_id: "o1" }, direction: "down", mode: "annual", value: 4_720 },
      // Detail supplies are $105 a unit on 3,600 units ($378,000): $18,000 a year less is $100 a unit.
      { ...words, id: "l:c1", target: { kind: "line", line_id: "c1" }, direction: "down", mode: "annual", value: 18_000 },
      // A fixed cost has no driver: dollars a year is simply the amount.
      { ...words, id: "l:sal", target: { kind: "line", line_id: "sal" }, direction: "down", mode: "annual", value: 30_194 },
    ] satisfies PlanChange[];
    const lines = evaluate(body, referenceBaseline()).proposed.lines;
    // The new rate follows the driver: revenue is 2% higher, so the percent-of-revenue cost is too; volume did not move.
    near(lines.o1, 20_000 * 1.02);
    near(lines.c1, 360_000);
    near(lines.sal, 318_000);
    // Without the pricing change the cost lands exactly on the dollars asked for.
    const card = (patch: Partial<PlanChange>) => evaluate({ ...body, changes: [{ ...body.changes[1], ...patch }] }, referenceBaseline()).proposed.lines.o1;
    near(card({}), 20_000);
    // Raising works the same way, typed text reads like a number, and a cut larger than the cost stops at zero.
    near(card({ direction: "up", value: "5280" }), 30_000);
    expect(card({ value: 99_000 })).toBe(0);
  });

  it("takes operating costs the loan itself adds off coverage with the terms, and off nothing else", () => {
    // The same figures as the backend's test_earnings_plan_consumers.py: (182,896.64 - 12,000) / 177,600.
    const costly = evaluate(referenceBody(), { ...referenceBaseline(), loan_operating_annual: 12_000 }, { goal: REFERENCE.plan.noi_goal, questions: QUESTIONS });
    const withTerms = costly.metrics.proposed.with_terms!;
    near(withTerms.ebitda, 182_896.64);
    near(withTerms.noi, 174_496.64);
    near(withTerms.dscr, 170_896.64 / 177_600);
    near(withTerms.free_cash_flow, -6_703.36);
    near(withTerms.operating_margin, result.metrics.proposed.with_terms!.operating_margin!);
    near(costly.metrics.today.with_terms!.dscr, (-22_377 - 12_000) / 177_600);
    near(costly.metrics.reviewed.with_terms!.free_cash_flow, 52_164 - 12_000 - 177_600);
    near(costly.target.proposed, 51_103.36);
    expect(costly.debt_service.loan_operating).toBe(12_000);
    // Against today's debt the loan does not exist, so neither do its costs.
    expect(costly.metrics.proposed.current_debt).toEqual(result.metrics.proposed.current_debt);
    expect(costly.proposed).toEqual(result.proposed);
    // Without saved terms there is no loan to bring them.
    const none = evaluate(referenceBody(), { ...referenceBaseline(), debt_service_with_terms: null, loan_operating_annual: 12_000 }, { questions: QUESTIONS });
    expect([none.debt_service.loan_operating, none.metrics.proposed.with_terms]).toEqual([0, null]);
    near(none.target.proposed, 1.25 * 777_600 - 182_896.64);
    expect(result.debt_service.loan_operating).toBe(0);
  });

  it("asks for the earnings source first when the file has none", () => {
    const baseline = { ...referenceBaseline(), available: false, revenue: null, cogs: null, operating_expenses: null, noi: null, ebitda: null, groups: [] };
    const body = { ...referenceBody(), streams: [], lines: [], changes: [], growth: [], activities: [], attestation: true };
    expect(evaluate(body, baseline, { questions: [] }).to_finish.map(row => row.code)).toEqual(["no_source"]);
  });
});

// Revenue is the known figure: a stream states it, and the price of one unit comes from dividing.
// The same figures as the backend's test_earnings_plan_reference.py.
describe("earnings plan engine: revenue stated, price by division", () => {
  const words = { start_month: 1, setup_cost: null, setup_cadence: "one_time" as const, evidence_note: "", owner: "", included: true, status: "proposed" as const, note: "Agreed with the owner." };
  const metric = (factorId: string, direction: "up" | "down", value: number, mode: PlanChange["mode"] = "percent", streamId = "s1"): PlanChange =>
    ({ ...words, id: `f:${streamId}:${factorId}`, target: { kind: "factor", stream_id: streamId, factor_id: factorId }, direction, mode, value });
  const nearUnit = (got: { quantity: number; revenue: number; cost: number; noi: number } | null, expected: [number, number, number, number]) => {
    near(got?.quantity, expected[0]);
    near(got?.revenue, expected[1]);
    near(got?.cost, expected[2]);
    near(got?.noi, expected[3]);
  };

  it("divides a stream that is all revenue by its volume", () => {
    const measured = evaluate(measuredBody(), referenceBaseline());
    // $1,236,000 a year is $103,000 a month: 400 units a month is $257.50 a unit, 1,200 hours a month $85.83 an hour.
    expect([measured.model.total, measured.model.reconciles, measured.model.difference]).toEqual([1_236_000, true, 0]);
    expect(measured.model.revenue).toEqual({ s1: 1_236_000 });
    expect(measured.model.volume).toEqual({ s1: 4_800 });
    expect(measured.model.measures).toEqual({ "s1:f2": 14_400 });
    expect(measured.model.factors).toEqual({ s1: [400, 257.5, 1_200] });
    // Supplies are a cost per unit, wages a cost per labor hour, card processing a share of revenue.
    near(measured.rates.c1, 78.75);
    near(measured.rates.sal, 348_194 / 14_400);
    near(measured.rates.o1, 0.02);
    expect(measured.behaviors.sal).toBe("unit");
    // With nothing proposed the plan is the source, to the dollar.
    near(measured.proposed.noi, -30_777);
    near(measured.proposed.revenue, 1_236_000);
    const [volume, hours] = measured.per_unit;
    expect([volume.stream_id, volume.factor_id, hours.factor_id]).toEqual(["s1", null, "f2"]);
    // Every cost on the source ($601,886 + $664,891) over the same units: one unit costs more than it brings in.
    nearUnit(volume.today, [4_800, 257.5, 263.911875, -6.411875]);
    nearUnit(hours.today, [14_400, 85.8333333333, 87.970625, -2.1372916667]);
    nearUnit(volume.proposed, [4_800, 257.5, 263.911875, -6.411875]);
    nearUnit(hours.reviewed, [14_400, 85.8333333333, 87.970625, -2.1372916667]);
  });

  it("lets volume, price and a measure alongside each move what follows them", () => {
    const body = { ...measuredBody(), changes: [metric("f0", "up", 10), metric("f2", "down", 5), metric("f1", "up", 5, "amount")] };
    const moved = evaluate(body, referenceBaseline());
    const plan = moved.proposed;
    // 440 units at $262.50; hours follow the units and are then cut 5% (1,200 x 1.1 x 0.95 a month).
    [440, 262.5, 1_140].forEach((value, index) => near(plan.factors.s1[index], value));
    near(plan.stream_volume.s1, 5_280);
    near(plan.measures["s1:f2"], 15_048);
    near(plan.revenue, 1_386_000);
    near(plan.lines.c1, 415_800);
    near(plan.lines.sal, 363_862.73);
    near(plan.lines.o1, 27_720);
    near(plan.noi, 62_754.27);
    const [volume, hours] = moved.per_unit;
    nearUnit(volume.proposed, [5_280, 262.5, 250.6147215909, 11.8852784091]);
    nearUnit(hours.proposed, [15_048, 92.1052631579, 87.9349900319, 4.170273126]);
    // Nothing here is reviewed, so the reviewed figures stay where the source is.
    nearUnit(volume.reviewed, [4_800, 257.5, 263.911875, -6.411875]);
    // Cutting hours alone moves the wages that follow them and nothing else.
    const alone = evaluate({ ...body, changes: [metric("f2", "down", 5)] }, referenceBaseline()).proposed;
    near(alone.revenue, 1_236_000);
    near(alone.lines.sal, 348_194 * 0.95);
    near(alone.lines.c1, 378_000);
    near(alone.noi, -30_777 + 348_194 * 0.05);
  });

  it("keeps the streams adding up to the source while one holds the rest", () => {
    const base = referenceBaseline();
    const body = measuredBody();
    const streams = (monthly: number | string | null, units: number | string | null = 300): typeof body.streams => [
      { id: "s1", name: "Other revenue", type: "custom", remainder: true, factors: [{ id: "f1", label: "Revenue per month", value: null, unit: "$", volume: false }] },
      { id: "s2", name: "Detail packages", type: "units", monthly_revenue: monthly, factors: [
        { id: "f0", label: "Units sold", value: units, unit: "units / mo", volume: true }, { id: "f1", label: "Price per unit", value: null, unit: "$", volume: false }] },
    ];
    const plan = { ...body, streams: streams(75_000), lines: body.lines.map(line => ({ ...line, behavior: "fixed" as const, link: "all", measure: null })) };
    const model = evaluate(plan, base).model;
    // $75,000 a month over 300 units is $250 a unit; the other stream is what is left of $103,000 a month.
    expect(model.revenue).toEqual({ s1: 336_000, s2: 900_000 });
    expect([model.total, model.reconciles]).toEqual([1_236_000, true]);
    expect(model.factors).toEqual({ s1: [28_000], s2: [300, 250] });
    expect(model.volume).toEqual({ s1: 0, s2: 3_600 });
    // A stream with nothing to divide by has no per-unit figures; the measured one carries its share of the costs.
    const rows = evaluate(plan, base).per_unit;
    expect(rows.map(row => [row.stream_id, row.factor_id])).toEqual([["s2", null]]);
    nearUnit(rows[0].today, [3_600, 250, 256.2251213592, -6.2251213592]);
    // The source changes: the stated stream keeps what it states and the rest follows.
    const moved = evaluate(plan, { ...base, revenue: 1_300_000 }).model;
    expect([moved.revenue, moved.reconciles]).toEqual([{ s1: 400_000, s2: 900_000 }, true]);
    // A stream with no volume typed yet still brings its revenue, and a change to that volume has nothing to move.
    const unmeasured = evaluate({ ...plan, streams: streams("75000", ""), changes: [metric("f0", "up", 10, "percent", "s2")] }, base);
    expect([unmeasured.model.revenue.s2, unmeasured.model.volume.s2, unmeasured.model.factors.s2]).toEqual([900_000, 0, [0, 75_000]]);
    near(unmeasured.proposed.revenue, 1_236_000);
    expect(unmeasured.per_unit).toEqual([]);
    // A price change on the stream that holds the rest moves that stream alone.
    const priced = evaluate({ ...plan, changes: [metric("f1", "up", 10)] }, base).proposed.stream_revenue;
    near(priced.s1, 369_600);
    near(priced.s2, 900_000);
    // Streams that state more than the source leave nothing for the rest, and the model says by how much it is over.
    const over = evaluate({ ...plan, streams: streams(110_000) }, base);
    expect([over.model.revenue, over.model.difference, over.model.reconciles]).toEqual([{ s1: 0, s2: 1_320_000 }, 84_000, false]);
    expect(over.to_finish.filter(item => item.step === 1).map(item => item.code)).toEqual(["reconcile_revenue"]);
    // An empty revenue box is nothing stated yet, exactly as the API reads the saved plan: the stream counts for nothing.
    const empty = evaluate({ ...plan, streams: streams("") }, base).model;
    expect([empty.revenue, empty.reconciles]).toEqual([{ s1: 1_236_000, s2: 0 }, true]);
  });

  it("gives a plan described as units times price its per-unit figures too", () => {
    // The design's three streams: $250 a unit, $1,500 a contract, $100 an hour, each carrying its share of every cost.
    const rows = Object.fromEntries(result.per_unit.map(row => [row.stream_id, row]));
    expect(result.per_unit.map(row => row.factor_id)).toEqual([null, null, null]);
    nearUnit(rows.s1.today, [3_600, 250, 256.2251213592, -6.2251213592]);
    near(rows.s2.today.revenue, 1_500);
    near(rows.s3.today.revenue, 100);
    nearUnit(rows.s1.proposed, [4_080, 262, 231.5407474683, 30.4592525317]);
    // Shared by revenue, the streams' costs add back up to every cost on the source.
    near(result.per_unit.reduce((sum, row) => sum + row.today.cost * row.today.quantity, 0), 601_886 + 664_891);
    // One sale a month, as plans were once seeded, counts nothing: there is no per-unit figure to print.
    const reference = referenceBody();
    const seeded = {
      ...reference, changes: [], growth: [], activities: [], lines: reference.lines.map(line => ({ ...line, behavior: "fixed" as const, link: "all" })),
      streams: [{ id: "s1", name: "All revenue", type: "custom" as const, factors: [
        { id: "f0", label: "Sales", value: 1, unit: "count", volume: true }, { id: "f1", label: "Revenue per month", value: 103_000, unit: "$", volume: false }] }],
    };
    const old = evaluate(seeded, referenceBaseline());
    expect([old.model.total, old.per_unit]).toEqual([1_236_000, []]);
  });
});

