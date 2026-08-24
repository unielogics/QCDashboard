"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DisclosureRowsEditor, type DisclosureRow } from "@/components/DisclosureRowsEditor";
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
  const sessionStarted = useRef(false);

  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [relationships, setRelationships] = useState<DisclosureRow[]>([]);
  const [noRelationships, setNoRelationships] = useState(false);
  const [esignConsent, setEsignConsent] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (sessionStarted.current) return;
    sessionStarted.current = true;
    createSession.mutate("");
    // The mutation must run exactly once for this in-memory signing page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function reviewAgreement() {
    setTouched(true);
    if (!detailsComplete) {
      setError("Complete every required field and either disclose a complete Exhibit A relationship or confirm none exist.");
      return;
    }
    render.mutate(
      { contractType: CONTRACT_TYPE, fieldValues },
      {
        onSuccess: () => {
          setTypedName(form.signerName);
          setStep("review");
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : "Unable to render the agreement."),
      },
    );
  }

  function submitAgreement() {
    const sessionToken = createSession.data?.token;
    if (!sessionToken) {
      setError(createSession.error instanceof Error ? createSession.error.message : "Signing session is unavailable. Refresh and try again.");
      return;
    }
    if (typedName.trim().toLocaleLowerCase() !== form.signerName.trim().toLocaleLowerCase()) {
      setError("Typed legal name must match the signer name entered in Step 1.");
      return;
    }
    if (!esignConsent) {
      setError("E-SIGN/UETA consent is required.");
      return;
    }
    if (!signatureRef.current?.hasSignature()) {
      setError("Draw your signature before signing.");
      return;
    }
    setError("");
    sign.mutate(
      {
        typed_name: typedName.trim(),
        esign_consent: true,
        signature_data_url: signatureRef.current.getDataUrl(),
        field_values: fieldValues,
        signer_email: form.signerEmail.trim(),
        public_session_token: sessionToken,
        no_preexisting_relationships: noRelationships,
        honeypot,
      },
      {
        onSuccess: () => {
          setStep("signed");
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : "The agreement could not be signed."),
      },
    );
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
              <button type="button" onClick={() => { setStep("details"); setError(""); }}>Edit details</button>
            </div>
            <DocumentView document={render.data?.document} />
            <div className="nda-sign-card">
              <div className="nda-company-signature">
                <p className="nda-eyebrow">Qualified Commercial LLC</p>
                <div className="nda-standing-signature">Jonathan Franco</div>
                <small>Authorized Executive · Standing company signature</small>
              </div>
              <Field label="Type your full legal name">
                <input value={typedName} onChange={(event) => { setTypedName(event.target.value); setError(""); }} />
              </Field>
              <div className="nda-signature-wrap">
                <div><strong>Draw your signature</strong><button type="button" onClick={() => signatureRef.current?.clear()}>Clear</button></div>
                <SignaturePad ref={signatureRef} width={760} height={170} />
              </div>
              <label className="nda-check">
                <input type="checkbox" checked={esignConsent} onChange={(event) => { setEsignConsent(event.target.checked); setError(""); }} />
                <span>
                  <strong>I consent to electronic records and signatures under the U.S. E-SIGN Act and UETA.</strong>
                  <small>I reviewed the complete populated agreement, intend my typed and drawn signatures to be legally binding, can access the electronic record, and consent to receive the signed PDF by email.</small>
                </span>
              </label>
              {error ? <div className="nda-error" role="alert">{error}</div> : null}
              <button className="nda-primary" type="button" onClick={submitAgreement} disabled={sign.isPending}>
                {sign.isPending ? "Finalizing signed agreement..." : "Sign and complete agreement"}
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
            {sign.data.certificate_download_url ? (
              <a className="nda-primary" href={sign.data.certificate_download_url} target="_blank" rel="noreferrer">Download signed PDF</a>
            ) : null}
          </section>
        ) : null}
      </section>
      <AgreementStyles />
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

function stepIndex(step: Step) { return step === "details" ? 0 : step === "review" ? 1 : 2; }

