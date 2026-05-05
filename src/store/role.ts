"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/enums.generated";

// Dev "View as" — maps to seeded users by email
export interface RoleProfile {
  email: string;
  name: string;
  role: Role;
  homeRail: boolean;
  canSee: { aiInbox: boolean; rewards: boolean; settings: boolean };
}

export const ROLE_PROFILES: Record<string, RoleProfile> = {
  admin: {
    email: "admin@qc.dev",
    name: "Asha Patel",
    role: "super_admin",
    homeRail: true,
    canSee: { aiInbox: true, rewards: true, settings: true },
  },
  ae: {
    email: "daniel@qc.dev",
    name: "Daniel Reyes",
    role: "broker",
    homeRail: true,
    canSee: { aiInbox: true, rewards: false, settings: false },
  },
  uw: {
    email: "priya@qc.dev",
    name: "Priya Singh",
    role: "loan_exec",
    homeRail: true,
    canSee: { aiInbox: true, rewards: false, settings: false },
  },
  client: {
    email: "marcus@qc.dev",
    name: "Marcus Holloway",
    role: "client",
    homeRail: false,
    canSee: { aiInbox: false, rewards: false, settings: false },
  },
};

interface RoleStore {
  activeKey: keyof typeof ROLE_PROFILES;
  setActive: (k: keyof typeof ROLE_PROFILES) => void;
}

export const useRole = create<RoleStore>()(
  persist(
    (set) => ({
      activeKey: "ae",
      setActive: (k) => set({ activeKey: k }),
    }),
    { name: "qc.role" }
  )
);

export function useActiveProfile(): RoleProfile {
  const key = useRole((s) => s.activeKey);
  return ROLE_PROFILES[key];
}
