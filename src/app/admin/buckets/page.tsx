"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { Pill, SectionLabel } from "@/components/design-system/primitives";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

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
};
type RequestedDoc = {
  id: string;
  name: string;
  category?: string | null;
  required: boolean;
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
type Share = {
  id: string;
  recipient_name: string;
  recipient_email?: string | null;
  can_download: boolean;
  status: string;
  view_count: number;
  download_count: number;
  last_accessed_at?: string | null;
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
type Template = { id: string; name: string; category?: string | null; required: boolean };
type ActiveTab = "documents" | "links" | "files" | "notes";

const BUCKET_TYPES = ["Loan File", "Partner Package", "Borrower", "Funding Opportunity"];

export default function BucketsAdminPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { getToken } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BucketDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<{ label: string; url: string; passcode?: string | null } | null>(null);
  const [bucketForm, setBucketForm] = useState({
    name: "",
    client_name: "",
    purpose: "",
    bucket_type: "Loan File",
    description: "",
  });
  const [customDoc, setCustomDoc] = useState("");
  const [uploadRecipient, setUploadRecipient] = useState({ recipient_name: "", recipient_email: "" });
  const [shareForm, setShareForm] = useState({ recipient_name: "", recipient_email: "", can_download: false });
  const [adminNote, setAdminNote] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("documents");

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadBucket(id: string) {
    setSelectedId(id);
    setDetail(await call<BucketDetail>(`/buckets/admin/${id}`));
    setCreatedLink(null);
  }

  async function refreshAll(nextSelected = selectedId) {
    const [bucketRows, templateRows] = await Promise.all([
      call<Bucket[]>("/buckets"),
      call<Template[]>("/buckets/templates"),
    ]);
    setBuckets(bucketRows);
    setTemplates(templateRows);
    const id = nextSelected ?? bucketRows[0]?.id ?? null;
    setSelectedId(id);
    setDetail(id ? await call<BucketDetail>(`/buckets/admin/${id}`) : null);
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN) refreshAll().catch((e) => setNotice(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  const filteredBuckets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return buckets;
    return buckets.filter((b) =>
      [b.name, b.client_name, b.purpose, b.bucket_type, b.status].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [buckets, search]);

  const selectedTemplateCount = useMemo(
    () => templates.filter((template) => checked[template.id]).length,
    [checked, templates],
  );

  const missingCount = useMemo(() => {
    if (!detail) return 0;
    return detail.requested_documents.filter((doc) => doc.status !== "uploaded").length;
  }, [detail]);

  const uploadedCount = detail?.files.length ?? 0;
  const shareCount = detail?.shares.length ?? 0;
  const latestActivity = detail?.activity[0];

  if (meLoading) return <PanelBox style={{ padding: 18, color: t.ink2 }}>Loading Buckets...</PanelBox>;
  if (me && me.role !== Role.SUPER_ADMIN) return null;

  async function createBucket() {
    if (!bucketForm.name.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const row = await call<Bucket>("/buckets", { method: "POST", body: JSON.stringify(bucketForm) });
      setBucketForm({ name: "", client_name: "", purpose: "", bucket_type: "Loan File", description: "" });
      setActiveTab("documents");
      await refreshAll(row.id);
      setNotice("Bucket created.");
    } finally {
      setBusy(false);
    }
  }

  async function addCheckedDocs() {
    if (!selectedId || selectedTemplateCount === 0) return;
    setBusy(true);
    try {
      for (const template of templates.filter((item) => checked[item.id])) {
        await call(`/buckets/admin/${selectedId}/requested-documents`, {
          method: "POST",
          body: JSON.stringify({ name: template.name, category: template.category, required: template.required }),
        });
      }
      setChecked({});
      await refreshAll(selectedId);
      setNotice("Requested documents added.");
    } finally {
      setBusy(false);
    }
  }

  async function addCustomDoc() {
    if (!selectedId || !customDoc.trim()) return;
    setBusy(true);
    try {
      await call(`/buckets/admin/${selectedId}/requested-documents`, {
        method: "POST",
        body: JSON.stringify({ name: customDoc.trim(), required: true, is_custom: true, save_to_library: true }),
      });
      setCustomDoc("");
      await refreshAll(selectedId);
      setNotice("Custom request added.");
    } finally {
      setBusy(false);
    }
  }

  async function createUploadLink() {
    if (!selectedId || !uploadRecipient.recipient_name.trim()) return;
    setBusy(true);
    try {
      const res = await call<{ upload_url: string }>(`/buckets/admin/${selectedId}/upload-links`, {
        method: "POST",
        body: JSON.stringify(uploadRecipient),
      });
      setCreatedLink({ label: "Upload link", url: res.upload_url });
      setUploadRecipient({ recipient_name: "", recipient_email: "" });
      setNotice("Upload link created.");
    } finally {
      setBusy(false);
    }
  }

  async function createShareLink() {
    if (!selectedId || !shareForm.recipient_name.trim()) return;
    setBusy(true);
    try {
      const res = await call<Share>(`/buckets/admin/${selectedId}/shares`, {
        method: "POST",
        body: JSON.stringify(shareForm),
      });
      setCreatedLink({ label: "Share link", url: res.share_url ?? "", passcode: res.passcode });
      setShareForm({ recipient_name: "", recipient_email: "", can_download: false });
      await refreshAll(selectedId);
      setNotice("Share link created.");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!selectedId || !adminNote.trim()) return;
    await call(`/buckets/admin/${selectedId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content: adminNote, visibility: "admin" }),
    });
    setAdminNote("");
    await refreshAll(selectedId);
    setNotice("Note added.");
  }

  async function openFile(file: BucketFile, download = false) {
    if (!selectedId) return;
    const res = await call<{ url: string }>(`/buckets/admin/${selectedId}/files/${file.id}/url?download=${download}`);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function copyCreatedLink() {
    if (!createdLink?.url) return;
    await navigator.clipboard.writeText(createdLink.passcode ? `${createdLink.url}\nPasscode: ${createdLink.passcode}` : createdLink.url);
    setNotice("Link copied.");
  }

  const fieldStyle = inputStyle(t);
  const primary = buttonStyle(t, "primary");
  const secondary = buttonStyle(t, "secondary");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.ink3, fontSize: 12, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase" }}>
            <Icon name="lock" size={14} />
            Super Admin Document Rooms
          </div>
          <h1 style={{ margin: "6px 0 0", color: t.ink, fontSize: 28, lineHeight: 1.1, fontWeight: 850 }}>
            Buckets
          </h1>
          <p style={{ margin: "6px 0 0", color: t.ink3, fontSize: 13, maxWidth: 720 }}>
            Build secure upload requests and share gated document rooms without exposing the rest of the workspace.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(86px, 1fr))", gap: 8, minWidth: 310 }}>
          <MetricTile label="Buckets" value={buckets.length} />
          <MetricTile label="Files" value={uploadedCount} />
          <MetricTile label="Shares" value={shareCount} />
        </div>
      </div>

      {notice ? (
        <div style={{ ...panelStyle(t), padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, color: t.ink2, fontSize: 13 }}>
          <Icon name="check" size={14} />
          {notice}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <aside style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <PanelBox>
            <SectionLabel>Create bucket</SectionLabel>
            <div style={{ display: "grid", gap: 10 }}>
              <input style={fieldStyle} placeholder="Bucket name" value={bucketForm.name} onChange={(e) => setBucketForm({ ...bucketForm, name: e.target.value })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input style={fieldStyle} placeholder="Client / borrower" value={bucketForm.client_name} onChange={(e) => setBucketForm({ ...bucketForm, client_name: e.target.value })} />
                <select style={fieldStyle} value={bucketForm.bucket_type} onChange={(e) => setBucketForm({ ...bucketForm, bucket_type: e.target.value })}>
                  {BUCKET_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <input style={fieldStyle} placeholder="Purpose, deal, or package" value={bucketForm.purpose} onChange={(e) => setBucketForm({ ...bucketForm, purpose: e.target.value })} />
              <button style={primary} disabled={busy || !bucketForm.name.trim()} onClick={createBucket}>
                <Icon name="plus" size={15} />
                Create bucket
              </button>
            </div>
          </PanelBox>

          <PanelBox style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 14, borderBottom: `1px solid ${t.line}` }}>
              <SectionLabel style={{ marginBottom: 10 }}>Bucket directory</SectionLabel>
              <div style={{ position: "relative" }}>
                <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: 12, color: t.ink3 }} />
                <input
                  style={{ ...fieldStyle, width: "100%", paddingLeft: 32 }}
                  placeholder="Search buckets"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div style={{ maxHeight: "calc(100vh - 420px)", minHeight: 260, overflowY: "auto" }}>
              {filteredBuckets.length === 0 ? (
                <div style={{ padding: 18, color: t.ink3, fontSize: 13 }}>
                  No buckets match this search.
                </div>
              ) : (
                filteredBuckets.map((bucket) => (
                  <button
                    key={bucket.id}
                    onClick={() => loadBucket(bucket.id)}
                    style={{
                      all: "unset",
                      boxSizing: "border-box",
                      width: "100%",
                      cursor: "pointer",
                      display: "grid",
                      gap: 6,
                      padding: "13px 14px",
                      borderBottom: `1px solid ${t.line}`,
                      background: selectedId === bucket.id ? t.brandSoft : "transparent",
                      color: t.ink,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {bucket.name}
                      </div>
                      <Pill>{statusLabel(bucket.status)}</Pill>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.ink3, fontSize: 12 }}>
                      <Icon name="user" size={12} />
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {bucket.client_name || "No client assigned"}
                      </span>
                    </div>
                    <div style={{ color: t.ink3, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {bucket.purpose || bucket.bucket_type || "No purpose set"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </PanelBox>
        </aside>

        <main style={{ minWidth: 0 }}>
          {!detail ? (
            <EmptyState />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <PanelBox style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: 18, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0, color: t.ink, fontSize: 21, lineHeight: 1.2, fontWeight: 850 }}>{detail.name}</h2>
                      <Pill>{detail.bucket_type || "Bucket"}</Pill>
                      <Pill>{statusLabel(detail.status)}</Pill>
                    </div>
                    <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", color: t.ink3, fontSize: 13 }}>
                      <span>{detail.client_name || "No client assigned"}</span>
                      <span>{detail.purpose || "No purpose set"}</span>
                      <span>Updated {formatDate(detail.updated_at)}</span>
                    </div>
                    {latestActivity ? (
                      <div style={{ marginTop: 10, color: t.ink2, fontSize: 12.5 }}>
                        Latest: {latestActivity.action.replace(/_/g, " ")}{latestActivity.actor_name ? ` by ${latestActivity.actor_name}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 82px)", gap: 8 }}>
                    <MetricTile label="Requested" value={detail.requested_documents.length} compact />
                    <MetricTile label="Missing" value={missingCount} compact />
                    <MetricTile label="Files" value={detail.files.length} compact />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, padding: "0 12px 12px", overflowX: "auto" }}>
                  {(["documents", "links", "files", "notes"] as ActiveTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        ...tabStyle(t, activeTab === tab),
                        minWidth: tab === "documents" ? 128 : 100,
                      }}
                    >
                      {tab === "documents" ? "Documents" : tab === "links" ? "Access links" : tab === "files" ? "Files" : "Notes"}
                    </button>
                  ))}
                </div>
              </PanelBox>

              {createdLink ? (
                <PanelBox style={{ borderColor: t.petrol, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <SectionLabel style={{ marginBottom: 6 }}>{createdLink.label}</SectionLabel>
                    <code style={{ display: "block", color: t.ink, overflowWrap: "anywhere", fontSize: 12.5 }}>{createdLink.url}</code>
                    {createdLink.passcode ? <div style={{ color: t.ink2, fontSize: 13, marginTop: 6 }}>Passcode: <strong>{createdLink.passcode}</strong></div> : null}
                  </div>
                  <button style={secondary} onClick={copyCreatedLink}>
                    <Icon name="doc" size={14} />
                    Copy
                  </button>
                </PanelBox>
              ) : null}

              {activeTab === "documents" ? (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 12 }}>
                  <PanelBox>
                    <SectionLabel action={`${detail.requested_documents.length} requested`}>Requested documents</SectionLabel>
                    {detail.requested_documents.length === 0 ? (
                      <EmptyInline icon="docCheck" title="No document checklist yet" body="Add templates or a custom request to create the upload checklist for this bucket." />
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {detail.requested_documents.map((doc) => (
                          <div key={doc.id} style={rowStyle(t)}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div style={iconBox(t, doc.status === "uploaded" ? t.profit : t.ink3)}>
                                <Icon name={doc.status === "uploaded" ? "check" : "doc"} size={14} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                                <div style={{ color: t.ink3, fontSize: 12 }}>{doc.category || "General"}{doc.required ? " | Required" : ""}</div>
                              </div>
                            </div>
                            <Pill color={doc.status === "uploaded" ? t.profit : undefined} bg={doc.status === "uploaded" ? t.profitBg : undefined}>
                              {statusLabel(doc.status)}
                            </Pill>
                          </div>
                        ))}
                      </div>
                    )}
                  </PanelBox>
                  <PanelBox>
                    <SectionLabel>Add checklist items</SectionLabel>
                    <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto", paddingRight: 2 }}>
                      {templates.map((template) => (
                        <label key={template.id} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 8, alignItems: "start", color: t.ink2, fontSize: 13 }}>
                          <input type="checkbox" checked={!!checked[template.id]} onChange={(e) => setChecked({ ...checked, [template.id]: e.target.checked })} />
                          <span>
                            <span style={{ display: "block", color: t.ink, fontWeight: 700 }}>{template.name}</span>
                            <span style={{ color: t.ink3, fontSize: 12 }}>{template.category || "General"}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <button style={{ ...primary, width: "100%", marginTop: 12 }} onClick={addCheckedDocs} disabled={busy || selectedTemplateCount === 0}>
                      <Icon name="plus" size={14} />
                      Add selected{selectedTemplateCount ? ` (${selectedTemplateCount})` : ""}
                    </button>
                    <div style={{ height: 1, background: t.line, margin: "14px 0" }} />
                    <div style={{ display: "grid", gap: 8 }}>
                      <input style={fieldStyle} placeholder="Custom request" value={customDoc} onChange={(e) => setCustomDoc(e.target.value)} />
                      <button style={secondary} onClick={addCustomDoc} disabled={busy || !customDoc.trim()}>
                        Save custom request
                      </button>
                    </div>
                  </PanelBox>
                </div>
              ) : null}

              {activeTab === "links" ? (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
                  <PanelBox>
                    <SectionLabel>Request uploads</SectionLabel>
                    <p style={helperText(t)}>Create a private upload page for borrowers, brokers, or outside partners. Uploaders only see the request form.</p>
                    <div style={{ display: "grid", gap: 10 }}>
                      <input style={fieldStyle} placeholder="Uploader name" value={uploadRecipient.recipient_name} onChange={(e) => setUploadRecipient({ ...uploadRecipient, recipient_name: e.target.value })} />
                      <input style={fieldStyle} placeholder="Uploader email optional" value={uploadRecipient.recipient_email} onChange={(e) => setUploadRecipient({ ...uploadRecipient, recipient_email: e.target.value })} />
                      <button style={primary} onClick={createUploadLink} disabled={busy || !uploadRecipient.recipient_name.trim()}>
                        <Icon name="upload" size={15} />
                        Create upload link
                      </button>
                    </div>
                  </PanelBox>
                  <PanelBox>
                    <SectionLabel>Share document room</SectionLabel>
                    <p style={helperText(t)}>Create a gated room for lenders or reviewers. Downloads stay off unless you explicitly enable them.</p>
                    <div style={{ display: "grid", gap: 10 }}>
                      <input style={fieldStyle} placeholder="Shared user name" value={shareForm.recipient_name} onChange={(e) => setShareForm({ ...shareForm, recipient_name: e.target.value })} />
                      <input style={fieldStyle} placeholder="Shared user email" value={shareForm.recipient_email} onChange={(e) => setShareForm({ ...shareForm, recipient_email: e.target.value })} />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, color: t.ink2, fontSize: 13 }}>
                        <input type="checkbox" checked={shareForm.can_download} onChange={(e) => setShareForm({ ...shareForm, can_download: e.target.checked })} />
                        Enable downloads for this share
                      </label>
                      <button style={primary} onClick={createShareLink} disabled={busy || !shareForm.recipient_name.trim()}>
                        <Icon name="link" size={15} />
                        Create share link
                      </button>
                    </div>
                  </PanelBox>
                  <PanelBox style={{ gridColumn: "1 / -1" }}>
                    <SectionLabel action={`${detail.shares.length} active`}>Shared access</SectionLabel>
                    {detail.shares.length === 0 ? (
                      <EmptyInline icon="lock" title="No shared access yet" body="Create a share link when you are ready to expose files from this bucket." />
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                        {detail.shares.map((share) => (
                          <div key={share.id} style={{ ...panelStyle(t), padding: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{share.recipient_name}</div>
                                <div style={{ color: t.ink3, fontSize: 12 }}>{share.recipient_email || "No email captured"}</div>
                              </div>
                              <Pill>{statusLabel(share.status)}</Pill>
                            </div>
                            <div style={{ display: "flex", gap: 12, marginTop: 10, color: t.ink3, fontSize: 12 }}>
                              <span>{share.view_count} views</span>
                              <span>{share.download_count} downloads</span>
                              <span>{share.can_download ? "Downloads on" : "View only"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </PanelBox>
                </div>
              ) : null}

              {activeTab === "files" ? (
                <PanelBox>
                  <SectionLabel action={`${detail.files.length} uploaded`}>Uploaded files</SectionLabel>
                  {detail.files.length === 0 ? (
                    <EmptyInline icon="file" title="No uploads yet" body="When someone completes an upload request, files will appear here with preview and download controls." />
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {detail.files.map((file) => (
                        <div key={file.id} style={rowStyle(t)}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div style={iconBox(t, t.petrol)}><Icon name="file" size={14} /></div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</div>
                              <div style={{ color: t.ink3, fontSize: 12 }}>
                                {file.uploaded_by_name || "Unknown uploader"} | {formatSize(file.size_bytes)} | {formatDate(file.created_at)}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button style={secondary} onClick={() => openFile(file, false)}>
                              <Icon name="eye" size={14} />
                              Preview
                            </button>
                            <button style={secondary} onClick={() => openFile(file, true)}>
                              <Icon name="download" size={14} />
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </PanelBox>
              ) : null}

              {activeTab === "notes" ? (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 12 }}>
                  <PanelBox>
                    <SectionLabel>Admin notes</SectionLabel>
                    <textarea
                      style={{ ...fieldStyle, minHeight: 92, paddingTop: 10, resize: "vertical" }}
                      placeholder="Add an internal note for this bucket"
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                    />
                    <button style={{ ...primary, marginTop: 10 }} onClick={addNote} disabled={!adminNote.trim()}>
                      <Icon name="comment" size={15} />
                      Add note
                    </button>
                    <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                      {detail.notes.length === 0 ? (
                        <EmptyInline icon="comment" title="No notes yet" body="Admin-only notes and shared notes will be listed here." />
                      ) : detail.notes.map((note) => (
                        <div key={note.id} style={{ ...panelStyle(t), padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                            <strong style={{ color: t.ink }}>{note.author_name || "Admin"}</strong>
                            <span style={{ color: t.ink3, fontSize: 12 }}>{formatDate(note.created_at)}</span>
                          </div>
                          <div style={{ color: t.ink2, fontSize: 13, lineHeight: 1.45 }}>{note.content}</div>
                          <div style={{ marginTop: 8 }}><Pill>{note.visibility}</Pill></div>
                        </div>
                      ))}
                    </div>
                  </PanelBox>
                  <PanelBox>
                    <SectionLabel>Activity</SectionLabel>
                    {detail.activity.length === 0 ? (
                      <EmptyInline icon="audit" title="No activity yet" body="Bucket events will appear once files, links, notes, and shares are created." />
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {detail.activity.map((item) => (
                          <div key={item.id} style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: 9 }}>
                            <div style={iconBox(t, t.ink3)}><Icon name="audit" size={12} /></div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: t.ink, fontSize: 13, fontWeight: 750 }}>{item.action.replace(/_/g, " ")}</div>
                              <div style={{ color: t.ink3, fontSize: 12 }}>{item.actor_name || "System"} | {formatDate(item.created_at)}</div>
                              {item.detail ? <div style={{ color: t.ink2, fontSize: 12.5, marginTop: 3 }}>{item.detail}</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </PanelBox>
                </div>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function PanelBox({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  const { t } = useTheme();
  return <div style={{ ...panelStyle(t), padding: 14, ...style }}>{children}</div>;
}

function MetricTile({ label, value, compact = false }: { label: string; value: number | string; compact?: boolean }) {
  const { t } = useTheme();
  return (
    <div style={{ ...panelStyle(t), padding: compact ? "10px 12px" : 12, minWidth: 0 }}>
      <div style={{ color: t.ink3, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: t.ink, fontSize: compact ? 20 : 23, fontWeight: 900, lineHeight: 1.15, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTheme();
  return (
    <PanelBox style={{ minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ maxWidth: 560 }}>
        <div style={{ ...iconBox(t, t.petrol), width: 44, height: 44, margin: "0 auto 14px" }}>
          <Icon name="lock" size={20} />
        </div>
        <h2 style={{ margin: 0, color: t.ink, fontSize: 22 }}>Create a secure bucket to start</h2>
        <p style={{ margin: "8px 0 18px", color: t.ink3, fontSize: 13, lineHeight: 1.55 }}>
          Buckets organize document requests, uploaded files, lender share links, internal notes, and activity in one controlled room.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, textAlign: "left" }}>
          <MiniStep icon="plus" title="Create" body="Name the deal or borrower." />
          <MiniStep icon="docCheck" title="Request" body="Add the required files." />
          <MiniStep icon="link" title="Share" body="Send gated access links." />
        </div>
      </div>
    </PanelBox>
  );
}

function EmptyInline({ icon, title, body }: { icon: string; title: string; body: string }) {
  const { t } = useTheme();
  return (
    <div style={{ ...panelStyle(t), padding: 18, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={iconBox(t, t.ink3)}><Icon name={icon} size={15} /></div>
      <div>
        <div style={{ color: t.ink, fontWeight: 800 }}>{title}</div>
        <div style={{ color: t.ink3, fontSize: 12.5, marginTop: 2 }}>{body}</div>
      </div>
    </div>
  );
}

function MiniStep({ icon, title, body }: { icon: string; title: string; body: string }) {
  const { t } = useTheme();
  return (
    <div style={{ ...panelStyle(t), padding: 12 }}>
      <Icon name={icon} size={15} style={{ color: t.petrol }} />
      <div style={{ color: t.ink, fontWeight: 800, marginTop: 8 }}>{title}</div>
      <div style={{ color: t.ink3, fontSize: 12, marginTop: 3, lineHeight: 1.35 }}>{body}</div>
    </div>
  );
}

function panelStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    background: t.surface,
    border: `1px solid ${t.line}`,
    borderRadius: 10,
    boxShadow: t.shadow,
  };
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

function tabStyle(t: ReturnType<typeof useTheme>["t"], active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? t.ink : t.line}`,
    borderRadius: 8,
    height: 34,
    padding: "0 12px",
    background: active ? t.ink : t.surface,
    color: active ? t.inverse : t.ink2,
    font: "inherit",
    fontSize: 12.5,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function rowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "center",
    padding: 11,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
  };
}

function iconBox(t: ReturnType<typeof useTheme>["t"], color: string): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: t.surface2,
    color,
    border: `1px solid ${t.line}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

function helperText(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { margin: "0 0 12px", color: t.ink3, fontSize: 13, lineHeight: 1.45 };
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
