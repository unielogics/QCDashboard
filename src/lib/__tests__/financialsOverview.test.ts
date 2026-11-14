import { describe, expect, it } from "vitest";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import {
  accountMovement,
  balanceSheet,
  bankTrends,
  coverageCard,
  coverageNotice,
  currentMetrics,
  debtSchedule,
  earningsPotential,
  earningsSources,
  metricStrip,
  overdrafts,
  percent,
  planCard,
  profitAndLoss,
  revenueTrend,
  signedTimes,
  signedUsd,
  statementPayments,
  taxReturns,
  times,
  trackedExpenses,
  usd,
  waterfall,
} from "@/lib/financialsOverview";
import { bareCockpit, emptyCockpit, harborBankSummary, harborCockpit, harborMonths, harborPlanSummary } from "./fixtures/financialsOverviewFixture";

const texts = (rows: Array<{ cells: Array<{ text: string }> }>) => rows.map((row) => row.cells.map((cell) => cell.text));

describe("formatting", () => {
  it("prints a real minus sign and a dash for a missing figure", () => {
    expect(usd(-22377)).toBe("−$22,377");
    expect(usd(1236000)).toBe("$1,236,000");
    expect(usd(-0.2)).toBe("$0");
    expect(usd(null)).toBe("—");
    expect(signedUsd(89616)).toBe("+$89,616");
    expect(signedUsd(-14400)).toBe("−$14,400");
    expect(signedUsd(0)).toBe("$0");
    expect(times(-0.03)).toBe("−0.03x");
    expect(times(-0.001)).toBe("0.00x");
    expect(signedTimes(0.504)).toBe("+0.50x");
    expect(percent(-2.49)).toBe("−2.5%");
  });
});

describe("the six metrics", () => {
  it("shows the design's before and after for a file with a plan and saved terms", () => {
    const strip = metricStrip(harborCockpit(), harborPlanSummary().evaluation);
    expect(strip.map((cell) => [cell.label, cell.value, cell.after, cell.note])).toEqual([
      ["EBITDA", "−$22,377", "$182,897", "with plan"],
      ["NOI", "−$30,777", "$174,497", "with plan"],
      ["DSCR", "−0.03x", "1.03x", "with plan and terms"],
      ["Free cash flow", "−$799,977", "$5,297", "with plan and terms"],
      ["Operating margin", "−2.5%", "11.6%", "with plan"],
      ["Debt service", "$777,600", "$177,600", "with terms"],
    ]);
    expect(strip.map((cell) => cell.negative)).toEqual([true, true, true, true, true, false]);
    expect(strip.every((cell) => cell.tone === "ok")).toBe(true);
  });

  it("falls back to the saved terms when the plan has no changes", () => {
    const strip = metricStrip(harborCockpit(), null);
    expect(strip.map((cell) => [cell.key, cell.after, cell.note])).toEqual([
      ["ebitda", null, "No plan changes yet"],
      ["noi", null, "No plan changes yet"],
      ["dscr", "−0.13x", "with terms"],
      ["free_cash_flow", "−$199,977", "with terms"],
      ["operating_margin", null, "No plan changes yet"],
      ["debt_service", "$177,600", "with terms"],
    ]);
    // Lower coverage on a loss is worse, and says so.
    expect(strip.find((cell) => cell.key === "dscr")?.tone).toBe("bad");
    expect(strip.find((cell) => cell.key === "free_cash_flow")?.tone).toBe("ok");
  });

  it("says what is missing instead of going blank", () => {
    const cockpit = harborCockpit();
    cockpit.baseline!.metrics.with_terms = null;
    cockpit.baseline!.debt_service = { ...cockpit.baseline!.debt_service, with_terms_annual: null, with_terms_monthly: null, released_monthly: null, retired: null };
    const unpriced = harborPlanSummary().evaluation!;
    unpriced.comparison!.proposed = { earnings: null, noi: null, dscr: null, cash_after_debt: null, operating_margin: null, debt_service: null };
    const strip = metricStrip(cockpit, unpriced);
    expect(strip.map((cell) => cell.note)).toEqual(["Plan needs inputs", "Plan needs inputs", "Plan needs inputs", "Plan needs inputs", "Plan needs inputs", "No loan terms saved"]);
    expect(strip.every((cell) => cell.after === null && cell.value !== "—")).toBe(true);

    const empty = metricStrip(emptyCockpit(), null);
    expect(empty.map((cell) => cell.value)).toEqual(["—", "—", "—", "—", "—", "—"]);
    expect(empty[0].note).toBe("No earnings source yet");
    expect(empty[5].note).toBe("No loan terms saved");
  });

  it("says a debt-free business has no debt to cover", () => {
    const cockpit = harborCockpit();
    cockpit.dscr.no_debt = true;
    cockpit.baseline!.metrics = { current: { ebitda: -22_377, noi: -30_777, dscr: null, free_cash_flow: -22_377, operating_margin: -2.49, debt_service: 0 }, with_terms: null };
    const dscr = metricStrip(cockpit, null).find((cell) => cell.key === "dscr")!;
    expect([dscr.value, dscr.after, dscr.note, dscr.negative]).toEqual(["—", null, "No debt to cover", false]);
  });

  it("reads the cockpit headlines when the baseline block is missing", () => {
    const cockpit = { ...harborCockpit(), baseline: undefined, ebitda: { headline: { annualized_value: 50_000, value: 50_000 } }, noi: { headline: { annualized_value: 40_000 } } } as unknown as FinancialCockpit;
    const current = currentMetrics(cockpit);
    expect(current.ebitda).toBe(50_000);
    expect(current.noi).toBe(40_000);
    expect(current.debt_service).toBe(777_600);
    expect(current.free_cash_flow).toBe(-727_600);
  });
});

