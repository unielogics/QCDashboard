import { describe, expect, it, vi } from "vitest";
import { requirementCanBeRemoved, updateRequirementLifecycle } from "../requirementLifecycle";
import type { ApplicationRequirement } from "../applicationProfile";

const requirement = (extra: Partial<ApplicationRequirement>) => ({ source_policy_keys: ["staff_added"], ...extra } as ApplicationRequirement);
describe("recoverable requirement lifecycle", () => {
  it("honors server permissions and does not offer staff removal for program-derived requirements", () => {
    expect(requirementCanBeRemoved(requirement({ can_remove: false }))).toBe(false);
    expect(requirementCanBeRemoved(requirement({ derived_required: true }))).toBe(false);
    expect(requirementCanBeRemoved(requirement({}))).toBe(true);
    expect(requirementCanBeRemoved(requirement({ source_policy_keys: ["policy"] }))).toBe(false);
    expect(requirementCanBeRemoved(requirement({ source_policy_keys: ["staff_added", "policy"] }))).toBe(false);
    expect(requirementCanBeRemoved(requirement({ source_program_keys: ["program"] }))).toBe(false);
  });
  it("uses recoverable lifecycle actions with an auditable reason and never deletes documents", async () => {
    const api = vi.fn().mockResolvedValue({});
    await updateRequirementLifecycle(api, "profile", "custom/item", "remove", "  No longer requested  ");
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile/requirements/custom%2Fitem/lifecycle");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ action: "remove", reason: "No longer requested", confirmed: true });
    await updateRequirementLifecycle(api, "profile", "custom/item", "restore");
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({ action: "restore", reason: "", confirmed: true });
    expect(api.mock.calls.every(([, request]) => request.method === "POST")).toBe(true);
  });
});
