"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, useToast, Toast } from "@/components/design-system/primitives";
import {
  Btn,
  Callout,
  CellChip,
  cx,
  Field,
  IconBtn,
  Input,
  Lbl,
  Linky,
  PageHeader,
  Panel,
  Row,
  Seg,
  Select,
  StatusLine,
  Textarea,
  WarnLine,
  type ChipTone,
} from "@/components/ds";
import { Drawer, DrawerSteps } from "@/components/ds/Drawer";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { PinRowButton, TableWorkspace } from "@/components/ds/TableWorkspace";
import { AddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { LENDING_INTENTS, MAIN_STREET_INDUSTRIES, MAIN_STREET_INTENTS } from "@/lib/intakeIndustries";
import { Icon } from "@/components/design-system/Icon";
import { TypingDots } from "@/components/design-system/TypingDots";
import { FileTeamStrip } from "@/components/file/FileTeamStrip";
import { FileTimeline } from "@/components/file/FileTimeline";
import { MerchantOfferStrip } from "@/components/admin/MerchantOfferStrip";
import { DealerTermSheetDocumentActions } from "@/components/admin/DealerTermSheetDocumentActions";
import { api, ApiError } from "@/lib/api";
import { isStaleRequestedDocumentError } from "@/lib/clientRoomDocuments";
import { assertPdfUploadUnlocked, documentUploadErrorMessage, isPasswordProtectedPdfUploadError, passwordProtectedPdfUploadNotice, screenPdfUploads } from "@/lib/documentUpload";

// Surface a FastAPI 422/400 `detail` (string or [{msg}]) instead of the bare
// "422 Unprocessable Entity" so operators see WHY a send was rejected.
function apiErrorMessage(error: unknown, fallback: string): string {
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

const PRODUCTION_REPAYMENT_LABELS: Record<string, string> = {
  fully_amortizing: "Principal + interest",
  interest_only: "Interest only",
  interest_only_then_amortizing: "IO, then principal + interest",
  balloon: "Amortizing + balloon",
  revolving_interest_only: "Revolving interest only",
  fixed_payment: "Fixed lender payment",
  custom: "Custom schedule",
};
const PRODUCTION_CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  custom: "Custom cadence",
};

function productionTermLabel(value: unknown, labels: Record<string, string>, fallback: string): string {
  const key = typeof value === "string" ? value : "";
  return labels[key] ?? (key ? key.replace(/_/g, " ") : fallback);
}
import { Role } from "@/lib/enums.generated";
import { useCurrentUser, useBookingLink, useDriveFiles, useUnifiedOperatorFiles, type DriveFile } from "@/hooks/useApi";
import { LeadCockpit, type LeadCockpitAdapter, type ClientThreadMessage, type ClientThreadResponse } from "@/components/admin/LeadCockpit";
import { LeadCreditPanel } from "@/components/admin/LeadCreditPanel";
import { LeadContractsPanel } from "@/components/admin/LeadContractsPanel";
import { LeadProgramFitPanel } from "@/components/admin/LeadProgramFitPanel";
import { LeadDscrPanel } from "@/components/admin/LeadDscrPanel";
import { WhatsNewButton, WhatsNewRail } from "@/components/admin/WhatsNewRail";
import { BankerSubmissionModal } from "@/components/admin/BankerSubmissionModal";
import { IntakeNotificationRoutingDrawer } from "@/components/admin/IntakeNotificationRoutingDrawer";
import { useAIReview } from "@/components/admin/AIReviewProvider";
import { ApplicationVerificationWorkspace } from "@/components/application/ApplicationVerificationWorkspace";
import { ApplicationEvidenceWorkspace } from "@/components/application/ApplicationEvidenceWorkspace";
import { ApplicationClassificationPanel } from "@/components/application/ApplicationClassificationPanel";
import { ApplicationIntelligencePanel } from "@/components/application/ApplicationIntelligencePanel";
import { ExtractedFactsReview } from "@/components/application/ExtractedFactsReview";
import { ApplicationAuditTimeline } from "@/components/application/ApplicationAuditTimeline";
import { ProductionPackageTab } from "@/components/admin/ProductionPackageTab";
import { ApplicationMissingItemCommunications } from "@/components/application/ApplicationMissingItemCommunications";
import { ApplicationClientTermsPanel } from "@/components/application/ApplicationClientTermsPanel";
import { semanticStatusClass } from "@/lib/semanticStatus";
import { UnifiedThreadConversation } from "@/components/communications/UnifiedThreadConversation";
import { AIIntakeClientConversation, AIIntakeEmailWorkspace } from "@/components/communications/AIIntakeClientCommunications";
import { OfferDeliveryComposer, type OfferDeliveryReceipt, type OfferSelection } from "@/components/communications/OfferDeliveryComposer";
import { OfferDeliveryHistory } from "@/components/communications/OfferDeliveryHistory";
import { LeadNotesPanel, type LeadNote } from "@/components/broker/LeadNotesPanel";
import { BucketIntakeLinkDrawer } from "@/components/operator/UnifiedOperator";
import { FileEconomicsDrawer } from "@/components/operator/FileEconomicsDrawer";
import { PipelineEconomicsStrip } from "@/components/operator/PipelineEconomicsStrip";
import { PipelineApprovalFields } from "@/components/operator/PipelineApprovalFields";
import type { IntakeResponse } from "@/lib/intake";
import {
  leadCockpitNonDocumentMissingRows,
  leadCockpitOutstandingDocuments,
  preferredIntakeReviewResult,
} from "@/lib/leadCockpitDocuments";
import { validPhone } from "@/lib/formCoerce";
import {
  PIPELINE_LIFECYCLE,
  originTone,
  underwritingStatusLabel,
  verticalTone,
  type PipelineMoveRequest,
  type UnderwritingLifecycleStatus,
  type UnifiedFileRow,
} from "@/lib/unifiedOperator";
import type { ApplicationProfile, ApplicationProgramReadiness, ApplicationTermSheetState, ApplicationUnderwritingPatch, ApplicationUnderwritingState, FileOwnerRequirementState } from "@/lib/applicationProfile";
import {
  pipelineApprovalDraft,
  validatePipelineApprovalDraft,
  type PipelineApprovalDraft,
} from "@/lib/pipelineApproval";
import { compactMissingItems, intelligenceActionDestination, reviewDestination, type ReviewDestination } from "@/lib/reviewNavigation";
import { usePinnedRows } from "@/lib/tablePinning";
import { useConsoleAuth } from "@/lib/consoleAuth";

type LeadRow = {
  id: string;
  variant: string;
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
  client_contact_suppressed?: boolean;
  delete_requested_at?: string | null;
  unseen_activity_count?: number;
  delete_requested_by?: string | null;
};

type LinkLead = {
  id: string;
  bucket_id: string | null;
  business_name?: string | null;
  full_name: string;
};

type LeadPage = {
  items: LeadRow[];
  total: number;
  limit: number;
  offset: number;
};

type RequestedDoc = {
  id: string;
  name: string;
  description?: string | null;
  required: boolean;
  status: string;
};

type UploadedFile = {
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

function isSourceEvidenceFile(file: UploadedFile): boolean {
  return !(
    file.source_kind === "generated"
    && file.source_detail?.startsWith("package_readiness:")
  );
}

type LeadDetail = {
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

type UnderwritingDraft = {
  underwriting_status: UnderwritingLifecycleStatus;
  target_dscr: string;
  reviewer_notes: string;
  forecast_fee_points: string;
  estimated_close_date: string;
  funded_amount: string;
};

type LeadDetailView = "workspace" | "underwriting" | "reviewer" | "production" | "communications" | "audit";

type Artifact = {
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

type PackageReadinessBucketFile = {
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

type PackageReadinessGeneration = {
  generation_id: string;
  generated_at: string;
  executive_summary: Artifact;
  lender_packet: Artifact;
  bucket_files: PackageReadinessBucketFile[];
  superseded_bucket_file_ids: string[];
  artifact_history: Artifact[];
};

type EmailSend = {
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

type VendorEmailPreview = {
  subject: string;
  body: string;
  to_emails: string[];
  cc_emails: string[];
  executive_summary?: Artifact | null;
  lender_packet?: Artifact | null;
};

type BucketAccessMode = "none" | "login" | "passcode";

type VendorEmailSendPayload = {
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

type VendorEmailSendResult = {
  email_sends: EmailSend[];
  vendor_access_ids: string[];
};

type DriveIngestResult = {
  ingested: number;
  skipped: number;
  items: { drive_file_id: string; file_name?: string | null; status: string; reason?: string | null }[];
};

type LeadContactUpdate = {
  full_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  loan_purpose?: string | null;
  requested_loan_amount?: number | null;
  estimated_credit_score?: number | null;
  referral_source?: string | null;
};

type RoomDeliveryReceipt = {
  id: string;
  channel: string;
  recipient_masked?: string | null;
  status: string;
  detail?: string | null;
  provider_accepted: boolean;
  created_at: string;
};

type RoomRequestResult = {
  requested_document_id?: string | null;
  room_url: string;
  overall_status: "created" | "success" | "partial" | "failed";
  deliveries: RoomDeliveryReceipt[];
};

const PROBABILITY_FILTERS = [
  { value: "all", label: "All probability" },
  { value: "Good probability - book call", label: "Good probability" },
  { value: "Promising but needs one clarification", label: "Promising" },
  { value: "Not enough evidence yet", label: "Not enough evidence" },
  { value: "Poor probability based on current file", label: "Poor probability" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All status" },
  { value: "collecting", label: "Collecting" },
  { value: "reviewing", label: "Reviewing" },
  { value: "reviewed", label: "Reviewed" },
  { value: "completed", label: "Completed" },
];

const VARIANT_FILTERS = [
  { value: "all", label: "All reviews" },
  { value: "dealer", label: "Dealer" },
  { value: "real_estate", label: "Real estate" },
  { value: "commercial_foreclosure_bailout_v1", label: "Foreclosure rescue" },
  // Raw slugs pass straight through the backend's variant_filter else-branch.
  { value: "mca_refi_v1", label: "MCA refinance" },
];

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZES = [25, 50, 100] as const;

function presentContact(value?: string | null): string {
  return value?.trim() || "Not provided";
}

function emptyUnderwritingDraft(): UnderwritingDraft {
  return {
    underwriting_status: "collecting_docs",
    target_dscr: "",
    reviewer_notes: "",
    forecast_fee_points: "",
    estimated_close_date: "",
    funded_amount: "",
  };
}

function underwritingDraftFromState(state: ApplicationUnderwritingState | null): UnderwritingDraft {
  if (!state) return emptyUnderwritingDraft();
  return {
    underwriting_status: state.underwriting_status,
    target_dscr: state.target_dscr == null ? "" : String(state.target_dscr),
    reviewer_notes: state.reviewer_notes || "",
    forecast_fee_points: state.forecast_fee_points == null ? "" : String(state.forecast_fee_points),
    estimated_close_date: state.estimated_close_date || "",
    funded_amount: state.funded_amount == null ? "" : String(state.funded_amount),
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AdminAIUnderwriterLeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useConsoleAuth();
  const { requestReview, isReviewing } = useAIReview();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { data: unifiedFiles, refetch: refetchUnifiedFiles } = useUnifiedOperatorFiles({ limit: 500 });
  const leadParam = searchParams.get("lead");
  const partnerUserId = searchParams.get("partner");
  const requestedStep = searchParams.get("step");
  const initialSubmissionStep = requestedStep === "6" ? 5 : requestedStep === "5" ? 4 : requestedStep === "4" ? 2 : requestedStep && /^[1-5]$/.test(requestedStep) ? Number(requestedStep) : undefined;
  const initialEvidenceTab = requestedStep === "4" || searchParams.get("tab") === "banking" ? "banking" : "requirements";
  const isIntakeOperator = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  const canGovern = me?.role === Role.SUPER_ADMIN;
  // Delete is the desk's — super admin and underwriting — and nobody else's.
  const canDelete = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  const [deleteRow, setDeleteRow] = useState<LeadRow | null>(null);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [archivedFilter, setArchivedFilter] = useState<"active" | "archived" | "all">("all");
  const [variantFilter, setVariantFilter] = useState(searchParams.get("variant") || "all");
  const [probabilityFilter, setProbabilityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [linkLead, setLinkLead] = useState<LinkLead | null>(null);
  const [economicsRow, setEconomicsRow] = useState<UnifiedFileRow | null>(null);
  const [leadDetailMinimized, setLeadDetailMinimized] = useState(false);
  const listShellRef = useRef<HTMLDivElement | null>(null);
  const detailShellRef = useRef<HTMLDivElement | null>(null);
  const minimizedResumeRef = useRef<HTMLButtonElement | null>(null);
  const detailReturnFocusRef = useRef<HTMLElement | null>(null);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadLeads(nextOffset = offset) {
    setLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(nextOffset),
        status_filter: statusFilter,
        probability_status: probabilityFilter,
        variant_filter: variantFilter,
        archived_filter: archivedFilter,
      });
      if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
      if (partnerUserId) params.set("partner_user_id", partnerUserId);
      const data = await call<LeadPage>(`/admin/ai-underwriter-leads?${params.toString()}`);
      setRows(data.items);
      setTotal(data.total);
      setOffset(data.offset);
      if (!data.items.length) setNotice("No dealer leads match these filters.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Dealer leads are unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function openLead(id: string) {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (active?.closest(".ai-intake-list-shell")) detailReturnFocusRef.current = active;
    setSelectedId(id);
    setLeadDetailMinimized(false);
    setDetailLoading(true);
    setNotice("");
    try {
      const data = await call<LeadDetail>(`/admin/ai-underwriter-leads/${id}`);
      setDetail(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lead detail is unavailable.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function createLead(payload: CreateLeadPayload, evidenceFiles: File[]): Promise<LeadDetail | undefined> {
    setCreating(true);
    setNotice("");
    try {
      const screened = await screenPdfUploads(evidenceFiles);
      const lockedNotice = screened.rejected.length ? passwordProtectedPdfUploadNotice(screened.rejected) : "";
      if (!screened.uploadable.length && screened.rejected.length) {
        setNotice(lockedNotice);
        return;
      }
      const res = await call<LeadDetail>("/admin/ai-underwriter-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const profile = await call<ApplicationProfile>("/application-profiles/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_kind: "intake", source_id: res.intake.id }) });
      await call(`/application-profiles/${profile.id}/draft`, { method: "POST" });
      let uploaded = 0;
      for (const file of screened.uploadable) {
        const init = await call<{ file_id: string; upload_url: string; required_headers: Record<string, string> }>(`/admin/ai-underwriter-leads/${res.intake.id}/files/upload-init`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requested_document_id: null, file_name: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size }) });
        const upload = await fetch(init.upload_url, { method: "PUT", headers: init.required_headers, body: file });
        if (!upload.ok) throw new Error(`${file.name} could not be uploaded. The draft was preserved.`);
        await call(`/admin/ai-underwriter-leads/${res.intake.id}/files/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: init.file_id }) });
        uploaded += 1;
      }
      setNotice([
        uploaded ? `${uploaded} evidence file${uploaded === 1 ? "" : "s"} uploaded. Extraction continues in the background.` : "",
        lockedNotice,
      ].filter(Boolean).join(" "));
      await loadLeads(0);
      await openLead(res.intake.id);
      router.replace(`/admin/ai-underwriter-leads?lead=${res.intake.id}&step=1`, { scroll: false });
      return res;
    } catch (error) {
      // Duplicate email → backend returns 409 with the existing intake_id; open it.
      if (error instanceof ApiError && error.status === 409) {
        const detail = (error.body as { detail?: { intake_id?: string; message?: string } } | undefined)?.detail;
        if (detail?.intake_id) {
          setCreateOpen(false);
          setNotice(detail.message || "A lead already exists for this email — opening it.");
          await openLead(detail.intake_id);
          router.replace(`/admin/ai-underwriter-leads?lead=${detail.intake_id}&step=1`, { scroll: false });
          return;
        }
      }
      setNotice(documentUploadErrorMessage(error, "Could not create the lead."));
    } finally {
      setCreating(false);
    }
  }

  async function exportPdf(id: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/admin/ai-underwriter-leads/${id}/intelligence.pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      setNotice(`PDF export failed: ${res.status} ${res.statusText}`);
      return;
    }
    // Prefer the server's dealer-named Content-Disposition filename.
    const dealer = detail?.intake.business_name || detail?.intake.full_name || "";
    const safeDealer = dealer.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = (match && decodeURIComponent(match[1].trim().replace(/"/g, ""))) || (safeDealer ? `${safeDealer}-intelligence.pdf` : "dealer-ai-intelligence.pdf");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadPackageZip(id: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/admin/ai-underwriter-leads/${id}/package.zip`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`Package export failed: ${res.status} ${res.statusText}`);
    // Prefer the server's Content-Disposition filename (already named after the
    // dealer), falling back to the dealer name from the loaded lead detail.
    const dealer = detail?.intake.business_name || detail?.intake.full_name || "";
    const safeDealer = dealer.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = (match && decodeURIComponent(match[1].trim().replace(/"/g, ""))) || (safeDealer ? `${safeDealer}-package.zip` : "underwriting-package.zip");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function refreshSelectedLead() {
    if (selectedId) await openLead(selectedId);
  }

  useEffect(() => {
    const onReviewCompleted = (event: Event) => {
      const intakeId = (event as CustomEvent<{ intakeId?: string }>).detail?.intakeId;
      if (!intakeId || intakeId !== selectedId) return;
      void refreshSelectedLead();
      void loadLeads();
      setNotice("AI review complete - showing the latest breakdown.");
    };
    window.addEventListener("qc-ai-review-completed", onReviewCompleted);
    return () => window.removeEventListener("qc-ai-review-completed", onReviewCompleted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function postLeadNote(id: string, content: string, imageIds: string[] = []) {
    await call(`/admin/ai-underwriter-leads/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, image_ids: imageIds }),
    });
    await refreshSelectedLead();
  }

  async function updateOutcomeStatus(id: string, outcomeStatus: string) {
    await call(`/admin/ai-underwriter-leads/${id}/outcome-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome_status: outcomeStatus }),
    });
    await refreshSelectedLead();
    await loadLeads();
  }

  async function updateLeadLanguage(id: string, language: string) {
    await call(`/admin/ai-underwriter-leads/${id}/language`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_language: language }),
    });
    await refreshSelectedLead();
    await loadLeads();
  }

  async function updateLeadContact(id: string, payload: LeadContactUpdate) {
    await call(`/admin/ai-underwriter-leads/${id}/contact`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await refreshSelectedLead();
    await loadLeads();
  }

  async function cancelLeadDeletionRequest(id: string) {
    await call(`/admin/ai-underwriter-leads/${id}/cancel-deletion-request`, { method: "POST" });
    await refreshSelectedLead();
    await loadLeads();
  }

  async function restoreLead(id: string) {
    setNotice("");
    try {
      await call<LeadRow>(`/admin/ai-underwriter-leads/${id}/restore`, { method: "POST" });
      setNotice("AI Intake file restored with its existing documents and history.");
      await loadLeads(offset);
    } catch (error) {
      setNotice(apiErrorMessage(error, "This AI Intake file could not be restored."));
    }
  }

  async function deleteLead(id: string, confirmName: string) {
    await call(`/admin/ai-underwriter-leads/${id}/confirm-deletion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_name: confirmName }),
    });
    await loadLeads(offset);
  }

  async function confirmLeadDeletion(id: string, confirmName: string) {
    await deleteLead(id, confirmName);
    closeLead();
  }

  // From the table row: the same reversible archive and confirmation dialog.
  async function deleteFromRow(row: LeadRow, confirmName: string) {
    await deleteLead(row.id, confirmName);
    if (selectedId === row.id) closeLead();
    setDeleteRow(null);
  }

  function closeLead() {
    setSelectedId(null);
    setDetail(null);
    setLeadDetailMinimized(false);
    // Strip ?lead= so the modal does not auto-reopen from the deep-link effect.
    if (leadParam) router.replace("/admin/ai-underwriter-leads");
    // Reflect any in-modal re-run/uploads in the list.
    loadLeads().catch(() => undefined);
  }

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      if (selectedId) {
        if (leadDetailMinimized) minimizedResumeRef.current?.focus({ preventScroll: true });
        else detailShellRef.current?.focus({ preventScroll: true });
        return;
      }

      const returnTarget = detailReturnFocusRef.current;
      if (returnTarget?.isConnected && returnTarget.getClientRects().length > 0) {
        returnTarget.focus({ preventScroll: true });
      } else {
        listShellRef.current?.focus({ preventScroll: true });
      }
      detailReturnFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [leadDetailMinimized, selectedId]);

  function openRerun() {
    if (!selectedId) return;
    requestReview({
      intakeId: selectedId,
      leadName: detail?.intake.business_name || detail?.intake.full_name || "AI intake",
    });
  }

  // Map the admin LeadDetail into the IntakeResponse shape the cockpit expects,
  // and build a Clerk-authenticated transport adapter against the admin endpoints.
  const cockpitResponse = useMemo<IntakeResponse | null>(() => {
    if (!detail) return null;
    return {
      token: null,
      session_token: null,
      intake: {
        id: detail.intake.id,
        bucket_id: detail.intake.bucket_id,
        full_name: detail.intake.full_name,
        email: detail.intake.email,
        phone: detail.intake.phone ?? null,
        business_name: detail.intake.business_name ?? null,
        loan_purpose: detail.intake.loan_purpose ?? null,
        requested_loan_amount: detail.intake.requested_loan_amount ?? null,
        estimated_credit_score: detail.intake.estimated_credit_score ?? null,
        referral_source: detail.intake.referral_source ?? null,
        status: detail.intake.status,
        result_snapshot: detail.intake.result_snapshot ?? null,
      },
      requested_documents: detail.requested_documents,
      files: detail.files.filter(isSourceEvidenceFile),
      latest_review: detail.latest_review ?? null,
      messages: detail.messages,
      assistant_message: "",
      widget: null,
    } as unknown as IntakeResponse;
  }, [detail]);

  const cockpitAdapter = useMemo<LeadCockpitAdapter | null>(() => {
    if (!selectedId) return null;
    const base = `/admin/ai-underwriter-leads/${selectedId}`;
    const post = <T,>(path: string, body?: unknown) =>
      call<T>(`${base}${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    const isDealer = detail?.intake.variant !== "real_estate_dscr_v1";
    return {
      sendChat: (message: string) => post<IntakeResponse>("/chat", { message }),
      uploadInit: (payload) => post("/files/upload-init", payload),
      uploadComplete: async (fileId: string) => {
        await post("/files/complete", { file_id: fileId });
      },
      runReview: () => post<IntakeResponse>("/run-review"),
      reload: () => call<IntakeResponse>(base),
      loadClientThread: () => call<ClientThreadResponse>(`${base}/client-thread`, { cache: "no-store" }),
      replyClientThread: (message: string, alsoSms = false) => post<ClientThreadResponse>("/client-thread/reply", { message, also_sms: alsoSms }),
      resumeClientThreadAI: () => post<ClientThreadResponse>("/client-thread/resume", {}),
      // PFS/debt-schedule request + fill-in are dealer-only — real-estate
      // leads never see these fields, so the adapter omits them entirely.
      requestPfs: isDealer ? async (ownerName?: string) => { await post("/request-pfs", { owner_name: ownerName || null }); } : undefined,
      requestDebtSchedule: isDealer ? async () => { await post("/request-debt-schedule"); } : undefined,
      submitPfs: isDealer ? async (payload) => { await post("/requested-documents/pfs", payload); } : undefined,
      submitDebtSchedule: isDealer ? async (payload) => { await post("/requested-documents/debt-schedule", payload); } : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, detail?.intake.variant]);

  async function generateExecutiveSummary(id: string) {
    setNotice("");
    try {
      await call<Artifact>(`/admin/ai-underwriter-leads/${id}/executive-summary`, { method: "POST" });
      await refreshSelectedLead();
      setNotice("Executive summary generated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Executive summary failed.");
    }
  }

  async function generateLenderPacket(id: string) {
    setNotice("");
    try {
      await call<Artifact>(`/admin/ai-underwriter-leads/${id}/lender-packet`, { method: "POST" });
      await refreshSelectedLead();
      setNotice("Lender packet generated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lender packet failed.");
    }
  }

  async function generatePackageReadiness(id: string): Promise<PackageReadinessGeneration> {
    setNotice("");
    try {
      const generated = await call<PackageReadinessGeneration>(`/admin/ai-underwriter-leads/${id}/package-readiness/generate`, { method: "POST" });
      try {
        await refreshSelectedLead();
        setNotice("Executive summary and lender package refreshed together and saved to the bucket.");
      } catch {
        // The generation POST already committed immutable package versions.
        // A failed follow-up reload must not look like generation failed and
        // tempt the operator to create another version unnecessarily.
        setNotice("Both PDFs were generated and saved. Reload the file to refresh the surrounding workspace.");
      }
      return generated;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The lender package could not be refreshed.");
      throw error;
    }
  }

  async function generatePrequalification(id: string) {
    setNotice("");
    try {
      await call<Artifact>(`/admin/ai-underwriter-leads/${id}/prequalification`, { method: "POST" });
      await refreshSelectedLead();
      setNotice("Prequalification drafted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Prequalification failed.");
    }
  }

  async function previewVendorEmail(id: string, payload: { to_emails: string[]; cc_emails: string[]; subject?: string; body?: string; include_lender_packet?: boolean }) {
    setNotice("");
    try {
      const preview = await call<VendorEmailPreview>(`/admin/ai-underwriter-leads/${id}/vendor-email/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refreshSelectedLead();
      return preview;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Vendor email preview failed.");
      throw error;
    }
  }

  async function sendVendorEmail(id: string, payload: VendorEmailSendPayload) {
    setNotice("");
    const res = await call<VendorEmailSendResult>(`/admin/ai-underwriter-leads/${id}/vendor-email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await refreshSelectedLead();
    return res;
  }

  async function ingestFromDrive(id: string, driveFileIds: string[]) {
    setNotice("");
    const res = await call<DriveIngestResult>(`/admin/ai-underwriter-leads/${id}/files/ingest-from-drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drive_file_ids: driveFileIds }),
    });
    await refreshSelectedLead();
    return res;
  }

  useEffect(() => {
    if (!meLoading && me && !isIntakeOperator) router.replace("/");
  }, [isIntakeOperator, meLoading, me, router]);

  useEffect(() => {
    if (isIntakeOperator) loadLeads(0).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntakeOperator, statusFilter, archivedFilter, variantFilter, probabilityFilter, submittedQuery, partnerUserId, pageSize]);

  useEffect(() => {
    if (isIntakeOperator && leadParam && leadParam !== selectedId) {
      openLead(leadParam).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntakeOperator, leadParam]);

  const counts = useMemo(() => ({
    total,
    good: rows.filter((row) => row.probability_status === "Good probability - book call").length,
    booked: rows.filter((row) => row.call_booked).length,
    missing: rows.reduce((sum, row) => sum + row.missing_required_count, 0),
  }), [rows, total]);
  const unifiedByIntake = useMemo(() => new Map(
    (unifiedFiles?.items ?? []).filter((file) => file.intake_id).map((file) => [file.intake_id as string, file]),
  ), [unifiedFiles]);
  const intakeEconomicsRows = useMemo(() => {
    const visibleIntakes = new Set(rows.map((row) => row.id));
    return (unifiedFiles?.items ?? []).filter((file) => file.intake_id && visibleIntakes.has(file.intake_id));
  }, [rows, unifiedFiles]);
  const aiIntakeTableStorageKey = me?.id ? `ai-intake:${me.id}` : null;
  const {
    rows: orderedRows,
    pinnedIds,
    isPinned,
    togglePin,
    clearPins,
  } = usePinnedRows({
    rows,
    getId: (row) => row.id,
    storageKey: aiIntakeTableStorageKey,
  });

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSubmittedQuery(query);
  }

  if (me && !isIntakeOperator) return null;

  const activeLeadId = selectedId;
  const activeLeadTitle = detail?.intake.business_name || detail?.intake.full_name || "AI intake file";
  const selectedLeadPanel = activeLeadId ? (
    <LeadDetailPanel
      detail={detail}
      loading={detailLoading}
      initialNotesOpen={searchParams.get("notes") === "1"}
      initialView={searchParams.get("view") === "underwriting" ? "underwriting" : searchParams.get("view") === "reviewer" ? "reviewer" : searchParams.get("view") === "production" ? "production" : searchParams.get("view") === "communications" ? "communications" : searchParams.get("view") === "audit" ? "audit" : "workspace"}
      initialCommunicationChannel={searchParams.get("channel") === "client" ? "client" : searchParams.get("channel") === "email" ? "email" : "underwriter"}
      initialSubmissionStep={initialSubmissionStep}
      initialEvidenceTab={initialEvidenceTab}
      canGovern={canGovern}
      canDelete={canDelete}
      onClose={closeLead}
      onMinimize={() => setLeadDetailMinimized(true)}
      onExport={() => exportPdf(activeLeadId)}
      onGenerateSummary={() => generateExecutiveSummary(activeLeadId)}
      onGeneratePacket={() => generateLenderPacket(activeLeadId)}
      onGeneratePackage={() => generatePackageReadiness(activeLeadId)}
      onGeneratePrequalification={() => generatePrequalification(activeLeadId)}
      onPreviewEmail={(payload) => previewVendorEmail(activeLeadId, payload)}
      onSendEmail={(payload) => sendVendorEmail(activeLeadId, payload)}
      onIngestFromDrive={(ids) => ingestFromDrive(activeLeadId, ids)}
      onRerun={openRerun}
      rerunning={Boolean(activeLeadId && isReviewing(activeLeadId))}
      cockpitResponse={cockpitResponse}
      cockpitAdapter={cockpitAdapter}
      onCockpitResponse={(r) => {
        // Fold every cockpit response (chat turns, uploads, re-runs) back
        // into `detail` so switching tabs keeps the live conversation.
        setDetail((current) =>
          current
            ? {
                ...current,
                messages: r.messages ?? current.messages,
                files: r.files ?? current.files,
                requested_documents: r.requested_documents ?? current.requested_documents,
                latest_review: r.latest_review ?? current.latest_review,
                intake: { ...current.intake, result_snapshot: r.intake?.result_snapshot ?? current.intake.result_snapshot },
              }
            : current,
        );
      }}
      onDownloadZip={() => downloadPackageZip(activeLeadId)}
      onLinkBucketIntake={() => {
        if (detail?.intake) {
          setLinkLead({
            id: detail.intake.id,
            bucket_id: null,
            business_name: detail.intake.business_name,
            full_name: detail.intake.full_name,
          });
        }
      }}
      onPostNote={(content, imageIds) => postLeadNote(activeLeadId, content, imageIds)}
      onUpdateOutcomeStatus={(status) => updateOutcomeStatus(activeLeadId, status)}
      onUpdateLanguage={(language) => updateLeadLanguage(activeLeadId, language)}
      onUpdateContact={(payload) => updateLeadContact(activeLeadId, payload)}
      onCancelDeletionRequest={() => cancelLeadDeletionRequest(activeLeadId)}
      onConfirmDeletion={(confirmName) => confirmLeadDeletion(activeLeadId, confirmName)}
    />
  ) : null;

  const leadOverlays = (
    <>
      {deleteRow && canDelete ? (
        <ConfirmDeleteLeadModal
          open={deleteRow !== null}
          onClose={() => setDeleteRow(null)}
          expectedName={deleteRow.business_name || deleteRow.full_name}
          onConfirm={(confirmName) => deleteFromRow(deleteRow, confirmName)}
        />
      ) : null}
      <BucketIntakeLinkDrawer
        open={linkLead !== null}
        onClose={() => setLinkLead(null)}
        initialBucketId={linkLead?.bucket_id}
        initialIntakeId={linkLead?.id}
        title="Link AI intake to bucket"
      />
      <FileEconomicsDrawer
        open={economicsRow !== null}
        row={economicsRow}
        onClose={() => setEconomicsRow(null)}
        onSaved={() => void refetchUnifiedFiles()}
      />

    </>
  );

  return (
    <>
    <div
      ref={listShellRef}
      tabIndex={-1}
      aria-label="AI intake file list"
      className={cx("ai-intake-list-shell", selectedLeadPanel && !leadDetailMinimized && "workspace-hidden")}
      style={{ maxWidth: 1480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, minHeight: "calc(100dvh - 95px - var(--pad-y))" }}
    >
      <div className="ckhead" style={{ flexShrink: 0 }}>
        <div className="ckrow">
          <h1>AI intake</h1>
          <CellChip tone="mut">{counts.total} files</CellChip>
          <span className="sp" />
          <span className="sub">Operational view across evidence, underwriting, ownership, and next actions.</span>
          {canGovern ? <Btn variant="pri" size="sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={13} /> Create intake</Btn> : null}
          <PageActionMenu label="AI intake actions" items={[
            { label: "What changed", onSelect: () => setWhatsNewOpen(true) },
            ...(canGovern ? [{ label: "Open document buckets", href: "/admin/buckets" }] : []),
          ]} />
        </div>
        <div className="cktabs" role="tablist" aria-label="AI intake vertical">
          {VARIANT_FILTERS.map((item) => <button type="button" role="tab" aria-selected={variantFilter === item.value} className={variantFilter === item.value ? "on" : undefined} key={item.value} onClick={() => { setOffset(0); setVariantFilter(item.value); }}>{item.label}</button>)}
        </div>
      </div>

      <PipelineEconomicsStrip
        title="AI Intake pipeline forecast"
        rows={intakeEconomicsRows}
        loading={!unifiedFiles}
        className="ai-intake-economics"
      />

      <div className="kpis" style={{ flexShrink: 0 }}>
        <Stat title="Total leads" value={String(counts.total)} sub="all matching filters" />
        <Stat title="Good probability" value={String(counts.good)} sub="visible page" good />
        <Stat title="Booked calls" value={String(counts.booked)} sub="visible page" />
        <Stat title="Missing items" value={String(counts.missing)} sub="visible page" warn />
      </div>

      <div className="panel" style={{ flexShrink: 0 }}>
        <form className="panel-h" onSubmit={submitSearch} style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) repeat(3, minmax(160px, 220px)) auto", gap: 10, alignItems: "center" }}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, owner, email, phone, dealership"
            aria-label="Search leads"
          />
          <Select value={statusFilter} onChange={(event) => { setOffset(0); setStatusFilter(event.target.value); }} aria-label="Status">
            {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
          <Select value={probabilityFilter} onChange={(event) => { setOffset(0); setProbabilityFilter(event.target.value); }} aria-label="Probability">
            {PROBABILITY_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
          <Select
            value={archivedFilter}
            onChange={(event) => {
              setOffset(0);
              setArchivedFilter(event.target.value as "active" | "archived" | "all");
            }}
            aria-label="Record visibility"
          >
            <option value="all">Active + archived</option>
            <option value="active">Active only</option>
            <option value="archived">Archived only</option>
          </Select>
          <Btn type="submit" variant="pri">Search</Btn>
        </form>
      </div>

      {notice ? <WarnLine>{notice}</WarnLine> : null}

      <TableWorkspace
        title="AI intake files"
        description="Scroll the page to give the file list the full workspace, or focus the table for concentrated review."
        storageKey={aiIntakeTableStorageKey ?? undefined}
        actions={pinnedIds.length ? <Btn size="sm" onClick={clearPins}>Clear pinned ({pinnedIds.length})</Btn> : null}
        footer={(
          <div className="row" style={{ width: "100%", flexWrap: "nowrap" }}>
            <span className="sub">{total ? `${offset + 1}-${Math.min(offset + pageSize, total)} of ${total}` : "0 leads"}</span>
            <span className="sp" />
            <label className="row sub" style={{ gap: 6, flexWrap: "nowrap" }}>
              Rows
              <Select
                aria-label="Rows per page"
                value={String(pageSize)}
                onChange={(event) => {
                  setOffset(0);
                  setPageSize(Number(event.target.value));
                }}
              >
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </Select>
            </label>
            <Btn disabled={offset === 0 || loading} onClick={() => loadLeads(Math.max(0, offset - pageSize))}>Previous</Btn>
            <Btn disabled={offset + pageSize >= total || loading} onClick={() => loadLeads(offset + pageSize)}>Next</Btn>
          </div>
        )}
      >
        <div className="tblwrap">
          <table className="tbl">
            <caption className="sr-only">AI intake files</caption>
            <thead><tr><th>File</th><th>Contact</th><th>Opened by</th><th>Referral</th><th>Vertical</th><th>Probability</th><th>Status</th><th>Forecast</th><th>Evidence</th><th>Missing</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={11}><div className="empty">Loading AI intake...</div></td></tr> : orderedRows.map((row) => {
                const unified = unifiedByIntake.get(row.id);
                const pinned = isPinned(row.id);
                return (
                  <tr
                    key={row.id}
                    onClick={() => { if (!row.archived_at) void openLead(row.id); }}
                    className={cx(semanticStatusClass(row.status), selectedId === row.id && "tone-acc", pinned && "table-row-pinned")}
                    data-pinned={pinned || undefined}
                  >
                    <td className="lead-file-cell">
                      <button type="button" className="linky" disabled={Boolean(row.archived_at)} onClick={(event) => { event.stopPropagation(); void openLead(row.id); }}>{row.business_name || row.full_name}</button>
                      <div className="sub num">{unified?.ref || row.id.slice(0, 8)}</div>
                      {row.business_name ? <div className="sub">Owner: {row.full_name}</div> : null}
                      {row.archived_at ? <CellChip tone="mut">Archived {new Date(row.archived_at).toLocaleDateString()}</CellChip> : null}
                    </td>
                    <td className="lead-contact-cell">
                      <div className="lead-contact-line">{presentContact(row.email)}</div>
                      <div className="lead-contact-line sub">{presentContact(row.phone)}</div>
                    </td>
                    <td><CellChip tone={unified ? originTone(unified.origin) : "mut"}>{row.opened_by_name || unified?.rep_name || unified?.origin_label || "House desk"}</CellChip><div className="sub">{row.opened_by_role || unified?.case_ref || "Internal"}</div></td>
                    <td className="sub">{row.referral_source || unified?.dealer_name || "Direct"}</td>
                    <td><CellChip tone={unified ? verticalTone(unified.vertical) : "acc"}>{unified?.vertical_label || variantLabel(row.variant)}</CellChip></td>
                    <td><CellChip tone={probabilityTone(row.probability_status)}>{row.probability_status || "Awaiting review"}</CellChip></td>
                    <td><CellChip tone={row.archived_at ? "mut" : row.status === "completed" ? "ok" : row.status === "reviewing" ? "acc" : "warn"}>{row.archived_at ? "archived" : row.status}</CellChip></td>
                    <td>
                      {unified?.forecast_fee_points != null ? (
                        <button type="button" className="linky" onClick={(event) => { event.stopPropagation(); setEconomicsRow(unified); }}>
                          <b>{unified.forecast_fee_points.toFixed(2)} pts · {formatMoney(unified.forecast_earnings)}</b>
                          <span className="sub" style={{ display: "block" }}>{unified.estimated_close_date ? `Est. ${new Date(`${unified.estimated_close_date}T12:00:00`).toLocaleDateString()}` : "Add closing date"}</span>
                        </button>
                      ) : unified ? <Btn size="sm" onClick={(event) => { event.stopPropagation(); setEconomicsRow(unified); }}>Add forecast</Btn> : <span className="sub">Not forecast</span>}
                    </td>
                    <td>{row.archived_at ? <span className="cellchip c-mut">{row.file_count} retained files</span> : <button type="button" className="cellchip c-pet" onClick={(event) => { event.stopPropagation(); setLinkLead(row); }}>{row.file_count} files · {row.bucket_name || "Bucket"}</button>}</td>
                    <td className="num">{row.missing_required_count}</td>
                    <td className="r">
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <PinRowButton pinned={pinned} onToggle={() => togglePin(row.id)} label={row.business_name || row.full_name} />
                        {row.archived_at ? (
                          <Btn size="sm" variant="pri" onClick={(event) => { event.stopPropagation(); void restoreLead(row.id); }}>Restore</Btn>
                        ) : (
                          <>
                            <Btn size="sm" onClick={(event) => { event.stopPropagation(); void openLead(row.id); }}>Open</Btn>
                            {canDelete ? <Btn size="sm" title="Archive this intake and retain its files" onClick={(event) => { event.stopPropagation(); setDeleteRow(row); }}>Archive</Btn> : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && !orderedRows.length ? <tr><td colSpan={11}><div className="empty">No AI intake files match these filters.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </TableWorkspace>

      <WhatsNewRail
        open={whatsNewOpen}
        onClose={() => setWhatsNewOpen(false)}
        onOpenLead={(intakeId) => {
          setWhatsNewOpen(false);
          openLead(intakeId).catch(() => undefined);
          // Reflect the cleared NEW badge once the lead loads.
          loadLeads().catch(() => undefined);
        }}
      />

      {createOpen && canGovern ? (
        <CreateLeadModal
          onClose={() => setCreateOpen(false)}
          onCreate={createLead}
          creating={creating}
        />
      ) : null}
    </div>
    {selectedLeadPanel ? (
      <div
        ref={detailShellRef}
        className={cx("ai-intake-detail-shell", leadDetailMinimized && "workspace-minimized")}
        role="region"
        aria-label={`${activeLeadTitle} detail`}
        aria-hidden={leadDetailMinimized}
        tabIndex={leadDetailMinimized ? undefined : -1}
      >
        {notice ? <WarnLine>{notice}</WarnLine> : null}
        {selectedLeadPanel}
      </div>
    ) : null}
    {selectedLeadPanel && leadDetailMinimized ? (
      <div className="workspace-minimized-dock" role="status" aria-live="polite">
        <button ref={minimizedResumeRef} type="button" className="workspace-minimized-summary" onClick={() => setLeadDetailMinimized(false)}>
          <span className="workspace-minimized-mark">-</span>
          <span>
            <b>{activeLeadTitle}</b>
            <small>AI intake workspace paused where you left off</small>
          </span>
        </button>
        <Btn size="sm" variant="pri" onClick={() => setLeadDetailMinimized(false)}>Resume</Btn>
        <IconBtn aria-label="Close minimized intake file" title="Close" onClick={closeLead}>
          <Icon name="x" size={14} />
        </IconBtn>
      </div>
    ) : null}
    {leadOverlays}
    </>
  );
}

function LeadDetailPanel({
  detail,
  loading,
  initialNotesOpen = false,
  initialView = "workspace",
  initialCommunicationChannel = "underwriter",
  initialSubmissionStep,
  initialEvidenceTab = "requirements",
  canGovern,
  canDelete,
  onClose,
  onMinimize,
  onExport,
  onGenerateSummary,
  onGeneratePacket,
  onGeneratePackage,
  onGeneratePrequalification,
  onPreviewEmail,
  onSendEmail,
  onIngestFromDrive,
  onRerun,
  rerunning,
  cockpitResponse,
  cockpitAdapter,
  onCockpitResponse,
  onDownloadZip,
  onLinkBucketIntake,
  onPostNote,
  onUpdateOutcomeStatus,
  onUpdateLanguage,
  onUpdateContact,
  onCancelDeletionRequest,
  onConfirmDeletion,
}: {
  detail: LeadDetail | null;
  loading: boolean;
  initialNotesOpen?: boolean;
  initialView?: LeadDetailView;
  initialCommunicationChannel?: "underwriter" | "client" | "email";
  initialSubmissionStep?: number;
  initialEvidenceTab?: "requirements" | "banking";
  canGovern: boolean;
  // Delete is the desk's — super admin and underwriting — and nobody else's.
  canDelete: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onExport: () => void;
  onGenerateSummary: () => Promise<void> | void;
  onGeneratePacket: () => Promise<void> | void;
  onGeneratePackage: () => Promise<PackageReadinessGeneration>;
  onGeneratePrequalification: () => Promise<void> | void;
  onPreviewEmail: (payload: { to_emails: string[]; cc_emails: string[]; subject?: string; body?: string; include_lender_packet?: boolean }) => Promise<VendorEmailPreview>;
  onSendEmail: (payload: VendorEmailSendPayload) => Promise<VendorEmailSendResult>;
  onIngestFromDrive: (driveFileIds: string[]) => Promise<DriveIngestResult>;
  onRerun: () => void;
  rerunning: boolean;
  cockpitResponse: IntakeResponse | null;
  cockpitAdapter: LeadCockpitAdapter | null;
  onCockpitResponse: (r: IntakeResponse) => void;
  onDownloadZip: () => Promise<void>;
  onLinkBucketIntake: () => void;
  onPostNote: (content: string, imageIds: string[]) => Promise<void>;
  onUpdateOutcomeStatus: (status: string) => Promise<void>;
  onUpdateLanguage: (language: string) => Promise<void>;
  onUpdateContact: (payload: LeadContactUpdate) => Promise<void>;
  onCancelDeletionRequest: () => Promise<void>;
  onConfirmDeletion: (confirmName: string) => Promise<void>;
}) {
  const toast = useToast();
  const { getToken } = useConsoleAuth();
  const bookingLink = useBookingLink();
  const { data: currentUser } = useCurrentUser();
  const canUnderwrite = currentUser?.role === Role.SUPER_ADMIN || currentUser?.role === Role.LOAN_EXEC;
  const [activeTab, setActiveTab] = useState<"conversation" | "workspace">("conversation");
  const [workspaceSub, setWorkspaceSub] = useState<"overview" | "documents" | "client" | "credit" | "contracts" | "package">("overview");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [bankerModalOpen, setBankerModalOpen] = useState(false);
  const [notesPosting, setNotesPosting] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(initialNotesOpen);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [languageBusy, setLanguageBusy] = useState(false);
  // Real send (via the operator's connected Gmail) — recipients, Drive picker,
  // and selected Drive files to attach.
  const [toEmails, setToEmails] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  // Attachment toggles + how the recipient reaches the secure bucket.
  const [attachPacket, setAttachPacket] = useState(true);
  const [attachSummary, setAttachSummary] = useState(false);
  const [attachZip, setAttachZip] = useState(false);
  const [bucketAccess, setBucketAccess] = useState<BucketAccessMode>("login");
  // Separate picker for ingesting Drive files INTO the bucket for AI analysis
  // (distinct from the email-attach picker above).
  const [ingestPickerOpen, setIngestPickerOpen] = useState(false);
  const [ingestFiles, setIngestFiles] = useState<DriveFile[]>([]);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [prototypeView, setPrototypeView] = useState<LeadDetailView>(initialView);
  const [productionShareOpen, setProductionShareOpen] = useState(false);
  // "Record loan terms": the term-sheet drawer lives in the Production tab; the
  // Underwriting tab and the page-action menu ask for it through this flag.
  const [productionTermSheetOpen, setProductionTermSheetOpen] = useState(false);
  // The current term sheet on the profile (dealer files only) for the
  // Underwriting strip. Recorded through the drawer, read here.
  const [termSheet, setTermSheet] = useState<ApplicationTermSheetState | null>(null);
  const [communicationChannel, setCommunicationChannel] = useState<"updates" | "underwriter" | "client" | "email" | "partner" | "internal">("underwriter");
  const [submissionStep, setSubmissionStep] = useState(initialSubmissionStep ?? 1);
  const [evidenceTab, setEvidenceTab] = useState<"requirements" | "banking" | "files">(initialEvidenceTab);
  const [evidenceFocus, setEvidenceFocus] = useState<{ query: string; requestId: number } | null>(null);
  const [contextRailOpen, setContextRailOpen] = useState(false);
  const [packageTab, setPackageTab] = useState<"summary" | "package" | "delivery">("summary");
  const headerUploadRef = useRef<HTMLInputElement>(null);
  const initializedLeadIdRef = useRef<string | null>(null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [profileVerification, setProfileVerification] = useState<FileOwnerRequirementState | null>(null);
  const [underwriting, setUnderwriting] = useState<ApplicationUnderwritingState | null>(null);
  // The file behind this lead. The team strip and the Updates channel hang
  // off it, so it is hoisted from the first successful resolve rather than
  // read from `underwriting`, which only fills once the Underwriting tab has
  // been visited and its state has loaded.
  const [profileId, setProfileId] = useState<string | null>(null);
  const [programReadiness, setProgramReadiness] = useState<ApplicationProgramReadiness | null>(null);
  const [underwritingDraft, setUnderwritingDraft] = useState<UnderwritingDraft>(() => emptyUnderwritingDraft());
  const [underwritingLoading, setUnderwritingLoading] = useState(false);
  const [underwritingSaving, setUnderwritingSaving] = useState(false);
  const [underwritingError, setUnderwritingError] = useState<string | null>(null);
  const [pendingApprovalPatch, setPendingApprovalPatch] = useState<ApplicationUnderwritingPatch | null>(null);
  const [approvalDraft, setApprovalDraft] = useState<PipelineApprovalDraft>(() => pipelineApprovalDraft());
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [merchantOfferStatus, setMerchantOfferStatus] = useState<string | null>(null);
  const [merchantOfferSelection, setMerchantOfferSelection] = useState<OfferSelection | null>(null);
  const [applicationTermSelection, setApplicationTermSelection] = useState<OfferSelection | null>(null);
  const [selectedOfferKeys, setSelectedOfferKeys] = useState<string[]>([]);
  const [offerComposerOpen, setOfferComposerOpen] = useState(false);
  const [offerDeliveryReceipt, setOfferDeliveryReceipt] = useState<OfferDeliveryReceipt | null>(null);
  const [sendReviewOpen, setSendReviewOpen] = useState(false);
  const [notificationRoutingOpen, setNotificationRoutingOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestResult, setRequestResult] = useState<RoomRequestResult | null>(null);
  const [rotatePinOpen, setRotatePinOpen] = useState(false);
  const [rotatePinSaving, setRotatePinSaving] = useState(false);
  const [rotatePinDone, setRotatePinDone] = useState(false);
  const [rotatePin, setRotatePin] = useState("");
  const [rotatePinConfirm, setRotatePinConfirm] = useState("");
  const [requestDraft, setRequestDraft] = useState({
    name: "",
    category: "Business documents",
    description: "",
    allow_multiple_files: false,
    recipient_email: "",
    recipient_phone: "",
    email_room_link: true,
    sms_reminder: false,
  });
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    full_name: "",
    business_name: "",
    email: "",
    phone: "",
    requested_loan_amount: "",
    loan_purpose: "",
    estimated_credit_score: "",
    referral_source: "",
  });
  const result = detail ? preferredIntakeReviewResult(detail) : null;
  const forecastBasisAmount = underwriting?.underwriting_status === "closed_won"
    ? underwriting.funded_amount ?? underwriting.approved_amount ?? detail?.intake.requested_loan_amount ?? null
    : underwriting?.underwriting_status === "approved"
      ? underwriting.approved_amount ?? detail?.intake.requested_loan_amount ?? null
      : detail?.intake.requested_loan_amount ?? null;
  const forecastEarnings = underwriting?.forecast_fee_points != null && forecastBasisAmount != null
    ? Number(forecastBasisAmount) * Number(underwriting.forecast_fee_points) / 100
    : null;
  const evidence = asRecord(result?.document_evidence_map);
  const missing = arrayOfRecords(result?.missing_or_incomplete_items);
  const canonicalMissingDocuments = useMemo(
    () => leadCockpitOutstandingDocuments(
      detail?.requested_documents ?? [],
      detail?.files ?? [],
      programReadiness,
    ),
    [detail?.files, detail?.requested_documents, programReadiness],
  );
  const reviewMissingItems = useMemo(() => {
    const snapshotRows = compactMissingItems(missing);
    if (!programReadiness) return snapshotRows;
    const canonicalRows = canonicalMissingDocuments.map((document) => ({
      title: document.name,
      detail: document.description || "Required evidence is still outstanding.",
      priority: "high",
      query: [document.category, document.name].filter(Boolean).join(" "),
    }));
    return compactMissingItems([
      ...canonicalRows,
      ...leadCockpitNonDocumentMissingRows(snapshotRows, programReadiness),
    ]);
  }, [canonicalMissingDocuments, missing, programReadiness]);
  const strengths = arrayOfStrings(result?.strengths);
  const risks = arrayOfStrings(result?.risks);

  const artifacts = useMemo(
    () => [...(detail?.artifacts || [])].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
    [detail?.artifacts],
  );
  const summaryHistory = artifacts.filter((artifact) => artifact.artifact_type === "executive_summary");
  const packetHistory = artifacts.filter((artifact) => artifact.artifact_type === "lender_packet");
  const summary = summaryHistory[0];
  const packet = packetHistory[0];
  const packageInSync = Boolean(
    summary?.generation_id
    && summary.generation_id === packet?.generation_id
    && summary.status === "current"
    && packet?.status === "current"
    && summary.is_fresh === true
    && packet.is_fresh === true
  );
  const packageNeedsRefresh = Boolean(summary && packet && !packageInSync);
  const evidenceFiles = detail?.files.filter(isSourceEvidenceFile) ?? [];
  const evidenceFileCount = evidenceFiles.length;
  const prequalification = artifacts.find((artifact) => artifact.artifact_type === "prequalification");
  const isRealEstate = detail?.intake.variant === "real_estate_dscr_v1";
  // "dealer_gatekeeper_v1" is the dealer marker, and the only one the backend
  // gates on. A second legacy value here would have let a package be sent to a
  // client the signing gate then refused to show, so there is exactly one.
  const isDealerFile = detail?.intake.variant === "dealer_gatekeeper_v1";

  async function refreshFullPackage(openPreview = true) {
    const previewWindow = openPreview ? window.open("", "qc-lender-package-preview") : null;
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = "Preparing lender package";
      previewWindow.document.body.innerHTML = "<p style='font:16px system-ui;padding:32px'>Preparing the branded lender package preview…</p>";
    }
    setBusy("package-all");
    try {
      const generated = await onGeneratePackage();
      setPackageTab("summary");
      const previewUrl = generated.lender_packet.preview_url || generated.lender_packet.download_url || generated.executive_summary.preview_url || generated.executive_summary.download_url;
      if (previewWindow && previewUrl) previewWindow.location.replace(previewUrl);
      else if (previewWindow) previewWindow.close();
      toast.show(generated.superseded_bucket_file_ids.length
        ? "Package refreshed. The previous bucket PDFs were superseded."
        : "Executive summary and lender package are ready in the bucket.");
    } catch (reason) {
      previewWindow?.close();
      toast.show(apiErrorMessage(reason, "The lender package could not be refreshed."));
    } finally {
      setBusy("");
    }
  }

  const productionTermSelection = useMemo<OfferSelection | null>(() => {
    const current = termSheet?.current;
    if (!current || current.status !== "current") return null;
    const repayment = current.repayment_structure ?? current.extra?.repayment_structure;
    const cadence = current.payment_frequency ?? current.extra?.payment_frequency;
    const repaymentLabel = productionTermLabel(repayment, PRODUCTION_REPAYMENT_LABELS, "Repayment not recorded");
    const cadenceLabel = productionTermLabel(cadence, PRODUCTION_CADENCE_LABELS, "Monthly");
    return {
      key: `production_term_sheet:${current.id}:${current.version}`,
      ref: { kind: "production_term_sheet", term_sheet_id: current.id, expected_version: current.version },
      label: "Loan terms",
      description: `${current.facility_type} · ${formatMoney(current.approved_amount)} · ${repaymentLabel} · ${cadenceLabel} · version ${current.version}`,
      fileName: `loan-terms-v${current.version}.pdf`,
    };
  }, [termSheet]);

  const availableOfferSelections = useMemo(
    () => [productionTermSelection, applicationTermSelection, merchantOfferSelection].filter((item): item is OfferSelection => Boolean(item)),
    [applicationTermSelection, merchantOfferSelection, productionTermSelection],
  );
  const selectedOfferSelections = useMemo(
    () => availableOfferSelections.filter((item) => selectedOfferKeys.includes(item.key)),
    [availableOfferSelections, selectedOfferKeys],
  );

  const handleMerchantOfferReady = useCallback((next: OfferSelection | null) => {
    setMerchantOfferSelection((current) => {
      if (!current && !next) return current;
      if (current && next && current.key === next.key && current.description === next.description) return current;
      return next;
    });
  }, []);

  const handleApplicationTermReady = useCallback((next: OfferSelection | null) => {
    setApplicationTermSelection((current) => {
      if (!current && !next) return current;
      if (current && next && current.key === next.key && current.description === next.description) return current;
      return next;
    });
  }, []);

  useEffect(() => {
    if (isDealerFile) setApplicationTermSelection(null);
  }, [isDealerFile, profileId]);

  useEffect(() => {
    const available = new Set(availableOfferSelections.map((item) => item.key));
    setSelectedOfferKeys((current) => {
      const next = current.filter((key) => available.has(key));
      return next.length === current.length && next.every((key, index) => key === current[index]) ? current : next;
    });
  }, [availableOfferSelections]);

  const setOfferSelected = useCallback((selection: OfferSelection | null, selected: boolean) => {
    if (!selection) return;
    setSelectedOfferKeys((current) => selected
      ? current.includes(selection.key) ? current : [...current, selection.key]
      : current.filter((key) => key !== selection.key));
    setOfferDeliveryReceipt(null);
  }, []);

  const openOfferComposer = useCallback((selection?: OfferSelection | null) => {
    if (selection) {
      setSelectedOfferKeys((current) => current.includes(selection.key) ? current : [...current, selection.key]);
    }
    setOfferDeliveryReceipt(null);
    setOfferComposerOpen(true);
  }, []);

  const openCurrentOffersComposer = useCallback(() => {
    setSelectedOfferKeys(availableOfferSelections.map((item) => item.key));
    setOfferDeliveryReceipt(null);
    setOfferComposerOpen(true);
  }, [availableOfferSelections]);

  // The term sheet is keyed on the profile and exists only on dealer files; a
  // 404 (not a dealer file / no package visibility) simply means "none".
  const loadTermSheet = useCallback(async (profileId: string | null | undefined, authToken?: string | null) => {
    if (!profileId || !isDealerFile || !canUnderwrite) {
      setTermSheet(null);
      return;
    }
    try {
      const token = authToken ?? (await getToken());
      setTermSheet(await api<ApplicationTermSheetState>(`/production-packages/term-sheets/${profileId}`, { authToken: token ?? undefined }));
    } catch {
      setTermSheet(null);
    }
  }, [canUnderwrite, getToken, isDealerFile]);

  const loadUnderwritingState = useCallback(async () => {
    const intakeId = detail?.intake.id;
    setProfileId(null);
    setProgramReadiness(null);
    if (!intakeId || !canUnderwrite) {
      setUnderwriting(null);
      setUnderwritingDraft(emptyUnderwritingDraft());
      return;
    }
    setUnderwritingLoading(true);
    setUnderwritingError(null);
    try {
      const authToken = await getToken();
      const profile = await api<ApplicationProfile>("/application-profiles/resolve", {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({ source_kind: "intake", source_id: intakeId }),
      });
      // This runs on file open for every operator (the resolve endpoint is
      // theirs), so the strip shows on the workspace view without a trip
      // through Underwriting — and it is set before the underwriting read, so
      // a failure there does not hide the team.
      setProfileId(profile.id);
      const [state, readiness] = await Promise.all([
        api<ApplicationUnderwritingState>(`/application-profiles/${profile.id}/underwriting`, {
          authToken: authToken ?? undefined,
        }),
        api<ApplicationProgramReadiness>(`/application-profiles/${profile.id}/program-readiness`, {
          authToken: authToken ?? undefined,
        }),
      ]);
      setUnderwriting(state);
      setProgramReadiness(readiness);
      setUnderwritingDraft(underwritingDraftFromState(state));
      await loadTermSheet(profile.id, authToken);
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Underwriting state could not be loaded."));
    } finally {
      setUnderwritingLoading(false);
    }
  }, [canUnderwrite, detail?.intake.id, getToken, loadTermSheet]);

  const refreshProgramReadiness = useCallback(async () => {
    if (!canUnderwrite) return;
    if (!profileId) {
      await loadUnderwritingState();
      return;
    }
    try {
      const authToken = await getToken();
      setProgramReadiness(await api<ApplicationProgramReadiness>(`/application-profiles/${profileId}/program-readiness`, {
        authToken: authToken ?? undefined,
      }));
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Evidence readiness could not be refreshed."));
    }
  }, [canUnderwrite, getToken, loadUnderwritingState, profileId]);

  const refreshUnderwritingFromTerms = useCallback(async () => {
    const activeProfileId = underwriting?.profile_id ?? profileId;
    if (!activeProfileId || !canUnderwrite) return;
    try {
      const authToken = await getToken();
      const state = await api<ApplicationUnderwritingState>(`/application-profiles/${activeProfileId}/underwriting`, {
        authToken: authToken ?? undefined,
      });
      setUnderwriting(state);
      // Terms may advance the lifecycle, but must never erase target DSCR or
      // reviewer notes that are still being drafted in the parent panel.
      setUnderwritingDraft((current) => ({
        ...current,
        underwriting_status: state.underwriting_status,
      }));
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Underwriting state could not be refreshed."));
    }
  }, [canUnderwrite, getToken, profileId, underwriting?.profile_id]);

  const handleCockpitResponse = useCallback((response: IntakeResponse) => {
    onCockpitResponse(response);
    // Uploads and accepted/overridden evidence can change readiness without
    // changing the selected intake id, so its initial-load effect will not run.
    void refreshProgramReadiness();
  }, [onCockpitResponse, refreshProgramReadiness]);

  function openTermSheet() {
    setPrototypeView("production");
    setProductionTermSheetOpen(true);
  }

  function closeTermSheet() {
    setProductionTermSheetOpen(false);
    void loadTermSheet(underwriting?.profile_id);
  }

  async function saveUnderwritingPatch(patch: ApplicationUnderwritingPatch): Promise<boolean> {
    if (!detail || !canUnderwrite) return false;
    setUnderwritingSaving(true);
    setUnderwritingError(null);
    try {
      const authToken = await getToken();
      let profileId = underwriting?.profile_id;
      if (!profileId) {
        const profile = await api<ApplicationProfile>("/application-profiles/resolve", {
          method: "POST",
          authToken: authToken ?? undefined,
          body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }),
        });
        profileId = profile.id;
      }
      const statusChanged = Boolean(patch.underwriting_status && patch.underwriting_status !== underwriting?.underwriting_status);
      const isApprovalMove = statusChanged && patch.underwriting_status === "approved";
      const remainingPatch = { ...patch };
      if (statusChanged) delete remainingPatch.underwriting_status;
      if (isApprovalMove) {
        // Approval details belong to the lifecycle transaction below. Keep
        // unrelated reviewer fields (for example, policy target DSCR) out of
        // that contract, but save them before moving so a later write cannot
        // make a successful approval look failed in the UI.
        delete remainingPatch.approved_amount;
        delete remainingPatch.approved_dscr;
        delete remainingPatch.reviewer_notes;
        if (Object.keys(remainingPatch).length) {
          await api<ApplicationUnderwritingState>(`/application-profiles/${profileId}/underwriting`, {
            method: "PATCH",
            authToken: authToken ?? undefined,
            body: JSON.stringify(remainingPatch),
          });
        }
      }
      if (statusChanged) {
        const moveBody: PipelineMoveRequest = {
          target_status: patch.underwriting_status!,
          expected_status: underwriting?.underwriting_status ?? "collecting_docs",
          note: patch.reviewer_notes || undefined,
        };
        if (patch.underwriting_status === "approved") {
          moveBody.approved_amount = patch.approved_amount ?? null;
          moveBody.approved_dscr = patch.approved_dscr ?? null;
          moveBody.note = patch.reviewer_notes ?? null;
        }
        await api(`/operator-files/intake/${detail.intake.id}/pipeline-move`, {
          method: "POST",
          authToken: authToken ?? undefined,
          body: JSON.stringify(moveBody),
        });
      }
      const updated = !isApprovalMove && Object.keys(remainingPatch).length
        ? await api<ApplicationUnderwritingState>(`/application-profiles/${profileId}/underwriting`, {
            method: "PATCH",
            authToken: authToken ?? undefined,
            body: JSON.stringify(remainingPatch),
          })
        : await api<ApplicationUnderwritingState>(`/application-profiles/${profileId}/underwriting`, {
            authToken: authToken ?? undefined,
          });
      setUnderwriting(updated);
      setUnderwritingDraft(underwritingDraftFromState(updated));
      toast.show(statusChanged ? "Pipeline status updated." : "Underwriting fields saved.");
      return true;
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Underwriting could not be saved."));
      toast.show(apiErrorMessage(reason, "Underwriting could not be saved."));
      return false;
    } finally {
      setUnderwritingSaving(false);
    }
  }

  function saveUnderwritingDraft() {
    const patch: ApplicationUnderwritingPatch = {
      underwriting_status: underwritingDraft.underwriting_status,
      target_dscr: numberOrNull(underwritingDraft.target_dscr),
      reviewer_notes: underwritingDraft.reviewer_notes.trim() || null,
      forecast_fee_points: numberOrNull(underwritingDraft.forecast_fee_points),
      estimated_close_date: underwritingDraft.estimated_close_date || null,
      funded_amount: numberOrNull(underwritingDraft.funded_amount),
    };
    if (patch.underwriting_status === "approved" && underwriting?.underwriting_status !== "approved") {
      openApproval(patch);
      return;
    }
    void saveUnderwritingPatch(patch);
  }

  function changeUnderwritingStatus(statusValue: UnderwritingLifecycleStatus) {
    const forecastPatch: Pick<ApplicationUnderwritingPatch, "forecast_fee_points" | "estimated_close_date" | "funded_amount"> = {
      forecast_fee_points: numberOrNull(underwritingDraft.forecast_fee_points),
      estimated_close_date: underwritingDraft.estimated_close_date || null,
      funded_amount: numberOrNull(underwritingDraft.funded_amount),
    };
    if (statusValue === "approved" && underwriting?.underwriting_status !== "approved") {
      openApproval({ underwriting_status: statusValue, reviewer_notes: underwritingDraft.reviewer_notes.trim() || null, ...forecastPatch });
      return;
    }
    setUnderwritingDraft((current) => ({ ...current, underwriting_status: statusValue }));
    void saveUnderwritingPatch({ underwriting_status: statusValue, reviewer_notes: underwritingDraft.reviewer_notes.trim() || null, ...forecastPatch });
  }

  function openApproval(patch: ApplicationUnderwritingPatch) {
    setUnderwritingError(null);
    setApprovalError(null);
    setApprovalDraft(pipelineApprovalDraft({
      approvedAmount: underwriting?.approved_amount ?? termSheet?.current?.approved_amount ?? underwriting?.term_sheet_amount,
      approvedDscr: underwriting?.approved_dscr,
      note: patch.reviewer_notes ?? "",
    }));
    setPendingApprovalPatch(patch);
  }

  function cancelApproval() {
    if (underwritingSaving) return;
    setPendingApprovalPatch(null);
    setApprovalError(null);
    setUnderwritingError(null);
    setUnderwritingDraft((current) => ({
      ...current,
      underwriting_status: underwriting?.underwriting_status ?? "collecting_docs",
    }));
  }

  async function confirmApproval() {
    if (!pendingApprovalPatch) return;
    const approval = validatePipelineApprovalDraft(approvalDraft);
    if (!approval.value) {
      setApprovalError(approval.error);
      return;
    }
    setApprovalError(null);
    const saved = await saveUnderwritingPatch({
      ...pendingApprovalPatch,
      underwriting_status: "approved",
      approved_amount: approval.value.approved_amount,
      approved_dscr: approval.value.approved_dscr,
      reviewer_notes: approval.value.note,
    });
    if (!saved) return;
    setPendingApprovalPatch(null);
    setApprovalDraft(pipelineApprovalDraft());
  }

  useEffect(() => {
    void loadUnderwritingState();
  }, [loadUnderwritingState]);

  useEffect(() => {
    const refreshAfterReview = (event: Event) => {
      const completedIntakeId = (event as CustomEvent<{ intakeId?: string }>).detail?.intakeId;
      if (completedIntakeId !== detail?.intake.id) return;
      void refreshProgramReadiness();
    };
    window.addEventListener("qc-ai-review-completed", refreshAfterReview);
    return () => window.removeEventListener("qc-ai-review-completed", refreshAfterReview);
  }, [detail?.intake.id, refreshProgramReadiness]);

  useEffect(() => {
    if (!detail) {
      initializedLeadIdRef.current = null;
      return;
    }
    if (initializedLeadIdRef.current === detail.intake.id) return;
    initializedLeadIdRef.current = detail.intake.id;
    const rows = detail.artifacts ?? [];
    if (initialSubmissionStep) setSubmissionStep(initialSubmissionStep);
    else if (rows.some((item) => item.artifact_type === "lender_packet")) setSubmissionStep(5);
    else if (detail.latest_review?.status === "completed" || detail.intake.status === "reviewed") setSubmissionStep(4);
    else if (detail.files.some(isSourceEvidenceFile)) setSubmissionStep(2);
    else setSubmissionStep(1);
    setEvidenceTab(initialEvidenceTab);
    setEvidenceFocus(null);
    setPrototypeView(
      (initialView === "underwriting" || initialView === "reviewer" || initialView === "production") && canUnderwrite
        ? initialView
        : initialView === "communications"
          ? "communications"
          : initialView === "audit"
            ? "audit"
            : "workspace",
    );
    setProductionTermSheetOpen(false);
    setCommunicationChannel(initialCommunicationChannel);
    setContextRailOpen(false);
    setContactDraft({
      full_name: detail.intake.full_name || "",
      business_name: detail.intake.business_name || "",
      email: detail.intake.email || "",
      phone: detail.intake.phone || "",
      requested_loan_amount: detail.intake.requested_loan_amount == null ? "" : String(detail.intake.requested_loan_amount),
      loan_purpose: detail.intake.loan_purpose || "",
      estimated_credit_score: detail.intake.estimated_credit_score == null ? "" : String(detail.intake.estimated_credit_score),
      referral_source: detail.intake.referral_source || "",
    });
  }, [detail, initialCommunicationChannel, initialEvidenceTab, initialSubmissionStep, initialView, canUnderwrite]);

  async function saveContact() {
    if (!contactDraft.full_name.trim() || !contactDraft.email.trim()) {
      toast.show("Principal name and email are required.");
      return;
    }
    setContactSaving(true);
    try {
      await onUpdateContact({
        full_name: contactDraft.full_name.trim(),
        business_name: contactDraft.business_name.trim() || null,
        email: contactDraft.email.trim(),
        phone: contactDraft.phone.trim() || null,
        requested_loan_amount: contactDraft.requested_loan_amount ? Number(contactDraft.requested_loan_amount) : null,
        loan_purpose: contactDraft.loan_purpose.trim() || null,
        estimated_credit_score: contactDraft.estimated_credit_score ? Number(contactDraft.estimated_credit_score) : null,
        referral_source: contactDraft.referral_source.trim() || null,
      });
      setContactEditOpen(false);
      toast.show("Contact details updated.");
    } catch (error) {
      toast.show(apiErrorMessage(error, "Could not update contact details."));
    } finally {
      setContactSaving(false);
    }
  }

  async function previewEmail() {
    setBusy("preview");
    try {
      // No recipients needed — this drafts a subject + body the operator copies
      // into their own mail client. The lender packet is regenerated so the draft
      // references the current evidence.
      const preview = await onPreviewEmail({
        to_emails: [],
        cc_emails: [],
        subject: subject || undefined,
        body: body || undefined,
        include_lender_packet: true,
      });
      setSubject(preview.subject);
      setBody(preview.body);
    } finally {
      setBusy("");
    }
  }

  // Parse a raw recipients string into { valid, invalid }. Unwraps display-name
  // forms ("Jane <jane@x.com>") and requires a real dot-bearing TLD so the
  // backend's strict EmailStr validation can't 422 the whole send on a token
  // that merely contained "@".
  function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
    const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const token of raw.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)) {
      const m = token.match(EMAIL_RE);
      if (m) valid.push(m[0]);
      else invalid.push(token);
    }
    return { valid, invalid };
  }

  async function sendEmail() {
    const to = parseEmails(toEmails);
    const cc = parseEmails(ccEmails);
    if (to.invalid.length || cc.invalid.length) {
      toast.show(`Fix these email addresses: ${[...to.invalid, ...cc.invalid].join(", ")}`);
      return;
    }
    if (!to.valid.length) {
      toast.show("Add at least one recipient email");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.show("Draft a subject and body first");
      return;
    }
    if (subject.trim().length > 512) {
      toast.show("Subject is too long (max 512 characters)");
      return;
    }
    if (body.trim().length > 12000) {
      toast.show("Body is too long (max 12,000 characters)");
      return;
    }
    setBusy("send");
    try {
      const res = await onSendEmail({
        to_emails: to.valid,
        cc_emails: cc.valid,
        subject: subject.trim(),
        body: body.trim(),
        include_lender_packet: attachPacket,
        attach_lender_packet: attachPacket,
        attach_executive_summary: attachSummary,
        attach_package_zip: attachZip,
        bucket_access: bucketAccess,
        drive_file_ids: driveFiles.map((f) => f.id),
      });
      const ok = (res.email_sends || []).filter((s) => !s.ses_error).length;
      const failed = (res.email_sends || []).length - ok;
      toast.show(failed ? `Sent ${ok}, ${failed} failed — check status` : `Sent to ${ok} recipient${ok === 1 ? "" : "s"}`);
    } catch (error) {
      toast.show(apiErrorMessage(error, "Send failed"));
    } finally {
      setBusy("");
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.show(`${label} copied`);
    } catch {
      toast.show("Copy failed");
    }
  }

  async function runIngest() {
    if (!ingestFiles.length) {
      toast.show("Pick at least one Drive file");
      return;
    }
    setBusy("ingest");
    try {
      const res = await onIngestFromDrive(ingestFiles.map((f) => f.id));
      const parts = [`${res.ingested} imported`];
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      const suffix = res.ingested ? " — Re-run AI review to fold them in" : "";
      toast.show(`${parts.join(", ")}${suffix}`);
      setIngestFiles([]);
      setIngestPickerOpen(false);
    } catch (error) {
      toast.show(apiErrorMessage(error, "Drive import failed"));
    } finally {
      setBusy("");
    }
  }

  async function downloadZip() {
    if (!detail) return;
    setZipBusy(true);
    try {
      await onDownloadZip();
      toast.show("Package downloaded");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Package download failed");
    } finally {
      setZipBusy(false);
    }
  }

  async function postNote(content: string, imageIds: string[] = []) {
    setNotesPosting(true);
    setNotesError(null);
    try {
      await onPostNote(content, imageIds);
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "Could not post the note.");
    } finally {
      setNotesPosting(false);
    }
  }

  async function changeOutcomeStatus(nextStatus: string) {
    setOutcomeBusy(true);
    try {
      await onUpdateOutcomeStatus(nextStatus);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not update outcome status.");
    } finally {
      setOutcomeBusy(false);
    }
  }

  async function changeLanguage(nextLanguage: string) {
    setLanguageBusy(true);
    try {
      await onUpdateLanguage(nextLanguage);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not update client language.");
    } finally {
      setLanguageBusy(false);
    }
  }

  async function handleCancelDeletionRequest() {
    setDeletionBusy(true);
    try {
      await onCancelDeletionRequest();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not cancel the deletion request.");
    } finally {
      setDeletionBusy(false);
    }
  }

  async function uploadFromHeader(files: File[], requestedDocumentId?: string) {
    if (!cockpitAdapter || !files.length) return;
    setHeaderUploading(true);
    setUploadStatus(`Preparing ${files.length} file${files.length === 1 ? "" : "s"}...`);
    const failed: string[] = [];
    const lockedFiles: File[] = [];
    let uploaded = 0;
    let stale = 0;
    try {
      for (const [index, file] of files.entries()) {
        setUploadStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
        try {
          await assertPdfUploadUnlocked(file);
          const init = await cockpitAdapter.uploadInit({ requested_document_id: requestedDocumentId ?? null, file_name: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size });
          const response = await fetch(init.upload_url, { method: "PUT", body: file, headers: init.required_headers });
          if (!response.ok) throw new Error(`${file.name} could not be uploaded.`);
          await cockpitAdapter.uploadComplete(init.file_id);
          uploaded += 1;
        } catch (error) {
          if (isPasswordProtectedPdfUploadError(error)) lockedFiles.push(file);
          else if (isStaleRequestedDocumentError(error)) stale += 1;
          else failed.push(file.name);
        }
      }
      if (!uploaded && !stale && !lockedFiles.length) throw new Error(`None of the ${files.length} selected files could be uploaded.`);
      setUploadStatus("Refreshing evidence...");
      const response = await cockpitAdapter.reload();
      handleCockpitResponse(response);
      setSubmissionStep(2);
      setPrototypeView("workspace");
      toast.show([
        stale ? `${uploaded ? `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded. ` : ""}The document checklist changed, so ${stale === 1 ? "one file was" : `${stale} files were`} not attached. Use the current requirement and add ${stale === 1 ? "it" : "them"} again.` : "",
        lockedFiles.length ? passwordProtectedPdfUploadNotice(lockedFiles) : "",
        failed.length ? `${uploaded} uploaded; ${failed.length} failed: ${failed.join(", ")}` : "",
        !stale && !lockedFiles.length && !failed.length ? `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded and queued for AI review` : "",
      ].filter(Boolean).join(" "));
    } catch (error) {
      toast.show(documentUploadErrorMessage(error));
    } finally {
      setHeaderUploading(false);
      setUploadStatus("");
      if (headerUploadRef.current) headerUploadRef.current.value = "";
    }
  }

  function openReviewDestination(destination: ReviewDestination) {
    if (destination.kind === "profile") {
      setContactEditOpen(true);
      return;
    }
    setPrototypeView("workspace");
    setEvidenceFocus(null);
    if (destination.kind === "owners") {
      setSubmissionStep(1);
      return;
    }
    if (destination.kind === "credit") {
      setSubmissionStep(3);
      return;
    }
    setSubmissionStep(2);
    if (destination.kind === "banking") {
      setEvidenceTab("banking");
      return;
    }
    setEvidenceTab("requirements");
    setEvidenceFocus((current) => ({
      query: destination.query,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }

  function openEvidenceFiles() {
    setEvidenceFocus(null);
    setEvidenceTab("files");
    setSubmissionStep(2);
    setPrototypeView("workspace");
  }

  function openDocumentRequest() {
    const nextMissing = missing.find((row) => String(row.title || "").trim());
    setRequestDraft({
      name: String(nextMissing?.title || ""),
      category: "Business documents",
      description: String(nextMissing?.detail || ""),
      allow_multiple_files: false,
      recipient_email: detail?.intake.email || "",
      recipient_phone: detail?.intake.phone || "",
      email_room_link: true,
      sms_reminder: false,
    });
    setRequestResult(null);
    setRequestOpen(true);
  }

  async function createDocumentRequest() {
    if (!detail || requestDraft.name.trim().length < 2) return;
    setRequestSaving(true);
    try {
      const authToken = await getToken();
      const profile = await api<ApplicationProfile>("/application-profiles/resolve", {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }),
      });
      const result = await api<RoomRequestResult>(`/application-profiles/${profile.id}/room/requests`, {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({
          name: requestDraft.name.trim(),
          category: requestDraft.category.trim() || null,
          instructions: requestDraft.description.trim() || null,
          allow_multiple_files: requestDraft.allow_multiple_files,
          recipient_email: requestDraft.recipient_email.trim() || null,
          recipient_phone: requestDraft.recipient_phone.trim() || null,
          email_room_link: requestDraft.email_room_link,
          sms_reminder: requestDraft.sms_reminder,
        }),
      });
      if (cockpitAdapter) handleCockpitResponse(await cockpitAdapter.reload());
      setRequestResult(result);
      setSubmissionStep(2);
      setPrototypeView("workspace");
      toast.show(result.overall_status === "success" ? `Request created and delivered` : result.overall_status === "partial" ? "Request created; one delivery channel failed" : result.overall_status === "failed" ? "Request created; delivery failed" : "Request created without sending");
    } catch (reason) {
      toast.show(apiErrorMessage(reason, "The document request could not be created."));
    } finally {
      setRequestSaving(false);
    }
  }

  async function retryRequestDelivery() {
    if (!detail || !requestResult) return;
    const retryEmail = requestResult.deliveries.some((receipt) => receipt.channel === "email" && !receipt.provider_accepted);
    const retrySms = requestResult.deliveries.some((receipt) => receipt.channel === "sms" && !receipt.provider_accepted);
    if (!retryEmail && !retrySms) return;
    setRequestSaving(true);
    try {
      const authToken = await getToken();
      const profile = await api<ApplicationProfile>("/application-profiles/resolve", {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }),
      });
      const retry = await api<RoomRequestResult>(`/application-profiles/${profile.id}/room/reminders`, {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({
          purpose: "documents",
          recipient_email: requestDraft.recipient_email.trim() || null,
          recipient_phone: requestDraft.recipient_phone.trim() || null,
          email_room_link: retryEmail,
          sms_reminder: retrySms,
        }),
      });
      setRequestResult({ ...retry, requested_document_id: requestResult.requested_document_id });
      toast.show(retry.overall_status === "success" ? "Failed delivery retried successfully" : retry.overall_status === "partial" ? "One retry channel is still failing" : "Delivery retry was not accepted");
    } catch (reason) {
      toast.show(apiErrorMessage(reason, "The failed delivery could not be retried."));
    } finally {
      setRequestSaving(false);
    }
  }

  function openRotatePin() {
    setRotatePin("");
    setRotatePinConfirm("");
    setRotatePinDone(false);
    setRotatePinOpen(true);
  }

  async function rotateApplicationRoomPin() {
    if (!detail || !/^\d{6}$/.test(rotatePin) || rotatePin !== rotatePinConfirm) return;
    setRotatePinSaving(true);
    try {
      const authToken = await getToken();
      const profile = await api<ApplicationProfile>("/application-profiles/resolve", { method: "POST", authToken: authToken ?? undefined, body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }) });
      await api(`/application-profiles/${profile.id}/room/pin/rotate`, { method: "POST", authToken: authToken ?? undefined, body: JSON.stringify({ secure_room_pin: rotatePin }) });
      setRotatePinDone(true);
      toast.show("Application-room PIN rotated. The previous PIN no longer works.");
    } catch (reason) {
      toast.show(apiErrorMessage(reason, "The room PIN could not be rotated."));
    } finally {
      setRotatePinSaving(false);
    }
  }

  const requiredDocs = detail?.requested_documents.filter((document) => document.required) ?? [];
  const requiredUploaded = requiredDocs.filter((document) => document.status === "uploaded").length;
  const hasEvidence = evidenceFileCount > 0;
  const evidenceComplete = hasEvidence && (requiredDocs.length === 0 || requiredUploaded === requiredDocs.length);
  const evidenceAndBankingComplete = Boolean(profileVerification?.business_banking_complete && (profileVerification.evidence_complete || evidenceComplete));
  const hasBankingActivity = Boolean(profileVerification?.bank_connection_count || profileVerification?.bank_statement_months);
  const reviewComplete = detail?.latest_review?.status === "completed" || detail?.intake.status === "reviewed";
  const reviewActive = detail ? rerunning || ["queued", "running"].includes(detail.latest_review?.status || "") : false;
  const sentCount = detail?.email_sends?.filter((send) => !send.ses_error).length ?? 0;
  const workflowSteps: Array<{ id: number; label: string; sub: string; status: "not-started" | "partial" | "complete" }> = [
    { id: 1, label: "Profile & ownership", sub: "Identity, owners and allocation", status: profileVerification?.ready_for_step_2 ? "complete" : profileVerification?.owner_count ? "partial" : "not-started" },
    { id: 2, label: "Evidence & banking", sub: "Files, forms, AI decisions and bank coverage", status: evidenceAndBankingComplete ? "complete" : hasEvidence || hasBankingActivity ? "partial" : "not-started" },
    { id: 3, label: "Owner credit", sub: "Individual 20%+ iSoftPulls", status: profileVerification?.owner_credit_complete ? "complete" : profileVerification?.completed_credit_owner_count || profileVerification?.ready_for_step_2 ? "partial" : "not-started" },
    { id: 4, label: "AI review", sub: "Extracted facts, probability and DSCR", status: reviewComplete ? "complete" : reviewActive || hasEvidence ? "partial" : "not-started" },
    { id: 5, label: "Package readiness", sub: "Summary, package and delivery", status: sentCount > 0 ? "complete" : packageInSync ? "partial" : packet || summary ? "partial" : "not-started" },
  ];

  const prototypeDetailEnabled = Boolean(workflowSteps.length);
  if (prototypeDetailEnabled) return (
    <div className="intake-file">
      <div className="intake-file-head">
        <div className="grid g6">
          <Row>
            <h3>{detail?.intake.business_name || detail?.intake.full_name || "AI intake file"}</h3>
            {detail ? <CellChip tone={probabilityTone(String(result?.probability_status || ""))}>{String(result?.probability_status || "Awaiting review")}</CellChip> : null}
            {detail ? <CellChip tone={detail.intake.status === "completed" ? "ok" : detail.intake.status === "reviewing" || detail.intake.status === "reviewed" ? "acc" : "warn"}>{detail.intake.status}</CellChip> : null}
            {forecastEarnings != null ? <CellChip tone="ok">{formatMoney(forecastEarnings)} forecast earnings</CellChip> : null}
            {underwriting?.estimated_close_date ? <CellChip tone="acc">Est. close {new Date(`${underwriting.estimated_close_date}T12:00:00`).toLocaleDateString()}</CellChip> : null}
          </Row>
          <div className="sub">
            {detail ? `${variantLabel(detail.intake.variant)} · ${detail.intake.referral_source || "Direct"} · ${detail.intake.email}` : "Loading file..."}
          </div>
        </div>
        <span className="sp" />
        {detail ? (
          <Btn variant="pri" onClick={submissionStep === 2 ? () => headerUploadRef.current?.click() : submissionStep === 4 ? onRerun : submissionStep === 5 ? () => void refreshFullPackage(true) : () => setPrototypeView("workspace")} disabled={busy !== "" || rerunning || (submissionStep === 2 && headerUploading)}>
            {submissionStep === 2 ? (headerUploading ? "Uploading..." : "Add evidence") : submissionStep === 4 ? (rerunning ? "Reviewing..." : "Run AI review") : submissionStep === 5 ? (busy === "package-all" ? "Refreshing package..." : summary && packet ? "Refresh package" : "Generate package") : submissionStep === 3 ? "Open owner credit" : "Open ownership"}
          </Btn>
        ) : null}
        <input ref={headerUploadRef} type="file" hidden multiple accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp,.heic" onChange={(event) => void uploadFromHeader(Array.from(event.target.files ?? []))} />
        {detail ? <Btn disabled={headerUploading || !cockpitAdapter} onClick={() => headerUploadRef.current?.click()}><Icon name="upload" size={14} />{headerUploading ? "Uploading..." : "Upload"}</Btn> : null}
        {detail ? <Btn onClick={openDocumentRequest}><Icon name="send" size={14} />Request</Btn> : null}
        {detail && canUnderwrite ? <Btn onClick={() => setNotificationRoutingOpen(true)}><Icon name="bell" size={14} />Notifications</Btn> : null}
        {detail && canUnderwrite ? (
          <Select
            value={underwritingDraft.underwriting_status}
            disabled={underwritingLoading || underwritingSaving}
            onChange={(event) => changeUnderwritingStatus(event.target.value as UnderwritingLifecycleStatus)}
            aria-label="Underwriting lifecycle status"
          >
            {PIPELINE_LIFECYCLE.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </Select>
        ) : detail ? (
          <Select value={detail.intake.outcome_status} disabled={outcomeBusy} onChange={(event) => changeOutcomeStatus(event.target.value)} aria-label="Outcome status"><option value="submitted">Submitted</option><option value="closed">Closed</option><option value="denied">Denied</option></Select>
        ) : null}
        {detail && canUnderwrite && merchantOfferStatus && ["sent", "accepted", "declined"].includes(merchantOfferStatus) ? (
          <CellChip tone={merchantOfferStatus === "accepted" ? "ok" : merchantOfferStatus === "declined" ? "bad" : "warn"}>
            Processing offer: {merchantOfferStatus}
          </CellChip>
        ) : null}
        {detail ? <Select value={detail.intake.preferred_language} disabled={languageBusy} onChange={(event) => changeLanguage(event.target.value)} aria-label="Client language"><option value="en">English</option><option value="es">Español</option></Select> : null}
        <PageActionMenu items={[
          { label: "Open underwriting chat", onSelect: () => { setPrototypeView("communications"); setCommunicationChannel("underwriter"); }, hidden: !detail },
          { label: "View client conversation", onSelect: () => { setPrototypeView("communications"); setCommunicationChannel("client"); }, hidden: !detail },
          { label: "Attach another bucket", onSelect: onLinkBucketIntake, hidden: !detail },
          { label: "Rotate room PIN", onSelect: openRotatePin, hidden: !detail },
          { label: "Dealer partner messages", onSelect: () => { setPrototypeView("communications"); setCommunicationChannel("partner"); }, hidden: !detail },
          { label: "Share production package with a rep", onSelect: () => { setPrototypeView("production"); setProductionShareOpen(true); }, hidden: !detail || !isDealerFile || !canUnderwrite },
          { label: "Record loan terms", onSelect: openTermSheet, hidden: !detail || !isDealerFile || !canUnderwrite },
          { label: "Archive lead", onSelect: () => setConfirmDeleteOpen(true), hidden: !detail || !canGovern },
        ]} />
        <IconBtn aria-label="Minimize file workspace" title="Minimize" onClick={onMinimize}>
          <span aria-hidden="true" className="workspace-minimize-glyph">-</span>
        </IconBtn>
        <IconBtn aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </IconBtn>
      </div>

      {loading || !detail ? <div className="empty">Loading intake file...</div> : (
        <>
          <div className="intake-tabs" role="tablist" aria-label="AI intake detail">
            {[
              ["workspace", "File workspace"],
              ...(canUnderwrite ? [["underwriting", "Underwriting"] as const] : []),
              ...(canUnderwrite ? [["reviewer", "Reviewer controls"] as const] : []),
              ...(canUnderwrite && isDealerFile ? [["production", "Production Package"] as const] : []),
              ["communications", "Communications"],
              ["audit", "Audit trail"],
            ].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={prototypeView === id} className={prototypeView === id ? "on" : undefined} onClick={() => setPrototypeView(id as typeof prototypeView)}>{label}</button>
            ))}
          </div>

          <div className={cx(
            "intake-file-body",
            // The submission sequence belongs to the file workspace. Every other tab drops
            // it and takes the freed 260px, so its own components get the room.
            prototypeView === "workspace" && "with-sequence",
            !contextRailOpen && "context-collapsed",
          )}>
            {prototypeView === "workspace" ? (
              <aside className="submission-rail">
                <Panel title="Submission sequence" sub={`Step ${submissionStep} of 5`}>
                  <div className="submission-steps submission-steps-rail">
                    {workflowSteps.map((step) => (
                      <button key={step.id} type="button" className={cx("submission-step", `status-${step.status}`, submissionStep === step.id && "on")} onClick={() => { setSubmissionStep(step.id); setPrototypeView("workspace"); }}>
                        <span>{step.status === "complete" ? <Icon name="check" size={12} /> : step.status === "not-started" ? <Icon name="x" size={11} /> : "-"}</span>
                        <b>{step.label}</b>
                        <small>{step.status === "complete" ? "Complete" : step.status === "partial" ? "In progress" : "Not started"} · {step.sub}</small>
                      </button>
                    ))}
                  </div>
                </Panel>
              </aside>
            ) : null}

            <main className="grid intake-file-primary">
              {prototypeView === "workspace" && submissionStep === 1 ? <ApplicationVerificationWorkspace sourceKind="intake" sourceId={detail.intake.id} mode="owners" onReadyForStep2={() => setSubmissionStep(2)} onStateChange={setProfileVerification} /> : null}
              {prototypeView === "workspace" && submissionStep === 2 ? (
                profileId ? <ApplicationEvidenceWorkspace
                  profileId={profileId}
                  intakeId={detail.intake.id}
                  initialTab={evidenceTab}
                  onUploadFiles={uploadFromHeader}
                  uploadBusy={headerUploading}
                  uploadStatus={uploadStatus}
                  onNotice={toast.show}
                  onRunAiReview={onRerun}
                  aiReviewRunning={rerunning}
                  onAddFromDrive={() => setIngestPickerOpen(true)}
                  onAttachBucket={onLinkBucketIntake}
                  onVerificationChange={setProfileVerification}
                  onProgramReadinessChange={setProgramReadiness}
                  focusRequirement={evidenceFocus}
                  canCreatePrograms={currentUser?.role === Role.SUPER_ADMIN}
                  programVertical={programVerticalForVariant(detail.intake.variant)}
                  intakeVariant={detail.intake.variant}
                /> : <div className="empty">{underwritingLoading ? "Loading the unified evidence workspace..." : "The application profile could not be resolved."}</div>
              ) : null}
              {prototypeView === "workspace" && submissionStep === 3 ? <ApplicationVerificationWorkspace sourceKind="intake" sourceId={detail.intake.id} mode="credit" onStateChange={setProfileVerification} /> : null}
              {prototypeView === "workspace" && submissionStep === 4 ? (
                <Panel title="AI review" actions={<Btn variant="pri" onClick={onRerun} disabled={rerunning}>{rerunning ? "Reviewing..." : reviewComplete ? "Re-run review" : "Run AI review"}</Btn>}>
                  <section className="ai-review-overview" aria-label="AI review overview">
                    <div className="ai-review-summary-strip">
                      <div className="ai-review-summary-primary">
                        <span>Probability</span>
                        <strong>{String(result?.probability_status || "Awaiting evidence")}</strong>
                      </div>
                      <button type="button" onClick={openEvidenceFiles} aria-label={`Open ${evidenceFileCount} evidence file${evidenceFileCount === 1 ? "" : "s"}`}>
                        <span>Evidence</span>
                        <strong className="num">{evidenceFileCount}</strong>
                        <small>files</small>
                        <Icon name="arrowR" size={13} />
                      </button>
                      {reviewMissingItems.length ? <button type="button" className="needs" onClick={() => openReviewDestination(reviewDestination(reviewMissingItems[0].query))} aria-label={`Open ${reviewMissingItems.length} missing item${reviewMissingItems.length === 1 ? "" : "s"}`}>
                        <span>Missing</span>
                        <strong className="num">{reviewMissingItems.length}</strong>
                        <small>{reviewMissingItems.length === 1 ? "item" : "items"}</small>
                        <Icon name="arrowR" size={13} />
                      </button> : <div className="ai-review-summary-complete"><span>Missing</span><strong className="num">0</strong><small>items</small><Icon name="check" size={13} /></div>}
                    </div>
                    {reviewMissingItems.length ? <nav className="ai-review-missing-items" aria-label="Open missing requirements">
                      <span className="lbl">Open items</span>
                      <div>{reviewMissingItems.map((item) => <button key={item.title} type="button" title={item.detail || item.title} aria-label={`Open missing item: ${item.title}${item.detail ? `. ${item.detail}` : ""}`} onClick={() => openReviewDestination(reviewDestination(item.query))}><span>{item.title}</span><Icon name="arrowR" size={12} /></button>)}</div>
                    </nav> : null}
                    <div className="ai-review-next-action"><span className="lbl">Next best action</span><p>{programReadiness?.can_advance
                      ? "Canonical evidence requirements are complete. Advance the file to underwriting."
                      : canonicalMissingDocuments.length
                        ? `Collect ${canonicalMissingDocuments.map((document) => document.name).join(", ")}.`
                        : String(result?.one_next_step || result?.executive_summary || "Run the review after the evidence room is complete.")}</p></div>
                    <ApplicationIntelligencePanel sourceKind="intake" sourceId={detail.intake.id} onAction={(action) => openReviewDestination(intelligenceActionDestination(action))} />
                  </section>
                  <ExtractedFactsReview sourceKind="intake" sourceId={detail.intake.id} />
                </Panel>
              ) : null}
              {prototypeView === "workspace" && submissionStep === 5 ? (
                <Panel
                  title="Package readiness"
                  sub="One refresh creates both branded PDFs, saves them to the bucket, and supersedes the prior package."
                  actions={<Btn variant="pri" disabled={busy !== ""} onClick={() => void refreshFullPackage(true)}><Icon name="refresh" size={14} />{busy === "package-all" ? "Building both PDFs..." : summary && packet ? "Refresh package + preview" : "Generate package + preview"}</Btn>}
                >
                  <div className="package-readiness-tabs" role="tablist" aria-label="Package readiness sections">{([['summary', 'Overview'], ['package', 'PDF versions'], ['delivery', 'Delivery']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={packageTab === id} className={packageTab === id ? "on" : undefined} onClick={() => setPackageTab(id)}><span>{id === "summary" ? summary && packet ? <Icon name="check" size={12} /> : "1" : id === "package" ? packet ? <Icon name="docCheck" size={12} /> : "2" : sentCount ? <Icon name="check" size={12} /> : "3"}</span>{label}</button>)}</div>
                  {packageTab === "summary" ? summary && packet ? <div className="package-readiness-overview">
                    {packageNeedsRefresh ? <Callout tone="warn">The evidence, review, or selected program changed after this package was generated. Refresh once to rebuild both PDFs from the current Package Readiness snapshot.</Callout> : null}
                    <div className="package-readiness-status">
                      <div><span className="lbl">Current package</span><strong>Version {Math.max(artifactVersion(summary, summaryHistory.length), artifactVersion(packet, packetHistory.length))}</strong><small>Generated {formatDateTime(packet.created_at)}</small></div>
                      <div><span className="lbl">Programs in scope</span><strong>{programReadiness?.selections.length || 0}</strong><small>{programReadiness?.selections.map((item) => item.program_name).join(" · ") || "Select a program before delivery"}</small></div>
                      <div><span className="lbl">Evidence</span><strong>{evidenceFileCount} files</strong><small>{programReadiness?.can_advance ? "Program requirements complete" : `${canonicalMissingDocuments.length} open requirement${canonicalMissingDocuments.length === 1 ? "" : "s"}`}</small></div>
                    </div>
                    <div className="package-document-grid">
                      <PackageArtifactCard artifact={summary} label="Executive summary" description="Concise credit brief with decision metrics, strengths, risks, and next action." version={artifactVersion(summary, summaryHistory.length)} current bucketSynced={Boolean(artifactBucketFileId(summary))} />
                      <PackageArtifactCard artifact={packet} label="Lender package" description="Branded underwriting packet with month-by-month cash-flow charts and supporting schedules." version={artifactVersion(packet, packetHistory.length)} current bucketSynced={Boolean(artifactBucketFileId(packet))} />
                    </div>
                    <UnderwriterDigest artifact={summary} />
                  </div> : <div className="package-readiness-empty"><Icon name="reports" size={28} /><strong>No package has been generated</strong><p>Generate once to create the executive-summary PDF and lender-package PDF from the same evidence snapshot. Both will be saved in this file&apos;s bucket.</p></div> : null}
                  {packageTab === "package" ? <div className="package-version-workspace">
                    <Callout tone="acc">The current pair is the only active package in the bucket. Refreshing creates a new immutable version and marks the previous PDFs as superseded.</Callout>
                    <div className="package-version-columns">
                      <PackageVersionList label="Executive summary" artifacts={summaryHistory} />
                      <PackageVersionList label="Lender package" artifacts={packetHistory} />
                    </div>
                  </div> : null}
                  {packageTab === "delivery" ? <div className="package-delivery"><Callout tone={packageInSync ? "acc" : "warn"}>{packageInSync && packet ? `Synchronized package version ${artifactVersion(packet, packetHistory.length)} is ready to send.` : "Refresh required: rebuild both PDFs from the latest evidence and program conditions before delivery."}</Callout><div className="fldgrid two"><Field label="To"><Input value={toEmails} onChange={(event) => setToEmails(event.target.value)} placeholder="lender@bank.com" /></Field><Field label="Cc"><Input value={ccEmails} onChange={(event) => setCcEmails(event.target.value)} placeholder="optional" /></Field></div><Field label="Subject"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Prepare a lender submission" /></Field><Field label="Message"><Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} placeholder="Draft the reviewed submission message" /></Field><Row><Btn onClick={previewEmail} disabled={!packageInSync || busy !== ""}><Icon name="spark" size={14} />{busy === "preview" ? "Drafting..." : "Draft with Elara"}</Btn><Btn variant="pri" disabled={!toEmails.trim() || !subject.trim() || !body.trim() || !packageInSync || busy !== ""} onClick={() => setSendReviewOpen(true)}><Icon name="send" size={14} />Review and send</Btn><Btn onClick={downloadZip} disabled={zipBusy || !packageInSync}>{zipBusy ? "Building..." : "Download package"}</Btn></Row></div> : null}
                </Panel>
              ) : null}

              {prototypeView === "underwriting" && canUnderwrite ? (
                <div className="grid g12">
                <Panel
                  title="Underwriting"
                  sub="Build and review the client-ready financial offers for this file."
                  actions={<Row>{underwriting?.loan_id ? <Link href={`/loans/${underwriting.loan_id}`} className="btn">Open funding file</Link> : <Btn onClick={() => changeUnderwritingStatus("in_underwriting")} disabled={underwritingSaving}>Create funding file</Btn>}</Row>}
                >
                  {underwritingError ? <WarnLine>{underwritingError}</WarnLine> : null}
                  {underwritingLoading ? <div className="empty">Loading underwriting controls...</div> : (
                    <div className="underwriting-workspace">
                      <div className="underwriting-status-strip">
                        <div>
                          <span className="lbl">Current lifecycle</span>
                          <b>{underwritingStatusLabel(underwriting?.underwriting_status ?? underwritingDraft.underwriting_status)}</b>
                          <span className="sub">{underwriting?.loan_id ? "Linked to a funding loan." : "No funding loan has been created yet."}</span>
                        </div>
                        <div>
                          <span className="lbl">Last update</span>
                          <b>{underwriting?.updated_at ? formatDateTime(underwriting.updated_at) : "No saved update"}</b>
                          <span className="sub">Actor and effects are recorded in audit.</span>
                        </div>
                        <div>
                          <span className="lbl">Forecast economics</span>
                          <b>{forecastEarnings != null ? `${formatMoney(forecastEarnings)} earnings` : "Not forecast"}</b>
                          <span className="sub">
                            {underwriting?.forecast_fee_points != null ? `${underwriting.forecast_fee_points.toFixed(2)} points` : "Add QC revenue points"}
                            {underwriting?.estimated_close_date ? ` · closing ${new Date(`${underwriting.estimated_close_date}T12:00:00`).toLocaleDateString()}` : " · no closing date"}
                          </span>
                        </div>
                      </div>
                      {isDealerFile ? (
                        <div className="underwriting-status-strip underwriting-term-sheet-strip" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center" }}>
                          <div>
                            <span className="lbl">Loan terms</span>
                            <b>
                              {termSheet?.current
                                ? `Term sheet v${termSheet.current.version} · ${termSheet.current.facility_type} · ${formatMoney(termSheet.current.approved_amount)} · ${productionTermLabel(termSheet.current.repayment_structure ?? termSheet.current.extra?.repayment_structure, PRODUCTION_REPAYMENT_LABELS, "Repayment not recorded")}`
                                : "No loan terms recorded"}
                            </b>
                            <span className="sub">
                              {termSheet?.current
                                ? `${termSheet.current.rate_pct}% · ${productionTermLabel(termSheet.current.payment_frequency ?? termSheet.current.extra?.payment_frequency, PRODUCTION_CADENCE_LABELS, "Monthly")} payments · ${formatMoney(termSheet.current.monthly_equivalent_payment ?? termSheet.current.extra?.monthly_equivalent_payment ?? termSheet.current.monthly_debt_service)} monthly equivalent · ${termSheet.current.funding_party_name || termSheet.current.funding_party_kind} · recorded ${formatDateTime(termSheet.current.entered_at)}.`
                                : "The final (Program Activation) package can only be drafted once the loan terms are recorded on this file."}
                            </span>
                          </div>
                          <div className="underwriting-term-sheet-actions">
                            {termSheet?.current && underwriting?.profile_id ? (
                              <DealerTermSheetDocumentActions
                                profileId={underwriting.profile_id}
                                terms={termSheet.current}
                                contactSuppressed={Boolean(detail.intake.client_contact_suppressed)}
                                onEdit={openTermSheet}
                                selected={Boolean(productionTermSelection && selectedOfferKeys.includes(productionTermSelection.key))}
                                onSelectedChange={(selected) => setOfferSelected(productionTermSelection, selected)}
                                onCompose={() => openOfferComposer(productionTermSelection)}
                              />
                            ) : (
                              <Btn variant="pri" size="sm" onClick={openTermSheet}>
                                <Icon name="pencil" size={14} />
                                Record terms
                              </Btn>
                            )}
                          </div>
                        </div>
                      ) : null}
                      <MerchantOfferStrip
                        profileId={underwriting?.profile_id}
                        onStatus={setMerchantOfferStatus}
                        selected={Boolean(merchantOfferSelection && selectedOfferKeys.includes(merchantOfferSelection.key))}
                        onSelectedChange={(selected) => setOfferSelected(merchantOfferSelection, selected)}
                        onOfferReady={handleMerchantOfferReady}
                        onCompose={() => openOfferComposer(merchantOfferSelection)}
                        onTargetDscr={(value) => {
                          setUnderwritingDraft((current) => ({ ...current, target_dscr: value.toFixed(2) }));
                          setPrototypeView("reviewer");
                        }}
                      />
                      {selectedOfferSelections.length ? <div className="offer-delivery-bar" role="region" aria-label="Selected client offers" aria-live="polite">
                        <div className="offer-delivery-bar-copy">
                          <span className="offer-delivery-bar-icon"><Icon name="mail" size={16} /></span>
                          <div><b>{selectedOfferSelections.length === 2 ? "Loan terms + merchant offer" : selectedOfferSelections[0].label}</b><small>Ready for one customized email with client PDFs and a 48-hour response window.</small></div>
                        </div>
                        <div className="offer-delivery-bar-actions">
                          <IconBtn onClick={() => setSelectedOfferKeys([])} aria-label="Clear selected offers" title="Clear selection"><Icon name="close" size={14} /></IconBtn>
                          <Btn variant="pri" onClick={() => openOfferComposer()} disabled={Boolean(detail.intake.client_contact_suppressed)} title={detail.intake.client_contact_suppressed ? "Direct client contact is suppressed on this file" : undefined}><Icon name="spark" size={14} />Draft client email</Btn>
                        </div>
                      </div> : null}
                      {offerDeliveryReceipt ? <Callout tone="ok"><b>Offer package sent.</b> The exact PDFs are in the client inbox until and after the {formatDateTime(offerDeliveryReceipt.expires_at)} response deadline.</Callout> : null}
                      {underwriting?.profile_id ? <OfferDeliveryHistory profileId={underwriting.profile_id} refreshKey={offerDeliveryReceipt?.id} /> : null}
                      {!isDealerFile && underwriting?.profile_id ? <ApplicationClientTermsPanel
                        key={underwriting.profile_id}
                        profileId={underwriting.profile_id}
                        onSaved={refreshUnderwritingFromTerms}
                        selected={Boolean(applicationTermSelection && selectedOfferKeys.includes(applicationTermSelection.key))}
                        onSelectedChange={(selected) => setOfferSelected(applicationTermSelection, selected)}
                        onOfferReady={handleApplicationTermReady}
                        onCompose={() => openOfferComposer(applicationTermSelection)}
                      /> : null}
                    </div>
                  )}
                </Panel>
                </div>
              ) : null}

              {prototypeView === "reviewer" && canUnderwrite ? (
                <Panel
                  title="Reviewer controls"
                  sub="Set the policy target, record internal notes, and make the desk's lifecycle decision away from client-facing terms."
                  actions={<Btn variant="pri" onClick={saveUnderwritingDraft} disabled={underwritingLoading || underwritingSaving}>{underwritingSaving ? "Saving..." : "Save review"}</Btn>}
                >
                  {underwritingError ? <WarnLine>{underwritingError}</WarnLine> : null}
                  {underwritingLoading ? <div className="empty">Loading reviewer controls...</div> : (
                    <div className="grid g12">
                      <div className="terms-review-controls">
                        <div className="fldgrid two">
                          <Field label="Lifecycle status">
                            <Select aria-label="Lifecycle status" value={underwritingDraft.underwriting_status} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, underwriting_status: event.target.value as UnderwritingLifecycleStatus })}>
                              {PIPELINE_LIFECYCLE.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                            </Select>
                          </Field>
                          <Field label="Policy target DSCR">
                            <Input aria-label="Policy target DSCR" inputMode="decimal" value={underwritingDraft.target_dscr} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, target_dscr: event.target.value })} placeholder="1.25" />
                          </Field>
                          <Field label="QC revenue points" hint="Internal forecast only. One point equals 1% of the effective file amount.">
                            <Input aria-label="QC revenue points" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={underwritingDraft.forecast_fee_points} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, forecast_fee_points: event.target.value })} placeholder="2.00" />
                          </Field>
                          <Field label="Estimated closing" hint="Appears as an internal milestone on the Field Desk calendar.">
                            <Input aria-label="Estimated closing" type="date" value={underwritingDraft.estimated_close_date} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, estimated_close_date: event.target.value })} />
                          </Field>
                          <Field label="Funded amount" hint="Record the actual gross amount once the file is funded.">
                            <Input aria-label="Funded amount" type="number" inputMode="decimal" min="0" step="0.01" value={underwritingDraft.funded_amount} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, funded_amount: event.target.value })} placeholder="0.00" />
                          </Field>
                        </div>
                        <Field label="Reviewer notes" hint="Internal only — these notes never appear on the client PDF.">
                          <Textarea aria-label="Reviewer notes" rows={6} value={underwritingDraft.reviewer_notes} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, reviewer_notes: event.target.value })} placeholder="Record underwriting conditions, exceptions, committee notes, or close reason." />
                        </Field>
                      </div>
                      <div className="underwriting-close-actions">
                        <Btn onClick={() => changeUnderwritingStatus("term_sheet_provided")} disabled={underwritingSaving}>Term sheet provided</Btn>
                        <Btn onClick={() => changeUnderwritingStatus("approved")} disabled={underwritingSaving}>Approved</Btn>
                        <Btn onClick={() => changeUnderwritingStatus("closed_won")} disabled={underwritingSaving}>Closed / funded</Btn>
                        <Btn onClick={() => changeUnderwritingStatus("closed_lost")} disabled={underwritingSaving}>Closed lost</Btn>
                        <Btn className="danger" onClick={() => changeUnderwritingStatus("denied")} disabled={underwritingSaving}>Denied</Btn>
                      </div>
                    </div>
                  )}
                </Panel>
              ) : null}

              {prototypeView === "communications" ? (
                <div className="intake-communications">
                  {underwriting?.profile_id ? <ApplicationMissingItemCommunications profileId={underwriting.profile_id} /> : null}
                  <div className="intake-channel-tabs" role="tablist" aria-label="Intake communication channel">
                    {([['updates', 'Updates'], ['underwriter', 'Underwriter AI'], ['client', 'Client conversation'], ['email', 'Email'], ['partner', 'Partner channel'], ['internal', 'Internal notes']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={communicationChannel === id} className={communicationChannel === id ? "on" : undefined} onClick={() => setCommunicationChannel(id)}>{label}</button>)}
                  </div>
                  {communicationChannel === "updates" ? <FileTimeline profileId={profileId} tier="desk" /> : null}
                  {communicationChannel === "underwriter" ? (cockpitResponse && cockpitAdapter ? <div className="intake-underwriter-stage"><LeadCockpit hideFinancialForms response={cockpitResponse} adapter={cockpitAdapter} variant={detail.intake.variant} initialMessages={detail.messages} onResponse={handleCockpitResponse} onRequestRerun={onRerun} programReadiness={programReadiness} /></div> : <div className="empty">Loading the private underwriting conversation...</div>) : null}
                  {communicationChannel === "client" && cockpitAdapter ? <AIIntakeClientConversation adapter={cockpitAdapter} intakeId={detail.intake.id} profileId={underwriting?.profile_id ?? null} clientName={detail.intake.full_name} /> : null}
                  {communicationChannel === "email" && underwriting?.profile_id ? <AIIntakeEmailWorkspace key={underwriting.profile_id} profileId={underwriting.profile_id} clientName={detail.intake.full_name} contactSuppressed={Boolean(detail.intake.client_contact_suppressed)} offerSelectionCount={availableOfferSelections.length} onComposeOffer={openCurrentOffersComposer} /> : null}
                  {communicationChannel === "partner" ? <UnifiedThreadConversation threadId={`intake:${detail.intake.id}:partner`} emptyLabel="No dealer-partner messages yet." /> : null}
                  {communicationChannel === "internal" ? <UnifiedThreadConversation threadId={`intake:${detail.intake.id}:internal`} emptyLabel="No private internal notes yet." /> : null}
                </div>
              ) : null}

              {prototypeView === "production" && isDealerFile ? (
                <ProductionPackageTab intakeId={detail.intake.id} shareOpen={productionShareOpen} onShareClose={() => setProductionShareOpen(false)} termSheetOpen={productionTermSheetOpen} onTermSheetClose={closeTermSheet} />
              ) : null}

              {prototypeView === "audit" ? (
                <Panel title="Audit trail">
                  <ApplicationAuditTimeline sourceKind="intake" sourceId={detail.intake.id} />
                </Panel>
              ) : null}
            </main>
            {contextRailOpen ? (
              <aside className="grid intake-file-context">
                <div className="context-rail-toolbar">
                  <span>File details</span>
                  <IconBtn onClick={() => setContextRailOpen(false)} aria-label="Collapse file details" title="Collapse file details">
                    <Icon name="chevR" size={15} />
                  </IconBtn>
                </div>
                <Panel
                  title="Contact"
                  actions={
                    <IconBtn onClick={() => setContactEditOpen(true)} aria-label="Edit contact details" title="Edit contact details">
                      <Icon name="pencil" size={14} />
                    </IconBtn>
                  }
                >
                  <Line label="Legal entity / LLC" value={detail.intake.business_name || "-"} />
                  <Line label="Principal" value={detail.intake.full_name} />
                  <Line label="Email" value={detail.intake.email} />
                  <Line label="Mobile" value={detail.intake.phone || "-"} />
                  <Line label="Requested" value={formatMoney(detail.intake.requested_loan_amount)} />
                  <Line label="QC revenue points" value={underwriting?.forecast_fee_points == null ? "Not forecast" : `${underwriting.forecast_fee_points.toFixed(2)} points`} />
                  <Line label="Forecast earnings" value={formatMoney(forecastEarnings)} />
                  <Line label="Estimated closing" value={underwriting?.estimated_close_date ? new Date(`${underwriting.estimated_close_date}T12:00:00`).toLocaleDateString() : "Not scheduled"} />
                  <Line label="Purpose" value={detail.intake.loan_purpose || "-"} />
                  <Line label="Credit" value={detail.intake.estimated_credit_score ? String(detail.intake.estimated_credit_score) : "-"} />
                  <Line label="Source" value={detail.intake.referral_source || "Direct"} />
                  <Line label="Vertical" value={variantLabel(detail.intake.variant)} />
                </Panel>
                <FileTeamStrip profileId={profileId} canEdit={canUnderwrite} />
                <ApplicationClassificationPanel sourceKind="intake" sourceId={detail.intake.id} />
                <Panel title="Missing and blockers"><CompactList rows={missing.map((row) => ({ title: String(row.title || "Missing item"), body: String(row.detail || "") }))} empty={detail.latest_review ? "No blockers listed in the latest review." : "AI review has not run yet."} /></Panel>
              </aside>
            ) : (
              <aside className="intake-file-context-collapsed">
                <button type="button" className="context-rail-expand" onClick={() => setContextRailOpen(true)} aria-label="Expand file details" title="Expand file details">
                  <Icon name="chevL" size={15} />
                  <span>Details</span>
                </button>
              </aside>
            )}
          </div>
        </>
      )}

      {detail && underwriting?.profile_id ? <OfferDeliveryComposer
        profileId={underwriting.profile_id}
        clientName={detail.intake.full_name}
        open={offerComposerOpen && selectedOfferSelections.length > 0}
        selections={selectedOfferSelections}
        contactSuppressed={Boolean(detail.intake.client_contact_suppressed)}
        onClose={() => setOfferComposerOpen(false)}
        onSent={(receipt) => {
          setOfferDeliveryReceipt(receipt);
          setMerchantOfferStatus((current) => receipt.items.some((item) => item.kind === "merchant_offer") ? "sent" : current);
        }}
      /> : null}
      {detail ? <IntakeNotificationRoutingDrawer
        open={notificationRoutingOpen}
        onClose={() => setNotificationRoutingOpen(false)}
        intakeId={detail.intake.id}
        fileLabel={detail.intake.business_name || detail.intake.full_name || "AI Intake file"}
      /> : null}
      <Drawer
        open={pendingApprovalPatch != null}
        onClose={cancelApproval}
        title="Record approval"
        sub={detail ? `${detail.intake.business_name || detail.intake.full_name || "This AI intake"} will move from ${underwritingStatusLabel(underwriting?.underwriting_status)} to Approved.` : undefined}
        width="md"
        closeOnBackdrop={!underwritingSaving}
        footer={(
          <>
            <Btn style={{ minHeight: 44 }} onClick={cancelApproval} disabled={underwritingSaving}>Cancel</Btn>
            <span className="sp" />
            <Btn style={{ minHeight: 44 }} variant="pri" onClick={() => void confirmApproval()} disabled={underwritingSaving}>
              {underwritingSaving ? "Approving..." : "Confirm approval"}
            </Btn>
          </>
        )}
      >
        {underwritingError ? <WarnLine>{underwritingError}</WarnLine> : null}
        <div className="review-list" style={{ marginBottom: 16 }}>
          <div><b>Approval record</b></div>
          <div className="sub">The amount, optional DSCR, notes, and lifecycle change are saved together in one pipeline move.</div>
          <div className="sub">If this intake has no funding file, the move creates or reuses its linked funding loan.</div>
        </div>
        <PipelineApprovalFields
          value={approvalDraft}
          onChange={(value) => {
            setApprovalDraft(value);
            setApprovalError(null);
            setUnderwritingError(null);
          }}
          error={approvalError}
          autoFocus
        />
      </Drawer>
      <Toast msg={toast.msg} />
      <DriveFilePicker open={ingestPickerOpen} mode="ingest" busy={busy === "ingest"} maxSelect={50} onClose={() => setIngestPickerOpen(false)} selectedIds={ingestFiles.map((file) => file.id)} onPick={(file) => setIngestFiles((current) => current.some((item) => item.id === file.id) ? current : [...current, file])} onUnpick={(id) => setIngestFiles((current) => current.filter((file) => file.id !== id))} onConfirm={runIngest} />
      {detail && canDelete ? <ConfirmDeleteLeadModal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} expectedName={detail.intake.business_name || detail.intake.full_name} onConfirm={async (name) => { await onConfirmDeletion(name); setConfirmDeleteOpen(false); }} /> : null}
      <ConfirmDialog open={sendReviewOpen} onClose={() => setSendReviewOpen(false)} title={`Send lender package to ${toEmails || "recipient"}`} body="This sends the reviewed message and selected package from the connected desk mailbox and records the delivery result." confirmLabel="Send package" busy={busy === "send"} onConfirm={() => { void sendEmail().then(() => setSendReviewOpen(false)); }} />
      <Drawer
        open={contactEditOpen}
        onClose={() => setContactEditOpen(false)}
        title="Edit contact and entity"
        sub="Update the intake record without changing other files owned by this client."
        width="md"
        footer={<><span className="sp" /><Btn onClick={() => setContactEditOpen(false)} disabled={contactSaving}>Cancel</Btn><Btn variant="pri" onClick={() => void saveContact()} disabled={contactSaving}>{contactSaving ? "Saving..." : "Save details"}</Btn></>}
      >
        <div className="fldgrid two">
          <Field label="Principal name"><Input aria-label="Principal name" value={contactDraft.full_name} onChange={(event) => setContactDraft({ ...contactDraft, full_name: event.target.value })} /></Field>
          <Field label="Legal entity / LLC"><Input aria-label="Legal entity / LLC" value={contactDraft.business_name} onChange={(event) => setContactDraft({ ...contactDraft, business_name: event.target.value })} /></Field>
          <Field label="Email"><Input aria-label="Email" type="email" value={contactDraft.email} onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })} /></Field>
          <Field label="Mobile"><Input aria-label="Mobile" type="tel" value={contactDraft.phone} onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value })} /></Field>
          <Field label="Requested amount"><Input aria-label="Requested amount" type="number" min="0" value={contactDraft.requested_loan_amount} onChange={(event) => setContactDraft({ ...contactDraft, requested_loan_amount: event.target.value })} /></Field>
          <Field label="Estimated credit"><Input aria-label="Estimated credit" type="number" min="300" max="850" value={contactDraft.estimated_credit_score} onChange={(event) => setContactDraft({ ...contactDraft, estimated_credit_score: event.target.value })} /></Field>
          <Field label="Loan purpose"><Input aria-label="Loan purpose" value={contactDraft.loan_purpose} onChange={(event) => setContactDraft({ ...contactDraft, loan_purpose: event.target.value })} /></Field>
          <Field label="Referral source"><Input aria-label="Referral source" value={contactDraft.referral_source} onChange={(event) => setContactDraft({ ...contactDraft, referral_source: event.target.value })} /></Field>
        </div>
      </Drawer>
      <Drawer
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request missing evidence"
        sub="Add a required item to the client room. The request is recorded in the bucket audit trail."
        width="md"
        closeOnBackdrop={!requestSaving}
        footer={requestResult ? <><span className="sp" /><Btn variant="pri" onClick={() => setRequestOpen(false)}>Done</Btn></> : <><span className="sp" /><Btn onClick={() => setRequestOpen(false)} disabled={requestSaving}>Cancel</Btn><Btn variant="pri" onClick={() => void createDocumentRequest()} disabled={requestSaving || requestDraft.name.trim().length < 2}>{requestSaving ? "Creating..." : "Create request"}</Btn></>}
      >
        {requestResult ? <div className="grid g12">
          <Callout tone={requestResult.overall_status === "success" ? "ok" : requestResult.overall_status === "failed" ? "bad" : "warn"} icon={<Icon name={requestResult.overall_status === "success" ? "check" : "alert"} size={16} />}>
            {requestResult.overall_status === "success" ? "The request was created and the provider accepted every selected delivery." : requestResult.overall_status === "partial" ? "The request was created, but one selected channel did not send." : requestResult.overall_status === "failed" ? "The request is in the room, but delivery was not accepted." : "The request is in the room and was not sent."}
          </Callout>
          <div className="request-delivery-results">{requestResult.deliveries.map((receipt) => <div key={receipt.id}><span className="request-delivery-icon"><Icon name={receipt.provider_accepted ? "check" : receipt.channel === "none" ? "link" : "alert"} size={14} /></span><div className="grow"><b>{receipt.channel === "none" ? "Created without sending" : receipt.channel.toUpperCase()} {receipt.recipient_masked ? `· ${receipt.recipient_masked}` : ""}</b><span className="sub">{receipt.detail || receipt.status} · {formatDateTime(receipt.created_at)}</span></div><CellChip tone={receipt.provider_accepted ? "ok" : receipt.channel === "none" ? "mut" : "bad"}>{receipt.status}</CellChip></div>)}</div>
          <Row><Btn onClick={() => void navigator.clipboard.writeText(requestResult.room_url)}><Icon name="copy" size={14} />Copy room link</Btn>{requestResult.deliveries.some((receipt) => receipt.channel !== "none" && !receipt.provider_accepted) ? <Btn onClick={() => void retryRequestDelivery()} disabled={requestSaving}><Icon name="refresh" size={14} />{requestSaving ? "Retrying..." : "Retry failed delivery"}</Btn> : null}</Row>
          <Callout tone="warn">The room PIN is never included in this email. Share it separately.</Callout>
        </div> : <div className="grid g12">
          <Field label="Document or information needed"><Input autoFocus value={requestDraft.name} onChange={(event) => setRequestDraft({ ...requestDraft, name: event.target.value })} placeholder="Current year profit and loss statement" /></Field>
          <Field label="Category"><Select value={requestDraft.category} onChange={(event) => setRequestDraft({ ...requestDraft, category: event.target.value })}><option>Business documents</option><option>Bank statements</option><option>Tax returns</option><option>Ownership</option><option>Collateral</option><option>Debts</option><option>Personal financials</option><option>Other</option></Select></Field>
          <Field label="Client instructions"><Textarea value={requestDraft.description} onChange={(event) => setRequestDraft({ ...requestDraft, description: event.target.value })} placeholder="Describe the period, entity, and pages needed." /></Field>
          <label className="verification-sms"><input type="checkbox" checked={requestDraft.allow_multiple_files} onChange={(event) => setRequestDraft({ ...requestDraft, allow_multiple_files: event.target.checked })} />Allow multiple files for this request</label>
          <div className="fldgrid two"><Field label="Recipient email"><Input type="email" value={requestDraft.recipient_email} onChange={(event) => setRequestDraft({ ...requestDraft, recipient_email: event.target.value })} /></Field><Field label="Recipient phone"><Input type="tel" value={requestDraft.recipient_phone} onChange={(event) => setRequestDraft({ ...requestDraft, recipient_phone: event.target.value })} /></Field></div>
          <div className="request-channel-options">
            <label className={cx("pick", requestDraft.email_room_link && "on")}><input type="checkbox" checked={requestDraft.email_room_link} onChange={(event) => setRequestDraft({ ...requestDraft, email_room_link: event.target.checked })} />Email room link</label>
            <label className={cx("pick", requestDraft.sms_reminder && "on")}><input type="checkbox" checked={requestDraft.sms_reminder} onChange={(event) => setRequestDraft({ ...requestDraft, sms_reminder: event.target.checked })} />SMS reminder when consent exists</label>
            <label className={cx("pick", !requestDraft.email_room_link && !requestDraft.sms_reminder && "on")}><input type="radio" checked={!requestDraft.email_room_link && !requestDraft.sms_reminder} onChange={() => setRequestDraft({ ...requestDraft, email_room_link: false, sms_reminder: false })} />Create without sending</label>
          </div>
          <Callout tone="warn" icon={<Icon name="alert" size={15} />}>This changes the client checklist immediately. Review the title and instructions before creating it.</Callout>
        </div>}
      </Drawer>
      <Drawer
        open={rotatePinOpen}
        onClose={() => setRotatePinOpen(false)}
        title={rotatePinDone ? "Room PIN rotated" : "Review before running"}
        sub={rotatePinDone ? "The previous PIN was invalidated immediately." : "Rotate the secure application-room PIN."}
        width="md"
        closeOnBackdrop={!rotatePinSaving}
        footer={<><span className="sp" />{rotatePinDone ? <Btn variant="pri" onClick={() => setRotatePinOpen(false)}>Done</Btn> : <><Btn onClick={() => setRotatePinOpen(false)} disabled={rotatePinSaving}>Cancel</Btn><Btn variant="pri" onClick={() => void rotateApplicationRoomPin()} disabled={rotatePinSaving || !/^\d{6}$/.test(rotatePin) || rotatePin !== rotatePinConfirm}>{rotatePinSaving ? "Rotating..." : "Rotate room PIN"}</Btn></>}</>}
      >
        {rotatePinDone ? <div className="grid g12"><Callout tone="ok" icon={<Icon name="check" size={16} />}>The new PIN is active. Share it separately from the room link.</Callout><div className="secure-room-created-grid"><div><span className="lbl">New room PIN</span><b className="secure-room-pin num">{rotatePin}</b><Btn onClick={() => void navigator.clipboard.writeText(rotatePin)}><Icon name="copy" size={14} />Copy PIN</Btn></div></div></div> : <div className="grid g12"><Callout tone="warn" icon={<Icon name="alert" size={16} />}>This immediately invalidates the current PIN. Existing room URLs remain valid, but the client must use the new PIN.</Callout><div className="fldgrid two"><Field label="New six-digit PIN"><Input value={rotatePin} onChange={(event) => setRotatePin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" /></Field><Field label="Confirm PIN"><Input value={rotatePinConfirm} onChange={(event) => setRotatePinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" /></Field></div><div className="review-effects"><div><span>Actor</span><b>Current operator</b></div><div><span>Execution</span><b>Immediately</b></div><div><span>Reversible</span><b>Rotate again</b></div></div></div>}
      </Drawer>
    </div>
  );

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-h" style={{ flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h3>{detail?.intake.business_name || detail?.intake.full_name || "AI lead"}</h3>
          <p className="sub">
            {detail ? `${variantLabel(detail.intake.variant)} · ${detail.intake.email}` : "Loading"}
          </p>
        </div>
        <span className="sp" />
        <Btn
          aria-label="Messages with the dealer partner"
          title="Messages with the dealer partner"
          onClick={() => setNotesOpen(true)}
        >
          <Icon name="chat" size={14} /> Messages
          {detail?.notes && detail.notes.length > 0 ? (
            <span className="cnt sm">{detail.notes.length}</span>
          ) : null}
        </Btn>
        {detail ? (
          <Select
            value={detail.intake.outcome_status}
            disabled={outcomeBusy}
            onChange={(e) => changeOutcomeStatus(e.target.value)}
            aria-label="Outcome status"
          >
            <option value="submitted">Submitted</option>
            <option value="closed">Closed</option>
            <option value="denied">Denied</option>
          </Select>
        ) : null}
        {detail ? (
          <Select
            value={detail.intake.preferred_language}
            disabled={languageBusy}
            onChange={(e) => changeLanguage(e.target.value)}
            title="Client language"
            aria-label="Client language"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </Select>
        ) : null}
        {detail?.intake.delete_requested_at ? (
          <CellChip tone="warn" title={`Requested by ${detail.intake.delete_requested_by || "unknown"} on ${new Date(detail.intake.delete_requested_at).toLocaleString()}`}>
            Partner requested delete
          </CellChip>
        ) : null}
        {canDelete ? <Btn disabled={deletionBusy} onClick={() => setConfirmDeleteOpen(true)}>Archive lead</Btn> : null}
        {canDelete && detail?.intake.delete_requested_at ? (
          <Btn disabled={deletionBusy} onClick={handleCancelDeletionRequest}>Keep</Btn>
        ) : null}
        <IconBtn aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </IconBtn>
      </div>
      {loading || !detail ? (
        <div className="panel-b sub">Loading lead detail...</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="row" style={{ flexShrink: 0, padding: "12px 16px 0" }}>
            <Seg
              value={activeTab}
              onChange={setActiveTab}
              ariaLabel="Lead view"
              options={[
                { value: "conversation", label: "Conversation" },
                { value: "workspace", label: "Workspace" },
              ]}
            />
          </div>
          {activeTab === "workspace" ? (
            <div className="row" style={{ flexShrink: 0, padding: "10px 16px 12px", borderBottom: "1px solid var(--line)" }}>
              <Seg
                value={workspaceSub}
                onChange={setWorkspaceSub}
                ariaLabel="Workspace section"
                options={[
                  { value: "overview", label: "Overview" },
                  { value: "documents", label: "Documents" },
                  { value: "client", label: "Client conversation" },
                  { value: "credit", label: "Credit" },
                  { value: "contracts", label: "Contracts" },
                  { value: "package", label: "Package" },
                ]}
              />
            </div>
          ) : (
            <div style={{ flexShrink: 0, borderBottom: "1px solid var(--line)", marginTop: 12 }} />
          )}
          <div style={{ flex: 1, minHeight: 0, padding: 16, display: "grid", gap: 14, overflowY: "auto" }}>
          <Row>
            <CellChip tone={probabilityTone(String(result?.probability_status || ""))}>
              {String(result?.probability_status || "No screen yet")}
            </CellChip>
            <CellChip tone={detail.intake.call_booked ? "ok" : "mut"}>
              {detail.intake.call_booked ? "Call booked" : "Call not booked"}
            </CellChip>
          </Row>

          {activeTab === "conversation" ? (
            cockpitResponse && cockpitAdapter ? (
              <div style={{ flex: 1, minHeight: 460, position: "relative", overflow: "hidden" }}>
                <LeadCockpit
                  hideFinancialForms
                  response={cockpitResponse}
                  adapter={cockpitAdapter}
                  variant={detail.intake.variant}
                  initialMessages={detail.messages}
                  onResponse={handleCockpitResponse}
                  onRequestRerun={onRerun}
                  programReadiness={programReadiness}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => setNotesOpen((v) => !v)}
                  aria-label={notesOpen ? "Hide internal notes" : "Show internal notes"}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: notesOpen ? 360 : 0,
                    transform: "translateY(-50%)",
                    zIndex: 21,
                    flexDirection: "column",
                    transition: "right 200ms ease",
                  }}
                >
                  <Icon name={notesOpen ? "chevR" : "chevL"} size={12} />
                  <span style={{ writingMode: "vertical-rl" }}>
                    Notes{detail.notes?.length ? ` (${detail.notes.length})` : ""}
                  </span>
                </button>
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 360,
                    zIndex: 20,
                    display: "grid",
                    transform: notesOpen ? "translateX(0)" : "translateX(100%)",
                    transition: "transform 200ms ease",
                    boxShadow: notesOpen ? "-8px 0 24px rgba(0,0,0,0.18)" : "none",
                  }}
                >
                  <LeadNotesPanel
                    notes={detail.notes ?? []}
                    onPost={postNote}
                    posting={notesPosting}
                    error={notesError}
                    subtitle="Private channel with this lead's dealer partner — never visible to the client."
                    emptyLabel="No messages yet. Start the conversation with this lead's dealer partner."
                  />
                </div>
              </div>
            ) : (
              <span className="sub">Loading conversation…</span>
            )
          ) : null}

          {activeTab === "workspace" && workspaceSub === "overview" ? (
            <>
              <InfoBlock title="Contact">
                <Line label="Name" value={detail.intake.full_name} />
                <Line label="Email" value={detail.intake.email} />
                <Line label="Phone" value={detail.intake.phone || "-"} />
                <Line label="Requested amount" value={formatMoney(detail.intake.requested_loan_amount)} />
                <Line label="Use of funds" value={detail.intake.loan_purpose || "-"} />
                <Line label="Referral" value={detail.intake.referral_source || "-"} />
              </InfoBlock>

              <InfoBlock title="Actions">
                <Row>
                  <Btn variant="pri" onClick={onRerun} disabled={rerunning}>
                    {rerunning ? "Re-running AI review…" : "Re-run AI review on latest uploads"}
                  </Btn>
                  <Btn onClick={onExport}>Export intelligence PDF</Btn>
                  <Link href={`/admin/buckets`} className="btn">Open Buckets</Link>
                  <Btn onClick={onLinkBucketIntake}>
                    <Icon name="link" size={14} />
                    Link bucket
                  </Btn>
                  <Btn onClick={() => navigator.clipboard.writeText(detail.intake.bucket_id)}>Copy bucket ID</Btn>
                </Row>
                {detail.latest_review?.status ? (
                  <StatusLine className="mt" tone={detail.latest_review.status === "failed" ? "bad" : "mut"}>
                    Latest review: {detail.latest_review.status}
                    {detail.latest_review.error ? ` — ${detail.latest_review.error}` : ""}
                  </StatusLine>
                ) : null}
              </InfoBlock>

              <InfoBlock title="AI next step">
                <p>{String(result?.one_next_step || result?.executive_summary || "Awaiting AI review.")}</p>
              </InfoBlock>

              <InfoBlock title="Evidence coverage">
                <CompactList rows={arrayOfRecords(evidence?.baseline_coverage).map((row) => ({
                  title: String(row.category || "Evidence"),
                  body: `${String(row.status || "unclear")} · ${Array.isArray(row.evidence) ? row.evidence.join(" | ") : String(row.evidence || row.gap || "")}`,
                }))} empty="No evidence map yet." />
              </InfoBlock>

              <InfoBlock title="Missing / blockers">
                <CompactList rows={missing.map((row) => ({ title: String(row.title || "Missing item"), body: String(row.detail || "") }))} empty="No missing items listed." />
              </InfoBlock>

              <InfoBlock title="Strengths / risks">
                <CompactList rows={[...strengths.map((item) => ({ title: "Strength", body: item })), ...risks.map((item) => ({ title: "Risk", body: item }))]} empty="Awaiting strengths and risks." />
              </InfoBlock>
            </>
          ) : null}

          {activeTab === "workspace" && workspaceSub === "documents" ? (
            <InfoBlock title={`Uploaded files (${evidenceFileCount})`}>
              <div className="grid g10">
                <Row>
                  <span className="sub" style={{ flex: 1, minWidth: 200 }}>
                    Import files from your Google Drive so the AI reads and learns from them — imported files are analyzed and folded into the review, just like uploads.
                  </span>
                  <Btn
                    disabled={busy !== ""}
                    title="Pick files from your connected Google Drive to analyze with the AI"
                    onClick={() => setIngestPickerOpen(true)}
                  >
                    {busy === "ingest" ? <><Spinner /> Importing…</> : `Add from Google Drive${ingestFiles.length ? ` (${ingestFiles.length})` : ""}`}
                  </Btn>
                </Row>
                <div>
                  {evidenceFiles.length ? evidenceFiles.slice(0, 60).map((file) => (
                    <div key={file.id} className="filerow">
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.zip_entry_path || file.file_name}</span>
                      <span className="sub">{formatSize(file.size_bytes)}</span>
                    </div>
                  )) : <span className="sub">No uploaded files yet.</span>}
                </div>
              </div>
            </InfoBlock>
          ) : null}

          {activeTab === "workspace" && workspaceSub === "client" && cockpitAdapter ? (
            <AIIntakeClientConversation adapter={cockpitAdapter} intakeId={detail.intake.id} profileId={underwriting?.profile_id ?? null} clientName={detail.intake.full_name} />
          ) : null}

          {activeTab === "workspace" && workspaceSub === "credit" ? (
            <div className="grid">
              <LeadCreditPanel intakeId={detail.intake.id} />
              {!isRealEstate ? <LeadProgramFitPanel intakeId={detail.intake.id} /> : null}
              {isRealEstate ? <LeadDscrPanel intakeId={detail.intake.id} /> : null}
            </div>
          ) : null}

          {activeTab === "workspace" && workspaceSub === "contracts" ? (
            <LeadContractsPanel intakeId={detail.intake.id} />
          ) : null}

          {activeTab === "workspace" && workspaceSub === "package" ? (
            <>
              {/* Step 0 — Prequalification draft (real estate only — the AI also
                  auto-drafts this in chat once baseline+credit+details are ready;
                  this button lets an admin draft or redraft it manually). */}
              {isRealEstate ? (
                <InfoBlock title="0 · Prequalification draft">
                  <div className="grid g10">
                    <span className="sub">
                      A borrower-facing preliminary prequalification — program fit, sizing, and next step. The AI also generates this automatically in chat once baseline documents, the credit pull, and the down payment/prior-ownership/property-type details are all on file.
                    </span>
                    <Row>
                      <Btn variant="pri" onClick={async () => { setBusy("prequal"); try { await onGeneratePrequalification(); toast.show("Prequalification drafted"); } finally { setBusy(""); } }} disabled={busy !== ""}>
                        {busy === "prequal" ? <><Spinner /> Drafting…</> : prequalification ? "Redraft prequalification" : "Draft prequalification"}
                      </Btn>
                      <CellChip tone={prequalification ? "ok" : "mut"}>{prequalification ? "Ready" : "Not started"}</CellChip>
                      {prequalification ? <Btn onClick={() => copyText("Prequalification", prequalification.body_text || String(prequalification.body_json?.prequalification_summary || ""))}>Copy text</Btn> : null}
                    </Row>
                    {prequalification ? (
                      <div className="card grid g6" style={{ maxHeight: 260, overflowY: "auto" }}>
                        <strong>{prequalification.title}</strong>
                        <p style={{ whiteSpace: "pre-wrap" }}>{prequalification.body_text || String(prequalification.body_json?.prequalification_summary || "")}</p>
                        <span className="sub">Generated {formatDateTime(prequalification.created_at)}</span>
                      </div>
                    ) : <span className="sub">Draft a preliminary prequalification from the analyzed evidence.</span>}
                  </div>
                </InfoBlock>
              ) : null}

              {/* Step 1 — Executive summary (short on-screen narrative) */}
              <InfoBlock title="1 · Executive summary">
                <div className="grid g10">
                  <span className="sub">
                    A short credit-officer memo in plain prose — read it here and copy it into notes or a message. It also becomes the opening of the lender packet PDF in step 2.
                  </span>
                  <Row>
                    <Btn variant="pri" onClick={async () => { setBusy("summary"); try { await onGenerateSummary(); toast.show("Executive summary ready"); } finally { setBusy(""); } }} disabled={busy !== ""}>
                      {busy === "summary" ? <><Spinner /> Generating…</> : summary ? "Regenerate summary" : "Generate executive summary"}
                    </Btn>
                    <CellChip tone={summary ? "ok" : "mut"}>{summary ? "Ready" : "Not started"}</CellChip>
                    {summary ? <Btn onClick={() => copyText("Summary", summary.body_text || String(summary.body_json?.executive_summary || ""))}>Copy summary</Btn> : null}
                    {summary?.title ? <Btn onClick={() => copyText("Title", summary.title)}>Copy title</Btn> : null}
                  </Row>
                  {summary ? (
                    <div className="card grid g6" style={{ maxHeight: 260, overflowY: "auto" }}>
                      <strong>{summary.title}</strong>
                      <p style={{ whiteSpace: "pre-wrap" }}>{summary.body_text || String(summary.body_json?.executive_summary || "")}</p>
                      <span className="sub">Generated {formatDateTime(summary.created_at)}</span>
                    </div>
                  ) : <span className="sub">Generate a polished underwriter summary from the analyzed evidence.</span>}
                </div>
              </InfoBlock>

              {/* Step 2 — Lender packet PDF (the full branded document) */}
              <InfoBlock title="2 · Lender packet PDF">
                <div className="grid g10">
                  <span className="sub">
                    The full branded document for a bank underwriter — landscape, white background, month-over-month bank charts (deposits, withdrawals, ending balance), a 2-year tax summary, Excel-style tables, our logo, and a CONFIDENTIAL watermark. Sensitive account and ID numbers are redacted.
                  </span>
                  <Row>
                    <Btn variant="pri" onClick={async () => { setBusy("packet"); try { await onGeneratePacket(); toast.show("Lender packet ready"); } finally { setBusy(""); } }} disabled={busy !== ""}>
                      {busy === "packet" ? <><Spinner /> Generating…</> : packet ? "Regenerate packet" : "Generate lender packet PDF"}
                    </Btn>
                    <CellChip tone={packet ? "ok" : "mut"}>{packet ? "Ready" : "Not started"}</CellChip>
                    {packet?.download_url ? <a href={packet.download_url} target="_blank" rel="noreferrer" className="btn">Download / preview PDF</a> : null}
                    {packet ? <span className="sub">{formatDateTime(packet.created_at)}</span> : null}
                  </Row>
                </div>
              </InfoBlock>

              {/* Step 3 — Ship it: full package + copy affordances */}
              <InfoBlock title="3 · Ship the package">
                <div className="grid g10">
                  <Row>
                    <Btn variant="pri" onClick={downloadZip} disabled={zipBusy}>
                      {zipBusy ? <><Spinner /> Building ZIP…</> : "Download full package (.zip)"}
                    </Btn>
                    <Btn onClick={onLinkBucketIntake}>
                      <Icon name="link" size={14} />
                      Link bucket
                    </Btn>
                    <Btn onClick={() => copyText("Bucket ID", detail.intake.bucket_id)}>Copy bucket ID</Btn>
                  </Row>
                  <p className="sub">
                    The ZIP bundles every uploaded document, the lender packet PDF, the executive summary, and an editable email template — ready to attach, upload, or archive anywhere.
                  </p>
                </div>
              </InfoBlock>

              {/* Step 4 — Draft, then either copy to your inbox OR send from your connected Gmail */}
              <InfoBlock title="4 · Email — draft, then copy or send">
                <div className="grid g10">
                  <span className="sub">
                    Draft a lender/vendor email from the analyzed evidence. Copy the subject and body into your own mail client, or add recipients below and send it straight from your connected Gmail with the lender packet plus any Google Drive files attached.
                  </span>

                  <div className="grid g6">
                    <Row>
                      <Lbl>Subject</Lbl>
                      <span className="sp" />
                      <CopyIconButton disabled={!subject.trim()} onCopy={() => copyText("Subject", subject)} />
                    </Row>
                    <Input value={subject} maxLength={512} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject line" aria-label="Email subject line" />
                  </div>

                  <div className="grid g6">
                    <Row>
                      <Lbl>Body</Lbl>
                      <span className="sp" />
                      <CopyIconButton disabled={!body.trim()} onCopy={() => copyText("Body", body)} />
                    </Row>
                    <Textarea value={body} maxLength={12000} onChange={(event) => setBody(event.target.value)} placeholder="Prepare a draft, or write the email body here" aria-label="Email body" style={{ minHeight: 200, resize: "vertical" }} />
                  </div>

                  {/* Recipients — only used by the "Send via your Gmail" path. */}
                  <div className="fldgrid two">
                    <Field label="To">
                      <Input value={toEmails} onChange={(e) => setToEmails(e.target.value)} placeholder="lender@bank.com" />
                    </Field>
                    <Field label="Cc (optional)">
                      <Input value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} placeholder="comma-separated" />
                    </Field>
                  </div>

                  {/* Selected Google Drive attachments */}
                  {driveFiles.length > 0 ? (
                    <Row>
                      {driveFiles.map((f) => (
                        <span key={f.id} className="chip">
                          <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          <Linky
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setDriveFiles((prev) => prev.filter((x) => x.id !== f.id))}
                          >
                            ×
                          </Linky>
                        </span>
                      ))}
                    </Row>
                  ) : null}

                  {/* Attachments + secure-bucket access — controls what actually
                      goes out when "Send via your Gmail" is used. */}
                  <div className="card grid g8">
                    <Lbl>Attach to the email</Lbl>
                    <div>
                      <label className={cx("pick", attachPacket && "on")}>
                        <input type="checkbox" checked={attachPacket} onChange={(e) => setAttachPacket(e.target.checked)} /> Lender packet PDF
                      </label>
                      <label className={cx("pick", attachSummary && "on")}>
                        <input type="checkbox" checked={attachSummary} onChange={(e) => setAttachSummary(e.target.checked)} /> Executive summary PDF
                      </label>
                      <label className={cx("pick", attachZip && "on")}>
                        <input type="checkbox" checked={attachZip} onChange={(e) => setAttachZip(e.target.checked)} /> Full package (.zip)
                      </label>
                    </div>
                    <Row>
                      <Lbl>Bucket access</Lbl>
                      <Select value={bucketAccess} onChange={(e) => setBucketAccess(e.target.value as BucketAccessMode)} aria-label="Bucket access" style={{ minWidth: 210 }}>
                        <option value="login">Vendor login link (invited email)</option>
                        <option value="passcode">Link + access code (no login)</option>
                        <option value="none">No bucket access</option>
                      </Select>
                      <span className="sub">
                        {bucketAccess === "passcode"
                          ? "A one-time access code is generated and included in the email."
                          : bucketAccess === "login"
                            ? "Recipient logs in with their invited vendor email."
                            : "The email carries only the attachments above."}
                      </span>
                    </Row>
                    <span className="sub">
                      Files over 8&nbsp;MB (or a combined set over ~18&nbsp;MB) fall back to the secure bucket link instead of attaching.
                    </span>
                  </div>

                  <Row>
                    <Btn variant="pri" onClick={async () => { setBusy("preview"); try { await previewEmail(); toast.show("Draft ready"); } finally { setBusy(""); } }} disabled={busy !== ""}>
                      {busy === "preview" ? <><Spinner /> Drafting…</> : (subject || body) ? "Regenerate draft" : "Draft email with AI"}
                    </Btn>
                    <Btn
                      disabled={busy !== "" || !subject.trim() || !body.trim() || !toEmails.trim()}
                      title={!subject.trim() || !body.trim() ? "Draft a subject and body first" : !toEmails.trim() ? "Add at least one recipient in the To field" : "Send from your connected Gmail (falls back to firm email)"}
                      onClick={sendEmail}
                    >
                      {busy === "send" ? <><Spinner /> Sending…</> : "Send via your Gmail"}
                    </Btn>
                    <Btn
                      disabled={busy !== ""}
                      title="Attach files from your connected Google Drive"
                      onClick={() => setDrivePickerOpen(true)}
                    >
                      Attach from Drive{driveFiles.length ? ` (${driveFiles.length})` : ""}
                    </Btn>
                    <Btn
                      disabled={!bookingLink.data?.url}
                      title={bookingLink.data?.url ? "Append your booking link to the body" : "Enable your Booking Page first (Booking Page in the sidebar)"}
                      onClick={() => {
                        const url = bookingLink.data?.url;
                        if (!url) return;
                        setBody((b) => `${b}${b && !b.endsWith("\n") ? "\n\n" : ""}Book a time with me: ${url}`);
                        toast.show("Booking link inserted");
                      }}
                    >
                      Insert booking link
                    </Btn>
                  </Row>
                </div>
              </InfoBlock>

              {/* Final step — assemble the normalized JSON payload for the
                  banker's own intake system. Dealer leads only, mirroring the
                  Program Fit panel's dealer-only gate. */}
              {!isRealEstate ? (
                <InfoBlock title="Prepare banker submission">
                  <div className="grid g10">
                    <span className="sub">
                      Assemble a normalized JSON payload — borrower, entity, key metrics, and program fit — for
                      an admin to hand to the banker's own intake system. SSN / personal Tax ID are collected
                      transiently in the modal and never stored.
                    </span>
                    <div>
                      <Btn variant="pri" onClick={() => setBankerModalOpen(true)}>
                        Open banker submission
                      </Btn>
                    </div>
                  </div>
                </InfoBlock>
              ) : null}
            </>
          ) : null}
          </div>
        </div>
      )}
      {/* Toast mounted at Card level so success/error messages show on every
          tab (Documents ingest, Overview, etc.), not just the package composer. */}
      <Toast msg={toast.msg} />
      <DriveFilePicker
        open={drivePickerOpen}
        onClose={() => setDrivePickerOpen(false)}
        selectedIds={driveFiles.map((f) => f.id)}
        onPick={(file) => {
          setDriveFiles((prev) => (prev.some((f) => f.id === file.id) ? prev : [...prev, file]));
        }}
        onUnpick={(id) => setDriveFiles((prev) => prev.filter((f) => f.id !== id))}
      />
      <DriveFilePicker
        open={ingestPickerOpen}
        mode="ingest"
        busy={busy === "ingest"}
        maxSelect={50}
        onClose={() => setIngestPickerOpen(false)}
        selectedIds={ingestFiles.map((f) => f.id)}
        onPick={(file) => {
          setIngestFiles((prev) => {
            if (prev.some((f) => f.id === file.id)) return prev;
            if (prev.length >= 50) return prev;
            return [...prev, file];
          });
        }}
        onUnpick={(id) => setIngestFiles((prev) => prev.filter((f) => f.id !== id))}
        onConfirm={runIngest}
      />
      {detail ? (
        <BankerSubmissionModal
          open={bankerModalOpen}
          onClose={() => setBankerModalOpen(false)}
          intakeId={detail.intake.id}
        />
      ) : null}
      {detail && canDelete ? (
        <ConfirmDeleteLeadModal
          open={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          expectedName={detail.intake.business_name || detail.intake.full_name}
          onConfirm={async (confirmName) => {
            await onConfirmDeletion(confirmName);
            setConfirmDeleteOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmDeleteLeadModal({
  open,
  onClose,
  expectedName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  expectedName: string;
  onConfirm: (confirmName: string) => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");
  const normalizedExpectedName = expectedName.trim().split(/\s+/).join(" ").toLocaleLowerCase();
  const confirmationMatches = confirmationName.trim().split(/\s+/).join(" ").toLocaleLowerCase() === normalizedExpectedName;

  useEffect(() => {
    if (open) setConfirmationName("");
  }, [open, expectedName]);

  async function handleConfirm() {
    if (busy || !confirmationMatches) return;
    setBusy(true);
    try {
      await onConfirm(confirmationName);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not delete this lead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title="Archive AI Intake file"
      sub="Remove it from active work without deleting documents or history"
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <span className="sp" />
          <Btn variant="pri" disabled={busy || !confirmationMatches} onClick={handleConfirm}>
            {busy ? <><Spinner /> Archiving…</> : "Archive file"}
          </Btn>
        </>
      }
    >
      <div className="grid">
        <div className="warnline"><strong>{expectedName}</strong> will leave the active workspace. Uploaded documents, generated artifacts, conversations, and history remain retained and can be restored.</div>
        <Field label={`Type “${expectedName}” to confirm`} req>
          <Input
            autoFocus
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
            autoComplete="off"
            aria-describedby="delete-confirmation-help"
            style={{ minHeight: 44 }}
          />
        </Field>
        <span id="delete-confirmation-help" className="sub">The name is verified again by the server to prevent archiving the wrong file.</span>
        <div className="kv"><span>Actor</span><b>Current signed-in operator</b></div>
        <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
        <div className="kv"><span>Reversible</span><b>Yes — use the Archived filter and Restore</b></div>
      </div>
    </Drawer>
  );
}

function DriveFilePicker({
  open,
  onClose,
  selectedIds,
  onPick,
  onUnpick,
  mode = "attach",
  busy = false,
  maxSelect,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onPick: (file: DriveFile) => void;
  onUnpick: (id: string) => void;
  mode?: "attach" | "ingest";
  busy?: boolean;
  maxSelect?: number;
  onConfirm?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  // Only fetch once the picker is open; hitting /google/drive/files when the
  // operator hasn't connected Drive returns [] (best-effort), so no error state.
  const { data, isLoading, isError, refetch, isFetching } = useDriveFiles(submitted || undefined, open);
  const files = data?.files ?? [];
  const ingest = mode === "ingest";

  function fmtSize(size?: string | null): string {
    const n = size ? Number(size) : NaN;
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={ingest ? "Add from Google Drive" : "Attach from Google Drive"}
      bodyClass="grid g10"
      footer={
        ingest ? (
          <>
            <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
            <span className="sp" />
            <Btn variant="pri" onClick={() => onConfirm?.()} disabled={busy || selectedIds.length === 0}>
              {busy ? <><Spinner /> Importing…</> : `Import & analyze${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </Btn>
          </>
        ) : (
          <>
            <span className="sp" />
            <Btn variant="pri" onClick={onClose}>Done{selectedIds.length ? ` (${selectedIds.length})` : ""}</Btn>
          </>
        )
      }
    >
      <Row>
        <Input
          grow
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setSubmitted(query.trim()); }}
          placeholder="Search your Drive files by name…"
          aria-label="Search your Drive files by name"
        />
        <Btn onClick={() => setSubmitted(query.trim())}>Search</Btn>
      </Row>
      <span className="sub">
        {ingest
          ? "Only files you open or create with Qualified Commercial are visible here (Drive “file” scope). Selected files are imported into this file’s document set and analyzed by the AI. Files over 25 MB are skipped."
          : "Only files you open or create with Qualified Commercial are visible here (Drive “file” scope). Files over 8 MB, or a combined attachment set over ~18 MB, are shared via the secure bucket instead of attached."}
      </span>
      {isLoading || isFetching ? (
        <div className="row sub">
          <Spinner /> Loading Drive files…
        </div>
      ) : isError ? (
        <div className="grid g8">
          <span className="sub">Couldn’t reach Google Drive. Make sure your Google account is connected in Settings → Connections.</span>
          <div><Btn onClick={() => refetch()}>Retry</Btn></div>
        </div>
      ) : files.length === 0 ? (
        <span className="sub">
          {submitted ? "No matching Drive files." : "No Drive files found. Connect Google Drive in Settings → Connections, or search by name."}
        </span>
      ) : (
        <div className="picklist">
          {files.map((f) => {
            const picked = selectedIds.includes(f.id);
            const atCap = maxSelect !== undefined && !picked && selectedIds.length >= maxSelect;
            return (
              <button
                key={f.id}
                type="button"
                className={cx("pick", picked && "on")}
                disabled={atCap}
                title={atCap ? `Up to ${maxSelect} files per import` : undefined}
                onClick={() => (picked ? onUnpick(f.id) : onPick(f))}
                style={{ textAlign: "left", opacity: atCap ? 0.5 : 1, cursor: atCap ? "not-allowed" : undefined }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span className="sub">{fmtSize(f.size)}</span>
                <CellChip tone={picked ? "acc" : "mut"}>{picked ? "Added" : "Add"}</CellChip>
              </button>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

function ClientConversation({ adapter, clientName }: { adapter: LeadCockpitAdapter; clientName?: string | null }) {
  const [messages, setMessages] = useState<ClientThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const adopt = useCallback((r: ClientThreadResponse) => {
    setMessages(r.messages || []);
    setPausedUntil(r.ai_paused_until ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adapter
      .loadClientThread()
      .then((r) => { if (alive) adopt(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not load the client conversation."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [adapter, adopt]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      adopt(await adapter.replyClientThread(text));
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply failed.");
    } finally {
      setSending(false);
    }
  }

  async function resumeAI() {
    if (!adapter.resumeClientThreadAI || resuming) return;
    setResuming(true);
    setError("");
    try {
      adopt(await adapter.resumeClientThreadAI());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not hand the conversation back.");
    } finally {
      setResuming(false);
    }
  }

  // Minutes left in the takeover window, for the banner.
  const pauseMinutes = pausedUntil
    ? Math.max(0, Math.ceil((new Date(pausedUntil).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <div className="grid g10" style={{ alignContent: "start" }}>
      <WarnLine>
        This is the <strong>client-facing</strong> conversation{clientName ? ` with ${clientName}` : ""}. Anything you send here is visible to the client and is attributed to you as their underwriter. Private operator and partner messages stay in the Rep channel tab.
      </WarnLine>

      {pausedUntil ? (
        <StatusLine tone="warn">
          You have the conversation. The AI is not replying to {clientName || "the client"} here, and picks
          it back up in about {pauseMinutes} {pauseMinutes === 1 ? "minute" : "minutes"} unless you send again.
          {adapter.resumeClientThreadAI ? (
            <>
              {" "}
              <Btn size="sm" onClick={resumeAI} disabled={resuming}>
                {resuming ? "Handing back…" : "Hand back to the AI now"}
              </Btn>
            </>
          ) : null}
        </StatusLine>
      ) : null}

      <div className="card">
        <div className="thr">
          {loading ? (
            <span className="thr-empty">Loading client conversation…</span>
          ) : messages.length === 0 ? (
            <span className="thr-empty">No messages in the client conversation yet.</span>
          ) : (
            messages.map((m) => {
              const isAI = m.role === "assistant";
              // sender_kind is the marker; the name check only covers rows written
              // before it existed, and a borrower named "Underwriter" would fool it.
              const isClient = !isAI && (m.sender_kind
                ? m.sender_kind === "client"
                : !(m.author_name || "").toLowerCase().startsWith("underwriter"));
              const label = isAI ? "AI" : m.author_name || (isClient ? clientName || "Client" : "You");
              return (
                <div key={m.id} className={cx("msg", isAI ? "ai" : isClient ? "client-ch" : "mine")}>
                  <div className="msg-h"><span className="msg-who">{label}</span></div>
                  <div className="msg-b">{m.content}</div>
                </div>
              );
            })
          )}

        </div>

        {error ? <StatusLine tone="bad" className="mt">{error}</StatusLine> : null}

        <div className="composer">
          <Lbl>Reply on behalf (as underwriter)</Lbl>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Answer the client here. Enter to send, Shift+Enter for a new line."
            aria-label="Reply on behalf (as underwriter)"
          />
          <div className="composer-row">
            <Btn variant="pri" onClick={send} disabled={sending || !draft.trim()}>
              {sending ? <><Spinner /> Sending…</> : "Send to client"}
            </Btn>
            <span className="hint">Visible to the client · attributed to you · the AI does not reply to this</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type LeadVariant = "dealer" | "real_estate" | "main_street" | "mca_refinance";

type CreateLeadPayload = {
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

function CreateLeadModal({
  onClose,
  onCreate,
  creating,
}: {
  onClose: () => void;
  onCreate: (payload: CreateLeadPayload, evidenceFiles: File[]) => Promise<LeadDetail | undefined>;
  creating: boolean;
}) {
  const [variant, setVariant] = useState<LeadVariant>("dealer");
  const [industry, setIndustry] = useState<string>("other");
  const [intent, setIntent] = useState<string>("working_capital");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [investorName, setInvestorName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [propertyValue, setPropertyValue] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [creditTier, setCreditTier] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "es">("en");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [roomPin, setRoomPin] = useState("");
  const [roomPinConfirm, setRoomPinConfirm] = useState("");
  const [created, setCreated] = useState<LeadDetail | null>(null);
  const evidencePicker = useRef<HTMLInputElement>(null);

  const isRE = variant === "real_estate";
  const isMS = variant === "main_street";
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  async function submit() {
    if (!fullName.trim()) { setError("Client name is required."); return; }
    if (!email.trim() || !email.includes("@")) { setError("A valid client email is required."); return; }
    if (!phone.trim()) { setError("A client mobile number is required."); return; }
    if (!validPhone(phone)) { setError("That number does not look complete. Enter a 10-digit US mobile, or include the country code for an international number."); return; }
    setError("");
    const result = await onCreate({
      variant,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      business_name: isRE ? undefined : (businessName.trim() || undefined),
      investor_name: isRE ? (investorName.trim() || undefined) : undefined,
      target_property_address: isRE ? (propertyAddress.trim() || undefined) : undefined,
      transaction_type: isRE ? (transactionType.trim() || undefined) : undefined,
      requested_amount: isRE ? num(requestedAmount) : undefined,
      estimated_value_or_purchase_price: isRE ? num(propertyValue) : undefined,
      monthly_rent: isRE ? num(monthlyRent) : undefined,
      estimated_credit_tier: isRE ? (creditTier.trim() || undefined) : undefined,
      industry: isMS ? industry : undefined,
      intent: isMS ? intent : undefined,
      notify_client: notifyClient,
      preferred_language: preferredLanguage,
      secure_room_pin: roomPin,
    }, evidenceFiles);
    if (result) setCreated(result);
  }

  function next() {
    if (step === 1) {
      if (variant === "main_street" && (!industry || !intent)) { setError("Choose an industry and funding need."); return; }
      if (!/^\d{6}$/.test(roomPin)) { setError("Create a six-digit room PIN."); return; }
      if (roomPin !== roomPinConfirm) { setError("The room PIN entries do not match."); return; }
      setError(""); setStep(2); return;
    }
    if (step === 2) {
      if (!fullName.trim()) { setError("Client name is required."); return; }
      if (!email.trim() || !email.includes("@")) { setError("A valid client email is required."); return; }
      if (!phone.trim()) { setError("A client mobile number is required."); return; }
      if (!validPhone(phone)) { setError("That number does not look complete. Enter a 10-digit US mobile, or include the country code for an international number."); return; }
      if (!isRE && !businessName.trim()) { setError("Legal business name is required."); return; }
      setError(""); setStep(3); return;
    }
    if (step === 3) { setError(""); setStep(4); return; }
    void submit();
  }

  if (created) {
    const roomUrl = created.upload_url || "";
    const sent = created.room_delivery_status === "sent";
    return (
      <Drawer
        open
        onClose={onClose}
        width="md"
        title="Application room created"
        sub="The intake is open at Step 1. Share the room link and PIN through separate channels."
        footer={<><span className="sp" /><Btn variant="pri" onClick={onClose}>Continue to Step 1</Btn></>}
      >
        <div className="grid g12">
          <Callout tone={sent ? "ok" : created.room_delivery_status === "failed" ? "bad" : "acc"} icon={<Icon name={sent ? "check" : "alert"} size={16} />}>
            {created.room_delivery_detail || (sent ? "The room link was accepted by the email provider." : "The room was created without sending.")}
          </Callout>
          <div className="secure-room-created-grid">
            <div><span className="lbl">Room URL</span><b className="trunc">{roomUrl || "Unavailable"}</b><Btn disabled={!roomUrl} onClick={() => void navigator.clipboard.writeText(roomUrl)}><Icon name="copy" size={14} />Copy link</Btn></div>
            <div><span className="lbl">Room PIN</span><b className="secure-room-pin num">{roomPin}</b><Btn onClick={() => void navigator.clipboard.writeText(roomPin)}><Icon name="copy" size={14} />Copy PIN</Btn></div>
          </div>
          <Callout tone="warn">Do not place the PIN in the room-link email. Read it to the client or send it separately through an approved channel.</Callout>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={`Create AI intake · ${step === 1 ? "File type" : step === 2 ? "Client and entity" : step === 3 ? "Evidence" : "Review"}`}
      bodyClass="grid g10"
      footer={
        <>
          {step > 1 ? <Btn onClick={() => { setError(""); setStep((value) => value - 1); }} disabled={creating}>Back</Btn> : <Btn onClick={onClose} disabled={creating}>Cancel</Btn>}
          <span className="sp" />
          <Btn variant="pri" onClick={next} disabled={creating}>
            {creating ? <><Spinner /> Creating draft and uploading…</> : step === 4 ? "Create draft and open Step 1" : "Continue"}
          </Btn>
        </>
      }
    >
      <DrawerSteps steps={["File type", "Client and entity", "Evidence", "Review"]} current={step} />
      {step === 1 ? <>
        <p className="sub">Start with the file classification. This controls requirements, evidence, and program screening.</p>
        <div className="fldgrid two"><Field label="Lead type"><Select value={variant} onChange={(e) => setVariant(e.target.value as LeadVariant)}><option value="dealer">Dealer</option><option value="real_estate">Real estate</option><option value="main_street">Main Street (operating business)</option><option value="mca_refinance">MCA refinance</option></Select></Field><Field label="Preferred language"><Select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value as "en" | "es")}><option value="en">English</option><option value="es">Spanish</option></Select></Field></div>
      {isMS ? (
        <div className="fldgrid two">
          <Field label="Industry *">
            <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {MAIN_STREET_INDUSTRIES.map((i) => (
                <option key={i.slug} value={i.slug}>{i.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="What they need *">
            <Select value={intent} onChange={(e) => setIntent(e.target.value)}>
              {MAIN_STREET_INTENTS.map((i) => (
                <option key={i.slug} value={i.slug}>{i.label}</option>
              ))}
            </Select>
          </Field>
          <p className="sub" style={{ gridColumn: "1 / -1" }}>
            {LENDING_INTENTS.has(intent)
              ? "These decide the document checklist and which programs get screened, so they are worth getting right at creation."
              : "This is a qualification conversation, not a loan file — no documents will be requested and no fundability verdict is computed."}
          </p>
        </div>
      ) : null}</> : null}
      {step === 1 ? <div className="fldgrid two">
        <Field label="Six-digit room PIN *"><Input value={roomPin} onChange={(event) => setRoomPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="000000" /></Field>
        <Field label="Confirm room PIN *"><Input value={roomPinConfirm} onChange={(event) => setRoomPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="000000" /></Field>
        <p className="sub" style={{ gridColumn: "1 / -1" }}>The client enters this PIN in the application room. It cannot be recovered after creation; staff can rotate it later.</p>
      </div> : null}

      {step === 2 ? <>
        <p className="sub">The client and legal entity anchor ownership, private credit links, bank evidence, and the secure room.</p>
        <div className="fldgrid two"><Field label="Client full name *"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" /></Field><Field label="Personal email *"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" /></Field><Field label="Personal mobile *"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(973) 555-0148" /></Field>{!isRE ? <Field label="Legal business name *"><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business LLC" /></Field> : <Field label="Investor / entity name"><Input value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="Holdings LLC" /></Field>}</div>
      </> : null}

      {step === 3 && isRE ? (
        <div className="fldgrid two">
          <div style={{ gridColumn: "1 / -1" }}>
            <AddressInput
              label="Target property address"
              value={propertyAddress ? { full: propertyAddress } : null}
              onChange={(next) => setPropertyAddress(formatAddressParts(next))}
            />
          </div>
          <Field label="Transaction type">
            <Input value={transactionType} onChange={(e) => setTransactionType(e.target.value)} placeholder="purchase / refinance / cash-out" />
          </Field>
          <Field label="Estimated credit tier">
            <Input value={creditTier} onChange={(e) => setCreditTier(e.target.value)} placeholder="e.g. 700+" />
          </Field>
          <Field label="Requested amount ($)">
            <Input value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} inputMode="numeric" placeholder="500000" />
          </Field>
          <Field label="Property value / price ($)">
            <Input value={propertyValue} onChange={(e) => setPropertyValue(e.target.value)} inputMode="numeric" placeholder="800000" />
          </Field>
          <Field label="Monthly rent ($)">
            <Input value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} inputMode="numeric" placeholder="4500" />
          </Field>
        </div>
      ) : null}
      {step === 3 ? <>
        <input ref={evidencePicker} type="file" hidden multiple accept=".pdf,.csv,.xlsx,.xls,.zip,image/*" onChange={(event) => setEvidenceFiles(Array.from(event.target.files ?? []))} />
        <button type="button" className={cx("create-evidence-dropzone", dragging && "dragging")} onClick={() => evidencePicker.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setEvidenceFiles((rows) => [...rows, ...Array.from(event.dataTransfer.files)]); }}><Icon name="upload" size={24} /><b>Drop initial evidence here or click to browse</b><span>Upload multiple files or a ZIP. The draft opens immediately after creation while extraction continues in the background.</span></button>
        {evidenceFiles.length ? <div className="create-evidence-files">{evidenceFiles.map((file, index) => <div key={`${file.name}-${file.size}-${index}`}><Icon name="file" size={14} /><span className="grow trunc"><b className="trunc">{file.name}</b><small>{formatSize(file.size)}</small></span><IconBtn aria-label={`Remove ${file.name}`} title="Remove file" onClick={() => setEvidenceFiles((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={13} /></IconBtn></div>)}</div> : <Callout tone="mut">Evidence is optional during creation and can be uploaded later from the file header.</Callout>}
      </> : null}
      {step === 4 ? <>
        <div className="create-intake-review"><div><span>File type</span><b>{variantLabel(variant)}</b></div><div><span>Client</span><b>{fullName || "Not entered"}</b></div><div><span>Entity</span><b>{isRE ? investorName || "Not entered" : businessName || "Not entered"}</b></div><div><span>Primary email</span><b>{email || "Not entered"}</b></div></div>
        <Callout tone="acc" icon={<Icon name="arrowR" size={16} />}>The file opens at Step 1 for ownership. Uploaded evidence is analyzed independently; owner credit and LLC banking each retain their own readiness state.</Callout>
        <div className="line"><span className="sub">Initial evidence</span><strong>{evidenceFiles.length ? `${evidenceFiles.length} file${evidenceFiles.length === 1 ? "" : "s"}` : "None yet"}</strong></div>
        <label className={cx("pick", notifyClient && "on")}><input type="checkbox" checked={notifyClient} onChange={(e) => setNotifyClient(e.target.checked)} />Email the secure application-room link now</label>
      </> : null}

      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    </Drawer>
  );
}

function Stat({ title, value, sub, good, warn }: { title: string; value: string; sub: string; good?: boolean; warn?: boolean }) {
  return (
    <div className="kpi">
      <div className="lbl">{title}</div>
      {/* Tone is data-derived (good / warn), so it stays an inline value. */}
      <div className="knum num" style={good ? { color: "var(--ok)" } : warn ? { color: "var(--warn)" } : undefined}>{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

// `t` and `style` are still accepted (and ignored) so existing call sites keep
// compiling; the button is now the shared `.btn.sm.iconbtn`.
function CopyIconButton({ onCopy, disabled, style }: { t?: unknown; onCopy: () => void; disabled?: boolean; style?: CSSProperties }) {
  return (
    <IconBtn
      onClick={onCopy}
      disabled={disabled}
      title="Copy"
      aria-label="Copy"
      style={style}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </IconBtn>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 13,
        height: 13,
        borderRadius: 999,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        verticalAlign: "-2px",
        marginRight: 6,
        animation: "qc-spin 0.7s linear infinite",
      }}
    >
      <style>{"@keyframes qc-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <Panel title={title}>{children}</Panel>;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="sub">{label}</span>
      <b style={{ overflowWrap: "anywhere" }}>{value}</b>
    </div>
  );
}

function CompactList({ rows, empty }: { rows: Array<{ title: string; body: string }>; empty: string }) {
  if (!rows.length) return <div className="sub">{empty}</div>;
  return (
    <div className="grid g8">
      {rows.slice(0, 10).map((row, index) => (
        <div key={`${row.title}-${index}`} className="grid g4">
          <strong>{row.title}</strong>
          <span className="sub">{row.body}</span>
        </div>
      ))}
    </div>
  );
}

// The lead list is a grid of <button> rows rather than a <table>: each row has
// to stay focusable and Enter-activatable, which a <tr onClick> is not. The
// column track is bespoke, so it stays an inline value.
// minmax(0,…) on the text columns so they shrink + ellipsize instead of forcing
// horizontal overflow when the sidebar is expanded / on smaller screens (a
// fixed floor here clipped the name column).
const LEAD_COLS = "minmax(0,1.3fr) minmax(0,1fr) minmax(120px,150px) minmax(0,1.3fr) 90px 122px";

function rowStyle(active: boolean) {
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

function probabilityTone(value?: string | null): ChipTone {
  if (value === "Good probability - book call") return "ok";
  if (value === "Poor probability based on current file") return "bad";
  if (value === "Promising but needs one clarification") return "warn";
  return "mut";
}

function variantLabel(value?: string | null) {
  if (value === "real_estate_dscr_v1") return "Real estate";
  if (value === "dealer_gatekeeper_v1") return "Dealer";
  if (value === "mca_refi_v1") return "MCA refinance";
  if (value === "main_street_v1") return "Main Street";
  if (value === "commercial_foreclosure_bailout_v1") return "Foreclosure rescue";
  return "AI review";
}

function programVerticalForVariant(value?: string | null): "real_estate" | "dealer" | "main_street" | "mca" {
  const variant = String(value || "").toLowerCase();
  if (variant.includes("mca")) return "mca";
  if (variant.includes("dealer")) return "dealer";
  if (variant.includes("real_estate") || variant.includes("funding_review") || variant.includes("foreclosure")) return "real_estate";
  return "main_street";
}

function artifactVersion(artifact: Artifact, fallback = 1): number {
  const value = Number(artifact.version);
  return Number.isFinite(value) && value > 0 ? value : Math.max(1, fallback);
}

function artifactBucketFileId(artifact: Artifact): string | null {
  const value = artifact.bucket_file_id;
  return typeof value === "string" && value ? value : null;
}

function artifactSha(artifact: Artifact): string | null {
  const value = artifact.sha256;
  return typeof value === "string" && value ? value : null;
}

function artifactList(artifact: Artifact, key: string): string[] {
  const value = asRecord(artifact.body_json)?.[key];
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : String(asRecord(item)?.label || asRecord(item)?.value || "")).filter(Boolean);
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function PackageArtifactCard({ artifact, label, description, version, current, bucketSynced }: { artifact: Artifact; label: string; description: string; version: number; current: boolean; bucketSynced: boolean }) {
  const sha = artifactSha(artifact);
  const previewUrl = artifact.preview_url || artifact.download_url;
  return <article className="package-document-card">
    <div className="package-document-icon"><Icon name="docCheck" size={20} /></div>
    <div className="package-document-copy"><div><span className="lbl">{label}</span><CellChip tone={current ? "ok" : "mut"}>{current ? "Current" : "Superseded"}</CellChip></div><strong>{artifact.title}</strong><p>{description}</p><small>v{version} · {formatDateTime(artifact.created_at)} · {bucketSynced ? "Synced to bucket" : "Legacy artifact"}{sha ? ` · ${sha.slice(0, 10)}…` : ""}</small></div>
    <div className="package-document-actions">{previewUrl ? <><a href={previewUrl} target="_blank" rel="noreferrer" className="btn sm"><Icon name="eye" size={14} />Preview</a>{artifact.download_url ? <a href={artifact.download_url} target="_blank" rel="noreferrer" className="btn sm iconbtn" title={`Download ${label}`} aria-label={`Download ${label}`}><Icon name="download" size={14} /></a> : null}</> : <CellChip tone="warn">PDF unavailable</CellChip>}</div>
  </article>;
}

function PackageVersionList({ label, artifacts }: { label: string; artifacts: Artifact[] }) {
  return <section className="package-version-list"><header><span className="lbl">{label}</span><strong>{artifacts.length ? `${artifacts.length} version${artifacts.length === 1 ? "" : "s"}` : "Not generated"}</strong></header>{artifacts.length ? artifacts.map((artifact, index) => {
    const version = artifactVersion(artifact, artifacts.length - index);
    const previewUrl = artifact.preview_url || artifact.download_url;
    const current = index === 0 && artifact.status !== "superseded";
    return <div className="package-version-row" key={artifact.id}><div><CellChip tone={current ? "ok" : "mut"}>{current ? "Current" : "Superseded"}</CellChip><span><strong>Version {version}</strong><small>{formatDateTime(artifact.created_at)}{artifactBucketFileId(artifact) ? " · Bucket PDF" : " · Legacy artifact"}</small></span></div>{previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer" className="btn sm iconbtn" title={`Preview ${label} version ${version}`} aria-label={`Preview ${label} version ${version}`}><Icon name="eye" size={14} /></a> : null}</div>;
  }) : <div className="empty">No PDF versions yet.</div>}</section>;
}

function UnderwriterDigest({ artifact }: { artifact: Artifact }) {
  const body = asRecord(artifact.body_json) || {};
  const rawMetrics = body.key_metrics;
  const metrics = Array.isArray(rawMetrics)
    ? rawMetrics.map((item) => {
      const row = asRecord(item);
      return row ? { label: String(row.label || "Metric"), value: String(row.value || "—"), note: String(row.note || "") } : null;
    }).filter((item): item is { label: string; value: string; note: string } => Boolean(item))
    : Object.entries(asRecord(rawMetrics) || {}).map(([label, value]) => ({ label: label.replaceAll("_", " "), value: String(value || "—"), note: "" }));
  const risks = artifactList(artifact, "risks").slice(0, 4);
  const mitigants = artifactList(artifact, "mitigants").slice(0, 4);
  const nextAction = typeof body.next_best_action === "string" ? body.next_best_action : null;
  if (!metrics.length && !risks.length && !mitigants.length && !nextAction) return null;
  return <section className="underwriter-digest"><header><div><span className="lbl">Decision view</span><h3>Underwriter highlights</h3></div><span className="sub">The full narrative and schedules remain in the PDFs.</span></header>{metrics.length ? <div className="underwriter-metrics">{metrics.slice(0, 6).map((metric, index) => <div key={`${metric.label}:${index}`}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.note ? <small>{metric.note}</small> : null}</div>)}</div> : null}<div className="underwriter-watch-grid">{mitigants.length ? <div><span className="lbl">Strengths / mitigants</span><ul>{mitigants.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{risks.length ? <div><span className="lbl">Risks / watchpoints</span><ul>{risks.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}</div>{nextAction ? <div className="underwriter-next-action"><Icon name="arrowR" size={15} /><span><small>Next best action</small><strong>{nextAction}</strong></span></div> : null}</section>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMoney(value?: number | null) {
  if (value == null) return "—";
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : `$${Math.round(value).toLocaleString()}`;
}

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
