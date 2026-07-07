"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { BucketFileReviewPanel, type BucketFileAnnotation, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, SectionLabel } from "@/components/design-system/primitives";
import { QCMark } from "@/components/QCMark";
import { useCurrentUser } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
import { openSignedUrl } from "@/lib/safeOpen";

type VendorBucket = {
  id: string;
  name: string;
  client_name?: string | null;
  purpose?: string | null;
  bucket_type?: string | null;
  uploaded_file_count?: number;
  vendor_access: VendorAccess;
};
type VendorAccess = {
  id: string;
  vendor_name?: string | null;
  vendor_email?: string | null;
  file_scope: "all_active" | "selected";
  can_download: boolean;
  can_add_notes: boolean;
  can_use_ai_chat: boolean;
  can_view_ai_summary: boolean;
  can_view_ai_tasks: boolean;
  can_propose_tasks: boolean;
  view_count: number;
  download_count: number;
  status: string;
  expires_at?: string | null;
  files?: FileRow[];
};
type FileRow = { id: string; file_name: string; content_type: string; size_bytes?: number; created_at: string; preview_url?: string | null; download_url?: string | null };
type Note = { id: string; author_name: string; content: string; created_at: string };
type AITask = { id: string; status: string; title: string; instructions: string; rationale?: string | null };
type AIMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type VendorRoom = {
  bucket: VendorBucket;
  vendor_access: VendorAccess;
  files: FileRow[];
  notes: Note[];
  ai_summary?: Record<string, unknown> | null;
  ai_tasks?: AITask[];
};

