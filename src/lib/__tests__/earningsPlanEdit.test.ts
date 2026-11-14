/** Edits to the working copy of an earnings plan: what is sent to the API, and the rules the API applies too. */
import { describe, expect, it } from "vitest";
import {
  addActivity, addAllocation, addChange, addFactor, addGrowth, addLine, addStream, adoptReviews, amount, answerCategory, balanceRevenue, confirmGroup,
  findItem, modelKey, patchAllocation, patchItem, removeAllocation, removeFactor, removeItem, removeLine, removeStream, renameStream,
  resolveCarriedOver, restoreItem, restoreSourceAmount, saveCorrection, setAttestation, setFactor, setGrowthStream, setLine, setLineBehavior,
  setLineLink, setNotes, setPlanStart, settleReviews, toWire, withoutStaleReviews,
} from "@/lib/earningsPlan/edit";
import { evaluate } from "@/lib/earningsPlan/math";
import type { EarningsPlanBody } from "@/lib/earningsPlan/types";
import { REFERENCE, STREAM_TEMPLATES, referenceBaseline, referenceBody } from "./fixtures/earningsPlanReferencePlan";

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
    expect([stream.name, stream.type, stream.added, stream.factors.map(factor => [factor.id, factor.label, factor.value, factor.unit, factor.volume])]).toEqual([
      "Recurring contracts", "recurring", true, [["f0", "Active clients", "", "clients", true], ["f1", "Retention", 100, "%", true], ["f2", "Monthly fee", "", "$", false]],
    ]);
    expect(stream.id).toMatch(/^s-[0-9a-f]{6}$/);
    expect(evaluate(added, baseline).model.reconciles).toBe(true);

    const removed = removeStream(referenceBody(), "s1");
    expect(removed.streams.map(row => row.id)).toEqual(["s2", "s3"]);
    expect(removed.growth).toEqual([]);
    expect(removed.changes.some(change => change.id === "f:s1:1")).toBe(false);
    expect(removed.lines.find(line => line.id === "c1")).toMatchObject({ behavior: "fixed", link: "all" });
    expect(toWire(removed).changes).toHaveLength(8);
  });

  it("adds and removes an extra metric, taking its change and growth with it", () => {
    let body = addFactor(referenceBody(), "s3");
    const extra = body.streams[2].factors[3];
    expect(extra).toMatchObject({ label: "New metric", value: 1, unit: "multiplier", volume: true, custom: true });
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
  });

  it("puts revenue the named streams do not explain into one stream", () => {
    const short = referenceBody();
    short.streams[0].factors[0].value = "280";
    const balanced = balanceRevenue(short, baseline);
    expect(balanced.streams[3]).toMatchObject({ id: "other-revenue", name: "Other revenue", factors: [{ value: 1 }, { value: 5000 }] });
    expect(evaluate(balanced, baseline).model.reconciles).toBe(true);
    // Pressing it again after more edits resizes the same stream.
    balanced.streams[0].factors[0].value = "290";
    const again = balanceRevenue(balanced, baseline);
    expect(again.streams).toHaveLength(4);
    expect(again.streams[3].factors[1].value).toBe(2500);

    // A new plan starts as one "All revenue" stream; naming the real streams shrinks it into the remainder.
    const seeded: EarningsPlanBody = { ...referenceBody(), changes: [], growth: [], streams: [
      { id: "s1", name: "All revenue", type: "custom", factors: [{ id: "f0", label: "Sales", value: 1, unit: "count", volume: true }, { id: "f1", label: "Revenue per month", value: 103_000, unit: "$", volume: false }] },
      { id: "s-aaaaaa", name: "Detail packages", type: "units", added: true, factors: [{ id: "f0", label: "Units sold", value: "300", unit: "units / mo", volume: true }, { id: "f1", label: "Price per unit", value: "250", unit: "$", volume: false }] },
    ], lines: referenceBody().lines.map(line => ({ ...line, behavior: "fixed" as const, link: "all" })) };
    const named = balanceRevenue(seeded, baseline);
    expect(named.streams[0]).toMatchObject({ id: "s1", name: "Other revenue", factors: [{ value: 1 }, { value: 28_000 }] });
    expect(evaluate(named, baseline).model.reconciles).toBe(true);
    // Named streams that already exceed the source cannot be balanced by adding one.
    const over = referenceBody();
    over.streams[0].factors[0].value = "320";
    expect(balanceRevenue(over, baseline)).toBe(over);
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
