"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgreementPageStyles } from "@/components/agreements/AgreementPageStyles";
import { DisclosureRowsEditor, type DisclosureRow } from "@/components/DisclosureRowsEditor";
import { QCMark } from "@/components/QCMark";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import { type ContractDocument, type ContractSection, useContractPreview, useRenderContract, useSignReferralProtection } from "@/hooks/useApi";
import { ContractType } from "@/lib/enums.generated";

type Step = "details" | "review" | "signed";
type FormState = {
  effectiveDate: string; companyName: string; companyEntityType: string; companyStateOfFormation: string;
  companyAddress: string; noticeAttn: string; noticeAddressLine1: string; noticeAddressLine2: string;
  noticeEmail: string; noticeCounselCopy: string; officerName: string; officerTitle: string;
};

const EMPTY_FORM: FormState = {
  effectiveDate: new Date().toISOString().slice(0, 10), companyName: "", companyEntityType: "",
  companyStateOfFormation: "", companyAddress: "", noticeAttn: "", noticeAddressLine1: "",
  noticeAddressLine2: "", noticeEmail: "", noticeCounselCopy: "", officerName: "", officerTitle: "",
};
const DISCLOSURE_LABELS: Record<string, string> = {
  schedule_a_institutional_rows: "Existing institutional relationships",
  schedule_a_other_capital_rows: "Other capital-source relationships",
  schedule_a_pending_rows: "Pending applications or discussions",
};

