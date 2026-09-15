"use client";

import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { LockedEvidenceBadge } from "@/components/application/LockedEvidenceStatus";
import { QCMark } from "@/components/QCMark";
import { RoomActions } from "@/components/room/RoomActions";
import { MerchantOfferCard, type RoomMerchantOffer } from "@/components/room/MerchantOfferCard";
import { PrecallChecklist, type RoomPrecall } from "@/components/room/PrecallChecklist";
import { RoomTimeline, type RoomTimelineEvent } from "@/components/room/RoomTimeline";
import { apiBase } from "@/lib/api";
import { clientActionNeeded, clientApiErrorDetail, clientQueuedUploadCanSubmit, clientRequestedDocumentState, clientUploadTarget, hasDuplicateSingleUseUploadTargets, isUnlockedCopyRequestedDocument, isValidRoomPin, normalizeRoomPin } from "@/lib/clientRoomDocuments";
import { assertPdfUploadUnlocked, isPasswordProtectedPdfUploadError, passwordProtectedPdfUploadNotice } from "@/lib/documentUpload";
import { lockedEvidencePresentation, unlockedCopyActionState } from "@/lib/lockedEvidence";

type RequestedDoc = { id: string; name: string; category?: string | null; description?: string | null; required: boolean; allow_multiple_files?: boolean; status: string; requirement_key?: string | null; request_kind?: "unlocked_copy" | null; source_file_id?: string | null; replacement_review_state?: "requested" | "checking" | "received" | "needs_another_copy" | null };
type BucketSummary = { name: string; client_name?: string | null; purpose?: string | null };
type UploadedFile = { id: string; requested_document_id?: string | null; file_name: string; content_type: string; size_bytes: number; uploaded_by_name?: string | null; uploaded_by_email?: string | null; status: string; created_at: string; analysis_status?: string | null; analysis_reason_code?: string | null; analysis_classification?: string | null; analysis_review_state?: "checking" | "received" | "needs_another_copy" | null; is_password_protected?: boolean; unlocked_copy_request?: { requested_document_id?: string | null; request_status?: string | null; delivery_status?: string | null; requested_at?: string | null; last_delivery_at?: string | null; replacement_review_state?: "requested" | "checking" | "received" | "needs_another_copy" | null } | null };
type RequestInfo = { bucket: BucketSummary; recipient_name: string; recipient_email?: string | null; requires_passcode: boolean; status: string };
type ClientRequirementSummary = { requirement_key: string; label: string; required_level: "required" | "recommended" | "optional"; status: string; complete: boolean; evidence_count: number; accepted_evidence_count: number; processing_evidence_count: number };
type ClientEvidenceBankingSummary = {
  requirements: ClientRequirementSummary[];
  required_count: number;
  completed_required_count: number;
  missing_required_count: number;
  processing_file_count: number;
  supporting_group_id?: string | null;
  supporting_group_name?: string | null;
  supporting_file_count: number;
  bank_evidence: {
    source: "none" | "plaid" | "uploaded_statements" | "mixed";
    connected_institutions: number;
    banking_access_complete: boolean;
    accepted_statement_months: string[];
    required_statement_months: number;
    statement_coverage_complete: boolean;
    processing_files: number;
    needs_attention_files: number;
    reconnect_required: boolean;
  };
};
type UploadSession = { bucket: BucketSummary; recipient_name: string; recipient_email?: string | null; allow_notes: boolean; requested_documents: RequestedDoc[]; files?: UploadedFile[]; evidence_banking_summary?: ClientEvidenceBankingSummary | null };
type RoomTab = "precall" | "offer" | "updates" | "todo" | "documents" | "banking" | "agreements";
type QueuedFile = { id: string; file: File; requestedDocumentId: string; status: "ready" | "uploading" | "uploaded" | "error"; message?: string; requiresRetarget?: boolean };

