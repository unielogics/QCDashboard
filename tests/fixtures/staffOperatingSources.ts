import { operatingClientScenarios } from "./operatingClientScenarios";

export const STAFF_PROFILE = "92000000-0000-4000-8000-000000000001";
export const STAFF_FAMILY = "92000000-0000-4000-8000-000000000002";
export const STAFF_TAX_SOURCE = "92000000-0000-4000-8000-000000000003";
export const STAFF_BANK_SOURCE = "92000000-0000-4000-8000-000000000004";
export const emptyStaffOperatingBody = {
  ...operatingClientScenarios.initial.body, business_name: "", period_start: null, period_end: null,
  currency: "USD", basis: "unknown", expenses: [], adjustments: [], category_confirmations: {},
};

const expenses = [
  ["rent", "Rent and premises", 12000], ["salaries", "Employee salaries", 24000],
  ["insurance", "Business insurance", 1200], ["utilities", "Utilities", 2400],
  ["software", "Software subscriptions", 600], ["marketing", "Marketing and advertising", 3600],
  ["supplies", "Operating supplies", 1800], ["professional_fees", "Professional services", 2400],
] as const;
const groups = expenses.map(([category, label, amount]) => ({
  key: `${STAFF_TAX_SOURCE}:${category}`, category, label, baseline_annual_amount: amount, source_amount: amount,
  currency: "USD", basis: "cash", year: 2025, period_start: "2025-01-01", period_end: "2025-12-31",
  source_file_ids: [STAFF_TAX_SOURCE], source_label: "Example business return 2025.pdf",
  source_fact_keys: [`deductions.${category}`], notes: ["Source reference total; confirm current costs before proposing changes."],
}));
export const staffOperatingEvidence = {
  business_name: "Example Studio", files: [
    { file_id: STAFF_TAX_SOURCE, file_name: "Example business return 2025.pdf", classification: "business_tax_return", eligible_for_guidance: true, eligible_for_review: true },
    { file_id: STAFF_BANK_SOURCE, file_name: "Example bank statements.pdf", classification: "bank_statement", eligible_for_guidance: true, eligible_for_review: true },
  ],
  guidance: {
    policy_version: "operating-guidance-v1", business: { name: "Example Studio", industry: "Professional services", naics_code: "541990", questions: [] },
    reporting: { source_file_id: STAFF_TAX_SOURCE, source_label: "Example business return 2025.pdf", source_kind: "business_tax_return", year: 2025, period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", basis: "cash" },
    expense_groups: groups, essentials: groups.map(group => ({ category: group.category, label: group.label, prompt: "Confirm the current recurring cost or ask for help." })),
    action_templates: [], warnings: [],
  },
  expense_candidates: [
    ...groups.map(group => ({ key: group.key, source_candidate_key: group.key, source_group_key: group.key, label: group.label, category: group.category, current_amount: group.baseline_annual_amount, cadence: "annual", currency: "USD", basis: "cash", year: 2025, source_file_ids: group.source_file_ids, source_note: "Synthetic tax source reference." })),
    ...Array.from({ length: 11 }, (_, index) => ({ key: `observed-${index}`, bank_vendor_key: `vendor-${index}`, label: index === 0 ? "Observed rent payment" : `Observed vendor ${index + 1}`, category: index === 0 ? "rent" : "other", current_amount: 100 + index * 10, cadence: "monthly", currency: "USD", source_file_ids: [STAFF_BANK_SOURCE], source_note: "Observed statement payment; confirm category and avoid duplicating tax expense totals." })),
  ], merchant_sources: [], merchant_offers: [], warnings: [],
};

export const staffOperatingEvaluation = operatingClientScenarios.initial.reply.evaluation;
