import { type ChipTone } from "@/components/ds";
import { ApiError } from "@/lib/api";
import { semanticChipTone } from "@/lib/semanticStatus";
import { type LeadNote } from "@/components/broker/LeadNotesPanel";
import type { McaRefinancePolicy } from "@/lib/mcaRefinancePolicy";
import { PIPELINE_LIFECYCLE, type UnderwritingLifecycleStatus } from "@/lib/unifiedOperator";
import type { ApplicationUnderwritingState } from "@/lib/applicationProfile";
import { isFundedIntakeStatus, isTerminalNegativeIntakeStatus, resolveIntakeDisplayStatus, type IntakeWorkspaceState } from "@/lib/intakeWorkspace";

// Surface a FastAPI 422/400 `detail` (string or [{msg}]) instead of the bare
// "422 Unprocessable Entity" so operators see WHY a send was rejected.
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const msgs = detail.map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : "")).filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export const PRODUCTION_REPAYMENT_LABELS: Record<string, string> = {
  fully_amortizing: "Principal + interest",
  interest_only: "Interest only",
  interest_only_then_amortizing: "IO, then principal + interest",
  balloon: "Amortizing + balloon",
  revolving_interest_only: "Revolving interest only",
  fixed_payment: "Fixed lender payment",
  custom: "Custom schedule",
};

export const PRODUCTION_CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  custom: "Custom cadence",
};

export function productionTermLabel(value: unknown, labels: Record<string, string>, fallback: string): string {
  const key = typeof value === "string" ? value : "";
  return labels[key] ?? (key ? key.replace(/_/g, " ") : fallback);
}

export type LeadRow = {
  id: string;
  variant: string;
  mca_refinance_policy?: McaRefinancePolicy | null;
  intake_state?: Record<string, unknown> | null;
  client_id?: string | null;
  bucket_id: string;
  bucket_name: string;
  full_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  referral_source?: string | null;
  opened_by_name?: string | null;
  opened_by_role?: string | null;
  status: string;
  outcome_status: string;
  preferred_language: string;
  probability_status?: string | null;
  confidence?: string | null;
  one_next_step?: string | null;
  latest_review_status?: string | null;
  booking_recommended: boolean;
  call_booked: boolean;
  file_count: number;
  missing_required_count: number;
  requested_loan_amount?: number | null;
  estimated_credit_score?: number | null;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  archived_at?: string | null;
  underwriting_status?: string | null;
  workspace_state?: IntakeWorkspaceState;
  workspace_state_reason?: string | null;
  client_contact_suppressed?: boolean;
  delete_requested_at?: string | null;
  unseen_activity_count?: number;
  delete_requested_by?: string | null;
};

export type LinkLead = {
  id: string;
  bucket_id: string | null;
  business_name?: string | null;
  full_name: string;
};

export type LeadPage = {
  items: LeadRow[];
  total: number;
  limit: number;
  offset: number;
};

export type RequestedDoc = {
  id: string;
  name: string;
  description?: string | null;
  required: boolean;
  status: string;
};

export type UploadedFile = {
  id: string;
  requested_document_id?: string | null;
  parent_zip_file_id?: string | null;
  zip_entry_path?: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  source_kind?: string | null;
  source_detail?: string | null;
  created_at: string;
};

export function isSourceEvidenceFile(file: UploadedFile): boolean {
  return !(
    file.source_kind === "generated"
    && file.source_detail?.startsWith("package_readiness:")
  );
}

export type LeadDetail = {
  mca_refinance_policy?: McaRefinancePolicy | null;
  intake: LeadRow & {
    loan_purpose?: string | null;
    referral_source?: string | null;
    asset_rows?: Array<Record<string, unknown>> | null;
    result_snapshot?: Record<string, unknown> | null;
  };
  requested_documents: RequestedDoc[];
  files: UploadedFile[];
  latest_review?: { status: string; result?: Record<string, unknown> | null; error?: string | null } | null;
  messages?: Array<{ id: string; role: string; content: string; created_at: string }>;
  artifacts?: Artifact[];
  email_sends?: EmailSend[];
  notes?: LeadNote[];
  upload_url?: string | null;
  secure_room_pin?: string | null;
  room_delivery_status?: string | null;
  room_delivery_detail?: string | null;
};

