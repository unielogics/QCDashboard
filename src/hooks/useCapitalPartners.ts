// Capital Partners (Rule 506(b) loan participations): the desk's side.
//
// Mirrors app/capital_partners/{schemas,router_admin}.py in qcbackend. Every
// route here is super-admin only on the server; the pages guard the UI too.
// Decimals arrive as strings and stay strings until formatted.

import type { RepaymentConfig } from "@/lib/loanSchedule";
import type { MarketplacePublishIssue } from "@/lib/marketplaceIssues";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";

export type CpVertical = "real_estate" | "auto" | "business";
export type CpListingStatus = "draft" | "open" | "closing" | "fully_subscribed" | "funded" | "repaid" | "workout" | "withdrawn";
export type CpListingOutcome = "performing" | "repaid_in_full" | "repaid_after_extension" | "in_workout";
export type CpMemberStatus = "requested" | "questionnaire" | "under_review" | "waiting" | "approved" | "suspended";
export type CpSubscriptionStatus = "requested" | "documents_sent" | "signed" | "funded" | "cancelled" | "declined";
export type CpServicerStatus = "current" | "late" | "paid_in_full" | "in_workout";
export type CpTransferStatus = "listed" | "requested" | "pending_consent" | "approved" | "completed" | "withdrawn" | "declined";
export type CpFilingKind = "form_d" | "form_d_amendment" | "state_notice" | "bad_actor_check";
export type CpFilingStatus = "due" | "filed" | "not_required" | "cleared" | "pending";
export type CpDocumentKind = "ppm" | "subscription_agreement" | "note" | "valuation" | "title" | "servicing_summary" | "executive_summary" | "underwriting_package" | "investor_presentation" | "other";

