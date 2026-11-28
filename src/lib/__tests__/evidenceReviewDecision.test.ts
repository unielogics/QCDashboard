import { describe, expect, it } from "vitest";
import type { DocumentAssociation } from "../documentAssociation";
import {
  APPROVE_REASONS,
  BUSINESS_NAME_REASONS,
  MIN_REASON_LENGTH,
  REJECT_REASONS,
  businessNameAction,
  businessNameState,
  reasonLongEnough,
  reviewDecisionState,
} from "../evidenceReviewDecision";

const decision = (extra: Record<string, unknown> = {}) => ({
  ai_decision: "accepted" as const, decision_actor: "ai" as const, verified: false,
  ai_reason_code: "validated", ai_explanation: "AI validated the document type and period.", ...extra,
});
const state = (extra: Record<string, unknown> = {}, options: Record<string, unknown> = {}) => reviewDecisionState({
  decision: decision(extra) as Parameters<typeof reviewDecisionState>[0]["decision"],
  requirementLabel: "Business tax returns", verificationRequired: false, ...options,
});

describe("what the review screen says about a file's checklist decision", () => {
  it("offers only Reject on a file the AI accepted, and says nothing more is needed", () => {
    const result = state();
    expect(result.chip).toBe("Accepted by AI");
    expect(result.tone).toBe("ok");
    expect(result.sentence).toBe("Accepted for Business tax returns. Nothing more is needed unless you disagree.");
    expect(result.choices).toEqual(["reject"]);
    expect(result.open).toBe(false);
  });

  it("asks for Approve when the checklist item needs a person on top of the AI", () => {
    const result = state({}, { verificationRequired: true });
    expect(result.chip).toBe("Needs your approval");
    expect(result.sentence).toContain("The AI accepted this file for Business tax returns");
    expect(result.sentence).toContain("needs a person to approve it");
    expect(result.choices).toEqual(["approve", "reject"]);
    expect(result.open).toBe(true);
    // Once a person has approved it, nothing is asked any more.
    expect(state({ verified: true }, { verificationRequired: true }).choices).toEqual(["reject"]);
  });

  it("does not call an automatic verification a person's approval", () => {
    const result = state({ verified: true });
    expect(result.sentence).not.toMatch(/person|human|staff|team member/i);
  });

  it("offers Approve anyway and Reject, with the AI's reason, when the AI could not accept the file", () => {
    for (const ai_decision of ["needs_more", "rejected"] as const) {
      const result = state({ ai_decision, ai_reason_code: "wrong_period" }, { headline: "Period needs confirmation", explanation: "The statement stops in June" });
      expect(result.chip).toBe("Needs review");
      expect(result.sentence).toBe("The AI could not accept this file for Business tax returns. Approve it if it is right, or reject it.");
      expect(result.reason).toBe("Period needs confirmation. The statement stops in June.");
      expect(result.choices).toEqual(["approve_anyway", "reject"]);
      expect(result.open).toBe(true);
    }
  });

  it("offers only Approve anyway on a file a person already rejected, with their reason", () => {
    const result = state({ ai_decision: "rejected", decision_actor: "staff", ai_reason_code: "wrong_document", ai_explanation: "This is a bank letter" });
    expect(result.chip).toBe("Staff requested another copy");
    expect(result.sentence).toBe("A team member rejected this file for Business tax returns.");
    expect(result.reason).toBe("Possible different document. This is a bank letter.");
    expect(result.choices).toEqual(["approve_anyway"]);
    expect(result.open).toBe(false);
  });

  it("says who approved a file a person accepted, and keeps their reason", () => {
    const result = state({ decision_actor: "staff", verified: true, ai_reason_code: "ai_override", ai_explanation: "I read the document and it meets this item" });
    expect(result.chip).toBe("Accepted by staff");
    expect(result.sentence).toBe("A team member approved this file for Business tax returns. Nothing more is needed.");
    expect(result.reason).toBe("I read the document and it meets this item.");
    expect(result.choices).toEqual(["reject"]);
  });

  it("offers a new reading first when the AI could not read the file", () => {
    const result = state({ ai_decision: "failed", ai_reason_code: "analysis_unavailable", ai_explanation: "The pages could not be read." });
    expect(result.chip).toBe("Automatic review unavailable");
    expect(result.choices).toEqual(["retry", "approve_anyway", "reject"]);
    expect(result.reason).toBe("The pages could not be read.");
    expect(result.open).toBe(true);
  });

  it("does not ask for a decision while the AI is still reading", () => {
    const result = state({ ai_decision: "processing" });
    expect(result.chip).toBe("Processing");
    expect(result.sentence).toContain("still reading");
    expect(result.open).toBe(false);
  });

  it("sends a file that is on no checklist item to be attached, with what the AI made of it", () => {
    const result = reviewDecisionState({ decision: null, requirementLabel: null, verificationRequired: false, analysisNote: "AI analysis complete. A quote from a supplier" });
    expect(result.chip).toBe("Not on the checklist");
    expect(result.choices).toEqual(["attach"]);
    expect(result.sentence).toContain("not attached to a checklist item");
    expect(result.reason).toBe("AI analysis complete. A quote from a supplier.");
    // One the AI could not read can be read again before it is attached, unless it is locked.
    expect(reviewDecisionState({ decision: null, requirementLabel: null, verificationRequired: false, analysisFailed: true }).choices).toEqual(["retry", "attach"]);
    expect(reviewDecisionState({ decision: null, requirementLabel: null, verificationRequired: false, analysisFailed: true, locked: { title: "Locked PDF", explanation: "Needs a password" } }).choices).toEqual(["attach"]);
  });

  it("explains a locked file and never offers to approve what nobody could read", () => {
    const result = state({ ai_decision: "needs_more" }, { locked: { title: "Locked PDF", explanation: "This PDF needs a password" } });
    expect(result.chip).toBe("Locked PDF");
    expect(result.sentence).toBe("This PDF needs a password. The AI cannot read it, so it cannot count for Business tax returns until an unlocked copy arrives.");
    expect(result.choices).toEqual(["reject"]);
  });
});

