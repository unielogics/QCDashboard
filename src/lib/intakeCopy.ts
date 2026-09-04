// Shared EN/ES copy trees for the two public client-facing intake pages
// (dealer-ai-underwriter, funding-review). Client-facing only -- admin and
// broker surfaces always render in English and never import this file's
// Spanish tree.
//
// Usage: const c = dealerCopy(language) / realEstateCopy(language) once near
// the top of the page component, then reference c.<key> as plain property
// access (mirrors this codebase's useTheme() -> t.<token> idiom).
//
// The `es` tree is AI-assisted, not yet reviewed by a native Spanish speaker.
// General UI copy (this file) is lower-stakes than legal/consent text, so it
// carries this single file-level note rather than a per-string flag -- see
// lib/legal.ts and components/intake/SignRequestedDocument.tsx for the
// consent-bearing content that IS flagged per-string for compliance review.

export type Lang = "en" | "es";

const LANGUAGE_STORAGE_KEY = "qc_intake_language";

export function getStoredLanguage(): Lang | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(LANGUAGE_STORAGE_KEY);
  return value === "en" || value === "es" ? value : null;
}

export function setStoredLanguage(lang: Lang): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

type CommonCopy = {
  languagePickerTitle: string;
  languagePickerEnglish: string;
  languagePickerSpanish: string;
  languagePickerSub: string;
  continueButton: string;
  aiUnderwriterPill: string;
  encryptedUploadsPill: string;
  stepOneBadge: string;
  legalAgreePrefix: string;
  legalAgreeTerms: string;
  legalAgreeAnd: string;
  legalAgreePrivacy: string;
  legalAgreeSuffix: string;
  trustBankGrade: string;
  trustNoCreditPull: string;
  trustPreliminaryOnly: string;
  fieldFullName: string;
  fieldEmail: string;
  fieldPhone: string;
  emailLookupChecking: string;
  alreadyStarted: string;
  resumeEnterEmail: string;
  resumeSendCode: string;
  resumeResendCode: string;
  resumeCodePlaceholder: string;
  resumeContinue: string;
  resumeStartNewInstead: string;
  loginPill: string;
  lockedPreviewBadge: string;
  errFullNameEmailRequired: string;
  errPhoneRequired: string;
  errPhoneIncomplete: string;
  errAcceptTerms: string;
  errEnterEmailForCode: string;
  errEnterEmailAndCode: string;
  statusLoggedOut: string;
  filesUploadedAnalyzing: (count: number) => string;
  noFilesUploaded: string;
  signedFormThanks: string;
  pfsThanks: string;
  debtScheduleThanks: string;
  genericError: string;
  startCardTitle: string;
  startCardSub: string;
  loginWithCodeLink: string;
  // Shown while the desk has taken the conversation over. `takeoverNotice`
  // mirrors the server's fixed notice so the room reads the same on a plain
  // reload as it does on the chat turn that triggered the takeover.
  takeoverNotice: string;
  underwriterFallbackName: string;
};

type DealerCopy = {
  eyebrow: string;
  heroTitle: string;
  heroLead: string;
  checklist: string[];
  fieldBusinessName: string;
  startCta: string;
  startCtaBusy: string;
  resumeSub: string;
};

type RealEstateCopy = {
  eyebrow: string;
  heroTitle: string;
  heroLead: string;
  checklist: string[];
  fieldBusinessName: string;
  startCta: string;
  startCtaBusy: string;
  resumeSub: string;
};

