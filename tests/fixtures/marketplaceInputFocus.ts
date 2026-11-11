import type { CpListing } from "../../src/hooks/useCapitalPartners";

export const FOCUS_LISTING_ID = "98000000-0000-0000-0000-000000000001";
export const FOCUS_PROFILE_ID = "98000000-0000-0000-0000-000000000002";

// Portable fictional listing, deliberately separate from any real client file.
export function focusListing(options: { linked?: boolean; status?: "draft" | "repaid" | "withdrawn" } = {}): CpListing {
  return {
    id: FOCUS_LISTING_ID, ref: "CP-FOCUS-QA", name: "Example collateral financing", vertical: "business", vertical_label: "Business",
    program_label: "Bridge", city: "", state: "", place: null, collateral_type: "", lien_position: "first",
    note_rate_pct: "15", term_months: 36, ltv_pct: "60", ltv_kind: "ltv", minimum_investment: "175000", loan_amount: "175000", offered_amount: "175000",
    committed_amount: "0", remaining_amount: "175000", pct_committed: 0, payment_frequency: "monthly", personal_guarantee: false,
    status: options.status ?? "draft", outcome: null, opens_at: null, closes_at: "2026-12-15T14:30:00Z", days_left: null,
    funded_at: null, repaid_at: null, maturity_date: "2027-12-15", published_at: null, products: [], summary: "Fictional listing narrative.",
    guarantee_text: "", borrower_track_record: "", exit_plan: "", valuation_amount: "", valuation_source: "", title_status: "", servicer_label: "",
    documents: [], can_subscribe: false, source_kind: options.linked ? "profile" : "manual", loan_id: null,
    profile_id: options.linked ? FOCUS_PROFILE_ID : null, first_sale_at: null, published_by_id: null, publish_reason: null,
    withdrawn_at: null, withdrawn_reason: null, source_snapshot: {}, created_by_id: null,
    created_at: "2026-11-11T11:00:00Z", updated_at: "2026-11-11T11:00:00Z", investor_count: 0,
    subscriptions: [], participations: [], events: [], publish_blockers: ["Attach the PPM before publishing"], sync: null,
  };
}

export function focusBudget() {
  return { profile_id: FOCUS_PROFILE_ID, revision: 1, can_edit: true, funding_mode: "single_investor", costs_confirmed: true,
    loan_amount_mode: "gross_loan", investor_funding_amount: null, minimum_investor_contribution: null, currency: "USD", rows: [], note: null,
    calculation: { gross_loan_amount: 175000, investor_funding_amount: 175000, minimum_investor_contribution: 175000, net_client_cash: 175000 } };
}
