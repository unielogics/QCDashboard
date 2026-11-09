import { describe, expect, it } from "vitest";
import { clientTermsCoveragePreview, draftFromTerms, draftWithScenarioLoan, emptyDraft, payloadFromDraft, paymentPreview } from "../ApplicationClientTermsPanel";
import type { ApplicationClientTerms } from "@/lib/applicationProfile";

const saved = {
  amount: 100000, apr_pct: 10, term_months: 36, loan_type: "term", funder_type: "other", loan_type_options: [],
  loan_structure: "amortizing", interest_only_months: 0, repayment_frequency: "weekly", conditions: [], co_brand_enabled: false,
  repayment_config: { amortization_months: 120, after_balloon: "recast", balloons: [{ id: "year-one", month: 12, type: "percent_balance", value: 20 }] },
} as unknown as ApplicationClientTerms;

describe("versioned client terms repayment", () => {
  it("round-trips independent maturity, IO and amortization without changing the payment phases", () => {
    const source = { ...saved, amount: 89934, apr_pct: 29.99, term_months: 24, interest_only_months: 6, repayment_frequency: "monthly", repayment_config: { amortization_months: 60 } } as ApplicationClientTerms;
    const draft = draftFromTerms(source);
    const preview = paymentPreview(draft)!;
    expect(preview.schedule.payment_io).toBe(2247.6);
    expect(preview.payment).toBe(2909.12);
    expect(preview.schedule.balloon).toBe(75126.11);
    expect(preview.schedule.first_year_actual_debt_service).toBe(30940.32);
    expect(preview.annual).toBe(110035.55);
    const payload = payloadFromDraft(draft, 7);
    expect(payload).toMatchObject({ term_months: 24, interest_only_months: 6, repayment_config: { amortization_months: 60 }, expected_version: 7 });
    const reopened = paymentPreview(draftFromTerms({ ...source, ...payload } as ApplicationClientTerms))!;
    expect(reopened.schedule).toEqual(preview.schedule);
  });

  it("rejects fractional months instead of silently changing the working quote", () => {
    const draft = { ...draftFromTerms(saved), repayment_config: null, term_months: "24.5" };
    expect(paymentPreview(draft)).toBeNull();
    expect(() => payloadFromDraft(draft, 4)).toThrow(/whole number/);
    draft.term_months = "24";
    draft.interest_only_months = "6.5";
    expect(paymentPreview(draft)).toBeNull();
    expect(() => payloadFromDraft(draft, 4)).toThrow(/whole number/);
  });
  it("retains the complete saved schedule and cadence when only the client note changes", () => {
    const draft = draftFromTerms(saved);
    draft.client_note = "Reviewed financing proposal";
    const payload = payloadFromDraft(draft, 4);
    expect(payload.repayment_config).toEqual(saved.repayment_config);
    expect(payload.repayment_frequency).toBe("weekly");
    expect(payload.expected_version).toBe(4);
    expect(saved.repayment_config!.balloons![0].value).toBe(20);
  });

  it("rejects an existing principal payment after a newly shortened maturity", () => {
    const draft = draftFromTerms(saved);
    draft.term_months = "6";
    expect(() => payloadFromDraft(draft, 4)).toThrow(/month/i);
    expect(draft.repayment_config?.balloons).toEqual(saved.repayment_config?.balloons);
  });

  it("retains the agreed interest structure across a shorter configured maturity", () => {
    const draft = draftFromTerms(saved);
    draft.term_months = "24";
    expect(payloadFromDraft(draft, 4).loan_structure).toBe("amortizing");
  });

  it("blocks a blank principal value instead of sending a zero or dropping the schedule", () => {
    const draft = draftFromTerms(saved);
    draft.repayment_config!.balloons![0].value = Number.NaN;
    expect(() => payloadFromDraft(draft, 4)).toThrow(/positive finite/i);
  });

  it("resets advanced settings only when explicitly removed", () => {
    const draft = draftFromTerms(saved);
    draft.repayment_config = null;
    expect(payloadFromDraft(draft, 4).repayment_config).toBeNull();
    expect(emptyDraft().repayment_config).toBeNull();
  });

  it("preserves fractional custom cadence and rejects unrepresentable precision", () => {
    const draft = draftFromTerms(saved);
    draft.repayment_frequency = "custom";
    draft.custom_payments_per_year = "51.5";
    expect(payloadFromDraft(draft, 4).custom_payments_per_year).toBe(51.5);
    draft.custom_payments_per_year = "51.1234";
    expect(() => payloadFromDraft(draft, 4)).toThrow(/three decimal/);
  });

  it("overlays only the working loan and reviewed refinance context onto terms metadata", () => {
    const base = { ...draftFromTerms(saved), funder_name: "Existing lender", client_note: "Keep this note", conditions: "Keep conditions", sponsor_name: "Sponsor", expiration_days: "14" };
    const result = draftWithScenarioLoan(base, { amount: 200000, ratePct: 29.99, termMonths: 24, structure: "amortizing", structureExplicit: true, interestOnlyMonths: 0, repaymentConfig: { amortization_months: 60 }, paymentsPerYear: 12 }, { treatment: "refinance", retainedAnnualService: 0 });
    expect(result).toMatchObject({ funder_name: "Existing lender", client_note: "Keep this note", conditions: "Keep conditions", sponsor_name: "Sponsor", expiration_days: "14", amount: "200000", apr_pct: "29.99", term_months: "24", loan_structure: "amortizing", retained_annual_debt_service: "0", repayment_frequency: "monthly" });
    const payload = payloadFromDraft(result, 4);
    expect(payload).toMatchObject({ expected_version: 4, amount: 200000, term_months: 24, repayment_config: { amortization_months: 60 }, retained_annual_debt_service: 0 });
    expect(payload).not.toHaveProperty("status");
    expect(base.repayment_config?.amortization_months).toBe(120);
  });

  it("does not replace saved loan fields for an untouched empty scenario and preserves unknown retained service", () => {
    const base = draftFromTerms(saved);
    expect(draftWithScenarioLoan(base, null)).toEqual(base);
    const result = draftWithScenarioLoan(base, null, { treatment: "refinance", retainedAnnualService: null });
    expect(result.retained_annual_debt_service).toBe("");
    expect(() => payloadFromDraft(result, 4)).toThrow(/annual debt service that remains/);
    const cleared = draftWithScenarioLoan(base, { amount: null, ratePct: 0, termMonths: null, structure: "simple_interest", structureExplicit: false, interestOnlyMonths: 0 });
    expect(cleared).toMatchObject({ amount: "", apr_pct: "0", term_months: "", loan_structure: "" });
  });

  it("normalizes zero and omitted interest-only months identically after canonical save and shared-loan overlay", () => {
    for (const interest_only_months of [null, 0]) {
      const canonical = draftFromTerms({ ...saved, interest_only_months });
      const loan = { amount: saved.amount, ratePct: saved.apr_pct, termMonths: saved.term_months, structure: "amortizing" as const, interestOnlyMonths: interest_only_months, repaymentConfig: saved.repayment_config, paymentsPerYear: 51.96 };
      expect(draftWithScenarioLoan(canonical, loan)).toEqual(canonical);
      expect(canonical.interest_only_months).toBe("0");
    }
  });

  it("preserves a staff custom cadence label when the shared loan uses the same cadence", () => {
    const canonical = draftFromTerms({ ...saved, repayment_frequency: "custom", custom_payments_per_year: 51.5, custom_repayment_label: "Reviewed payment calendar" });
    const loan = { amount: saved.amount, ratePct: saved.apr_pct, termMonths: saved.term_months, structure: "amortizing" as const, interestOnlyMonths: 0, repaymentConfig: saved.repayment_config, paymentsPerYear: 51.5 };
    expect(draftWithScenarioLoan(canonical, loan)).toEqual(canonical);
  });
});

