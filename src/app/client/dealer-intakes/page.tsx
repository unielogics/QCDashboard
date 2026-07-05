"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";

type Intake = {
  id: string;
  status: string;
  full_name: string;
  email: string;
  business_name?: string | null;
  loan_purpose?: string | null;
  result_snapshot?: Record<string, unknown> | null;
  updated_at: string;
};

type RequestedDoc = { id: string; name: string; category?: string | null; required: boolean; status: string };
type UploadedFile = { id: string; requested_document_id?: string | null; file_name: string; size_bytes: number; status: string; created_at: string };
type IntakeDetail = { intake: Intake; requested_documents: RequestedDoc[]; files: UploadedFile[]; assistant_message: string; ai_summary?: Record<string, unknown> | null };
type QueuedFile = { id: string; file: File; requestedDocumentId: string; status: "ready" | "uploading" | "uploaded" | "error"; message?: string };

export default function ClientDealerIntakesPage() {
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<Intake[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<IntakeDetail | null>(null);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [chatText, setChatText] = useState("");
  const [messages, setMessages] = useState<{ role: "assistant" | "user"; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Loading dealer intakes...");

  useEffect(() => {
    loadRows().catch((error) => setNotice(errorMessage(error)));
  }, []);

  async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadRows() {
    const data = await authed<Intake[]>("/buckets/client/intakes");
    setRows(data);
    setNotice(data.length ? "" : "No dealer AI intakes are linked to this account yet.");
    if (data[0] && !selectedId) await openIntake(data[0].id);
  }

  async function openIntake(id: string) {
    setSelectedId(id);
    const data = await authed<IntakeDetail>(`/buckets/client/intakes/${id}`);
    setDetail(data);
    setMessages([{ role: "assistant", content: data.assistant_message }]);
  }

  async function uploadQueued() {
    if (!detail) return;
    setBusy(true);
    setNotice("Uploading files...");
    try {
      for (const item of queuedFiles.filter((file) => file.status === "ready" || file.status === "error")) {
        setQueuedFiles((current) => current.map((file) => (file.id === item.id ? { ...file, status: "uploading", message: "Preparing upload" } : file)));
        try {
          const init = await authed<{ file_id: string; upload_url: string; required_headers: Record<string, string> }>(
            `/buckets/client/intakes/${detail.intake.id}/files/upload-init`,
            {
              method: "POST",
              body: JSON.stringify({
                requested_document_id: item.requestedDocumentId || null,
                file_name: item.file.name,
                content_type: item.file.type || "application/octet-stream",
                size_bytes: item.file.size,
              }),
            },
          );
          const put = await fetch(init.upload_url, { method: "PUT", body: item.file, headers: init.required_headers });
          if (!put.ok) throw new Error(`Secure storage rejected ${item.file.name}.`);
          await authed(`/buckets/client/intakes/${detail.intake.id}/files/complete`, {
            method: "POST",
            body: JSON.stringify({ file_id: init.file_id }),
          });
          setQueuedFiles((current) => current.map((file) => (file.id === item.id ? { ...file, status: "uploaded", message: "Uploaded" } : file)));
        } catch (error) {
          setQueuedFiles((current) => current.map((file) => (file.id === item.id ? { ...file, status: "error", message: errorMessage(error) } : file)));
        }
      }
      await openIntake(detail.intake.id);
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    if (!detail || !chatText.trim()) return;
    const text = chatText.trim();
    setMessages((current) => [...current, { role: "user", content: text }]);
    setChatText("");
    setBusy(true);
    try {
      const data = await authed<IntakeDetail>(`/buckets/client/intakes/${detail.intake.id}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setDetail(data);
      setMessages((current) => [...current, { role: "assistant", content: data.assistant_message }]);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function addFiles(files: FileList | null) {
    if (!files || !detail) return;
    const defaultDocId = missingDocs(detail)[0]?.id || detail.requested_documents[0]?.id || "";
    setQueuedFiles((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        requestedDocumentId: defaultDocId,
        status: "ready" as const,
      })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <main style={page}>
      <header style={header}>
        <div>
          <div style={eyebrow}>Client continuation</div>
          <h1 style={title}>Dealer AI intakes</h1>
          <p style={muted}>Continue uploading documents and ask questions about your active dealer financing screen.</p>
        </div>
      </header>
      <div style={grid}>
        <aside style={panel}>
          <h2 style={sectionTitle}>Your intakes</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {rows.map((row) => (
              <button key={row.id} style={selectedId === row.id ? activeRow : rowButton} onClick={() => openIntake(row.id).catch((error) => setNotice(errorMessage(error)))}>
                <strong>{row.business_name || row.full_name}</strong>
                <span>{row.status} | {new Date(row.updated_at).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </aside>
        <section style={panel}>
          {detail ? (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={summary}>
                <div>
                  <h2 style={sectionTitle}>{detail.intake.business_name || detail.intake.full_name}</h2>
                  <p style={muted}>{detail.files.length} uploaded | {missingDocs(detail).length} missing</p>
                </div>
                <span style={statusPill}>{detail.intake.status}</span>
              </div>
              <div style={twoCol}>
                <div style={box}>
                  <h3 style={smallTitle}>Required documents</h3>
                  {detail.requested_documents.map((doc) => (
                    <div key={doc.id} style={docRow}>
                      <span>{doc.name}</span>
                      <strong>{doc.status === "uploaded" ? "Uploaded" : "Needed"}</strong>
                    </div>
                  ))}
                </div>
                <div style={box}>
                  <h3 style={smallTitle}>Upload more files</h3>
                  <input ref={fileInputRef} type="file" multiple onChange={(event) => addFiles(event.target.files)} />
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {queuedFiles.map((item) => (
                      <div key={item.id} style={fileRow}>
                        <span>{item.file.name}</span>
                        <select value={item.requestedDocumentId} onChange={(event) => setQueuedFiles(queuedFiles.map((file) => (file.id === item.id ? { ...file, requestedDocumentId: event.target.value } : file)))}>
                          <option value="">Unmatched</option>
                          {detail.requested_documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
                        </select>
                        <small>{item.message || item.status}</small>
                      </div>
                    ))}
                  </div>
                  <button style={primary} disabled={busy || !queuedFiles.length} onClick={() => uploadQueued().catch((error) => setNotice(errorMessage(error)))}>
                    Upload files
                  </button>
                </div>
              </div>
              <div style={box}>
                <h3 style={smallTitle}>Ask AI</h3>
                <div style={messagesBox}>
                  {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} style={message.role === "assistant" ? assistant : userBubble}>{message.content}</div>
                  ))}
                </div>
                <div style={composer}>
                  <input style={input} value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Ask what is still needed..." />
                  <button style={primary} disabled={busy || !chatText.trim()} onClick={() => sendChat().catch((error) => setNotice(errorMessage(error)))}>
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={box}>{notice}</div>
          )}
          {notice && detail ? <div style={noticeBox}>{notice}</div> : null}
        </section>
      </div>
    </main>
  );
}

function missingDocs(detail: IntakeDetail): RequestedDoc[] {
  const uploaded = new Set(detail.files.map((file) => file.requested_document_id).filter(Boolean));
  return detail.requested_documents.filter((doc) => doc.required && !uploaded.has(doc.id));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

const page: CSSProperties = { padding: 32, minHeight: "100vh", background: "#f3f6fb", color: "#0f172a" };
const header: CSSProperties = { maxWidth: 1320, margin: "0 auto 18px" };
const eyebrow: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 900, letterSpacing: 0, textTransform: "uppercase" };
const title: CSSProperties = { margin: "4px 0", fontSize: 34, letterSpacing: 0 };
const muted: CSSProperties = { margin: 0, color: "#64748b" };
const grid: CSSProperties = { maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 16, alignItems: "start" };
const panel: CSSProperties = { background: "#fff", border: "1px solid #dbe3ef", borderRadius: 18, padding: 18, boxShadow: "0 18px 50px rgba(15,23,42,.06)" };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 20 };
const rowButton: CSSProperties = { border: "1px solid #e2e8f0", background: "#fff", borderRadius: 12, padding: 12, display: "grid", gap: 4, textAlign: "left", cursor: "pointer", color: "#0f172a" };
const activeRow: CSSProperties = { ...rowButton, borderColor: "#18A89F", background: "#ecfffb" };
const summary: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
const statusPill: CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 999, padding: "8px 12px", fontWeight: 800, color: "#334155" };
const twoCol: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const box: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 14, padding: 14, background: "#f8fafc", display: "grid", gap: 10 };
const smallTitle: CSSProperties = { margin: 0, fontSize: 15 };
const docRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #e2e8f0", padding: "8px 0" };
const fileRow: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px auto", gap: 8, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8, background: "#fff" };
const primary: CSSProperties = { border: 0, borderRadius: 999, minHeight: 40, padding: "0 16px", background: "#0f172a", color: "#fff", fontWeight: 900, cursor: "pointer" };
const messagesBox: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" };
const assistant: CSSProperties = { alignSelf: "flex-start", maxWidth: "80%", border: "1px solid #cfe3ff", background: "#eef6ff", color: "#17324d", borderRadius: 14, padding: 12, lineHeight: 1.4 };
const userBubble: CSSProperties = { alignSelf: "flex-end", maxWidth: "80%", background: "#0f172a", color: "#fff", borderRadius: 14, padding: 12, lineHeight: 1.4 };
const composer: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 8 };
const input: CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 999, padding: "0 14px", minHeight: 40, outline: "none" };
const noticeBox: CSSProperties = { border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 12, padding: 12, marginTop: 12 };
