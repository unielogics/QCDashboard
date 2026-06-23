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
type UploadInvite = { id: string; recipient_name: string; recipient_email: string };
type UploadInviteLink = { name: string; email?: string; url: string };

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
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createResult, setCreateResult] = useState<{ links: UploadInviteLink[] } | null>(null);
  const [createPackage, setCreatePackage] = useState<PackageKey>("standard");
  const [createChecked, setCreateChecked] = useState<Record<string, boolean>>({});
  const [bucketForm, setBucketForm] = useState({
    name: "",
    client_name: "",
    purpose: "",
    bucket_type: "Loan File",
    description: "",
  });
  const [createInviteDraft, setCreateInviteDraft] = useState({ recipient_name: "", recipient_email: "" });
  const [createInvites, setCreateInvites] = useState<UploadInvite[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFiles, setShareFiles] = useState<Record<string, boolean>>({});
  const [shareForm, setShareForm] = useState({ recipient_name: "", recipient_email: "", can_download: false });
  const [createdShare, setCreatedShare] = useState<{ url: string; passcode?: string | null } | null>(null);
  const [adminNote, setAdminNote] = useState("");

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
    setShareOpen(false);
    setCreatedShare(null);
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN) loadBuckets().catch((e) => setNotice(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  const createDocs = createPackage === "urchoice" ? URCHOICE_DEALER_DOCS : templates;
  const selectedCreateDocs = createDocs.filter((doc) => createChecked[doc.id]);
  const selectedShareFileIds = Object.entries(shareFiles).filter(([, selected]) => selected).map(([id]) => id);
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
    try {
      const invites = normalizedUploadInvites(createInvites, createInviteDraft);
      const row = await call<Bucket>("/buckets", { method: "POST", body: JSON.stringify(bucketForm) });
      for (const doc of selectedCreateDocs) {
        await call(`/buckets/admin/${row.id}/requested-documents`, {
          method: "POST",
          body: JSON.stringify({ name: doc.name, category: doc.category, required: doc.required }),
        });
      }
      const uploadLinks: UploadInviteLink[] = [];
      for (const invite of invites) {
        const uploadLink = await call<{ upload_url: string }>(`/buckets/admin/${row.id}/upload-links`, {
          method: "POST",
          body: JSON.stringify({ recipient_name: invite.recipient_name, recipient_email: invite.recipient_email }),
        });
        uploadLinks.push({ name: invite.recipient_name, email: invite.recipient_email || undefined, url: uploadLink.upload_url });
      }
      await loadBuckets();
      setBucketForm({ name: "", client_name: "", purpose: "", bucket_type: "Loan File", description: "" });
      setCreateInviteDraft({ recipient_name: "", recipient_email: "" });
      setCreateInvites([]);
      setCreateChecked({});
      setCreatePackage("standard");
      if (uploadLinks.length) {
        setCreateResult({ links: uploadLinks });
      } else {
        setCreateOpen(false);
        setNotice("Bucket created.");
      }
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
      },
    ]);
    setCreateInviteDraft({ recipient_name: "", recipient_email: "" });
  }

  async function createShareLink() {
    if (!detail || !shareForm.recipient_name.trim() || selectedShareFileIds.length === 0) return;
    setBusy(true);
    try {
      const res = await call<Share>(`/buckets/admin/${detail.id}/shares`, {
        method: "POST",
        body: JSON.stringify({
          ...shareForm,
          file_ids: selectedShareFileIds,
        }),
      });
      setCreatedShare({ url: res.share_url ?? "", passcode: res.passcode });
      setShareForm({ recipient_name: "", recipient_email: "", can_download: false });
      setShareFiles({});
      await loadBucket(detail.id);
      setNotice("Share link created.");
    } finally {
      setBusy(false);
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
    const res = await call<{ url: string }>(`/buckets/admin/${detail.id}/files/${file.id}/url?download=${download}`);
    window.open(res.url, "_blank", "noopener,noreferrer");
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
            setCreateInviteDraft({ recipient_name: "", recipient_email: "" });
            setCreateInvites([]);
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
        <BucketTable buckets={filteredBuckets} onSelect={loadBucket} />
      </PanelBox>

      {createOpen ? (
        <ModalFrame title="Create bucket" subtitle="Set up the bucket, choose requested files, and invite uploaders." onClose={() => setCreateOpen(false)}>
          {createResult ? (
            <div style={{ display: "grid", gap: 14 }}>
              <PanelBox style={{ borderColor: t.petrol }}>
                <SectionLabel action={`${createResult.links.length} link${createResult.links.length === 1 ? "" : "s"}`}>Upload invites created</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  {createResult.links.map((link) => (
                    <div key={`${link.name}-${link.url}`} style={smallRowStyle(t)}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: t.ink }}>{link.name}</strong>
                        <div style={{ color: t.ink3, fontSize: 12 }}>{link.email || "No email entered"}</div>
                        <code style={{ display: "block", color: t.ink2, overflowWrap: "anywhere", fontSize: 12, marginTop: 4 }}>{link.url}</code>
                      </div>
                      <button style={secondary} onClick={() => copyText(link.url)}>Copy</button>
                    </div>
                  ))}
                </div>
              </PanelBox>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button style={secondary} onClick={() => copyText(createResult.links.map((link) => `${link.name}: ${link.url}`).join("\n"))}>Copy all</button>
                <button style={primary} onClick={() => setCreateOpen(false)}>Done</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
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
                  </select>
                  <div style={{ color: t.ink3, fontSize: 12, alignSelf: "center" }}>
                    {selectedCreateDocs.length} selected
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, maxHeight: 260, overflowY: "auto", marginTop: 12 }}>
                  {createDocs.map((doc) => (
                    <label key={doc.id} style={checkRowStyle(t)}>
                      <input type="checkbox" checked={!!createChecked[doc.id]} onChange={(e) => setCreateChecked({ ...createChecked, [doc.id]: e.target.checked })} />
                      <span>
                        <span style={{ display: "block", color: t.ink, fontWeight: 750 }}>{doc.name}</span>
                        <span style={{ color: t.ink3, fontSize: 12 }}>{doc.category || "Standard Lending File"}</span>
                      </span>
                    </label>
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
                  <button style={secondary} onClick={addCreateInvite} disabled={!createInviteDraft.recipient_name.trim()}>
                    <Icon name="plus" size={14} />
                    Add invite
                  </button>
                </div>
                {createInvites.length ? (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {createInvites.map((invite) => (
                      <div key={invite.id} style={smallRowStyle(t)}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ color: t.ink }}>{invite.recipient_name}</strong>
                          <div style={{ color: t.ink3, fontSize: 12 }}>{invite.recipient_email || "No email entered"}</div>
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
                <button style={secondary} onClick={() => setCreateOpen(false)}>Cancel</button>
                <button style={primary} onClick={createBucketWorkflow} disabled={busy || !bucketForm.name.trim()}>
                  Create bucket
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
            <button style={iconButtonStyle(t)} onClick={() => setShareOpen((value) => !value)} aria-label="Share selected files" title="Share selected files">
              <Icon name="link" size={16} />
            </button>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, .65fr)", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
              {shareOpen ? (
                <PanelBox style={{ borderColor: t.petrol }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <SectionLabel style={{ margin: 0 }}>Share selected files</SectionLabel>
                    <div style={{ color: t.ink3, fontSize: 12 }}>{selectedShareFileIds.length} selected</div>
                  </div>
                  {createdShare ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      <code style={{ color: t.ink, overflowWrap: "anywhere", fontSize: 12.5 }}>{createdShare.url}</code>
                      {createdShare.passcode ? <div style={{ color: t.ink2, fontSize: 13 }}>Passcode: <strong>{createdShare.passcode}</strong></div> : null}
                      <button style={secondary} onClick={() => copyText(createdShare.passcode ? `${createdShare.url}\nPasscode: ${createdShare.passcode}` : createdShare.url)}>Copy share</button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginTop: 10 }}>
                      <input style={field} placeholder="Recipient name" value={shareForm.recipient_name} onChange={(e) => setShareForm({ ...shareForm, recipient_name: e.target.value })} />
                      <input style={field} placeholder="Recipient email optional" value={shareForm.recipient_email} onChange={(e) => setShareForm({ ...shareForm, recipient_email: e.target.value })} />
                      <label style={{ display: "flex", alignItems: "center", gap: 6, color: t.ink2, fontSize: 12 }}>
                        <input type="checkbox" checked={shareForm.can_download} onChange={(e) => setShareForm({ ...shareForm, can_download: e.target.checked })} />
                        Download
                      </label>
                      <button style={{ ...primary, gridColumn: "1 / -1" }} onClick={createShareLink} disabled={busy || selectedShareFileIds.length === 0 || !shareForm.recipient_name.trim()}>
                        Create share link
                      </button>
                    </div>
                  )}
                </PanelBox>
              ) : null}

              <PanelBox>
                <SectionLabel action={`${detail.files.length} uploaded`}>Files</SectionLabel>
                {detail.files.length === 0 ? (
                  <EmptyInline icon="file" title="No files uploaded yet" body="Files uploaded through request links will appear here." />
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {detail.files.map((file) => (
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
                        <div style={{ color: t.ink3, fontSize: 12 }}>{doc.category || "General"}{doc.required ? " | Required" : ""}</div>
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
    </div>
  );
}

function BucketTable({ buckets, onSelect }: { buckets: Bucket[]; onSelect: (id: string) => void }) {
  const { t } = useTheme();
  if (buckets.length === 0) {
    return <div style={{ padding: 18, color: t.ink3, fontSize: 13 }}>No buckets yet. Use Create bucket to start.</div>;
  }
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1.5fr) minmax(160px, 1fr) 180px 120px 110px", gap: 12, padding: "10px 14px", color: t.ink3, background: t.surface2, borderBottom: `1px solid ${t.line}`, fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" }}>
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
            gridTemplateColumns: "minmax(240px, 1.5fr) minmax(160px, 1fr) 180px 120px 110px",
            gap: 12,
            alignItems: "center",
            padding: "13px 14px",
            borderBottom: `1px solid ${t.line}`,
            background: t.surface,
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

function normalizedUploadInvites(invites: UploadInvite[], draft: { recipient_name: string; recipient_email: string }): UploadInvite[] {
  const rows = [...invites];
  if (draft.recipient_name.trim()) {
    rows.push({
      id: "draft",
      recipient_name: draft.recipient_name.trim(),
      recipient_email: draft.recipient_email.trim(),
    });
  }
  return rows;
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
