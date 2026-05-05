"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { api, type ApiOptions } from "@/lib/api";
import { useActiveProfile } from "@/store/role";
import type { User } from "@/lib/types";
import type {
  Activity,
  AIChatRequest,
  AIChatResponse,
  AITask,
  AITaskDecisionRequest,
  AppSettingsRead,
  AppSettingsUpdate,
  Broker,
  CalendarEvent,
  Client,
  CreditPull,
  DashboardReport,
  Document,
  DocumentUploadInitResponse,
  EmailDraft,
  EmailDraftDecisionRequest,
  GroupedResults,
  InboundEmailRequest,
  InboundEmailResponse,
  Loan,
  LoanParticipant,
  LoanParticipantCreate,
  LoanParticipantUpdate,
  Message,
  MetaResponse,
  RateSKU,
  RecalcResponse,
  SmartIntakePayload,
  SmartIntakeResponse,
  StageTransitionRequest,
  SummaryRefreshResponse,
  UserRow,
} from "@/lib/types";
import type { CalendarEventKind, AITaskPriority, MessageFrom, LoanType, PropertyType } from "@/lib/enums.generated";

function useDevUser(): string {
  return useActiveProfile().email;
}

/**
 * Authenticated fetch wrapper.
 *
 * In production the backend has CLERK_SECRET_KEY set and rejects any request
 * without a valid Bearer token. This hook fetches the current Clerk JWT via
 * @clerk/nextjs's `useAuth().getToken()` for every request, so each call
 * always carries a fresh token. We also still send the legacy `X-Dev-User`
 * header — the backend ignores it whenever Clerk is configured, but it
 * keeps local dev (no Clerk key) working end-to-end.
 */
function useAuthedApi() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const devUser = useDevUser();

  return useCallback(
    async function authedApi<T>(path: string, opts: ApiOptions = {}): Promise<T> {
      let token: string | null = null;
      if (isLoaded && isSignedIn) {
        try {
          token = await getToken();
        } catch {
          token = null;
        }
      }
      return api<T>(path, {
        ...opts,
        devUser: opts.devUser ?? devUser,
        authToken: opts.authToken ?? token ?? undefined,
      });
    },
    [getToken, isLoaded, isSignedIn, devUser]);
}

// /auth/me — the canonical "who am I?" endpoint. Drives the sidebar avatar,
// the role gates throughout the UI, and the audit-log actor for outbound
// mutations. Returns User | null while loading.
export function useCurrentUser() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const { isLoaded, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["auth-me", isSignedIn],
    queryFn: () => apiCall<User>("/auth/me"),
    staleTime: 5 * 60 * 1000,
    retry: false, // 401s should not retry
    // Don't fire until Clerk has resolved the auth state — otherwise we send
    // a token-less request and immediately 401.
    enabled: isLoaded,
  });
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useLoans() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["loans", devUser],
    queryFn: () => apiCall<Loan[]>("/loans"),
  });
}

export function useLoan(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["loan", loanId, devUser],
    queryFn: () => apiCall<Loan>(`/loans/${loanId}`),
    enabled: !!loanId,
  });
}

export function useClients() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["clients", devUser],
    queryFn: () => apiCall<Client[]>("/clients"),
  });
}

export function useClient(clientId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["client", clientId, devUser],
    queryFn: () => apiCall<Client>(`/clients/${clientId}`),
    enabled: !!clientId,
  });
}

export function useAITasks() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["aiTasks", devUser],
    queryFn: () => apiCall<AITask[]>("/ai-tasks"),
  });
}

export function useDocuments(loanId?: string) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["documents", loanId, devUser],
    queryFn: () => apiCall<Document[]>(loanId ? `/documents?loan_id=${loanId}` : "/documents"),
  });
}

export function useMessages(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["messages", loanId, devUser],
    queryFn: () => apiCall<Message[]>(`/messages?loan_id=${loanId}`),
    enabled: !!loanId,
  });
}

export function useCalendar() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["calendar", devUser],
    queryFn: () => apiCall<CalendarEvent[]>("/calendar"),
  });
}

export function useBrokerLeaderboard() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["leaderboard", devUser],
    queryFn: () => apiCall<Broker[]>("/brokers/leaderboard"),
  });
}

export function useBrokers() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["brokers", devUser],
    queryFn: () => apiCall<Broker[]>("/brokers"),
  });
}

