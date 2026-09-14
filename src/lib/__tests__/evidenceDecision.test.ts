import { describe, expect, it } from "vitest";
import {
  aggregateEvidenceDecisions,
  evidenceActorLabel,
  evidenceAnalysisLabel,
  evidenceCoverageLabel,
  evidenceDecisionLabel,
  evidenceDecisionTone,
  evidenceReasonLabel,
} from "@/lib/evidenceDecision";

describe("evidence decision presentation", () => {
  it("turns machine rejection codes into explicit operator-facing reasons", () => {
    expect(evidenceReasonLabel("wrong_entity", "rejected")).toBe("Entity mismatch");
    expect(evidenceReasonLabel("entity_unconfirmed", "needs_more")).toBe("Entity not confirmed");
    expect(evidenceReasonLabel("incomplete", "needs_more")).toBe("Incomplete document");
    expect(evidenceReasonLabel(null, "rejected")).toBe("Reason not provided");
  });

  it("keeps decision labels and tones consistent across requirements and banking", () => {
    expect(evidenceDecisionLabel("accepted", "ai")).toBe("Accepted by AI");
    expect(evidenceDecisionLabel("rejected", "ai")).toBe("Rejected by AI");
    expect(evidenceDecisionLabel("accepted", "staff")).toBe("Accepted by staff");
    expect(evidenceDecisionTone("accepted")).toBe("ok");
    expect(evidenceDecisionTone("rejected")).toBe("bad");
    expect(evidenceActorLabel("staff")).toBe("Staff decision");
  });

  it("shows the periods contributed by a file", () => {
    expect(evidenceCoverageLabel({ months: ["2026-07", "2026-08"] })).toBe("2026-07, 2026-08");
    expect(evidenceCoverageLabel({ years: [2024, 2025] })).toBe("2024, 2025");
  });

  it("distinguishes unreadable files and transport containers from rejections", () => {
    expect(evidenceAnalysisLabel("skipped", "password_protected")).toBe("Password-protected PDF");
    expect(evidenceAnalysisLabel("skipped", "zip_parent_archive")).toBe("ZIP archive expanded");
    expect(evidenceAnalysisLabel("failed", null)).toBe("AI analysis failed");
  });

  it("surfaces the most serious state when one file has multiple requirement decisions", () => {
    expect(aggregateEvidenceDecisions(["accepted", "rejected"])).toEqual({ decision: "rejected", mixed: true });
    expect(aggregateEvidenceDecisions(["accepted", "accepted"])).toEqual({ decision: "accepted", mixed: false });
    expect(aggregateEvidenceDecisions([])).toEqual({ decision: null, mixed: false });
  });
});
