"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthedApi, useDevUser } from "@/hooks/useApi";
import { useConsoleAuth } from "@/lib/consoleAuth";

export type StoredSignature = {
  id: string;
  subject_type: string;
  subject_id: string | null;
  typed_name: string;
  title: string | null;
  source: string;
  adopted_at: string;
  adopted_by_user_id: string | null;
  consent_version: string | null;
  revoked_at: string | null;
  preview_url: string | null;
};

export type StoredSignatureState = {
  signature: StoredSignature | null;
  consent_text: string;
  consent_version: string;
};

export const MY_SIGNATURE_QUERY_KEY = ["me", "signature"] as const;

export function mySignatureQueryKey(authUserId: string | null | undefined, devUser: string) {
  return [...MY_SIGNATURE_QUERY_KEY, authUserId || "signed-out", devUser] as const;
}

/**
 * The signed-in employee's adopted signature. This is intentionally distinct
 * from the firm's fallback letterhead signature: documents issued by a person
 * should preview the same signature the backend places on that person's behalf.
 */
export function useMySignature() {
  const apiCall = useAuthedApi();
  const { isLoaded, isSignedIn, userId } = useConsoleAuth();
  const devUser = useDevUser();
  const queryKey = mySignatureQueryKey(userId, devUser);
  const query = useQuery({
    queryKey,
    queryFn: () => apiCall<StoredSignatureState>("/me/signature"),
    staleTime: 60 * 1000,
    retry: false,
    enabled: isLoaded && isSignedIn === true,
  });
  return { ...query, queryKey };
}
