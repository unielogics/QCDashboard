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
  HeadshotUploadInitResponse,
  UserRow,
  WorkspaceState,
} from "@/lib/types";
import type { CalendarEventKind, AITaskPriority, MessageFrom, LoanType, LoanPurpose, PropertyType, Role, DealChatMode, FeedbackOutputType, FeedbackRating } from "@/lib/enums.generated";

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
/**
 * True when the error indicates the AI backend routes (Phases 1–7,
 * /me/ai-playbook/*, /clients/{id}/ai-plan, /lending-admin/*,
 * /ai-preview/*) aren't deployed yet. Components use this to swap in
 * a "Backend not deployed" banner instead of a broken loading state.
 */
export function isAINotDeployed(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/**
 * Default react-query retry policy used by every AI hook below.
 * Without this, react-query retries 3 times on 404 — which produces
 * the storm of failing requests we see in the console when the
 * backend isn't deployed yet.
 */
function aiQueryRetry(failureCount: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status === 404) return false;
  if (err instanceof ApiError && err.status === 403) return false;
  return failureCount < 1;
}

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

// `scope` is optional. When omitted, the backend decides based on the JWT
// role (Agent → "mine", Super Admin / Funding Team → "all"). Pass it
// explicitly only when a UI needs to assert a non-default filter (e.g.
// Super Admin's "show me only my own assignments" toggle, or a request to
// surface unassigned records). Architecture Rule #1 — `scope: "mine"`
// excludes records with NULL agent_id; only Super Admin gets `scope: "all"`.
export function useLoans(scope?: import("@/lib/types").ListScope) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qs = scope ? `?scope=${scope}` : "";
  return useQuery({
    queryKey: ["loans", scope ?? "auto", devUser],
    queryFn: () => apiCall<Loan[]>(`/loans${qs}`),
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

// See `useLoans` for the `scope` contract — same rule.
export function useClients(scope?: import("@/lib/types").ListScope) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const qs = scope ? `?scope=${scope}` : "";
  return useQuery({
    queryKey: ["clients", scope ?? "auto", devUser],
    queryFn: () => apiCall<Client[]>(`/clients${qs}`),
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

export function useDocuments(loanId?: string, options?: { enabled?: boolean }) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["documents", loanId, devUser],
    queryFn: () => apiCall<Document[]>(loanId ? `/documents?loan_id=${loanId}` : "/documents"),
    enabled: options?.enabled ?? true,
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
  // alembic 0023 — which side of the transaction this doc applies to.
  // Falls back to "both" for is_other / custom rows.
  side?: string;
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
      status,
      name,
    }: {
      documentId: string;
      // due_date: undefined = leave alone, null = clear, string = set
      due_date?: string | null;
      // alembic 0023 — flip in/out of the AI's collection plan
      status?: "requested" | "skipped";
      // rename a custom doc
      name?: string;
    }) => {
      const body: Record<string, unknown> = {};
      if (due_date !== undefined) body.due_date = due_date;
      if (status !== undefined) body.status = status;
      if (name !== undefined) body.name = name;
      return apiCall<Document>(`/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loanWorkflow"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// POST /loans/{id}/documents/custom — agent adds a one-off doc to
// this loan's collection plan. Used by WorkflowTab's "+ Add custom
// item" button.
export function useAddCustomDocument() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loanId,
      name,
      due_date,
      checklist_key,
    }: {
      loanId: string;
      name: string;
      due_date?: string | null;
      checklist_key?: string | null;
    }) =>
      apiCall<Document>(`/loans/${loanId}/documents/custom`, {
        method: "POST",
        body: JSON.stringify({
          name,
          due_date: due_date ?? null,
          checklist_key: checklist_key ?? null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loanWorkflow"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// /me/broker-settings — agent's per-broker overlay (alembic 0023).
// GET returns AgentSettingsData (empty defaults if NULL); PUT does
// a whole-document replacement so the desktop /agent-settings page
// can save the entire form in one call.
export function useBrokerSettings() {
  const apiCall = useAuthedApi();
  const devUser = useDevUser();
  // /me/broker-settings is BROKER-only (returns 403 for super-admin /
  // loan-exec / borrower roles). Gate the query so non-brokers don't
  // spam the network with 403s. We use the activeProfile from the
  // role store; before the profile resolves we default to disabled.
  const role = useActiveProfile().role;
  const enabled = role === "broker";
  return useQuery({
    queryKey: ["brokerSettings", devUser, role],
    queryFn: () =>
      apiCall<{ data: import("@/lib/types").AgentSettingsData }>(
        `/me/broker-settings`,
      ),
    enabled,
    retry: (failureCount, err) => {
      // Don't retry on 403 — role mismatch, not a transient failure.
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return false;
      return failureCount < 1;
    },
  });
}

export function useUpdateBrokerSettings() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const devUser = useDevUser();
  return useMutation({
    mutationFn: (data: import("@/lib/types").AgentSettingsData) =>
      apiCall<{ data: import("@/lib/types").AgentSettingsData }>(
        `/me/broker-settings`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brokerSettings", devUser] });
      // Resolution changed — re-fetch any open workflow views.
      qc.invalidateQueries({ queryKey: ["loanWorkflow"] });
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

// ── Agent dashboard metrics — funnel + Next Best Actions ──────────
//
// Backed by /agents/me/funnel and /agents/me/next-actions (alembic
// 0024). Both endpoints scope by role: BROKER → their book,
// SUPER_ADMIN/LOAN_EXEC → firm-wide, CLIENT → 403.

export interface FunnelStat {
  value: number | null;
  sample_size: number;
}

export interface FunnelMetrics {
  leads_this_week: number;
  contacted: number;
  stale_lead_count: number;
  intake_completion: FunnelStat;
  prequal_conversion: FunnelStat;
  lead_to_prequal: FunnelStat;
  prequal_to_funded: FunnelStat;
  clients_by_stage: Record<string, number>;
}

export interface NextAction {
  id: string;
  kind: "call_lead" | "chase_doc" | "closing_prep" | "pending_task";
  priority: "high" | "medium" | "low";
  title: string;
  subtitle: string;
  target_type: "client" | "loan" | "document" | "ai_task";
  target_id: string;
  deeplink: string;
  created_at: string;
  client_id: string | null;
  loan_id: string | null;
}

export function useLeadFunnel() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["leadFunnel", devUser],
    queryFn: () => apiCall<FunnelMetrics>("/agents/me/funnel"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useNextActions() {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["nextActions", devUser],
    queryFn: () => apiCall<NextAction[]>("/agents/me/next-actions"),
    staleTime: 30_000,
    refetchInterval: 60_000,
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

// One-shot helper that bundles the 3-step S3 upload for the broker's
// headshot:
//   1. POST /me/broker-settings/headshot/upload-init → presigned PUT URL
//   2. PUT bytes directly to S3
//   3. Returns the s3_key — caller PUTs /me/broker-settings with
//      letterhead.headshot_s3_key set to this value.
//
// When the backend has no S3 bucket (local dev), falls back to a
// data-URL roundtrip so the UI still has SOMETHING to render. The
// caller distinguishes via the returned `kind` field.
export function useUploadHeadshot() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: async (file: File): Promise<{ kind: "s3"; s3_key: string } | { kind: "data_url"; data_url: string }> => {
      const contentType: "image/png" | "image/jpeg" =
        file.type === "image/jpeg" ? "image/jpeg" : "image/png";
      const init = await apiCall<HeadshotUploadInitResponse>(
        "/broker-settings/headshot/upload-init",
        { method: "POST", body: JSON.stringify({ content_type: contentType }) },
      );
      if (!init.upload_url) {
        // Local dev — read as data URL so the picker still works.
        const data_url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        return { kind: "data_url", data_url };
      }
      const putRes = await fetch(init.upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType, "x-amz-server-side-encryption": "AES256" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Headshot upload failed: ${putRes.status}`);
      }
      return { kind: "s3", s3_key: init.s3_key };
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
      term_months?: number | null;
      monthly_rent?: number | null;
      ltv?: number;
      purpose?: LoanPurpose | null;
      arv?: number | null;
      brv?: number | null;
      rehab_budget?: number | null;
      payoff?: number | null;
      ltv_tier_cap?: number | null;
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
    // alembic 0030 added client_id alongside loan_id for the Realtor AI's
    // per-client threads. Routing precedence: loan_id wins over client_id;
    // both null = account-wide thread.
    mutationFn: ({ loan_id, client_id }: { loan_id?: string | null; client_id?: string | null }) =>
      apiCall<AIChatThread>("/ai/chat/threads/find-or-create", {
        method: "POST",
        body: JSON.stringify({ loan_id: loan_id ?? null, client_id: client_id ?? null }),
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
    // Note: brokers do NOT send broker_id — backend hard-stamps it
    // from the session for Role.BROKER (see app/routers/clients.py).
    // Sending it would be ignored anyway; we keep the field for
    // super-admin / loan_exec who can assign explicitly.
    mutationFn: (payload: {
      name: string;
      email?: string;
      phone?: string;
      city?: string;
      referral_source?: string;
      broker_id?: string;
      // Lead-funnel fields (alembic 0024). Default 'lead' is fine
      // for the broker's "+ Add Lead" path.
      stage?: "lead" | "contacted" | "verified" | "ready_for_lending" | "processing" | "funded" | "lost";
      client_type?: "buyer" | "seller";
      // Per-lead overrides (alembic 0025). Captured by AddLeadWizard:
      // lead_intake = property/financial context, checklist_overrides =
      // disable+extras for THIS lead, ai_cadence_override = nudge frequency.
      lead_intake?: Record<string, unknown> | null;
      checklist_overrides?: Record<string, unknown> | null;
      ai_cadence_override?: Record<string, unknown> | null;
      // Lead routing / ownership / attribution (alembic 0029).
      lead_source?: string;
      lead_temperature?: string;
      financing_support_needed?: string;
      contact_permission?: string;
      relationship_context?: string;
      originating_agent_id?: string;
      current_agent_id?: string;
      source_channel?: string;
    }) =>
      apiCall<Client>("/clients", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

// Hand a lead off to the funding team for prequalification review.
// Creates a PrequalRequest server-side + spawns an AITask in the
// funding queue. Used by:
//   - "Ready for Prequalification" button on /clients/[id]
//   - AI Secretary action card (kind: "request_prequalification")
export function useRequestPrequalification() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    // invalidates: ["client", clientId], ["clients"], ["ai-tasks"]
    mutationFn: (clientId: string) =>
      apiCall<{
        prequal_request_id: string;
        client_id: string;
        lead_promotion_status: string;
        // Lending Handoff Packet (alembic 0031). Returned so the
        // confirmation modal can show what the AI inherited.
        handoff_packet_id?: string | null;
        lending_thread_id?: string | null;
        handoff_summary?: string | null;
        first_lending_question?: string | null;
        missing_lending_items?: string[];
      }>(`/clients/${clientId}/request-prequalification`, {
        method: "POST",
      }),
    onSuccess: (_data, clientId) => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["ai-tasks"] });
    },
  });
}

