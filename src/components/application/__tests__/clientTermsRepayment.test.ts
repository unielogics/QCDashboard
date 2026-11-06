import { describe, expect, it } from "vitest";
import { draftFromTerms, emptyDraft, payloadFromDraft } from "../ApplicationClientTermsPanel";
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
