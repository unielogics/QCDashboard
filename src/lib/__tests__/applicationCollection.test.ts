import { describe, expect, it } from "vitest";
import { collectionTaskNeedsAnswer, collectionTaskStatus, collectionTaskReadModelKey, type CollectionTask } from "../applicationCollection";

const task = { id: "credit", action_type: "answer_fields", status: "requested", assignee: "borrower", config: {}, label: "Credit review", description: null, state_reason: null } as CollectionTask;
describe("client versus team collection responsibility", () => {
  it("never asks the borrower to answer or counts internal review as a pending client response", () => {
    for (const status of ["open", "requested", "in_review", "escalated"] as const) { const internal = { ...task, status, assignee: "internal" as const }; expect(collectionTaskNeedsAnswer(internal)).toBe(false); expect(collectionTaskStatus(internal)).toBe("Team review"); }
    expect(collectionTaskNeedsAnswer(task)).toBe(true);
  });
  it("preserves complete/cancelled/paused dispositions without claiming program eligibility", () => {
    for (const status of ["completed", "cancelled", "paused"] as const) expect(collectionTaskNeedsAnswer({ ...task, status })).toBe(false);
    expect(collectionTaskStatus({ ...task, status: "completed", assignee: "internal" })).toBe("Complete");
    expect(collectionTaskStatus({ ...task, status: "cancelled", assignee: "internal" })).toBe("No longer needed");
  });
  it("refreshes task projections when scope or owner credit changes without a raw status change", () => {
    const requirement = { requirement_key: "credit", status: "received_unverified", program_overrides: {}, provenance: { credit_collection: { client_action_required: true } } };
    const initial = collectionTaskReadModelKey([requirement], [false, 0]);
    expect(collectionTaskReadModelKey([{ ...requirement, program_overrides: { program: "waived" } }], [false, 0])).not.toBe(initial);
    expect(collectionTaskReadModelKey([{ ...requirement, provenance: { credit_collection: { client_action_required: false } } }], [false, 0])).not.toBe(initial);
    expect(collectionTaskReadModelKey([requirement], [true, 1])).not.toBe(initial);
  });
});
