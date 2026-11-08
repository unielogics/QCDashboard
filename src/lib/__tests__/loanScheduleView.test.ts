import { describe, expect, it } from "vitest";
import { buildSchedule, riskProfile } from "../loanSchedule";
import { loanScheduleRows } from "../loanScheduleView";

describe("actual-cash loan schedule readout", () => {
  it("counts final principal once and shows full paid-down progress for a 24/60 loan", () => {
    const schedule = buildSchedule(100000, 29.99, 24, { structure: "amortizing", repaymentConfig: { amortization_months: 60 } })!;
    const rows = loanScheduleRows(schedule);
    const final = rows.at(-1)!;
    expect(final.cash).toBe(79442.40);
    expect(final.principal).toBeCloseTo(schedule.rows.at(-1)!.principal + 76207.67, 2);
    expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBeCloseTo(100000, 2);
    expect(rows.reduce((sum, row) => sum + row.cash, 0)).toBeCloseTo(schedule.total_paid, 2);
    expect(final.balance).toBe(0);
    expect(final.paidDownPct).toBe(100);
    expect(rows[22].paidDownPct).toBeLessThan(25);
  });

  it("includes a legacy interest-only maturity balloon in principal and exposure", () => {
    const schedule = buildSchedule(100000, 12, 24, { structure: "interest_only" })!;
    const rows = loanScheduleRows(schedule);
    expect(rows[0]).toMatchObject({ principal: 0, balance: 100000, paidDownPct: 0 });
    expect(rows.at(-1)).toMatchObject({ cash: 101000, principal: 100000, balance: 0, paidDownPct: 100, principalExposurePct: 0 });
  });

  it("uses actual maturity cash coverage even when legacy annual underwriting retains its regular-payment basis", () => {
    const schedule = buildSchedule(100000, 12, 12, { structure: "interest_only" })!;
    const risk = riskProfile(schedule, 10000, 0)!;
    const rows = loanScheduleRows(schedule, risk);
    expect(risk.coverage_by_period.at(-1)!.coverage).toBe(10);
    expect(rows[0].coverage).toBe(10);
    expect(rows.at(-1)!.coverage).toBe(0.1);
    expect(rows.at(-1)!.cash).toBe(101000);
  });

  it("keeps scheduled principal payments in the selected payment without duplicating the residual", () => {
    const schedule = buildSchedule(100000, 12, 24, { structure: "amortizing", repaymentConfig: { amortization_months: 60, balloons: [{ id: "first", month: 6, type: "amount", value: 10000 }, { id: "second", month: 12, type: "percent_balance", value: 10 }] } })!;
    const rows = loanScheduleRows(schedule);
    expect(rows[5].principal).toBeGreaterThan(10000);
    expect(rows[5].paidDownPct).toBeGreaterThan(rows[4].paidDownPct + 9);
    expect(rows.at(-1)!.principalPaid).toBeCloseTo(100000, 2);
    expect(rows.at(-1)!.receipts).toBeCloseTo(schedule.total_paid, 2);
  });

  it.each([-5000, 0])("retains signed or zero payment coverage for %s earnings", (income) => {
    const schedule = buildSchedule(100000, 12, 24, { structure: "amortizing" })!;
    const rows = loanScheduleRows(schedule, riskProfile(schedule, income, 500));
    expect(rows[0].coverage).not.toBeNull();
    expect(rows[0].coverage).toBeLessThanOrEqual(0);
  });
});
