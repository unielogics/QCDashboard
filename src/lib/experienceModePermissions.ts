import type { Client, User } from "./types";

export interface ExperienceModePermission {
  canEdit: boolean;
  canOverrideLock: boolean;
}

const HARD_LOCKS = new Set(["funding_team", "super_admin"]);

export function canEditExperienceMode(user: User | null | undefined, client: Pick<Client, "broker_id" | "client_experience_mode_locked_by">): ExperienceModePermission {
  if (!user) return { canEdit: false, canOverrideLock: false };

  if (user.role === "super_admin") return { canEdit: true, canOverrideLock: true };
  if (user.role === "loan_exec") return { canEdit: true, canOverrideLock: true };

  if (user.role === "broker") {
    const owns = !!client.broker_id && client.broker_id === user.id;
    const locked = client.client_experience_mode_locked_by;
    const blockedByHardLock = locked != null && HARD_LOCKS.has(locked);
    return { canEdit: owns && !blockedByHardLock, canOverrideLock: false };
  }

  return { canEdit: false, canOverrideLock: false };
}
