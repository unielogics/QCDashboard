"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, SectionLabel } from "@/components/design-system/primitives";
import { BucketFileReviewPanel, type BucketFileAnnotation, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import { useCurrentUser } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
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
  shares: Share[];
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
type UploadInviteLink = { name: string; email?: string; url: string; passcode: string };
type UploadInitResponse = { file_id: string; upload_url: string; required_headers: Record<string, string> };
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
  route: "admin" | "uploader" | "share";
  upload_link_id?: string | null;
  share_id?: string | null;
  title: string;
  instructions: string;
  rationale?: string | null;
  created_at: string;
};

const BUCKET_TYPES = ["Loan File", "UrChoice Dealer Funding", "Partner Package", "Borrower", "Funding Opportunity"];
const REQUEST_DOCS_PER_PAGE = 10;
const ACTIVITY_PAGE_SIZE = 12;
const ACTIVITY_ACTION_OPTIONS = [
  "bucket_created",
  "bucket_deleted",
  "requested_document_added",
  "upload_link_created",
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
  "note_created",
  "file_review_opened",
  "file_preview_url_created",
  "file_download_url_created",
  "file_annotation_created",
];
const ACTIVITY_ROLE_OPTIONS = ["super_admin", "uploader", "shared_user", "system"];
const ACTIVITY_TARGET_OPTIONS = ["bucket", "requested_document", "upload_link", "share", "file", "note", "annotation"];
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

