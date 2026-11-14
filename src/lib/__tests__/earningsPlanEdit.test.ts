/** Edits to the working copy of an earnings plan: what is sent to the API, and the rules the API applies too. */
import { describe, expect, it } from "vitest";
import {
  addActivity, addAllocation, addChange, addGrowth, addLine, addMeasure, addStream, adoptReviews, amount, answerCategory, balanceRevenue, confirmGroup,
  findItem, modelKey, modernize, patchAllocation, patchItem, remainderStream, removeAllocation, removeFactor, removeItem, removeLine, removeStream, renameStream,
  resolveCarriedOver, restoreItem, restoreSourceAmount, saveCorrection, setAttestation, setFactor, setGrowthStream, setLine, setLineBehavior,
  setLineLink, setNotes, setPlanStart, setStreamRevenue, settleReviews, toWire, withoutStaleReviews,
} from "@/lib/earningsPlan/edit";
import { evaluate } from "@/lib/earningsPlan/math";
import type { EarningsPlanBody } from "@/lib/earningsPlan/types";
import { REFERENCE, STREAM_TEMPLATES, measuredBody, referenceBaseline, referenceBody } from "./fixtures/earningsPlanReferencePlan";

const baseline = referenceBaseline();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const statusOf = (body: EarningsPlanBody, id: string) => findItem(body, id)!.row.status;

describe("earnings plan edits: what the API receives", () => {
  it("sends every figure as a number and never a half-typed string", () => {
    const body = referenceBody();
    body.changes[0].value = "12.";
    body.changes[1].value = "";
    body.growth[0].setup_cost = "1,500";
    body.lines[0].base = "";
    body.source.corrections = { utl: { amount: "12900", reason: "One-off repair" } };
    const wire = toWire(body);
    expect([wire.changes[0].value, wire.changes[1].value, wire.growth[0].setup_cost, wire.growth[0].monthly_spend, wire.lines[0].base]).toEqual([12, null, 1500, 3000, 0]);
    expect(wire.streams[0].factors.map(factor => factor.value)).toEqual([300, 250]);
    expect(wire.activities[0].monthly_amount).toBe(1200);
    expect(wire.allocations.map(row => row.monthly_amount)).toEqual([3000, 1200, 10000]);
    expect(wire.source.corrections.utl).toEqual({ amount: 12900, reason: "One-off repair" });
    // The working copy is left as typed.
    expect(body.changes[0].value).toBe("12.");
    expect([amount("-5"), amount("abc"), amount(Number.NaN), amount(null), amount("0")]).toEqual([null, null, null, null, 0]);
    // The engine reads the working copy and the wire copy alike.
    const typed = evaluate(body, baseline).proposed.ebitda, sent = evaluate(wire, baseline).proposed.ebitda;
    expect(typed).toBeCloseTo(sent, 6);
  });
});

