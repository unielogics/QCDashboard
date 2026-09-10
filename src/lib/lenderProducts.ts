// What a lender on the roster can carry — mirrors app/services/lender_products.py.
//
// The roster used to pick from LoanType, which is the six real-estate loan
// types and is also every loan's `type`. A card-processing partner is not a
// loan type and must never become one, so the roster has its own list: the
// real-estate group IS LoanType (unchanged, and still what the loan page's
// Connect-Lender dropdown matches on), plus the business-lending programmes
// and the service partners. Keep the two files in step by hand — nothing
// generates this one.

export type LenderProductGroup = "real_estate" | "business_lending" | "services";

export const MERCHANT_PROCESSING = "merchant_processing";

export const LENDER_PRODUCT_GROUPS: ReadonlyArray<{
  id: LenderProductGroup;
  label: string;
  hint: string;
  products: ReadonlyArray<{ value: string; label: string }>;
}> = [
  {
    id: "real_estate",
    label: "Real estate",
    hint: "These match a loan's type and drive the loan page's Connect-Lender dropdown.",
    products: [
      { value: "dscr", label: "DSCR Rental" },
      { value: "fix_and_flip", label: "Fix & Flip" },
      { value: "ground_up", label: "Ground-Up Construction" },
      { value: "bridge", label: "Bridge" },
      { value: "portfolio", label: "Portfolio" },
      { value: "cash_out_refi", label: "Cash-Out Refinance" },
    ],
  },
  {
    id: "business_lending",
    label: "Business lending",
    hint: "Operating-business programmes.",
    products: [
      { value: "sba", label: "SBA 7(a)" },
      { value: "sba_grocery", label: "SBA Grocery" },
      { value: "sba_made_in_america", label: "SBA Made in America" },
      { value: "term_loan_3_5_year", label: "EZ Term Loan" },
      { value: "term_loan_10_year", label: "MicroCap Working Capital" },
      { value: "term_loan_loc_hybrid", label: "Hybrid Term / LOC" },
      { value: "jumbo_term_loan", label: "Jumbo Term Loan" },
      { value: "line_of_credit", label: "Lines of Credit" },
      { value: "equipment_financing", label: "Equipment Financing" },
      { value: "transportation_finance", label: "Transportation Finance" },
      { value: "real_estate_backed", label: "Real-estate-backed" },
      { value: "jumbo_dscr", label: "Jumbo DSCR" },
      { value: "reinsurance_backed", label: "Reinsurance-backed" },
      { value: "mca_refinance", label: "MCA Refinance" },
    ],
  },
  {
    id: "services",
    label: "Services",
    hint: "Service partners are picked from a file's Underwriting panel, not the loan dropdown.",
    products: [
      { value: MERCHANT_PROCESSING, label: "Merchant Processing" },
      { value: "transportation_factoring", label: "Transportation Factoring" },
      { value: "debt_consulting", label: "Debt Consulting" },
      { value: "business_systems", label: "Business Systems (POS)" },
    ],
  },
];

export const LENDER_PRODUCT_LABEL = new Map<string, string>(
  LENDER_PRODUCT_GROUPS.flatMap((group) => group.products.map((p) => [p.value, p.label] as [string, string])),
);

export function lenderProductLabel(key: string): string {
  return LENDER_PRODUCT_LABEL.get(key) ?? key;
}
