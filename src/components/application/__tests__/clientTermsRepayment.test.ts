import { describe, expect, it } from "vitest";
import { clientTermsCoveragePreview, draftFromTerms, emptyDraft, payloadFromDraft } from "../ApplicationClientTermsPanel";
import type { ApplicationClientTerms } from "@/lib/applicationProfile";

const saved = {
  amount: 100000, apr_pct: 10, term_months: 36, loan_type: "term", funder_type: "other", loan_type_options: [],
  loan_structure: "amortizing", interest_only_months: 0, repayment_frequency: "weekly", conditions: [], co_brand_enabled: false,
  repayment_config: { amortization_months: 120, after_balloon: "recast", balloons: [{ id: "year-one", month: 12, type: "percent_balance", value: 20 }] },
} as unknown as ApplicationClientTerms;

describe("versioned client terms repayment", () => {
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
