"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { ApiError, api, type ApiOptions } from "@/lib/api";
import { useActiveProfile } from "@/store/role";
import type { User } from "@/lib/types";
import type {
  Activity,
  AIChatRequest,
  AIChatResponse,
  AIChatSendResponse,
  AIChatThread,
  AIChatThreadDetail,
  AIFeedback,
  ClientLivingProfile,
  ConnectLenderRequest,
  ConnectLenderResponse,
  Lender,
  LenderCreate,
  LenderUpdate,
  LenderSendRequest,
  LenderSendResponse,
  RequiredDocument,
  AITask,
  AITaskDecisionRequest,
  AIModifyCorrection,
  AppSettingsRead,
  AppSettingsUpdate,
  SignatureUploadInitResponse,
  Broker,
  CalendarEvent,
  CalendarEventUpdate,
  ChatSendResponse,
  Client,
  CreditPull,
  CreditSummary,
  ParsedReport,
  DashboardReport,
  Document,
  DocumentUploadInitResponse,
  EmailDraft,
  EmailDraftDecisionRequest,
  FredRefreshResult,
  FredSeriesSummary,
  GroupedResults,
  HudLine,
  InboundEmailRequest,
  InboundEmailResponse,
  LenderSpread,
  Loan,
  LoanChatMessage,
  LoanInstruction,
  LoanParticipant,
  LoanParticipantCreate,
  LoanParticipantUpdate,
  LoanScenario,
  Message,
  MetaResponse,
  PrequalRequest,
  PrequalRequestApprove,
  PrequalRequestCreate,
  PrequalRequestReject,
  PrequalSellerOutcome,
  PrequalStatus,
  RateSKU,
  RecalcResponse,
  ScenarioCreate,
  SmartIntakePayload,
  SmartIntakeResponse,
  StageTransitionRequest,
  SummaryRefreshResponse,
  UserRow,
  WorkspaceState,
} from "@/lib/types";
import type { CalendarEventKind, AITaskPriority, MessageFrom, LoanType, PropertyType, Role, DealChatMode, FeedbackOutputType, FeedbackRating } from "@/lib/enums.generated";

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
 *
 * Auth-readiness gate: when Clerk hasn't finished loading, we return a
 * never-resolving promise instead of firing the request. React Query treats
 * the query as `pending` (not `error`), so the network tab never sees a
 * tokenless 401. Once Clerk resolves, the useCallback deps change and the
 * query refetches with a real Bearer token.
 */