const ROOM_TABS: Array<{ id: RoomTab; label: string; icon: "check" | "file" | "building" | "edit" | "cal" | "dollar" | "note" }> = [
  { id: "precall", label: "Before your call", icon: "cal" },
  // Shown only while a processing offer is waiting on (or answered from) this room.
  { id: "offer", label: "Your offer", icon: "dollar" },
  // Shown only once the room is backed by a file record (the timeline call answers, even with no rows yet).
  { id: "updates", label: "Updates", icon: "note" },
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
  // null means "honor the request id in the invite URL"; an empty string is
  // an explicit user choice to clear that target. Keeping those states
  // distinct makes the Clear selection control work for deep-linked rooms.
  const [activeRequestedDocumentId, setActiveRequestedDocumentId] = useState<string | null>(null);
  const [requiresExplicitUploadTarget, setRequiresExplicitUploadTarget] = useState(false);
  // Pre-call prep state for rooms opened by a booked call; null for every other room.
  const [precall, setPrecall] = useState<RoomPrecall | null>(null);
  const [precallRoomKind, setPrecallRoomKind] = useState<"dealer" | "application">("dealer");
  const [precallLoaded, setPrecallLoaded] = useState(false);
  // The merchant-processing offer, if the desk has sent one; null otherwise.
  const [offer, setOffer] = useState<RoomMerchantOffer | null>(null);
  // The client tier of the file's timeline; null while the room has no file record (the call 404s).
  const [updates, setUpdates] = useState<RoomTimelineEvent[] | null>(null);
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
  const uploadedEvidenceByDocId = useMemo(() => {
    const result = new Map<string, UploadedFile[]>();
    for (const file of uploadedFiles) {
      if (!file.requested_document_id) continue;
      result.set(file.requested_document_id, [...(result.get(file.requested_document_id) ?? []), file]);
    }
    return result;
  }, [uploadedFiles]);
  const unlockedCopyDocIds = useMemo(() => new Set(uploadedFiles.map((file) => file.unlocked_copy_request?.requested_document_id).filter(Boolean) as string[]), [uploadedFiles]);
  const requirementSummaryByKey = useMemo(() => new Map((session?.evidence_banking_summary?.requirements ?? []).map((item) => [item.requirement_key, item])), [session?.evidence_banking_summary?.requirements]);
  const requestedDocumentStates = useMemo(() => {
    const result = new Map<string, { state: "needed" | "checking" | "accepted"; unlockedCopy: boolean; replacementCount: number }>();
    for (const doc of session?.requested_documents ?? []) {
      const requirement = doc.requirement_key ? requirementSummaryByKey.get(doc.requirement_key) : undefined;
      const replacements = uploadedEvidenceByDocId.get(doc.id) ?? [];
      const unlockedCopy = isUnlockedCopyRequestedDocument({ id: doc.id, requestKind: doc.request_kind }, unlockedCopyDocIds);
      const state = clientRequestedDocumentState({ isUnlockedCopyRequest: unlockedCopy, documentStatus: doc.status, hasUploadedFile: uploadedDocIds.has(doc.id), requirementComplete: requirement?.complete, processingEvidenceCount: requirement?.processing_evidence_count, replacementReviewState: doc.replacement_review_state, uploadedEvidence: replacements.map((file) => ({ analysisReviewState: file.analysis_review_state, analysisStatus: file.analysis_status, analysisReasonCode: file.analysis_reason_code, analysisClassification: file.analysis_classification, isPasswordProtected: file.is_password_protected })) });
      result.set(doc.id, { state, unlockedCopy, replacementCount: replacements.length });
    }
    return result;
  }, [session?.requested_documents, requirementSummaryByKey, unlockedCopyDocIds, uploadedDocIds, uploadedEvidenceByDocId]);
  const missingDocs = useMemo(() => (session?.requested_documents ?? []).filter((doc) => doc.required && clientActionNeeded(requestedDocumentStates.get(doc.id)?.state ?? "needed")), [session?.requested_documents, requestedDocumentStates]);
  const hasCheckingUnlockedCopyTask = useMemo(() => [...requestedDocumentStates.values()].some((item) => item.unlockedCopy && item.state === "checking"), [requestedDocumentStates]);
  const repeatableRequestedDocumentIds = useMemo(() => new Set([...requestedDocumentStates.entries()].filter(([, item]) => item.unlockedCopy).map(([id]) => id)), [requestedDocumentStates]);
  const supportingDoc = useMemo(() => (session?.requested_documents ?? []).find((doc) => doc.id === session?.evidence_banking_summary?.supporting_group_id || (!doc.required && /supporting\s*\/\s*other/i.test(doc.name))), [session?.requested_documents, session?.evidence_banking_summary?.supporting_group_id]);
  const bankEvidence = session?.evidence_banking_summary?.bank_evidence;
  const requestedFromLink = searchParams.get("request") || "";
  const highlightedRequest = activeRequestedDocumentId === null ? requestedFromLink : activeRequestedDocumentId;
  const activeRequestedDocument = session?.requested_documents.find((doc) => doc.id === highlightedRequest) ?? null;
  const mustChooseUploadTarget = requiresExplicitUploadTarget || Boolean(requestedFromLink && activeRequestedDocumentId === null && session && !activeRequestedDocument);
  const canSubmit = useMemo(() => {
    const pending = files.filter((item) => item.status !== "uploaded");
    return Boolean(session && name.trim() && pending.length > 0 && pending.every(clientQueuedUploadCanSubmit) && !hasDuplicateSingleUseDocs(files, session.requested_documents, repeatableRequestedDocumentIds));
  }, [files, name, repeatableRequestedDocumentIds, session]);
  const processingFileCount = session?.evidence_banking_summary?.processing_file_count ?? 0;

  useEffect(() => {
    if (processingFileCount <= 0 && !hasCheckingUnlockedCopyTask) return;
    let cancelled = false;
    let attempt = 0;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`${apiBase}/api/v1/buckets/request/${token}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: passcode.trim() }) });
        if (response.ok) {
          const data = await response.json() as UploadSession;
          if (!cancelled) setSession(data);
        }
      } catch {
        // The room remains usable; the next bounded poll can recover.
      } finally {
        attempt += 1;
        if (!cancelled) timer = window.setTimeout(() => { void poll(); }, Math.min(30_000, 4_000 + attempt * 1_000));
      }
    };
    timer = window.setTimeout(() => { void poll(); }, 4_000);
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [hasCheckingUnlockedCopyTask, passcode, processingFileCount, token]);

  function chooseTheme(next: "light" | "obsidian") {
    setTheme(next);
    window.localStorage.setItem("qc-application-room-theme", next);
  }

  async function fetchAccessSession(): Promise<UploadSession> {
    const response = await fetch(`${apiBase}/api/v1/buckets/request/${token}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: passcode.trim() }) });
    if (!response.ok) throw await responseError(response, "The room PIN did not work.");
    return response.json();
  }
  async function fetchPrecall(code: string): Promise<{ precall: RoomPrecall; roomKind: "dealer" | "application" } | null> {
    try {
      const response = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}/features`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      if (response.ok) {
        const data = await response.json() as { precall?: RoomPrecall | null };
        return data.precall?.enabled ? { precall: data.precall, roomKind: "dealer" } : null;
      }
      const application = await fetch(`${apiBase}/api/v1/application-profiles/public/room/${token}/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      if (!application.ok) return null;
      const state = await application.json() as {
        business_name: string;
        owners: Array<{ id: string; first_name: string; last_name: string; email: string | null; phone: string | null; ownership_pct: number | null; is_primary: boolean; has_invite: boolean; invite_opened_at: string | null; credit_required: boolean; credit_complete: boolean }>;
        verification: { ownership_complete: boolean; ownership_total: number; owner_contact_complete: boolean; business_banking_complete: boolean; bank_connection_count: number; bank_statement_months: number; owner_credit_complete: boolean; required_credit_owner_count: number; completed_credit_owner_count: number };
        precall: { status: "in_progress" | "complete" | "stopped" | "disabled"; complete: boolean; done_count: number; missing: string[] } | null;
      };
      if (!state.precall || state.precall.status === "disabled") return null;
      const verification = state.verification;
      return {
        roomKind: "application",
        precall: {
          enabled: true,
          starts_at: null,
          host_name: null,
          business_name: state.business_name,
          passcode_needs_setup: false,
          ownership_complete: verification.ownership_complete,
          ownership_total: verification.ownership_total,
          contact_complete: verification.owner_contact_complete,
          owners: state.owners.map((owner) => ({
            id: owner.id,
            first_name: owner.first_name,
            last_name: owner.last_name,
            email: owner.email,
            phone: owner.phone,
            ownership_pct: owner.ownership_pct,
            is_primary: owner.is_primary,
            required: owner.credit_required,
            has_email: Boolean(owner.email),
            has_phone: Boolean(owner.phone),
            credit_status: owner.credit_complete ? "done" : owner.has_invite || owner.invite_opened_at ? "sent" : "not_started",
            editable: !owner.has_invite && !owner.credit_complete,
          })),
          max_owners: 5,
          credit_threshold_pct: 20,
          bank_complete: verification.business_banking_complete,
          bank_detail: verification.bank_connection_count
            ? `${verification.bank_connection_count} institution${verification.bank_connection_count === 1 ? "" : "s"} connected`
            : verification.bank_statement_months
              ? `${verification.bank_statement_months} statement month${verification.bank_statement_months === 1 ? "" : "s"} received`
              : "",
          credit_complete: verification.owner_credit_complete,
          credit_required: verification.required_credit_owner_count,
          credit_done: verification.completed_credit_owner_count,
          complete: state.precall.complete,
          done_count: state.precall.done_count,
          completed_at: null,
        },
      };
    } catch { return null; }
  }
  async function fetchOffer(code: string): Promise<RoomMerchantOffer | null> {
    try {
      const response = await fetch(`${apiBase}/api/v1/application-profiles/public/room/${token}/merchant-offer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      if (!response.ok) return null;
      return await response.json() as RoomMerchantOffer;
    } catch { return null; }
  }
  async function fetchUpdates(code: string): Promise<RoomTimelineEvent[] | null> {
    try {
      const response = await fetch(`${apiBase}/api/v1/application-profiles/public/room/${token}/timeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: code }) });
      if (!response.ok) return null;
      const data = await response.json() as { events?: RoomTimelineEvent[] };
      return Array.isArray(data.events) ? data.events : [];
    } catch { return null; }
  }
  async function refreshPrecall() {
    const loaded = await fetchPrecall(passcode.trim());
    setPrecall(loaded?.precall ?? null);
    if (loaded) setPrecallRoomKind(loaded.roomKind);
  }
  async function refreshRoom() {
    setSession(await fetchAccessSession());
    await refreshPrecall();
    setOffer(await fetchOffer(passcode.trim()));
    setUpdates(await fetchUpdates(passcode.trim()));
  }
  async function openInvite() {
    if (!isValidRoomPin(passcode.trim())) return;
    setIsAccessing(true); setStatus("");
    try {
      const data = await fetchAccessSession();
      const prep = await fetchPrecall(passcode.trim());
      const waitingOffer = await fetchOffer(passcode.trim());
      const fileUpdates = await fetchUpdates(passcode.trim());
      setSession(data); setName(data.recipient_name || ""); setEmail(data.recipient_email || ""); setStatus("");
      setPrecall(prep?.precall ?? null); setPrecallRoomKind(prep?.roomKind ?? "dealer"); setPrecallLoaded(true);
      setOffer(waitingOffer); setUpdates(fileUpdates);
      // A booked call lands on its checklist until it is done; the URL still wins.
      if (prep && !prep.precall.complete && !searchParams.get("tab")) setActiveTab("precall");
    } catch (error) { setStatus(error instanceof Error ? error.message : "The room PIN did not work."); }
    finally { setIsAccessing(false); }
  }
  const visibleTabs = useMemo(() => ROOM_TABS.filter((tab) => (tab.id !== "precall" || Boolean(precall)) && (tab.id !== "offer" || Boolean(offer)) && (tab.id !== "updates" || updates !== null)), [precall, offer, updates]);

  function addFiles(nextFiles: FileList | File[]) {
    setFiles((current) => {
      const seen = new Set(current.map((item) => localFileKey(item.file)));
      const uploadTarget = mustChooseUploadTarget ? "" : clientUploadTarget(highlightedRequest, (session?.requested_documents ?? []).map((doc) => doc.id), supportingDoc?.id || "");
      const incoming = Array.from(nextFiles).filter((file) => { const key = localFileKey(file); if (seen.has(key)) return false; seen.add(key); return true; }).map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`, file, requestedDocumentId: uploadTarget, status: "ready" as const, requiresRetarget: mustChooseUploadTarget }));
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
    let noteSaved = noteSubmitted; let uploadedCount = 0; let failedCount = 0; let staleRequestCount = 0; let staleRequestMessage = "";
    const lockedFiles: File[] = [];
    try {
      for (const item of files.filter((queued) => queued.status !== "uploaded")) {
        try {
          updateFileState(item.id, { status: "uploading", message: "Preparing secure upload" });
          await assertPdfUploadUnlocked(item.file);
          const init = await fetch(`${apiBase}/api/v1/buckets/request/${token}/upload-init`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requested_document_id: item.requestedDocumentId || null, file_name: item.file.name, content_type: item.file.type || "application/octet-stream", size_bytes: item.file.size, uploader_name: name.trim(), uploader_email: email.trim() || null, passcode: passcode.trim() }) });
          if (!init.ok) throw await responseError(init, `Could not start ${item.file.name}.`);
          const payload = await init.json() as { file_id: string; upload_url: string; required_headers: Record<string, string> };
          updateFileState(item.id, { message: "Uploading securely" });
          const put = await fetch(payload.upload_url, { method: "PUT", body: item.file, headers: payload.required_headers });
          if (!put.ok) throw new Error(`Secure storage rejected ${item.file.name}.`);
          const done = await fetch(`${apiBase}/api/v1/buckets/request/${token}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: payload.file_id, note: !noteSaved ? note.trim() || null : null }) });
          if (!done.ok) throw await responseError(done, `Could not confirm ${item.file.name}.`);
          if (!noteSaved && note.trim()) { noteSaved = true; setNoteSubmitted(true); }
          uploadedCount += 1; updateFileState(item.id, { status: "uploaded", message: "Received" });
        } catch (error) {
          failedCount += 1;
          const uploadError = error as CodedResponseError;
          const staleRequest = uploadError?.code === "stale_requested_document";
          const lockedPdf = isPasswordProtectedPdfUploadError(error);
          if (lockedPdf) {
            lockedFiles.push(item.file);
            setFiles((current) => current.filter((row) => row.id !== item.id));
            continue;
          }
          if (staleRequest) {
            staleRequestCount += 1;
            staleRequestMessage = uploadError.message;
            setActiveRequestedDocumentId("");
            setRequiresExplicitUploadTarget(true);
          }
          updateFileState(item.id, {
            status: "error",
            message: error instanceof Error ? error.message : "Upload failed.",
            ...(staleRequest ? { requestedDocumentId: "", requiresRetarget: true } : {}),
          });
        }
      }
      let roomRefreshed = false;
      if (uploadedCount) { setNote(""); setNoteSubmitted(false); }
      if (uploadedCount || staleRequestCount || lockedFiles.length) {
        try { await refreshRoom(); roomRefreshed = true; } catch { roomRefreshed = false; }
      }
      const staleGuidance = staleRequestCount
        ? `${staleRequestMessage || "The selected document request changed."} ${roomRefreshed ? "The room was refreshed; choose the current request and retry." : "Refresh the room, choose the current request, and retry."}`
        : "";
      const lockedGuidance = lockedFiles.length ? passwordProtectedPdfUploadNotice(lockedFiles) : "";
      setStatus([staleGuidance, lockedGuidance].filter(Boolean).join(" ") || (uploadedCount && !failedCount ? `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} received.` : uploadedCount ? `${uploadedCount} received; ${failedCount} need retry.` : "No files were received. Review the messages and retry."));
    } finally { submitInFlightRef.current = false; setIsUploading(false); }
  }

  return <main className={`application-room ${theme === "obsidian" ? "is-obsidian" : "is-light"}`}>
    <div className="application-room-topline" />
    {!session ? <section className="application-room-gate">
      <RoomBrand />
      <div className="application-room-gate-copy"><span className="application-room-eyebrow">Secure application room</span><h1>Welcome{info?.recipient_name ? `, ${info.recipient_name}` : ""}</h1><p>{info ? <>Enter the six-digit room PIN for <strong>{info.bucket.name}</strong>.</> : "Opening your secure application room."}</p></div>
      {info && !info.requires_passcode ? <div className="application-room-alert bad">Ask Qualified Commercial to regenerate this room with a PIN.</div> : null}
      <label className="application-room-field"><span>Room PIN</span><input value={passcode} onChange={(event) => setPasscode(normalizeRoomPin(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") void openInvite(); }} placeholder="6-digit PIN" autoComplete="one-time-code" inputMode="numeric" maxLength={6} disabled={!info || !info.requires_passcode || isAccessing} /></label>
      <button className="application-room-primary" onClick={() => void openInvite()} disabled={!info || !info.requires_passcode || !isValidRoomPin(passcode.trim()) || isAccessing}>{isAccessing ? "Checking PIN..." : "Open application room"}</button>
      {status ? <div className={`application-room-status ${status.toLowerCase().includes("not") || status.toLowerCase().includes("unavailable") ? "bad" : ""}`}>{status}</div> : null}
      <button className="application-room-theme-link" onClick={() => chooseTheme(theme === "light" ? "obsidian" : "light")}><Icon name={theme === "light" ? "moon" : "sun"} size={14} />{theme === "light" ? "Use Obsidian" : "Use light theme"}</button>
    </section> : <section className="application-room-shell">
      <header className="application-room-header"><div className="application-room-header-main"><RoomBrand /><div><span className="application-room-eyebrow">Secure application room</span><h1>{session.bucket.name}</h1><p>{session.bucket.purpose || `Prepared for ${session.recipient_name}`}</p></div></div><div className="application-room-header-actions"><span className={`application-room-count ${missingDocs.length ? "attention" : ""}`}>{missingDocs.length ? `${missingDocs.length} action${missingDocs.length === 1 ? "" : "s"} needed` : "Up to date"}</span><button className="application-room-icon-button" title={theme === "light" ? "Use Obsidian" : "Use light theme"} aria-label={theme === "light" ? "Use Obsidian" : "Use light theme"} onClick={() => chooseTheme(theme === "light" ? "obsidian" : "light")}><Icon name={theme === "light" ? "moon" : "sun"} size={17} /></button></div></header>
      <nav className="application-room-tabs" aria-label="Application room sections">{visibleTabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "on" : undefined} onClick={() => setActiveTab(tab.id)}><Icon name={tab.icon} size={15} />{tab.label}{tab.id === "todo" && missingDocs.length ? <span>{missingDocs.length}</span> : null}</button>)}</nav>

      {activeTab === "precall" && precall ? <PrecallChecklist token={token} passcode={passcode.trim()} precall={precall} roomKind={precallRoomKind} onChanged={refreshPrecall} onGoToDocuments={() => setActiveTab("documents")} /> : null}
      {activeTab === "precall" && !precall && precallLoaded ? <section className="application-room-section"><p>This room has no call to prepare for.</p></section> : null}

      {activeTab === "offer" && offer ? <MerchantOfferCard token={token} passcode={passcode.trim()} offer={offer} responderName={name} onChanged={setOffer} /> : null}
      {activeTab === "offer" && !offer ? <section className="application-room-section"><p>There is no offer waiting on this room.</p></section> : null}

      {activeTab === "updates" && updates !== null ? <section className="application-room-section"><div className="application-room-section-head"><div><span className="application-room-eyebrow">Your file</span><h2>Updates</h2><p>What has happened on your file, newest first.</p></div><button className="application-room-secondary" onClick={() => { void refreshRoom().catch(() => undefined); }}><Icon name="refresh" size={14} />Refresh</button></div><RoomTimeline events={updates} /></section> : null}
      {activeTab === "updates" && updates === null ? <section className="application-room-section"><p>There are no updates on this room yet.</p></section> : null}

      {activeTab === "todo" ? <section className="application-room-section"><div className="application-room-section-head"><div><span className="application-room-eyebrow">Next actions</span><h2>What we still need</h2></div><button className="application-room-secondary" onClick={() => { setActiveRequestedDocumentId(""); setRequiresExplicitUploadTarget(false); setActiveTab("documents"); }}><Icon name="upload" size={14} />Upload documents</button></div><div className="application-room-todo-list">{session.requested_documents.filter((doc) => doc.required).map((doc) => { const task = requestedDocumentStates.get(doc.id) ?? { state: "needed" as const, unlockedCopy: false, replacementCount: 0 }; const complete = task.state === "accepted"; const processing = task.state === "checking"; const actionable = clientActionNeeded(task.state); const needsAnotherCopy = task.unlockedCopy && task.replacementCount > 0 && actionable; return <article key={doc.id} className={`${complete ? "complete" : processing ? "checking" : "needed"} ${highlightedRequest === doc.id ? "highlighted" : ""}`}><span className="application-room-task-icon"><Icon name={complete ? "check" : processing ? "refresh" : "alert"} size={15} /></span><div><b>{doc.name}</b><p>{processing ? task.unlockedCopy ? "Replacement received; review is still in progress. No action is needed right now." : "Your file is being reviewed." : needsAnotherCopy ? "The replacement could not be read. Add another unlocked copy." : doc.description || `Required · ${allowsMultipleFiles(doc) ? "Multiple files accepted" : "One file"}`}</p></div><span className="application-room-task-state">{complete ? task.unlockedCopy ? "Unlocked copy received" : "Accepted" : processing ? "Received · checking" : "Needed"}</span>{actionable ? <button onClick={() => { setActiveRequestedDocumentId(doc.id); setRequiresExplicitUploadTarget(false); setActiveTab("documents"); }}>{task.replacementCount ? "Add another file" : "Add file"}</button> : null}</article>; })}{!session.requested_documents.some((doc) => doc.required) ? <div className="application-room-empty">No action items have been requested.</div> : null}</div></section> : null}

      {activeTab === "documents" && activeRequestedDocument ? <div className="application-room-upload-target" aria-live="polite"><span><Icon name="check" size={15} aria-hidden="true" /></span><div><b>Adding files to {activeRequestedDocument.name}</b><small>Files selected below will be attached to this exact request.</small></div><button onClick={() => setActiveRequestedDocumentId("")}>Clear selection</button></div> : null}
      {activeTab === "documents" ? <section className="application-room-section application-room-documents"><div className="application-room-section-head"><div><span className="application-room-eyebrow">Documents</span><h2>Upload and review file history</h2></div><span className="application-room-count">{uploadedFiles.length} received</span></div><div className="application-room-document-grid"><div className="application-room-upload-column"><div className="application-room-identity"><label className="application-room-field"><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="application-room-field"><span>Email optional</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label></div><input ref={fileInputRef} type="file" multiple hidden onChange={(event) => event.target.files && addFiles(event.target.files)} /><button className={`application-room-dropzone ${isDragging ? "dragging" : ""}`} onClick={() => fileInputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}><Icon name="upload" size={24} /><b>Drop files here or click to browse</b><span>PDF, spreadsheet, image, CSV, or ZIP</span></button>{files.length ? <div className="application-room-queue">{files.map((item) => <div key={item.id}><span className="application-room-file-icon"><Icon name="file" size={15} /></span><div className="application-room-file-name"><b>{item.file.name}</b><small>{formatSize(item.file.size)} · {item.message || item.status}</small></div><select value={item.requestedDocumentId} onChange={(event) => { const requestedDocumentId = event.target.value; updateFileState(item.id, { requestedDocumentId, status: "ready", message: undefined, requiresRetarget: false }); if (requestedDocumentId) { setActiveRequestedDocumentId(requestedDocumentId); setRequiresExplicitUploadTarget(false); } }} disabled={isUploading || item.status === "uploaded"}>{item.requiresRetarget ? <option value="" disabled>Choose the current request...</option> : !supportingDoc ? <option value="">Supporting / Other</option> : null}{session.requested_documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}</select>{item.status === "uploaded" ? <span className="application-room-received">Received</span> : <button className="application-room-icon-button" aria-label={`Remove ${item.file.name}`} onClick={() => setFiles((current) => current.filter((row) => row.id !== item.id))}><Icon name="x" size={14} /></button>}</div>)}</div> : null}{session.allow_notes ? <label className="application-room-field"><span>Note for this upload</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for the review team" /></label> : null}<button className="application-room-primary" disabled={!canSubmit || isUploading} onClick={() => void submitDocuments()}>{isUploading ? "Submitting securely..." : `Submit ${files.filter((item) => item.status !== "uploaded").length || ""} file${files.filter((item) => item.status !== "uploaded").length === 1 ? "" : "s"}`}</button>{status ? <div className={`application-room-alert ${isUploadErrorStatus(status) ? "bad" : "good"}`}>{status}</div> : null}</div><aside className="application-room-history"><div className="application-room-history-head"><h3>Received files</h3><span>{uploadedFiles.length}</span></div><div className="application-room-history-list">{uploadedFiles.map((file) => <ReceivedFileRow key={file.id} file={file} />)}{!uploadedFiles.length ? <div className="application-room-empty">Uploaded files will appear here.</div> : null}</div></aside></div></section> : null}

      {activeTab === "banking" ? <section className="application-room-section"><div className="application-room-section-head"><div><span className="application-room-eyebrow">LLC accounts only</span><h2>Business banking</h2><p>Connect the company&apos;s operating accounts or provide six months of business bank statements.</p></div></div>{bankEvidence?.banking_access_complete ? <div className="application-room-alert good"><b>Banking evidence complete.</b> {bankEvidence.statement_coverage_complete ? `${bankEvidence.accepted_statement_months.length} of ${bankEvidence.required_statement_months} statement months accepted.` : `${bankEvidence.connected_institutions} institution${bankEvidence.connected_institutions === 1 ? "" : "s"} connected.`}</div> : null}{!bankEvidence?.statement_coverage_complete || Boolean(bankEvidence.connected_institutions) ? <RoomActions token={token} passcode={passcode.trim()} view="banking" onChanged={() => { void refreshRoom(); }} /> : null}<button className="application-room-secondary" onClick={() => setActiveTab("documents")}><Icon name="upload" size={14} />{bankEvidence?.statement_coverage_complete ? "View uploaded statements" : "Upload bank statements instead"}</button></section> : null}
      {activeTab === "agreements" ? <section className="application-room-section"><div className="application-room-section-head"><div><span className="application-room-eyebrow">Electronic signatures</span><h2>Agreements</h2><p>Review and sign only the documents assigned to this application room.</p></div></div><RoomActions token={token} passcode={passcode.trim()} view="agreements" onChanged={() => { void refreshRoom(); }} /></section> : null}
      <footer className="application-room-footer"><span><Icon name="lock" size={14} />Encrypted in transit and at rest</span><span>Qualified Commercial</span></footer>
    </section>}
  </main>;
}

function RoomBrand() { return <div className="application-room-brand"><QCMark size={36} /><div><b>QUALIFIED COMMERCIAL</b><span>Financing & Capital Advisory</span></div></div>; }
function ReceivedFileRow({ file }: { file: UploadedFile }) {
  const locked = lockedEvidencePresentation({ fileName: file.file_name, isPasswordProtected: file.is_password_protected });
  const requestState = unlockedCopyActionState(file.unlocked_copy_request);
  const lockedDetail = requestState.kind === "replacement_received"
    ? "An unlocked replacement was accepted"
    : requestState.kind === "replacement_checking"
      ? "Replacement received; review is checking it"
      : requestState.kind === "needs_another_copy"
        ? "The replacement still cannot be read; upload another unlocked copy"
        : requestState.kind === "requested" || requestState.kind === "retry"
      ? "An unlocked replacement was requested"
      : "Upload an unlocked replacement so review can continue";
  return <article className={locked ? "password-protected" : undefined}><span className={`application-room-file-icon${locked ? " locked" : ""}`}><Icon name={locked ? "lock" : "file"} size={15} aria-hidden="true" /></span><div><b>{file.file_name}</b><small>{locked ? `${locked.title} · ${lockedDetail} · ${formatDate(file.created_at)}` : `${fileKindLabel(file)} · ${formatSize(file.size_bytes)} · ${formatDate(file.created_at)}`}</small></div>{locked ? <LockedEvidenceBadge presentation={locked} /> : <span className="application-room-received">Received</span>}</article>;
}
type CodedResponseError = Error & { code?: string };
async function responseError(response: Response, fallback: string): Promise<CodedResponseError> {
  let detail: ReturnType<typeof clientApiErrorDetail> = { message: fallback };
  try { detail = clientApiErrorDetail(await response.json(), fallback); } catch { /* use the safe fallback */ }
  const error = new Error(detail.message) as CodedResponseError;
  if (detail.code) error.code = detail.code;
  return error;
}
function formatSize(size: number) { if (size < 1024) return `${size} B`; if (size < 1048576) return `${Math.round(size / 1024)} KB`; return `${(size / 1048576).toFixed(1)} MB`; }
function localFileKey(file: File) { return `${file.name}|${file.size}|${file.lastModified}`; }
function isUploadErrorStatus(value: string) { return /failed|could not|rejected|retry|no files/i.test(value); }
function allowsMultipleFiles(doc: RequestedDoc) { if (typeof doc.allow_multiple_files === "boolean") return doc.allow_multiple_files; return /bank statement|tax return|irs/i.test(doc.name); }
function hasDuplicateSingleUseDocs(files: QueuedFile[], docs: RequestedDoc[], repeatableIds: ReadonlySet<string>) { return hasDuplicateSingleUseUploadTargets(files, new Set(docs.filter((doc) => !allowsMultipleFiles(doc)).map((doc) => doc.id)), repeatableIds); }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recently"; }
function fileKindLabel(file: UploadedFile) { const value = `${file.content_type} ${file.file_name}`.toLowerCase(); if (value.includes("pdf")) return "PDF"; if (value.includes("image/")) return "Image"; if (/xls|spreadsheet/.test(value)) return "Spreadsheet"; if (value.includes("csv")) return "CSV"; return "Document"; }