// Realtor AI ChatAction confirm-endpoints (alembic 0030). Each fires
// when the agent taps a card the AI emitted in chat. v1 stubs record
// intent + spawn an AITask; full integrations land in follow-up.

interface RealtorActionResult {
  client_id: string;
  action_kind: string;
  ai_task_id: string | null;
}

function useRealtorAction(path: (id: string) => string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      apiCall<RealtorActionResult>(path(clientId), { method: "POST" }),
    onSuccess: (_data, clientId) => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["ai-tasks"] });
    },
  });
}

export function useSendBuyerAgreement() {
  return useRealtorAction((id) => `/clients/${id}/send-buyer-agreement`);
}

export function useSendListingAgreement() {
  return useRealtorAction((id) => `/clients/${id}/send-listing-agreement`);
}

export function useMarkClientFinanceReady() {
  return useRealtorAction((id) => `/clients/${id}/mark-finance-ready`);
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

// Super-admin manual prequalification creation. Backend dependency:
// POST /admin/prequal-requests must accept client_id (stamps the
// requester from the linked Client) and persist manual_credit_override
// so the approve / PDF path can compute LTV without a real CreditSummary.
export function useAdminCreateManualPrequal() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      client_id: string;
      target_property_address: string;
      purchase_price: number;
      requested_loan_amount: number;
      loan_type: PrequalRequestCreate["loan_type"];
      expected_closing_date: string | null;
      borrower_notes: string | null;
      borrower_entity: string | null;
      arv_estimate: number | null;
      sow_items: PrequalRequestCreate["sow_items"];
      manual_credit_override: {
        fico: number;
        property_count: number;
        has_year_of_ownership: boolean;
      };
    }) =>
      apiCall<PrequalRequest>("/admin/prequal-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prequal-requests"] });
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