function useAuthedApi() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const devUser = useDevUser();

  return useCallback(
    async function authedApi<T>(path: string, opts: ApiOptions = {}): Promise<T> {
      // Block until Clerk has finished resolving the session. Without this,
      // the first wave of queries (ai-tasks, settings, /auth/me) fires before
      // getToken() is wired and the backend 401s every one of them.
      if (!isLoaded) {
        return new Promise<T>(() => {
          /* never resolves — useCallback dep change will replace this fn,
             react-query will refetch with the new identity once isLoaded. */
        });
      }
      let token: string | null = null;
      if (isSignedIn) {
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
//
// staleTime is intentionally short (30s) and refetchOnWindowFocus is on so
// that backend-side role changes (scripts/demote_to_client.py, the
// invite/promote flow in Settings → Team) propagate within a tab-switch.
// Without this, a user demoted from super_admin → client would keep seeing
// the operator console for up to 5 minutes after the DB change.
export function useCurrentUser() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const { isLoaded, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["auth-me", isSignedIn],
    queryFn: () => apiCall<User>("/auth/me"),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
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
    // Poll every 15s so CLIENTs see operator/AI edits propagate without
    // a page refresh. Slice 3 will replace this with WebSocket push.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
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

// /loans/{id}/workflow — the AI's collection plan for one loan.
// One row per Document with computed scenario + days_until_due +
// editable due_date override. Drives the Workflow tab.
export interface WorkflowDoc {
  document_id: string;
  name: string;
  status: string;
  checklist_key: string | null;
  is_other: boolean;
  requested_on: string | null;
  received_on: string | null;
  due_date: string | null;
  default_due_date: string | null;
  effective_due_date: string | null;
  days_until_due: number | null;
  scenario: string | null;
  next_scenario: string | null;
  next_scenario_in_days: number | null;
}

export function useLoanWorkflow(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["loanWorkflow", loanId, devUser],
    queryFn: () => apiCall<WorkflowDoc[]>(`/loans/${loanId}/workflow`),
    enabled: !!loanId,
    refetchInterval: 30_000,
  });
}

// PATCH /documents/{id}. Today only `due_date` is editable through
// this — set to YYYY-MM-DD string to override; pass null to clear.
export function usePatchDocument() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      due_date,
    }: {
      documentId: string;
      due_date: string | null;
    }) =>
      apiCall<Document>(`/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ due_date }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loanWorkflow"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// POST /loans/{id}/run-doc-reminders — manually fires the
// doc-collection evaluator for this loan. Used by the Workflow
// tab's "Send reminders now" button.
export function useRunDocReminders() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) =>
      apiCall<{ counts: Record<string, number> }>(
        `/loans/${loanId}/run-doc-reminders`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loanWorkflow"] });
      qc.invalidateQueries({ queryKey: ["aiChatThread"] });
      qc.invalidateQueries({ queryKey: ["aiChatThreads"] });
    },
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

// Borrower-safe summary derived from the parsed credit report.
// Backend: GET /credit/pulls/{id}/summary. Auth: client (own pull) / operator (any).
export function useCreditSummary(pullId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["credit-summary", pullId, devUser],
    queryFn: () => apiCall<CreditSummary>(`/credit/pulls/${pullId}/summary`),
    enabled: !!pullId,
  });
}

// Operator-only full structured report (every field iSoftPull surfaced).
// Backend: GET /credit/pulls/{id}/parsed. 403 for clients.
export function useParsedReport(pullId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["credit-parsed", pullId, devUser],
    queryFn: () => apiCall<ParsedReport>(`/credit/pulls/${pullId}/parsed`),
    enabled: !!pullId,
    retry: false, // 403/404 should not retry
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

// Mints a presigned PUT URL for the firm's letterhead signature image.
// Called from the firm-letterhead settings page; the browser then PUTs
// the file bytes directly and PATCHes /settings with the returned key.
// Super-admin only — backend gates this.
export function useInitSignatureUpload() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: (contentType: "image/png" | "image/jpeg" = "image/png") =>
      apiCall<SignatureUploadInitResponse>(
        "/settings/letterhead/signature/upload-init",
        { method: "POST", body: JSON.stringify({ content_type: contentType }) },
      ),
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

export function useInviteUser() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["users"]
    mutationFn: (body: { email: string; name: string; role: Role }) =>
      apiCall<UserRow>("/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUserRole() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["users"]
    mutationFn: ({ userId, ...patch }: { userId: string; role?: Role; name?: string }) =>
      apiCall<UserRow>(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["users"]
    mutationFn: ({ userId }: { userId: string }) =>
      apiCall<void>(`/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

// Borrower-self credit pull (mirrors mobile useCurrentCredit / useStartCreditPull).
// The backend derives client_id from the authenticated user's `user.client.id`,
// so no client_id is required in the request body.
export function useMyCredit() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["my-credit", devUser],
    queryFn: () => apiCall<CreditPull | null>("/credit/current?client_id=self"),
  });
}

export function useStartMyCreditPull() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      legal_first_name: string;
      legal_last_name: string;
      dob: string;
      street: string;
      city: string;
      state: string;
      zip: string;
      // SSN is optional — backend tries name+address+DOB first, asks
      // for SSN only when the bureau can't match.
      ssn?: string;
      fcra_consent: boolean;
    }) =>
      apiCall<CreditPull>("/credit/pull", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      // Populate the cache synchronously so the simulator reflects the
      // new pull the moment the modal closes — avoids the race where a
      // slow refetch leaves the calculator briefly in its locked state.
      qc.setQueryData(["my-credit", devUser], data);
      qc.invalidateQueries({ queryKey: ["my-credit", devUser] });
      qc.invalidateQueries({ queryKey: ["credit"] });
    },
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

// ── Persisted Underwriter chat threads (Phase 8) ──────────────────────────

export function useAIChatThreads() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["aiChatThreads", devUser],
    queryFn: () => apiCall<AIChatThread[]>("/ai/chat/threads"),
    // Poll so the topbar's unread dot picks up new system messages
    // (kickoff opener, anchor narration, doc-reminder tier-1) within
    // 15s — same cadence the loans table uses elsewhere.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useAIChatThread(threadId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["aiChatThread", threadId, devUser],
    queryFn: () => apiCall<AIChatThreadDetail>(`/ai/chat/threads/${threadId}`),
    enabled: !!threadId,
    // Live-refresh while the thread is open so the AI's
    // anchor-narration replies show up without a manual reopen.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

