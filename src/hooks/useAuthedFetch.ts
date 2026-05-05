"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";
import { api, type ApiOptions } from "@/lib/api";
import { useActiveProfile } from "@/store/role";

/**
 * Returns a fetcher that attaches the Clerk JWT when signed in.
 *
 * In dev mode (no Clerk session OR Clerk hasn't issued a token yet) it falls
 * back to the X-Dev-User header, which the backend uses to resolve a seeded
 * user when CLERK_SECRET_KEY is unset.
 */
export function useAuthedFetch() {
  const { getToken, isSignedIn } = useAuth();
  const devUser = useActiveProfile().email;

  return useCallback(
    async <T>(path: string, opts: Omit<ApiOptions, "authToken" | "devUser"> = {}): Promise<T> => {
      const token = isSignedIn ? await getToken() : null;
      return api<T>(path, {
        ...opts,
        ...(token ? { authToken: token } : { devUser }),
      });
    },
    [getToken, isSignedIn, devUser]
  );
}
