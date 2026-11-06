import { describe, expect, it, vi } from "vitest";
import { ebitdaIsStaffCorrected, ebitdaKpi, metricAmountLabel, metricCurrency, metricDraftIsStale, metricDraftValue, metricInputCurrency, metricInputProvenance, saveFinancialMetricCorrection, type FinancialMetricReview, type MetricCorrectionDraft, type MetricInput, type MetricResult } from "../financialMetrics";

const input: MetricInput = { key: "pl.net_income", label: "Net income", value: 100000, original_value: 100000, unit: "currency", editable: true, source_stamp: "original-document-and-period", source_refs: [{ file_id: "pdf", file_name: "P&L.pdf", analysis_id: "analysis" }], period: "Jan–Jun 2026", missing: false, correction: null };
const draft = (extra: Partial<MetricCorrectionDraft> = {}): MetricCorrectionDraft => ({ profileId: "profile", input, revision: 2, action: "correct", value: "120000", unknown: false, reason: "Reviewed source amount", idempotencyKey: "stable-attempt", ...extra });
describe("financial calculation review", () => {
  it("keeps zero, explicit unknown and invalid empty input distinct", () => {
    expect(metricDraftValue(draft({ value: "0" }))).toBe(0);
    expect(metricDraftValue(draft({ unknown: true }))).toBeNull();
    for (const value of ["", " ", "unknown", "Infinity"]) expect(metricDraftValue(draft({ value }))).toBeUndefined();
    expect(input.value).toBe(100000);
  });
  it("bounds a corrected annualization period without altering source dates", () => {
    const months = { ...input, unit: "months" as const, value: 6, original_value: 6 };
    expect(metricDraftValue(draft({ input: months, value: "12" }))).toBe(12);
    expect(metricDraftValue(draft({ input: months, value: "0" }))).toBeUndefined();
    expect(metricDraftValue(draft({ input: months, value: "13" }))).toBeUndefined();
    expect(metricDraftValue(draft({ input: months, value: "6.5" }))).toBeUndefined();
    expect(metricDraftValue(draft({ input: months, unknown: true }))).toBeUndefined();
    expect(months.period).toBe("Jan–Jun 2026");
  });
  it("preserves the original revision and source stamp across refreshes", () => {
    const review = { revision: 2, inputs: [input] } as FinancialMetricReview;
    expect(metricDraftIsStale(draft(), review)).toBe(false);
    expect(metricDraftIsStale(draft(), { ...review, revision: 3 })).toBe(true);
    expect(metricDraftIsStale(draft(), { ...review, inputs: [{ ...input, source_stamp: "replacement-pdf" }] })).toBe(true);
    expect(draft().input.source_stamp).toBe("original-document-and-period");
  });
  it("writes an explicit, scoped correction with reason and retry identity, without touching the plan or published debt", async () => {
    const api = vi.fn().mockResolvedValue({});
    await saveFinancialMetricCorrection(api, "profile", draft({ value: "0" }));
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile/financial-metrics/corrections");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ input_key: "pl.net_income", action: "correct", value: 0, reason: "Reviewed source amount", expected_revision: 2, source_stamp: "original-document-and-period", idempotency_key: "stable-attempt" });
    expect(() => saveFinancialMetricCorrection(api, "other-profile", draft())).toThrow("another file");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("restores the source operand rather than submitting another amount override", async () => {
    const api = vi.fn().mockResolvedValue({});
    const restore = draft({ action: "restore", value: "99999" });
    expect(metricDraftValue(restore)).toBe(100000);
    await saveFinancialMetricCorrection(api, "profile", restore);
    expect(JSON.parse(api.mock.calls[0][1].body)).not.toHaveProperty("value");
    expect(JSON.parse(api.mock.calls[0][1].body).action).toBe("restore");
  });
  it("sends an explicit unknown intent instead of turning an unknown extraction into zero", async () => {
    const api = vi.fn().mockResolvedValue({});
    await saveFinancialMetricCorrection(api, "profile", draft({ unknown: true, value: "" }));
    expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({ action: "correct", value: null, mark_unknown: true });
    expect(() => saveFinancialMetricCorrection(api, "profile", draft({ value: "" }))).toThrow("valid amount");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("uses documented EBITDA only and distinguishes its reporting period and annualization", () => {
    expect(ebitdaKpi(null).value).toBeNull();
    expect(ebitdaKpi({ value: 50000, annualized_value: 100000, annualization_factor: 2, period: "Jan–Jun", provisional: true } as MetricResult)).toEqual({ value: 100000, annualized: true, period: "Jan–Jun", provisional: true });
    expect(ebitdaKpi({ value: 0, annualized_value: null, annualization_factor: null, period: "2026" } as MetricResult).value).toBe(0);
    expect(metricInputProvenance(input)).toBe("AI-read source");
    expect(metricInputProvenance({ ...input, source_refs: [{ file_id: "form", file_name: "P&L v2", version_id: "version" }] })).toBe("Saved financial form");
    expect(metricInputProvenance({ ...input, correction: { reason: "Reviewed" } as never })).toBe("Staff correction");
  });
  it("identifies a staff-corrected annualization period even when headline earnings inputs exclude months", () => {
    const review = { inputs: [{ ...input, key: "profit_and_loss.months_covered", correction: { value: 12 } }] } as FinancialMetricReview;
    const result = { key: "profit_and_loss", input_keys: ["profit_and_loss.net_income"], annualized_value: 50000 } as MetricResult;
    expect(ebitdaIsStaffCorrected(result, review)).toBe(true);
    expect(ebitdaIsStaffCorrected({ ...result, key: "tax_return" }, review)).toBe(false);
    expect(ebitdaIsStaffCorrected({ ...result, annualized_value: null }, review)).toBe(false);
  });
  it("uses the documented currency without inventing USD or converting foreign amounts", () => {
    expect(metricAmountLabel(1200, "USD")).toBe("$1,200.00");
    expect(metricAmountLabel(1200, "EUR")).toBe("€1,200.00");
    expect(metricAmountLabel(0, null)).toBe("0.00 (currency unknown)");
    expect(metricAmountLabel(1200, "XXX")).not.toContain("$");
    expect(metricCurrency(undefined, [{ file_id: "a", file_name: "a", currency: "EUR" }])).toBe("EUR");
    expect(metricCurrency(undefined, [{ file_id: "a", file_name: "a", currency: "EUR" }, { file_id: "b", file_name: "b", currency: "USD" }])).toBeNull();
    expect(metricCurrency(undefined, [{ file_id: "a", file_name: "a", currency: "USD" }, { file_id: "b", file_name: "b", currency: null }])).toBeNull();
    expect(metricCurrency(null, [{ file_id: "a", file_name: "a", currency: "USD" }])).toBeNull();
    expect(metricInputCurrency({ ...input, key: "debt.annual", source_refs: [] })).toBe("USD");
  });
});
