"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DisclosureRowsEditor, type DisclosureRow } from "@/components/DisclosureRowsEditor";
import { AgreementPageStyles } from "@/components/agreements/AgreementPageStyles";
import { QCMark } from "@/components/QCMark";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import {
  type ContractDocument,
  type ContractSection,
  type TableColumn,
  useContractPreview,
  useCreateMutualNdaSession,
  useRenderContract,
  useSignMutualNda,
} from "@/hooks/useApi";
import { ApiError } from "@/lib/api";

const CONTRACT_TYPE = "mutual_nda_non_circumvention";

type Step = "details" | "review" | "signed";

type FormState = {
  effectiveDate: string;
  legalName: string;
  entityType: string;
  stateOfFormation: string;
  principalAddress: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
};

const EMPTY_FORM: FormState = {
  effectiveDate: new Date().toISOString().slice(0, 10),
  legalName: "",
  entityType: "",
  stateOfFormation: "",
  principalAddress: "",
  signerName: "",
  signerTitle: "",
  signerEmail: "",
};

const FALLBACK_COLUMNS: TableColumn[] = [
  { key: "name", label: "Institution or entity", input_type: "text", options: null },
  { key: "category", label: "Category", input_type: "select", options: ["Bank", "Financial institution", "Capital source", "Business entity", "Other"] },
  { key: "description", label: "Relationship description", input_type: "text", options: null },
  { key: "start_date", label: "Approximate start date", input_type: "date", options: null },
];

