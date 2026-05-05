"use client";

// LEGACY SHIM — dev role switcher is removed in production.
//
// `useActiveProfile()` originally exposed a dev-mode "view as" persona that
// switched via a sidebar dropdown. The dropdown was removed (per design) so
// the production app reads the actual signed-in user via /auth/me.
//
// This module is kept as a compatibility shim while call sites migrate to
// `useCurrentUser()` directly. New code should NOT import from here.

import type { Role } from "@/lib/enums.generated";

export interface RoleProfile {
  email: string;
  name: string;
  role: Role | string;
  homeRail: boolean;
  canSee: { aiInbox: boolean; rewards: boolean; settings: boolean };
}

const CLIENT_FALLBACK: RoleProfile = {
  email: "anonymous@qc.local",
  name: "—",
  role: "super_admin",
  homeRail: true,
  canSee: { aiInbox: true, rewards: true, settings: true },
};

// Lazy require so this module stays SSR-safe.
let _cached: RoleProfile = CLIENT_FALLBACK;

/** Set by the AppShell once /auth/me resolves so legacy callers stay accurate. */
export function _setActiveProfileFromUser(user: { email: string; name: string; role: string } | null | undefined) {
  if (!user) {
    _cached = CLIENT_FALLBACK;
    return;
  }
  const role = user.role;
  _cached = {
    email: user.email,
    name: user.name,
    role,
    homeRail: role !== "client",
    canSee: {
      aiInbox: role === "super_admin" || role === "broker" || role === "loan_exec",
      rewards: role === "super_admin",
      settings: role === "super_admin",
    },
  };
}

/**
 * @deprecated Use `useCurrentUser()` from `src/hooks/useApi.ts` directly.
 * This stub returns the last-known user (set by AppShell) or a safe fallback.
 */
export function useActiveProfile(): RoleProfile {
  return _cached;
}
