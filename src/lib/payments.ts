/**
 * Operator Payments API contract.
 *
 * Money-movement routes intentionally live in one module. The backend can
 * evolve its internal services without scattering Plaid or ledger paths
 * through the UI, and the UI never handles provider access tokens.
 */

export type PaymentFeeSource = "client_ach" | "bank_direct" | "external" | "deferred" | "waived";
export type FeeCollectionMode = "client_ach" | "bank_direct" | "split" | "waived";
export type PaymentPlanKind = "origination_fee" | "private_funding";
export type PaymentPlanStatus = "draft" | "awaiting_authorization" | "authorized" | "active" | "paused" | "completed" | "cancelled" | "superseded";
export type PaymentTransferStatus =
  | "not_started"
  | "authorizing"
  | "submitting"
  | "submitted"
  | "pending"
  | "posted"
  | "settled"
  | "funds_available"
  | "failed"
  | "returned"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "action_required";

export type FeeAllocation = {
  id: string | null;
  version: number;
  collection_mode: FeeCollectionMode;
  gross_fee: number;
  client_ach_amount: number;
  /** Exact component split. Older aggregate records may omit these fields. */
  origination_client_ach_amount?: number;
  consulting_client_ach_amount?: number;
  bank_direct_amount: number;
  external_amount: number;
  deferred_amount: number;
  waived_amount: number;
  unallocated_amount: number;
  is_balanced: boolean;
  is_current: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
};

export type FeeAllocationInput = Pick<
  FeeAllocation,
  "collection_mode" | "client_ach_amount" | "bank_direct_amount" | "external_amount" | "deferred_amount" | "waived_amount"
> & {
  expected_version?: number;
  origination_client_ach_amount?: number;
  consulting_client_ach_amount?: number;
};

export type FeeObligationLine = {
  id: string;
  component: "origination" | "consulting";
  label: string;
  amount: number;
  collection_amount: number;
  agreement_reference: string | null;
  agreement_verified: boolean;
  earned: boolean;
};

export type FeeObligation = {
  id: string;
  version: number;
  status: "draft" | "prepared" | "awaiting_authorization" | "authorized" | "ready_for_release" | "processing" | "partially_collected" | "collected" | "returned" | "cancelled" | "superseded";
  amount: number;
  authorized_amount: number;
  collected_amount: number;
  refunded_amount: number;
  outstanding_amount: number;
  lines: FeeObligationLine[];
  agreement_ready: boolean;
  prepared_at: string | null;
  authorization_sent_at: string | null;
  released_at: string | null;
};

export type ActualFundingConfirmation = {
  id: string;
  funded_at: string;
  funded_amount: number;
  funding_party: string;
  transaction_reference: string | null;
  source: "production_attestation" | "manual";
  note: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string;
};

export type PaymentFundingSource = {
  id: string;
  ownership_type: "business" | "consumer";
  institution_name: string | null;
  account_name: string | null;
  account_mask: string | null;
  account_subtype: string | null;
  status: "pending" | "connected" | "action_required" | "revoked" | "blocked";
  connected_at: string | null;
};

export type AchMandate = {
  id: string;
  status: "pending" | "signed" | "revoked" | "expired" | "superseded";
  authorized_amount: number;
  sec_code: "CCD" | "WEB";
  payer_name: string;
  signed_at: string | null;
  revoked_at: string | null;
  certificate_available: boolean;
};

export type PaymentTransfer = {
  id: string;
  amount: number;
  status: PaymentTransferStatus;
  provider_transfer_id: string | null;
  submitted_at: string | null;
  funds_available_at: string | null;
  failed_at: string | null;
  return_code: string | null;
  return_reason: string | null;
  retry_eligible: boolean;
  resume_eligible: boolean;
  retry_count: number;
  refundable_amount: number;
};

export type PrivateFundingPlan = {
  id: string;
  status: PaymentPlanStatus;
  record_version: number;
  creditor_name: string;
  payee_name: string | null;
  settlement_destination_ref: string | null;
  total_amount: number;
  installment_amount: number;
  cadence: "business_daily" | "weekly" | "biweekly" | "semimonthly" | "monthly" | "custom";
  installment_count: number;
  next_due_at: string | null;
  production_term_sheet_id: string | null;
  production_term_sheet_version: number | null;
  schedule_sha256: string | null;
  agreement_reference: string | null;
  funding_source_status: string | null;
  servicing_authority_ready: boolean;
  servicing_authority_id: string | null;
  servicing_authority_status: string | null;
  agreement_ready: boolean;
  funding_confirmed: boolean;
  mandate_status: AchMandate["status"] | null;
  activation_blockers: string[];
  installments: PaymentInstallment[];
};