export type UnderwritingDraft = {
  underwriting_status: UnderwritingLifecycleStatus;
  target_dscr: string;
  reviewer_notes: string;
  forecast_fee_points: string;
  accepted_amount: string;
  forecast_consulting_fee: string;
  estimated_close_date: string;
  funded_amount: string;
};

export type LeadDetailView = "workspace" | "underwriting" | "payments" | "reviewer" | "production" | "communications" | "audit";

export type Artifact = {
  id: string;
  intake_id: string;
  artifact_type: string;
  title: string;
  body_text?: string | null;
  body_json?: Record<string, unknown> | null;
  s3_key?: string | null;
  download_url?: string | null;
  preview_url?: string | null;
  version?: number;
  status?: "current" | "superseded";
  bucket_file_id?: string | null;
  supersedes_artifact_id?: string | null;
  superseded_by_artifact_id?: string | null;
  sha256?: string | null;
  generation_id?: string | null;
  input_fingerprint?: string | null;
  is_fresh?: boolean | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type PackageReadinessBucketFile = {
  id: string;
  bucket_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  source_kind: string;
  source_detail?: string | null;
  status: string;
  preview_url?: string | null;
  download_url?: string | null;
  created_at: string;
};

export type PackageReadinessGeneration = {
  generation_id: string;
  generated_at: string;
  executive_summary: Artifact;
  lender_packet: Artifact;
  bucket_files: PackageReadinessBucketFile[];
  superseded_bucket_file_ids: string[];
  artifact_history: Artifact[];
};

export type EmailSend = {
  id: string;
  intake_id: string;
  executive_summary_artifact_id?: string | null;
  lender_packet_artifact_id?: string | null;
  to_emails: string[];
  cc_emails?: string[] | null;
  subject: string;
  body: string;
  vendor_access_ids?: string[] | null;
  ses_status: string;
  ses_message_ids?: string[] | null;
  ses_error?: string | null;
  sent_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorEmailPreview = {
  subject: string;
  body: string;
  to_emails: string[];
  cc_emails: string[];
  executive_summary?: Artifact | null;
  lender_packet?: Artifact | null;
};

export type BucketAccessMode = "none" | "login" | "passcode";

export type VendorEmailSendPayload = {
  to_emails: string[];
  cc_emails: string[];
  subject: string;
  body: string;
  include_lender_packet: boolean;
  attach_lender_packet: boolean;
  attach_executive_summary: boolean;
  attach_package_zip: boolean;
  bucket_access: BucketAccessMode;
  drive_file_ids: string[];
};

export type VendorEmailSendResult = {
  email_sends: EmailSend[];
  vendor_access_ids: string[];
};

export type DriveIngestResult = {
  ingested: number;
  skipped: number;
  items: { drive_file_id: string; file_name?: string | null; status: string; reason?: string | null }[];
};

export type LeadContactUpdate = {
  full_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  loan_purpose?: string | null;
  requested_loan_amount?: number | null;
  estimated_credit_score?: number | null;
  referral_source?: string | null;
};

export type RoomDeliveryReceipt = {
  id: string;
  channel: string;
  recipient_masked?: string | null;
  status: string;
  detail?: string | null;
  provider_accepted: boolean;
  created_at: string;
};

export type RoomRequestResult = {
  requested_document_id?: string | null;
  room_url: string;
  overall_status: "created" | "success" | "partial" | "failed";
  deliveries: RoomDeliveryReceipt[];
};

export const PROBABILITY_FILTERS = [
  { value: "all", label: "All probability" },
  { value: "Good probability - book call", label: "Good probability" },
  { value: "Promising but needs one clarification", label: "Promising" },
  { value: "Not enough evidence yet", label: "Not enough evidence" },
  { value: "Poor probability based on current file", label: "Poor probability" },
];

export const STATUS_FILTERS = [
  { value: "all", label: "All status" },
  { value: "collecting", label: "Collecting" },
  { value: "reviewing", label: "Reviewing" },
  { value: "reviewed", label: "Reviewed" },
  { value: "approved", label: "Approved" },
  { value: "funded", label: "Funded" },
  { value: "completed", label: "Review complete" },
  { value: "closed_lost", label: "Lost / withdrawn" },
  { value: "denied", label: "Denied / disqualified" },
];

export const VARIANT_FILTERS = [
  { value: "all", label: "All reviews" },
  { value: "dealer", label: "Dealer" },
  { value: "real_estate", label: "Real estate" },
  { value: "commercial_foreclosure_bailout_v1", label: "Foreclosure rescue" },
  // Raw slugs pass straight through the backend's variant_filter else-branch.
  { value: "mca_refi_v1", label: "MCA refinance" },
];

export const DEFAULT_PAGE_SIZE = 50;

export const PAGE_SIZES = [25, 50, 100] as const;

export type IntakeStatusPresentation = {
  effectiveStatus: string;
  label: string;
  tone: "mut" | "warn" | "acc" | "ok" | "bad";
};

export function intakeStatusPresentation(
  intakeStatus: string | null | undefined,
  pipelineStatus?: string | null,
  outcomeStatus?: string | null,
  workspaceState?: IntakeWorkspaceState,
  workspaceStateReason?: string | null,
): IntakeStatusPresentation {
  const effectiveStatus = resolveIntakeDisplayStatus({
    intakeStatus,
    underwritingStatus: pipelineStatus,
    outcomeStatus,
    workspaceState,
    workspaceStateReason,
  });
  const lifecycle = PIPELINE_LIFECYCLE.find((item) => item.key === effectiveStatus);
  const label = lifecycle?.label
    ?? ({
      completed: "Review complete",
      funded: "Funded",
      denied: "Denied",
      disqualified: "Disqualified",
      lost: "Lost",
      withdrawn: "Withdrawn",
      withdrawn_expired: "Withdrawn",
      closed: "Closed",
      not_qualified: "Not qualified",
      rejected: "Rejected",
      declined: "Declined",
      cancelled: "Cancelled",
    }[effectiveStatus] || effectiveStatus.replace(/_/g, " "));
  const tone = isTerminalNegativeIntakeStatus(effectiveStatus)
    ? "bad"
    : isFundedIntakeStatus(effectiveStatus) || effectiveStatus === "approved"
      ? "ok"
      : effectiveStatus === "reviewing" || effectiveStatus === "reviewed" || effectiveStatus === "in_underwriting" || effectiveStatus === "term_sheet_provided"
        ? "acc"
        : semanticChipTone(effectiveStatus) === "mut" ? "warn" : semanticChipTone(effectiveStatus);
  return { effectiveStatus, label, tone };
}

export function presentContact(value?: string | null): string {
  return value?.trim() || "Not provided";
}

export function emptyUnderwritingDraft(): UnderwritingDraft {
  return {
    underwriting_status: "collecting_docs",
    target_dscr: "",
    reviewer_notes: "",
    forecast_fee_points: "",
    accepted_amount: "",
    forecast_consulting_fee: "",
    estimated_close_date: "",
    funded_amount: "",
  };
}

export function underwritingDraftFromState(state: ApplicationUnderwritingState | null): UnderwritingDraft {
  if (!state) return emptyUnderwritingDraft();
  return {
    underwriting_status: state.underwriting_status,
    target_dscr: state.target_dscr == null ? "" : String(state.target_dscr),
    reviewer_notes: state.reviewer_notes || "",
    forecast_fee_points: state.forecast_fee_points == null ? "" : String(state.forecast_fee_points),
    accepted_amount: state.accepted_amount == null ? "" : String(state.accepted_amount),
    forecast_consulting_fee: state.forecast_consulting_fee == null ? "" : String(state.forecast_consulting_fee),
    estimated_close_date: state.estimated_close_date || "",
    funded_amount: state.funded_amount == null ? "" : String(state.funded_amount),
  };
}

export function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export type LeadVariant = "dealer" | "real_estate" | "main_street" | "mca_refinance";

export type CreateLeadPayload = {
  variant: LeadVariant;
  full_name: string;
  email: string;
  phone: string;
  business_name?: string;
  investor_name?: string;
  target_property_address?: string;
  transaction_type?: string;
  requested_amount?: number;
  estimated_value_or_purchase_price?: number;
  monthly_rent?: number;
  estimated_credit_tier?: string;
  // Main Street only. Both are required for the file to be screened correctly:
  // industry gates the sector-restricted programs, and intent decides which
  // documents get requested at all.
  industry?: string;
  intent?: string;
  notify_client: boolean;
  preferred_language: "en" | "es";
  secure_room_pin: string;
};

// The lead list is a grid of <button> rows rather than a <table>: each row has
// to stay focusable and Enter-activatable, which a <tr onClick> is not. The
// column track is bespoke, so it stays an inline value.
// minmax(0,…) on the text columns so they shrink + ellipsize instead of forcing
// horizontal overflow when the sidebar is expanded / on smaller screens (a
// fixed floor here clipped the name column).
export const LEAD_COLS = "minmax(0,1.3fr) minmax(0,1fr) minmax(120px,150px) minmax(0,1.3fr) 90px 122px";

export function rowStyle(active: boolean) {
  return {
    width: "100%",
    display: "grid",
    gridTemplateColumns: LEAD_COLS,
    gap: 12,
    alignItems: "center",
    padding: "15px 16px",
    border: 0,
    borderBottom: "1px solid var(--line)",
    background: active ? "var(--accent-100)" : "transparent",
    textAlign: "left" as const,
    cursor: "pointer",
    color: "inherit",
    font: "inherit",
  };
}

export function probabilityTone(value?: string | null): ChipTone {
  if (value === "Good probability - book call") return "ok";
  if (value === "Poor probability based on current file") return "bad";
  if (value === "Promising but needs one clarification") return "warn";
  return "mut";
}

export function variantLabel(value?: string | null) {
  if (value === "real_estate_dscr_v1") return "Real estate";
  if (value === "dealer_gatekeeper_v1") return "Dealer";
  if (value === "mca_refi_v1") return "MCA refinance";
  if (value === "main_street_v1") return "Main Street";
  if (value === "commercial_foreclosure_bailout_v1") return "Foreclosure rescue";
  return "AI review";
}

export function programVerticalForVariant(value?: string | null): "real_estate" | "dealer" | "main_street" | "mca" {
  const variant = String(value || "").toLowerCase();
  if (variant.includes("mca")) return "mca";
  if (variant.includes("dealer")) return "dealer";
  if (variant.includes("real_estate") || variant.includes("funding_review") || variant.includes("foreclosure")) return "real_estate";
  return "main_street";
}

export function artifactVersion(artifact: Artifact, fallback = 1): number {
  const value = Number(artifact.version);
  return Number.isFinite(value) && value > 0 ? value : Math.max(1, fallback);
}

export function artifactBucketFileId(artifact: Artifact): string | null {
  const value = artifact.bucket_file_id;
  return typeof value === "string" && value ? value : null;
}

export function artifactSha(artifact: Artifact): string | null {
  const value = artifact.sha256;
  return typeof value === "string" && value ? value : null;
}

export function artifactList(artifact: Artifact, key: string): string[] {
  const value = asRecord(artifact.body_json)?.[key];
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : String(asRecord(item)?.label || asRecord(item)?.value || "")).filter(Boolean);
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

export function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatMoney(value?: number | null) {
  if (value == null) return "—";
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : `$${Math.round(value).toLocaleString()}`;
}

export function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
