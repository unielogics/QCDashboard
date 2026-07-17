"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, SectionLabel } from "@/components/design-system/primitives";
import { BucketFileReviewPanel, type BucketFileAnnotation, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import { EmailComposer } from "@/components/email/EmailComposer";
import { useCurrentUser } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
import { APP_ORIGIN } from "@/lib/appUrl";
import { openSignedUrl } from "@/lib/safeOpen";
import { useUI } from "@/store/ui";

type Bucket = {
  id: string;
  name: string;
  bucket_type?: string | null;
  client_name?: string | null;
  purpose?: string | null;
  description?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  file_count?: number;
  uploaded_file_count?: number;
};
type RequestedDoc = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  required: boolean;
  allow_multiple_files?: boolean;
  status: string;
};
type BucketFile = {
  id: string;
  requested_document_id?: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_name?: string | null;
  uploaded_by_email?: string | null;
  status: string;
  created_at: string;
};
type AdminQueuedFile = {
  id: string;
  file: File;
  requested_document_id: string;
  status: "ready" | "uploading" | "uploaded" | "error";
  message?: string;
};
type Share = {
  id: string;
  token?: string;
  recipient_name: string;
  recipient_email?: string | null;
  can_download: boolean;
  can_add_notes?: boolean;
  can_upload?: boolean;
  status: string;
  expires_at?: string | null;
  last_accessed_at?: string | null;
  created_at?: string | null;
  view_count: number;
  download_count: number;
  files?: BucketFile[];
  share_url?: string | null;
  passcode?: string | null;
};
type VendorUser = { id: string; name: string; email: string; role: string; created_at?: string | null };
type VendorAccess = {
  id: string;
  bucket_id: string;
  vendor_user_id: string;
  vendor_name?: string | null;
  vendor_email?: string | null;
  status: string;
  expires_at?: string | null;
  file_scope: "all_active" | "selected";
  can_preview: boolean;
  can_download: boolean;
  can_add_notes: boolean;
  can_see_internal_notes: boolean;
  can_use_ai_chat: boolean;
  can_view_ai_summary: boolean;
  can_view_ai_tasks: boolean;
  can_propose_tasks: boolean;
  last_accessed_at?: string | null;
  view_count: number;
  download_count: number;
  files?: BucketFile[];
  created_at?: string | null;
  updated_at?: string | null;
};
type Note = { id: string; author_name: string; visibility: string; content: string; created_at: string };
type Activity = {
  id: string;
  action: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  detail?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
};
type BucketDetail = Bucket & {
  ai_context?: BucketAIContext | null;
  requested_documents: RequestedDoc[];
  files: BucketFile[];
  upload_links?: UploadLink[];
  shares: Share[];
  vendor_access?: VendorAccess[];
  notes: Note[];
  activity: Activity[];
};
type Template = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  required: boolean;
  allow_multiple_files?: boolean;
  is_custom?: boolean;
  save_to_library?: boolean;
};
type PackageKey = "standard" | "urchoice";
type UploadInvite = { id: string; recipient_name: string; recipient_email: string; passcode: string };
type UploadInviteLink = { id: string; name: string; email?: string; url: string; passcode: string };
type UploadInitResponse = { file_id: string; upload_url: string; required_headers: Record<string, string> };
type UploadLink = {
  id: string;
  token?: string;
  recipient_name: string;
  recipient_email?: string | null;
  allow_notes?: boolean;
  allow_multiple_sessions?: boolean;
  can_use_ai_chat?: boolean;
  can_view_ai_tasks?: boolean;
  status: string;
  completed_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  upload_url?: string | null;
  passcode?: string | null;
};
type ShareViewerDraft = {
  id: string;
  recipient_name: string;
  recipient_email: string;
  passcode: string;
  can_download: boolean;
  expires_days: number;
  file_ids: string[];
  file_search: string;
};
type ActivityPage = { items: Activity[]; total: number; limit: number; offset: number };
type ActivityFilters = { action: string; actor_role: string; target_type: string; q: string; date_from: string; date_to: string };
type BucketAIContext = {
  deal_type?: string | null;
  documentation_level?: string | null;
  collateral_type?: string | null;
  loan_purpose?: string | null;
  underwriting_focus?: string | null;
  custom_instructions?: string | null;
};
type BucketAIReview = {
  id: string;
  status: string;
  context_snapshot?: BucketAIContext | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  created_at: string;
  completed_at?: string | null;
};
type BucketAIMessage = {
  id: string;
  role: "user" | "assistant";
  author_name?: string | null;
  content: string;
  proposed_context_patch?: BucketAIContext | null;
  created_at: string;
};
type BucketAIActionItem = {
  id: string;
  status: "proposed" | "approved" | "rejected" | "completed";
  route: "admin" | "uploader" | "share" | "vendor";
  upload_link_id?: string | null;
  share_id?: string | null;
  vendor_access_id?: string | null;
  file_id?: string | null;
  requested_document_id?: string | null;
  title: string;
  instructions: string;
  rationale?: string | null;
  created_by?: "ai" | "admin" | string;
  created_at: string;
};
type AIMode = "review" | "chat" | "actions";
type DetailFocus = "vendors" | null;
type ManualActionDraft = {
  title: string;
  instructions: string;
  route: "admin" | "uploader" | "share" | "vendor";
  upload_link_id: string;
  share_id: string;
  vendor_access_id: string;
  file_id: string;
  requested_document_id: string;
};
type VendorAccessDraft = {
  vendor_user_id: string;
  vendor_name: string;
  vendor_email: string;
  file_scope: "all_active" | "selected";
  file_ids: string[];
  file_search: string;
  can_preview: boolean;
  can_download: boolean;
  can_add_notes: boolean;
  can_see_internal_notes: boolean;
  can_use_ai_chat: boolean;
  can_view_ai_summary: boolean;
  can_view_ai_tasks: boolean;
  can_propose_tasks: boolean;
  expires_days: number;
};