describe("coverage after the terms, for the Underwriting tab", () => {
  it("says the design's sentence from the same figures as the strip", () => {
    expect(coverageNotice(harborCockpit(), harborPlanSummary().evaluation)).toEqual({
      text: "Coverage after these terms is −0.13x on documented earnings and 1.03x with the earnings plan.",
      tone: "acc",
    });
  });

  it("has words for a file with no plan changes, no terms or no earnings source", () => {
    expect(coverageNotice(harborCockpit(), null)).toEqual({ text: "Coverage after these terms is −0.13x on documented earnings. The earnings plan has no changes yet.", tone: "warn" });
    const noTerms = harborCockpit();
    noTerms.baseline!.metrics.with_terms = null;
    expect(coverageNotice(noTerms, null)?.text).toBe("Coverage today is −0.03x on documented earnings. The earnings plan has no changes yet. Save the loan terms to see coverage after them.");
    const strong = harborPlanSummary().evaluation!;
    strong.comparison!.proposed.dscr = 1.31;
    expect(coverageNotice(harborCockpit(), strong)?.tone).toBe("ok");
    expect(coverageNotice(emptyCockpit(), null)).toBeNull();
  });
});

describe("the earnings plan card", () => {
  it("prints the headline, the changes by group and the costs", () => {
    const card = planCard(harborCockpit(), harborPlanSummary());
    expect(card.chip).toEqual({ label: "Published v1", tone: "acc" });
    expect(card.earnings).toEqual({ before: "−$22,377", after: "$182,897" });
    expect(card.coverage).toEqual({ before: "−0.03x", after: "1.03x" });
    expect(card.gap).toEqual({ value: "$39,103 / year", met: false });
    expect(card.rows.map((row) => [row.label, row.ebitda, row.dscr])).toEqual([
      ["Client terms v3 · payments $64,800 → $14,800 / month", "no change", "−0.03x → −0.13x"],
      ["Revenue drivers · 4 fleet contracts and 20% more billable hours", "+$89,616", "+0.50x"],
      ["Growth · Google Ads $3,000 / month, 40 added units", "+$36,844", "+0.21x"],
      ["Cost of goods sold · Detail supplies −5%", "+$21,420", "+0.12x"],
      ["Operating expenses · Rent renegotiation and 3 more", "+$71,793", "+0.40x"],
      ["Other changes · Weekend detailer", "−$14,400", "−0.08x"],
    ]);
    expect(card.footer).toEqual(["14 cost lines · 11 changes · 3 reviewed", "8 items to finish"]);
    expect(card.costsTitle).toBe("Largest disclosed annual costs");
    expect(card.costs.map((row) => [row.label, row.amount, row.share])).toEqual([["COGS", "$601,886", 100], ["Salaries", "$348,194", 58], ["Rent", "$196,805", 33], ["Other", "$27,092", 5]]);
    expect(card.facts).toEqual([
      { label: "Known operating cash costs", value: "$98,872 / mo" },
      { label: "Known COGS", value: "$50,157 / mo" },
      { label: "Reviewed earnings change", value: "$0 / yr" },
    ]);
    expect(card.metrics.map((row) => `${row.label} ${row.before} ${row.after}`)).toEqual(["EBITDA −$22,377 $182,897", "NOI −$30,777 $174,497", "DSCR −0.03x 1.03x", "Free cash flow −$799,977 $5,297", "Margin −2.5% 11.6%"]);
    expect(card.pdfCaption).toBe("Latest PDF · v1 · Nov 11, 2026");
    expect(card.empty).toBeNull();
  });

  it("still shows the source's costs and the terms when there is no plan", () => {
    const card = planCard(harborCockpit(), { has_plan: false, expense_count: 0, action_count: 0, reviewed_action_count: 0, missing_count: 0, cost_mix: [], evaluation: null });
    expect(card.chip.label).toBe("No plan yet");
    expect(card.earnings).toEqual({ before: "−$22,377", after: "—" });
    expect(card.coverage).toEqual({ before: "−0.03x", after: "−0.13x" });
    expect(card.gap.value).toBe("$244,377 / year");
    expect(card.rows).toHaveLength(1);
    expect(card.costsTitle).toBe("Largest annual costs on the source");
    expect(card.costs[0]).toMatchObject({ label: "Cost of goods sold", amount: "$601,886" });
    expect(card.facts.map((row) => row.value)).toEqual(["$55,408 / mo", "$50,157 / mo"]);
    expect(card.empty).toMatch(/^No plan yet/);
    expect(card.footer).toEqual([]);
    expect(card.pdfCaption).toBe("Save a version to create the plan PDF");
  });

  it("flags a change that cannot be priced instead of dropping the group", () => {
    const summary = harborPlanSummary();
    summary.evaluation!.actions[2] = { ...summary.evaluation!.actions[2], proposed_math_valid: false, net_annual_impact: null };
    const row = planCard(harborCockpit(), summary).rows.find((item) => item.key === "cogs")!;
    expect([row.ebitda, row.dscr, row.ebitdaTone]).toEqual(["Needs inputs", "—", "warn"]);
  });

  it("draws the bridge as a waterfall that ends on the plan figure", () => {
    const bars = waterfall(-100, [150, 50, -20], 80);
    expect(bars).toHaveLength(5);
    expect(bars[0].tone).toBe("bad");
    expect(bars.slice(1, 4).map((bar) => bar.tone)).toEqual(["ok", "ok", "bad"]);
    expect(bars[4].tone).toBe("acc");
    // -100 … +100 on one scale: zero sits in the middle and the total ends at +80.
    expect(bars[0]).toMatchObject({ left: 0, right: 50 });
    expect(bars[4]).toMatchObject({ left: 50, right: 10 });
    expect(waterfall(null, [10], null)).toEqual([]);
  });
});

