import { describe, expect, it } from "vitest";
import { returnExitForMonth, returnMoney, returnNumber, returnPercent, returnPlot, returnTone, sameReturnRequest, selectReturnMonth, type InvestorExitPoint, type InvestorReturnProjection } from "@/components/investor/investorReturnModel";

function exit(month: number, net: number | null): InvestorExitPoint {
  return { month, payoff_month: month, capped_at_maturity: false, status: net == null ? "needs_review" : "calculated", principal_returned: null, gross_interest: null, earned_interest: null, minimum_interest_charge: null, payoff_charge_income: null, total_fees: null, known_fee_subtotal: null, initial_outlay: null, net_income: net, net_roi_pct: null, net_cash_profit: null, net_cash_received: null, reserve_released: null, reserve_held: null, missing_assumptions: [], assumptions: [] };
}
function projection(patch: Partial<InvestorReturnProjection> = {}): InvestorReturnProjection {
  return { policy_version: "synthetic-display", status: "calculated", currency: "USD", source: { kind: "staff_saved", id: "synthetic-profile", budget_revision: 1, terms_version: 1, updated_at: null, fingerprint: "synthetic-source" }, request: { exit_month: 6, investment_amount: null }, basis: "offering_investor_capital", offering_investor_capital: null, investment_amount: null, initial_outlay: null, maturity_month: 12, maximum_month: 12, holding: [], selected_exit: null, full_term: null, payoff_curve_status: "on_demand", payoff_curve: [], missing_inputs: [], assumptions: [], performance: { curve_work_estimate: 0, curve_work_limit: 0, curve_points: 0 }, ...patch };
}

describe("portable investor return display", () => {
  it("keeps confirmed zero and negative amounts distinct from unknown", () => {
    expect(returnNumber(0)).toBe(0);
    expect(returnNumber("-10.25")).toBe(-10.25);
    for (const value of [null, undefined, "", " ", "unconfirmed", Infinity, NaN]) expect(returnNumber(value)).toBeNull();
    expect(returnTone(0)).toBe("positive");
    expect(returnTone(-1)).toBe("negative");
    expect(returnTone(null)).toBe("unknown");
  });
  it("does not assign USD to an unknown currency", () => {
    expect(returnMoney(123.45, null)).toBe("123.45 · currency not confirmed");
    expect(returnMoney(null, "EUR")).toBe("Not confirmed");
    expect(returnMoney(0, "EUR")).toContain("EUR");
    expect(returnMoney(0, "EUR")).toContain("0.00");
  });
  it("formats the supplied cumulative ROI without annualizing it", () => {
    expect(returnPercent(5.14)).toBe("5.14%");
    expect(returnPercent(0)).toBe("0.00%");
    expect(returnPercent(null)).toBe("Not confirmed");
  });
});

describe("month selection and chart geometry", () => {
  it("preserves Closing/month0 and an actual fractional maturity", () => {
    const rows = [{ month: 0 }, { month: 1 }, { month: 2.5 }];
    expect(selectReturnMonth(rows, 0)).toBe(rows[0]);
    expect(selectReturnMonth(rows, 6)).toBe(rows[2]);
    expect(selectReturnMonth(rows, 2.5)).toBe(rows[2]);
  });
  it("returns no selection for invalid or absent month rows", () => {
    expect(selectReturnMonth([], 6)).toBeUndefined();
    expect(selectReturnMonth([{ month: -1 }, { month: Infinity }], 6)).toBeUndefined();
  });
  it("breaks unknown chart amounts instead of plotting them as zero", () => {
    const plot = returnPlot([{ month: 0, value: 0 }, { month: 1, value: null }, { month: 2, value: -10 }]);
    expect(plot.paths).toHaveLength(2);
    expect(plot.points[1].y).toBeNull();
    expect(plot.minimum).toBe(-10);
    expect(plot.maximum).toBe(0);
  });
  it("includes the zero axis and both positive and negative profit geometry", () => {
    const plot = returnPlot([{ month: 1, value: -20 }, { month: 2, value: 30 }]);
    expect(plot.minimum).toBe(-20);
    expect(plot.maximum).toBe(30);
    expect(plot.points[0].y!).toBeGreaterThan(plot.zeroY);
    expect(plot.points[1].y!).toBeLessThan(plot.zeroY);
  });
  it("does not mutate or reorder canonical source rows", () => {
    const input = Object.freeze([Object.freeze({ month: 2.5, value: 0 }), Object.freeze({ month: 0, value: -100 })]);
    const plot = returnPlot(input);
    expect(input.map(point => point.month)).toEqual([2.5, 0]);
    expect(plot.points.map(point => point.month)).toEqual([0, 2.5]);
    expect(plot.paths[0]).not.toContain("NaN");
  });
  it("has no fabricated line when every financial value is unknown", () => {
    const plot = returnPlot([{ month: 0, value: null }, { month: 1, value: undefined }]);
    expect(plot.paths).toEqual([]);
    expect(plot.points.every(point => point.value == null)).toBe(true);
  });
});

describe("canonical payoff/request selection", () => {
  it("rejects another month's or illustrated amount's response marker", () => {
    const request = { exit_month: 6, investment_amount: null };
    expect(sameReturnRequest(request, { ...request })).toBe(true);
    expect(sameReturnRequest(request, { ...request, exit_month: 7 })).toBe(false);
    expect(sameReturnRequest(request, { ...request, investment_amount: 25000 })).toBe(false);
    expect(sameReturnRequest({ exit_month: 2.5, investment_amount: 25000.1 }, { exit_month: 2.5, investment_amount: 25000.1 })).toBe(true);
  });
  it("never substitutes six-month payoff figures for month7", () => {
    const data = projection({ selected_exit: exit(6, 100) });
    expect(returnExitForMonth(data, 6)?.net_income).toBe(100);
    expect(returnExitForMonth(data, 7)).toBeNull();
  });
  it("uses only an exact canonical eager curve point", () => {
    const data = projection({ payoff_curve_status: "complete", payoff_curve: [exit(6, 0), exit(7, -10)] });
    expect(returnExitForMonth(data, 6)?.net_income).toBe(0);
    expect(returnExitForMonth(data, 7)?.net_income).toBe(-10);
    expect(returnExitForMonth(data, 6.5)).toBeNull();
  });
  it("uses the canonical full-term comparator in on-demand mode", () => {
    const full = exit(12, null);
    const data = projection({ full_term: full, selected_exit: exit(6, 100) });
    expect(returnExitForMonth(data, 12)).toBe(full);
    expect(returnExitForMonth(data, 12)?.net_income).toBeNull();
  });
});
