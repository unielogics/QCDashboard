"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { BucketFileReviewPanel, type BucketFileAnnotation, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import { QCMark } from "@/components/QCMark";
import { Icon } from "@/components/design-system/Icon";
import { apiBase } from "@/lib/api";

type FileRow = { id: string; file_name: string; content_type: string; size_bytes?: number; created_at: string; preview_url?: string | null; download_url?: string | null };
type Note = { id: string; author_name: string; content: string; created_at: string };
type Access = {
  bucket: { name: string; client_name?: string | null; purpose?: string | null };
  share: { recipient_name: string; can_download: boolean; can_add_notes: boolean; can_use_ai_chat?: boolean; can_view_ai_summary?: boolean; can_view_ai_tasks?: boolean; can_propose_tasks?: boolean };
  files: FileRow[];
  notes: Note[];
  ai_summary?: Record<string, unknown> | null;
  ai_tasks?: AITask[];
};
type ShareInfo = {
  bucket: { name: string; client_name?: string | null; purpose?: string | null };
  recipient_name: string;
  recipient_email?: string | null;
  can_download: boolean;
  can_add_notes: boolean;
  can_use_ai_chat?: boolean;
  can_view_ai_summary?: boolean;
  can_view_ai_tasks?: boolean;
  can_propose_tasks?: boolean;
};
type AITask = { id: string; status: string; title: string; instructions: string; rationale?: string | null };
type AIMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

