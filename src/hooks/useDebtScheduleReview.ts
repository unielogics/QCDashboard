"use client";

// The debt schedule line review's reads and its save.
//
// Its own file rather than another block in useApi.ts: that file is one of the
// busiest in the app and a review that is only used by one drawer should not
// widen it.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import type { DebtScheduleReview, ReviewLineWrite, ReviewResult } from "@/lib/debtReview";

const reviewKey = (profileId: string | null | undefined) => ["debt-schedule-review", profileId] as const;

/** Every line the file's schedule could carry. Read fresh each time the review
 *  opens and never refetched underneath the person typing in it. */
export function useDebtScheduleReview(profileId: string | null | undefined, enabled = true) {
  const api = useAuthedApi();
  return useQuery({
    queryKey: reviewKey(profileId),
    queryFn: () => api<DebtScheduleReview>(`/application-profiles/${profileId}/debt-schedule/review`),
    enabled: Boolean(profileId) && enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Saves the desk's decisions, then makes every surface that shows the
 *  schedule read it again: the cockpit, the advances, the evidence and the
 *  request rows, the "what was filled in" read-backs. */
export function useApplyDebtScheduleReview(profileId: string | null | undefined) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { lines: ReviewLineWrite[] }) =>
      api<ReviewResult>(`/application-profiles/${profileId}/debt-schedule/review`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      for (const key of [
        "financial-cockpit",
        "advances",
        "application-evidence-workspace",
        "application-collection-tasks",
        "form-answers",
        "debt-schedule-review",
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key, profileId] });
      }
    },
  });
}
