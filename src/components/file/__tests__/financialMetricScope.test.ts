import { describe, expect, it } from "vitest";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import type { FinancialKpiOptions } from "@/lib/financialKpiReview";
import { currentFinancialMetricScope } from "../cockpit/financialMetricScope";

const fresh = { bank: { months: [{ month: "2026-02", file_ids: ["fresh-counted"] }], summary: { avg_net: 200 }, all_months: [{ month: "2026-02", file_ids: ["fresh-all"] }], all_summary: { avg_net: 300 }, accounts: [{ key: "checking", label: "Current checking", counted: true, series: [{ month: "2026-02", file_ids: ["fresh-account"] }], summary: { avg_net: 50 } }] } } as unknown as FinancialCockpit;
const stale = { accountKey: "counted", label: "Stale account", months: [{ month: "2025-01", file_ids: ["old-file"] }], summary: { avg_net: -100 }, plan: { note: "Unsaved working terms" }, dirty: true } as unknown as FinancialKpiOptions;

describe("financial metric review snapshot scope", () => {
  it("uses fresh counted months, source inventory and summary while retaining working loan changes", () => {
    const scope = currentFinancialMetricScope(fresh, stale);
    expect(scope.available).toBe(true); expect(scope.options.months).toBe(fresh.bank.months); expect(scope.options.summary).toBe(fresh.bank.summary); expect(scope.options.months[0].file_ids).toEqual(["fresh-counted"]); expect(scope.options.plan).toBe(stale.plan); expect(scope.options.dirty).toBe(true);
  });
  it("resolves current individual and all-account cohorts from the fresh read", () => {
    const account = currentFinancialMetricScope(fresh, { ...stale, accountKey: "checking" });
    expect(account.options.summary.avg_net).toBe(50); expect(account.options.months[0].file_ids).toEqual(["fresh-account"]); expect(account.options.label).toBe("Current checking");
    expect(currentFinancialMetricScope(fresh, { ...stale, accountKey: "all" }).options.months[0].file_ids).toEqual(["fresh-all"]);
  });
  it("does not silently replace a removed account with counted financial figures", () => {
    const scope = currentFinancialMetricScope(fresh, { ...stale, accountKey: "removed-account" });
    expect(scope.available).toBe(false); expect(scope.options.months).toEqual([]); expect(scope.options.accountKey).toBe("removed-account");
  });
});
