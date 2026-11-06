import { buildSchedule, normalizeRepaymentConfig, type LoanScheduleSummary, type RepaymentConfig } from "./loanSchedule";

export type RepaymentOptions = Parameters<typeof buildSchedule>[3];
export function copyRepaymentConfig(value: RepaymentConfig | null | undefined): RepaymentConfig | null {
  return value == null ? null : { ...value, balloons: (value.balloons ?? []).map((row) => ({ ...row })) };
}

/** Invalid edits stay visible; a preview never silently prices the legacy schedule instead. */
export function repaymentPreview(amount: number | null | undefined, rate: number | null | undefined, months: number | null | undefined, options: RepaymentOptions = {}): { schedule: LoanScheduleSummary | null; error: string | null } {
  try {
    if (options.repaymentConfig != null) normalizeRepaymentConfig(options.repaymentConfig, months, options);
    return { schedule: buildSchedule(amount, rate, months, options), error: null };
  } catch (error) {
    return { schedule: null, error: error instanceof Error ? error.message : "Review the repayment schedule." };
  }
}

export function repaymentConfigLabel(config: RepaymentConfig | null | undefined): string | null {
  if (!config) return null;
  const parts = config.amortization_months != null ? [`${config.amortization_months}-month amortization after any interest-only period`] : [];
  if (config.balloons?.length) parts.push(`${config.balloons.length} scheduled principal payment${config.balloons.length === 1 ? "" : "s"}`, config.after_balloon === "recast" ? "recast after payments" : "keep regular payment");
  return parts.join(" · ") || "Custom repayment schedule";
}

export function termsCadenceForPeriods(periods = 12): { repayment_frequency: "daily" | "weekly" | "biweekly" | "monthly" | "custom"; custom_payments_per_year: string; custom_repayment_label: string } {
  const known: Array<[number, "daily" | "weekly" | "biweekly" | "monthly"]> = [[12, "monthly"], [252, "daily"], [51.96, "weekly"], [25.98, "biweekly"]];
  const match = known.find(([count]) => Math.abs(count - periods) < 0.000001);
  return { repayment_frequency: match?.[1] ?? "custom", custom_payments_per_year: match ? "" : String(periods), custom_repayment_label: match ? "" : `${periods} payments per year` };
}
