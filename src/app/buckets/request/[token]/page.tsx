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
type UploadedFile = {
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
  files?: UploadedFile[];
  ai_summary?: Record<string, unknown> | null;
};
type AITask = { id: string; status: string; title: string; instructions: string; rationale?: string | null };
type AIMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type RoomTab = "todo" | "uploaded" | "chat";
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
  const [activeTab, setActiveTab] = useState<RoomTab>("todo");

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

  async function fetchAccessSession(): Promise<UploadSession> {
    const res = await fetch(`${apiBase}/api/v1/buckets/request/${token}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcode.trim() }),
    });
    if (!res.ok) throw new Error(await responseMessage(res, "The access code did not work."));
    return res.json();
  }

  async function refreshRoom() {
    const data = await fetchAccessSession();
    setSession(data);
    if (data.can_view_ai_tasks) await loadAITasks();
    else setAiTasks([]);
  }

  async function openInvite() {
    if (!passcode.trim()) return;
    setIsAccessing(true);
    setStatus("");
    try {
      const data = await fetchAccessSession();
      setSession(data);
      setName(data.recipient_name || "");
      setEmail(data.recipient_email || "");
      setActiveTab("todo");
      setStatus("");
      if (data.can_view_ai_tasks) loadAITasks().catch(() => undefined);
      else setAiTasks([]);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "The access code did not work.");
    } finally {
      setIsAccessing(false);
    }
  }

  async function loadAITasks() {
    // Passcode in the POST body, never the query string (query strings leak
    // into access logs, Referer headers, and browser history).
    const res = await fetch(`${apiBase}/api/v1/buckets/request/${token}/ai-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcode.trim() }),
    });
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
        await refreshRoom().catch(() => undefined);
      } else if (uploadedCount > 0) {
        setStatus(`${uploadedCount} document${uploadedCount === 1 ? "" : "s"} submitted. ${failedCount} file${failedCount === 1 ? "" : "s"} need retry.`);
        if (noteSaved) setNote("");
        await refreshRoom().catch(() => undefined);
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

  const uploadedFiles = session?.files ?? [];
  const uploadedDocIds = useMemo(
    () => new Set(uploadedFiles.map((file) => file.requested_document_id).filter(Boolean) as string[]),
    [uploadedFiles],
  );
  const missingDocs = useMemo(
    () => (session?.requested_documents ?? []).filter((doc) => !isRequestedDocComplete(doc, uploadedDocIds)),
    [session?.requested_documents, uploadedDocIds],
  );
  const completedDocs = useMemo(
    () => (session?.requested_documents ?? []).filter((doc) => isRequestedDocComplete(doc, uploadedDocIds)),
    [session?.requested_documents, uploadedDocIds],
  );
  const visibleTasks = aiTasks.filter((task) => task.status === "approved" || task.status === "completed");
  const needsAttentionCount = missingDocs.length + visibleTasks.filter((task) => task.status !== "completed").length + summaryItems(session?.ai_summary, "blocked_files").length;
  const hasAnalysis = hasAnalysisSummary(session?.ai_summary);

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
            <div style={needsAttentionCount ? attentionPill : summaryPill}>
              {needsAttentionCount ? `${needsAttentionCount} to-do${needsAttentionCount === 1 ? "" : "s"}` : `${uploadedFiles.length} uploaded`}
            </div>
          </header>
          <div style={securityNotice}>
            <strong>Encrypted upload room.</strong> Uploaded documents are encrypted. Access to view these documents is gated and regulated through authorized user controls.
          </div>
          <section style={insightPanel}>
            <div>
              <h2 style={sectionTitle}>AI analysis summary</h2>
              <p style={insightCopy}>{summaryText(session.ai_summary, uploadedFiles.length, missingDocs.length)}</p>
            </div>
            <div style={insightGrid}>
              <div style={goodMetric}>
                <strong>{completedDocs.length}</strong>
                <span>complete</span>
              </div>
              <div style={needsMetric}>
                <strong>{missingDocs.length}</strong>
                <span>missing</span>
              </div>
              <div style={summaryMetric}>
                <strong>{uploadedFiles.length}</strong>
                <span>uploaded</span>
              </div>
            </div>
            {summaryItems(session.ai_summary, "blocked_files").length ? (
              <div style={dangerSummary}>
                <strong>Password required before AI can read some files.</strong>
                <span>{summaryItems(session.ai_summary, "blocked_files").slice(0, 2).map(describeAIItem).join(" ")}</span>
              </div>
            ) : null}
            {hasAnalysis ? (
              <AIAnalysisSummary summary={session.ai_summary} />
            ) : (
              <div style={analysisEmpty}>
                AI analysis has not been completed for this upload room yet. The file list is available now, and this section will update after Qualified Commercial runs or reruns the bucket review.
              </div>
            )}
          </section>

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
              <div style={tabs}>
                {([
                  ["todo", `To-dos${needsAttentionCount ? ` (${needsAttentionCount})` : ""}`],
                  ["uploaded", `Uploaded (${uploadedFiles.length})`],
                  ["chat", "Ask AI"],
                ] as const).map(([tab, label]) => (
                  <button key={tab} style={tabButton(activeTab === tab, tab === "todo" && needsAttentionCount > 0)} onClick={() => setActiveTab(tab)}>
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === "todo" ? (
                <section style={sideSection}>
                  <h2 style={sectionTitle}>What needs attention</h2>
                  {visibleTasks.filter((task) => task.status !== "completed").length ? (
                    <div style={docList}>
                      {visibleTasks.filter((task) => task.status !== "completed").map((task) => (
                        <div key={task.id} style={urgentTask}>
                          <div style={docTitleRow}><span>{task.title}</span><span style={dangerBadge}>To do</span></div>
                          <small style={docDescription}>{task.instructions}</small>
                          {task.rationale ? <small style={muted}>{task.rationale}</small> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div style={docList}>
                    {session.requested_documents.length === 0 ? (
                      <div style={emptyState}>No requested documents were added to this bucket.</div>
                    ) : session.requested_documents.map((doc) => {
                      const count = linkedCount(doc.id);
                      const complete = isRequestedDocComplete(doc, uploadedDocIds);
                      return (
                        <div key={doc.id} style={{ ...docItem, ...(complete ? docItemLinked : requiredDocItem) }}>
                          <div style={docTitleRow}>
                            <span>{doc.name}</span>
                            <span style={complete ? checkBadge : dangerBadge}>{complete ? "Received" : "Needed"}</span>
                          </div>
                          <small style={muted}>
                            {doc.required ? "Required" : "Optional"} - {allowsMultipleFiles(doc) ? "multiple files allowed" : "one file"}{count ? ` - ${count} selected` : ""}
                          </small>
                          {doc.description ? <small style={docDescription}>{doc.description}</small> : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {activeTab === "uploaded" ? (
                <section style={sideSection}>
                  <h2 style={sectionTitle}>Uploaded files</h2>
                  <p style={{ ...muted, marginTop: 6, lineHeight: 1.4 }}>These are files already received for this secure room.</p>
                  <div style={docList}>
                    {uploadedFiles.length === 0 ? (
                      <div style={emptyState}>No files have been uploaded yet.</div>
                    ) : uploadedFiles.map((file) => (
                      <div key={file.id} style={uploadedFileItem}>
                        <div style={docTitleRow}>
                          <span>{file.file_name}</span>
                          <span style={checkBadge}>Received</span>
                        </div>
                        <small style={muted}>
                          {fileKindLabel(file)} - {formatSize(file.size_bytes)} - {formatDate(file.created_at)}
                        </small>
                        <small style={docDescription}>
                          Uploaded by {file.uploaded_by_name || file.uploaded_by_email || "Qualified Commercial"}
                        </small>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeTab === "chat" ? (
                <section style={sideSection}>
                  <h2 style={sectionTitle}>Ask AI</h2>
                  <p style={{ ...muted, marginTop: 6, lineHeight: 1.4 }}>Ask questions about what is uploaded, what is still needed, and how to complete the request. This chat cannot change Qualified Commercial instructions.</p>
                  {hasAnalysis ? (
                    <div style={chatBaseline}>
                      <strong>Chat baseline</strong>
                      <span>{summaryText(session.ai_summary, uploadedFiles.length, missingDocs.length)}</span>
                    </div>
                  ) : null}
                  {!session.can_use_ai_chat ? <div style={emptyState}>AI chat is disabled for this upload room.</div> : null}
                  {session.can_use_ai_chat ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                        {aiMessages.length === 0 ? <div style={emptyState}>Ask what is still needed or how to upload a document.</div> : aiMessages.slice(-8).map((message) => (
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
                          placeholder="Ask a question..."
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

              {session.allow_notes ? (
                <section style={sideSection}>
                  <h2 style={sectionTitle}>Upload note</h2>
                  <textarea style={notesField} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add one note for this upload batch." />
                </section>
              ) : null}
            </aside>
          </div>
        </section>
      )}
    </main>
  );
}

function AIAnalysisSummary({ summary }: { summary?: Record<string, unknown> | null }) {
  const available = summaryItems(summary, "available_documents");
  const missing = summaryItems(summary, "missing_or_incomplete_items");
  const questions = summaryItems(summary, "underwriter_questions");
  const discrepancies = summaryItems(summary, "discrepancies");
  const gaps = summaryItems(summary, "proof_of_funds_financial_collateral_gaps");
  const perFile = summaryItems(summary, "per_file_summaries");
  const context = summary && typeof summary.ai_context === "object" && summary.ai_context ? summary.ai_context as Record<string, unknown> : {};
  const contextRows = [
    ["Deal", stringValue(context.deal_type)],
    ["Docs", stringValue(context.documentation_level)],
    ["Collateral", stringValue(context.collateral_type)],
    ["Purpose", stringValue(context.loan_purpose)],
  ].filter(([, value]) => value);
  return (
    <div style={analysisGrid}>
      {contextRows.length ? (
        <div style={analysisBlock}>
          <strong>Review inputs</strong>
          <div style={contextPills}>
            {contextRows.map(([label, value]) => (
              <span key={label} style={contextPill}>{label}: {value}</span>
            ))}
          </div>
          {stringValue(context.underwriting_focus) ? <p style={analysisText}>{stringValue(context.underwriting_focus)}</p> : null}
        </div>
      ) : null}
      <AnalysisList title="What was analyzed" items={available.length ? available : perFile} empty="No detailed file analysis has been published yet." />
      <AnalysisList title="Missing or needs clarification" items={[...missing, ...questions, ...gaps, ...discrepancies]} danger empty="No missing items or clarification requests are currently published." />
      {perFile.length && available.length ? <AnalysisList title="Per-file notes" items={perFile} empty="" /> : null}
    </div>
  );
}

function AnalysisList({ title, items, empty, danger = false }: { title: string; items: unknown[]; empty: string; danger?: boolean }) {
  return (
    <div style={danger ? analysisBlockDanger : analysisBlock}>
      <strong>{title}</strong>
      {items.length ? (
        <div style={analysisList}>
          {items.slice(0, 5).map((item, index) => (
            <div key={`${title}-${index}`} style={analysisItem}>
              {describeAIItem(item)}
            </div>
          ))}
          {items.length > 5 ? <small style={muted}>+{items.length - 5} more</small> : null}
        </div>
      ) : (
        <p style={analysisText}>{empty}</p>
      )}
    </div>
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

function isRequestedDocComplete(doc: RequestedDoc, uploadedDocIds: Set<string>): boolean {
  return doc.status === "uploaded" || uploadedDocIds.has(doc.id);
}

function formatDate(value?: string | null): string {
  if (!value) return "recently";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fileKindLabel(file: UploadedFile): string {
  const lower = `${file.content_type} ${file.file_name}`.toLowerCase();
  if (lower.includes("pdf") || lower.endsWith(".pdf")) return "PDF";
  if (lower.includes("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.file_name)) return "Image";
  if (lower.includes("spreadsheet") || /\.(xls|xlsx)$/i.test(file.file_name)) return "Spreadsheet";
  if (lower.includes("csv") || file.file_name.toLowerCase().endsWith(".csv")) return "CSV";
  if (lower.includes("text/") || /\.(txt|md|log)$/i.test(file.file_name)) return "Text";
  return "Document";
}

function summaryItems(summary: Record<string, unknown> | null | undefined, key: string): unknown[] {
  const value = summary?.[key];
  return Array.isArray(value) ? value : [];
}

function summaryText(summary: Record<string, unknown> | null | undefined, uploadedCount: number, missingCount: number): string {
  if (typeof summary?.summary === "string" && summary.summary.trim()) return summary.summary;
  if (!summary) {
    return "AI analysis has not been completed yet. Uploaded files are listed below and the summary will update after review.";
  }
  if (uploadedCount || missingCount) {
    return `${uploadedCount} uploaded file${uploadedCount === 1 ? "" : "s"} on record. ${missingCount} requested item${missingCount === 1 ? "" : "s"} still need attention.`;
  }
  return "Start by uploading the requested documents. Qualified Commercial and the AI summary will update as files are received and reviewed.";
}

function hasAnalysisSummary(summary: Record<string, unknown> | null | undefined): boolean {
  if (!summary) return false;
  if (typeof summary.summary === "string" && summary.summary.trim()) return true;
  return [
    "available_documents",
    "missing_or_incomplete_items",
    "underwriter_questions",
    "discrepancies",
    "proof_of_funds_financial_collateral_gaps",
    "per_file_summaries",
    "blocked_files",
  ].some((key) => summaryItems(summary, key).length > 0);
}

function describeAIItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return String(item ?? "");
  const row = item as Record<string, unknown>;
  const parts = [
    stringValue(row.title),
    stringValue(row.file_name),
    stringValue(row.document_type),
    stringValue(row.detail),
    stringValue(row.summary),
    stringValue(row.instructions),
    stringValue(row.explanation),
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : JSON.stringify(row);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Dealer-AI dark theme — matches /dealer-ai-underwriter (navy #060B1A, teal
// #21D3C7, gold gradient #E9D58A→#D4AF37, Inter + translucent-white surfaces).
const page: CSSProperties = { minHeight: "100vh", background: "radial-gradient(1200px 620px at 50% -12%, #0C1428 0%, #060B1A 62%)", color: "#F1F5F9", padding: 24, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" };
const gateCard: CSSProperties = { maxWidth: 560, margin: "8vh auto 0", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 18, padding: 28, boxShadow: "0 30px 80px rgba(0,0,0,.45)" };
const brandHeader: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const brand: CSSProperties = { color: "#21D3C7", fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" };
const brandName: CSSProperties = { color: "#F8FAFC", fontSize: 15, fontWeight: 900, lineHeight: 1.2 };
const gateTitle: CSSProperties = { margin: "14px 0 8px", fontSize: 32, lineHeight: 1.1, letterSpacing: 0, color: "#F8FAFC" };
const gateCopy: CSSProperties = { margin: "0 0 20px", color: "#95A3B6", fontSize: 16, lineHeight: 1.5 };
const gateForm: CSSProperties = { display: "grid", gap: 12 };
const label: CSSProperties = { display: "block", color: "#B8C4D6", fontSize: 13, fontWeight: 800, marginBottom: 6 };
const accessInput: CSSProperties = { height: 52, border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: "0 14px", font: "inherit", fontSize: 18, background: "#232323", color: "#F8FAFC" };
const field: CSSProperties = { width: "100%", height: 44, border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: "0 12px", font: "inherit", background: "#232323", color: "#F8FAFC", boxSizing: "border-box" };
const primaryButton: CSSProperties = { height: 48, border: "none", borderRadius: 999, padding: "0 18px", font: "inherit", fontWeight: 900, background: "linear-gradient(135deg,#E9D58A,#D4AF37)", color: "#0B1326", cursor: "pointer" };
const statusText: CSSProperties = { margin: "14px 0 0", color: "#5EE6DB", fontWeight: 800 };
const errorText: CSSProperties = { margin: "14px 0 0", color: "#FCA5A5", fontWeight: 800 };
const errorBox: CSSProperties = { border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.12)", color: "#FCA5A5", borderRadius: 12, padding: 12, marginBottom: 14, fontWeight: 700 };
const workspace: CSSProperties = { maxWidth: 1180, margin: "0 auto", background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 20, padding: 24, boxShadow: "0 30px 80px rgba(0,0,0,.45)" };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 18, marginBottom: 20 };
const title: CSSProperties = { margin: "8px 0 4px", fontSize: 30, lineHeight: 1.15, letterSpacing: 0, color: "#F8FAFC" };
const muted: CSSProperties = { color: "#95A3B6" };
const summaryPill: CSSProperties = { border: "1px solid rgba(33,211,199,.25)", borderRadius: 999, padding: "8px 12px", color: "#BFFCF7", background: "rgba(33,211,199,.10)", fontWeight: 800, whiteSpace: "nowrap" };
const attentionPill: CSSProperties = { ...summaryPill, borderColor: "rgba(239,68,68,.35)", color: "#FCA5A5", background: "rgba(239,68,68,.12)" };
const securityNotice: CSSProperties = { border: "1px solid rgba(33,211,199,.22)", borderRadius: 12, padding: "11px 13px", color: "#BFEFEA", background: "rgba(33,211,199,.06)", fontSize: 13.5, lineHeight: 1.45, marginBottom: 18 };
const insightPanel: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 14, border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,.02)", marginBottom: 18 };
const insightCopy: CSSProperties = { margin: "7px 0 0", color: "#B8C4D6", lineHeight: 1.45 };
const insightGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(76px, 1fr))", gap: 8, alignSelf: "start" };
const insightMetricBase: CSSProperties = { borderRadius: 12, padding: "10px 12px", display: "grid", gap: 2, textAlign: "center", fontWeight: 900 };
const goodMetric: CSSProperties = { ...insightMetricBase, border: "1px solid rgba(52,211,153,.30)", background: "rgba(52,211,153,.10)", color: "#6EE7B7" };
const needsMetric: CSSProperties = { ...insightMetricBase, border: "1px solid rgba(239,68,68,.32)", background: "rgba(239,68,68,.10)", color: "#FCA5A5" };
const summaryMetric: CSSProperties = { ...insightMetricBase, border: "1px solid rgba(33,211,199,.28)", background: "rgba(33,211,199,.10)", color: "#7FE7DE" };
const dangerSummary: CSSProperties = { gridColumn: "1 / -1", display: "grid", gap: 3, border: "1px solid rgba(239,68,68,.32)", borderRadius: 12, padding: 12, background: "rgba(239,68,68,.10)", color: "#FCA5A5", lineHeight: 1.4 };
const analysisGrid: CSSProperties = { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 10 };
const analysisBlock: CSSProperties = { display: "grid", gap: 8, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,.02)", color: "#D6DEEA", lineHeight: 1.4 };
const analysisBlockDanger: CSSProperties = { ...analysisBlock, borderColor: "rgba(239,68,68,.30)", background: "rgba(239,68,68,.08)", color: "#FCA5A5" };
const analysisList: CSSProperties = { display: "grid", gap: 7 };
const analysisItem: CSSProperties = { borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 7, fontSize: 13, lineHeight: 1.4 };
const analysisText: CSSProperties = { margin: 0, color: "#95A3B6", fontSize: 13, lineHeight: 1.45 };
const analysisEmpty: CSSProperties = { gridColumn: "1 / -1", border: "1px dashed rgba(255,255,255,.16)", borderRadius: 12, padding: 12, color: "#95A3B6", background: "rgba(255,255,255,.015)", lineHeight: 1.45 };
const contextPills: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const contextPill: CSSProperties = { border: "1px solid rgba(33,211,199,.28)", borderRadius: 999, padding: "4px 8px", background: "rgba(33,211,199,.08)", color: "#7FE7DE", fontSize: 12, fontWeight: 900 };
const contentGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 20 };
const mainPanel: CSSProperties = { minWidth: 0 };
const identityGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, marginBottom: 16 };
const dropZone: CSSProperties = { border: "2px dashed rgba(255,255,255,.22)", borderRadius: 14, padding: 28, textAlign: "center", background: "rgba(255,255,255,.02)", color: "#F1F5F9", cursor: "pointer", transition: "border-color .15s ease, background .15s ease" };
const dropZoneActive: CSSProperties = { borderColor: "rgba(33,211,199,.70)", background: "rgba(33,211,199,.08)" };
const dropTitle: CSSProperties = { fontSize: 20, fontWeight: 900, marginBottom: 6, color: "#F8FAFC" };
const dropCopy: CSSProperties = { color: "#95A3B6" };
const queueHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 10 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: 0, color: "#F6F8FB" };
const queue: CSSProperties = { display: "grid", gap: 10 };
const emptyState: CSSProperties = { border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 16, color: "#95A3B6", background: "rgba(255,255,255,.015)" };
const fileRow: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, alignItems: "center", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,.02)" };
const fileMeta: CSSProperties = { display: "grid", gap: 4, minWidth: 0 };
const select: CSSProperties = { height: 42, border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, padding: "0 10px", font: "inherit", background: "#232323", color: "#F8FAFC", minWidth: 0 };
const removeButton: CSSProperties = { height: 38, border: "1px solid rgba(255,255,255,.16)", borderRadius: 10, background: "rgba(255,255,255,.045)", color: "#E2E8F0", font: "inherit", fontWeight: 800, cursor: "pointer" };
const submittedBadge: CSSProperties = { height: 38, border: "1px solid rgba(52,211,153,.30)", borderRadius: 10, background: "rgba(52,211,153,.10)", color: "#6EE7B7", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, padding: "0 12px" };
const sidePanel: CSSProperties = { display: "grid", gap: 14, alignContent: "start" };
const sideSection: CSSProperties = { border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 16, background: "rgba(255,255,255,.02)" };
const tabs: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 6, background: "rgba(255,255,255,.02)" };
const docList: CSSProperties = { display: "grid", gap: 10, marginTop: 12 };
const docItem: CSSProperties = { display: "grid", gap: 4, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 10, fontWeight: 800 };
const docItemLinked: CSSProperties = { border: "1px solid rgba(52,211,153,.30)", borderRadius: 10, padding: 10, background: "rgba(52,211,153,.08)" };
const requiredDocItem: CSSProperties = { border: "1px solid rgba(239,68,68,.30)", borderRadius: 10, padding: 10, background: "rgba(239,68,68,.08)" };
const urgentTask: CSSProperties = { display: "grid", gap: 5, border: "1px solid rgba(239,68,68,.32)", borderRadius: 10, padding: 10, background: "rgba(239,68,68,.10)", fontWeight: 800 };
const uploadedFileItem: CSSProperties = { display: "grid", gap: 5, border: "1px solid rgba(33,211,199,.22)", borderRadius: 10, padding: 10, background: "rgba(33,211,199,.06)", fontWeight: 800 };
const docTitleRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
const docDescription: CSSProperties = { color: "#B8C4D6", fontWeight: 600, lineHeight: 1.4 };
const checkBadge: CSSProperties = { border: "1px solid rgba(52,211,153,.35)", borderRadius: 999, padding: "3px 8px", color: "#6EE7B7", background: "rgba(52,211,153,.12)", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" };
const openBadge: CSSProperties = { border: "1px solid rgba(255,255,255,.12)", borderRadius: 999, padding: "3px 8px", color: "#95A3B6", background: "rgba(255,255,255,.03)", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" };
const dangerBadge: CSSProperties = { border: "1px solid rgba(239,68,68,.35)", borderRadius: 999, padding: "3px 8px", color: "#FCA5A5", background: "rgba(239,68,68,.12)", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" };
const notesField: CSSProperties = { width: "100%", minHeight: 160, border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, padding: 12, font: "inherit", background: "#232323", color: "#F8FAFC", resize: "vertical", boxSizing: "border-box", marginTop: 12 };
const chatBaseline: CSSProperties = { display: "grid", gap: 4, border: "1px solid rgba(33,211,199,.22)", borderRadius: 10, padding: 10, background: "rgba(33,211,199,.06)", color: "#7FE7DE", fontSize: 13, lineHeight: 1.4, marginTop: 10 };
const aiBubble: CSSProperties = { border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)", color: "#E7ECF3", borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap" };
const aiBubbleUser: CSSProperties = { border: "1px solid rgba(255,255,255,.10)", background: "#2B2B2B", color: "#F8FAFC", borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap" };

function tabButton(active: boolean, danger = false): CSSProperties {
  return {
    height: 38,
    border: "1px solid transparent",
    borderColor: active ? (danger ? "rgba(239,68,68,.35)" : "rgba(33,211,199,.30)") : "transparent",
    borderRadius: 10,
    background: active ? (danger ? "rgba(239,68,68,.12)" : "rgba(33,211,199,.10)") : "transparent",
    color: active ? (danger ? "#FCA5A5" : "#7FE7DE") : "#95A3B6",
    font: "inherit",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
  };
}