// Bumps `last_seen_at = now()` on the thread. Called when the user
// opens a thread so the unread dot clears.
export function useMarkThreadSeen() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      apiCall<AIChatThread>(`/ai/chat/threads/${threadId}/seen`, {
        method: "POST",
      }),
    onSuccess: (_, threadId) => {
      qc.invalidateQueries({ queryKey: ["aiChatThread", threadId, devUser] });
      qc.invalidateQueries({ queryKey: ["aiChatThreads", devUser] });
    },
  });
}

export function useCreateAIChatThread() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title?: string | null }) =>
      apiCall<AIChatThread>("/ai/chat/threads", {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiChatThreads", devUser] }),
  });
}

export function useSendAIChatMessage() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      body,
      loan_id,
      attachment_tokens,
    }: {
      threadId: string;
      body: string;
      loan_id?: string | null;
      attachment_tokens?: string[] | null;
    }) =>
      apiCall<AIChatSendResponse>(`/ai/chat/threads/${threadId}/message`, {
        method: "POST",
        body: JSON.stringify({
          body,
          loan_id: loan_id ?? null,
          attachment_tokens: attachment_tokens ?? null,
        }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["aiChatThread", vars.threadId, devUser] });
      qc.invalidateQueries({ queryKey: ["aiChatThreads", devUser] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// Mints a presigned PUT for a file the user drops into a loan-scoped
// chat thread, uploads the bytes to S3, returns the document_id.
// Caller stages the id and includes it in the next /message send.
export function useChatAttachmentInit() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: async (vars: {
      threadId: string;
      file: File;
    }): Promise<{ document_id: string }> => {
      const init = await apiCall<{
        document_id: string;
        upload_url: string | null;
        s3_key: string;
      }>(`/ai/chat/threads/${vars.threadId}/attachments/upload-init`, {
        method: "POST",
        body: JSON.stringify({
          name: vars.file.name,
          content_type: vars.file.type || "application/octet-stream",
        }),
      });
      if (init.upload_url) {
        const put = await fetch(init.upload_url, {
          method: "PUT",
          body: vars.file,
          headers: {
            "Content-Type": vars.file.type || "application/octet-stream",
            "x-amz-server-side-encryption": "AES256",
          },
        });
        if (!put.ok) throw new Error(`S3 upload failed: ${put.status} ${put.statusText}`);
      }
      return { document_id: init.document_id };
    },
  });
}

// Hit by the chat's confirm_document_routing CTA. Relinks an
// orphan upload to a checklist slot (or merges it into the slot's
// existing REQUESTED row).
export function useRouteDocument() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      checklist_key,
    }: {
      documentId: string;
      checklist_key: string | null;
    }) =>
      apiCall(`/documents/${documentId}/route`, {
        method: "POST",
        body: JSON.stringify({
          checklist_key,
          is_other: checklist_key == null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["aiChatThread"] });
      qc.invalidateQueries({ queryKey: ["aiChatThreads", devUser] });
    },
  });
}

export function useRenameAIChatThread() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
      apiCall<AIChatThread>(`/ai/chat/threads/${threadId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["aiChatThread", vars.threadId, devUser] });
      qc.invalidateQueries({ queryKey: ["aiChatThreads", devUser] });
    },
  });
}

export function useDeleteAIChatThread() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      apiCall<void>(`/ai/chat/threads/${threadId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aiChatThreads", devUser] });
    },
  });
}

// ── Account-wide living profile (Phase 8) ─────────────────────────────────

export function useMyLivingProfile() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["myLivingProfile", devUser],
    queryFn: () => apiCall<ClientLivingProfile>("/clients/me/living-profile"),
    staleTime: 60_000,
  });
}

export function useRefreshMyLivingProfile() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<ClientLivingProfile>("/clients/me/summary/refresh", { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(["myLivingProfile", devUser], data);
    },
  });
}

