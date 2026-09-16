// Option tuples mirror app/services/production_arrangement.py.
import type { FacilityKind, FunderType, PaymentFrequency, RateStructure, RepaymentStructure } from "./types";
export const US_STATES: Array<[string, string]> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

export const ENTITY_TYPES = [
  "Limited liability company", "Corporation", "S corporation", "Limited partnership",
  "Limited liability partnership", "Sole proprietorship", "Trust", "Other",
] as const;

export type FacilityCatalogOption = {
  key: string;
  label: string;
  group: "Term and real estate" | "Lines of credit" | "Equipment and government" | "Dealer program" | "Flexible";
  kind: FacilityKind;
  repayment: RepaymentStructure;
};

/**
 * A broad commercial catalog for the term-sheet editor. The human label is
 * still stored in legacy `facility_type`; `key` and `kind` are promoted by the
 * API and mirrored in `extra` so calculations never infer behavior from copy.
 */
export const FACILITY_CATALOG: readonly FacilityCatalogOption[] = [
  { key: "business_term_loan", label: "Business term loan", group: "Term and real estate", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "working_capital_loan", label: "Working-capital loan", group: "Term and real estate", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "business_acquisition_loan", label: "Business acquisition loan", group: "Term and real estate", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "business_debt_refinance", label: "Business debt refinance", group: "Term and real estate", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "dscr_rental_loan", label: "DSCR rental loan", group: "Term and real estate", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "bridge_loan", label: "Bridge loan", group: "Term and real estate", kind: "term_loan", repayment: "interest_only" },
  { key: "commercial_real_estate", label: "Commercial real estate loan", group: "Term and real estate", kind: "term_loan", repayment: "balloon" },
  { key: "construction_loan", label: "Construction loan", group: "Term and real estate", kind: "term_loan", repayment: "interest_only" },
  { key: "fix_and_flip", label: "Fix-and-flip loan", group: "Term and real estate", kind: "term_loan", repayment: "interest_only" },
  { key: "hard_money_loan", label: "Private / hard-money loan", group: "Term and real estate", kind: "term_loan", repayment: "interest_only" },
  { key: "home_equity_loan", label: "Business-purpose home equity loan", group: "Term and real estate", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "business_loc", label: "Business line of credit", group: "Lines of credit", kind: "revolving_loc", repayment: "revolving_interest_only" },
  { key: "revolving_loc", label: "Revolving line of credit", group: "Lines of credit", kind: "revolving_loc", repayment: "revolving_interest_only" },
  { key: "asset_based_loc", label: "Asset-based line of credit", group: "Lines of credit", kind: "revolving_loc", repayment: "revolving_interest_only" },
  { key: "receivables_loc", label: "Accounts-receivable line", group: "Lines of credit", kind: "revolving_loc", repayment: "revolving_interest_only" },
  { key: "purchase_order_financing", label: "Purchase-order financing", group: "Lines of credit", kind: "revolving_loc", repayment: "revolving_interest_only" },
  { key: "business_heloc", label: "Business-purpose HELOC", group: "Lines of credit", kind: "heloc", repayment: "revolving_interest_only" },
  { key: "investment_heloc", label: "Investment-property HELOC", group: "Lines of credit", kind: "heloc", repayment: "interest_only_then_amortizing" },
  { key: "inventory_floorplan", label: "Inventory / floorplan line", group: "Lines of credit", kind: "revolving_loc", repayment: "revolving_interest_only" },
  { key: "equipment_financing", label: "Equipment financing", group: "Equipment and government", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "equipment_lease", label: "Equipment lease", group: "Equipment and government", kind: "other", repayment: "fixed_payment" },
  { key: "sba_loan", label: "SBA loan", group: "Equipment and government", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "sba_7a", label: "SBA 7(a) loan", group: "Equipment and government", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "sba_504", label: "SBA 504 loan", group: "Equipment and government", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "dealer_capital_advance", label: "Dealer capital advance", group: "Dealer program", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "commission_advance", label: "Commission advance", group: "Dealer program", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "revolving_commission_line", label: "Revolving commission line", group: "Dealer program", kind: "revolving_loc", repayment: "revolving_interest_only" },
  // Kept for existing rows and stage-one defaults.
  { key: "term_advance", label: "Term advance", group: "Dealer program", kind: "term_loan", repayment: "fully_amortizing" },
  { key: "revenue_based_financing", label: "Revenue-based financing", group: "Flexible", kind: "other", repayment: "custom" },
  { key: "merchant_cash_advance", label: "Merchant cash advance", group: "Flexible", kind: "other", repayment: "custom" },
  { key: "invoice_factoring", label: "Invoice factoring", group: "Flexible", kind: "other", repayment: "custom" },
  { key: "mezzanine_financing", label: "Mezzanine financing", group: "Flexible", kind: "hybrid", repayment: "custom" },
  { key: "hybrid", label: "Hybrid", group: "Flexible", kind: "hybrid", repayment: "custom" },
  { key: "other", label: "Other / custom product", group: "Flexible", kind: "other", repayment: "custom" },
] as const;