describe("earnings plan edits: reviews follow the figures", () => {
  const approved = ["f:s1:1", "l:rent", "l:sw"];

  it("keeps an approval when only words change", () => {
    const before = referenceBody();
    const after = settleReviews(before, patchItem(before, "l:rent", { note: "Lease amendment signed.", owner: "Dana", evidence_note: "Signed PDF" }));
    expect(approved.map(id => statusOf(after, id))).toEqual(["approved", "approved", "approved"]);
    const renamed = settleReviews(before, renameStream(before, "s1", "Detailing"));
    expect(approved.map(id => statusOf(renamed, id))).toEqual(["approved", "approved", "approved"]);
  });

  it("returns a change to proposed when its own figures move, and leaves the others reviewed", () => {
    const before = referenceBody();
    for (const patch of [{ value: "30000" }, { start_month: 6 }, { setup_cost: "500" }, { included: false }, { direction: "up" as const }]) {
      const after = settleReviews(before, patchItem(before, "l:rent", patch));
      expect(approved.map(id => statusOf(after, id))).toEqual(["approved", "proposed", "approved"]);
    }
    // Retyping the same number is not a change: "28805" and "28805.0" are one figure.
    const same = settleReviews(before, patchItem(before, "l:rent", { value: "28805.0" }));
    expect(statusOf(same, "l:rent")).toBe("approved");
  });

  it("returns every change to proposed when the revenue model or a cost line moves", () => {
    const before = referenceBody();
    const factor = settleReviews(before, setFactor(before, "s1", "f0", { value: "310" }));
    expect(approved.map(id => statusOf(factor, id))).toEqual(["proposed", "proposed", "proposed"]);
    const behavior = settleReviews(before, setLineBehavior(before, "rent", "pct"));
    expect(approved.map(id => statusOf(behavior, id))).toEqual(["proposed", "proposed", "proposed"]);
    expect(modelKey(before)).not.toBe(modelKey(setLineLink(before, "c1", "s2")));
    expect(modelKey(before)).toBe(modelKey(patchItem(before, "l:rent", { value: 1 })));
  });

  it("reopens a rejected change when it is edited, and returns the same body when nothing was reviewed", () => {
    const before = patchItem(referenceBody(), "l:ins", { status: "rejected" });
    expect(statusOf(settleReviews(before, patchItem(before, "l:ins", { value: "10" })), "l:ins")).toBe("proposed");
    const next = patchItem(before, "l:c1", { value: "6" });
    expect(settleReviews(before, next)).toBe(next);
  });

  it("lays the API's decisions over the working copy without touching what was typed", () => {
    const working = patchItem(referenceBody(), "l:sal", { note: "typing a longer explana" });
    const saved = patchItem(referenceBody(), "l:sal", { status: "approved", reviewed_at: "2026-11-14T15:00:00+00:00", review_reason: "Offer letter on file", note: "older words" });
    const merged = adoptReviews(working, saved);
    expect(findItem(merged, "l:sal")!.row).toMatchObject({ status: "approved", review_reason: "Offer letter on file", note: "typing a longer explana" });
    const stale = withoutStaleReviews(referenceBody(), ["l:rent"]);
    expect(approved.map(id => statusOf(stale, id))).toEqual(["approved", "proposed", "approved"]);
  });
});

