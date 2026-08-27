"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
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
import { AddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { LENDING_INTENTS, MAIN_STREET_INDUSTRIES, MAIN_STREET_INTENTS } from "@/lib/intakeIndustries";
import { Icon } from "@/components/design-system/Icon";
import { TypingDots } from "@/components/design-system/TypingDots";
import { api, ApiError } from "@/lib/api";

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
import { Role } from "@/lib/enums.generated";
import { useCurrentUser, useBookingLink, useDriveFiles, useUnifiedOperatorFiles, type DriveFile } from "@/hooks/useApi";
import { LeadCockpit, type LeadCockpitAdapter, type ClientThreadMessage } from "@/components/admin/LeadCockpit";
import { LeadCreditPanel } from "@/components/admin/LeadCreditPanel";
import { LeadContractsPanel } from "@/components/admin/LeadContractsPanel";
import { LeadProgramFitPanel } from "@/components/admin/LeadProgramFitPanel";
import { LeadDscrPanel } from "@/components/admin/LeadDscrPanel";
import { WhatsNewButton, WhatsNewRail } from "@/components/admin/WhatsNewRail";
import { BankerSubmissionModal } from "@/components/admin/BankerSubmissionModal";
import { useAIReview } from "@/components/admin/AIReviewProvider";
import { IntakeEvidenceBrowser } from "@/components/admin/IntakeEvidenceBrowser";
import { ApplicationVerificationWorkspace } from "@/components/application/ApplicationVerificationWorkspace";
import { ApplicationClassificationPanel } from "@/components/application/ApplicationClassificationPanel";
import { ApplicationIntelligencePanel } from "@/components/application/ApplicationIntelligencePanel";
import { ExtractedFactsReview } from "@/components/application/ExtractedFactsReview";
import { ApplicationAuditTimeline } from "@/components/application/ApplicationAuditTimeline";
import { UnifiedThreadConversation } from "@/components/communications/UnifiedThreadConversation";
import { LeadNotesPanel, type LeadNote } from "@/components/broker/LeadNotesPanel";
import { BucketIntakeLinkDrawer } from "@/components/operator/UnifiedOperator";
import type { IntakeResponse } from "@/lib/intake";
import { PIPELINE_LIFECYCLE, originTone, underwritingStatusLabel, verticalTone, type UnderwritingLifecycleStatus } from "@/lib/unifiedOperator";
import type { ApplicationProfile, ApplicationUnderwritingPatch, ApplicationUnderwritingState, FileOwnerRequirementState } from "@/lib/applicationProfile";

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
  created_at: string;
};

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
  approved_amount: string;
  term_sheet_amount: string;
  current_dscr: string;
  target_dscr: string;
  approved_dscr: string;
  reviewer_notes: string;
};

type Artifact = {
  id: string;
  intake_id: string;
  artifact_type: string;
  title: string;
  body_text?: string | null;
  body_json?: Record<string, unknown> | null;
  s3_key?: string | null;
  download_url?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
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
  { value: "completed", label: "Completed" },
];

const VARIANT_FILTERS = [
  { value: "all", label: "All reviews" },
  { value: "dealer", label: "Dealer" },
  { value: "real_estate", label: "Real estate" },
  // Raw slugs pass straight through the backend's variant_filter else-branch.
  { value: "mca_refi_v1", label: "MCA refinance" },
];

const LIMIT = 25;

function presentContact(value?: string | null): string {
  return value?.trim() || "Not provided";
}

function emptyUnderwritingDraft(): UnderwritingDraft {
  return {
    underwriting_status: "submitted",
    approved_amount: "",
    term_sheet_amount: "",
    current_dscr: "",
    target_dscr: "",
    approved_dscr: "",
    reviewer_notes: "",
  };
}

