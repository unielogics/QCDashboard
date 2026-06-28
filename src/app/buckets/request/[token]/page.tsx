"use client";

import type { CSSProperties, DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { QCMark } from "@/components/QCMark";
import { apiBase } from "@/lib/api";

type RequestedDoc = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  required: boolean;
  allow_multiple_files?: boolean;
  status: string;
};
type BucketSummary = { name: string; client_name?: string | null; purpose?: string | null };
type RequestInfo = {
  bucket: BucketSummary;
  recipient_name: string;
  recipient_email?: string | null;
  requires_passcode: boolean;
  status: string;
};
type UploadSession = {
  bucket: BucketSummary;
  recipient_name: string;
  recipient_email?: string | null;
  allow_notes: boolean;
  can_use_ai_chat?: boolean;
  can_view_ai_tasks?: boolean;
  requested_documents: RequestedDoc[];
};
type AITask = { id: string; status: string; title: string; instructions: string; rationale?: string | null };
type AIMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type QueuedFile = {
  id: string;
  file: File;
  requestedDocumentId: string;
  status: "ready" | "uploading" | "uploaded" | "error";
  message?: string;
};

export default function BucketRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submitInFlightRef = useRef(false);
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [session, setSession] = useState<UploadSession | null>(null);
  const [passcode, setPasscode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [noteSubmitted, setNoteSubmitted] = useState(false);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [status, setStatus] = useState("Loading invite...");
  const [isAccessing, setIsAccessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [aiTasks, setAiTasks] = useState<AITask[]>([]);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/v1/buckets/request/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("This upload invite is unavailable."))))
      .then((data: RequestInfo) => {
        setInfo(data);
        setStatus("");
      })
      .catch((e: Error) => setStatus(e.message));
  }, [token]);

  const canSubmit = useMemo(() => {
    const pending = files.filter((item) => item.status !== "uploaded");
    return Boolean(
      session &&
      name.trim() &&
      pending.length > 0 &&
      pending.every((item) => item.status === "ready" || item.status === "error") &&
      !hasDuplicateSingleUseDocs(files, session.requested_documents),
    );
  }, [files, name, session]);

  async function openInvite() {
    if (!passcode.trim()) return;
    setIsAccessing(true);
    setStatus("");
    try {
      const res = await fetch(`${apiBase}/api/v1/buckets/request/${token}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      if (!res.ok) throw new Error(await responseMessage(res, "The access code did not work."));
      const data = (await res.json()) as UploadSession;
      setSession(data);
      setName(data.recipient_name || "");
      setEmail(data.recipient_email || "");
      setStatus("");
      if (data.can_view_ai_tasks) loadAITasks().catch(() => undefined);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "The access code did not work.");
    } finally {
      setIsAccessing(false);
    }
  }

  async function loadAITasks() {
    const res = await fetch(`${apiBase}/api/v1/buckets/request/${token}/ai-tasks?passcode=${encodeURIComponent(passcode.trim())}`);
    if (res.ok) setAiTasks(await res.json());
  }

  async function sendAIMessage() {
    if (!session || !aiText.trim()) return;
    const text = aiText.trim();
    setAiText("");
    setAiBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/buckets/request/${token}/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim(), message: text }),
      });
      if (!res.ok) throw new Error(await responseMessage(res, "AI chat is unavailable."));
      const payload = (await res.json()) as { messages: AIMessage[] };
      setAiMessages((current) => [...current, ...payload.messages]);
      if (session.can_view_ai_tasks) await loadAITasks();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "AI chat is unavailable.");
    } finally {
      setAiBusy(false);
    }
  }

  function addFiles(nextFiles: FileList | File[]) {
    setFiles((current) => {
      const seen = new Set(current.map((item) => localFileKey(item.file)));
      const incoming = Array.from(nextFiles)
        .filter((file) => {
          const key = localFileKey(file);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          file,
          requestedDocumentId: "",
          status: "ready" as const,
        }));
      return [...current, ...incoming];
    });
    setStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id));
  }

  function updateFileDoc(id: string, requestedDocumentId: string) {
    setFiles((current) => current.map((item) => (item.id === id ? { ...item, requestedDocumentId, status: "ready", message: undefined } : item)));
  }

  function linkedCount(docId: string) {
    return files.filter((item) => item.requestedDocumentId === docId && item.status !== "error").length;
  }

  function updateFileState(id: string, patch: Partial<QueuedFile>) {
    setFiles((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }

  async function submitDocuments() {
    if (!session || !canSubmit || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setIsUploading(true);
    setStatus("Submitting documents...");
    let noteSaved = noteSubmitted;
    let uploadedCount = 0;
    let failedCount = 0;
    try {
      for (const item of files.filter((queued) => queued.status !== "uploaded")) {
        try {
          updateFileState(item.id, { status: "uploading", message: "Preparing secure upload" });
          const init = await fetch(`${apiBase}/api/v1/buckets/request/${token}/upload-init`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requested_document_id: item.requestedDocumentId || null,
              file_name: item.file.name,
              content_type: item.file.type || "application/octet-stream",
              size_bytes: item.file.size,
              uploader_name: name.trim(),
              uploader_email: email.trim() || null,
              passcode: passcode.trim(),
            }),
          });
          if (!init.ok) throw new Error(await responseMessage(init, `Could not start upload for ${item.file.name}.`));
          const payload = (await init.json()) as { file_id: string; upload_url: string; required_headers: Record<string, string> };
          updateFileState(item.id, { message: "Uploading to secure storage" });
          const put = await fetch(payload.upload_url, { method: "PUT", body: item.file, headers: payload.required_headers });
          if (!put.ok) throw new Error(`Secure storage rejected ${item.file.name} (${put.status}).`);
          updateFileState(item.id, { message: "Confirming upload" });
          const done = await fetch(`${apiBase}/api/v1/buckets/request/${token}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_id: payload.file_id, note: !noteSaved ? note.trim() || null : null }),
          });
          if (!done.ok) throw new Error(await responseMessage(done, `Could not confirm ${item.file.name}.`));
          if (!noteSaved && note.trim()) {
            noteSaved = true;
            setNoteSubmitted(true);
          }
          uploadedCount += 1;
          updateFileState(item.id, { status: "uploaded", message: "Submitted" });
        } catch (e) {
          failedCount += 1;
          const message = e instanceof Error ? e.message : "Upload failed.";
          updateFileState(item.id, { status: "error", message });
        }
      }
      if (uploadedCount > 0 && failedCount === 0) {
        setStatus("Documents submitted. Qualified Commercial has received this upload.");
        setNote("");
        setNoteSubmitted(false);
      } else if (uploadedCount > 0) {
        setStatus(`${uploadedCount} document${uploadedCount === 1 ? "" : "s"} submitted. ${failedCount} file${failedCount === 1 ? "" : "s"} need retry.`);
        if (noteSaved) setNote("");
      } else {
        setStatus("No documents uploaded. Review the failed file messages and try again.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed.";
      setStatus(message);
      setFiles((current) => current.map((item) => (item.status === "uploading" ? { ...item, status: "error", message } : item)));
    } finally {
      submitInFlightRef.current = false;
      setIsUploading(false);
    }
  }

  return (
    <main style={page}>
      {!session ? (
        <section style={gateCard}>
          <BrandHeader />
          <h1 style={gateTitle}>Welcome{info?.recipient_name ? `, ${info.recipient_name}` : ""}</h1>
          <p style={gateCopy}>
            {info ? (
              <>
                Enter your access code to open the secure upload room for <strong>{info.bucket.name}</strong>.
              </>
            ) : (
              "Opening your secure upload invite."
            )}
          </p>
          {info && !info.requires_passcode ? (
            <div style={errorBox}>This upload invite must be regenerated with an access code. Ask Qualified Commercial for a new invite.</div>
          ) : null}
          <div style={gateForm}>
            <label style={label} htmlFor="passcode">Access code</label>
            <input
              id="passcode"
              style={accessInput}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openInvite().catch(() => undefined);
              }}
              placeholder="Enter access code"
              autoComplete="one-time-code"
              disabled={!info || !info.requires_passcode || isAccessing}
            />
            <button style={primaryButton} onClick={() => openInvite().catch(() => undefined)} disabled={!info || !info.requires_passcode || !passcode.trim() || isAccessing}>
              {isAccessing ? "Checking code..." : "Open upload room"}
            </button>
          </div>
          {status ? <p style={status.includes("did not") || status.includes("unavailable") ? errorText : statusText}>{status}</p> : null}
        </section>
      ) : (
        <section style={workspace}>
          <header style={header}>
            <div>
              <BrandHeader eyebrow="Secure Document Upload" />
              <h1 style={title}>{session.bucket.name}</h1>
              <p style={muted}>Upload invite for <strong>{session.recipient_name}</strong>{session.bucket.purpose ? ` - ${session.bucket.purpose}` : ""}</p>
            </div>
            <div style={summaryPill}>{files.filter((item) => item.status === "uploaded").length} of {files.length} submitted</div>
          </header>
          <div style={securityNotice}>
            <strong>Encrypted upload room.</strong> Uploaded documents are encrypted. Access to view these documents is gated and regulated through authorized user controls.
          </div>

          <div style={contentGrid}>
            <div style={mainPanel}>
              <div style={identityGrid}>
                <div>
                  <label style={label} htmlFor="uploader-name">Your name</label>
                  <input id="uploader-name" style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
                </div>
                <div>
                  <label style={label} htmlFor="uploader-email">Email optional</label>
                  <input id="uploader-email" style={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                </div>
              </div>

              <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
              <div
                style={{ ...dropZone, ...(isDragging ? dropZoneActive : {}) }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
              >
                <div style={dropTitle}>Add files</div>
                <div style={dropCopy}>Drag documents here or choose files from your computer.</div>
              </div>

              <div style={queueHeader}>
                <h2 style={sectionTitle}>Selected files</h2>
                <span style={muted}>Remove files here before submitting. Submitted files are locked.</span>
              </div>
              <div style={queue}>
                {files.length === 0 ? (
                  <div style={emptyState}>No files selected yet.</div>
                ) : files.map((item) => (
                  <div key={item.id} style={fileRow}>
                    <div style={fileMeta}>
                      <strong>{item.file.name}</strong>
                      <span style={muted}>{formatSize(item.file.size)} - {statusLabel(item.status, item.message)}</span>
                    </div>
                    <select
                      style={select}
                      value={item.requestedDocumentId}
                      onChange={(e) => updateFileDoc(item.id, e.target.value)}
                      disabled={isUploading || item.status === "uploaded"}
                      aria-label={`What is this document? ${item.file.name}`}
                    >
                      <option value="">General upload</option>
                      {session.requested_documents.map((doc) => {
                        const linkedByOtherFile = files.some((file) => file.id !== item.id && file.requestedDocumentId === doc.id && file.status !== "error");
                        const disabled = !allowsMultipleFiles(doc) && linkedByOtherFile;
                        return <option key={doc.id} value={doc.id} disabled={disabled}>{doc.name}{disabled ? " - already linked" : ""}</option>;
                      })}
                    </select>
                    {item.status === "uploaded" ? (
                      <span style={submittedBadge}>Submitted</span>
                    ) : (
                      <button style={removeButton} onClick={() => removeFile(item.id)} disabled={isUploading} aria-label={`Remove ${item.file.name}`}>Remove</button>
                    )}
                  </div>
                ))}
              </div>

              <button style={{ ...primaryButton, width: "100%", marginTop: 16 }} onClick={() => submitDocuments().catch(() => undefined)} disabled={!canSubmit || isUploading}>
                {isUploading ? "Submitting documents..." : "Submit documents"}
              </button>
              {status ? <p style={isUploadErrorStatus(status) ? errorText : statusText}>{status}</p> : null}
            </div>

            <aside style={sidePanel}>
              <section style={sideSection}>
                <h2 style={sectionTitle}>Requested documents</h2>
                <div style={docList}>
                  {session.requested_documents.length === 0 ? (
                    <div style={emptyState}>No requested documents were added to this bucket.</div>
                  ) : session.requested_documents.map((doc) => {
                    const count = linkedCount(doc.id);
                    const linked = count > 0 || doc.status === "uploaded";
                    return (
                    <div key={doc.id} style={{ ...docItem, ...(linked ? docItemLinked : {}) }}>
                      <div style={docTitleRow}>
                        <span>{doc.name}</span>
                        <span style={linked ? checkBadge : openBadge}>{linked ? "Checked" : "Open"}</span>
                      </div>
                      <small style={muted}>
                        {doc.required ? "Required" : "Optional"} - {allowsMultipleFiles(doc) ? "multiple files allowed" : "one file"}{count ? ` - ${count} linked` : ""}
                      </small>
                      {doc.description ? <small style={docDescription}>{doc.description}</small> : null}
                    </div>
                    );
                  })}
                </div>
              </section>
              {session.allow_notes ? (
                <section style={sideSection}>
                  <h2 style={sectionTitle}>Notes</h2>
                  <textarea style={notesField} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add one note for this upload batch." />
                </section>
              ) : null}
              {(session.can_use_ai_chat || session.can_view_ai_tasks) ? (
                <section style={sideSection}>
                  <h2 style={sectionTitle}>AI instructions</h2>
                  <p style={{ ...muted, marginTop: 6, lineHeight: 1.4 }}>This assistant only sees your upload request, approved to-dos, and document status.</p>
                  {session.can_view_ai_tasks ? (
                    <div style={docList}>
                      {aiTasks.length === 0 ? <div style={emptyState}>No approved to-dos yet.</div> : aiTasks.map((task) => (
                        <div key={task.id} style={docItem}>
                          <div style={docTitleRow}><span>{task.title}</span><span style={checkBadge}>{task.status}</span></div>
                          <small style={docDescription}>{task.instructions}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {session.can_use_ai_chat ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      <div style={{ display: "grid", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                        {aiMessages.length === 0 ? <div style={emptyState}>Ask what is still needed or how to upload a document.</div> : aiMessages.slice(-6).map((message) => (
                          <div key={message.id} style={message.role === "assistant" ? aiBubble : aiBubbleUser}>
                            {message.content}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                        <input
                          style={field}
                          value={aiText}
                          onChange={(e) => setAiText(e.target.value)}
                          placeholder="Ask for help..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter") sendAIMessage().catch(() => undefined);
                          }}
                        />
                        <button style={removeButton} onClick={() => sendAIMessage().catch(() => undefined)} disabled={aiBusy || !aiText.trim()}>Send</button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </aside>
          </div>
        </section>
      )}
    </main>
  );
}

function BrandHeader({ eyebrow = "Qualified Commercial" }: { eyebrow?: string }) {
  return (
    <div style={brandHeader}>
      <QCMark size={34} />
      <div>
        <div style={brand}>{eyebrow}</div>
        <div style={brandName}>Qualified Commercial</div>
      </div>
    </div>
  );
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    return typeof payload.detail === "string" ? payload.detail : fallback;
  } catch {
    return fallback;
  }
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function localFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function statusLabel(status: QueuedFile["status"], message?: string): string {
  if (message) return message;
  if (status === "uploaded") return "Submitted";
  if (status === "uploading") return "Uploading";
  if (status === "error") return "Needs retry";
  return "Ready";
}

function isUploadErrorStatus(value: string): boolean {
  return value.includes("failed") || value.includes("Could not") || value.includes("rejected") || value.includes("need retry") || value.includes("No documents uploaded");
}

function allowsMultipleFiles(doc: RequestedDoc): boolean {
  if (typeof doc.allow_multiple_files === "boolean") return doc.allow_multiple_files;
  const name = doc.name.toLowerCase();
  return name.includes("bank statement") || name.includes("tax return") || name.includes("irs");
}

function hasDuplicateSingleUseDocs(files: QueuedFile[], docs: RequestedDoc[]): boolean {
  const singleUseDocIds = new Set(docs.filter((doc) => !allowsMultipleFiles(doc)).map((doc) => doc.id));
  const counts = new Map<string, number>();
  for (const file of files) {
    if (!file.requestedDocumentId || file.status === "error" || !singleUseDocIds.has(file.requestedDocumentId)) continue;
    counts.set(file.requestedDocumentId, (counts.get(file.requestedDocumentId) ?? 0) + 1);
  }
  return Array.from(counts.values()).some((count) => count > 1);
}

const page: CSSProperties = { minHeight: "100vh", background: "#f4f6f8", color: "#111827", padding: 24, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" };
const gateCard: CSSProperties = { maxWidth: 560, margin: "8vh auto 0", background: "#fff", border: "1px solid #d8dee8", borderRadius: 14, padding: 28, boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" };
const brandHeader: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const brand: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: 0, textTransform: "uppercase" };
const brandName: CSSProperties = { color: "#111827", fontSize: 15, fontWeight: 900, lineHeight: 1.2 };
const gateTitle: CSSProperties = { margin: "14px 0 8px", fontSize: 32, lineHeight: 1.1, letterSpacing: 0 };
const gateCopy: CSSProperties = { margin: "0 0 20px", color: "#475569", fontSize: 16, lineHeight: 1.5 };
const gateForm: CSSProperties = { display: "grid", gap: 12 };
const label: CSSProperties = { display: "block", color: "#334155", fontSize: 13, fontWeight: 800, marginBottom: 6 };
const accessInput: CSSProperties = { height: 52, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 14px", font: "inherit", fontSize: 18, background: "#fff" };
const field: CSSProperties = { width: "100%", height: 44, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 12px", font: "inherit", background: "#fff", boxSizing: "border-box" };
const primaryButton: CSSProperties = { height: 48, border: "none", borderRadius: 10, padding: "0 16px", font: "inherit", fontWeight: 900, background: "#111827", color: "#fff", cursor: "pointer" };
const statusText: CSSProperties = { margin: "14px 0 0", color: "#0f766e", fontWeight: 800 };
const errorText: CSSProperties = { margin: "14px 0 0", color: "#b91c1c", fontWeight: 800 };
const errorBox: CSSProperties = { border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 10, padding: 12, marginBottom: 14, fontWeight: 700 };
const workspace: CSSProperties = { maxWidth: 1180, margin: "0 auto", background: "#fff", border: "1px solid #d8dee8", borderRadius: 16, padding: 24, boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", borderBottom: "1px solid #e5e7eb", paddingBottom: 18, marginBottom: 20 };
const title: CSSProperties = { margin: "8px 0 4px", fontSize: 30, lineHeight: 1.15, letterSpacing: 0 };
const muted: CSSProperties = { color: "#64748b" };
const summaryPill: CSSProperties = { border: "1px solid #d8dee8", borderRadius: 999, padding: "8px 12px", color: "#334155", fontWeight: 800, whiteSpace: "nowrap" };
const securityNotice: CSSProperties = { border: "1px solid #bfdbfe", borderRadius: 12, padding: "11px 13px", color: "#1e3a8a", background: "#eff6ff", fontSize: 13.5, lineHeight: 1.45, marginBottom: 18 };
const contentGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 20 };
const mainPanel: CSSProperties = { minWidth: 0 };
const identityGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, marginBottom: 16 };
const dropZone: CSSProperties = { border: "2px dashed #94a3b8", borderRadius: 14, padding: 28, textAlign: "center", background: "#f8fafc", cursor: "pointer", transition: "border-color .15s ease, background .15s ease" };
const dropZoneActive: CSSProperties = { borderColor: "#2563eb", background: "#eff6ff" };
const dropTitle: CSSProperties = { fontSize: 20, fontWeight: 900, marginBottom: 6 };
const dropCopy: CSSProperties = { color: "#64748b" };
const queueHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 10 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: 0 };
const queue: CSSProperties = { display: "grid", gap: 10 };
const emptyState: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, color: "#64748b", background: "#f8fafc" };
const fileRow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 };
const fileMeta: CSSProperties = { display: "grid", gap: 4, minWidth: 0 };
const select: CSSProperties = { height: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px", font: "inherit", background: "#fff", minWidth: 0 };
const removeButton: CSSProperties = { height: 38, border: "1px solid #d8dee8", borderRadius: 10, background: "#fff", color: "#334155", font: "inherit", fontWeight: 800, cursor: "pointer" };
const submittedBadge: CSSProperties = { height: 38, border: "1px solid #bbf7d0", borderRadius: 10, background: "#f0fdf4", color: "#166534", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13 };
const sidePanel: CSSProperties = { display: "grid", gap: 14, alignContent: "start" };
const sideSection: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "#fbfdff" };
const docList: CSSProperties = { display: "grid", gap: 10, marginTop: 12 };
const docItem: CSSProperties = { display: "grid", gap: 4, borderBottom: "1px solid #e5e7eb", paddingBottom: 10, fontWeight: 800 };
const docItemLinked: CSSProperties = { border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, background: "#f0fdf4" };
const docTitleRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
const docDescription: CSSProperties = { color: "#475569", fontWeight: 600, lineHeight: 1.4 };
const checkBadge: CSSProperties = { border: "1px solid #86efac", borderRadius: 999, padding: "3px 8px", color: "#166534", background: "#dcfce7", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" };
const openBadge: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 999, padding: "3px 8px", color: "#64748b", background: "#f8fafc", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" };
const notesField: CSSProperties = { width: "100%", minHeight: 160, border: "1px solid #cbd5e1", borderRadius: 10, padding: 12, font: "inherit", resize: "vertical", boxSizing: "border-box", marginTop: 12 };
const aiBubble: CSSProperties = { border: "1px solid #dbeafe", background: "#eff6ff", color: "#1e3a8a", borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap" };
const aiBubbleUser: CSSProperties = { border: "1px solid #e2e8f0", background: "#fff", color: "#334155", borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap" };
