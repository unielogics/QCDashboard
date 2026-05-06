"use client";

// LEGACY SHIM — dev role switcher is removed in production.
//
// `useActiveProfile()` originally exposed a dev-mode "view as" persona that
// switched via a sidebar dropdown. The dropdown was removed (per design) so
// the production app reads the actual signed-in user via /auth/me.
//
// This module is kept as a compatibility shim while call sites migrate to
// `useCurrentUser()` directly. New code should NOT import from here.

import { create } from "zustand";
import type { Role } from "@/lib/enums.generated";

export interface RoleProfile {
  email: string;
  name: string;
  role: Role | string;
  homeRail: boolean;
  canSee: { aiInbox: boolean; rewards: boolean; settings: boolean };
}

// Pre-/auth/me fallback. Role MUST default to "client" (least-privileged) —
// historically this was "super_admin" which leaked operator chrome to anyone
// during the brief window before /auth/me resolved, and to any signed-out
// user. Real role flows in via _setActiveProfileFromUser() the moment
// useCurrentUser() returns.
const CLIENT_FALLBACK: RoleProfile = {
  email: "anonymous@qc.local",
  name: "—",
  role: "client",
  homeRail: false,
  canSee: { aiInbox: false, rewards: false, settings: false },
};

// Backed by a Zustand store so `useActiveProfile()` is an actual subscribing
// hook — when `_setActiveProfileFromUser()` swaps the profile (after
// /auth/me resolves), every page that read it re-renders with the new
// values. Previously `_cached` was a plain `let` and components never
// re-rendered after first paint; super-admins saw client chrome forever
// because the fallback was the first value they ever observed.
interface ProfileStore {
  profile: RoleProfile;
  setProfile: (p: RoleProfile) => void;
}

const useProfileStore = create<ProfileStore>((set) => ({
  profile: CLIENT_FALLBACK,
  setProfile: (p) => set({ profile: p }),
}));

/** Set by the AppShell once /auth/me resolves so legacy callers stay accurate. */
export function _setActiveProfileFromUser(
  user: { email: string; name: string; role: string } | null | undefined,
) {
  if (!user) {
    useProfileStore.getState().setProfile(CLIENT_FALLBACK);
    return;
  }
  const role = user.role;
  useProfileStore.getState().setProfile({
    email: user.email,
    name: user.name,
    role,
    homeRail: role !== "client",
    canSee: {
      aiInbox: role === "super_admin" || role === "broker" || role === "loan_exec",
      rewards: role === "super_admin",
      settings: role === "super_admin",
    },
  });
}

/**
 * @deprecated Use `useCurrentUser()` from `src/hooks/useApi.ts` directly.
 * This stub returns the last-known user (set by AppShell) or a safe fallback.
 *
 * Now backed by a Zustand store so it actually re-renders when the profile
 * updates. Was previously a non-subscribing wrapper around a `let` — that
 * meant pages held whatever value happened to be in the cache the first
 * time they rendered, which broke after we tightened the security default
 * to "client" (super-admins got stuck on client chrome forever).
 */
export function useActiveProfile(): RoleProfile {
  return useProfileStore((s) => s.profile);
}