describe("earnings plan edits: source, model and costs", () => {
  it("confirms a source amount once and records a correction for the preparer", () => {
    let body = confirmGroup(referenceBody(), "utl");
    expect(body.source.confirmations.utl).toBe("confirmed");
    expect(confirmGroup(body, "utl")).toBe(body);
    body = saveCorrection(body, "rep", "9600", "  Two invoices belong to 2024.  ");
    expect([body.source.confirmations.rep, body.source.corrections.rep]).toEqual(["corrected", { amount: 9600, reason: "Two invoices belong to 2024." }]);
    // A correction needs an amount and a reason.
    expect(saveCorrection(body, "oth", "", "No amount")).toBe(body);
    expect(saveCorrection(body, "oth", "100", "x")).toBe(body);
    body = restoreSourceAmount(body, "rep");
    expect([body.source.confirmations.rep, body.source.corrections.rep]).toEqual([undefined, undefined]);
    // The correction never changes what the plan computes from.
    expect(evaluate(saveCorrection(referenceBody(), "rep", "1", "Wrong year"), baseline).proposed.ebitda).toBeCloseTo(REFERENCE.expected.proposed.ebitda, 3);
  });

  it("adds a stream from its template and removes one with everything that depended on it", () => {
    const added = addStream(referenceBody(), "recurring", STREAM_TEMPLATES);
    const stream = added.streams[3];
    // A new stream states its own revenue (nothing yet) and types its quantities; its price is never typed.
    expect([stream.name, stream.type, stream.added, stream.remainder, stream.monthly_revenue, stream.factors.map(factor => [factor.id, factor.label, factor.value, factor.unit, factor.volume])]).toEqual([
      "Recurring contracts", "recurring", true, false, "", [["f0", "Active clients", "", "clients", true], ["f1", "Retention", 100, "%", true], ["f2", "Monthly fee", null, "$", false]],
    ]);
    expect(stream.id).toMatch(/^s-[0-9a-f]{6}$/);
    expect(evaluate(added, baseline).model.reconciles).toBe(true);
    // The stream that was all revenue becomes what the others leave.
    const first = addStream(measuredBody(), "units", STREAM_TEMPLATES);
    expect(first.streams.map(row => [row.name, Boolean(row.remainder)])).toEqual([["Other revenue", true], ["Units sold", false]]);
    const stated = evaluate(setStreamRevenue(first, first.streams[1].id, "60000"), baseline).model;
    expect([stated.revenue.s1, stated.revenue[first.streams[1].id], stated.reconciles]).toEqual([516_000, 720_000, true]);

    const removed = removeStream(referenceBody(), "s1");
    expect(removed.streams.map(row => row.id)).toEqual(["s2", "s3"]);
    expect(removed.growth).toEqual([]);
    expect(removed.changes.some(change => change.id === "f:s1:1")).toBe(false);
    expect(removed.lines.find(line => line.id === "c1")).toMatchObject({ behavior: "fixed", link: "all" });
    expect(toWire(removed).changes).toHaveLength(8);
  });

  it("adds and removes a measure alongside, taking its change with it", () => {
    let body = addMeasure(referenceBody(), "s3", "hours");
    const extra = body.streams[2].factors[3];
    // The stream already has a volume, so the new measure is counted alongside it: revenue does not follow it.
    expect(extra).toMatchObject({ label: "Hours", value: "", unit: "hrs / mo", volume: false, alongside: true, custom: true });
    expect(evaluate(body, baseline).model.reconciles).toBe(true);
    body = addChange(body, { kind: "factor", stream_id: "s3", factor_id: extra.id }, { direction: "up" }).body;
    expect(removeFactor(body, "s3", "f0")).toBe(body);
    const without = removeFactor(body, "s3", extra.id);
    expect(without.streams[2].factors).toHaveLength(3);
    expect(without.changes).toHaveLength(9);
  });

  it("keeps a split cost adding up: the group's own line is what its items leave", () => {
    let body = referenceBody();
    body = addLine(body, baseline, "rent");
    const item = body.lines.find(line => line.group === "rent" && line.added)!;
    expect(body.lines.map(line => line.id).indexOf(item.id)).toBe(body.lines.findIndex(line => line.id === "rent") + 1);
    body = setLine(body, baseline, item.id, { label: "Bay 2 lease", base: "76805" });
    expect(body.lines.find(line => line.id === "rent")!.base).toBe(120_000);
    expect(evaluate(body, baseline).proposed.noi).toBeCloseTo(REFERENCE.expected.proposed.noi, 3);
    // Items worth more than the source leave nothing in the group's own line.
    body = setLine(body, baseline, item.id, { base: "250000" });
    expect(body.lines.find(line => line.id === "rent")!.base).toBe(0);
    body = addChange(body, { kind: "line", line_id: item.id }).body;
    const back = removeLine(body, baseline, item.id);
    expect(back.lines.find(line => line.id === "rent")!.base).toBe(196_805);
    expect(back.changes.some(change => change.target.line_id === item.id)).toBe(false);
    expect(removeLine(back, baseline, "rent")).toBe(back);
  });

  it("links a cost to a stream the only ways that make sense", () => {
    const body = referenceBody();
    expect(setLineBehavior(body, "rent", "unit").lines.find(line => line.id === "rent")).toMatchObject({ behavior: "unit", link: "s1" });
    expect(setLineBehavior(body, "c1", "fixed").lines.find(line => line.id === "c1")).toMatchObject({ behavior: "fixed", link: "all" });
    expect(setLineLink(body, "c1", "all").lines.find(line => line.id === "c1")).toMatchObject({ behavior: "pct", link: "all" });
    expect(answerCategory(body, "ptx", "included").category_answers).toEqual({ ptx: "included" });
    // A cost per unit follows its stream's volume or a measure counted alongside it; nothing else follows a measure.
    const measured = measuredBody();
    const line = (next: EarningsPlanBody, id: string) => next.lines.find(row => row.id === id)!;
    expect(line(setLineLink(measured, "c1", "s1", "f2"), "c1")).toMatchObject({ behavior: "unit", link: "s1", measure: "f2" });
    expect(line(setLineLink(measured, "sal", "s1"), "sal")).toMatchObject({ behavior: "unit", link: "s1", measure: null });
    expect(line(setLineLink(measured, "o1", "s1", "f2"), "o1")).toMatchObject({ behavior: "pct", link: "s1", measure: null });
    expect(line(setLineLink(measured, "sal", "all", "f2"), "sal")).toMatchObject({ behavior: "pct", link: "all", measure: null });
    expect(line(setLineBehavior(measured, "sal", "pct"), "sal")).toMatchObject({ behavior: "pct", link: "s1", measure: null });
    expect(line(setLineBehavior(measured, "sal", "unit"), "sal").measure).toBe("f2");
  });

  it("turns a plan described as units times price into one that states its revenue, without moving a figure", () => {
    const body = referenceBody();
    const modern = modernize(body);
    // Each stream keeps the revenue it had; the price that was typed is now worked out, so it is not kept beside it.
    expect(modern.streams.map(stream => [stream.id, stream.remainder, stream.monthly_revenue, stream.factors.map(factor => factor.value)])).toEqual([
      ["s1", false, 75_000, ["300", null]], ["s2", false, 18_000, ["12", null]], ["s3", false, 10_000, ["2", "50", null]],
    ]);
    const before = evaluate(body, baseline, { goal: REFERENCE.plan.noi_goal }), after = evaluate(modern, baseline, { goal: REFERENCE.plan.noi_goal });
    expect(after.model.factors).toEqual(before.model.factors);
    expect(after.proposed.ebitda).toBeCloseTo(before.proposed.ebitda, 6);
    expect(after.metrics.proposed.with_terms!.dscr).toBeCloseTo(before.metrics.proposed.with_terms!.dscr!, 9);
    expect(after.per_unit).toEqual(before.per_unit);
    // Already stated: the same plan comes back, so opening it is not an edit.
    expect(modernize(modern)).toBe(modern);
    expect(modernize(measuredBody())).toEqual(measuredBody());

    // A plan as it used to be seeded: one sale a month and a multiplier left at one count nothing and go; the stream holds the rest.
    const seeded: EarningsPlanBody = { ...referenceBody(), changes: [], growth: [], streams: [
      { id: "s1", name: "All revenue", type: "custom", factors: [
        { id: "f0", label: "Sales", value: 1, unit: "count", volume: true }, { id: "f1", label: "Revenue per month", value: 105_139.4167, unit: "$", volume: false },
        { id: "f-abc123", label: "New metric", value: 1, unit: "multiplier", volume: true, custom: true }] },
    ], lines: referenceBody().lines.map(row => ({ ...row, behavior: "fixed" as const, link: "all" })) };
    const opened = modernize(seeded);
    expect(opened.streams).toEqual([{ id: "s1", name: "All revenue", type: "custom", remainder: true, monthly_revenue: null, factors: [{ id: "f1", label: "Revenue per month", value: null, unit: "$", volume: false }] }]);
    // It now follows the source by itself, whatever was typed before.
    expect(evaluate(opened, baseline).model).toMatchObject({ total: 1_236_000, reconciles: true });
    expect(remainderStream(seeded)?.id).toBe("s1");
    // A placeholder a change points at is a real metric to that plan, so it stays.
    const pointed = addChange(seeded, { kind: "factor", stream_id: "s1", factor_id: "f0" }, { direction: "up" }).body;
    expect(modernize(pointed).streams[0]).toMatchObject({ remainder: false, monthly_revenue: 105_139.42, factors: [{ id: "f0", value: 1 }, { id: "f1", value: null }] });
    // Beside a named stream the seeded one is what is left, and says so.
    const named: EarningsPlanBody = { ...seeded, streams: [seeded.streams[0], { id: "s-aaaaaa", name: "Detail packages", type: "units", added: true, factors: [
      { id: "f0", label: "Units sold", value: "300", unit: "units / mo", volume: true }, { id: "f1", label: "Price per unit", value: "250", unit: "$", volume: false }] }] };
    expect(modernize(named).streams.map(stream => [stream.name, stream.remainder, stream.monthly_revenue])).toEqual([["Other revenue", true, null], ["Detail packages", false, 75_000]]);
    expect(evaluate(modernize(named), baseline).model.revenue).toEqual({ s1: 336_000, "s-aaaaaa": 900_000 });
  });

  it("counts a stream's month in units, hours or anything else, and divides instead of multiplying", () => {
    const seeded: EarningsPlanBody = { ...measuredBody(), streams: [{ id: "s1", name: "All revenue", type: "custom", remainder: true, monthly_revenue: null,
      factors: [{ id: "f1", label: "Revenue per month", value: null, unit: "$", volume: false }] }],
    lines: referenceBody().lines.map(row => ({ ...row, behavior: "fixed" as const, link: "all" })) };
    // The first measure is what revenue follows, and the price is named after it.
    let body = addMeasure(seeded, "s1", "units");
    const units = body.streams[0].factors[0];
    expect(body.streams[0].factors.map(factor => [factor.label, factor.unit, Boolean(factor.volume), Boolean(factor.alongside)])).toEqual([
      ["Units sold", "units / mo", true, false], ["Revenue per unit", "$", false, false]]);
    // Nothing typed yet: the stream still brings all its revenue.
    expect(evaluate(body, baseline).model).toMatchObject({ total: 1_236_000, volume: { s1: 0 } });
    body = setFactor(body, "s1", units.id, { value: "400" });
    // Typing 400 units does not multiply revenue by 400: it divides it into $257.50 a unit.
    const model = evaluate(body, baseline).model;
    expect([model.total, model.volume.s1, model.factors.s1]).toEqual([1_236_000, 4_800, [400, 257.5]]);
    // The price cannot be typed.
    expect(setFactor(body, "s1", "f1", { value: "999" })).toBe(body);
    // The next measures are counted alongside. One the business names itself is counted in its own name.
    body = addMeasure(addMeasure(body, "s1", "hours"), "s1", "other");
    const [hours, other] = body.streams[0].factors.slice(2);
    expect([hours, other].map(factor => [factor.label, factor.unit, factor.alongside, factor.volume])).toEqual([["Hours", "hrs / mo", true, false], ["", "per mo", true, false]]);
    body = setFactor(setFactor(body, "s1", other.id, { label: "Tons hauled" }), "s1", other.id, { value: "90" });
    body = setFactor(setFactor(body, "s1", hours.id, { label: "Labor hours" }), "s1", hours.id, { value: "1200" });
    expect(body.streams[0].factors.slice(2).map(factor => [factor.label, factor.unit, factor.value])).toEqual([["Labor hours", "hrs / mo", "1200"], ["Tons hauled", "tons hauled / mo", "90"]]);
    const counted = evaluate(body, baseline);
    expect(counted.model.measures).toEqual({ [`s1:${hours.id}`]: 14_400, [`s1:${other.id}`]: 1_080 });
    expect(counted.per_unit.map(row => [row.factor_id, Number(row.today.revenue.toFixed(2))])).toEqual([[null, 257.5], [hours.id, 85.83], [other.id, 1144.44]]);

    // Wages follow the labor hours. Removing that measure leaves them fixed, with its change gone.
    body = setLineLink(setLineBehavior(body, "sal", "unit"), "sal", "s1", hours.id);
    body = addChange(body, { kind: "factor", stream_id: "s1", factor_id: hours.id }).body;
    const without = removeFactor(body, "s1", hours.id);
    expect(without.lines.find(row => row.id === "sal")).toMatchObject({ behavior: "fixed", link: "all", measure: null });
    expect([without.changes, without.streams[0].factors.map(factor => factor.id)]).toEqual([[], [units.id, "f1", other.id]]);
    // Removing the only volume makes the first measure alongside what revenue follows, so the stream stays measured.
    const supplies = setLineLink(setLineBehavior(body, "c1", "unit"), "c1", "s1");
    const promoted = removeFactor(supplies, "s1", units.id);
    expect(promoted.streams[0].factors.map(factor => [factor.label, Boolean(factor.volume), Boolean(factor.alongside)])).toEqual([
      ["Labor hours", true, false], ["Revenue per hour", false, false], ["Tons hauled", false, true]]);
    // What followed the hours still does (they are the volume now); what followed the units has nothing left to follow.
    expect(promoted.lines.find(row => row.id === "sal")).toMatchObject({ behavior: "unit", link: "s1", measure: null });
    expect(promoted.lines.find(row => row.id === "c1")).toMatchObject({ behavior: "fixed", link: "all" });
    expect(evaluate(promoted, baseline).model.factors.s1[1]).toBeCloseTo(103_000 / 1_200, 9);
    // The worked-out price and the kind's own metrics cannot be removed.
    expect(removeFactor(body, "s1", "f1")).toBe(body);
  });

  it("keeps a change in dollars a year as dollars a year when its cost starts or stops following revenue", () => {
    const body = referenceBody();
    const mode = (next: typeof body, id: string) => next.changes.find(change => change.id === id)!.mode;
    // Rent is a fixed cost with a change of $28,805 a year. Made a percent of revenue, that must not become 28,805 points.
    expect([mode(body, "l:rent"), mode(setLineBehavior(body, "rent", "pct"), "l:rent"), mode(setLineBehavior(body, "rent", "unit"), "l:rent")]).toEqual(["amount", "annual", "annual"]);
    // And back: on a fixed cost dollars a year is simply the amount.
    const following = setLineBehavior(body, "rent", "pct");
    expect(mode(setLineBehavior(following, "rent", "fixed"), "l:rent")).toBe("amount");
    // A change sized as a percent, or in the rate's own unit, is left as it was written; other costs are not touched.
    expect([mode(setLineBehavior(body, "ins", "pct"), "l:ins"), mode(setLineBehavior(body, "o1", "unit"), "l:o1"), mode(following, "l:sal")]).toEqual(["percent", "amount", "amount"]);
    // Nothing to carry: the changes are the same list, so nothing is marked as edited for no reason.
    expect(setLineBehavior(body, "mkt", "pct").changes).toBe(body.changes);
  });

  it("puts revenue the named streams do not explain into one stream that keeps the model equal to the source", () => {
    const short = referenceBody();
    short.streams[0].factors[0].value = "280";
    // 280 units at $250 is $70,000 a month: the three streams leave $5,000 a month unexplained.
    const balanced = balanceRevenue(short);
    expect(balanced.streams[3]).toEqual({ id: "other-revenue", name: "Other revenue", type: "custom", added: true, remainder: true, monthly_revenue: null,
      factors: [{ id: "f1", label: "Revenue per month", value: null, unit: "$", volume: false, custom: false }] });
    expect(evaluate(balanced, baseline).model).toMatchObject({ reconciles: true, revenue: { "other-revenue": 60_000 } });
    // It holds the rest from then on: there is nothing to press again, and later edits resize it by themselves.
    expect(balanceRevenue(balanced)).toBe(balanced);
    const again = setStreamRevenue(balanced, "s1", "72500");
    expect(again.streams).toHaveLength(4);
    expect(evaluate(again, baseline).model).toMatchObject({ reconciles: true, revenue: { s1: 870_000, "other-revenue": 30_000 } });
    // An empty box is nothing stated, so the rest takes it all back; the stream that holds the rest has no box to type in.
    expect(evaluate(setStreamRevenue(again, "s1", ""), baseline).model.revenue["other-revenue"]).toBe(900_000);
    expect(setStreamRevenue(again, "other-revenue", "5")).toBe(again);
    expect(setStreamRevenue(again, "s1", "72500")).toBe(again);
  });

  it("sends what a stream states as a figure, and nothing for the stream that holds the rest", () => {
    const body = addStream(measuredBody(), "units", STREAM_TEMPLATES);
    const typed = setStreamRevenue(body, body.streams[1].id, "60000.");
    const wire = toWire(typed);
    expect(wire.streams.map(stream => [stream.remainder, stream.monthly_revenue])).toEqual([[true, null], [false, 60_000]]);
    expect(wire.streams[0].factors.map(factor => [factor.id, factor.value, Boolean(factor.alongside)])).toEqual([["f0", 400, false], ["f1", null, false], ["f2", 1_200, true]]);
    expect(wire.lines.find(line => line.id === "sal")).toMatchObject({ behavior: "unit", link: "s1", measure: "f2" });
    // An empty revenue box is sent as nothing stated, the way the engine here reads it.
    expect(toWire(setStreamRevenue(typed, body.streams[1].id, "")).streams[1].monthly_revenue).toBeNull();
    // A plan still described as units times price is sent exactly as it was.
    expect("monthly_revenue" in toWire(referenceBody()).streams[0]).toBe(false);
    // What a stream states, what it is counted in and what a cost follows are all part of the model a review was given to.
    const keys = new Set([typed, setStreamRevenue(typed, body.streams[1].id, "61000"), setFactor(typed, "s1", "f2", { value: "1300" }), setLineLink(typed, "sal", "s1")].map(modelKey));
    expect(keys.size).toBe(4);
  });
});

