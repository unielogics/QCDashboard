"use client";

// The debt schedule table's reads and its save.
//
// Its own file rather than another block in useApi.ts: that file is one of the
// busiest in the app and a review that only one panel uses should not widen it.
//
// The review and its summary are ONE query (same key, same fetch). A row that
// shows "7 lines read · 38 answers missing" and the panel it opens read the same
// cached answer, so opening the panel does not ask the server a second time.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import { financialDebtReviewSummary, readFinancialWorkspace } from "@/lib/financialWorkspaceApi";
import type { DebtScheduleReview, ReviewBody, ReviewResult } from "@/lib/debtReview";

export const debtReviewKey = (profileId: string | null | undefined) => ["debt-schedule-review", profileId] as const;

/** Fresh for half a minute, never refetched under someone typing (not on focus,
 *  not on reconnect), and refetched on mount only once it has gone stale. */
const SHARED = { staleTime: 30_000, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;

function useReviewQuery(profileId: string | null | undefined, enabled: boolean) {
  const api = useAuthedApi();
  return {
    queryKey: debtReviewKey(profileId),
    queryFn: () => api<DebtScheduleReview>(`/application-profiles/${profileId}/debt-schedule/review`),
    enabled: Boolean(profileId) && enabled,
    ...SHARED,
  };
}

/** Every line the file's schedule could carry. */
export function useDebtScheduleReview(profileId: string | null | undefined, enabled = true) {
  return useQuery(useReviewQuery(profileId, enabled));
}

export type DebtScheduleReviewSummary = ReturnType<typeof financialDebtReviewSummary> & { error?: string };

const NONE: DebtScheduleReviewSummary = { read: 0, onSchedule: 0, removed: 0, missingAnswers: 0, hasSource: false, loading: false, missingFields: [], reason: null, draftComplete: false, publishedComplete: false, publishedRows: 0, publishNeeded: false, hasDraft: false };

const workspaceQuery = (api: ReturnType<typeof useAuthedApi>, profileId: string | null | undefined, enabled: boolean) => ({
  queryKey: ["financial-workspace-summary", profileId],
  queryFn: () => readFinancialWorkspace(api, profileId!, "debt_schedule"),
  enabled: Boolean(profileId) && enabled,
  ...SHARED,
});

/** The embedded read-back and its header observe the same draft snapshot. */
export function useDebtScheduleWorkspace(profileId: string | null | undefined, enabled = true) {
  const api = useAuthedApi();
  return useQuery(workspaceQuery(api, profileId, enabled));
}

/** The debt schedule in one line for a row that wants to nudge: how many lines
 *  were read off the file and how many answers are still missing. The same
 *  query as `useDebtScheduleReview`, so it costs nothing once the panel is open
 *  and the panel costs nothing once it has run. */
export function useDebtScheduleReviewSummary(profileId: string | null | undefined, enabled = true): DebtScheduleReviewSummary {
  const api = useAuthedApi();
  const query = useQuery({
    ...workspaceQuery(api, profileId, enabled),
    select: financialDebtReviewSummary,
  });
  if (query.isLoading && enabled && profileId) return { ...NONE, loading: true };
  if (query.error) return { ...NONE, error: query.error instanceof Error ? query.error.message : "The debt schedule could not be loaded." };
  return query.data ?? NONE;
}

/** Saves the desk's decisions, then makes every surface that shows the
 *  schedule read it again: the cockpit, the advances, the evidence and the
 *  request rows, the "what was filled in" read-backs, and the review itself. */
export function useApplyDebtScheduleReview(profileId: string | null | undefined) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewBody) =>
      api<ReviewResult>(`/application-profiles/${profileId}/debt-schedule/review`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (result) => {
      // The save answers with the review as it now stands: that is the cache, so the
      // panel and any row's summary update with no second request.
      queryClient.setQueryData(debtReviewKey(profileId), result.review);
      // Filing the schedule moves the checklist row (the readiness and the evidence), the
      // request rows and the "what was filled in" read-backs.
      for (const key of ["financial-cockpit", "advances", "application-evidence-workspace", "application-collection-tasks", "form-answers"]) {
        void queryClient.invalidateQueries({ queryKey: [key, profileId] });
      }
    },
  });
}

/** What the email-link route answers: whether the provider took the email, who it
 *  went to (masked) and, when it did not go out, why. */
export type FormLinkReceipt = {
  id: string;
  status: string;
  channel: string;
  recipient_masked: string | null;
  provider_accepted: boolean;
  detail: string | null;
};

/** Emails the client the link that fills the debt schedule in, and puts the
 *  schedule on their checklist. A second send within two minutes returns the
 *  first; a file with no verified client email answers 409. */
export function useEmailDebtScheduleLink(profileId: string | null | undefined) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<FormLinkReceipt>(`/application-profiles/${profileId}/financial-forms/debt_schedule/email-link`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["financial-cockpit", profileId] });
      void queryClient.invalidateQueries({ queryKey: ["application-evidence-workspace", profileId] });
      void queryClient.invalidateQueries({ queryKey: ["application-collection-tasks", profileId] });
    },
  });
}