// Create an Updated Version of an approved prequal — same payload shape
// as approve, but the backend spawns a new linked row instead of mutating
// the source. Returns the new (v2/v3/...) request.
export function useRevisePrequalRequest() {
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
        `/admin/prequal-requests/${requestId}/revise`,
        { method: "POST", body: JSON.stringify(payload) },
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

// ────────────────────────────────────────────────────────────────────────────
// Agent Funding Command Center — Client / Engagement / Reassignment hooks
//
// The earlier separate Lead + Deal entities were folded back into Client (with
// a `stage` column) per real-estate domain rules: a Lead is just a Client at
// stage = "lead", and a Deal emerges from Pipeline status transitions rather
// than being manually created. The hooks below cover only the surfaces the
// Agent UI actually needs:
//   - GET    /clients/{id}/engagement       → EngagementSignal[]
//   - PATCH  /clients/{id}/agent            → Super Admin reassignment (audit logged)
//   - PATCH  /clients/{id}/stage            → advance stage in the early funnel
//   - POST   /clients/{id}/start-funding    → "Start Funding" — promotes to
//                                              ready_for_lending, marks prequal
//                                              approved, creates Loan, notifies
//                                              Funding Team
// ────────────────────────────────────────────────────────────────────────────

import type { EngagementSignal, ClientStage } from "@/lib/types";

export function useEngagement(clientId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["engagement", clientId, devUser],
    queryFn: () =>
      apiCall<EngagementSignal[]>(`/clients/${clientId}/engagement`).catch(() => [] as EngagementSignal[]),
    enabled: !!clientId,
    retry: false,
  });
}

