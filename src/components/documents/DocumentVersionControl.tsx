"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Callout, CellChip } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { ApiError } from "@/lib/api";
import { openSignedUrl } from "@/lib/safeOpen";
import { documentVersionLabel, documentVersionNumber, documentVersionUploadLabel, duplicateDocumentUpload, latestDocumentVersion, managedFinancialDocument, type DocumentVersionFile, type DocumentVersionHistory, type DocumentVersionService } from "@/lib/documentVersions";
import styles from "./DocumentVersions.module.css";

export function DocumentVersionBadge({ file }: { file: DocumentVersionFile }) {
  return <span className={styles.badge}>{managedFinancialDocument(file) ? "Managed in financial form History" : documentVersionLabel(file)}</span>;
}

/** One logical document, immutable uploads, and an explicit newer replacement. */
export function DocumentVersionControl({ file, service, onChanged, onPreview, readOnly = false, disabled = false, compact = false }: {
  file: DocumentVersionFile;
  service: DocumentVersionService;
  onChanged: () => Promise<unknown> | void;
  onPreview?: (file: DocumentVersionFile) => Promise<unknown> | void;
  readOnly?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<DocumentVersionHistory | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false);
  const [closing, setClosing] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const retry = useRef<{ fingerprint: string; key: string; previous: DocumentVersionFile; storedId?: string; versionId?: string } | null>(null);
  const serviceRef = useRef(service); serviceRef.current = service;
  async function load() {
    setBusy(true); setError("");
    try { setHistory(await serviceRef.current.load(file.id)); setConflict(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Version history could not be loaded."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (open) { setHistory(null); setSelected(null); setStatus(""); setClosing(false); retry.current = null; void load(); } /* The open file remains stable while its surrounding queries refresh. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file.id]);
  const latest = history ? history.versions.find((version) => version.id === history.latest_file_id) || latestDocumentVersion(history.versions) : null;
  const allowed = Boolean(!readOnly && history?.can_upload_new_version && latest);
  const latestPending = latest?.document_version_status === "pending";
  async function upload() {
    if (!selected || !latest || !allowed || busy || conflict) return;
    const previous = retry.current?.storedId ? retry.current.previous : latest;
    const fingerprint = `${selected.name}:${selected.size}:${selected.lastModified}:${previous.id}:${documentVersionNumber(previous)}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID(), previous };
    setBusy(true); setError(""); setStatus("Preparing the new version…");
    try {
      const receipt = await serviceRef.current.upload({ file: selected, previous, idempotencyKey: retry.current.key, storedFileId: retry.current.storedId, storedVersionId: retry.current.versionId,
        onStored: (storedId, versionId) => { if (retry.current) { retry.current.storedId = storedId; retry.current.versionId = versionId; } },
        onStage: (stage) => setStatus(stage === "preparing" ? "Preparing the new version…" : stage === "uploading" ? "Uploading securely…" : "Confirming the new version…"),
      });
      setSelected(null); if (picker.current) picker.current.value = ""; retry.current = null;
      const received = duplicateDocumentUpload(receipt) ? "This file matches an existing version. Its history is preserved." : "New version received. Analysis will check this version; saved financial figures update after the applicable review and save.";
      setStatus(received);
      const refreshed = await Promise.allSettled([serviceRef.current.load(file.id), Promise.resolve().then(onChanged)]);
      if (refreshed[0].status === "fulfilled") setHistory(refreshed[0].value);
      if (refreshed.some((result) => result.status === "rejected")) setStatus(`${duplicateDocumentUpload(receipt) ? "Existing version retained." : "New version received."} Refresh the file to see its latest analysis status.`);
    } catch (reason) {
      const stale = reason instanceof ApiError && reason.status === 409;
      setConflict(stale); setStatus("");
      setError(stale ? "Another version was uploaded while this window was open. Your selected file is retained. Reload history before uploading it as the next version." : reason instanceof Error ? reason.message : "Upload failed. Your file is retained so you can retry.");
    } finally { setBusy(false); }
  }
  async function preview(version: DocumentVersionFile, download = false) {
    setError("");
    try { if (!download && onPreview) { await onPreview(version); setOpen(false); } else if (serviceRef.current.url && !openSignedUrl(await serviceRef.current.url(version.id, download))) throw new Error("A secure link could not be opened for this version."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This version could not be opened."); }
  }
  if (managedFinancialDocument(file)) return compact ? null : <DocumentVersionBadge file={file} />;
  return <><span className={styles.control}>{!compact ? <DocumentVersionBadge file={file} /> : null}<Btn size="sm" disabled={disabled} onClick={() => setOpen(true)} aria-label={`Versions of ${file.file_name}`}>Versions</Btn></span>
    <Drawer open={open} onClose={() => { if (!busy) { if (selected) setClosing(true); else setOpen(false); } }} title="Document versions" sub={file.file_name} width="lg" closeOnBackdrop={false} footer={<Btn disabled={busy} onClick={() => { if (selected) setClosing(true); else setOpen(false); }}>Close</Btn>}>
      <div className={styles.layout}>
        {closing ? <Callout tone="warn"><span>This upload has not finished. Keep this window open to retry, or discard the selected file.</span><Btn size="sm" onClick={() => setClosing(false)}>Keep editing</Btn><Btn size="sm" onClick={() => { setSelected(null); retry.current = null; setClosing(false); setOpen(false); }}>Discard selected file and close</Btn></Callout> : null}
        <p className={styles.intro}>Upload a new version of this same document. Keep separate loans, accounts, owners and reporting periods as separate documents. Each uploaded version remains in history.</p>
        {error ? <Callout tone="warn"><span role="alert">{error}</span><Btn size="sm" disabled={busy} onClick={() => { if (!retry.current?.storedId) retry.current = null; void load(); }}>Reload history</Btn></Callout> : null}
        {status ? <p className={styles.status} role="status">{status}</p> : null}
        {latestPending ? <Callout tone="warn">The latest version is being checked. Earlier versions are history and are not used as the latest evidence.</Callout> : null}
        {latest?.analysis_reason_code === "document_identity_mismatch" ? <Callout tone="warn">This version appears to belong to a different owner, account, reporting period or loan. Review its association or upload it as a separate document.</Callout> : null}
        {latest && ["failed", "rejected"].includes(latest.document_version_status || "") ? <Callout tone="warn">The latest version could not be used. Review its status or upload a corrected version; earlier uploads remain in history.</Callout> : null}
        {history ? <div className={styles.list} aria-label="Dated document versions">{[...history.versions].sort((a, b) => documentVersionNumber(b) - documentVersionNumber(a)).map((version) => <article className={styles.version} key={version.id}>
          <div className={styles.copy}><strong>{documentVersionLabel(version)}</strong><span>{version.file_name}</span><small>{documentVersionUploadLabel(version)}{version.uploaded_by_name ? ` · ${version.uploaded_by_name}` : ""}{version.source_document_date || version.document_date ? ` · Document dated ${version.source_document_date || version.document_date}` : ""}</small><small>{version.analysis_status ? `Analysis: ${version.analysis_status.replaceAll("_", " ")}` : "Analysis status unavailable"}{version.analysis_review_state ? ` · Review: ${version.analysis_review_state.replaceAll("_", " ")}` : ""}</small></div>
          <div className={styles.actions}>{version.id === history.latest_file_id ? <CellChip tone={version.document_version_status === "current" ? "ok" : "warn"}>Latest upload</CellChip> : null}{version.can_preview !== false && (onPreview || service.url) ? <Btn size="sm" onClick={() => void preview(version)}>View v{documentVersionNumber(version)}</Btn> : null}{version.can_download !== false && service.url ? <Btn size="sm" onClick={() => void preview(version, true)}>Download</Btn> : null}</div>
        </article>)}</div> : busy ? <p className={styles.intro}>Loading history…</p> : null}
        {allowed ? <fieldset className={styles.upload} disabled={busy || conflict}><label htmlFor={`new-version-${file.id}`}>Upload v{documentVersionNumber(retry.current?.storedId ? retry.current.previous : latest!) + 1}</label><input ref={picker} id={`new-version-${file.id}`} aria-label="New document version" type="file" onChange={(event) => { setSelected(event.target.files?.[0] || null); setError(""); setStatus(""); setClosing(false); retry.current = null; }} /><Btn variant="pri" disabled={!selected || busy || conflict} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload new version"}</Btn></fieldset> : history ? <p className={styles.intro}>{readOnly || !history.can_upload_new_version ? "This document is read only here. Signed and generated forms use their correction and Save version workflow. ZIP archives are collections; update their individual documents." : "No uploadable version is available."}</p> : null}
      </div>
    </Drawer></>;
}
