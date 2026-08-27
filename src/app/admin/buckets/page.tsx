"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { MAIN_STREET_INDUSTRIES, MAIN_STREET_INTENTS } from "@/lib/intakeIndustries";
import {
  Btn,
  Callout,
  CellChip,
  Field,
  IconBtn,
  Input,
  Panel,
  Select,
  StatusLine,
  Sub,
  Textarea,
  cx,
} from "@/components/ds";
import { Drawer, DrawerSteps } from "@/components/ds/Drawer";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { BucketFileReviewPanel, type BucketFileAnnotation, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import { EmailComposer } from "@/components/email/EmailComposer";
import { BucketIntakeLinkDrawer } from "@/components/operator/UnifiedOperator";
import { useBucketIntakeLinks, useCurrentUser, useUnifiedOperatorFiles } from "@/hooks/useApi";
import type { BucketIntakeLinkRead } from "@/lib/unifiedOperator";
import { api, ApiError } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
import { APP_ORIGIN } from "@/lib/appUrl";
import { openSignedUrl } from "@/lib/safeOpen";

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
  vendor_access_count?: number;
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
type PublicShare = {
  id: string;
  token?: string;
  recipient_name?: string | null;
  can_preview: boolean;
  can_download: boolean;
  status: string;
  expires_at?: string | null;
  last_accessed_at?: string | null;
  created_at?: string | null;
  view_count: number;
  download_count: number;
  files?: BucketFile[];
  share_url?: string | null;
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
  requested_documents: RequestedDoc[];
  files: BucketFile[];
  upload_links?: UploadLink[];
  shares: Share[];
  vendor_access?: VendorAccess[];
  public_shares?: PublicShare[];
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
type BucketDetailSection = "upload" | "tasks" | "notes" | "invites" | "vendors" | "shares" | "activity";
type BucketFileKind = "all" | "pdf" | "image" | "spreadsheet" | "document" | "other";
type BucketFileAssignment = "all" | "requested" | "general";
type BucketFileSort = "newest" | "oldest";
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
type PublicShareViewerDraft = {
  id: string;
  recipient_name: string;
  can_download: boolean;
  expires_days: number;
  file_ids: string[];
  file_search: string;
};
type ActivityPage = { items: Activity[]; total: number; limit: number; offset: number };
type ActivityFilters = { action: string; actor_role: string; target_type: string; q: string; date_from: string; date_to: string };
type DetailFocus = "vendors" | null;
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
function closedBucketSections(): Record<BucketDetailSection, boolean> {
  return {
    upload: false,
    tasks: false,
    notes: false,
    invites: false,
    vendors: false,
    shares: false,
    activity: false,
  };
}

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

function newPublicShareViewerDraft(): PublicShareViewerDraft {
  return {
    id: crypto.randomUUID(),
    recipient_name: "",
    can_download: true,
    expires_days: 7,
    file_ids: [],
    file_search: "",
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
    can_propose_tasks: true,
    expires_days: 30,
  };
}

export default function BucketsAdminPage() {
  const confirmAction = useConfirmAction();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucketParam = searchParams.get("bucket");
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { data: bucketLinks = [] } = useBucketIntakeLinks({ all: true });
  const { data: unifiedFiles } = useUnifiedOperatorFiles({ limit: 500 });
  const { getToken } = useAuth();
  const adminFileInputRef = useRef<HTMLInputElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const dismissedBucketParamRef = useRef<string | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [detail, setDetail] = useState<BucketDetail | null>(null);
  const [detailFocus, setDetailFocus] = useState<DetailFocus>(null);
  const [bucketDetailMinimized, setBucketDetailMinimized] = useState(false);
  const [bucketSectionsOpen, setBucketSectionsOpen] = useState<Record<BucketDetailSection, boolean>>(() => closedBucketSections());
  const [bucketFileQuery, setBucketFileQuery] = useState("");
  const [bucketFileKind, setBucketFileKind] = useState<BucketFileKind>("all");
  const [bucketFileAssignment, setBucketFileAssignment] = useState<BucketFileAssignment>("all");
  const [bucketFileStatus, setBucketFileStatus] = useState("all");
  const [bucketFileSort, setBucketFileSort] = useState<BucketFileSort>("newest");
  const [search, setSearch] = useState("");
  const [bucketView, setBucketView] = useState<"all" | "collecting" | "review" | "complete">("all");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReviewBucket, setDeleteReviewBucket] = useState<Bucket | null>(null);
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
  const [publicSharePopupOpen, setPublicSharePopupOpen] = useState(false);
  const [publicShareViewers, setPublicShareViewers] = useState<PublicShareViewerDraft[]>(() => [newPublicShareViewerDraft()]);
  const [createdPublicShareLinks, setCreatedPublicShareLinks] = useState<PublicShare[]>([]);
  const [copiedPublicShareId, setCopiedPublicShareId] = useState<string | null>(null);
  const publicShareMenuRef = useRef<HTMLDivElement | null>(null);
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
  const [convertLeadBucket, setConvertLeadBucket] = useState<Bucket | null>(null);
  const [convertLeadBusy, setConvertLeadBusy] = useState(false);
  const [convertLeadError, setConvertLeadError] = useState<string | null>(null);
  const [linkBucket, setLinkBucket] = useState<Bucket | null>(null);
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
  const [reviewMinimized, setReviewMinimized] = useState(false);
  const [activityRows, setActivityRows] = useState<Activity[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(() => emptyActivityFilters());
  const [activityLoading, setActivityLoading] = useState(false);
  const [expandedShareId, setExpandedShareId] = useState<string | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

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
    setSharePasscodes({});
    setCreatedShareLinks([]);
    setExpandedShareId(null);
    setEditingShareId(null);
    setEditingShareFileIds([]);
    setEditingShareSearch("");
    setPublicSharePopupOpen(false);
    setPublicShareViewers([newPublicShareViewerDraft()]);
    setCreatedPublicShareLinks([]);
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
    setBucketSectionsOpen(closedBucketSections());
    setBucketFileQuery("");
    setBucketFileKind("all");
    setBucketFileAssignment("all");
    setBucketFileStatus("all");
    setBucketFileSort("newest");
    await loadBucketActivity(bucketId, 0, filters);
  }

  async function openBucket(bucketId: string, focus: DetailFocus = null) {
    setDetailFocus(focus);
    setBucketDetailMinimized(false);
    await loadBucket(bucketId);
    if (focus === "vendors") {
      setBucketSectionsOpen((current) => ({ ...current, vendors: true }));
    }
  }

  function closeBucketDetail() {
    dismissedBucketParamRef.current = detail?.id || bucketParam;
    setReviewFile(null);
    setReviewMinimized(false);
    setBucketDetailMinimized(false);
    setDetail(null);
    setDetailFocus(null);
    if (bucketParam) router.replace("/admin/buckets", { scroll: false });
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
    setBucketSectionsOpen((current) => ({ ...current, vendors: true }));
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

  async function deleteBucket(bucket: Bucket) {
    setDeletingId(bucket.id);
    setNotice(null);
    try {
      await call<void>(`/buckets/admin/${bucket.id}`, { method: "DELETE" });
      if (detail?.id === bucket.id) closeBucketDetail();
      await loadBuckets();
      setNotice("Bucket deleted.");
      setDeleteReviewBucket(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function convertBucketToLead(payload: ConvertLeadPayload) {
    if (!convertLeadBucket) return;
    setConvertLeadBusy(true);
    setConvertLeadError(null);
    try {
      const res = await call<{ intake: { id: string } }>(`/admin/ai-underwriter-leads/from-bucket/${convertLeadBucket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setConvertLeadBucket(null);
      router.push(`/admin/ai-underwriter-leads?lead=${res.intake.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const body = error.body as { detail?: { intake_id?: string; message?: string } } | undefined;
        const intakeId = body?.detail?.intake_id;
        if (intakeId) {
          setConvertLeadBucket(null);
          router.push(`/admin/ai-underwriter-leads?lead=${intakeId}`);
          return;
        }
      }
      setConvertLeadError(error instanceof Error ? error.message : "Failed to convert bucket.");
    } finally {
      setConvertLeadBusy(false);
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
    if (!bucketParam) {
      dismissedBucketParamRef.current = null;
      return;
    }
    if (me?.role === Role.SUPER_ADMIN && bucketParam !== dismissedBucketParamRef.current && detail?.id !== bucketParam) {
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
    if (!publicSharePopupOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPublicSharePopupOpen(false);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (publicShareMenuRef.current && !publicShareMenuRef.current.contains(event.target as Node)) {
        setPublicSharePopupOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [publicSharePopupOpen]);

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
  const requestedDocNameById = useMemo(() => new Map((detail?.requested_documents ?? []).map((doc) => [doc.id, doc.name])), [detail?.requested_documents]);
  const bucketFileStatusOptions = useMemo(() => {
    const statuses = new Set(visibleFiles.map((file) => file.status).filter(Boolean));
    return Array.from(statuses).sort();
  }, [visibleFiles]);
  const filteredBucketFiles = useMemo(() => {
    const query = bucketFileQuery.trim().toLowerCase();
    return visibleFiles.filter((file) => {
      if (bucketFileKind !== "all" && bucketFileKindOf(file) !== bucketFileKind) return false;
      if (bucketFileAssignment === "requested" && !file.requested_document_id) return false;
      if (bucketFileAssignment === "general" && file.requested_document_id) return false;
      if (bucketFileStatus !== "all" && file.status !== bucketFileStatus) return false;
      if (!query) return true;
      return [
        file.file_name,
        file.content_type,
        file.status,
        file.uploaded_by_name,
        file.uploaded_by_email,
        requestedDocNameById.get(file.requested_document_id || ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    }).sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bucketFileSort === "newest" ? bTime - aTime : aTime - bTime;
    });
  }, [bucketFileAssignment, bucketFileKind, bucketFileQuery, bucketFileSort, bucketFileStatus, requestedDocNameById, visibleFiles]);
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
    return buckets.filter((bucket) => {
      const status = bucket.status.toLowerCase();
      const statusMatches = bucketView === "all"
        || (bucketView === "collecting" && !status.includes("complete") && !status.includes("review"))
        || (bucketView === "review" && status.includes("review"))
        || (bucketView === "complete" && (status.includes("complete") || status.includes("closed")));
      if (!statusMatches) return false;
      if (!q) return true;
      return [bucket.name, bucket.client_name, bucket.purpose, bucket.bucket_type, bucket.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [buckets, search, bucketView]);
  const primaryIntakeByBucket = useMemo(() => {
    const pairs = new Map<string, string>();
    for (const file of unifiedFiles?.items ?? []) {
      if (file.bucket_id && file.intake_id) pairs.set(file.bucket_id, file.intake_id);
    }
    return pairs;
  }, [unifiedFiles?.items]);

  if (meLoading) return <PanelBox>Loading Buckets...</PanelBox>;
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

  function updatePublicShareViewer(id: string, patch: Partial<PublicShareViewerDraft>) {
    setPublicShareViewers((viewers) => viewers.map((viewer) => (viewer.id === id ? { ...viewer, ...patch } : viewer)));
  }

  function addPublicShareViewer() {
    setPublicShareViewers((viewers) => [...viewers, newPublicShareViewerDraft()]);
  }

  function removePublicShareViewer(id: string) {
    setPublicShareViewers((viewers) => (viewers.length === 1 ? viewers : viewers.filter((viewer) => viewer.id !== id)));
  }

  function setPublicShareViewerFileIds(id: string, fileIds: string[]) {
    updatePublicShareViewer(id, { file_ids: Array.from(new Set(fileIds)) });
  }

  function togglePublicShareViewerFile(id: string, fileId: string) {
    setPublicShareViewers((viewers) =>
      viewers.map((viewer) => {
        if (viewer.id !== id) return viewer;
        const next = viewer.file_ids.includes(fileId)
          ? viewer.file_ids.filter((value) => value !== fileId)
          : [...viewer.file_ids, fileId];
        return { ...viewer, file_ids: next };
      }),
    );
  }

  async function copyPublicShareLink(share: PublicShare) {
    if (!share.share_url) {
      setNotice("Public link is not available yet. Refresh the bucket and try again.");
      return;
    }
    await copyText(share.share_url);
    setCopiedPublicShareId(share.id);
    window.setTimeout(() => setCopiedPublicShareId((current) => (current === share.id ? null : current)), 2000);
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
    if (statusValue === "revoked") {
      const confirmed = await confirmAction({
        title: `Revoke access for ${share.recipient_name}`,
        body: "The recipient will immediately lose access to the shared bucket files.",
        confirmLabel: "Revoke access",
        tone: "danger",
        reversible: true,
      });
      if (!confirmed) return;
    }
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
    if (statusValue === "revoked") {
      const confirmed = await confirmAction({
        title: `Revoke access for ${access.vendor_name || access.vendor_email || "this vendor"}`,
        body: "The vendor will immediately lose access to this file room.",
        confirmLabel: "Revoke vendor access",
        tone: "danger",
        reversible: true,
      });
      if (!confirmed) return;
    }
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

  const canCreatePublicShareLinks =
    !!detail &&
    publicShareViewers.length > 0 &&
    publicShareViewers.every((viewer) => viewer.file_ids.length > 0) &&
    !busy;

  async function createPublicShareLinks() {
    if (!detail || !canCreatePublicShareLinks) return;
    setBusy(true);
    try {
      let createdCount = 0;
      const createdShares: PublicShare[] = [];
      for (const viewer of publicShareViewers) {
        const res = await call<PublicShare>(`/buckets/admin/${detail.id}/public-shares`, {
          method: "POST",
          body: JSON.stringify({
            recipient_name: viewer.recipient_name.trim() || null,
            can_download: viewer.can_download,
            expires_at: shareExpiryDate(viewer.expires_days),
            file_ids: viewer.file_ids,
          }),
        });
        createdCount += 1;
        createdShares.push(res);
      }
      const row = await call<BucketDetail>(`/buckets/admin/${detail.id}`);
      setDetail(row);
      setPublicShareViewers([newPublicShareViewerDraft()]);
      setCreatedPublicShareLinks(createdShares);
      setNotice(`${createdCount} public link${createdCount === 1 ? "" : "s"} created. Copy the link to send to other banks — no login or code required.`);
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
      setReviewMinimized(false);
      setReviewFile(file);
      return;
    }
    const res = await call<{ url: string }>(`/buckets/admin/${detail.id}/files/${file.id}/url?download=${download}`);
    openSignedUrl(res.url);
  }

  async function deleteFile(file: BucketFile) {
    if (!detail || deletingFileId) return;
    const confirmed = await confirmAction({
      title: `Delete ${file.file_name}`,
      body: "This removes the file from the bucket, revokes share access, and stops preview and download immediately.",
      confirmLabel: "Delete file",
      tone: "danger",
      reversible: false,
    });
    if (!confirmed) return;
    setDeletingFileId(file.id);
    try {
      await call(`/buckets/admin/${detail.id}/files/${file.id}`, { method: "DELETE" });
      setShareFiles((current) => {
        const next = { ...current };
        delete next[file.id];
        return next;
      });
      setNotice("File deleted.");
      if (reviewFile?.id === file.id) {
        setReviewMinimized(false);
        setReviewFile(null);
      }
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

  function toggleBucketSection(section: BucketDetailSection) {
    setBucketSectionsOpen((current) => ({ ...current, [section]: !current[section] }));
  }

  function bucketSectionActions(section: BucketDetailSection, meta?: ReactNode) {
    const open = bucketSectionsOpen[section];
    return (
      <div className="row">
        {meta}
        <IconBtn onClick={() => toggleBucketSection(section)} aria-label={`${open ? "Collapse" : "Expand"} ${section}`} title={open ? "Collapse" : "Expand"}>
          <Icon name={open ? "chevU" : "chevD"} size={14} />
        </IconBtn>
      </div>
    );
  }

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
      <div className="card grid g8">
        <div className="row">
          <strong className="grow">{args.selectedIds.length} file{args.selectedIds.length === 1 ? "" : "s"} selected</strong>
          <Btn size="sm" onClick={() => args.onSetSelected([])}>Clear</Btn>
        </div>
        {selectedFiles.length ? (
          <div className="sub trunc">
            {selectedFiles.slice(0, 3).map((file) => file.file_name).join(", ")}{selectedFiles.length > 3 ? ` +${selectedFiles.length - 3} more` : ""}
          </div>
        ) : (
          <div className="warnline">Select at least one file for this viewer.</div>
        )}
        <Input value={args.search} onChange={(event) => args.onSearch(event.target.value)} placeholder="Search files" />
        <div className="row">
          <Btn onClick={() => args.onSetSelected(filtered.map((file) => file.id))} disabled={!filtered.length}>Select visible</Btn>
          {selectedShareFileIds.length ? (
            <Btn onClick={() => args.onSetSelected(selectedShareFileIds)}>Use checked files</Btn>
          ) : null}
        </div>
        {/* Tighter than `.picklist`'s 46vh default on purpose: this list is
            nested two scrollers deep inside the share popover, and at 46vh it
            pushes the Create button off the bottom of the popover. */}
        <div className="picklist sm">
          {filtered.length ? filtered.map((file) => (
            <label key={file.id} className={cx("pick", args.selectedIds.includes(file.id) && "on")}>
              <input type="checkbox" checked={args.selectedIds.includes(file.id)} onChange={() => args.onToggle(file.id)} />
              <span className="grow">
                <strong className="trunc" style={{ display: "block" }}>{file.file_name}</strong>
                <span className="sub">
                  {requestedDocNameById.get(file.requested_document_id || "") || "General upload"} | {formatSize(file.size_bytes)}
                </span>
              </span>
            </label>
          )) : (
            <div className="hintbox">No uploaded files match this search.</div>
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
      <div className="card grid g8">
        <div className="row">
          <strong className="grow">{vendorAssignmentDraft.file_ids.length} file{vendorAssignmentDraft.file_ids.length === 1 ? "" : "s"} selected</strong>
          <Btn size="sm" onClick={() => setVendorAssignmentDraft({ ...vendorAssignmentDraft, file_ids: [] })}>Clear</Btn>
        </div>
        {selectedFiles.length ? (
          <div className="sub trunc">
            {selectedFiles.slice(0, 3).map((file) => file.file_name).join(", ")}{selectedFiles.length > 3 ? ` +${selectedFiles.length - 3} more` : ""}
          </div>
        ) : (
          <div className="warnline">Select files for this vendor or switch to all active files.</div>
        )}
        <Input
          value={vendorAssignmentDraft.file_search}
          onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, file_search: event.target.value })}
          placeholder="Search files"
        />
        <Btn
          onClick={() => setVendorAssignmentDraft({ ...vendorAssignmentDraft, file_ids: filtered.map((file) => file.id) })}
          disabled={!filtered.length}
        >
          Select visible
        </Btn>
        {/* Same reason as the share picker: bounded to the drawer it sits in
            rather than to the viewport. */}
        <div className="picklist sm">
          {filtered.length ? filtered.map((file) => (
            <label key={file.id} className={cx("pick", vendorAssignmentDraft.file_ids.includes(file.id) && "on")}>
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
              <span className="grow">
                <strong className="trunc" style={{ display: "block" }}>{file.file_name}</strong>
                <span className="sub">{docs.get(file.requested_document_id || "") || "General upload"} | {formatSize(file.size_bytes)}</span>
              </span>
            </label>
          )) : (
            <div className="hintbox">No uploaded files match this search.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    // Grid, not flex-column: `.panel` is overflow:hidden, and as a flex child
    // that zeroes its automatic minimum size and clips its own body.
    <div className="grid">
      <div className="ckhead">
        <div className="ckrow">
          <h1>Buckets</h1>
          <CellChip tone="mut">{buckets.filter((bucket) => !bucket.status.toLowerCase().includes("complete")).length} open</CellChip>
          <span className="sp" />
          <span className="sub">Secure document rooms. Every bucket can feed an AI intake.</span>
          <Btn variant="pri" size="sm" onClick={() => {
            setCreateResult(null);
            setCreateStatus(null);
            setCreateInviteDraft({ recipient_name: "", recipient_email: "", passcode: generateAccessCode() });
            setCreateInvites([]);
            setCustomDocs([]);
            setCustomDocDraft({ name: "", description: "", required: true, allow_multiple_files: false });
            setCreateOpen(true);
          }}><Icon name="plus" size={13} /> Create bucket</Btn>
          <PageActionMenu label="Bucket actions" items={[
            { label: "Manage vendor directory", onSelect: () => setVendorDirectoryOpen(true) },
            { label: "Open AI intake", href: "/admin/ai-underwriter-leads" },
          ]} />
        </div>
        <div className="cktabs" role="tablist" aria-label="Bucket status">
          {[
            { value: "all" as const, label: "All buckets" },
            { value: "collecting" as const, label: "Collecting" },
            { value: "review" as const, label: "In review" },
            { value: "complete" as const, label: "Complete" },
          ].map((item) => <button key={item.value} type="button" role="tab" aria-selected={bucketView === item.value} className={bucketView === item.value ? "on" : undefined} onClick={() => setBucketView(item.value)}>{item.label}</button>)}
        </div>
      </div>

      {notice ? (
        // One slot, two meanings: sixteen call sites pass readableError() into
        // this same setNotice. Rendering a failed share-link creation in accent
        // blue behind a checkmark tells the operator it worked.
        <Callout
          tone={noticeIsFailure(notice) ? "bad" : "acc"}
          icon={<Icon name={noticeIsFailure(notice) ? "alert" : "check"} size={15} />}
        >
          {notice}
        </Callout>
      ) : null}

      <Drawer
        open={vendorDirectoryOpen}
        onClose={() => setVendorDirectoryOpen(false)}
        width="md"
        title="Vendor directory"
        sub="Create vendors once, then assign them to buckets from the bucket list."
        bodyClass="grid"
      >
        <Panel title="Create vendor login" sub="Vendors log in with their email and only see buckets you assign to them.">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 8 }}>
            <Input
              placeholder="Vendor name"
              value={vendorDirectoryDraft.vendor_name}
              onChange={(event) => setVendorDirectoryDraft({ ...vendorDirectoryDraft, vendor_name: event.target.value })}
            />
            <Input
              placeholder="Vendor email"
              value={vendorDirectoryDraft.vendor_email}
              onChange={(event) => setVendorDirectoryDraft({ ...vendorDirectoryDraft, vendor_email: event.target.value })}
            />
            <Btn
              variant="pri"
              onClick={() => createVendorFromDirectory().catch((error) => setNotice(readableError(error)))}
              disabled={!vendorDirectoryDraft.vendor_name.trim() || !vendorDirectoryDraft.vendor_email.trim()}
            >
              <Icon name="plus" size={14} />
              Create
            </Btn>
          </div>
        </Panel>
        <Panel title="Existing vendors" actions={<span className="tag">{vendors.length} vendors</span>} bodyClass="grid g8">
          <div className="grid g8" style={{ maxHeight: 360, overflowY: "auto" }}>
            {vendors.length ? vendors.map((vendor) => (
              <div key={vendor.id} className="itemrow">
                <div className="grow">
                  <strong>{vendor.name}</strong>
                  <div className="sub">{vendor.email}</div>
                </div>
              </div>
            )) : (
              <div className="hintbox">No vendors yet. Create the first vendor above.</div>
            )}
          </div>
        </Panel>
      </Drawer>

      <Drawer
        open={vendorAssignmentBucket !== null}
        onClose={() => {
          setVendorAssignmentBucket(null);
          setVendorAssignmentDetail(null);
          setVendorAssignmentDraft(emptyVendorAccessDraft());
        }}
        width="lg"
        title="Assign vendor"
        sub={vendorAssignmentBucket ? `${vendorAssignmentBucket.name} | ${vendorAssignmentBucket.client_name || "No client"}` : undefined}
        bodyClass="grid"
      >
        {vendorAssignmentBusy && !vendorAssignmentDetail ? (
          <PanelBox>Loading vendor assignment...</PanelBox>
        ) : (
          <>
            <Panel
              title="Assign vendor to this bucket"
              sub="Choose an existing vendor or create a new one, then decide whether they see all active files or selected files."
              bodyClass="grid g8"
            >
              <Select
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
              </Select>
              <div className="fldgrid two">
                <Input
                  placeholder="Vendor name"
                  value={vendorAssignmentDraft.vendor_name}
                  onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, vendor_user_id: "", vendor_name: event.target.value })}
                />
                <Input
                  placeholder="Vendor email"
                  value={vendorAssignmentDraft.vendor_email}
                  onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, vendor_user_id: "", vendor_email: event.target.value })}
                />
              </div>
              <div className="fldgrid two">
                <Select
                  value={vendorAssignmentDraft.file_scope}
                  onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, file_scope: event.target.value as VendorAccessDraft["file_scope"] })}
                >
                  <option value="all_active">All active files</option>
                  <option value="selected">Selected files</option>
                </Select>
                <Select
                  value={vendorAssignmentDraft.expires_days}
                  onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, expires_days: Number(event.target.value) })}
                >
                  <option value={1}>Expires 1 day</option>
                  <option value={7}>Expires 7 days</option>
                  <option value={14}>Expires 14 days</option>
                  <option value={30}>Expires 30 days</option>
                  <option value={0}>No expiration</option>
                </Select>
              </div>
              {vendorAssignmentDraft.file_scope === "selected" ? renderVendorAssignmentFilePicker() : (
                <div className="hintbox">Vendor will see all current and future active files in this bucket.</div>
              )}
              {/* Vendor-assignment permission matrix. Four of the five vendor
                  flags; `can_propose_tasks` is deliberately not offered here and
                  keeps its draft default. */}
              <div className="fldgrid two">
                {([
                  ["can_preview", "Preview"],
                  ["can_download", "Download"],
                  ["can_add_notes", "Notes"],
                  ["can_see_internal_notes", "Internal notes"],
                ] as const).map(([key, label]) => (
                  <label key={key} className={cx("pick", vendorAssignmentDraft[key] && "on")}>
                    <span className="grow"><strong>{label}</strong></span>
                    <input
                      type="checkbox"
                      checked={Boolean(vendorAssignmentDraft[key])}
                      onChange={(event) => setVendorAssignmentDraft({ ...vendorAssignmentDraft, [key]: event.target.checked })}
                    />
                  </label>
                ))}
              </div>
              <Btn variant="pri" onClick={assignVendorFromBucketList} disabled={vendorAssignmentBusy}>
                <Icon name="plus" size={14} />
                {vendorAssignmentBusy ? "Assigning..." : "Assign vendor"}
              </Btn>
            </Panel>
            <Panel
              title="Assigned vendors"
              actions={<span className="tag">{vendorAssignmentDetail?.vendor_access?.length ?? 0} vendors</span>}
            >
              <div className="grid g8" style={{ maxHeight: 260, overflowY: "auto" }}>
                {(vendorAssignmentDetail?.vendor_access ?? []).length ? (vendorAssignmentDetail?.vendor_access ?? []).map((access) => (
                  <div key={access.id} className="itemrow">
                    <div className="grow">
                      <strong>{access.vendor_name || access.vendor_email || "Vendor"}</strong>
                      <div className="sub">
                        {access.vendor_email || "No email"} | {access.file_scope === "all_active" ? "All active files" : `${access.files?.length ?? 0} selected files`} | {statusLabel(access.status)}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="hintbox">No vendors assigned to this bucket yet.</div>
                )}
              </div>
            </Panel>
          </>
        )}
      </Drawer>

      <Panel
        title="Bucket list"
        noPad
        actions={
          // The magnifier is inset INTO the field, so its offset and the text
          // inset that clears it are geometry, not decoration.
          <div style={{ position: "relative", width: 320 }}>
            <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 10, color: "var(--muted)" }} />
            <Input
              style={{ width: "100%", paddingLeft: 32 }}
              placeholder="Search buckets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      >
        <BucketTable
          buckets={filteredBuckets}
          links={bucketLinks}
          primaryIntakeByBucket={primaryIntakeByBucket}
          deletingId={deletingId}
          onSelect={(id) => openBucket(id)}
          onOpenVendors={openVendorAssignment}
          onConvertToLead={setConvertLeadBucket}
          onLinkIntake={setLinkBucket}
          onDelete={setDeleteReviewBucket}
        />
      </Panel>

      {convertLeadBucket ? (
        <ConvertToLeadModal
          bucket={convertLeadBucket}
          busy={convertLeadBusy}
          error={convertLeadError}
          onClose={() => {
            setConvertLeadBucket(null);
            setConvertLeadError(null);
          }}
          onConvert={convertBucketToLead}
        />
      ) : null}

      <Drawer
        open={deleteReviewBucket !== null}
        onClose={() => setDeleteReviewBucket(null)}
        width="md"
        title="Review before running"
        sub="Delete bucket"
        closeOnBackdrop={!deletingId}
        footer={<><Btn onClick={() => setDeleteReviewBucket(null)} disabled={Boolean(deletingId)}>Cancel</Btn><span className="sp" /><Btn onClick={() => deleteReviewBucket && deleteBucket(deleteReviewBucket)} disabled={Boolean(deletingId)} className="danger">{deletingId ? "Deleting..." : "Delete bucket"}</Btn></>}
      >
        <div className="grid">
          <div className="warnline"><b>{deleteReviewBucket?.name}</b> will be removed from the active bucket list.</div>
          <div className="kv"><span>Actor</span><b>Current signed-in operator</b></div>
          <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
          <div className="kv"><span>Reversible</span><b>No</b></div>
        </div>
      </Drawer>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        width="xl"
        title="Create bucket"
        sub="Set up the bucket, choose requested files, and invite uploaders."
        bodyClass="grid"
        // The ModalFrame this replaced had no backdrop-close and no Escape, so
        // adopting Drawer's defaults made a stray click on the scrim discard
        // the whole form — including upload access codes that have already been
        // generated and cannot be re-derived. Close it deliberately.
        closeOnBackdrop={false}
        bodyStyle={{ minHeight: 0, alignContent: "start" }}
        footer={
          createResult ? (
            <>
              <span className="sp" />
              <Btn onClick={() => copyText(createResult.links.map((link) => `${link.name}: ${link.url}\nAccess code: ${link.passcode}`).join("\n\n"))}>Copy all</Btn>
              <Btn variant="pri" onClick={() => setCreateOpen(false)}>Done</Btn>
            </>
          ) : (
            <>
              <span className="sp" />
              <Btn onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Btn>
              <Btn variant="pri" style={{ minWidth: 142, justifyContent: "center" }} onClick={createBucketWorkflow} disabled={busy || !bucketForm.name.trim()}>
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
              </Btn>
            </>
          )
        }
      >
        {createResult ? (
          <>
            {createStatus ? <CreateStatusBanner status={createStatus} /> : null}
            <Panel
              title="Upload invites created"
              actions={<span className="tag">{createResult.links.length} link{createResult.links.length === 1 ? "" : "s"}</span>}
            >
              <div className="grid g8">
                {createResult.links.map((link) => (
                  <div key={link.id} className="itemrow">
                    <div className="grow">
                      <strong>{link.name}</strong>
                      <div className="sub">{link.email || "No email entered"}</div>
                      <div style={{ marginTop: 4 }}>Upload access code: <strong>{link.passcode}</strong></div>
                      <code className="sub" style={{ display: "block", overflowWrap: "anywhere", marginTop: 4 }}>{link.url}</code>
                    </div>
                    <Btn onClick={() => copyText(`Upload link: ${link.url}\nAccess code: ${link.passcode}`)}>Copy</Btn>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        ) : (
          <>
            {createStatus ? <CreateStatusBanner status={createStatus} /> : null}
            <Panel>
              <WorkflowHeader step="1" title="Bucket details" />
              <div className="fldgrid two mt">
                <Input placeholder="Bucket name" value={bucketForm.name} onChange={(e) => setBucketForm({ ...bucketForm, name: e.target.value })} />
                <Input placeholder="Client / borrower" value={bucketForm.client_name} onChange={(e) => setBucketForm({ ...bucketForm, client_name: e.target.value })} />
                <Select value={bucketForm.bucket_type} onChange={(e) => setBucketForm({ ...bucketForm, bucket_type: e.target.value })}>
                  {BUCKET_TYPES.map((type) => <option key={type}>{type}</option>)}
                </Select>
                <Input placeholder="Purpose, deal, or package" value={bucketForm.purpose} onChange={(e) => setBucketForm({ ...bucketForm, purpose: e.target.value })} />
                <Textarea
                  style={{ gridColumn: "1 / -1", minHeight: 74 }}
                  placeholder="Description optional"
                  value={bucketForm.description}
                  onChange={(e) => setBucketForm({ ...bucketForm, description: e.target.value })}
                />
              </div>
            </Panel>

            <Panel>
              <WorkflowHeader step="2" title="Request files" />
              <div className="mt" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 10, alignItems: "center" }}>
                <Select
                  value={createPackage}
                  onChange={(e) => {
                    setCreatePackage(e.target.value as PackageKey);
                    setCreateChecked({});
                  }}
                >
                  <option value="standard">Standard Lending File</option>
                  <option value="urchoice">UrChoice Dealer Funding</option>
                </Select>
                <Btn onClick={() => setCustomDocOpen((value) => !value)} aria-expanded={customDocOpen}>
                  <Icon name="plus" size={14} />
                  Other
                </Btn>
                <span className="sub">{selectedCreateDocs.length} selected</span>
              </div>
              {customDocOpen ? (
                <div className="card mt">
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 10, alignItems: "center" }}>
                    <Input
                      placeholder="Other document option"
                      value={customDocDraft.name}
                      onChange={(e) => setCustomDocDraft({ ...customDocDraft, name: e.target.value })}
                    />
                    <label className={cx("pick", customDocDraft.allow_multiple_files && "on")} style={{ whiteSpace: "nowrap" }}>
                      <input
                        type="checkbox"
                        checked={customDocDraft.allow_multiple_files}
                        onChange={(e) => setCustomDocDraft({ ...customDocDraft, allow_multiple_files: e.target.checked })}
                      />
                      Multi-file
                    </label>
                    <Btn onClick={addCustomDoc} disabled={!customDocDraft.name.trim()}>
                      <Icon name="plus" size={14} />
                      Add option
                    </Btn>
                    <Textarea
                      style={{ gridColumn: "1 / -1", minHeight: 70 }}
                      placeholder="Description optional"
                      value={customDocDraft.description}
                      onChange={(e) => setCustomDocDraft({ ...customDocDraft, description: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}
              <div className="mt" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                {/* Inset magnifier again: the icon's offset and the text
                    inset that clears it are geometry, not decoration. */}
                <div style={{ position: "relative" }}>
                  <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 10, color: "var(--muted)" }} />
                  <Input
                    style={{ width: "100%", paddingLeft: 32 }}
                    placeholder="Search request options"
                    value={createDocSearch}
                    onChange={(e) => setCreateDocSearch(e.target.value)}
                  />
                </div>
                <div className="row">
                  <IconBtn
                    onClick={() => setCreateDocPage((page) => Math.max(0, page - 1))}
                    disabled={safeCreateDocPage === 0}
                    aria-label="Previous request options page"
                    title="Previous"
                  >
                    <Icon name="chevL" size={14} />
                  </IconBtn>
                  <span className="sub num" style={{ minWidth: 46, textAlign: "center" }}>
                    {safeCreateDocPage + 1} / {createDocPageCount}
                  </span>
                  <IconBtn
                    onClick={() => setCreateDocPage((page) => Math.min(createDocPageCount - 1, page + 1))}
                    disabled={safeCreateDocPage >= createDocPageCount - 1}
                    aria-label="Next request options page"
                    title="Next"
                  >
                    <Icon name="chevR" size={14} />
                  </IconBtn>
                </div>
              </div>
              {/* Five-across tile grid with a floor on the row height, so a
                  document with a description does not make its row twice the
                  height of the four beside it. */}
              <div className="mt pickgrid" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gridAutoRows: "minmax(108px, auto)", gap: 8 }}>
                {filteredCreateDocs.length === 0 ? (
                  <div className="hintbox" style={{ gridColumn: "1 / -1" }}>
                    No request options match your search.
                  </div>
                ) : pagedCreateDocs.map((doc) => (
                  <div
                    key={doc.id}
                    role="checkbox"
                    aria-checked={!!createChecked[doc.id]}
                    tabIndex={0}
                    className={cx("pick top", createChecked[doc.id] && "on")}
                    onClick={() => toggleCreateDoc(doc.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleCreateDoc(doc.id);
                      }
                    }}
                  >
                    <input type="checkbox" checked={!!createChecked[doc.id]} readOnly tabIndex={-1} />
                    <span className="grow">
                      <span style={{ display: "block", fontWeight: 650 }}>{doc.name}</span>
                      <span className="sub">{doc.category || "Standard Lending File"}</span>
                      {doc.description ? <span className="sub" style={{ display: "block", marginTop: 4 }}>{doc.description}</span> : null}
                      {doc.allow_multiple_files ? <span className="sub" style={{ display: "block", marginTop: 4 }}>Multiple files allowed</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <WorkflowHeader
                step="3"
                title="Invite uploaders"
                subtitle="Add the people who should receive upload links for this bucket. You can add more than one."
              />
              <div className="mt" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 10 }}>
                <Input placeholder="Person or company name" value={createInviteDraft.recipient_name} onChange={(e) => setCreateInviteDraft({ ...createInviteDraft, recipient_name: e.target.value })} />
                <Input placeholder="Email optional" value={createInviteDraft.recipient_email} onChange={(e) => setCreateInviteDraft({ ...createInviteDraft, recipient_email: e.target.value })} />
                <Input placeholder="Upload access code" value={createInviteDraft.passcode} onChange={(e) => setCreateInviteDraft({ ...createInviteDraft, passcode: e.target.value })} />
                <Btn onClick={() => setCreateInviteDraft({ ...createInviteDraft, passcode: generateAccessCode() })}>
                  Generate code
                </Btn>
                <Btn onClick={addCreateInvite} disabled={!createInviteDraft.recipient_name.trim()}>
                  <Icon name="plus" size={14} />
                  Add invite
                </Btn>
                <span className="sub" style={{ alignSelf: "center" }}>Send this code with the upload link.</span>
              </div>
              {createInvites.length ? (
                <div className="grid g8 mt">
                  {createInvites.map((invite) => (
                    <div key={invite.id} className="itemrow">
                      <div className="grow">
                        <strong>{invite.recipient_name}</strong>
                        <div className="sub">{invite.recipient_email || "No email entered"}</div>
                        <div style={{ marginTop: 2 }}>Upload access code: <strong>{invite.passcode}</strong></div>
                      </div>
                      <IconBtn
                        onClick={() => setCreateInvites((rows) => rows.filter((row) => row.id !== invite.id))}
                        aria-label={`Remove ${invite.recipient_name}`}
                        title="Remove invite"
                      >
                        <Icon name="x" size={14} />
                      </IconBtn>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="sub mt">
                Upload links are created after the bucket is created. Leave this blank if you only want to set up the bucket for now.
              </div>
            </Panel>
          </>
        )}
      </Drawer>

      {detail && !bucketDetailMinimized ? (
        <ModalFrame
          title={detail.name}
          subtitle={`${detail.client_name || "No client"} | ${detail.purpose || "No purpose"} | ${detail.bucket_type || "Bucket"}`}
          onClose={closeBucketDetail}
          action={
            <div className="row">
              <IconBtn
                className={cx(detailFocus === "vendors" && "pri")}
                aria-pressed={detailFocus === "vendors"}
                onClick={showVendorSettings}
                aria-label="Open vendor access settings"
                title="Vendor access - login required"
              >
                <Icon name="user" size={16} />
              </IconBtn>
              <Btn
                size="sm"
                onClick={() => detail && setConvertLeadBucket(detail)}
                aria-label="Convert to AI Underwriter Lead"
                title="Convert this bucket into an AI Underwriter Lead"
              >
                <Icon name="bolt" size={16} />
                AI Lead
              </Btn>
              <Btn
                size="sm"
                onClick={() => detail && setLinkBucket(detail)}
                aria-label="Link bucket to AI intake"
                title="Link this bucket to an existing AI intake"
              >
                <Icon name="link" size={16} />
                Link intake
              </Btn>
              <IconBtn aria-label="Minimize bucket workspace" title="Minimize" onClick={() => setBucketDetailMinimized(true)}>
                <span aria-hidden="true" className="workspace-minimize-glyph">-</span>
              </IconBtn>
              <div ref={shareMenuRef} className="popwrap">
                <Btn
                  size="sm"
                  variant={sharePopupOpen ? "pri" : "default"}
                  aria-expanded={sharePopupOpen}
                  onClick={() => {
                    setSharePopupOpen((value) => !value);
                  }}
                  aria-label="Create no-login share link"
                  title="Third-party share link - no login"
                >
                  <Icon name="link" size={16} />
                  Bank share
                </Btn>
                {sharePopupOpen ? (
                  <div
                    className="panel"
                    // Anchored geometry, plus a lifted shadow: this panel floats
                    // over the page rather than sitting in it, and `.panel`'s
                    // in-flow elevation is not enough to separate it.
                    style={{
                      position: "absolute",
                      top: 40,
                      right: 0,
                      width: "min(560px, calc(100vw - 32px))",
                      maxHeight: "calc(100vh - 128px)",
                      zIndex: 5,
                      boxShadow: "var(--sh2)",
                    }}
                  >
                    <div className="panel-h">
                      <div className="grow">
                        <b>Bank / third-party share link</b>
                        <div className="sub">No account login. Send a secure link plus access code.</div>
                      </div>
                      <IconBtn onClick={() => setSharePopupOpen(false)} aria-label="Close share popup">
                        <Icon name="x" size={14} />
                      </IconBtn>
                    </div>
                    <div className="panel-b grid g10" style={{ overflowY: "auto" }}>
                      <Callout tone="acc">
                        <b>This creates a share link, not a vendor account.</b>
                        <div className="sub">
                          Use this for banks, lenders, and one-time third parties. For account-based vendor access, use the Vendors section.
                        </div>
                      </Callout>
                      {createdShareLinks.length ? (
                        <PanelBox className="tone-ok grid g8">
                          <b>Share link ready</b>
                          {createdShareLinks.map((share) => (
                            <div key={share.id} className="grid g6" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                              <b>{share.recipient_name}</b>
                              <div className="sub">
                                {share.files?.length ?? 0} files | {share.can_download ? "download allowed" : "view only"} | no login required
                              </div>
                              <div className="row">
                                <Btn size="sm" onClick={() => copyShareLink(share)}>Copy link</Btn>
                                <Btn size="sm" onClick={() => copyShareInvite(share)}>Copy link + access code</Btn>
                                <Btn size="sm" onClick={() => openEmailShare(share)}>Email from my Gmail</Btn>
                              </div>
                            </div>
                          ))}
                          <Btn onClick={() => setCreatedShareLinks([])}>
                            Create another share
                          </Btn>
                        </PanelBox>
                      ) : null}
                      {visibleFiles.length === 0 ? (
                        <div className="hintbox">Upload files before creating share links.</div>
                      ) : null}
                      <div className="grid g8" style={{ maxHeight: 560, overflowY: "auto" }}>
                        {shareViewers.map((viewer, index) => (
                          <div key={viewer.id} className="card grid g8">
                            <div className="row">
                              <strong className="grow">Viewer {index + 1}</strong>
                              <IconBtn onClick={() => removeShareViewer(viewer.id)} disabled={shareViewers.length === 1} aria-label={`Remove viewer ${index + 1}`}>
                                <Icon name="x" size={13} />
                              </IconBtn>
                            </div>
                            <Input placeholder="Viewer name" value={viewer.recipient_name} onChange={(event) => updateShareViewer(viewer.id, { recipient_name: event.target.value })} />
                            <Input placeholder="Viewer email optional" value={viewer.recipient_email} onChange={(event) => updateShareViewer(viewer.id, { recipient_email: event.target.value })} />
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                              <Input placeholder="Access code" value={viewer.passcode} onChange={(event) => updateShareViewer(viewer.id, { passcode: event.target.value })} />
                              <Btn onClick={() => generateShareCode(viewer.id)}>Generate</Btn>
                            </div>
                            {/* Passcode-share permissions: `can_download` only.
                                A passcode share has no notes and no task
                                proposals — those belong to vendor access. */}
                            <div className="fldgrid two">
                              <label className={cx("pick", viewer.can_download && "on")}>
                                <span className="grow">
                                  <strong style={{ display: "block" }}>Allow download</strong>
                                  <span className="sub">Otherwise preview only.</span>
                                </span>
                                <input type="checkbox" checked={viewer.can_download} onChange={(event) => updateShareViewer(viewer.id, { can_download: event.target.checked })} />
                              </label>
                              <label className="pick">
                                <span className="grow">
                                  <strong style={{ display: "block" }}>Expires</strong>
                                  <span className="sub">Default 7 days.</span>
                                </span>
                                <Select style={{ width: 92 }} value={viewer.expires_days} onChange={(event) => updateShareViewer(viewer.id, { expires_days: Number(event.target.value) })}>
                                  <option value={1}>1 day</option>
                                  <option value={7}>7 days</option>
                                  <option value={14}>14 days</option>
                                  <option value={30}>30 days</option>
                                </Select>
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
                      <Btn onClick={addShareViewer}>
                        <Icon name="plus" size={14} />
                        Add another user
                      </Btn>
                      <Btn variant="pri" style={{ width: "100%", justifyContent: "center" }} onClick={() => createShareLinks().catch((e) => setNotice(readableError(e)))} disabled={!canCreateShareLinks}>
                        {busy ? "Creating links..." : "Create share links"}
                      </Btn>
                    </div>
                  </div>
                ) : null}
              </div>
              <div ref={publicShareMenuRef} className="popwrap">
                <Btn
                  size="sm"
                  variant={publicSharePopupOpen ? "pri" : "default"}
                  aria-expanded={publicSharePopupOpen}
                  onClick={() => {
                    setPublicSharePopupOpen((value) => !value);
                  }}
                  aria-label="Create public link, no login or code"
                  title="Public link - no login, no code"
                >
                  <Icon name="link" size={16} />
                  Public link
                </Btn>
                {publicSharePopupOpen ? (
                  <div
                    className="panel"
                    // Same anchored, lifted geometry as the bank-share popover.
                    style={{
                      position: "absolute",
                      top: 40,
                      right: 0,
                      width: "min(560px, calc(100vw - 32px))",
                      maxHeight: "calc(100vh - 128px)",
                      zIndex: 5,
                      boxShadow: "var(--sh2)",
                    }}
                  >
                    <div className="panel-h">
                      <div className="grow">
                        <b>Public link</b>
                        <div className="sub">No login, no access code. Opens immediately for anyone with the link.</div>
                      </div>
                      <IconBtn onClick={() => setPublicSharePopupOpen(false)} aria-label="Close public link popup">
                        <Icon name="x" size={14} />
                      </IconBtn>
                    </div>
                    <div className="panel-b grid g10" style={{ overflowY: "auto" }}>
                      <Callout tone="warn">
                        <b>Use this only for trusted recipients.</b>
                        <div className="sub">
                          Anyone with this link can view/download the selected files — there is no access code. Intended for sending files to other banks or lenders.
                        </div>
                      </Callout>
                      {createdPublicShareLinks.length ? (
                        <PanelBox className="tone-ok grid g8">
                          <b>Public link ready</b>
                          {createdPublicShareLinks.map((share) => (
                            <div key={share.id} className="grid g6" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                              <b>{share.recipient_name || "Public link"}</b>
                              <div className="sub">
                                {share.files?.length ?? 0} files | {share.can_download ? "download allowed" : "view only"} | no login or code required
                              </div>
                              {share.share_url ? (
                                <a
                                  className="linky trunc"
                                  style={{ display: "block" }}
                                  href={share.share_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {share.share_url}
                                </a>
                              ) : null}
                              <div className="row">
                                <Btn size="sm" onClick={() => copyPublicShareLink(share).catch(() => undefined)}>
                                  {copiedPublicShareId === share.id ? (
                                    <>
                                      <Icon name="check" size={13} />
                                      Copied
                                    </>
                                  ) : (
                                    "Copy link"
                                  )}
                                </Btn>
                              </div>
                            </div>
                          ))}
                          <Btn onClick={() => setCreatedPublicShareLinks([])}>
                            Create another public link
                          </Btn>
                        </PanelBox>
                      ) : null}
                      {visibleFiles.length === 0 ? (
                        <div className="hintbox">Upload files before creating public links.</div>
                      ) : null}
                      <div className="grid g8" style={{ maxHeight: 560, overflowY: "auto" }}>
                        {publicShareViewers.map((viewer, index) => (
                          <div key={viewer.id} className="card grid g8">
                            <div className="row">
                              <strong className="grow">Link {index + 1}</strong>
                              <IconBtn onClick={() => removePublicShareViewer(viewer.id)} disabled={publicShareViewers.length === 1} aria-label={`Remove link ${index + 1}`}>
                                <Icon name="x" size={13} />
                              </IconBtn>
                            </div>
                            <Input placeholder="Recipient label, optional (e.g. First National Bank)" value={viewer.recipient_name} onChange={(event) => updatePublicShareViewer(viewer.id, { recipient_name: event.target.value })} />
                            {/* Public-link permissions: `can_download` only, and
                                no passcode at all — this is the mechanism with
                                the fewest controls, deliberately. */}
                            <div className="fldgrid two">
                              <label className={cx("pick", viewer.can_download && "on")}>
                                <span className="grow">
                                  <strong style={{ display: "block" }}>Allow download</strong>
                                  <span className="sub">Otherwise preview only.</span>
                                </span>
                                <input type="checkbox" checked={viewer.can_download} onChange={(event) => updatePublicShareViewer(viewer.id, { can_download: event.target.checked })} />
                              </label>
                              <label className="pick">
                                <span className="grow">
                                  <strong style={{ display: "block" }}>Expires</strong>
                                  <span className="sub">Default 7 days.</span>
                                </span>
                                <Select style={{ width: 92 }} value={viewer.expires_days} onChange={(event) => updatePublicShareViewer(viewer.id, { expires_days: Number(event.target.value) })}>
                                  <option value={1}>1 day</option>
                                  <option value={7}>7 days</option>
                                  <option value={14}>14 days</option>
                                  <option value={30}>30 days</option>
                                </Select>
                              </label>
                            </div>
                            {renderShareFilePicker({
                              selectedIds: viewer.file_ids,
                              search: viewer.file_search,
                              onSearch: (value) => updatePublicShareViewer(viewer.id, { file_search: value }),
                              onToggle: (fileId) => togglePublicShareViewerFile(viewer.id, fileId),
                              onSetSelected: (fileIds) => setPublicShareViewerFileIds(viewer.id, fileIds),
                            })}
                          </div>
                        ))}
                      </div>
                      <Btn onClick={addPublicShareViewer}>
                        <Icon name="plus" size={14} />
                        Add another link
                      </Btn>
                      <Btn variant="pri" style={{ width: "100%", justifyContent: "center" }} onClick={() => createPublicShareLinks().catch((e) => setNotice(readableError(e)))} disabled={!canCreatePublicShareLinks}>
                        {busy ? "Creating links..." : "Create public link"}
                      </Btn>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          }
        >
          {/* Two working columns. Grid rather than flex, so a `.panel` inside
              either column cannot shrink below its own content. */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, .65fr)", gap: 12, alignItems: "start" }}>
            <div className="grid">
              <Panel
                title="Uploaded documents"
                actions={
                  <div className="row">
                    <span className="tag">{filteredBucketFiles.length} of {visibleFiles.length} shown</span>
                    <Btn
                      size="sm"
                      onClick={() => {
                        setBucketSectionsOpen((current) => ({ ...current, upload: true }));
                        window.setTimeout(() => adminFileInputRef.current?.click(), 0);
                      }}
                    >
                      <Icon name="upload" size={13} />
                      Add files
                    </Btn>
                  </div>
                }
              >
                <div className="bucket-file-toolbar">
                  <div className="fieldwrap">
                    <Icon name="search" size={14} />
                    <Input
                      value={bucketFileQuery}
                      onChange={(event) => setBucketFileQuery(event.target.value)}
                      placeholder="Search files, uploader, task..."
                      aria-label="Search bucket files"
                    />
                  </div>
                  <Select value={bucketFileKind} onChange={(event) => setBucketFileKind(event.target.value as BucketFileKind)} aria-label="Filter file type">
                    <option value="all">All types</option>
                    <option value="pdf">PDF</option>
                    <option value="image">Images</option>
                    <option value="spreadsheet">Spreadsheets</option>
                    <option value="document">Documents</option>
                    <option value="other">Other</option>
                  </Select>
                  <Select value={bucketFileAssignment} onChange={(event) => setBucketFileAssignment(event.target.value as BucketFileAssignment)} aria-label="Filter file assignment">
                    <option value="all">All assignments</option>
                    <option value="requested">Requested tasks</option>
                    <option value="general">General uploads</option>
                  </Select>
                  <Select value={bucketFileStatus} onChange={(event) => setBucketFileStatus(event.target.value)} aria-label="Filter file status">
                    <option value="all">All statuses</option>
                    {bucketFileStatusOptions.map((status) => (
                      <option key={status} value={status}>{statusLabel(status)}</option>
                    ))}
                  </Select>
                  <Select value={bucketFileSort} onChange={(event) => setBucketFileSort(event.target.value as BucketFileSort)} aria-label="Sort uploaded documents">
                    <option value="newest">Newest upload first</option>
                    <option value="oldest">Oldest upload first</option>
                  </Select>
                </div>
                <div className="bucket-file-list">
                  {visibleFiles.length === 0 ? (
                    <EmptyInline icon="file" title="No files uploaded yet" body="Upload files or send an invite; documents will appear here first." />
                  ) : filteredBucketFiles.length === 0 ? (
                    <EmptyInline icon="search" title="No files match" body="Adjust the search or filters to show more bucket files." />
                  ) : filteredBucketFiles.map((file) => (
                    <div key={file.id} className="itemrow bucket-file-row">
                      <label className="row grow" style={{ cursor: "pointer" }}>
                        <input type="checkbox" checked={!!shareFiles[file.id]} onChange={(e) => setShareFiles({ ...shareFiles, [file.id]: e.target.checked })} />
                        <span className="grow">
                          <strong className="trunc" style={{ display: "block" }}>{file.file_name}</strong>
                          <span className="sub">
                            {requestedDocNameById.get(file.requested_document_id || "") || "General upload"} | {file.uploaded_by_name || "Unknown"} | {formatSize(file.size_bytes)} | {formatDate(file.created_at)}
                          </span>
                        </span>
                      </label>
                      <CellChip tone={file.requested_document_id ? "acc" : "mut"}>{file.requested_document_id ? "task" : "general"}</CellChip>
                      <div className="row">
                        <Btn size="sm" onClick={() => openFile(file, false)}>
                          <Icon name="eye" size={13} />
                          Preview
                        </Btn>
                        <Btn size="sm" onClick={() => openFile(file, true)}>
                          <Icon name="download" size={13} />
                          Download
                        </Btn>
                        <Btn
                          size="sm"
                          className="danger"
                          onClick={() => deleteFile(file).catch(() => undefined)}
                          disabled={deletingFileId === file.id}
                        >
                          <Icon name="x" size={13} />
                          {deletingFileId === file.id ? "Deleting..." : "Delete"}
                        </Btn>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                className={cx(!bucketSectionsOpen.upload && "bucket-panel-collapsed")}
                title="Upload on behalf"
                actions={bucketSectionActions(
                  "upload",
                  <span className="tag">
                    {adminUploadFiles.length} queued{adminUploadDraftStatus ? ` | ${adminUploadDraftStatus === "saving" ? "saving" : "saved"}` : ""}
                  </span>,
                )}
              >
                <input ref={adminFileInputRef} type="file" multiple hidden onChange={(event) => event.target.files && addAdminUploadFiles(event.target.files)} />
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 8 }}>
                  <Input
                    placeholder="Uploaded for"
                    value={adminUploadForm.uploader_name}
                    onChange={(event) => setAdminUploadForm({ ...adminUploadForm, uploader_name: event.target.value })}
                  />
                  <Input
                    placeholder="Email optional"
                    value={adminUploadForm.uploader_email}
                    onChange={(event) => setAdminUploadForm({ ...adminUploadForm, uploader_email: event.target.value })}
                  />
                  <Btn onClick={() => adminFileInputRef.current?.click()} disabled={adminUploading}>
                    <Icon name="upload" size={14} />
                    Choose files
                  </Btn>
                  <Textarea
                    style={{ gridColumn: "1 / -1", minHeight: 62 }}
                    placeholder="Internal note optional"
                    value={adminUploadForm.note}
                    onChange={(event) => setAdminUploadForm({ ...adminUploadForm, note: event.target.value })}
                  />
                </div>
                <div className="sub" style={{ marginTop: 7 }}>
                  Upload-on-behalf details autosave for this bucket and are applied to every queued file when uploaded.
                </div>
                {/* Drag state is a class modifier, not an inline branch:
                    `.dropzone.drag` is the same treatment the hover state gets. */}
                <div
                  className={cx("dropzone", "mt", isAdminUploadDragging && "drag")}
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
                  <div className="row" style={{ justifyContent: "center" }}>
                    <Icon name="upload" size={18} />
                    <div style={{ textAlign: "left" }}>
                      <b style={{ display: "block" }}>Drop files here or choose files</b>
                      <span className="sub">Leave a file as General upload when it does not match a requested task.</span>
                    </div>
                  </div>
                </div>
                {adminUploadFiles.length ? (
                  <div className="grid g8 mt">
                    {adminUploadFiles.map((item) => (
                      <div key={item.id} className={cx("itemrow", item.status === "error" && "tone-bad")}>
                        <div className="grow">
                          <strong className="trunc" style={{ display: "block" }}>{item.file.name}</strong>
                          <span className="sub">
                            {formatSize(item.file.size)} | {item.message || statusLabel(item.status)}
                          </span>
                        </div>
                        <Select
                          style={{ width: 190 }}
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
                        </Select>
                        <IconBtn onClick={() => removeAdminUploadFile(item.id)} disabled={adminUploading || item.status === "uploaded"} aria-label={`Remove ${item.file.name}`} title="Remove file">
                          <Icon name="x" size={14} />
                        </IconBtn>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hintbox mt">Choose files from your computer and assign them to a requested item or leave them as general uploads.</div>
                )}
                {adminUploadStatus ? <div className="mt"><CreateStatusBanner status={adminUploadStatus} /></div> : null}
                <div className="row mt" style={{ justifyContent: "flex-end" }}>
                  <Btn variant="pri" style={{ minWidth: 148, justifyContent: "center" }} onClick={submitAdminUploads} disabled={!canAdminUpload}>
                    {adminUploading ? "Uploading..." : "Upload files"}
                  </Btn>
                </div>
              </Panel>

              <Panel
                className={cx(!bucketSectionsOpen.tasks && "bucket-panel-collapsed")}
                title="Tasks"
                actions={bucketSectionActions("tasks", <span className="tag">{detail.requested_documents.length} items</span>)}
              >
                <div className="grid g8">
                  {detail.requested_documents.length === 0 ? (
                    <EmptyInline icon="docCheck" title="No requested-file tasks" body="Tasks are created from requested documents." />
                  ) : detail.requested_documents.map((doc) => (
                    <div key={doc.id} className="itemrow">
                      <div className="grow">
                        <strong>{doc.name}</strong>
                        <div className="sub">
                          {doc.category || "General"}{doc.required ? " | Required" : ""}{doc.allow_multiple_files ? " | Multiple files" : ""}
                        </div>
                        {doc.description ? <div className="sub" style={{ marginTop: 3 }}>{doc.description}</div> : null}
                      </div>
                      <CellChip tone={doc.status === "uploaded" ? "ok" : "mut"}>
                        {statusLabel(doc.status)}
                      </CellChip>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid">
              <Panel
                className={cx(!bucketSectionsOpen.notes && "bucket-panel-collapsed")}
                title="Notes"
                actions={bucketSectionActions("notes", <span className="tag">{detail.notes.length} notes</span>)}
              >
                <div className="thr">
                  {detail.notes.length === 0 ? (
                    <div className="thr-empty">No notes yet.</div>
                  ) : detail.notes.map((note) => (
                    // `.msg.internal` — dashed rather than tinted, because an
                    // internal note is the same person speaking off the record,
                    // not a fourth kind of participant.
                    <div key={note.id} className="msg internal">
                      <div className="msg-h">
                        <span className="msg-who">{note.author_name || "Admin"}</span>
                        <span className="msg-when">{formatDate(note.created_at)}</span>
                      </div>
                      <div className="msg-b">{note.content}</div>
                    </div>
                  ))}
                </div>
                <div className="composer">
                  <div className="composer-row">
                    <Input grow placeholder="Add admin note" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
                    <Btn onClick={addNote} disabled={!adminNote.trim()}>Add</Btn>
                  </div>
                </div>
              </Panel>

              <Panel
                className={cx(!bucketSectionsOpen.invites && "bucket-panel-collapsed")}
                title="Client Upload Invites"
                actions={bucketSectionActions("invites", <span className="tag">{detail.upload_links?.length ?? 0} invites</span>)}
                bodyClass="grid g8"
              >
                <div className="sub">For clients or upload parties to add documents. Uses an upload link and access code.</div>
                <div className="fldgrid two">
                  <Input
                    placeholder="Client/uploader name"
                    value={uploadLinkDraft.recipient_name}
                    onChange={(event) => setUploadLinkDraft({ ...uploadLinkDraft, recipient_name: event.target.value })}
                  />
                  <Input
                    placeholder="Email optional"
                    value={uploadLinkDraft.recipient_email}
                    onChange={(event) => setUploadLinkDraft({ ...uploadLinkDraft, recipient_email: event.target.value })}
                  />
                  <Input
                    placeholder="Upload access code"
                    value={uploadLinkDraft.passcode}
                    onChange={(event) => setUploadLinkDraft({ ...uploadLinkDraft, passcode: event.target.value })}
                  />
                  <div className="row">
                    <Btn onClick={() => setUploadLinkDraft({ ...uploadLinkDraft, passcode: generateAccessCode() })}>Generate</Btn>
                    <Btn variant="pri" onClick={() => createBucketUploadLink().catch((e) => setNotice(String(e)))} disabled={!uploadLinkDraft.recipient_name.trim()}>
                      Create
                    </Btn>
                  </div>
                </div>
                {(detail.upload_links ?? []).length === 0 ? (
                  <div className="hintbox">No upload links yet. Create one here to invite a client after bucket creation.</div>
                ) : (detail.upload_links ?? []).map((link) => {
                  const isOpen = expandedUploadLinkId === link.id;
                  const passcodeAvailable = Boolean(uploadLinkPasscodes[link.id] || link.passcode);
                  const isExpired = Boolean(link.expires_at && new Date(link.expires_at).getTime() <= Date.now());
                  const effectiveStatus = isExpired ? "Expired" : statusLabel(link.status);
                  return (
                    <div key={link.id} className={cx("disc", isOpen && "on", isExpired && "tone-bad")}>
                      <button
                        type="button"
                        onClick={() => setExpandedUploadLinkId(isOpen ? null : link.id)}
                        className="disc-h"
                        aria-expanded={isOpen}
                      >
                        <span className="grow">
                          <strong>{link.recipient_name}</strong>
                          <span className="sub trunc" style={{ display: "block" }}>
                            Client upload invite | {link.recipient_email || "No email"} | {link.completed_at ? "submitted" : "open"}
                          </span>
                        </span>
                        <CellChip tone={isExpired ? "bad" : "mut"}>{effectiveStatus}</CellChip>
                        <Icon name={isOpen ? "chevU" : "chevD"} size={14} />
                      </button>
                      {isOpen ? (
                        <div className="disc-b grid g8">
                          <div className="sub">
                            Upload link with access code | Created {formatDate(link.created_at)} | Expires {formatDate(link.expires_at)} | Completed {formatDateTime(link.completed_at)}
                          </div>
                          {link.upload_url ? <code className="sub" style={{ overflowWrap: "anywhere" }}>{link.upload_url}</code> : null}
                          {!passcodeAvailable ? (
                            <div className="hintbox">Access code is secured. Regenerate to copy a new invite.</div>
                          ) : null}
                          <div className="row">
                            <Btn size="sm" onClick={() => copyUploadLink(link)}>Copy link</Btn>
                            <Btn size="sm" onClick={() => regenerateUploadLinkPasscode(link).catch((e) => setNotice(String(e)))}>Regenerate code</Btn>
                            <Btn size="sm" onClick={() => copyUploadInvite(link)} disabled={!passcodeAvailable}>Copy invite</Btn>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </Panel>

              <div
                id="bucket-vendors-panel"
                // Data-derived: the header's vendor button scrolls you here, and
                // a ring is what tells you that you have arrived.
                style={{
                  scrollMarginTop: 18,
                  borderRadius: "var(--r)",
                  boxShadow: detailFocus === "vendors" ? "0 0 0 2px var(--accent)" : undefined,
                }}
              >
                <Panel
                  className={cx(!bucketSectionsOpen.vendors && "bucket-panel-collapsed")}
                  title="Vendor Accounts"
                  actions={bucketSectionActions("vendors", <span className="tag">{detail.vendor_access?.length ?? 0} vendors</span>)}
                  bodyClass="grid g8"
                >
                  <div className="sub">For recurring vendors who log in and see assigned buckets. This is not the bank share link workflow.</div>
                  <div className="card grid g8">
                    <Select
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
                    </Select>
                    <div className="fldgrid two">
                      <Input
                        placeholder="Vendor name"
                        value={vendorDraft.vendor_name}
                        onChange={(event) => setVendorDraft({ ...vendorDraft, vendor_user_id: "", vendor_name: event.target.value })}
                      />
                      <Input
                        placeholder="Vendor email"
                        value={vendorDraft.vendor_email}
                        onChange={(event) => setVendorDraft({ ...vendorDraft, vendor_user_id: "", vendor_email: event.target.value })}
                      />
                    </div>
                    <div className="fldgrid two">
                      <Select value={vendorDraft.file_scope} onChange={(event) => setVendorDraft({ ...vendorDraft, file_scope: event.target.value as VendorAccessDraft["file_scope"] })}>
                        <option value="all_active">All active files</option>
                        <option value="selected">Selected files</option>
                      </Select>
                      <Select value={vendorDraft.expires_days} onChange={(event) => setVendorDraft({ ...vendorDraft, expires_days: Number(event.target.value) })}>
                        <option value={1}>Expires 1 day</option>
                        <option value={7}>Expires 7 days</option>
                        <option value={14}>Expires 14 days</option>
                        <option value={30}>Expires 30 days</option>
                        <option value={0}>No expiration</option>
                      </Select>
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
                      <div className="hintbox">Vendor will see all current and future active files in this bucket.</div>
                    )}
                    {/* New-vendor permission matrix: all five vendor flags, each
                        wired to its own key on `vendorDraft`. */}
                    <div className="fldgrid two">
                      <label className={cx("pick", vendorDraft.can_preview && "on")}>
                        <span className="grow">
                          <strong style={{ display: "block" }}>Preview</strong>
                          <span className="sub">Allow file previews.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_preview} onChange={(event) => setVendorDraft({ ...vendorDraft, can_preview: event.target.checked })} />
                      </label>
                      <label className={cx("pick", vendorDraft.can_download && "on")}>
                        <span className="grow">
                          <strong style={{ display: "block" }}>Download</strong>
                          <span className="sub">Allow file downloads.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_download} onChange={(event) => setVendorDraft({ ...vendorDraft, can_download: event.target.checked })} />
                      </label>
                      <label className={cx("pick", vendorDraft.can_add_notes && "on")}>
                        <span className="grow">
                          <strong style={{ display: "block" }}>Notes</strong>
                          <span className="sub">Allow comments.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_add_notes} onChange={(event) => setVendorDraft({ ...vendorDraft, can_add_notes: event.target.checked })} />
                      </label>
                      <label className={cx("pick", vendorDraft.can_see_internal_notes && "on")}>
                        <span className="grow">
                          <strong style={{ display: "block" }}>Internal notes</strong>
                          <span className="sub">Show admin/internal notes.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_see_internal_notes} onChange={(event) => setVendorDraft({ ...vendorDraft, can_see_internal_notes: event.target.checked })} />
                      </label>
                      <label className={cx("pick", vendorDraft.can_propose_tasks && "on")}>
                        <span className="grow">
                          <strong style={{ display: "block" }}>Propose tasks</strong>
                          <span className="sub">Requires admin approval.</span>
                        </span>
                        <input type="checkbox" checked={vendorDraft.can_propose_tasks} onChange={(event) => setVendorDraft({ ...vendorDraft, can_propose_tasks: event.target.checked })} />
                      </label>
                    </div>
                    <Btn variant="pri" onClick={() => createVendorAccess().catch((e) => setNotice(readableError(e)))}>
                      <Icon name="plus" size={14} />
                      Invite / assign vendor
                    </Btn>
                  </div>

                  {(detail.vendor_access ?? []).length === 0 ? (
                    <div className="hintbox">No vendors assigned. Vendors log in and see assigned buckets without passcodes.</div>
                  ) : (detail.vendor_access ?? []).map((access) => {
                    const files = vendorFilesFor(access);
                    const isOpen = expandedVendorAccessId === access.id;
                    const isExpired = Boolean(access.expires_at && new Date(access.expires_at).getTime() <= Date.now());
                    const isRevoked = access.status === "revoked";
                    const effectiveStatus = isRevoked ? "Revoked" : isExpired ? "Expired" : statusLabel(access.status);
                    return (
                      // The row itself carries the dead state. A revoked vendor
                      // in a list of live ones has to be findable without
                      // reading every badge in the column.
                      <div key={access.id} className={cx("disc", isOpen && "on", (isRevoked || isExpired) && "tone-bad")}>
                        <button
                          type="button"
                          onClick={() => setExpandedVendorAccessId(isOpen ? null : access.id)}
                          className="disc-h"
                          aria-expanded={isOpen}
                        >
                          <span className="grow">
                            <strong>{access.vendor_name || access.vendor_email || "Vendor"}</strong>
                            <span className="sub trunc" style={{ display: "block" }}>
                              Vendor login | {access.file_scope === "all_active" ? "All active files" : `${files.length} selected files`} | {access.can_download ? "downloads on" : "view only"}
                            </span>
                          </span>
                          <CellChip tone={isRevoked || isExpired ? "bad" : "mut"}>{effectiveStatus}</CellChip>
                          <Icon name={isOpen ? "chevU" : "chevD"} size={14} />
                        </button>
                        {isOpen ? (
                          <div className="disc-b grid g8">
                            <div className="sub">
                              {access.vendor_email || "No email"} | Downloads {access.download_count} | Expires {formatDate(access.expires_at)} | Last access {formatDateTime(access.last_accessed_at)}
                            </div>
                            <Callout tone="acc">
                              <div className="sub">
                                Vendor login link is reusable. Vendor access uses their app email login; there is no bucket password to retrieve.
                              </div>
                              <div className="row mt">
                                <Btn size="sm" onClick={() => copyVendorLoginLink(access)}>Copy login link</Btn>
                                <Btn size="sm" onClick={() => copyVendorInvite(access)}>Copy invite</Btn>
                              </div>
                            </Callout>
                            {files.length ? (
                              <div className="sub trunc">
                                {files.slice(0, 3).map((file) => file.file_name).join(", ")}{files.length > 3 ? ` +${files.length - 3} more` : ""}
                              </div>
                            ) : null}
                            <div className="row">
                              <Btn size="sm" onClick={() => resendVendorInvite(access).catch((e) => setNotice(readableError(e)))}>Resend invite</Btn>
                              <Btn size="sm" onClick={() => openEditVendorFiles(access)}>Edit files</Btn>
                              <Btn size="sm" onClick={() => patchVendorAccess(access, { file_scope: "all_active", file_ids: [] }).then(() => setNotice("Vendor now sees all active files.")).catch((e) => setNotice(readableError(e)))}>Use all files</Btn>
                              {isRevoked ? (
                                <Btn size="sm" onClick={() => setVendorStatus(access, "active").catch((e) => setNotice(readableError(e)))} disabled={isExpired}>Reactivate</Btn>
                              ) : (
                                <Btn size="sm" className="danger" onClick={() => setVendorStatus(access, "revoked").catch((e) => setNotice(readableError(e)))}>Revoke</Btn>
                              )}
                            </div>
                            {/* Live vendor-access matrix: the same five flags,
                                each PATCHed onto THIS access row by key. */}
                            <div className="fldgrid two">
                              {([
                                ["can_preview", "Preview"],
                                ["can_download", "Download"],
                                ["can_add_notes", "Notes"],
                                ["can_see_internal_notes", "Internal notes"],
                                ["can_propose_tasks", "Propose tasks"],
                              ] as const).map(([key, label]) => (
                                <label key={key} className={cx("pick", access[key] && "on")}>
                                  <span className="grow"><strong>{label}</strong></span>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(access[key])}
                                    onChange={(event) => patchVendorAccess(access, { [key]: event.target.checked }).catch((e) => setNotice(readableError(e)))}
                                  />
                                </label>
                              ))}
                            </div>
                            {editingVendorAccessId === access.id ? (
                              <div className="grid g8" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                                <strong>Edit vendor visible files</strong>
                                {renderShareFilePicker({
                                  selectedIds: editingVendorFileIds,
                                  search: editingVendorFileSearch,
                                  onSearch: setEditingVendorFileSearch,
                                  onToggle: (fileId) => setEditingVendorFileIds((ids) => ids.includes(fileId) ? ids.filter((id) => id !== fileId) : [...ids, fileId]),
                                  onSetSelected: setEditingVendorFileIds,
                                })}
                                <div className="row" style={{ justifyContent: "flex-end" }}>
                                  <Btn onClick={() => setEditingVendorAccessId(null)}>Cancel</Btn>
                                  <Btn variant="pri" onClick={() => saveEditedVendorFiles(access).catch((e) => setNotice(readableError(e)))} disabled={!editingVendorFileIds.length}>Save selected files</Btn>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </Panel>
              </div>

              <Panel
                className={cx(!bucketSectionsOpen.shares && "bucket-panel-collapsed")}
                title="Share Links - No Login"
                actions={bucketSectionActions("shares", <span className="tag">{detail.shares.length} links</span>)}
                bodyClass="grid g8"
              >
                <div className="sub">For banks, lenders, and one-time third parties. Send the secure link plus access code.</div>
                {detail.shares.length === 0 ? (
                  <div className="hintbox">No share links yet.</div>
                ) : detail.shares.map((share) => {
                  const files = shareFilesFor(share);
                  const isExpired = Boolean(share.expires_at && new Date(share.expires_at).getTime() <= Date.now());
                  const isRevoked = share.status === "revoked";
                  const effectiveStatus = isRevoked ? "Revoked" : isExpired ? "Expired" : statusLabel(share.status);
                  const passcodeAvailable = Boolean(sharePasscodes[share.id] || share.passcode);
                  const isOpen = expandedShareId === share.id;
                  return (
                    <div key={share.id} className={cx("disc", isOpen && "on", (isRevoked || isExpired) && "tone-bad")}>
                      <button
                        type="button"
                        onClick={() => setExpandedShareId(isOpen ? null : share.id)}
                        className="disc-h"
                        aria-expanded={isOpen}
                      >
                        <span className="grow">
                          <strong>{share.recipient_name}</strong>
                          <span className="sub trunc" style={{ display: "block" }}>
                            No login | access code required | {files.length} file{files.length === 1 ? "" : "s"} | {share.can_download ? "downloads on" : "view only"}
                          </span>
                        </span>
                        <CellChip tone={isRevoked || isExpired ? "bad" : "mut"}>{effectiveStatus}</CellChip>
                        <Icon name={isOpen ? "chevU" : "chevD"} size={14} />
                      </button>
                      {isOpen ? (
                        <div className="disc-b grid g8">
                          <div className="row top">
                            <div className="grow">
                              <div className="sub">No-login third-party share | {share.recipient_email || "No email"} | {files.length} file{files.length === 1 ? "" : "s"}</div>
                              <div className="sub">
                                {share.view_count} views | {share.download_count} downloads | {share.can_download ? "downloads on" : "view only"}
                              </div>
                              <div className="sub">
                                Expires {formatDate(share.expires_at)} | Last access {formatDateTime(share.last_accessed_at)}
                              </div>
                            </div>
                            {/* No status chip here: the collapsed row header
                                above already carries it, so expanding a share
                                showed the same word twice. The other two lists
                                (vendor access, upload links) show it once. */}
                          </div>
                          {files.length ? (
                            <div className="sub trunc">
                              {files.slice(0, 3).map((file) => file.file_name).join(", ")}{files.length > 3 ? ` +${files.length - 3} more` : ""}
                            </div>
                          ) : null}
                          <div className="row">
                            <Btn size="sm" onClick={() => copyShareLink(share)}>Copy link</Btn>
                            <Btn size="sm" onClick={() => regenerateSharePasscode(share)}>Regenerate code</Btn>
                            <Btn size="sm" onClick={() => copyShareInvite(share)} disabled={!passcodeAvailable}>Copy invite</Btn>
                            <Btn size="sm" onClick={() => openEmailShare(share)} disabled={!passcodeAvailable}>Email from my Gmail</Btn>
                            <Btn size="sm" onClick={() => openEditShareFiles(share)}>Edit files</Btn>
                            <Select
                              style={{ width: 118 }}
                              defaultValue=""
                              aria-label={`Extend the expiry of the share for ${share.recipient_name}`}
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
                            </Select>
                            {isRevoked ? (
                              <Btn size="sm" onClick={() => setShareStatus(share, "active")} disabled={isExpired}>Reactivate</Btn>
                            ) : (
                              <Btn size="sm" className="danger" onClick={() => setShareStatus(share, "revoked")}>Revoke</Btn>
                            )}
                          </div>
                          {editingShareId === share.id ? (
                            <div className="grid g8" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                              <strong>Edit visible files</strong>
                              {renderShareFilePicker({
                                selectedIds: editingShareFileIds,
                                search: editingShareSearch,
                                onSearch: setEditingShareSearch,
                                onToggle: (fileId) => setEditingShareFileIds((ids) => ids.includes(fileId) ? ids.filter((id) => id !== fileId) : [...ids, fileId]),
                                onSetSelected: setEditingShareFileIds,
                              })}
                              <div className="row" style={{ justifyContent: "flex-end" }}>
                                <Btn onClick={() => setEditingShareId(null)}>Cancel</Btn>
                                <Btn variant="pri" onClick={() => saveEditedShareFiles(share)} disabled={!editingShareFileIds.length}>Save files</Btn>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </Panel>

              <Panel
                className={cx(!bucketSectionsOpen.activity && "bucket-panel-collapsed")}
                title="Activity"
                actions={bucketSectionActions("activity", <span className="tag">{activityTotal} total</span>)}
                bodyClass="grid g8"
              >
                <Input
                  value={activityFilters.q}
                  onChange={(event) => updateActivityFilters({ q: event.target.value })}
                  placeholder="Search activity"
                  aria-label="Search activity"
                />
                <div className="fldgrid two">
                  <Select value={activityFilters.action} onChange={(event) => updateActivityFilters({ action: event.target.value })} aria-label="Filter by action">
                    <option value="">All actions</option>
                    {ACTIVITY_ACTION_OPTIONS.map((action) => (
                      <option key={action} value={action}>{activityLabel(action)}</option>
                    ))}
                  </Select>
                  <Select value={activityFilters.actor_role} onChange={(event) => updateActivityFilters({ actor_role: event.target.value })} aria-label="Filter by role">
                    <option value="">All roles</option>
                    {ACTIVITY_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{statusLabel(role)}</option>
                    ))}
                  </Select>
                </div>
                <Select value={activityFilters.target_type} onChange={(event) => updateActivityFilters({ target_type: event.target.value })} aria-label="Filter by target">
                  <option value="">All targets</option>
                  {ACTIVITY_TARGET_OPTIONS.map((target) => (
                    <option key={target} value={target}>{statusLabel(target)}</option>
                  ))}
                </Select>
                <div className="fldgrid two">
                  <Input
                    type="date"
                    value={activityFilters.date_from}
                    onChange={(event) => updateActivityFilters({ date_from: event.target.value })}
                    aria-label="Activity from date"
                  />
                  <Input
                    type="date"
                    value={activityFilters.date_to}
                    onChange={(event) => updateActivityFilters({ date_to: event.target.value })}
                    aria-label="Activity to date"
                  />
                </div>
                <Btn
                  onClick={() => {
                    const filters = emptyActivityFilters();
                    setActivityFilters(filters);
                    void loadBucketActivity(detail.id, 0, filters);
                  }}
                >
                  Clear filters
                </Btn>
                {/* A floor on the list height so paging does not make the panel
                    — and the pager under it — jump up the page. */}
                <div className="grid g8" style={{ minHeight: 360, alignContent: "start" }}>
                  {activityLoading && activityRows.length === 0 ? (
                    <div className="hintbox">Loading activity...</div>
                  ) : activityRows.length === 0 ? (
                    <div className="hintbox">No activity matches these filters.</div>
                  ) : activityRows.map((item) => {
                    const isOpen = expandedActivityId === item.id;
                    return (
                      <div key={item.id} className={cx("disc", isOpen && "on")}>
                        <button
                          type="button"
                          onClick={() => setExpandedActivityId(isOpen ? null : item.id)}
                          className="disc-h"
                          aria-expanded={isOpen}
                        >
                          <span className="grow">
                            <strong>{activityLabel(item.action)}</strong>
                            <span className="sub trunc" style={{ display: "block" }}>
                              {activityActor(item)} | {formatDateTime(item.created_at)}
                            </span>
                          </span>
                          <Icon name={isOpen ? "chevU" : "chevD"} size={14} />
                        </button>
                        {isOpen ? (
                          <div className="disc-b">
                            {item.detail ? <div style={{ marginBottom: 6 }}>{item.detail}</div> : null}
                            <div className="sub">
                              {[item.target_type ? statusLabel(item.target_type) : null, item.target_id, item.ip_address].filter(Boolean).join(" | ")}
                            </div>
                            {item.user_agent ? <div className="sub" style={{ marginTop: 4, overflowWrap: "anywhere" }}>{item.user_agent}</div> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <IconBtn
                    disabled={!canPageActivityBack}
                    onClick={() => detail && loadBucketActivity(detail.id, Math.max(0, activityOffset - ACTIVITY_PAGE_SIZE), activityFilters)}
                    aria-label="Previous activity page"
                    title="Previous"
                  >
                    <Icon name="chevL" size={15} />
                  </IconBtn>
                  <span className="sub num">
                    {activityPage} / {activityPageCount}
                  </span>
                  <IconBtn
                    disabled={!canPageActivityForward}
                    onClick={() => detail && loadBucketActivity(detail.id, activityOffset + ACTIVITY_PAGE_SIZE, activityFilters)}
                    aria-label="Next activity page"
                    title="Next"
                  >
                    <Icon name="chevR" size={15} />
                  </IconBtn>
                </div>
              </Panel>
            </div>
          </div>
        </ModalFrame>
      ) : null}
      {detail && bucketDetailMinimized ? (
        <div className={cx("workspace-minimized-dock", reviewFile && reviewMinimized && "workspace-minimized-dock--raised")} role="status" aria-live="polite">
          <button type="button" className="workspace-minimized-summary" onClick={() => setBucketDetailMinimized(false)}>
            <span className="workspace-minimized-mark">-</span>
            <span>
              <b>{detail.name}</b>
              <small>{detail.client_name ? `${detail.client_name} bucket workspace paused` : "Bucket workspace paused where you left off"}</small>
            </span>
          </button>
          <Btn size="sm" variant="pri" onClick={() => setBucketDetailMinimized(false)}>Resume</Btn>
          <IconBtn aria-label="Close minimized bucket workspace" title="Close" onClick={closeBucketDetail}>
            <Icon name="x" size={14} />
          </IconBtn>
        </div>
      ) : null}
      <BucketIntakeLinkDrawer
        open={linkBucket !== null}
        onClose={() => setLinkBucket(null)}
        initialBucketId={linkBucket?.id}
        initialIntakeId={linkBucket ? primaryIntakeByBucket.get(linkBucket.id) : undefined}
        title="Link bucket to AI intake"
      />
      {reviewFile ? (
        <BucketFileReviewPanel
          title="Admin file review"
          minimized={reviewMinimized}
          onMinimize={() => setReviewMinimized(true)}
          loadReview={() => loadAdminReview(reviewFile)}
          saveAnnotation={(payload) => saveAdminAnnotation(reviewFile, payload)}
          onDelete={() => {
            const file = reviewFile;
            setReviewMinimized(false);
            setReviewFile(null);
            deleteFile(file).catch(() => undefined);
          }}
          onClose={() => {
            setReviewMinimized(false);
            setReviewFile(null);
          }}
          files={visibleFiles}
          activeFileId={reviewFile.id}
          onSelectFile={(fileId) => {
            const next = visibleFiles.find((file) => file.id === fileId);
            if (next) {
              setReviewMinimized(false);
              setReviewFile(next);
            }
          }}
        />
      ) : null}
      {reviewFile && reviewMinimized ? (
        <div className="workspace-minimized-dock" role="status" aria-live="polite">
          <button type="button" className="workspace-minimized-summary" onClick={() => setReviewMinimized(false)}>
            <span className="workspace-minimized-mark">-</span>
            <span>
              <b>{reviewFile.file_name}</b>
              <small>{detail?.name ? `${detail.name} bucket review paused` : "Bucket review paused"}</small>
            </span>
          </button>
          <Btn size="sm" variant="pri" onClick={() => setReviewMinimized(false)}>Resume</Btn>
          <IconBtn
            aria-label="Close minimized bucket review"
            title="Close"
            onClick={() => {
              setReviewMinimized(false);
              setReviewFile(null);
            }}
          >
            <Icon name="x" size={14} />
          </IconBtn>
        </div>
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

type ConvertLeadVariant = "dealer" | "real_estate" | "main_street" | "mca_refinance";

type ConvertLeadPayload = {
  variant: ConvertLeadVariant;
  full_name: string;
  email: string;
  phone?: string;
  business_name?: string;
  // Main Street only. The bucket's documents stay as they are on this path, so
  // these steer the AI framing and the program screen rather than a checklist.
  industry?: string;
  intent?: string;
  notify_client: boolean;
};

/**
 * Link a document bucket to an AI-underwriter lead.
 *
 * This is the same `/admin/ai-underwriter-leads/from-bucket/{id}` call the flat
 * modal made — nothing new server-side. What changed is that it asks its three
 * questions in the order the answers actually depend on each other, and it
 * shows you what you are about to do before you do it.
 *
 * The flat form asked for the lead type in a select at the top and the client's
 * details underneath, which put a decision that CHANGES THE REST OF THE FORM
 * (Main Street adds two required fields) in the same visual weight as a
 * phone number. And it buried "email the client a secure login link now" — an
 * outward-facing action that sends real mail to a real person — as an unlabelled
 * checkbox between the form and the submit button. Here it is a reviewed
 * decision on the confirmation step, with the recipient address spelled out.
 *
 * Nothing is copied, re-uploaded or moved. The bucket keeps its files; the lead
 * reads them where they are. That is the sentence step 3 exists to say.
 */
const LEAD_VARIANTS: { value: ConvertLeadVariant; label: string; blurb: string }[] = [
  { value: "dealer", label: "Dealer", blurb: "Equipment and fleet finance through a dealer relationship." },
  { value: "real_estate", label: "Real estate", blurb: "An investor or entity borrowing against property." },
  { value: "main_street", label: "Main Street", blurb: "An operating business. Needs an industry and a use of funds so the AI screens it against the right programs." },
  { value: "mca_refinance", label: "MCA refinance", blurb: "Consolidating existing merchant cash advances." },
];

const LINK_STEPS = ["Lead type", "Borrower", "Review"];

function ConvertToLeadModal({
  bucket,
  busy,
  error,
  onClose,
  onConvert,
}: {
  bucket: Bucket;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConvert: (payload: ConvertLeadPayload) => void | Promise<void>;
}) {
  // Guess from the bucket's own type before making the operator choose. Each
  // variant has its own bucket_type, so this is usually right.
  const bucketType = (bucket.bucket_type || "").toLowerCase();
  const guessedVariant: ConvertLeadVariant = bucketType.includes("real_estate")
    ? "real_estate"
    : bucketType.includes("main_street")
      ? "main_street"
      : bucketType.includes("mca")
        ? "mca_refinance"
        : "dealer";
  const [step, setStep] = useState(1);
  const [variant, setVariant] = useState<ConvertLeadVariant>(guessedVariant);
  const [industry, setIndustry] = useState<string>("other");
  const [intent, setIntent] = useState<string>("working_capital");
  const [fullName, setFullName] = useState(bucket.client_name || "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState(bucket.client_name || "");
  const [notifyClient, setNotifyClient] = useState(false);
  const [formError, setFormError] = useState("");

  const fileCount = bucket.uploaded_file_count ?? bucket.file_count ?? 0;
  const variantLabel = LEAD_VARIANTS.find((v) => v.value === variant)?.label ?? variant;

  // Step 2 is the only step that can be incomplete. Checked on the way FORWARD
  // rather than on submit, so the operator is not told on the review screen
  // that something four fields back is wrong.
  function step2Problem(): string | null {
    if (!fullName.trim()) return "Client name is required.";
    if (!email.trim() || !email.includes("@")) return "A valid client email is required.";
    return null;
  }

  function goNext() {
    if (step === 2) {
      const problem = step2Problem();
      if (problem) {
        setFormError(problem);
        return;
      }
    }
    setFormError("");
    setStep((n) => Math.min(3, n + 1));
  }

  function submit() {
    const problem = step2Problem();
    if (problem) {
      setFormError(problem);
      setStep(2);
      return;
    }
    setFormError("");
    onConvert({
      variant,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      business_name: businessName.trim() || undefined,
      industry: variant === "main_street" ? industry : undefined,
      intent: variant === "main_street" ? intent : undefined,
      notify_client: notifyClient,
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title="Link to an AI Underwriter lead"
      sub={bucket.name}
      // The title is stable across all three steps, so no ariaLabel override
      // is needed here — the heading already names the dialog.
      footer={
        <>
          {formError || error ? (
            <span style={{ fontSize: 12, color: "var(--danger)" }}>{formError || error}</span>
          ) : null}
          <span style={{ flex: 1 }} />
          {step > 1 ? (
            <Btn onClick={() => { setFormError(""); setStep((n) => n - 1); }} disabled={busy}>
              Back
            </Btn>
          ) : (
            <Btn onClick={onClose} disabled={busy}>
              Cancel
            </Btn>
          )}
          {step < 3 ? (
            <Btn variant="pri" onClick={goNext}>
              Continue
            </Btn>
          ) : (
            <Btn variant="pri" onClick={submit} disabled={busy}>
              {busy ? "Linking…" : "Link to lead"}
            </Btn>
          )}
        </>
      }
    >
      <DrawerSteps steps={LINK_STEPS} current={step} />

      {step === 1 ? (
        <>
          <Sub>
            Picked from this bucket&apos;s own type. Change it if the file is really something else —
            it decides how the AI reads the documents and which programs it screens against.
          </Sub>
          <div style={{ marginTop: 12 }}>
            {LEAD_VARIANTS.map((v) => (
              <label key={v.value} className={cx("pick top", variant === v.value && "on")}>
                <input
                  type="radio"
                  name="lead-variant"
                  checked={variant === v.value}
                  onChange={() => setVariant(v.value)}
                  style={{ marginTop: 3, accentColor: "var(--accent)" }}
                />
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13 }}>{v.label}</b>
                  <Sub>{v.blurb}</Sub>
                </span>
              </label>
            ))}
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <div className="grid g10">
          {variant === "main_street" ? (
            <div className="fldgrid two">
              <Field label="Industry" hint="Required for Main Street.">
                <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                  {MAIN_STREET_INDUSTRIES.map((i) => (
                    <option key={i.slug} value={i.slug}>{i.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="What they need" hint="Required for Main Street.">
                <Select value={intent} onChange={(e) => setIntent(e.target.value)}>
                  {MAIN_STREET_INTENTS.map((i) => (
                    <option key={i.slug} value={i.slug}>{i.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          <div className="fldgrid two">
            <Field label="Client full name" req={!fullName.trim()}>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className={cx(!fullName.trim() && "bad")}
              />
            </Field>
            <Field label="Client email" req={!email.trim() || !email.includes("@")}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className={cx((!email.trim() || !email.includes("@")) && "bad")}
              />
            </Field>
            <Field label="Phone" hint="Optional.">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </Field>
            <Field
              label={variant === "real_estate" ? "Investor / entity name" : "Business name"}
              hint="Optional."
            >
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid g10">
          <Callout tone="acc" icon={<Icon name="docCheck" size={15} stroke={2.2} />}>
            <b style={{ fontSize: 13 }}>Nothing moves.</b>
            <Sub>
              The bucket keeps its {fileCount === 1 ? "file" : "files"} exactly where they are. The lead
              reads them in place — nothing is copied, re-uploaded, or removed from{" "}
              <strong>{bucket.name}</strong>.
            </Sub>
          </Callout>

          <Panel title="What gets linked">
            <div className="kv">
              <span className="lbl">Bucket</span>
              <span>{bucket.name}</span>
            </div>
            <div className="kv">
              <span className="lbl">Files the AI will read</span>
              <span className="num">{fileCount}</span>
            </div>
            <div className="kv">
              <span className="lbl">Lead type</span>
              <span>{variantLabel}</span>
            </div>
            {variant === "main_street" ? (
              <div className="kv">
                <span className="lbl">Screened as</span>
                <span>
                  {MAIN_STREET_INDUSTRIES.find((i) => i.slug === industry)?.label ?? industry}
                  {" · "}
                  {MAIN_STREET_INTENTS.find((i) => i.slug === intent)?.label ?? intent}
                </span>
              </div>
            ) : null}
            <div className="kv">
              <span className="lbl">Borrower</span>
              <span>
                {fullName.trim()}
                {businessName.trim() ? ` · ${businessName.trim()}` : ""}
              </span>
            </div>
          </Panel>

          {fileCount === 0 ? (
            <div className="warnline">
              This bucket has no uploaded files yet. The lead will be created, but there is nothing for
              the AI to audit until something is uploaded.
            </div>
          ) : null}

          {/* An outward-facing action gets its own decision, not a checkbox
              tucked between the last field and the submit button. */}
          <label className={cx("pick top", notifyClient && "on")}>
            <input
              type="checkbox"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
              style={{ marginTop: 3, accentColor: "var(--accent)" }}
            />
            <span style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>Email {email.trim() || "the client"} a secure resume link</b>
              <Sub>
                {notifyClient
                  ? "A real email goes out as soon as you link. Leave this off to link quietly and send it yourself later."
                  : "Off — nothing is sent. You can send the link from the lead afterwards."}
              </Sub>
            </span>
          </label>
        </div>
      ) : null}
    </Drawer>
  );
}

function BucketTable({
  buckets,
  links,
  primaryIntakeByBucket,
  deletingId,
  onSelect,
  onOpenVendors,
  onConvertToLead,
  onLinkIntake,
  onDelete,
}: {
  buckets: Bucket[];
  links: BucketIntakeLinkRead[];
  primaryIntakeByBucket: Map<string, string>;
  deletingId: string | null;
  onSelect: (id: string) => void;
  onOpenVendors: (id: string) => void;
  onConvertToLead: (bucket: Bucket) => void;
  onLinkIntake: (bucket: Bucket) => void;
  onDelete: (bucket: Bucket) => void;
}) {
  if (buckets.length === 0) {
    return <div className="sub" style={{ padding: 18 }}>No buckets yet. Use Create bucket to start.</div>;
  }
  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead><tr><th>Bucket</th><th>Client</th><th>Requested / uploaded</th><th>Vendors</th><th>Status</th><th>Linked AI intake</th><th>Updated</th><th className="r">Actions</th></tr></thead>
        <tbody>
          {buckets.map((bucket) => {
            const link = links.find((item) => item.bucket_id === bucket.id && item.status === "active");
            const primaryIntakeId = primaryIntakeByBucket.get(bucket.id);
            return (
              <tr key={bucket.id} onClick={() => onSelect(bucket.id)}>
                <td><button type="button" className="linky" onClick={() => onSelect(bucket.id)}>{bucket.name}</button><div className="sub num">{bucket.id.slice(0, 8)} · {bucket.bucket_type || "Bucket"}</div></td>
                <td>{bucket.client_name || <span className="sub">No client</span>}</td>
                <td className="num">{bucket.file_count ?? 0} / {bucket.uploaded_file_count ?? 0}</td>
                <td className="num">{bucket.vendor_access_count ?? 0}</td>
                <td><CellChip tone={bucket.status.toLowerCase().includes("complete") ? "ok" : bucket.status.toLowerCase().includes("review") ? "acc" : "warn"}>{statusLabel(bucket.status)}</CellChip></td>
                <td>{link || primaryIntakeId ? <button type="button" className="cellchip c-acc" onClick={(event) => { event.stopPropagation(); onLinkIntake(bucket); }}>{(link?.intake_id || primaryIntakeId || "").slice(0, 8)}</button> : <Btn size="sm" onClick={(event) => { event.stopPropagation(); onLinkIntake(bucket); }}>Link</Btn>}</td>
                <td className="sub">{formatDate(bucket.updated_at)}</td>
                <td className="r">
                  <span onClick={(event) => event.stopPropagation()}>
                    <PageActionMenu label={`Actions for ${bucket.name}`} items={[
                      { label: "Open bucket", onSelect: () => onSelect(bucket.id) },
                      { label: "Vendor access", onSelect: () => onOpenVendors(bucket.id) },
                      { label: link || primaryIntakeId ? "Manage AI intake link" : "Link AI intake", onSelect: () => onLinkIntake(bucket) },
                      { label: "Create AI intake", onSelect: () => onConvertToLead(bucket) },
                      { label: deletingId === bucket.id ? "Deleting..." : "Delete bucket", onSelect: () => onDelete(bucket), tone: "danger" },
                    ]} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The full-bleed working surface this page opens things into.
 *
 * Not a `Drawer`: the bucket detail is the page's main workspace — upload,
 * files, tasks, notes, three sharing mechanisms and an activity log at once —
 * and an 86vh centred box would put three independent scrollers on screen
 * together. This keeps the full-height overlay and takes its surface, header
 * and hairline from the class system instead of a palette object.
 */
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
  return (
    <Drawer open onClose={onClose} width="xl" fullscreen title={title} sub={subtitle} headerActions={action} bodyClass="grid">
      {children}
    </Drawer>
  );
}

function WorkflowHeader({ step, title, subtitle }: { step: string; title: string; subtitle?: string }) {
  return (
    <div className="row">
      <span className="stepdot on">
        <i>{step}</i>
      </span>
      <div>
        {/* h3, not <b>. These are the three step titles of the create-bucket
            drawer, whose only other heading is the drawer's own h2. As <b> they
            left the document outline, and a screen-reader user navigating by
            heading got one undifferentiated run of form. */}
        <h3 className="wfh-t">{title}</h3>
        {subtitle ? <div className="sub">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function EmptyInline({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="hintbox">
      <span className="hintbox-i">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <b>{title}</b>
        <div className="sub">{body}</div>
      </div>
    </div>
  );
}

function CreateStatusBanner({ status }: { status: { kind: "working" | "success" | "error"; message: string } }) {
  const isError = status.kind === "error";
  const isSuccess = status.kind === "success";
  // A sentence, not a word — `StatusLine` wraps where a `CellChip` would be
  // clipped by the panel it sits in.
  return (
    <StatusLine tone={isError ? "bad" : isSuccess ? "ok" : "acc"}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icon name={isError ? "alert" : isSuccess ? "check" : "refresh"} size={15} />
        {status.message}
      </span>
    </StatusLine>
  );
}

/** A bordered surface with no header row. `Panel` is the one that has one. */
function PanelBox({ children, className, style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx("card", className)} style={style}>
      {children}
    </div>
  );
}

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
    });
}

function bucketFileKindOf(file: BucketFile): Exclude<BucketFileKind, "all"> {
  const contentType = file.content_type.toLowerCase();
  const name = file.file_name.toLowerCase();
  if (contentType.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(name)) return "image";
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("csv") || /\.(csv|xlsx?|xlsm)$/i.test(name)) return "spreadsheet";
  if (contentType.includes("word") || contentType.includes("document") || /\.(docx?|rtf|txt)$/i.test(name)) return "document";
  return "other";
}

function localFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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

/**
 * Is this notice a failure?
 *
 * `notice` is a single string slot written by both success paths ("Bucket
 * deleted.") and sixteen failure paths (`readableError(...)`, `String(e)`).
 * Rather than thread a kind through every call site during a styling pass,
 * this reads the string — deliberately conservative: anything it is not sure
 * about renders as success, which is how the page behaved before.
 */
function noticeIsFailure(notice: string): boolean {
  return /\b(fail|failed|error|could\s*not|couldn't|unable|denied|invalid|expired|rejected)\b/i.test(
    notice,
  );
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Bucket could not be created. Please try again.";
}