// ─── Agent reassignment (Super Admin only) ─────────────────────────────────
// Future endpoint: PATCH /clients/{id}/agent
// Body: { to_agent_id: string, reason?: string }
//
// Backend writes an AgentReassignmentAudit row per Architecture Rule #3.
// Open AITasks transfer; sent messages keep their original from_user_id;
// LoanAttribution.current_agent_id updates while originating_agent_id stays.

export function useReassignAgent() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      toAgentId,
      reason,
    }: {
      clientId: string;
      toAgentId: string;
      reason?: string;
    }) =>
      apiCall<Client>(`/clients/${clientId}/agent`, {
        method: "PATCH",
        body: JSON.stringify({ to_agent_id: toAgentId, reason }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
    },
  });
}

// ─── Client stage transitions ──────────────────────────────────────────────
// Two related mutations:
//   - useUpdateClientStage   PATCH /clients/{id}/stage   — advance through the
//                            Agent-controlled stages (lead → contacted → verified)
//                            or to terminal "lost". Restricted server-side to
//                            the assigned Agent + Super Admin.
//   - useStartFunding        POST  /clients/{id}/start-funding  — promotes
//                            verified → ready_for_lending. Backend marks the
//                            prequal approved, creates the Loan, notifies the
//                            Funding Team. Single-fire, idempotent on a given
//                            stage.
// Both are wired to future endpoints; they will 404 today and the UI handles
// that with a toast / inline error rather than auto-retrying.

export function useUpdateClientStage() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, stage }: { clientId: string; stage: ClientStage }) =>
      apiCall<Client>(`/clients/${clientId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
    },
  });
}

export function useStartFunding() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      apiCall<Client>(`/clients/${clientId}/start-funding`, { method: "POST" }),
    onSuccess: (_, clientId) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}


// ── AI Plan / Playbooks / Preview hooks (Phase 2/3/6/7) ─────────────

export interface ClientAIPlanItem {
  requirement_key: string;
  label: string;
  category: string;
  required_level: string;
  blocks_stage: string | null;
  visibility: string[];
  can_agent_override: boolean;
  can_underwriter_waive: boolean;
  verification_required: boolean;
  expiration_days: number | null;
  ai_request_message_template: string | null;
  display_order: number;
  status: string;
  source: string;
  evidence_id: string | null;
  playbook_id: string;
  playbook_version: number;
  playbook_name: string;
}

export interface ClientAIPlanRead {
  client_id: string;
  loan_id: string | null;
  current_phase: string;
  custom_instructions: string | null;
  required_items: ClientAIPlanItem[];
  waived_items: ClientAIPlanItem[];
  ai_suggested_items: ClientAIPlanItem[];
  next_best_question: string | null;
  next_best_action: { kind: string; requirement_key?: string; label?: string; category?: string } | null;
  readiness_score: number | null;
  active_playbook_versions: { playbook_id: string; version: number }[];
  computed_at: string;
}

// GET /clients/{id}/ai-plan — resolved active plan + auto-rebuild
export function useClientAIPlan(clientId: string | null | undefined, loanId?: string | null) {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["clientAIPlan", clientId, loanId ?? null],
    queryFn: () =>
      apiCall<ClientAIPlanRead>(
        `/clients/${clientId}/ai-plan${loanId ? `?loan_id=${loanId}` : ""}`,
      ),
    enabled: !!clientId,
    retry: aiQueryRetry,
  });
}

// PATCH /clients/{id}/ai-plan — apply per-client overrides
export function usePatchClientAIPlan() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, loanId, ...body }: {
      clientId: string;
      loanId?: string | null;
      custom_instructions?: string | null;
      waive_keys?: string[];
      unwaive_keys?: string[];
      rebuild?: boolean;
    }) =>
      apiCall<ClientAIPlanRead>(
        `/clients/${clientId}/ai-plan${loanId ? `?loan_id=${loanId}` : ""}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["clientAIPlan", vars.clientId] });
      qc.invalidateQueries({ queryKey: ["client", vars.clientId] });
    },
  });
}

// AI Preview endpoints (no persistence)
export function usePreviewAIPlan() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: (body: {
      client_id: string;
      loan_id?: string | null;
      waive_keys?: string[];
      custom_instructions?: string;
    }) =>
      apiCall<ClientAIPlanRead>(`/ai-preview/plan`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function usePreviewHandoffPacket() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: (clientId: string) =>
      apiCall<{
        handoff_summary: string | null;
        realtor_summary: Record<string, unknown> | null;
        extracted_facts: { field: string; value: unknown; source: string; confidence: number; visibility: string }[];
        missing_lending_items: string[] | null;
        first_lending_question: string | null;
        recommended_lending_path: Record<string, unknown> | null;
      }>(`/ai-preview/handoff`, {
        method: "POST",
        body: JSON.stringify({ client_id: clientId }),
      }),
  });
}

