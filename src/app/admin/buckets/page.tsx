"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, SectionLabel } from "@/components/design-system/primitives";
import { useCurrentUser } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { Role } from "@/lib/enums.generated";

type Bucket = {
  id: string;
  name: string;
  bucket_type?: string | null;
  client_name?: string | null;
  purpose?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};
type RequestedDoc = { id: string; name: string; category?: string | null; required: boolean; status: string };
type BucketFile = {
  id: string;
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
type PackageKey = "standard" | "urchoice";

const BUCKET_TYPES = ["Loan File", "UrChoice Dealer Funding", "Partner Package", "Borrower", "Funding Opportunity"];
const URCHOICE_DEALER_DOCS: Template[] = [
  { id: "urchoice-formation", name: "Formation", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-ein", name: "EIN", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-articles", name: "Articles", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-bank-statements", name: "6 months bank statement", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-tax-returns", name: "Last 2 years of Tax Returns business and personal", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-personal-irs", name: "Personal: IRS last 2 years", category: "UrChoice Dealer Funding", required: true },
  { id: "urchoice-soft-pull", name: "Soft pull to verify credit of at least 680", category: "UrChoice Dealer Funding", required: true },
];

export default function BucketsAdminPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { getToken } = useAuth();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [detail, setDetail] = useState<BucketDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [packageKey, setPackageKey] = useState<PackageKey>("standard");
  const [customDoc, setCustomDoc] = useState("");
  const [uploadRecipient, setUploadRecipient] = useState({ recipient_name: "", recipient_email: "" });
  const [shareForm, setShareForm] = useState({ recipient_name: "", recipient_email: "", can_download: false });
  const [adminNote, setAdminNote] = useState("");
  const [createdLink, setCreatedLink] = useState<{ label: string; url: string; passcode?: string | null } | null>(null);
  const [bucketForm, setBucketForm] = useState({
    name: "",
    client_name: "",
    purpose: "",
    bucket_type: "Loan File",
    description: "",
  });

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
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

  async function loadBucket(id: string) {
    setSelectedId(id);
    setDetail(await call<BucketDetail>(`/buckets/admin/${id}`));
    setCreatedLink(null);
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN) refreshAll().catch((e) => setNotice(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  const packageDocs = packageKey === "urchoice" ? URCHOICE_DEALER_DOCS : templates;
  const selectedDocCount = packageDocs.filter((doc) => checked[doc.id]).length;
  const filteredBuckets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return buckets;
    return buckets.filter((b) => [b.name, b.client_name, b.purpose, b.bucket_type, b.status].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [buckets, search]);
  const missingCount = detail?.requested_documents.filter((doc) => doc.status !== "uploaded").length ?? 0;

  if (meLoading) return <PanelBox style={{ color: t.ink2 }}>Loading Buckets...</PanelBox>;
  if (me && me.role !== Role.SUPER_ADMIN) return null;

  async function createBucket() {
    if (!bucketForm.name.trim()) return;
    setBusy(true);
    try {
      const row = await call<Bucket>("/buckets", { method: "POST", body: JSON.stringify(bucketForm) });
      setBucketForm({ name: "", client_name: "", purpose: "", bucket_type: "Loan File", description: "" });
      setCreateOpen(false);
      await refreshAll(row.id);
      setNotice("Bucket created.");
    } finally {
      setBusy(false);
    }
  }

  async function addSelectedDocs() {
    if (!selectedId || selectedDocCount === 0) return;
    setBusy(true);
    try {
      for (const doc of packageDocs.filter((item) => checked[item.id])) {
        await call(`/buckets/admin/${selectedId}/requested-documents`, {
          method: "POST",
          body: JSON.stringify({ name: doc.name, category: doc.category, required: doc.required }),
        });
      }
      setChecked({});
      await refreshAll(selectedId);
      setNotice("Document request list updated.");
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
      setNotice("Custom document added.");
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

  const field = inputStyle(t);
  const primary = buttonStyle(t, "primary");
  const secondary = buttonStyle(t, "secondary");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, color: t.ink, fontSize: 28, fontWeight: 850 }}>Buckets</h1>
          <p style={{ margin: "5px 0 0", color: t.ink3, fontSize: 13 }}>Secure document rooms for requests and controlled sharing.</p>
        </div>
        <button style={primary} onClick={() => setCreateOpen(true)}>
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
        <BucketTable buckets={filteredBuckets} selectedId={selectedId} onSelect={loadBucket} />
      </PanelBox>

      {detail ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelBox>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, color: t.ink, fontSize: 22, fontWeight: 850 }}>{detail.name}</h2>
                  <Pill>{detail.bucket_type || "Bucket"}</Pill>
                  <Pill>{statusLabel(detail.status)}</Pill>
                </div>
                <div style={{ marginTop: 7, color: t.ink3, fontSize: 13 }}>
                  {detail.client_name || "No client"} | {detail.purpose || "No purpose"} | Updated {formatDate(detail.updated_at)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 84px)", gap: 8 }}>
                <Metric label="Requested" value={detail.requested_documents.length} />
                <Metric label="Missing" value={missingCount} />
                <Metric label="Files" value={detail.files.length} />
                <Metric label="Shares" value={detail.shares.length} />
              </div>
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

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
            <PanelBox>
              <WorkflowHeader step="1" title="Request files" subtitle="Build the checklist and send one upload link." />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                <select
                  style={field}
                  value={packageKey}
                  onChange={(e) => {
                    setPackageKey(e.target.value as PackageKey);
                    setChecked({});
                  }}
                >
                  <option value="standard">Standard Lending File</option>
                  <option value="urchoice">UrChoice Dealer Funding</option>
                </select>
                <input style={field} placeholder="Custom document" value={customDoc} onChange={(e) => setCustomDoc(e.target.value)} />
              </div>
              <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto", marginTop: 12, paddingRight: 2 }}>
                {packageDocs.map((doc) => (
                  <label key={doc.id} style={checkRowStyle(t)}>
                    <input type="checkbox" checked={!!checked[doc.id]} onChange={(e) => setChecked({ ...checked, [doc.id]: e.target.checked })} />
                    <span>
                      <span style={{ display: "block", color: t.ink, fontWeight: 750 }}>{doc.name}</span>
                      <span style={{ color: t.ink3, fontSize: 12 }}>{doc.category || "Standard Lending File"}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button style={primary} onClick={addSelectedDocs} disabled={busy || selectedDocCount === 0}>
                  Add selected{selectedDocCount ? ` (${selectedDocCount})` : ""}
                </button>
                <button style={secondary} onClick={addCustomDoc} disabled={busy || !customDoc.trim()}>
                  Add custom
                </button>
              </div>
              <div style={{ height: 1, background: t.line, margin: "14px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
                <input style={field} placeholder="Uploader name" value={uploadRecipient.recipient_name} onChange={(e) => setUploadRecipient({ ...uploadRecipient, recipient_name: e.target.value })} />
                <input style={field} placeholder="Uploader email optional" value={uploadRecipient.recipient_email} onChange={(e) => setUploadRecipient({ ...uploadRecipient, recipient_email: e.target.value })} />
                <button style={primary} onClick={createUploadLink} disabled={busy || !uploadRecipient.recipient_name.trim()}>
                  <Icon name="upload" size={14} />
                  Link
                </button>
              </div>
            </PanelBox>

            <PanelBox>
              <WorkflowHeader step="2" title="Share files" subtitle="Send a gated document room to a lender or reviewer." />
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                <input style={field} placeholder="Shared user name" value={shareForm.recipient_name} onChange={(e) => setShareForm({ ...shareForm, recipient_name: e.target.value })} />
                <input style={field} placeholder="Shared user email" value={shareForm.recipient_email} onChange={(e) => setShareForm({ ...shareForm, recipient_email: e.target.value })} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, color: t.ink2, fontSize: 13 }}>
                  <input type="checkbox" checked={shareForm.can_download} onChange={(e) => setShareForm({ ...shareForm, can_download: e.target.checked })} />
                  Enable downloads for this share
                </label>
                <button style={primary} onClick={createShareLink} disabled={busy || !shareForm.recipient_name.trim()}>
                  <Icon name="link" size={14} />
                  Create share link
                </button>
              </div>
              <div style={{ height: 1, background: t.line, margin: "14px 0" }} />
              <SectionLabel action={`${detail.shares.length} active`}>Shared access</SectionLabel>
              <div style={{ display: "grid", gap: 8 }}>
                {detail.shares.length === 0 ? (
                  <EmptyInline icon="lock" title="No shared access yet" body="Create a share link after files are ready for review." />
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
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, .85fr)", gap: 12, alignItems: "start" }}>
            <PanelBox>
              <SectionLabel action={`${detail.requested_documents.length} requested`}>Current request list</SectionLabel>
              <div style={{ display: "grid", gap: 8 }}>
                {detail.requested_documents.length === 0 ? (
                  <EmptyInline icon="docCheck" title="No checklist yet" body="Use workflow 1 to add the documents you need." />
                ) : detail.requested_documents.map((doc) => (
                  <div key={doc.id} style={smallRowStyle(t)}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: t.ink }}>{doc.name}</strong>
                      <div style={{ color: t.ink3, fontSize: 12 }}>{doc.category || "General"}{doc.required ? " | Required" : ""}</div>
                    </div>
                    <Pill color={doc.status === "uploaded" ? t.profit : undefined} bg={doc.status === "uploaded" ? t.profitBg : undefined}>
                      {statusLabel(doc.status)}
                    </Pill>
                  </div>
                ))}
              </div>
            </PanelBox>

            <PanelBox>
              <SectionLabel action={`${detail.files.length} uploaded`}>Files</SectionLabel>
              <div style={{ display: "grid", gap: 8 }}>
                {detail.files.length === 0 ? (
                  <EmptyInline icon="file" title="No uploads yet" body="Uploaded files will appear here." />
                ) : detail.files.map((file) => (
                  <div key={file.id} style={smallRowStyle(t)}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: t.ink }}>{file.file_name}</strong>
                      <div style={{ color: t.ink3, fontSize: 12 }}>{file.uploaded_by_name || "Unknown"} | {formatSize(file.size_bytes)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={secondary} onClick={() => openFile(file, false)}>Preview</button>
                      <button style={secondary} onClick={() => openFile(file, true)}>Download</button>
                    </div>
                  </div>
                ))}
              </div>
            </PanelBox>
          </div>

          <PanelBox>
            <SectionLabel>Internal notes</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
              <input style={field} placeholder="Add an admin note" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
              <button style={secondary} onClick={addNote} disabled={!adminNote.trim()}>Add note</button>
            </div>
            {detail.notes.length ? (
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {detail.notes.map((note) => (
                  <div key={note.id} style={{ color: t.ink2, fontSize: 13, borderTop: `1px solid ${t.line}`, paddingTop: 8 }}>
                    <strong>{note.author_name || "Admin"}</strong> | {formatDate(note.created_at)}: {note.content}
                  </div>
                ))}
              </div>
            ) : null}
          </PanelBox>
        </div>
      ) : (
        <EmptyState />
      )}

      {createOpen ? (
        <div style={modalBackdropStyle}>
          <div style={{ ...panelStyle(t), width: "min(560px, calc(100vw - 40px))", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, color: t.ink, fontSize: 20 }}>Create bucket</h2>
                <div style={{ color: t.ink3, fontSize: 13, marginTop: 3 }}>Set up the document room first. Workflows come after creation.</div>
              </div>
              <button style={iconButtonStyle(t)} onClick={() => setCreateOpen(false)} aria-label="Close create bucket">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <input style={field} placeholder="Bucket name" value={bucketForm.name} onChange={(e) => setBucketForm({ ...bucketForm, name: e.target.value })} />
              <input style={field} placeholder="Client / borrower" value={bucketForm.client_name} onChange={(e) => setBucketForm({ ...bucketForm, client_name: e.target.value })} />
              <select style={field} value={bucketForm.bucket_type} onChange={(e) => setBucketForm({ ...bucketForm, bucket_type: e.target.value })}>
                {BUCKET_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
              <input style={field} placeholder="Purpose, deal, or package" value={bucketForm.purpose} onChange={(e) => setBucketForm({ ...bucketForm, purpose: e.target.value })} />
              <textarea style={{ ...field, minHeight: 82, paddingTop: 10, resize: "vertical" }} placeholder="Description optional" value={bucketForm.description} onChange={(e) => setBucketForm({ ...bucketForm, description: e.target.value })} />
              <button style={{ ...primary, width: "100%" }} onClick={createBucket} disabled={busy || !bucketForm.name.trim()}>
                <Icon name="plus" size={15} />
                Create bucket
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BucketTable({ buckets, selectedId, onSelect }: { buckets: Bucket[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useTheme();
  if (buckets.length === 0) {
    return <div style={{ padding: 18, color: t.ink3, fontSize: 13 }}>No buckets yet. Use Create bucket to start.</div>;
  }
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) minmax(150px, 1fr) 150px 120px 110px", gap: 12, padding: "10px 14px", color: t.ink3, background: t.surface2, borderBottom: `1px solid ${t.line}`, fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" }}>
        <div>Bucket</div>
        <div>Client</div>
        <div>Type</div>
        <div>Status</div>
        <div>Updated</div>
      </div>
      {buckets.map((bucket) => (
        <button
          key={bucket.id}
          onClick={() => onSelect(bucket.id)}
          style={{
            all: "unset",
            boxSizing: "border-box",
            width: "100%",
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.4fr) minmax(150px, 1fr) 150px 120px 110px",
            gap: 12,
            alignItems: "center",
            padding: "13px 14px",
            borderBottom: `1px solid ${t.line}`,
            background: selectedId === bucket.id ? t.brandSoft : t.surface,
            cursor: "pointer",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: t.ink, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.name}</div>
            <div style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.purpose || "No purpose"}</div>
          </div>
          <div style={{ color: t.ink2, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.client_name || "No client"}</div>
          <div style={{ color: t.ink2, fontSize: 13 }}>{bucket.bucket_type || "Bucket"}</div>
          <div><Pill>{statusLabel(bucket.status)}</Pill></div>
          <div style={{ color: t.ink3, fontSize: 13 }}>{formatDate(bucket.updated_at)}</div>
        </button>
      ))}
    </div>
  );
}

function WorkflowHeader({ step, title, subtitle }: { step: string; title: string; subtitle: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: t.ink, color: t.inverse, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 }}>{step}</div>
      <div>
        <h3 style={{ margin: 0, color: t.ink, fontSize: 17, fontWeight: 850 }}>{title}</h3>
        <p style={{ margin: "3px 0 0", color: t.ink3, fontSize: 13 }}>{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTheme();
  return (
    <PanelBox style={{ minHeight: 250, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div>
        <Icon name="lock" size={28} style={{ color: t.petrol }} />
        <h2 style={{ margin: "10px 0 4px", color: t.ink, fontSize: 20 }}>Select or create a bucket</h2>
        <p style={{ margin: 0, color: t.ink3, fontSize: 13 }}>Choose a bucket from the list, then request files or share files from the bucket workspace.</p>
      </div>
    </PanelBox>
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

function PanelBox({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  const { t } = useTheme();
  return <div style={{ ...panelStyle(t), padding: 14, ...style }}>{children}</div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  const { t } = useTheme();
  return (
    <div style={{ ...panelStyle(t), padding: "9px 10px" }}>
      <div style={{ color: t.ink3, fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: t.ink, fontSize: 20, fontWeight: 900, lineHeight: 1.1, marginTop: 3 }}>{value}</div>
    </div>
  );
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

function checkRowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    gap: 9,
    alignItems: "start",
    padding: 10,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    background: t.surface2,
    color: t.ink2,
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
  inset: 0,
  background: "rgba(0,0,0,.48)",
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

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
