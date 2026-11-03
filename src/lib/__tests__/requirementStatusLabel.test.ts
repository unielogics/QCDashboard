import { describe, expect, it } from "vitest";

import { requirementStatusLabel } from "@/lib/applicationProfile";

describe("requirement states in the desk's words", () => {
  it("says what happens next, not what the machine knows", () => {
    expect(requirementStatusLabel("requested")).toBe("Waiting on client");
    expect(requirementStatusLabel("received_unverified")).toBe("Received · AI checking");
    expect(requirementStatusLabel("received_unverified", { needsPerson: true })).toBe("Received · needs a person");
    expect(requirementStatusLabel("verified")).toBe("Accepted");
    expect(requirementStatusLabel("not_applicable")).toBe("Not needed");
    expect(requirementStatusLabel("failed")).toBe("Not accepted");
  });

  it("falls back to readable words for anything new", () => {
    expect(requirementStatusLabel("needs_attention")).toBe("needs attention");
    expect(requirementStatusLabel(null)).toBe("Unknown");
  });
});