export interface CadencePreviewItem {
  rule_id: string;
  trigger_event: string;
  action_type: string;
  approval_required: boolean;
  visibility: string;
  client_id: string;
  client_name: string;
  requirement_key: string | null;
  message_preview: string | null;
  fires_now: boolean;
}

export function usePreviewCadence() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: (body: { client_id?: string | null }) =>
      apiCall<CadencePreviewItem[]>(`/ai-preview/cadence`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

// Agent playbook overlay
export interface PlaybookRequirement {
  id: string;
  requirement_key: string;
  label: string;
  // Widened to the 12-value closed taxonomy in alembic 0038 (the old
  // narrow set fact/document/appointment/agreement/task is remapped
  // by the migration). Treat as opaque string in the type; render with
  // DS_CATEGORY_META from lib/types for display.
  category: string;
  required_level: "required" | "recommended" | "optional";
  applies_when: Record<string, unknown> | null;
  blocks_stage: string | null;
  visibility: string[];
  can_agent_override: boolean;
  can_underwriter_waive: boolean;
  verification_required: boolean;
  expiration_days: number | null;
  ai_request_message_template: string | null;
  display_order: number;
  // AI Deal Secretary fields (alembic 0038). Optional on the wire so
  // older Settings responses still type-check.
  default_owner_type?: string;
  default_channels?: string[];
  default_cadence_hours?: number;
  link_url?: string | null;
  link_label?: string | null;
  link_kind?: string | null;
  objective_text?: string;
  completion_criteria?: string;
  completion_mode?: string;
  wrong_upload_response_template?: string | null;
  // Timeline + grouping (alembic 0040)
  depends_on?: string[];
  parent_key?: string | null;
  inferred_depends_on?: string[];
  deps_confirmed?: boolean;
}

export interface AgentPlaybook {
  playbook_type: string;
  platform_id: string | null;
  platform_version: number | null;
  agent_id: string | null;
  agent_version: number | null;
  rules: Record<string, unknown>;
  platform_requirements: PlaybookRequirement[];
  agent_requirements: PlaybookRequirement[];
}

export function useAgentPlaybook(playbookType: "buyer" | "seller" | "cadence") {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["agentPlaybook", playbookType],
    queryFn: () => apiCall<AgentPlaybook>(`/me/ai-playbook/${playbookType}`),
    retry: aiQueryRetry,
  });
}

export function useUpsertAgentRequirement(playbookType: "buyer" | "seller") {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PlaybookRequirement> & { requirement_key: string; label: string; category: string; required_level: string }) =>
      apiCall<PlaybookRequirement>(`/me/ai-playbook/${playbookType}/requirements`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentPlaybook", playbookType] });
    },
  });
}

export function useDeleteAgentRequirement(playbookType: "buyer" | "seller") {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requirementId: string) =>
      apiCall<{ ok: boolean }>(`/me/ai-playbook/${playbookType}/requirements/${requirementId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentPlaybook", playbookType] });
    },
  });
}

export function usePatchAgentPlaybookRules(playbookType: "buyer" | "seller" | "cadence") {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: Record<string, unknown>) =>
      apiCall<AgentPlaybook>(`/me/ai-playbook/${playbookType}/rules`, {
        method: "PATCH",
        body: JSON.stringify({ rules }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentPlaybook", playbookType] });
    },
  });
}

// Agent cadence rules
export interface AgentCadenceRule {
  id: string;
  trigger_event: string;
  applies_to_requirement_key: string | null;
  condition: Record<string, unknown> | null;
  wait_hours: number;
  action_type: string;
  approval_required: boolean;
  message_template: string | null;
  visibility: string;
  is_active: boolean;
  requires_ai_owner?: boolean;
}

export function useAgentCadenceRules() {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["agentCadenceRules"],
    queryFn: () => apiCall<AgentCadenceRule[]>(`/me/ai-playbook/cadence/rules`),
    retry: aiQueryRetry,
  });
}

export function useUpsertAgentCadenceRule() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AgentCadenceRule> & { trigger_event: string; action_type: string }) =>
      apiCall<AgentCadenceRule>(`/me/ai-playbook/cadence/rules`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentCadenceRules"] });
    },
  });
}

export function useDeleteAgentCadenceRule() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      apiCall<{ ok: boolean }>(`/me/ai-playbook/cadence/rules/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentCadenceRules"] });
    },
  });
}

// ── Lending admin (Phase 3) ────────────────────────────────────────

export interface LendingPlaybook {
  id: string;
  owner_type: string;
  owner_id: string | null;
  playbook_type: string;
  product_key: string | null;
  name: string;
  description: string | null;
  rules: Record<string, unknown>;
  version: number;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useLendingPlaybooks(playbookType?: string) {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["lendingPlaybooks", playbookType ?? null],
    queryFn: () =>
      apiCall<LendingPlaybook[]>(
        `/lending-admin/playbooks${playbookType ? `?playbook_type=${playbookType}` : ""}`,
      ),
    retry: aiQueryRetry,
  });
}

