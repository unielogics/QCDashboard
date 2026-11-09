import { describe, expect, it } from "vitest";
import type { Obligation } from "../financialCockpit";
import { refinanceSelectionTotals } from "../refinanceSelectionTotals";

const obligation = (id: string, extra: Partial<Obligation> = {}): Obligation => ({ id, kind: "row", lender: "Same lender",
  category: "loan", is_mca: false, monthly: 200, balance: 1000, payoff: 1100, in_debt_service: true,
  count_in_dscr: true, linked_payee_key: null, linked_payee: null, observed_monthly: null,
  cadence: "monthly", source: "debt_schedule_row", origin: "staff", ...extra });
const evaluation = (extra: Partial<Parameters<typeof refinanceSelectionTotals>[2]> = {}) => ({
  retiredMonthly: 200, payoffTotal: 1100, payoffUnknown: 0, newPayment: 100,
  serviceBefore: 1000, serviceBeforeNewPayment: 800, serviceAfter: 900, ...extra,
});
const known = { unresolvedSelections: false, debtServiceKnown: true };

describe("refinance selection totals", () => {
  it("counts a selected ID once and preserves the evaluator's payoff and monthly figures", () => {
    const rows = [obligation("one"), obligation("two")];
    expect(refinanceSelectionTotals(rows, ["one", "one"], evaluation(), known)).toEqual({
      selectedCount: 1, payoffTotal: 1100, payoffUnknown: 0, monthlyRemoved: 200, monthlyUnknown: 0,
      monthlyAdded: 100, netMonthly: -100, monthlyAfter: 900, remainingMonthly: 800,
      monthlyAddedIo: null, monthlyAfterIo: null, netMonthlyIo: null,
      stressMonthlyAdded: 100, stressMonthlyAfter: 900, stressNetMonthly: -100,
      basisAdjusted: false, needsReview: false,
    });
  });

  it("shows zero selection totals instead of treating no selection as unknown", () => {
    const result = refinanceSelectionTotals([obligation("one")], [], evaluation({ retiredMonthly: 0,
      payoffTotal: null, newPayment: 0, serviceBeforeNewPayment: 1000, serviceAfter: 1000 }), known);
    expect(result).toMatchObject({ selectedCount: 0, payoffTotal: 0, payoffUnknown: 0, monthlyRemoved: 0,
      monthlyAdded: 0, netMonthly: 0, monthlyAfter: 1000 });
  });

  it("does not remove payments for selected obligations outside the debt-service basis", () => {
    const result = refinanceSelectionTotals([obligation("one", { in_debt_service: false, monthly: null })],
      ["one"], evaluation({ retiredMonthly: 0, serviceBeforeNewPayment: 1000, serviceAfter: 1100 }), known);
    expect(result).toMatchObject({ selectedCount: 1, monthlyRemoved: 0, monthlyUnknown: 0, netMonthly: 100,
      monthlyAfter: 1100, remainingMonthly: 1000 });
  });

  it("never substitutes the balance for an unavailable payoff requiring review", () => {
    const row = obligation("one", { balance: 9999, payoff: null, payoff_requires_review: true });
    expect(refinanceSelectionTotals([row], [row.id], evaluation({ payoffTotal: null, payoffUnknown: 1 }), known))
      .toMatchObject({ payoffTotal: null, payoffUnknown: 1, monthlyRemoved: 200, netMonthly: -100 });
    const partial = refinanceSelectionTotals([row, obligation("two")], [row.id, "two"],
      evaluation({ retiredMonthly: 400, payoffTotal: 1100, payoffUnknown: 1, serviceAfter: 700, serviceBeforeNewPayment: 600 }), known);
    expect(partial).toMatchObject({ selectedCount: 2, payoffTotal: 1100, payoffUnknown: 1 });
  });

  it("keeps an unset new payment distinct from a known zero payment", () => {
    const rows = [obligation("one")];
    const unset = refinanceSelectionTotals(rows, ["one"], evaluation({ newPayment: null, serviceAfter: 800 }), known);
    expect(unset).toMatchObject({ monthlyAdded: null, netMonthly: null, monthlyAfter: null, remainingMonthly: 800 });
    const zero = refinanceSelectionTotals(rows, ["one"], evaluation({ newPayment: 0, serviceAfter: 800 }), known);
    expect(zero).toMatchObject({ monthlyAdded: 0, netMonthly: -200, monthlyAfter: 800, remainingMonthly: 800 });
  });

  it("retains known row subtotals while an unknown baseline blocks final debt-service figures", () => {
    const result = refinanceSelectionTotals([obligation("one")], ["one"], evaluation(), { ...known, debtServiceKnown: false });
    expect(result).toMatchObject({ payoffTotal: 1100, monthlyRemoved: 200, monthlyAdded: 100,
      netMonthly: null, monthlyAfter: null, remainingMonthly: null });
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])("does not infer a zero baseline from %s even when the caller marks debt known", (serviceBefore) => {
    const result = refinanceSelectionTotals([obligation("one")], ["one"], evaluation({
      serviceBefore: serviceBefore as number | null, serviceBeforeNewPayment: null, serviceAfter: null,
    }), known);
    expect(result).toMatchObject({ monthlyRemoved: 200, monthlyAdded: 100, payoffTotal: 1100,
      netMonthly: null, monthlyAfter: null, remainingMonthly: null, basisAdjusted: false });
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])("withholds the new-payment comparison when evaluated service after is %s", (serviceAfter) => {
    const result = refinanceSelectionTotals([obligation("one")], ["one"], evaluation({ serviceAfter }), known);
    expect(result).toMatchObject({ monthlyRemoved: 200, monthlyAdded: 100, remainingMonthly: 800,
      netMonthly: null, monthlyAfter: null, basisAdjusted: false });
  });

  it("reports missing selected payments without presenting a partial after total as complete", () => {
    const missing = obligation("missing", { monthly: null });
    const allUnknown = refinanceSelectionTotals([missing], ["missing"], evaluation({ retiredMonthly: 0 }), known);
    expect(allUnknown).toMatchObject({ monthlyRemoved: null, monthlyUnknown: 1, netMonthly: null, monthlyAfter: null, remainingMonthly: null });
    const partial = refinanceSelectionTotals([missing, obligation("known")], ["missing", "known"], evaluation(), known);
    expect(partial).toMatchObject({ monthlyRemoved: 200, monthlyUnknown: 1, netMonthly: null, monthlyAfter: null });
    const knownZero = refinanceSelectionTotals([missing, obligation("zero", { monthly: 0 })], ["missing", "zero"], evaluation({ retiredMonthly: 0 }), known);
    expect(knownZero.monthlyRemoved).toBe(0);
  });

  it("blocks selected/after totals for unresolved and hidden payee IDs but retains the new payment", () => {
    for (const options of [known, { ...known, unresolvedSelections: true }]) {
      const result = refinanceSelectionTotals([obligation("one"), obligation("payee:old", { kind: "payee" })],
        ["one", "payee:old"], evaluation(), options);
      expect(result).toMatchObject({ selectedCount: 1, needsReview: true, payoffTotal: null, monthlyRemoved: null,
        monthlyAdded: 100, netMonthly: null, monthlyAfter: null, remainingMonthly: null });
    }
    expect(refinanceSelectionTotals([obligation("one")], ["one"], evaluation(), { ...known, unresolvedSelections: true }).needsReview).toBe(true);
    expect(refinanceSelectionTotals([obligation("one")], ["unknown-id"], evaluation(), known).needsReview).toBe(true);
  });

  it("uses the evaluator's after-minus-before change for clamps and adopted retained-service bases", () => {
    const clamped = refinanceSelectionTotals([obligation("one", { monthly: 2000 })], ["one"], evaluation({
      retiredMonthly: 2000, serviceBeforeNewPayment: 0, serviceAfter: 100,
    }), known);
    expect(clamped).toMatchObject({ netMonthly: -900, monthlyAfter: 100, remainingMonthly: 0, basisAdjusted: true });
    const retained = refinanceSelectionTotals([obligation("one", { monthly: 500 })], ["one"], evaluation({
      retiredMonthly: 500, serviceBefore: 83.33, serviceBeforeNewPayment: 83.33, serviceAfter: 183.33,
    }), known);
    expect(retained).toMatchObject({ monthlyRemoved: 500, netMonthly: 100, monthlyAfter: 183.33, basisAdjusted: true });
  });
});