export default function ReferralProtectionSignPage() {
  const { data: preview, isLoading: previewLoading } = useContractPreview(ContractType.REFERRAL_PROTECTION);
  const render = useRenderContract();
  const sign = useSignReferralProtection();
  const signatureRef = useRef<SignaturePadHandle | null>(null);
  const agreementEndRef = useRef<HTMLDivElement | null>(null);
  const typedNameRef = useRef<HTMLInputElement | null>(null);
  const signatureWrapRef = useRef<HTMLDivElement | null>(null);
  const consentRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [disclosureRows, setDisclosureRows] = useState<Record<string, DisclosureRow[]>>({});
  const [noDisclosures, setNoDisclosures] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [documentReviewed, setDocumentReviewed] = useState(false);
  const [signatureCaptured, setSignatureCaptured] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  const disclosureFields = useMemo(
    () => preview?.fields.filter((field) => field.field_type === "disclosure_rows") ?? [],
    [preview?.fields],
  );
  const disclosuresComplete = useMemo(() => noDisclosures || disclosureFields.every((field) =>
    rowsComplete(disclosureRows[field.name] ?? [], field.table_columns ?? []),
  ), [disclosureFields, disclosureRows, noDisclosures]);
  const requiredDetailsComplete = Boolean(
    form.effectiveDate && form.companyName.trim() && form.companyEntityType.trim() && form.companyStateOfFormation.trim() &&
    form.companyAddress.trim() && form.noticeAttn.trim() && form.noticeAddressLine1.trim() && form.noticeAddressLine2.trim() &&
    form.noticeEmail.trim() && form.officerName.trim() && form.officerTitle.trim(),
  );
  const detailsComplete = requiredDetailsComplete && disclosuresComplete;

  const fieldValues = useMemo<Record<string, unknown>>(() => ({
    referral_partner_legal_name_coverpage: form.companyName,
    referral_partner_legal_name: form.companyName,
    referral_partner_entity_type_state: [form.companyEntityType, form.companyStateOfFormation].filter(Boolean).join(", "),
    referral_partner_state_of_organization: form.companyStateOfFormation,
    referral_partner_entity_type: form.companyEntityType,
    referral_partner_principal_place_of_business: form.companyAddress,
    referral_partner_notice_name: form.companyName,
    referral_partner_notice_attn: form.noticeAttn,
    referral_partner_notice_address_line1: form.noticeAddressLine1,
    referral_partner_notice_address_line2: form.noticeAddressLine2,
    referral_partner_notice_email: form.noticeEmail,
    referral_partner_notice_counsel_copy: form.noticeCounselCopy || "N/A",
    schedule_a_certifying_officer_name: form.officerName,
    schedule_a_certifying_officer_title: form.officerTitle,
    schedule_a_certification_date: form.effectiveDate,
    effective_date: form.effectiveDate,
    counterparty_signatory_name: form.officerName,
    counterparty_signatory_title: form.officerTitle,
    ...Object.fromEntries(disclosureFields.map((field) => [field.name, noDisclosures ? [] : disclosureRows[field.name] ?? []])),
  }), [disclosureFields, disclosureRows, form, noDisclosures]);

  async function reviewAgreement() {
    setTouched(true);
    if (!detailsComplete) {
      setError("Complete every required field and finish any Schedule A row you started.");
      return;
    }
    try {
      await render.mutateAsync({ contractType: ContractType.REFERRAL_PROTECTION, fieldValues });
      setTypedName(form.officerName);
      setDocumentReviewed(false);
      setSignatureCaptured(false);
      setStep("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(errorMessage(cause, "Unable to prepare the agreement. Please try again."));
    }
  }

  useEffect(() => {
    if (step !== "review" || !agreementEndRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((entry) => entry.isIntersecting)) setDocumentReviewed(true); },
      { threshold: 0.65 },
    );
    observer.observe(agreementEndRef.current);
    return () => observer.disconnect();
  }, [step, render.data]);

  const typedNameMatches = normalizeName(typedName) === normalizeName(form.officerName) && Boolean(typedName.trim());
  const signingReady = documentReviewed && typedNameMatches && signatureCaptured && esignConsent;

  async function submitAgreement() {
    if (!signingReady || submitting) {
      setError("Complete each signing requirement shown below before submitting.");
      focusFirstMissingRequirement(
        { documentReviewed, typedNameMatches, signatureCaptured, esignConsent },
        { agreement: agreementEndRef.current, typedName: typedNameRef.current, signature: signatureWrapRef.current, consent: consentRef.current },
      );
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const agreement = await sign.mutateAsync({
        typed_name: typedName.trim(), esign_consent: true, signature_data_url: signatureRef.current?.getDataUrl() || "",
        field_values: fieldValues, signer_email: form.noticeEmail.trim(), company_name: form.companyName.trim(),
        company_entity_type: form.companyEntityType.trim(), company_state_of_formation: form.companyStateOfFormation.trim(),
        company_principal_address: form.companyAddress.trim(),
      });
      setStep("signed");
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (agreement.certificate_download_url) window.setTimeout(() => {
        startDownload(agreement.certificate_download_url!, `${agreement.contract_number}.pdf`);
        setDownloadStarted(true);
      }, 250);
    } catch (cause) {
      setError(errorMessage(cause, "The agreement could not be signed. Your entries and signature were preserved; please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="nda-page">
      <header className="nda-header">
        <a href="https://qualifiedcommercial.com" className="nda-brand" aria-label="Qualified Commercial home">
          <QCMark size={38} /><span><strong>Qualified Commercial</strong><small>Secure agreement center</small></span>
        </a>
        <span className="nda-secure">Encrypted document workflow</span>
      </header>
      <section className="nda-shell">
        <div className="nda-intro">
          <p className="nda-eyebrow">Referral protection agreement</p>
          <h1>Referral Protection<br />Agreement</h1>
          <p>Complete the referral partner details, disclose applicable capital relationships, review the populated agreement, and sign securely.</p>
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
          <section className="nda-card" aria-labelledby="referral-details-title">
            <div className="nda-card-head"><div><span>Step 1 of 3</span><h2 id="referral-details-title">Complete details</h2></div><p>Required fields are marked through validation.</p></div>
            <div className="nda-grid two">
              <Field label="Effective date" invalid={touched && !form.effectiveDate}><input type="date" value={form.effectiveDate} onChange={(event) => update("effectiveDate", event.target.value)} /></Field>
              <Field label="Referral partner legal name" invalid={touched && !form.companyName.trim()}><input value={form.companyName} onChange={(event) => update("companyName", event.target.value)} placeholder="Legal organization name" /></Field>
              <Field label="Entity type" invalid={touched && !form.companyEntityType.trim()}><select value={form.companyEntityType} onChange={(event) => update("companyEntityType", event.target.value)}><option value="">Select entity type</option><option>Limited liability company</option><option>Corporation</option><option>Partnership</option><option>Sole proprietorship</option><option>Individual</option><option>Other</option></select></Field>
              <Field label="State of formation" invalid={touched && !form.companyStateOfFormation.trim()}><input value={form.companyStateOfFormation} onChange={(event) => update("companyStateOfFormation", event.target.value)} placeholder="New Jersey" /></Field>
            </div>
            <Field label="Principal place of business" invalid={touched && !form.companyAddress.trim()}><input value={form.companyAddress} onChange={(event) => update("companyAddress", event.target.value)} placeholder="Street, city, state, ZIP" /></Field>
            <div className="nda-divider" /><h3>Notice contact</h3>
            <div className="nda-grid two">
              <Field label="Attention" invalid={touched && !form.noticeAttn.trim()}><input value={form.noticeAttn} onChange={(event) => update("noticeAttn", event.target.value)} placeholder="Contact name or department" /></Field>
              <Field label="Notice email" invalid={touched && !form.noticeEmail.trim()}><input type="email" value={form.noticeEmail} onChange={(event) => update("noticeEmail", event.target.value)} placeholder="name@company.com" /></Field>
              <Field label="Address line 1" invalid={touched && !form.noticeAddressLine1.trim()}><input value={form.noticeAddressLine1} onChange={(event) => update("noticeAddressLine1", event.target.value)} /></Field>
              <Field label="Address line 2" invalid={touched && !form.noticeAddressLine2.trim()}><input value={form.noticeAddressLine2} onChange={(event) => update("noticeAddressLine2", event.target.value)} placeholder="City, state, ZIP" /></Field>
              <Field label="Counsel copy (optional)"><input value={form.noticeCounselCopy} onChange={(event) => update("noticeCounselCopy", event.target.value)} placeholder="Counsel name and email, if applicable" /></Field>
            </div>
            <div className="nda-divider" /><h3>Authorized signer and Schedule A certifying officer</h3>
            <div className="nda-grid two">
              <Field label="Full legal name" invalid={touched && !form.officerName.trim()}><input value={form.officerName} onChange={(event) => update("officerName", event.target.value)} /></Field>
              <Field label="Title" invalid={touched && !form.officerTitle.trim()}><input value={form.officerTitle} onChange={(event) => update("officerTitle", event.target.value)} /></Field>
            </div>
            <div className="nda-divider" />
            <div className="nda-section-title">
              <div><p className="nda-eyebrow">Schedule A</p><h3>Existing capital relationships</h3></div>
              <p>Disclose applicable institutional, capital-source, and pending relationships. Do not include account credentials.</p>
            </div>
            <div className="nda-warning"><strong>Do not enter sensitive banking data.</strong> Never include account numbers, routing numbers, passwords, or credentials.</div>
            <label className="nda-check">
              <input type="checkbox" checked={noDisclosures} onChange={(event) => { setNoDisclosures(event.target.checked); if (event.target.checked) setDisclosureRows({}); }} />
              <span><strong>No Schedule A relationships to disclose</strong><small>This option is exclusive and clears any rows below.</small></span>
            </label>
            {!noDisclosures ? disclosureFields.map((field) => (
              <div className="nda-disclosure-group" key={field.name}>
                <div className="nda-disclosure-label">{DISCLOSURE_LABELS[field.name] ?? field.label}</div>
                <div className={touched && !rowsComplete(disclosureRows[field.name] ?? [], field.table_columns ?? []) ? "nda-table invalid" : "nda-table"}>
                  <DisclosureRowsEditor
                    columns={field.table_columns ?? []}
                    rows={disclosureRows[field.name] ?? []}
                    onChange={(rows) => setDisclosureRows((current) => ({ ...current, [field.name]: rows }))}
                    addLabel={`Add ${singularLabel(DISCLOSURE_LABELS[field.name] ?? field.label)}`}
                  />
                </div>
              </div>
            )) : null}
            {error ? <div className="nda-error" role="alert">{error}</div> : null}
            <button className="nda-primary" type="button" onClick={reviewAgreement} disabled={render.isPending || previewLoading}>
              {render.isPending ? "Preparing agreement..." : "Review populated agreement"}
            </button>
          </section>
        ) : null}

        {step === "review" ? (
          <section className="nda-review" aria-labelledby="referral-review-title">
            <div className="nda-review-head">
              <div><span>Step 2 of 3</span><h2 id="referral-review-title">Review the complete agreement</h2></div>
              <button type="button" onClick={() => { setStep("details"); setError(""); setDocumentReviewed(false); }}>Edit details</button>
            </div>
            <DocumentView document={render.data?.document} />
            <div ref={agreementEndRef} className="nda-document-end" tabIndex={-1}>
              <span aria-hidden="true">✓</span><div><strong>End of agreement</strong><small>Continue below to complete the electronic signature.</small></div>
            </div>
            <div className="nda-sign-card">
              <div className="nda-company-signature">
                <p className="nda-eyebrow">Qualified Commercial LLC</p>
                <div className="nda-standing-signature">Jonathan Franco</div>
                <small>Authorized Executive · Standing company signature</small>
              </div>
              <Field label="Type your full legal name">
                <input ref={typedNameRef} value={typedName} aria-invalid={Boolean(typedName) && !typedNameMatches} onChange={(event) => { setTypedName(event.target.value); setError(""); }} />
              </Field>
              {!typedNameMatches && typedName ? <p className="nda-inline-error">Enter the same full legal name shown in the agreement.</p> : null}
              <div ref={signatureWrapRef} className={signatureCaptured ? "nda-signature-wrap complete" : "nda-signature-wrap"} tabIndex={-1}>
                <div><strong>Draw your signature</strong><button type="button" onClick={() => signatureRef.current?.clear()}>Clear</button></div>
                <SignaturePad ref={signatureRef} width={760} height={190} ariaLabel="Draw your legally binding signature" onSignatureChange={setSignatureCaptured} />
              </div>
              <label className="nda-check">
                <input ref={consentRef} type="checkbox" checked={esignConsent} onChange={(event) => { setEsignConsent(event.target.checked); setError(""); }} />
                <span><strong>I consent to electronic records and signatures under the U.S. E-SIGN Act and UETA.</strong><small>I reviewed the populated agreement, intend my typed and drawn signatures to be legally binding, and consent to receive the signed PDF by email.</small></span>
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
          <section className="nda-card nda-complete" aria-labelledby="referral-signed-title">
            <div className="nda-complete-mark">✓</div>
            <p className="nda-eyebrow">Execution complete</p>
            <h2 id="referral-signed-title">Agreement signed</h2>
            <p>Your executed agreement is recorded as <strong>{sign.data.contract_number}</strong>. {sign.data.email_delivery_status === "sent" ? <>A signed PDF has been sent to <strong>{form.noticeEmail}</strong>.</> : <>Email delivery was unavailable, but the signed PDF remains available below.</>}</p>
            {downloadStarted ? <p className="nda-download-note">Your signed PDF download has started automatically.</p> : null}
            {sign.data.certificate_download_url ? <a className="nda-primary" href={sign.data.certificate_download_url} download={`${sign.data.contract_number}.pdf`}>Download signed PDF</a> : null}
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
        <div className="nda-doc-table-wrap"><table><thead><tr>{section.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{section.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
      ) : null}
    </section>
  );
}

function Requirement({ ready, label, onClick }: { ready: boolean; label: string; onClick: () => void }) {
  return <button type="button" className={ready ? "ready" : "missing"} onClick={onClick}><span aria-hidden="true">{ready ? "✓" : "!"}</span>{label}</button>;
}

function rowsComplete(rows: DisclosureRow[], columns: { key: string }[]) {
  return rows.every((row) => columns.every((column) => String(row[column.key] ?? "").trim()));
}
function singularLabel(label: string) { return label.replace(/relationships$/i, "relationship").replace(/applications or discussions$/i, "application or discussion"); }
function normalizeName(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
function stepIndex(step: Step) { return step === "details" ? 0 : step === "review" ? 1 : 2; }
function errorMessage(cause: unknown, fallback: string) { return cause instanceof Error && cause.message ? cause.message : fallback; }

function startDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.rel = "noreferrer"; anchor.style.display = "none";
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
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