export function useCreateLendingPlaybook() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<LendingPlaybook>) =>
      apiCall<LendingPlaybook>(`/lending-admin/playbooks`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lendingPlaybooks"] }),
  });
}

export function useUpdateLendingPlaybook() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string; rules?: Record<string, unknown>; fork?: boolean }) =>
      apiCall<LendingPlaybook>(`/lending-admin/playbooks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lendingPlaybooks"] }),
  });
}

export function usePublishLendingPlaybook() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (playbookId: string) =>
      apiCall<LendingPlaybook>(`/lending-admin/playbooks/${playbookId}/publish`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lendingPlaybooks"] }),
  });
}

export function useDuplicatePlatformPlaybook() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ platformPlaybookId, name }: { platformPlaybookId: string; name?: string }) =>
      apiCall<LendingPlaybook>(
        `/lending-admin/playbooks/duplicate-from-platform/${platformPlaybookId}${name ? `?name=${encodeURIComponent(name)}` : ""}`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lendingPlaybooks"] }),
  });
}

export function useLendingPlaybookRequirements(playbookId: string | null | undefined) {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["lendingPlaybookReqs", playbookId],
    queryFn: () => apiCall<PlaybookRequirement[]>(`/lending-admin/playbooks/${playbookId}/requirements`),
    enabled: !!playbookId,
    retry: aiQueryRetry,
  });
}

export function useUpsertLendingRequirement(playbookId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PlaybookRequirement> & { requirement_key: string; label: string; category: string; required_level: string }) =>
      apiCall<PlaybookRequirement>(`/lending-admin/playbooks/${playbookId}/requirements`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lendingPlaybookReqs", playbookId] }),
  });
}

export function useDeleteLendingRequirement(playbookId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requirementId: string) =>
      apiCall<{ ok: boolean }>(
        `/lending-admin/playbooks/${playbookId}/requirements/${requirementId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lendingPlaybookReqs", playbookId] }),
  });
}

// AI Deal Secretary — Phase B: Claude-driven dependency inference
// against a whole playbook. Operator clicks "Run AI inference" → backend
// asks Claude to suggest depends_on + parent_key per row, writes those
// into inferred_depends_on / parent_key + flips deps_confirmed=false.
// Operator then accepts/rejects per row via useConfirmInferredDeps.
export interface InferredDepsRow {
  requirement_key: string;
  suggested_depends_on: string[];
  suggested_parent_key: string | null;
  rationale: string | null;
}
export interface InferDepsResponse {
  playbook_id: string;
  inferred: InferredDepsRow[];
  applied_to_db: boolean;
}

export function useInferPlaybookDeps(playbookId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<InferDepsResponse>(
        `/lending-admin/playbooks/${playbookId}/infer-deps`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lendingPlaybookReqs", playbookId] }),
  });
}

export function useConfirmInferredDeps(playbookId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { requirement_key: string; accept_depends_on?: boolean; accept_parent_key?: boolean }) =>
      apiCall<{ ok: boolean }>(
        `/lending-admin/playbooks/${playbookId}/confirm-inferred`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lendingPlaybookReqs", playbookId] }),
  });
}

// Funding cadence rules
export function useFundingCadenceRules() {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["fundingCadenceRules"],
    queryFn: () => apiCall<AgentCadenceRule[]>(`/lending-admin/cadence-rules`),
    retry: aiQueryRetry,
  });
}

export function useUpsertFundingCadenceRule() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AgentCadenceRule> & { trigger_event: string; action_type: string }) =>
      apiCall<AgentCadenceRule>(`/lending-admin/cadence-rules`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fundingCadenceRules"] }),
  });
}

