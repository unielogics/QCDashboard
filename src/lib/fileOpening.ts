/** In-memory file data belongs to one authenticated session and organisation. */
export function fileAuthScope(auth: { isLoaded?: boolean; isSignedIn?: boolean; userId?: string | null; sessionId?: string | null; orgId?: string | null }, qaIdentity?: string | null): string {
  if (!auth.isLoaded) return "auth-pending";
  if (!auth.isSignedIn || !auth.userId) return "signed-out";
  return JSON.stringify([auth.userId, auth.sessionId ?? null, auth.orgId ?? null, qaIdentity ?? null]);
}

export function fileDetailKey(scope: string, id: string | null, derived = false) {
  return ["lead-file", scope, id, derived ? "analysis" : "facts"] as const;
}

export function fileDetailPath(id: string, derived = false): string {
  return `/admin/ai-underwriter-leads/${encodeURIComponent(id)}?include_derived=${derived}`;
}

export function needsFullFileAnalysis(section: string): boolean {
  return section === "review" || section === "package";
}

/** Prefix invalidation refreshes both representations without mixing them. */
export function clientTermsSummaryKey(profileId: string | null | undefined) {
  return ["application-client-terms", profileId, "summary"] as const;
}