describe("earnings plan edits: changes", () => {
  it("adds one change per place, with an id the API accepts", () => {
    const body = referenceBody();
    const { body: next, id } = addChange(body, { kind: "line", line_id: "utl" });
    expect(id).toMatch(UUID);
    expect(next.changes[next.changes.length - 1]).toMatchObject({ target: { kind: "line", line_id: "utl" }, direction: "down", mode: "percent", value: "", start_month: 1, included: true, status: "proposed", note: "" });
    expect(addChange(next, { kind: "line", line_id: "utl" })).toEqual({ body: next, id });
    expect(addChange(body, { kind: "pricing" }, { direction: "up" }).body.changes.slice(-1)[0].direction).toBe("up");
  });

  it("adds growth and new activities, and moves a growth activity to a stream's volume metric", () => {
    const grown = addGrowth(referenceBody());
    expect(grown.body.growth[1]).toMatchObject({ name: "New growth activity", stream_id: "s1", factor_id: "f0", monthly_spend: "", status: "proposed" });
    expect(setGrowthStream(grown.body, grown.id!, "s3").growth[1]).toMatchObject({ stream_id: "s3", factor_id: "f0" });
    expect(addGrowth({ ...referenceBody(), streams: [] })).toMatchObject({ id: null });
    const active = addActivity(referenceBody());
    expect(active.body.activities[1]).toMatchObject({ name: "New activity", monthly_amount: "" });
    expect(active.id).toMatch(UUID);
  });

  it("removes a change and puts it back where it was", () => {
    const body = referenceBody();
    const { body: without, removed } = removeItem(body, "l:rent");
    expect(without.changes).toHaveLength(8);
    expect(restoreItem(without, removed!).changes.map(row => row.id)).toEqual(body.changes.map(row => row.id));
    // Not if its place was taken, or what it pointed at has gone.
    const taken = addChange(without, { kind: "line", line_id: "rent" }).body;
    expect(restoreItem(taken, removed!)).toBe(taken);
    const growth = removeItem(body, "gr:g1");
    expect(restoreItem(removeStream(growth.body, "s1"), growth.removed!).growth).toEqual([]);
    expect(removeItem(body, "missing")).toEqual({ body, removed: null });
  });

  it("edits allocations, carried-over items and the plan's own words", () => {
    let body = addAllocation(referenceBody());
    const added = body.allocations[3];
    expect(added).toMatchObject({ label: "New allocation", purpose: "existing", monthly_amount: "" });
    body = patchAllocation(body, added.id, { monthly_amount: "2500", purpose: "reserve" });
    expect(evaluate(body, baseline).released.allocated_monthly).toBe(16_700);
    expect(removeAllocation(body, added.id).allocations).toHaveLength(3);
    const carried = { ...body, carried_over: [{ id: "c", kind: "change", label: "Ads", detail: "", annual_amount: null, resolved: false }] };
    expect(resolveCarriedOver(carried, "c", true).carried_over[0].resolved).toBe(true);
    expect([setPlanStart(body, "2027-03").plan_start, setPlanStart(body, "March").plan_start]).toEqual(["2027-03", "2027-01"]);
    expect([setAttestation(body, true).attestation, setNotes(body, "For the preparer").notes]).toEqual([true, "For the preparer"]);
  });
});