export interface CpAccessRequest {
  id: string; investing_as: string; entity_name: string | null; capital_band: string; source: string; full_name: string; email: string;
  phone: string; note: string | null; locale: string; status: "new" | "contacted" | "invited" | "declined"; emailed: boolean;
  invited_user_id: string | null; handled_by_id: string | null; handled_at: string | null; handled_note: string | null; created_at: string;
}
export interface CpEntity { id: string; name: string; kind: string; state: string | null; accreditation_basis: string | null; status: string; is_default: boolean }
export interface CpGateStep { key: string; title: string; state: "done" | "now" | "later" }
export interface CpGate {
  status: string; cleared: boolean; steps: CpGateStep[]; relationship_established_at: string | null; waiting_period_days: number | null;
  waiting_period_ends_at: string | null; waiting_days_left: number | null; waiting_pct: number | null; suspended: boolean;
}
export interface CpQuestionnaire {
  id: string; version: number; answers: Record<string, unknown>; basis: string | null; investing_as: string | null;
  state_of_residence: string | null; submitted_at: string; outcome: string; review_notes: string | null;
}
export interface CpMember {
  id: string; user_id: string; email: string; name: string; status: CpMemberStatus; investing_as: string | null; display_name: string | null;
  phone: string | null; state_of_residence: string | null; capital_band: string | null; source: string | null;
  relationship_established_at: string | null; waiting_period_days: number | null; waiting_period_ends_at: string | null; approved_at: string | null;
  accreditation_basis: string | null; review_notes: string | null; suspended_at: string | null; suspended_reason: string | null; invited_at: string | null;
  created_at: string; entities: CpEntity[]; latest_questionnaire: CpQuestionnaire | null; subscriptions_count: number; participations_count: number; gate: CpGate;
}
export interface CpSourceRow {
  kind: string; id: string; ref: string | null; name: string; vertical: CpVertical; vertical_label: string | null; amount: string | null;
  approved_amount: string | null; funded_amount: string | null; status: string | null; loan_id: string | null; profile_id: string | null;
  updated_at: string | null; already_listed_ref: string | null;
}
export interface CpListingRef { id: string; ref: string; status: CpListingStatus; name: string }
/** One product offered on a listing: a program with suggested amount, rate and term; the primary one supplies the headline terms. */
export interface CpListingProduct {
  financing_source?: "canonical_financing" | null;
  coverage_payment_monthly?: number | null; interest_only_payment_monthly?: number | null; repayment_payment_monthly?: number | null; maturity_balance?: number | null;
  program_key: string | null; label: string; amount: number | string | null; rate_pct: number | string | null; factor_rate?: number | string | null;
  term_months: number | null; interest_only?: boolean; structure?: "amortizing" | "simple_interest" | "interest_only" | null; interest_only_months?: number | null; repayment_config?: RepaymentConfig | null; payments_per_year?: number | null; payment_frequency: "monthly" | "weekly" | "biweekly" | "daily" | "custom" | null; monthly_payment: number | string | null; dscr: number | string | null;
  notes: string | null; primary: boolean;
}
export type CpListingAiDraft = {
  draft_id: string; status: "ai_draft" | "file_prefill"; profile_id: string | null; loan_id: string | null;
  existing_listing?: CpListingRef | null; source_fingerprint: string; deal_budget_revision: number;
  draft: { name: string; summary: string; loan_amount: string | number | null; offered_amount: string | number | null; minimum_investment: string | number | null; program_label: string | null; city: string | null; state: string | null };
  field_provenance: Array<{ field: string; source: string; explanation: string }>;
  missing: string[]; warnings: string[]; preserved_fields: string[];
};
export function useCpListingAiDraft() {
  const api = useAuthedApi();
  return useMutation({ mutationFn: (body: { profile_id?: string; loan_id?: string; intake_id?: string; listing_id?: string; expected_deal_budget_revision?: number; current_title?: string; current_summary?: string; preserve_title?: boolean; preserve_summary?: boolean }) => api<CpListingAiDraft>("/capital/admin/listings/ai-draft", { method: "POST", body: JSON.stringify(body) }) });
}
export interface CpOfferSuggestion {
  coverage_payment_monthly?: number | null; interest_only_payment_monthly?: number | null; repayment_payment_monthly?: number | null; maturity_balance?: number | null;
  program_key: string | null; label: string; eligible: boolean | null; amount: number | null; rate_pct: number | null; factor_rate: number | null; term_months: number;
  interest_only?: boolean; structure?: string | null; interest_only_months?: number | null; repayment_config?: RepaymentConfig | null; payments_per_year?: number | null; payment_frequency: string; monthly_payment: number | null; dscr: number | null; dscr_status: string; affordable_amount: number | null; room_monthly: number | null;
  requested_amount: number | null; requested_monthly_payment: number | null; requested_dscr: number | null; requested_dscr_status: string;
  bounds: { min_amount: number | null; max_amount: number | null; min_term: number | null; max_term: number | null; pricing_basis: string | null; published: boolean };
  reason: string | null; reading: string;
}
export interface CpOfferSuggestions {
  profile_id: string; income_annual: number | null; income_basis: string | null; income_label: string | null; existing_debt_service_monthly: number | null;
  debt_service_source: string | null; target_dscr: number; requested_amount: number | null; products: CpOfferSuggestion[];
  plan_active?: boolean; payoff_total?: number | null; interest_only?: boolean;
  /** The loan the desk's plan carries: amount, rate, term, interest-only and its payment. */
  plan_loan?: { repayment_config?: RepaymentConfig | null; amount: number; rate_pct: number; term_months: number | null; interest_only: boolean; payment_monthly: number | null; source: string | null } | null;
}
/** What the listing carries against the file now: published, up to date, and which sections moved since the last push. */
export interface CpSyncState {
  published: boolean; published_at: string | null; published_by?: string | null; up_to_date: boolean;
  changed: { key: string; label: string }[]; listing_status?: string;
  package?: { generation_id?: string | null; at?: string | null; documents?: { kind: string; document_id: string; version: number }[] } | null;
}
/** What the file page asks before offering "Publish to marketplace". */
export interface CpSourceLookup { profile_id: string | null; loan_id: string | null; listing: CpListingRef | null; underwriting_status: string | null; has_term_sheet: boolean; sync?: CpSyncState | null }
/** Scoped underwriting read model; no marketplace administration capability. */
export interface CpProfilePublication { profile_id: string; listing: (CpListingRef & { published_at: string | null }) | null; can_manage: boolean }
export interface CpDocument { id: string; kind: CpDocumentKind; kind_label: string; name: string; content_type: string | null; size_bytes: number | null; version: number; status: string; source?: "generated_package" | "uploaded" }
export interface CpListingCard {
  id: string; ref: string; name: string; vertical: CpVertical; vertical_label: string; program_label: string; city: string | null; state: string | null;
  place: string | null; collateral_type: string | null; lien_position: "first" | "second"; note_rate_pct: string | null; term_months: number | null;
  ltv_pct: string | null; ltv_kind: "ltv" | "ltc" | "cltv"; minimum_investment: string | null; loan_amount: string | null; offered_amount: string | null;
  committed_amount: string; remaining_amount: string; pct_committed: number; payment_frequency: "monthly" | "quarterly" | "at_maturity";
  personal_guarantee: boolean; status: CpListingStatus; outcome: CpListingOutcome | null; opens_at: string | null; closes_at: string | null;
  days_left: number | null; funded_at: string | null; repaid_at: string | null; maturity_date: string | null; expected_funding_date?: string | null; maturity_date_mode?: "automatic" | "manual"; date_note?: string; published_at: string | null; products: CpListingProduct[];
}
export interface CpSubscription {
  id: string; listing_id: string; listing_ref: string | null; listing_name: string | null; entity_id: string | null; entity_name: string | null;
  amount: string; status: CpSubscriptionStatus; requested_at: string; documents_sent_at: string | null; signed_at: string | null; funded_at: string | null;
  funded_amount: string | null; member_id: string; member_name: string | null; member_email: string | null; member_state: string | null;
  ack_ppm: boolean; ack_accredited: boolean; acknowledged_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
  declined_at: string | null; admin_notes: string | null;
}
export interface CpParticipation {
  id: string; listing_id: string; listing_ref: string; listing_name: string; vertical: CpVertical; vertical_label: string; note_rate_pct: string | null;
  entity_id: string | null; entity_name: string | null; invested_amount: string; principal_outstanding: string; interest_received_ytd: string;
  interest_received_total: string; next_payment_on: string | null; servicer_status: CpServicerStatus; status_as_of: string | null; funded_at: string | null;
  closed_at: string | null; maturity_date: string | null; transferable: boolean; member_id: string; member_name: string | null; member_email: string | null; subscription_id: string;
}
export interface CpListingEvent { id: string; kind: string; actor_user_id: string | null; detail: Record<string, unknown>; occurred_at: string }
export interface CpListing extends CpListingCard {
  summary: string | null; guarantee_text: string | null; borrower_track_record: string | null; exit_plan: string | null; valuation_amount: string | null;
  valuation_source: string | null; title_status: string | null; servicer_label: string | null; documents: CpDocument[]; can_subscribe: boolean;
  source_kind: string; loan_id: string | null; profile_id: string | null; first_sale_at: string | null; published_by_id: string | null; publish_reason: string | null; sync?: CpSyncState | null;
  withdrawn_at: string | null; withdrawn_reason: string | null; source_snapshot: Record<string, unknown>; created_by_id: string | null; created_at: string;
  updated_at: string; investor_count: number; subscriptions: CpSubscription[]; participations: CpParticipation[]; events: CpListingEvent[]; publish_blockers: string[]; publish_issues?: MarketplacePublishIssue[];
}
export type CpListingPatch = Partial<{
  expected_deal_budget_revision: number; ai_draft_id: string; expected_source_fingerprint: string;
  source_kind: "loan" | "profile" | "manual"; loan_id: string | null; profile_id: string | null; vertical: CpVertical; program_label: string; name: string;
  summary: string | null; city: string | null; state: string | null; collateral_type: string | null; lien_position: "first" | "second"; note_rate_pct: string | null;
  term_months: number | null; ltv_pct: string | null; ltv_kind: "ltv" | "ltc" | "cltv"; loan_amount: string | null; offered_amount: string | null;
  minimum_investment: string | null; payment_frequency: "monthly" | "quarterly" | "at_maturity"; personal_guarantee: boolean; guarantee_text: string | null;
  borrower_track_record: string | null; exit_plan: string | null; valuation_amount: string | null; valuation_source: string | null; title_status: string | null;
  servicer_label: string | null; maturity_date: string | null; expected_funding_date: string | null; maturity_date_mode: "automatic" | "manual"; closes_at: string | null; source_snapshot: Record<string, unknown>; products: CpListingProduct[];
}>;
export interface CpTransfer {
  id: string; ref: string; listing_id: string; listing_ref: string; listing_name: string; vertical: CpVertical; vertical_label: string; principal_amount: string;
  note_rate_pct: string | null; remaining_term_months: number | null; ask_pct: string; implied_yield_pct: string | null; listed_at: string; status: CpTransferStatus;
  participation_id: string; seller_member_id: string; seller_name: string | null; buyer_member_id: string | null; buyer_name: string | null;
  requested_at: string | null; consented_at: string | null; completed_at: string | null; declined_at: string | null; withdrawn_at: string | null; notes: string | null;
}
export interface CpFiling {
  id: string; kind: CpFilingKind; listing_id: string | null; listing_ref: string | null; listing_name: string | null; investor_count: number | null; state: string | null;
  subject: string | null; subject_role: string | null; first_sale_at: string | null; due_at: string | null; filed_at: string | null; checked_at: string | null;
  status: CpFilingStatus; fee_amount: string | null; reference: string | null; sources: string | null; notes: string | null; created_at: string; updated_at: string;
}
export interface CpFilingsSummary {
  form_d_due: number; form_d_next_due: string | null; state_notices_due: number; state_notice_next_due: string | null; covered_persons: number;
  covered_persons_cleared: number; amendment_next_due: string | null; overdue: number; controls: { label: string; value: string }[];
}
export interface CpIssuer {
  issuer_name: string | null; cik: string | null; edgar_status: string; edgar_access_granted_at: string | null; admin_count: number;
  default_waiting_period_days: number; servicer_label: string; notify_emails: string[]; wiring_instructions: string | null; updated_at: string;
}

