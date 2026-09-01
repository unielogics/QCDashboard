"use client";

// Public, slim MCA-refinance AI intake room. A borrower lands here from a
// marketing page to refinance merchant cash advances. The room collects
// EXACTLY three things, then drives to review + call booking:
//   1. Last 6 months of business bank statements (upload)
//   2. A signed credit authorization -> soft credit pull (no score impact)
//   3. Current MCA / advance terms (upload OR typed-in form)
// The slimness is the product: no intelligence dashboard, no PFS, no extra
// steps, and this page NEVER shows rates, payments or offers.
//
// Backend: /api/v1/public/mca-refinance (deployed). The backend rotates the
// intake token in many responses -- every response is funneled through
// adopt(), which always takes the newest token and persists it under the
// sessionStorage key "qc.mca.token". Any ?token= (and marketing pre-seed
// params) are stripped from the URL immediately via history.replaceState,
// matching the security rule on the other public intake pages.

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QCMark } from "@/components/QCMark";
import { LanguagePickerScreen } from "@/components/intake/LanguagePickerScreen";
import {
  SignRequestedDocument,
  type SignRequestedDocumentPayload,
} from "@/components/intake/SignRequestedDocument";
import { getStoredLanguage, setStoredLanguage, type Lang } from "@/lib/intakeCopy";
import { readPublicIntakeAttribution } from "@/lib/publicIntakeAttribution";
import {
  cryptoId,
  errorMessage,
  formatSize,
  looksLikeEmail,
  numericOrNull,
  onlyDigits,
  type Intake,
  type IntakeResponse,
  type QueuedFile,
  type RequestedDoc,
  type UploadedFile,
} from "@/lib/intake";

