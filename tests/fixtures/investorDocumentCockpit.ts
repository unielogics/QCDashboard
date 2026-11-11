import { guidanceListing } from "./marketplaceErrorGuidance";

export const DOC_LISTING_ID = "97000000-0000-0000-0000-000000000001";
export const DOC_REF = "CP-DOCUMENT-QA";
export const MEMBER_A = "97000000-0000-0000-0000-000000000002";
export const MEMBER_B = "97000000-0000-0000-0000-000000000003";
export const SOURCE_ID = "97000000-0000-0000-0000-000000000004";
export const PROTECTED_ID = "97000000-0000-0000-0000-000000000005";

export const offeringDocuments = [
  { id: "synthetic-ppm", kind: "ppm" as const, kind_label: "Private placement memorandum", name: "Synthetic-PPM.pdf", content_type: "application/pdf", size_bytes: 640, version: 1, status: "ready", source: "uploaded" as const },
  { id: "synthetic-summary", kind: "executive_summary" as const, kind_label: "Executive summary", name: "Synthetic-Summary.pdf", content_type: "application/pdf", size_bytes: 650, version: 2, status: "ready", source: "generated_package" as const },
];

// Fictional, aggregate-only public data. No account, tax identifier or transaction fields.
export function fileCatalog(staff = false, granted = false) {
  return {
    access: { state: staff ? "staff_preview" : granted ? "granted" : "locked" },
    groups: [
      { category: "bank_statement", label: "Bank statements", year: 2025, file_count: 2, releasable_count: 1 },
      { category: "business_tax_return", label: "Business tax returns", year: 2025, file_count: 1, releasable_count: 1 },
    ],
    originals: staff || granted ? [
      { file_id: SOURCE_ID, file_name: "Synthetic-Business-Tax-2025.pdf", category: "business_tax_return", year: 2025, version: 2, content_type: "application/pdf", size_bytes: 688, releasable: true, previewable: true },
      ...(staff ? [{ file_id: PROTECTED_ID, file_name: "Synthetic-Protected-Statement.pdf", category: "bank_statement", year: 2025, version: 1, content_type: "application/pdf", size_bytes: 688, releasable: false, previewable: false }] : []),
    ] : [],
    summaries: {
      bank_activity: [{ month: "2025-12", deposits: 12000, withdrawals: 9000, net: 3000, currency: "USD" }, { month: "2025-11", deposits: 1000, withdrawals: null, net: null, currency: null }],
      tax_years: [{ year: 2025, gross_receipts: 240000, income: 24000, total_deductions: 216000, gross_receipts_change_pct: 20, income_change_pct: -10, currency: "USD" }, { year: 2024, gross_receipts: 200000, income: 26666, total_deductions: 173334, gross_receipts_change_pct: null, income_change_pct: null, currency: "USD" }],
    },
  };
}

export function documentListing(ready = true) {
  const value = guidanceListing({ linked: true, ready });
  return { ...value, id: DOC_LISTING_ID, ref: DOC_REF, name: "Synthetic investor document offering", documents: ready ? offeringDocuments : [],
    expected_funding_date: "2027-01-15", maturity_date: "2028-01-15", maturity_date_mode: "automatic", date_note: "Estimated dates depend on actual funding.",
    financials: { deal_budget: { currency: "USD", servicing_mode: "company_managed", software_monitoring: { software_status: "configured", monitoring_status: "not_set" }, calculation: { investor_funding_amount: 175000, investor_scenarios: { six_month_payoff: { horizon_months: 6, initial_outlay: 175000, principal_returned: 175000, gross_interest: 13125, total_fees: 525, minimum_interest_charge: 0, payoff_charge_income: 0, reserve_released: 0, reserve_held: 0, net_income: 12600, net_roi_pct: 7.2, net_cash_received: 187600, net_cash_profit: 12600, missing_assumptions: [], assumptions: [], rows: [] }, full_term: { horizon_months: 12, initial_outlay: 175000, principal_returned: 175000, gross_interest: 26250, total_fees: 1050, net_income: 25200, net_roi_pct: 14.4, net_cash_received: 200200, net_cash_profit: 25200, missing_assumptions: [], assumptions: [], rows: [] } } } } },
  };
}

export function memberListing() {
  return { ...documentListing(), status: "open", my_subscriptions: [], can_subscribe: false, remaining_amount: "175000", place: "Example City, ST" };
}

export const approvedMembers = [MEMBER_A, MEMBER_B].map((id, index) => ({ id, user_id: `synthetic-user-${index}`, name: `Example Investor ${index + 1}`, display_name: `Example Investor ${index + 1}`, email: `investor${index + 1}@example.test`, status: "approved" }));
