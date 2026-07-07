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
  parent_zip_file_id?: string | null;
  zip_entry_path?: string | null;
  extraction_status?: string | null;
  extraction_reason?: string | null;
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
  session_token?: string | null;
  resume_url?: string | null;
  upload_url?: string | null;
  assistant_message: string;
  widget?: Widget | null;
  requested_documents: RequestedDoc[];
  files: UploadedFile[];
  ai_summary?: Record<string, unknown> | null;
  latest_review?: { status: string; result?: Record<string, unknown> | null; error?: string | null } | null;
  messages?: Array<{ id: string; role: "assistant" | "user" | string; content: string; created_at: string }>;
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
type ReviewProgressStage = "idle" | "attaching" | "uploading" | "reading" | "classifying" | "screening" | "preparing" | "complete" | "error";
type WorkspaceTab = "chat" | "files" | "intelligence";
type IntelligenceValue = { label: string; value: string; source: "verified" | "extracted" | "estimated" | "unavailable"; detail?: string; raw?: number | null };
type IntelligenceModel = {
  status: FundabilityBannerData | null;
  requestedAmount: IntelligenceValue;
  annualizedRevenue: IntelligenceValue;
  debtBurden: IntelligenceValue;
  dscr: IntelligenceValue;
  ltv: IntelligenceValue;
  equity: IntelligenceValue;
  confidence: IntelligenceValue;
  coverage: Array<{ category: string; status: string; evidence: string; gap: string }>;
  strengths: string[];
  risks: string[];
  missing: Array<{ title: string; detail: string; priority: string }>;
  cashFlowBars: Array<{ label: string; value: number | null; source: IntelligenceValue["source"] }>;
  monthlySeries: Array<{ label: string; value: number | null }>;
  yearlySeries: Array<{ label: string; value: number | null }>;
  oneNextStep: string;
};
const DEALER_AI_UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.zip,.csv,.xlsx,.txt,text/plain,application/pdf,image/*,application/zip,application/x-zip-compressed,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DEALER_AI_SESSION_KEY = "qc_dealer_ai_session";
const DEALER_AI_TOKEN_KEY = "qc_dealer_ai_token";
const REVIEW_PROGRESS_STAGES: Array<{ key: ReviewProgressStage; label: string }> = [
  { key: "attaching", label: "Attaching files" },
  { key: "uploading", label: "Uploading securely" },
  { key: "reading", label: "Reading documents" },
  { key: "classifying", label: "Classifying evidence" },
  { key: "screening", label: "Screening fundability" },
  { key: "preparing", label: "Preparing next question" },
];

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
  const [mounted, setMounted] = useState(false);
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);
  const roomFileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const progressTimersRef = useRef<number[]>([]);
  const completionTimerRef = useRef<number | null>(null);
  const [token, setToken] = useState<string>("");
  const [dealerSessionToken, setDealerSessionToken] = useState<string>("");
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
  const [emailLookupBusy, setEmailLookupBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>("chat");
  const [reviewProgress, setReviewProgress] = useState<ReviewProgressStage>("idle");
  const [reviewCompletedAt, setReviewCompletedAt] = useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [resumeEmail, setResumeEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginCodeSent, setLoginCodeSent] = useState(false);
  const [showContinuationLogin, setShowContinuationLogin] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      clearProgressTimers();
      if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const urlToken = params?.get("token") ?? null;
    const continueRequested = params?.get("continue") === "1";
    if (continueRequested) {
      setLoginCodeSent(true);
      setShowContinuationLogin(true);
    }
    if (urlToken) {
      setToken(urlToken);
      loadIntake(urlToken, true).catch((error) => setStatus(errorMessage(error)));
      return;
    }
    const savedSession = typeof window !== "undefined" ? window.sessionStorage.getItem(DEALER_AI_SESSION_KEY) : null;
    if (savedSession) {
      setDealerSessionToken(savedSession);
      loadDealerSession(savedSession).catch(() => {
        window.sessionStorage.removeItem(DEALER_AI_SESSION_KEY);
        window.sessionStorage.removeItem(DEALER_AI_TOKEN_KEY);
      });
      return;
    }
    const savedToken = typeof window !== "undefined" ? window.sessionStorage.getItem(DEALER_AI_TOKEN_KEY) : null;
    if (savedToken) {
      setToken(savedToken);
      loadIntake(savedToken, true).catch(() => window.sessionStorage.removeItem(DEALER_AI_TOKEN_KEY));
    }
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
    return (response?.requested_documents ?? []).filter((doc) => doc.required && isStageOneRequestedDoc(doc) && !uploadedIds.has(doc.id));
  }, [response]);
  const pendingFiles = queuedFiles.filter((item) => item.status !== "uploaded");
  const hasQueuedUpload = queuedFiles.some((item) => item.status === "ready" || item.status === "error");
  const hasUploading = queuedFiles.some((item) => item.status === "uploading");
  const reviewStatus =
    reviewProgress !== "idle" && reviewProgress !== "complete"
      ? reviewProgressLabel(reviewProgress)
      : hasUploading
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
  const intelligence = useMemo(
    () => (response ? buildIntelligenceModel(response, currentResult, missingDocs, fundability) : null),
    [response, currentResult, missingDocs, fundability],
  );
  const intelligenceReady = Boolean(response?.files.length && currentResult);
  const showReviewProgress = reviewProgress !== "idle" && reviewProgress !== "attaching";

  useEffect(() => {
    if (!response) return;
    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [response, chat.length, pendingFiles.length, reviewProgress, status]);

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

  function clearProgressTimers() {
    progressTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    progressTimersRef.current = [];
    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }

  function setProgress(stage: ReviewProgressStage) {
    setReviewProgress(stage);
    if (stage !== "complete") setReviewCompletedAt(null);
  }

  function beginReviewTimeline() {
    clearProgressTimers();
    setProgress("reading");
    const schedule: Array<[number, ReviewProgressStage]> = [
      [1400, "classifying"],
      [3200, "screening"],
      [5200, "preparing"],
    ];
    progressTimersRef.current = schedule.map(([delay, stage]) => window.setTimeout(() => setReviewProgress(stage), delay));
  }

  function completeReviewProgress() {
    clearProgressTimers();
    setReviewProgress("complete");
    setReviewCompletedAt(new Date().toISOString());
    completionTimerRef.current = window.setTimeout(() => {
      setReviewProgress("idle");
      completionTimerRef.current = null;
    }, 1500);
  }

  function failReviewProgress() {
    clearProgressTimers();
    setReviewProgress("error");
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
      applyResponse(payload, payload.token ?? "", true);
      pushAssistant(payload.assistant_message);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/dealer-ai-underwriter");
      }
    } catch (error) {
      const message = errorMessage(error);
      if (message.toLowerCase().includes("already exists") || message.toLowerCase().includes("access code")) {
        setResumeEmail(contact.email.trim());
        setLoginCodeSent(true);
        setShowContinuationLogin(true);
        setStatus(message);
      } else {
        setStatus(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestDealerCode() {
    const email = (resumeEmail || contact.email).trim();
    if (!email) {
      setStatus("Enter your email and we will send a secure access code if a file exists.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const payload = await call<{ ok: boolean; login_required?: boolean; message: string }>("/public/dealer-ai-intake/login/start", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setLoginCodeSent(Boolean(payload.login_required ?? true));
      setStatus(payload.message || "If a secure dealer file exists for this email, a code has been sent.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function checkDealerEmail(value: string) {
    const email = value.trim();
    if (!looksLikeEmail(email) || emailLookupBusy || response) return;
    setEmailLookupBusy(true);
    try {
      const payload = await call<{ ok: boolean; login_required?: boolean; message: string }>("/public/dealer-ai-intake/login/start", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (payload.login_required) {
        setResumeEmail(email);
        setLoginCodeSent(true);
        setShowContinuationLogin(true);
        setStatus(payload.message || "We found an existing secure dealer file for this email. Enter the code we sent to continue.");
      }
    } catch {
      // Do not block new intake if the pre-check cannot run.
    } finally {
      setEmailLookupBusy(false);
    }
  }

  async function verifyDealerCode() {
    const email = (resumeEmail || contact.email).trim();
    if (!email || !loginCode.trim()) {
      setStatus("Enter your email and access code.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const payload = await call<IntakeResponse>("/public/dealer-ai-intake/login/verify", {
        method: "POST",
        body: JSON.stringify({ email, code: loginCode.trim() }),
      });
      persistDealerSession(payload);
      applyResponse(payload, payload.token ?? "", true);
      syncMessagesFromResponse(payload, true);
      pushAssistant(payload.assistant_message);
      setLoginCode("");
      setStatus("");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/dealer-ai-underwriter");
      }
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadIntake(activeToken = token, fromResume = false) {
    const payload = await call<IntakeResponse>(`/public/dealer-ai-intake/${encodeURIComponent(activeToken)}`);
    applyResponse(payload, activeToken, true);
    syncMessagesFromResponse(payload, true);
    persistDealerSession({ ...payload, token: activeToken });
    if (fromResume && !payload.messages?.length) pushAssistant(payload.assistant_message);
    if (typeof window !== "undefined" && fromResume) {
      window.history.replaceState(null, "", "/dealer-ai-underwriter");
    }
  }

  async function loadDealerSession(sessionToken: string) {
    const payload = await call<IntakeResponse>("/public/dealer-ai-intake/session", {
      headers: { "X-Dealer-Session": sessionToken },
    });
    persistDealerSession(payload);
    applyResponse(payload, payload.token ?? "", true);
    syncMessagesFromResponse(payload, true);
    if (!payload.messages?.length) pushAssistant(payload.assistant_message);
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

  async function exportIntelligencePdf() {
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    const res = await fetch(`${apiBase}/api/v1/public/dealer-ai-intake/intelligence.pdf?${params.toString()}`, {
      headers: dealerSessionToken ? { "X-Dealer-Session": dealerSessionToken } : undefined,
    });
    if (!res.ok) throw new Error(await responseMessage(res));
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dealer-intelligence-${response?.intake.business_name || response?.intake.full_name || "review"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
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
    const files = Array.from(nextFiles);
    if (!files.length) return;
    setQueuedFiles((current) => {
      const seen = new Set(current.map((item) => localFileKey(item.file)));
      const incoming = files
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
    setProgress("attaching");
    setStatus(`${files.length} file${files.length === 1 ? "" : "s"} attached. Send or upload when ready.`);
  }

  async function uploadQueuedFiles() {
    if (!token || !queuedFiles.some((item) => item.status === "ready" || item.status === "error")) return;
    setBusy(true);
    setProgress("uploading");
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
        beginReviewTimeline();
        const payload = await call<IntakeResponse>(`/public/dealer-ai-intake/${encodeURIComponent(token)}/run-review`, { method: "POST" });
        applyResponse(payload, token);
        completeReviewProgress();
        pushAssistant(payload.assistant_message);
        setStatus("");
      } else {
        failReviewProgress();
        setStatus("No files uploaded successfully. Correct the file errors and try again.");
        pushAssistant("No files uploaded successfully. Correct the file errors and try again.");
      }
    } catch (error) {
      failReviewProgress();
      const message = errorMessage(error);
      setStatus(`Review failed: ${message}`);
      pushAssistant(`I could not finish the file review. ${message}`);
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

  function persistDealerSession(payload: Pick<IntakeResponse, "token" | "session_token">) {
    if (payload.session_token) {
      setDealerSessionToken(payload.session_token);
      if (typeof window !== "undefined") window.sessionStorage.setItem(DEALER_AI_SESSION_KEY, payload.session_token);
    }
    if (payload.token) {
      if (typeof window !== "undefined") window.sessionStorage.setItem(DEALER_AI_TOKEN_KEY, payload.token);
    }
  }

  function syncMessagesFromResponse(payload: IntakeResponse, force = false) {
    const serverMessages = payload.messages ?? [];
    if (!serverMessages.length) {
      if (force) setChat([]);
      return;
    }
    if (!force && chat.length) return;
    setChat(
      serverMessages.map((message) => ({
        id: message.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    );
  }

  function applyResponse(payload: IntakeResponse, activeToken: string, persist = false) {
    setResponse(payload);
    if (activeToken) setToken(activeToken);
    if (persist) persistDealerSession({ token: activeToken || payload.token, session_token: payload.session_token });
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
    (composerFileInputRef.current ?? roomFileInputRef.current)?.click();
  }

  function handleRoomDragOver(event: DragEvent<HTMLElement>) {
    if (!token || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function handleRoomDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  }

  function handleRoomDrop(event: DragEvent<HTMLElement>) {
    if (!token) return;
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  function logoutRoom() {
    const currentSession = dealerSessionToken || (typeof window !== "undefined" ? window.sessionStorage.getItem(DEALER_AI_SESSION_KEY) || "" : "");
    if (currentSession) {
      call("/public/dealer-ai-intake/logout", {
        method: "POST",
        body: JSON.stringify({ session_token: currentSession }),
      }).catch(() => undefined);
    }
    setToken("");
    setDealerSessionToken("");
    setResponse(null);
    setChat([]);
    setChatText("");
    setQueuedFiles([]);
    setLoginCode("");
    setLoginCodeSent(false);
    setShowContinuationLogin(false);
    setStatus("You are logged out of this secure room. Enter your email to receive a continuation code.");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DEALER_AI_SESSION_KEY);
      window.sessionStorage.removeItem(DEALER_AI_TOKEN_KEY);
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

  if (!mounted) {
    return <main style={page} />;
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
                <button type="button" style={loginPill} onClick={() => setShowContinuationLogin(true)}>Continue</button>
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
                {showContinuationLogin ? (
                  <DealerContinuationWidget
                    email={resumeEmail || contact.email}
                    setEmail={(value) => {
                      setResumeEmail(value);
                      setContact({ ...contact, email: value });
                    }}
                    code={loginCode}
                    setCode={setLoginCode}
                    codeSent={loginCodeSent}
                    busy={busy}
                    onSendCode={() => requestDealerCode().catch(() => undefined)}
                    onVerify={() => verifyDealerCode().catch(() => undefined)}
                    onBack={() => {
                      setShowContinuationLogin(false);
                      setLoginCodeSent(false);
                      setLoginCode("");
                    }}
                  />
                ) : (
                  <ContactWidget
                    contact={contact}
                    setContact={setContact}
                    busy={busy || emailLookupBusy}
                    emailLookupBusy={emailLookupBusy}
                    legalAccepted={legalAccepted}
                    setLegalAccepted={setLegalAccepted}
                    onEmailBlur={() => checkDealerEmail(contact.email).catch(() => undefined)}
                    onStart={() => startIntake().catch(() => undefined)}
                    onShowLogin={() => {
                      setResumeEmail(contact.email);
                      setShowContinuationLogin(true);
                    }}
                  />
                )}
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
                activeTab={activeWorkspace}
                onTabChange={setActiveWorkspace}
                onCopyResume={() => navigator.clipboard.writeText(response.resume_url || "")}
                onLogout={logoutRoom}
              />
            ) : null}

            <section
              style={compact ? appMainMobile : appMain}
              onDragOver={handleRoomDragOver}
              onDragEnter={handleRoomDragOver}
              onDragLeave={handleRoomDragLeave}
              onDrop={handleRoomDrop}
            >
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
                  <div style={mobileTabs} aria-label="Dealer AI room sections">
                    {(["chat", "files", "intelligence"] as WorkspaceTab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        style={activeWorkspace === tab ? mobileTabActive : mobileTab}
                        onClick={() => setActiveWorkspace(tab)}
                      >
                        {tab === "chat" ? "Chat" : tab === "files" ? "Files" : "Intel"}
                      </button>
                    ))}
                  </div>
                </header>
              ) : null}
              <input
                ref={roomFileInputRef}
                type="file"
                multiple
                accept={DEALER_AI_UPLOAD_ACCEPT}
                disabled={!token}
                style={{ display: "none" }}
                onChange={(event) => {
                  if (event.target.files) {
                    addFiles(event.target.files);
                  }
                  event.currentTarget.value = "";
                }}
              />

              <div style={compact ? workspaceGridMobile : activeWorkspace === "chat" ? workspaceGrid : workspaceGridSingle}>
                {activeWorkspace === "chat" ? (
                <section style={compact ? chatPanelModernMobile : chatPanelModern}>
                  {dragging ? (
                    <div style={dropHint}>
                      <strong>Drop files to attach</strong>
                      <span>PDF, images, ZIP, CSV, XLSX, and text files are supported.</span>
                    </div>
                  ) : null}
                  <div style={compact ? chatTopBarMobile : chatTopBar}>
                    <div>
                      <h2 style={sectionTitle}>Dealer AI Underwriter</h2>
                      <p style={muted}>Ask questions and attach PDFs, images, ZIPs, spreadsheets, or statements directly in chat.</p>
                    </div>
                    <div style={compact ? mobileActionRow : headerActionRow}>
                      <span style={statusPill}>{reviewStatus}</span>
                    </div>
                  </div>
                  {showReviewProgress ? <ReviewProgress stage={reviewProgress} completedAt={reviewCompletedAt} compact={compact} /> : null}
                  <div style={compact ? messagesModernMobile : messagesModern}>
                    {fundability ? <FundabilityBanner banner={fundability} /> : null}
                    {chat.map((line) =>
                      line.role === "assistant" ? (
                        <div key={line.id} style={assistantRow}>
                          <div style={assistantAvatar} aria-hidden>QC</div>
                          <div style={assistantBubble}>{line.content}</div>
                        </div>
                      ) : (
                        <div key={line.id} style={userBubble}>
                          {line.content}
                        </div>
                      ),
                    )}
                    {response.widget?.type === "book_call" ? (
                      <BookCallWidget widget={response.widget} busy={busy} onBook={(startsAt) => bookCall(startsAt).catch(() => undefined)} />
                    ) : null}
                    <div ref={messagesEndRef} />
                  </div>
                  {pendingFiles.length ? (
                    <AttachmentTray files={pendingFiles} compact={compact} onRemove={removeQueuedFile} />
                  ) : null}
                  <div style={compact ? composerMobile : composer}>
                    <label
                      style={!token ? disabledAttachButton : attachButton}
                      aria-label="Attach files"
                      title="Attach files"
                    >
                      +
                      <input
                        ref={composerFileInputRef}
                        type="file"
                        multiple
                        accept={DEALER_AI_UPLOAD_ACCEPT}
                        disabled={!token}
                        style={fileInputOverlay}
                        onChange={(event) => {
                          if (event.target.files) {
                            addFiles(event.target.files);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
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
                      style={!token || (!chatText.trim() && !hasQueuedUpload) || busy ? disabledPrimaryButton : primaryButton}
                      disabled={!token || (!chatText.trim() && !hasQueuedUpload) || busy}
                      onClick={() => submitComposer().catch(() => undefined)}
                    >
                      {busy ? "Sending…" : hasQueuedUpload ? (chatText.trim() ? "Upload & send" : "Upload") : "Send"}
                    </button>
                  </div>
                  {status ? <div style={statusBox}>{status}</div> : null}
                </section>
                ) : null}

                {activeWorkspace === "chat" && !compact ? (
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
                    reviewProgress={reviewProgress}
                    reviewCompletedAt={reviewCompletedAt}
                    showReviewProgress={showReviewProgress}
                  />
                ) : null}
                {activeWorkspace === "files" ? (
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
                    reviewProgress={reviewProgress}
                    reviewCompletedAt={reviewCompletedAt}
                    showReviewProgress={showReviewProgress}
                    full
                    compact={compact}
                  />
                ) : null}
                {activeWorkspace === "intelligence" ? (
                  intelligenceReady && intelligence ? (
                    <IntelligencePanel
                      model={intelligence}
                      response={response}
                      result={currentResult}
                      onExport={() => exportIntelligencePdf().catch((error) => setStatus(errorMessage(error)))}
                    />
                  ) : (
                    <IntelligenceUnavailableCover
                      missingDocs={missingDocs}
                      uploadedCount={response.files.length}
                      onGoChat={() => setActiveWorkspace("chat")}
                      onAttachFiles={openFilePicker}
                    />
                  )
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
  emailLookupBusy,
  legalAccepted,
  setLegalAccepted,
  onEmailBlur,
  onStart,
  onShowLogin,
}: {
  contact: typeof initialContact;
  setContact: (value: typeof initialContact) => void;
  busy: boolean;
  emailLookupBusy: boolean;
  legalAccepted: boolean;
  setLegalAccepted: (value: boolean) => void;
  onEmailBlur: () => void;
  onStart: () => void;
  onShowLogin: () => void;
}) {
  return (
    <div style={stepOneFormCard}>
      <div>
        <h2 style={stepOneFormTitle}>Start secure intake</h2>
        <p style={stepOneFormCopy}>Takes under a minute. No credit pull to begin.</p>
      </div>
      <Field label="Full name" value={contact.full_name} onChange={(value) => setContact({ ...contact, full_name: value })} />
      <Field label="Email" value={contact.email} onChange={(value) => setContact({ ...contact, email: value })} onBlur={onEmailBlur} />
      {emailLookupBusy ? <div style={fieldHint}>Checking for an existing secure file...</div> : null}
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
      <button type="button" style={inlineLoginButton} onClick={onShowLogin}>
        Already started? Login with email code
      </button>
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

function DealerContinuationWidget({
  email,
  setEmail,
  code,
  setCode,
  codeSent,
  busy,
  onSendCode,
  onVerify,
  onBack,
}: {
  email: string;
  setEmail: (value: string) => void;
  code: string;
  setCode: (value: string) => void;
  codeSent: boolean;
  busy: boolean;
  onSendCode: () => void;
  onVerify: () => void;
  onBack: () => void;
}) {
  return (
    <div style={resumeCard}>
      <div>
        <strong>Already started?</strong>
        <p style={stepOneFormCopy}>Enter your email and we will send a short access code for your existing dealer file.</p>
      </div>
      <div style={resumeGrid}>
        <input style={input} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@dealership.com" />
        <button type="button" style={secondaryButton} disabled={busy} onClick={onSendCode}>{codeSent ? "Resend code" : "Send code"}</button>
      </div>
      {codeSent ? (
        <div style={resumeGrid}>
          <input style={input} value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" inputMode="numeric" />
          <button type="button" style={secondaryButton} disabled={busy} onClick={onVerify}>Continue</button>
        </div>
      ) : null}
      <button type="button" style={inlineLoginButton} onClick={onBack}>
        Start a new dealer review instead
      </button>
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
      <TextAreaField
        label="Detailed use of funds"
        value={deal.loan_purpose}
        onChange={(value) => setDeal({ ...deal, loan_purpose: value })}
        placeholder="Break down payoff amounts, working capital, inventory, taxes, repairs, acquisition, cash-out reserves, or other planned uses."
      />
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
  activeTab,
  onTabChange,
  onCopyResume,
  onLogout,
}: {
  response: IntakeResponse;
  missingDocs: RequestedDoc[];
  reviewStatus: string;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onCopyResume: () => void;
  onLogout: () => void;
}) {
  const tabs: Array<{ key: WorkspaceTab; label: string; detail: string }> = [
    { key: "chat", label: "Underwriter chat", detail: reviewStatus },
    { key: "files", label: "Files drawer", detail: `${response.files.length} uploaded` },
    { key: "intelligence", label: "Intelligence", detail: !response.files.length ? "Upload first" : missingDocs.length ? `${missingDocs.length} open metrics` : "Cockpit ready" },
  ];
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
        {tabs.map((tab) => {
          const isIntelligence = tab.key === "intelligence";
          const activeStyle = isIntelligence ? sidebarNavItemIntelActive : sidebarNavItemActive;
          const idleStyle = isIntelligence ? sidebarNavItemIntel : sidebarNavItem;
          return (
            <button
              key={tab.key}
              type="button"
              style={activeTab === tab.key ? activeStyle : idleStyle}
              onClick={() => onTabChange(tab.key)}
            >
              <span style={sidebarNavLabelRow}>
                {isIntelligence ? <span style={intelligenceNavIcon}>◆</span> : null}
                <span>{tab.label}</span>
              </span>
              <small>{tab.detail}</small>
            </button>
          );
        })}
      </nav>

      <div style={sidebarSection}>
        <div style={sidebarSectionTitle}>Pinned</div>
        <div style={sidebarMiniCard}>
          <strong>{response.intake.business_name || response.intake.full_name}</strong>
          <span>{response.files.length} files | {missingDocs.length} missing</span>
        </div>
        <div style={sidebarMiniCard}>
          <strong>Baseline package</strong>
          <span>Business taxes, YTD P&L, main bank statements</span>
        </div>
      </div>

      <div style={sidebarFooter}>
        <div style={sidebarFooterIconGroup}>
          {response.resume_url ? (
            <button type="button" style={sidebarIconButton} onClick={onCopyResume} aria-label="Copy resume link" title="Copy resume link">
              <LinkIcon />
            </button>
          ) : null}
          <button type="button" style={sidebarLogoutIconButton} onClick={onLogout} aria-label="Logout" title="Logout">
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function AttachmentTray({ files, compact, onRemove }: { files: QueuedFile[]; compact: boolean; onRemove: (id: string) => void }) {
  return (
    <div style={compact ? attachmentTrayMobile : attachmentTray}>
      <div style={attachmentTrayHeader}>
        <strong>{files.length} pending</strong>
        <span>Encrypted on upload</span>
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
  reviewProgress,
  reviewCompletedAt,
  showReviewProgress,
  full = false,
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
  reviewProgress: ReviewProgressStage;
  reviewCompletedAt: string | null;
  showReviewProgress: boolean;
  full?: boolean;
  compact?: boolean;
}) {
  const docsById = new Map(response.requested_documents.map((doc) => [doc.id, doc]));
  const readyCount = pendingFiles.filter((file) => file.status === "ready" || file.status === "error").length;
  const evidenceByFileId = evidenceMapByFileId(result);
  const childFilesByParent = new Map<string, UploadedFile[]>();
  for (const file of response.files) {
    if (!file.parent_zip_file_id) continue;
    const children = childFilesByParent.get(file.parent_zip_file_id) ?? [];
    children.push(file);
    childFilesByParent.set(file.parent_zip_file_id, children);
  }
  const topLevelFiles = response.files.filter((file) => !file.parent_zip_file_id);
  return (
    <section style={compact ? fileDrawerPanelMobile : full ? fileDrawerPanelFull : fileDrawerPanel}>
      <div style={sideCardHeader}>
        <div>
          <div style={sideEyebrow}>Files</div>
          <h2 style={sideTitle}>Uploaded evidence</h2>
          {!showReviewProgress && reviewCompletedAt ? <span style={smallMuted}>Last review {formatDate(reviewCompletedAt)}</span> : null}
        </div>
        <button type="button" style={miniButton} onClick={onAttachFiles}>Attach</button>
      </div>

      {fundability ? <FundabilityBanner banner={fundability} /> : null}
      {showReviewProgress ? <ReviewProgress stage={reviewProgress} completedAt={reviewCompletedAt} compact /> : null}

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
          {topLevelFiles.length ? topLevelFiles.map((file) => {
            const doc = file.requested_document_id ? docsById.get(file.requested_document_id) : null;
            const evidence = evidenceByFileId.get(file.id);
            const extractedChildren = childFilesByParent.get(file.id) ?? [];
            return (
              <div key={file.id} style={uploadedFileCard}>
                <div style={fileTypeBadge}>{fileLabel(file)}</div>
                <div style={{ minWidth: 0 }}>
                  <strong style={truncate}>{file.file_name}</strong>
                  <span style={smallMuted}>{evidence?.classification || doc?.name || "Let AI classify"} | {formatSize(file.size_bytes)} | {formatDate(file.created_at)}</span>
                  {file.extraction_status ? <span style={evidenceLine}>Archive extraction: {file.extraction_status}{extractedChildren.length ? ` | ${extractedChildren.length} file${extractedChildren.length === 1 ? "" : "s"} organized` : ""}</span> : null}
                  {evidence?.supports ? <span style={evidenceLine}>{evidence.supports}</span> : null}
                  {extractedChildren.length ? (
                    <div style={zipChildList}>
                      {extractedChildren.map((child) => {
                        const childEvidence = evidenceByFileId.get(child.id);
                        return (
                          <div key={child.id} style={zipChildRow}>
                            <span style={fileTypeBadgeSmall}>{fileLabel(child)}</span>
                            <div style={{ minWidth: 0 }}>
                              <strong style={truncate}>{child.zip_entry_path || child.file_name}</strong>
                              <span style={smallMuted}>{childEvidence?.classification || "AI will classify"} | {formatSize(child.size_bytes)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
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

function reviewProgressLabel(stage: ReviewProgressStage): string {
  if (stage === "complete") return "Review complete";
  if (stage === "error") return "Review needs attention";
  return REVIEW_PROGRESS_STAGES.find((item) => item.key === stage)?.label || "Reviewing files";
}

function reviewProgressPercent(stage: ReviewProgressStage): number {
  if (stage === "idle") return 0;
  if (stage === "complete") return 100;
  if (stage === "error") return 100;
  const index = REVIEW_PROGRESS_STAGES.findIndex((item) => item.key === stage);
  return index >= 0 ? Math.round(((index + 1) / REVIEW_PROGRESS_STAGES.length) * 100) : 0;
}

function ReviewProgress({ stage, completedAt, compact }: { stage: ReviewProgressStage; completedAt: string | null; compact?: boolean }) {
  const isError = stage === "error";
  const isComplete = stage === "complete";
  const percent = reviewProgressPercent(stage);
  const label = reviewProgressLabel(stage);
  const nextStage = REVIEW_PROGRESS_STAGES.find((item) => reviewProgressPercent(item.key) > percent)?.label;
  const detail = isComplete && completedAt ? `Done ${formatDate(completedAt)}` : isError ? "Needs retry" : nextStage ? `Next: ${nextStage}` : `${percent}%`;
  return (
    <div style={{ ...reviewProgressShell, ...(compact ? reviewProgressShellCompact : null), ...(isError ? reviewProgressShellError : null), ...(isComplete ? reviewProgressShellComplete : null) }}>
      <div style={reviewProgressTop}>
        <div style={reviewProgressLabelWrap}>
          <span style={isError ? reviewProgressBarDotError : isComplete ? reviewProgressBarDotComplete : reviewProgressBarDot} />
          <strong>{label}</strong>
        </div>
        <span style={reviewProgressDetail}>{detail}</span>
      </div>
      <div style={reviewProgressTrack}>
        <div style={{ ...reviewProgressFill, width: `${percent}%`, ...(isError ? reviewProgressFillError : null), ...(isComplete ? reviewProgressFillComplete : null) }} />
      </div>
    </div>
  );
}

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
  const probability = String(result?.probability_status || "").trim();
  const summary = String(result?.one_next_step || bankability?.reason || result?.executive_summary || "Upload files and run the preliminary screen to generate an underwriting summary.");
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
        <strong style={resultStatus}>{probability || String(bankability?.status || (result ? "Review ready" : "No review yet"))}</strong>
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

function IntelligenceUnavailableCover({
  missingDocs,
  uploadedCount,
  onGoChat,
  onAttachFiles,
}: {
  missingDocs: RequestedDoc[];
  uploadedCount: number;
  onGoChat: () => void;
  onAttachFiles: () => void;
}) {
  return (
    <section style={intelligenceCover}>
      <div style={intelligenceCoverGlow} />
      <div style={intelligenceCoverCard}>
        <div style={intelligenceCoverIcon}>
          <span style={{ ...intelligenceCoverIconBar, height: "48%" }} />
          <span style={{ ...intelligenceCoverIconBar, height: "78%" }} />
          <span style={{ ...intelligenceCoverIconBar, height: "62%" }} />
        </div>
        <div style={sideEyebrow}>Intelligence cockpit</div>
        <h2 style={intelligenceCoverTitle}>Not enough evidence yet</h2>
        <p style={intelligenceCoverCopy}>
          Go back to the chat to upload documents and clarify your lending needs before accessing this page.
          Once the underwriter has a preliminary screen, this area will unlock with DSCR, cash-flow, LTV,
          collateral, evidence coverage, risks, and exportable charts.
        </p>
        <div style={intelligenceCoverStats}>
          <div style={intelligenceCoverStat}>
            <strong>{uploadedCount}</strong>
            <span>files uploaded</span>
          </div>
          <div style={intelligenceCoverStat}>
            <strong>{missingDocs.length}</strong>
            <span>baseline items open</span>
          </div>
        </div>
        <div style={intelligenceCoverActions}>
          <button type="button" style={primaryButton} onClick={onGoChat}>Return to chat</button>
          <button type="button" style={coverSecondaryButton} onClick={onAttachFiles}>Attach evidence</button>
        </div>
        <div style={intelligenceCoverNeeds}>
          <strong>Start with Stage 1 evidence</strong>
          <span>Business tax returns, YTD P&L, last 6 months of the main operating bank statements, and a detailed use-of-funds breakdown.</span>
        </div>
      </div>
    </section>
  );
}

function IntelligencePanel({
  model,
  response,
  result,
  onExport,
}: {
  model: IntelligenceModel;
  response: IntakeResponse;
  result: Record<string, unknown> | null;
  onExport: () => void;
}) {
  const probability = String(result?.probability_status || model.status?.title || "Awaiting review");
  return (
    <section style={intelligencePanel}>
      <div style={intelligenceHeader}>
        <div>
          <div style={sideEyebrow}>Underwriting intelligence</div>
          <h2 style={intelligenceTitle}>{response.intake.business_name || response.intake.full_name}</h2>
          <p style={muted}>Visual cockpit derived from uploaded evidence, chat answers, and the latest AI screen.</p>
        </div>
        <button type="button" style={primaryButton} onClick={onExport}>Export PDF</button>
      </div>

      {model.status ? <FundabilityBanner banner={model.status} /> : (
        <div style={intelligenceEmptyBanner}>
          <strong>No preliminary screen yet</strong>
          <span>Upload files or ask the underwriter to screen the package. Metrics will populate as evidence is extracted.</span>
        </div>
      )}

      <div style={kpiGrid}>
        <IntelligenceKpi metric={model.requestedAmount} />
        <IntelligenceKpi metric={model.annualizedRevenue} />
        <IntelligenceKpi metric={model.debtBurden} />
        <IntelligenceKpi metric={model.dscr} emphasis />
        <IntelligenceKpi metric={model.ltv} />
        <IntelligenceKpi metric={model.equity} />
        <IntelligenceKpi metric={model.confidence} />
      </div>

      <div style={chartGrid}>
        <div style={chartCard}>
          <div style={chartHeader}>
            <strong>Debt service coverage</strong>
            <span style={metricSourcePill(model.dscr.source)}>{model.dscr.source}</span>
          </div>
          <GaugeChart value={model.dscr.raw} />
          <p style={smallMuted}>{model.dscr.detail || "Coverage will populate when cash flow and debt service evidence is available."}</p>
        </div>

        <div style={chartCard}>
          <div style={chartHeader}>
            <strong>Real estate equity / LTV</strong>
            <span style={metricSourcePill(model.ltv.source)}>{model.ltv.source}</span>
          </div>
          <EquityChart equity={model.equity.raw} ltv={model.ltv.raw} />
          <p style={smallMuted}>{model.equity.detail || "Collateral values and payoff balances are needed for equity and LTV."}</p>
        </div>

        <div style={chartCardWide}>
          <div style={chartHeader}>
            <strong>Cash flow stack</strong>
            <span style={smallMuted}>Revenue / cash flow / debt service</span>
          </div>
          <CashFlowBars bars={model.cashFlowBars} />
        </div>

        <div style={chartCard}>
          <div style={chartHeader}>
            <strong>Month-to-month cash flow</strong>
            <span style={smallMuted}>Bank statement trend</span>
          </div>
          <MiniBarChart series={model.monthlySeries} emptyLabel="Awaiting six months of main operating bank statements." />
        </div>

        <div style={chartCard}>
          <div style={chartHeader}>
            <strong>Year-to-year performance</strong>
            <span style={smallMuted}>Tax / P&L trend</span>
          </div>
          <MiniBarChart series={model.yearlySeries} emptyLabel="Awaiting tax returns and YTD P&L figures." />
        </div>
      </div>

      <div style={intelligenceTables}>
        <div style={chartCard}>
          <div style={chartHeader}>
            <strong>Evidence coverage</strong>
            <span style={smallMuted}>{response.files.length} files</span>
          </div>
          <EvidenceCoverageTable rows={model.coverage} />
        </div>
        <div style={chartCard}>
          <div style={chartHeader}>
            <strong>Still needed</strong>
            <span style={smallMuted}>{model.missing.length} items</span>
          </div>
          <MissingTable rows={model.missing} />
        </div>
      </div>

      <div style={intelligenceTables}>
        <RiskStrengthTable title="Strengths" rows={model.strengths} tone="green" />
        <RiskStrengthTable title="Risks" rows={model.risks} tone="amber" />
      </div>

      <div style={intelligenceNextStep}>
        <span>Next underwriting move</span>
        <strong>{model.oneNextStep || probability}</strong>
      </div>
    </section>
  );
}

function IntelligenceKpi({ metric, emphasis }: { metric: IntelligenceValue; emphasis?: boolean }) {
  return (
    <div style={emphasis ? kpiCardEmphasis : kpiCard}>
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <div style={kpiFooter}>
        <span style={metricSourcePill(metric.source)}>{metric.source}</span>
        {metric.detail ? <small>{metric.detail}</small> : null}
      </div>
    </div>
  );
}

function GaugeChart({ value }: { value: number | null | undefined }) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
  const clamped = numeric === null ? 0 : Math.max(0, Math.min(numeric, 3));
  const angle = -90 + (clamped / 3) * 180;
  const x = 100 + 70 * Math.cos((angle * Math.PI) / 180);
  const y = 92 + 70 * Math.sin((angle * Math.PI) / 180);
  return (
    <div style={gaugeWrap}>
      <svg viewBox="0 0 200 120" style={gaugeSvg} aria-label="DSCR gauge">
        <path d="M30 92 A70 70 0 0 1 170 92" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="16" strokeLinecap="round" />
        <path d="M30 92 A70 70 0 0 1 73 28" fill="none" stroke="#EF4444" strokeWidth="16" strokeLinecap="round" />
        <path d="M73 28 A70 70 0 0 1 116 28" fill="none" stroke="#F59E0B" strokeWidth="16" strokeLinecap="round" />
        <path d="M116 28 A70 70 0 0 1 170 92" fill="none" stroke="#34D399" strokeWidth="16" strokeLinecap="round" />
        <line x1="100" y1="92" x2={x} y2={y} stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" />
        <circle cx="100" cy="92" r="8" fill="#F8FAFC" />
      </svg>
      <strong>{numeric === null ? "Awaiting evidence" : `${numeric.toFixed(2)}x`}</strong>
      <span>0.00x - 3.00x</span>
    </div>
  );
}

function EquityChart({ equity, ltv }: { equity: number | null | undefined; ltv: number | null | undefined }) {
  const ltvPct = typeof ltv === "number" && Number.isFinite(ltv) ? Math.max(0, Math.min(ltv, 100)) : null;
  const equityPct = ltvPct === null ? null : Math.max(0, 100 - ltvPct);
  return (
    <div style={equityChartWrap}>
      <div style={equityTrack}>
        <div style={{ ...equityDebtFill, width: `${ltvPct ?? 0}%` }} />
        <div style={{ ...equityValueFill, width: `${equityPct ?? 0}%` }} />
      </div>
      <div style={equityLegend}>
        <span><b style={legendDebtDot} /> Debt / proposed LTV {ltvPct === null ? "—" : `${ltvPct.toFixed(1)}%`}</span>
        <span><b style={legendEquityDot} /> Equity {typeof equity === "number" ? formatMoneyCompact(equity) : "Awaiting evidence"}</span>
      </div>
    </div>
  );
}

function CashFlowBars({ bars }: { bars: IntelligenceModel["cashFlowBars"] }) {
  const max = Math.max(...bars.map((bar) => Math.abs(bar.value || 0)), 1);
  return (
    <div style={cashFlowBarList}>
      {bars.map((bar) => {
        const value = typeof bar.value === "number" && Number.isFinite(bar.value) ? bar.value : null;
        const width = value === null ? 0 : Math.max(4, Math.min(100, (Math.abs(value) / max) * 100));
        return (
          <div key={bar.label} style={cashFlowBarRow}>
            <div style={cashFlowBarLabel}>
              <span>{bar.label}</span>
              <strong>{value === null ? "Awaiting evidence" : formatMoneyCompact(value)}</strong>
            </div>
            <div style={cashFlowTrack}>
              <div style={{ ...cashFlowFill, width: `${width}%`, background: value !== null && value < 0 ? "#EF4444" : "#21D3C7" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniBarChart({ series, emptyLabel }: { series: Array<{ label: string; value: number | null }>; emptyLabel: string }) {
  const valid = series.filter((item) => typeof item.value === "number" && Number.isFinite(item.value));
  if (!valid.length) return <div style={chartEmptyState}>{emptyLabel}</div>;
  const max = Math.max(...valid.map((item) => Math.abs(item.value || 0)), 1);
  return (
    <div style={miniChart}>
      {series.map((item) => {
        const value = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null;
        const height = value === null ? 8 : Math.max(12, Math.min(100, (Math.abs(value) / max) * 100));
        return (
          <div key={item.label} style={miniChartColumn}>
            <div style={miniChartBarWrap}>
              <div style={{ ...miniChartBar, height: `${height}%`, opacity: value === null ? 0.22 : 1 }} />
            </div>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceCoverageTable({ rows }: { rows: IntelligenceModel["coverage"] }) {
  if (!rows.length) return <div style={chartEmptyState}>Awaiting AI evidence map.</div>;
  return (
    <div style={intelligenceTable}>
      {rows.slice(0, 8).map((row) => (
        <div key={row.category} style={intelligenceTableRow}>
          <strong>{row.category}</strong>
          <span style={coverageStatusStyle(row.status)}>{row.status}</span>
          <small>{row.evidence || row.gap || "No evidence listed yet."}</small>
        </div>
      ))}
    </div>
  );
}

function MissingTable({ rows }: { rows: IntelligenceModel["missing"] }) {
  if (!rows.length) return <div style={chartEmptyState}>No blocking Stage 1 items listed in the latest screen.</div>;
  return (
    <div style={intelligenceTable}>
      {rows.slice(0, 8).map((row) => (
        <div key={`${row.title}-${row.priority}`} style={intelligenceTableRow}>
          <strong>{row.title}</strong>
          <span style={priorityPill(row.priority)}>{row.priority || "open"}</span>
          <small>{row.detail}</small>
        </div>
      ))}
    </div>
  );
}

function RiskStrengthTable({ title, rows, tone }: { title: string; rows: string[]; tone: "green" | "amber" }) {
  return (
    <div style={chartCard}>
      <div style={chartHeader}>
        <strong>{title}</strong>
        <span style={tone === "green" ? completeChip : missingChip}>{rows.length || 0}</span>
      </div>
      <div style={riskList}>
        {rows.length ? rows.slice(0, 7).map((row, index) => (
          <div key={`${title}-${index}`} style={tone === "green" ? strengthRow : riskRow}>{row}</div>
        )) : <div style={chartEmptyState}>Awaiting review extraction.</div>}
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

function Field({ label, value, onChange, placeholder, onBlur }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; onBlur?: () => void }) {
  return (
    <label style={fieldWrap}>
      <span style={labelStyle}>{label}</span>
      <input style={input} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} />
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
  if (name.endsWith(".zip")) return "ZIP";
  if (file.content_type.startsWith("image/")) return "IMG";
  return "FILE";
}

function isStageOneRequestedDoc(doc: RequestedDoc): boolean {
  const text = `${doc.name} ${doc.category ?? ""} ${doc.description ?? ""}`.toLowerCase();
  return (
    text.includes("tax") ||
    text.includes("p&l") ||
    text.includes("profit and loss") ||
    text.includes("bank statement")
  );
}

function fundabilityBanner(result: Record<string, unknown> | null, bankability: Record<string, unknown> | null): FundabilityBannerData | null {
  if (!result && !bankability) return null;
  const probability = String(result?.probability_status || "").trim();
  const rawStatus = String(probability || bankability?.status || result?.status || "Preliminary review").trim();
  const reason = String(result?.one_next_step || bankability?.reason || result?.executive_summary || "Review the AI screen in chat for the current underwriting position.");
  if (probability === "Good probability - book call") {
    return {
      tone: "green",
      label: "Stage 1 bankability",
      title: probability,
      detail: reason,
    };
  }
  if (probability === "Poor probability based on current file") {
    return {
      tone: "red",
      label: "Stage 1 bankability",
      title: probability,
      detail: reason,
    };
  }
  if (probability === "Promising but needs one clarification" || probability === "Not enough evidence yet") {
    return {
      tone: "amber",
      label: "Stage 1 bankability",
      title: probability,
      detail: reason,
    };
  }
  const statusOnly = rawStatus.toLowerCase();
  const normalized = `${rawStatus} ${reason}`.toLowerCase();
  const isNegative =
    statusOnly.includes("not fundable") ||
    statusOnly.includes("not bankable") ||
    statusOnly.includes("unfundable") ||
    statusOnly.includes("decline") ||
    normalized.includes("file is not fundable") ||
    normalized.includes("file is not bankable");
  if (isNegative) {
    return {
      tone: "red",
      label: "Preliminary screen",
      title: rawStatus || "Not fundable",
      detail: reason,
    };
  }
  const isConditional =
    normalized.includes("cannot") ||
    normalized.includes("incomplete") ||
    normalized.includes("missing") ||
    normalized.includes("determine") ||
    normalized.includes("preliminary") ||
    normalized.includes("subject to") ||
    normalized.includes("confirmation") ||
    normalized.includes("conditional");
  const isExplicitPositive =
    ["bankable", "fundable", "yes", "approved"].includes(statusOnly) ||
    statusOnly.startsWith("bankable -") ||
    statusOnly.startsWith("fundable -");
  if (isConditional || !isExplicitPositive) {
    return {
      tone: "amber",
      label: "Preliminary screen",
      title: rawStatus || "Cannot determine yet",
      detail: reason,
    };
  }
  if (isExplicitPositive) {
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

function buildIntelligenceModel(
  response: IntakeResponse,
  result: Record<string, unknown> | null,
  missingDocs: RequestedDoc[],
  status: FundabilityBannerData | null,
): IntelligenceModel {
  const keyMetrics = asRecord(result?.key_metrics);
  const evidence = asRecord(result?.document_evidence_map);
  const bankability = asRecord(result?.bankability_assessment);
  const requestedAmount = numberFromUnknown(response.intake.requested_loan_amount ?? keyMetrics?.requested_amount);
  const annualizedRevenue = numberFromUnknown(keyMetrics?.ytd_annualized_revenue ?? keyMetrics?.annualized_adjusted_deposits);
  const debtBurden = numberFromUnknown(keyMetrics?.estimated_debt_burden);
  const dscr = numberFromUnknown(keyMetrics?.estimated_dscr);
  const collateral = collateralPosition(response);
  const ltv = collateral.value && (collateral.debt || requestedAmount)
    ? ((collateral.debt || 0) + (requestedAmount || 0)) / collateral.value * 100
    : numberFromUnknown(keyMetrics?.estimated_ltv ?? keyMetrics?.ltv);
  const equity = collateral.value ? collateral.value - (collateral.debt || 0) : numberFromUnknown(keyMetrics?.equity_position ?? keyMetrics?.available_equity);
  const missingRows = arrayOfRecords(result?.missing_or_incomplete_items).map((item) => ({
    title: String(item.title || "Missing item"),
    detail: String(item.detail || ""),
    priority: String(item.priority || "open"),
  }));
  const coverageRows = arrayOfRecords(evidence?.baseline_coverage).map((item) => ({
    category: String(item.category || "Evidence"),
    status: String(item.status || "unclear"),
    evidence: Array.isArray(item.evidence) ? item.evidence.map(String).join(" | ") : String(item.evidence || ""),
    gap: String(item.gap || ""),
  }));
  const fallbackCoverage = missingDocs.map((doc) => ({
    category: doc.name,
    status: "missing",
    evidence: "",
    gap: doc.description || "No supporting file has been matched yet.",
  }));
  return {
    status,
    requestedAmount: metricValue("Requested capital", requestedAmount, "estimated", response.intake.requested_loan_amount ? "Entered during intake" : "Awaiting requested amount", "money"),
    annualizedRevenue: metricValue("Annualized revenue", annualizedRevenue, "extracted", "From YTD P&L, tax returns, or bank deposits when available", "money"),
    debtBurden: metricValue("Debt burden", debtBurden, "extracted", "Current monthly or annualized debt service", "money"),
    dscr: metricValue("DSCR estimate", dscr, "extracted", "Coverage based on available cash-flow evidence", "ratio"),
    ltv: metricValue("Proposed LTV", ltv, collateral.value ? "estimated" : "unavailable", "Value less debt plus requested capital where available", "percent"),
    equity: metricValue("Collateral equity", equity, collateral.value ? "estimated" : "unavailable", "Estimated property value less stated debt", "money"),
    confidence: {
      label: "AI confidence",
      value: String(result?.confidence || "Awaiting review"),
      source: result?.confidence ? "extracted" : "unavailable",
      detail: String(result?.probability_status || bankability?.status || ""),
      raw: null,
    },
    coverage: coverageRows.length ? coverageRows : fallbackCoverage,
    strengths: arrayOfStrings(result?.strengths),
    risks: arrayOfStrings(result?.risks),
    missing: missingRows.length ? missingRows : missingDocs.map((doc) => ({ title: doc.name, detail: doc.description || "Required for Stage 1 bankability.", priority: "high" })),
    cashFlowBars: [
      { label: "Annualized revenue", value: annualizedRevenue, source: annualizedRevenue === null ? "unavailable" : "extracted" },
      { label: "Estimated cash flow", value: numberFromUnknown(keyMetrics?.estimated_ebitda_or_cash_flow), source: keyMetrics?.estimated_ebitda_or_cash_flow ? "extracted" : "unavailable" },
      { label: "Debt burden", value: debtBurden, source: debtBurden === null ? "unavailable" : "extracted" },
      { label: "Net after debt", value: annualizedRevenue !== null && debtBurden !== null ? annualizedRevenue - debtBurden : null, source: annualizedRevenue !== null && debtBurden !== null ? "estimated" : "unavailable" },
    ],
    monthlySeries: seriesFromResult(result, ["monthly_cash_flow", "month_to_month_cash_flow", "monthly_deposits", "bank_statement_months"]),
    yearlySeries: seriesFromResult(result, ["year_to_year_revenue", "annual_revenue", "tax_return_years", "yearly_profit"]),
    oneNextStep: String(result?.one_next_step || asRecord(result?.next_best_action)?.detail || bankability?.reason || "Run the preliminary screen after uploading evidence."),
  };
}

function metricValue(
  label: string,
  raw: number | null,
  source: IntelligenceValue["source"],
  detail: string,
  format: "money" | "ratio" | "percent" | "plain",
): IntelligenceValue {
  if (raw === null || !Number.isFinite(raw)) {
    return { label, value: "Awaiting evidence", source: "unavailable", detail, raw: null };
  }
  let value = `${raw}`;
  if (format === "money") value = formatMoneyCompact(raw);
  if (format === "ratio") value = `${raw.toFixed(2)}x`;
  if (format === "percent") value = `${raw.toFixed(1)}%`;
  return { label, value, source, detail, raw };
}

function collateralPosition(response: IntakeResponse): { value: number | null; debt: number | null } {
  const rows = response.intake.asset_rows ?? [];
  let value = 0;
  let debt = 0;
  for (const row of rows) {
    value += Number(row.estimated_property_value || 0);
    debt += Number(row.estimated_loan_amount || 0);
  }
  return { value: value > 0 ? value : null, debt: debt > 0 ? debt : null };
}

function seriesFromResult(result: Record<string, unknown> | null, keys: string[]): Array<{ label: string; value: number | null }> {
  for (const key of keys) {
    const raw = result?.[key];
    if (!Array.isArray(raw)) continue;
    const rows = raw
      .map((item, index) => {
        if (typeof item === "number") return { label: `${index + 1}`, value: item };
        const record = asRecord(item);
        if (!record) return null;
        const label = String(record.month || record.year || record.label || `${index + 1}`);
        const value = numberFromUnknown(record.value ?? record.revenue ?? record.deposits ?? record.cash_flow ?? record.net_income);
        return { label, value };
      })
      .filter((item): item is { label: string; value: number | null } => Boolean(item));
    if (rows.length) return rows.slice(0, 12);
  }
  return [];
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  const multiplier = lower.includes("b") ? 1_000_000_000 : lower.includes("m") ? 1_000_000 : lower.includes("k") ? 1_000 : 1;
  const negative = /\([^)]*\)/.test(value) || lower.trim().startsWith("-");
  const cleaned = lower.replace(/[$,%x,\s,kmb()]/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.abs(parsed) * multiplier * (negative ? -1 : 1);
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function formatMoneyCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function metricSourcePill(source: IntelligenceValue["source"]): CSSProperties {
  if (source === "verified") return verifiedSourcePill;
  if (source === "extracted") return extractedSourcePill;
  if (source === "estimated") return estimatedSourcePill;
  return unavailableSourcePill;
}

function coverageStatusStyle(status: string): CSSProperties {
  const normalized = status.toLowerCase();
  if (normalized.includes("satisfied")) return completeChip;
  if (normalized.includes("partial")) return estimatedSourcePill;
  if (normalized.includes("missing")) return missingChip;
  return unavailableSourcePill;
}

function priorityPill(priority: string): CSSProperties {
  const normalized = priority.toLowerCase();
  if (normalized.includes("high")) return missingChip;
  if (normalized.includes("low")) return completeChip;
  return estimatedSourcePill;
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

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  cursor: "pointer",
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
const inlineLoginButton: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#F5E49A",
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
  justifySelf: "center",
  padding: "0 4px",
};
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
const workspaceGridSingle: CSSProperties = {
  ...workspaceGrid,
  gridTemplateColumns: "minmax(0,1fr)",
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
  position: "relative",
  background: "transparent",
  border: 0,
  borderRadius: 0,
  display: "flex",
  flexDirection: "column",
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
const messagesModern: CSSProperties = { flex: "1 1 auto", minHeight: 0, padding: "22px min(7vw,92px)", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" };
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
const sidebarNavLabelRow: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 };
const intelligenceNavIcon: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 7,
  display: "inline-grid",
  placeItems: "center",
  flexShrink: 0,
  fontSize: 9,
  color: "#04111F",
  background: "linear-gradient(135deg,#21D3C7,#F2D36B)",
  boxShadow: "0 0 18px rgba(33,211,199,.36)",
};
const sidebarNavItemIntel: CSSProperties = {
  ...sidebarNavItem,
  border: "1px solid rgba(33,211,199,.18)",
  background: "linear-gradient(135deg,rgba(33,211,199,.09),rgba(212,175,55,.07),rgba(255,255,255,.02))",
};
const sidebarNavItemIntelActive: CSSProperties = {
  ...sidebarNavItemIntel,
  borderColor: "rgba(33,211,199,.42)",
  background: "linear-gradient(135deg,rgba(33,211,199,.18),rgba(212,175,55,.12),rgba(255,255,255,.05))",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,.03), 0 10px 28px rgba(33,211,199,.10)",
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
const sidebarFooter: CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,.08)",
  paddingTop: 10,
  display: "flex",
  justifyContent: "flex-start",
};
const sidebarFooterIconGroup: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};
const sidebarIconButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 12,
  width: 40,
  height: 40,
  padding: 0,
  background: "rgba(255,255,255,.045)",
  color: "#E2E8F0",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
const sidebarLogoutIconButton: CSSProperties = {
  ...sidebarIconButton,
  color: "#FCA5A5",
  borderColor: "rgba(248,113,113,.18)",
  background: "rgba(127,29,29,.10)",
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
const assistantRow: CSSProperties = {
  alignSelf: "stretch",
  display: "grid",
  gridTemplateColumns: "34px minmax(0,1fr)",
  gap: 12,
  alignItems: "start",
};
const assistantAvatar: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 11,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg,#E9D58A,#D4AF37)",
  color: "#0B1326",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.5,
  marginTop: 2,
  boxShadow: "0 6px 18px rgba(212,175,55,.22)",
  userSelect: "none",
};
const assistantBubble: CSSProperties = {
  minWidth: 0,
  maxWidth: 780,
  padding: "3px 0",
  borderRadius: 0,
  background: "transparent",
  border: 0,
  color: "#F3F4F6",
  lineHeight: 1.62,
  whiteSpace: "pre-wrap",
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
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  overflow: "hidden",
};
const disabledAttachButton: CSSProperties = { ...attachButton, opacity: 0.45, cursor: "not-allowed" };
const fileInputOverlay: CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0,
  cursor: "pointer",
};
const dropHint: CSSProperties = {
  position: "absolute",
  inset: 12,
  zIndex: 30,
  border: "1px dashed rgba(33,211,199,.70)",
  borderRadius: 22,
  background: "rgba(3,7,18,.84)",
  color: "#D9FFFB",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  pointerEvents: "none",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06), 0 28px 90px rgba(0,0,0,.36)",
};
const attachmentTray: CSSProperties = {
  margin: "0 min(7vw,92px)",
  border: "1px solid rgba(255,255,255,.08)",
  background: "rgba(255,255,255,.025)",
  borderRadius: 999,
  padding: "8px 10px",
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
};
const attachmentTrayMobile: CSSProperties = { ...attachmentTray, margin: "0 12px", borderRadius: 16, alignItems: "stretch", flexDirection: "column" };
const attachmentTrayHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#E2E8F0",
  fontSize: 12,
  whiteSpace: "nowrap",
};
const attachmentList: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" };
const attachmentPill: CSSProperties = {
  maxWidth: 220,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.045)",
  color: "#EAF2FF",
  borderRadius: 999,
  padding: "5px 6px 5px 10px",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  alignItems: "center",
  gap: 6,
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
const fileDrawerPanelFull: CSSProperties = {
  ...fileDrawerPanel,
  maxWidth: 1100,
  justifySelf: "center",
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
const fileTypeBadgeSmall: CSSProperties = {
  ...fileTypeBadge,
  width: 30,
  height: 30,
  borderRadius: 9,
  fontSize: 9,
};
const zipChildList: CSSProperties = { display: "grid", gap: 6, marginTop: 8 };
const zipChildRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "30px minmax(0,1fr)",
  gap: 8,
  alignItems: "center",
  padding: 7,
  borderRadius: 10,
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.08)",
};
const warningText: CSSProperties = { display: "block", color: "#F6E7A6", fontSize: 13, lineHeight: 1.35 };
const reviewProgressShell: CSSProperties = {
  flex: "0 0 auto",
  alignSelf: "center",
  width: "min(720px, calc(100% - 64px))",
  margin: "0 0 10px",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 16,
  background: "rgba(12,12,12,.88)",
  boxShadow: "0 14px 35px rgba(0,0,0,.22)",
  padding: "10px 12px",
  display: "grid",
  gap: 7,
};
const reviewProgressShellCompact: CSSProperties = { alignSelf: "stretch", width: "auto", margin: "0 12px 10px", padding: "9px 10px", borderRadius: 14 };
const reviewProgressShellComplete: CSSProperties = {
  borderColor: "rgba(74,222,128,.20)",
  background: "rgba(22,101,52,.10)",
};
const reviewProgressShellError: CSSProperties = {
  borderColor: "rgba(248,113,113,.24)",
  background: "rgba(127,29,29,.14)",
};
const reviewProgressTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  color: "#F8FAFC",
  fontSize: 12,
};
const reviewProgressLabelWrap: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 };
const reviewProgressDetail: CSSProperties = { minWidth: 0, color: "#AEBBD0", fontSize: 11, fontWeight: 800, textAlign: "right" };
const reviewProgressBarDot: CSSProperties = { width: 7, height: 7, borderRadius: 999, background: "#21D3C7", boxShadow: "0 0 0 4px rgba(33,211,199,.10)", flex: "0 0 auto" };
const reviewProgressBarDotComplete: CSSProperties = { ...reviewProgressBarDot, background: "#22C55E", boxShadow: "0 0 0 4px rgba(34,197,94,.10)" };
const reviewProgressBarDotError: CSSProperties = { ...reviewProgressBarDot, background: "#EF4444", boxShadow: "0 0 0 4px rgba(239,68,68,.12)" };
const reviewProgressTrack: CSSProperties = {
  height: 4,
  borderRadius: 999,
  overflow: "hidden",
  background: "rgba(255,255,255,.08)",
};
const reviewProgressFill: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg,#21D3C7,#E9D58A)",
  transition: "width .35s ease",
};
const reviewProgressFillComplete: CSSProperties = { background: "linear-gradient(90deg,#22C55E,#86EFAC)" };
const reviewProgressFillError: CSSProperties = { background: "linear-gradient(90deg,#EF4444,#FCA5A5)" };
const reviewProgressSteps: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const reviewProgressStep: CSSProperties = {
  border: "1px solid rgba(255,255,255,.09)",
  borderRadius: 999,
  padding: "4px 8px",
  color: "#8FA0B8",
  fontSize: 11,
  fontWeight: 800,
};
const reviewProgressStepActive: CSSProperties = {
  ...reviewProgressStep,
  borderColor: "rgba(33,211,199,.38)",
  background: "rgba(33,211,199,.12)",
  color: "#D9FFFB",
};
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
const intelligencePanel: CSSProperties = {
  height: "100%",
  minHeight: 0,
  overflowY: "auto",
  padding: "22px min(5vw,70px)",
  display: "grid",
  alignContent: "start",
  gap: 16,
};
const intelligenceHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};
const intelligenceTitle: CSSProperties = { margin: "4px 0 0", color: "#F8FAFC", fontSize: 26, letterSpacing: 0 };
const intelligenceCover: CSSProperties = {
  height: "100%",
  minHeight: 0,
  position: "relative",
  display: "grid",
  placeItems: "center",
  padding: "24px min(6vw,80px)",
  overflow: "hidden",
};
const intelligenceCoverGlow: CSSProperties = {
  position: "absolute",
  inset: "14% 10%",
  borderRadius: 999,
  background: "radial-gradient(circle at 30% 35%,rgba(33,211,199,.20),transparent 38%), radial-gradient(circle at 72% 58%,rgba(212,175,55,.18),transparent 42%)",
  filter: "blur(18px)",
  opacity: 0.95,
};
const intelligenceCoverCard: CSSProperties = {
  position: "relative",
  width: "min(720px, 100%)",
  border: "1px solid rgba(33,211,199,.28)",
  borderRadius: 28,
  background: "linear-gradient(145deg,rgba(8,18,32,.92),rgba(14,10,3,.84))",
  boxShadow: "0 28px 90px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)",
  padding: "clamp(22px,4vw,38px)",
  display: "grid",
  gap: 16,
  color: "#E7F6FF",
  overflow: "hidden",
};
const intelligenceCoverIcon: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 24,
  border: "1px solid rgba(33,211,199,.32)",
  background: "linear-gradient(135deg,rgba(33,211,199,.18),rgba(212,175,55,.10))",
  display: "grid",
  gridTemplateColumns: "repeat(3,1fr)",
  gap: 6,
  padding: 14,
  boxShadow: "0 0 38px rgba(33,211,199,.18)",
};
const intelligenceCoverIconBar: CSSProperties = {
  alignSelf: "end",
  borderRadius: 999,
  background: "linear-gradient(180deg,#F2D36B,#21D3C7)",
  boxShadow: "0 0 14px rgba(33,211,199,.24)",
};
const intelligenceCoverTitle: CSSProperties = { margin: 0, color: "#F8FAFC", fontSize: "clamp(30px,5vw,52px)", lineHeight: 1, letterSpacing: -1.2 };
const intelligenceCoverCopy: CSSProperties = { margin: 0, color: "#B9C8DA", fontSize: 16, lineHeight: 1.55, maxWidth: 650 };
const intelligenceCoverStats: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 10,
};
const intelligenceCoverStat: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  background: "rgba(255,255,255,.045)",
  padding: 14,
  display: "grid",
  gap: 3,
  color: "#D9E5F5",
};
const intelligenceCoverActions: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };
const coverSecondaryButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 999,
  background: "rgba(255,255,255,.06)",
  color: "#F8FAFC",
  minHeight: 46,
  padding: "0 18px",
  fontWeight: 900,
  cursor: "pointer",
};
const intelligenceCoverNeeds: CSSProperties = {
  border: "1px solid rgba(212,175,55,.26)",
  borderRadius: 16,
  background: "rgba(212,175,55,.08)",
  padding: 14,
  display: "grid",
  gap: 4,
  color: "#F6E7A6",
};
const intelligenceEmptyBanner: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 18,
  background: "rgba(255,255,255,.035)",
  padding: 16,
  display: "grid",
  gap: 4,
  color: "#D9E5F5",
};
const kpiGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 };
const kpiCard: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 16,
  background: "linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.018))",
  padding: 14,
  display: "grid",
  gap: 8,
  minHeight: 124,
};
const kpiCardEmphasis: CSSProperties = {
  ...kpiCard,
  borderColor: "rgba(33,211,199,.32)",
  background: "linear-gradient(145deg,rgba(33,211,199,.12),rgba(255,255,255,.02))",
};
const kpiFooter: CSSProperties = { display: "grid", gap: 5, alignContent: "end" };
const chartGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
  gap: 12,
};
const chartCard: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 18,
  background: "rgba(255,255,255,.035)",
  padding: 16,
  display: "grid",
  gap: 12,
  minWidth: 0,
};
const chartCardWide: CSSProperties = { ...chartCard, gridColumn: "1 / -1" };
const chartHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" };
const gaugeWrap: CSSProperties = { display: "grid", justifyItems: "center", gap: 3, color: "#D9E5F5" };
const gaugeSvg: CSSProperties = { width: "min(260px, 100%)", height: 145, display: "block" };
const equityChartWrap: CSSProperties = { display: "grid", gap: 12 };
const equityTrack: CSSProperties = {
  height: 22,
  borderRadius: 999,
  overflow: "hidden",
  background: "rgba(255,255,255,.08)",
  display: "flex",
};
const equityDebtFill: CSSProperties = { height: "100%", background: "linear-gradient(90deg,#EF4444,#F59E0B)", transition: "width .3s ease" };
const equityValueFill: CSSProperties = { height: "100%", background: "linear-gradient(90deg,#21D3C7,#34D399)", transition: "width .3s ease" };
const equityLegend: CSSProperties = { display: "grid", gap: 6, color: "#AEBBD0", fontSize: 12 };
const legendDebtDot: CSSProperties = { display: "inline-block", width: 8, height: 8, borderRadius: 99, background: "#F59E0B", marginRight: 6 };
const legendEquityDot: CSSProperties = { ...legendDebtDot, background: "#21D3C7" };
const cashFlowBarList: CSSProperties = { display: "grid", gap: 12 };
const cashFlowBarRow: CSSProperties = { display: "grid", gap: 6 };
const cashFlowBarLabel: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, color: "#D9E5F5", fontSize: 13 };
const cashFlowTrack: CSSProperties = { height: 9, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,.08)" };
const cashFlowFill: CSSProperties = { height: "100%", borderRadius: 999, transition: "width .3s ease" };
const miniChart: CSSProperties = { height: 180, display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(32px,1fr)", gap: 8, alignItems: "end" };
const miniChartColumn: CSSProperties = { height: "100%", display: "grid", gridTemplateRows: "1fr auto", gap: 8, justifyItems: "center", minWidth: 0, color: "#8FA0B8", fontSize: 11 };
const miniChartBarWrap: CSSProperties = { height: "100%", width: "100%", display: "flex", alignItems: "end", justifyContent: "center" };
const miniChartBar: CSSProperties = { width: "72%", borderRadius: "10px 10px 2px 2px", background: "linear-gradient(180deg,#21D3C7,#D4AF37)" };
const chartEmptyState: CSSProperties = {
  border: "1px dashed rgba(255,255,255,.13)",
  borderRadius: 14,
  minHeight: 110,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  padding: 14,
  color: "#9DABC0",
  lineHeight: 1.45,
};
const intelligenceTables: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 12 };
const intelligenceTable: CSSProperties = { display: "grid", gap: 8 };
const intelligenceTableRow: CSSProperties = {
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  background: "rgba(0,0,0,.14)",
  padding: 10,
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  gap: 6,
  alignItems: "start",
};
const riskList: CSSProperties = { display: "grid", gap: 8 };
const riskRow: CSSProperties = { borderRadius: 12, padding: 10, background: "rgba(212,175,55,.08)", color: "#F6E7A6", border: "1px solid rgba(212,175,55,.18)", lineHeight: 1.35 };
const strengthRow: CSSProperties = { ...riskRow, background: "rgba(33,211,199,.08)", color: "#BFFCF7", border: "1px solid rgba(33,211,199,.18)" };
const intelligenceNextStep: CSSProperties = {
  border: "1px solid rgba(33,211,199,.22)",
  borderRadius: 18,
  background: "rgba(33,211,199,.08)",
  padding: 16,
  display: "grid",
  gap: 5,
  color: "#D9FFFB",
};
const fieldWrap: CSSProperties = { display: "grid", gap: 6 };
const labelStyle: CSSProperties = { color: "#B8C4D6", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const fieldHint: CSSProperties = { color: "#9FB0C8", fontSize: 12, marginTop: -4 };
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
const disabledPrimaryButton: CSSProperties = {
  ...primaryButton,
  background: "rgba(255,255,255,.10)",
  color: "rgba(248,250,252,.45)",
  cursor: "not-allowed",
};
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
const verifiedSourcePill: CSSProperties = { ...completeChip, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" };
const extractedSourcePill: CSSProperties = { ...statusPill, minHeight: 0, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" };
const estimatedSourcePill: CSSProperties = { ...missingChip, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" };
const unavailableSourcePill: CSSProperties = { ...metricPill, minHeight: 0, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" };
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
