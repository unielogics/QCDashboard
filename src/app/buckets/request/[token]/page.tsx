"use client";

import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { QCMark } from "@/components/QCMark";
import { RoomActions } from "@/components/room/RoomActions";
import { PrecallChecklist, type RoomPrecall } from "@/components/room/PrecallChecklist";
import { apiBase } from "@/lib/api";

type RequestedDoc = { id: string; name: string; category?: string | null; description?: string | null; required: boolean; allow_multiple_files?: boolean; status: string };
type BucketSummary = { name: string; client_name?: string | null; purpose?: string | null };
type UploadedFile = { id: string; requested_document_id?: string | null; file_name: string; content_type: string; size_bytes: number; uploaded_by_name?: string | null; uploaded_by_email?: string | null; status: string; created_at: string };
type RequestInfo = { bucket: BucketSummary; recipient_name: string; recipient_email?: string | null; requires_passcode: boolean; status: string };
type UploadSession = { bucket: BucketSummary; recipient_name: string; recipient_email?: string | null; allow_notes: boolean; requested_documents: RequestedDoc[]; files?: UploadedFile[] };
type RoomTab = "precall" | "todo" | "documents" | "banking" | "agreements";
type QueuedFile = { id: string; file: File; requestedDocumentId: string; status: "ready" | "uploading" | "uploaded" | "error"; message?: string };

const ROOM_TABS: Array<{ id: RoomTab; label: string; icon: "check" | "file" | "building" | "edit" | "cal" }> = [
  { id: "precall", label: "Before your call", icon: "cal" },
  { id: "todo", label: "To-do", icon: "check" },
  { id: "documents", label: "Documents", icon: "file" },
  { id: "banking", label: "Business banking", icon: "building" },
  { id: "agreements", label: "Agreements", icon: "edit" },
];

