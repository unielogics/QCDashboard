import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebtScheduleReadback } from "../DebtScheduleReadback";
import { EvidenceReviewDetails } from "../EvidenceReviewDetails";
import type { FinancialWorkspaceSnapshot } from "@/lib/financialWorkspaceApi";
import type { ApplicationRequirementEvidence } from "@/lib/applicationProfile";
import { formatLoanOriginationDate } from "@/lib/loanProgress";

const fixture = (values: Partial<FinancialWorkspaceSnapshot> = {}): FinancialWorkspaceSnapshot => ({
  kind: "debt_schedule", family_id: "family", label: "Business obligations", schema: null,
  body: { debts: [
    { id: "oakwood", lender: "Oakwood", balance: "80,000", payment_amount: "7495", payment_frequency: "weekly", monthly_payment: "32453.35", status: "active", evidence_links: [{ file_id: "agreement", role: "agreement" }] },
    { id: "kapfi", lender: "Kapfi", balance: "40000", monthly_payment: "0", status: "active" },
    { id: "duplicate", lender: "Oakwood LLC", balance: "80000", monthly_payment: "32453.35", status: "duplicate", duplicate_of_id: "oakwood" },
  ] },
  worksheet: {} as FinancialWorkspaceSnapshot["worksheet"], draft: { revision: 3, base_version_id: "original", updated_at: "2026-11-05T18:00:00Z", dirty: true },
  current_version_id: "original", accepted_version_id: null,
  versions: [{ id: "original", version_number: 1, created_at: "2026-11-05T12:00:00Z", actor_name: "Client", source: "original", source_file_id: "upload", pdf_file_id: "upload", status: "original" }], families: [], evidence: [],
  completion: { complete: true, missing_fields: [], reason: "Complete", no_debt: false, active_rows: 2 }, accepted_completion: null,
  ...values,
});
const render = (values: Partial<FinancialWorkspaceSnapshot> = {}) => renderToStaticMarkup(createElement(DebtScheduleReadback, { workspace: fixture(values), onEdit: () => {}, onFiles: () => {}, onHistory: () => {} }));

describe("embedded debt schedule and reviewed evidence", () => {
  it("shows completed working rows, native payment terms and bounded totals while the original PDF stays separate", () => {
    const html = render();
    expect(html).toContain("2 obligations");
    expect(html).toContain("Working draft");
    expect(html).toContain("Every required answer is filled in");
    expect(html).toContain("Save version");
    expect(html).not.toContain("1 answer needed");
    expect(html).toContain("$120,000.00");
    expect(html).toContain("$32,453.35");
    expect(html).toContain("$7,495.00");
    expect(html).toContain("Week");
    expect(html).toContain("$0.00");
    expect(html).toContain("Edit schedule");
    expect(html).toContain("Edit Oakwood");
    expect(html).toContain("1 linked file");
    expect(html).toContain("1 excluded row");
    expect(html).toContain("Review or restore");
    expect(html).toContain("A completed schedule version has not been filed yet");
  });

  it("keeps published completion separate when a newer working draft has a missing payment", () => {
    const html = render({ completion: { complete: false, missing_fields: ["oakwood.monthly_payment"], reason: "Payment needed", no_debt: false, active_rows: 2 }, accepted_completion: { complete: true, missing_fields: [], reason: "Complete", no_debt: false, active_rows: 2 } });
    expect(html).toContain("1 answer needed");
    expect(html).toContain("last saved schedule is complete");
    expect(html).toContain("Needed: monthly payment or payment terms");
    expect(html).not.toContain("completed schedule version has not been filed");
  });

  it("shows canonical origination dates and per-loan paid down without aggregating a percentage", () => {
    const html = render({ body: { debts: [
      { id: "first", lender: "First loan", originated_on: "2026-01-15", original_amount: "100000", balance: "80000", monthly_payment: "100", status: "active" },
      { id: "paid", lender: "Paid loan", originated_on: "bad-date", original_amount: "1000", balance: "0", monthly_payment: "0", status: "active" },
      { id: "unknown", lender: "Unknown basis", original_amount: "0", balance: "50", monthly_payment: "10", status: "active" },
    ] } });
    expect(html).toContain("Origination date");
    expect(html).toContain("% paid down");
    expect(html).toContain(formatLoanOriginationDate("2026-01-15"));
    expect(html).toContain("Not provided");
    expect(html).toContain("20.0%");
    expect(html).toContain("100.0%");
    expect(html).toContain("—");
    expect(html.match(/<thead>[\s\S]*?<\/thead>/)?.[0].match(/scope="col"/g)).toHaveLength(9);
    expect(html.match(/<tfoot>[\s\S]*?<\/tfoot>/)?.[0]).not.toContain("%");
    expect(html).toMatch(/colspan="2"/i);
  });

  it("offers a specific supporting-document explanation and source action without implying acceptance", () => {
    const file = { file_id: "contract", file_name: "Contract.pdf", ai_decision: "needs_more", ai_reason_code: "low_confidence", ai_explanation: "The document type could not be validated with high confidence.", detected_classification: "floorplan_mca_inventory", analysis_confidence: "high" } as ApplicationRequirementEvidence;
    const html = renderToStaticMarkup(createElement(EvidenceReviewDetails, { file, requirementLabel: "Business debt schedule", isDebtSchedule: true, onPreview: () => {} }));
    expect(html).toContain("Why this needs review");
    expect(html).toContain("Loan supporting document");
    expect(html).toContain("schedule fit needs review");
    expect(html).toContain("high confidence in the document reading");
    expect(html).toContain("Recorded requirement review");
    expect(html).toContain("confirm the business and obligation");
    expect(html).toContain("Preview source");
    expect(html).not.toContain("Accepted by AI");
  });
});