describe("client terms debt-service coverage preview", () => {
  const business = { cash_flow_value: 120000, dscr_method: "business", current_annual_debt_service: 12000, annual_property_carrying_costs: null } as ApplicationClientTerms["calculation"];
  it("preserves unknown additive or retained service and distinguishes explicit zero", () => {
    expect(clientTermsCoveragePreview({ ...business, current_annual_debt_service: null }, "additive", null, 12000)).toEqual({ existingAnnual: null, denominator: null, value: null });
    expect(clientTermsCoveragePreview(business, "refinance", null, 12000)).toEqual({ existingAnnual: null, denominator: null, value: null });
    expect(clientTermsCoveragePreview(business, "refinance", 0, 12000)).toEqual({ existingAnnual: 0, denominator: 12000, value: 10 });
    expect(clientTermsCoveragePreview({ ...business, current_annual_debt_service: 0 }, "additive", null, 12000).value).toBe(10);
  });
  it("uses complete real-estate carrying and retained debt costs once", () => {
    const property = { ...business, dscr_method: "real_estate" as const, annual_property_carrying_costs: 6000 };
    expect(clientTermsCoveragePreview(property, "refinance", 12000, 12000)).toEqual({ existingAnnual: 18000, denominator: 30000, value: 4 });
    expect(clientTermsCoveragePreview({ ...property, annual_property_carrying_costs: null }, "refinance", 0, 12000).value).toBeNull();
  });
  it("does not invent missing payments, allow negative retained debt, or discard zero earnings", () => {
    expect(clientTermsCoveragePreview(business, "additive", null, null).value).toBeNull();
    expect(clientTermsCoveragePreview(business, "refinance", -100, 12000).value).toBeNull();
    expect(clientTermsCoveragePreview({ ...business, cash_flow_value: 0 }, "additive", null, 12000).value).toBe(0);
    expect(clientTermsCoveragePreview({ ...business, cash_flow_value: -12000 }, "additive", null, 12000).value).toBe(-0.5);
  });
});
