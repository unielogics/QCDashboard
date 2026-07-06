"use client";

import type { CSSProperties, DragEvent, MutableRefObject, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  result_snapshot?: Record<string, unknown> | null;
};

type Widget = {
  type: "deal_profile" | "asset_table" | "upload_files" | "referral" | "run_review" | "bankability_result";
  title: string;
  description: string;
  missing_document_ids?: string[];
};

type IntakeResponse = {
  intake: Intake;
  token?: string | null;
  resume_url?: string | null;
  upload_url?: string | null;
  assistant_message: string;
  widget?: Widget | null;
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

type ChatLine = { id: string; role: "assistant" | "user"; content: string };
type QueuedFile = { id: string; file: File; requestedDocumentId: string; status: "ready" | "uploading" | "uploaded" | "error"; message?: string };

const initialContact = { full_name: "", email: "", phone: "", business_name: "" };

export default function DealerAIUnderwriterPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [token, setToken] = useState<string>("");
  const [contact, setContact] = useState(initialContact);
  const [deal, setDeal] = useState({ loan_purpose: "", requested_loan_amount: "", estimated_credit_score: "" });
  const [assets, setAssets] = useState<AssetRow[]>([{ id: cryptoId(), address: "", estimated_loan_amount: null, estimated_property_value: null, notes: "" }]);
  const [referral, setReferral] = useState("");
  const [response, setResponse] = useState<IntakeResponse | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatText, setChatText] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);

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
  }, [response]);

  const widget = response?.widget ?? null;
  const hasRequiredFacts = Boolean(response && response.intake.loan_purpose && response.intake.requested_loan_amount && response.intake.estimated_credit_score);
  const hasAssets = Boolean(response && response.intake.asset_rows?.length);
  const hasReferral = Boolean(response && response.intake.referral_source);
  const hasFiles = Boolean(response && response.files.length);
  const currentResult = response?.intake.result_snapshot ?? response?.latest_review?.result ?? null;
  const showDealWidget = Boolean(response && (!hasRequiredFacts || widget?.type === "deal_profile"));
  const showAssetWidget = Boolean(response && (!hasAssets || widget?.type === "asset_table"));
  const showReferralWidget = Boolean(response && (!hasReferral || widget?.type === "referral"));
  const showReviewWidget = Boolean(response && hasFiles);
  const showResultWidget = Boolean(response && (widget?.type === "bankability_result" || currentResult));
  const missingDocs = useMemo(() => {
    const uploadedIds = new Set(response?.files.map((file) => file.requested_document_id).filter(Boolean) ?? []);
    return (response?.requested_documents ?? []).filter((doc) => doc.required && !uploadedIds.has(doc.id));
  }, [response]);
  const bankability = asRecord(response?.latest_review?.result?.bankability_assessment ?? response?.intake.result_snapshot?.bankability_assessment);

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
          requestedDocumentId: missingDocs[0]?.id || response?.requested_documents[0]?.id || "",
          status: "ready" as const,
        }));
      return [...current, ...incoming];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadQueuedFiles() {
    if (!token || !queuedFiles.some((item) => item.status === "ready" || item.status === "error")) return;
    setBusy(true);
    setStatus("Uploading files to secure storage...");
    let uploaded = 0;
    try {
      for (const item of queuedFiles.filter((file) => file.status === "ready" || file.status === "error")) {
        updateQueuedFile(item.id, { status: "uploading", message: "Preparing upload" });
        try {
          const init = await call<{ file_id: string; upload_url: string; required_headers: Record<string, string> }>(
            `/public/dealer-ai-intake/${encodeURIComponent(token)}/files/upload-init`,
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
          updateQueuedFile(item.id, { message: "Uploading encrypted file" });
          const put = await fetch(init.upload_url, { method: "PUT", body: item.file, headers: init.required_headers });
          if (!put.ok) throw new Error(`Secure storage rejected ${item.file.name}.`);
          updateQueuedFile(item.id, { message: "Confirming upload" });
          await call(`/public/dealer-ai-intake/${encodeURIComponent(token)}/files/complete`, {
            method: "POST",
            body: JSON.stringify({ file_id: init.file_id }),
          });
          uploaded += 1;
          updateQueuedFile(item.id, { status: "uploaded", message: "Uploaded" });
        } catch (error) {
          updateQueuedFile(item.id, { status: "error", message: errorMessage(error) });
        }
      }
      await loadIntake();
      pushAssistant(`${uploaded} file${uploaded === 1 ? "" : "s"} uploaded. I updated the document checklist.`);
      setStatus("");
    } finally {
      setBusy(false);
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

  function pushAssistant(content: string) {
    if (!content) return;
    setChat((current) => [...current, { id: cryptoId(), role: "assistant", content }]);
  }

  function pushUser(content: string) {
    setChat((current) => [...current, { id: cryptoId(), role: "user", content }]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  return (
    <main style={page}>
      <section style={shell}>
        <header style={header}>
          <div style={brandGroup}>
            <QCMark size={42} />
            <div>
              <div style={eyebrow}>Qualified Commercial AI Funding Review</div>
              <h1 style={title}>Dealer capital underwriter room</h1>
            </div>
          </div>
          <div style={securePill}>{response ? "Encrypted uploads | Chat-first review | Preliminary screen" : "Step 1 | Start secure intake"}</div>
        </header>

        {!response ? (
          <section style={intakeStart}>
            <div style={intakeCopy}>
              <div style={eyebrow}>Start here</div>
              <h2 style={intakeTitle}>Complete the secure intake first.</h2>
              <p style={intakeLead}>
                Enter the basic contact information so Qualified Commercial can create your encrypted funding room.
                After that, you can upload documents immediately and the AI underwriter will guide the next questions.
              </p>
              <div style={introSteps}>
                {[
                  ["1", "Basic information", "Name, email, phone, and dealership name."],
                  ["2", "Encrypted upload room", "Upload bank statements, P&L, taxes, floorplan, MCA, inventory, and real estate files."],
                  ["3", "AI funding review", "The system infers the likely lending path and lists missing evidence."],
                ].map(([step, label, copy]) => (
                  <div key={step} style={introStep}>
                    <span style={introStepBadge}>{step}</span>
                    <div>
                      <strong style={introStepLabel}>{label}</strong>
                      <p style={introStepCopy}>{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={securityNote}>
                <strong>Secure intake required first.</strong>
                <span style={securityNoteText}>Uploads are attached to your encrypted bucket after the form is submitted.</span>
              </div>
            </div>
            <div style={intakeFormWrap}>
              <ContactWidget contact={contact} setContact={setContact} busy={busy} onStart={() => startIntake().catch(() => undefined)} />
              {status ? <div style={statusBoxNoMargin}>{status}</div> : null}
            </div>
          </section>
        ) : (
          <div style={grid}>
            <section style={chatPanel}>
              <div style={chatHeader}>
              <div>
                <h2 style={sectionTitle}>AI Funding Review</h2>
                <p style={muted}>Upload first, answer only essential questions, and let the AI infer the likely program fit.</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {response?.resume_url ? <button style={ghostButton} onClick={() => navigator.clipboard.writeText(response.resume_url || "")}>Copy resume link</button> : null}
                {response ? <a style={ghostLink} href="/client/dealer-intakes">Client continuation</a> : null}
              </div>
            </div>
            <div style={messages}>
              {chat.map((line) => (
                <div key={line.id} style={line.role === "assistant" ? assistantBubble : userBubble}>
                  {line.content}
                </div>
              ))}
            </div>
            <div style={composer}>
              <input
                style={composerInput}
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                placeholder={token ? "Ask a question, add facts, or tell the AI what you uploaded..." : "Start by entering contact info on the right"}
                disabled={!token || busy}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && chatText.trim()) sendChat().catch(() => undefined);
                }}
              />
              <button style={primaryButton} disabled={!token || !chatText.trim() || busy} onClick={() => sendChat().catch(() => undefined)}>
                Send
              </button>
            </div>
              {status ? <div style={statusBox}>{status}</div> : null}
            </section>

            <aside style={widgetPanel}>
              <>
                <IntakeSnapshot response={response} missingDocs={missingDocs} />
                <UploadWidget
                  requestedDocs={response.requested_documents}
                  missingDocs={missingDocs}
                  queuedFiles={queuedFiles}
                  setQueuedFiles={setQueuedFiles}
                  fileInputRef={fileInputRef}
                  dragging={dragging}
                  setDragging={setDragging}
                  onDrop={onDrop}
                  addFiles={addFiles}
                  busy={busy}
                  onUpload={() => uploadQueuedFiles().catch(() => undefined)}
                />
                {showReviewWidget ? <RunReviewWidget busy={busy} hasResult={Boolean(currentResult)} onRun={() => runReview().catch(() => undefined)} /> : null}
                {showDealWidget ? <DealWidget deal={deal} setDeal={setDeal} busy={busy} onSubmit={() => submitDealProfile().catch(() => undefined)} /> : null}
                {showAssetWidget ? <AssetWidget assets={assets} setAssets={setAssets} busy={busy} onSubmit={() => submitAssets().catch(() => undefined)} /> : null}
                {showReferralWidget ? <ReferralWidget referral={referral} setReferral={setReferral} busy={busy} onSubmit={() => submitReferral().catch(() => undefined)} /> : null}
                {showResultWidget ? <ResultWidget result={currentResult} bankability={bankability} /> : null}
              </>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function ContactWidget({ contact, setContact, busy, onStart }: { contact: typeof initialContact; setContact: (value: typeof initialContact) => void; busy: boolean; onStart: () => void }) {
  return (
    <WidgetBox title="Start secure intake" description="Complete the basic information to create your encrypted dealer funding room.">
      <Field label="Full name" value={contact.full_name} onChange={(value) => setContact({ ...contact, full_name: value })} />
      <Field label="Email" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} />
      <Field label="Phone" value={contact.phone} onChange={(value) => setContact({ ...contact, phone: value })} />
      <Field label="Dealership / business name" value={contact.business_name} onChange={(value) => setContact({ ...contact, business_name: value })} />
      <button style={primaryWide} disabled={busy} onClick={onStart}>{busy ? "Creating secure room..." : "Start secure intake"}</button>
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
  return (
    <WidgetBox title="Real estate and assets" description="Add each collateral property or major asset. Upload mortgage notes in the document step if available.">
      <div style={{ display: "grid", gap: 10 }}>
        {assets.map((row, index) => (
          <div key={row.id || index} style={assetCard}>
            <Field label="Address / asset" value={row.address} onChange={(value) => update(index, { address: value })} />
            <div style={twoCol}>
              <Field label="Loan balance" value={row.estimated_loan_amount ? String(row.estimated_loan_amount) : ""} onChange={(value) => update(index, { estimated_loan_amount: numericOrNull(value) })} />
              <Field label="Est. value" value={row.estimated_property_value ? String(row.estimated_property_value) : ""} onChange={(value) => update(index, { estimated_property_value: numericOrNull(value) })} />
            </div>
            <Field label="Notes optional" value={row.notes || ""} onChange={(value) => update(index, { notes: value })} />
          </div>
        ))}
      </div>
      <div style={buttonRow}>
        <button style={secondaryButton} onClick={() => setAssets([...assets, { id: cryptoId(), address: "", estimated_loan_amount: null, estimated_property_value: null, notes: "" }])}>Add row</button>
        <button style={primaryButton} disabled={busy} onClick={onSubmit}>Save assets</button>
      </div>
    </WidgetBox>
  );
}

function UploadWidget(props: {
  requestedDocs: RequestedDoc[];
  missingDocs: RequestedDoc[];
  queuedFiles: QueuedFile[];
  setQueuedFiles: (files: QueuedFile[]) => void;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  dragging: boolean;
  setDragging: (value: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  addFiles: (files: FileList | File[]) => void;
  busy: boolean;
  onUpload: () => void;
}) {
  const { requestedDocs, missingDocs, queuedFiles, setQueuedFiles, fileInputRef, dragging, setDragging, onDrop, addFiles, busy, onUpload } = props;
  return (
    <WidgetBox title="Upload documents now" description="Start with any bank statements, P&L, tax returns, MCA/floorplan statements, inventory, or real estate documents. Missing files become AI-discovered gaps.">
      <div style={missingBox}>
        <strong>{missingDocs.length} required item{missingDocs.length === 1 ? "" : "s"} still need files</strong>
        <span>{missingDocs.map((doc) => doc.name).join(", ") || "All required items have uploaded files."}</span>
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
        {queuedFiles.length ? queuedFiles.map((item) => (
          <div key={item.id} style={queueRow}>
            <div style={{ minWidth: 0 }}>
              <strong style={truncate}>{item.file.name}</strong>
              <span style={smallMuted}>{formatSize(item.file.size)} | {item.status}{item.message ? ` | ${item.message}` : ""}</span>
            </div>
            <select
              style={select}
              value={item.requestedDocumentId}
              onChange={(event) => setQueuedFiles(queuedFiles.map((file) => (file.id === item.id ? { ...file, requestedDocumentId: event.target.value } : file)))}
            >
              <option value="">Unmatched file</option>
              {requestedDocs.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
            </select>
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
    <WidgetBox title={hasResult ? "Refresh AI review" : "Run preliminary AI review"} description="The AI reads the current bucket files, classifies likely lending paths, and lists missing evidence without waiting for a perfect package.">
      <button style={primaryWide} disabled={busy} onClick={onRun}>{busy ? "Reviewing..." : hasResult ? "Re-run with current files" : "Run preliminary screen"}</button>
    </WidgetBox>
  );
}

function ResultWidget({ result, bankability }: { result: Record<string, unknown> | null; bankability: Record<string, unknown> | null }) {
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
    </WidgetBox>
  );
}

function IntakeSnapshot({ response, missingDocs }: { response: IntakeResponse; missingDocs: RequestedDoc[] }) {
  return (
    <div style={snapshot}>
      <div>
        <div style={eyebrow}>Secure bucket created</div>
        <strong>{response.intake.business_name || response.intake.full_name}</strong>
        <p style={smallMuted}>{response.files.length} uploaded | {missingDocs.length} missing | {response.intake.status}</p>
      </div>
      <div style={miniMetrics}>
        <Metric value={response.intake.estimated_credit_score ? String(response.intake.estimated_credit_score) : "TBD"} label="est. credit" />
        <Metric value={response.files.length.toString()} label="files" />
      </div>
    </div>
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
  padding: 24,
};
const shell: CSSProperties = { maxWidth: 1480, margin: "0 auto", display: "grid", gap: 18 };
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
const chatHeader: CSSProperties = { padding: 18, borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
const sectionTitle: CSSProperties = { margin: 0, fontSize: 20, color: "#F6F8FB", letterSpacing: 0 };
const muted: CSSProperties = { margin: "4px 0 0", color: "#95A3B6", lineHeight: 1.45 };
const messages: CSSProperties = { padding: 18, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", minHeight: 420 };
const assistantBubble: CSSProperties = {
  alignSelf: "flex-start",
  maxWidth: "82%",
  padding: "13px 15px",
  borderRadius: 16,
  background: "rgba(33,211,199,.09)",
  border: "1px solid rgba(33,211,199,.2)",
  color: "#D9FFFB",
  lineHeight: 1.45,
};
const userBubble: CSSProperties = {
  alignSelf: "flex-end",
  maxWidth: "82%",
  padding: "13px 15px",
  borderRadius: 16,
  background: "linear-gradient(135deg,#E9D58A,#D4AF37)",
  color: "#0B1326",
  fontWeight: 800,
  lineHeight: 1.45,
};
const composer: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: 18, borderTop: "1px solid rgba(255,255,255,.08)" };
const composerInput: CSSProperties = {
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 999,
  padding: "0 16px",
  minHeight: 46,
  fontSize: 15,
  outline: "none",
  background: "rgba(255,255,255,.045)",
  color: "#F8FAFC",
};
const widgetPanel: CSSProperties = { display: "grid", gap: 14 };
const widgetBox: CSSProperties = {
  background: "linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025))",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 18px 60px rgba(0,0,0,.25)",
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
const ghostLink: CSSProperties = { ...ghostButton, display: "inline-flex", alignItems: "center", textDecoration: "none" };
const buttonRow: CSSProperties = { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" };
const twoCol: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const assetCard: CSSProperties = { border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, background: "rgba(255,255,255,.035)", padding: 12, display: "grid", gap: 10 };
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
const dropZone: CSSProperties = {
  border: "2px dashed rgba(255,255,255,.16)",
  borderRadius: 16,
  minHeight: 138,
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
  gridTemplateColumns: "minmax(0, 1fr) minmax(170px, 230px)",
  gap: 10,
  alignItems: "center",
  background: "rgba(255,255,255,.025)",
};
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
