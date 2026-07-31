"use client";

// Shared "Read & Sign" flow for a requires_signature requested document on a
// public dealer/funding-review intake page. Renders the document text, an
// (optional) applicant identity form for signature_kind === "credit_authorization",
// the E-SIGN consent checkbox, and the shared SignaturePad — then calls the
// caller-supplied onSign with everything the backend's DealerDocumentSignRequest
// needs. Identical UI for BOTH verticals; the caller wires the actual API call
// (token/endpoint differ between dealer and funding-review, so that stays
// page-local, matching how each page already has its own `call()` wrapper).

import { useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import type { Lang } from "@/lib/intakeCopy";

export type SignRequestedDocumentPayload = {
  requested_document_id: string;
  typed_name: string;
  esign_consent: boolean;
  signature_data_url: string;
  applicant_legal_first_name?: string;
  applicant_legal_last_name?: string;
  applicant_dob?: string;
  applicant_street?: string;
  applicant_city?: string;
  applicant_state?: string;
  applicant_zip?: string;
};

export type SignableDoc = {
  id: string;
  name: string;
  description?: string | null;
  signature_kind?: string | null;
  signature_document_text?: string | null;
};

// TODO(compliance-review-es): Spanish translation of the default credit-pull
// authorization consent text -- AI-assisted, NOT YET reviewed by a native-
// Spanish-speaking compliance reviewer. Do not treat as legally equivalent
// to the English version until reviewed and this TODO is removed.
const DEFAULT_CREDIT_AUTH_TEXT: Record<Lang, string> = {
  en:
    "By signing this authorization, I authorize a soft credit inquiry (a \"soft pull\") on my consumer " +
    "credit file, for the purpose of evaluating financing. A soft pull does not affect my credit score. " +
    "I certify the identifying information below is accurate and is my own.",
  es:
    "Al firmar esta autorización, autorizo una consulta de crédito blanda (\"soft pull\") en mi expediente " +
    "de crédito de consumidor, con el propósito de evaluar el financiamiento. Una consulta blanda no afecta " +
    "mi puntaje de crédito. Certifico que la información de identificación a continuación es precisa y es mía.",
};

// TODO(compliance-review-es): Spanish E-SIGN consent checkbox label and field
// labels below -- AI-assisted, NOT YET reviewed by a native-Spanish-speaking
// compliance reviewer.
const SIGN_COPY: Record<Lang, {
  legalFirstName: string;
  legalLastName: string;
  dob: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  typedName: string;
  esignConsent: string;
  drawSignature: string;
  clearSignature: string;
  cancel: string;
  signSubmit: string;
  signSubmitting: string;
  errTypedName: string;
  errConsent: string;
  errSignature: string;
  errIdentity: string;
}> = {
  en: {
    legalFirstName: "Legal first name",
    legalLastName: "Legal last name",
    dob: "Date of birth",
    street: "Street address",
    city: "City",
    state: "State",
    zip: "ZIP",
    typedName: "Type your full legal name",
    esignConsent: "I consent to use electronic records and signatures under the U.S. E-SIGN Act and UETA.",
    drawSignature: "Draw your signature",
    clearSignature: "Clear signature",
    cancel: "Cancel",
    signSubmit: "Sign & submit",
    signSubmitting: "Submitting…",
    errTypedName: "Type your full legal name.",
    errConsent: "Check the E-SIGN consent box.",
    errSignature: "Draw your signature.",
    errIdentity: "All identity fields are required to sign this form.",
  },
  es: {
    legalFirstName: "Nombre legal",
    legalLastName: "Apellido legal",
    dob: "Fecha de nacimiento",
    street: "Dirección",
    city: "Ciudad",
    state: "Estado",
    zip: "Código postal",
    typedName: "Escribe tu nombre legal completo",
    esignConsent: "Consiento el uso de registros y firmas electrónicas bajo la Ley E-SIGN de EE. UU. y UETA.",
    drawSignature: "Dibuja tu firma",
    clearSignature: "Borrar firma",
    cancel: "Cancelar",
    signSubmit: "Firmar y enviar",
    signSubmitting: "Enviando…",
    errTypedName: "Escribe tu nombre legal completo.",
    errConsent: "Marca la casilla de consentimiento E-SIGN.",
    errSignature: "Dibuja tu firma.",
    errIdentity: "Todos los campos de identidad son obligatorios para firmar este formulario.",
  },
};

export function SignRequestedDocument({
  doc,
  busy,
  error,
  onSign,
  onCancel,
  language = "en",
}: {
  doc: SignableDoc;
  busy: boolean;
  error: string | null;
  onSign: (payload: SignRequestedDocumentPayload) => void;
  onCancel?: () => void;
  language?: Lang;
}) {
  const s = SIGN_COPY[language];
  const isCreditAuth = doc.signature_kind === "credit_authorization";
  const documentText = doc.signature_document_text || (isCreditAuth ? DEFAULT_CREDIT_AUTH_TEXT[language] : "");
  const sigPadRef = useRef<SignaturePadHandle | null>(null);
  const [typedName, setTypedName] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [formError, setFormError] = useState("");

  function submit() {
    if (!typedName.trim()) { setFormError(s.errTypedName); return; }
    if (!esignConsent) { setFormError(s.errConsent); return; }
    const sigPad = sigPadRef.current;
    if (!sigPad?.hasSignature()) { setFormError(s.errSignature); return; }
    if (isCreditAuth) {
      if (!firstName.trim() || !lastName.trim() || !dob.trim() || !street.trim() || !city.trim() || !state.trim() || !zip.trim()) {
        setFormError(s.errIdentity);
        return;
      }
    }
    setFormError("");
    onSign({
      requested_document_id: doc.id,
      typed_name: typedName.trim(),
      esign_consent: true,
      signature_data_url: sigPad.getDataUrl(),
      ...(isCreditAuth
        ? {
            applicant_legal_first_name: firstName.trim(),
            applicant_legal_last_name: lastName.trim(),
            applicant_dob: dob.trim(),
            applicant_street: street.trim(),
            applicant_city: city.trim(),
            applicant_state: state.trim().toUpperCase().slice(0, 2),
            applicant_zip: zip.trim(),
          }
        : {}),
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{doc.name}</div>
        {doc.description ? <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 2 }}>{doc.description}</div> : null}
      </div>

      {documentText ? (
        <div style={{ maxHeight: 160, overflow: "auto", padding: 12, border: "1px solid #d1d5db", borderRadius: 10, fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", color: "#374151", background: "#f9fafb" }}>
          {documentText}
        </div>
      ) : null}

      {isCreditAuth ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <SignField label={s.legalFirstName} value={firstName} onChange={setFirstName} />
          <SignField label={s.legalLastName} value={lastName} onChange={setLastName} />
          <SignField label={s.dob} value={dob} onChange={setDob} placeholder="YYYY-MM-DD" />
          <SignField label={s.street} value={street} onChange={setStreet} />
          <SignField label={s.city} value={city} onChange={setCity} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <SignField label={s.state} value={state} onChange={(v) => setState(v.toUpperCase().slice(0, 2))} />
            <SignField label={s.zip} value={zip} onChange={setZip} />
          </div>
        </div>
      ) : null}

      <SignField label={s.typedName} value={typedName} onChange={setTypedName} />

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#374151", cursor: "pointer" }}>
        <input type="checkbox" checked={esignConsent} onChange={(e) => setEsignConsent(e.target.checked)} style={{ marginTop: 2 }} />
        {s.esignConsent}
      </label>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>{s.drawSignature}</div>
        <SignaturePad ref={sigPadRef} />
        <button type="button" onClick={() => sigPadRef.current?.clear()} style={{ marginTop: 8, fontSize: 12, background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
          {s.clearSignature}
        </button>
      </div>

      {(formError || error) ? <div style={{ color: "#b42318", fontSize: 12.5 }}>{formError || error}</div> : null}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={busy} style={{ fontSize: 13, padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "none", cursor: "pointer" }}>
            {s.cancel}
          </button>
        ) : null}
        <button type="button" onClick={submit} disabled={busy} style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer" }}>
          {busy ? s.signSubmitting : s.signSubmit}
        </button>
      </div>
    </div>
  );
}

function SignField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
      />
    </label>
  );
}
