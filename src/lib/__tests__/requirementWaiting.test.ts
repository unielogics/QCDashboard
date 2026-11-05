import { describe, expect, it } from "vitest";

import { acceptedProgress, evidenceOriginLabel, mostUrgentWaiting, requirementWaiting } from "@/lib/requirementWaiting";

const file = (ai_decision: string, extra: Record<string, unknown> = {}) => ({ ai_decision, ai_explanation: null, verified: false, ...extra }) as never;
const base = { status: "received_unverified", verification_required: false, state_reason: null } as const;

describe("requirementWaiting", () => {
  it("says the AI is reading only while a file is still being read", () => {
    const waiting = requirementWaiting({ ...base, evidence_files: [file("processing"), file("accepted")] });
    expect(waiting).toMatchObject({ kind: "ai_reading", label: "Received · AI reading", owner: "ai" });
  });

  it("names a person when the AI could not accept a file, and quotes why", () => {
    const waiting = requirementWaiting({
      ...base,
      evidence_files: [file("needs_more", { ai_explanation: "The document type could not be validated with high confidence" })],
    });
    expect(waiting.kind).toBe("needs_person");
    expect(waiting.label).toBe("Received · needs a person");
    expect(waiting.hint).toContain("The AI could not accept this file. The document type could not be validated with high confidence.");
    expect(waiting.owner).toBe("person");
    expect(requirementWaiting({ ...base, evidence_files: [file("rejected"), file("failed"), file("accepted")] }).hint).toContain("2 of the files");
  });

  it("asks for a sign-off when the AI accepted everything but the item needs a person", () => {
    const waiting = requirementWaiting({ ...base, verification_required: true, evidence_files: [file("accepted")] });
    expect(waiting).toMatchObject({ kind: "needs_signoff", label: "Received · needs sign-off", owner: "person" });
    const done = requirementWaiting({ ...base, verification_required: true, evidence_files: [file("accepted", { verified: true })] });
    expect(done.kind).toBe("received");
  });

  it("says the client owes the rest when the AI accepted only some of what is needed", () => {
    const waiting = requirementWaiting({
      ...base,
      evidence_files: [file("accepted"), file("accepted"), file("accepted")],
      coverage: { current: 3, required: 6, unit: "months" },
      verified_coverage: { current: 3, required: 6, unit: "months" },
    });
    expect(waiting).toMatchObject({ kind: "partial", label: "Partly received · 3 of 6 months", owner: "client" });
    expect(waiting.hint).toBe("The AI accepted 3 of 6 months. The client still needs to send the rest.");
  });

  it("counts what was accepted, not what merely arrived", () => {
    expect(acceptedProgress({ coverage: { current: 5, required: 6, unit: "months" }, verified_coverage: { current: 2, required: 6, unit: "months" } })).toEqual({ current: 2, required: 6, unit: "months" });
    expect(acceptedProgress({ coverage: { current: 6, required: 6, unit: "months" } })).toBeNull();
    expect(acceptedProgress({ coverage: {} })).toBeNull();
  });

  it("puts a flagged file ahead of partial coverage, because someone has to look at it", () => {
    const waiting = requirementWaiting({
      ...base,
      evidence_files: [file("accepted"), file("needs_more")],
      verified_coverage: { current: 2, required: 6, unit: "months" },
    });
    expect(waiting.kind).toBe("needs_person");
  });

  it("recognises a review that has not been run and falls back honestly", () => {
    expect(requirementWaiting({ ...base, state_reason: "Run AI review to verify the published document checks", evidence_files: [file("accepted")] }).kind).toBe("review_not_run");
    const plain = requirementWaiting({ ...base, evidence_files: [] });
    expect(plain).toMatchObject({ kind: "received", label: "Received · being checked" });
  });
});

describe("mostUrgentWaiting", () => {
  it("shows a task the state a person would want to see first", () => {
    const items = [
      requirementWaiting({ ...base, evidence_files: [file("processing")] }),
      requirementWaiting({ ...base, evidence_files: [file("needs_more")] }),
      requirementWaiting({ ...base, verification_required: true, evidence_files: [file("accepted")] }),
    ];
    expect(mostUrgentWaiting(items)?.kind).toBe("needs_person");
    expect(mostUrgentWaiting(items.slice(0, 1))?.kind).toBe("ai_reading");
    expect(mostUrgentWaiting([])).toBeNull();
  });
});

describe("evidenceOriginLabel", () => {
  it("tells a filled form from an upload and a signed certificate", () => {
    expect(evidenceOriginLabel("uploaded")).toBe("Uploaded");
    expect(evidenceOriginLabel(undefined)).toBe("Uploaded");
    expect(evidenceOriginLabel("filled_form", "pfs")).toBe("Filled in online · personal financial statement");
    expect(evidenceOriginLabel("filled_form", "debt_schedule")).toBe("Filled in online · debt schedule");
    expect(evidenceOriginLabel("filled_form", null)).toBe("Filled in online");
    expect(evidenceOriginLabel("signed")).toBe("Signed in the room");
  });
});