describe("coverage and the debt schedule", () => {
  it("compares today's obligations with the saved terms", () => {
    const card = coverageCard(harborCockpit());
    expect(card.today).toEqual({ value: "$64,800", sub: "/ month · 5 obligations" });
    expect(card.plan).toEqual({ value: "$14,800", sub: "/ month · 1 loan" });
    expect(card.released).toEqual({ value: "$50,000", sub: "/ month", tone: "ok" });
    expect(card.bars).toEqual({ today: "$777,600", todayShare: 100, plan: "$177,600", planShare: 23 });
    expect(card.coverage).toEqual({ before: "−0.03x", after: "−0.13x" });
    expect(card.note).toBe("Coverage −0.03x today, −0.13x with the saved terms; annual debt service on the bars.");
    const blocked = harborCockpit();
    blocked.plan.evaluation.coverage_unavailable_reason = "The new payment is not set.";
    expect(coverageCard(blocked).note).toBe("The new payment is not set.");
  });

  it("lists the schedule and what the plan pays off", () => {
    const card = debtSchedule(harborCockpit());
    expect(card.tag.label).toBe("5 rows · all paid off by plan");
    expect(texts(card.table!.rows)[0]).toEqual(["Northline Capital", "Advance", "$286,000", "$19,400"]);
    expect(texts(card.table!.rows)[4]).toEqual(["First Coast Equipment", "Equipment note", "$212,400", "$4,800"]);
    // Only some rows paid off: each says which.
    const partial = harborCockpit();
    partial.plan.evaluation.retired_ids = ["row:northline", "row:kestrel"];
    const some = debtSchedule(partial);
    expect(some.tag.label).toBe("5 rows · 2 paid off by plan");
    expect(texts(some.table!.rows).map((row) => row[1])).toEqual(["Advance · paid off by plan", "Advance · paid off by plan", "Advance", "Advance", "Equipment note"]);
  });

  it("has words for a file with no schedule and for a business with no debt", () => {
    expect(debtSchedule(emptyCockpit())).toMatchObject({ table: null, tag: { label: "Not requested yet" } });
    const cockpit = harborCockpit();
    cockpit.debt.schedule = { ...cockpit.debt.schedule, status: "voided", voided: { reason: "Owner confirmed", by: "Desk", by_user_id: null, at: null } };
    expect(debtSchedule(cockpit)).toMatchObject({ table: null, tag: { label: "No debt · declared by the desk", tone: "ok" }, empty: "No debt on the business: Owner confirmed" });
    expect(coverageCard(emptyCockpit())).toMatchObject({ today: { value: "—", sub: "No obligations on file" }, plan: { value: "—", sub: "No loan terms saved" }, hasTerms: false, note: "Annual debt service on the bars." });
  });
});