export type PaymentInstallment = {
  id: string;
  sequence: number;
  due_date: string;
  amount_cents: number;
  status: string;
};

export type PaymentServicingAuthority = {
  id: string;
  status: string;
  creditor_name: string;
  payee_name: string;
  settlement_destination_ref: string;
  agreement_reference: string;
  effective_from: string;
  effective_to: string | null;
};

export type PaymentTimelineItem = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  amount: number | null;
  tone: "default" | "info" | "success" | "warning" | "danger";
  actor_name: string | null;
  occurred_at: string;
};

export type PaymentPermissions = {
  can_view: boolean;
  can_edit_allocation: boolean;
  can_waive: boolean;
  can_prepare_obligation: boolean;
  can_confirm_funding: boolean;
  can_send_authorization: boolean;
  can_release_ach: boolean;
  can_retry: boolean;
  can_refund: boolean;
  can_reconcile_bank_direct: boolean;
  can_manage_private_schedule: boolean;
  can_manage_servicing_authority: boolean;
  can_request_review: boolean;
};

export type AgreementDocumentCandidate = {
  id: string;
  name: string;
  artifact_type: "bucket_file";
  sha256: string;
  system_signed: boolean;
  signed_at: string | null;
  signature_kind: string | null;
  requires_staff_attestation: boolean;
  eligible_components: Array<"origination" | "consulting">;
};

export type PaymentSummary = {
  profile_id: string;
  intake_id: string | null;
  client_id: string | null;
  loan_id: string | null;
  display_name: string | null;
  approved_amount: number | null;
  accepted_amount: number | null;
  funded_amount: number | null;
  origination_fee_points: number | null;
  origination_fee: number;
  consulting_fee: number;
  gross_expected_fee: number;
  allocation: FeeAllocation | null;
  obligation: FeeObligation | null;
  funding_confirmation: ActualFundingConfirmation | null;
  funding_source: PaymentFundingSource | null;
  mandate: AchMandate | null;
  transfer: PaymentTransfer | null;
  private_funding_eligible: boolean;
  private_funding_reason: string | null;
  private_plan: PrivateFundingPlan | null;
  agreement_documents: AgreementDocumentCandidate[];
  servicing_authorities: PaymentServicingAuthority[];
  timeline: PaymentTimelineItem[];
  totals: {
    bank_direct_expected: number;
    bank_direct_received: number;
    external_received: number;
    client_ach_target: number;
    scheduled: number;
    processing: number;
    collected: number;
    refunded: number;
    waived: number;
    outstanding: number;
  };
  readiness: {
    fee_obligation_current: boolean;
    agreement_signed: boolean;
    consulting_fee_earned: boolean;
    client_authorized: boolean;
    funding_confirmed: boolean;
    amount_covered: boolean;
    account_eligible: boolean;
    no_existing_claim: boolean;
    ready_for_release: boolean;
    blockers: string[];
  };
  permissions: PaymentPermissions;
  server_now: string;
};

export type PaymentsQueueItem = {
  id: string;
  profile_id: string;
  intake_id: string | null;
  client_id: string | null;
  loan_id: string | null;
  display_name: string;
  reference: string | null;
  owner_name: string | null;
  owner_id: string | null;
  kind: PaymentPlanKind;
  status: string;
  amount: number;
  outstanding_amount: number;
  next_action: string;
  next_due_at: string | null;
  updated_at: string;
};

export type PaymentsQueueResponse = {
  items: PaymentsQueueItem[];
  total: number;
  server_now: string;
  totals: {
    awaiting_authorization: number;
    ready_for_funding_confirmation: number;
    ready_for_release: number;
    processing: number;
    funds_available: number;
    externally_reconciled: number;
    action_required: number;
    refunded: number;
    bank_direct_outstanding: number;
    upcoming_private_installments: number;
  };
};

export type PaymentsQueueFilters = {
  queue?: "all" | "origination_fees" | "private_funding";
  status?: string;
  q?: string;
  owner_id?: string;
  page?: number;
  page_size?: number;
};