export default function BucketRequestPage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
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
  const [activeTab, setActiveTab] = useState<RoomTab>("documents");
  // Pre-call prep state for rooms opened by a booked call; null for every other room.
  const [precall, setPrecall] = useState<RoomPrecall | null>(null);
  const [precallLoaded, setPrecallLoaded] = useState(false);
  const [theme, setTheme] = useState<"light" | "obsidian">("light");

  useEffect(() => {
    const saved = window.localStorage.getItem("qc-application-room-theme");
    if (saved === "obsidian" || saved === "light") setTheme(saved);
  }, []);
  useEffect(() => {
    const requested = searchParams.get("tab");
    if (ROOM_TABS.some((tab) => tab.id === requested)) setActiveTab(requested as RoomTab);
  }, [searchParams]);
  useEffect(() => {
    // A PIN in the fragment (from the confirmation link) prefills the gate and
    // is dropped from the URL so it never lands in history or a shared link.
    const match = /(?:^#|&)p=(\d{6})(?:&|$)/.exec(window.location.hash || "");
    if (match) { setPasscode(match[1]); window.history.replaceState(null, "", window.location.pathname + window.location.search); }
  }, []);
  useEffect(() => {
    fetch(`${apiBase}/api/v1/buckets/request/${token}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("This application room is unavailable.")))
      .then((data: RequestInfo) => { setInfo(data); setStatus(""); })
      .catch((error: Error) => setStatus(error.message));
  }, [token]);

  const uploadedFiles = useMemo(() => session?.files ?? [], [session?.files]);
  const uploadedDocIds = useMemo(() => new Set(uploadedFiles.map((file) => file.requested_document_id).filter(Boolean) as string[]), [uploadedFiles]);
  const missingDocs = useMemo(() => (session?.requested_documents ?? []).filter((doc) => !isRequestedDocComplete(doc, uploadedDocIds)), [session?.requested_documents, uploadedDocIds]);
  const highlightedRequest = searchParams.get("request");
  const canSubmit = useMemo(() => {
    const pending = files.filter((item) => item.status !== "uploaded");
    return Boolean(session && name.trim() && pending.length > 0 && pending.every((item) => item.status === "ready" || item.status === "error") && !hasDuplicateSingleUseDocs(files, session.requested_documents));
  }, [files, name, session]);

  function chooseTheme(next: "light" | "obsidian") {
    setTheme(next);
    window.localStorage.setItem("qc-application-room-theme", next);
  }

  async function fetchAccessSession(): Promise<UploadSession> {
    const response = await fetch(`${apiBase}/api/v1/buckets/request/${token}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: passcode.trim() }) });
    if (!response.ok) throw new Error(await responseMessage(response, "The room PIN did not work."));
    return response.json();
  }
  async function fetchPrecall(code: string): Promise<RoomPrecall | null> {
    try {
      const response = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}/features`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      if (!response.ok) return null;
      const data = await response.json() as { precall?: RoomPrecall | null };
      return data.precall?.enabled ? data.precall : null;
    } catch { return null; }
  }
  async function refreshPrecall() { setPrecall(await fetchPrecall(passcode.trim())); }
  async function refreshRoom() { setSession(await fetchAccessSession()); await refreshPrecall(); }
  async function openInvite() {
    if (!passcode.trim()) return;
    setIsAccessing(true); setStatus("");
    try {
      const data = await fetchAccessSession();
      const prep = await fetchPrecall(passcode.trim());
      setSession(data); setName(data.recipient_name || ""); setEmail(data.recipient_email || ""); setStatus("");
      setPrecall(prep); setPrecallLoaded(true);
      // A booked call lands on its checklist until it is done; the URL still wins.
      if (prep && !prep.complete && !searchParams.get("tab")) setActiveTab("precall");
    } catch (error) { setStatus(error instanceof Error ? error.message : "The room PIN did not work."); }
    finally { setIsAccessing(false); }
  }
  const visibleTabs = useMemo(() => ROOM_TABS.filter((tab) => tab.id !== "precall" || Boolean(precall)), [precall]);

  function addFiles(nextFiles: FileList | File[]) {
    setFiles((current) => {
      const seen = new Set(current.map((item) => localFileKey(item.file)));
      const incoming = Array.from(nextFiles).filter((file) => { const key = localFileKey(file); if (seen.has(key)) return false; seen.add(key); return true; }).map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`, file, requestedDocumentId: highlightedRequest && session?.requested_documents.some((doc) => doc.id === highlightedRequest) ? highlightedRequest : "", status: "ready" as const }));
      return [...current, ...incoming];
    });
    setStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function updateFileState(id: string, patch: Partial<QueuedFile>) { setFiles((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function onDrop(event: DragEvent<HTMLButtonElement>) { event.preventDefault(); setIsDragging(false); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files); }

  async function submitDocuments() {
    if (!session || !canSubmit || submitInFlightRef.current) return;
    submitInFlightRef.current = true; setIsUploading(true); setStatus("Submitting documents...");
    let noteSaved = noteSubmitted; let uploadedCount = 0; let failedCount = 0;
    try {
      for (const item of files.filter((queued) => queued.status !== "uploaded")) {
        try {
          updateFileState(item.id, { status: "uploading", message: "Preparing secure upload" });
          const init = await fetch(`${apiBase}/api/v1/buckets/request/${token}/upload-init`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requested_document_id: item.requestedDocumentId || null, file_name: item.file.name, content_type: item.file.type || "application/octet-stream", size_bytes: item.file.size, uploader_name: name.trim(), uploader_email: email.trim() || null, passcode: passcode.trim() }) });
          if (!init.ok) throw new Error(await responseMessage(init, `Could not start ${item.file.name}.`));
          const payload = await init.json() as { file_id: string; upload_url: string; required_headers: Record<string, string> };
          updateFileState(item.id, { message: "Uploading securely" });
          const put = await fetch(payload.upload_url, { method: "PUT", body: item.file, headers: payload.required_headers });
          if (!put.ok) throw new Error(`Secure storage rejected ${item.file.name}.`);
          const done = await fetch(`${apiBase}/api/v1/buckets/request/${token}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: payload.file_id, note: !noteSaved ? note.trim() || null : null }) });
          if (!done.ok) throw new Error(await responseMessage(done, `Could not confirm ${item.file.name}.`));
          if (!noteSaved && note.trim()) { noteSaved = true; setNoteSubmitted(true); }
          uploadedCount += 1; updateFileState(item.id, { status: "uploaded", message: "Received" });
        } catch (error) { failedCount += 1; updateFileState(item.id, { status: "error", message: error instanceof Error ? error.message : "Upload failed." }); }
      }
      setStatus(uploadedCount && !failedCount ? `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} received.` : uploadedCount ? `${uploadedCount} received; ${failedCount} need retry.` : "No files were received. Review the messages and retry.");
      if (uploadedCount) { setNote(""); setNoteSubmitted(false); await refreshRoom().catch(() => undefined); }
    } finally { submitInFlightRef.current = false; setIsUploading(false); }
  }

  return <main className={`application-room ${theme === "obsidian" ? "is-obsidian" : "is-light"}`}>
    <div className="application-room-topline" />
    {!session ? <section className="application-room-gate">
      <RoomBrand />
      <div className="application-room-gate-copy"><span className="application-room-eyebrow">Secure application room</span><h1>Welcome{info?.recipient_name ? `, ${info.recipient_name}` : ""}</h1><p>{info ? <>Enter the six-digit room PIN for <strong>{info.bucket.name}</strong>.</> : "Opening your secure application room."}</p></div>
      {info && !info.requires_passcode ? <div className="application-room-alert bad">Ask Qualified Commercial to regenerate this room with a PIN.</div> : null}
      <label className="application-room-field"><span>Room PIN</span><input value={passcode} onChange={(event) => setPasscode(event.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 16))} onKeyDown={(event) => { if (event.key === "Enter") void openInvite(); }} placeholder="6-digit PIN" autoComplete="one-time-code" inputMode="numeric" disabled={!info || !info.requires_passcode || isAccessing} /></label>
      <button className="application-room-primary" onClick={() => void openInvite()} disabled={!info || !info.requires_passcode || !passcode.trim() || isAccessing}>{isAccessing ? "Checking PIN..." : "Open application room"}</button>
      {status ? <div className={`application-room-status ${status.toLowerCase().includes("not") || status.toLowerCase().includes("unavailable") ? "bad" : ""}`}>{status}</div> : null}
      <button className="application-room-theme-link" onClick={() => chooseTheme(theme === "light" ? "obsidian" : "light")}><Icon name={theme === "light" ? "moon" : "sun"} size={14} />{theme === "light" ? "Use Obsidian" : "Use light theme"}</button>
    </section> : <section className="application-room-shell">
      <header className="application-room-header"><div className="application-room-header-main"><RoomBrand /><div><span className="application-room-eyebrow">Secure application room</span><h1>{session.bucket.name}</h1><p>{session.bucket.purpose || `Prepared for ${session.recipient_name}`}</p></div></div><div className="application-room-header-actions"><span className={`application-room-count ${missingDocs.length ? "attention" : ""}`}>{missingDocs.length ? `${missingDocs.length} action${missingDocs.length === 1 ? "" : "s"} needed` : "Up to date"}</span><button className="application-room-icon-button" title={theme === "light" ? "Use Obsidian" : "Use light theme"} aria-label={theme === "light" ? "Use Obsidian" : "Use light theme"} onClick={() => chooseTheme(theme === "light" ? "obsidian" : "light")}><Icon name={theme === "light" ? "moon" : "sun"} size={17} /></button></div></header>
      <nav className="application-room-tabs" aria-label="Application room sections">{visibleTabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "on" : undefined} onClick={() => setActiveTab(tab.id)}><Icon name={tab.icon} size={15} />{tab.label}{tab.id === "todo" && missingDocs.length ? <span>{missingDocs.length}</span> : null}</button>)}</nav>

      {activeTab === "precall" && precall ? <PrecallChecklist token={token} passcode={passcode.trim()} precall={precall} onChanged={refreshPrecall} onGoToDocuments={() => setActiveTab("documents")} /> : null}
      {activeTab === "precall" && !precall && precallLoaded ? <section className="application-room-section"><p>This room has no call to prepare for.</p></section> : null}

      {activeTab === "todo" ? <section className="application-room-section"><div className="application-room-section-head"><div><span className="application-room-eyebrow">Next actions</span><h2>What we still need</h2></div><button className="application-room-secondary" onClick={() => setActiveTab("documents")}><Icon name="upload" size={14} />Upload documents</button></div><div className="application-room-todo-list">{session.requested_documents.map((doc) => { const complete = isRequestedDocComplete(doc, uploadedDocIds); return <article key={doc.id} className={`${complete ? "complete" : "needed"} ${highlightedRequest === doc.id ? "highlighted" : ""}`}><span className="application-room-task-icon"><Icon name={complete ? "check" : "alert"} size={15} /></span><div><b>{doc.name}</b><p>{doc.description || `${doc.required ? "Required" : "Optional"} · ${allowsMultipleFiles(doc) ? "Multiple files accepted" : "One file"}`}</p></div><span className="application-room-task-state">{complete ? "Received" : "Needed"}</span>{!complete ? <button onClick={() => setActiveTab("documents")}>Add file</button> : null}</article>; })}{!session.requested_documents.length ? <div className="application-room-empty">No action items have been requested.</div> : null}</div></section> : null}

      {activeTab === "documents" ? <section className="application-room-section application-room-documents"><div className="application-room-section-head"><div><span className="application-room-eyebrow">Documents</span><h2>Upload and review file history</h2></div><span className="application-room-count">{uploadedFiles.length} received</span></div><div className="application-room-document-grid"><div className="application-room-upload-column"><div className="application-room-identity"><label className="application-room-field"><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="application-room-field"><span>Email optional</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label></div><input ref={fileInputRef} type="file" multiple hidden onChange={(event) => event.target.files && addFiles(event.target.files)} /><button className={`application-room-dropzone ${isDragging ? "dragging" : ""}`} onClick={() => fileInputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}><Icon name="upload" size={24} /><b>Drop files here or click to browse</b><span>PDF, spreadsheet, image, CSV, or ZIP</span></button>{files.length ? <div className="application-room-queue">{files.map((item) => <div key={item.id}><span className="application-room-file-icon"><Icon name="file" size={15} /></span><div className="application-room-file-name"><b>{item.file.name}</b><small>{formatSize(item.file.size)} · {item.message || item.status}</small></div><select value={item.requestedDocumentId} onChange={(event) => updateFileState(item.id, { requestedDocumentId: event.target.value, status: "ready", message: undefined })} disabled={isUploading || item.status === "uploaded"}><option value="">General upload</option>{session.requested_documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}</select>{item.status === "uploaded" ? <span className="application-room-received">Received</span> : <button className="application-room-icon-button" aria-label={`Remove ${item.file.name}`} onClick={() => setFiles((current) => current.filter((row) => row.id !== item.id))}><Icon name="x" size={14} /></button>}</div>)}</div> : null}{session.allow_notes ? <label className="application-room-field"><span>Note for this upload</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for the review team" /></label> : null}<button className="application-room-primary" disabled={!canSubmit || isUploading} onClick={() => void submitDocuments()}>{isUploading ? "Submitting securely..." : `Submit ${files.filter((item) => item.status !== "uploaded").length || ""} file${files.filter((item) => item.status !== "uploaded").length === 1 ? "" : "s"}`}</button>{status ? <div className={`application-room-alert ${isUploadErrorStatus(status) ? "bad" : "good"}`}>{status}</div> : null}</div><aside className="application-room-history"><div className="application-room-history-head"><h3>Received files</h3><span>{uploadedFiles.length}</span></div><div className="application-room-history-list">{uploadedFiles.map((file) => <article key={file.id}><span className="application-room-file-icon"><Icon name="file" size={15} /></span><div><b>{file.file_name}</b><small>{fileKindLabel(file)} · {formatSize(file.size_bytes)} · {formatDate(file.created_at)}</small></div><span className="application-room-received">Received</span></article>)}{!uploadedFiles.length ? <div className="application-room-empty">Uploaded files will appear here.</div> : null}</div></aside></div></section> : null}

      {activeTab === "banking" ? <section className="application-room-section"><div className="application-room-section-head"><div><span className="application-room-eyebrow">LLC accounts only</span><h2>Business banking</h2><p>Connect the company&apos;s operating accounts from this device. Do not use a personal bank login.</p></div></div><RoomActions token={token} passcode={passcode.trim()} view="banking" onChanged={() => { void refreshRoom(); }} /><button className="application-room-secondary" onClick={() => setActiveTab("documents")}><Icon name="upload" size={14} />Upload bank statements instead</button></section> : null}
      {activeTab === "agreements" ? <section className="application-room-section"><div className="application-room-section-head"><div><span className="application-room-eyebrow">Electronic signatures</span><h2>Agreements</h2><p>Review and sign only the documents assigned to this application room.</p></div></div><RoomActions token={token} passcode={passcode.trim()} view="agreements" onChanged={() => { void refreshRoom(); }} /></section> : null}
      <footer className="application-room-footer"><span><Icon name="lock" size={14} />Encrypted in transit and at rest</span><span>Qualified Commercial</span></footer>
    </section>}
  </main>;
}

function RoomBrand() { return <div className="application-room-brand"><QCMark size={36} /><div><b>QUALIFIED COMMERCIAL</b><span>Financing & Capital Advisory</span></div></div>; }
async function responseMessage(response: Response, fallback: string) { try { const payload = await response.json(); return typeof payload.detail === "string" ? payload.detail : fallback; } catch { return fallback; } }
function formatSize(size: number) { if (size < 1024) return `${size} B`; if (size < 1048576) return `${Math.round(size / 1024)} KB`; return `${(size / 1048576).toFixed(1)} MB`; }
function localFileKey(file: File) { return `${file.name}|${file.size}|${file.lastModified}`; }
function isUploadErrorStatus(value: string) { return /failed|could not|rejected|retry|no files/i.test(value); }
function allowsMultipleFiles(doc: RequestedDoc) { if (typeof doc.allow_multiple_files === "boolean") return doc.allow_multiple_files; return /bank statement|tax return|irs/i.test(doc.name); }
function hasDuplicateSingleUseDocs(files: QueuedFile[], docs: RequestedDoc[]) { const single = new Set(docs.filter((doc) => !allowsMultipleFiles(doc)).map((doc) => doc.id)); const counts = new Map<string, number>(); files.forEach((file) => { if (file.requestedDocumentId && file.status !== "error" && single.has(file.requestedDocumentId)) counts.set(file.requestedDocumentId, (counts.get(file.requestedDocumentId) || 0) + 1); }); return [...counts.values()].some((count) => count > 1); }
function isRequestedDocComplete(doc: RequestedDoc, uploadedDocIds: Set<string>) { return doc.status === "uploaded" || uploadedDocIds.has(doc.id); }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recently"; }
function fileKindLabel(file: UploadedFile) { const value = `${file.content_type} ${file.file_name}`.toLowerCase(); if (value.includes("pdf")) return "PDF"; if (value.includes("image/")) return "Image"; if (/xls|spreadsheet/.test(value)) return "Spreadsheet"; if (value.includes("csv")) return "CSV"; return "Document"; }
