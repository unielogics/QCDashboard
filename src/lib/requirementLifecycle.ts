import type { ApplicationProgramReadiness, ApplicationRequirement } from "./applicationProfile";
import type { AuthedApi } from "./worksheetApi";

export function requirementCanBeRemoved(requirement: ApplicationRequirement) {
  return requirement.can_remove ?? (requirement.source_policy_keys.includes("staff_added") && requirement.source_policy_keys.every((key) => key === "staff_added") && !requirement.source_program_keys?.length && !requirement.derived_required);
}
export function updateRequirementLifecycle(api: AuthedApi, profileId: string, requirementKey: string, action: "remove" | "restore", reason = "") {
  return api<ApplicationProgramReadiness>(`/application-profiles/${encodeURIComponent(profileId)}/requirements/${encodeURIComponent(requirementKey)}/lifecycle`, {
    method: "POST", body: JSON.stringify({ action, reason: reason.trim(), confirmed: true }),
  });
}
