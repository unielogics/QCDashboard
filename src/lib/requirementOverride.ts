export type RequirementOverrideDraft = { requirementKey: string; action: "waive" | "not_applicable"; reason: string; allPrograms: boolean; programKeys: string[] };

export function validRequirementOverride(draft: RequirementOverrideDraft): boolean {
  const length = draft.reason.trim().length;
  return length >= 8 && length <= 2000 && (draft.allPrograms || draft.programKeys.length > 0);
}

/** The API action remains `waive`; its persisted disposition is a server concern. */
export function requirementOverridePayload(draft: RequirementOverrideDraft) {
  if (!validRequirementOverride(draft)) throw new Error("Enter an audit reason between 8 and 2,000 characters and select the override scope.");
  return { action: draft.action, reason: draft.reason.trim(), all_programs: draft.allPrograms, program_keys: draft.allPrograms ? [] : [...new Set(draft.programKeys)] };
}