export function useClientLivingProfile(clientId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["clientLivingProfile", clientId, devUser],
    queryFn: () => apiCall<ClientLivingProfile>(`/clients/${clientId}/living-profile`),
    enabled: !!clientId,
    staleTime: 60_000,
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
      ...body
    }: {
      loanId: string;
      discount_points: number;
      loan_amount?: number;
      base_rate?: number;
      annual_taxes?: number;
      annual_insurance?: number;
      monthly_hoa?: number;
      ltv?: number;
    }) =>
      apiCall<RecalcResponse>(`/loans/${loanId}/recalc`, {
        method: "POST",
        body: JSON.stringify(body),
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
    // invalidates: ["documents", loan_id], ["required-documents", loan_id]
    mutationFn: async ({
      loan_id,
      file,
      name,
      category,
      fulfill_document_id,
      checklist_key,
      is_other,
    }: {
      loan_id: string;
      file: File;
      name?: string;
      category?: string;
      // Categorization (alembic 0017): pick exactly ONE of these
      // three to link the upload to the loan's checklist.
      fulfill_document_id?: string | null;
      checklist_key?: string | null;
      is_other?: boolean;
    }) => {
      const init = await apiCall<DocumentUploadInitResponse>("/documents/upload-init", {
        method: "POST",
        body: JSON.stringify({
          loan_id,
          name: name ?? file.name,
          content_type: file.type || "application/octet-stream",
          category,
          fulfill_document_id: fulfill_document_id ?? null,
          checklist_key: checklist_key ?? null,
          is_other: !!is_other,
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
        // Flip the doc to RECEIVED + queue the vision scan. Skipping
        // this step in dev mode (no S3) is fine — there's nothing
        // to scan anyway.
        await apiCall(`/documents/upload-complete`, {
          method: "POST",
          body: JSON.stringify({ document_id: init.document_id }),
        });
      }
      return init;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["documents", vars.loan_id] });
      qc.invalidateQueries({ queryKey: ["documents", undefined] });
      qc.invalidateQueries({ queryKey: ["required-documents", vars.loan_id] });
    },
  });
}

// /loans/{id}/required-documents — drives the vault upload modal's
// checklist picker. Returns the loan's product checklist joined
// against existing Document rows so the operator/borrower sees
// which slots are filled, in flight, or empty.
export function useRequiredDocuments(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["required-documents", loanId, devUser],
    queryFn: () => apiCall<RequiredDocument[]>(`/loans/${loanId}/required-documents`),
    enabled: !!loanId,
  });
}

