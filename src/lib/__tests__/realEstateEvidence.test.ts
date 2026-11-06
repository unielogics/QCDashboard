import { describe, expect, it, vi } from "vitest";
import { applyMortgageEvidence, financialVersionIsWorkbook, mortgageStatementStatus, realEstateImportFieldLabel, realEstateImportFieldValue, stageMortgageEvidence, unlinkMortgageEvidence, type RealEstateEvidenceLink } from "../realEstateEvidence";
import type { FinancialWorkspaceSnapshot } from "../financialWorkspaceApi";
import type { RealEstateSchema } from "../realEstateSchedule";

const family = "family-one";
const snapshot = { family_id: family, draft: { revision: 7 } } as FinancialWorkspaceSnapshot;
const link = (status: RealEstateEvidenceLink["status"]): RealEstateEvidenceLink => ({ import_id: "proof", file_id: "statement", file_name: "Statement.pdf", property_row_id: "property", mortgage_row_id: "mortgage", status });
describe("reviewed mortgage evidence", () => {
  it("never treats a staged or unreviewed statement as accepted coverage", () => {
    expect(mortgageStatementStatus([link("unreviewed")], "mortgage").label).toBe("Statement needs review");
    expect(mortgageStatementStatus([link("staged")], "mortgage").label).toBe("Statement reviewed · save version");
    expect(mortgageStatementStatus([link("accepted")], "mortgage").label).toBe("Reviewed statement on file");
    expect(mortgageStatementStatus([link("accepted")], "other-mortgage").label).toBe("Latest statement needed");
    expect(mortgageStatementStatus(null, "mortgage").label).toBe("Checking statement evidence");
  });
  it("marks invalid associations for attention without requiring an unavailable file ID", () => {
    expect(mortgageStatementStatus([{ property_row_id: "property", mortgage_row_id: "mortgage", status: "invalid", reason: "Source changed" }], "mortgage").label).toBe("Statement needs attention");
  });
  it("matches collection rules instead of labeling every loan as missing a statement", () => {
    expect(mortgageStatementStatus([], "mortgage", { status: "paid_off", balance: "0" }, { mortgage_status: "active" }).label).toBe("Not required · paid off");
    expect(mortgageStatementStatus([], "mortgage", { status: "unknown", balance: "" }, { mortgage_status: "unknown" }).label).toBe("Confirm mortgage status");
    expect(mortgageStatementStatus([], "mortgage", { status: "unknown", balance: "100,000" }, { mortgage_status: "unknown" }).label).toBe("Latest statement needed");
    expect(mortgageStatementStatus([], "mortgage", { status: "unknown", balance: "" }, { mortgage_status: "active" }).label).toBe("Latest statement needed");
    expect(mortgageStatementStatus([], "mortgage", { status: "active", balance: "0" }, { mortgage_status: "unknown" }).label).toBe("Latest statement needed");
  });
  it("does not report a withdrawn proof as accepted", () => {
    expect(mortgageStatementStatus([{ ...link("invalid"), withdrawn: true }], "mortgage").label).toBe("Statement needs attention");
  });
  it("stages extraction without a destination before the user reviews proposed associations", async () => {
    const api = vi.fn().mockResolvedValue({});
    await stageMortgageEvidence(api, "profile", snapshot, "file");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ family_id: family, file_id: "file", expected_revision: 7 });
    expect(api.mock.calls[0][0]).toContain("/real-estate-evidence/imports");
  });
  it("binds a distinct source mortgage to reviewed existing or new destinations", async () => {
    const api = vi.fn().mockResolvedValue({});
    await stageMortgageEvidence(api, "profile", snapshot, "file", { property_row_id: "property", mortgage_row_id: "mortgage", source_mortgage_id: "source-two" });
    expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({ property_row_id: "property", mortgage_row_id: "mortgage", source_mortgage_id: "source-two" });
    await stageMortgageEvidence(api, "profile", snapshot, "file", { create_property: true, create_mortgage: true, source_mortgage_id: "source-three" });
    expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({ create_property: true, create_mortgage: true, source_mortgage_id: "source-three" });
  });
  it("sends both explicit confirmations and allows link-only acceptance without changing figures", async () => {
    const api = vi.fn().mockResolvedValue({});
    await applyMortgageEvidence(api, "profile", "review-one", 8, []);
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ expected_revision: 8, keys: [], confirm_association: true, confirm_latest_statement: true });
    expect(api.mock.calls[0][0]).toContain("/imports/review-one/apply");
  });
  it("retains a specific human explanation for a contradictory association", async () => {
    const api = vi.fn().mockResolvedValue({});
    await applyMortgageEvidence(api, "profile", "review", 9, ["mortgages.mortgage.balance"], "  Servicer changed; the loan reference matches the printed statement.  ");
    expect(JSON.parse(api.mock.calls[0][1].body).association_override_reason).toBe("Servicer changed; the loan reference matches the printed statement.");
  });
  it("withdraws an exact reviewed proof with revision checking, rather than deleting the source file", async () => {
    const api = vi.fn().mockResolvedValue({});
    await unlinkMortgageEvidence(api, "profile", snapshot, "mortgage", { import_id: "proof", file_id: "statement" });
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ family_id: family, expected_revision: 7, mortgage_row_id: "mortgage", import_id: "proof" });
    expect(api.mock.calls[0][0]).toContain("/real-estate-evidence/unlink");
  });
});

