"use client";

import { useMemo, useRef } from "react";
import { useAuthedApi, useCurrentUser, useDevUser } from "@/hooks/useApi";
import { ApiError, apiBase, type ApiOptions } from "@/lib/api";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { staffPlanTransport, type PlanTransport } from "@/lib/earningsPlan/api";

/**
 * The plan's API as the signed-in console user reaches it; null until the sign-in is known.
 *
 * The transport reads its credentials when it calls and stays the same object
 * for a file and a user, so a refreshed sign-in token never reloads a plan
 * that is being edited.
 */
export function useStaffPlanTransport(profileId: string): PlanTransport | null {
  const api = useAuthedApi();
  const actor = useCurrentUser();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = useDevUser();
  const access = useRef({ api, getToken, isSignedIn, devUser });
  access.current = { api, getToken, isSignedIn, devUser };
  const authScope = actor.authReady !== false ? actor.authScope ?? actor.data?.id ?? null : null;
  return useMemo(() => {
    if (!authScope) return null;
    return staffPlanTransport({
      profileId, authScope: String(authScope),
      api: <T,>(path: string, options?: ApiOptions) => access.current.api<T>(path, options),
      // The PDF route returns bytes, so it is fetched directly with the same credentials.
      fetchBlob: async path => {
        const { getToken: token, isSignedIn: signedIn, devUser: dev } = access.current;
        const bearer = signedIn ? await token() : null;
        const response = await fetch(`${apiBase}/api/v1${path}`, { cache: "no-store", headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(dev ? { "X-Dev-User": dev } : {}) } });
        if (!response.ok) throw new ApiError(response.status, "This version's PDF could not be opened. Try again.");
        return { blob: await response.blob(), filename: /filename="?([^";]+)"?/i.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? null };
      },
    });
  }, [authScope, profileId]);
}