// AI chat thread find-or-create — used by the Messages thread list
// to lazy-spawn a thread the first time the user taps on a loan
// row (or the Account thread).
export function useFindOrCreateChatThread() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loan_id }: { loan_id: string | null }) =>
      apiCall<AIChatThread>("/ai/chat/threads/find-or-create", {
        method: "POST",
        body: JSON.stringify({ loan_id }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiChatThreads", devUser] }),
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
      description?: string | null;
      who?: string | null;
      starts_at: string; // ISO datetime
      duration_min?: number | null;
      priority?: AITaskPriority | null;
      owner_user_id?: string | null;
    }) =>
      apiCall<CalendarEvent>("/calendar", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

// Partial update — typically used to flip status to "done" or
// "cancelled", or to edit title/who/starts_at on a manual row.
// Borrowers may only patch status (backend enforces this).
export function useUpdateCalendarEvent() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: CalendarEventUpdate;
    }) =>
      apiCall<CalendarEvent>(`/calendar/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

// Hard delete — operator-only. Prefer status='cancelled' via PATCH
// for anything you might want to audit; this is the trapdoor for
// typos and demo cleanup.
export function useDeleteCalendarEvent() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiCall<void>(`/calendar/${id}`, { method: "DELETE" }),
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
      ssn: string; // 9 digits, no dashes
      fcra_consent: boolean;
    }) =>
      apiCall<CreditPull>("/credit/pull", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["credit", vars.client_id] }),
  });
}

// ── Deal Workspace ─────────────────────────────────────────────────────────

export function useDealWorkspace(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["workspace", loanId, devUser],
    queryFn: () => apiCall<WorkspaceState>(`/loans/${loanId}/workspace/state`),
    enabled: !!loanId,
  });
}

export function useLoanInstructions(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["loanInstructions", loanId, devUser],
    queryFn: () => apiCall<LoanInstruction[]>(`/loans/${loanId}/instructions`),
    enabled: !!loanId,
  });
}

export function useCreateInstruction() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, body }: { loanId: string; body: string }) =>
      apiCall<LoanInstruction>(`/loans/${loanId}/instructions`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loanInstructions", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["workspace", vars.loanId] });
    },
  });
}

export function useDeactivateInstruction() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, instructionId }: { loanId: string; instructionId: string }) =>
      apiCall<void>(`/loans/${loanId}/instructions/${instructionId}`, { method: "DELETE" }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loanInstructions", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["workspace", vars.loanId] });
    },
  });
}

export function useDealChat(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["dealChat", loanId, devUser],
    queryFn: () => apiCall<LoanChatMessage[]>(`/loans/${loanId}/chat`),
    enabled: !!loanId,
  });
}

export function useSendDealChat() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, body, mode }: { loanId: string; body: string; mode: DealChatMode }) =>
      apiCall<ChatSendResponse>(`/loans/${loanId}/chat`, {
        method: "POST",
        body: JSON.stringify({ body, mode }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["dealChat", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["workspace", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loanInstructions", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["aiTasks"] });
    },
  });
}

export function useAttachAIModifyCorrection() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loanId,
      messageId,
      correction,
    }: {
      loanId: string;
      messageId: string;
      correction: string;
    }) =>
      apiCall<AIModifyCorrection>(`/loans/${loanId}/chat/${messageId}/correction`, {
        method: "POST",
        body: JSON.stringify({ correction }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["dealChat", vars.loanId] }),
  });
}

export function useResumeAI() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId }: { loanId: string }) =>
      apiCall<void>(`/loans/${loanId}/ai/resume`, { method: "POST" }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["workspace", vars.loanId] }),
  });
}

export function useLoanScenarios(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["loanScenarios", loanId, devUser],
    queryFn: () => apiCall<LoanScenario[]>(`/loans/${loanId}/scenarios`),
    enabled: !!loanId,
  });
}

export function useSaveScenario() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, ...body }: { loanId: string } & ScenarioCreate) =>
      apiCall<LoanScenario>(`/loans/${loanId}/scenarios`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loanScenarios", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["workspace", vars.loanId] });
    },
  });
}

export function useDeleteScenario() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, scenarioId }: { loanId: string; scenarioId: string }) =>
      apiCall<void>(`/loans/${loanId}/scenarios/${scenarioId}`, { method: "DELETE" }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loanScenarios", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["workspace", vars.loanId] });
    },
  });
}

export function useUpdateHudLine() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loanId,
      lineId,
      ...patch
    }: {
      loanId: string;
      lineId: string;
      label?: string;
      amount?: number;
      category?: string;
    }) =>
      apiCall<HudLine>(`/loans/${loanId}/hud/${lineId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["workspace", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId] });
    },
  });
}

// ── AI Feedback ────────────────────────────────────────────────────────────

export function useFeedbackForOutput(
  outputType: FeedbackOutputType | null,
  outputId: string | null,
) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["aiFeedback", outputType, outputId, devUser],
    queryFn: () =>
      apiCall<AIFeedback[]>(
        `/ai-feedback?output_type=${outputType}&output_id=${outputId}`,
      ),
    enabled: !!outputType && !!outputId,
  });
}

export function useUpsertFeedback() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      output_type: FeedbackOutputType;
      output_id: string;
      loan_id?: string | null;
      rating: FeedbackRating;
      comment?: string | null;
    }) =>
      apiCall<AIFeedback>("/ai-feedback", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["aiFeedback", vars.output_type, vars.output_id] });
      if (vars.loan_id) qc.invalidateQueries({ queryKey: ["workspace", vars.loan_id] });
    },
  });
}

// ── FRED + Lender Spreads ──────────────────────────────────────────────────

// Treat 404 as "endpoint not deployed yet" — return [] silently instead of
// looping retries / spamming the console. Deploys can lag behind frontend
// pushes (the FRED router was added in a recent backend release).
function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export function useFredSeries(days?: number) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  // Days is part of the queryKey so different ranges are cached independently
  // — switching the explorer between 7/14/30/60/90 doesn't refetch the
  // ranges that have already been seen.
  const requested = days != null ? Math.max(1, Math.min(days, 90)) : undefined;
  const path = requested ? `/fred/series?days=${requested}` : "/fred/series";
  return useQuery({
    queryKey: ["fredSeries", devUser, requested ?? "default"],
    queryFn: () => apiCall<FredSeriesSummary[]>(path),
    staleTime: 5 * 60 * 1000, // 5 min — cron updates daily
    // Don't retry on 404 (router not mounted) — wastes requests, fills the
    // console with errors, and the empty-state UI handles it cleanly.
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });
}

