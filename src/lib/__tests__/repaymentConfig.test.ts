import { describe, expect, it } from "vitest";
import { buildSchedule, type RepaymentConfig } from "../loanSchedule";
import { copyRepaymentConfig, repaymentConfigLabel, repaymentPreview, termsCadenceForPeriods } from "../repaymentConfig";
import { computePaymentSummary } from "@/production-package/termSheetStructure";

const config: RepaymentConfig = { amortization_months: 120, after_balloon: "recast", balloons: [{ id: "year-one", month: 12, type: "percent_balance", value: 20 }, { id: "year-two", month: 24, type: "amount", value: 10000 }] };

describe("advanced repayment integration", () => {
  it("keeps invalid edits visible instead of returning a legacy-priced schedule", () => {
    const preview = repaymentPreview(100000, 10, 36, { structure: "amortizing", repaymentConfig: { ...config, balloons: [{ id: "bad", month: 40, type: "amount", value: 5000 }] } });
    expect(preview.schedule).toBeNull();
    expect(preview.error).toMatch(/month/i);
    expect(repaymentPreview(100000, 10, 36, { structure: "amortizing" }).schedule).not.toBeNull();
  });

  it("does not mutate stored evidence when changing a draft principal payment", () => {
    const draft = copyRepaymentConfig(config)!;
    draft.balloons![0].value = 30;
    expect(config.balloons![0].value).toBe(20);
    expect(copyRepaymentConfig(null)).toBeNull();
    expect(copyRepaymentConfig({})).toEqual({ balloons: [] });
  });

  it("preserves known and custom cadence without converting biweekly to monthly", () => {
    expect(termsCadenceForPeriods(25.98).repayment_frequency).toBe("biweekly");
    expect(termsCadenceForPeriods(51.96).repayment_frequency).toBe("weekly");
    expect(termsCadenceForPeriods(252).repayment_frequency).toBe("daily");
    expect(termsCadenceForPeriods(18)).toEqual({ repayment_frequency: "custom", custom_payments_per_year: "18", custom_repayment_label: "18 payments per year" });
  });

  it("prices the production preview on canonical actual cash coverage and keeps regular payment separate", () => {
    const schedule = buildSchedule(100000, 10, 36, { structure: "amortizing", repaymentConfig: config })!;
    const production = computePaymentSummary({ amount: 100000, annualRatePct: 10, termMonths: 36, repaymentStructure: "balloon", paymentFrequency: "monthly", repaymentConfig: config });
    expect(production.periodic_payment).toBe(schedule.payment_after);
    expect(production.monthly_equivalent_payment).toBe(schedule.payment_after_monthly);
    expect(production.coverage_monthly_equivalent_payment).toBe(schedule.coverage_payment_monthly);
    expect(production.balloon_amount).toBe(schedule.balloon);
    expect(production.coverage_monthly_equivalent_payment).toBeGreaterThan(production.periodic_payment!);
  });

  it("does not produce financial figures for impossible fixed payments", () => {
    const impossible: RepaymentConfig = { balloons: [{ id: "too-large", month: 1, type: "amount", value: 200000 }] };
    const production = computePaymentSummary({ amount: 100000, annualRatePct: 10, termMonths: 36, repaymentStructure: "fully_amortizing", paymentFrequency: "monthly", repaymentConfig: impossible });
    expect(production.periodic_payment).toBeNull();
    expect(production.monthly_equivalent_payment).toBeNull();
    expect(production.assumptions.length).toBeGreaterThan(0);
  });

  it("retains simple interest and the initial IO phase in the production preview", () => {
    const schedule = buildSchedule(100000, 10, 36, { structure: "simple_interest", interestOnlyMonths: 6, repaymentConfig: config })!;
    const production = computePaymentSummary({ amount: 100000, annualRatePct: 10, termMonths: 36, repaymentStructure: "simple_interest", paymentFrequency: "monthly", interestOnlyMonths: 6, repaymentConfig: config });
    expect(production.periodic_payment).toBe(schedule.payment_io);
    expect(production.periodic_payment).toBe(833.33);
    expect(production.post_io_payment).toBe(schedule.payment_after);
    expect(production.monthly_equivalent_payment).toBe(schedule.payment_io_monthly);
    expect(production.coverage_monthly_equivalent_payment).toBe(schedule.coverage_payment_monthly);
  });

  it("describes amortization as starting after interest-only and labels explicit principal payments", () => {
    expect(repaymentConfigLabel(config)).toContain("after any interest-only period");
    expect(repaymentConfigLabel(config)).toContain("2 scheduled principal payments");
    expect(repaymentConfigLabel(config)).toContain("recast");
    expect(repaymentConfigLabel(null)).toBeNull();
  });
});