export const FACILITY_TYPES: readonly string[] = FACILITY_CATALOG.map((option) => option.label);

export const REPAYMENT_STRUCTURES: ReadonlyArray<{ value: RepaymentStructure; label: string; detail: string }> = [
  { value: "fully_amortizing", label: "Principal + interest", detail: "Pays down to zero over the amortization period." },
  { value: "interest_only", label: "Interest only", detail: "Interest is due periodically; principal remains due at maturity." },
  { value: "interest_only_then_amortizing", label: "IO, then amortizing", detail: "Interest-only opening phase followed by principal and interest." },
  { value: "balloon", label: "Amortizing + balloon", detail: "Scheduled payments use a longer amortization than the facility term." },
  { value: "revolving_interest_only", label: "Revolving interest only", detail: "Payment changes with the outstanding balance and rate." },
  { value: "fixed_payment", label: "Fixed lender payment", detail: "Use the exact periodic payment quoted by the funding source." },
  { value: "custom", label: "Custom schedule", detail: "Describe a structure that does not fit the standard choices." },
];

export const PAYMENT_FREQUENCIES: ReadonlyArray<{ value: PaymentFrequency; label: string; periods: number | null }> = [
  { value: "monthly", label: "Monthly", periods: 12 },
  { value: "weekly", label: "Weekly", periods: 51.96 },
  { value: "biweekly", label: "Every two weeks", periods: 25.98 },
  { value: "daily", label: "Daily (business days)", periods: 252 },
  { value: "custom", label: "Custom cadence", periods: null },
];

export const RATE_STRUCTURES: ReadonlyArray<{ value: RateStructure; label: string }> = [
  { value: "fixed", label: "Fixed rate" },
  { value: "variable", label: "Variable / index + margin" },
  { value: "custom", label: "Custom pricing" },
];

export const RATE_INDEXES = ["Prime", "WSJ Prime", "SOFR", "U.S. Treasury", "Lender index", "Other"] as const;

export const FUNDER_TYPES: ReadonlyArray<{ value: FunderType; label: string }> = [
  { value: "bank", label: "Bank" },
  { value: "credit_union", label: "Credit union" },
  { value: "private_credit", label: "Private credit fund" },
  { value: "nonbank_lender", label: "Non-bank lender / fintech" },
  { value: "balance_sheet", label: "Balance-sheet lender" },
  { value: "family_office", label: "Family office" },
  { value: "sponsor", label: "Sponsor-provided capital" },
  { value: "other", label: "Other" },
];

export const EVIDENCE_OPTIONS = [
  "DMS unit reports", "F&I production reports", "Sponsor production reports", "Sponsor remittance statements",
  "Bank statements (Plaid)", "Bank statements (uploaded)", "Tax returns", "Dealer attestation",
] as const;

