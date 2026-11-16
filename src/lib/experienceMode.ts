import type { Client, ClientExperienceMode } from "./types";

export type EffectiveExperienceMode = Exclude<ClientExperienceMode, "hybrid">;

export function deriveExperienceMode(c: Pick<Client, "client_experience_mode" | "broker_id">): EffectiveExperienceMode {
  const explicit = c.client_experience_mode;
  if (explicit === "guided" || explicit === "self_directed") return explicit;
  return c.broker_id ? "guided" : "self_directed";
}

// Why a client's mode is what it is, and who fixed it there, in the page's
// words. The record holds more values than the agent's CRM ever writes: a
// client made by a file carries the kind of intake as its reason and "firm"
// as who locked it. A value with no word here is shown as written, because
// the alternative is the page printing "Locked by undefined".
const REASON_LABEL: Record<string, string> = {
  agent_referred: "Agent-referred",
  agent_invited: "Invited by an agent",
  self_signup: "Self sign-up",
  funding_team_required: "Funding Team required",
  underwriting_conditions: "Underwriting conditions",
  user_preference: "Manual selection",
  super_admin_override: "Super Admin override",
  ai_intake: "Opened from an AI intake file",
  dealer_ai_intake: "Opened from a dealer intake file",
  main_street_intake: "Opened from a Main Street intake file",
  mca_funding_intake: "Opened from an MCA funding intake",
  mca_refinance: "Opened from an MCA refinance file",
  funding_review: "Opened from a funding review file",
  foreclosure_rescue: "Opened from a foreclosure rescue file",
};

const LOCKED_BY_LABEL: Record<string, string> = {
  system: "system default",
  agent: "Agent",
  client: "the client",
  firm: "the firm",
  funding_team: "Funding Team",
  super_admin: "Super Admin",
};

function asWritten(value: string): string {
  return value.replace(/_/g, " ");
}

export function experienceReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "";
  return REASON_LABEL[reason] ?? asWritten(reason);
}

export function experienceLockLabel(lockedBy: string | null | undefined): string {
  if (!lockedBy) return "";
  return LOCKED_BY_LABEL[lockedBy] ?? asWritten(lockedBy);
}