const KEYS = {
  listings: ["cp-listings"] as const,
  listing: (id: string) => ["cp-listing", id] as const,
  members: ["cp-members"] as const,
  member: (id: string) => ["cp-member", id] as const,
  accessRequests: ["cp-access-requests"] as const,
  sources: ["cp-sources"] as const,
  subscriptions: ["cp-subscriptions"] as const,
  transfers: ["cp-transfers"] as const,
  filings: ["cp-filings"] as const,
  filingsSummary: ["cp-filings-summary"] as const,
  issuer: ["cp-issuer"] as const,
};

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: readonly (readonly string[])[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [...k] }));
}

// Access requests -----------------------------------------------------------

export function useCpAccessRequests(status?: string) {
  const api = useAuthedApi();
  return useQuery({ queryKey: [...KEYS.accessRequests, status ?? "all"], queryFn: () => api<CpAccessRequest[]>(`/capital/admin/access-requests${qs({ status_filter: status })}`), staleTime: 15_000 });
}
export function useCpAccessRequestAction() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "contacted" | "decline" | "invite"; note?: string | null }) =>
      api<CpAccessRequest | { ok: boolean; user_id: string; member_id: string; invitation_sent: boolean; message: string }>(
        `/capital/admin/access-requests/${id}/${action}`, { method: "POST", body: JSON.stringify(action === "invite" ? {} : { note: note ?? null }) }),
    onSuccess: () => invalidate(KEYS.accessRequests, KEYS.members),
  });
}
export function useCpInviteByEmail() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { email: string; name: string }) =>
      api<{ ok: boolean; user_id: string; member_id: string; invitation_sent: boolean; message: string }>("/capital/admin/members/invite", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => invalidate(KEYS.members, KEYS.accessRequests),
  });
}