function AgreementStyles() {
  return <style jsx global>{`
    .nda-page{min-height:100vh;background:#f4f7f8;color:#111827;font-family:Inter,ui-sans-serif,system-ui,sans-serif;padding:0 20px 70px}.nda-header{height:74px;max-width:1180px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dce4e7}.nda-brand{display:flex;align-items:center;gap:11px;color:#111827;text-decoration:none}.nda-brand span{display:grid}.nda-brand small{font-size:11px;color:#66747b;margin-top:2px}.nda-secure{font-size:12px;font-weight:700;color:#176d69;border:1px solid #a9d5d1;background:#e7f5f3;padding:8px 11px;border-radius:999px}.nda-shell{max-width:1100px;margin:42px auto 0}.nda-intro{text-align:center;max-width:850px;margin:0 auto 30px}.nda-eyebrow{margin:0 0 8px!important;color:#17766f!important;font-size:11px!important;font-weight:850!important;text-transform:uppercase;letter-spacing:1.4px}.nda-intro h1{font-family:Georgia,serif;font-size:clamp(38px,6vw,68px);line-height:.98;margin:0 0 18px;letter-spacing:0}.nda-intro>p:not(.nda-eyebrow){max-width:680px;margin:0 auto;color:#56646b;line-height:1.65}.nda-steps{display:grid;grid-template-columns:repeat(3,1fr);max-width:650px;margin:28px auto 0;position:relative}.nda-steps:before{content:"";height:1px;background:#cad4d8;position:absolute;left:16%;right:16%;top:15px}.nda-steps div{z-index:1;display:grid;justify-items:center;gap:7px;color:#829097;font-size:12px;font-weight:700}.nda-steps span{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#edf1f2;border:1px solid #cad4d8}.nda-steps .active,.nda-steps .done{color:#145f5b}.nda-steps .active span,.nda-steps .done span{background:#176d69;color:white;border-color:#176d69}.nda-card,.nda-review{max-width:920px;margin:0 auto;background:#fff;border:1px solid #dce4e7;border-radius:8px;box-shadow:0 18px 50px rgba(25,43,48,.08);padding:30px}.nda-card-head,.nda-review-head{display:flex;justify-content:space-between;align-items:start;gap:20px;margin-bottom:25px}.nda-card-head span,.nda-review-head span{color:#17766f;text-transform:uppercase;letter-spacing:1px;font-size:10px;font-weight:850}.nda-card h2,.nda-review h2,.nda-complete h2{font-family:Georgia,serif;font-size:30px;margin:5px 0 0}.nda-card-head p{font-size:12px;color:#748188}.nda-grid{display:grid;gap:15px}.nda-grid.two{grid-template-columns:1fr 1fr}.nda-grid.three{grid-template-columns:1fr 1fr 1fr}.nda-field{display:grid;gap:6px;margin-bottom:15px}.nda-field>span{font-size:10.5px;font-weight:850;text-transform:uppercase;letter-spacing:.65px;color:#526168}.nda-field input,.nda-field select{width:100%;box-sizing:border-box;height:46px;border:1px solid #cfd9dd;border-radius:6px;padding:0 12px;background:#fff;color:#111827;font-size:14px;outline:none}.nda-field input:focus,.nda-field select:focus{border-color:#17766f;box-shadow:0 0 0 3px rgba(23,118,111,.1)}.nda-field.invalid input,.nda-field.invalid select,.nda-table.invalid{border-color:#d44b4b!important;box-shadow:0 0 0 3px rgba(212,75,75,.08)}.nda-divider{height:1px;background:#e4eaec;margin:18px 0 23px}.nda-card h3,.nda-section-title h3{font-family:Georgia,serif;font-size:21px;margin:0 0 14px}.nda-section-title{display:flex;justify-content:space-between;gap:24px;align-items:end}.nda-section-title>p{max-width:420px;color:#68767d;font-size:12.5px;line-height:1.5}.nda-warning{background:#fff8df;border:1px solid #e9d58d;border-radius:6px;padding:12px 14px;color:#65551e;font-size:12.5px;margin:12px 0}.nda-check{display:flex;gap:11px;align-items:flex-start;border:1px solid #d5dee1;background:#f8fafb;border-radius:6px;padding:13px;margin:12px 0;cursor:pointer}.nda-check input{width:17px;height:17px;margin-top:2px;accent-color:#176d69}.nda-check span{display:grid;gap:3px;font-size:13px}.nda-check small{color:#68767d;line-height:1.45}.nda-table{border:1px solid #dce4e7;border-radius:7px;padding:12px}.nda-primary{width:100%;box-sizing:border-box;display:block;border:0;border-radius:6px;background:#102b31;color:#fff;font-weight:800;font-size:14px;text-align:center;text-decoration:none;padding:15px 20px;cursor:pointer;margin-top:20px}.nda-primary:hover{background:#176d69}.nda-primary:disabled{opacity:.55;cursor:wait}.nda-error{border:1px solid #efb1b1;background:#fff1f1;color:#9f2525;border-radius:6px;padding:11px 13px;font-size:13px;margin-top:14px}.nda-honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;opacity:0!important}.nda-review{max-width:1000px}.nda-review-head button{border:1px solid #cbd6d9;background:#fff;border-radius:6px;padding:9px 12px;font-weight:750;cursor:pointer}.nda-document{max-height:62vh;overflow:auto;border:1px solid #ccd7da;background:#fff;padding:clamp(20px,4vw,52px);font-family:Georgia,serif;line-height:1.65;color:#1b2529}.nda-document>h2{text-align:center;font-size:24px;text-transform:uppercase;margin-bottom:30px}.nda-document p{font-size:13.5px}.nda-doc-notice{font-family:Inter,sans-serif;background:#fff8df;border:1px solid #ead68d;padding:12px;font-size:12px;margin-bottom:24px}.nda-doc-section{margin-top:24px}.nda-doc-section h3{font-size:15px;margin:0 0 9px}.nda-doc-table-wrap{overflow:auto}.nda-doc-table-wrap table{width:100%;border-collapse:collapse;font-family:Inter,sans-serif;font-size:11px}.nda-doc-table-wrap th,.nda-doc-table-wrap td{border:1px solid #bfcacc;padding:7px;text-align:left;vertical-align:top}.nda-sign-card{margin-top:22px;background:#f8fafb;border:1px solid #d7e0e3;border-radius:8px;padding:22px}.nda-company-signature{border-bottom:1px solid #dbe3e5;padding-bottom:18px;margin-bottom:20px}.nda-standing-signature{font-family:cursive;font-size:30px;color:#123f45}.nda-company-signature small{color:#67767c}.nda-signature-wrap{display:grid;gap:8px}.nda-signature-wrap>div{display:flex;justify-content:space-between}.nda-signature-wrap button{border:0;background:none;color:#a62d2d;font-weight:750;cursor:pointer}.nda-signature-wrap canvas{max-width:100%!important;background:white!important;border-color:#bccace!important}.nda-complete{text-align:center;max-width:650px}.nda-complete-mark{width:56px;height:56px;border-radius:50%;background:#dff3e8;color:#147047;display:grid;place-items:center;font-size:28px;margin:0 auto 20px}.nda-complete>p:not(.nda-eyebrow){color:#5a686e;line-height:1.6}.nda-complete .nda-primary{max-width:320px;margin:24px auto 0}
    @media(max-width:760px){.nda-page{padding:0 12px 40px}.nda-header{height:65px}.nda-secure{display:none}.nda-shell{margin-top:28px}.nda-intro h1{font-size:42px}.nda-steps{margin-top:22px}.nda-steps div{font-size:10px}.nda-card,.nda-review{padding:18px}.nda-card-head,.nda-review-head,.nda-section-title{display:block}.nda-card-head p{margin-top:8px}.nda-grid.two,.nda-grid.three{grid-template-columns:1fr}.nda-document{max-height:55vh;padding:18px}.nda-document>h2{font-size:19px}.nda-sign-card{padding:15px}}
  `}</style>;
}
