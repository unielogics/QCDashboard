import { describe, expect, it } from "vitest";

import { answersByline, formKindsOf } from "@/lib/formAnswers";

describe("formKindsOf", () => {
  it("reads the form from what the requirement expects to receive", () => {
    expect(formKindsOf({ provenance: { expected_classifications: ["debt_schedule"] }, evidence_files: [] })).toEqual(["debt_schedule"]);
    expect(formKindsOf({ provenance: { expected_classifications: ["current_p_and_l", "balance_sheet"] }, evidence_files: [] })).toEqual(["p_and_l", "balance_sheet"]);
    expect(formKindsOf({ provenance: { expected_classifications: ["personal_financial_statement"] }, evidence_files: [] })).toEqual(["pfs"]);
  });

  it("is empty for a requirement that is not one of the four forms", () => {
    expect(formKindsOf({ provenance: { expected_classifications: ["business_tax_return"] }, evidence_files: [] })).toEqual([]);
    expect(formKindsOf({ provenance: {}, evidence_files: [] })).toEqual([]);
  });

  it("also takes the form from a file that was filled in online", () => {
    const files = [{ origin: "filled_form", form_kind: "pfs" }] as never;
    expect(formKindsOf({ provenance: {}, evidence_files: files })).toEqual(["pfs"]);
    expect(formKindsOf({ provenance: { expected_classifications: ["personal_financial_statement"] }, evidence_files: files })).toEqual(["pfs"]);
  });
});

describe("answersByline", () => {
  it("says who filled it in, or that the figures were read off a document", () => {
    expect(answersByline({ source: "filled", draft: false, filled_by: "the borrower", updated_at: null, figures_from: "form" })).toBe("Filled in by the borrower");
    expect(answersByline({ source: "uploaded", draft: false, filled_by: "a document we read", updated_at: null, figures_from: "document" })).toBe("Uploaded; figures read by the AI");
    expect(answersByline({ source: "none", draft: true, filled_by: null, updated_at: null, figures_from: null })).toBe("Draft, not submitted");
    expect(answersByline({ source: "filled", draft: false, filled_by: null, updated_at: "2026-11-05T19:14:00Z", figures_from: "form" })).toMatch(/^Filled in online · updated Nov 5, /);
  });
});