const commonEn: CommonCopy = {
  languagePickerTitle: "Choose your language",
  languagePickerEnglish: "Continue in English",
  languagePickerSpanish: "Continuar en Español",
  languagePickerSub: "You can talk to the AI underwriter in this language. Your loan documents will always be prepared in English.",
  continueButton: "Continue",
  aiUnderwriterPill: "AI Underwriter",
  encryptedUploadsPill: "Encrypted uploads - Preliminary review",
  stepOneBadge: "Step 1 - Open your secure file",
  legalAgreePrefix: "I agree to the ",
  legalAgreeTerms: "Terms and Conditions",
  legalAgreeAnd: " and ",
  legalAgreePrivacy: "Privacy Policy",
  legalAgreeSuffix: ".",
  trustBankGrade: "Bank-grade encryption",
  trustNoCreditPull: "No credit pull to start",
  trustPreliminaryOnly: "Preliminary review only",
  fieldFullName: "Full name",
  fieldEmail: "Email",
  fieldPhone: "Mobile number",
  emailLookupChecking: "Checking for an existing secure file...",
  alreadyStarted: "Already started?",
  resumeEnterEmail: "Enter your email and we will send a short access code for your existing file.",
  resumeSendCode: "Send code",
  resumeResendCode: "Resend code",
  resumeCodePlaceholder: "6-digit code",
  resumeContinue: "Continue",
  resumeStartNewInstead: "Start a new review instead",
  loginPill: "Continue",
  lockedPreviewBadge: "Locked - The full review runs in chat and unlocks after you start your file",
  errFullNameEmailRequired: "Full name and email are required before uploading documents.",
  errPhoneRequired: "A mobile number is required so we can reach you about your file.",
  errPhoneIncomplete: "That number does not look complete. Enter a 10-digit US mobile, or include the country code for an international number.",
  errAcceptTerms: "Accept the Terms and Privacy Policy before opening the secure intake.",
  errEnterEmailForCode: "Enter your email and we will send a secure access code if a file exists.",
  errEnterEmailAndCode: "Enter your email and access code.",
  statusLoggedOut: "You are logged out of this secure room. Enter your email to receive a continuation code.",
  filesUploadedAnalyzing: (count) => `${count} file${count === 1 ? "" : "s"} uploaded. I am analyzing the file set now.`,
  noFilesUploaded: "No files uploaded successfully. Correct the file errors and try again.",
  signedFormThanks: "Thanks — the form is signed and on file.",
  pfsThanks: "Thanks — your personal financial statement is on file.",
  debtScheduleThanks: "Thanks — your debt schedule is on file.",
  genericError: "Something went wrong.",
  startCardTitle: "Start secure intake",
  startCardSub: "Takes under a minute. No credit pull to begin.",
  loginWithCodeLink: "Already started? Login with email code",
  takeoverNotice: "Your underwriter is replying to you here. They will answer you directly, so the assistant is standing by.",
  underwriterFallbackName: "Your underwriter",
};

const commonEs: CommonCopy = {
  languagePickerTitle: "Elige tu idioma",
  languagePickerEnglish: "Continue in English",
  languagePickerSpanish: "Continuar en Español",
  languagePickerSub: "Puedes hablar con el suscriptor de IA en este idioma. Tus documentos del préstamo siempre se prepararán en inglés.",
  continueButton: "Continuar",
  aiUnderwriterPill: "Suscriptor de IA",
  encryptedUploadsPill: "Archivos encriptados - Revisión preliminar",
  stepOneBadge: "Paso 1 - Abre tu expediente seguro",
  legalAgreePrefix: "Acepto los ",
  legalAgreeTerms: "Términos y Condiciones",
  legalAgreeAnd: " y la ",
  legalAgreePrivacy: "Política de Privacidad",
  legalAgreeSuffix: ".",
  trustBankGrade: "Encriptación de nivel bancario",
  trustNoCreditPull: "Sin consulta de crédito para empezar",
  trustPreliminaryOnly: "Solo revisión preliminar",
  fieldFullName: "Nombre completo",
  fieldEmail: "Correo electrónico",
  fieldPhone: "Número de móvil",
  emailLookupChecking: "Buscando un expediente seguro existente...",
  alreadyStarted: "¿Ya comenzaste?",
  resumeEnterEmail: "Ingresa tu correo electrónico y te enviaremos un código de acceso breve para tu expediente existente.",
  resumeSendCode: "Enviar código",
  resumeResendCode: "Reenviar código",
  resumeCodePlaceholder: "Código de 6 dígitos",
  resumeContinue: "Continuar",
  resumeStartNewInstead: "Comenzar una nueva revisión en su lugar",
  loginPill: "Continuar",
  lockedPreviewBadge: "Bloqueado - La revisión completa se realiza en el chat y se desbloquea después de abrir tu expediente",
  errFullNameEmailRequired: "El nombre completo y el correo electrónico son obligatorios antes de subir documentos.",
  errPhoneRequired: "Se requiere un número de móvil para poder comunicarnos contigo sobre tu expediente.",
  errPhoneIncomplete: "Ese número no parece completo. Ingresa un móvil de 10 dígitos de EE. UU., o incluye el código de país para un número internacional.",
  errAcceptTerms: "Acepta los Términos y la Política de Privacidad antes de abrir el expediente seguro.",
  errEnterEmailForCode: "Ingresa tu correo electrónico y te enviaremos un código de acceso seguro si existe un expediente.",
  errEnterEmailAndCode: "Ingresa tu correo electrónico y el código de acceso.",
  statusLoggedOut: "Has cerrado sesión en esta sala segura. Ingresa tu correo electrónico para recibir un código de continuación.",
  filesUploadedAnalyzing: (count) => `${count} archivo${count === 1 ? "" : "s"} subido${count === 1 ? "" : "s"}. Estoy analizando el conjunto de archivos ahora.`,
  noFilesUploaded: "Ningún archivo se subió correctamente. Corrige los errores de archivo e intenta de nuevo.",
  signedFormThanks: "Gracias — el formulario está firmado y registrado.",
  pfsThanks: "Gracias — tu estado financiero personal está registrado.",
  debtScheduleThanks: "Gracias — tu calendario de deudas está registrado.",
  genericError: "Algo salió mal.",
  startCardTitle: "Comenzar registro seguro",
  startCardSub: "Toma menos de un minuto. Sin consulta de crédito para empezar.",
  loginWithCodeLink: "¿Ya comenzaste? Inicia sesión con código por correo electrónico",
  takeoverNotice: "Tu suscriptor te está respondiendo aquí. Te contestará directamente, así que el asistente está en espera.",
  underwriterFallbackName: "Tu suscriptor",
};