export function useMeta() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["meta", devUser],
    queryFn: () => apiCall<MetaResponse>("/meta"),
    staleTime: 5 * 60 * 1000, // 5 min — enums rarely change
  });
}

export function useGlobalSearch(query: string) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["search", query, devUser],
    queryFn: () => apiCall<GroupedResults[]>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
  });
}

export function useCurrentCredit(clientId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["credit", clientId, devUser],
    queryFn: () => apiCall<CreditPull | null>(`/credit/current?client_id=${clientId}`),
    enabled: !!clientId,
  });
}

export function useLoanActivity(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["loanActivity", loanId, devUser],
    queryFn: () => apiCall<Activity[]>(`/loans/${loanId}/activity`),
    enabled: !!loanId,
  });
}

export function useRates() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["rates", devUser],
    queryFn: () => apiCall<RateSKU[]>("/rates"),
    staleTime: 60 * 1000,
  });
}

export function useDashboardReport() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["dashboard-report", devUser],
    queryFn: () => apiCall<DashboardReport>("/reports/dashboard"),
    staleTime: 30 * 1000,
  });
}

export function useSettings() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["settings", devUser],
    queryFn: () => apiCall<AppSettingsRead>("/settings"),
    staleTime: 30 * 1000,
  });
}

export function useUpdateSettings() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["settings"]
    mutationFn: (patch: AppSettingsUpdate) =>
      apiCall<AppSettingsRead>("/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => {
      qc.setQueryData(["settings", devUser], data);
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useUsers() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["users", devUser],
    queryFn: () => apiCall<UserRow[]>("/users"),
  });
}

export function useAIChat() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: (payload: AIChatRequest) =>
      apiCall<AIChatResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

// ── Fintech Orchestrator: per-loan participants ────────────────────────────

export function useLoanParticipants(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["loanParticipants", loanId, devUser],
    queryFn: () => apiCall<LoanParticipant[]>(`/loans/${loanId}/participants`),
    enabled: !!loanId,
  });
}

export function useCreateParticipant() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loanParticipants", loanId]
    mutationFn: ({ loanId, ...payload }: { loanId: string } & LoanParticipantCreate) =>
      apiCall<LoanParticipant>(`/loans/${loanId}/participants`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loanParticipants", vars.loanId] }),
  });
}

export function useUpdateParticipant() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loanParticipants", loanId]
    mutationFn: ({ loanId, participantId, ...patch }: { loanId: string; participantId: string } & LoanParticipantUpdate) =>
      apiCall<LoanParticipant>(`/loans/${loanId}/participants/${participantId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loanParticipants", vars.loanId] }),
  });
}

export function useDeleteParticipant() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, participantId }: { loanId: string; participantId: string }) =>
      apiCall<void>(`/loans/${loanId}/participants/${participantId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loanParticipants", vars.loanId] }),
  });
}

// ── Living Loan File: refresh + simulated inbound ──────────────────────────

export function useRefreshLoanSummary() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loan", loanId], ["loanActivity", loanId]
    mutationFn: ({ loanId }: { loanId: string }) =>
      apiCall<SummaryRefreshResponse>(`/loans/${loanId}/summary/refresh`, {
        method: "POST",
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loanActivity", vars.loanId] });
    },
  });
}

export function useSimulateInboundEmail() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, ...payload }: { loanId: string } & InboundEmailRequest) =>
      apiCall<InboundEmailResponse>(`/loans/${loanId}/inbound-email`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loanActivity", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["emailDrafts", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["aiTasks"] });
    },
  });
}

// ── Email Drafts (broker-approval inbox) ───────────────────────────────────

export function useEmailDrafts(loanId?: string | null) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["emailDrafts", loanId, devUser],
    queryFn: () => apiCall<EmailDraft[]>(loanId ? `/email-drafts?loan_id=${loanId}` : "/email-drafts"),
  });
}

export function useEmailDraftDecision() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, ...payload }: { draftId: string } & EmailDraftDecisionRequest) =>
      apiCall<EmailDraft>(`/email-drafts/${draftId}/decision`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["emailDrafts"] });
      qc.invalidateQueries({ queryKey: ["loan", data.loan_id] });
      qc.invalidateQueries({ queryKey: ["loanActivity", data.loan_id] });
    },
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useRecalc() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loan", loanId]
    mutationFn: ({
      loanId,
      discount_points,
      loan_amount,
      base_rate,
    }: {
      loanId: string;
      discount_points: number;
      loan_amount?: number;
      base_rate?: number;
    }) =>
      apiCall<RecalcResponse>(`/loans/${loanId}/recalc`, {
        method: "POST",
        body: JSON.stringify({ discount_points, loan_amount, base_rate }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loan", vars.loanId] }),
  });
}

