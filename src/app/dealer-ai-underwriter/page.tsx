"use client";

import type { CSSProperties, DragEvent, MutableRefObject, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QCMark } from "@/components/QCMark";
import { apiBase } from "@/lib/api";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

type RequestedDoc = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  required: boolean;
  allow_multiple_files?: boolean;
  status: string;
};

type UploadedFile = {
  id: string;
  requested_document_id?: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
};

type Intake = {
  id: string;
  bucket_id: string;
  status: string;
  full_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  loan_purpose?: string | null;
  requested_loan_amount?: number | null;
  estimated_credit_score?: number | null;
  referral_source?: string | null;
  asset_rows?: AssetRow[] | null;
  intake_state?: Record<string, unknown> | null;
  result_snapshot?: Record<string, unknown> | null;
};

type BookingSlot = {
  starts_at: string;
  label: string;
  date_label: string;
};

type Widget = {
  type:
    | "deal_profile"
    | "entity_structure"
    | "real_estate_schedule"
    | "upload_files"
    | "referral"
    | "run_review"
    | "bankability_result"
    | "book_call";
  title: string;
  description: string;
  missing_document_ids?: string[];
  slots?: BookingSlot[];
  host_name?: string;
  duration_min?: number;
  disabled_reason?: string;
  source?: "system_next_step" | "user_intent" | string;
  reason?: string;
};

type IntakeResponse = {
  intake: Intake;
  token?: string | null;
  resume_url?: string | null;
  upload_url?: string | null;
  assistant_message: string;
  widget?: null;
  requested_documents: RequestedDoc[];
  files: UploadedFile[];
  ai_summary?: Record<string, unknown> | null;
  latest_review?: { status: string; result?: Record<string, unknown> | null; error?: string | null } | null;
};

type AssetRow = {
  id?: string;
  address: string;
  estimated_loan_amount?: number | null;
  estimated_property_value?: number | null;
  notes?: string | null;
};

type EntityStructure = {
  primary_operating_entity: string;
  main_operating_bank_account: string;
  related_entities: string;
  relationship_explanation: string;
};

type WidgetType = Widget["type"];
type ChatLine = { id: string; role: "assistant" | "user"; content: string };
type QueuedFile = { id: string; file: File; status: "ready" | "uploading" | "uploaded" | "error"; message?: string };

function useCompactViewport() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return compact;
}

const initialContact = { full_name: "", email: "", phone: "", business_name: "" };
const initialEntity: EntityStructure = {
  primary_operating_entity: "",
  main_operating_bank_account: "",
  related_entities: "",
  relationship_explanation: "",
};