const BUCKET_TYPES = ["Loan File", "UrChoice Dealer Funding", "Partner Package", "Borrower", "Funding Opportunity"];
const REQUEST_DOCS_PER_PAGE = 10;
const ACTIVITY_PAGE_SIZE = 12;
const ACTIVITY_ACTION_OPTIONS = [
  "bucket_created",
  "bucket_deleted",
  "requested_document_added",
  "upload_link_created",
  "upload_link_passcode_regenerated",
  "upload_link_accessed",
  "upload_passcode_failed",
  "file_upload_started",
  "file_uploaded",
  "file_upload_failed",
  "admin_file_upload_started",
  "admin_file_uploaded",
  "admin_file_upload_failed",
  "share_created",
  "share_updated",
  "share_status_changed",
  "share_passcode_regenerated",
  "share_accessed",
  "share_passcode_failed",
  "shared_file_review_opened",
  "shared_file_review_denied",
  "shared_file_download_requested",
  "shared_file_download_denied",
  "shared_note_created",
  "shared_note_denied",
  "shared_file_annotation_created",
  "shared_file_annotation_denied",
  "vendor_access_created",
  "vendor_access_updated",
  "vendor_access_revoked",
  "vendor_access_reactivated",
  "vendor_bucket_accessed",
  "vendor_file_previewed",
  "vendor_file_review_denied",
  "vendor_file_download_requested",
  "vendor_file_download_denied",
  "vendor_file_annotation_created",
  "vendor_file_annotation_denied",
  "vendor_note_created",
  "vendor_note_denied",
  "vendor_ai_chat",
  "vendor_task_proposed",
  "note_created",
  "file_review_opened",
  "file_preview_url_created",
  "file_download_url_created",
  "file_annotation_created",
  "ai_action_created",
  "ai_action_proposed",
  "ai_action_approved",
  "ai_action_rejected",
  "ai_action_completed",
];
const ACTIVITY_ROLE_OPTIONS = ["super_admin", "uploader", "shared_user", "vendor", "system"];
const ACTIVITY_TARGET_OPTIONS = ["bucket", "requested_document", "upload_link", "share", "vendor_access", "file", "note", "annotation", "ai_action_item"];
const URCHOICE_DEALER_DOCS: Template[] = [
  { id: "urchoice-formation", name: "Formation", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-ein", name: "EIN", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-articles", name: "Articles", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-bank-statements", name: "6 months bank statement", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-tax-returns", name: "Last 2 years of Tax Returns business and personal", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-personal-irs", name: "Personal: IRS last 2 years", category: "UrChoice Dealer Funding", required: true },
];

function emptyShareViewerDraft(id = "share-viewer-draft"): ShareViewerDraft {
  return {
    id,
    recipient_name: "",
    recipient_email: "",
    passcode: "",
    can_download: false,
    expires_days: 7,
    file_ids: [],
    file_search: "",
  };
}

function newShareViewerDraft(): ShareViewerDraft {
  return {
    id: crypto.randomUUID(),
    recipient_name: "",
    recipient_email: "",
    passcode: generateAccessCode(),
    can_download: false,
    expires_days: 7,
    file_ids: [],
    file_search: "",
  };
}

function emptyManualActionDraft(): ManualActionDraft {
  return {
    title: "",
    instructions: "",
    route: "admin",
    upload_link_id: "",
    share_id: "",
    vendor_access_id: "",
    file_id: "",
    requested_document_id: "",
  };
}

function emptyVendorAccessDraft(): VendorAccessDraft {
  return {
    vendor_user_id: "",
    vendor_name: "",
    vendor_email: "",
    file_scope: "all_active",
    file_ids: [],
    file_search: "",
    can_preview: true,
    can_download: false,
    can_add_notes: true,
    can_see_internal_notes: false,
    can_use_ai_chat: true,
    can_view_ai_summary: true,
    can_view_ai_tasks: true,
    can_propose_tasks: true,
    expires_days: 30,
  };
}

export default function BucketsAdminPage() {
  const { t } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucketParam = searchParams.get("bucket");
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { getToken } = useAuth();
  const adminFileInputRef = useRef<HTMLInputElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [detail, setDetail] = useState<BucketDetail | null>(null);
  const [detailFocus, setDetailFocus] = useState<DetailFocus>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createResult, setCreateResult] = useState<{ links: UploadInviteLink[] } | null>(null);
  const [createStatus, setCreateStatus] = useState<{ kind: "working" | "success" | "error"; message: string } | null>(null);
  const [createPackage, setCreatePackage] = useState<PackageKey>("standard");
  const [createChecked, setCreateChecked] = useState<Record<string, boolean>>({});
  const [createDocSearch, setCreateDocSearch] = useState("");
  const [createDocPage, setCreateDocPage] = useState(0);
  const [customDocOpen, setCustomDocOpen] = useState(false);
  const [customDocs, setCustomDocs] = useState<Template[]>([]);
  const [customDocDraft, setCustomDocDraft] = useState({
    name: "",
    description: "",
    required: true,
    allow_multiple_files: false,
  });
  const [bucketForm, setBucketForm] = useState({
    name: "",
    client_name: "",
    purpose: "",
    bucket_type: "Loan File",
    description: "",
  });
  const [createInviteDraft, setCreateInviteDraft] = useState({ recipient_name: "", recipient_email: "", passcode: "" });
  const [createInvites, setCreateInvites] = useState<UploadInvite[]>([]);
  const [shareFiles, setShareFiles] = useState<Record<string, boolean>>({});
  const [sharePopupOpen, setSharePopupOpen] = useState(false);
  const [shareViewers, setShareViewers] = useState<ShareViewerDraft[]>(() => [emptyShareViewerDraft()]);
  const [sharePasscodes, setSharePasscodes] = useState<Record<string, string>>({});
  const [createdShareLinks, setCreatedShareLinks] = useState<Share[]>([]);
  // Email-share composer: which share is being emailed (null = closed).
  const [emailShare, setEmailShare] = useState<Share | null>(null);
  const [uploadLinkPasscodes, setUploadLinkPasscodes] = useState<Record<string, string>>({});
  const [expandedUploadLinkId, setExpandedUploadLinkId] = useState<string | null>(null);
  const [uploadLinkDraft, setUploadLinkDraft] = useState({ recipient_name: "", recipient_email: "", passcode: "" });
  const [editingShareId, setEditingShareId] = useState<string | null>(null);
  const [editingShareFileIds, setEditingShareFileIds] = useState<string[]>([]);
  const [editingShareSearch, setEditingShareSearch] = useState("");
  const [vendors, setVendors] = useState<VendorUser[]>([]);
  const [vendorDraft, setVendorDraft] = useState<VendorAccessDraft>(() => emptyVendorAccessDraft());
  const [vendorDirectoryOpen, setVendorDirectoryOpen] = useState(false);
  const [vendorDirectoryDraft, setVendorDirectoryDraft] = useState({ vendor_name: "", vendor_email: "" });
  const [vendorAssignmentBucket, setVendorAssignmentBucket] = useState<Bucket | null>(null);
  const [vendorAssignmentDetail, setVendorAssignmentDetail] = useState<BucketDetail | null>(null);
  const [vendorAssignmentDraft, setVendorAssignmentDraft] = useState<VendorAccessDraft>(() => emptyVendorAccessDraft());
  const [vendorAssignmentBusy, setVendorAssignmentBusy] = useState(false);
  const [expandedVendorAccessId, setExpandedVendorAccessId] = useState<string | null>(null);
  const [editingVendorAccessId, setEditingVendorAccessId] = useState<string | null>(null);
  const [editingVendorFileIds, setEditingVendorFileIds] = useState<string[]>([]);
  const [editingVendorFileSearch, setEditingVendorFileSearch] = useState("");
  const [adminUploadFiles, setAdminUploadFiles] = useState<AdminQueuedFile[]>([]);
  const [adminUploadForm, setAdminUploadForm] = useState({ uploader_name: "", uploader_email: "", note: "" });
  const [adminUploadDraftStatus, setAdminUploadDraftStatus] = useState<"saving" | "saved" | null>(null);
  const [adminUploadStatus, setAdminUploadStatus] = useState<{ kind: "working" | "success" | "error"; message: string } | null>(null);
  const [adminUploading, setAdminUploading] = useState(false);
  const [isAdminUploadDragging, setIsAdminUploadDragging] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [reviewFile, setReviewFile] = useState<BucketFile | null>(null);
  const [activityRows, setActivityRows] = useState<Activity[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(() => emptyActivityFilters());
  const [activityLoading, setActivityLoading] = useState(false);
  const [expandedShareId, setExpandedShareId] = useState<string | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [aiReviews, setAiReviews] = useState<BucketAIReview[]>([]);
  const [aiMessages, setAiMessages] = useState<BucketAIMessage[]>([]);
  const [aiActions, setAiActions] = useState<BucketAIActionItem[]>([]);
  const [aiContextDraft, setAiContextDraft] = useState<BucketAIContext>({});
  const [aiChatText, setAiChatText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>("review");
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [manualActionOpen, setManualActionOpen] = useState(false);
  const [manualActionDraft, setManualActionDraft] = useState<ManualActionDraft>(() => emptyManualActionDraft());

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadBuckets() {
    const [bucketRows, templateRows, vendorRows] = await Promise.all([
      call<Bucket[]>("/buckets"),
      call<Template[]>("/buckets/templates"),
      call<VendorUser[]>("/buckets/admin/vendors"),
    ]);
    setBuckets(bucketRows);
    setTemplates(templateRows);
    setVendors(vendorRows);
  }

  async function loadBucket(bucketId: string) {
    const row = await call<BucketDetail>(`/buckets/admin/${bucketId}`);
    setDetail(row);
    setActivityRows(row.activity ?? []);
    setActivityTotal(row.activity?.length ?? 0);
    const filters = emptyActivityFilters();
    setActivityFilters(filters);
    setActivityOffset(0);
    setShareFiles({});
    setSharePopupOpen(false);
    setShareViewers([newShareViewerDraft()]);
    setCreatedShareLinks([]);
    setExpandedShareId(null);
    setExpandedVendorAccessId(null);
    setEditingVendorAccessId(null);
    setEditingVendorFileIds([]);
    setEditingVendorFileSearch("");
    setVendorDraft(emptyVendorAccessDraft());
    setExpandedUploadLinkId(null);
    setUploadLinkPasscodes((codes) => {
      const keep = new Set((row.upload_links ?? []).map((link) => link.id));
      return Object.fromEntries(Object.entries(codes).filter(([id]) => keep.has(id)));
    });
    setUploadLinkDraft({ recipient_name: row.client_name || "", recipient_email: "", passcode: generateAccessCode() });
    setExpandedActivityId(null);
    setAdminUploadFiles([]);
    setAdminUploadStatus(null);
    setAdminUploadForm(loadAdminUploadDraft(row));
    setAdminUploadDraftStatus(null);
    setAiContextDraft(row.ai_context ?? {});
    setAiMode("review");
    setAiPanelOpen(true);
    setManualActionOpen(false);
    setManualActionDraft(emptyManualActionDraft());
    await Promise.all([loadBucketActivity(bucketId, 0, filters), loadBucketAI(bucketId)]);
  }

  async function openBucket(bucketId: string, focus: DetailFocus = null) {
    setDetailFocus(focus);
    await loadBucket(bucketId);
  }

  async function openVendorAssignment(bucketId: string) {
    const bucket = buckets.find((row) => row.id === bucketId) ?? null;
    setVendorAssignmentBucket(bucket);
    setVendorAssignmentDraft(emptyVendorAccessDraft());
    setVendorAssignmentBusy(true);
    try {
      const row = await call<BucketDetail>(`/buckets/admin/${bucketId}`);
      setVendorAssignmentDetail(row);
      setVendorAssignmentBucket(bucket ?? row);
    } catch (error) {
      setVendorAssignmentBucket(null);
      setVendorAssignmentDetail(null);
      setNotice(readableError(error));
    } finally {
      setVendorAssignmentBusy(false);
    }
  }

  function showVendorSettings() {
    setDetailFocus("vendors");
    setSharePopupOpen(false);
    window.setTimeout(() => {
      document.getElementById("bucket-vendors-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function loadBucketActivity(bucketId: string, offset = activityOffset, filters = activityFilters) {
    setActivityLoading(true);
    try {
      const params = activityParams(offset, filters);
      const page = await call<ActivityPage>(`/buckets/admin/${bucketId}/activity?${params.toString()}`);
      setActivityRows(page.items);
      setActivityTotal(page.total);
      setActivityOffset(page.offset);
    } finally {
      setActivityLoading(false);
    }
  }

  function updateActivityFilters(patch: Partial<ActivityFilters>) {
    if (!detail) return;
    const next = { ...activityFilters, ...patch };
    setActivityFilters(next);
    void loadBucketActivity(detail.id, 0, next);
  }

  async function loadBucketAI(bucketId: string) {
    const [reviews, messages, actions] = await Promise.all([
      call<BucketAIReview[]>(`/buckets/admin/${bucketId}/ai-reviews`),
      call<BucketAIMessage[]>(`/buckets/admin/${bucketId}/ai-chat`),
      call<BucketAIActionItem[]>(`/buckets/admin/${bucketId}/ai-action-items`),
    ]);
    setAiReviews(reviews);
    setAiMessages(messages);
    setAiActions(actions);
    setAiMode(reviews.length ? "chat" : "review");
  }

  async function queueAIReview() {
    if (!detail) return;
    setAiBusy(true);
    try {
      await call<BucketAIReview>(`/buckets/admin/${detail.id}/ai-reviews`, {
        method: "POST",
        body: JSON.stringify({ context: aiContextDraft }),
      });
      await loadBucketAI(detail.id);
      await loadBucket(detail.id);
      setNotice("AI review queued. Results will appear after processing.");
    } finally {
      setAiBusy(false);
    }
  }

  async function sendAIChat() {
    if (!detail || !aiChatText.trim()) return;
    const text = aiChatText.trim();
    setAiChatText("");
    setAiBusy(true);
    try {
      await call(`/buckets/admin/${detail.id}/ai-chat`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      await loadBucketAI(detail.id);
    } finally {
      setAiBusy(false);
    }
  }

  async function applyAIContextPatch(patch: BucketAIContext) {
    if (!detail) return;
    setAiBusy(true);
    try {
      const row = await call<BucketDetail>(`/buckets/admin/${detail.id}/ai-context/apply`, {
        method: "POST",
        body: JSON.stringify(patch),
      });
      setDetail((current) => current ? { ...current, ai_context: row.ai_context } : current);
      setAiContextDraft(row.ai_context ?? {});
      setNotice("Bucket AI instructions updated.");
    } finally {
      setAiBusy(false);
    }
  }

  async function patchAIAction(item: BucketAIActionItem, patch: Partial<BucketAIActionItem>) {
    if (!detail) return;
    const updated = await call<BucketAIActionItem>(`/buckets/admin/${detail.id}/ai-action-items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setAiActions((items) => items.map((row) => (row.id === item.id ? updated : row)));
  }

  async function createManualAIAction() {
    if (!detail || !manualActionDraft.title.trim() || !manualActionDraft.instructions.trim()) return;
    const payload: Record<string, unknown> = {
      title: manualActionDraft.title.trim(),
      instructions: manualActionDraft.instructions.trim(),
      route: manualActionDraft.route,
      status: "approved",
      rationale: "Created manually by admin.",
    };
    if (manualActionDraft.route === "uploader") {
      if (manualActionDraft.upload_link_id) payload.upload_link_id = manualActionDraft.upload_link_id;
    }
    if (manualActionDraft.route === "share") {
      if (!manualActionDraft.share_id) {
        setNotice("Select a share recipient before creating this task.");
        return;
      }
      payload.share_id = manualActionDraft.share_id;
    }
    if (manualActionDraft.route === "vendor") {
      if (!manualActionDraft.vendor_access_id) {
        setNotice("Select a vendor before creating this task.");
        return;
      }
      payload.vendor_access_id = manualActionDraft.vendor_access_id;
    }
    if (manualActionDraft.file_id) payload.file_id = manualActionDraft.file_id;
    if (manualActionDraft.requested_document_id) payload.requested_document_id = manualActionDraft.requested_document_id;

    const created = await call<BucketAIActionItem>(`/buckets/admin/${detail.id}/ai-action-items`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAiActions((items) => [created, ...items]);
    setManualActionDraft(emptyManualActionDraft());
    setManualActionOpen(false);
    setNotice("Task created and routed.");
  }

  async function deleteBucket(bucket: Bucket) {
    const confirmed = window.confirm(`Delete bucket "${bucket.name}"? It will be removed from the bucket list.`);
    if (!confirmed) return;
    setDeletingId(bucket.id);
    setNotice(null);
    try {
      await call<void>(`/buckets/admin/${bucket.id}`, { method: "DELETE" });
      if (detail?.id === bucket.id) setDetail(null);
      await loadBuckets();
      setNotice("Bucket deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN) loadBuckets().catch((e) => setNotice(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN && bucketParam && detail?.id !== bucketParam) {
      openBucket(bucketParam).catch((e) => setNotice(String(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role, bucketParam, detail?.id]);

  useEffect(() => {
    if (!detail) return;
    setAdminUploadDraftStatus("saving");
    const handle = window.setTimeout(() => {
      saveAdminUploadDraft(detail.id, adminUploadForm);
      setAdminUploadDraftStatus("saved");
    }, 350);
    return () => window.clearTimeout(handle);
  }, [detail?.id, adminUploadForm.uploader_name, adminUploadForm.uploader_email, adminUploadForm.note]);

  useEffect(() => {
    setCreateDocPage(0);
  }, [createPackage, createDocSearch]);

  useEffect(() => {
    if (!sharePopupOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSharePopupOpen(false);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target as Node)) {
        setSharePopupOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [sharePopupOpen]);

  useEffect(() => {
    if (!detail || detailFocus !== "vendors") return;
    const timer = window.setTimeout(() => {
      document.getElementById("bucket-vendors-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [detail?.id, detailFocus]);

  const reusableOtherDocs = templates.filter((doc) => (doc.category || "").toLowerCase() === "other");
  const standardDocs = templates.filter((doc) => (doc.category || "").toLowerCase() !== "other");
  const packageDocs = createPackage === "urchoice" ? URCHOICE_DEALER_DOCS : standardDocs;
  const createDocs = [...packageDocs, ...reusableOtherDocs, ...customDocs];
  const createDocQuery = createDocSearch.trim().toLowerCase();
  const filteredCreateDocs = createDocQuery
    ? createDocs.filter((doc) =>
        [doc.name, doc.category, doc.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(createDocQuery),
      )
    : createDocs;
  const createDocPageCount = Math.max(1, Math.ceil(filteredCreateDocs.length / REQUEST_DOCS_PER_PAGE));
  const safeCreateDocPage = Math.min(createDocPage, createDocPageCount - 1);
  const pagedCreateDocs = filteredCreateDocs.slice(safeCreateDocPage * REQUEST_DOCS_PER_PAGE, (safeCreateDocPage + 1) * REQUEST_DOCS_PER_PAGE);
  const selectedCreateDocs = createDocs.filter((doc) => createChecked[doc.id]);
  const selectedShareFileIds = Object.entries(shareFiles).filter(([, selected]) => selected).map(([id]) => id);
  const visibleFiles = useMemo(() => uniqueBucketFiles(detail?.files ?? []), [detail?.files]);
  const latestAIResult = aiReviews[0]?.result ?? null;
  const blockedReviewFiles = useMemo(() => blockedAIFileMap(latestAIResult), [latestAIResult]);
  const activityPage = Math.floor(activityOffset / ACTIVITY_PAGE_SIZE) + 1;
  const activityPageCount = Math.max(1, Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE));
  const canPageActivityBack = Boolean(detail && activityOffset > 0 && !activityLoading);
  const canPageActivityForward = Boolean(detail && activityOffset + ACTIVITY_PAGE_SIZE < activityTotal && !activityLoading);
  const canAdminUpload = Boolean(
    detail &&
      adminUploadForm.uploader_name.trim() &&
      adminUploadFiles.length > 0 &&
      adminUploadFiles.every((file) => file.status === "ready" || file.status === "error") &&
      !adminUploading,
  );
  const filteredBuckets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return buckets;
    return buckets.filter((bucket) =>
      [bucket.name, bucket.client_name, bucket.purpose, bucket.bucket_type, bucket.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [buckets, search]);

  if (meLoading) return <PanelBox style={{ color: t.ink2 }}>Loading Buckets...</PanelBox>;
  if (me && me.role !== Role.SUPER_ADMIN) return null;

  async function createBucketWorkflow() {
    if (!bucketForm.name.trim()) return;
    setBusy(true);
    setNotice(null);
    setCreateStatus({ kind: "working", message: "Creating bucket..." });
    try {
      const invites = normalizedUploadInvites(createInvites, createInviteDraft);
      const row = await call<Bucket>("/buckets", { method: "POST", body: JSON.stringify(bucketForm) });
      for (const [index, doc] of selectedCreateDocs.entries()) {
        setCreateStatus({ kind: "working", message: `Adding requested files ${index + 1} of ${selectedCreateDocs.length}...` });
        await call(`/buckets/admin/${row.id}/requested-documents`, {
          method: "POST",
          body: JSON.stringify({
            name: doc.name,
            category: doc.category,
            description: doc.description || null,
            required: doc.required,
            allow_multiple_files: !!doc.allow_multiple_files,
            is_custom: !!doc.is_custom,
            save_to_library: !!doc.save_to_library,
          }),
        });
      }
      const uploadLinks: UploadInviteLink[] = [];
      for (const [index, invite] of invites.entries()) {
        setCreateStatus({ kind: "working", message: `Creating upload invite ${index + 1} of ${invites.length}...` });
        const uploadLink = await call<UploadLink>(`/buckets/admin/${row.id}/upload-links`, {
          method: "POST",
          body: JSON.stringify({
            recipient_name: invite.recipient_name,
            recipient_email: invite.recipient_email.trim() || null,
            passcode: invite.passcode,
          }),
        });
        const uploadPasscode = uploadLink.passcode || invite.passcode;
        setUploadLinkPasscodes((codes) => ({ ...codes, [uploadLink.id]: uploadPasscode }));
        uploadLinks.push({ id: uploadLink.id, name: invite.recipient_name, email: invite.recipient_email || undefined, url: uploadLink.upload_url || "", passcode: uploadPasscode });
      }
      setCreateStatus({ kind: "working", message: "Refreshing bucket list..." });
      await loadBuckets();
      setBucketForm({ name: "", client_name: "", purpose: "", bucket_type: "Loan File", description: "" });
      setCreateInviteDraft({ recipient_name: "", recipient_email: "", passcode: generateAccessCode() });
      setCreateInvites([]);
      setCreateChecked({});
      setCustomDocs([]);
      setCustomDocDraft({ name: "", description: "", required: true, allow_multiple_files: false });
      setCreatePackage("standard");
      if (uploadLinks.length) {
        setCreateStatus({ kind: "success", message: "Bucket created. Upload invite links are ready below." });
        setCreateResult({ links: uploadLinks });
      } else {
        setCreateOpen(false);
        setCreateStatus(null);
        setNotice("Bucket created and added to the table.");
      }
    } catch (error) {
      setCreateStatus({ kind: "error", message: readableError(error) });
    } finally {
      setBusy(false);
    }
  }

  function addCreateInvite() {
    if (!createInviteDraft.recipient_name.trim()) return;
    setCreateInvites((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        recipient_name: createInviteDraft.recipient_name.trim(),
        recipient_email: createInviteDraft.recipient_email.trim(),
        passcode: createInviteDraft.passcode.trim() || generateAccessCode(),
      },
    ]);
    setCreateInviteDraft({ recipient_name: "", recipient_email: "", passcode: generateAccessCode() });
  }

  function toggleCreateDoc(docId: string) {
    setCreateChecked((checked) => ({ ...checked, [docId]: !checked[docId] }));
  }

  function addCustomDoc() {
    const name = customDocDraft.name.trim();
    if (!name) return;
    const id = `custom-${crypto.randomUUID()}`;
    const doc: Template = {
      id,
      name,
      category: "Other",
      description: customDocDraft.description.trim() || null,
      required: customDocDraft.required,
      allow_multiple_files: customDocDraft.allow_multiple_files,
      is_custom: true,
      save_to_library: true,
    };
    setCustomDocs((rows) => [...rows, doc]);
    setCreateChecked((checked) => ({ ...checked, [id]: true }));
    setCustomDocDraft({ name: "", description: "", required: true, allow_multiple_files: false });
  }

  function updateShareViewer(id: string, patch: Partial<ShareViewerDraft>) {
    setShareViewers((viewers) => viewers.map((viewer) => (viewer.id === id ? { ...viewer, ...patch } : viewer)));
  }

  function addShareViewer() {
    setShareViewers((viewers) => [...viewers, newShareViewerDraft()]);
  }

  function removeShareViewer(id: string) {
    setShareViewers((viewers) => (viewers.length === 1 ? viewers : viewers.filter((viewer) => viewer.id !== id)));
  }

  function generateShareCode(id: string) {
    updateShareViewer(id, { passcode: generateAccessCode() });
  }

  function setShareViewerFileIds(id: string, fileIds: string[]) {
    updateShareViewer(id, { file_ids: Array.from(new Set(fileIds)) });
  }

  function toggleShareViewerFile(id: string, fileId: string) {
    setShareViewers((viewers) =>
      viewers.map((viewer) => {
        if (viewer.id !== id) return viewer;
        const next = viewer.file_ids.includes(fileId)
          ? viewer.file_ids.filter((value) => value !== fileId)
          : [...viewer.file_ids, fileId];
        return { ...viewer, file_ids: next };
      }),
    );
  }

  function shareExpiryDate(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  function shareFilesFor(share: Share) {
    return share.files ?? [];
  }

  function vendorFilesFor(access: VendorAccess) {
    if (access.file_scope === "all_active") return visibleFiles;
    return access.files ?? [];
  }

  function vendorBucketLink(access?: VendorAccess) {
    const params = new URLSearchParams();
    if (detail) params.set("bucket", detail.id);
    if (access) params.set("access", access.id);
    const query = params.toString();
    return `${APP_ORIGIN}/vendor/buckets${query ? `?${query}` : ""}`;
  }

  function openEditShareFiles(share: Share) {
    setEditingShareId(share.id);
    setEditingShareFileIds(shareFilesFor(share).map((file) => file.id));
    setEditingShareSearch("");
  }

  async function patchShare(share: Share, body: Record<string, unknown>) {
    if (!detail) return;
    const updated = await call<Share>(`/buckets/admin/${detail.id}/shares/${share.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setDetail((current) => current ? { ...current, shares: current.shares.map((item) => (item.id === updated.id ? updated : item)) } : current);
  }

  async function saveEditedShareFiles(share: Share) {
    if (!editingShareFileIds.length) {
      setNotice("Select at least one file for this share.");
      return;
    }
    await patchShare(share, { file_ids: editingShareFileIds });
    setEditingShareId(null);
    setNotice("Share file access updated.");
  }

  async function regenerateSharePasscode(share: Share) {
    if (!detail) return;
    const result = await call<{ share: Share; passcode: string }>(`/buckets/admin/${detail.id}/shares/${share.id}/regenerate-passcode`, {
      method: "POST",
    });
    setSharePasscodes((codes) => ({ ...codes, [share.id]: result.passcode }));
    setDetail((current) => current ? { ...current, shares: current.shares.map((item) => (item.id === result.share.id ? result.share : item)) } : current);
    setNotice("Access code regenerated. Copy the invite from the Shares panel.");
  }

  function copyShareLink(share: Share) {
    if (!share.share_url) {
      setNotice("Share link is not available yet. Refresh the bucket and try again.");
      return;
    }
    void copyText(share.share_url);
  }

  function copyShareInvite(share: Share) {
    const passcode = sharePasscodes[share.id] || share.passcode;
    if (!share.share_url || !passcode) {
      setNotice("Regenerate the access code before copying the full invite.");
      return;
    }
    void copyText(`Secure file room: ${share.share_url}\nAccess code: ${passcode}\n\nNo account login is required. Send the link and access code separately when possible.`);
  }

  function shareEmailBody(share: Share): string {
    const passcode = sharePasscodes[share.id] || share.passcode || "";
    return [
      `Hi${share.recipient_name ? ` ${share.recipient_name}` : ""},`,
      "",
      "You've been given secure access to a document room. No account login is required — open the link and enter the access code:",
      "",
      `Secure file room: ${share.share_url}`,
      `Access code: ${passcode}`,
      "",
      "For your security, the link and access code are best kept private.",
    ].join("\n");
  }

  function openEmailShare(share: Share) {
    const passcode = sharePasscodes[share.id] || share.passcode;
    if (!share.share_url || !passcode) {
      setNotice("Regenerate the access code before emailing the invite (the code is only shown at create/regenerate time).");
      return;
    }
    setEmailShare(share);
  }

  async function sendShareEmail(payload: { to_emails: string[]; cc_emails: string[]; subject: string; body: string }) {
    if (!detail || !emailShare) return { ok: false };
    const res = await call<{ ok: boolean; sent: number; detail?: string | null }>(
      `/buckets/admin/${detail.id}/shares/${emailShare.id}/email`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    if (res.ok) setNotice(`Share access emailed to ${res.sent} recipient(s) from your Gmail.`);
    return { ok: res.ok, detail: res.detail };
  }

  function copyUploadLink(link: UploadLink) {
    if (!link.upload_url) {
      setNotice("Upload link is not available yet. Refresh the bucket and try again.");
      return;
    }
    void copyText(link.upload_url);
  }

  function copyUploadInvite(link: UploadLink) {
    const passcode = uploadLinkPasscodes[link.id] || link.passcode;
    if (!link.upload_url || !passcode) {
      setNotice("Regenerate the upload access code before copying the full invite.");
      return;
    }
    void copyText(`Upload link: ${link.upload_url}\nAccess code: ${passcode}`);
  }

  async function regenerateUploadLinkPasscode(link: UploadLink) {
    if (!detail) return;
    const result = await call<{ upload_link: UploadLink; passcode: string }>(`/buckets/admin/${detail.id}/upload-links/${link.id}/regenerate-passcode`, {
      method: "POST",
    });
    setUploadLinkPasscodes((codes) => ({ ...codes, [link.id]: result.passcode }));
    setDetail((current) => current ? {
      ...current,
      upload_links: (current.upload_links ?? []).map((item) => (item.id === result.upload_link.id ? result.upload_link : item)),
    } : current);
    setNotice("Upload access code regenerated. Copy the invite from the Upload Links panel.");
  }

  async function createBucketUploadLink() {
    if (!detail || !uploadLinkDraft.recipient_name.trim()) return;
    const passcode = uploadLinkDraft.passcode.trim() || generateAccessCode();
    const created = await call<UploadLink>(`/buckets/admin/${detail.id}/upload-links`, {
      method: "POST",
      body: JSON.stringify({
        recipient_name: uploadLinkDraft.recipient_name.trim(),
        recipient_email: uploadLinkDraft.recipient_email.trim() || null,
        passcode,
      }),
    });
    setUploadLinkPasscodes((codes) => ({ ...codes, [created.id]: created.passcode ?? passcode }));
    setDetail((current) => current ? { ...current, upload_links: [created, ...(current.upload_links ?? [])] } : current);
    setUploadLinkDraft({ recipient_name: "", recipient_email: "", passcode: generateAccessCode() });
    setExpandedUploadLinkId(created.id);
    setNotice("Upload link created. Copy the invite from the Upload Links panel.");
  }

  async function setShareStatus(share: Share, statusValue: "active" | "revoked") {
    if (statusValue === "revoked" && !window.confirm(`Revoke access for ${share.recipient_name}?`)) return;
    await patchShare(share, { status: statusValue });
    setNotice(statusValue === "revoked" ? "Share access revoked." : "Share access reactivated.");
  }

  async function createVendorAccess() {
    if (!detail) return;
    const selectedVendor = vendors.find((vendor) => vendor.id === vendorDraft.vendor_user_id);
    if (!selectedVendor && (!vendorDraft.vendor_name.trim() || !vendorDraft.vendor_email.trim())) {
      setNotice("Select an existing vendor or enter a vendor name and email.");
      return;
    }
    if (vendorDraft.file_scope === "selected" && vendorDraft.file_ids.length === 0) {
      setNotice("Select at least one file or use all active files.");
      return;
    }
    const body = {
      vendor_user_id: vendorDraft.vendor_user_id || null,
      vendor_name: selectedVendor ? selectedVendor.name : vendorDraft.vendor_name.trim(),
      vendor_email: selectedVendor ? selectedVendor.email : vendorDraft.vendor_email.trim(),
      file_scope: vendorDraft.file_scope,
      file_ids: vendorDraft.file_scope === "selected" ? vendorDraft.file_ids : [],
      can_preview: vendorDraft.can_preview,
      can_download: vendorDraft.can_download,
      can_add_notes: vendorDraft.can_add_notes,
      can_see_internal_notes: vendorDraft.can_see_internal_notes,
      can_use_ai_chat: vendorDraft.can_use_ai_chat,
      can_view_ai_summary: vendorDraft.can_view_ai_summary,
      can_view_ai_tasks: vendorDraft.can_view_ai_tasks,
      can_propose_tasks: vendorDraft.can_propose_tasks,
      expires_at: vendorDraft.expires_days ? shareExpiryDate(vendorDraft.expires_days) : null,
    };
    const created = await call<VendorAccess>(`/buckets/admin/${detail.id}/vendor-access`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setDetail((current) => current ? {
      ...current,
      vendor_access: [created, ...(current.vendor_access ?? []).filter((row) => row.id !== created.id)],
    } : current);
    setVendorDraft(emptyVendorAccessDraft());
    setExpandedVendorAccessId(created.id);
    await loadBuckets();
    setNotice("Vendor access is active. The vendor can log in to view assigned buckets.");
  }

  async function patchVendorAccess(access: VendorAccess, body: Record<string, unknown>) {
    if (!detail) return;
    const updated = await call<VendorAccess>(`/buckets/admin/${detail.id}/vendor-access/${access.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setDetail((current) => current ? {
      ...current,
      vendor_access: (current.vendor_access ?? []).map((row) => (row.id === updated.id ? updated : row)),
    } : current);
  }

  function openEditVendorFiles(access: VendorAccess) {
    setEditingVendorAccessId(access.id);
    setEditingVendorFileIds(vendorFilesFor(access).map((file) => file.id));
    setEditingVendorFileSearch("");
  }

  async function saveEditedVendorFiles(access: VendorAccess) {
    if (!editingVendorFileIds.length) {
      setNotice("Select at least one file for selected-file vendor access.");
      return;
    }
    await patchVendorAccess(access, { file_scope: "selected", file_ids: editingVendorFileIds });
    setEditingVendorAccessId(null);
    setNotice("Vendor file access updated.");
  }

  async function setVendorStatus(access: VendorAccess, statusValue: "active" | "revoked") {
    if (statusValue === "revoked" && !window.confirm(`Revoke access for ${access.vendor_name || access.vendor_email || "this vendor"}?`)) return;
    await patchVendorAccess(access, { status: statusValue });
    setNotice(statusValue === "revoked" ? "Vendor access revoked." : "Vendor access reactivated.");
  }

  async function resendVendorInvite(access: VendorAccess) {
    const name = access.vendor_name || access.vendor_email || "Vendor";
    const email = access.vendor_email;
    if (!email) {
      setNotice("This vendor does not have an email address.");
      return;
    }
    await call<VendorUser>("/buckets/admin/vendors", {
      method: "POST",
      body: JSON.stringify({ vendor_user_id: access.vendor_user_id, vendor_name: name, vendor_email: email }),
    });
    setNotice("Vendor login invite sent.");
  }

  async function createVendorFromDirectory() {
    if (!vendorDirectoryDraft.vendor_name.trim() || !vendorDirectoryDraft.vendor_email.trim()) {
      setNotice("Enter vendor name and email.");
      return;
    }
    const created = await call<VendorUser>("/buckets/admin/vendors", {
      method: "POST",
      body: JSON.stringify({
        vendor_name: vendorDirectoryDraft.vendor_name.trim(),
        vendor_email: vendorDirectoryDraft.vendor_email.trim(),
      }),
    });
    setVendors((current) => [created, ...current.filter((vendor) => vendor.id !== created.id)]);
    setVendorDirectoryDraft({ vendor_name: "", vendor_email: "" });
    setNotice("Vendor created and login invite sent.");
  }

  async function assignVendorFromBucketList() {
    if (!vendorAssignmentDetail) return;
    const selectedVendor = vendors.find((vendor) => vendor.id === vendorAssignmentDraft.vendor_user_id);
    if (!selectedVendor && (!vendorAssignmentDraft.vendor_name.trim() || !vendorAssignmentDraft.vendor_email.trim())) {
      setNotice("Select an existing vendor or enter a vendor name and email.");
      return;
    }
    if (vendorAssignmentDraft.file_scope === "selected" && vendorAssignmentDraft.file_ids.length === 0) {
      setNotice("Select at least one file or use all active files.");
      return;
    }
    setVendorAssignmentBusy(true);
    try {
      const created = await call<VendorAccess>(`/buckets/admin/${vendorAssignmentDetail.id}/vendor-access`, {
        method: "POST",
        body: JSON.stringify({
          vendor_user_id: vendorAssignmentDraft.vendor_user_id || null,
          vendor_name: selectedVendor ? selectedVendor.name : vendorAssignmentDraft.vendor_name.trim(),
          vendor_email: selectedVendor ? selectedVendor.email : vendorAssignmentDraft.vendor_email.trim(),
          file_scope: vendorAssignmentDraft.file_scope,
          file_ids: vendorAssignmentDraft.file_scope === "selected" ? vendorAssignmentDraft.file_ids : [],
          can_preview: vendorAssignmentDraft.can_preview,
          can_download: vendorAssignmentDraft.can_download,
          can_add_notes: vendorAssignmentDraft.can_add_notes,
          can_see_internal_notes: vendorAssignmentDraft.can_see_internal_notes,
          can_use_ai_chat: vendorAssignmentDraft.can_use_ai_chat,
          can_view_ai_summary: vendorAssignmentDraft.can_view_ai_summary,
          can_view_ai_tasks: vendorAssignmentDraft.can_view_ai_tasks,
          can_propose_tasks: vendorAssignmentDraft.can_propose_tasks,
          expires_at: vendorAssignmentDraft.expires_days ? shareExpiryDate(vendorAssignmentDraft.expires_days) : null,
        }),
      });
      setVendorAssignmentDetail((current) => current ? {
        ...current,
        vendor_access: [created, ...(current.vendor_access ?? []).filter((row) => row.id !== created.id)],
      } : current);
      setVendorAssignmentDraft(emptyVendorAccessDraft());
      await loadBuckets();
      setNotice("Vendor assigned to bucket.");
    } catch (error) {
      setNotice(readableError(error));
    } finally {
      setVendorAssignmentBusy(false);
    }
  }

  function copyVendorLoginLink(access: VendorAccess) {
    void copyText(vendorBucketLink(access));
  }

  function copyVendorInvite(access: VendorAccess) {
    const link = vendorBucketLink(access);
    const vendorName = access.vendor_name || "Vendor";
    const bucketName = detail?.name || "Qualified Commercial file room";
    void copyText(
      [
        `Hi ${vendorName},`,
        "",
        `Qualified Commercial assigned you secure vendor access to ${bucketName}.`,
        `Login link: ${link}`,
        "",
        "Access is tied to your vendor email login. There is no bucket password to copy for vendor access; use the app invite or sign in with the invited email.",
      ].join("\n"),
    );
  }

  const canCreateShareLinks =
    !!detail &&
    shareViewers.length > 0 &&
    shareViewers.every((viewer) => viewer.recipient_name.trim()) &&
    shareViewers.every((viewer) => viewer.file_ids.length > 0) &&
    !busy;

  async function createShareLinks() {
    if (!detail || !canCreateShareLinks) return;
    setBusy(true);
    try {
      let createdCount = 0;
      const createdShares: Share[] = [];
      for (const viewer of shareViewers) {
        const passcode = viewer.passcode.trim() || generateAccessCode();
        const res = await call<Share>(`/buckets/admin/${detail.id}/shares`, {
          method: "POST",
          body: JSON.stringify({
            recipient_name: viewer.recipient_name.trim(),
            recipient_email: viewer.recipient_email.trim() || null,
            passcode,
            can_download: viewer.can_download,
            expires_at: shareExpiryDate(viewer.expires_days),
            file_ids: viewer.file_ids,
          }),
        });
        createdCount += 1;
        createdShares.push(res);
        setSharePasscodes((codes) => ({ ...codes, [res.id]: res.passcode ?? passcode }));
      }
      const row = await call<BucketDetail>(`/buckets/admin/${detail.id}`);
      setDetail(row);
      setShareViewers([newShareViewerDraft()]);
      setCreatedShareLinks(createdShares);
      setNotice(`${createdCount} no-login share link${createdCount === 1 ? "" : "s"} created. Copy the bank invite from this popup or the Shares panel.`);
    } finally {
      setBusy(false);
    }
  }

  function addAdminUploadFiles(files: FileList | File[]) {
    setAdminUploadFiles((current) => {
      const seen = new Set(current.map((item) => localFileKey(item.file)));
      const incoming = Array.from(files)
        .filter((file) => {
          const key = localFileKey(file);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          file,
          requested_document_id: "",
          status: "ready" as const,
        }));
      return [...current, ...incoming];
    });
    setAdminUploadStatus(null);
    setIsAdminUploadDragging(false);
    if (adminFileInputRef.current) adminFileInputRef.current.value = "";
  }

  function updateAdminUploadFile(id: string, patch: Partial<AdminQueuedFile>) {
    setAdminUploadFiles((files) => files.map((file) => (file.id === id ? { ...file, ...patch } : file)));
  }

  function removeAdminUploadFile(id: string) {
    setAdminUploadFiles((files) => files.filter((file) => file.id !== id));
  }

  function onAdminUploadDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!adminUploading) setIsAdminUploadDragging(true);
  }

  function onAdminUploadDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsAdminUploadDragging(false);
    }
  }

  function onAdminUploadDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (adminUploading) return;
    setIsAdminUploadDragging(false);
    if (event.dataTransfer.files.length > 0) addAdminUploadFiles(event.dataTransfer.files);
  }

  async function submitAdminUploads() {
    if (!detail || !canAdminUpload) return;
    setAdminUploading(true);
    setAdminUploadStatus({ kind: "working", message: "Uploading files..." });
    let noteSaved = false;
    let uploadedCount = 0;
    let failedCount = 0;
    try {
      for (const queued of adminUploadFiles.filter((file) => file.status !== "uploaded")) {
        try {
          updateAdminUploadFile(queued.id, { status: "uploading", message: "Preparing upload" });
          const init = await call<UploadInitResponse>(`/buckets/admin/${detail.id}/files/upload-init`, {
            method: "POST",
            body: JSON.stringify({
              requested_document_id: queued.requested_document_id || null,
              file_name: queued.file.name,
              content_type: queued.file.type || "application/octet-stream",
              size_bytes: queued.file.size,
              uploader_name: adminUploadForm.uploader_name.trim(),
              uploader_email: adminUploadForm.uploader_email.trim() || null,
            }),
          });
          updateAdminUploadFile(queued.id, { message: "Uploading to storage" });
          const put = await fetch(init.upload_url, { method: "PUT", body: queued.file, headers: init.required_headers });
          if (!put.ok) throw new Error(`Storage rejected ${queued.file.name} (${put.status}).`);
          updateAdminUploadFile(queued.id, { message: "Finalizing" });
          await call<BucketFile>(`/buckets/admin/${detail.id}/files/complete`, {
            method: "POST",
            body: JSON.stringify({ file_id: init.file_id, note: !noteSaved ? adminUploadForm.note.trim() || null : null }),
          });
          noteSaved = noteSaved || !!adminUploadForm.note.trim();
          uploadedCount += 1;
          updateAdminUploadFile(queued.id, { status: "uploaded", message: "Uploaded" });
        } catch (error) {
          failedCount += 1;
          updateAdminUploadFile(queued.id, { status: "error", message: readableError(error) });
        }
      }
      await loadBucket(detail.id);
      await loadBuckets();
      if (failedCount === 0) {
        setAdminUploadFiles([]);
        setAdminUploadForm((form) => ({ ...form, note: "" }));
        setAdminUploadStatus({ kind: "success", message: `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded.` });
      } else {
        setAdminUploadStatus({ kind: "error", message: `${uploadedCount} uploaded. ${failedCount} file${failedCount === 1 ? "" : "s"} need attention.` });
      }
    } finally {
      setAdminUploading(false);
    }
  }

  async function addNote() {
    if (!detail || !adminNote.trim()) return;
    await call(`/buckets/admin/${detail.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ content: adminNote, visibility: "admin" }),
    });
    setAdminNote("");
    await loadBucket(detail.id);
  }

  async function openFile(file: BucketFile, download = false) {
    if (!detail) return;
    if (!download) {
      setReviewFile(file);
      return;
    }
    const res = await call<{ url: string }>(`/buckets/admin/${detail.id}/files/${file.id}/url?download=${download}`);
    openSignedUrl(res.url);
  }

  async function deleteFile(file: BucketFile) {
    if (!detail || deletingFileId) return;
    const ok = window.confirm(
      `Delete "${file.file_name}"?\n\nThis removes it from the bucket, revokes share access, and stops preview/download immediately.`,
    );
    if (!ok) return;
    setDeletingFileId(file.id);
    try {
      await call(`/buckets/admin/${detail.id}/files/${file.id}`, { method: "DELETE" });
      setShareFiles((current) => {
        const next = { ...current };
        delete next[file.id];
        return next;
      });
      setNotice("File deleted.");
      setReviewFile((current) => (current?.id === file.id ? null : current));
      await loadBucket(detail.id);
      await loadBuckets();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete file.");
    } finally {
      setDeletingFileId(null);
    }
  }

  async function loadAdminReview(file: BucketFile): Promise<BucketFileReview> {
    if (!detail) throw new Error("Bucket detail is not loaded.");
    return call<BucketFileReview>(`/buckets/admin/${detail.id}/files/${file.id}/review`);
  }

  async function saveAdminAnnotation(file: BucketFile, payload: { page_number: number; x: number; y: number; width: number; height: number; comment: string }): Promise<BucketFileAnnotation> {
    if (!detail) throw new Error("Bucket detail is not loaded.");
    return call<BucketFileAnnotation>(`/buckets/admin/${detail.id}/files/${file.id}/annotations`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setNotice("Copied.");
  }

  const field = inputStyle(t);
  const primary = buttonStyle(t, "primary");
  const secondary = buttonStyle(t, "secondary");
  const requestedDocNameById = new Map((detail?.requested_documents ?? []).map((doc) => [doc.id, doc.name]));

  function renderShareFilePicker(args: {
    selectedIds: string[];
    search: string;
    onSearch: (value: string) => void;
    onToggle: (fileId: string) => void;
    onSetSelected: (fileIds: string[]) => void;
  }) {
    const query = args.search.trim().toLowerCase();
    const filtered = visibleFiles.filter((file) => {
      if (!query) return true;
      return [
        file.file_name,
        file.uploaded_by_name,
        file.uploaded_by_email,
        requestedDocNameById.get(file.requested_document_id || ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    const selectedFiles = visibleFiles.filter((file) => args.selectedIds.includes(file.id));
    return (
      <div style={shareFilePickerStyle(t)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <strong style={{ color: t.ink, fontSize: 13 }}>{args.selectedIds.length} file{args.selectedIds.length === 1 ? "" : "s"} selected</strong>
          <button style={miniButtonStyle(t)} onClick={() => args.onSetSelected([])}>Clear</button>
        </div>
        {selectedFiles.length ? (
          <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedFiles.slice(0, 3).map((file) => file.file_name).join(", ")}{selectedFiles.length > 3 ? ` +${selectedFiles.length - 3} more` : ""}
          </div>
        ) : (
          <div style={{ color: t.warn, fontSize: 12, fontWeight: 800 }}>Select at least one file for this viewer.</div>
        )}
        <input style={field} value={args.search} onChange={(event) => args.onSearch(event.target.value)} placeholder="Search files" />
        <div style={{ display: "flex", gap: 8 }}>
          <button style={secondary} onClick={() => args.onSetSelected(filtered.map((file) => file.id))} disabled={!filtered.length}>Select visible</button>
          {selectedShareFileIds.length ? (
            <button style={secondary} onClick={() => args.onSetSelected(selectedShareFileIds)}>Use checked files</button>
          ) : null}
        </div>
        <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
          {filtered.length ? filtered.map((file) => (
            <label key={file.id} style={shareFileOptionStyle(t)}>
              <input type="checkbox" checked={args.selectedIds.includes(file.id)} onChange={() => args.onToggle(file.id)} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</span>
                <span style={{ color: t.ink3, fontSize: 11 }}>
                  {requestedDocNameById.get(file.requested_document_id || "") || "General upload"} | {formatSize(file.size_bytes)}
                </span>
              </span>
            </label>
          )) : (
            <div style={emptyInlineStyle(t)}>No uploaded files match this search.</div>
          )}
        </div>
      </div>
    );
  }

  function renderVendorAssignmentFilePicker() {
    const files = (vendorAssignmentDetail?.files ?? []).filter((file) => file.status === "uploaded");
    const docs = new Map((vendorAssignmentDetail?.requested_documents ?? []).map((doc) => [doc.id, doc.name]));
    const query = vendorAssignmentDraft.file_search.trim().toLowerCase();
    const filtered = files.filter((file) => {
      if (!query) return true;
      return [file.file_name, file.uploaded_by_name, file.uploaded_by_email, docs.get(file.requested_document_id || "")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    const selectedFiles = files.filter((file) => vendorAssignmentDraft.file_ids.includes(file.id));
    return (
      <div style={shareFilePickerStyle(t)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <strong style={{ color: t.ink, fontSize: 13 }}>{vendorAssignmentDraft.file_ids.length} file{vendorAssignmentDraft.file_ids.length === 1 ? "" : "s"} selected</strong>
          <button style={miniButtonStyle(t)} onClick={() => setVendorAssignmentDraft({ ...vendorAssignmentDraft, file_ids: [] })}>Clear</button>
        </div>
        {selectedFiles.length ? (
          <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedFiles.slice(0, 3).map((file) => file.file_name).join(", ")}{selectedFiles.length > 3 ? ` +${selectedFiles.length - 3} more` : ""}
          </div>
        ) : (
          <div style={{ color: t.warn, fontSize: 12, fontWeight: 800 }}>Select files for this vendor or switch to all active files.</div>
        )}
        <input
          style={field}
          value={vendorAssignmentDraft.file_search}
          onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, file_search: event.target.value })}
          placeholder="Search files"
        />
        <button
          style={secondary}
          onClick={() => setVendorAssignmentDraft({ ...vendorAssignmentDraft, file_ids: filtered.map((file) => file.id) })}
          disabled={!filtered.length}
        >
          Select visible
        </button>
        <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {filtered.length ? filtered.map((file) => (
            <label key={file.id} style={shareFileOptionStyle(t)}>
              <input
                type="checkbox"
                checked={vendorAssignmentDraft.file_ids.includes(file.id)}
                onChange={() => setVendorAssignmentDraft({
                  ...vendorAssignmentDraft,
                  file_ids: vendorAssignmentDraft.file_ids.includes(file.id)
                    ? vendorAssignmentDraft.file_ids.filter((id) => id !== file.id)
                    : [...vendorAssignmentDraft.file_ids, file.id],
                })}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</span>
                <span style={{ color: t.ink3, fontSize: 11 }}>{docs.get(file.requested_document_id || "") || "General upload"} | {formatSize(file.size_bytes)}</span>
              </span>
            </label>
          )) : (
            <div style={emptyInlineStyle(t)}>No uploaded files match this search.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, color: t.ink, fontSize: 28, fontWeight: 850 }}>Buckets</h1>
          <p style={{ margin: "5px 0 0", color: t.ink3, fontSize: 13 }}>
            Secure document rooms for collecting and selectively sharing files.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={secondary} onClick={() => setVendorDirectoryOpen(true)}>
            <Icon name="user" size={15} />
            Manage vendors
          </button>
          <button
            style={primary}
            onClick={() => {
              setCreateResult(null);
              setCreateStatus(null);
              setCreateInviteDraft({ recipient_name: "", recipient_email: "", passcode: generateAccessCode() });
              setCreateInvites([]);
              setCustomDocs([]);
              setCustomDocDraft({ name: "", description: "", required: true, allow_multiple_files: false });
              setCreateOpen(true);
            }}
          >
            <Icon name="plus" size={15} />
            Create bucket
          </button>
        </div>
      </div>

      {notice ? (
        <PanelBox style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, color: t.ink2 }}>
          <Icon name="check" size={14} />
          {notice}
        </PanelBox>
      ) : null}

      {vendorDirectoryOpen ? (
        <ModalFrame
          title="Vendor directory"
          subtitle="Create vendors once, then assign them to buckets from the bucket list."
          onClose={() => setVendorDirectoryOpen(false)}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <PanelBox>
              <SectionLabel>Create vendor login</SectionLabel>
              <div style={{ color: t.ink3, fontSize: 12.5, marginBottom: 10 }}>
                Vendors log in with their email and only see buckets you assign to them.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 8 }}>
                <input
                  style={field}
                  placeholder="Vendor name"
                  value={vendorDirectoryDraft.vendor_name}
                  onChange={(event) => setVendorDirectoryDraft({ ...vendorDirectoryDraft, vendor_name: event.target.value })}
                />
                <input
                  style={field}
                  placeholder="Vendor email"
                  value={vendorDirectoryDraft.vendor_email}
                  onChange={(event) => setVendorDirectoryDraft({ ...vendorDirectoryDraft, vendor_email: event.target.value })}
                />
                <button
                  style={primary}
                  onClick={() => createVendorFromDirectory().catch((error) => setNotice(readableError(error)))}
                  disabled={!vendorDirectoryDraft.vendor_name.trim() || !vendorDirectoryDraft.vendor_email.trim()}
                >
                  <Icon name="plus" size={14} />
                  Create
                </button>
              </div>
            </PanelBox>
            <PanelBox>
              <SectionLabel action={`${vendors.length} vendors`}>Existing vendors</SectionLabel>
              <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                {vendors.length ? vendors.map((vendor) => (
                  <div key={vendor.id} style={smallRowStyle(t)}>
                    <div>
                      <strong style={{ color: t.ink }}>{vendor.name}</strong>
                      <div style={{ color: t.ink3, fontSize: 12 }}>{vendor.email}</div>
                    </div>
                  </div>
                )) : (
                  <div style={emptyInlineStyle(t)}>No vendors yet. Create the first vendor above.</div>
                )}
              </div>
            </PanelBox>
          </div>
        </ModalFrame>
      ) : null}

      {vendorAssignmentBucket ? (
        <ModalFrame
          title={`Assign vendor`}
          subtitle={`${vendorAssignmentBucket.name} | ${vendorAssignmentBucket.client_name || "No client"}`}
          onClose={() => {
            setVendorAssignmentBucket(null);
            setVendorAssignmentDetail(null);
            setVendorAssignmentDraft(emptyVendorAccessDraft());
          }}
        >
          {vendorAssignmentBusy && !vendorAssignmentDetail ? (
            <PanelBox>Loading vendor assignment...</PanelBox>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <PanelBox>
                <SectionLabel>Assign vendor to this bucket</SectionLabel>
                <div style={{ color: t.ink3, fontSize: 12.5, marginBottom: 10 }}>
                  Choose an existing vendor or create a new one, then decide whether they see all active files or selected files.
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <select
                    style={field}
                    value={vendorAssignmentDraft.vendor_user_id}
                    onChange={(event) => {
                      const vendor = vendors.find((row) => row.id === event.target.value);
                      setVendorAssignmentDraft({
                        ...vendorAssignmentDraft,
                        vendor_user_id: event.target.value,
                        vendor_name: vendor?.name ?? "",
                        vendor_email: vendor?.email ?? "",
                      });
                    }}
                  >
                    <option value="">New vendor or choose existing</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>{vendor.name} | {vendor.email}</option>
                    ))}
                  </select>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
                    <input
                      style={field}
                      placeholder="Vendor name"
                      value={vendorAssignmentDraft.vendor_name}
                      onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, vendor_user_id: "", vendor_name: event.target.value })}
                    />
                    <input
                      style={field}
                      placeholder="Vendor email"
                      value={vendorAssignmentDraft.vendor_email}
                      onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, vendor_user_id: "", vendor_email: event.target.value })}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select
                      style={field}
                      value={vendorAssignmentDraft.file_scope}
                      onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, file_scope: event.target.value as VendorAccessDraft["file_scope"] })}
                    >
                      <option value="all_active">All active files</option>
                      <option value="selected">Selected files</option>
                    </select>
                    <select
                      style={field}
                      value={vendorAssignmentDraft.expires_days}
                      onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, expires_days: Number(event.target.value) })}
                    >
                      <option value={1}>Expires 1 day</option>
                      <option value={7}>Expires 7 days</option>
                      <option value={14}>Expires 14 days</option>
                      <option value={30}>Expires 30 days</option>
                      <option value={0}>No expiration</option>
                    </select>
                  </div>
                  {vendorAssignmentDraft.file_scope === "selected" ? renderVendorAssignmentFilePicker() : (
                    <div style={emptyInlineStyle(t)}>Vendor will see all current and future active files in this bucket.</div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {([
                      ["can_preview", "Preview"],
                      ["can_download", "Download"],
                      ["can_add_notes", "Notes"],
                      ["can_see_internal_notes", "Internal notes"],
                      ["can_use_ai_chat", "AI chat"],
                      ["can_view_ai_summary", "AI summary"],
                    ] as const).map(([key, label]) => (
                      <label key={key} style={permissionRowStyle(t)}>
                        <span style={{ color: t.ink, fontSize: 13, fontWeight: 850 }}>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(vendorAssignmentDraft[key])}
                          onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, [key]: event.target.checked })}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    style={primary}
                    onClick={assignVendorFromBucketList}
                    disabled={vendorAssignmentBusy}
                  >
                    <Icon name="plus" size={14} />
                    {vendorAssignmentBusy ? "Assigning..." : "Assign vendor"}
                  </button>
                </div>
              </PanelBox>
              <PanelBox>
                <SectionLabel action={`${vendorAssignmentDetail?.vendor_access?.length ?? 0} vendors`}>Assigned vendors</SectionLabel>
                <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                  {(vendorAssignmentDetail?.vendor_access ?? []).length ? (vendorAssignmentDetail?.vendor_access ?? []).map((access) => (
                    <div key={access.id} style={smallRowStyle(t)}>
                      <div>
                        <strong style={{ color: t.ink }}>{access.vendor_name || access.vendor_email || "Vendor"}</strong>
                        <div style={{ color: t.ink3, fontSize: 12 }}>
                          {access.vendor_email || "No email"} | {access.file_scope === "all_active" ? "All active files" : `${access.files?.length ?? 0} selected files`} | {statusLabel(access.status)}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div style={emptyInlineStyle(t)}>No vendors assigned to this bucket yet.</div>
                  )}
                </div>
              </PanelBox>
            </div>
          )}
        </ModalFrame>
      ) : null}

      <PanelBox style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderBottom: `1px solid ${t.line}` }}>
          <SectionLabel style={{ margin: 0 }}>Bucket list</SectionLabel>
          <div style={{ position: "relative", width: 320 }}>
            <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 11, color: t.ink3 }} />
            <input style={{ ...field, width: "100%", paddingLeft: 32 }} placeholder="Search buckets" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <BucketTable buckets={filteredBuckets} deletingId={deletingId} onSelect={(id) => openBucket(id)} onOpenVendors={openVendorAssignment} onDelete={deleteBucket} />
      </PanelBox>

      {createOpen ? (
        <ModalFrame title="Create bucket" subtitle="Set up the bucket, choose requested files, and invite uploaders." onClose={() => setCreateOpen(false)}>
          {createResult ? (
            <div style={{ display: "grid", gap: 14 }}>
              {createStatus ? <CreateStatusBanner status={createStatus} /> : null}
              <PanelBox style={{ borderColor: t.petrol }}>
                <SectionLabel action={`${createResult.links.length} link${createResult.links.length === 1 ? "" : "s"}`}>Upload invites created</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  {createResult.links.map((link) => (
                    <div key={link.id} style={smallRowStyle(t)}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: t.ink }}>{link.name}</strong>
                        <div style={{ color: t.ink3, fontSize: 12 }}>{link.email || "No email entered"}</div>
                        <div style={{ color: t.ink2, fontSize: 13, marginTop: 4 }}>Upload access code: <strong>{link.passcode}</strong></div>
                        <code style={{ display: "block", color: t.ink2, overflowWrap: "anywhere", fontSize: 12, marginTop: 4 }}>{link.url}</code>
                      </div>
                      <button style={secondary} onClick={() => copyText(`Upload link: ${link.url}\nAccess code: ${link.passcode}`)}>Copy</button>
                    </div>
                  ))}
                </div>
              </PanelBox>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button style={secondary} onClick={() => copyText(createResult.links.map((link) => `${link.name}: ${link.url}\nAccess code: ${link.passcode}`).join("\n\n"))}>Copy all</button>
                <button style={primary} onClick={() => setCreateOpen(false)}>Done</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {createStatus ? <CreateStatusBanner status={createStatus} /> : null}
              <PanelBox>
                <WorkflowHeader step="1" title="Bucket details" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                  <input style={field} placeholder="Bucket name" value={bucketForm.name} onChange={(e) => setBucketForm({ ...bucketForm, name: e.target.value })} />
                  <input style={field} placeholder="Client / borrower" value={bucketForm.client_name} onChange={(e) => setBucketForm({ ...bucketForm, client_name: e.target.value })} />
                  <select style={field} value={bucketForm.bucket_type} onChange={(e) => setBucketForm({ ...bucketForm, bucket_type: e.target.value })}>
                    {BUCKET_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                  <input style={field} placeholder="Purpose, deal, or package" value={bucketForm.purpose} onChange={(e) => setBucketForm({ ...bucketForm, purpose: e.target.value })} />
                  <textarea
                    style={{ ...field, gridColumn: "1 / -1", minHeight: 74, paddingTop: 10, resize: "vertical" }}
                    placeholder="Description optional"
                    value={bucketForm.description}
                    onChange={(e) => setBucketForm({ ...bucketForm, description: e.target.value })}
                  />
                </div>
              </PanelBox>

              <PanelBox>
                <WorkflowHeader step="2" title="Request files" />
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 10, marginTop: 12, alignItems: "center" }}>
                  <select
                    style={field}
                    value={createPackage}
                    onChange={(e) => {
                      setCreatePackage(e.target.value as PackageKey);
                      setCreateChecked({});
                    }}
                  >
                    <option value="standard">Standard Lending File</option>
                    <option value="urchoice">UrChoice Dealer Funding</option>
                  </select>
                  <button style={secondary} onClick={() => setCustomDocOpen((value) => !value)}>
                    <Icon name="plus" size={14} />
                    Other
                  </button>
                  <div style={{ color: t.ink3, fontSize: 12, alignSelf: "center" }}>
                    {selectedCreateDocs.length} selected
                  </div>
                </div>
                {customDocOpen ? (
                  <div style={{ ...panelStyle(t), padding: 12, marginTop: 12, background: t.surface2 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 10, alignItems: "center" }}>
                      <input
                        style={field}
                        placeholder="Other document option"
                        value={customDocDraft.name}
                        onChange={(e) => setCustomDocDraft({ ...customDocDraft, name: e.target.value })}
                      />
                      <label style={toggleLabelStyle(t)}>
                        <input
                          type="checkbox"
                          checked={customDocDraft.allow_multiple_files}
                          onChange={(e) => setCustomDocDraft({ ...customDocDraft, allow_multiple_files: e.target.checked })}
                        />
                        Multi-file
                      </label>
                      <button style={secondary} onClick={addCustomDoc} disabled={!customDocDraft.name.trim()}>
                        <Icon name="plus" size={14} />
                        Add option
                      </button>
                      <textarea
                        style={{ ...field, gridColumn: "1 / -1", minHeight: 70, paddingTop: 10, resize: "vertical" }}
                        placeholder="Description optional"
                        value={customDocDraft.description}
                        onChange={(e) => setCustomDocDraft({ ...customDocDraft, description: e.target.value })}
                      />
                    </div>
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", marginTop: 12 }}>
                  <div style={{ position: "relative" }}>
                    <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 12, color: t.ink3 }} />
                    <input
                      style={{ ...field, width: "100%", paddingLeft: 32 }}
                      placeholder="Search request options"
                      value={createDocSearch}
                      onChange={(e) => setCreateDocSearch(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      style={iconButtonStyle(t)}
                      onClick={() => setCreateDocPage((page) => Math.max(0, page - 1))}
                      disabled={safeCreateDocPage === 0}
                      aria-label="Previous request options page"
                      title="Previous"
                    >
                      <Icon name="chevL" size={14} />
                    </button>
                    <span style={{ color: t.ink3, fontSize: 12, fontWeight: 800, minWidth: 46, textAlign: "center" }}>
                      {safeCreateDocPage + 1} / {createDocPageCount}
                    </span>
                    <button
                      style={iconButtonStyle(t)}
                      onClick={() => setCreateDocPage((page) => Math.min(createDocPageCount - 1, page + 1))}
                      disabled={safeCreateDocPage >= createDocPageCount - 1}
                      aria-label="Next request options page"
                      title="Next"
                    >
                      <Icon name="chevR" size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gridAutoRows: "minmax(108px, auto)", gap: 8, marginTop: 12 }}>
                  {filteredCreateDocs.length === 0 ? (
                    <div style={{ ...emptyInlineStyle(t), gridColumn: "1 / -1" }}>
                      No request options match your search.
                    </div>
                  ) : pagedCreateDocs.map((doc) => (
                    <div
                      key={doc.id}
                      role="checkbox"
                      aria-checked={!!createChecked[doc.id]}
                      tabIndex={0}
                      style={checkRowStyle(t, !!createChecked[doc.id])}
                      onClick={() => toggleCreateDoc(doc.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleCreateDoc(doc.id);
                        }
                      }}
                    >
                      <input type="checkbox" checked={!!createChecked[doc.id]} readOnly tabIndex={-1} />
                      <span>
                        <span style={{ display: "block", color: t.ink, fontWeight: 750 }}>{doc.name}</span>
                        <span style={{ color: t.ink3, fontSize: 12 }}>{doc.category || "Standard Lending File"}</span>
                        {doc.description ? <span style={{ display: "block", color: t.ink3, fontSize: 12, marginTop: 4 }}>{doc.description}</span> : null}
                        {doc.allow_multiple_files ? <span style={{ display: "block", color: t.ink2, fontSize: 12, marginTop: 4 }}>Multiple files allowed</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </PanelBox>

              <PanelBox>
                <WorkflowHeader
                  step="3"
                  title="Invite uploaders"
                  subtitle="Add the people who should receive upload links for this bucket. You can add more than one."
                />
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 10, marginTop: 12 }}>
                  <input style={field} placeholder="Person or company name" value={createInviteDraft.recipient_name} onChange={(e) => setCreateInviteDraft({ ...createInviteDraft, recipient_name: e.target.value })} />
                  <input style={field} placeholder="Email optional" value={createInviteDraft.recipient_email} onChange={(e) => setCreateInviteDraft({ ...createInviteDraft, recipient_email: e.target.value })} />
                  <input style={field} placeholder="Upload access code" value={createInviteDraft.passcode} onChange={(e) => setCreateInviteDraft({ ...createInviteDraft, passcode: e.target.value })} />
                  <button style={secondary} onClick={() => setCreateInviteDraft({ ...createInviteDraft, passcode: generateAccessCode() })}>
                    Generate code
                  </button>
                  <button style={secondary} onClick={addCreateInvite} disabled={!createInviteDraft.recipient_name.trim()}>
                    <Icon name="plus" size={14} />
                    Add invite
                  </button>
                  <div style={{ color: t.ink3, fontSize: 12, alignSelf: "center" }}>Send this code with the upload link.</div>
                </div>
                {createInvites.length ? (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {createInvites.map((invite) => (
                      <div key={invite.id} style={smallRowStyle(t)}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ color: t.ink }}>{invite.recipient_name}</strong>
                          <div style={{ color: t.ink3, fontSize: 12 }}>{invite.recipient_email || "No email entered"}</div>
                          <div style={{ color: t.ink2, fontSize: 13, marginTop: 2 }}>Upload access code: <strong>{invite.passcode}</strong></div>
                        </div>
                        <button
                          style={iconButtonStyle(t)}
                          onClick={() => setCreateInvites((rows) => rows.filter((row) => row.id !== invite.id))}
                          aria-label={`Remove ${invite.recipient_name}`}
                          title="Remove invite"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div style={{ color: t.ink3, fontSize: 12.5, marginTop: 10 }}>
                  Upload links are created after the bucket is created. Leave this blank if you only want to set up the bucket for now.
                </div>
              </PanelBox>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button style={secondary} onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
                <button style={{ ...primary, minWidth: 142, opacity: busy || !bucketForm.name.trim() ? 0.72 : 1 }} onClick={createBucketWorkflow} disabled={busy || !bucketForm.name.trim()}>
                  {busy ? (
                    <>
                      <Icon name="refresh" size={14} />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Icon name="plus" size={14} />
                      Create bucket
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </ModalFrame>
      ) : null}

      {detail ? (
        <ModalFrame
          title={detail.name}
          subtitle={`${detail.client_name || "No client"} | ${detail.purpose || "No purpose"} | ${detail.bucket_type || "Bucket"}`}
          onClose={() => setDetail(null)}
          action={
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <button
                style={{
                  ...iconButtonStyle(t),
                  borderColor: detailFocus === "vendors" ? t.petrol : t.line,
                  background: detailFocus === "vendors" ? t.petrolSoft : t.surface,
                  color: detailFocus === "vendors" ? t.petrol : t.ink2,
                }}
                onClick={showVendorSettings}
                aria-label="Open vendor access settings"
                title="Vendor access - login required"
              >
                <Icon name="user" size={16} />
              </button>
              <button
                style={{
                  ...iconButtonStyle(t),
                  borderColor: aiPanelOpen ? t.petrol : t.line,
                  background: aiPanelOpen ? t.petrolSoft : t.surface,
                  color: aiPanelOpen ? t.petrol : t.ink2,
                }}
                onClick={() => {
                  setAiPanelOpen((value) => !value);
                  setAiMode("actions");
                }}
                aria-label="Toggle AI actions"
                title="AI review, chat, and tasks"
              >
                <Icon name="spark" size={16} />
              </button>
              <div ref={shareMenuRef} style={{ position: "relative" }}>
                <button
                  style={{
                    ...iconButtonStyle(t),
                    width: "auto",
                    padding: "0 12px",
                    borderColor: sharePopupOpen ? t.petrol : t.line,
                    background: sharePopupOpen ? t.petrolSoft : t.surface,
                    color: sharePopupOpen ? t.petrol : t.ink2,
                    gap: 6,
                  }}
                  onClick={() => {
                    setSharePopupOpen((value) => !value);
                  }}
                  aria-label="Create no-login share link"
                  title="Third-party share link - no login"
                >
                  <Icon name="link" size={16} />
                  <span style={{ fontSize: 12, fontWeight: 900 }}>Bank share</span>
                </button>
                {sharePopupOpen ? (
                  <div style={sharePopupStyle(t)}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", paddingBottom: 10, borderBottom: `1px solid ${t.line}` }}>
                    <div>
                      <div style={{ color: t.ink, fontWeight: 900, fontSize: 14 }}>Bank / third-party share link</div>
                      <div style={{ color: t.ink3, fontSize: 12, marginTop: 2 }}>No account login. Send a secure link plus access code.</div>
                    </div>
                    <button style={iconButtonStyle(t)} onClick={() => setSharePopupOpen(false)} aria-label="Close share popup">
                      <Icon name="x" size={14} />
                    </button>
                  </div>

                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface2, padding: 10, display: "grid", gap: 7 }}>
                      <strong style={{ color: t.ink, fontSize: 12 }}>This creates a share link, not a vendor account.</strong>
                      <span style={{ color: t.ink3, fontSize: 12, lineHeight: 1.35 }}>
                        Use this for banks, lenders, and one-time third parties. For account-based vendor access, use the Vendors section.
                      </span>
                    </div>
                    {createdShareLinks.length ? (
                      <div style={{ border: `1px solid ${t.profit}`, borderRadius: 12, background: t.profitBg, padding: 10, display: "grid", gap: 8 }}>
                        <strong style={{ color: t.profit, fontSize: 12 }}>Share link ready</strong>
                        {createdShareLinks.map((share) => (
                          <div key={share.id} style={{ display: "grid", gap: 7, borderTop: `1px solid ${t.line}`, paddingTop: 8 }}>
                            <div style={{ color: t.ink, fontWeight: 900, fontSize: 13 }}>
                              {share.recipient_name}
                            </div>
                            <div style={{ color: t.ink3, fontSize: 12 }}>
                              {share.files?.length ?? 0} files | {share.can_download ? "download allowed" : "view only"} | no login required
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button style={secondary} onClick={() => copyShareLink(share)}>Copy link</button>
                              <button style={secondary} onClick={() => copyShareInvite(share)}>Copy link + access code</button>
                              <button style={secondary} onClick={() => openEmailShare(share)}>Email from my Gmail</button>
                            </div>
                          </div>
                        ))}
                        <button style={secondary} onClick={() => setCreatedShareLinks([])}>
                          Create another share
                        </button>
                      </div>
                    ) : null}
                    {visibleFiles.length === 0 ? (
                      <div style={emptyInlineStyle(t)}>Upload files before creating share links.</div>
                    ) : null}
                    <div style={{ display: "grid", gap: 8, maxHeight: 560, overflowY: "auto" }}>
                      {shareViewers.map((viewer, index) => (
                        <div key={viewer.id} style={shareViewerRowStyle(t)}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <strong style={{ color: t.ink, fontSize: 13 }}>Viewer {index + 1}</strong>
                            <button style={iconButtonStyle(t)} onClick={() => removeShareViewer(viewer.id)} disabled={shareViewers.length === 1} aria-label={`Remove viewer ${index + 1}`}>
                              <Icon name="x" size={13} />
                            </button>
                          </div>
                          <input style={field} placeholder="Viewer name" value={viewer.recipient_name} onChange={(event) => updateShareViewer(viewer.id, { recipient_name: event.target.value })} />
                          <input style={field} placeholder="Viewer email optional" value={viewer.recipient_email} onChange={(event) => updateShareViewer(viewer.id, { recipient_email: event.target.value })} />
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                            <input style={field} placeholder="Access code" value={viewer.passcode} onChange={(event) => updateShareViewer(viewer.id, { passcode: event.target.value })} />
                            <button style={secondary} onClick={() => generateShareCode(viewer.id)}>Generate</button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
                            <label style={permissionRowStyle(t)}>
                              <span>
                                <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>Allow download</strong>
                                <span style={{ color: t.ink3, fontSize: 12 }}>Otherwise preview only.</span>
                              </span>
                              <input type="checkbox" checked={viewer.can_download} onChange={(event) => updateShareViewer(viewer.id, { can_download: event.target.checked })} />
                            </label>
                            <label style={permissionRowStyle(t)}>
                              <span>
                                <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>Expires</strong>
                                <span style={{ color: t.ink3, fontSize: 12 }}>Default 7 days.</span>
                              </span>
                              <select style={{ ...field, width: 92 }} value={viewer.expires_days} onChange={(event) => updateShareViewer(viewer.id, { expires_days: Number(event.target.value) })}>
                                <option value={1}>1 day</option>
                                <option value={7}>7 days</option>
                                <option value={14}>14 days</option>
                                <option value={30}>30 days</option>
                              </select>
                            </label>
                          </div>
                          {renderShareFilePicker({
                            selectedIds: viewer.file_ids,
                            search: viewer.file_search,
                            onSearch: (value) => updateShareViewer(viewer.id, { file_search: value }),
                            onToggle: (fileId) => toggleShareViewerFile(viewer.id, fileId),
                            onSetSelected: (fileIds) => setShareViewerFileIds(viewer.id, fileIds),
                          })}
                        </div>
                      ))}
                    </div>
                    <button style={secondary} onClick={addShareViewer}>
                      <Icon name="plus" size={14} />
                      Add another user
                    </button>
                    <button style={{ ...primary, width: "100%", opacity: canCreateShareLinks ? 1 : 0.68 }} onClick={() => createShareLinks().catch((e) => setNotice(readableError(e)))} disabled={!canCreateShareLinks}>
                      {busy ? "Creating links..." : "Create share links"}
                    </button>
                  </div>
                  </div>
                ) : null}
              </div>
            </div>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, .65fr)", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
              <PanelBox style={{ borderColor: isAdminUploadDragging ? t.petrol : t.line }}>
                <SectionLabel action={`${adminUploadFiles.length} queued${adminUploadDraftStatus ? ` | ${adminUploadDraftStatus === "saving" ? "saving" : "saved"}` : ""}`}>Upload on behalf</SectionLabel>
                <input ref={adminFileInputRef} type="file" multiple hidden onChange={(event) => event.target.files && addAdminUploadFiles(event.target.files)} />
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 8 }}>
                  <input
                    style={field}
                    placeholder="Uploaded for"
                    value={adminUploadForm.uploader_name}
                    onChange={(event) => setAdminUploadForm({ ...adminUploadForm, uploader_name: event.target.value })}
                  />
                  <input
                    style={field}
                    placeholder="Email optional"
                    value={adminUploadForm.uploader_email}
                    onChange={(event) => setAdminUploadForm({ ...adminUploadForm, uploader_email: event.target.value })}
                  />
                  <button style={secondary} onClick={() => adminFileInputRef.current?.click()} disabled={adminUploading}>
                    <Icon name="upload" size={14} />
                    Choose files
                  </button>
                  <textarea
                    style={{ ...field, gridColumn: "1 / -1", minHeight: 62, paddingTop: 10, resize: "vertical" }}
                    placeholder="Internal note optional"
                    value={adminUploadForm.note}
                    onChange={(event) => setAdminUploadForm({ ...adminUploadForm, note: event.target.value })}
                  />
                </div>
                <div style={{ color: t.ink3, fontSize: 12, marginTop: 7 }}>
                  Upload-on-behalf details autosave for this bucket and are applied to every queued file when uploaded.
                </div>
                <div
                  style={adminUploadDropZoneStyle(t, isAdminUploadDragging)}
                  onClick={() => adminFileInputRef.current?.click()}
                  onDragOver={onAdminUploadDragOver}
                  onDragLeave={onAdminUploadDragLeave}
                  onDrop={onAdminUploadDrop}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      adminFileInputRef.current?.click();
                    }
                  }}
                >
                  <Icon name="upload" size={18} />
                  <div>
                    <strong style={{ display: "block", color: t.ink }}>Drop files here or choose files</strong>
                    <span style={{ color: t.ink3, fontSize: 12 }}>Leave a file as General upload when it does not match a requested task.</span>
                  </div>
                </div>
                {adminUploadFiles.length ? (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {adminUploadFiles.map((item) => (
                      <div key={item.id} style={adminUploadRowStyle(t)}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: "block", color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.file.name}</strong>
                          <span style={{ color: item.status === "error" ? t.danger : t.ink3, fontSize: 12 }}>
                            {formatSize(item.file.size)} | {item.message || statusLabel(item.status)}
                          </span>
                        </div>
                        <select
                          style={field}
                          value={item.requested_document_id}
                          onChange={(event) => updateAdminUploadFile(item.id, { requested_document_id: event.target.value, status: "ready", message: undefined })}
                          disabled={adminUploading || item.status === "uploaded"}
                          aria-label={`Assign ${item.file.name} to a requested document`}
                        >
                          <option value="">General upload / unmatched</option>
                          {detail.requested_documents.map((doc) => {
                            const alreadyUploaded = doc.status === "uploaded" && !doc.allow_multiple_files;
                            const linkedByQueuedFile = adminUploadFiles.some((file) => file.id !== item.id && file.requested_document_id === doc.id && file.status !== "error");
                            const disabled = alreadyUploaded || (!doc.allow_multiple_files && linkedByQueuedFile);
                            return <option key={doc.id} value={doc.id} disabled={disabled}>{doc.name}{disabled ? " - already used" : ""}</option>;
                          })}
                        </select>
                        <button style={iconButtonStyle(t)} onClick={() => removeAdminUploadFile(item.id)} disabled={adminUploading || item.status === "uploaded"} aria-label={`Remove ${item.file.name}`} title="Remove file">
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={emptyInlineStyle(t)}>Choose files from your computer and assign them to a requested item or leave them as general uploads.</div>
                )}
                {adminUploadStatus ? <CreateStatusBanner status={adminUploadStatus} /> : null}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button style={{ ...primary, minWidth: 148, opacity: canAdminUpload ? 1 : 0.68 }} onClick={submitAdminUploads} disabled={!canAdminUpload}>
                    {adminUploading ? "Uploading..." : "Upload files"}
                  </button>
                </div>
              </PanelBox>

              <PanelBox>
                <SectionLabel action={`${visibleFiles.length} uploaded`}>Files</SectionLabel>
                {visibleFiles.length === 0 ? (
                  <EmptyInline icon="file" title="No files uploaded yet" body="Files uploaded through request links will appear here." />
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {visibleFiles.map((file) => {
                      const blocked = blockedReviewFiles.get(file.id);
                      return (
                      <div key={file.id} style={{ ...fileRowStyle(t), borderColor: blocked ? t.danger : t.line, background: blocked ? t.dangerBg : t.surface2 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <input type="checkbox" checked={!!shareFiles[file.id]} onChange={(e) => setShareFiles({ ...shareFiles, [file.id]: e.target.checked })} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", color: blocked ? t.danger : t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</span>
                            <span style={{ color: blocked ? t.danger : t.ink3, fontSize: 12 }}>
                              {file.uploaded_by_name || "Unknown"} | {formatSize(file.size_bytes)} | {formatDate(file.created_at)}
                            </span>
                            {blocked ? <span style={{ display: "block", color: t.danger, fontSize: 12, marginTop: 3 }}>{blocked.explanation || "Password-protected PDF. Upload an unlocked copy for AI review."}</span> : null}
                          </span>
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={secondary} onClick={() => openFile(file, false)}>
                            <Icon name="eye" size={13} />
                            Preview
                          </button>
                          <button style={secondary} onClick={() => openFile(file, true)}>
                            <Icon name="download" size={13} />
                            Download
                          </button>
                          <button
                            style={{ ...secondary, color: t.danger, borderColor: t.danger }}
                            onClick={() => deleteFile(file).catch(() => undefined)}
                            disabled={deletingFileId === file.id}
                          >
                            <Icon name="x" size={13} />
                            {deletingFileId === file.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </PanelBox>

              <PanelBox>
                <SectionLabel action={`${detail.requested_documents.length} items`}>Tasks</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  {detail.requested_documents.length === 0 ? (
                    <EmptyInline icon="docCheck" title="No requested-file tasks" body="Tasks are created from requested documents." />
                  ) : detail.requested_documents.map((doc) => (
                    <div key={doc.id} style={smallRowStyle(t)}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: t.ink }}>{doc.name}</strong>
                        <div style={{ color: t.ink3, fontSize: 12 }}>
                          {doc.category || "General"}{doc.required ? " | Required" : ""}{doc.allow_multiple_files ? " | Multiple files" : ""}
                        </div>
                        {doc.description ? <div style={{ color: t.ink3, fontSize: 12, marginTop: 3 }}>{doc.description}</div> : null}
                      </div>
                      <Pill color={doc.status === "uploaded" ? t.profit : undefined} bg={doc.status === "uploaded" ? t.profitBg : undefined}>
                        {statusLabel(doc.status)}
                      </Pill>
                    </div>
                  ))}
                </div>
              </PanelBox>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {aiPanelOpen ? (
                <PanelBox>
                  <SectionLabel
                    action={
                      aiMode === "review"
                        ? (aiReviews[0] ? statusLabel(aiReviews[0].status) : "No review")
                        : aiMode === "chat"
                          ? `${aiMessages.length} messages`
                          : `${aiActions.filter((item) => item.status === "proposed").length} pending`
                    }
                  >
                    Bucket AI Workspace
                  </SectionLabel>
                  <div style={modeToggleStyle(t)}>
                    {([
                      ["review", "Underwriting review"],
                      ["chat", "Chat"],
                      ["actions", "Actions"],
                    ] as const).map(([mode, label]) => (
                      <button key={mode} style={modeButtonStyle(t, aiMode === mode)} onClick={() => setAiMode(mode)}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {aiMode === "review" ? (
                    <>
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        <input style={field} placeholder="Deal type / program" value={aiContextDraft.deal_type ?? ""} onChange={(event) => setAiContextDraft({ ...aiContextDraft, deal_type: event.target.value })} />
                        <input style={field} placeholder="Documentation level" value={aiContextDraft.documentation_level ?? ""} onChange={(event) => setAiContextDraft({ ...aiContextDraft, documentation_level: event.target.value })} />
                        <input style={field} placeholder="Collateral type" value={aiContextDraft.collateral_type ?? ""} onChange={(event) => setAiContextDraft({ ...aiContextDraft, collateral_type: event.target.value })} />
                        <input style={field} placeholder="Loan purpose" value={aiContextDraft.loan_purpose ?? ""} onChange={(event) => setAiContextDraft({ ...aiContextDraft, loan_purpose: event.target.value })} />
                        <textarea
                          style={{ ...field, minHeight: 66, paddingTop: 10, resize: "vertical" }}
                          placeholder="Underwriting focus"
                          value={aiContextDraft.underwriting_focus ?? ""}
                          onChange={(event) => setAiContextDraft({ ...aiContextDraft, underwriting_focus: event.target.value })}
                        />
                        <textarea
                          style={{ ...field, minHeight: 76, paddingTop: 10, resize: "vertical" }}
                          placeholder="Custom AI instructions"
                          value={aiContextDraft.custom_instructions ?? ""}
                          onChange={(event) => setAiContextDraft({ ...aiContextDraft, custom_instructions: event.target.value })}
                        />
                        <button style={{ ...primary, opacity: aiBusy || !visibleFiles.length ? 0.68 : 1 }} disabled={aiBusy || !visibleFiles.length} onClick={() => queueAIReview().catch((e) => setNotice(String(e)))}>
                          {aiBusy ? "Working..." : aiReviews.length ? "Reanalyze files" : "Run AI review"}
                        </button>
                      </div>
                      {aiReviews[0] ? (
                        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                          {aiReviews[0].error ? <div style={{ ...emptyInlineStyle(t), color: t.danger }}>{aiReviews[0].error}</div> : null}
                          {aiReviews[0].result ? <AIReviewResult t={t} result={aiReviews[0].result} /> : <div style={emptyInlineStyle(t)}>Review is {statusLabel(aiReviews[0].status).toLowerCase()}.</div>}
                        </div>
                      ) : (
                        <div style={{ ...emptyInlineStyle(t), marginTop: 10 }}>Run a review after entering the deal context. The AI will summarize available files, missing items, discrepancies, and underwriter questions.</div>
                      )}
                    </>
                  ) : null}

                  {aiMode === "chat" ? (
                    <>
                      {blockedReviewFiles.size ? (
                        <div style={blockedFilesPanelStyle(t)}>
                          <strong>Password required before AI can read {blockedReviewFiles.size} file{blockedReviewFiles.size === 1 ? "" : "s"}.</strong>
                          <span>Upload unlocked copies or replace those files, then reanalyze.</span>
                        </div>
                      ) : null}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                        <button style={secondary} disabled={aiBusy || !visibleFiles.length} onClick={() => queueAIReview().catch((e) => setNotice(String(e)))}>
                          <Icon name="refresh" size={14} />
                          Reanalyze files
                        </button>
                      </div>
                      <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto", marginTop: 10 }}>
                        {aiMessages.length === 0 ? (
                          <div style={emptyInlineStyle(t)}>Ask about this bucket or tell the AI how to adjust its underwriting instructions.</div>
                        ) : aiMessages.slice(-12).map((message) => (
                          <div key={message.id} style={{ ...smallRowStyle(t), background: message.role === "assistant" ? t.surface2 : t.surface }}>
                            <strong style={{ color: t.ink }}>{message.role === "assistant" ? "Bucket AI" : message.author_name || "You"}</strong>
                            <div style={{ color: t.ink2, fontSize: 13, whiteSpace: "pre-wrap", marginTop: 4 }}>{message.content}</div>
                            {message.proposed_context_patch ? (
                              <button style={{ ...secondary, marginTop: 8 }} onClick={() => applyAIContextPatch(message.proposed_context_patch || {}).catch((e) => setNotice(String(e)))}>
                                Apply suggested instructions
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, marginTop: 10 }}>
                        <input
                          style={field}
                          placeholder="Ask Bucket AI..."
                          value={aiChatText}
                          onChange={(event) => setAiChatText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") sendAIChat().catch((e) => setNotice(String(e)));
                          }}
                        />
                        <button style={secondary} disabled={aiBusy || !aiChatText.trim()} onClick={() => sendAIChat().catch((e) => setNotice(String(e)))}>Send</button>
                      </div>
                    </>
                  ) : null}

                  {aiMode === "actions" ? (
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      <button style={secondary} onClick={() => setManualActionOpen((value) => !value)}>
                        <Icon name="plus" size={14} />
                        Create manual task
                      </button>
                      {manualActionOpen ? (
                        <div style={manualActionFormStyle(t)}>
                          <input style={field} placeholder="Task title" value={manualActionDraft.title} onChange={(event) => setManualActionDraft({ ...manualActionDraft, title: event.target.value })} />
                          <textarea
                            style={{ ...field, minHeight: 74, paddingTop: 10, resize: "vertical" }}
                            placeholder="Instructions"
                            value={manualActionDraft.instructions}
                            onChange={(event) => setManualActionDraft({ ...manualActionDraft, instructions: event.target.value })}
                          />
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <select
                              style={field}
                              value={manualActionDraft.route}
                              onChange={(event) => setManualActionDraft({ ...manualActionDraft, route: event.target.value as ManualActionDraft["route"], upload_link_id: "", share_id: "", vendor_access_id: "" })}
                            >
                              <option value="admin">Route to admin</option>
                              <option value="uploader">Route to uploader/client</option>
                              <option value="share">Route to shared viewer</option>
                              <option value="vendor">Route to vendor</option>
                            </select>
                            {manualActionDraft.route === "uploader" ? (
                              <select style={field} value={manualActionDraft.upload_link_id} onChange={(event) => setManualActionDraft({ ...manualActionDraft, upload_link_id: event.target.value })}>
                                <option value="">All upload clients</option>
                                {(detail.upload_links ?? []).map((link) => (
                                  <option key={link.id} value={link.id}>{link.recipient_name}</option>
                                ))}
                              </select>
                            ) : manualActionDraft.route === "share" ? (
                              <select style={field} value={manualActionDraft.share_id} onChange={(event) => setManualActionDraft({ ...manualActionDraft, share_id: event.target.value })}>
                                <option value="">Select share recipient</option>
                                {detail.shares.map((share) => (
                                  <option key={share.id} value={share.id}>{share.recipient_name}</option>
                                ))}
                              </select>
                            ) : manualActionDraft.route === "vendor" ? (
                              <select style={field} value={manualActionDraft.vendor_access_id} onChange={(event) => setManualActionDraft({ ...manualActionDraft, vendor_access_id: event.target.value })}>
                                <option value="">Select vendor</option>
                                {(detail.vendor_access ?? []).filter((access) => access.status === "active").map((access) => (
                                  <option key={access.id} value={access.id}>{access.vendor_name || access.vendor_email || "Vendor"}</option>
                                ))}
                              </select>
                            ) : (
                              <div style={{ ...emptyInlineStyle(t), minHeight: 44, display: "flex", alignItems: "center" }}>Internal admin task</div>
                            )}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <select style={field} value={manualActionDraft.file_id} onChange={(event) => setManualActionDraft({ ...manualActionDraft, file_id: event.target.value })}>
                              <option value="">No specific file</option>
                              {visibleFiles.map((file) => (
                                <option key={file.id} value={file.id}>{file.file_name}</option>
                              ))}
                            </select>
                            <select style={field} value={manualActionDraft.requested_document_id} onChange={(event) => setManualActionDraft({ ...manualActionDraft, requested_document_id: event.target.value })}>
                              <option value="">No request item</option>
                              {detail.requested_documents.map((doc) => (
                                <option key={doc.id} value={doc.id}>{doc.name}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button style={secondary} onClick={() => setManualActionOpen(false)}>Cancel</button>
                            <button style={primary} onClick={() => createManualAIAction().catch((e) => setNotice(String(e)))} disabled={!manualActionDraft.title.trim() || !manualActionDraft.instructions.trim()}>
                              Create task
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {aiActions.length === 0 ? (
                        <div style={emptyInlineStyle(t)}>No action tasks yet. Create one manually or approve AI proposals from chat/review.</div>
                      ) : aiActions.slice(0, 10).map((item) => (
                        <div key={item.id} style={smallRowStyle(t)}>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ color: t.ink }}>{item.title}</strong>
                            <div style={{ color: t.ink3, fontSize: 12 }}>
                              {statusLabel(item.route)} | {statusLabel(item.status)} | {item.created_by === "admin" ? "Manual" : "AI"}
                            </div>
                            <div style={{ color: t.ink2, fontSize: 13, marginTop: 4 }}>{item.instructions}</div>
                            {item.rationale ? <div style={{ color: t.ink3, fontSize: 12, marginTop: 4 }}>{item.rationale}</div> : null}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {item.status === "proposed" ? (
                              <>
                                <button style={secondary} onClick={() => patchAIAction(item, { status: "approved" }).catch((e) => setNotice(String(e)))}>Approve</button>
                                <button style={secondary} onClick={() => patchAIAction(item, { status: "rejected" }).catch((e) => setNotice(String(e)))}>Reject</button>
                              </>
                            ) : null}
                            {item.status === "approved" ? <button style={secondary} onClick={() => patchAIAction(item, { status: "completed" }).catch((e) => setNotice(String(e)))}>Complete</button> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </PanelBox>
              ) : null}

              <PanelBox>
                <SectionLabel>Notes</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                  <input style={field} placeholder="Add admin note" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
                  <button style={secondary} onClick={addNote} disabled={!adminNote.trim()}>Add</button>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {detail.notes.length === 0 ? (
                    <div style={{ color: t.ink3, fontSize: 13 }}>No notes yet.</div>
                  ) : detail.notes.map((note) => (
                    <div key={note.id} style={{ borderTop: `1px solid ${t.line}`, paddingTop: 8, color: t.ink2, fontSize: 13 }}>
                      <strong>{note.author_name || "Admin"}</strong> | {formatDate(note.created_at)}
                      <div style={{ marginTop: 3 }}>{note.content}</div>
                    </div>
                  ))}
                </div>
              </PanelBox>

              <PanelBox>
                <SectionLabel action={`${detail.upload_links?.length ?? 0} invites`}>Client Upload Invites</SectionLabel>
                <div style={{ color: t.ink3, fontSize: 12.5, marginBottom: 8 }}>
                  For clients or upload parties to add documents. Uses an upload link and access code.
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
                    <input
                      style={field}
                      placeholder="Client/uploader name"
                      value={uploadLinkDraft.recipient_name}
                      onChange={(event) => setUploadLinkDraft({ ...uploadLinkDraft, recipient_name: event.target.value })}
                    />
                    <input
                      style={field}
                      placeholder="Email optional"
                      value={uploadLinkDraft.recipient_email}
                      onChange={(event) => setUploadLinkDraft({ ...uploadLinkDraft, recipient_email: event.target.value })}
                    />
                    <input
                      style={field}
                      placeholder="Upload access code"
                      value={uploadLinkDraft.passcode}
                      onChange={(event) => setUploadLinkDraft({ ...uploadLinkDraft, passcode: event.target.value })}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: 8 }}>
                      <button style={secondary} onClick={() => setUploadLinkDraft({ ...uploadLinkDraft, passcode: generateAccessCode() })}>Generate</button>
                      <button style={primary} onClick={() => createBucketUploadLink().catch((e) => setNotice(String(e)))} disabled={!uploadLinkDraft.recipient_name.trim()}>
                        Create
                      </button>
                    </div>
                  </div>
                  {(detail.upload_links ?? []).length === 0 ? (
                    <div style={emptyInlineStyle(t)}>No upload links yet. Create one here to invite a client after bucket creation.</div>
                  ) : (detail.upload_links ?? []).map((link) => {
                    const isOpen = expandedUploadLinkId === link.id;
                    const passcodeAvailable = Boolean(uploadLinkPasscodes[link.id] || link.passcode);
                    const isExpired = Boolean(link.expires_at && new Date(link.expires_at).getTime() <= Date.now());
                    const effectiveStatus = isExpired ? "Expired" : statusLabel(link.status);
                    return (
                      <div key={link.id} style={{ ...compactExpandableStyle(t, isOpen), display: "grid", gap: isOpen ? 10 : 0 }}>
                        <button
                          type="button"
                          onClick={() => setExpandedUploadLinkId(isOpen ? null : link.id)}
                          style={compactHeaderButtonStyle(t)}
                          aria-expanded={isOpen}
                        >
                          <div style={{ minWidth: 0, textAlign: "left" }}>
                            <strong style={{ color: t.ink }}>{link.recipient_name}</strong>
                            <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              Client upload invite | {link.recipient_email || "No email"} | {link.completed_at ? "submitted" : "open"}
                            </div>
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <Pill color={isExpired ? t.danger : undefined} bg={isExpired ? t.dangerBg : undefined}>{effectiveStatus}</Pill>
                            <Icon name={isOpen ? "chevU" : "chevD"} size={14} />
                          </div>
                        </button>
                        {isOpen ? (
                          <div style={{ display: "grid", gap: 8, paddingTop: 8, borderTop: `1px solid ${t.line}` }}>
                            <div style={{ color: t.ink3, fontSize: 12 }}>
                              Upload link with access code | Created {formatDate(link.created_at)} | Expires {formatDate(link.expires_at)} | Completed {formatDateTime(link.completed_at)}
                            </div>
                            {link.upload_url ? <code style={{ color: t.ink2, fontSize: 12, overflowWrap: "anywhere" }}>{link.upload_url}</code> : null}
                            {!passcodeAvailable ? (
                              <div style={emptyInlineStyle(t)}>Access code is secured. Regenerate to copy a new invite.</div>
                            ) : null}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              <button style={secondary} onClick={() => copyUploadLink(link)}>Copy link</button>
                              <button style={secondary} onClick={() => regenerateUploadLinkPasscode(link).catch((e) => setNotice(String(e)))}>Regenerate code</button>
                              <button style={secondary} onClick={() => copyUploadInvite(link)} disabled={!passcodeAvailable}>Copy invite</button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </PanelBox>

              <div id="bucket-vendors-panel" style={{ scrollMarginTop: 18 }}>
              <PanelBox style={{ borderColor: detailFocus === "vendors" ? t.petrol : t.line }}>
                <SectionLabel action={`${detail.vendor_access?.length ?? 0} vendors`}>Vendor Accounts</SectionLabel>
                <div style={{ color: t.ink3, fontSize: 12.5, marginBottom: 8 }}>
                  For recurring vendors who log in and see assigned buckets. This is not the bank share link workflow.
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gap: 8, padding: 10, border: `1px solid ${t.line}`, borderRadius: 8, background: t.surface2 }}>
                    <select
                      style={field}
                      value={vendorDraft.vendor_user_id}
                      onChange={(event) => {
                        const vendor = vendors.find((row) => row.id === event.target.value);
                        setVendorDraft({
                          ...vendorDraft,
                          vendor_user_id: event.target.value,
                          vendor_name: vendor?.name ?? "",
                          vendor_email: vendor?.email ?? "",
                        });
                      }}
                    >
                      <option value="">New vendor or choose existing</option>
                      {vendors.map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>{vendor.name} | {vendor.email}</option>
                      ))}
                    </select>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
                      <input
                        style={field}
                        placeholder="Vendor name"
                        value={vendorDraft.vendor_name}
                        onChange={(event) => setVendorDraft({ ...vendorDraft, vendor_user_id: "", vendor_name: event.target.value })}
                      />
                      <input
                        style={field}
                        placeholder="Vendor email"
                        value={vendorDraft.vendor_email}
                        onChange={(event) => setVendorDraft({ ...vendorDraft, vendor_user_id: "", vendor_email: event.target.value })}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <select style={field} value={vendorDraft.file_scope} onChange={(event) => setVendorDraft({ ...vendorDraft, file_scope: event.target.value as VendorAccessDraft["file_scope"] })}>
                        <option value="all_active">All active files</option>
                        <option value="selected">Selected files</option>
                      </select>
                      <select style={field} value={vendorDraft.expires_days} onChange={(event) => setVendorDraft({ ...vendorDraft, expires_days: Number(event.target.value) })}>
                        <option value={1}>Expires 1 day</option>
                        <option value={7}>Expires 7 days</option>
                        <option value={14}>Expires 14 days</option>
                        <option value={30}>Expires 30 days</option>
                        <option value={0}>No expiration</option>
                      </select>
                    </div>
                    {vendorDraft.file_scope === "selected" ? renderShareFilePicker({
                      selectedIds: vendorDraft.file_ids,
                      search: vendorDraft.file_search,
                      onSearch: (value) => setVendorDraft({ ...vendorDraft, file_search: value }),
                      onToggle: (fileId) => setVendorDraft({
                        ...vendorDraft,
                        file_ids: vendorDraft.file_ids.includes(fileId)
                          ? vendorDraft.file_ids.filter((id) => id !== fileId)
                          : [...vendorDraft.file_ids, fileId],
                      }),
                      onSetSelected: (fileIds) => setVendorDraft({ ...vendorDraft, file_ids: fileIds }),
                    }) : (
                      <div style={emptyInlineStyle(t)}>Vendor will see all current and future active files in this bucket.</div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <label style={permissionRowStyle(t)}>
                        <span>
                          <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>Preview</strong>
                          <span style={{ color: t.ink3, fontSize: 12 }}>Allow file previews.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_preview} onChange={(event) => setVendorDraft({ ...vendorDraft, can_preview: event.target.checked })} />
                      </label>
                      <label style={permissionRowStyle(t)}>
                        <span>
                          <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>Download</strong>
                          <span style={{ color: t.ink3, fontSize: 12 }}>Allow file downloads.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_download} onChange={(event) => setVendorDraft({ ...vendorDraft, can_download: event.target.checked })} />
                      </label>
                      <label style={permissionRowStyle(t)}>
                        <span>
                          <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>Notes</strong>
                          <span style={{ color: t.ink3, fontSize: 12 }}>Allow comments.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_add_notes} onChange={(event) => setVendorDraft({ ...vendorDraft, can_add_notes: event.target.checked })} />
                      </label>
                      <label style={permissionRowStyle(t)}>
                        <span>
                          <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>Internal notes</strong>
                          <span style={{ color: t.ink3, fontSize: 12 }}>Show admin/internal notes.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_see_internal_notes} onChange={(event) => setVendorDraft({ ...vendorDraft, can_see_internal_notes: event.target.checked })} />
                      </label>
                      <label style={permissionRowStyle(t)}>
                        <span>
                          <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>AI chat</strong>
                          <span style={{ color: t.ink3, fontSize: 12 }}>Scoped assistant access.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_use_ai_chat} onChange={(event) => setVendorDraft({ ...vendorDraft, can_use_ai_chat: event.target.checked })} />
                      </label>
                      <label style={permissionRowStyle(t)}>
                        <span>
                          <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>AI summary</strong>
                          <span style={{ color: t.ink3, fontSize: 12 }}>Show scoped review summary.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_view_ai_summary} onChange={(event) => setVendorDraft({ ...vendorDraft, can_view_ai_summary: event.target.checked })} />
                      </label>
                      <label style={permissionRowStyle(t)}>
                        <span>
                          <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>AI tasks</strong>
                          <span style={{ color: t.ink3, fontSize: 12 }}>Show approved vendor tasks.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_view_ai_tasks} onChange={(event) => setVendorDraft({ ...vendorDraft, can_view_ai_tasks: event.target.checked })} />
                      </label>
                      <label style={permissionRowStyle(t)}>
                        <span>
                          <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>Propose tasks</strong>
                          <span style={{ color: t.ink3, fontSize: 12 }}>Requires admin approval.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_propose_tasks} onChange={(event) => setVendorDraft({ ...vendorDraft, can_propose_tasks: event.target.checked })} />
                      </label>
                    </div>
                    <button style={primary} onClick={() => createVendorAccess().catch((e) => setNotice(readableError(e)))}>
                      <Icon name="plus" size={14} />
                      Invite / assign vendor
                    </button>
                  </div>

                  {(detail.vendor_access ?? []).length === 0 ? (
                    <div style={emptyInlineStyle(t)}>No vendors assigned. Vendors log in and see assigned buckets without passcodes.</div>
                  ) : (detail.vendor_access ?? []).map((access) => {
                    const files = vendorFilesFor(access);
                    const isOpen = expandedVendorAccessId === access.id;
                    const isExpired = Boolean(access.expires_at && new Date(access.expires_at).getTime() <= Date.now());
                    const isRevoked = access.status === "revoked";
                    const effectiveStatus = isRevoked ? "Revoked" : isExpired ? "Expired" : statusLabel(access.status);
                    return (
                      <div key={access.id} style={{ ...compactExpandableStyle(t, isOpen), display: "grid", gap: isOpen ? 10 : 0 }}>
                        <button
                          type="button"
                          onClick={() => setExpandedVendorAccessId(isOpen ? null : access.id)}
                          style={compactHeaderButtonStyle(t)}
                          aria-expanded={isOpen}
                        >
                          <div style={{ minWidth: 0, textAlign: "left" }}>
                            <strong style={{ color: t.ink }}>{access.vendor_name || access.vendor_email || "Vendor"}</strong>
                            <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              Vendor login | {access.file_scope === "all_active" ? "All active files" : `${files.length} selected files`} | {access.can_download ? "downloads on" : "view only"}
                            </div>
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <Pill color={isRevoked || isExpired ? t.danger : undefined} bg={isRevoked || isExpired ? t.dangerBg : undefined}>{effectiveStatus}</Pill>
                            <Icon name={isOpen ? "chevU" : "chevD"} size={14} />
                          </div>
                        </button>
                        {isOpen ? (
                          <div style={{ display: "grid", gap: 8, paddingTop: 8, borderTop: `1px solid ${t.line}` }}>
                            <div style={{ color: t.ink3, fontSize: 12 }}>
                              {access.vendor_email || "No email"} | Downloads {access.download_count} | Expires {formatDate(access.expires_at)} | Last access {formatDateTime(access.last_accessed_at)}
                            </div>
                            <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface2, padding: 10, display: "grid", gap: 7 }}>
                              <div style={{ color: t.ink3, fontSize: 12, lineHeight: 1.35 }}>
                                Vendor login link is reusable. Vendor access uses their app email login; there is no bucket password to retrieve.
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button style={secondary} onClick={() => copyVendorLoginLink(access)}>Copy login link</button>
                                <button style={secondary} onClick={() => copyVendorInvite(access)}>Copy invite</button>
                              </div>
                            </div>
                            {files.length ? (
                              <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {files.slice(0, 3).map((file) => file.file_name).join(", ")}{files.length > 3 ? ` +${files.length - 3} more` : ""}
                              </div>
                            ) : null}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              <button style={secondary} onClick={() => resendVendorInvite(access).catch((e) => setNotice(readableError(e)))}>Resend invite</button>
                              <button style={secondary} onClick={() => openEditVendorFiles(access)}>Edit files</button>
                              <button style={secondary} onClick={() => patchVendorAccess(access, { file_scope: "all_active", file_ids: [] }).then(() => setNotice("Vendor now sees all active files.")).catch((e) => setNotice(readableError(e)))}>Use all files</button>
                              {isRevoked ? (
                                <button style={secondary} onClick={() => setVendorStatus(access, "active").catch((e) => setNotice(readableError(e)))} disabled={isExpired}>Reactivate</button>
                              ) : (
                                <button style={{ ...secondary, color: t.danger }} onClick={() => setVendorStatus(access, "revoked").catch((e) => setNotice(readableError(e)))}>Revoke</button>
                              )}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              {([
                                ["can_preview", "Preview"],
                                ["can_download", "Download"],
                                ["can_add_notes", "Notes"],
                                ["can_see_internal_notes", "Internal notes"],
                                ["can_use_ai_chat", "AI chat"],
                                ["can_view_ai_summary", "AI summary"],
                                ["can_view_ai_tasks", "AI tasks"],
                                ["can_propose_tasks", "Propose tasks"],
                              ] as const).map(([key, label]) => (
                                <label key={key} style={permissionRowStyle(t)}>
                                  <span style={{ color: t.ink, fontSize: 13, fontWeight: 850 }}>{label}</span>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(access[key])}
                                    onChange={(event) => patchVendorAccess(access, { [key]: event.target.checked }).catch((e) => setNotice(readableError(e)))}
                                  />
                                </label>
                              ))}
                            </div>
                            {editingVendorAccessId === access.id ? (
                              <div style={{ display: "grid", gap: 8, paddingTop: 8, borderTop: `1px solid ${t.line}` }}>
                                <strong style={{ color: t.ink, fontSize: 13 }}>Edit vendor visible files</strong>
                                {renderShareFilePicker({
                                  selectedIds: editingVendorFileIds,
                                  search: editingVendorFileSearch,
                                  onSearch: setEditingVendorFileSearch,
                                  onToggle: (fileId) => setEditingVendorFileIds((ids) => ids.includes(fileId) ? ids.filter((id) => id !== fileId) : [...ids, fileId]),
                                  onSetSelected: setEditingVendorFileIds,
                                })}
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                  <button style={secondary} onClick={() => setEditingVendorAccessId(null)}>Cancel</button>
                                  <button style={primary} onClick={() => saveEditedVendorFiles(access).catch((e) => setNotice(readableError(e)))} disabled={!editingVendorFileIds.length}>Save selected files</button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </PanelBox>
              </div>

              <PanelBox>
                <SectionLabel action={`${detail.shares.length} links`}>Share Links - No Login</SectionLabel>
                <div style={{ color: t.ink3, fontSize: 12.5, marginBottom: 8 }}>
                  For banks, lenders, and one-time third parties. Send the secure link plus access code.
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {detail.shares.length === 0 ? (
                    <div style={{ color: t.ink3, fontSize: 13 }}>No share links yet.</div>
                  ) : detail.shares.map((share) => {
                    const files = shareFilesFor(share);
                    const isExpired = Boolean(share.expires_at && new Date(share.expires_at).getTime() <= Date.now());
                    const isRevoked = share.status === "revoked";
                    const effectiveStatus = isRevoked ? "Revoked" : isExpired ? "Expired" : statusLabel(share.status);
                    const passcodeAvailable = Boolean(sharePasscodes[share.id] || share.passcode);
                    const isOpen = expandedShareId === share.id;
                    return (
                      <div key={share.id} style={{ ...compactExpandableStyle(t, isOpen), display: "grid", gap: isOpen ? 10 : 0 }}>
                        <button
                          type="button"
                          onClick={() => setExpandedShareId(isOpen ? null : share.id)}
                          style={compactHeaderButtonStyle(t)}
                          aria-expanded={isOpen}
                        >
                          <div style={{ minWidth: 0, textAlign: "left" }}>
                            <strong style={{ color: t.ink }}>{share.recipient_name}</strong>
                            <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              No login | access code required | {files.length} file{files.length === 1 ? "" : "s"} | {share.can_download ? "downloads on" : "view only"}
                            </div>
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <Pill color={isRevoked || isExpired ? t.danger : undefined} bg={isRevoked || isExpired ? t.dangerBg : undefined}>{effectiveStatus}</Pill>
                            <Icon name={isOpen ? "chevU" : "chevD"} size={14} />
                          </div>
                        </button>
                        {isOpen ? (
                          <>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start", paddingTop: 8, borderTop: `1px solid ${t.line}` }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: t.ink3, fontSize: 12 }}>No-login third-party share | {share.recipient_email || "No email"} | {files.length} file{files.length === 1 ? "" : "s"}</div>
                            <div style={{ color: t.ink3, fontSize: 12 }}>
                              {share.view_count} views | {share.download_count} downloads | {share.can_download ? "downloads on" : "view only"}
                            </div>
                            <div style={{ color: t.ink3, fontSize: 12 }}>
                              Expires {formatDate(share.expires_at)} | Last access {formatDateTime(share.last_accessed_at)}
                            </div>
                          </div>
                          <Pill color={isRevoked || isExpired ? t.danger : undefined} bg={isRevoked || isExpired ? t.dangerBg : undefined}>{effectiveStatus}</Pill>
                        </div>
                        {files.length ? (
                          <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {files.slice(0, 3).map((file) => file.file_name).join(", ")}{files.length > 3 ? ` +${files.length - 3} more` : ""}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <button style={secondary} onClick={() => copyShareLink(share)}>Copy link</button>
                          <button style={secondary} onClick={() => regenerateSharePasscode(share)}>Regenerate code</button>
                          <button style={secondary} onClick={() => copyShareInvite(share)} disabled={!passcodeAvailable}>Copy invite</button>
                          <button style={secondary} onClick={() => openEmailShare(share)} disabled={!passcodeAvailable}>Email from my Gmail</button>
                          <button style={secondary} onClick={() => openEditShareFiles(share)}>Edit files</button>
                          <select
                            style={{ ...field, width: 118, height: 34, paddingTop: 0, paddingBottom: 0 }}
                            defaultValue=""
                            onChange={(event) => {
                              const days = Number(event.target.value);
                              if (days) void patchShare(share, { expires_at: shareExpiryDate(days) }).then(() => setNotice("Share expiration updated."));
                              event.currentTarget.value = "";
                            }}
                          >
                            <option value="">Extend</option>
                            <option value={1}>1 day</option>
                            <option value={7}>7 days</option>
                            <option value={14}>14 days</option>
                            <option value={30}>30 days</option>
                          </select>
                          {isRevoked ? (
                            <button style={secondary} onClick={() => setShareStatus(share, "active")} disabled={isExpired}>Reactivate</button>
                          ) : (
                            <button style={{ ...secondary, color: t.danger }} onClick={() => setShareStatus(share, "revoked")}>Revoke</button>
                          )}
                        </div>
                        {editingShareId === share.id ? (
                          <div style={{ display: "grid", gap: 8, paddingTop: 8, borderTop: `1px solid ${t.line}` }}>
                            <strong style={{ color: t.ink, fontSize: 13 }}>Edit visible files</strong>
                            {renderShareFilePicker({
                              selectedIds: editingShareFileIds,
                              search: editingShareSearch,
                              onSearch: setEditingShareSearch,
                              onToggle: (fileId) => setEditingShareFileIds((ids) => ids.includes(fileId) ? ids.filter((id) => id !== fileId) : [...ids, fileId]),
                              onSetSelected: setEditingShareFileIds,
                            })}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <button style={secondary} onClick={() => setEditingShareId(null)}>Cancel</button>
                              <button style={primary} onClick={() => saveEditedShareFiles(share)} disabled={!editingShareFileIds.length}>Save files</button>
                            </div>
                          </div>
                          ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </PanelBox>

              <PanelBox>
                <SectionLabel action={`${activityTotal} total`}>Activity</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    style={field}
                    value={activityFilters.q}
                    onChange={(event) => updateActivityFilters({ q: event.target.value })}
                    placeholder="Search activity"
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select style={field} value={activityFilters.action} onChange={(event) => updateActivityFilters({ action: event.target.value })}>
                      <option value="">All actions</option>
                      {ACTIVITY_ACTION_OPTIONS.map((action) => (
                        <option key={action} value={action}>{activityLabel(action)}</option>
                      ))}
                    </select>
                    <select style={field} value={activityFilters.actor_role} onChange={(event) => updateActivityFilters({ actor_role: event.target.value })}>
                      <option value="">All roles</option>
                      {ACTIVITY_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{statusLabel(role)}</option>
                      ))}
                    </select>
                  </div>
                  <select style={field} value={activityFilters.target_type} onChange={(event) => updateActivityFilters({ target_type: event.target.value })}>
                    <option value="">All targets</option>
                    {ACTIVITY_TARGET_OPTIONS.map((target) => (
                      <option key={target} value={target}>{statusLabel(target)}</option>
                    ))}
                  </select>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      style={field}
                      type="date"
                      value={activityFilters.date_from}
                      onChange={(event) => updateActivityFilters({ date_from: event.target.value })}
                      aria-label="Activity from date"
                    />
                    <input
                      style={field}
                      type="date"
                      value={activityFilters.date_to}
                      onChange={(event) => updateActivityFilters({ date_to: event.target.value })}
                      aria-label="Activity to date"
                    />
                  </div>
                  <button
                    style={secondary}
                    onClick={() => {
                      const filters = emptyActivityFilters();
                      setActivityFilters(filters);
                      void loadBucketActivity(detail.id, 0, filters);
                    }}
                  >
                    Clear filters
                  </button>
                  <div style={{ display: "grid", gap: 8, minHeight: 360 }}>
                    {activityLoading && activityRows.length === 0 ? (
                      <div style={emptyInlineStyle(t)}>Loading activity...</div>
                    ) : activityRows.length === 0 ? (
                      <div style={emptyInlineStyle(t)}>No activity matches these filters.</div>
                    ) : activityRows.map((item) => {
                      const isOpen = expandedActivityId === item.id;
                      return (
                        <div key={item.id} style={compactExpandableStyle(t, isOpen)}>
                          <button
                            type="button"
                            onClick={() => setExpandedActivityId(isOpen ? null : item.id)}
                            style={compactHeaderButtonStyle(t)}
                            aria-expanded={isOpen}
                          >
                            <div style={{ minWidth: 0, textAlign: "left" }}>
                              <strong style={{ color: t.ink }}>{activityLabel(item.action)}</strong>
                              <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {activityActor(item)} | {formatDateTime(item.created_at)}
                              </div>
                            </div>
                            <Icon name={isOpen ? "chevU" : "chevD"} size={14} />
                          </button>
                          {isOpen ? (
                            <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 8, color: t.ink2, fontSize: 13 }}>
                              {item.detail ? <div style={{ marginBottom: 6 }}>{item.detail}</div> : null}
                              <div style={{ color: t.ink3, fontSize: 12 }}>
                                {[item.target_type ? statusLabel(item.target_type) : null, item.target_id, item.ip_address].filter(Boolean).join(" | ")}
                              </div>
                              {item.user_agent ? <div style={{ color: t.ink3, fontSize: 12, marginTop: 4, overflowWrap: "anywhere" }}>{item.user_agent}</div> : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <button
                      style={iconButtonStyle(t)}
                      disabled={!canPageActivityBack}
                      onClick={() => detail && loadBucketActivity(detail.id, Math.max(0, activityOffset - ACTIVITY_PAGE_SIZE), activityFilters)}
                      aria-label="Previous activity page"
                      title="Previous"
                    >
                      <Icon name="chevL" size={15} />
                    </button>
                    <div style={{ color: t.ink3, fontSize: 12, fontWeight: 800 }}>
                      {activityPage} / {activityPageCount}
                    </div>
                    <button
                      style={iconButtonStyle(t)}
                      disabled={!canPageActivityForward}
                      onClick={() => detail && loadBucketActivity(detail.id, activityOffset + ACTIVITY_PAGE_SIZE, activityFilters)}
                      aria-label="Next activity page"
                      title="Next"
                    >
                      <Icon name="chevR" size={15} />
                    </button>
                  </div>
                </div>
              </PanelBox>
            </div>
          </div>
        </ModalFrame>
      ) : null}
      {reviewFile ? (
        <BucketFileReviewPanel
          title="Admin file review"
          loadReview={() => loadAdminReview(reviewFile)}
          saveAnnotation={(payload) => saveAdminAnnotation(reviewFile, payload)}
          onDelete={() => deleteFile(reviewFile).catch(() => undefined)}
          onClose={() => setReviewFile(null)}
        />
      ) : null}
      <EmailComposer
        open={emailShare !== null}
        onClose={() => setEmailShare(null)}
        title="Email secure share access"
        defaultTo={emailShare?.recipient_email || ""}
        defaultSubject={detail ? `Secure documents — ${detail.name}` : "Secure documents"}
        defaultBody={emailShare ? shareEmailBody(emailShare) : ""}
        helpText="Sends from your connected Gmail (firm email fallback). The body already includes the secure link and one-time access code — edit anything before sending."
        onSend={sendShareEmail}
      />
    </div>
  );
}

function BucketTable({
  buckets,
  deletingId,
  onSelect,
  onOpenVendors,
  onDelete,
}: {
  buckets: Bucket[];
  deletingId: string | null;
  onSelect: (id: string) => void;
  onOpenVendors: (id: string) => void;
  onDelete: (bucket: Bucket) => void;
}) {
  const { t } = useTheme();
  if (buckets.length === 0) {
    return <div style={{ padding: 18, color: t.ink3, fontSize: 13 }}>No buckets yet. Use Create bucket to start.</div>;
  }
  const columns = "minmax(220px, 1.35fr) minmax(130px, .75fr) minmax(150px, .72fr) 70px minmax(150px, .65fr) 112px 84px 44px";
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: columns, gap: 12, padding: "10px 14px", color: t.ink3, background: t.surface2, borderBottom: `1px solid ${t.line}`, fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" }}>
        <div>Bucket</div>
        <div>Client</div>
        <div>Type</div>
        <div>Files</div>
        <div>Status</div>
        <div>Access</div>
        <div>Updated</div>
        <div></div>
      </div>
      {buckets.map((bucket) => (
        <div
          key={bucket.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(bucket.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(bucket.id);
            }
          }}
          style={{
            boxSizing: "border-box",
            width: "100%",
            display: "grid",
            gridTemplateColumns: columns,
            gap: 12,
            alignItems: "center",
            padding: "13px 14px",
            borderBottom: `1px solid ${t.line}`,
            background: t.surface,
            cursor: "pointer",
            outline: "none",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.name}</div>
            <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.purpose || "No purpose"}</div>
          </div>
          <div style={{ color: t.ink2, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.client_name || "No client"}</div>
          <div style={{ color: t.ink2, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.bucket_type || "Bucket"}</div>
          <div style={{ color: t.ink2, fontSize: 13, fontWeight: 800 }}>{bucket.uploaded_file_count ?? 0}</div>
          <div style={{ minWidth: 0 }}><Pill>{statusLabel(bucket.status)}</Pill></div>
          <button
            style={{ ...miniButtonStyle(t), minHeight: 32, justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={(event) => {
              event.stopPropagation();
              onOpenVendors(bucket.id);
            }}
            title="Open vendor access settings for this bucket"
          >
            <Icon name="user" size={13} />
            Vendors
          </button>
          <div style={{ color: t.ink3, fontSize: 13 }}>{formatDate(bucket.updated_at)}</div>
          <button
            style={{ ...iconButtonStyle(t), color: t.danger }}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(bucket);
            }}
            disabled={deletingId === bucket.id}
            aria-label={`Delete ${bucket.name}`}
            title="Delete bucket"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ModalFrame({
  title,
  subtitle,
  action,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const sidebarOffset = sidebarCollapsed ? 68 : 232;
  return (
    <div style={{ ...modalBackdropStyle, left: sidebarOffset }}>
      <div
        style={{
          ...panelStyle(t),
          width: "100%",
          height: "100%",
          borderRadius: 0,
          borderTop: 0,
          borderRight: 0,
          borderBottom: 0,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${t.line}` }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: t.ink, fontSize: 20, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
            {subtitle ? <div style={{ color: t.ink3, fontSize: 13, marginTop: 3 }}>{subtitle}</div> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {action}
            <button style={iconButtonStyle(t)} onClick={onClose} aria-label="Close">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

function WorkflowHeader({ step, title, subtitle }: { step: string; title: string; subtitle?: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: t.ink, color: t.inverse, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 }}>{step}</div>
      <div>
        <h3 style={{ margin: 0, color: t.ink, fontSize: 16, fontWeight: 850 }}>{title}</h3>
        {subtitle ? <div style={{ color: t.ink3, fontSize: 12.5, marginTop: 3 }}>{subtitle}</div> : null}
      </div>
    </div>
  );
}

function EmptyInline({ icon, title, body }: { icon: string; title: string; body: string }) {
  const { t } = useTheme();
  return (
    <div style={{ ...smallRowStyle(t), justifyContent: "flex-start" }}>
      <Icon name={icon} size={15} style={{ color: t.ink3 }} />
      <div>
        <div style={{ color: t.ink, fontWeight: 800 }}>{title}</div>
        <div style={{ color: t.ink3, fontSize: 12.5 }}>{body}</div>
      </div>
    </div>
  );
}

function CreateStatusBanner({ status }: { status: { kind: "working" | "success" | "error"; message: string } }) {
  const { t } = useTheme();
  const isError = status.kind === "error";
  const isSuccess = status.kind === "success";
  return (
    <PanelBox
      style={{
        borderColor: isError ? t.danger : isSuccess ? t.profit : t.petrol,
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: isError ? t.danger : isSuccess ? t.profit : t.ink2,
      }}
    >
      <Icon name={isError ? "alert" : isSuccess ? "check" : "refresh"} size={15} />
      <span style={{ fontSize: 13, fontWeight: 800 }}>{status.message}</span>
    </PanelBox>
  );
}

function AIReviewResult({ t, result }: { t: ReturnType<typeof useTheme>["t"]; result: Record<string, unknown> }) {
  const summary = stringValue(result.executive_summary) || stringValue(result.summary);
  const blocked = arrayValue(result.blocked_files);
  const missing = arrayValue(result.missing_or_incomplete_items);
  const discrepancies = arrayValue(result.discrepancies);
  const questions = arrayValue(result.underwriter_questions);
  const perFile = arrayValue(result.per_file_summaries);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {summary ? <div style={{ color: t.ink2, fontSize: 13, lineHeight: 1.45 }}>{summary}</div> : null}
      {blocked.length ? <AIResultList t={t} title="Password required" items={blocked} danger /> : null}
      <AIResultList t={t} title="Missing / incomplete" items={missing} />
      <AIResultList t={t} title="Discrepancies" items={discrepancies} />
      <AIResultList t={t} title="Underwriter questions" items={questions} />
      <AIResultList t={t} title="Per-file notes" items={perFile} />
    </div>
  );
}

function AIResultList({ t, title, items, danger = false }: { t: ReturnType<typeof useTheme>["t"]; title: string; items: unknown[]; danger?: boolean }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <strong style={{ color: danger ? t.danger : t.ink, fontSize: 12.5 }}>{title}</strong>
      {items.slice(0, 4).map((item, index) => (
        <div key={`${title}-${index}`} style={{ borderTop: `1px solid ${danger ? t.danger : t.line}`, paddingTop: 6, color: danger ? t.danger : t.ink2, fontSize: 12.5, lineHeight: 1.4 }}>
          {describeAIItem(item)}
        </div>
      ))}
      {items.length > 4 ? <div style={{ color: t.ink3, fontSize: 12 }}>+{items.length - 4} more</div> : null}
    </div>
  );
}

function PanelBox({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  const { t } = useTheme();
  return <div style={{ ...panelStyle(t), padding: 14, ...style }}>{children}</div>;
}

function panelStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, boxShadow: t.shadow };
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    height: 38,
    border: `1px solid ${t.lineStrong}`,
    borderRadius: 8,
    padding: "0 10px",
    font: "inherit",
    fontSize: 13,
    background: t.surface,
    color: t.ink,
    outline: "none",
    minWidth: 0,
    boxSizing: "border-box",
  };
}

function buttonStyle(t: ReturnType<typeof useTheme>["t"], variant: "primary" | "secondary"): CSSProperties {
  const primary = variant === "primary";
  return {
    minHeight: 36,
    border: `1px solid ${primary ? t.ink : t.lineStrong}`,
    borderRadius: 8,
    padding: "0 12px",
    font: "inherit",
    fontSize: 13,
    fontWeight: 800,
    background: primary ? t.ink : t.surface,
    color: primary ? t.inverse : t.ink,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    whiteSpace: "nowrap",
  };
}

function checkRowStyle(t: ReturnType<typeof useTheme>["t"], selected = false): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    gap: 9,
    alignItems: "start",
    padding: 10,
    border: `1px solid ${selected ? t.petrol : t.line}`,
    borderRadius: 8,
    background: selected ? t.petrolSoft : t.surface2,
    color: t.ink2,
    fontSize: 13,
    cursor: "pointer",
    outline: "none",
  };
}

function toggleLabelStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    height: 38,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "0 10px",
    border: `1px solid ${t.lineStrong}`,
    borderRadius: 8,
    background: t.surface,
    color: t.ink2,
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}

function emptyInlineStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    padding: 12,
    border: `1px dashed ${t.lineStrong}`,
    borderRadius: 8,
    background: t.surface2,
    color: t.ink3,
    fontSize: 13,
  };
}

function smallRowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function compactExpandableStyle(t: ReturnType<typeof useTheme>["t"], open: boolean): CSSProperties {
  return {
    border: `1px solid ${open ? t.lineStrong : t.line}`,
    borderRadius: 8,
    background: open ? t.surface2 : t.surface,
    padding: open ? 10 : 8,
    transition: "background .15s ease, border-color .15s ease",
  };
}

function compactHeaderButtonStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    width: "100%",
    border: 0,
    background: "transparent",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    color: t.ink,
    cursor: "pointer",
    font: "inherit",
  };
}

function fileRowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function adminUploadRowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(190px, .8fr) 32px",
    gap: 8,
    alignItems: "center",
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function adminUploadDropZoneStyle(t: ReturnType<typeof useTheme>["t"], active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 82,
    marginTop: 10,
    padding: 14,
    border: `1.5px dashed ${active ? t.petrol : t.lineStrong}`,
    borderRadius: 8,
    background: active ? t.petrolSoft : t.surface2,
    color: active ? t.petrol : t.ink2,
    cursor: "pointer",
    textAlign: "left",
  };
}

function shareFilePickerStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gap: 8,
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface,
  };
}

function shareFileOptionStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
    padding: "7px 8px",
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
    cursor: "pointer",
  };
}

function miniButtonStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    border: `1px solid ${t.line}`,
    borderRadius: 7,
    background: t.surface2,
    color: t.ink2,
    padding: "4px 7px",
    fontSize: 11,
    fontWeight: 850,
    cursor: "pointer",
  };
}

function modeToggleStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 6,
    padding: 4,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function modeButtonStyle(t: ReturnType<typeof useTheme>["t"], active: boolean): CSSProperties {
  return {
    minHeight: 32,
    border: `1px solid ${active ? t.petrol : "transparent"}`,
    borderRadius: 7,
    background: active ? t.petrolSoft : "transparent",
    color: active ? t.petrol : t.ink2,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  };
}

function manualActionFormStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gap: 8,
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function blockedFilesPanelStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gap: 4,
    padding: 10,
    border: `1px solid ${t.danger}`,
    borderRadius: 8,
    background: t.dangerBg,
    color: t.danger,
    fontSize: 12.5,
    lineHeight: 1.35,
  };
}

function sharePopupStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    position: "absolute",
    top: 40,
    right: 0,
    width: "min(560px, calc(100vw - 32px))",
    maxHeight: "calc(100vh - 128px)",
    overflowY: "auto",
    padding: 14,
    border: `1px solid ${t.line}`,
    borderRadius: 10,
    background: t.surface,
    boxShadow: "0 22px 60px rgba(0,0,0,.28)",
    zIndex: 260,
  };
}

function shareViewerRowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gap: 8,
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function permissionRowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function iconButtonStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    width: 32,
    height: 32,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface,
    color: t.ink2,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
}

const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,.36)",
  zIndex: 200,
  display: "flex",
  alignItems: "stretch",
  justifyContent: "stretch",
};

function normalizedUploadInvites(invites: UploadInvite[], draft: { recipient_name: string; recipient_email: string; passcode: string }): UploadInvite[] {
  const rows = [...invites];
  if (draft.recipient_name.trim()) {
    rows.push({
      id: "draft",
      recipient_name: draft.recipient_name.trim(),
      recipient_email: draft.recipient_email.trim(),
      passcode: draft.passcode.trim() || generateAccessCode(),
    });
  }
  return rows;
}

function uniqueBucketFiles(files: BucketFile[]): BucketFile[] {
  const seen = new Set<string>();
  return [...files]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((file) => {
      const key = [
        file.file_name.trim().toLowerCase(),
        file.size_bytes,
        file.requested_document_id || "general",
        (file.uploaded_by_email || file.uploaded_by_name || "").trim().toLowerCase(),
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function localFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function blockedAIFileMap(result: Record<string, unknown> | null | undefined): Map<string, { file_name: string; explanation: string }> {
  const rows = arrayValue(result?.blocked_files);
  const blocked = new Map<string, { file_name: string; explanation: string }>();
  rows.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const fileId = stringValue(row.file_id);
    if (!fileId) return;
    blocked.set(fileId, {
      file_name: stringValue(row.file_name),
      explanation: stringValue(row.explanation) || "Password-protected PDF. Upload an unlocked copy for AI review.",
    });
  });
  return blocked;
}

function describeAIItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return String(item ?? "");
  const obj = item as Record<string, unknown>;
  const parts = [
    stringValue(obj.title),
    stringValue(obj.question),
    stringValue(obj.file_name),
    stringValue(obj.detail),
    stringValue(obj.summary),
    stringValue(obj.instructions),
    stringValue(obj.reason),
    stringValue(obj.rationale),
    stringValue(obj.explanation),
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : JSON.stringify(obj);
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    bucket_created: "Bucket created",
    bucket_deleted: "Bucket deleted",
    requested_document_added: "Requested document added",
    upload_link_created: "Upload link created",
    upload_link_passcode_regenerated: "Upload access code regenerated",
    upload_link_accessed: "Upload link accessed",
    upload_passcode_failed: "Upload passcode failed",
    file_upload_started: "Upload started",
    file_uploaded: "File uploaded",
    file_upload_failed: "Upload failed",
    file_deleted: "File deleted",
    admin_file_upload_started: "Admin upload started",
    admin_file_uploaded: "Admin file uploaded",
    admin_file_upload_failed: "Admin upload failed",
    share_created: "Share created",
    share_updated: "Share updated",
    share_status_changed: "Share status changed",
    share_passcode_regenerated: "Share access code regenerated",
    share_accessed: "Share accessed",
    share_passcode_failed: "Share passcode failed",
    shared_file_review_opened: "Shared preview opened",
    shared_file_review_denied: "Shared preview denied",
    shared_file_download_requested: "Shared download requested",
    shared_file_download_denied: "Shared download denied",
    shared_note_created: "Shared note created",
    shared_note_denied: "Shared note denied",
    shared_file_annotation_created: "Shared annotation created",
    shared_file_annotation_denied: "Shared annotation denied",
    note_created: "Admin note created",
    file_review_opened: "Admin preview opened",
    file_preview_url_created: "Admin preview URL created",
    file_download_url_created: "Admin download URL created",
    file_annotation_created: "Admin annotation created",
    ai_action_created: "Action task created",
    ai_action_proposed: "Action task proposed",
    ai_action_approved: "Action task approved",
    ai_action_rejected: "Action task rejected",
    ai_action_completed: "Action task completed",
    vendor_access_created: "Vendor access created",
    vendor_access_updated: "Vendor access updated",
    vendor_access_revoked: "Vendor access revoked",
    vendor_access_reactivated: "Vendor access reactivated",
    vendor_bucket_accessed: "Vendor bucket opened",
    vendor_file_previewed: "Vendor preview opened",
    vendor_file_review_denied: "Vendor preview denied",
    vendor_file_download_requested: "Vendor download requested",
    vendor_file_download_denied: "Vendor download denied",
    vendor_file_annotation_created: "Vendor annotation created",
    vendor_file_annotation_denied: "Vendor annotation denied",
    vendor_note_created: "Vendor note created",
    vendor_note_denied: "Vendor note denied",
    vendor_ai_chat: "Vendor AI chat",
    vendor_task_proposed: "Vendor task proposed",
  };
  return labels[action] ?? statusLabel(action);
}

function activityActor(item: Activity) {
  return item.actor_name || item.actor_email || statusLabel(item.actor_role || "") || "System";
}

function emptyActivityFilters(): ActivityFilters {
  return { action: "", actor_role: "", target_type: "", q: "", date_from: "", date_to: "" };
}

function activityParams(offset: number, filters: ActivityFilters) {
  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_SIZE), offset: String(offset) });
  if (filters.action) params.set("action", filters.action);
  if (filters.actor_role) params.set("actor_role", filters.actor_role);
  if (filters.target_type) params.set("target_type", filters.target_type);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.date_from) params.set("date_from", `${filters.date_from}T00:00:00Z`);
  if (filters.date_to) params.set("date_to", `${filters.date_to}T23:59:59Z`);
  return params;
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function adminUploadDraftStorageKey(bucketId: string) {
  return `qc.bucket.adminUploadDraft.${bucketId}`;
}

function loadAdminUploadDraft(bucket: Bucket) {
  const fallback = { uploader_name: bucket.client_name || "", uploader_email: "", note: "" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(adminUploadDraftStorageKey(bucket.id));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      uploader_name: typeof parsed.uploader_name === "string" ? parsed.uploader_name : fallback.uploader_name,
      uploader_email: typeof parsed.uploader_email === "string" ? parsed.uploader_email : "",
      note: typeof parsed.note === "string" ? parsed.note : "",
    };
  } catch {
    return fallback;
  }
}

function saveAdminUploadDraft(bucketId: string, draft: { uploader_name: string; uploader_email: string; note: string }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      adminUploadDraftStorageKey(bucketId),
      JSON.stringify({
        uploader_name: draft.uploader_name,
        uploader_email: draft.uploader_email,
        note: draft.note,
      }),
    );
  } catch {
    // Local autosave is best-effort; uploads still use the current in-memory values.
  }
}

function generateAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Bucket could not be created. Please try again.";
}
