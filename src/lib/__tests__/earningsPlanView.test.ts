/** What the Earnings Plan screens print for the design's sample file: a figure that drifts from the design fails here. */
import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/earningsPlan/math";
import { itemization, planNotices, saveLabel, stepCounts } from "@/lib/earningsPlan/issues";
import {
  beforeAfterTable, bridgeRows, categoryRows, changeSections, compareBars, costLinks, costRows, coverageScale, debtBasis, goalView, handoffRows, liveMetrics,
  loanCostsNote, perUnitTable, ramp, reconciliation, releasedView, revenueLead, reviewRows, sourceView, stepSubtitles, streamCards, unitWord,
} from "@/lib/earningsPlan/view";
import { addStream, balanceRevenue, setStreamRevenue } from "@/lib/earningsPlan/edit";
import { perWord, planMonth, planStartOptions, stamp } from "@/lib/earningsPlan/format";
import { QUESTIONS, REFERENCE, STREAM_TEMPLATES, measuredBody, referenceBaseline, referenceBody } from "./fixtures/earningsPlanReferencePlan";

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
    expect(view.terms).toEqual({ label: "Client terms v3", current: "$64,800 / mo", next: "$14,800 / mo", released: "$50,000 / mo", coverage: "−0.03x → −0.13x", costs: null });
    // After the source figures change, earlier confirmations no longer count.
    expect(sourceView(body, baseline, true).confirmedText).toBe("0 of 10 confirmed");
  });

  it("describes the revenue model and each cost's relationship to it", () => {
    const streams = streamCards(body, baseline, result, STREAM_TEMPLATES);
    // A plan described as units times price shows the revenue that makes, and what one unit brings in and costs.
    expect(streams[0]).toEqual({
      id: "s1", name: "Detail packages", typeLabel: "Units sold", revenueInput: 75_000, annual: "$900,000", monthly: "$75,000", share: "72.8% of the average month",
      measures: [{
        factorId: null, role: "volume", inputs: [{ id: "f0", label: "Units sold", named: false, value: "300", unit: "units / mo" }], total: null, word: "unit",
        note: "Revenue follows this", revenue: "$250.00", cost: "$256.23", noi: "−$6.23", noiTone: "bad",
      }],
      unmeasured: null, canMeasure: true,
    });
    // Several metrics multiply into one volume: two technicians at fifty hours each are a hundred billable hours.
    expect(streams[2].measures[0]).toMatchObject({ total: "= 100 a month", word: "billable hour", revenue: "$100.00", inputs: [{ label: "Technicians" }, { label: "Billable hours each" }] });
    expect(streams[1].measures[0]).toMatchObject({ word: "contract-month", revenue: "$1,500.00" });
    expect(reconciliation(body, baseline, result)).toEqual({
      reconciles: true, tag: { label: "Reconciles to IRS revenue", tone: "ok" }, text: "Streams add up to $103,000 a month, the average of IRS revenue $1,236,000 a year", balance: null,
    });
    expect(revenueLead(baseline)).toBe("IRS 2025 prints $1,236,000 of revenue, which is $103,000 in an average month.");
    expect(revenueLead({ ...baseline, source: { kind: "profit_and_loss", annualized: true } })).toBe("P&L annualizes to $1,236,000 of revenue, which is $103,000 in an average month.");
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
    expect(rows.get("pricing")).toMatchObject({ itemId: null, label: "Overall pricing", current: "Current $1,236,000 / yr", plan: "", direction: "up" });
    const units = (key: string) => rows.get(key)!.units.map(unit => `${unit.value}:${unit.label}`);
    // Prices, metrics, fixed costs and whole groups are sized in their own unit or a percent.
    expect([units("pricing"), units("f:s1:f1"), units("f:s2:f0"), units("l:rent"), units("g:oth")]).toEqual([
      ["amount:$ / yr", "percent:%"], ["amount:$", "percent:%"], ["amount:clients", "percent:%"], ["amount:$ / yr", "percent:%"], ["amount:$ / yr", "percent:%"],
    ]);
    // A cost that follows revenue or a stream takes dollars a year first, then its own rate, then a percent.
    expect([units("l:o1"), units("l:c1")]).toEqual([["annual:$ / yr", "amount:pts", "percent:%"], ["annual:$ / yr", "amount:$ / unit", "percent:%"]]);
    // A growth activity is sized by its own fields, not by this toggle.
    expect(sections[1].rows[0].units).toEqual([]);
    expect(rows.get("f:s1:f1")).toMatchObject({ label: "Price per unit", sub: "Detail packages", current: "Current $250.00", plan: "Plan $262.00", itemId: "f:s1:1" });
    expect(rows.get("f:s1:f1")!.effect).toMatchObject({ status: { label: "Reviewed", tone: "ok" }, needsNote: false, dimmed: false, positive: true });
    expect(rows.get("f:s1:f1")!.effect!.spark).toEqual([false, true, true, true, true, true, true, true, true, true, true, true]);
    // Units sold has no change of its own, yet the plan moves it: the growth activity adds 40 a month.
    expect(rows.get("f:s1:f0")).toMatchObject({ itemId: null, current: "Current 300 units / mo", plan: "Plan 340 units / mo" });
    expect(rows.get("f:s2:f0")!.effect).toMatchObject({ status: { label: "Explanation needed", tone: "warn" }, needsNote: true });
    expect(rows.get("l:o1")).toMatchObject({ label: "Card processing", sub: "Other · 2.0% of all revenue", direction: "down" });
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
    expect(releasedView(baseline, result, basis)).toEqual({
      available: true, text: "Client terms v3 release $50,000 a month. Assign it to costs the plan relies on, a reserve, or leave it as cash.", tag: { label: "$35,800 / mo stays as cash", tone: "mut" },
      // What the refinance itself does to the figures is said in so many words: cash and coverage, never earnings.
      effect: "The saved loan terms are already counted in the figures: annual debt service goes from $777,600 to $177,600, which adds $600,000 a year to free cash flow and moves DSCR with it. It does not change EBITDA or NOI, because loan payments are not operating costs.",
    });
    expect(releasedView(baseline, result, "current_debt")).toMatchObject({ tag: { label: "Over-allocated by $14,200 / mo" }, effect: null });
    // Operating costs the loan itself adds are netted out of what it frees (the API nets them out of the release too), and
    // named so the two figures still add up.
    const costly = { ...baseline, loan_operating_annual: 12_000, released_monthly: 49_000 };
    expect(releasedView(costly, evaluate(body, costly, { goal: REFERENCE.plan.noi_goal, questions: QUESTIONS }), basis).effect).toBe(
      "The saved loan terms are already counted in the figures: annual debt service goes from $777,600 to $177,600, which adds $588,000 a year to free cash flow after the $12,000 a year of operating costs the loan itself adds, and moves DSCR with it. It does not change EBITDA or NOI, because loan payments are not operating costs.");
    // Coverage counts the year as the loan's schedule sets it out, which is not always twelve regular payments. A file whose
    // release is $54,706 a month while debt service falls $546,360 a year says so, instead of leaving two figures that look
    // like a contradiction.
    const stepped = { ...baseline, debt_service_current: 927_948, debt_service_with_terms: 381_588, released_monthly: 54_706 };
    expect(releasedView(stepped, evaluate(body, stepped, { goal: REFERENCE.plan.noi_goal, questions: QUESTIONS }), basis)).toMatchObject({
      text: "Client terms v3 release $54,706 a month. Assign it to costs the plan relies on, a reserve, or leave it as cash.",
      effect: "The saved loan terms are already counted in the figures: annual debt service goes from $927,948 to $381,588, which adds $546,360 a year to free cash flow and moves DSCR with it. That is $45,530 a month, not the $54,706 above: the release is measured on the loan's regular payment, and coverage on the year as the loan's schedule sets it out. It does not change EBITDA or NOI, because loan payments are not operating costs.",
    });
    // Terms that cost more than today's payments take cash instead of freeing it.
    expect(releasedView({ ...baseline, debt_service_with_terms: 800_000 }, result, basis).effect)
      .toContain("goes from $777,600 to $800,000, which takes $22,400 a year from free cash flow and moves DSCR with it.");
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
      "Describe the revenue streams in step 2 to change them here.", "Count a revenue stream in step 2 (its units, hours or jobs) to plan growth: growth adds to what is counted.",
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
    expect(reconciliation(short, baseline, low)).toEqual({
      reconciles: false, tag: { label: "Differs from IRS revenue by −$60,000", tone: "warn" },
      text: "Streams state $98,000 a month against an average of $103,000: $5,000 a month is not explained.", balance: "Put the rest in “Other revenue”",
    });
    // With a stream that holds the rest the model equals the source by itself, and there is nothing more to offer.
    const held = balanceRevenue(short);
    expect(reconciliation(held, baseline, evaluate(held, baseline))).toMatchObject({ reconciles: true, balance: null });
    const high = referenceBody();
    high.streams[0].factors[0].value = "320";
    expect(reconciliation(high, baseline, evaluate(high, baseline))).toEqual({
      reconciles: false, tag: { label: "Differs from IRS revenue by +$60,000", tone: "warn" },
      text: "Streams state $108,000 a month against an average of $103,000: $5,000 a month too much. Lower one of them.", balance: null,
    });
    const split = referenceBody();
    split.lines.find(line => line.id === "c4")!.base = 60_000;
    expect(itemization(split, baseline, evaluate(split, baseline).behaviors)[0]).toMatchObject({ state: "unallocated", tag: "Unallocated $9,086" });
  });

  it("counts operating costs the loan adds in coverage with the terms, says so, and leaves earnings alone", () => {
    const costly = { ...referenceBaseline(), loan_operating_annual: 12_000 };
    const figures = evaluate(body, costly, { goal: REFERENCE.plan.noi_goal, questions: QUESTIONS });
    const live = Object.fromEntries(liveMetrics(costly, figures, "proposed", "with_terms").map(row => [row.key, `${row.before} → ${row.after}`]));
    expect(live).toMatchObject({ ebitda: "−$22,377 → $182,897", noi: "−$30,777 → $174,497", dscr: "−0.03x → 0.96x", free_cash_flow: "−$799,977 → −$6,703", operating_margin: "−2.5% → 11.6%" });
    const table = Object.fromEntries(beforeAfterTable(costly, figures, "with_terms").map(row => [row.label, [row.current, row.plan, row.reviewed]]));
    expect(table["Annual EBITDA"]).toEqual(["−$22,377", "$182,897", "$52,164"]);
    expect(table["Cash after debt / year"]).toEqual(["−$799,977", "−$6,703", "−$137,436"]);
    expect(table["DSCR · saved refinance"]).toEqual(["−0.19x", "0.96x", "0.23x"]);
    expect(table["DSCR · current debt"]).toEqual(["−0.03x", "0.24x", "0.07x"]);
    expect(coverageScale(costly, figures, "proposed", "with_terms")).toMatchObject({ planText: "Plan 0.96x", needText: "Needs $51,103 more EBITDA", state: { label: "Below 1.00x" } });
    expect(sourceView(body, costly, false).terms).toMatchObject({ costs: "$12,000 / yr", coverage: "−0.03x → −0.19x" });
    expect(loanCostsNote(costly, "with_terms")).toContain("add $12,000 a year of operating costs");
    // Measured against today's payments the loan is not there, and nothing is said or deducted.
    expect(loanCostsNote(costly, "current_debt")).toBeNull();
    expect(coverageScale(costly, figures, "proposed", "current_debt")).toMatchObject({ planText: "Plan 0.24x" });
    expect(Object.fromEntries(beforeAfterTable(costly, figures, "current_debt").map(row => [row.label, row.plan]))["Cash after debt / year"]).toBe("−$594,703");
    // The design's file has no such cost: no note, and a cost the budget has not confirmed is flagged, not guessed.
    expect([loanCostsNote(baseline, "with_terms"), sourceView(body, baseline, false).terms?.costs]).toEqual([null, null]);
    expect(loanCostsNote({ ...baseline, loan_operating_confirmed: false }, "with_terms")).toContain("not confirmed");
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

describe("earnings plan screens: revenue stated, counted in units and in hours", () => {
  const measured = measuredBody();
  const figures = evaluate(measured, baseline);

  it("shows what one unit and one hour bring in and cost, by dividing", () => {
    const [card] = streamCards(measured, baseline, figures, STREAM_TEMPLATES);
    // The stream is all of the source's revenue: there is no revenue box to type in and no price anywhere.
    expect(card).toMatchObject({ name: "All revenue", typeLabel: "Custom metrics", revenueInput: null, monthly: "$103,000", annual: "$1,236,000", share: "the whole average month", unmeasured: null });
    expect(card.measures).toEqual([
      { factorId: null, role: "volume", inputs: [{ id: "f0", label: "Units sold", named: true, value: "400", unit: "units / mo" }], total: null, word: "unit",
        note: "Revenue follows this", revenue: "$257.50", cost: "$263.91", noi: "−$6.41", noiTone: "bad" },
      { factorId: "f2", role: "alongside", inputs: [{ id: "f2", label: "Labor hours", named: true, value: "1200", unit: "hrs / mo" }], total: null, word: "hour",
        note: "Moves with the volume", revenue: "$85.83", cost: "$87.97", noi: "−$2.14", noiTone: "bad" },
    ]);
    // Before anything is counted the stream says so, and still brings all its revenue.
    const seeded = { ...measured, streams: [{ ...measured.streams[0], factors: [measured.streams[0].factors[1]] }], lines: measured.lines.map(line => ({ ...line, behavior: "fixed" as const, link: "all", measure: null })) };
    const [bare] = streamCards(seeded, baseline, evaluate(seeded, baseline), STREAM_TEMPLATES);
    expect(bare).toMatchObject({ monthly: "$103,000", measures: [], unmeasured: "Not counted yet. Add what an average month has (units, hours, jobs) to see what one of them brings in and costs." });
    // A quantity that is not typed yet leaves the row there to type in, with nothing to divide by.
    const blank = { ...measured, streams: [{ ...measured.streams[0], factors: measured.streams[0].factors.map(factor => (factor.id === "f0" ? { ...factor, value: "" } : factor)) }] };
    expect(streamCards(blank, baseline, evaluate(blank, baseline), STREAM_TEMPLATES)[0].measures[0]).toMatchObject({ revenue: "—", cost: "—", noi: "—", noiTone: "mut" });
  });

  it("sits a stated stream beside the one that holds the rest", () => {
    const added = addStream(measured, "units", STREAM_TEMPLATES);
    const two = setStreamRevenue(added, added.streams[1].id, "60000");
    const cards = streamCards(two, baseline, evaluate(two, baseline), STREAM_TEMPLATES);
    expect(cards.map(card => [card.name, card.revenueInput, card.monthly, card.share])).toEqual([
      ["Other revenue", null, "$43,000", "what the other streams leave"], ["Units sold", "60000", "$60,000", "58.3% of the average month"],
    ]);
    expect(reconciliation(two, baseline, evaluate(two, baseline)).reconciles).toBe(true);
    // Stating more than the source leaves nothing for the rest and says how much is too much.
    const over = setStreamRevenue(two, added.streams[1].id, "110000");
    expect(reconciliation(over, baseline, evaluate(over, baseline))).toMatchObject({
      reconciles: false, text: "Streams state $110,000 a month against an average of $103,000: $7,000 a month too much. Lower one of them.", balance: null,
    });
  });

  it("names what each cost follows, and lets a cost per unit follow the hours", () => {
    expect(costLinks(measured)).toEqual([{ value: "s1", label: "All revenue" }, { value: "s1|f2", label: "All revenue · Labor hours" }, { value: "all", label: "All revenue" }]);
    const costs = new Map(costRows(measured, baseline, figures, STREAM_TEMPLATES).map(row => [row.id, row]));
    expect([costs.get("c1")!.link, costs.get("c1")!.rate]).toEqual(["s1", "$78.75 per unit"]);
    expect([costs.get("sal")!.link, costs.get("sal")!.rate]).toEqual(["s1|f2", "$24.18 per hour"]);
    expect(costs.get("o1")!.rate).toBe("2.00% of revenue");
    // A cost set to follow a volume nobody has counted yet is held where it is.
    const blank = { ...measured, streams: [{ ...measured.streams[0], factors: measured.streams[0].factors.map(factor => (factor.id === "f0" ? { ...factor, value: "" } : factor)) }] };
    expect(costRows(blank, baseline, evaluate(blank, baseline), STREAM_TEMPLATES).find(row => row.id === "c1")!.rate).toBe("Nothing counted to follow yet · held fixed");
    expect([unitWord(measured.streams[0], STREAM_TEMPLATES), unitWord(body.streams[2], STREAM_TEMPLATES), unitWord(undefined, STREAM_TEMPLATES)]).toEqual(["unit", "billable hour", "unit"]);
    expect(["units / mo", "hrs / mo", "jobs / mo", "tons hauled / mo", "people", "per mo", "count", "glass / mo", ""].map(perWord)).toEqual(["unit", "hour", "job", "ton", "person", "unit", "unit", "glass", "unit"]);
  });

  it("offers each metric to the plan with today's value, the price worked out", () => {
    const rows = changeSections(measured, baseline, figures, STREAM_TEMPLATES, basis)[0].rows;
    expect(rows.map(row => [row.rowKey, row.label, row.sub, row.current, row.units.map(unit => unit.label)])).toEqual([
      ["pricing", "Overall pricing", "All revenue streams · price only, volume unchanged", "Current $1,236,000 / yr", ["$ / yr", "%"]],
      ["f:s1:f0", "Units sold", "All revenue", "Current 400 units / mo", ["units", "%"]],
      ["f:s1:f1", "Revenue per unit", "All revenue", "Current $257.50", ["$", "%"]],
      ["f:s1:f2", "Labor hours", "All revenue · counted alongside; costs that follow it move, revenue does not", "Current 1,200 hrs / mo", ["hrs", "%"]],
    ]);
    const wages = changeSections(measured, baseline, figures, STREAM_TEMPLATES, basis).flatMap(section => section.rows).find(row => row.rowKey === "l:sal")!;
    expect(wages.sub).toBe("Salaries · $24.18 per hour of All revenue");
  });
});

describe("earnings plan screens: per unit, before and after", () => {
  const words = { start_month: 1, setup_cost: null, setup_cadence: "one_time" as const, evidence_note: "", owner: "", included: true, status: "proposed" as const, note: "Agreed with the owner." };
  const metric = (factorId: string, direction: "up" | "down", value: number, mode: "percent" | "amount" = "percent") =>
    ({ ...words, id: `f:s1:${factorId}`, target: { kind: "factor" as const, stream_id: "s1", factor_id: factorId }, direction, mode, value });

  it("shows what one unit and one hour bring in and cost, today and with the plan", () => {
    const planned = { ...measuredBody(), changes: [metric("f0", "up", 10), metric("f2", "down", 5), metric("f1", "up", 5, "amount")] };
    const figures = evaluate(planned, baseline);
    const pair = (before: string, after: string | null = null) => ({ before, after });
    expect(perUnitTable(planned, figures, STREAM_TEMPLATES, "proposed")).toEqual([
      { key: "s1:volume", label: "All revenue · per unit", quantity: pair("400 a month", "440 a month"), revenue: pair("$257.50", "$262.50"), cost: pair("$263.91", "$250.61"),
        noi: pair("−$6.41", "$11.89"), noiTone: "ok" },
      { key: "s1:f2", label: "All revenue · per hour (Labor hours)", quantity: pair("1,200 a month", "1,254 a month"), revenue: pair("$85.83", "$92.11"), cost: pair("$87.97", "$87.93"),
        noi: pair("−$2.14", "$4.17"), noiTone: "ok" },
    ]);
    // Nothing is reviewed yet, so the reviewed side is today: one figure, nothing under it.
    expect(perUnitTable(planned, figures, STREAM_TEMPLATES, "reviewed")[0]).toEqual(
      { key: "s1:volume", label: "All revenue · per unit", quantity: pair("400 a month"), revenue: pair("$257.50"), cost: pair("$263.91"), noi: pair("−$6.41"), noiTone: "mut" });
    // The design's plan, described as units times price, gets the same table. A price the plan does not touch stays one figure.
    expect(perUnitTable(body, result, STREAM_TEMPLATES, "proposed").map(row => [row.label, row.quantity, row.revenue, row.noi])).toEqual([
      ["Detail packages · per unit", pair("300 a month", "340 a month"), pair("$250.00", "$262.00"), pair("−$6.23", "$30.46")],
      ["Fleet maintenance contracts · per contract-month", pair("12 a month", "16 a month"), pair("$1,500.00"), pair("−$37.35", "$174.39")],
      ["Paint correction labor · per billable hour", pair("100 a month", "120 a month"), pair("$100.00"), pair("−$2.49", "$11.63")],
    ]);
    // A plan with nothing counted has no table at all.
    const bare = { ...measuredBody(), streams: [{ ...measuredBody().streams[0], factors: [measuredBody().streams[0].factors[1]] }], lines: measuredBody().lines.map(line => ({ ...line, behavior: "fixed" as const, link: "all", measure: null })) };
    expect(perUnitTable(bare, evaluate(bare, baseline), STREAM_TEMPLATES, "proposed")).toEqual([]);
  });
});