describe("the statements", () => {
  it("prints the return that leads, the fallback P&L and the balance sheet", () => {
    const cockpit = harborCockpit();
    const tax = taxReturns(cockpit);
    expect(tax.tag).toEqual({ label: "Primary source", tone: "acc" });
    expect(tax.table!.head).toEqual(["1120-S", "2024", "2025"]);
    expect(texts(tax.table!.rows)).toEqual([
      ["Gross receipts", "$1,301,050", "$1,236,000"],
      ["Cost of goods sold", "$618,200", "$601,886"],
      ["Total deductions", "$641,300", "$664,891"],
      ["Ordinary income", "$41,550", "−$30,777"],
    ]);
    expect(tax.footer).toBe("Revenue 2024 → 2025 · down · −5.0%");

    const statement = profitAndLoss(cockpit);
    expect(statement.tag?.label).toBe("Jan–Sep 2026 · 9 mo");
    expect(texts(statement.table!.rows)).toEqual([
      ["Revenue", "$878,400", "$1,171,200"],
      ["Cost of goods sold", "$441,300", "$588,400"],
      ["Operating expenses", "$502,725", "$670,300"],
      ["Operating income", "−$65,625", "−$87,500"],
    ]);
    expect(statement.footer).toBe("Labelled fallback where the return does not print a line.");

    const sheet = balanceSheet(cockpit);
    expect(sheet.tag?.label).toBe("As of Sep 30, 2026");
    expect(texts(sheet.table!.rows)).toEqual([["Cash", "$38,420"], ["Total assets", "$612,900"], ["Total liabilities", "$1,124,600"], ["Equity", "−$511,700"]]);
    expect(sheet.footer).toBe("Accrual basis.");
  });

  it("asks for what is missing", () => {
    const empty = emptyCockpit();
    expect(taxReturns(empty).empty).toMatch(/^No tax return analyzed yet/);
    expect(profitAndLoss(empty).empty).toBe("No profit-and-loss statement has been analyzed yet.");
    expect(balanceSheet(empty).empty).toBe("No balance sheet has been analyzed yet.");
  });
});