// ---------------------------------------------------------------------------
// API + local types (extend the shared intake types where the MCA shapes
// differ, rather than editing src/lib/intake.ts)
// ---------------------------------------------------------------------------

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "https://api.qualifiedcommercial.com"}/api/v1/public/mca-refinance`;
const TOKEN_KEY = "qc.mca.token";

const FREQS = ["daily", "weekly", "biweekly", "monthly"] as const;
type Freq = (typeof FREQS)[number];

type McaRequestedDoc = RequestedDoc & {
  requires_signature?: boolean;
  signature_kind?: string | null;
  signature_document_text?: string | null;
};

type BookingSlotLite = { starts_at: string; label?: string | null; date_label?: string | null };

type McaIntakeResponse = Omit<
  IntakeResponse,
  "requested_documents" | "assistant_message" | "messages" | "intake"
> & {
  intake: Intake & { preferred_language?: string | null };
  assistant_message?: string | null;
  messages?: Array<{ id: string; role: string; content: string; created_at?: string }>;
  requested_documents: McaRequestedDoc[];
  booking?: { slots?: BookingSlotLite[] | null } | null;
};

type UploadInitResponse = {
  upload_url: string;
  file_id: string;
  headers?: Record<string, string> | null;
  required_headers?: Record<string, string> | null;
};

type ChatLine = { id: string; role: "assistant" | "user"; content: string };

type Phase = "boot" | "language" | "start" | "code" | "room";

type Seed = { payback: number | null; months: number | null; freq: Freq | null };

type AdvanceRow = {
  id: string;
  funder: string;
  remaining_payback: string;
  payment_amount: string;
  payment_frequency: Freq;
  payments_remaining: string;
};

type AdvancePayload = {
  funder: string;
  remaining_payback: number;
  payment_amount: number;
  payment_frequency: Freq;
  payments_remaining?: number;
};

class McaApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string | null = null,
  ) {
    super(message);
    this.name = "McaApiError";
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let code: string | null = null;
    try {
      const body = (await res.json()) as { detail?: unknown };
      const detail = body.detail;
      if (typeof detail === "string" && detail.trim()) {
        message = detail;
      } else if (detail && typeof detail === "object") {
        const rec = detail as { code?: unknown; message?: unknown };
        if (typeof rec.message === "string" && rec.message.trim()) message = rec.message;
        if (typeof rec.code === "string") code = rec.code;
      }
    } catch {
      // keep the status-line fallback
    }
    throw new McaApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Copy tree (EN/ES)
// ---------------------------------------------------------------------------

type Copy = {
  eyebrow: string;
  heroTitle: string;
  heroLead: string;
  pillSoft: string;
  pillEncrypted: string;
  pillTen: string;
  startTitle: string;
  fieldFullName: string;
  fieldBusiness: string;
  fieldEmail: string;
  fieldPhone: string;
  legalPrefix: string;
  legalTerms: string;
  legalAnd: string;
  legalPrivacy: string;
  startButton: string;
  startBusy: string;
  haveCode: string;
  seededNote: string;
  codeTitle: string;
  codeExisting: string;
  codeSub: string;
  codePlaceholder: string;
  codeVerify: string;
  codeVerifyBusy: string;
  codeSend: string;
  codeResend: string;
  codeResent: string;
  codeBack: string;
  loading: string;
  progressLabel: (n: number) => string;
  chipOpen: string;
  chipDone: string;
  chatTitle: string;
  chatPlaceholder: string;
  chatSend: string;
  bankTitle: string;
  bankSub: string;
  dropHint: string;
  browse: string;
  uploadBusy: string;
  uploadRejected: string;
  filesOnFile: (n: number) => string;
  creditTitle: string;
  creditSub: string;
  readSign: string;
  signedBadge: string;
  runSoftCheck: string;
  softCheckBusy: string;
  softCheckDone: string;
  softCheckDeferred: string;
  ssnPrompt: string;
  ssnLabel: string;
  retrySsn: string;
  termsTitle: string;
  termsSub: string;
  pathUpload: string;
  pathType: string;
  fieldBizLegal: string;
  funder: string;
  remainingPayback: string;
  paymentAmount: string;
  frequency: string;
  freqDaily: string;
  freqWeekly: string;
  freqBiweekly: string;
  freqMonthly: string;
  paymentsRemaining: string;
  addAdvance: string;
  removeAdvance: string;
  advanceN: (n: number) => string;
  ack: string;
  submitTerms: string;
  submitTermsBusy: string;
  termsReceived: string;
  termsAlready: string;
  runReview: string;
  reviewRunning: string;
  reviewDoneTitle: string;
  reviewDoneSub: string;
  bookTitle: string;
  bookBusy: string;
  booked: string;
  reviewLocked: string;
  errNameEmail: string;
  errEmail: string;
  errTermsCheckbox: string;
  errCode: string;
  errThrottled: string;
  errAck: string;
  errAdvance: string;
  errBizName: string;
  errGeneric: string;
};

// The `es` tree is professional Spanish, AI-assisted -- same review posture
// as lib/intakeCopy.ts (general UI copy; consent-bearing text lives in
// SignRequestedDocument and is flagged there).
const COPY: Record<Lang, Copy> = {
  en: {
    eyebrow: "MCA Refinance Desk",
    heroTitle: "Refinance your merchant cash advances",
    heroLead:
      "Three items, about ten minutes. No rates or offers on this page — just the file we need to get you on a call with the desk.",
    pillSoft: "Soft credit check — no score impact",
    pillEncrypted: "Encrypted uploads",
    pillTen: "About 10 minutes",
    startTitle: "Start your refinance file",
    fieldFullName: "Full name",
    fieldBusiness: "Business name",
    fieldEmail: "Email",
    fieldPhone: "Phone (optional)",
    legalPrefix: "I agree to the ",
    legalTerms: "Terms",
    legalAnd: " and the ",
    legalPrivacy: "Privacy Policy",
    startButton: "Start — 3 items, 10 minutes",
    startBusy: "Creating your room…",
    haveCode: "Already started? Continue with an email code",
    seededNote: "We carried over your advance details from the previous page.",
    codeTitle: "Check your email",
    codeExisting: "You already have a file with us — we emailed you an access code.",
    codeSub: "Enter the code we sent to your email to pick up where you left off.",
    codePlaceholder: "Access code",
    codeVerify: "Continue",
    codeVerifyBusy: "Checking…",
    codeSend: "Email me a code",
    codeResend: "Resend code",
    codeResent: "Code sent — check your inbox.",
    codeBack: "Back",
    loading: "Loading your room…",
    progressLabel: (n) => `${n} of 3 complete`,
    chipOpen: "Open",
    chipDone: "Done",
    chatTitle: "Refinance desk",
    chatPlaceholder: "Ask anything about the process…",
    chatSend: "Send",
    bankTitle: "Bank statements",
    bankSub: "Last 6 months of business bank statements.",
    dropHint: "Drag & drop files here, or",
    browse: "browse",
    uploadBusy: "Uploading…",
    uploadRejected: "Secure storage rejected the file.",
    filesOnFile: (n) => (n === 1 ? "1 file uploaded" : `${n} files uploaded`),
    creditTitle: "Credit authorization",
    creditSub: "Sign once. We run a soft check — it never affects your score.",
    readSign: "Read & sign",
    signedBadge: "Authorization signed",
    runSoftCheck: "Run the soft check",
    softCheckBusy: "Running the soft check…",
    softCheckDone: "Done — no score impact.",
    softCheckDeferred: "The desk will run the check on our side — you're not blocked.",
    ssnPrompt:
      "The bureau couldn't match your file. Add your SSN and retry — it's used once for this check and never stored.",
    ssnLabel: "Social Security number",
    retrySsn: "Retry with SSN",
    termsTitle: "Current advance terms",
    termsSub: "Upload your MCA agreements, or type the terms yourself.",
    pathUpload: "Upload agreements",
    pathType: "Type the terms",
    fieldBizLegal: "Business legal name",
    funder: "Funder",
    remainingPayback: "Remaining payback ($)",
    paymentAmount: "Payment amount ($)",
    frequency: "Frequency",
    freqDaily: "Daily",
    freqWeekly: "Weekly",
    freqBiweekly: "Every two weeks",
    freqMonthly: "Monthly",
    paymentsRemaining: "Payments left (optional)",
    addAdvance: "Add another advance",
    removeAdvance: "Remove",
    advanceN: (n) => `Advance ${n}`,
    ack: "I confirm these terms are accurate to the best of my knowledge.",
    submitTerms: "Submit terms",
    submitTermsBusy: "Submitting…",
    termsReceived: "Terms received — thank you.",
    termsAlready: "Terms already on file — you're covered.",
    runReview: "Run my review",
    reviewRunning: "Reviewing your file…",
    reviewDoneTitle: "Review complete",
    reviewDoneSub: "Next step: a quick call with the desk. Details are in the chat.",
    bookTitle: "Book your call",
    bookBusy: "Booking…",
    booked: "Call booked — the invite is in your email.",
    reviewLocked: "Complete the three items to run your review.",
    errNameEmail: "Full name and email are required.",
    errEmail: "Enter a valid email address.",
    errTermsCheckbox: "Please accept the Terms and Privacy Policy.",
    errCode: "Enter the code from your email.",
    errThrottled: "Too many attempts — wait a minute and try again.",
    errAck: "Confirm the acknowledgment to submit.",
    errAdvance: "Each advance needs a funder, remaining payback and payment amount.",
    errBizName: "Business legal name is required.",
    errGeneric: "Something went wrong — try again.",
  },
  es: {
    eyebrow: "Mesa de refinanciamiento MCA",
    heroTitle: "Refinancia tus adelantos de capital (MCA)",
    heroLead:
      "Tres elementos, unos diez minutos. En esta página no hay tasas ni ofertas: solo el expediente que necesitamos para llevarte a una llamada con nuestro equipo.",
    pillSoft: "Consulta de crédito blanda — sin impacto en tu puntaje",
    pillEncrypted: "Cargas cifradas",
    pillTen: "Unos 10 minutos",
    startTitle: "Comienza tu expediente de refinanciamiento",
    fieldFullName: "Nombre completo",
    fieldBusiness: "Nombre del negocio",
    fieldEmail: "Correo electrónico",
    fieldPhone: "Teléfono (opcional)",
    legalPrefix: "Acepto los ",
    legalTerms: "Términos",
    legalAnd: " y la ",
    legalPrivacy: "Política de Privacidad",
    startButton: "Comenzar — 3 elementos, 10 minutos",
    startBusy: "Creando tu sala…",
    haveCode: "¿Ya comenzaste? Continúa con un código por correo",
    seededNote: "Trajimos los datos de tu adelanto desde la página anterior.",
    codeTitle: "Revisa tu correo",
    codeExisting: "Ya tienes un expediente con nosotros — te enviamos un código de acceso por correo.",
    codeSub: "Ingresa el código que enviamos a tu correo para continuar donde quedaste.",
    codePlaceholder: "Código de acceso",
    codeVerify: "Continuar",
    codeVerifyBusy: "Verificando…",
    codeSend: "Envíame un código",
    codeResend: "Reenviar código",
    codeResent: "Código enviado — revisa tu bandeja de entrada.",
    codeBack: "Volver",
    loading: "Cargando tu sala…",
    progressLabel: (n) => `${n} de 3 completados`,
    chipOpen: "Pendiente",
    chipDone: "Listo",
    chatTitle: "Mesa de refinanciamiento",
    chatPlaceholder: "Pregunta lo que quieras sobre el proceso…",
    chatSend: "Enviar",
    bankTitle: "Estados de cuenta bancarios",
    bankSub: "Los últimos 6 meses de estados de cuenta del negocio.",
    dropHint: "Arrastra y suelta archivos aquí, o",
    browse: "búscalos en tu equipo",
    uploadBusy: "Subiendo…",
    uploadRejected: "El almacenamiento seguro rechazó el archivo.",
    filesOnFile: (n) => (n === 1 ? "1 archivo subido" : `${n} archivos subidos`),
    creditTitle: "Autorización de crédito",
    creditSub: "Firma una sola vez. Hacemos una consulta blanda — nunca afecta tu puntaje.",
    readSign: "Leer y firmar",
    signedBadge: "Autorización firmada",
    runSoftCheck: "Ejecutar la consulta blanda",
    softCheckBusy: "Ejecutando la consulta…",
    softCheckDone: "Listo — sin impacto en tu puntaje.",
    softCheckDeferred: "Nuestro equipo hará la consulta por su cuenta — esto no te detiene.",
    ssnPrompt:
      "El buró no pudo encontrar tu expediente. Agrega tu SSN y reintenta — se usa una sola vez para esta consulta y nunca se guarda.",
    ssnLabel: "Número de Seguro Social (SSN)",
    retrySsn: "Reintentar con SSN",
    termsTitle: "Términos actuales de tus adelantos",
    termsSub: "Sube tus contratos de MCA o escribe los términos tú mismo.",
    pathUpload: "Subir contratos",
    pathType: "Escribir los términos",
    fieldBizLegal: "Nombre legal del negocio",
    funder: "Financiadora",
    remainingPayback: "Saldo por pagar ($)",
    paymentAmount: "Monto del pago ($)",
    frequency: "Frecuencia",
    freqDaily: "Diaria",
    freqWeekly: "Semanal",
    freqBiweekly: "Quincenal",
    freqMonthly: "Mensual",
    paymentsRemaining: "Pagos restantes (opcional)",
    addAdvance: "Agregar otro adelanto",
    removeAdvance: "Quitar",
    advanceN: (n) => `Adelanto ${n}`,
    ack: "Confirmo que estos términos son correctos según mi leal saber y entender.",
    submitTerms: "Enviar términos",
    submitTermsBusy: "Enviando…",
    termsReceived: "Términos recibidos — gracias.",
    termsAlready: "Los términos ya están en tu expediente — todo en orden.",
    runReview: "Ejecutar mi revisión",
    reviewRunning: "Revisando tu expediente…",
    reviewDoneTitle: "Revisión completada",
    reviewDoneSub: "Siguiente paso: una llamada breve con nuestro equipo. Los detalles están en el chat.",
    bookTitle: "Agenda tu llamada",
    bookBusy: "Agendando…",
    booked: "Llamada agendada — la invitación está en tu correo.",
    reviewLocked: "Completa los tres elementos para ejecutar tu revisión.",
    errNameEmail: "El nombre completo y el correo son obligatorios.",
    errEmail: "Ingresa un correo electrónico válido.",
    errTermsCheckbox: "Acepta los Términos y la Política de Privacidad.",
    errCode: "Ingresa el código de tu correo.",
    errThrottled: "Demasiados intentos — espera un minuto e inténtalo de nuevo.",
    errAck: "Confirma la declaración para enviar.",
    errAdvance: "Cada adelanto necesita financiadora, saldo por pagar y monto del pago.",
    errBizName: "El nombre legal del negocio es obligatorio.",
    errGeneric: "Algo salió mal — inténtalo de nuevo.",
  },
};

function apiErrorText(error: unknown, c: Copy): string {
  if (error instanceof McaApiError) {
    return error.status === 429 ? c.errThrottled : error.message || c.errGeneric;
  }
  return errorMessage(error);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type DocSlots = { bank: McaRequestedDoc | null; credit: McaRequestedDoc | null; terms: McaRequestedDoc | null };

function classifyDocs(docs: McaRequestedDoc[]): DocSlots {
  const remaining = [...docs];
  const take = (pred: (doc: McaRequestedDoc) => boolean): McaRequestedDoc | null => {
    const index = remaining.findIndex(pred);
    if (index < 0) return null;
    const [doc] = remaining.splice(index, 1);
    return doc ?? null;
  };
  const text = (doc: McaRequestedDoc) => `${doc.name} ${doc.category ?? ""}`.toLowerCase();
  const credit = take(
    (doc) => doc.signature_kind === "credit_authorization" || Boolean(doc.requires_signature) || text(doc).includes("credit"),
  );
  const bank = take((doc) => text(doc).includes("bank") || text(doc).includes("statement"));
  const terms = take((doc) => /mca|advance|term/.test(text(doc)));
  return {
    bank: bank ?? remaining.shift() ?? null,
    credit: credit ?? remaining.shift() ?? null,
    terms: terms ?? remaining.shift() ?? null,
  };
}

function slotLabel(slot: BookingSlotLite, lang: Lang): string {
  const custom = `${slot.date_label ?? ""} ${slot.label ?? ""}`.trim();
  if (custom) return custom;
  const date = new Date(slot.starts_at);
  if (Number.isNaN(date.getTime())) return slot.starts_at;
  return date.toLocaleString(lang === "es" ? "es-US" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function blankAdvance(): AdvanceRow {
  return {
    id: cryptoId(),
    funder: "",
    remaining_payback: "",
    payment_amount: "",
    payment_frequency: "daily",
    payments_remaining: "",
  };
}

function useCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 880px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return compact;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function McaRefinanceIntakePage() {
  const compact = useCompact();
  const tokenRef = useRef<string>("");
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = useState<Phase>("boot");
  const [language, setLanguage] = useState<Lang | null>(null);
  const [response, setResponse] = useState<McaIntakeResponse | null>(null);
  const [, setToken] = useState<string>("");

  // Start screen
  const [startForm, setStartForm] = useState({ full_name: "", business_name: "", email: "", phone: "" });
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [seed, setSeed] = useState<Seed>({ payback: null, months: null, freq: null });

  // Code / login screen
  const [codeEmail, setCodeEmail] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeNotice, setCodeNotice] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);

  // Chat
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Uploads (keyed by requested_document_id)
  const [uploads, setUploads] = useState<Record<string, QueuedFile[]>>({});
  const [uploadDocBusy, setUploadDocBusy] = useState<string | null>(null);

  // Credit authorization + soft pull
  const [signingDoc, setSigningDoc] = useState<McaRequestedDoc | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [pullState, setPullState] = useState<"idle" | "done" | "deferred">("idle");
  const [pullBusy, setPullBusy] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [needSsn, setNeedSsn] = useState(false);
  const [ssn, setSsn] = useState(""); // transient — cleared after every attempt, never persisted

  // Advance terms
  const [termsPath, setTermsPath] = useState<"upload" | "type">("upload");
  const [termsBizName, setTermsBizName] = useState("");
  const [advances, setAdvances] = useState<AdvanceRow[]>([blankAdvance()]);
  const [termsAck, setTermsAck] = useState(false);
  const [termsBusy, setTermsBusy] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [termsSubmitted, setTermsSubmitted] = useState(false);
  const [termsAlready, setTermsAlready] = useState(false);

  // Review + booking
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [bookBusyAt, setBookBusyAt] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const c = useMemo(() => COPY[language ?? "en"], [language]);

  // --- boot: strip URL params, restore token or show language picker --------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const urlToken = url.searchParams.get("token");
    const paybackParam = url.searchParams.get("payback");
    const monthsParam = url.searchParams.get("months");
    const freqParam = (url.searchParams.get("freq") ?? "").toLowerCase();
    if (url.search) window.history.replaceState(null, "", url.pathname);

    const payback = paybackParam ? numericOrNull(paybackParam) : null;
    const monthsParsed = monthsParam ? Number.parseInt(onlyDigits(monthsParam), 10) : Number.NaN;
    const months = Number.isFinite(monthsParsed) && monthsParsed > 0 ? monthsParsed : null;
    const freq = (FREQS as readonly string[]).includes(freqParam) ? (freqParam as Freq) : null;
    if (payback !== null || months !== null || freq) setSeed({ payback, months, freq });

    const storedLang = getStoredLanguage();
    if (storedLang) setLanguage(storedLang);

    const storedToken = window.sessionStorage.getItem(TOKEN_KEY);
    const candidate = urlToken || storedToken;
    if (candidate) {
      restoreToken(candidate, Boolean(storedLang));
    } else {
      setPhase(storedLang ? "start" : "language");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the terms form's business name seeded from the intake.
  useEffect(() => {
    const name = response ? response.intake.business_name : null;
    if (name) setTermsBizName((current) => current || name);
  }, [response]);

  // Auto-scroll the chat to the newest message.
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chat.length, chatBusy]);

  // --- response plumbing ----------------------------------------------------
  function adopt(payload: McaIntakeResponse) {
    setResponse(payload);
    const nextToken = payload.token ?? tokenRef.current;
    if (nextToken) {
      tokenRef.current = nextToken;
      setToken(nextToken);
      if (typeof window !== "undefined") window.sessionStorage.setItem(TOKEN_KEY, nextToken);
    }
    const messages = (payload.messages ?? []).filter(
      (message) => message.role === "assistant" || message.role === "user",
    );
    if (messages.length) {
      setChat(
        messages.map((message) => ({
          id: message.id || cryptoId(),
          role: message.role as "assistant" | "user",
          content: message.content,
        })),
      );
    } else if (payload.assistant_message) {
      const text = payload.assistant_message;
      setChat((current) =>
        current.length && current[current.length - 1].content === text
          ? current
          : [...current, { id: cryptoId(), role: "assistant", content: text }],
      );
    }
    const lang = payload.intake.preferred_language;
    if (lang === "en" || lang === "es") {
      setLanguage((current) => current ?? lang);
    }
    if (String(payload.intake.status ?? "").toLowerCase().includes("book")) setBooked(true);
  }

  async function refresh() {
    const tok = tokenRef.current;
    if (!tok) return;
    const payload = await call<McaIntakeResponse>(`/${encodeURIComponent(tok)}`);
    adopt(payload);
  }

  async function restoreToken(candidate: string, hasStoredLang: boolean) {
    try {
      const payload = await call<McaIntakeResponse>(`/${encodeURIComponent(candidate)}`);
      tokenRef.current = payload.token ?? candidate;
      adopt(payload);
      setPhase("room");
    } catch {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(TOKEN_KEY);
      tokenRef.current = "";
      setPhase(hasStoredLang ? "start" : "language");
    }
  }

  // --- start / login --------------------------------------------------------
  function pickLanguage(lang: Lang) {
    setStoredLanguage(lang);
    setLanguage(lang);
    setPhase("start");
  }

  async function startIntake() {
    const fullName = startForm.full_name.trim();
    const email = startForm.email.trim();
    if (!fullName || !email) {
      setStartError(c.errNameEmail);
      return;
    }
    if (!looksLikeEmail(email)) {
      setStartError(c.errEmail);
      return;
    }
    if (!legalAccepted) {
      setStartError(c.errTermsCheckbox);
      return;
    }
    setStartBusy(true);
    setStartError(null);
    const body: Record<string, unknown> = {
      full_name: fullName,
      email,
      terms_accepted: true,
      privacy_accepted: true,
      preferred_language: language ?? "en",
      ...readPublicIntakeAttribution(),
    };
    if (startForm.phone.trim()) body.phone = startForm.phone.trim();
    if (startForm.business_name.trim()) body.business_name = startForm.business_name.trim();
    if (seed.payback !== null) body.remaining_payback = seed.payback;
    if (seed.months !== null) body.months_remaining = seed.months;
    if (seed.freq) body.payment_frequency = seed.freq;
    try {
      const payload = await call<McaIntakeResponse>("/start", { method: "POST", body: JSON.stringify(body) });
      adopt(payload);
      setPhase("room");
    } catch (error) {
      if (error instanceof McaApiError && error.status === 409) {
        // Existing file — the backend already emailed an access code.
        setCodeEmail(email);
        setCodeSent(true);
        setCodeNotice(c.codeExisting);
        setCodeError(null);
        setPhase("code");
      } else {
        setStartError(apiErrorText(error, c));
      }
    } finally {
      setStartBusy(false);
    }
  }

  async function sendLoginCode() {
    const email = codeEmail.trim();
    if (!looksLikeEmail(email)) {
      setCodeError(c.errEmail);
      return;
    }
    setCodeBusy(true);
    setCodeError(null);
    try {
      await call<{ login_required?: boolean; message?: string }>("/login/start", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setCodeSent(true);
      setCodeNotice(c.codeResent);
    } catch (error) {
      setCodeError(apiErrorText(error, c));
    } finally {
      setCodeBusy(false);
    }
  }

  async function verifyLoginCode() {
    const email = codeEmail.trim();
    const code = codeValue.trim();
    if (!looksLikeEmail(email)) {
      setCodeError(c.errEmail);
      return;
    }
    if (!code) {
      setCodeError(c.errCode);
      return;
    }
    setCodeBusy(true);
    setCodeError(null);
    try {
      const payload = await call<McaIntakeResponse>("/login/verify", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      adopt(payload);
      setCodeValue("");
      setPhase("room");
    } catch (error) {
      setCodeError(apiErrorText(error, c));
    } finally {
      setCodeBusy(false);
    }
  }

  // --- chat -----------------------------------------------------------------
  async function sendChat() {
    const tok = tokenRef.current;
    const text = chatText.trim();
    if (!tok || !text || chatBusy) return;
    setChat((current) => [...current, { id: cryptoId(), role: "user", content: text }]);
    setChatText("");
    setChatBusy(true);
    setChatError(null);
    try {
      const payload = await call<McaIntakeResponse>(`/${encodeURIComponent(tok)}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      adopt(payload);
    } catch (error) {
      setChatError(apiErrorText(error, c));
    } finally {
      setChatBusy(false);
    }
  }

  // --- uploads --------------------------------------------------------------
  function patchQueued(docId: string, rowId: string, patch: Partial<QueuedFile>) {
    setUploads((current) => ({
      ...current,
      [docId]: (current[docId] ?? []).map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));
  }

  async function uploadFiles(docId: string, incoming: File[]) {
    if (!tokenRef.current || !incoming.length || uploadDocBusy) return;
    const rows: QueuedFile[] = incoming.map((file) => ({ id: cryptoId(), file, status: "uploading" as const }));
    setUploadDocBusy(docId);
    setUploads((current) => ({ ...current, [docId]: [...(current[docId] ?? []), ...rows] }));
    const doneIds = new Set<string>();
    let uploaded = 0;
    for (const row of rows) {
      try {
        const init = await call<UploadInitResponse>(`/${encodeURIComponent(tokenRef.current)}/files/upload-init`, {
          method: "POST",
          body: JSON.stringify({
            file_name: row.file.name,
            content_type: row.file.type || "application/octet-stream",
            size: row.file.size,
            requested_document_id: docId,
          }),
        });
        const headers =
          init.headers ?? init.required_headers ?? { "Content-Type": row.file.type || "application/octet-stream" };
        const put = await fetch(init.upload_url, { method: "PUT", body: row.file, headers });
        if (!put.ok) throw new Error(c.uploadRejected);
        await call(`/${encodeURIComponent(tokenRef.current)}/files/complete`, {
          method: "POST",
          body: JSON.stringify({ file_id: init.file_id }),
        });
        uploaded += 1;
        doneIds.add(row.id);
        patchQueued(docId, row.id, { status: "uploaded" });
      } catch (error) {
        patchQueued(docId, row.id, { status: "error", message: apiErrorText(error, c) });
      }
    }
    try {
      if (uploaded > 0) await refresh();
    } catch {
      // The upload itself succeeded; the next interaction re-syncs.
    }
    setUploads((current) => ({ ...current, [docId]: (current[docId] ?? []).filter((row) => !doneIds.has(row.id)) }));
    setUploadDocBusy(null);
  }

  // --- credit authorization + soft pull ------------------------------------
  async function signDoc(payload: SignRequestedDocumentPayload) {
    const tok = tokenRef.current;
    if (!tok || signBusy) return;
    setSignBusy(true);
    setSignError(null);
    try {
      await call(`/${encodeURIComponent(tok)}/requested-documents/sign`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
      setSigningDoc(null);
    } catch (error) {
      setSignError(apiErrorText(error, c));
    } finally {
      setSignBusy(false);
    }
  }

  async function runCreditPull() {
    const tok = tokenRef.current;
    if (!tok || pullBusy) return;
    setPullBusy(true);
    setPullError(null);
    const body = needSsn && ssn ? { ssn: onlyDigits(ssn) } : {};
    try {
      const payload = await call<McaIntakeResponse>(`/${encodeURIComponent(tok)}/credit-pull`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      adopt(payload);
      setPullState("done");
      setNeedSsn(false);
    } catch (error) {
      if (error instanceof McaApiError) {
        if (error.status === 422 && error.code === "no_hit_provide_ssn") {
          setNeedSsn(true);
          setPullError(c.ssnPrompt);
        } else if (error.status === 503) {
          setPullState("deferred");
        } else if (error.status === 409) {
          // The button only renders once the authorization is signed, so a
          // 409 here means the pull already happened.
          setPullState("done");
        } else {
          setPullError(apiErrorText(error, c));
        }
      } else {
        setPullError(errorMessage(error));
      }
    } finally {
      setSsn(""); // transient — never kept around after an attempt
      setPullBusy(false);
    }
  }

  // --- advance terms (typed path) -------------------------------------------
  function patchAdvance(rowId: string, patch: Partial<AdvanceRow>) {
    setAdvances((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  async function submitTypedTerms() {
    const tok = tokenRef.current;
    if (!tok || termsBusy) return;
    const bizName = termsBizName.trim();
    if (!bizName) {
      setTermsError(c.errBizName);
      return;
    }
    if (!termsAck) {
      setTermsError(c.errAck);
      return;
    }
    const cleanRows: AdvancePayload[] = [];
    for (const row of advances) {
      const funder = row.funder.trim();
      const payback = numericOrNull(row.remaining_payback);
      const payment = numericOrNull(row.payment_amount);
      const isEmpty = !funder && !row.remaining_payback.trim() && !row.payment_amount.trim();
      if (isEmpty) continue;
      if (!funder || payback === null || payment === null) {
        setTermsError(c.errAdvance);
        return;
      }
      const paymentsLeft = Number.parseInt(onlyDigits(row.payments_remaining), 10);
      cleanRows.push({
        funder,
        remaining_payback: payback,
        payment_amount: payment,
        payment_frequency: row.payment_frequency,
        ...(Number.isFinite(paymentsLeft) && paymentsLeft > 0 ? { payments_remaining: paymentsLeft } : {}),
      });
    }
    if (!cleanRows.length || cleanRows.length > 5) {
      setTermsError(c.errAdvance);
      return;
    }
    setTermsBusy(true);
    setTermsError(null);
    try {
      await call(`/${encodeURIComponent(tok)}/requested-documents/mca-terms`, {
        method: "POST",
        body: JSON.stringify({ business_name: bizName, acknowledgment: true, advances: cleanRows }),
      });
      setTermsSubmitted(true);
      await refresh();
    } catch (error) {
      if (error instanceof McaApiError && error.status === 409) {
        setTermsAlready(true);
        try {
          await refresh();
        } catch {
          // ignore — the already-submitted state is authoritative
        }
      } else {
        setTermsError(apiErrorText(error, c));
      }
    } finally {
      setTermsBusy(false);
    }
  }

  // --- review + booking -----------------------------------------------------
  async function runReview() {
    const tok = tokenRef.current;
    if (!tok || reviewBusy) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const payload = await call<McaIntakeResponse>(`/${encodeURIComponent(tok)}/run-review`, { method: "POST" });
      adopt(payload);
    } catch (error) {
      setReviewError(apiErrorText(error, c));
    } finally {
      setReviewBusy(false);
    }
  }

  async function bookCall(startsAt: string) {
    const tok = tokenRef.current;
    if (!tok || bookBusyAt) return;
    setBookBusyAt(startsAt);
    setBookError(null);
    try {
      const payload = await call<McaIntakeResponse>(`/${encodeURIComponent(tok)}/book-call`, {
        method: "POST",
        body: JSON.stringify({ starts_at: startsAt }),
      });
      adopt(payload);
      setBooked(true);
    } catch (error) {
      setBookError(apiErrorText(error, c));
    } finally {
      setBookBusyAt(null);
    }
  }

  // --- derived room model ---------------------------------------------------
  const slots = useMemo(() => classifyDocs(response?.requested_documents ?? []), [response]);
  const docCards: Array<{ kind: "bank" | "credit" | "terms"; doc: McaRequestedDoc | null }> = [
    { kind: "bank", doc: slots.bank },
    { kind: "credit", doc: slots.credit },
    { kind: "terms", doc: slots.terms },
  ];
  const doneCount = docCards.filter((entry) => entry.doc?.status === "uploaded").length;
  const allDone = docCards.every((entry) => entry.doc?.status === "uploaded");
  const reviewDone = Boolean(response?.latest_review?.result ?? response?.intake.result_snapshot);
  const bookingSlots = response?.booking?.slots ?? [];

  function filesFor(docId: string | undefined): UploadedFile[] {
    if (!docId || !response) return [];
    return response.files.filter((file) => file.requested_document_id === docId && !file.parent_zip_file_id);
  }

  // --- render ---------------------------------------------------------------
  const brandHeader = (
    <header className="vm-brand">
      <QCMark size={36} />
      <div>
        <div className="vm-brand-n">Qualified Commercial</div>
        <div className="vm-brand-t">{c.eyebrow}</div>
      </div>
    </header>
  );

  let content: ReactNode;
  if (phase === "boot") {
    content = <div className="vm-loading">{c.loading}</div>;
  } else if (phase === "language") {
    content = (
      <div className="vm-mid lang">
        <LanguagePickerScreen onPick={pickLanguage} />
      </div>
    );
  } else if (phase === "start") {
    content = (
      <div className="vm-mid start">
        <div className="vm-herostack">
          <h1 className="vm-hero-t">{c.heroTitle}</h1>
          <p className="vm-hero-l">{c.heroLead}</p>
          <div className="vm-pillrow">
            <span className="vm-pill">{c.pillTen}</span>
            <span className="vm-pill">{c.pillSoft}</span>
            <span className="vm-pill">{c.pillEncrypted}</span>
          </div>
        </div>
        <section className="vm-card" aria-label={c.startTitle}>
          <h2 className="vm-sect-t">{c.startTitle}</h2>
          {seed.payback !== null || seed.months !== null || seed.freq ? (
            <div className="vm-note">{c.seededNote}</div>
          ) : null}
          <div className="vm-fg2">
            <Field
              label={c.fieldFullName}
              value={startForm.full_name}
              onChange={(value) => setStartForm((cur) => ({ ...cur, full_name: value }))}
              autoComplete="name"
            />
            <Field
              label={c.fieldBusiness}
              value={startForm.business_name}
              onChange={(value) => setStartForm((cur) => ({ ...cur, business_name: value }))}
              autoComplete="organization"
            />
            <Field
              label={c.fieldEmail}
              value={startForm.email}
              onChange={(value) => setStartForm((cur) => ({ ...cur, email: value }))}
              type="email"
              inputMode="email"
              autoComplete="email"
            />
            <Field
              label={c.fieldPhone}
              value={startForm.phone}
              onChange={(value) => setStartForm((cur) => ({ ...cur, phone: value }))}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <label className="vm-check">
            <input
              type="checkbox"
              checked={legalAccepted}
              onChange={(event) => setLegalAccepted(event.target.checked)}
            />
            <span>
              {c.legalPrefix}
              <a href="/terms" target="_blank" rel="noreferrer" className="vm-link">
                {c.legalTerms}
              </a>
              {c.legalAnd}
              <a href="/privacy" target="_blank" rel="noreferrer" className="vm-link">
                {c.legalPrivacy}
              </a>
              .
            </span>
          </label>
          {startError ? (
            <div role="alert" className="vm-err">
              {startError}
            </div>
          ) : null}
          <button type="button" onClick={startIntake} disabled={startBusy} className="vm-gold">
            {startBusy ? c.startBusy : c.startButton}
          </button>
          <button
            type="button"
            className="vm-linkbtn"
            onClick={() => {
              setCodeEmail(startForm.email.trim());
              setCodeSent(false);
              setCodeNotice(null);
              setCodeError(null);
              setPhase("code");
            }}
          >
            {c.haveCode}
          </button>
        </section>
      </div>
    );
  } else if (phase === "code") {
    content = (
      <div className="vm-mid code">
        <section className="vm-card" aria-label={c.codeTitle}>
          <h2 className="vm-sect-t">{c.codeTitle}</h2>
          <p className="vm-sub">{codeNotice ?? c.codeSub}</p>
          <Field
            label={c.fieldEmail}
            value={codeEmail}
            onChange={setCodeEmail}
            type="email"
            inputMode="email"
            autoComplete="email"
          />
          <Field
            label={c.codePlaceholder}
            value={codeValue}
            onChange={(value) => setCodeValue(value.trim())}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={c.codePlaceholder}
          />
          {codeError ? (
            <div role="alert" className="vm-err">
              {codeError}
            </div>
          ) : null}
          <button type="button" onClick={verifyLoginCode} disabled={codeBusy} className="vm-gold">
            {codeBusy ? c.codeVerifyBusy : c.codeVerify}
          </button>
          <div className="vm-btnrow">
            <button type="button" onClick={sendLoginCode} disabled={codeBusy} className="vm-ghost">
              {codeSent ? c.codeResend : c.codeSend}
            </button>
            <button type="button" onClick={() => setPhase("start")} disabled={codeBusy} className="vm-ghost">
              {c.codeBack}
            </button>
          </div>
        </section>
      </div>
    );
  } else {
    // ------ THE ROOM ------
    const chatColumn = (
      <section className="vm-card chat" aria-label={c.chatTitle}>
        <div className="vm-chat-h">{c.chatTitle}</div>
        <div ref={messagesRef} className="vm-chat-s" aria-live="polite">
          {chat.map((line) => (
            <div key={line.id} className={line.role === "user" ? "vm-bub me" : "vm-bub"}>
              {line.content}
            </div>
          ))}
          {chatBusy ? <div className="vm-bub pending">…</div> : null}
        </div>
        <form
          className="vm-chat-f"
          onSubmit={(event) => {
            event.preventDefault();
            sendChat();
          }}
        >
          <input
            className="vm-in grow"
            aria-label={c.chatPlaceholder}
            placeholder={c.chatPlaceholder}
            value={chatText}
            onChange={(event) => setChatText(event.target.value)}
            disabled={chatBusy}
          />
          <button type="submit" disabled={chatBusy || !chatText.trim()} className="vm-gold sm">
            {c.chatSend}
          </button>
        </form>
        {chatError ? (
          <div role="alert" className="vm-err">
            {chatError}
          </div>
        ) : null}
      </section>
    );

    const bankDoc = slots.bank;
    const creditDoc = slots.credit;
    const termsDoc = slots.terms;
    const termsDone = termsDoc?.status === "uploaded" || termsSubmitted || termsAlready;

    const rail = (
      <aside className="vm-rail" aria-label={c.progressLabel(doneCount)}>
        <div className="vm-card railhead">
          <div className="vm-prog-r">
            <span className="vm-prog-l">{c.progressLabel(doneCount)}</span>
          </div>
          <div className="vm-prog-t" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={doneCount}>
            {/* width IS the progress figure — data, not styling. */}
            <div className="vm-prog-f" style={{ width: `${(doneCount / 3) * 100}%` }} />
          </div>
          {booked ? (
            <div className="vm-ok">{c.booked}</div>
          ) : bookingSlots.length ? (
            <div className="grid g8">
              <div className="vm-rev-t">{c.bookTitle}</div>
              <div className="vm-slots">
                {bookingSlots.map((slot) => (
                  <button
                    key={slot.starts_at}
                    type="button"
                    onClick={() => bookCall(slot.starts_at)}
                    disabled={bookBusyAt !== null}
                    className="vm-slot"
                  >
                    {bookBusyAt === slot.starts_at ? c.bookBusy : slotLabel(slot, language ?? "en")}
                  </button>
                ))}
              </div>
              {bookError ? (
                <div role="alert" className="vm-err">
                  {bookError}
                </div>
              ) : null}
            </div>
          ) : reviewDone ? (
            <div className="grid g4">
              <div className="vm-rev-t">{c.reviewDoneTitle}</div>
              <div className="vm-sub">{c.reviewDoneSub}</div>
            </div>
          ) : allDone ? (
            <div className="grid g8">
              <button type="button" onClick={runReview} disabled={reviewBusy} className="vm-gold">
                {reviewBusy ? c.reviewRunning : c.runReview}
              </button>
              {reviewError ? (
                <div role="alert" className="vm-err">
                  {reviewError}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="vm-sub">{c.reviewLocked}</div>
          )}
        </div>

        {/* a. Bank statements */}
        {bankDoc ? (
          <RailCard title={c.bankTitle} sub={c.bankSub} done={bankDoc.status === "uploaded"} c={c}>
            <UploadArea
              busy={uploadDocBusy === bankDoc.id}
              disabled={uploadDocBusy !== null}
              files={filesFor(bankDoc.id)}
              queue={uploads[bankDoc.id] ?? []}
              c={c}
              onFiles={(picked) => uploadFiles(bankDoc.id, picked)}
            />
          </RailCard>
        ) : null}

        {/* b. Credit authorization -> soft pull */}
        {creditDoc ? (
          <RailCard title={c.creditTitle} sub={c.creditSub} done={creditDoc.status === "uploaded"} c={c}>
            {creditDoc.status === "uploaded" ? (
              <div className="grid g10">
                <div className="vm-ok">{c.signedBadge}</div>
                {pullState === "done" ? (
                  <div className="vm-ok">{c.softCheckDone}</div>
                ) : pullState === "deferred" ? (
                  <div className="vm-calm">{c.softCheckDeferred}</div>
                ) : (
                  <>
                    {needSsn ? (
                      <Field
                        label={c.ssnLabel}
                        value={ssn}
                        onChange={(value) => setSsn(onlyDigits(value).slice(0, 9))}
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="•••••••••"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={runCreditPull}
                      disabled={pullBusy || (needSsn && onlyDigits(ssn).length < 9)}
                      className="vm-gold sm"
                    >
                      {pullBusy ? c.softCheckBusy : needSsn ? c.retrySsn : c.runSoftCheck}
                    </button>
                    {pullError ? (
                      <div role="alert" className="vm-err">
                        {pullError}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <div className="grid g8">
                <button type="button" onClick={() => setSigningDoc(creditDoc)} className="vm-gold sm">
                  {c.readSign}
                </button>
              </div>
            )}
          </RailCard>
        ) : null}

        {/* c. Advance terms — upload OR typed form */}
        {termsDoc ? (
          <RailCard title={c.termsTitle} sub={c.termsSub} done={termsDone} c={c}>
            {termsDone ? (
              <div className="grid g8">
                <div className="vm-ok">{termsAlready ? c.termsAlready : c.termsReceived}</div>
                {filesFor(termsDoc.id).map((file) => (
                  <div key={file.id} className="vm-file">
                    <span className="vm-file-n">{file.file_name}</span>
                    <span className="vm-file-m">{formatSize(file.size_bytes)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid g12">
                <div className="vm-tabs" role="tablist" aria-label={c.termsTitle}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={termsPath === "upload"}
                    onClick={() => setTermsPath("upload")}
                    className={termsPath === "upload" ? "vm-tab on" : "vm-tab"}
                  >
                    {c.pathUpload}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={termsPath === "type"}
                    onClick={() => setTermsPath("type")}
                    className={termsPath === "type" ? "vm-tab on" : "vm-tab"}
                  >
                    {c.pathType}
                  </button>
                </div>
                {termsPath === "upload" ? (
                  <UploadArea
                    busy={uploadDocBusy === termsDoc.id}
                    disabled={uploadDocBusy !== null}
                    files={filesFor(termsDoc.id)}
                    queue={uploads[termsDoc.id] ?? []}
                    c={c}
                    onFiles={(picked) => uploadFiles(termsDoc.id, picked)}
                  />
                ) : (
                  <div className="grid g12">
                    <Field label={c.fieldBizLegal} value={termsBizName} onChange={setTermsBizName} autoComplete="organization" />
                    {advances.map((row, index) => (
                      <fieldset key={row.id} className="vm-adv">
                        <legend className="vm-adv-l">{c.advanceN(index + 1)}</legend>
                        <div className="grid g10">
                          <Field label={c.funder} value={row.funder} onChange={(value) => patchAdvance(row.id, { funder: value })} />
                          <div className="vm-fg2">
                            <Field
                              label={c.remainingPayback}
                              value={row.remaining_payback}
                              onChange={(value) => patchAdvance(row.id, { remaining_payback: value })}
                              inputMode="decimal"
                            />
                            <Field
                              label={c.paymentAmount}
                              value={row.payment_amount}
                              onChange={(value) => patchAdvance(row.id, { payment_amount: value })}
                              inputMode="decimal"
                            />
                          </div>
                          <div className="vm-fg2">
                            <label className="vm-fld">
                              <span className="vm-fld-l">{c.frequency}</span>
                              <select
                                className="vm-in"
                                value={row.payment_frequency}
                                onChange={(event) => patchAdvance(row.id, { payment_frequency: event.target.value as Freq })}
                              >
                                <option value="daily">{c.freqDaily}</option>
                                <option value="weekly">{c.freqWeekly}</option>
                                <option value="biweekly">{c.freqBiweekly}</option>
                                <option value="monthly">{c.freqMonthly}</option>
                              </select>
                            </label>
                            <Field
                              label={c.paymentsRemaining}
                              value={row.payments_remaining}
                              onChange={(value) => patchAdvance(row.id, { payments_remaining: onlyDigits(value) })}
                              inputMode="numeric"
                            />
                          </div>
                          {advances.length > 1 ? (
                            <button
                              type="button"
                              className="vm-rm"
                              onClick={() => setAdvances((current) => current.filter((item) => item.id !== row.id))}
                            >
                              {c.removeAdvance}
                            </button>
                          ) : null}
                        </div>
                      </fieldset>
                    ))}
                    {advances.length < 5 ? (
                      <button type="button" className="vm-ghost" onClick={() => setAdvances((current) => [...current, blankAdvance()])}>
                        {c.addAdvance}
                      </button>
                    ) : null}
                    <label className="vm-check">
                      <input
                        type="checkbox"
                        checked={termsAck}
                        onChange={(event) => setTermsAck(event.target.checked)}
                      />
                      <span>{c.ack}</span>
                    </label>
                    {termsError ? (
                      <div role="alert" className="vm-err">
                        {termsError}
                      </div>
                    ) : null}
                    <button type="button" onClick={submitTypedTerms} disabled={termsBusy} className="vm-gold sm">
                      {termsBusy ? c.submitTermsBusy : c.submitTerms}
                    </button>
                  </div>
                )}
              </div>
            )}
          </RailCard>
        ) : null}
      </aside>
    );

    content = (
      <main className="vm-room">
        {compact ? (
          <>
            {rail}
            {chatColumn}
          </>
        ) : (
          <>
            {chatColumn}
            {rail}
          </>
        )}
      </main>
    );
  }

  return (
    <div className="v-mca">
      <div className="vm-shell">
        {brandHeader}
        {content}
      </div>

      {signingDoc ? (
        <div className="vm-scrim" role="dialog" aria-modal="true" aria-label={signingDoc.name}>
          <div className="vm-modal">
            <SignRequestedDocument
              doc={signingDoc}
              busy={signBusy}
              error={signError}
              onSign={signDoc}
              onCancel={() => {
                setSigningDoc(null);
                setSignError(null);
              }}
              language={language ?? "en"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational components
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  inputMode,
  autoComplete,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal";
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <label className="vm-fld">
      <span className="vm-fld-l">{label}</span>
      <input
        className="vm-in"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        disabled={disabled}
      />
    </label>
  );
}

function StatusChip({ done, c }: { done: boolean; c: Copy }) {
  return <span className={done ? "vm-chip done" : "vm-chip"}>{done ? c.chipDone : c.chipOpen}</span>;
}

function RailCard({
  title,
  sub,
  done,
  c,
  children,
}: {
  title: string;
  sub: string;
  done: boolean;
  c: Copy;
  children: ReactNode;
}) {
  return (
    <section className="vm-card" aria-label={title}>
      <div className="vm-card-h">
        <div>
          <div className="vm-card-t">{title}</div>
          <div className="vm-card-s">{sub}</div>
        </div>
        <StatusChip done={done} c={c} />
      </div>
      {children}
    </section>
  );
}

function UploadArea({
  busy,
  disabled,
  files,
  queue,
  c,
  onFiles,
}: {
  busy: boolean;
  disabled: boolean;
  files: UploadedFile[];
  queue: QueuedFile[];
  c: Copy;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const pendingRows = queue.filter((row) => row.status === "uploading" || row.status === "error");
  return (
    <div className="grid g8">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) onFiles(Array.from(event.dataTransfer.files));
        }}
        className={dragging ? "vm-drop on" : "vm-drop"}
      >
        <span>{c.dropHint}</span>{" "}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className="vm-linkbtn inline">
          {c.browse}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.heic,.csv,.xls,.xlsx,.zip"
          className="hidden"
          onChange={(event) => {
            const list = event.target.files;
            if (list && list.length) onFiles(Array.from(list));
            event.target.value = "";
          }}
        />
      </div>
      {busy ? <div className="vm-sub">{c.uploadBusy}</div> : null}
      {pendingRows.map((row) => (
        <div key={row.id} className="vm-file">
          <span className="vm-file-n">{row.file.name}</span>
          <span className={row.status === "error" ? "vm-err" : "vm-file-m"}>
            {row.status === "error" ? row.message ?? c.errGeneric : c.uploadBusy}
          </span>
        </div>
      ))}
      {files.length ? (
        <div className="grid g6">
          <div className="vm-ok">{c.filesOnFile(files.length)}</div>
          {files.map((file) => (
            <div key={file.id} className="vm-file">
              <span className="vm-file-n">{file.file_name}</span>
              <span className="vm-file-m">{formatSize(file.size_bytes)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
