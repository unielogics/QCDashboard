"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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

// /auth/me — the canonical "who am I?" endpoint. Drives the sidebar avatar,
// the role gates throughout the UI, and the audit-log actor for outbound
// mutations. Returns User | null while loading.
export function useCurrentUser() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["auth-me", devUser],
    queryFn: () => api<User>("/auth/me", { devUser }),
    staleTime: 5 * 60 * 1000,
    retry: false, // 401s should not retry
  });
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useLoans() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["loans", devUser],
    queryFn: () => api<Loan[]>("/loans", { devUser }),
  });
}

export function useLoan(loanId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["loan", loanId, devUser],
    queryFn: () => api<Loan>(`/loans/${loanId}`, { devUser }),
    enabled: !!loanId,
  });
}

export function useClients() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["clients", devUser],
    queryFn: () => api<Client[]>("/clients", { devUser }),
  });
}

export function useClient(clientId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["client", clientId, devUser],
    queryFn: () => api<Client>(`/clients/${clientId}`, { devUser }),
    enabled: !!clientId,
  });
}

export function useAITasks() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["aiTasks", devUser],
    queryFn: () => api<AITask[]>("/ai-tasks", { devUser }),
  });
}

export function useDocuments(loanId?: string) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["documents", loanId, devUser],
    queryFn: () => api<Document[]>(loanId ? `/documents?loan_id=${loanId}` : "/documents", { devUser }),
  });
}

export function useMessages(loanId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["messages", loanId, devUser],
    queryFn: () => api<Message[]>(`/messages?loan_id=${loanId}`, { devUser }),
    enabled: !!loanId,
  });
}

export function useCalendar() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["calendar", devUser],
    queryFn: () => api<CalendarEvent[]>("/calendar", { devUser }),
  });
}

export function useBrokerLeaderboard() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["leaderboard", devUser],
    queryFn: () => api<Broker[]>("/brokers/leaderboard", { devUser }),
  });
}

export function useBrokers() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["brokers", devUser],
    queryFn: () => api<Broker[]>("/brokers", { devUser }),
  });
}

export function useMeta() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["meta", devUser],
    queryFn: () => api<MetaResponse>("/meta", { devUser }),
    staleTime: 5 * 60 * 1000, // 5 min — enums rarely change
  });
}

export function useGlobalSearch(query: string) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["search", query, devUser],
    queryFn: () => api<GroupedResults[]>(`/search?q=${encodeURIComponent(query)}`, { devUser }),
    enabled: query.trim().length >= 2,
  });
}

export function useCurrentCredit(clientId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["credit", clientId, devUser],
    queryFn: () => api<CreditPull | null>(`/credit/current?client_id=${clientId}`, { devUser }),
    enabled: !!clientId,
  });
}

export function useLoanActivity(loanId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["loanActivity", loanId, devUser],
    queryFn: () => api<Activity[]>(`/loans/${loanId}/activity`, { devUser }),
    enabled: !!loanId,
  });
}

export function useRates() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["rates", devUser],
    queryFn: () => api<RateSKU[]>("/rates", { devUser }),
    staleTime: 60 * 1000,
  });
}

export function useDashboardReport() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["dashboard-report", devUser],
    queryFn: () => api<DashboardReport>("/reports/dashboard", { devUser }),
    staleTime: 30 * 1000,
  });
}

export function useSettings() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["settings", devUser],
    queryFn: () => api<AppSettingsRead>("/settings", { devUser }),
    staleTime: 30 * 1000,
  });
}

export function useUpdateSettings() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["settings"]
    mutationFn: (patch: AppSettingsUpdate) =>
      api<AppSettingsRead>("/settings", {
        method: "PATCH",
        devUser,
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
  return useQuery({
    queryKey: ["users", devUser],
    queryFn: () => api<UserRow[]>("/users", { devUser }),
  });
}

export function useAIChat() {
  const devUser = useDevUser();
  return useMutation({
    mutationFn: (payload: AIChatRequest) =>
      api<AIChatResponse>("/ai/chat", {
        method: "POST",
        devUser,
        body: JSON.stringify(payload),
      }),
  });
}

// ── Fintech Orchestrator: per-loan participants ────────────────────────────

export function useLoanParticipants(loanId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["loanParticipants", loanId, devUser],
    queryFn: () => api<LoanParticipant[]>(`/loans/${loanId}/participants`, { devUser }),
    enabled: !!loanId,
  });
}

export function useCreateParticipant() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loanParticipants", loanId]
    mutationFn: ({ loanId, ...payload }: { loanId: string } & LoanParticipantCreate) =>
      api<LoanParticipant>(`/loans/${loanId}/participants`, {
        method: "POST",
        devUser,
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loanParticipants", vars.loanId] }),
  });
}