export function useFredSeriesDetail(seriesId: string | null, days = 30) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["fredSeries", seriesId, days, devUser],
    queryFn: () => apiCall<FredSeriesSummary>(`/fred/series/${seriesId}?days=${days}`),
    enabled: !!seriesId,
  });
}

export function useRefreshFred() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiCall<FredRefreshResult>("/admin/fred/refresh", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fredSeries"] }),
  });
}

export function useLenderSpreads() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["lenderSpreads", devUser],
    queryFn: () => apiCall<LenderSpread[]>("/lender-spreads"),
  });
}

export function useUpsertLenderSpread() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { series_id: string; spread_bps: number; notes?: string | null }) =>
      apiCall<LenderSpread>("/lender-spreads", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lenderSpreads"] });
      qc.invalidateQueries({ queryKey: ["fredSeries"] });
    },
  });
}

// Manual minimal-loan creation — used by the Messages → New Thread flow when
// a client doesn't have a loan to link a thread to. The doc-collection
// workflow then runs via the existing per-loan-type checklist (Settings →
// Doc checklists) and the AI cadence settings.
export function useCreateLoan() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      client_id: string;
      address: string;
      type: LoanType;
      amount: number;
      property_type?: PropertyType;
      city?: string | null;
    }) =>
      apiCall<Loan>("/loans", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// Loan-less what-if math — used by the standalone Simulator's "Free
// calculation" mode. Backend: POST /api/v1/loans/calc.
export function useFreeCalc() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: (body: {
      type: LoanType;
      property_type?: PropertyType;
      loan_amount: number;
      base_rate: number;
      discount_points: number;
      term_months?: number | null;
      monthly_rent?: number | null;
      annual_taxes?: number;
      annual_insurance?: number;
      monthly_hoa?: number;
    }) =>
      apiCall<RecalcResponse>("/loans/calc", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

// Self-edit profile hooks for borrower (Profile → Investor Profile dialog).
// Backed by /clients/me on the backend (super-admins / brokers should use
// /clients/{id} + useUpdateClient instead).
export function useMyClient() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["my-client", devUser],
    queryFn: () => apiCall<Client>("/clients/me"),
    // 404 is expected for operator users with no client linkage — don't retry.
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });
}

export function useUpdateMyClient() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      name?: string;
      phone?: string;
      address?: string;
      city?: string;
      properties?: string;
      experience?: string;
    }) =>
      apiCall<Client>("/clients/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-client"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// Legal acceptance — backed by /legal/accept (server captures IP + UA).
// Used by useRecordPendingConsent (below) to flush a localStorage-pending
// signup acceptance into the audit table once the user's session resolves.
export function useAcceptLegal() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { terms_version: string; privacy_version: string }) =>
      apiCall<{ id: string }>("/legal/accept", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["legalAcceptance"] }),
  });
}

// Operator-side view of a client's vault — drives the Vault section on
// the Client detail page. Joins Document → Loan → client_id server-side
// so we don't need the loans list first.
export function useDocumentsForClient(clientId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["documents", "by-client", clientId, devUser],
    queryFn: () => apiCall<Document[]>(`/documents?client_id=${clientId}`),
    enabled: !!clientId,
  });
}

// ── Pre-qualification letter requests ──────────────────────────────────
// Backend: app/routers/prequal.py
//
//   useMyPrequalRequests        - borrower's own list across all loans
//   useLoanPrequalRequests(id)  - per-loan list (operator drill-down or
//                                 borrower viewing their own loan)
//   useSubmitPrequalRequest()   - borrower POST; spawns Loan stub if
//                                 no loan_id given
//   useAdminPrequalQueue()      - firm-wide queue (operator-only)
//   useApprovePrequalRequest()  - PUT approve; renders PDF
//   useRejectPrequalRequest()   - PUT reject; mandatory admin_notes

export function useMyPrequalRequests() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["prequal-requests", "me", devUser],
    queryFn: () => apiCall<PrequalRequest[]>("/me/prequal-requests"),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
}

export function useLoanPrequalRequests(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["prequal-requests", "loan", loanId, devUser],
    queryFn: () =>
      apiCall<PrequalRequest[]>(`/loans/${loanId}/prequal-requests`),
    enabled: !!loanId,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
}