export default function DealerAIUnderwriterPage() {
  const compact = useCompactViewport();
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);
  const [token, setToken] = useState<string>("");
  const [contact, setContact] = useState(initialContact);
  const [deal, setDeal] = useState({ loan_purpose: "", requested_loan_amount: "", estimated_credit_score: "" });
  const [assets, setAssets] = useState<AssetRow[]>([{ id: cryptoId(), address: "", estimated_loan_amount: null, estimated_property_value: null, notes: "" }]);
  const [entity, setEntity] = useState<EntityStructure>(initialEntity);
  const [referral, setReferral] = useState("");
  const [response, setResponse] = useState<IntakeResponse | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatText, setChatText] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileDrawerOpen, setFileDrawerOpen] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [resumeEmail, setResumeEmail] = useState("");

  useEffect(() => {
    const urlToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
    if (!urlToken) return;
    setToken(urlToken);
    loadIntake(urlToken, true).catch((error) => setStatus(errorMessage(error)));
  }, []);

  useEffect(() => {
    if (!response) return;
    setDeal({
      loan_purpose: response.intake.loan_purpose ?? "",
      requested_loan_amount: response.intake.requested_loan_amount ? String(Math.round(response.intake.requested_loan_amount)) : "",
      estimated_credit_score: response.intake.estimated_credit_score ? String(response.intake.estimated_credit_score) : "",
    });
    setReferral(response.intake.referral_source ?? "");
    if (response.intake.asset_rows?.length) setAssets(response.intake.asset_rows.map((row) => ({ ...row, id: row.id || cryptoId() })));
    const savedEntity = asRecord(response.intake.intake_state?.entity_structure);
    if (savedEntity) {
      setEntity({
        primary_operating_entity: String(savedEntity.primary_operating_entity ?? ""),
        main_operating_bank_account: String(savedEntity.main_operating_bank_account ?? ""),
        related_entities: String(savedEntity.related_entities ?? ""),
        relationship_explanation: String(savedEntity.relationship_explanation ?? ""),
      });
    }
  }, [response]);

  const currentResult = response?.intake.result_snapshot ?? response?.latest_review?.result ?? null;
  const missingDocs = useMemo(() => {
    const uploadedIds = new Set(response?.files.map((file) => file.requested_document_id).filter(Boolean) ?? []);
    return (response?.requested_documents ?? []).filter((doc) => doc.required && !uploadedIds.has(doc.id));
  }, [response]);
  const pendingFiles = queuedFiles.filter((item) => item.status !== "uploaded");
  const hasQueuedUpload = queuedFiles.some((item) => item.status === "ready" || item.status === "error");
  const hasUploading = queuedFiles.some((item) => item.status === "uploading");
  const reviewStatus =
    hasUploading
      ? "Uploading"
      : status.toLowerCase().includes("analyzing")
        ? "Analyzing"
        : response?.latest_review?.status
          ? titleize(response.latest_review.status)
          : missingDocs.length
            ? "Needs baseline"
            : "Ready to review";
  const bankability = asRecord(response?.latest_review?.result?.bankability_assessment ?? response?.intake.result_snapshot?.bankability_assessment);
  const fundability = fundabilityBanner(currentResult, bankability);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${apiBase}/api/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(await responseMessage(res));
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  async function startIntake() {
    if (!contact.full_name.trim() || !contact.email.trim()) {
      setStatus("Full name and email are required before uploading documents.");
      return;
    }
    if (!legalAccepted) {
      setStatus("Accept the Terms and Privacy Policy before opening the secure intake.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const payload = await call<IntakeResponse>("/public/dealer-ai-intake/start", {
        method: "POST",
        body: JSON.stringify({
          full_name: contact.full_name.trim(),
          email: contact.email.trim(),
          phone: contact.phone.trim() || null,
          business_name: contact.business_name.trim() || null,
          terms_accepted: true,
          privacy_accepted: true,
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
        }),
      });
      applyResponse(payload, payload.token ?? "");
      pushAssistant(payload.assistant_message);
      if (payload.token && typeof window !== "undefined") {
        window.history.replaceState(null, "", `/dealer-ai-underwriter?token=${encodeURIComponent(payload.token)}`);
      }
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function requestResumeLink() {
    const email = (resumeEmail || contact.email).trim();
    if (!email) {
      setStatus("Enter your email and we will send the secure resume link if a file exists.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const payload = await call<{ ok: boolean; message: string }>("/public/dealer-ai-intake/resume-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setStatus(payload.message || "If a matching secure intake exists, a resume link has been sent.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadIntake(activeToken = token, fromResume = false) {
    const payload = await call<IntakeResponse>(`/public/dealer-ai-intake/${encodeURIComponent(activeToken)}`);
    applyResponse(payload, activeToken);
    if (fromResume) pushAssistant(payload.assistant_message);
  }

  async function sendChat(message?: string, updates?: Record<string, unknown>) {
    if (!token) return;
    const text = message ?? chatText.trim();
    if (text) pushUser(text);
    setChatText("");
    setBusy(true);
    setStatus("");
    try {
      const payload = await call<IntakeResponse>(`/public/dealer-ai-intake/${encodeURIComponent(token)}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: text || null, updates: updates ?? null }),
      });
      applyResponse(payload, token);
      pushAssistant(payload.assistant_message);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitDealProfile() {
    await sendChat("I updated the loan purpose, requested amount, and estimated credit score.", {
      loan_purpose: deal.loan_purpose.trim() || null,
      requested_loan_amount: numericOrNull(deal.requested_loan_amount),
      estimated_credit_score: numericOrNull(deal.estimated_credit_score),
    });
  }

  async function submitEntityStructure() {
    const cleaned = {
      primary_operating_entity: entity.primary_operating_entity.trim(),
      main_operating_bank_account: entity.main_operating_bank_account.trim(),
      related_entities: entity.related_entities.trim(),
      relationship_explanation: entity.relationship_explanation.trim(),
    };
    if (!Object.values(cleaned).some(Boolean)) {
      setStatus("Add the primary operating entity, bank account, or related-entity explanation.");
      return;
    }
    await sendChat("I clarified the dealer LLC and operating account structure.", { entity_structure: cleaned });
  }

  async function submitAssets() {
    const cleanRows = assets
      .map((row) => ({
        id: row.id || cryptoId(),
        address: row.address.trim(),
        estimated_loan_amount: row.estimated_loan_amount ?? null,
        estimated_property_value: row.estimated_property_value ?? null,
        notes: row.notes?.trim() || null,
      }))
      .filter((row) => row.address || row.estimated_loan_amount || row.estimated_property_value);
    if (!cleanRows.length) {
      setStatus("Add at least one real estate or asset row.");
      return;
    }
    await sendChat("I added the real estate and asset schedule.", { asset_rows: cleanRows });
  }

  async function submitReferral() {
    if (!referral.trim()) {
      setStatus("Enter who referred you, or type self.");
      return;
    }
    await sendChat("I added the referral source.", { referral_source: referral.trim() });
  }

  async function runReview() {
    if (!token) return;
    setBusy(true);
    setStatus("Running AI review. This can take a moment for large PDFs or spreadsheets.");
    try {
      const payload = await call<IntakeResponse>(`/public/dealer-ai-intake/${encodeURIComponent(token)}/run-review`, { method: "POST" });
      applyResponse(payload, token);
      pushAssistant(payload.assistant_message);
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function bookCall(startsAt: string) {
    if (!token) return;
    setBusy(true);
    setStatus("Booking call...");
    try {
      const payload = await call<IntakeResponse>(`/public/dealer-ai-intake/${encodeURIComponent(token)}/book-call`, {
        method: "POST",
        body: JSON.stringify({ starts_at: startsAt }),
      });
      applyResponse(payload, token);
      pushAssistant(payload.assistant_message);
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function addFiles(nextFiles: FileList | File[]) {
    setQueuedFiles((current) => {
      const seen = new Set(current.map((item) => localFileKey(item.file)));
      const incoming = Array.from(nextFiles)
        .filter((file) => {
          const key = localFileKey(file);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${cryptoId()}`,
          file,
          status: "ready" as const,
        }));
      return [...current, ...incoming];
    });
  }

  async function uploadQueuedFiles() {
    if (!token || !queuedFiles.some((item) => item.status === "ready" || item.status === "error")) return;
    setBusy(true);
    setStatus("Uploading files to secure storage...");
    let uploaded = 0;
    const uploadedIds = new Set<string>();
    try {
      for (const item of queuedFiles.filter((file) => file.status === "ready" || file.status === "error")) {
        updateQueuedFile(item.id, { status: "uploading", message: "Preparing upload" });
        try {
          const init = await call<{ file_id: string; upload_url: string; required_headers: Record<string, string> }>(
            `/public/dealer-ai-intake/${encodeURIComponent(token)}/files/upload-init`,
            {
              method: "POST",
              body: JSON.stringify({
                requested_document_id: null,
                file_name: item.file.name,
                content_type: item.file.type || "application/octet-stream",
                size_bytes: item.file.size,
              }),
            },
          );
          updateQueuedFile(item.id, { message: "Uploading encrypted file" });
          const put = await fetch(init.upload_url, { method: "PUT", body: item.file, headers: init.required_headers });
          if (!put.ok) throw new Error(`Secure storage rejected ${item.file.name}.`);
          updateQueuedFile(item.id, { message: "Confirming upload" });
          await call(`/public/dealer-ai-intake/${encodeURIComponent(token)}/files/complete`, {
            method: "POST",
            body: JSON.stringify({ file_id: init.file_id }),
          });
          uploaded += 1;
          uploadedIds.add(item.id);
          updateQueuedFile(item.id, { status: "uploaded", message: "Uploaded" });
        } catch (error) {
          updateQueuedFile(item.id, { status: "error", message: errorMessage(error) });
        }
      }
      await loadIntake();
      setQueuedFiles((current) => current.filter((item) => !uploadedIds.has(item.id)));
      if (uploaded > 0) {
        pushAssistant(`${uploaded} file${uploaded === 1 ? "" : "s"} uploaded. I am analyzing the file set now.`);
        setStatus("Analyzing uploaded files...");
        const payload = await call<IntakeResponse>(`/public/dealer-ai-intake/${encodeURIComponent(token)}/run-review`, { method: "POST" });
        applyResponse(payload, token);
        pushAssistant(payload.assistant_message);
      } else {
        pushAssistant("No files uploaded successfully. Correct the file errors and try again.");
      }
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function submitComposer() {
    if (!token || busy) return;
    const text = chatText.trim();
    const hasFilesToUpload = queuedFiles.some((item) => item.status === "ready" || item.status === "error");
    if (!text && !hasFilesToUpload) return;
    if (hasFilesToUpload) {
      await uploadQueuedFiles();
    }
    if (text) {
      await sendChat(text);
    }
  }

  function applyResponse(payload: IntakeResponse, activeToken: string) {
    setResponse(payload);
    if (activeToken) setToken(activeToken);
    setContact((current) => ({
      full_name: payload.intake.full_name || current.full_name,
      email: payload.intake.email || current.email,
      phone: payload.intake.phone || current.phone,
      business_name: payload.intake.business_name || current.business_name,
    }));
  }

  function updateQueuedFile(id: string, patch: Partial<QueuedFile>) {
    setQueuedFiles((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeQueuedFile(id: string) {
    setQueuedFiles((current) => current.filter((item) => item.id !== id));
  }

  function openFilePicker() {
    composerFileInputRef.current?.click();
  }

  function logoutRoom() {
    setToken("");
    setResponse(null);
    setChat([]);
    setChatText("");
    setQueuedFiles([]);
    setFileDrawerOpen(false);
    setStatus("You are logged out of this secure room. Use your emailed resume link to return.");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/dealer-ai-underwriter");
    }
  }

  function pushAssistant(content: string) {
    if (!content) return;
    setChat((current) => [...current, { id: cryptoId(), role: "assistant", content }]);
  }

  function pushUser(content: string) {
    setChat((current) => [...current, { id: cryptoId(), role: "user", content }]);
  }


  return (
    <main style={response ? (compact ? appViewportMobile : appViewport) : (compact ? pageMobile : page)}>
      <section style={response ? (compact ? appShellMobile : appShell) : (compact ? shellMobile : shell)}>
        {!response ? (
          <>
            <nav style={stepOneNav}>
              <div style={stepOneBrand}>
                <QCMark size={30} />
                <strong>Qualified Commercial</strong>
              </div>
              <div style={stepOneNavActions}>
                <span style={navPill}>AI Underwriter</span>
                <a style={loginPill} href="/login">Login</a>
              </div>
            </nav>

            <div style={stepOneHeading}>
              <div>
                <div style={tealEyebrow}>Qualified Commercial - Dealer Funding Review</div>
                <h1 style={stepOneTitle}>AI Underwriter</h1>
              </div>
              <div style={stepOneSecurePill}><span style={greenDot} />Encrypted uploads - Preliminary review</div>
            </div>

            <section style={stepOneHero}>
              <div style={stepOneCopy}>
                <div style={stepBadge}>Step 1 - Open your secure file</div>
                <h2 style={stepOneHeroTitle}>Tell us who you are - then the review runs in chat.</h2>
                <p style={stepOneLead}>
                  We open an encrypted file room in your name first, so nothing you share is ever lost. Then the full-doc funding review happens in one conversation - no forms, no portals.
                </p>
                <div style={checkList}>
                  {[
                    "A full-doc review that runs entirely in chat - no forms, no portals",
                    "Attach bank statements and financials straight into the conversation",
                    "An encrypted file room - everything you share is kept",
                    "A strict preliminary screen before any lender sees the file",
                  ].map((item) => (
                    <div key={item} style={checkItem}>
                      <span style={checkIcon}>{"\u2713"}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={stepOneFormColumn}>
                <ContactWidget
                  contact={contact}
                  setContact={setContact}
                  busy={busy}
                  legalAccepted={legalAccepted}
                  setLegalAccepted={setLegalAccepted}
                  onStart={() => startIntake().catch(() => undefined)}
                />
                <ResumeLinkWidget
                  email={resumeEmail}
                  setEmail={setResumeEmail}
                  busy={busy}
                  onSend={() => requestResumeLink().catch(() => undefined)}
                />
                {status ? <div style={statusBoxNoMargin}>{status}</div> : null}
              </div>
            </section>

            <section style={lockedPreview}>
              <div style={lockedChatGhost}>
                <div style={ghostLineWide} />
                <div style={ghostLineShort} />
                <div style={ghostGoldLine} />
                <div style={ghostLineMid} />
              </div>
              <div style={lockedBadge}>Locked - The full review runs in chat and unlocks after you start your file</div>
            </section>
          </>
        ) : (
          <>
            {!compact ? (
              <DealerSidebar
                response={response}
                missingDocs={missingDocs}
                reviewStatus={reviewStatus}
                onCopyResume={() => navigator.clipboard.writeText(response.resume_url || "")}
                onLogout={logoutRoom}
              />
            ) : null}

            <section style={compact ? appMainMobile : appMain}>
              {compact ? (
                <header style={workspaceHeaderMobile}>
                  <div style={brandGroupMobile}>
                    <QCMark size={30} />
                    <div style={{ minWidth: 0 }}>
                      <div style={eyebrowMobile}>Qualified Commercial AI Funding Review</div>
                      <h1 style={workspaceTitleMobile}>Dealer AI Underwriter</h1>
                    </div>
                  </div>
                  <button type="button" style={ghostButton} onClick={logoutRoom}>Logout</button>
                </header>
              ) : null}

              <div style={compact ? workspaceGridMobile : workspaceGrid}>
                <section style={compact ? chatPanelModernMobile : chatPanelModern}>
                  <div style={compact ? chatTopBarMobile : chatTopBar}>
                    <div>
                      <h2 style={sectionTitle}>Dealer AI Underwriter</h2>
                      <p style={muted}>Ask questions and attach PDFs, images, ZIPs, spreadsheets, or statements directly in chat.</p>
                    </div>
                    <div style={compact ? mobileActionRow : headerActionRow}>
                      <span style={statusPill}>{reviewStatus}</span>
                      {compact ? (
                        <button type="button" style={ghostButton} onClick={() => setFileDrawerOpen((open) => !open)}>
                          {fileDrawerOpen ? "Hide files" : `Files (${response.files.length})`}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {compact && fileDrawerOpen ? (
                    <FileDrawerPanel
                      response={response}
                      missingDocs={missingDocs}
                      pendingFiles={pendingFiles}
                      result={currentResult}
                      busy={busy}
                      fundability={fundability}
                      onAttachFiles={openFilePicker}
                      onRemoveQueuedFile={removeQueuedFile}
                      onUpload={() => uploadQueuedFiles().catch(() => undefined)}
                      compact
                    />
                  ) : null}
                  <div style={compact ? messagesModernMobile : messagesModern}>
                    {fundability ? <FundabilityBanner banner={fundability} /> : null}
                    {chat.map((line) => (
                      <div key={line.id} style={line.role === "assistant" ? assistantBubble : userBubble}>
                        {line.content}
                      </div>
                    ))}
                  </div>
                  {pendingFiles.length ? (
                    <AttachmentTray files={pendingFiles} compact={compact} onRemove={removeQueuedFile} />
                  ) : null}
                  <div style={compact ? composerMobile : composer}>
                    <button
                      type="button"
                      style={attachButton}
                      disabled={!token || busy}
                      aria-label="Attach files"
                      title="Attach files"
                      onClick={() => {
                        composerFileInputRef.current?.click();
                      }}
                    >
                      +
                    </button>
                    <input
                      ref={composerFileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) => {
                        if (event.target.files) {
                          addFiles(event.target.files);
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                    <input
                      style={composerInput}
                      value={chatText}
                      onChange={(event) => setChatText(event.target.value)}
                      placeholder="Message the underwriter or attach files..."
                      disabled={!token || busy}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (chatText.trim() || hasQueuedUpload)) {
                          submitComposer().catch(() => undefined);
                        }
                      }}
                    />
                    <button
                      type="button"
                      style={primaryButton}
                      disabled={!token || (!chatText.trim() && !hasQueuedUpload) || busy}
                      onClick={() => submitComposer().catch(() => undefined)}
                    >
                      {hasQueuedUpload ? (chatText.trim() ? "Upload & send" : "Upload") : "Send"}
                    </button>
                  </div>
                  {status ? <div style={statusBox}>{status}</div> : null}
                </section>

                {!compact ? (
                  <FileDrawerPanel
                    response={response}
                    missingDocs={missingDocs}
                    pendingFiles={pendingFiles}
                    result={currentResult}
                    busy={busy}
                    fundability={fundability}
                    onAttachFiles={openFilePicker}
                    onRemoveQueuedFile={removeQueuedFile}
                    onUpload={() => uploadQueuedFiles().catch(() => undefined)}
                  />
                ) : null}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function ContactWidget({
  contact,
  setContact,
  busy,
  legalAccepted,
  setLegalAccepted,
  onStart,
}: {
  contact: typeof initialContact;
  setContact: (value: typeof initialContact) => void;
  busy: boolean;
  legalAccepted: boolean;
  setLegalAccepted: (value: boolean) => void;
  onStart: () => void;
}) {
  return (
    <div style={stepOneFormCard}>
      <div>
        <h2 style={stepOneFormTitle}>Start secure intake</h2>
        <p style={stepOneFormCopy}>Takes under a minute. No credit pull to begin.</p>
      </div>
      <Field label="Full name" value={contact.full_name} onChange={(value) => setContact({ ...contact, full_name: value })} />
      <Field label="Email" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} />
      <div style={stepOneFormGrid}>
        <Field label="Phone" value={contact.phone} onChange={(value) => setContact({ ...contact, phone: value })} />
        <Field label="Dealership" value={contact.business_name} onChange={(value) => setContact({ ...contact, business_name: value })} />
      </div>
      <label style={legalCheckRow}>
        <input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} />
        <span>
          I agree to the <a style={inlineLink} href="/terms" target="_blank" rel="noreferrer">Terms and Conditions</a> and <a style={inlineLink} href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
        </span>
      </label>
      <button style={stepOneCta} disabled={busy} onClick={onStart}>{busy ? "Creating secure room..." : "Start my funding review ->"}</button>
      <div style={formTrustLine}>
        <span>Bank-grade encryption</span>
        <span>|</span>
        <span>No credit pull to start</span>
        <span>|</span>
        <span>Preliminary review only</span>
      </div>
    </div>
  );
}

function ResumeLinkWidget({ email, setEmail, busy, onSend }: { email: string; setEmail: (value: string) => void; busy: boolean; onSend: () => void }) {
  return (
    <div style={resumeCard}>
      <div>
        <strong>Already started?</strong>
        <p style={stepOneFormCopy}>Enter your email and we will send your secure resume link if a file exists.</p>
      </div>
      <div style={resumeGrid}>
        <input style={input} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@dealership.com" />
        <button type="button" style={secondaryButton} disabled={busy} onClick={onSend}>Send link</button>
      </div>
    </div>
  );
}

function EntityWidget({ entity, setEntity, busy, onSubmit }: { entity: EntityStructure; setEntity: (value: EntityStructure) => void; busy: boolean; onSubmit: () => void }) {
  return (
    <WidgetBox title="Dealer LLC and account structure" description="Dealers often operate through multiple LLCs. Clarify the main operating entity and how related accounts connect before underwriting.">
      <Field label="Primary operating LLC / entity" value={entity.primary_operating_entity} onChange={(value) => setEntity({ ...entity, primary_operating_entity: value })} placeholder="ABC Auto Sales LLC" />
      <Field label="Main operating bank account" value={entity.main_operating_bank_account} onChange={(value) => setEntity({ ...entity, main_operating_bank_account: value })} placeholder="Bank name and account purpose" />
      <TextAreaField label="Related LLCs / entities" value={entity.related_entities} onChange={(value) => setEntity({ ...entity, related_entities: value })} placeholder="List related dealership, real estate, holding, or floorplan entities" />
      <TextAreaField label="How accounts work together" value={entity.relationship_explanation} onChange={(value) => setEntity({ ...entity, relationship_explanation: value })} placeholder="Explain which entity receives sales deposits, pays expenses, owns real estate, or carries debt" />
      <button style={primaryWide} disabled={busy} onClick={onSubmit}>Save entity structure</button>
    </WidgetBox>
  );
}

function DealWidget({ deal, setDeal, busy, onSubmit }: { deal: { loan_purpose: string; requested_loan_amount: string; estimated_credit_score: string }; setDeal: (value: { loan_purpose: string; requested_loan_amount: string; estimated_credit_score: string }) => void; busy: boolean; onSubmit: () => void }) {
  return (
    <WidgetBox title="Essential funding facts" description="No product selection required. The AI uses these answers and your files to infer the likely path.">
      <Field label="Use of funds" value={deal.loan_purpose} onChange={(value) => setDeal({ ...deal, loan_purpose: value })} placeholder="Cash out, working capital, acquisition..." />
      <Field label="Requested loan amount" value={deal.requested_loan_amount} onChange={(value) => setDeal({ ...deal, requested_loan_amount: onlyDigits(value) })} placeholder="6000000" />
      <Field label="Estimated credit score" value={deal.estimated_credit_score} onChange={(value) => setDeal({ ...deal, estimated_credit_score: onlyDigits(value).slice(0, 3) })} placeholder="720" />
      <button style={primaryWide} disabled={busy} onClick={onSubmit}>Save profile</button>
    </WidgetBox>
  );
}

function AssetWidget({ assets, setAssets, busy, onSubmit }: { assets: AssetRow[]; setAssets: (rows: AssetRow[]) => void; busy: boolean; onSubmit: () => void }) {
  function update(index: number, patch: Partial<AssetRow>) {
    setAssets(assets.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }
  function remove(index: number) {
    const next = assets.filter((_, rowIndex) => rowIndex !== index);
    setAssets(next.length ? next : [{ id: cryptoId(), address: "", estimated_loan_amount: null, estimated_property_value: null, notes: "" }]);
  }
  return (
    <WidgetBox title="Add real estate collateral" description="Type each property line by line. You can also upload mortgage notes, but estimated value is still needed for the preliminary screen.">
      <div style={tableHeader}>
        <span>Full property address</span>
        <span>Amount owed</span>
        <span>Estimated value</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {assets.map((row, index) => (
          <div key={row.id || index} style={assetTableRow}>
            <input style={tableInput} value={row.address} onChange={(event) => update(index, { address: event.target.value })} placeholder="Full address" />
            <input style={tableInput} value={row.estimated_loan_amount ? String(row.estimated_loan_amount) : ""} onChange={(event) => update(index, { estimated_loan_amount: numericOrNull(event.target.value) })} placeholder="$ owed" inputMode="numeric" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input style={tableInput} value={row.estimated_property_value ? String(row.estimated_property_value) : ""} onChange={(event) => update(index, { estimated_property_value: numericOrNull(event.target.value) })} placeholder="$ value" inputMode="numeric" />
              <button style={iconButton} onClick={() => remove(index)} aria-label="Remove row">x</button>
            </div>
          </div>
        ))}
      </div>
      <div style={buttonRow}>
        <button style={secondaryButton} onClick={() => setAssets([...assets, { id: cryptoId(), address: "", estimated_loan_amount: null, estimated_property_value: null, notes: "" }])}>+ Add property</button>
        <button style={primaryButton} disabled={busy} onClick={onSubmit}>Save properties</button>
      </div>
    </WidgetBox>
  );
}

function UploadWidget(props: {
  requestedDocs: RequestedDoc[];
  missingDocs: RequestedDoc[];
  queuedFiles: QueuedFile[];
  onRemoveQueuedFile: (id: string) => void;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  dragging: boolean;
  setDragging: (value: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  addFiles: (files: FileList | File[]) => void;
  busy: boolean;
  onUpload: () => void;
}) {
  const { requestedDocs, missingDocs, queuedFiles, onRemoveQueuedFile, fileInputRef, dragging, setDragging, onDrop, addFiles, busy, onUpload } = props;
  const uploadedCount = requestedDocs.filter((doc) => !missingDocs.some((missing) => missing.id === doc.id)).length;
  const visibleQueue = queuedFiles.filter((item) => item.status !== "uploaded");
  return (
    <WidgetBox title="Upload baseline documents" description="Attach what you have now. You can keep chatting before every baseline item is uploaded.">
      <div style={baselineSummary}>
        <strong>{uploadedCount} uploaded | {missingDocs.length} missing</strong>
        <span>Baseline package only: taxes, current P&L, bank statements, real estate collateral, and applicable MCA/floorplan/inventory statements.</span>
      </div>
      <div style={chipWrap}>
        {requestedDocs.map((doc) => {
          const missing = missingDocs.some((item) => item.id === doc.id);
          return <span key={doc.id} style={missing ? missingChip : completeChip}>{missing ? "Needed" : "Uploaded"}: {doc.name}</span>;
        })}
      </div>
      <div
        style={{ ...dropZone, borderColor: dragging ? "#21d3c7" : "rgba(255,255,255,.16)", background: dragging ? "rgba(33,211,199,.12)" : "rgba(255,255,255,.035)" }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <strong>Add files</strong>
        <span>Drag documents here or click to choose files.</span>
        <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => event.target.files && addFiles(event.target.files)} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {visibleQueue.length ? visibleQueue.map((item) => (
          <div key={item.id} style={queueRow}>
            <div style={{ minWidth: 0 }}>
              <strong style={truncate}>{item.file.name}</strong>
              <span style={smallMuted}>{formatSize(item.file.size)} | {item.status}{item.message ? ` | ${item.message}` : ""}</span>
            </div>
            <span style={smallMuted}>AI will classify after upload</span>
            {item.status !== "uploading" ? (
              <button
                type="button"
                style={queueRemoveButton}
                aria-label={`Remove ${item.file.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveQueuedFile(item.id);
                }}
              >
                x
              </button>
            ) : (
              <span style={queueRemovePlaceholder} />
            )}
          </div>
        )) : <div style={emptyBox}>No local files selected yet.</div>}
      </div>
      <button style={primaryWide} disabled={busy || !queuedFiles.some((file) => file.status === "ready" || file.status === "error")} onClick={onUpload}>
        {busy ? "Uploading..." : "Upload selected files"}
      </button>
    </WidgetBox>
  );
}

function ReferralWidget({ referral, setReferral, busy, onSubmit }: { referral: string; setReferral: (value: string) => void; busy: boolean; onSubmit: () => void }) {
  return (
    <WidgetBox title="Referral credit" description="Tell us who referred you to this link so the correct person gets credit.">
      <Field label="Who referred you?" value={referral} onChange={setReferral} placeholder="Name, email, company, or self" />
      <button style={primaryWide} disabled={busy} onClick={onSubmit}>Save referral</button>
    </WidgetBox>
  );
}

function RunReviewWidget({ busy, hasResult, onRun }: { busy: boolean; hasResult: boolean; onRun: () => void }) {
  return (
    <WidgetBox title={hasResult ? "Refresh AI review" : "Run preliminary AI review"} description="The AI reads the baseline file only, classifies fundable, not fundable, or cannot determine, and does not ask for unlimited extra documents.">
      <button style={primaryWide} disabled={busy} onClick={onRun}>{busy ? "Reviewing..." : hasResult ? "Re-run with current files" : "Run preliminary screen"}</button>
    </WidgetBox>
  );
}

function BookCallWidget({ widget, busy, onBook }: { widget: Widget | null; busy: boolean; onBook: (startsAt: string) => void }) {
  const slots = widget?.slots ?? [];
  return (
    <WidgetBox title="Book underwriting call" description={widget?.description || "Choose a time to validate the preliminary screen with Qualified Commercial."}>
      {widget?.disabled_reason ? <div style={emptyBox}>{widget.disabled_reason}</div> : null}
      {slots.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {slots.map((slot) => (
            <button key={slot.starts_at} style={slotButton} disabled={busy} onClick={() => onBook(slot.starts_at)}>
              <strong>{slot.date_label}</strong>
              <span>{slot.label} | {widget?.duration_min ?? 30} min</span>
            </button>
          ))}
        </div>
      ) : null}
    </WidgetBox>
  );
}

function ResultWidget({
  result,
  bankability,
  busy,
  onRun,
}: {
  result: Record<string, unknown> | null;
  bankability: Record<string, unknown> | null;
  busy: boolean;
  onRun: () => void;
}) {
  const missing = arrayOfRecords(result?.missing_or_incomplete_items);
  const gaps = arrayOfRecords(result?.proof_of_funds_financial_collateral_gaps);
  return (
    <WidgetBox title="Preliminary result" description="This is a file screen, not a commitment to lend.">
      <div style={resultCard}>
        <div style={eyebrow}>Status</div>
        <strong style={resultStatus}>{String(bankability?.status || "Review completed")}</strong>
        <p style={muted}>{String(bankability?.reason || result?.executive_summary || "Review the missing items and next steps.")}</p>
      </div>
      <ListBlock title="Missing or incomplete" items={missing} />
      <ListBlock title="Financial / collateral gaps" items={gaps} />
      <button style={secondaryButton} disabled={busy} onClick={onRun}>{busy ? "Reviewing..." : "Re-run with current files"}</button>
    </WidgetBox>
  );
}

function CompactRoomStatus({ response, missingDocs, compact = false }: { response: IntakeResponse; missingDocs: RequestedDoc[]; compact?: boolean }) {
  return (
    <div style={compact ? roomStatusStripMobile : roomStatusStrip}>
      <div>
        <div style={compact ? eyebrowMobile : eyebrow}>Secure bucket created</div>
        <strong style={compact ? roomNameMobile : undefined}>{response.intake.business_name || response.intake.full_name}</strong>
        <p style={smallMuted}>{response.files.length} uploaded | {missingDocs.length} missing | {response.intake.status}</p>
      </div>
      <div style={compact ? compactMetricsMobile : compactMetrics}>
        <Metric value={response.intake.estimated_credit_score ? String(response.intake.estimated_credit_score) : "TBD"} label="est. credit" />
        <Metric value={response.files.length.toString()} label="files" />
      </div>
    </div>
  );
}

function DealerSidebar({
  response,
  missingDocs,
  reviewStatus,
  onCopyResume,
  onLogout,
}: {
  response: IntakeResponse;
  missingDocs: RequestedDoc[];
  reviewStatus: string;
  onCopyResume: () => void;
  onLogout: () => void;
}) {
  return (
    <aside style={dealerSidebar}>
      <div style={sidebarBrand}>
        <QCMark size={30} />
        <div>
          <strong>Qualified Commercial</strong>
          <span>Dealer funding room</span>
        </div>
      </div>

      <nav style={sidebarNav} aria-label="Dealer AI room">
        <div style={sidebarNavItemActive}>
          <span>Underwriter chat</span>
          <small>{reviewStatus}</small>
        </div>
        <div style={sidebarNavItem}>
          <span>Files drawer</span>
          <small>{response.files.length} uploaded</small>
        </div>
      </nav>

      <div style={sidebarSection}>
        <div style={sidebarSectionTitle}>Pinned</div>
        <div style={sidebarMiniCard}>
          <strong>{response.intake.business_name || response.intake.full_name}</strong>
          <span>{response.files.length} files | {missingDocs.length} missing</span>
        </div>
        <div style={sidebarMiniCard}>
          <strong>Baseline package</strong>
          <span>Taxes, P&L, bank statements, real estate schedule</span>
        </div>
      </div>

      <div style={sidebarFooter}>
        {response.resume_url ? <button type="button" style={sidebarFooterButton} onClick={onCopyResume}>Copy resume link</button> : null}
        <button type="button" style={sidebarFooterButton} onClick={onLogout}>Logout</button>
      </div>
    </aside>
  );
}

function AttachmentTray({ files, compact, onRemove }: { files: QueuedFile[]; compact: boolean; onRemove: (id: string) => void }) {
  return (
    <div style={compact ? attachmentTrayMobile : attachmentTray}>
      <div style={attachmentTrayHeader}>
        <strong>{files.length} pending attachment{files.length === 1 ? "" : "s"}</strong>
        <span>Files are encrypted when uploaded.</span>
      </div>
      <div style={attachmentList}>
        {files.map((item) => (
          <div key={item.id} style={attachmentPill}>
            <span style={truncate}>{item.file.name}</span>
            <span style={smallMuted}>{item.status}</span>
            {item.status !== "uploading" ? (
              <button
                type="button"
                style={attachmentRemove}
                aria-label={`Remove ${item.file.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(item.id);
                }}
              >
                x
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolSuggestionCard({ widget, onOpen }: { widget: Widget; onOpen: () => void }) {
  return (
    <div style={toolSuggestionCard}>
      <div style={toolSuggestionIcon}>{toolIcon(widget.type)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={toolSuggestionTitle}>{widget.title}</div>
        <p style={toolSuggestionCopy}>{widget.description || widget.reason || "Use this when you are ready."}</p>
      </div>
      <button type="button" style={toolSuggestionButton} onClick={onOpen}>
        {toolCta(widget.type)}
      </button>
    </div>
  );
}

function FileDrawerPanel({
  response,
  missingDocs,
  pendingFiles,
  result,
  busy,
  fundability,
  onAttachFiles,
  onRemoveQueuedFile,
  onUpload,
  compact = false,
}: {
  response: IntakeResponse;
  missingDocs: RequestedDoc[];
  pendingFiles: QueuedFile[];
  result: Record<string, unknown> | null;
  busy: boolean;
  fundability: FundabilityBannerData | null;
  onAttachFiles: () => void;
  onRemoveQueuedFile: (id: string) => void;
  onUpload: () => void;
  compact?: boolean;
}) {
  const docsById = new Map(response.requested_documents.map((doc) => [doc.id, doc]));
  const readyCount = pendingFiles.filter((file) => file.status === "ready" || file.status === "error").length;
  const evidenceByFileId = evidenceMapByFileId(result);
  return (
    <section style={compact ? fileDrawerPanelMobile : fileDrawerPanel}>
      <div style={sideCardHeader}>
        <div>
          <div style={sideEyebrow}>Files</div>
          <h2 style={sideTitle}>Uploaded evidence</h2>
        </div>
        <button type="button" style={miniButton} onClick={onAttachFiles}>Attach</button>
      </div>

      {fundability ? <FundabilityBanner banner={fundability} /> : null}

      <div style={bucketMetrics}>
        <Metric value={response.files.length.toString()} label="uploaded" />
        <Metric value={missingDocs.length.toString()} label="missing" />
      </div>

      {pendingFiles.length ? (
        <div style={sideSection}>
          <div style={sideSectionHeader}>
            <strong>Pending upload</strong>
            <button type="button" style={miniButton} disabled={busy || readyCount === 0} onClick={onUpload}>
              Upload {readyCount || ""}
            </button>
          </div>
          <div style={sideList}>
            {pendingFiles.map((item) => (
              <div key={item.id} style={pendingFileCard}>
                <div style={{ minWidth: 0 }}>
                  <strong style={truncate}>{item.file.name}</strong>
                  <span style={smallMuted}>{formatSize(item.file.size)} | {item.status}{item.message ? ` | ${item.message}` : ""}</span>
                </div>
                <div style={pendingControls}>
                  <span style={smallMuted}>AI will classify after upload</span>
                  {item.status !== "uploading" ? (
                    <button
                      type="button"
                      style={queueRemoveButton}
                      aria-label={`Remove ${item.file.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemoveQueuedFile(item.id);
                      }}
                    >
                      x
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={sideSection}>
        <div style={sideSectionHeader}>
          <strong>All bucket files</strong>
          <span style={smallMuted}>{response.files.length} submitted</span>
        </div>
        <div style={sideList}>
          {response.files.length ? response.files.map((file) => {
            const doc = file.requested_document_id ? docsById.get(file.requested_document_id) : null;
            const evidence = evidenceByFileId.get(file.id);
            return (
              <div key={file.id} style={uploadedFileCard}>
                <div style={fileTypeBadge}>{fileLabel(file)}</div>
                <div style={{ minWidth: 0 }}>
                  <strong style={truncate}>{file.file_name}</strong>
                  <span style={smallMuted}>{evidence?.classification || doc?.name || "Let AI classify"} | {formatSize(file.size_bytes)} | {formatDate(file.created_at)}</span>
                  {evidence?.supports ? <span style={evidenceLine}>{evidence.supports}</span> : null}
                </div>
              </div>
            );
          }) : <div style={emptyBox}>No uploaded files yet. Attach files in chat and they will appear here after submission.</div>}
        </div>
      </div>

      <div style={sideSection}>
        <div style={sideSectionHeader}>
          <strong>Needs baseline</strong>
          <span style={missingDocs.length ? warningText : smallMuted}>{missingDocs.length} open</span>
        </div>
        <div style={chipWrap}>
          {missingDocs.length ? missingDocs.map((doc) => <span key={doc.id} style={missingChip}>{doc.name}</span>) : <span style={completeChip}>Baseline package uploaded</span>}
        </div>
      </div>
    </section>
  );
}

type FileEvidence = { classification: string; supports: string };

function evidenceMapByFileId(result: Record<string, unknown> | null): Map<string, FileEvidence> {
  const output = new Map<string, FileEvidence>();
  const evidenceMap = asRecord(result?.document_evidence_map);
  for (const item of arrayOfRecords(evidenceMap?.files)) {
    const id = String(item.file_id || "");
    if (!id) continue;
    const supports = Array.isArray(item.supports) ? item.supports.map((value) => String(value)).filter(Boolean).slice(0, 2).join(" | ") : "";
    output.set(id, {
      classification: humanizeClassification(String(item.ai_classification || item.document_type || "AI classified")),
      supports,
    });
  }
  return output;
}

function humanizeClassification(value: string): string {
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) return "AI classified";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

type FundabilityBannerData = {
  tone: "green" | "red" | "amber";
  label: string;
  title: string;
  detail: string;
};

function FundabilityBanner({ banner }: { banner: FundabilityBannerData }) {
  const style = banner.tone === "green" ? fundableGreen : banner.tone === "red" ? fundableRed : fundableAmber;
  return (
    <div style={{ ...fundabilityBannerBase, ...style }}>
      <div>
        <div style={fundabilityLabel}>{banner.label}</div>
        <strong>{banner.title}</strong>
        <p>{banner.detail}</p>
      </div>
    </div>
  );
}

function toolCta(type: WidgetType): string {
  switch (type) {
    case "upload_files":
      return "Add files";
    case "real_estate_schedule":
      return "Enter schedule";
    case "entity_structure":
      return "Clarify";
    case "deal_profile":
      return "Add facts";
    case "referral":
      return "Add referral";
    case "run_review":
      return "Run screen";
    case "bankability_result":
      return "View result";
    case "book_call":
      return "Pick time";
    default:
      return "Open";
  }
}

function toolIcon(type: WidgetType): string {
  switch (type) {
    case "upload_files":
      return "+";
    case "real_estate_schedule":
      return "$";
    case "entity_structure":
      return "LLC";
    case "book_call":
      return "Cal";
    case "bankability_result":
      return "AI";
    default:
      return ">";
  }
}

function ReviewSidePanel({ result, bankability, reviewStatus, onOpenReview }: { result: Record<string, unknown> | null; bankability: Record<string, unknown> | null; reviewStatus: string; onOpenReview: () => void }) {
  const summary = String(bankability?.reason || result?.executive_summary || "Upload files and run the preliminary screen to generate an underwriting summary.");
  return (
    <section style={sideCard}>
      <div style={sideCardHeader}>
        <div>
          <div style={sideEyebrow}>Review</div>
          <h2 style={sideTitle}>AI analysis</h2>
        </div>
        <span style={statusPill}>{reviewStatus}</span>
      </div>
      <div style={resultCard}>
        <div style={eyebrow}>Preliminary status</div>
        <strong style={resultStatus}>{String(bankability?.status || (result ? "Review ready" : "No review yet"))}</strong>
        <p style={muted}>{summary}</p>
      </div>
      {result ? (
        <button type="button" style={primaryWide} onClick={onOpenReview}>Open review in chat</button>
      ) : (
        <div style={emptyBox}>The review will update automatically after files upload, and you can also ask the AI for the next step in chat.</div>
      )}
    </section>
  );
}

function WidgetBox({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section style={widgetBox}>
      <h2 style={sectionTitle}>{title}</h2>
      <p style={muted}>{description}</p>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label style={fieldWrap}>
      <span style={labelStyle}>{label}</span>
      <input style={input} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label style={fieldWrap}>
      <span style={labelStyle}>{label}</span>
      <textarea style={textarea} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div style={metric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: Record<string, unknown>[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <strong>{title}</strong>
      {items.length ? items.slice(0, 5).map((item, index) => (
        <div key={`${title}-${index}`} style={emptyBox}>
          <strong>{String(item.title || item.question || "Item")}</strong>
          <div style={smallMuted}>{String(item.detail || item.reason || item.instructions || "")}</div>
        </div>
      )) : <div style={emptyBox}>No items listed.</div>}
    </div>
  );
}

function numericOrNull(value: string): number | null {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function cryptoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function localFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Uploaded";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function titleize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function fileLabel(file: UploadedFile): string {
  const name = file.file_name.toLowerCase();
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "XLS";
  if (name.endsWith(".csv")) return "CSV";
  if (file.content_type.startsWith("image/")) return "IMG";
  return "FILE";
}

function fundabilityBanner(result: Record<string, unknown> | null, bankability: Record<string, unknown> | null): FundabilityBannerData | null {
  if (!result && !bankability) return null;
  const rawStatus = String(bankability?.status || result?.status || "Preliminary review").trim();
  const reason = String(bankability?.reason || result?.executive_summary || "Review the AI screen in chat for the current underwriting position.");
  const normalized = `${rawStatus} ${reason}`.toLowerCase();
  if (normalized.includes("not fundable") || normalized.includes("not bankable") || normalized.includes("decline") || normalized.includes("unfundable")) {
    return {
      tone: "red",
      label: "Preliminary screen",
      title: rawStatus || "Not fundable",
      detail: reason,
    };
  }
  if (normalized.includes("cannot") || normalized.includes("incomplete") || normalized.includes("missing") || normalized.includes("determine")) {
    return {
      tone: "amber",
      label: "Preliminary screen",
      title: rawStatus || "Cannot determine yet",
      detail: reason,
    };
  }
  if (normalized.includes("fundable") || normalized.includes("bankable") || normalized.includes("likely") || normalized.includes("qualified")) {
    return {
      tone: "green",
      label: "Preliminary screen",
      title: rawStatus || "Likely fundable",
      detail: reason,
    };
  }
  return {
    tone: "amber",
    label: "Preliminary screen",
    title: rawStatus || "Review ready",
    detail: reason,
  };
}

async function responseMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body.detail === "string" ? body.detail : `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

const page: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 18% 8%, rgba(33,211,199,.18), transparent 28%), radial-gradient(circle at 86% 0%, rgba(212,175,55,.18), transparent 26%), #060B1A",
  color: "#E2E8F0",
  padding: "0 24px 28px",
};
const shell: CSSProperties = { maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18 };
const pageMobile: CSSProperties = {
  ...page,
  padding: "10px 12px 18px",
  background:
    "radial-gradient(circle at 0% 0%, rgba(33,211,199,.14), transparent 30%), radial-gradient(circle at 100% 0%, rgba(212,175,55,.12), transparent 28%), #060B1A",
};
const shellMobile: CSSProperties = { ...shell, maxWidth: "100%", gap: 12 };
const appViewport: CSSProperties = {
  height: "100dvh",
  overflow: "hidden",
  background: "#070707",
  color: "#F8FAFC",
};
const appViewportMobile: CSSProperties = {
  ...appViewport,
  background:
    "radial-gradient(circle at 0% 0%, rgba(33,211,199,.12), transparent 34%), #05060A",
};
const appShell: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "236px minmax(0, 1fr)",
  background: "#070707",
};
const appShellMobile: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "minmax(0,1fr)",
  padding: 8,
};
const stepOneNav: CSSProperties = {
  minHeight: 54,
  borderBottom: "1px solid rgba(255,255,255,.08)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  padding: "0 2px",
};
const stepOneBrand: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  color: "#F8FAFC",
  fontSize: 13,
};
const stepOneNavActions: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const navPill: CSSProperties = {
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 999,
  minHeight: 32,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  color: "#D9E5F5",
  background: "rgba(255,255,255,.035)",
  fontSize: 12,
  fontWeight: 900,
};
const loginPill: CSSProperties = {
  ...navPill,
  background: "linear-gradient(135deg,#F3E28D,#D7B83E)",
  borderColor: "transparent",
  color: "#0B1326",
  textDecoration: "none",
  padding: "0 18px",
};
const stepOneHeading: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap",
  paddingTop: 10,
};
const tealEyebrow: CSSProperties = {
  color: "#68E6DA",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1.7,
  textTransform: "uppercase",
};
const stepOneTitle: CSSProperties = {
  margin: "6px 0 0",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "clamp(32px,4vw,44px)",
  fontWeight: 600,
  letterSpacing: 0,
  color: "#F6F8FB",
};
const stepOneSecurePill: CSSProperties = {
  border: "1px solid rgba(212,175,55,.45)",
  borderRadius: 999,
  background: "rgba(212,175,55,.08)",
  color: "#F5E49A",
  minHeight: 30,
  padding: "0 14px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  fontWeight: 900,
};
const greenDot: CSSProperties = { width: 6, height: 6, borderRadius: 999, background: "#35E3B2", display: "inline-block" };
const stepOneHero: CSSProperties = {
  border: "1px solid rgba(77,135,183,.32)",
  borderRadius: 24,
  background:
    "linear-gradient(135deg, rgba(10,28,55,.96), rgba(8,20,42,.95) 52%, rgba(8,18,36,.98)), radial-gradient(circle at 50% 20%, rgba(33,211,199,.13), transparent 30%)",
  minHeight: 470,
  padding: "42px clamp(22px,4vw,52px)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))",
  gap: "clamp(24px,5vw,70px)",
  alignItems: "center",
  boxShadow: "0 30px 100px rgba(0,0,0,.36)",
};
const stepOneCopy: CSSProperties = { display: "grid", gap: 18, maxWidth: 620 };
const stepBadge: CSSProperties = {
  justifySelf: "start",
  border: "1px solid rgba(212,175,55,.45)",
  borderRadius: 999,
  background: "rgba(212,175,55,.08)",
  color: "#F5E49A",
  padding: "7px 13px",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1.4,
  textTransform: "uppercase",
};
const stepOneHeroTitle: CSSProperties = {
  margin: 0,
  color: "#F8FAFC",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "clamp(34px,4.6vw,52px)",
  fontWeight: 600,
  lineHeight: 1.07,
  letterSpacing: 0,
};
const stepOneLead: CSSProperties = { margin: 0, maxWidth: 560, color: "#B6C4D7", fontSize: 16, lineHeight: 1.65 };
const checkList: CSSProperties = { display: "grid", gap: 12, marginTop: 2 };
const checkItem: CSSProperties = { display: "grid", gridTemplateColumns: "22px 1fr", gap: 10, alignItems: "start", color: "#D7E2F1", fontSize: 14, lineHeight: 1.35 };
const checkIcon: CSSProperties = {
  width: 16,
  height: 16,
  border: "1px solid rgba(45,225,213,.65)",
  borderRadius: 4,
  color: "#64E3D7",
  background: "rgba(45,225,213,.12)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 900,
};
const stepOneFormColumn: CSSProperties = { display: "grid", gap: 12 };
const stepOneFormCard: CSSProperties = {
  border: "1px solid rgba(212,175,55,.38)",
  borderRadius: 20,
  background: "rgba(12,29,55,.94)",
  padding: "28px 28px 24px",
  display: "grid",
  gap: 15,
  boxShadow: "0 22px 70px rgba(0,0,0,.38)",
};
const stepOneFormTitle: CSSProperties = { margin: 0, color: "#F8FAFC", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 22, letterSpacing: 0 };
const stepOneFormCopy: CSSProperties = { margin: "6px 0 0", color: "#9DABC0", fontSize: 13, lineHeight: 1.4 };
const stepOneFormGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 10 };
const stepOneCta: CSSProperties = {
  border: 0,
  borderRadius: 999,
  minHeight: 48,
  background: "linear-gradient(135deg,#F2E58F,#D8B533)",
  color: "#081122",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 15,
};
const formTrustLine: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 8,
  flexWrap: "wrap",
  color: "#8FA0B8",
  fontSize: 11,
  fontWeight: 700,
};
const legalCheckRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px minmax(0,1fr)",
  gap: 10,
  alignItems: "start",
  color: "#B8C4D6",
  fontSize: 12,
  lineHeight: 1.45,
};
const inlineLink: CSSProperties = { color: "#F5E49A", fontWeight: 900, textDecoration: "none" };
const resumeCard: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  background: "rgba(255,255,255,.045)",
  padding: 16,
  display: "grid",
  gap: 12,
};
const resumeGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" };
const lockedPreview: CSSProperties = {
  minHeight: 220,
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 20,
  background: "rgba(8,14,32,.66)",
  position: "relative",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
};
const lockedChatGhost: CSSProperties = {
  position: "absolute",
  inset: 34,
  borderRadius: 18,
  background: "linear-gradient(135deg,rgba(33,211,199,.06),rgba(212,175,55,.06))",
  filter: "blur(7px)",
  opacity: .65,
};
const ghostLineWide: CSSProperties = { position: "absolute", left: "8%", top: "20%", width: "28%", height: 14, borderRadius: 999, background: "rgba(99,231,218,.18)" };
const ghostLineShort: CSSProperties = { position: "absolute", left: "8%", top: "55%", width: "34%", height: 10, borderRadius: 999, background: "rgba(255,255,255,.13)" };
const ghostGoldLine: CSSProperties = { position: "absolute", left: "52%", top: "36%", width: "40%", height: 26, borderRadius: 999, background: "rgba(212,175,55,.22)" };
const ghostLineMid: CSSProperties = { position: "absolute", left: "58%", top: "76%", width: "26%", height: 10, borderRadius: 999, background: "rgba(255,255,255,.13)" };
const lockedBadge: CSSProperties = {
  position: "relative",
  zIndex: 1,
  border: "1px solid rgba(212,175,55,.45)",
  borderRadius: 999,
  background: "rgba(8,14,32,.82)",
  color: "#F5E49A",
  padding: "10px 18px",
  fontSize: 12,
  fontWeight: 900,
  textAlign: "center",
};
const header: CSSProperties = {
  minHeight: 74,
  padding: "0 18px",
  border: "1px solid rgba(255,255,255,.09)",
  borderRadius: 18,
  background: "rgba(6,11,26,.78)",
  backdropFilter: "blur(18px)",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
};
const brandGroup: CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
const eyebrow: CSSProperties = { color: "#E9D58A", fontSize: 12, fontWeight: 900, letterSpacing: 0, textTransform: "uppercase" };
const title: CSSProperties = { margin: 0, fontSize: 34, letterSpacing: 0, color: "#F6F8FB", fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 600 };
const securePill: CSSProperties = {
  border: "1px solid rgba(212,175,55,.28)",
  background: "rgba(212,175,55,.08)",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 800,
  color: "#E9D58A",
};
const headerMobile: CSSProperties = {
  ...header,
  minHeight: "auto",
  padding: 12,
  borderRadius: 16,
  gap: 10,
  alignItems: "flex-start",
};
const brandGroupMobile: CSSProperties = { ...brandGroup, gap: 10, minWidth: 0, alignItems: "center" };
const eyebrowMobile: CSSProperties = { ...eyebrow, fontSize: 10, lineHeight: 1.2 };
const titleMobile: CSSProperties = {
  ...title,
  fontSize: 22,
  lineHeight: 1.08,
  maxWidth: 280,
};
const securePillMobile: CSSProperties = {
  ...securePill,
  width: "100%",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 12,
  textAlign: "center",
};
const workspaceHeader: CSSProperties = {
  zIndex: 20,
  minHeight: 58,
  padding: "8px 18px",
  borderBottom: "1px solid rgba(255,255,255,.08)",
  background: "rgba(5,6,10,.94)",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
};
const workspaceHeaderMobile: CSSProperties = {
  ...workspaceHeader,
  minHeight: "auto",
  padding: 10,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,.10)",
  display: "grid",
  gap: 10,
};
const workspaceTitle: CSSProperties = { margin: 0, fontSize: 24, letterSpacing: 0, color: "#F6F8FB", fontWeight: 900 };
const workspaceTitleMobile: CSSProperties = { ...workspaceTitle, fontSize: 18, lineHeight: 1.1, overflowWrap: "anywhere" };
const workspaceMeta: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" };
const workspaceMetaMobile: CSSProperties = { ...workspaceMeta, justifyContent: "stretch", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))" };
const statusPill: CSSProperties = {
  border: "1px solid rgba(33,211,199,.25)",
  background: "rgba(33,211,199,.10)",
  color: "#BFFCF7",
  borderRadius: 999,
  minHeight: 30,
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};
const metricPill: CSSProperties = {
  ...statusPill,
  borderColor: "rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.05)",
  color: "#D9E5F5",
};
const warningPill: CSSProperties = {
  ...statusPill,
  borderColor: "rgba(212,175,55,.35)",
  background: "rgba(212,175,55,.10)",
  color: "#F6E7A6",
};
const mobileTabs: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3,minmax(0,1fr))",
  gap: 8,
  zIndex: 15,
  padding: 6,
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 999,
  background: "rgba(6,11,26,.88)",
  backdropFilter: "blur(16px)",
};
const mobileTab: CSSProperties = {
  border: 0,
  borderRadius: 999,
  minHeight: 36,
  background: "transparent",
  color: "#9DABC0",
  fontWeight: 900,
  cursor: "pointer",
};
const mobileTabActive: CSSProperties = {
  ...mobileTab,
  background: "rgba(33,211,199,.14)",
  color: "#D9FFFB",
  boxShadow: "inset 0 0 0 1px rgba(33,211,199,.32)",
};
const workspaceGrid: CSSProperties = {
  minHeight: 0,
  height: "100%",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 380px)",
  gap: 16,
  alignItems: "start",
  overflow: "hidden",
};
const workspaceGridMobile: CSSProperties = { minHeight: 0, display: "grid", gap: 8, overflow: "hidden" };
const appMain: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "minmax(0,1fr)",
  overflow: "hidden",
};
const appMainMobile: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "auto minmax(0,1fr)",
  gap: 8,
  overflow: "hidden",
};
const sideRail: CSSProperties = { minHeight: 0, height: "100%", display: "grid", gap: 14, alignSelf: "stretch", overflowY: "auto", paddingRight: 2 };
const chatPanelModern: CSSProperties = {
  minHeight: 0,
  height: "100%",
  background: "transparent",
  border: 0,
  borderRadius: 0,
  display: "grid",
  gridTemplateRows: "auto 1fr auto auto",
  overflow: "hidden",
  boxShadow: "none",
};
const chatPanelModernMobile: CSSProperties = {
  ...chatPanelModern,
  borderRadius: 16,
};
const chatTopBar: CSSProperties = {
  padding: "16px min(7vw,92px) 10px",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};
const chatTopBarMobile: CSSProperties = { ...chatTopBar, padding: 12, display: "grid", alignItems: "stretch" };
const messagesModern: CSSProperties = { minHeight: 0, padding: "22px min(7vw,92px)", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" };
const messagesModernMobile: CSSProperties = { ...messagesModern, padding: 12 };
const dealerSidebar: CSSProperties = {
  height: "100%",
  minHeight: 0,
  borderRight: "1px solid rgba(255,255,255,.08)",
  background: "#000",
  padding: 14,
  display: "grid",
  gridTemplateRows: "auto auto 1fr auto",
  gap: 16,
  overflow: "hidden",
};
const sidebarBrand: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0,1fr)",
  gap: 10,
  alignItems: "center",
  color: "#F8FAFC",
  fontSize: 13,
};
const sidebarNewButton: CSSProperties = {
  minHeight: 38,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.06)",
  color: "#F8FAFC",
  fontWeight: 900,
  cursor: "pointer",
  textAlign: "left",
  padding: "0 12px",
};
const sidebarNav: CSSProperties = { display: "grid", gap: 4 };
const sidebarNavItem: CSSProperties = {
  border: 0,
  borderRadius: 10,
  background: "transparent",
  color: "#F8FAFC",
  minHeight: 46,
  padding: "7px 10px",
  display: "grid",
  gap: 2,
  textAlign: "left",
  cursor: "pointer",
};
const sidebarNavItemActive: CSSProperties = {
  ...sidebarNavItem,
  background: "rgba(255,255,255,.10)",
};
const sidebarSection: CSSProperties = { minHeight: 0, display: "grid", alignContent: "start", gap: 8, overflowY: "auto" };
const sidebarSectionTitle: CSSProperties = {
  color: "#8FA0B8",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  marginTop: 4,
};
const sidebarMiniCard: CSSProperties = {
  borderRadius: 10,
  padding: "8px 10px",
  color: "#E2E8F0",
  display: "grid",
  gap: 3,
  background: "transparent",
};
const sidebarFooter: CSSProperties = { display: "grid", gap: 8 };
const sidebarFooterButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 10,
  minHeight: 34,
  padding: "0 10px",
  background: "rgba(255,255,255,.045)",
  color: "#E2E8F0",
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  fontWeight: 800,
  cursor: "pointer",
};
const intakeStart: CSSProperties = {
  minHeight: "calc(100vh - 148px)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))",
  gap: 20,
  alignItems: "stretch",
};
const intakeCopy: CSSProperties = {
  border: "1px solid rgba(255,255,255,.09)",
  borderRadius: 18,
  background:
    "linear-gradient(135deg,rgba(33,211,199,.10),rgba(255,255,255,.025) 44%,rgba(212,175,55,.08))",
  padding: 34,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 22,
  boxShadow: "0 30px 90px rgba(0,0,0,.32)",
};
const intakeTitle: CSSProperties = {
  margin: 0,
  maxWidth: 760,
  color: "#F6F8FB",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "clamp(38px,5vw,64px)",
  fontWeight: 600,
  lineHeight: 1.02,
  letterSpacing: 0,
};
const intakeLead: CSSProperties = { margin: 0, maxWidth: 760, color: "#B8C4D6", fontSize: 18, lineHeight: 1.62 };
const introSteps: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 12, marginTop: 4 };
const introStep: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 14,
  background: "rgba(255,255,255,.035)",
  padding: 14,
  display: "grid",
  gridTemplateColumns: "36px 1fr",
  gap: 12,
  alignItems: "start",
};
const introStepBadge: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  background: "linear-gradient(135deg,#E9D58A,#D4AF37)",
  color: "#0B1326",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
};
const introStepLabel: CSSProperties = { display: "block", color: "#F8FAFC", fontSize: 14 };
const introStepCopy: CSSProperties = { margin: "5px 0 0", color: "#95A3B6", fontSize: 13, lineHeight: 1.45 };
const securityNote: CSSProperties = {
  border: "1px solid rgba(33,211,199,.26)",
  borderRadius: 14,
  background: "rgba(33,211,199,.08)",
  padding: "14px 16px",
  color: "#D9FFFB",
  display: "grid",
  gap: 4,
};
const securityNoteText: CSSProperties = { color: "#A7D8D4", lineHeight: 1.45 };
const intakeFormWrap: CSSProperties = {
  alignSelf: "center",
  display: "grid",
  gap: 12,
};
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))", gap: 18, alignItems: "start" };
const chatPanel: CSSProperties = {
  minHeight: "calc(100vh - 148px)",
  background: "rgba(8,14,32,.88)",
  border: "1px solid rgba(255,255,255,.09)",
  borderRadius: 18,
  display: "grid",
  gridTemplateRows: "auto 1fr auto auto",
  overflow: "hidden",
  boxShadow: "0 30px 90px rgba(0,0,0,.38)",
};
const chatPanelFull: CSSProperties = {
  ...chatPanel,
  minHeight: "calc(100vh - 148px)",
  gridTemplateRows: "auto auto 1fr auto auto",
};
const chatPanelFullMobile: CSSProperties = {
  ...chatPanelFull,
  minHeight: "calc(100vh - 116px)",
  borderRadius: 16,
};
const chatHeader: CSSProperties = { padding: 18, borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const chatHeaderMobile: CSSProperties = { ...chatHeader, padding: 14, display: "grid", gap: 12 };
const headerActionRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const mobileActionRow: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 20, color: "#F6F8FB", letterSpacing: 0 };
const muted: CSSProperties = { margin: "4px 0 0", color: "#95A3B6", lineHeight: 1.45 };
const roomStatusStrip: CSSProperties = {
  margin: 18,
  marginBottom: 0,
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  background: "linear-gradient(135deg,rgba(255,255,255,.06),rgba(212,175,55,.055))",
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};
const roomStatusStripMobile: CSSProperties = {
  ...roomStatusStrip,
  margin: 12,
  marginBottom: 0,
  padding: 12,
  display: "grid",
  gap: 10,
  borderRadius: 16,
};
const roomNameMobile: CSSProperties = { display: "block", fontSize: 18, color: "#F8FAFC", overflowWrap: "anywhere" };
const compactMetrics: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const compactMetricsMobile: CSSProperties = { ...compactMetrics, display: "grid", gridTemplateColumns: "1fr 1fr", justifyContent: "stretch" };
const messages: CSSProperties = { padding: 18, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", minHeight: 520 };
const messagesMobile: CSSProperties = { ...messages, padding: 12, minHeight: 360 };
const assistantBubble: CSSProperties = {
  alignSelf: "flex-start",
  maxWidth: 780,
  padding: "4px 0",
  borderRadius: 0,
  background: "transparent",
  border: 0,
  color: "#F3F4F6",
  lineHeight: 1.62,
};
const userBubble: CSSProperties = {
  alignSelf: "flex-end",
  maxWidth: 720,
  padding: "12px 15px",
  borderRadius: 18,
  background: "#2B2B2B",
  color: "#F8FAFC",
  fontWeight: 700,
  lineHeight: 1.45,
};
const assistantWidgetBubble: CSSProperties = {
  alignSelf: "flex-start",
  width: "min(760px, 100%)",
  maxWidth: "100%",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,.09)",
  background: "rgba(255,255,255,.035)",
  padding: 12,
  display: "grid",
  gap: 10,
};
const aiPromptHeader: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  alignItems: "start",
  gap: 10,
  padding: "2px 2px 0",
};
const aiPromptTitle: CSSProperties = {
  margin: 0,
  color: "#F8FAFC",
  fontSize: 16,
  letterSpacing: 0,
};
const aiPromptCopy: CSSProperties = {
  margin: 0,
  color: "#B8C4D6",
  lineHeight: 1.45,
  fontSize: 13,
};
const toolSuggestionCard: CSSProperties = {
  alignSelf: "flex-start",
  width: "min(680px,100%)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 18,
  background: "rgba(255,255,255,.045)",
  padding: 12,
  display: "grid",
  gridTemplateColumns: "38px minmax(0,1fr) auto",
  gap: 12,
  alignItems: "center",
  boxShadow: "0 18px 48px rgba(0,0,0,.22)",
};
const toolSuggestionIcon: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "rgba(233,213,138,.10)",
  border: "1px solid rgba(233,213,138,.22)",
  color: "#E9D58A",
  fontWeight: 900,
  fontSize: 12,
};
const toolSuggestionTitle: CSSProperties = { color: "#F8FAFC", fontWeight: 900, fontSize: 14, overflowWrap: "anywhere" };
const toolSuggestionCopy: CSSProperties = { margin: "3px 0 0", color: "#AAB4C3", fontSize: 13, lineHeight: 1.35 };
const toolSuggestionButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 999,
  background: "rgba(255,255,255,.065)",
  color: "#F6F8FB",
  minHeight: 34,
  padding: "0 13px",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const composer: CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, padding: "14px min(7vw,92px) 24px", alignItems: "center" };
const composerMobile: CSSProperties = { ...composer, gap: 8, padding: 12, gridTemplateColumns: "40px minmax(0, 1fr) auto" };
const composerInput: CSSProperties = {
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 999,
  padding: "0 16px",
  minHeight: 52,
  fontSize: 15,
  outline: "none",
  background: "#232323",
  color: "#F8FAFC",
};
const attachButton: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.045)",
  color: "#E9D58A",
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1,
  cursor: "pointer",
};
const attachmentTray: CSSProperties = {
  margin: "0 18px",
  border: "1px solid rgba(255,255,255,.1)",
  background: "rgba(255,255,255,.03)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
};
const attachmentTrayMobile: CSSProperties = { ...attachmentTray, margin: "0 12px", padding: 10 };
const attachmentTrayHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  color: "#E2E8F0",
  fontSize: 13,
};
const attachmentList: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const attachmentPill: CSSProperties = {
  maxWidth: 260,
  border: "1px solid rgba(33,211,199,.2)",
  background: "rgba(33,211,199,.08)",
  color: "#D9FFFB",
  borderRadius: 999,
  padding: "7px 8px 7px 12px",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
};
const attachmentRemove: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.06)",
  color: "#E2E8F0",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
  lineHeight: "18px",
};
const widgetPanel: CSSProperties = { display: "grid", gap: 14 };
const widgetBox: CSSProperties = {
  background: "rgba(0,0,0,.16)",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 14,
  padding: 13,
  boxShadow: "none",
};
const sideCard: CSSProperties = {
  background: "rgba(8,14,32,.82)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 14,
  boxShadow: "0 22px 70px rgba(0,0,0,.26)",
};
const fileDrawerPanel: CSSProperties = {
  height: "100%",
  minHeight: 0,
  width: "100%",
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 18,
  padding: 14,
  display: "grid",
  alignContent: "start",
  gap: 14,
  overflowY: "auto",
};
const fileDrawerPanelMobile: CSSProperties = {
  ...fileDrawerPanel,
  height: "auto",
  maxHeight: "38dvh",
  margin: "0 12px",
  borderRadius: 16,
};
const sideCardHeader: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" };
const sideEyebrow: CSSProperties = { color: "#E9D58A", fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };
const sideTitle: CSSProperties = { margin: "3px 0 0", color: "#F8FAFC", fontSize: 19, letterSpacing: 0 };
const miniButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 999,
  minHeight: 32,
  padding: "0 12px",
  background: "rgba(255,255,255,.045)",
  color: "#D9E5F5",
  fontWeight: 900,
  cursor: "pointer",
};
const bucketMetrics: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 };
const sideSection: CSSProperties = { display: "grid", gap: 10 };
const sideSectionHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const sideList: CSSProperties = { display: "grid", gap: 8, maxHeight: 310, overflowY: "auto", paddingRight: 2 };
const pendingFileCard: CSSProperties = {
  border: "1px solid rgba(33,211,199,.20)",
  background: "rgba(33,211,199,.065)",
  borderRadius: 13,
  padding: 10,
  display: "grid",
  gap: 8,
};
const pendingControls: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center" };
const compactSelect: CSSProperties = {
  minHeight: 34,
  minWidth: 0,
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 9,
  padding: "0 8px",
  color: "#F8FAFC",
  background: "#111827",
};
const uploadedFileCard: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.035)",
  borderRadius: 13,
  padding: 10,
  display: "grid",
  gridTemplateColumns: "42px minmax(0,1fr)",
  gap: 10,
  alignItems: "center",
};
const evidenceLine: CSSProperties = {
  display: "block",
  marginTop: 3,
  color: "#D6C36A",
  fontSize: 12,
  lineHeight: 1.3,
};
const fileTypeBadge: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  background: "rgba(33,211,199,.10)",
  color: "#BFFCF7",
  border: "1px solid rgba(33,211,199,.22)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 900,
};
const warningText: CSSProperties = { display: "block", color: "#F6E7A6", fontSize: 13, lineHeight: 1.35 };
const fundabilityBannerBase: CSSProperties = {
  borderRadius: 18,
  padding: "16px 18px",
  display: "grid",
  gap: 4,
  border: "1px solid transparent",
  boxShadow: "0 16px 50px rgba(0,0,0,.18)",
};
const fundabilityLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 1.4,
  marginBottom: 5,
};
const fundableGreen: CSSProperties = {
  borderColor: "rgba(74,222,128,.38)",
  background: "linear-gradient(135deg,rgba(22,101,52,.62),rgba(20,83,45,.38))",
  color: "#DCFCE7",
};
const fundableRed: CSSProperties = {
  borderColor: "rgba(248,113,113,.42)",
  background: "linear-gradient(135deg,rgba(127,29,29,.62),rgba(69,10,10,.40))",
  color: "#FEE2E2",
};
const fundableAmber: CSSProperties = {
  borderColor: "rgba(251,191,36,.42)",
  background: "linear-gradient(135deg,rgba(113,63,18,.62),rgba(69,26,3,.40))",
  color: "#FEF3C7",
};
const snapshot: CSSProperties = { ...widgetBox, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
const miniMetrics: CSSProperties = { display: "flex", gap: 8 };
const metric: CSSProperties = {
  minWidth: 88,
  border: "1px solid rgba(255,255,255,.1)",
  background: "rgba(255,255,255,.04)",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 2,
  textAlign: "center",
  color: "#D9E5F5",
};
const fieldWrap: CSSProperties = { display: "grid", gap: 6 };
const labelStyle: CSSProperties = { color: "#B8C4D6", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const input: CSSProperties = {
  minHeight: 44,
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 12,
  padding: "0 12px",
  fontSize: 15,
  color: "#F8FAFC",
  outline: "none",
  background: "rgba(255,255,255,.045)",
};
const textarea: CSSProperties = {
  ...input,
  minHeight: 86,
  padding: "12px",
  resize: "vertical",
  lineHeight: 1.45,
  fontFamily: "inherit",
};
const primaryButton: CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "0 18px",
  minHeight: 44,
  background: "linear-gradient(135deg,#E9D58A,#D4AF37)",
  color: "#0B1326",
  fontWeight: 900,
  cursor: "pointer",
};
const primaryWide: CSSProperties = { ...primaryButton, width: "100%" };
const secondaryButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 999,
  padding: "0 14px",
  minHeight: 40,
  background: "rgba(255,255,255,.035)",
  color: "#E2E8F0",
  fontWeight: 800,
  cursor: "pointer",
};
const ghostButton: CSSProperties = { ...secondaryButton, minHeight: 34, fontSize: 13 };
const smallGhostButton: CSSProperties = { ...ghostButton, justifySelf: "start", padding: "0 12px", minHeight: 32 };
const ghostLink: CSSProperties = { ...ghostButton, display: "inline-flex", alignItems: "center", textDecoration: "none" };
const buttonRow: CSSProperties = { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" };
const tableHeader: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr .8fr .8fr",
  gap: 8,
  color: "#B8C4D6",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
};
const assetTableRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr .8fr .8fr",
  gap: 8,
  alignItems: "center",
};
const tableInput: CSSProperties = {
  ...input,
  minHeight: 40,
  borderRadius: 10,
  width: "100%",
  minWidth: 0,
};
const iconButton: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  border: "1px solid rgba(248,113,113,.35)",
  background: "rgba(248,113,113,.08)",
  color: "#FCA5A5",
  fontSize: 20,
  fontWeight: 900,
  cursor: "pointer",
};
const missingBox: CSSProperties = {
  border: "1px solid rgba(212,175,55,.28)",
  background: "rgba(212,175,55,.08)",
  color: "#F6E7A6",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 4,
  lineHeight: 1.35,
};
const baselineSummary: CSSProperties = {
  border: "1px solid rgba(212,175,55,.24)",
  background: "rgba(212,175,55,.07)",
  color: "#F6E7A6",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 4,
  lineHeight: 1.35,
};
const chipWrap: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const missingChip: CSSProperties = {
  border: "1px solid rgba(212,175,55,.25)",
  background: "rgba(212,175,55,.08)",
  color: "#F6E7A6",
  borderRadius: 999,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 800,
};
const completeChip: CSSProperties = {
  ...missingChip,
  border: "1px solid rgba(33,211,199,.28)",
  background: "rgba(33,211,199,.08)",
  color: "#A7F3D0",
};
const dropZone: CSSProperties = {
  border: "1px dashed rgba(255,255,255,.16)",
  borderRadius: 14,
  minHeight: 96,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: 4,
  cursor: "pointer",
  color: "#D9E5F5",
};
const queueRow: CSSProperties = {
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(170px, 230px) auto",
  gap: 10,
  alignItems: "center",
  background: "rgba(255,255,255,.025)",
};
const queueRemoveButton: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(248,113,113,.30)",
  background: "rgba(248,113,113,.08)",
  color: "#FCA5A5",
  fontWeight: 900,
  cursor: "pointer",
};
const queueRemovePlaceholder: CSSProperties = { width: 34, height: 34, display: "block" };
const select: CSSProperties = {
  minHeight: 38,
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 10,
  padding: "0 8px",
  color: "#F8FAFC",
  background: "#111827",
};
const emptyBox: CSSProperties = {
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(255,255,255,.035)",
  color: "#B8C4D6",
  display: "grid",
  gap: 4,
};
const resultCard: CSSProperties = { border: "1px solid rgba(33,211,199,.3)", background: "rgba(33,211,199,.09)", borderRadius: 14, padding: 14 };
const resultStatus: CSSProperties = { display: "block", fontSize: 20, color: "#70ded5", marginTop: 4 };
const smallMuted: CSSProperties = { display: "block", color: "#8FA0B8", fontSize: 13, lineHeight: 1.35 };
const truncate: CSSProperties = { display: "block", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#F8FAFC" };
const statusBox: CSSProperties = {
  margin: "0 18px 18px",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(212,175,55,.3)",
  background: "rgba(212,175,55,.09)",
  color: "#F6E7A6",
  fontWeight: 700,
};
const statusBoxNoMargin: CSSProperties = { ...statusBox, margin: 0 };
const slotButton: CSSProperties = {
  border: "1px solid rgba(33,211,199,.24)",
  borderRadius: 14,
  background: "rgba(33,211,199,.08)",
  color: "#D9FFFB",
  minHeight: 58,
  padding: "10px 14px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  cursor: "pointer",
  textAlign: "left",
};
