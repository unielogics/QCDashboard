import type { FinancialCockpit } from "@/lib/financialCockpit";
import type { FinancialKpiOptions } from "@/lib/financialKpiReview";

/** Resolve the visible cohort from the same cockpit snapshot as its receipts. */
export function currentFinancialMetricScope(cockpit: FinancialCockpit, requested: FinancialKpiOptions): { available: boolean; options: FinancialKpiOptions } {
  if (requested.accountKey === "counted") return { available: true, options: { ...requested, months: cockpit.bank.months, summary: cockpit.bank.summary, label: cockpit.bank.all_months != null ? "Counted accounts" : "All accounts" } };
  if (requested.accountKey === "all") {
    if (cockpit.bank.all_months != null && cockpit.bank.all_summary != null) return { available: true, options: { ...requested, months: cockpit.bank.all_months, summary: cockpit.bank.all_summary, label: "All accounts" } };
    if (cockpit.bank.all_months == null && cockpit.bank.all_summary == null) return { available: true, options: { ...requested, months: cockpit.bank.months, summary: cockpit.bank.summary, label: "All accounts" } };
  } else {
    const account = cockpit.bank.accounts.find((item) => item.key === requested.accountKey);
    if (account) return { available: true, options: { ...requested, months: account.series, summary: account.summary, label: account.counted ? account.label : `${account.label} (not counted)` } };
  }
  return { available: false, options: { ...requested, months: [], summary: cockpit.bank.summary, label: "Account selection no longer available" } };
}