describe("potential, trend and sources", () => {
  it("lists the earnings still to find for each coverage goal", () => {
    const card = earningsPotential(harborCockpit());
    expect(card.tag).toEqual({ label: "−1.8% baseline margin", tone: "bad" });
    expect(texts(card.table!.rows)).toEqual([["1.00x", "+$799,977", "+$199,977"], ["1.10x", "+$877,737", "+$217,737"], ["1.25x", "+$994,377", "+$244,377"]]);
    const met = harborCockpit();
    met.baseline!.targets = [{ ratio: 1.25, current_debt: 0, with_terms: null }];
    expect(earningsPotential(met).table!.rows[0].cells.map((cell) => cell.text)).toEqual(["1.25x", "Met", "—"]);
    expect(earningsPotential(emptyCockpit()).empty).toBeTruthy();
  });

  it("shows the revenue trend and where the outlook comes from", () => {
    const card = revenueTrend(harborCockpit());
    expect(card.tag).toEqual({ label: "2024 → 2025 · −5.0%", tone: "warn" });
    expect(card.bars.map((bar) => [bar.label, bar.share, bar.latest])).toEqual([["2024 · $1,301,050", 100, false], ["2025 · $1,236,000", 95, true]]);
    expect(card.footer).toMatch(/^2026 P&L run-rate illustration: \$1,171,200\./);
    expect(revenueTrend(emptyCockpit()).empty).toBeTruthy();
  });

  it("names the selected source and lists the others", () => {
    const card = earningsSources(harborCockpit());
    expect(card.tag).toEqual({ label: "IRS 2025 selected", tone: "acc" });
    expect(texts(card.table!.rows)).toEqual([
      ["Filed return 2025", "−$30,777", "−$22,377"],
      ["P&L Jan–Sep 2026 · annualized", "−$87,500", "−$79,100"],
      ["Bank cash retained · proxy", "−$198,000", "—"],
    ]);
    expect(card.table!.rows.map((row) => Boolean(row.strong))).toEqual([true, false, false]);
    expect(card.footer).toBe("A filed return comes first, the P&L is the labelled fallback, bank cash is a proxy. No add-backs applied.");
    expect(earningsSources(emptyCockpit())).toMatchObject({ table: null, tag: { label: "No source selected" } });
  });
});