export default function MutualNdaSignPage() {
  const { data: preview, isLoading: previewLoading } = useContractPreview(CONTRACT_TYPE);
  const render = useRenderContract();
  const createSession = useCreateMutualNdaSession();
  const sign = useSignMutualNda();
  const signatureRef = useRef<SignaturePadHandle | null>(null);
  const agreementEndRef = useRef<HTMLDivElement | null>(null);
  const typedNameRef = useRef<HTMLInputElement | null>(null);
  const signatureWrapRef = useRef<HTMLDivElement | null>(null);
  const consentRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [relationships, setRelationships] = useState<DisclosureRow[]>([]);
  const [noRelationships, setNoRelationships] = useState(false);
  const [esignConsent, setEsignConsent] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [documentReviewed, setDocumentReviewed] = useState(false);
  const [signatureCaptured, setSignatureCaptured] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  const relationshipColumns =
    preview?.fields.find((field) => field.name === "preexisting_relationship_rows")?.table_columns ??
    FALLBACK_COLUMNS;

  const validRelationships = useMemo(
    () => relationships.filter((row) => ["name", "category", "description", "start_date"].every((key) => String(row[key] || "").trim())),
    [relationships],
  );

  const fieldValues = useMemo<Record<string, unknown>>(() => ({
    effective_date: form.effectiveDate,
    counterparty_legal_name: form.legalName,
    counterparty_entity_type: form.entityType,
    counterparty_state_of_formation: form.stateOfFormation,
    counterparty_principal_address: form.principalAddress,
    counterparty_signer_name: form.signerName,
    counterparty_signer_title: form.signerTitle,
    counterparty_signer_email: form.signerEmail,
    counterparty_signature_date: form.effectiveDate,
    qc_signatory_name: "Jonathan Franco",
    qc_signature_date: form.effectiveDate,
    preexisting_relationship_declaration: noRelationships
      ? "No pre-existing relationships to disclose."
      : "The following pre-existing relationships are disclosed before execution of this Agreement.",
    preexisting_relationship_rows: noRelationships ? [] : validRelationships,
  }), [form, noRelationships, validRelationships]);

  const detailsComplete = Object.values(form).every((value) => value.trim()) &&
    (noRelationships || (relationships.length > 0 && validRelationships.length === relationships.length));

  const ensureSession = useCallback(async (force = false) => {
    const current = createSession.data;
    const hasUsableSession = current && new Date(current.expires_at).getTime() > Date.now() + 60_000;
    if (!force && hasUsableSession) return current.token;
    const created = await createSession.mutateAsync(honeypot);
    return created.token;
  }, [createSession, honeypot]);

  async function reviewAgreement() {
    setTouched(true);
    if (!detailsComplete) {
      setError("Complete every required field and either disclose a complete Exhibit A relationship or confirm none exist.");
      return;
    }
    try {
      await Promise.all([
        render.mutateAsync({ contractType: CONTRACT_TYPE, fieldValues }),
        ensureSession(true),
      ]);
      setTypedName(form.signerName);
      setDocumentReviewed(false);
      setSignatureCaptured(false);
      setStep("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(apiErrorMessage(cause, "Unable to prepare the agreement. Please try again."));
    }
  }

  const typedNameMatches = normalizeName(typedName) === normalizeName(form.signerName) && Boolean(typedName.trim());
  const signingReady = documentReviewed && typedNameMatches && signatureCaptured && esignConsent;

  useEffect(() => {
    if (step !== "review" || !agreementEndRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setDocumentReviewed(true);
      },
      { threshold: 0.65 },
    );
    observer.observe(agreementEndRef.current);
    return () => observer.disconnect();
  }, [step, render.data]);

  async function submitAgreement() {
    if (!signingReady || submitting) {
      setError("Complete each signing requirement shown below before submitting.");
      focusFirstMissingRequirement({ documentReviewed, typedNameMatches, signatureCaptured, esignConsent }, {
        agreement: agreementEndRef.current,
        typedName: typedNameRef.current,
        signature: signatureWrapRef.current,
        consent: consentRef.current,
      });
      return;
    }
    const signatureDataUrl = signatureRef.current?.getDataUrl() || "";
    setError("");
    setSubmitting(true);
    const submit = async (forceSession = false) => {
      const sessionToken = await ensureSession(forceSession);
      return sign.mutateAsync({
        typed_name: typedName.trim(),
        esign_consent: true,
        signature_data_url: signatureDataUrl,
        field_values: fieldValues,
        signer_email: form.signerEmail.trim(),
        public_session_token: sessionToken,
        no_preexisting_relationships: noRelationships,
        honeypot,
      },
      );
    };
    try {
      let agreement;
      try {
        agreement = await submit(false);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 410)) {
          agreement = await submit(true);
        } else {
          throw cause;
        }
      }
      setStep("signed");
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (agreement.certificate_download_url) {
        window.setTimeout(() => {
          startDownload(agreement.certificate_download_url!, `${agreement.contract_number}.pdf`);
          setDownloadStarted(true);
        }, 250);
      }
    } catch (cause) {
      setError(apiErrorMessage(cause, "The agreement could not be signed. Your entries and signature were preserved; please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="nda-page">
      <header className="nda-header">
        <a href="https://qualifiedcommercial.com" className="nda-brand" aria-label="Qualified Commercial home">
          <QCMark size={38} />
          <span><strong>Qualified Commercial</strong><small>Secure agreement center</small></span>
        </a>
        <span className="nda-secure">Encrypted document workflow</span>
      </header>

      <section className="nda-shell">
        <div className="nda-intro">
          <p className="nda-eyebrow">Mutual protection agreement</p>
          <h1>Mutual NDA &amp;<br />Non-Circumvention</h1>
          <p>Complete your organization details, disclose any pre-existing relationships, review the populated agreement, and sign securely.</p>
          <div className="nda-steps" aria-label="Signing progress">
            {(["details", "review", "signed"] as Step[]).map((item, index) => (
              <div key={item} className={step === item ? "active" : stepIndex(step) > index ? "done" : ""}>
                <span>{stepIndex(step) > index ? "✓" : index + 1}</span>
                {item === "details" ? "Complete details" : item === "review" ? "Review agreement" : "Signed"}
              </div>
            ))}
          </div>
        </div>

        {step === "details" ? (
          <section className="nda-card" aria-labelledby="details-title">
            <div className="nda-card-head">
              <div><span>Step 1 of 3</span><h2 id="details-title">Complete details</h2></div>
              <p>All fields are required.</p>
            </div>

            <div className="nda-grid two">
              <Field label="Effective date" invalid={touched && !form.effectiveDate}>
                <input type="date" value={form.effectiveDate} onChange={(event) => update("effectiveDate", event.target.value)} />
              </Field>
              <Field label="Counterparty legal name" invalid={touched && !form.legalName.trim()}>
                <input value={form.legalName} onChange={(event) => update("legalName", event.target.value)} placeholder="Legal business or individual name" />
              </Field>
              <Field label="Entity type" invalid={touched && !form.entityType.trim()}>
                <select value={form.entityType} onChange={(event) => update("entityType", event.target.value)}>
                  <option value="">Select entity type</option>
                  <option>Limited liability company</option><option>Corporation</option><option>Partnership</option>
                  <option>Sole proprietorship</option><option>Trust</option><option>Individual</option><option>Other</option>
                </select>
              </Field>
              <Field label="State of formation" invalid={touched && !form.stateOfFormation.trim()}>
                <input value={form.stateOfFormation} onChange={(event) => update("stateOfFormation", event.target.value)} placeholder="New Jersey" />
              </Field>
            </div>
            <Field label="Principal business address" invalid={touched && !form.principalAddress.trim()}>
              <input value={form.principalAddress} onChange={(event) => update("principalAddress", event.target.value)} placeholder="Street, city, state, ZIP" />
            </Field>

            <div className="nda-divider" />
            <h3>Authorized signer</h3>
            <div className="nda-grid three">
              <Field label="Full legal name" invalid={touched && !form.signerName.trim()}>
                <input value={form.signerName} onChange={(event) => update("signerName", event.target.value)} />
              </Field>
              <Field label="Title" invalid={touched && !form.signerTitle.trim()}>
                <input value={form.signerTitle} onChange={(event) => update("signerTitle", event.target.value)} />
              </Field>
              <Field label="Email" invalid={touched && !form.signerEmail.trim()}>
                <input type="email" value={form.signerEmail} onChange={(event) => update("signerEmail", event.target.value)} placeholder="name@company.com" />
              </Field>
            </div>

            <div className="nda-divider" />
            <div className="nda-section-title">
              <div><p className="nda-eyebrow">Exhibit A</p><h3>Pre-existing relationships</h3></div>
              <p>Disclose banks, institutions, capital sources, or entities that predate this agreement.</p>
            </div>
            <div className="nda-warning"><strong>Do not enter sensitive banking data.</strong> Never include account numbers, routing numbers, passwords, or credentials.</div>
            <label className="nda-check">
              <input
                type="checkbox"
                checked={noRelationships}
                onChange={(event) => {
                  setNoRelationships(event.target.checked);
                  if (event.target.checked) setRelationships([]);
                }}
              />
              <span><strong>No pre-existing relationships to disclose</strong><small>This option is exclusive and clears any rows below.</small></span>
            </label>
            {!noRelationships ? (
              <div className={touched && (!relationships.length || validRelationships.length !== relationships.length) ? "nda-table invalid" : "nda-table"}>
                <DisclosureRowsEditor columns={relationshipColumns} rows={relationships} onChange={setRelationships} addLabel="Add relationship" />
              </div>
            ) : null}

            <input className="nda-honeypot" tabIndex={-1} aria-hidden="true" autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
            {error ? <div className="nda-error" role="alert">{error}</div> : null}
            <button className="nda-primary" type="button" onClick={reviewAgreement} disabled={render.isPending || previewLoading}>
              {render.isPending ? "Preparing agreement..." : "Review populated agreement"}
            </button>
          </section>
        ) : null}

        {step === "review" ? (
          <section className="nda-review" aria-labelledby="review-title">
            <div className="nda-review-head">
              <div><span>Step 2 of 3</span><h2 id="review-title">Review the complete agreement</h2></div>
              <button type="button" onClick={() => { setStep("details"); setError(""); setDocumentReviewed(false); }}>Edit details</button>
            </div>
            <DocumentView document={render.data?.document} />
            <div ref={agreementEndRef} className="nda-document-end" tabIndex={-1}>
              <span aria-hidden="true">✓</span>
              <div><strong>End of agreement</strong><small>Continue below to complete the electronic signature.</small></div>
            </div>
            <div className="nda-sign-card">
              <div className="nda-company-signature">
                <p className="nda-eyebrow">Qualified Commercial LLC</p>
                <div className="nda-standing-signature">Jonathan Franco</div>
                <small>Authorized Executive · Standing company signature</small>
              </div>
              <Field label="Type your full legal name">
                <input
                  ref={typedNameRef}
                  value={typedName}
                  aria-invalid={Boolean(typedName) && !typedNameMatches}
                  onChange={(event) => { setTypedName(event.target.value); setError(""); }}
                />
              </Field>
              {!typedNameMatches && typedName ? <p className="nda-inline-error">Enter the same full legal name shown in the agreement.</p> : null}
              <div ref={signatureWrapRef} className={signatureCaptured ? "nda-signature-wrap complete" : "nda-signature-wrap"} tabIndex={-1}>
                <div><strong>Draw your signature</strong><button type="button" onClick={() => signatureRef.current?.clear()}>Clear</button></div>
                <SignaturePad
                  ref={signatureRef}
                  width={760}
                  height={190}
                  ariaLabel="Draw your legally binding signature"
                  onSignatureChange={setSignatureCaptured}
                />
              </div>
              <label className="nda-check">
                <input ref={consentRef} type="checkbox" checked={esignConsent} onChange={(event) => { setEsignConsent(event.target.checked); setError(""); }} />
                <span>
                  <strong>I consent to electronic records and signatures under the U.S. E-SIGN Act and UETA.</strong>
                  <small>I reviewed the complete populated agreement, intend my typed and drawn signatures to be legally binding, can access the electronic record, and consent to receive the signed PDF by email.</small>
                </span>
              </label>
              {error ? <div className="nda-error" role="alert">{error}</div> : null}
            </div>
            <div className="nda-sign-dock" aria-label="Agreement signing requirements">
              <div className="nda-requirements">
                <Requirement ready={documentReviewed} label="Agreement reviewed" onClick={() => agreementEndRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} />
                <Requirement ready={typedNameMatches} label="Typed name matches" onClick={() => typedNameRef.current?.focus()} />
                <Requirement ready={signatureCaptured} label="Signature captured" onClick={() => signatureWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} />
                <Requirement ready={esignConsent} label="E-SIGN/UETA accepted" onClick={() => consentRef.current?.focus()} />
              </div>
              {error ? <div className="nda-dock-error" role="alert">{error}</div> : null}
              <button className="nda-primary" type="button" onClick={submitAgreement} disabled={!signingReady || submitting || sign.isPending}>
                {submitting || sign.isPending ? "Creating your signed PDF..." : "Sign and complete agreement"}
              </button>
            </div>
          </section>
        ) : null}

        {step === "signed" && sign.data ? (
          <section className="nda-card nda-complete" aria-labelledby="signed-title">
            <div className="nda-complete-mark">✓</div>
            <p className="nda-eyebrow">Execution complete</p>
            <h2 id="signed-title">Agreement signed</h2>
            <p>
              Your executed agreement is recorded as <strong>{sign.data.contract_number}</strong>.{" "}
              {sign.data.email_delivery_status === "sent"
                ? <>A signed PDF has been sent to <strong>{form.signerEmail}</strong>.</>
                : <>Email delivery was unavailable, but your agreement remains executed and the signed PDF is available below.</>}
            </p>
            {downloadStarted ? <p className="nda-download-note">Your signed PDF download has started automatically.</p> : null}
            {sign.data.certificate_download_url ? (
              <a className="nda-primary" href={sign.data.certificate_download_url} download={`${sign.data.contract_number}.pdf`}>Download signed PDF</a>
            ) : null}
          </section>
        ) : null}
      </section>
      <AgreementPageStyles />
    </main>
  );
}

function Field({ label, invalid = false, children }: { label: string; invalid?: boolean; children: ReactNode }) {
  return <label className={invalid ? "nda-field invalid" : "nda-field"}><span>{label}</span>{children}</label>;
}

function DocumentView({ document }: { document?: ContractDocument }) {
  if (!document) return <div className="nda-document">Preparing the populated agreement...</div>;
  return (
    <article className="nda-document">
      {document.party_facing_notice ? <div className="nda-doc-notice">{document.party_facing_notice}</div> : null}
      <h2>{document.title}</h2>
      {document.preamble.map((paragraph, index) => <p key={`p-${index}`}>{paragraph}</p>)}
      {document.sections.map((section) => <DocumentSection key={section.heading} section={section} />)}
    </article>
  );
}

function DocumentSection({ section }: { section: ContractSection }) {
  return (
    <section className="nda-doc-section">
      <h3>{section.heading}</h3>
      {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {section.columns && section.rows ? (
        <div className="nda-doc-table-wrap"><table><thead><tr>{section.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{section.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
        </table></div>
      ) : null}
    </section>
  );
}

function Requirement({ ready, label, onClick }: { ready: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={ready ? "ready" : "missing"} onClick={onClick}>
      <span aria-hidden="true">{ready ? "✓" : "!"}</span>{label}
    </button>
  );
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function apiErrorMessage(cause: unknown, fallback: string) {
  if (cause instanceof ApiError && cause.body && typeof cause.body === "object") {
    const detail = (cause.body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function startDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function focusFirstMissingRequirement(
  status: { documentReviewed: boolean; typedNameMatches: boolean; signatureCaptured: boolean; esignConsent: boolean },
  refs: { agreement: HTMLElement | null; typedName: HTMLInputElement | null; signature: HTMLElement | null; consent: HTMLInputElement | null },
) {
  if (!status.documentReviewed) return refs.agreement?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (!status.typedNameMatches) return refs.typedName?.focus();
  if (!status.signatureCaptured) return refs.signature?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (!status.esignConsent) refs.consent?.focus();
}

function stepIndex(step: Step) { return step === "details" ? 0 : step === "review" ? 1 : 2; }