export default function VendorBucketsPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const [buckets, setBuckets] = useState<VendorBucket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [room, setRoom] = useState<VendorRoom | null>(null);
  const [reviewFile, setReviewFile] = useState<FileRow | null>(null);
  const [note, setNote] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadBuckets() {
    const rows = await call<VendorBucket[]>("/buckets/vendor");
    setBuckets(rows);
    if (!selectedId && rows[0]) setSelectedId(rows[0].id);
  }

  async function loadRoom(bucketId: string) {
    setBusy(true);
    setStatus("");
    try {
      const payload = await call<VendorRoom>(`/buckets/vendor/${bucketId}`);
      setRoom(payload);
      setAiMessages([]);
    } catch (error) {
      setStatus(readableError(error));
      setRoom(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.VENDOR) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.VENDOR) loadBuckets().catch((error) => setStatus(readableError(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  useEffect(() => {
    if (selectedId && me?.role === Role.VENDOR) loadRoom(selectedId).catch((error) => setStatus(readableError(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, me?.role]);

  async function addNote() {
    if (!room || !note.trim()) return;
    setBusy(true);
    try {
      await call<Note>(`/buckets/vendor/${room.bucket.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: note.trim(), visibility: "shared" }),
      });
      setNote("");
      await loadRoom(room.bucket.id);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadReview(file: FileRow): Promise<BucketFileReview> {
    if (!room) throw new Error("Vendor room is not loaded.");
    return call<BucketFileReview>(`/buckets/vendor/${room.bucket.id}/files/${file.id}/review`);
  }

  async function saveAnnotation(file: FileRow, payload: { page_number: number; x: number; y: number; width: number; height: number; comment: string }): Promise<BucketFileAnnotation> {
    if (!room) throw new Error("Vendor room is not loaded.");
    return call<BucketFileAnnotation>(`/buckets/vendor/${room.bucket.id}/files/${file.id}/annotations`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function downloadFile(file: FileRow) {
    if (!room?.vendor_access.can_download) return;
    setDownloadingId(file.id);
    try {
      const payload = await call<{ url: string }>(`/buckets/vendor/${room.bucket.id}/files/${file.id}/download`, { method: "POST" });
      if (!openSignedUrl(payload.url)) setStatus("Download is not available for this file.");
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setDownloadingId(null);
    }
  }

  async function sendAIMessage() {
    if (!room || !aiText.trim()) return;
    const text = aiText.trim();
    setAiText("");
    setBusy(true);
    try {
      const payload = await call<{ messages: AIMessage[] }>(`/buckets/vendor/${room.bucket.id}/ai-chat`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setAiMessages((current) => [...current, ...payload.messages]);
      await loadRoom(room.bucket.id);
    } catch (error) {
      setStatus(readableError(error));
    } finally {
      setBusy(false);
    }
  }

  const selectedBucket = useMemo(() => buckets.find((bucket) => bucket.id === selectedId), [buckets, selectedId]);

  if (meLoading) return <div style={{ color: t.ink2 }}>Loading vendor buckets...</div>;
  if (me && me.role !== Role.VENDOR) return null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <header style={heroStyle(t)}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <QCMark size={38} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: t.ink3, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 }}>Vendor File Rooms</div>
            <h1 style={{ margin: "2px 0 0", color: t.ink, fontSize: 28, lineHeight: 1.12 }}>Assigned Buckets</h1>
          </div>
        </div>
        <Pill>{buckets.length} assigned</Pill>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, .34fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
        <Panel t={t}>
          <SectionLabel>My buckets</SectionLabel>
          <div style={{ display: "grid", gap: 8 }}>
            {buckets.length === 0 ? (
              <div style={emptyStyle(t)}>No buckets are assigned to your vendor account yet.</div>
            ) : buckets.map((bucket) => (
              <button key={bucket.id} style={bucketButtonStyle(t, bucket.id === selectedId)} onClick={() => setSelectedId(bucket.id)}>
                <strong style={{ color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bucket.name}</strong>
                <span style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {bucket.client_name || "No client"} | {bucket.uploaded_file_count ?? 0} files
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
          <Panel t={t}>
            {!room ? (
              <div style={emptyStyle(t)}>{busy ? "Opening secure room..." : selectedBucket ? "Select a bucket to open its room." : "No bucket selected."}</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: t.ink3, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>Secure vendor access</div>
                    <h2 style={{ margin: "3px 0", color: t.ink, fontSize: 24 }}>{room.bucket.name}</h2>
                    <div style={{ color: t.ink3, fontSize: 13 }}>
                      {[room.bucket.client_name, room.bucket.purpose, room.vendor_access.file_scope === "all_active" ? "All active files" : "Selected files"].filter(Boolean).join(" | ")}
                    </div>
                  </div>
                  <Pill color={room.vendor_access.status === "active" ? t.profit : t.danger} bg={room.vendor_access.status === "active" ? t.profitBg : t.dangerBg}>{room.vendor_access.status}</Pill>
                </div>
                <div style={securityBarStyle(t)}>
                  <Icon name="shield" size={15} />
                  Files are encrypted and access is controlled by Qualified Commercial permissions.
                </div>
              </div>
            )}
          </Panel>

          {room ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, .42fr)", gap: 14, alignItems: "start" }}>
              <Panel t={t}>
                <SectionLabel action={`${room.files.length} files`}>Files</SectionLabel>
                <div style={{ display: "grid", gap: 8 }}>
                  {room.files.length === 0 ? (
                    <div style={emptyStyle(t)}>No files are visible for this bucket.</div>
                  ) : room.files.map((file) => (
                    <div key={file.id} style={fileRowStyle(t)}>
                      <div style={fileIconStyle(t)}>{fileExtension(file.file_name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.file_name}</strong>
                        <span style={{ color: t.ink3, fontSize: 12 }}>{fileKindLabel(file)} | {formatDate(file.created_at)} | {typeof file.size_bytes === "number" ? formatSize(file.size_bytes) : "Unknown size"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {file.preview_url ? (
                          <button style={buttonStyle(t, "secondary")} onClick={() => setReviewFile(file)}>
                            <Icon name="eye" size={13} />
                            Preview
                          </button>
                        ) : null}
                        {room.vendor_access.can_download ? (
                          <button style={buttonStyle(t, "primary")} onClick={() => downloadFile(file)} disabled={downloadingId === file.id}>
                            <Icon name="download" size={13} />
                            {downloadingId === file.id ? "Preparing..." : "Download"}
                          </button>
                        ) : (
                          <span style={{ color: t.ink3, fontSize: 12, alignSelf: "center" }}>Download disabled</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <div style={{ display: "grid", gap: 14 }}>
                {(room.vendor_access.can_view_ai_summary || room.vendor_access.can_view_ai_tasks || room.vendor_access.can_use_ai_chat) ? (
                  <Panel t={t}>
                    <SectionLabel>AI assistant</SectionLabel>
                    <p style={{ margin: "0 0 10px", color: t.ink3, fontSize: 13, lineHeight: 1.45 }}>
                      Answers are limited to this vendor room and files visible to you.
                    </p>
                    {room.vendor_access.can_view_ai_summary ? (
                      <div style={summaryStyle(t)}>
                        {summaryText(room.ai_summary)}
                        {summaryItems(room.ai_summary, "missing_or_incomplete_items").length ? (
                          <div style={{ marginTop: 8, color: t.danger }}>
                            <strong>Needs attention: </strong>{summaryItems(room.ai_summary, "missing_or_incomplete_items").slice(0, 2).map(describeAIItem).join(" ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {room.vendor_access.can_view_ai_tasks ? (
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {(room.ai_tasks ?? []).length === 0 ? <div style={emptyStyle(t)}>No approved vendor tasks yet.</div> : (room.ai_tasks ?? []).map((task) => (
                          <div key={task.id} style={task.status === "completed" ? smallCardStyle(t) : dangerCardStyle(t)}>
                            <strong style={{ color: t.ink }}>{task.title}</strong>
                            <div style={{ color: t.ink3, fontSize: 12 }}>{task.status}</div>
                            <div style={{ color: t.ink2, fontSize: 13, marginTop: 4 }}>{task.instructions}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {room.vendor_access.can_use_ai_chat ? (
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                          {aiMessages.length === 0 ? <div style={emptyStyle(t)}>Ask a question or suggest a requirement. Proposed tasks go to Qualified Commercial for approval.</div> : aiMessages.slice(-8).map((message) => (
                            <div key={message.id} style={message.role === "assistant" ? aiBubbleStyle(t) : aiBubbleUserStyle(t)}>{message.content}</div>
                          ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                          <input
                            style={inputStyle(t)}
                            placeholder="Ask about this bucket..."
                            value={aiText}
                            onChange={(event) => setAiText(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") sendAIMessage();
                            }}
                          />
                          <button style={buttonStyle(t, "secondary")} onClick={sendAIMessage} disabled={busy || !aiText.trim()}>Send</button>
                        </div>
                      </div>
                    ) : null}
                  </Panel>
                ) : null}

                <Panel t={t}>
                  <SectionLabel>Notes</SectionLabel>
                  {room.vendor_access.can_add_notes ? (
                    <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                      <textarea style={{ ...inputStyle(t), minHeight: 88, paddingTop: 10, resize: "vertical" }} placeholder="Add a note for Qualified Commercial" value={note} onChange={(event) => setNote(event.target.value)} />
                      <button style={buttonStyle(t, "primary")} onClick={addNote} disabled={busy || !note.trim()}>Add note</button>
                    </div>
                  ) : <div style={emptyStyle(t)}>Notes are disabled for this vendor access.</div>}
                  <div style={{ display: "grid", gap: 8 }}>
                    {room.notes.length === 0 ? <div style={emptyStyle(t)}>No notes yet.</div> : room.notes.map((item) => (
                      <div key={item.id} style={smallCardStyle(t)}>
                        <strong style={{ color: t.ink }}>{item.author_name || "Qualified Commercial"}</strong>
                        <div style={{ color: t.ink3, fontSize: 12 }}>{formatDateTime(item.created_at)}</div>
                        <div style={{ color: t.ink2, marginTop: 6, whiteSpace: "pre-wrap" }}>{item.content}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {status ? <div style={{ color: /error|failed|disabled|not/i.test(status) ? t.danger : t.ink2, fontWeight: 800 }}>{status}</div> : null}

      {reviewFile ? (
        <BucketFileReviewPanel
          title="Vendor file review"
          onDownload={room?.vendor_access.can_download ? () => downloadFile(reviewFile) : undefined}
          loadReview={() => loadReview(reviewFile)}
          saveAnnotation={(payload) => saveAnnotation(reviewFile, payload)}
          onClose={() => setReviewFile(null)}
        />
      ) : null}
    </div>
  );
}

function Panel({ t, children }: { t: ReturnType<typeof useTheme>["t"]; children: ReactNode }) {
  return <section style={{ border: `1px solid ${t.line}`, background: t.surface, borderRadius: 10, padding: 14, boxShadow: t.shadow }}>{children}</section>;
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function summaryText(summary: Record<string, unknown> | null | undefined): string {
  if (!summary) return "AI summary has not been completed for these files yet.";
  if (typeof summary.summary === "string") return summary.summary;
  return "AI summary is available for this vendor room.";
}

function summaryItems(summary: Record<string, unknown> | null | undefined, key: string): unknown[] {
  const value = summary?.[key];
  return Array.isArray(value) ? value : [];
}

function describeAIItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  const row = item as Record<string, unknown>;
  return [row.title, row.file_name, row.detail, row.summary, row.explanation].filter((value) => typeof value === "string" && value).join(" - ");
}

function fileExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.slice(0, 4).toUpperCase();
  return ext && ext !== fileName.toUpperCase() ? ext : "FILE";
}

function fileKindLabel(file: FileRow): string {
  const lower = `${file.content_type} ${file.file_name}`.toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("image") || /\.(png|jpe?g|webp|gif)$/i.test(file.file_name)) return "Image";
  if (lower.includes("csv") || file.file_name.toLowerCase().endsWith(".csv")) return "CSV";
  if (/\.(xlsx?|xlsm)$/i.test(file.file_name)) return "Spreadsheet";
  return "File";
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function heroStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, border: `1px solid ${t.line}`, background: t.surface, borderRadius: 10, padding: 16, boxShadow: t.shadow };
}

function bucketButtonStyle(t: ReturnType<typeof useTheme>["t"], active: boolean): CSSProperties {
  return { border: `1px solid ${active ? t.petrol : t.line}`, background: active ? t.petrolSoft : t.surface2, borderRadius: 8, padding: 12, display: "grid", gap: 3, textAlign: "left", cursor: "pointer" };
}

function securityBarStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { display: "flex", alignItems: "center", gap: 8, border: `1px solid ${t.petrol}`, background: t.petrolSoft, color: t.petrol, borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 800 };
}

function emptyStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { border: `1px solid ${t.line}`, background: t.surface2, borderRadius: 8, padding: 12, color: t.ink3, fontSize: 13 };
}

function fileRowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { display: "grid", gridTemplateColumns: "48px minmax(0, 1fr) auto", gap: 10, alignItems: "center", border: `1px solid ${t.line}`, borderRadius: 8, padding: 10, background: t.surface2 };
}

function fileIconStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { width: 48, height: 48, borderRadius: 8, display: "grid", placeItems: "center", background: t.petrolSoft, color: t.petrol, fontSize: 10, fontWeight: 950 };
}

function buttonStyle(t: ReturnType<typeof useTheme>["t"], tone: "primary" | "secondary"): CSSProperties {
  const primary = tone === "primary";
  return { minHeight: 34, border: `1px solid ${primary ? t.ink : t.line}`, borderRadius: 8, background: primary ? t.ink : t.surface, color: primary ? t.inverse : t.ink, padding: "0 11px", font: "inherit", fontWeight: 850, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { minHeight: 40, border: `1px solid ${t.line}`, borderRadius: 8, background: t.surface, color: t.ink, padding: "0 11px", font: "inherit", boxSizing: "border-box", minWidth: 0 };
}

function smallCardStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { border: `1px solid ${t.line}`, borderRadius: 8, background: t.surface2, padding: 10 };
}

function dangerCardStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { border: `1px solid ${t.danger}`, borderRadius: 8, background: t.dangerBg, padding: 10 };
}

function summaryStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { border: `1px solid ${t.line}`, borderRadius: 8, background: t.surface2, padding: 10, color: t.ink2, fontSize: 13, lineHeight: 1.45 };
}

function aiBubbleStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { border: `1px solid ${t.petrol}`, background: t.petrolSoft, color: t.petrol, borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap" };
}

function aiBubbleUserStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { border: `1px solid ${t.line}`, background: t.surface2, color: t.ink2, borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap" };
}