export const TERM_OPTIONS = [12, 18, 24, 36] as const;

export const CADENCES: Array<{ key: "month" | "quarter" | "balance"; label: string; detail: string; tag: string; tone: "bad" | "acc" | "warn" }> = [
  { key: "month", label: "Billed monthly as it occurs", detail: "The gap is invoiced in the month it happens. Tightest on cash, hardest on a dealer with lumpy production.", tag: "Strictest", tone: "bad" },
  { key: "quarter", label: "Netted quarterly", detail: "A strong month offsets a weak one inside the quarter, and only the net gap is billed.", tag: "Balanced", tone: "acc" },
  { key: "balance", label: "Tracked as a running balance", detail: "The gap accrues and is drawn on only when needed. Loosest, and appropriate only where production is predictable.", tag: "Loosest", tone: "warn" },
];

export const ADJUSTMENTS: Array<["none" | "bps" | "rate", string]> = [["none", "None"], ["bps", "Basis points"], ["rate", "Exact adjusted rate"]];
export const SIZING_MODES: Array<["backsolve" | "fixed", string]> = [["backsolve", "Back-solve the advance"], ["fixed", "Fix the advance"]];
export const BUILDOUT_MODES: Array<["reverse" | "forward", string]> = [["reverse", "Reverse-engineer the markup"], ["forward", "Set the repayment per contract"]];
export const FUNDING_PARTIES = ["Sponsor", "Qualified Commercial LLC", "Lender"] as const;

export const PRODUCTS: Array<{ key: import("./types").ProductKey; label: string; primary?: boolean }> = [
  { key: "vsc", label: "Vehicle service contracts", primary: true },
  { key: "gap", label: "GAP products" },
  { key: "theft", label: "Anti-theft products" },
  { key: "appearance", label: "Appearance protection" },
  { key: "key", label: "Key replacement" },
  { key: "tire", label: "Tire and wheel" },
  { key: "maint", label: "Maintenance products" },
  { key: "power", label: "Powertrain products" },
];

// Checkbox groups on the agreements: [slug stored on the arrangement, label as printed].
export const PROGRAM_SUPPORT_OPTIONS: Array<[string, string]> = [
  ["application_packaging", "Application and packaging support"], ["reporting_technology", "Reporting technology"],
  ["ongoing_monitoring", "Ongoing monitoring"], ["first_risk_reserve", "First-risk or reserve support"],
  ["capital_health", "Capital Health Services"], ["controlled_account", "Controlled-account support"],
  ["product_admin_platform", "Product-administration platform"], ["preferential_economics", "Preferential program economics"],
  ["other", "Other"],
];
export const RM_COMP_OPTIONS: Array<[string, string]> = [
  ["salary", "Salary"], ["fixed_recurring", "Fixed recurring account-management compensation"],
  ["hourly", "Hourly compensation"], ["disclosed_product", "Disclosed Covered Product sales or servicing compensation"],
  ["fixed_implementation", "Fixed implementation compensation for documented services"], ["other", "Other lawful compensation"],
];
export const SBA_OPTIONS = ["Not an SBA transaction", "SBA transaction; required SBA compensation documentation attached"] as const;
export const YES_NO = ["No", "Yes"] as const;
export const USE_OF_FUNDS_KEYS: Array<[import("./types").UseOfFundsKey, string]> = [
  ["inventory", "Inventory"], ["debt_payoff", "Debt payoff"], ["working_capital", "Working capital allocation"],
  ["equipment", "Equipment"], ["real_estate", "Real estate"], ["program_implementation", "Program implementation"],
  ["other", "Other approved purpose"],
];
export const OWNER_FIELDS = ["name", "pct", "title", "email", "phone", "auth"] as const;
export const MAX_OWNERS = 5;
export const MAX_PROTECTED = 3;
export const MAX_EXISTING = 4;
