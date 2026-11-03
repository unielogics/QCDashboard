import { describe, expect, it } from "vitest";
import type { CockpitMonth, RecurringPayee } from "@/lib/financialCockpit";
import { payeeAmountInMonth, simulateRemovals } from "@/lib/cockpitSimulation";

const month = (key: string, deposits: number, withdrawals: number, ending: number, low: number): CockpitMonth => ({
  month: key, label: key, accounts: [], file_ids: [], accepted: true, deposits, withdrawals, beginning_balance: null, ending_balance: ending, average_balance: null, low_balance: low,
  deposit_count: null, nsf: 0, returned_checks: 0, negative_days: 0, net: deposits - withdrawals, outflow_ratio: null, negative_dates: [], overdraft_items: [], fees: null,
});
const payee = (key: string, monthly: Record<string, number>, average: number): RecurringPayee => ({
  key, payee: key, kind: "merchant_cash_advance", kind_label: "Merchant cash advance", rationale: "", cadence: "weekly", same_amount: true, occurrences: 4, total: 0, average_amount: null,
  monthly_average: average, monthly, months: Object.keys(monthly), months_seen: Object.keys(monthly).length, accounts: [], first_date: null, last_date: null, file_ids: [], accepted: true, is_debt: true, is_card: false,
});

describe("what-if simulation", () => {
  const months = [month("2026-05", 50000, 55000, 1000, -400), month("2026-06", 52000, 50000, 3000, 200), month("2026-07", 48000, 49000, 2000, 100)];
  const ondeck = payee("ondeck", { "2026-05": 6000, "2026-06": 6000, "2026-07": 6000 }, 6000);
  const wayflyer = payee("wayflyer", { "2026-05": 4000, "2026-06": 4000 }, 2667);

  it("carries the cash kept forward into every later ending balance", () => {
    const result = simulateRemovals(months, [ondeck, wayflyer], ["ondeck"], 0, ["2026-05", "2026-06", "2026-07"]);
    expect(result.rows.map((r) => r.endingAfter)).toEqual([7000, 15000, 20000]);
    expect(result.rows.map((r) => r.netAfter)).toEqual([1000, 8000, 5000]);
    expect(result.rows[0].lowestAfter).toBe(2600); // -400 + 0 + 6000/2
    expect(result.cashKept).toBe(18000);
    expect(result.monthsDippingNegativeBefore).toBe(1);
    expect(result.monthsDippingNegativeAfter).toBe(0);
    expect(result.removedMonthlyAverage).toBe(6000);
  });

  it("nets a new payment against the removed ones", () => {
    const result = simulateRemovals(months, [ondeck, wayflyer], ["ondeck", "wayflyer"], 1500, ["2026-05", "2026-06", "2026-07"]);
    expect(result.rows.map((r) => r.removed)).toEqual([10000, 10000, 6000]);
    expect(result.rows.map((r) => r.added)).toEqual([1500, 1500, 1500]);
    expect(result.rows.map((r) => r.withdrawalsAfter)).toEqual([46500, 41500, 44500]);
    expect(result.endingAfterLast).toBe(2000 + 8500 + 8500 + 4500);
    expect(result.netAfterAverage).toBe(5833.33);
  });

  it("uses the average for a month never read for payees and zero for a month read without the payee", () => {
    expect(payeeAmountInMonth(wayflyer, "2026-07", ["2026-05", "2026-06", "2026-07"])).toBe(0);
    expect(payeeAmountInMonth(wayflyer, "2026-07", ["2026-05", "2026-06"])).toBe(2667);
    expect(payeeAmountInMonth(wayflyer, "2026-05", [])).toBe(4000);
  });
});