const dealerEn: DealerCopy = {
  eyebrow: "Qualified Commercial - Dealer Funding Review",
  heroTitle: "Tell us who you are - then the review runs in chat.",
  heroLead: "We open an encrypted file room in your name first, so nothing you share is ever lost. Then the full-doc funding review happens in one conversation - no forms, no portals.",
  checklist: [
    "A full-doc review that runs entirely in chat - no forms, no portals",
    "Attach bank statements and financials straight into the conversation",
    "An encrypted file room - everything you share is kept",
    "A strict preliminary screen before any lender sees the file",
  ],
  fieldBusinessName: "Dealership",
  startCta: "Start my funding review ->",
  startCtaBusy: "Creating secure room...",
  resumeSub: "Enter your email and we will send a short access code for your existing dealer file.",
};

const dealerEs: DealerCopy = {
  eyebrow: "Qualified Commercial - Revisión de Financiamiento para Concesionarios",
  heroTitle: "Cuéntanos quién eres - luego la revisión se realiza en el chat.",
  heroLead: "Primero abrimos una sala de expedientes encriptada a tu nombre, para que nada de lo que compartas se pierda. Luego la revisión completa de financiamiento sucede en una sola conversación - sin formularios, sin portales.",
  checklist: [
    "Una revisión completa que se realiza enteramente en el chat - sin formularios, sin portales",
    "Adjunta estados de cuenta bancarios y datos financieros directamente en la conversación",
    "Una sala de expedientes encriptada - todo lo que compartas se conserva",
    "Una evaluación preliminar estricta antes de que cualquier prestamista vea el expediente",
  ],
  fieldBusinessName: "Concesionario",
  startCta: "Comenzar mi revisión de financiamiento ->",
  startCtaBusy: "Creando sala segura...",
  resumeSub: "Ingresa tu correo electrónico y te enviaremos un código de acceso breve para tu expediente de concesionario existente.",
};

const realEstateEn: RealEstateCopy = {
  eyebrow: "Qualified Commercial - Commercial Funding Review",
  heroTitle: "Tell us who you are - then the DSCR review runs in chat.",
  heroLead: "We open an encrypted file room in your name first, so property evidence, rent support, and payoff documents stay organized. Then the investor funding screen happens in one conversation.",
  checklist: [
    "A DSCR and investor-loan screen that runs directly in chat",
    "Attach leases, rent rolls, payoff statements, purchase contracts, and PITIA support",
    "An encrypted file room - everything you share is kept",
    "A strict preliminary screen before any lender sees the file",
  ],
  fieldBusinessName: "Investor / entity name",
  startCta: "Start my funding review ->",
  startCtaBusy: "Creating secure room...",
  resumeSub: "Enter your email and we will send a short access code for your existing funding review file.",
};

const realEstateEs: RealEstateCopy = {
  eyebrow: "Qualified Commercial - Revisión de Financiamiento Comercial",
  heroTitle: "Cuéntanos quién eres - luego la revisión DSCR se realiza en el chat.",
  heroLead: "Primero abrimos una sala de expedientes encriptada a tu nombre, para que la evidencia de la propiedad, el soporte de renta y los documentos de liquidación se mantengan organizados. Luego la evaluación de financiamiento para inversionistas sucede en una sola conversación.",
  checklist: [
    "Una evaluación de DSCR y préstamo para inversionistas que se realiza directamente en el chat",
    "Adjunta contratos de arrendamiento, listas de rentas, estados de liquidación, contratos de compra y soporte de PITIA",
    "Una sala de expedientes encriptada - todo lo que compartas se conserva",
    "Una evaluación preliminar estricta antes de que cualquier prestamista vea el expediente",
  ],
  fieldBusinessName: "Nombre del inversionista / entidad",
  startCta: "Comenzar mi revisión de financiamiento ->",
  startCtaBusy: "Creando sala segura...",
  resumeSub: "Ingresa tu correo electrónico y te enviaremos un código de acceso breve para tu expediente de revisión de financiamiento existente.",
};

export const intakeCopy = {
  en: { common: commonEn, dealer: dealerEn, realEstate: realEstateEn },
  es: { common: commonEs, dealer: dealerEs, realEstate: realEstateEs },
} as const;

export function dealerCopy(lang: Lang): CommonCopy & DealerCopy {
  return { ...intakeCopy[lang].common, ...intakeCopy[lang].dealer };
}

export function realEstateCopy(lang: Lang): CommonCopy & RealEstateCopy {
  return { ...intakeCopy[lang].common, ...intakeCopy[lang].realEstate };
}