/** Wire types mirror qcbackend/app/schemas/payments.py. Amounts ending in
 * `_cents` stay integers until they cross this normalization boundary. */
export type PaymentSummaryWire = {
  profile_id: string;
  intake_id?: string | null;
  client_id?: string | null;
  loan_id?: string | null;
  economics: {
    approved_amount?: number | string | null;
    accepted_amount?: number | string | null;
    funded_amount?: number | string | null;
    origination_points?: number | string | null;
    consulting_fee?: number | string | null;
    origination_fee_cents?: number;
    gross_fee_cents?: number;
    estimated_close_date?: string | null;
  };
  current_obligation?: {
    id: string; version: number; record_version: number; status: string;
    accepted_amount?: number | string | null; funded_amount?: number | string | null;
    origination_points?: number | string | null; origination_fee_cents: number; consulting_fee_cents: number; gross_fee_cents: number;
    client_ach_cents: number; origination_client_ach_cents?: number; consulting_client_ach_cents?: number; bank_direct_cents: number; external_cents: number; deferred_cents: number; waived_cents: number;
    agreement_reference?: string | null; agreement_sha256?: string | null; consulting_milestone_confirmed_at?: string | null;
    created_at: string; updated_at: string;
  } | null;
  funding_confirmation?: {
    id: string; actual_funding_date: string; actual_funded_amount: number | string; funding_party_name: string;
    funding_reference?: string | null; note?: string | null; source: "manual" | "production_attestation"; confirmed_at: string;
  } | null;
  funding_source?: {
    id: string; status: string; owner_type: "business" | "consumer"; ach_class: "CCD" | "WEB";
    account_name?: string | null; account_mask?: string | null; account_subtype?: string | null; institution_name?: string | null;
    verified_at?: string | null; revoked_at?: string | null; created_at: string;
  } | null;
  mandate?: {
    id: string; status: string; ach_class: "CCD" | "WEB"; authorized_amount_cents: number; typed_name: string; payer_name: string;
    signed_at?: string | null; revoked_at?: string | null; expires_at?: string | null;
  } | null;
  transfers?: Array<{
    id: string; status: string; amount_cents: number; plaid_transfer_id?: string | null; provider_status?: string | null;
    provider_failure_code?: string | null; provider_failure_message?: string | null; attempt_no: number;
    resume_eligible?: boolean;
    submitted_at?: string | null; funds_available_at?: string | null; returned_at?: string | null; created_at: string;
  }>;
  bank_direct_receipts?: Array<{ id: string; amount_cents: number; received_on: string; reference: string; note?: string | null; created_at: string }>;
  agreement_documents?: AgreementDocumentCandidate[];
  private_plans?: Array<{
    id: string; status: string; cadence: string; total_amount_cents: number; installment_count: number; first_due_date: string;
    next_due_date?: string | null; record_version: number; funding_confirmation_id?: string | null; servicing_authority_id?: string | null; created_at: string;
  }>;
  installments?: Array<{ id: string; plan_id: string; sequence: number; due_date: string; amount_cents: number; status: string }>;
  totals: {
    gross_fee_cents?: number; client_ach_cents?: number; bank_direct_expected_cents?: number; bank_direct_received_cents?: number;
    external_cents?: number; deferred_cents?: number; waived_cents?: number; net_collectible_cents?: number;
    processing_cents?: number; collected_cents?: number; refunded_cents?: number; outstanding_cents?: number;
  };
  capabilities: {
    can_read?: boolean; can_prepare?: boolean; can_waive?: boolean; can_confirm_funding?: boolean; can_release?: boolean; can_refund?: boolean;
    can_manage_private_schedules?: boolean; payments_enabled?: boolean; private_funding_payments_enabled?: boolean;
  };
  readiness: { ready_to_release?: boolean; blockers?: string[] };
};

export type PaymentsQueueResponseWire = {
  items: Array<{
    profile_id: string; intake_id?: string | null; client_id?: string | null; loan_id?: string | null; business_name?: string | null; owner_name?: string | null; owner_id?: string | null; queue: string; amount_cents: number;
    due_date?: string | null; status: string;
    obligation?: { id: string; status: string; client_ach_cents: number; gross_fee_cents: number } | null;
    plan?: { id: string; status: string; total_amount_cents: number; next_due_date?: string | null } | null;
  }>;
  total: number;
  page: number;
  page_size: number;
  summary?: Record<string, number>;
};

