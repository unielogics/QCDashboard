"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { api, apiBase } from "@/lib/api";
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
  const [bucketForm, setBucketForm] = useState({ name: "", client_name: "", purpose: "", bucket_type: "Loan File", description: "" });
  const [customDoc, setCustomDoc] = useState("");
  const [uploadRecipient, setUploadRecipient] = useState({ recipient_name: "", recipient_email: "" });
  const [shareForm, setShareForm] = useState({ recipient_name: "", recipient_email: "", can_download: false });
  const [adminNote, setAdminNote] = useState("");

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
    if (id) setDetail(await call<BucketDetail>(`/buckets/admin/${id}`));
    else setDetail(null);
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN) refreshAll().catch((e) => setNotice(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  const missingCount = useMemo(() => {
    if (!detail) return 0;
    return detail.requested_documents.filter((d) => d.status !== "uploaded").length;
  }, [detail]);

  if (meLoading) return <Card pad={18}>Loading...</Card>;
  if (me && me.role !== Role.SUPER_ADMIN) return null;

  async function createBucket() {
    if (!bucketForm.name.trim()) return;
    setBusy(true);
    try {
      const row = await call<Bucket>("/buckets", { method: "POST", body: JSON.stringify(bucketForm) });
      setBucketForm({ name: "", client_name: "", purpose: "", bucket_type: "Loan File", description: "" });
      await refreshAll(row.id);
      setNotice("Bucket created.");
    } finally {
      setBusy(false);
    }
  }

  async function addCheckedDocs() {
    if (!selectedId) return;
    setBusy(true);
    try {
      for (const template of templates.filter((x) => checked[x.id])) {
        await call(`/buckets/admin/${selectedId}/requested-documents`, {
          method: "POST",
          body: JSON.stringify({ name: template.name, category: template.category, required: template.required }),
        });
      }
      setChecked({});
      await refreshAll(selectedId);
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
    } finally {
      setBusy(false);
    }
  }

  async function createUploadLink() {
    if (!selectedId || !uploadRecipient.recipient_name.trim()) return;
    const res = await call<{ upload_url: string }>(`/buckets/admin/${selectedId}/upload-links`, {
      method: "POST",
      body: JSON.stringify(uploadRecipient),
    });
    setCreatedLink({ label: "Upload link", url: res.upload_url });
    setUploadRecipient({ recipient_name: "", recipient_email: "" });
  }

  async function createShareLink() {
    if (!selectedId || !shareForm.recipient_name.trim()) return;
    const res = await call<Share>(`/buckets/admin/${selectedId}/shares`, {
      method: "POST",
      body: JSON.stringify(shareForm),
    });
    setCreatedLink({ label: "Share link", url: res.share_url ?? "", passcode: res.passcode });
    setShareForm({ recipient_name: "", recipient_email: "", can_download: false });
    await refreshAll(selectedId);
  }

  async function addNote() {
    if (!selectedId || !adminNote.trim()) return;
    await call(`/buckets/admin/${selectedId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content: adminNote, visibility: "admin" }),
    });
    setAdminNote("");
    await refreshAll(selectedId);
  }

  async function openFile(file: BucketFile, download = false) {
    if (!selectedId) return;
    const res = await call<{ url: string }>(`/buckets/admin/${selectedId}/files/${file.id}/url?download=${download}`);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  const input = {
    height: 38,
    border: `1px solid ${t.lineStrong}`,
    borderRadius: 8,
    padding: "0 10px",
    font: "inherit",
    background: t.surface,
    color: t.ink,
  };
  const button = {
    height: 38,
    border: "none",
    borderRadius: 8,
    padding: "0 12px",
    font: "inherit",
    fontWeight: 800,
    background: t.ink,
    color: t.inverse,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card pad={16}>
          <SectionLabel>New bucket</SectionLabel>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <input style={input} placeholder="Bucket name" value={bucketForm.name} onChange={(e) => setBucketForm({ ...bucketForm, name: e.target.value })} />
            <input style={input} placeholder="Client / borrower" value={bucketForm.client_name} onChange={(e) => setBucketForm({ ...bucketForm, client_name: e.target.value })} />
            <input style={input} placeholder="Purpose" value={bucketForm.purpose} onChange={(e) => setBucketForm({ ...bucketForm, purpose: e.target.value })} />
            <button style={button} disabled={busy} onClick={createBucket}><Icon name="plus" /> Create</button>
          </div>
        </Card>
        <Card pad={10}>
          <SectionLabel>Buckets</SectionLabel>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {buckets.map((b) => (
              <button
                key={b.id}
                onClick={async () => { setSelectedId(b.id); setDetail(await call<BucketDetail>(`/buckets/admin/${b.id}`)); }}
                style={{
                  textAlign: "left",
                  border: `1px solid ${selectedId === b.id ? t.ink : t.line}`,
                  borderRadius: 8,
                  padding: 10,
                  background: selectedId === b.id ? t.surface2 : t.surface,
                  color: t.ink,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 800 }}>{b.name}</div>
                <div style={{ color: t.ink3, fontSize: 12 }}>{b.client_name || "No client"} · {b.status.replace(/_/g, " ")}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div>
          <h1 style={{ margin: 0, color: t.ink, fontSize: 24 }}>Buckets</h1>
          <p style={{ margin: "6px 0 0", color: t.ink3, fontSize: 13 }}>
            Secure document collection and gated sharing for Super Admin.
          </p>
        </div>
        {notice ? <div style={{ color: t.ink2, fontSize: 13 }}>{notice}</div> : null}
        {createdLink ? (
          <Card pad={14}>
            <SectionLabel>{createdLink.label}</SectionLabel>
            <div style={{ display: "grid", gap: 6, marginTop: 8, color: t.ink }}>
              <code style={{ overflowWrap: "anywhere" }}>{createdLink.url}</code>
              {createdLink.passcode ? <div>Passcode: <strong>{createdLink.passcode}</strong></div> : null}
            </div>
          </Card>
        ) : null}
        {detail ? (
          <>
            <Card pad={16}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, color: t.ink }}>{detail.name}</h2>
                  <div style={{ color: t.ink3, fontSize: 13, marginTop: 4 }}>{detail.client_name || "No client"} · {detail.purpose || "No purpose"}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Stat label="Files" value={String(detail.files.length)} />
                  <Stat label="Missing" value={String(missingCount)} />
                  <Stat label="Shares" value={String(detail.shares.length)} />
                </div>
              </div>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, .8fr)", gap: 12 }}>
              <Card pad={16}>
                <SectionLabel>Requested files</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
                  {templates.map((tpl) => (
                    <label key={tpl.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: t.ink2 }}>
                      <input type="checkbox" checked={!!checked[tpl.id]} onChange={(e) => setChecked({ ...checked, [tpl.id]: e.target.checked })} />
                      <span>{tpl.name}<br /><span style={{ color: t.ink3, fontSize: 11 }}>{tpl.category}</span></span>
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={button} onClick={addCheckedDocs} disabled={busy}>Add selected</button>
                  <input style={{ ...input, flex: 1 }} placeholder="Custom request" value={customDoc} onChange={(e) => setCustomDoc(e.target.value)} />
                  <button style={button} onClick={addCustomDoc} disabled={busy}>Save custom</button>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, fontSize: 13 }}>
                  <tbody>
                    {detail.requested_documents.map((d) => (
                      <tr key={d.id} style={{ borderTop: `1px solid ${t.line}` }}>
                        <td style={{ padding: "8px 0", color: t.ink, fontWeight: 700 }}>{d.name}</td>
                        <td style={{ padding: "8px 0", color: t.ink3 }}>{d.category || "General"}</td>
                        <td style={{ padding: "8px 0", color: d.status === "uploaded" ? t.profit : t.ink3, textAlign: "right" }}>{d.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card pad={16}>
                <SectionLabel>Links</SectionLabel>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  <input style={input} placeholder="Uploader name" value={uploadRecipient.recipient_name} onChange={(e) => setUploadRecipient({ ...uploadRecipient, recipient_name: e.target.value })} />
                  <input style={input} placeholder="Uploader email optional" value={uploadRecipient.recipient_email} onChange={(e) => setUploadRecipient({ ...uploadRecipient, recipient_email: e.target.value })} />
                  <button style={button} onClick={createUploadLink}>Create upload link</button>
                  <div style={{ height: 1, background: t.line, margin: "6px 0" }} />
                  <input style={input} placeholder="Shared user name" value={shareForm.recipient_name} onChange={(e) => setShareForm({ ...shareForm, recipient_name: e.target.value })} />
                  <input style={input} placeholder="Shared user email" value={shareForm.recipient_email} onChange={(e) => setShareForm({ ...shareForm, recipient_email: e.target.value })} />
                  <label style={{ color: t.ink2, fontSize: 13 }}><input type="checkbox" checked={shareForm.can_download} onChange={(e) => setShareForm({ ...shareForm, can_download: e.target.checked })} /> Enable downloads</label>
                  <button style={button} onClick={createShareLink}>Create share link</button>
                </div>
              </Card>
            </div>

            <Card pad={16}>
              <SectionLabel>Uploaded files</SectionLabel>
              {detail.files.length === 0 ? <div style={{ color: t.ink3, marginTop: 10 }}>No uploads yet.</div> : (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
                  <tbody>
                    {detail.files.map((f) => (
                      <tr key={f.id} style={{ borderTop: `1px solid ${t.line}` }}>
                        <td style={{ padding: 8, color: t.ink, fontWeight: 700 }}>{f.file_name}</td>
                        <td style={{ padding: 8, color: t.ink3 }}>{f.uploaded_by_name || "Unknown"}</td>
                        <td style={{ padding: 8, color: t.ink3 }}>{new Date(f.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>
                          <button style={{ ...button, height: 30, marginRight: 6 }} onClick={() => openFile(f, false)}>Preview</button>
                          <button style={{ ...button, height: 30 }} onClick={() => openFile(f, true)}>Download</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
              <Card pad={16}>
                <SectionLabel>Notes</SectionLabel>
                <textarea style={{ ...input, height: 82, paddingTop: 8 }} placeholder="Admin note" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
                <button style={{ ...button, marginTop: 8 }} onClick={addNote}>Add note</button>
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  {detail.notes.map((n) => <div key={n.id} style={{ borderTop: `1px solid ${t.line}`, paddingTop: 8, color: t.ink2, fontSize: 13 }}><strong>{n.visibility}</strong> · {n.content}</div>)}
                </div>
              </Card>
              <Card pad={16}>
                <SectionLabel>Shared access</SectionLabel>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {detail.shares.map((s) => (
                    <div key={s.id} style={{ border: `1px solid ${t.line}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ fontWeight: 800, color: t.ink }}>{s.recipient_name}</div>
                      <div style={{ color: t.ink3, fontSize: 12 }}>{s.status} · downloads {s.can_download ? "enabled" : "disabled"} · views {s.view_count}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        ) : (
          <Card pad={18}>Create or select a bucket.</Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 72, textAlign: "right" }}>
      <div style={{ fontSize: 20, fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
    </div>
  );
}