export function useDeleteFundingCadenceRule() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      apiCall<{ ok: boolean }>(`/lending-admin/cadence-rules/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fundingCadenceRules"] }),
  });
}

// Verification / Escalation / Communication rules — JSONB blobs
export function useFundingMetaRules(kind: "verification" | "escalation" | "communication") {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["fundingMetaRules", kind],
    queryFn: () => apiCall<{ playbook_id: string; rules: Record<string, unknown> }>(`/lending-admin/${kind}-rules`),
    retry: aiQueryRetry,
  });
}

export function usePatchFundingMetaRules(kind: "verification" | "escalation" | "communication") {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: Record<string, unknown>) =>
      apiCall<{ playbook_id: string; rules: Record<string, unknown> }>(`/lending-admin/${kind}-rules`, {
        method: "PATCH",
        body: JSON.stringify({ rules }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fundingMetaRules", kind] }),
  });
}

// Audit feed
export interface AuditEvent {
  id: string;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  client_id: string | null;
  loan_id: string | null;
  playbook_id: string | null;
  requirement_key: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export function useAuditEvents(filter: {
  client_id?: string;
  loan_id?: string;
  playbook_id?: string;
  event_type?: string;
  limit?: number;
} = {}) {
  const apiCall = useAuthedApi();
  const qs = new URLSearchParams();
  Object.entries(filter).forEach(([k, v]) => v !== undefined && v !== null && qs.append(k, String(v)));
  return useQuery({
    queryKey: ["auditEvents", filter],
    queryFn: () => apiCall<AuditEvent[]>(`/lending-admin/audit?${qs.toString()}`),
    retry: aiQueryRetry,
  });
}


// ── Client Properties (alembic 0034) ────────────────────────────────

export interface ClientProperty {
  id: string;
  client_id: string;
  side: "buyer_target" | "seller_listing";
  status: "active" | "offered" | "under_contract" | "listed" | "sold" | "dropped" | "archived";
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_type: string | null;
  target_price: string | null;  // Decimal serialized as string
  list_price: string | null;
  sold_price: string | null;
  bedrooms: number | null;
  bathrooms: string | null;
  sqft: number | null;
  units: number | null;
  notes: string | null;
  linked_loan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPropertyInput {
  side: "buyer_target" | "seller_listing";
  status?: ClientProperty["status"];
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  property_type?: string | null;
  target_price?: number | null;
  list_price?: number | null;
  sold_price?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  units?: number | null;
  notes?: string | null;
  linked_loan_id?: string | null;
}

export function useClientProperties(clientId: string | null | undefined) {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["clientProperties", clientId],
    queryFn: () => apiCall<ClientProperty[]>(`/clients/${clientId}/properties`),
    enabled: !!clientId,
    retry: aiQueryRetry,
  });
}

export function useCreateClientProperty(clientId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ClientPropertyInput) =>
      apiCall<ClientProperty>(`/clients/${clientId}/properties`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientProperties", clientId] }),
  });
}

export function useUpdateClientProperty(clientId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ propertyId, ...body }: { propertyId: string } & Partial<ClientPropertyInput>) =>
      apiCall<ClientProperty>(`/clients/${clientId}/properties/${propertyId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientProperties", clientId] }),
  });
}

export function useDeleteClientProperty(clientId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (propertyId: string) =>
      apiCall<void>(`/clients/${clientId}/properties/${propertyId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientProperties", clientId] }),
  });
}


// Free-form agent note — appends a known_fact with source=agent.
export function useAddAgentNote(clientId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, field }: { text: string; field?: string }) =>
      apiCall<{ ok: boolean }>(`/clients/${clientId}/notes`, {
        method: "POST",
        body: JSON.stringify({ text, field }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
    },
  });
}


// Log a call / SMS / meeting / note against a client.
export function useLogClientEngagement(clientId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, summary, payload }: { kind: string; summary: string; payload?: Record<string, unknown> }) =>
      apiCall<unknown>(`/clients/${clientId}/engagement`, {
        method: "POST",
        body: JSON.stringify({ kind, summary, payload }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagement", clientId] });
    },
  });
}


// ────────────────────────────────────────────────────────────────────
// AI Deal Secretary (Phase 1) — workbench picker, wizard step 4,
// pipeline summary. Mirrors /api/v1 deal-secretary endpoints.
// ────────────────────────────────────────────────────────────────────

import type {
  DSAssignRequest,
  DSAssignmentUpdateRequest,
  DSBootstrapResponse,
  DSDealSecretaryView,
  DSFileSettings,
  DSFileSettingsUpdate,
  DSTaskRow,
  DSWizardIntentRequest,
  DSWizardIntentResponse,
} from "@/lib/types";

export function useDealSecretary(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["deal-secretary", loanId ?? "", devUser],
    queryFn: () => apiCall<DSDealSecretaryView>(`/loans/${loanId}/deal-secretary`),
    enabled: !!loanId,
    retry: aiQueryRetry,
  });
}

export function useAssignToAI(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DSAssignRequest) =>
      apiCall<DSTaskRow>(`/loans/${loanId}/deal-secretary/assign`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-secretary", loanId] });
    },
  });
}

export function useUnassignFromAI(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requirement_key: string) =>
      apiCall<DSTaskRow>(`/loans/${loanId}/deal-secretary/unassign`, {
        method: "POST",
        body: JSON.stringify({ requirement_key }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-secretary", loanId] });
    },
  });
}

export function useUpdateAssignment(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assignment_id, ...body }: DSAssignmentUpdateRequest & { assignment_id: string }) =>
      apiCall<DSTaskRow>(
        `/loans/${loanId}/deal-secretary/assignments/${assignment_id}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-secretary", loanId] });
    },
  });
}

export function useUpdateFileSettings(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DSFileSettingsUpdate) =>
      apiCall<DSFileSettings>(`/loans/${loanId}/deal-secretary/file-settings`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-secretary", loanId] });
    },
  });
}