const record = (extra: Partial<DocumentAssociation> = {}): DocumentAssociation => ({
  file_id: "file", file_name: "Return.pdf", content_hash: "a".repeat(64), analysis_id: "analysis",
  expected_entity: "samplefabco", observed_entities: ["SAMPLE FABRICATION CO LLC"], status: "conflict",
  allows_financial_use: false, document_accepted: true, source_stamp: "b".repeat(64), can_review: true,
  current_decision: null, history: [], ...extra,
});
const event = (action: "accept" | "deny") => ({ id: "event", action, reason: "Same business; its name is written differently", actor_name: "Sam Desk", at: "2026-11-28T15:00:00Z", source_stamp: "b".repeat(64), revision: 5 });
const when = () => "Nov 28, 2026";

describe("the business-name question", () => {
  it("shows nothing when the name matched on its own or there is no name to compare", () => {
    expect(businessNameState(record({ status: "matched" }), { canAnswer: true })).toBeNull();
    expect(businessNameState(null, { canAnswer: true, decision: "accepted", reasonCode: "validated" })).toBeNull();
    expect(businessNameState(undefined, { canAnswer: true })).toBeNull();
  });

  it("keeps a quiet row for a matched name on a screen with no other way to change it", () => {
    const result = businessNameState(record({ status: "matched", allows_financial_use: true, observed_entities: ["samplefabco"] }), { canAnswer: true, includeMatched: true });
    expect(result?.chip).toBe("Business name matches");
    expect(result?.sentence).toBe("The document names samplefabco, the same business as this file.");
    expect(result?.choices).toEqual(["change"]);
    expect(result?.open).toBe(false);
    expect(businessNameState(record({ status: "matched" }), { canAnswer: false, includeMatched: true })?.choices).toEqual([]);
  });

  it("puts both names in the question and offers Yes and No", () => {
    const result = businessNameState(record(), { canAnswer: true });
    expect(result?.chip).toBe("Business name differs");
    expect(result?.sentence).toBe("The document names SAMPLE FABRICATION CO LLC. This file's business is samplefabco. Is it the same business?");
    expect(result?.note).toBe("Its figures are left out of this file's numbers until someone answers.");
    expect(result?.choices).toEqual(["same", "different"]);
    expect(result?.open).toBe(true);
  });

  it("says when the figures are being used meanwhile", () => {
    expect(businessNameState(record({ allows_financial_use: true }), { canAnswer: true })?.note).toBe("Its figures are being used for now.");
  });

  it("asks differently when no name could be read, or it could not be matched", () => {
    expect(businessNameState(record({ status: "unconfirmed", observed_entities: [] }), { canAnswer: true })?.sentence).toBe("No business name could be read from this document. Does it belong to samplefabco?");
    const unmatched = businessNameState(record({ status: "unconfirmed" }), { canAnswer: true });
    expect(unmatched?.chip).toBe("Business name not confirmed");
    expect(unmatched?.sentence).toContain("could not be matched to samplefabco");
  });

  it("asks again when the document or the file's business changed after an answer", () => {
    const result = businessNameState(record({ status: "stale" }), { canAnswer: true });
    expect(result?.chip).toBe("Business name needs a new answer");
    expect(result?.choices).toEqual(["same", "different"]);
    expect(result?.open).toBe(true);
  });

  it("shows a recorded answer with who gave it, when and why, and lets it be changed", () => {
    const same = businessNameState(record({ status: "accepted", allows_financial_use: true, current_decision: event("accept") }), { canAnswer: true, formatDate: when });
    expect(same?.chip).toBe("Same business");
    expect(same?.tone).toBe("ok");
    expect(same?.sentence).toBe("Sam Desk confirmed this document belongs to samplefabco on Nov 28, 2026.");
    expect(same?.note).toBe("Reason: Same business; its name is written differently.");
    expect(same?.choices).toEqual(["change"]);
    expect(same?.open).toBe(false);
    const different = businessNameState(record({ status: "denied", current_decision: event("deny") }), { canAnswer: true, formatDate: when });
    expect(different?.chip).toBe("Different business");
    expect(different?.tone).toBe("bad");
    expect(different?.sentence).toContain("marked this document as a different business on Nov 28, 2026");
    expect(different?.sentence).toContain("left out of this file's numbers");
  });

  it("lets someone who cannot answer read the question without the buttons", () => {
    expect(businessNameState(record(), { canAnswer: false })?.choices).toEqual(["view"]);
    expect(businessNameState(record({ can_review: false }), { canAnswer: true })?.choices).toEqual(["view"]);
    expect(businessNameState(record({ status: "accepted", current_decision: event("accept") }), { canAnswer: false })?.choices).toEqual(["view"]);
  });

  it("still raises a name warning recorded on the file when no association came with it", () => {
    const result = businessNameState(null, { canAnswer: true, decision: "accepted", reasonCode: "entity_mismatch_warning" });
    expect(result?.chip).toBe("Business name differs");
    expect(result?.choices).toEqual(["view"]);
    // A warning on a file that was not accepted is the checklist decision's to explain.
    expect(businessNameState(null, { canAnswer: true, decision: "needs_more", reasonCode: "entity_mismatch_warning" })).toBeNull();
  });

  it("maps the buttons to the saved answer", () => {
    expect(businessNameAction("same")).toBe("accept");
    expect(businessNameAction("different")).toBe("deny");
    expect(businessNameAction("change")).toBeNull();
    expect(businessNameAction("view")).toBeNull();
  });
});

describe("one-click reasons", () => {
  it("are all long enough to be saved as they are", () => {
    const all = [...APPROVE_REASONS, ...Object.values(REJECT_REASONS), ...Object.values(BUSINESS_NAME_REASONS).flat()];
    expect(all.length).toBeGreaterThan(8);
    for (const reason of all) {
      expect(reasonLongEnough(reason)).toBe(true);
      expect(reason.length).toBeLessThanOrEqual(2000);
    }
  });

  it("hold the API's shortest reason", () => {
    expect(MIN_REASON_LENGTH).toBe(8);
    expect(reasonLongEnough("  short  ")).toBe(false);
    expect(reasonLongEnough("12345678")).toBe(true);
  });
});