describe("expenses, risk and movement", () => {
  it("lists expense lines that add up to the source", () => {
    const card = trackedExpenses(harborCockpit(), harborBankSummary);
    expect(card.tag).toEqual({ label: "Adds up to the source", tone: "ok" });
    const rows = texts(card.table!.rows);
    expect(rows[0]).toEqual(["Cost of goods sold", "IRS 2025", "$601,886"]);
    expect(rows[1]).toEqual(["Salaries and wages", "IRS 2025", "$348,194"]);
    expect(rows).toHaveLength(6);
    expect(rows.slice(-2)).toEqual([["4 more lines", "IRS 2025", "$88,492"], ["Total", "", "$1,266,777"]]);
    expect(card.footer).toBe("Bank outflows $117,900 / month and debt service $64,800 / month sit beside these for scale.");
  });

  it("summarises overdrafts and negative balances", () => {
    const card = overdrafts(harborMonths);
    expect(card.tag).toEqual({ label: "14 negative days", tone: "bad" });
    expect(card.stats).toEqual([
      { label: "NSF / overdraft fees", value: "3" },
      { label: "Lowest balance", value: "−$6,840", tone: "bad" },
      { label: "Months affected", value: "4 of 6" },
    ]);
    expect(overdrafts([]).empty).toBeTruthy();
  });

  it("joins both directions between two accounts and adds owner draws", () => {
    const card = accountMovement(harborCockpit());
    expect(card.table!.head).toEqual(["Between", "6 months"]);
    expect(texts(card.table!.rows)).toEqual([["Operating ↔ payroll account", "$184,000"], ["Owner draws", "$21,600"]]);
    expect(accountMovement(emptyCockpit()).empty).toMatch(/^Transfers between accounts appear here/);
  });
});

describe("bank trends and statement payments", () => {
  it("scales the months to the largest and prints the averages", () => {
    const card = bankTrends(harborMonths, harborBankSummary);
    expect(card.sub).toBe("6 statement months · deposits and withdrawals");
    expect(card.columns.map((column) => [column.label, column.deposits, column.withdrawals])).toEqual([["May", 81, 96], ["Jun", 77, 91], ["Jul", 87, 94], ["Aug", 73, 89], ["Sep", 79, 100], ["Oct", 84, 92]]);
    expect(card.stats).toEqual([
      { label: "Avg deposits", value: "$101,400" },
      { label: "Avg withdrawals", value: "$117,900" },
      { label: "Net", value: "−$16,500 / mo", tone: "bad" },
      { label: "Negative days", value: "14" },
    ]);
    expect(bankTrends([], null).empty).toBeTruthy();
  });

  it("lists the lender payments seen in the statements", () => {
    const card = statementPayments(harborCockpit(), harborMonths);
    expect(card.tag).toEqual({ label: "4 active advances", tone: "warn" });
    expect(texts(card.table!.rows)).toEqual([
      ["Northline Capital", "Daily", "$924", "$19,400"],
      ["Kestrel Funding", "Daily", "$805", "$16,900"],
      ["Bluewater Advance", "Weekly", "$3,046", "$13,200"],
      ["Summit Merchant", "Weekly", "$2,423", "$10,500"],
    ]);
    expect(card.footer).toBe("Observed activity stays separate from the debt schedule. 3 overdraft fees in the period.");
    expect(statementPayments(emptyCockpit(), []).empty).toBe("No bank statement has been analyzed yet.");
  });
});

describe("a file with nothing analyzed", () => {
  it.each([["a new file", emptyCockpit], ["the barest response", bareCockpit]])("builds every card for %s without a figure and without throwing", (_name, make) => {
    const cockpit = make();
    expect(() => {
      metricStrip(cockpit, null);
      planCard(cockpit, undefined);
      coverageCard(cockpit);
      debtSchedule(cockpit);
      taxReturns(cockpit);
      profitAndLoss(cockpit);
      balanceSheet(cockpit);
      earningsPotential(cockpit);
      revenueTrend(cockpit);
      earningsSources(cockpit);
      trackedExpenses(cockpit, cockpit.bank.summary);
      overdrafts(cockpit.bank.months);
      accountMovement(cockpit);
      bankTrends(cockpit.bank.months, cockpit.bank.summary);
      statementPayments(cockpit, cockpit.bank.months);
    }).not.toThrow();
    expect(planCard(cockpit, undefined).chip.label).toBe("Reading the plan…");
    expect(trackedExpenses(cockpit, cockpit.bank.summary).empty).toBeTruthy();
    expect(debtSchedule(cockpit).tag.label).toBe("Not requested yet");
  });
});