export function useCreateIntake() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loans"]
    mutationFn: (payload: SmartIntakePayload) =>
      apiCall<SmartIntakeResponse>("/intake", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useAITaskDecision() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["aiTasks"], ["loan", task.loan_id]
    mutationFn: ({ taskId, decision, edited_payload, loanId }: { taskId: string; decision: AITaskDecisionRequest["decision"]; edited_payload?: Record<string, unknown> | null; loanId?: string | null }) =>
      apiCall<AITask>(`/ai-tasks/${taskId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, edited_payload }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["aiTasks"] });
      if (vars.loanId) qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
    },
  });
}

export function useSendMessage() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["messages", loanId]
    mutationFn: ({ loan_id, body, from_role, is_draft }: { loan_id: string; body: string; from_role: MessageFrom; is_draft?: boolean }) =>
      apiCall<Message>("/messages", {
        method: "POST",
        body: JSON.stringify({ loan_id, body, from_role, is_draft: !!is_draft }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["messages", vars.loan_id] }),
  });
}

export function useRequestDocument() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["documents", loan_id], ["loan", loan_id]
    mutationFn: ({ loan_id, name, category, due_in_days }: { loan_id: string; name: string; category?: string; due_in_days?: number }) =>
      apiCall<Document>("/documents/request", {
        method: "POST",
        body: JSON.stringify({ loan_id, name, category, due_in_days }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["documents", vars.loan_id] });
      qc.invalidateQueries({ queryKey: ["documents", undefined] });
      qc.invalidateQueries({ queryKey: ["loan", vars.loan_id] });
    },
  });
}

export function useUploadDocument() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["documents", loan_id]
    mutationFn: async ({ loan_id, file, name, category }: { loan_id: string; file: File; name?: string; category?: string }) => {
      const init = await apiCall<DocumentUploadInitResponse>("/documents/upload-init", {
        method: "POST",
        body: JSON.stringify({
          loan_id,
          name: name ?? file.name,
          content_type: file.type || "application/octet-stream",
          category,
        }),
      });
      // Dev path: backend returns null upload_url when AWS keys are absent.
      if (init.upload_url) {
        const res = await fetch(init.upload_url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            // Mandatory — presigned URL was signed with AES256 SSE.
            "x-amz-server-side-encryption": "AES256",
          },
        });
        if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`);
      }
      return init;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["documents", vars.loan_id] });
      qc.invalidateQueries({ queryKey: ["documents", undefined] });
    },
  });
}

export function useCreateEvent() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["calendar"]
    mutationFn: (payload: {
      loan_id?: string | null;
      kind: CalendarEventKind;
      title: string;
      who?: string | null;
      starts_at: string; // ISO datetime
      duration_min?: number | null;
      priority?: AITaskPriority | null;
    }) =>
      apiCall<CalendarEvent>("/calendar", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useStageTransition() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loan", loanId], ["loans"], ["loanActivity", loanId]
    mutationFn: ({ loanId, ...body }: { loanId: string } & StageTransitionRequest) =>
      apiCall<Loan>(`/loans/${loanId}/stage`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["loanActivity", vars.loanId] });
    },
  });
}

export function useUpdateLoan() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loan", loanId], ["loans"]
    mutationFn: ({ loanId, ...patch }: { loanId: string } & Partial<Loan>) =>
      apiCall<Loan>(`/loans/${loanId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useCreateClient() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["clients"]
    mutationFn: (payload: { name: string; email?: string; phone?: string; city?: string; referral_source?: string; broker_id?: string }) =>
      apiCall<Client>("/clients", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["client", clientId], ["clients"]
    mutationFn: ({ clientId, ...patch }: { clientId: string } & Partial<Client>) =>
      apiCall<Client>(`/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useCreditPull() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["credit", client_id]
    mutationFn: (payload: {
      client_id: string;
      legal_first_name: string;
      legal_last_name: string;
      dob: string;
      street: string;
      city: string;
      state: string;
      zip: string;
      phone: string;
      email: string;
      last4_ssn: string;
      fcra_consent: boolean;
    }) =>
      apiCall<CreditPull>("/credit/pull", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["credit", vars.client_id] }),
  });
}