// AI clarifying questions — the 3rd mode in the Loan Chat container.
// Phase A returns []; Phase B has Claude populate when the AI needs
// context before contacting the borrower.
export interface DSAIQuestion {
  id: string;
  requirement_key: string | null;
  question: string;
  context: string | null;
  created_at: string;
  answered_at: string | null;
  answer: string | null;
}
export function useAIQuestions(loanId: string | null | undefined) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["ai-questions", loanId ?? "", devUser],
    queryFn: () => apiCall<DSAIQuestion[]>(`/loans/${loanId}/deal-secretary/ai-questions`),
    enabled: !!loanId,
    retry: aiQueryRetry,
  });
}
export function useAnswerAIQuestion(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ question_id, answer }: { question_id: string; answer: string }) =>
      apiCall<{ ok: boolean }>(
        `/loans/${loanId}/deal-secretary/ai-questions/${question_id}/answer`,
        { method: "POST", body: JSON.stringify({ answer }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-questions", loanId] });
    },
  });
}

// Create an ad-hoc task on a loan — NOT tied to a playbook. Useful for
// one-off workflow items the agent/operator adds mid-deal ("follow up
// about tenant leaving on the 1st", "confirm construction finish").
// Lands as a real CRS row with source='client_custom' so it shows on
// the timeline alongside playbook tasks.
export interface DSCustomTaskCreate {
  label: string;
  owner_type?: "human" | "ai" | "shared";
  objective_text?: string;
  completion_criteria?: string;
  parent_key?: string | null;
  depends_on?: string[];
  category?: import("@/lib/types").DSRequirementCategory;
  due_at?: string | null;
}
export function useCreateCustomTask(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DSCustomTaskCreate) =>
      apiCall<import("@/lib/types").DSTaskRow>(
        `/loans/${loanId}/deal-secretary/custom-task`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-secretary", loanId] });
      qc.invalidateQueries({ queryKey: ["deal-secretary-summary"] });
    },
  });
}

export function useBootstrapDealSecretary(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<DSBootstrapResponse>(`/loans/${loanId}/deal-secretary/bootstrap`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-secretary", loanId] });
    },
  });
}

// One-click "Start AI Secretary". Flips outreach_mode to portal_auto
// (or whatever's passed) AND fires first-touch outreach immediately
// for every AI-owned task — no 30-min cron wait.
export interface DSStartResponse {
  outreach_mode: string;
  fired_count: number;
  skipped_count: number;
  skipped: string[];
}
export function useStartAISecretary(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode?: import("@/lib/types").DSOutreachMode) =>
      apiCall<DSStartResponse>(`/loans/${loanId}/deal-secretary/start`, {
        method: "POST",
        body: JSON.stringify(mode ? { mode } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-secretary", loanId] });
      qc.invalidateQueries({ queryKey: ["deal-secretary-summary"] });
    },
  });
}

export function usePauseAISecretary(loanId: string) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiCall<import("@/lib/types").DSFileSettings>(
        `/loans/${loanId}/deal-secretary/pause`, { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-secretary", loanId] });
      qc.invalidateQueries({ queryKey: ["deal-secretary-summary"] });
    },
  });
}

export interface DSPipelineSummaryItem {
  loan_id: string;
  outreach_mode: string;
  ai_task_count: number;
  ai_completed_count: number;
  blocked_count: number;
  next_outreach_at: string | null;
  current_blocker: string | null;
  state: "setup" | "active_work" | "waiting_borrower" | "blocked";
}

export function useDealSecretarySummary(loanIds: string[]) {
  const devUser = useDevUser();
  const apiCall = useAuthedApi();
  const csv = loanIds.join(",");
  return useQuery({
    queryKey: ["deal-secretary-summary", csv, devUser],
    queryFn: () =>
      apiCall<DSPipelineSummaryItem[]>(`/pipeline/deal-secretary-summary?loan_ids=${csv}`),
    enabled: loanIds.length > 0,
    retry: aiQueryRetry,
  });
}

// Used by AgentLeadModal Step 4 + SmartIntakeModal Step 3 to buffer
// pre-loan picks. The client_id only exists AFTER the parent create
// call succeeds, so it's a mutation arg rather than a hook param.
// Materializes into real AITaskAssignment rows when the prequal
// eventually spawns a Loan (see qcbackend's
// app/services/ai/deal_secretary.materialize_pending_assignments).
export function useBufferWizardIntent() {
  const apiCall = useAuthedApi();
  return useMutation({
    mutationFn: ({ clientId, body }: { clientId: string; body: DSWizardIntentRequest }) =>
      apiCall<DSWizardIntentResponse>(
        `/clients/${clientId}/deal-secretary/wizard-intent`,
        { method: "POST", body: JSON.stringify(body) },
      ),
  });
}