export function useAdminPrequalQueue(statusFilter?: PrequalStatus) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  return useQuery({
    queryKey: ["prequal-requests", "admin", statusFilter ?? "all", devUser],
    queryFn: () => apiCall<PrequalRequest[]>(`/admin/prequal-requests${qs}`),
    refetchOnWindowFocus: true,
    staleTime: 15 * 1000,
  });
}

export function useSubmitPrequalRequest() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // loanId is optional. Without it, backend spawns or attaches to a
    // Loan record at the same property.
    mutationFn: ({
      loanId,
      payload,
    }: {
      loanId?: string;
      payload: PrequalRequestCreate;
    }) => {
      const path = loanId
        ? `/loans/${loanId}/prequal-requests`
        : `/prequal-requests`;
      return apiCall<PrequalRequest>(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
      // Also invalidate /loans because we may have just spawned a Loan stub.
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useApprovePrequalRequest() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: PrequalRequestApprove;
    }) =>
      apiCall<PrequalRequest>(
        `/admin/prequal-requests/${requestId}/approve`,
        { method: "PUT", body: JSON.stringify(payload) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
    },
  });
}

export function useRejectPrequalRequest() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: PrequalRequestReject;
    }) =>
      apiCall<PrequalRequest>(
        `/admin/prequal-requests/${requestId}/reject`,
        { method: "PUT", body: JSON.stringify(payload) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
    },
  });
}

// Borrower (or super-admin acting on their behalf) reports the seller's
// outcome on an approved prequal. Accept spawns a Loan; decline closes.
export function useAcceptPrequalOffer() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: PrequalSellerOutcome;
    }) =>
      apiCall<PrequalRequest>(
        `/me/prequal-requests/${requestId}/accept-offer`,
        { method: "PUT", body: JSON.stringify(payload) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
      // The new Loan lands in /pipeline & /loans; refresh those too.
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useDeclinePrequalOffer() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: string;
      payload: PrequalSellerOutcome;
    }) =>
      apiCall<PrequalRequest>(
        `/me/prequal-requests/${requestId}/decline-offer`,
        { method: "PUT", body: JSON.stringify(payload) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
    },
  });
}

// ── Lender admin (Phase: lenders v2) ──────────────────────────────────────

export function useLenders(opts?: { product?: string | null; activeOnly?: boolean }) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const product = opts?.product ?? null;
  const activeOnly = !!opts?.activeOnly;
  return useQuery({
    queryKey: ["lenders", devUser, product, activeOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (product) params.set("product", product);
      if (activeOnly) params.set("active_only", "true");
      const qs = params.toString();
      return apiCall<Lender[]>(`/lenders${qs ? `?${qs}` : ""}`);
    },
  });
}

export function useLender(lenderId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["lender", lenderId, devUser],
    queryFn: () => apiCall<Lender>(`/lenders/${lenderId}`),
    enabled: !!lenderId,
  });
}

export function useCreateLender() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LenderCreate) =>
      apiCall<Lender>("/lenders", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lenders", devUser] }),
  });
}

export function useUpdateLender() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lenderId, ...patch }: { lenderId: string } & LenderUpdate) =>
      apiCall<Lender>(`/lenders/${lenderId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lender", vars.lenderId, devUser] });
      qc.invalidateQueries({ queryKey: ["lenders", devUser] });
    },
  });
}

export function useDeleteLender() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lenderId, hard }: { lenderId: string; hard?: boolean }) =>
      apiCall<{ status: string; mode: string }>(
        `/lenders/${lenderId}${hard ? "?hard=true" : ""}`,
        { method: "DELETE" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lenders", devUser] }),
  });
}

export function useConnectLender() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, payload }: { loanId: string; payload: ConnectLenderRequest }) =>
      apiCall<ConnectLenderResponse>(`/loans/${loanId}/connect-lender`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["loan", vars.loanId, devUser] });
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["loanParticipants", vars.loanId] });
    },
  });
}

export function useDisconnectLender() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) =>
      apiCall<Loan>(`/loans/${loanId}/disconnect-lender`, { method: "POST" }),
    onSuccess: (_, loanId) => {
      qc.invalidateQueries({ queryKey: ["loan", loanId, devUser] });
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["loanParticipants", loanId] });
    },
  });
}

export function useDraftLenderSend() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, payload }: { loanId: string; payload: LenderSendRequest }) =>
      apiCall<LenderSendResponse>(`/loans/${loanId}/lender/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["emailDrafts", vars.loanId] });
      qc.invalidateQueries({ queryKey: ["activities", vars.loanId] });
    },
  });
}
