"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  recipient_name: string;
  recipient_email?: string | null;
  can_download: boolean;
  status: string;
  view_count: number;
  download_count: number;
  share_url?: string | null;
  passcode?: string | null;
};
type Note = { id: string; author_name: string; visibility: string; content: string; created_at: string };
type Activity = { id: string; action: string; actor_name?: string | null; detail?: string | null; created_at: string };
type BucketDetail = Bucket & {
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
type PackageKey = "standard" | "urchoice" | "other";
type UploadInvite = { id: string; recipient_name: string; recipient_email: string; passcode: string };
type UploadInviteLink = { name: string; email?: string; url: string; passcode: string };
type UploadInitResponse = { file_id: string; upload_url: string; required_headers: Record<string, string> };

const BUCKET_TYPES = ["Loan File", "UrChoice Dealer Funding", "Partner Package", "Borrower", "Funding Opportunity"];
const URCHOICE_DEALER_DOCS: Template[] = [
  { id: "urchoice-formation", name: "Formation", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-ein", name: "EIN", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-articles", name: "Articles", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-bank-statements", name: "6 months bank statement", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-tax-returns", name: "Last 2 years of Tax Returns business and personal", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-personal-irs", name: "Personal: IRS last 2 years", category: "UrChoice Dealer Funding", required: true },
];

export default function BucketsAdminPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { getToken } = useAuth();
  const adminFileInputRef = useRef<HTMLInputElement | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [detail, setDetail] = useState<BucketDetail | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createResult, setCreateResult] = useState<{ links: UploadInviteLink[] } | null>(null);
  const [createStatus, setCreateStatus] = useState<{ kind: "working" | "success" | "error"; message: string } | null>(null);
  const [createPackage, setCreatePackage] = useState<PackageKey>("standard");
  const [createChecked, setCreateChecked] = useState<Record<string, boolean>>({});
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
  const [createInviteDraft, setCreateInviteDraft] = useState({ recipient_name: "", recipient_email: "", passcode: generateAccessCode() });
  const [createInvites, setCreateInvites] = useState<UploadInvite[]>([]);
  const [shareFiles, setShareFiles] = useState<Record<string, boolean>>({});
  const [shareForm, setShareForm] = useState({ recipient_name: "", recipient_email: "", passcode: "", can_download: false });
  const [createdShare, setCreatedShare] = useState<{ url: string; passcode?: string | null } | null>(null);
  const [adminUploadFiles, setAdminUploadFiles] = useState<AdminQueuedFile[]>([]);
  const [adminUploadForm, setAdminUploadForm] = useState({ uploader_name: "", uploader_email: "", note: "" });
  const [adminUploadStatus, setAdminUploadStatus] = useState<{ kind: "working" | "success" | "error"; message: string } | null>(null);
  const [adminUploading, setAdminUploading] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [reviewFile, setReviewFile] = useState<BucketFile | null>(null);

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
    setShareFiles({});
    setCreatedShare(null);
    setAdminUploadFiles([]);
    setAdminUploadStatus(null);
    setAdminUploadForm((form) => ({ ...form, uploader_name: row.client_name || form.uploader_name || "", uploader_email: "" }));
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

  const reusableOtherDocs = templates.filter((doc) => (doc.category || "").toLowerCase() === "other");
  const standardDocs = templates.filter((doc) => (doc.category || "").toLowerCase() !== "other");
  const createDocs = createPackage === "urchoice" ? URCHOICE_DEALER_DOCS : createPackage === "other" ? [...reusableOtherDocs, ...customDocs] : standardDocs;
  const selectedCreateDocs = createDocs.filter((doc) => createChecked[doc.id]);
  const selectedShareFileIds = Object.entries(shareFiles).filter(([, selected]) => selected).map(([id]) => id);
  const visibleFiles = useMemo(() => uniqueBucketFiles(detail?.files ?? []), [detail?.files]);
  const selectedShareFiles = visibleFiles.filter((file) => selectedShareFileIds.includes(file.id));
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

  function generateShareCode() {
    setShareForm((form) => ({ ...form, passcode: generateAccessCode() }));
  }

  async function createShareLink() {
    if (!detail || !shareForm.recipient_name.trim() || selectedShareFileIds.length === 0) return;
    setBusy(true);
    try {
      const res = await call<Share>(`/buckets/admin/${detail.id}/shares`, {
        method: "POST",
        body: JSON.stringify({
          ...shareForm,
          recipient_email: shareForm.recipient_email.trim() || null,
          passcode: shareForm.passcode.trim() || undefined,
          file_ids: selectedShareFileIds,
        }),
      });
      setCreatedShare({ url: res.share_url ?? "", passcode: res.passcode });
      setShareForm({ recipient_name: "", recipient_email: "", passcode: "", can_download: false });
      setShareFiles({});
      await loadBucket(detail.id);
      setNotice("Share link created.");
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
    if (adminFileInputRef.current) adminFileInputRef.current.value = "";
  }

  function updateAdminUploadFile(id: string, patch: Partial<AdminQueuedFile>) {
    setAdminUploadFiles((files) => files.map((file) => (file.id === id ? { ...file, ...patch } : file)));
  }

  function removeAdminUploadFile(id: string) {
    setAdminUploadFiles((files) => files.filter((file) => file.id !== id));
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
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
                    <option value="other">Other</option>
                  </select>
                  <div style={{ color: t.ink3, fontSize: 12, alignSelf: "center" }}>
                    {selectedCreateDocs.length} selected
                  </div>
                </div>
                {createPackage === "other" ? (
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, maxHeight: 260, overflowY: "auto", marginTop: 12 }}>
                  {createDocs.length === 0 ? (
                    <div style={{ ...emptyInlineStyle(t), gridColumn: "1 / -1" }}>
                      No Other options yet.
                    </div>
                  ) : createDocs.map((doc) => (
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
        >
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, .65fr)", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
              <PanelBox>
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
                          <option value="">General upload</option>
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
              <PanelBox style={{ borderColor: selectedShareFileIds.length ? t.petrol : t.line }}>
                <SectionLabel action={`${selectedShareFileIds.length} selected`}>Share files</SectionLabel>
                {createdShare ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={successBoxStyle(t)}>
                      <Icon name="check" size={15} />
                      Invite link ready
                    </div>
                    <div style={shareLinkBoxStyle(t)}>
                      <code style={{ color: t.ink, overflowWrap: "anywhere", fontSize: 12 }}>{createdShare.url}</code>
                      {createdShare.passcode ? <div style={{ color: t.ink2, fontSize: 12, marginTop: 6 }}>Access code: <strong>{createdShare.passcode}</strong></div> : null}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <button style={secondary} onClick={() => copyText(createdShare.passcode ? `Secure file room: ${createdShare.url}\nAccess code: ${createdShare.passcode}` : createdShare.url)}>Copy</button>
                      <button style={secondary} onClick={() => setCreatedShare(null)}>New share</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {selectedShareFiles.length ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        {selectedShareFiles.slice(0, 3).map((file) => (
                          <div key={file.id} style={selectedFileChipStyle(t)}>
                            <Icon name="file" size={13} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</span>
                          </div>
                        ))}
                        {selectedShareFiles.length > 3 ? <div style={{ color: t.ink3, fontSize: 12 }}>+{selectedShareFiles.length - 3} more selected</div> : null}
                      </div>
                    ) : (
                      <div style={emptyInlineStyle(t)}>Select files from the Files list to create a share link.</div>
                    )}
                    <input style={field} placeholder="Viewer name" value={shareForm.recipient_name} onChange={(e) => setShareForm({ ...shareForm, recipient_name: e.target.value })} />
                    <input style={field} placeholder="Viewer email optional" value={shareForm.recipient_email} onChange={(e) => setShareForm({ ...shareForm, recipient_email: e.target.value })} />
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                      <input
                        style={field}
                        placeholder="Access code"
                        value={shareForm.passcode}
                        onChange={(e) => setShareForm({ ...shareForm, passcode: e.target.value })}
                      />
                      <button style={secondary} onClick={generateShareCode}>Generate</button>
                    </div>
                    <label style={permissionRowStyle(t)}>
                      <span>
                        <strong style={{ display: "block", color: t.ink, fontSize: 13 }}>Allow download</strong>
                        <span style={{ color: t.ink3, fontSize: 12 }}>Otherwise viewers can preview only.</span>
                      </span>
                      <input type="checkbox" checked={shareForm.can_download} onChange={(e) => setShareForm({ ...shareForm, can_download: e.target.checked })} />
                    </label>
                    <button style={{ ...primary, width: "100%", opacity: busy || selectedShareFileIds.length === 0 || !shareForm.recipient_name.trim() ? 0.68 : 1 }} onClick={createShareLink} disabled={busy || selectedShareFileIds.length === 0 || !shareForm.recipient_name.trim()}>
                      Create share link
                    </button>
                  </div>
                )}
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
                  ) : detail.shares.map((share) => (
                    <div key={share.id} style={smallRowStyle(t)}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: t.ink }}>{share.recipient_name}</strong>
                        <div style={{ color: t.ink3, fontSize: 12 }}>{share.view_count} views | {share.can_download ? "downloads on" : "view only"}</div>
                      </div>
                      <Pill>{statusLabel(share.status)}</Pill>
                    </div>
                  ))}
                </div>
              </PanelBox>

              <PanelBox>
                <SectionLabel>Activity</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  {detail.activity.length === 0 ? (
                    <div style={{ color: t.ink3, fontSize: 13 }}>No activity yet.</div>
                  ) : detail.activity.slice(0, 12).map((item) => (
                    <div key={item.id} style={{ color: t.ink2, fontSize: 13, borderTop: `1px solid ${t.line}`, paddingTop: 8 }}>
                      <strong>{item.action.replace(/_/g, " ")}</strong>
                      <div style={{ color: t.ink3, fontSize: 12 }}>{item.actor_name || "System"} | {formatDate(item.created_at)}</div>
                    </div>
                  ))}
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

function successBoxStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 10,
    border: `1px solid ${t.profit}`,
    borderRadius: 8,
    background: t.profitBg,
    color: t.profit,
    fontWeight: 850,
    fontSize: 13,
  };
}

function shareLinkBoxStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function selectedFileChipStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 8px",
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
    color: t.ink2,
    fontSize: 12,
    fontWeight: 750,
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

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
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