function dollars(cents: number | null | undefined): number { return Math.round((cents ?? 0)) / 100; }
function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function transferStatus(value: string): PaymentTransferStatus { return value as PaymentTransferStatus; }
function obligationStatus(value: string): FeeObligation["status"] { return value as FeeObligation["status"]; }

export function normalizePaymentSummary(wire: PaymentSummaryWire): PaymentSummary {
  const economics = wire.economics ?? {};
  const raw = wire.current_obligation ?? null;
  const grossCents = raw?.gross_fee_cents ?? economics.gross_fee_cents ?? wire.totals?.gross_fee_cents ?? 0;
  const allocatedCents = raw ? raw.client_ach_cents + raw.bank_direct_cents + raw.external_cents + raw.deferred_cents + raw.waived_cents : 0;
  const mode: FeeCollectionMode = !raw ? "client_ach" : raw.waived_cents === grossCents ? "waived" : raw.bank_direct_cents === grossCents ? "bank_direct" : raw.client_ach_cents === grossCents ? "client_ach" : "split";
  const allocation: FeeAllocation | null = raw ? {
    id: raw.id,
    version: raw.record_version,
    collection_mode: mode,
    gross_fee: dollars(grossCents),
    client_ach_amount: dollars(raw.client_ach_cents),
    origination_client_ach_amount: raw.origination_client_ach_cents == null ? Math.min(dollars(raw.client_ach_cents), dollars(raw.origination_fee_cents)) : dollars(raw.origination_client_ach_cents),
    consulting_client_ach_amount: raw.consulting_client_ach_cents == null ? Math.max(0, dollars(raw.client_ach_cents - raw.origination_fee_cents)) : dollars(raw.consulting_client_ach_cents),
    bank_direct_amount: dollars(raw.bank_direct_cents),
    external_amount: dollars(raw.external_cents),
    deferred_amount: dollars(raw.deferred_cents),
    waived_amount: dollars(raw.waived_cents),
    unallocated_amount: dollars(grossCents - allocatedCents),
    is_balanced: grossCents === allocatedCents,
    is_current: grossCents === (economics.gross_fee_cents ?? grossCents),
    updated_at: raw.updated_at,
    updated_by_name: null,
  } : null;
  const transfers = [...(wire.transfers ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latestTransfer = transfers[0] ?? null;
  const funding = wire.funding_confirmation;
  const source = wire.funding_source;
  const mandate = wire.mandate;
  const plans = [...(wire.private_plans ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const plan = plans[0] ?? null;
  const planInstallments = plan ? (wire.installments ?? []).filter((item) => item.plan_id === plan.id) : [];
  const blockers = wire.readiness?.blockers ?? [];
  const timeline: PaymentTimelineItem[] = [
    ...(raw ? [{ id: `obligation:${raw.id}`, kind: "fee_obligation", title: `Fee obligation ${raw.status.replaceAll("_", " ")}`, detail: raw.agreement_reference ? `Agreement ${raw.agreement_reference}` : null, amount: dollars(raw.client_ach_cents), tone: raw.status === "returned" ? "danger" as const : "info" as const, actor_name: null, occurred_at: raw.updated_at }] : []),
    ...(funding ? [{ id: `funding:${funding.id}`, kind: "funding_confirmation", title: "Actual funding confirmed", detail: `${funding.funding_party_name}${funding.funding_reference ? ` · ${funding.funding_reference}` : ""}`, amount: numberOrNull(funding.actual_funded_amount), tone: "success" as const, actor_name: null, occurred_at: funding.confirmed_at }] : []),
    ...transfers.map((item) => ({ id: `transfer:${item.id}:${item.status}`, kind: "transfer", title: `ACH ${item.status.replaceAll("_", " ")}`, detail: item.provider_failure_message ?? item.provider_failure_code ?? null, amount: dollars(item.amount_cents), tone: ["failed", "returned"].includes(item.status) ? "danger" as const : item.status === "funds_available" ? "success" as const : "warning" as const, actor_name: null, occurred_at: item.funds_available_at ?? item.returned_at ?? item.submitted_at ?? item.created_at })),
    ...(wire.bank_direct_receipts ?? []).map((item) => ({ id: `receipt:${item.id}`, kind: "bank_direct_receipt", title: "Bank-direct receipt reconciled", detail: item.reference, amount: dollars(item.amount_cents), tone: "success" as const, actor_name: null, occurred_at: item.created_at })),
  ].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const permissions: PaymentPermissions = {
    can_view: wire.capabilities?.can_read ?? true,
    can_edit_allocation: Boolean(wire.capabilities?.can_prepare),
    can_waive: Boolean(wire.capabilities?.can_waive),
    can_prepare_obligation: Boolean(wire.capabilities?.can_prepare),
    can_confirm_funding: Boolean(wire.capabilities?.can_confirm_funding),
    can_send_authorization: Boolean(wire.capabilities?.can_prepare),
    can_release_ach: Boolean(wire.capabilities?.can_release),
    can_retry: Boolean(wire.capabilities?.can_release),
    can_refund: Boolean(wire.capabilities?.can_refund),
    can_reconcile_bank_direct: Boolean(wire.capabilities?.can_confirm_funding),
    can_manage_private_schedule: Boolean(wire.capabilities?.can_manage_private_schedules),
    can_manage_servicing_authority: false,
    can_request_review: true,
  };
  const feeObligation: FeeObligation | null = raw ? {
    id: raw.id,
    version: raw.record_version,
    status: obligationStatus(raw.status),
    amount: dollars(raw.client_ach_cents),
    authorized_amount: dollars(mandate?.authorized_amount_cents),
    collected_amount: dollars(wire.totals?.collected_cents),
    refunded_amount: dollars(wire.totals?.refunded_cents),
    outstanding_amount: dollars(wire.totals?.outstanding_cents),
    lines: [
      ...(raw.origination_fee_cents > 0 ? [{ id: `${raw.id}:origination`, component: "origination" as const, label: "Origination fee", amount: dollars(raw.origination_fee_cents), collection_amount: dollars(raw.origination_fee_cents), agreement_reference: raw.agreement_reference ?? null, agreement_verified: Boolean(raw.agreement_reference || raw.agreement_sha256), earned: true }] : []),
      ...(raw.consulting_fee_cents > 0 ? [{ id: `${raw.id}:consulting`, component: "consulting" as const, label: "Consulting fee", amount: dollars(raw.consulting_fee_cents), collection_amount: dollars(raw.consulting_fee_cents), agreement_reference: raw.agreement_reference ?? null, agreement_verified: Boolean(raw.agreement_reference || raw.agreement_sha256), earned: Boolean(raw.consulting_milestone_confirmed_at) }] : []),
    ],
    agreement_ready: Boolean(raw.agreement_reference || raw.agreement_sha256),
    prepared_at: raw.created_at,
    authorization_sent_at: null,
    released_at: latestTransfer?.submitted_at ?? null,
  } : null;
  return {
    profile_id: wire.profile_id,
    intake_id: wire.intake_id ?? null,
    client_id: wire.client_id ?? null,
    loan_id: wire.loan_id ?? null,
    display_name: null,
    approved_amount: numberOrNull(economics.approved_amount),
    accepted_amount: numberOrNull(economics.accepted_amount),
    funded_amount: numberOrNull(economics.funded_amount),
    origination_fee_points: numberOrNull(economics.origination_points),
    origination_fee: dollars(economics.origination_fee_cents),
    consulting_fee: numberOrNull(economics.consulting_fee) ?? dollars(raw?.consulting_fee_cents),
    gross_expected_fee: dollars(economics.gross_fee_cents ?? grossCents),
    allocation,
    obligation: feeObligation,
    funding_confirmation: funding ? { id: funding.id, funded_at: funding.actual_funding_date, funded_amount: numberOrNull(funding.actual_funded_amount) ?? 0, funding_party: funding.funding_party_name, transaction_reference: funding.funding_reference ?? null, source: funding.source, note: funding.note ?? null, confirmed_by_name: null, confirmed_at: funding.confirmed_at } : null,
    funding_source: source ? { id: source.id, ownership_type: source.owner_type, institution_name: source.institution_name ?? null, account_name: source.account_name ?? null, account_mask: source.account_mask ?? null, account_subtype: source.account_subtype ?? null, status: source.status as PaymentFundingSource["status"], connected_at: source.verified_at ?? source.created_at } : null,
    mandate: mandate ? { id: mandate.id, status: mandate.status as AchMandate["status"], authorized_amount: dollars(mandate.authorized_amount_cents), sec_code: mandate.ach_class, payer_name: mandate.payer_name, signed_at: mandate.signed_at ?? null, revoked_at: mandate.revoked_at ?? null, certificate_available: false } : null,
    transfer: latestTransfer ? { id: latestTransfer.id, amount: dollars(latestTransfer.amount_cents), status: transferStatus(latestTransfer.status), provider_transfer_id: latestTransfer.plaid_transfer_id ?? null, submitted_at: latestTransfer.submitted_at ?? null, funds_available_at: latestTransfer.funds_available_at ?? null, failed_at: latestTransfer.provider_failure_code ? latestTransfer.returned_at ?? latestTransfer.submitted_at ?? null : null, return_code: latestTransfer.provider_failure_code ?? null, return_reason: latestTransfer.provider_failure_message ?? null, retry_eligible: ["R01", "R09"].includes(latestTransfer.provider_failure_code ?? "") && latestTransfer.attempt_no <= 2, resume_eligible: Boolean(latestTransfer.resume_eligible), retry_count: Math.max(0, latestTransfer.attempt_no - 1), refundable_amount: latestTransfer.status === "funds_available" ? Math.max(0, dollars(latestTransfer.amount_cents) - dollars(wire.totals?.refunded_cents)) : 0 } : null,
    private_funding_eligible: Boolean(wire.capabilities?.private_funding_payments_enabled && (plan || wire.capabilities?.can_manage_private_schedules)),
    private_funding_reason: wire.capabilities?.private_funding_payments_enabled ? null : "Private-funding payments are not enabled for this file.",
    private_plan: plan ? {
      id: plan.id,
      status: plan.status as PaymentPlanStatus,
      record_version: plan.record_version,
      creditor_name: "Private funding agreement",
      payee_name: null,
      settlement_destination_ref: null,
      total_amount: dollars(plan.total_amount_cents),
      installment_amount: planInstallments[0] ? dollars(planInstallments[0].amount_cents) : dollars(Math.round(plan.total_amount_cents / Math.max(1, plan.installment_count))),
      cadence: plan.cadence as PrivateFundingPlan["cadence"],
      installment_count: plan.installment_count,
      next_due_at: plan.next_due_date ?? null,
      production_term_sheet_id: null,
      production_term_sheet_version: null,
      schedule_sha256: null,
      agreement_reference: null,
      funding_source_status: source?.status ?? null,
      servicing_authority_ready: Boolean(plan.servicing_authority_id),
      servicing_authority_id: plan.servicing_authority_id ?? null,
      servicing_authority_status: null,
      agreement_ready: true,
      funding_confirmed: Boolean(plan.funding_confirmation_id),
      mandate_status: mandate?.status as AchMandate["status"] ?? null,
      activation_blockers: [],
      installments: planInstallments.map((item) => ({ id: item.id, sequence: item.sequence, due_date: item.due_date, amount_cents: item.amount_cents, status: item.status })),
    } : null,
    agreement_documents: wire.agreement_documents ?? [],
    servicing_authorities: [],
    timeline,
    totals: { bank_direct_expected: dollars(wire.totals?.bank_direct_expected_cents), bank_direct_received: dollars(wire.totals?.bank_direct_received_cents), external_received: dollars(wire.totals?.external_cents), client_ach_target: dollars(wire.totals?.client_ach_cents), scheduled: plan ? dollars(plan.total_amount_cents) : 0, processing: dollars(wire.totals?.processing_cents), collected: dollars(wire.totals?.collected_cents), refunded: dollars(wire.totals?.refunded_cents), waived: dollars(wire.totals?.waived_cents), outstanding: dollars(wire.totals?.outstanding_cents) },
    readiness: { fee_obligation_current: Boolean(raw && allocation?.is_current), agreement_signed: Boolean(raw?.agreement_reference || raw?.agreement_sha256), consulting_fee_earned: !raw?.consulting_fee_cents || Boolean(raw.consulting_milestone_confirmed_at), client_authorized: mandate?.status === "signed", funding_confirmed: Boolean(funding), amount_covered: Boolean(raw && mandate && mandate.authorized_amount_cents >= raw.client_ach_cents), account_eligible: source?.status === "verified" || source?.status === "connected", no_existing_claim: !latestTransfer || ["failed", "returned", "cancelled"].includes(latestTransfer.status), ready_for_release: Boolean(wire.readiness?.ready_to_release), blockers },
    permissions,
    server_now: new Date().toISOString(),
  };
}

function summaryCount(summary: Record<string, number> | undefined, ...keys: string[]): number {
  for (const key of keys) if (typeof summary?.[key] === "number") return summary[key];
  return 0;
}

export function normalizePaymentsQueue(wire: PaymentsQueueResponseWire): PaymentsQueueResponse {
  return {
    items: wire.items.map((item) => ({
      id: item.obligation?.id ?? item.plan?.id ?? item.profile_id,
      profile_id: item.profile_id,
      intake_id: item.intake_id ?? null,
      client_id: item.client_id ?? null,
      loan_id: item.loan_id ?? null,
      display_name: item.business_name || "Unnamed payment file",
      reference: item.profile_id,
      owner_name: item.owner_name ?? null,
      owner_id: item.owner_id ?? null,
      kind: item.queue === "private_funding" ? "private_funding" : "origination_fee",
      status: item.status,
      amount: dollars(item.amount_cents),
      outstanding_amount: dollars(item.obligation?.client_ach_cents ?? item.plan?.total_amount_cents ?? item.amount_cents),
      next_action: item.status.replaceAll("_", " "),
      next_due_at: item.due_date ?? item.plan?.next_due_date ?? null,
      updated_at: new Date().toISOString(),
    })),
    total: wire.total,
    server_now: new Date().toISOString(),
    totals: {
      awaiting_authorization: summaryCount(wire.summary, "awaiting_authorization"),
      ready_for_funding_confirmation: summaryCount(wire.summary, "ready_for_funding_confirmation", "awaiting_funding"),
      ready_for_release: summaryCount(wire.summary, "ready_for_release"),
      processing: summaryCount(wire.summary, "processing"),
      funds_available: summaryCount(wire.summary, "funds_available", "collected"),
      externally_reconciled: summaryCount(wire.summary, "externally_reconciled"),
      action_required: summaryCount(wire.summary, "action_required", "returned"),
      refunded: summaryCount(wire.summary, "refunded"),
      bank_direct_outstanding: summaryCount(wire.summary, "bank_direct_outstanding"),
      upcoming_private_installments: summaryCount(wire.summary, "upcoming_private_installments", "upcoming"),
    },
  };
}

export const paymentPaths = {
  summary: (profileId: string) => `/application-profiles/${profileId}/payments/summary`,
  allocation: (profileId: string) => `/application-profiles/${profileId}/payments/fee-allocation`,
  obligations: (profileId: string) => `/application-profiles/${profileId}/payments/fee-obligations`,
  confirmFunding: (profileId: string) => `/application-profiles/${profileId}/payments/funding-confirmations`,
  sendAuthorization: (obligationId: string) => `/fee-obligations/${obligationId}/send-authorization`,
  release: (obligationId: string) => `/fee-obligations/${obligationId}/release`,
  retryTransfer: (transferId: string) => `/payment-transfers/${transferId}/retry`,
  resumeTransfer: (transferId: string) => `/payment-transfers/${transferId}/resume`,
  refunds: (transferId: string) => `/payment-transfers/${transferId}/refunds`,
  bankDirectReceipts: (profileId: string) => `/application-profiles/${profileId}/payments/bank-direct-receipts`,
  requestReview: (profileId: string) => `/application-profiles/${profileId}/payments/request-review`,
  privatePlanPreview: (profileId: string) => `/application-profiles/${profileId}/payments/private-plan-preview`,
  privatePlanFromTerms: (profileId: string) => `/application-profiles/${profileId}/payments/private-plans/from-term-sheet`,
  servicingAuthorities: (profileId: string) => `/application-profiles/${profileId}/payments/servicing-authorities`,
  privatePlanAction: (planId: string, action: "activate" | "pause" | "cancel") => `/private-payment-plans/${planId}/${action}`,
  privatePlanAuthorization: (planId: string) => `/private-payment-plans/${planId}/send-authorization`,
  queue: "/payments",
} as const;

export function paymentsQueueQuery(filters: PaymentsQueueFilters): string {
  const params = new URLSearchParams();
  if (filters.queue && filters.queue !== "all") params.set("queue", filters.queue);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.owner_id) params.set("owner_id", filters.owner_id);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.page_size) params.set("page_size", String(filters.page_size));
  const query = params.toString();
  return query ? `${paymentPaths.queue}?${query}` : paymentPaths.queue;
}

export function paymentIdempotencyKey(action: string, entityId: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${action}:${entityId}:${random}`;
}

export function paymentMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
