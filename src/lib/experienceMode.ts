import type { Client, ClientExperienceMode } from "./types";

export type EffectiveExperienceMode = Exclude<ClientExperienceMode, "hybrid">;

export function deriveExperienceMode(c: Pick<Client, "client_experience_mode" | "broker_id">): EffectiveExperienceMode {
  const explicit = c.client_experience_mode;
  if (explicit === "guided" || explicit === "self_directed") return explicit;
  return c.broker_id ? "guided" : "self_directed";
}