export default function BucketsAdminPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { getToken } = useAuth();
  const adminFileInputRef = useRef<HTMLInputElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [detail, setDetail] = useState<BucketDetail | null>(null);
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
  const [editingShareId, setEditingShareId] = useState<string | null>(null);
  const [editingShareFileIds, setEditingShareFileIds] = useState<string[]>([]);
  const [editingShareSearch, setEditingShareSearch] = useState("");
  const [adminUploadFiles, setAdminUploadFiles] = useState<AdminQueuedFile[]>([]);
  const [adminUploadForm, setAdminUploadForm] = useState({ uploader_name: "", uploader_email: "", note: "" });
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

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadBuckets() {
    const [bucketRows, templateRows] = await Promise.all([
      call<Bucket[]>("/buckets"),
      call<Template[]>("/buckets/templates"),
    ]);
    setBuckets(bucketRows);
    setTemplates(templateRows);
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
    setExpandedShareId(null);
    setExpandedActivityId(null);
    setAdminUploadFiles([]);
    setAdminUploadStatus(null);
    setAdminUploadForm((form) => ({ ...form, uploader_name: row.client_name || form.uploader_name || "", uploader_email: "" }));
    setAiContextDraft(row.ai_context ?? {});
    await Promise.all([loadBucketActivity(bucketId, 0, filters), loadBucketAI(bucketId)]);
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
        const uploadLink = await call<{ upload_url: string }>(`/buckets/admin/${row.id}/upload-links`, {
          method: "POST",
          body: JSON.stringify({
            recipient_name: invite.recipient_name,
            recipient_email: invite.recipient_email.trim() || null,
            passcode: invite.passcode,
          }),
        });
        uploadLinks.push({ name: invite.recipient_name, email: invite.recipient_email || undefined, url: uploadLink.upload_url, passcode: invite.passcode });
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
    void copyText(`Secure file room: ${share.share_url}\nAccess code: ${passcode}`);
  }

  async function setShareStatus(share: Share, statusValue: "active" | "revoked") {
    if (statusValue === "revoked" && !window.confirm(`Revoke access for ${share.recipient_name}?`)) return;
    await patchShare(share, { status: statusValue });
    setNotice(statusValue === "revoked" ? "Share access revoked." : "Share access reactivated.");
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
        setSharePasscodes((codes) => ({ ...codes, [res.id]: res.passcode ?? passcode }));
      }
      const row = await call<BucketDetail>(`/buckets/admin/${detail.id}`);
      setDetail(row);
      setShareViewers([newShareViewerDraft()]);
      setSharePopupOpen(false);
      setNotice(`${createdCount} share link${createdCount === 1 ? "" : "s"} created. Copy links and access codes from the Shares panel.`);
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
    window.open(res.url, "_blank", "noopener,noreferrer");
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, color: t.ink, fontSize: 28, fontWeight: 850 }}>Buckets</h1>
          <p style={{ margin: "5px 0 0", color: t.ink3, fontSize: 13 }}>
            Secure document rooms for collecting and selectively sharing files.
          </p>
        </div>
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

      {notice ? (
        <PanelBox style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, color: t.ink2 }}>
          <Icon name="check" size={14} />
          {notice}
        </PanelBox>
      ) : null}

      <PanelBox style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderBottom: `1px solid ${t.line}` }}>
          <SectionLabel style={{ margin: 0 }}>Bucket list</SectionLabel>
          <div style={{ position: "relative", width: 320 }}>
            <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 11, color: t.ink3 }} />
            <input style={{ ...field, width: "100%", paddingLeft: 32 }} placeholder="Search buckets" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <BucketTable buckets={filteredBuckets} deletingId={deletingId} onSelect={loadBucket} onDelete={deleteBucket} />
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
                    <div key={`${link.name}-${link.url}`} style={smallRowStyle(t)}>
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
            <div ref={shareMenuRef} style={{ position: "relative" }}>
              <button
                style={{
                  ...iconButtonStyle(t),
                  borderColor: sharePopupOpen ? t.petrol : t.line,
                  background: sharePopupOpen ? t.petrolSoft : t.surface,
                  color: sharePopupOpen ? t.petrol : t.ink2,
                }}
                onClick={() => {
                  setSharePopupOpen((value) => !value);
                }}
                aria-label="Share selected files"
                title="Share selected files"
              >
                <Icon name="link" size={16} />
              </button>
              {sharePopupOpen ? (
                <div style={sharePopupStyle(t)}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", paddingBottom: 10, borderBottom: `1px solid ${t.line}` }}>
                    <div>
                      <div style={{ color: t.ink, fontWeight: 900, fontSize: 14 }}>Create share links</div>
                      <div style={{ color: t.ink3, fontSize: 12, marginTop: 2 }}>Choose files separately for each viewer.</div>
                    </div>
                    <button style={iconButtonStyle(t)} onClick={() => setSharePopupOpen(false)} aria-label="Close share popup">
                      <Icon name="x" size={14} />
                    </button>
                  </div>

                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
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
                    <button style={{ ...primary, width: "100%", opacity: canCreateShareLinks ? 1 : 0.68 }} onClick={createShareLinks} disabled={!canCreateShareLinks}>
                      {busy ? "Creating links..." : "Create share links"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, .65fr)", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
              <PanelBox style={{ borderColor: isAdminUploadDragging ? t.petrol : t.line }}>
                <SectionLabel action={`${adminUploadFiles.length} queued`}>Upload on behalf</SectionLabel>
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
                    {visibleFiles.map((file) => (
                      <div key={file.id} style={fileRowStyle(t)}>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <input type="checkbox" checked={!!shareFiles[file.id]} onChange={(e) => setShareFiles({ ...shareFiles, [file.id]: e.target.checked })} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", color: t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</span>
                            <span style={{ color: t.ink3, fontSize: 12 }}>
                              {file.uploaded_by_name || "Unknown"} | {formatSize(file.size_bytes)} | {formatDate(file.created_at)}
                            </span>
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
                    ))}
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
              <PanelBox>
                <SectionLabel action={aiReviews[0] ? statusLabel(aiReviews[0].status) : "No review"}>AI Underwriting Review</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  <input style={field} placeholder="Deal type / program" value={aiContextDraft.deal_type ?? ""} onChange={(event) => setAiContextDraft({ ...aiContextDraft, deal_type: event.target.value })} />
                  <input style={field} placeholder="Documentation level" value={aiContextDraft.documentation_level ?? ""} onChange={(event) => setAiContextDraft({ ...aiContextDraft, documentation_level: event.target.value })} />
                  <input style={field} placeholder="Collateral type" value={aiContextDraft.collateral_type ?? ""} onChange={(event) => setAiContextDraft({ ...aiContextDraft, collateral_type: event.target.value })} />
                  <input style={field} placeholder="Loan purpose" value={aiContextDraft.loan_purpose ?? ""} onChange={(event) => setAiContextDraft({ ...aiContextDraft, loan_purpose: event.target.value })} />
                  <textarea
                    style={{ ...field, minHeight: 76, paddingTop: 10, resize: "vertical" }}
                    placeholder="Underwriting focus"
                    value={aiContextDraft.underwriting_focus ?? ""}
                    onChange={(event) => setAiContextDraft({ ...aiContextDraft, underwriting_focus: event.target.value })}
                  />
                  <textarea
                    style={{ ...field, minHeight: 86, paddingTop: 10, resize: "vertical" }}
                    placeholder="Custom AI instructions"
                    value={aiContextDraft.custom_instructions ?? ""}
                    onChange={(event) => setAiContextDraft({ ...aiContextDraft, custom_instructions: event.target.value })}
                  />
                  <button style={{ ...primary, opacity: aiBusy || !visibleFiles.length ? 0.68 : 1 }} disabled={aiBusy || !visibleFiles.length} onClick={() => queueAIReview().catch((e) => setNotice(String(e)))}>
                    {aiBusy ? "Working..." : "Run AI review"}
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
              </PanelBox>

              <PanelBox>
                <SectionLabel action={`${aiMessages.length} messages`}>Bucket AI Chat</SectionLabel>
                <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                  {aiMessages.length === 0 ? (
                    <div style={emptyInlineStyle(t)}>Ask about this bucket or tell the AI how to adjust its underwriting instructions.</div>
                  ) : aiMessages.slice(-10).map((message) => (
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
              </PanelBox>

              <PanelBox>
                <SectionLabel action={`${aiActions.filter((item) => item.status === "proposed").length} pending`}>AI Proposed Actions</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  {aiActions.length === 0 ? (
                    <div style={emptyInlineStyle(t)}>No AI-proposed tasks yet.</div>
                  ) : aiActions.slice(0, 8).map((item) => (
                    <div key={item.id} style={smallRowStyle(t)}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: t.ink }}>{item.title}</strong>
                        <div style={{ color: t.ink3, fontSize: 12 }}>{item.route} | {statusLabel(item.status)}</div>
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
              </PanelBox>

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
                <SectionLabel action={`${detail.shares.length} links`}>Shares</SectionLabel>
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
                              {files.length} file{files.length === 1 ? "" : "s"} | {share.can_download ? "downloads on" : "view only"} | {share.view_count} views
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
                            <div style={{ color: t.ink3, fontSize: 12 }}>{share.recipient_email || "No email"} | {files.length} file{files.length === 1 ? "" : "s"}</div>
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
    </div>
  );
}

function BucketTable({
  buckets,
  deletingId,
  onSelect,
  onDelete,
}: {
  buckets: Bucket[];
  deletingId: string | null;
  onSelect: (id: string) => void;
  onDelete: (bucket: Bucket) => void;
}) {
  const { t } = useTheme();
  if (buckets.length === 0) {
    return <div style={{ padding: 18, color: t.ink3, fontSize: 13 }}>No buckets yet. Use Create bucket to start.</div>;
  }
  const columns = "minmax(220px, 1.4fr) minmax(130px, .8fr) minmax(150px, .75fr) 78px minmax(160px, .7fr) 84px 44px";
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: columns, gap: 12, padding: "10px 14px", color: t.ink3, background: t.surface2, borderBottom: `1px solid ${t.line}`, fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" }}>
        <div>Bucket</div>
        <div>Client</div>
        <div>Type</div>
        <div>Files</div>
        <div>Status</div>
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
  const missing = arrayValue(result.missing_or_incomplete_items);
  const discrepancies = arrayValue(result.discrepancies);
  const questions = arrayValue(result.underwriter_questions);
  const perFile = arrayValue(result.per_file_summaries);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {summary ? <div style={{ color: t.ink2, fontSize: 13, lineHeight: 1.45 }}>{summary}</div> : null}
      <AIResultList t={t} title="Missing / incomplete" items={missing} />
      <AIResultList t={t} title="Discrepancies" items={discrepancies} />
      <AIResultList t={t} title="Underwriter questions" items={questions} />
      <AIResultList t={t} title="Per-file notes" items={perFile} />
    </div>
  );
}

function AIResultList({ t, title, items }: { t: ReturnType<typeof useTheme>["t"]; title: string; items: unknown[] }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <strong style={{ color: t.ink, fontSize: 12.5 }}>{title}</strong>
      {items.slice(0, 4).map((item, index) => (
        <div key={`${title}-${index}`} style={{ borderTop: `1px solid ${t.line}`, paddingTop: 6, color: t.ink2, fontSize: 12.5, lineHeight: 1.4 }}>
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
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : JSON.stringify(obj);
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    bucket_created: "Bucket created",
    bucket_deleted: "Bucket deleted",
    requested_document_added: "Requested document added",
    upload_link_created: "Upload link created",
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