// Members -------------------------------------------------------------------

export function useCpMembers(params: { status?: string; q?: string } = {}) {
  const api = useAuthedApi();
  return useQuery({ queryKey: [...KEYS.members, params.status ?? "all", params.q ?? ""], queryFn: () => api<CpMember[]>(`/capital/admin/members${qs({ status_filter: params.status, q: params.q })}`), staleTime: 15_000 });
}
export function useCpMember(id: string | null) {
  const api = useAuthedApi();
  return useQuery({ enabled: !!id, queryKey: KEYS.member(id ?? ""), queryFn: () => api<CpMember>(`/capital/admin/members/${id}`) });
}
export function useCpReviewMember() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; decision: "approve" | "needs_changes" | "suspend" | "reinstate"; notes?: string | null; relationship_established_at?: string | null; waiting_period_days?: number | null; accreditation_basis?: string | null }) =>
      api<CpMember>(`/capital/admin/members/${id}/review`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (_d, v) => invalidate(KEYS.members, KEYS.member(v.id), KEYS.filingsSummary),
  });
}

// Sources, prefill, listings ------------------------------------------------

export function useCpSources(params: { q?: string; vertical?: string; include_all?: boolean }, enabled = true) {
  const api = useAuthedApi();
  return useQuery({ enabled, queryKey: [...KEYS.sources, params.q ?? "", params.vertical ?? "all", params.include_all ?? false], queryFn: () => api<CpSourceRow[]>(`/capital/admin/sources${qs({ q: params.q, vertical: params.vertical ?? "all", include_all: params.include_all ?? false })}`), staleTime: 30_000 });
}
export type CpPrefillBody = { loan_id?: string | null; profile_id?: string | null; intake_id?: string | null };
export type CpPrefillDraft = CpListingPatch & { source_snapshot?: Record<string, unknown>; existing_listing?: CpListingRef | null };
export function useCpPrefill() {
  const api = useAuthedApi();
  return useMutation({ mutationFn: (body: CpPrefillBody) => api<CpPrefillDraft>("/capital/admin/listings/prefill", { method: "POST", body: JSON.stringify(body) }) });
}
export function useCpSuggestTerms(profileId: string | null | undefined, programKeys: string[] | null, enabled = true) {
  const api = useAuthedApi();
  const keys = programKeys && programKeys.length ? programKeys.join(",") : undefined;
  return useQuery({
    enabled: enabled && !!profileId,
    queryKey: [...KEYS.sources, "suggest", profileId ?? "", keys ?? ""],
    queryFn: () => api<CpOfferSuggestions>(`/capital/admin/sources/suggest-terms${qs({ profile_id: profileId ?? undefined, program_keys: keys })}`),
    staleTime: 30_000,
  });
}
export function useCpSourceLookup(params: { profile_id?: string | null; loan_id?: string | null }, enabled = true) {
  const api = useAuthedApi();
  const ready = enabled && !!(params.profile_id || params.loan_id);
  return useQuery({
    enabled: ready,
    queryKey: [...KEYS.sources, "lookup", params.profile_id ?? "", params.loan_id ?? ""],
    queryFn: () => api<CpSourceLookup>(`/capital/admin/sources/lookup${qs({ profile_id: params.profile_id ?? undefined, loan_id: params.loan_id ?? undefined })}`),
    staleTime: 15_000,
  });
}
export function useCpProfilePublication(profileId: string | null | undefined, enabled = true) {
  const api = useAuthedApi();
  return useQuery({
    enabled: enabled && !!profileId,
    queryKey: [...KEYS.sources, "publication", profileId ?? ""],
    queryFn: () => api<CpProfilePublication>(`/application-profiles/${encodeURIComponent(profileId!)}/marketplace-publication`),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
export function useCpListings(status?: string) {
  const api = useAuthedApi();
  return useQuery({ queryKey: [...KEYS.listings, status ?? "all"], queryFn: () => api<CpListingCard[]>(`/capital/admin/listings${qs({ status_filter: status })}`), staleTime: 15_000 });
}
export function useCpListing(id: string | null) {
  const api = useAuthedApi();
  return useQuery({ enabled: !!id, queryKey: KEYS.listing(id ?? ""), queryFn: () => api<CpListing>(`/capital/admin/listings/${id}`) });
}
export function useCpCreateListing() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: CpListingPatch) => api<CpListing>("/capital/admin/listings", { method: "POST", body: JSON.stringify(body) }), onSuccess: () => invalidate(KEYS.listings, KEYS.sources) });
}
export function useCpPatchListing() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, ...body }: { id: string } & CpListingPatch) => api<CpListing>(`/capital/admin/listings/${id}`, { method: "PATCH", body: JSON.stringify(body) }), onSuccess: (_d, v) => invalidate(KEYS.listings, KEYS.listing(v.id)) });
}
/** publish | status | withdraw, plus every subscription and participation action: the backend answers with the whole listing. */
export function useCpListingAction() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ listingId, path, body }: { listingId: string; path: string; body?: unknown }) => api<CpListing>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
    onSuccess: (_d, v) => invalidate(KEYS.listings, KEYS.listing(v.listingId), KEYS.sources, KEYS.subscriptions, KEYS.filings, KEYS.filingsSummary, KEYS.transfers),
  });
}
export function useCpPatchParticipation() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, listingId: _l, ...body }: { id: string; listingId: string; principal_outstanding?: string; interest_received_ytd?: string; interest_received_total?: string; next_payment_on?: string | null; servicer_status?: CpServicerStatus; status_as_of?: string | null }) =>
      api<CpListing>(`/capital/admin/participations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_d, v) => invalidate(KEYS.listings, KEYS.listing(v.listingId)),
  });
}
export function useCpBulkParticipations() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (items: Array<{ id: string } & Record<string, unknown>>) => api<{ updated: number }>("/capital/admin/participations/bulk-status", { method: "POST", body: JSON.stringify({ items }) }), onSuccess: () => invalidate(KEYS.listings) });
}

// Documents -----------------------------------------------------------------

export function useCpUploadDocument() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ listingId, kind, file, name }: { listingId: string; kind: CpDocumentKind; file: File; name?: string }) => {
      const init = await api<{ document_id: string; upload_url: string; headers: Record<string, string>; s3_key: string }>(`/capital/admin/listings/${listingId}/documents/upload-init`, {
        method: "POST", body: JSON.stringify({ kind, name: name ?? file.name, content_type: file.type || "application/pdf", size_bytes: file.size }),
      });
      const put = await fetch(init.upload_url, { method: "PUT", body: file, headers: init.headers });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      return api<CpDocument>(`/capital/admin/listings/${listingId}/documents/upload-complete`, { method: "POST", body: JSON.stringify({ document_id: init.document_id }) });
    },
    onSuccess: (_d, v) => invalidate(KEYS.listing(v.listingId)),
  });
}
export function useCpSupersedeDocument() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ listingId, documentId }: { listingId: string; documentId: string }) => api<CpDocument>(`/capital/admin/listings/${listingId}/documents/${documentId}`, { method: "DELETE" }), onSuccess: (_d, v) => invalidate(KEYS.listing(v.listingId)) });
}

// Subscriptions, transfers, filings, issuer -----------------------------------

export function useCpSubscriptions(params: { status?: string; listing_id?: string } = {}) {
  const api = useAuthedApi();
  return useQuery({ queryKey: [...KEYS.subscriptions, params.status ?? "all", params.listing_id ?? ""], queryFn: () => api<CpSubscription[]>(`/capital/admin/subscriptions${qs({ status_filter: params.status, listing_id: params.listing_id })}`), staleTime: 15_000 });
}
export function useCpTransfers(status?: string) {
  const api = useAuthedApi();
  return useQuery({ queryKey: [...KEYS.transfers, status ?? "all"], queryFn: () => api<CpTransfer[]>(`/capital/admin/transfers${qs({ status_filter: status })}`), staleTime: 15_000 });
}
export function useCpTransferDecision() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, decision, notes }: { id: string; decision: "consent" | "decline" | "complete"; notes?: string | null }) => api<CpTransfer>(`/capital/admin/transfers/${id}/${decision}`, { method: "POST", body: JSON.stringify({ notes: notes ?? null }) }), onSuccess: () => invalidate(KEYS.transfers, KEYS.listings) });
}
export function useCpFilings(params: { kind?: string; listing_id?: string } = {}) {
  const api = useAuthedApi();
  return useQuery({ queryKey: [...KEYS.filings, params.kind ?? "all", params.listing_id ?? ""], queryFn: () => api<CpFiling[]>(`/capital/admin/filings${qs({ kind: params.kind, listing_id: params.listing_id })}`), staleTime: 15_000 });
}
export function useCpFilingsSummary() {
  const api = useAuthedApi();
  return useQuery({ queryKey: KEYS.filingsSummary, queryFn: () => api<CpFilingsSummary>("/capital/admin/filings/summary"), staleTime: 15_000 });
}
export function useCpCreateFiling() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: Partial<CpFiling> & { kind: CpFilingKind }) => api<CpFiling>("/capital/admin/filings", { method: "POST", body: JSON.stringify(body) }), onSuccess: () => invalidate(KEYS.filings, KEYS.filingsSummary) });
}
export function useCpPatchFiling() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, ...body }: { id: string } & Partial<CpFiling>) => api<CpFiling>(`/capital/admin/filings/${id}`, { method: "PATCH", body: JSON.stringify(body) }), onSuccess: () => invalidate(KEYS.filings, KEYS.filingsSummary) });
}
export function useCpIssuer() {
  const api = useAuthedApi();
  return useQuery({ queryKey: KEYS.issuer, queryFn: () => api<CpIssuer>("/capital/admin/issuer"), staleTime: 60_000 });
}
export function useCpSaveIssuer() {
  const api = useAuthedApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: Partial<CpIssuer>) => api<CpIssuer>("/capital/admin/issuer", { method: "PUT", body: JSON.stringify(body) }), onSuccess: () => invalidate(KEYS.issuer, KEYS.filingsSummary) });
}