export function useUpdateParticipant() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loanParticipants", loanId]
    mutationFn: ({ loanId, participantId, ...patch }: { loanId: string; participantId: string } & LoanParticipantUpdate) =>
      api<LoanParticipant>(`/loans/${loanId}/participants/${participantId}`, {
        method: "PATCH",
        devUser,
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loanParticipants", vars.loanId] }),
  });
}

export function useDeleteParticipant() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, participantId }: { loanId: string; participantId: string }) =>
      api<void>(`/loans/${loanId}/participants/${participantId}`, {
        method: "DELETE",
        devUser,
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loanParticipants", vars.loanId] }),
  });
}

// ── Living Loan File: refresh + simulated inbound ──────────────────────────

export function useRefreshLoanSummary() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loan", loanId], ["loanActivity", loanId]
    mutationFn: ({ loanId }: { loanId: string }) =>
      api<SummaryRefreshResponse>(`/loans/${loanId}/summary/refresh`, {
        method: "POST",
        devUser,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loanActivity", vars.loanId] });
    },
  });
}

export function useSimulateInboundEmail() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, ...payload }: { loanId: string } & InboundEmailRequest) =>
      api<InboundEmailResponse>(`/loans/${loanId}/inbound-email`, {
        method: "POST",
        devUser,
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
  return useQuery({
    queryKey: ["emailDrafts", loanId, devUser],
    queryFn: () => api<EmailDraft[]>(loanId ? `/email-drafts?loan_id=${loanId}` : "/email-drafts", { devUser }),
  });
}

export function useEmailDraftDecision() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, ...payload }: { draftId: string } & EmailDraftDecisionRequest) =>
      api<EmailDraft>(`/email-drafts/${draftId}/decision`, {
        method: "POST",
        devUser,
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
      api<RecalcResponse>(`/loans/${loanId}/recalc`, {
        method: "POST",
        devUser,
        body: JSON.stringify({ discount_points, loan_amount, base_rate }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loan", vars.loanId] }),
  });
}

export function useCreateIntake() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loans"]
    mutationFn: (payload: SmartIntakePayload) =>
      api<SmartIntakeResponse>("/intake", {
        method: "POST",
        devUser,
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
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["aiTasks"], ["loan", task.loan_id]
    mutationFn: ({ taskId, decision, edited_payload, loanId }: { taskId: string; decision: AITaskDecisionRequest["decision"]; edited_payload?: Record<string, unknown> | null; loanId?: string | null }) =>
      api<AITask>(`/ai-tasks/${taskId}/decision`, {
        method: "POST",
        devUser,
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
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["messages", loanId]
    mutationFn: ({ loan_id, body, from_role, is_draft }: { loan_id: string; body: string; from_role: MessageFrom; is_draft?: boolean }) =>
      api<Message>("/messages", {
        method: "POST",
        devUser,
        body: JSON.stringify({ loan_id, body, from_role, is_draft: !!is_draft }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["messages", vars.loan_id] }),
  });
}

export function useRequestDocument() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["documents", loan_id], ["loan", loan_id]
    mutationFn: ({ loan_id, name, category, due_in_days }: { loan_id: string; name: string; category?: string; due_in_days?: number }) =>
      api<Document>("/documents/request", {
        method: "POST",
        devUser,
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
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["documents", loan_id]
    mutationFn: async ({ loan_id, file, name, category }: { loan_id: string; file: File; name?: string; category?: string }) => {
      const init = await api<DocumentUploadInitResponse>("/documents/upload-init", {
        method: "POST",
        devUser,
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
      api<CalendarEvent>("/calendar", {
        method: "POST",
        devUser,
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useStageTransition() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loan", loanId], ["loans"], ["loanActivity", loanId]
    mutationFn: ({ loanId, ...body }: { loanId: string } & StageTransitionRequest) =>
      api<Loan>(`/loans/${loanId}/stage`, {
        method: "POST",
        devUser,
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
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["loan", loanId], ["loans"]
    mutationFn: ({ loanId, ...patch }: { loanId: string } & Partial<Loan>) =>
      api<Loan>(`/loans/${loanId}`, {
        method: "PATCH",
        devUser,
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
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["clients"]
    mutationFn: (payload: { name: string; email?: string; phone?: string; city?: string; referral_source?: string; broker_id?: string }) =>
      api<Client>("/clients", {
        method: "POST",
        devUser,
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["client", clientId], ["clients"]
    mutationFn: ({ clientId, ...patch }: { clientId: string } & Partial<Client>) =>
      api<Client>(`/clients/${clientId}`, {
        method: "PATCH",
        devUser,
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
      api<CreditPull>("/credit/pull", {
        method: "POST",
        devUser,
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["credit", vars.client_id] }),
  });
}