function underwritingDraftFromState(state: ApplicationUnderwritingState | null): UnderwritingDraft {
  if (!state) return emptyUnderwritingDraft();
  return {
    underwriting_status: state.underwriting_status,
    approved_amount: state.approved_amount == null ? "" : String(state.approved_amount),
    term_sheet_amount: state.term_sheet_amount == null ? "" : String(state.term_sheet_amount),
    current_dscr: state.current_dscr == null ? "" : String(state.current_dscr),
    target_dscr: state.target_dscr == null ? "" : String(state.target_dscr),
    approved_dscr: state.approved_dscr == null ? "" : String(state.approved_dscr),
    reviewer_notes: state.reviewer_notes || "",
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
  const { getToken } = useAuth();
  const { requestReview, isReviewing } = useAIReview();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { data: unifiedFiles } = useUnifiedOperatorFiles({ limit: 500 });
  const leadParam = searchParams.get("lead");
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [variantFilter, setVariantFilter] = useState("all");
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
  const [leadDetailMinimized, setLeadDetailMinimized] = useState(false);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadLeads(nextOffset = offset) {
    setLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(nextOffset),
        status_filter: statusFilter,
        probability_status: probabilityFilter,
        variant_filter: variantFilter,
      });
      if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
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
      const res = await call<LeadDetail>("/admin/ai-underwriter-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const profile = await call<ApplicationProfile>("/application-profiles/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_kind: "intake", source_id: res.intake.id }) });
      await call(`/application-profiles/${profile.id}/draft`, { method: "POST" });
      let uploaded = 0;
      for (const file of evidenceFiles) {
        const init = await call<{ file_id: string; upload_url: string; required_headers: Record<string, string> }>(`/admin/ai-underwriter-leads/${res.intake.id}/files/upload-init`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requested_document_id: null, file_name: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size }) });
        const upload = await fetch(init.upload_url, { method: "PUT", headers: init.required_headers, body: file });
        if (!upload.ok) throw new Error(`${file.name} could not be uploaded. The draft was preserved.`);
        await call(`/admin/ai-underwriter-leads/${res.intake.id}/files/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: init.file_id }) });
        uploaded += 1;
      }
      if (uploaded) setNotice(`${uploaded} evidence file${uploaded === 1 ? "" : "s"} uploaded. Extraction continues in the background.`);
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
      setNotice(error instanceof Error ? error.message : "Could not create the lead.");
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

  async function postLeadNote(id: string, content: string) {
    await call(`/admin/ai-underwriter-leads/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
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

  async function confirmLeadDeletion(id: string, confirmName: string) {
    await call(`/admin/ai-underwriter-leads/${id}/confirm-deletion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_name: confirmName }),
    });
    // The lead no longer exists — close the modal and splice it out of the
    // local list immediately rather than waiting on a full reload.
    setRows((current) => current.filter((row) => row.id !== id));
    closeLead();
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
      files: detail.files,
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
      loadClientThread: () => call<{ messages: Array<{ id: string; role: string; author_name?: string | null; content: string; created_at: string }> }>(`${base}/client-thread`),
      replyClientThread: (message: string) => post<{ messages: Array<{ id: string; role: string; author_name?: string | null; content: string; created_at: string }> }>("/client-thread/reply", { message }),
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
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN) loadLeads(0).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role, statusFilter, variantFilter, probabilityFilter, submittedQuery]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN && leadParam && leadParam !== selectedId) {
      openLead(leadParam).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role, leadParam]);

  const counts = useMemo(() => ({
    total,
    good: rows.filter((row) => row.probability_status === "Good probability - book call").length,
    booked: rows.filter((row) => row.call_booked).length,
    missing: rows.reduce((sum, row) => sum + row.missing_required_count, 0),
  }), [rows, total]);
  const unifiedByIntake = useMemo(() => new Map(
    (unifiedFiles?.items ?? []).filter((file) => file.intake_id).map((file) => [file.intake_id as string, file]),
  ), [unifiedFiles]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSubmittedQuery(query);
  }

  if (me && me.role !== Role.SUPER_ADMIN) return null;

  const activeLeadId = selectedId;
  const activeLeadTitle = detail?.intake.business_name || detail?.intake.full_name || "AI intake file";
  const selectedLeadPanel = activeLeadId ? (
    <LeadDetailPanel
      detail={detail}
      loading={detailLoading}
      initialNotesOpen={searchParams.get("notes") === "1"}
      onClose={closeLead}
      onMinimize={() => setLeadDetailMinimized(true)}
      onExport={() => exportPdf(activeLeadId)}
      onGenerateSummary={() => generateExecutiveSummary(activeLeadId)}
      onGeneratePacket={() => generateLenderPacket(activeLeadId)}
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
      onPostNote={(content) => postLeadNote(activeLeadId, content)}
      onUpdateOutcomeStatus={(status) => updateOutcomeStatus(activeLeadId, status)}
      onUpdateLanguage={(language) => updateLeadLanguage(activeLeadId, language)}
      onUpdateContact={(payload) => updateLeadContact(activeLeadId, payload)}
      onCancelDeletionRequest={() => cancelLeadDeletionRequest(activeLeadId)}
      onConfirmDeletion={(confirmName) => confirmLeadDeletion(activeLeadId, confirmName)}
    />
  ) : null;

  const leadOverlays = (
    <>
      <BucketIntakeLinkDrawer
        open={linkLead !== null}
        onClose={() => setLinkLead(null)}
        initialBucketId={linkLead?.bucket_id}
        initialIntakeId={linkLead?.id}
        title="Link AI intake to bucket"
      />

    </>
  );

  return (
    <>
    <div className={cx("ai-intake-list-shell", selectedLeadPanel && !leadDetailMinimized && "workspace-hidden")} style={{ height: "calc(100dvh - 105px)", maxWidth: 1480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflow: "hidden" }}>
      <div className="ckhead" style={{ flexShrink: 0 }}>
        <div className="ckrow">
          <h1>AI intake</h1>
          <CellChip tone="mut">{counts.total} files</CellChip>
          <span className="sp" />
          <span className="sub">Every file on the board, seen from Elara&apos;s side. Same records, same refs.</span>
          <Btn variant="pri" size="sm" onClick={() => setCreateOpen(true)}><Icon name="plus" size={13} /> Create intake</Btn>
          <PageActionMenu label="AI intake actions" items={[
            { label: "What changed", onSelect: () => setWhatsNewOpen(true) },
            { label: "Open document buckets", href: "/admin/buckets" },
          ]} />
        </div>
        <div className="cktabs" role="tablist" aria-label="AI intake vertical">
          {VARIANT_FILTERS.map((item) => <button type="button" role="tab" aria-selected={variantFilter === item.value} className={variantFilter === item.value ? "on" : undefined} key={item.value} onClick={() => { setOffset(0); setVariantFilter(item.value); }}>{item.label}</button>)}
        </div>
      </div>

      <div className="kpis" style={{ flexShrink: 0 }}>
        <Stat title="Total leads" value={String(counts.total)} sub="all matching filters" />
        <Stat title="Good probability" value={String(counts.good)} sub="visible page" good />
        <Stat title="Booked calls" value={String(counts.booked)} sub="visible page" />
        <Stat title="Missing items" value={String(counts.missing)} sub="visible page" warn />
      </div>

      <div className="panel" style={{ flexShrink: 0 }}>
        <form className="panel-h" onSubmit={submitSearch} style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 210px 250px auto", gap: 10, alignItems: "center" }}>
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
          <Btn type="submit" variant="pri">Search</Btn>
        </form>
      </div>

      {notice ? <WarnLine>{notice}</WarnLine> : null}

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr", gap: 14, alignItems: "stretch", overflow: "hidden" }}>
        <div className="panel" style={{ minHeight: 0 }}>
          <div className="tblwrap" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <table className="tbl">
              <thead><tr><th>File</th><th>Contact</th><th>Opened by</th><th>Referral</th><th>Vertical</th><th>Probability</th><th>Status</th><th>Evidence</th><th>Missing</th><th className="r" /></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={10}><div className="empty">Loading AI intake...</div></td></tr> : rows.map((row) => {
                  const unified = unifiedByIntake.get(row.id);
                  return (
                    <tr key={row.id} onClick={() => openLead(row.id)} className={selectedId === row.id ? "tone-acc" : undefined}>
                      <td className="lead-file-cell">
                        <button type="button" className="linky" onClick={() => openLead(row.id)}>{row.business_name || row.full_name}</button>
                        <div className="sub num">{unified?.ref || row.id.slice(0, 8)}</div>
                        {row.business_name ? <div className="sub">Owner: {row.full_name}</div> : null}
                      </td>
                      <td className="lead-contact-cell">
                        <div className="lead-contact-line">{presentContact(row.email)}</div>
                        <div className="lead-contact-line sub">{presentContact(row.phone)}</div>
                      </td>
                      <td><CellChip tone={unified ? originTone(unified.origin) : "mut"}>{row.opened_by_name || unified?.rep_name || unified?.origin_label || "House desk"}</CellChip><div className="sub">{row.opened_by_role || unified?.case_ref || "Internal"}</div></td>
                      <td className="sub">{row.referral_source || unified?.dealer_name || "Direct"}</td>
                      <td><CellChip tone={unified ? verticalTone(unified.vertical) : "acc"}>{unified?.vertical_label || variantLabel(row.variant)}</CellChip></td>
                      <td><CellChip tone={probabilityTone(row.probability_status)}>{row.probability_status || "Awaiting review"}</CellChip></td>
                      <td><CellChip tone={row.status === "completed" ? "ok" : row.status === "reviewing" ? "acc" : "warn"}>{row.status}</CellChip></td>
                      <td><button type="button" className="cellchip c-pet" onClick={(event) => { event.stopPropagation(); setLinkLead(row); }}>{row.file_count} files · {row.bucket_name || "Bucket"}</button></td>
                      <td className="num">{row.missing_required_count}</td>
                      <td className="r"><Btn size="sm" onClick={(event) => { event.stopPropagation(); openLead(row.id); }}>Open</Btn></td>
                    </tr>
                  );
                })}
                {!loading && !rows.length ? <tr><td colSpan={10}><div className="empty">No AI intake files match these filters.</div></td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ flexShrink: 0, padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
            <span className="sub">{total ? `${offset + 1}-${Math.min(offset + LIMIT, total)} of ${total}` : "0 leads"}</span>
            <span className="sp" />
            <Btn disabled={offset === 0 || loading} onClick={() => loadLeads(Math.max(0, offset - LIMIT))}>Previous</Btn>
            <Btn disabled={offset + LIMIT >= total || loading} onClick={() => loadLeads(offset + LIMIT)}>Next</Btn>
          </div>
        </div>

      </div>

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

      {createOpen ? (
        <CreateLeadModal
          onClose={() => setCreateOpen(false)}
          onCreate={createLead}
          creating={creating}
        />
      ) : null}
    </div>
    {selectedLeadPanel ? (
      <div className={cx("ai-intake-detail-shell", leadDetailMinimized && "workspace-minimized")} aria-hidden={leadDetailMinimized}>
        {notice ? <WarnLine>{notice}</WarnLine> : null}
        {selectedLeadPanel}
      </div>
    ) : null}
    {selectedLeadPanel && leadDetailMinimized ? (
      <div className="workspace-minimized-dock" role="status" aria-live="polite">
        <button type="button" className="workspace-minimized-summary" onClick={() => setLeadDetailMinimized(false)}>
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
  onClose,
  onMinimize,
  onExport,
  onGenerateSummary,
  onGeneratePacket,
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
  onClose: () => void;
  onMinimize: () => void;
  onExport: () => void;
  onGenerateSummary: () => Promise<void> | void;
  onGeneratePacket: () => Promise<void> | void;
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
  onPostNote: (content: string) => Promise<void>;
  onUpdateOutcomeStatus: (status: string) => Promise<void>;
  onUpdateLanguage: (language: string) => Promise<void>;
  onUpdateContact: (payload: LeadContactUpdate) => Promise<void>;
  onCancelDeletionRequest: () => Promise<void>;
  onConfirmDeletion: (confirmName: string) => Promise<void>;
}) {
  const toast = useToast();
  const { getToken } = useAuth();
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
  const [prototypeView, setPrototypeView] = useState<"workspace" | "communications" | "underwriting" | "audit">("workspace");
  const [communicationChannel, setCommunicationChannel] = useState<"underwriter" | "client" | "partner" | "internal">("underwriter");
  const [submissionStep, setSubmissionStep] = useState(1);
  const [contextRailOpen, setContextRailOpen] = useState(false);
  const [packageTab, setPackageTab] = useState<"summary" | "package" | "delivery">("summary");
  const headerUploadRef = useRef<HTMLInputElement>(null);
  const evidenceUploadRef = useRef<HTMLInputElement>(null);
  const initializedLeadIdRef = useRef<string | null>(null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [evidenceDragging, setEvidenceDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [profileVerification, setProfileVerification] = useState<FileOwnerRequirementState | null>(null);
  const [underwriting, setUnderwriting] = useState<ApplicationUnderwritingState | null>(null);
  const [underwritingDraft, setUnderwritingDraft] = useState<UnderwritingDraft>(() => emptyUnderwritingDraft());
  const [underwritingLoading, setUnderwritingLoading] = useState(false);
  const [underwritingSaving, setUnderwritingSaving] = useState(false);
  const [underwritingError, setUnderwritingError] = useState<string | null>(null);
  const [sendReviewOpen, setSendReviewOpen] = useState(false);
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
  const result = detail?.latest_review?.result || detail?.intake.result_snapshot || null;
  const evidence = asRecord(result?.document_evidence_map);
  const missing = arrayOfRecords(result?.missing_or_incomplete_items);
  const strengths = arrayOfStrings(result?.strengths);
  const risks = arrayOfStrings(result?.risks);
  const artifacts = detail?.artifacts || [];
  const summary = artifacts.find((artifact) => artifact.artifact_type === "executive_summary");
  const packet = artifacts.find((artifact) => artifact.artifact_type === "lender_packet");
  const prequalification = artifacts.find((artifact) => artifact.artifact_type === "prequalification");
  const isRealEstate = detail?.intake.variant === "real_estate_dscr_v1";

  async function loadUnderwritingState() {
    if (!detail || !canUnderwrite) {
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
        body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }),
      });
      const state = await api<ApplicationUnderwritingState>(`/application-profiles/${profile.id}/underwriting`, {
        authToken: authToken ?? undefined,
      });
      setUnderwriting(state);
      setUnderwritingDraft(underwritingDraftFromState(state));
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Underwriting state could not be loaded."));
    } finally {
      setUnderwritingLoading(false);
    }
  }

  async function saveUnderwritingPatch(patch: ApplicationUnderwritingPatch) {
    if (!detail || !canUnderwrite) return;
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
      const statusChanged = patch.underwriting_status && patch.underwriting_status !== underwriting?.underwriting_status;
      if (statusChanged) {
        await api(`/operator-files/intake/${detail.intake.id}/pipeline-move`, {
          method: "POST",
          authToken: authToken ?? undefined,
          body: JSON.stringify({
            target_status: patch.underwriting_status,
            expected_status: underwriting?.underwriting_status ?? "submitted",
            note: patch.reviewer_notes || undefined,
          }),
        });
      }
      const remainingPatch = { ...patch };
      if (statusChanged) delete remainingPatch.underwriting_status;
      const updated = Object.keys(remainingPatch).length
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
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Underwriting could not be saved."));
      toast.show(apiErrorMessage(reason, "Underwriting could not be saved."));
    } finally {
      setUnderwritingSaving(false);
    }
  }

  function saveUnderwritingDraft() {
    void saveUnderwritingPatch({
      underwriting_status: underwritingDraft.underwriting_status,
      approved_amount: numberOrNull(underwritingDraft.approved_amount),
      term_sheet_amount: numberOrNull(underwritingDraft.term_sheet_amount),
      current_dscr: numberOrNull(underwritingDraft.current_dscr),
      target_dscr: numberOrNull(underwritingDraft.target_dscr),
      approved_dscr: numberOrNull(underwritingDraft.approved_dscr),
      reviewer_notes: underwritingDraft.reviewer_notes.trim() || null,
    });
  }

  function changeUnderwritingStatus(statusValue: UnderwritingLifecycleStatus) {
    setUnderwritingDraft((current) => ({ ...current, underwriting_status: statusValue }));
    void saveUnderwritingPatch({ underwriting_status: statusValue, reviewer_notes: underwritingDraft.reviewer_notes.trim() || null });
  }

  useEffect(() => {
    void loadUnderwritingState();
  }, [detail?.intake.id, canUnderwrite]);

  useEffect(() => {
    if (!detail) {
      initializedLeadIdRef.current = null;
      return;
    }
    if (initializedLeadIdRef.current === detail.intake.id) return;
    initializedLeadIdRef.current = detail.intake.id;
    const rows = detail.artifacts ?? [];
    if (rows.some((item) => item.artifact_type === "lender_packet")) setSubmissionStep(5);
    else if (detail.latest_review?.status === "completed" || detail.intake.status === "reviewed") setSubmissionStep(4);
    else if (detail.files.length) setSubmissionStep(3);
    else setSubmissionStep(1);
    setPrototypeView("workspace");
    setCommunicationChannel("underwriter");
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
  }, [detail]);

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

  async function postNote(content: string) {
    setNotesPosting(true);
    setNotesError(null);
    try {
      await onPostNote(content);
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

  async function uploadFromHeader(files: File[]) {
    if (!cockpitAdapter || !files.length) return;
    setHeaderUploading(true);
    setUploadStatus(`Preparing ${files.length} file${files.length === 1 ? "" : "s"}...`);
    try {
      for (const [index, file] of files.entries()) {
        setUploadStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
        const init = await cockpitAdapter.uploadInit({ requested_document_id: null, file_name: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size });
        const response = await fetch(init.upload_url, { method: "PUT", body: file, headers: init.required_headers });
        if (!response.ok) throw new Error(`${file.name} could not be uploaded.`);
        await cockpitAdapter.uploadComplete(init.file_id);
      }
      setUploadStatus("Refreshing evidence...");
      const response = await cockpitAdapter.reload();
      onCockpitResponse(response);
      setSubmissionStep(2);
      setPrototypeView("workspace");
      toast.show(`${files.length} file${files.length === 1 ? "" : "s"} uploaded`);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setHeaderUploading(false);
      setUploadStatus("");
      if (headerUploadRef.current) headerUploadRef.current.value = "";
      if (evidenceUploadRef.current) evidenceUploadRef.current.value = "";
    }
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
      if (cockpitAdapter) onCockpitResponse(await cockpitAdapter.reload());
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
  const hasEvidence = Boolean(detail?.files.length);
  const evidenceComplete = hasEvidence && (requiredDocs.length === 0 || requiredUploaded === requiredDocs.length);
  const reviewComplete = detail?.latest_review?.status === "completed" || detail?.intake.status === "reviewed";
  const reviewActive = detail ? rerunning || ["queued", "running"].includes(detail.latest_review?.status || "") : false;
  const sentCount = detail?.email_sends?.filter((send) => !send.ses_error).length ?? 0;
  const workflowSteps: Array<{ id: number; label: string; sub: string; status: "not-started" | "partial" | "complete" }> = [
    { id: 1, label: "Profile & ownership", sub: "Identity, owners and allocation", status: profileVerification?.ready_for_step_2 ? "complete" : profileVerification?.owner_count ? "partial" : "not-started" },
    { id: 2, label: "Evidence", sub: "Rooms, files and extraction", status: evidenceComplete ? "complete" : hasEvidence ? "partial" : "not-started" },
    { id: 3, label: "Owner credit", sub: "Individual 20%+ iSoftPulls", status: profileVerification?.owner_credit_complete ? "complete" : profileVerification?.completed_credit_owner_count || profileVerification?.ready_for_step_2 ? "partial" : "not-started" },
    { id: 4, label: "Business banking", sub: "Client Plaid or statement evidence", status: profileVerification?.business_banking_complete ? "complete" : profileVerification?.bank_connection_count || profileVerification?.bank_statement_months ? "partial" : "not-started" },
    { id: 5, label: "AI review", sub: "Probability, coverage and DSCR", status: reviewComplete ? "complete" : reviewActive || hasEvidence ? "partial" : "not-started" },
    { id: 6, label: "Package readiness", sub: "Summary, package and delivery", status: sentCount > 0 ? "complete" : packet || summary ? "partial" : "not-started" },
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
          </Row>
          <div className="sub">
            {detail ? `${variantLabel(detail.intake.variant)} · ${detail.intake.referral_source || "Direct"} · ${detail.intake.email}` : "Loading file..."}
          </div>
        </div>
        <span className="sp" />
        {detail ? (
          <Btn variant="pri" onClick={submissionStep === 2 ? onLinkBucketIntake : submissionStep === 5 ? onRerun : submissionStep === 6 ? () => { setPackageTab("package"); setBusy("packet"); Promise.resolve(onGeneratePacket()).finally(() => setBusy("")); } : () => setPrototypeView("workspace")} disabled={busy !== "" || rerunning}>
            {submissionStep === 2 ? "Attach evidence" : submissionStep === 5 ? (rerunning ? "Reviewing..." : "Run AI review") : submissionStep === 6 ? "Build lender package" : submissionStep === 4 ? "Open business banking" : submissionStep === 3 ? "Open owner credit" : "Open ownership"}
          </Btn>
        ) : null}
        <input ref={headerUploadRef} type="file" hidden multiple accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp,.heic" onChange={(event) => void uploadFromHeader(Array.from(event.target.files ?? []))} />
        {detail ? <Btn disabled={headerUploading || !cockpitAdapter} onClick={() => headerUploadRef.current?.click()}><Icon name="upload" size={14} />{headerUploading ? "Uploading..." : "Upload"}</Btn> : null}
        {detail ? <Btn onClick={openDocumentRequest}><Icon name="send" size={14} />Request</Btn> : null}
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
        {detail ? <Select value={detail.intake.preferred_language} disabled={languageBusy} onChange={(event) => changeLanguage(event.target.value)} aria-label="Client language"><option value="en">English</option><option value="es">Español</option></Select> : null}
        <PageActionMenu items={[
          { label: "Open underwriting chat", onSelect: () => { setPrototypeView("communications"); setCommunicationChannel("underwriter"); }, hidden: !detail },
          { label: "View client conversation", onSelect: () => { setPrototypeView("communications"); setCommunicationChannel("client"); }, hidden: !detail },
          { label: "Attach another bucket", onSelect: onLinkBucketIntake, hidden: !detail },
          { label: "Rotate room PIN", onSelect: openRotatePin, hidden: !detail },
          { label: "Dealer partner messages", onSelect: () => { setPrototypeView("communications"); setCommunicationChannel("partner"); }, hidden: !detail },
          { label: "Delete lead", onSelect: () => setConfirmDeleteOpen(true), tone: "danger", hidden: !detail },
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
              ["communications", "Communications"],
              ["audit", "Audit trail"],
            ].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={prototypeView === id} className={prototypeView === id ? "on" : undefined} onClick={() => setPrototypeView(id as typeof prototypeView)}>{label}</button>
            ))}
          </div>

          <div className={cx(
            "intake-file-body",
            "with-sequence",
            !contextRailOpen && "context-collapsed",
          )}>
            <aside className="submission-rail">
              <Panel title="Submission sequence" sub={`Step ${submissionStep} of 6`}>
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

            <main className="grid intake-file-primary">
              {prototypeView === "workspace" && submissionStep === 1 ? <ApplicationVerificationWorkspace sourceKind="intake" sourceId={detail.intake.id} mode="owners" onReadyForStep2={() => setSubmissionStep(2)} onStateChange={setProfileVerification} /> : null}
              {prototypeView === "workspace" && submissionStep === 2 ? (
                <Panel title="Evidence and data sources" sub="Navigate every accessible file without leaving the intake." actions={<Row><Btn onClick={() => setIngestPickerOpen(true)}>Add from Drive</Btn><Btn variant="pri" onClick={onLinkBucketIntake}>Attach another bucket</Btn></Row>}>
                  <div className="source-room"><div><CellChip tone="acc">Primary bucket</CellChip><strong>{detail.intake.bucket_name || detail.intake.business_name || "Primary bucket"}</strong><span className="sub">{detail.files.length} primary files · supporting links are counted below</span></div><Link href={`/admin/buckets?bucket=${detail.intake.bucket_id}`} className="btn">Open bucket</Link></div>
                  <input
                    ref={evidenceUploadRef}
                    type="file"
                    hidden
                    multiple
                    aria-label="Upload evidence files"
                    accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp,.heic"
                    onChange={(event) => void uploadFromHeader(Array.from(event.target.files ?? []))}
                  />
                  <button
                    type="button"
                    className={cx("intake-evidence-dropzone", evidenceDragging && "dragging")}
                    disabled={headerUploading || !cockpitAdapter}
                    onClick={() => evidenceUploadRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (!headerUploading) setEvidenceDragging(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEvidenceDragging(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setEvidenceDragging(false);
                      if (!headerUploading) void uploadFromHeader(Array.from(event.dataTransfer.files));
                    }}
                  >
                    <span className="intake-evidence-dropzone-icon"><Icon name="upload" size={21} /></span>
                    <span className="intake-evidence-dropzone-copy">
                      <b>{headerUploading ? uploadStatus || "Uploading evidence..." : "Drop evidence files or ZIP archives here"}</b>
                      <small>{headerUploading ? "Keep this file open while the upload finishes." : "Files are added to the primary bucket. ZIP archives are unpacked and indexed in the background."}</small>
                    </span>
                    <span className="intake-evidence-browse-label">{headerUploading ? "Uploading" : "Browse computer"}</span>
                  </button>
                  <div className="mt"><IntakeEvidenceBrowser intakeId={detail.intake.id} primaryBucketId={detail.intake.bucket_id} primaryBucketName={detail.intake.bucket_name || detail.intake.business_name || "Primary bucket"} files={detail.files} /></div>
                  <ExtractedFactsReview sourceKind="intake" sourceId={detail.intake.id} />
                  <InfoBlock title="Evidence requirements and AI blockers"><div className="grid">{detail.requested_documents.map((doc) => <div key={doc.id} className="itemrow"><CellChip tone={doc.status === "uploaded" ? "ok" : "warn"}>{doc.status}</CellChip><strong className="sp">{doc.name}</strong><span className="sub">{doc.required ? "Required" : "Optional"}</span></div>)}</div><CompactList rows={missing.map((row) => ({ title: String(row.title || "Missing item"), body: String(row.detail || "") }))} empty="No blockers listed in the latest review." /></InfoBlock>
                </Panel>
              ) : null}
              {prototypeView === "workspace" && submissionStep === 3 ? <ApplicationVerificationWorkspace sourceKind="intake" sourceId={detail.intake.id} mode="credit" onStateChange={setProfileVerification} /> : null}
              {prototypeView === "workspace" && submissionStep === 4 ? <ApplicationVerificationWorkspace sourceKind="intake" sourceId={detail.intake.id} mode="banking" onStateChange={setProfileVerification} /> : null}
              {prototypeView === "workspace" && submissionStep === 5 ? (
                <Panel title="AI review" actions={<Btn variant="pri" onClick={onRerun} disabled={rerunning}>{rerunning ? "Reviewing..." : reviewComplete ? "Re-run review" : "Run AI review"}</Btn>}>
                  <div className="intake-review-grid"><div className="kpi"><div className="lbl">Probability</div><div className="knum prose">{String(result?.probability_status || "Awaiting evidence")}</div></div><div className="kpi"><div className="lbl">Evidence</div><div className="knum num">{detail.files.length}</div><div className="sub">primary files available</div></div><div className="kpi"><div className="lbl">Missing</div><div className="knum num">{missing.length}</div><div className="sub">blocking items</div></div></div>
                  <div className="hintbox mt"><div className="lbl">Next best action</div><p>{String(result?.one_next_step || result?.executive_summary || "Run the review after the evidence room is complete.")}</p></div>
                  <ApplicationIntelligencePanel sourceKind="intake" sourceId={detail.intake.id} onAction={() => setSubmissionStep(2)} />
                </Panel>
              ) : null}
              {prototypeView === "workspace" && submissionStep === 6 ? (
                <Panel title="Package readiness" sub="Prepare, review, and deliver one lender-facing package." actions={packageTab === "summary" ? <Btn disabled={busy !== ""} onClick={() => { setBusy("summary"); Promise.resolve(onGenerateSummary()).finally(() => setBusy("")); }}>{busy === "summary" ? "Generating..." : summary ? "Regenerate summary" : "Generate summary"}</Btn> : packageTab === "package" ? <Btn variant="pri" disabled={busy !== "" || !summary} onClick={() => { setBusy("packet"); Promise.resolve(onGeneratePacket()).finally(() => setBusy("")); }}>{busy === "packet" ? "Building..." : packet ? "Rebuild package" : "Build lender package"}</Btn> : <Btn variant="pri" disabled={busy !== ""} onClick={previewEmail}>{busy === "preview" ? "Drafting..." : "Draft with Elara"}</Btn>}>
                  <div className="package-readiness-tabs" role="tablist" aria-label="Package readiness sections">{([['summary', 'Executive summary'], ['package', 'Lender package'], ['delivery', 'Delivery']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={packageTab === id} className={packageTab === id ? "on" : undefined} onClick={() => setPackageTab(id)}><span>{id === "summary" ? summary ? <Icon name="check" size={12} /> : "1" : id === "package" ? packet ? <Icon name="check" size={12} /> : "2" : sentCount ? <Icon name="check" size={12} /> : "3"}</span>{label}</button>)}</div>
                  {packageTab === "summary" ? summary ? <div className="artifact-preview"><strong>{summary.title}</strong><p>{summary.body_text || String(summary.body_json?.executive_summary || "")}</p><span className="sub">Generated {formatDateTime(summary.created_at)}</span></div> : <div className="empty">Generate an underwriter narrative after the AI review is complete.</div> : null}
                  {packageTab === "package" ? packet ? <div className="source-room"><div><CellChip tone="ok">Ready</CellChip><strong>{packet.title}</strong><span className="sub">Redacted lender-facing PDF · {formatDateTime(packet.created_at)}</span></div>{packet.download_url ? <a href={packet.download_url} target="_blank" rel="noreferrer" className="btn">Preview PDF</a> : null}</div> : <div className="empty">Build the lender package after the executive summary is ready.</div> : null}
                  {packageTab === "delivery" ? <div className="package-delivery"><div className="fldgrid two"><Field label="To"><Input value={toEmails} onChange={(event) => setToEmails(event.target.value)} placeholder="lender@bank.com" /></Field><Field label="Cc"><Input value={ccEmails} onChange={(event) => setCcEmails(event.target.value)} placeholder="optional" /></Field></div><Field label="Subject"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Prepare a lender submission" /></Field><Field label="Message"><Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} placeholder="Draft the reviewed submission message" /></Field><Row><Btn disabled={!toEmails.trim() || !subject.trim() || !body.trim() || !packet || busy !== ""} onClick={() => setSendReviewOpen(true)}>Review and send</Btn><Btn onClick={downloadZip} disabled={zipBusy}>{zipBusy ? "Building..." : "Download package"}</Btn></Row></div> : null}
                </Panel>
              ) : null}

              {prototypeView === "underwriting" && canUnderwrite ? (
                <Panel
                  title="Underwriting"
                  sub="Control the file lifecycle, approved amounts, DSCR overrides, and close outcome."
                  actions={<Row>{underwriting?.loan_id ? <Link href={`/loans/${underwriting.loan_id}`} className="btn">Open funding file</Link> : <Btn onClick={() => changeUnderwritingStatus("in_underwriting")} disabled={underwritingSaving}>Create funding file</Btn>}<Btn variant="pri" onClick={saveUnderwritingDraft} disabled={underwritingLoading || underwritingSaving}>{underwritingSaving ? "Saving..." : "Save underwriting"}</Btn></Row>}
                >
                  {underwritingError ? <WarnLine>{underwritingError}</WarnLine> : null}
                  {underwritingLoading ? <div className="empty">Loading underwriting controls...</div> : (
                    <div className="underwriting-workspace">
                      <div className="underwriting-status-strip">
                        <div>
                          <span className="lbl">Current lifecycle</span>
                          <b>{underwritingStatusLabel(underwritingDraft.underwriting_status)}</b>
                          <span className="sub">{underwriting?.loan_id ? "Linked to a funding loan." : "No funding loan has been created yet."}</span>
                        </div>
                        <div>
                          <span className="lbl">Last update</span>
                          <b>{underwriting?.updated_at ? formatDateTime(underwriting.updated_at) : "No saved update"}</b>
                          <span className="sub">Actor and effects are recorded in audit.</span>
                        </div>
                      </div>
                      <div className="fldgrid three">
                        <Field label="Lifecycle status">
                          <Select value={underwritingDraft.underwriting_status} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, underwriting_status: event.target.value as UnderwritingLifecycleStatus })}>
                            {PIPELINE_LIFECYCLE.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                          </Select>
                        </Field>
                        <Field label="Approved amount">
                          <Input inputMode="decimal" value={underwritingDraft.approved_amount} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, approved_amount: event.target.value })} placeholder="0.00" />
                        </Field>
                        <Field label="Term-sheet amount">
                          <Input inputMode="decimal" value={underwritingDraft.term_sheet_amount} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, term_sheet_amount: event.target.value })} placeholder="0.00" />
                        </Field>
                        <Field label="Current DSCR">
                          <Input inputMode="decimal" value={underwritingDraft.current_dscr} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, current_dscr: event.target.value })} placeholder="1.00" />
                        </Field>
                        <Field label="Target DSCR">
                          <Input inputMode="decimal" value={underwritingDraft.target_dscr} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, target_dscr: event.target.value })} placeholder="1.25" />
                        </Field>
                        <Field label="Approved DSCR">
                          <Input inputMode="decimal" value={underwritingDraft.approved_dscr} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, approved_dscr: event.target.value })} placeholder="1.25" />
                        </Field>
                      </div>
                      <Field label="Reviewer notes">
                        <Textarea rows={6} value={underwritingDraft.reviewer_notes} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, reviewer_notes: event.target.value })} placeholder="Record underwriting conditions, exceptions, committee notes, or close reason." />
                      </Field>
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
                  <div className="intake-channel-tabs" role="tablist" aria-label="Intake communication channel">
                    {([['underwriter', 'Underwriter AI'], ['client', 'Client conversation'], ['partner', 'Partner channel'], ['internal', 'Internal notes']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={communicationChannel === id} className={communicationChannel === id ? "on" : undefined} onClick={() => setCommunicationChannel(id)}>{label}</button>)}
                  </div>
                  {communicationChannel === "underwriter" ? (cockpitResponse && cockpitAdapter ? <div className="intake-underwriter-stage"><LeadCockpit response={cockpitResponse} adapter={cockpitAdapter} variant={detail.intake.variant} initialMessages={detail.messages} onResponse={onCockpitResponse} onRequestRerun={onRerun} /></div> : <div className="empty">Loading the private underwriting conversation...</div>) : null}
                  {communicationChannel === "client" && cockpitAdapter ? <ClientConversation adapter={cockpitAdapter} clientName={detail.intake.full_name} /> : null}
                  {communicationChannel === "partner" ? <UnifiedThreadConversation threadId={`intake:${detail.intake.id}:partner`} emptyLabel="No dealer-partner messages yet." /> : null}
                  {communicationChannel === "internal" ? <UnifiedThreadConversation threadId={`intake:${detail.intake.id}:internal`} emptyLabel="No private internal notes yet." /> : null}
                </div>
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
                  <Line label="Purpose" value={detail.intake.loan_purpose || "-"} />
                  <Line label="Credit" value={detail.intake.estimated_credit_score ? String(detail.intake.estimated_credit_score) : "-"} />
                  <Line label="Source" value={detail.intake.referral_source || "Direct"} />
                  <Line label="Vertical" value={variantLabel(detail.intake.variant)} />
                </Panel>
                <ApplicationClassificationPanel sourceKind="intake" sourceId={detail.intake.id} />
                <Panel title="Missing and blockers"><CompactList rows={missing.map((row) => ({ title: String(row.title || "Missing item"), body: String(row.detail || "") }))} empty="No blockers listed." /></Panel>
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

      <Toast msg={toast.msg} />
      <DriveFilePicker open={ingestPickerOpen} mode="ingest" busy={busy === "ingest"} maxSelect={50} onClose={() => setIngestPickerOpen(false)} selectedIds={ingestFiles.map((file) => file.id)} onPick={(file) => setIngestFiles((current) => current.some((item) => item.id === file.id) ? current : [...current, file])} onUnpick={(id) => setIngestFiles((current) => current.filter((file) => file.id !== id))} onConfirm={runIngest} />
      {detail ? <ConfirmDeleteLeadModal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} expectedName={detail.intake.business_name || detail.intake.full_name} onConfirm={async (name) => { await onConfirmDeletion(name); setConfirmDeleteOpen(false); }} /> : null}
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
        <Btn className="danger" disabled={deletionBusy} onClick={() => setConfirmDeleteOpen(true)}>Delete lead</Btn>
        {detail?.intake.delete_requested_at ? (
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
                  response={cockpitResponse}
                  adapter={cockpitAdapter}
                  variant={detail.intake.variant}
                  initialMessages={detail.messages}
                  onResponse={onCockpitResponse}
                  onRequestRerun={onRerun}
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
            <InfoBlock title={`Uploaded files (${detail.files.length})`}>
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
                  {detail.files.length ? detail.files.slice(0, 60).map((file) => (
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
            <ClientConversation adapter={cockpitAdapter} clientName={detail.intake.full_name} />
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
                        <input type="checkbox" checked={attachSummary} onChange={(e) => setAttachSummary(e.target.checked)} /> Executive summary (.txt)
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
      {detail ? (
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

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(expectedName);
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
      title="Review before running"
      sub="Permanently delete AI intake"
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <span className="sp" />
          <Btn className="danger" disabled={busy} onClick={handleConfirm}>
            {busy ? <><Spinner /> Deleting…</> : "Delete permanently"}
          </Btn>
        </>
      }
    >
      <div className="grid">
        <div className="warnline">This permanently erases <strong>{expectedName}</strong>, including uploaded documents, generated artifacts, conversations, and related records.</div>
        <div className="kv"><span>Actor</span><b>Current signed-in operator</b></div>
        <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
        <div className="kv"><span>Reversible</span><b>No</b></div>
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adapter
      .loadClientThread()
      .then((r) => { if (alive) setMessages(r.messages || []); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not load the client conversation."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [adapter]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const r = await adapter.replyClientThread(text);
      setMessages(r.messages || []);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid g10" style={{ alignContent: "start" }}>
      <WarnLine>
        This is the <strong>client-facing</strong> conversation{clientName ? ` with ${clientName}` : ""}. Anything you send here is visible to the client and is attributed to you as their underwriter. Private operator and partner messages stay in the Rep channel tab.
      </WarnLine>

      <div className="card">
        <div className="thr">
          {loading ? (
            <span className="thr-empty">Loading client conversation…</span>
          ) : messages.length === 0 ? (
            <span className="thr-empty">No messages in the client conversation yet.</span>
          ) : (
            messages.map((m) => {
              const isClient = m.role === "user" && !(m.author_name || "").toLowerCase().startsWith("underwriter");
              const isAI = m.role === "assistant";
              const label = isAI ? "AI" : m.author_name || (isClient ? clientName || "Client" : "You");
              return (
                <div key={m.id} className={cx("msg", isAI ? "ai" : isClient ? "client-ch" : "mine")}>
                  <div className="msg-h"><span className="msg-who">{label}</span></div>
                  <div className="msg-b">{m.content}</div>
                </div>
              );
            })
          )}
          {sending ? (
            <div className="msg ai">
              <div className="msg-h"><span className="msg-who">AI</span></div>
              <div className="msg-b">
                <TypingDots label="Client AI is responding" />
              </div>
            </div>
          ) : null}
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
            placeholder="Answer the client here — Enter to send, Shift+Enter for a new line. They will see this and the AI will respond."
            aria-label="Reply on behalf (as underwriter)"
          />
          <div className="composer-row">
            <Btn variant="pri" onClick={send} disabled={sending || !draft.trim()}>
              {sending ? <><Spinner /> Sending…</> : "Send to client"}
            </Btn>
            <span className="hint">Visible to the client · attributed to you</span>
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
  phone?: string;
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
    setError("");
    const result = await onCreate({
      variant,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
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
        <Field label="Six-digit room PIN"><Input value={roomPin} onChange={(event) => setRoomPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="000000" /></Field>
        <Field label="Confirm room PIN"><Input value={roomPinConfirm} onChange={(event) => setRoomPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="000000" /></Field>
        <p className="sub" style={{ gridColumn: "1 / -1" }}>The client enters this PIN in the application room. It cannot be recovered after creation; staff can rotate it later.</p>
      </div> : null}

      {step === 2 ? <>
        <p className="sub">The client and legal entity anchor ownership, private credit links, bank evidence, and the secure room.</p>
        <div className="fldgrid two"><Field label="Client full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" /></Field><Field label="Personal email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" /></Field><Field label="Personal phone"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Required for 20%+ owners" /></Field>{!isRE ? <Field label="Legal business name"><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business LLC" /></Field> : <Field label="Investor / entity name"><Input value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="Holdings LLC" /></Field>}</div>
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
  // "dealer_gatekeeper_v1" is the canonical dealer marker; "dealer_financing_v1"
  // is the legacy value kept as a fallback during the deploy window.
  if (value === "dealer_gatekeeper_v1" || value === "dealer_financing_v1") return "Dealer";
  if (value === "mca_refi_v1") return "MCA refinance";
  if (value === "main_street_v1") return "Main Street";
  return "AI review";
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
