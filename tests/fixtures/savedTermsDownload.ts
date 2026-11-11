import type { TermsOnFile } from "../../src/components/file/UnderwritingFlow";

export const SAVED_TERMS_PROFILE = "96000000-0000-4000-8000-000000000001";
export const SAVED_TERMS_ID = "96000000-0000-4000-8000-000000000002";
export const savedAmount = (version: number) => version === 5 ? 185000 : 175000;
export function savedTermsOnFile(version: number, dealer = false): TermsOnFile | null {
  return version ? { kind: dealer ? "production_term_sheet" : "application_term_sheet", id: SAVED_TERMS_ID, version, status: dealer ? "current" : "draft", label: "Synthetic saved financing", amount: savedAmount(version), ratePct: 12, termMonths: 24, structureLabel: "Amortizing", interestOnlyMonths: 0, paymentMonthly: 8237.86, paymentAmount: 8237.86, paymentLabel: "Payment / month", coverageAfter: 1.15, recordedAt: "2027-01-01T12:00:00Z", sentToClient: false } : null;
}
export function savedClientTerms(version: number) {
  return { profile_id: SAVED_TERMS_PROFILE, term_sheet_id: SAVED_TERMS_ID, version, status: "draft", amount: version ? savedAmount(version) : null, apr_pct: 12, term_months: 24, loan_type: "private_loan_bridge", loan_type_label: "Private Loan / Bridge", loan_type_options: [{ value: "private_loan_bridge", label: "Private Loan / Bridge" }], funder_type: "private_capital", funder_name: "Synthetic Capital", repayment_frequency: "monthly", debt_service_treatment: "additive", retained_annual_debt_service: 30000, loan_structure: "amortizing", interest_only_months: 0, repayment_config: { amortization_months: 24, balloons: [] }, expiration_days: 7, closing_estimate_days: 5, co_brand_enabled: false, sponsor_name: "Synthetic sponsor", client_note: "Saved fictional snapshot", conditions: [], collateral_revision: 1, deal_budget_revision: 1, direct_client_contact_suppressed: false, calculation: { cash_flow_value: 180000, current_annual_debt_service: 30000, dscr_before: 6, dscr_after: 1.15, source: "Synthetic 2025 source", dscr_method: "business" } };
}
export function savedDealerTerms(version: number) {
  const current = version ? { id: SAVED_TERMS_ID, version, status: "current", funding_party_kind: "Lender", funding_party_name: "Synthetic Capital", lender_id: null, funder_type: "private_credit", facility_type: "Term loan", facility_kind: "term_loan", approved_amount: savedAmount(version), min_activation_amount: savedAmount(version), rate_pct: 12, apr_pct: 12, term_months: 24, monthly_debt_service: 8237.86, debt_service_is_level_payment: true, repayment_structure: "fully_amortizing", payment_frequency: "monthly", payments_per_year: 12, interest_only_months: 0, amortization_months: 24, repayment_config: { amortization_months: 24, balloons: [] }, debt_service_treatment: "additive", retained_annual_debt_service: 30000, conditions: "Fictional review condition", notes: "Saved synthetic snapshot", use_of_funds: null, entered_at: "2027-01-01T12:00:00Z", entered_by_name: "Synthetic reviewer", superseded_at: null, withdrawn_at: null, consumed_by_package_id: null, level_payment: 8237.86, expected_funding_date: null, activation_date: null, commencement_date: null, maturity_date: null, extra: {} } : null;
  return { current, history: current ? [current] : [], can_edit: true, defaults: { funding_party_name: "Synthetic Capital", funder_type: "private_capital", approved_amount: 175000, min_activation_amount: 175000, rate_pct: 12, term_months: 24 }, defaults_source: {}, facility_types: [], funding_party_kinds: [], lenders: [] };
}

// Small valid one-page PDFs for browser transport assertions only. Canonical
// saved-term document content/rendering is validated separately on the backend.
// Built-in PDF Helvetica requires no bundled font or external generator.
export function savedTermsTransportPdf(version: number, dealer = false): Buffer {
  const text = `Synthetic ${dealer ? "dealer" : "client"} saved terms v${version}; amount ${savedAmount(version)}. Transport fixture only.`;
  const stream = `BT /F1 12 Tf 40 740 Td (${text}) Tj ET\n`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let document = "%PDF-1.4\n% Synthetic saved-term transport fixture\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(document)); document += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document);
}