describe("readable real estate import identity", () => {
  const schema: RealEstateSchema = { kind: "real_estate_schedule", schema_version: "qc_res.v1", header: [{ key: "owner_name", label: "Owner / entity" }], properties: [{ key: "estimated_value", label: "Estimated value" }, { key: "property_type", label: "Property type", options: ["single_family"] }], mortgages: [{ key: "balance", label: "Current balance" }, { key: "property_row_id", label: "Property" }], totals: [] };
  const bodies = [{ properties: [{ id: "property-uuid", address: "123 Example St", city: "Miami" }], mortgages: [{ id: "loan-uuid", lender: "Example Bank", property_row_id: "property-uuid" }] }];
  it("labels the destination property and mortgage rather than exposing internal UUIDs", () => {
    expect(realEstateImportFieldLabel("properties.property-uuid.estimated_value", bodies, schema)).toBe("123 Example St, Miami · Estimated value");
    expect(realEstateImportFieldLabel("mortgages.loan-uuid.balance", bodies, schema)).toBe("Example Bank · Current balance");
    expect(realEstateImportFieldValue("mortgages.loan-uuid.property_row_id", "property-uuid", bodies, schema)).toBe("123 Example St, Miami");
  });
  it("keeps unknown references explicit and renders category labels for review", () => {
    expect(realEstateImportFieldValue("mortgages.loan-uuid.property_row_id", "unknown", bodies, schema)).toBe("Property association needs review");
    expect(realEstateImportFieldValue("properties.property-uuid.property_type", "single_family", bodies, schema)).toBe("Single family");
    expect(realEstateImportFieldValue("properties.property-uuid.estimated_value", null, bodies, schema)).toBe("Blank");
  });
  it("preserves Excel originals as workbooks and later generated versions as PDFs", () => {
    const context = { versions: [{ id: "v1", source_file_id: "excel", pdf_file_id: null }, { id: "v2", source_file_id: "excel", pdf_file_id: "generated-pdf" }, { id: "v3", source_file_id: "pdf", pdf_file_id: null }], evidence: [{ file_id: "excel", file_name: "Portfolio.xlsx" }, { file_id: "pdf", file_name: "Portfolio.pdf" }] } as Pick<FinancialWorkspaceSnapshot, "versions" | "evidence">;
    expect(financialVersionIsWorkbook(context, "v1")).toBe(true);
    expect(financialVersionIsWorkbook(context, "v2")).toBe(false);
    expect(financialVersionIsWorkbook(context, "v3")).toBe(false);
    expect(financialVersionIsWorkbook(context, "unknown")).toBe(false);
  });
});
