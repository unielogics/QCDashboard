"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { fileAuthScope } from "@/lib/fileOpening";
import { checkedPackageArtifacts, packageArtifactPath, type PackageArtifactsSnapshot } from "@/lib/packageArtifacts";
import { marketplaceRefreshPending } from "@/lib/marketplaceRefresh";

/** Only saved artifact metadata changes here; no File reload, editor state or generation write. */
export function usePackageArtifacts(intakeId: string | undefined, visible: boolean, sourceRevision: string) {
  const auth = useConsoleAuth(), scope = fileAuthScope(auth);
  const enabled = Boolean(intakeId && visible && auth.isLoaded && auth.isSignedIn && auth.userId);
  const identity = `${scope}:${intakeId}`, active = useRef(identity); active.current = identity;
  const query = useQuery({ queryKey: ["file-package-artifacts", scope, intakeId], enabled, retry: false, staleTime: 0,
    queryFn: async ({ signal }) => {
      const token = await auth.getToken();
      if (signal.aborted || active.current !== identity) throw new Error("The active file changed.");
      const result = checkedPackageArtifacts(await api<PackageArtifactsSnapshot>(packageArtifactPath(intakeId!), { authToken: token ?? undefined, signal }), intakeId!);
      if (signal.aborted || active.current !== identity) throw new Error("The active file changed.");
      return result;
    },
    refetchInterval: state => marketplaceRefreshPending(state.state.data?.refresh) ? 1500 : 15_000,
    refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  });
  const refetch = query.refetch;
  const previousSource = useRef({ identity, revision: sourceRevision });
  useEffect(() => {
    const previous = previousSource.current; previousSource.current = { identity, revision: sourceRevision };
    if (enabled && previous.identity === identity && previous.revision !== sourceRevision) void refetch();
  }, [enabled, identity, sourceRevision, refetch]);
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  return { snapshot: enabled && !denied && query.data?.intake_id === intakeId ? query.data : undefined, denied, error: query.error, checking: query.isFetching, checkedAt: query.dataUpdatedAt, check: () => refetch(), enabled };
}