export default function BucketSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [passcode, setPasscode] = useState("");
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [reviewFile, setReviewFile] = useState<FileRow | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("Loading secure room...");
  const [working, setWorking] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/v1/buckets/share/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Share link unavailable."))))
      .then((data) => {
        setInfo(data);
        setStatus("");
      })
      .catch((e: Error) => setStatus(e.message));
  }, [token]);

  async function openRoom() {
    if (!passcode.trim()) return;
    setWorking(true);
    setStatus("Checking access...");
    try {
      const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      if (!res.ok) {
        setStatus("Invalid or inactive share link.");
        return;
      }
      setAccess(await res.json());
      setReviewFile(null);
      setStatus("");
    } finally {
      setWorking(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setWorking(true);
    const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcode.trim(), content: note.trim() }),
    });
    if (!res.ok) {
      setStatus("Could not add note.");
      setWorking(false);
      return;
    }
    setNote("");
    await openRoom();
  }

  async function loadSharedReview(file: FileRow): Promise<BucketFileReview> {
    const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/files/${file.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcode.trim() }),
    });
    if (!res.ok) throw new Error("Could not open file review.");
    return res.json();
  }

  async function saveSharedAnnotation(file: FileRow, payload: { page_number: number; x: number; y: number; width: number; height: number; comment: string }): Promise<BucketFileAnnotation> {
    const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/files/${file.id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, passcode: passcode.trim() }),
    });
    if (!res.ok) throw new Error("Could not save review comment.");
    return res.json();
  }

  async function downloadSharedFile(file: FileRow) {
    if (!access?.share.can_download) return;
    setDownloadingId(file.id);
    setStatus("");
    try {
      const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/files/${file.id}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      if (!res.ok) {
        setStatus("Download is not available for this file.");
        return;
      }
      const payload = (await res.json()) as { url: string };
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  async function sendAIMessage() {
    if (!access || !aiText.trim()) return;
    const text = aiText.trim();
    setAiText("");
    setAiBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim(), message: text }),
      });
      if (!res.ok) {
        setStatus("AI chat is not available for this share.");
        return;
      }
      const payload = (await res.json()) as { messages: AIMessage[] };
      setAiMessages((current) => [...current, ...payload.messages]);
      await openRoom();
    } finally {
      setAiBusy(false);
    }
  }

  const roomName = access?.bucket.name ?? info?.bucket.name ?? "Secure file room";
  const recipient = access?.share.recipient_name ?? info?.recipient_name;

  return (
    <main style={page}>
      {!access ? (
        <section style={gateShell}>
          <BrandBlock />
          <div style={gateCard}>
            <div style={securePill}>
              <Icon name="lock" size={14} />
              Encrypted secure room
            </div>
            <h1 style={gateTitle}>Qualified Commercial Secure File Room</h1>
            <p style={gateCopy}>
              {info ? (
                <>
                  Hi <strong>{info.recipient_name}</strong>, you have been invited to review files for <strong>{info.bucket.name}</strong>.
                </>
              ) : (
                "Opening your secure file room."
              )}
            </p>
            <div style={callout}>
              <Icon name="shield" size={16} />
              Access is gated by a private code and authorized user controls.
            </div>
            <div style={gateForm}>
              <label style={label} htmlFor="share-passcode">Access code</label>
              <input
                id="share-passcode"
                style={accessInput}
                placeholder="Enter access code"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openRoom().catch(() => undefined);
                }}
                autoComplete="one-time-code"
              />
              <button style={{ ...primaryButton, opacity: working || !passcode.trim() ? 0.7 : 1 }} onClick={() => openRoom().catch(() => undefined)} disabled={working || !passcode.trim()}>
                {working ? "Checking access..." : "Open file room"}
              </button>
            </div>
            {status ? <p style={statusStyle(status)}>{status}</p> : null}
          </div>
        </section>
      ) : (
        <section style={roomShell}>
          <header style={roomHeader}>
            <div style={{ minWidth: 0 }}>
              <BrandBlock compact />
              <h1 style={roomTitle}>{roomName}</h1>
              <p style={roomMeta}>
                Access granted to <strong>{recipient}</strong>
                {access.bucket.client_name ? ` | ${access.bucket.client_name}` : ""}
                {access.bucket.purpose ? ` | ${access.bucket.purpose}` : ""}
              </p>
            </div>
            <div style={summaryCard}>
              <span style={summaryNumber}>{access.files.length}</span>
              <span style={summaryLabel}>shared files</span>
            </div>
          </header>

          <div style={securityBar}>
            <Icon name="shield" size={16} />
            <span>Uploads and shared documents are encrypted. Viewing is controlled through authorized access permissions.</span>
          </div>

          <div style={roomGrid}>
            <main style={filePanel}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={sectionTitle}>Shared files</h2>
                  <p style={sectionCopy}>Preview supported files in the secure viewer or download when permission is enabled.</p>
                </div>
              </div>
              <div style={fileList}>
                {access.files.length === 0 ? (
                  <div style={emptyState}>No files have been shared yet.</div>
                ) : access.files.map((file) => (
                  <article key={file.id} style={fileCard}>
                    <div style={fileIcon(file)}>
                      <span>{fileExtension(file.file_name)}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={fileName}>{file.file_name}</h3>
                      <div style={fileMeta}>
                        <span>{fileKindLabel(file)}</span>
                        <span>Uploaded {formatDate(file.created_at)}</span>
                        {typeof file.size_bytes === "number" ? <span>{formatSize(file.size_bytes)}</span> : null}
                      </div>
                    </div>
                    <div style={fileActions}>
                      {file.preview_url ? (
                        <button style={secondaryButton} onClick={() => setReviewFile(file)}>
                          <Icon name="eye" size={14} />
                          Preview
                        </button>
                      ) : null}
                      {access.share.can_download ? (
                        <button style={primaryLinkButton} onClick={() => downloadSharedFile(file).catch(() => setStatus("Download is not available for this file."))} disabled={downloadingId === file.id}>
                          <Icon name="download" size={14} />
                          {downloadingId === file.id ? "Preparing..." : "Download"}
                        </button>
                      ) : (
                        <span style={downloadDisabled}>Download disabled</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </main>

            <aside style={notesPanel}>
              <div style={sectionHeader}>
                <div>
                  <h2 style={sectionTitle}>Shared notes</h2>
                  <p style={sectionCopy}>{access.share.can_add_notes ? "Add context or questions for the Qualified Commercial team." : "Notes are read-only for this share."}</p>
                </div>
              </div>
              {access.share.can_add_notes ? (
                <div style={noteComposer}>
                  <textarea style={noteField} placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button style={{ ...primaryButton, alignSelf: "end", minWidth: 92, opacity: working || !note.trim() ? 0.7 : 1 }} onClick={() => addNote().catch(() => undefined)} disabled={working || !note.trim()}>
                    Add note
                  </button>
                </div>
              ) : (
                <div style={emptyState}>Notes are disabled for this share.</div>
              )}
              <div style={noteList}>
                {access.notes.length === 0 ? (
                  <div style={emptyState}>No notes yet.</div>
                ) : access.notes.map((item) => (
                  <div key={item.id} style={noteCard}>
                    <div style={noteAuthor}>{item.author_name || "Qualified Commercial"}</div>
                    <div style={noteDate}>{formatDateTime(item.created_at)}</div>
                    <p style={noteText}>{item.content}</p>
                  </div>
                ))}
              </div>
              {(access.share.can_view_ai_summary || access.share.can_view_ai_tasks || access.share.can_use_ai_chat) ? (
                <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
                  <h2 style={sectionTitle}>AI review assistant</h2>
                  <p style={sectionCopy}>The assistant only answers from files and notes visible to this share link.</p>
                  {access.share.can_view_ai_summary && access.ai_summary ? (
                    <div style={{ ...emptyState, color: "#334155", marginTop: 10 }}>
                      {shareSummaryText(access.ai_summary)}
                      {shareSummaryItems(access.ai_summary, "missing_or_incomplete_items").length ? (
                        <div style={shareAttentionBox}>
                          <strong>Needs attention</strong>
                          <span>{shareSummaryItems(access.ai_summary, "missing_or_incomplete_items").slice(0, 2).map(describeShareAIItem).join(" ")}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {access.share.can_view_ai_tasks ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {(access.ai_tasks ?? []).length === 0 ? <div style={emptyState}>No approved to-dos for this share.</div> : (access.ai_tasks ?? []).map((task) => (
                        <div key={task.id} style={task.status === "completed" ? noteCard : shareTaskCard}>
                          <div style={noteAuthor}>{task.title}</div>
                          <div style={noteDate}>{task.status}</div>
                          <p style={noteText}>{task.instructions}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {access.share.can_use_ai_chat ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      <div style={{ display: "grid", gap: 8, maxHeight: 190, overflowY: "auto" }}>
                        {aiMessages.length === 0 ? <div style={emptyState}>Ask a question or suggest a required follow-up. Suggestions go to Qualified Commercial for approval.</div> : aiMessages.slice(-6).map((message) => (
                          <div key={message.id} style={message.role === "assistant" ? aiBubble : aiBubbleUser}>{message.content}</div>
                        ))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                        <input
                          style={chatInput}
                          value={aiText}
                          onChange={(e) => setAiText(e.target.value)}
                          placeholder="Ask about shared files..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter") sendAIMessage().catch(() => undefined);
                          }}
                        />
                        <button style={secondaryButton} onClick={() => sendAIMessage().catch(() => undefined)} disabled={aiBusy || !aiText.trim()}>Send</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
          {status ? <p style={statusStyle(status)}>{status}</p> : null}
        </section>
      )}

      {reviewFile ? (
        <BucketFileReviewPanel
          title="Shared file review"
          onDownload={access?.share.can_download ? () => downloadSharedFile(reviewFile).catch(() => setStatus("Download is not available for this file.")) : undefined}
          loadReview={() => loadSharedReview(reviewFile)}
          saveAnnotation={(payload) => saveSharedAnnotation(reviewFile, payload)}
          onClose={() => setReviewFile(null)}
        />
      ) : null}
    </main>
  );
}

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div style={brandBlock}>
      <QCMark size={compact ? 34 : 44} />
      <div>
        <div style={brandEyebrow}>Qualified Commercial</div>
        <div style={brandName}>Secure File Room</div>
      </div>
    </div>
  );
}

function fileExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.slice(0, 4).toUpperCase();
  return ext && ext !== fileName.toUpperCase() ? ext : "FILE";
}

function fileKindLabel(file: FileRow): string {
  const type = reviewFileType(file.content_type, file.file_name);
  if (type === "pdf") return "PDF document";
  if (type === "image") return "Image";
  if (type === "csv") return "CSV data";
  if (type === "text") return "Text document";
  if (type === "spreadsheet") return "Spreadsheet";
  return "File";
}

function reviewFileType(contentType: string, fileName: string): "pdf" | "image" | "csv" | "text" | "spreadsheet" | "unsupported" {
  const lower = `${contentType} ${fileName}`.toLowerCase();
  if (lower.includes("application/pdf") || lower.endsWith(".pdf")) return "pdf";
  if (lower.includes("image/") || /\.(png|jpe?g|webp|gif)$/i.test(fileName)) return "image";
  if (lower.includes("text/csv") || lower.endsWith(".csv")) return "csv";
  if (lower.includes("text/") || /\.(txt|md|log)$/i.test(fileName)) return "text";
  if (/\.(xlsx?|xlsm)$/i.test(fileName) || lower.includes("spreadsheet")) return "spreadsheet";
  return "unsupported";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusStyle(value: string): CSSProperties {
  const isError = /invalid|unavailable|could not|disabled/i.test(value);
  return { margin: "14px 0 0", color: isError ? "#b91c1c" : "#0f766e", fontWeight: 800 };
}

function shareSummaryText(summary: Record<string, unknown>): string {
  if (typeof summary.summary === "string") return summary.summary;
  const perFile = Array.isArray(summary.per_file_summaries) ? summary.per_file_summaries : [];
  if (perFile.length) return `${perFile.length} shared file${perFile.length === 1 ? "" : "s"} have AI review notes.`;
  return "AI summary is available for the files shared with you.";
}

function shareSummaryItems(summary: Record<string, unknown>, key: string): unknown[] {
  const value = summary[key];
  return Array.isArray(value) ? value : [];
}

function describeShareAIItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return String(item ?? "");
  const row = item as Record<string, unknown>;
  const parts = [
    typeof row.title === "string" ? row.title : "",
    typeof row.file_name === "string" ? row.file_name : "",
    typeof row.detail === "string" ? row.detail : "",
    typeof row.summary === "string" ? row.summary : "",
    typeof row.explanation === "string" ? row.explanation : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : JSON.stringify(row);
}

const page: CSSProperties = { minHeight: "100vh", background: "#f3f5f8", color: "#111827", padding: 24, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" };
const gateShell: CSSProperties = { maxWidth: 760, margin: "6vh auto 0", display: "grid", gap: 18 };
const gateCard: CSSProperties = { background: "#fff", border: "1px solid #d8dee8", borderRadius: 12, padding: 28, boxShadow: "0 18px 45px rgba(15,23,42,.08)" };
const brandBlock: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const brandEyebrow: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const brandName: CSSProperties = { color: "#111827", fontSize: 16, fontWeight: 900, lineHeight: 1.2 };
const securePill: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #bfdbfe", borderRadius: 999, padding: "6px 10px", color: "#1e3a8a", background: "#eff6ff", fontSize: 12, fontWeight: 900 };
const gateTitle: CSSProperties = { margin: "16px 0 8px", fontSize: 34, lineHeight: 1.08, letterSpacing: 0 };
const gateCopy: CSSProperties = { margin: 0, color: "#475569", fontSize: 16, lineHeight: 1.5 };
const callout: CSSProperties = { display: "flex", gap: 9, alignItems: "center", border: "1px solid #ccfbf1", background: "#f0fdfa", color: "#0f766e", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 750, marginTop: 18 };
const gateForm: CSSProperties = { display: "grid", gap: 10, maxWidth: 440, marginTop: 20 };
const label: CSSProperties = { color: "#334155", fontSize: 13, fontWeight: 850 };
const accessInput: CSSProperties = { height: 50, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 13px", font: "inherit", fontSize: 17, background: "#fff" };
const primaryButton: CSSProperties = { height: 44, border: "none", borderRadius: 9, padding: "0 14px", font: "inherit", fontWeight: 900, background: "#111827", color: "#fff", cursor: "pointer" };
const roomShell: CSSProperties = { maxWidth: 1320, margin: "0 auto", display: "grid", gap: 14 };
const roomHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", background: "#fff", border: "1px solid #d8dee8", borderRadius: 12, padding: 18, boxShadow: "0 10px 28px rgba(15,23,42,.06)" };
const roomTitle: CSSProperties = { margin: "12px 0 4px", fontSize: 28, lineHeight: 1.12, letterSpacing: 0 };
const roomMeta: CSSProperties = { margin: 0, color: "#64748b", lineHeight: 1.45 };
const summaryCard: CSSProperties = { minWidth: 116, border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, textAlign: "center", background: "#f8fafc" };
const summaryNumber: CSSProperties = { display: "block", color: "#111827", fontSize: 28, fontWeight: 950, lineHeight: 1 };
const summaryLabel: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 850, textTransform: "uppercase" };
const securityBar: CSSProperties = { display: "flex", alignItems: "center", gap: 10, border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 12px", color: "#1e3a8a", background: "#eff6ff", fontSize: 13.5, fontWeight: 750 };
const roomGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 14, alignItems: "start" };
const filePanel: CSSProperties = { minWidth: 0, background: "#fff", border: "1px solid #d8dee8", borderRadius: 12, padding: 16, boxShadow: "0 10px 28px rgba(15,23,42,.05)" };
const notesPanel: CSSProperties = { minWidth: 0, background: "#fff", border: "1px solid #d8dee8", borderRadius: 12, padding: 16, boxShadow: "0 10px 28px rgba(15,23,42,.05)", position: "sticky", top: 16 };
const sectionHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const sectionTitle: CSSProperties = { margin: 0, color: "#111827", fontSize: 17, fontWeight: 950 };
const sectionCopy: CSSProperties = { margin: "4px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.4 };
const fileList: CSSProperties = { display: "grid", gap: 10 };
const fileCard: CSSProperties = { display: "grid", gridTemplateColumns: "54px minmax(0, 1fr)", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#fff" };
const fileName: CSSProperties = { margin: 0, color: "#111827", fontSize: 16, fontWeight: 900, lineHeight: 1.25, overflowWrap: "anywhere" };
const fileMeta: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "6px 10px", color: "#64748b", fontSize: 12.5, marginTop: 5 };
const fileActions: CSSProperties = { gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-start", flexWrap: "wrap" };
const secondaryButton: CSSProperties = { height: 38, border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 12px", font: "inherit", fontWeight: 900, background: "#fff", color: "#111827", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 };
const primaryLinkButton: CSSProperties = { ...primaryButton, height: 38, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none" };
const downloadDisabled: CSSProperties = { color: "#64748b", fontSize: 12.5, fontWeight: 800 };
const noteComposer: CSSProperties = { display: "grid", gap: 8, marginBottom: 12 };
const noteField: CSSProperties = { minHeight: 96, border: "1px solid #cbd5e1", borderRadius: 9, padding: 10, font: "inherit", resize: "vertical", boxSizing: "border-box" };
const noteList: CSSProperties = { display: "grid", gap: 8 };
const noteCard: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, background: "#fbfdff" };
const shareTaskCard: CSSProperties = { border: "1px solid #fca5a5", borderRadius: 10, padding: 10, background: "#fff1f2" };
const shareAttentionBox: CSSProperties = { display: "grid", gap: 4, borderTop: "1px solid #fecaca", marginTop: 10, paddingTop: 10, color: "#991b1b", lineHeight: 1.4 };
const noteAuthor: CSSProperties = { color: "#111827", fontWeight: 900, fontSize: 13 };
const noteDate: CSSProperties = { color: "#64748b", fontSize: 12, marginTop: 2 };
const noteText: CSSProperties = { margin: "8px 0 0", color: "#334155", lineHeight: 1.45, whiteSpace: "pre-wrap" };
const emptyState: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 10, padding: 13, color: "#64748b", background: "#f8fafc", fontSize: 13 };
const chatInput: CSSProperties = { height: 38, border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 10px", font: "inherit", minWidth: 0, boxSizing: "border-box" };
const aiBubble: CSSProperties = { border: "1px solid #dbeafe", background: "#eff6ff", color: "#1e3a8a", borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap" };
const aiBubbleUser: CSSProperties = { border: "1px solid #e2e8f0", background: "#fff", color: "#334155", borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap" };

function fileIcon(file: FileRow): CSSProperties {
  const type = reviewFileType(file.content_type, file.file_name);
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    pdf: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
    image: { bg: "#eff6ff", color: "#1e3a8a", border: "#bfdbfe" },
    csv: { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
    text: { bg: "#f8fafc", color: "#334155", border: "#e2e8f0" },
    spreadsheet: { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" },
    unsupported: { bg: "#f8fafc", color: "#334155", border: "#e2e8f0" },
  };
  const palette = colors[type];
  return { width: 54, height: 54, border: `1px solid ${palette.border}`, borderRadius: 10, background: palette.bg, color: palette.color, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 950 };
}
