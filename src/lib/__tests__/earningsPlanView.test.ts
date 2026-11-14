/** What the Earnings Plan screens print for the design's sample file: a figure that drifts from the design fails here. */
import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/earningsPlan/math";
import { itemization, planNotices, saveLabel, stepCounts } from "@/lib/earningsPlan/issues";
import {
  beforeAfterTable, bridgeRows, categoryRows, changeSections, compareBars, costRows, coverageScale, debtBasis, goalView, handoffRows, liveMetrics,
  ramp, reconciliation, releasedView, reviewRows, sourceView, stepSubtitles, streamCards,
} from "@/lib/earningsPlan/view";
import { planMonth, planStartOptions, stamp } from "@/lib/earningsPlan/format";
import { QUESTIONS, REFERENCE, STREAM_TEMPLATES, referenceBaseline, referenceBody } from "./fixtures/earningsPlanReferencePlan";

const body = referenceBody();
const baseline = referenceBaseline();
const result = evaluate(body, baseline, { goal: REFERENCE.plan.noi_goal, questions: QUESTIONS });
const basis = debtBasis(baseline, true);

describe("earnings plan screens: the design's file", () => {
  it("summarises each step under its title", () => {
    expect(stepSubtitles(body, baseline, result, "proposed", basis)).toEqual([
      "IRS 2025 · NOI −$30,777", "3 revenue streams · 14 costs", "11 changes · +$205,274", "DSCR 1.03x · goal 1.25x",
    ]);
    expect(stepCounts(result.to_finish)).toEqual([3, 2, 2, 1]);
    expect(saveLabel(result.to_finish)).toBe("Complete required items · 8");
    expect([saveLabel([]), saveLabel([], true)]).toEqual(["Save version and PDF", "Submit plan for review"]);
  });

  it("prints the six metrics before and after, the way the File page does", () => {
    const rows = liveMetrics(baseline, result, "proposed", basis);
    expect(rows.map(row => [row.label, row.before, row.after, row.delta, row.tone])).toEqual([
      ["EBITDA", "−$22,377", "$182,897", "+$205,274", "ok"],
      ["NOI", "−$30,777", "$174,497", "+$205,274", "ok"],
      ["DSCR", "−0.03x", "1.03x", "+1.06x", "ok"],
      ["Free cash flow", "−$799,977", "$5,297", "+$805,274", "ok"],
      ["Operating margin", "−2.5%", "11.6%", "+14.1 pts", "ok"],
      ["Debt service", "$777,600", "$177,600", "−$600,000", "ok"],
    ]);
    // Reviewed counts approved changes only; without the terms the debt service does not move.
    const reviewed = liveMetrics(baseline, result, "reviewed", basis);
    expect([reviewed[0].after, reviewed[2].after]).toEqual(["$52,164", "0.29x"]);
    const currentDebt = liveMetrics(baseline, result, "proposed", debtBasis(baseline, false));
    expect([currentDebt[2].after, currentDebt[5].after, currentDebt[5].tone]).toEqual(["0.24x", "$777,600", "mut"]);
    expect(compareBars(rows)[0]).toMatchObject({ beforeTone: "bad", afterTone: "acc", afterWidth: 100 });
    expect(compareBars(rows)[5]).toMatchObject({ beforeWidth: 100, afterTone: "mut" });
  });

  it("lays the working and reviewed plans beside today", () => {
    const rows = beforeAfterTable(baseline, result, basis);
    expect(rows.map(row => row.label)).toEqual([
      "Annual NOI", "Cash after debt / year", "Annual EBITDA", "First-year EBITDA", "First-year NOI",
      "DSCR · current debt", "DSCR · saved refinance", "First-year DSCR · saved refinance",
    ]);
    expect(rows[2]).toEqual({ label: "Annual EBITDA", current: "−$22,377", plan: "$182,897", reviewed: "$52,164", delta: "+$205,274", tone: "ok" });
    expect(rows[3]).toMatchObject({ plan: "$145,663", reviewed: "$41,435" });
    expect(rows[6]).toMatchObject({ current: "−0.13x", plan: "1.03x", reviewed: "0.29x" });
    const noTerms = { ...baseline, debt_service_with_terms: null };
    const without = beforeAfterTable(noTerms, evaluate(body, noTerms), debtBasis(noTerms, true));
    expect(without.map(row => row.label).slice(-2)).toEqual(["DSCR · current debt", "First-year DSCR · current debt"]);
  });

  it("draws a bridge that adds up, a ramp, the coverage scale and the goal", () => {
    expect(bridgeRows(baseline, result, "proposed").map(row => [row.label, row.value])).toEqual([
      ["Baseline EBITDA", "−$22,377"], ["Pricing", "$0"], ["Revenue drivers", "+$89,616"], ["Growth", "+$36,845"],
      ["Cost of goods sold", "+$21,420"], ["Operating expenses", "+$71,793"], ["New activities", "−$14,400"], ["Plan EBITDA", "$182,897"],
    ]);
    // Pricing moves nothing in this plan: its row prints $0 and draws no bar.
    expect(bridgeRows(baseline, result, "proposed").map(row => row.bar === null)).toEqual([false, true, false, false, false, false, false, false]);
    const months = ramp(baseline, result, "proposed", basis, body.plan_start)!;
    expect(months.months.map(month => month.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    expect([months.text, months.paymentText]).toEqual(["First year $145,663 · run-rate $182,897", "Monthly payment $14,800"]);
    expect(months.months[0].down).toBeGreaterThan(0);
    expect(months.months[11].up).toBeGreaterThan(months.payment!);
    const scale = coverageScale(baseline, result, "proposed", basis)!;
    expect([scale.state, scale.baselineText, scale.planText, scale.needText, scale.targetLabel]).toEqual([
      { label: "Covers debt", tone: "warn" }, "Baseline −0.03x", "Plan 1.03x", "Needs $39,103 more EBITDA", "1.25x",
    ]);
    expect(scale.after).toBeGreaterThan(scale.one);
    expect(scale.after).toBeLessThan(scale.target);
    const goal = goalView(baseline, result, "proposed")!;
    expect([goal.percent, goal.of, goal.gapLabel, goal.gapText, goal.currentText, goal.proposedText, goal.reviewedText]).toEqual([
      "81%", "of the $215,000 goal · proposed", "Still to find", "$40,503", "−$30,777", "$174,497", "$43,764",
    ]);
    expect(goalView(baseline, evaluate(body, baseline), "proposed")).toBeNull();
  });

  it("shows the source beside the latest statement and what the loan terms do", () => {
    const view = sourceView(body, baseline, false);
    expect([view.primary, view.period, view.currencyBasis, view.sourceColumn, view.statementColumn, view.confirmedText]).toEqual([
      "IRS 1120-S · 2025", "Jan 1 – Dec 31, 2025", "USD · Accrual", "IRS 2025", "P&L annualized", "7 of 10 confirmed",
    ]);
    expect(view.groups[0]).toMatchObject({ label: "Cost of goods sold", source: "$601,886", statement: "$588,400", variance: "−$13,486", state: "confirmed" });
    expect(view.groups.find(row => row.key === "utl")).toMatchObject({ state: "open", tag: { label: "Not confirmed", tone: "mut" } });
    expect(view.totals.map(row => [row.label, row.value, row.negative])).toEqual([
      ["Revenue", "$1,236,000", false], ["NOI", "−$30,777", true], ["EBITDA", "−$22,377", true], ["Annual debt service", "$777,600", false],
    ]);
    expect(view.footnote).toBe("EBITDA includes $8,400 of other income, depreciation and amortization that NOI excludes. DSCR is EBITDA over annual debt service.");
    expect(view.terms).toEqual({ label: "Client terms v3", current: "$64,800 / mo", next: "$14,800 / mo", released: "$50,000 / mo", coverage: "−0.03x → −0.13x" });
    // After the source figures change, earlier confirmations no longer count.
    expect(sourceView(body, baseline, true).confirmedText).toBe("0 of 10 confirmed");
  });

  it("describes the revenue model and each cost's relationship to it", () => {
    const streams = streamCards(body, result, STREAM_TEMPLATES);
    expect(streams[0]).toMatchObject({ name: "Detail packages", typeLabel: "Units sold", annual: "$900,000", monthly: "$75,000 / month", volumeText: "Business unit: unit · 3,600 a year · $250.00 revenue per unit" });
    expect(streams[2].volumeText).toBe("Business unit: billable hour · 1,200 a year · $100.00 revenue per billable hour");
    expect(streams[1].volumeText).toBe("Business unit: contract-month · 144 a year · $1,500.00 revenue per contract-month");
    expect(reconciliation(body, baseline, result)).toEqual({ reconciles: true, tag: { label: "Reconciles to IRS revenue", tone: "ok" }, text: "Model total $1,236,000 against IRS revenue $1,236,000", balance: null });
    const costs = new Map(costRows(body, baseline, result, STREAM_TEMPLATES).map(row => [row.id, row]));
    expect([costs.get("c1")!.rate, costs.get("c2")!.rate, costs.get("o1")!.rate, costs.get("rent")!.rate]).toEqual(["$105.00 per unit", "55.00% of revenue", "2.00% of revenue", "Fixed amount"]);
    expect(costs.get("c1")).toMatchObject({ groupLabel: "Cost of goods sold", base: "$378,000", fixed: false });
    expect(itemization(body, baseline, result.behaviors).map(row => [row.key, row.tag, row.text])).toEqual([
      ["cogs", "Balanced", "Cost of goods sold · 4 items total $601,886 against $601,886 on the source · 3 linked to revenue"],
      ["oth", "Balanced", "Other · 2 items total $27,092 against $27,092 on the source · 1 linked to revenue"],
    ]);
    expect(categoryRows(body, QUESTIONS).map(row => [row.label, row.tag.label])).toEqual([["Payroll taxes", "Not answered"], ["Transportation", "Not answered"]]);
  });

  it("lists every place a change can land, with what each change does", () => {
    const sections = changeSections(body, baseline, result, STREAM_TEMPLATES, basis);
    expect(sections.map(section => [section.title, section.total.label, section.rows.length])).toEqual([
      ["Revenue drivers", "EBITDA +$95,841 / yr", 8], ["Growth activities", "EBITDA +$39,868 / yr", 1], ["Cost of goods sold", "EBITDA +$21,420 / yr", 5],
      ["Operating expenses", "EBITDA +$71,793 / yr", 11], ["New activities", "EBITDA −$14,400 / yr", 1],
    ]);
    const rows = new Map(sections.flatMap(section => section.rows).map(row => [row.rowKey, row]));
    expect(rows.get("pricing")).toMatchObject({ itemId: null, label: "Overall pricing", current: "Current $1,236,000 / yr", plan: "", amountLabel: "$ / yr", direction: "up" });
    expect(rows.get("f:s1:f1")).toMatchObject({ label: "Price per unit", sub: "Detail packages", current: "Current $250.00", plan: "Plan $262.00", amountLabel: "$", itemId: "f:s1:1" });
    expect(rows.get("f:s1:f1")!.effect).toMatchObject({ status: { label: "Reviewed", tone: "ok" }, needsNote: false, dimmed: false, positive: true });
    expect(rows.get("f:s1:f1")!.effect!.spark).toEqual([false, true, true, true, true, true, true, true, true, true, true, true]);
    // Units sold has no change of its own, yet the plan moves it: the growth activity adds 40 a month.
    expect(rows.get("f:s1:f0")).toMatchObject({ itemId: null, current: "Current 300 units / mo", plan: "Plan 340 units / mo" });
    expect(rows.get("f:s2:f0")!.effect).toMatchObject({ status: { label: "Explanation needed", tone: "warn" }, needsNote: true });
    expect(rows.get("l:o1")).toMatchObject({ label: "Card processing", sub: "Other · 2.0% of all revenue", amountLabel: "pts", direction: "down" });
    expect(rows.get("l:o1")!.effect!.firstYear).toMatch(/^First year \+\$/);
    expect(rows.get("l:c2")).toMatchObject({ itemId: null, sub: "Cost of goods sold · 55.0% of Fleet maintenance contracts revenue", planTone: "bad" });
    expect(rows.get("l:c2")!.plan).toMatch(/· follows its driver$/);
    expect(rows.get("g:cogs")).toMatchObject({ label: "Whole group: Cost of goods sold", sub: "Applied proportionally to all 4 items", current: "Current $601,886 / yr" });
    expect(rows.has("g:rent")).toBe(false);
    const growth = rows.get("gr:gr:g1")!;
    expect([growth.label, growth.sub, growth.current, growth.plan]).toEqual(["Google Ads for detail packages", "Feeds Detail packages", "Spend $36,000 / yr", "Returns $3.49 revenue per $1"]);
    expect(growth.factorOptions).toEqual([{ value: "f0", label: "Units sold" }]);
    expect(rows.get("na:na:a1")).toMatchObject({ current: "Current $0", plan: "Plan $14,400 / yr", planTone: "bad" });
    expect(rows.get("l:rent")!.effect).toMatchObject({ chip: { label: "EBITDA +$28,805 / yr", tone: "ok" }, dscr: "DSCR +0.16x" });
    expect(rows.get("l:rent")!.effect!.moves).toBe("Moves Rent −$28,805");
  });

  it("accounts for released cash, the review list and the preparer handoff", () => {
    expect(releasedView(baseline, result, basis)).toEqual({ available: true, text: "Client terms v3 release $50,000 a month. Assign it to costs the plan relies on, a reserve, or leave it as cash.", tag: { label: "$35,800 / mo stays as cash", tone: "mut" } });
    expect(releasedView(baseline, result, "current_debt").tag.label).toBe("Over-allocated by $14,200 / mo");
    const review = reviewRows(body, result, []);
    expect(review).toHaveLength(11);
    expect(review.filter(row => row.status.label === "Approved").map(row => row.label)).toEqual(["Detail packages · Price per unit", "Rent", "Software"]);
    expect(review.find(row => row.id === "f:s2:0")).toMatchObject({ why: "No explanation yet", reviewable: true });
    expect(reviewRows(body, result, ["l:c1"]).find(row => row.id === "l:c1")!.status).toEqual({ label: "Review again", tone: "warn" });
    expect(handoffRows(body, baseline)).toEqual([]);
    const corrected = { ...body, source: { ...body.source, corrections: { utl: { amount: 12_900, reason: "Includes a one-off repair." } } } };
    expect(handoffRows(corrected, baseline)).toEqual([{ key: "utl", label: "Utilities · $12,900 against $14,300 on the source", reason: "Includes a one-off repair." }]);
  });
});

describe("earnings plan screens: other files", () => {
  it("says what is missing instead of printing zeros when the file has no earnings source", () => {
    const empty = { ...baseline, available: false, reason: "Select an earnings source for this file.", revenue: null, cogs: null, operating_expenses: null, noi: null, ebitda: null, groups: [], source: {}, statement: null };
    const bare = { ...referenceBody(), streams: [], lines: [], changes: [], growth: [], activities: [], allocations: [] };
    const none = evaluate(bare, empty, { questions: [] });
    expect(liveMetrics(empty, none, "proposed", basis).slice(0, 3).map(row => [row.before, row.after, row.delta])).toEqual([["—", "—", "—"], ["—", "—", "—"], ["—", "—", "—"]]);
    expect(stepSubtitles(bare, empty, none, "proposed", basis)[0]).toBe("No earnings source yet");
    expect([beforeAfterTable(empty, none, basis), bridgeRows(empty, none, "proposed"), ramp(empty, none, "proposed", basis, null), coverageScale(empty, none, "proposed", basis)]).toEqual([[], [], null, null]);
    expect(sourceView(bare, empty, false)).toMatchObject({ available: false, primary: "No earnings source in use", totals: [], footnote: null });
    expect(planNotices({ body: bare, baseline: empty, result: none, sourceChanged: false, staleReviews: [] }).map(row => row.code)).toEqual(["no_source"]);
    expect(changeSections(bare, empty, none, STREAM_TEMPLATES, basis).map(section => section.empty)).toEqual([
      "Describe the revenue streams in step 2 to change them here.", "Add a revenue stream with a volume metric in step 2 to plan growth.",
      "The source prints no cost of goods sold.", "The source prints no operating expenses.", null,
    ]);
  });

  it("warns without blocking: changed source, items to re-enter, stale reviews, over-assigned cash", () => {
    const carried = { ...body, carried_over: [{ id: "x", kind: "change", label: "Google Ads", detail: "Re-enter it.", annual_amount: 12_000, resolved: false }], allocations: [{ id: "a", label: "Reserve", purpose: "reserve" as const, monthly_amount: 60_000 }] };
    const notices = planNotices({ body: carried, baseline, result: evaluate(carried, baseline), sourceChanged: true, staleReviews: ["l:rent"], origin: "carried_over" });
    expect(notices.map(row => row.code)).toEqual(["source_changed", "carried_over", "re_enter", "stale_reviews", "over_allocated"]);
    expect(notices[4].message).toContain("over-assigned by $10,000 a month");
    // A business that has already sent its plan in is told so when it comes back to the link.
    expect(planNotices({ body, baseline, result, sourceChanged: false, staleReviews: [], submitted: true }).map(row => row.code)).toEqual(["submitted"]);
    expect(planNotices({ body, baseline, result, sourceChanged: false, staleReviews: [] })).toEqual([]);
  });

  it("offers to put unexplained revenue in one stream, and flags a split that no longer adds up", () => {
    const short = referenceBody();
    short.streams[0].factors[0].value = "280";
    const low = evaluate(short, baseline);
    expect(reconciliation(short, baseline, low)).toMatchObject({ reconciles: false, tag: { label: "Differs from IRS revenue by −$60,000", tone: "warn" }, balance: "Put the difference in “Other revenue”" });
    const high = referenceBody();
    high.streams[0].factors[0].value = "320";
    expect(reconciliation(high, baseline, evaluate(high, baseline))).toMatchObject({ tag: { label: "Differs from IRS revenue by +$60,000", tone: "warn" }, balance: null });
    const split = referenceBody();
    split.lines.find(line => line.id === "c4")!.base = 60_000;
    expect(itemization(split, baseline, evaluate(split, baseline).behaviors)[0]).toMatchObject({ state: "unallocated", tag: "Unallocated $9,086" });
  });

  it("names plan months from the plan's start", () => {
    expect([planMonth("2026-11", 0), planMonth("2026-11", 2), planMonth(null, 2)]).toEqual(["Nov 2026", "Jan 2027", "Month 3"]);
    const options = planStartOptions("2025-06", new Date(2026, 10, 14));
    expect(options[0]).toEqual({ value: "2025-06", label: "Jun 2025" });
    expect(options.slice(1, 4).map(row => row.value)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(options).toHaveLength(15);
    expect(stamp("not a date")).toBe("");
  });
});
