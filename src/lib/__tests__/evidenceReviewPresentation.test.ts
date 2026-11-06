import { describe, expect, it } from "vitest";
import { evidenceReviewPresentation } from "../evidenceReviewPresentation";

describe("document recognition and checklist suitability", () => {
  it("explains that a high-confidence MCA document is not the completed debt schedule", () => {
    const source = { ai_decision: "needs_more" as const, ai_reason_code: "low_confidence", ai_explanation: "The document type could not be validated with high confidence.", detected_classification: "floorplan_mca_inventory", analysis_confidence: "high" };
    const result = evidenceReviewPresentation(source, "Business debt schedule", true);
    expect(result).toMatchObject({ role: "Loan supporting document", confidence: "high", headline: "Supporting document; schedule fit needs review", requiresReview: true });
    expect(result.explanation).toContain("not the completed schedule of all business debts");
    expect(result.next).toContain("confirm the business and obligation");
    expect(source.ai_decision).toBe("needs_more");
  });

  it("keeps a business-identity concern unresolved even for accepted evidence", () => {
    const result = evidenceReviewPresentation({ ai_decision: "accepted", ai_reason_code: "entity_unconfirmed_warning", ai_explanation: "Entity name was not established.", detected_classification: "debt_schedule", evidence_claims: [{ capability: "debt_schedule", confidence: "high", entity: "Shining Stars LLC" }] }, "Business debt schedule", true);
    expect(result.role).toBe("Debt schedule document");
    expect(result.entities).toEqual(["Shining Stars LLC"]);
    expect(result.next).toContain("Confirm which business");
    expect(result.next).toContain("before combining any figures");
  });

  it("does not infer a loan document from a filename or a missing classification", () => {
    const result = evidenceReviewPresentation({ ai_decision: "needs_more", ai_reason_code: "low_confidence", ai_explanation: null }, "Business debt schedule", true);
    expect(result.role).toBe("Attached evidence");
    expect(result.classification).toBeNull();
    expect(result.explanation).toContain("not recorded");
    expect(result.next).toContain("compare it with this requirement");
  });

  it("uses a reported candidate without changing its confidence or granting acceptance", () => {
    const result = evidenceReviewPresentation({ ai_decision: "needs_more", ai_reason_code: "wrong_document", ai_explanation: null, document_type_candidates: [{ classification: "payoff_letter", confidence: "medium" }] }, "Business debt schedule", true);
    expect(result).toMatchObject({ classification: "Payoff letter", confidence: "medium", role: "Loan supporting document", requiresReview: true });
  });
});
