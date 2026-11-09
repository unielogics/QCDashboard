import { describe, expect, it } from "vitest";
import { requirementOverridePayload, validRequirementOverride, type RequirementOverrideDraft } from "../requirementOverride";

const draft: RequirementOverrideDraft = { requirementKey: "ytd_p_and_l_balance_sheet", action: "waive", reason: "  Reviewed and set aside for this program  ", allPrograms: false, programKeys: ["program-a"] };
describe("audited requirement override", () => {
  it("retains the public waive action and sends a trimmed reason with the chosen scope", () => {
    expect(requirementOverridePayload(draft)).toEqual({ action: "waive", reason: "Reviewed and set aside for this program", all_programs: false, program_keys: ["program-a"] });
    expect(requirementOverridePayload({ ...draft, action: "not_applicable", allPrograms: true })).toEqual({ action: "not_applicable", reason: "Reviewed and set aside for this program", all_programs: true, program_keys: [] });
    expect(draft.reason).toBe("  Reviewed and set aside for this program  ");
  });
  it("matches the server's reason bounds and prevents an empty program scope", () => {
    for (const invalid of [{ ...draft, reason: "short" }, { ...draft, reason: "x".repeat(2001) }, { ...draft, programKeys: [] }]) { expect(validRequirementOverride(invalid)).toBe(false); expect(() => requirementOverridePayload(invalid)).toThrow(); }
    expect(validRequirementOverride({ ...draft, reason: "x".repeat(2000) })).toBe(true);
  });
});
