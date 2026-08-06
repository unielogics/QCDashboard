"use client";

// Admin modal for issuing a Deal Registration (Exhibit 1 of a signed
// Referral Protection Agreement) -- a real, dynamically-numbered
// registration under Article 4, issued each time Qualified Commercial
// introduces a specific financing opportunity to a referral partner
// company. Separate from, and issued well after, signing the master
// agreement itself. See app/routers/agreements.py's deal-registration
// endpoints.

import { useState } from "react";
import { Modal } from "@/components/design-system/Modal";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useDealRegistrations, useIssueDealRegistration } from "@/hooks/useApi";

const METHOD_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "portal", label: "Portal" },
  { value: "other", label: "Other" },
];

export function IssueDealRegistrationModal({
  open,
  onClose,
  companyId,
  companyName,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
}) {
  const { t } = useTheme();
  const { data: registrations } = useDealRegistrations(companyId);
  const issue = useIssueDealRegistration();

  const [introducedAt, setIntroducedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [clientBorrower, setClientBorrower] = useState("");
  const [financingOpportunity, setFinancingOpportunity] = useState("");
  const [introducedCapitalSource, setIntroducedCapitalSource] = useState("");
  const [introducedProgram, setIntroducedProgram] = useState("");
  const [introducedContact, setIntroducedContact] = useState("");
  const [methodOfIntroduction, setMethodOfIntroduction] = useState("email");
  const [methodOtherDescription, setMethodOtherDescription] = useState("");
  const [documentsTransmitted, setDocumentsTransmitted] = useState("");
  const [codedDesignation, setCodedDesignation] = useState("");
  const [capitalSourceNumber, setCapitalSourceNumber] = useState("");
  const [dateIdentityDisclosed, setDateIdentityDisclosed] = useState("");
  const [formError, setFormError] = useState("");
  const [justIssued, setJustIssued] = useState<{ number: string; url: string | null } | null>(null);

  function resetForm() {
    setClientBorrower("");
    setFinancingOpportunity("");
    setIntroducedCapitalSource("");
    setIntroducedProgram("");
    setIntroducedContact("");
    setMethodOfIntroduction("email");
    setMethodOtherDescription("");
    setDocumentsTransmitted("");
    setCodedDesignation("");
    setCapitalSourceNumber("");
    setDateIdentityDisclosed("");
  }

  function submit() {
    if (!clientBorrower.trim()) { setFormError("Enter the client / borrower."); return; }
    if (!financingOpportunity.trim()) { setFormError("Describe the financing opportunity."); return; }
    if (!introducedCapitalSource.trim()) { setFormError("Enter the introduced capital source."); return; }
    setFormError("");
    issue.mutate(
      {
        referral_partner_company_id: companyId,
        introduced_at: new Date(introducedAt).toISOString(),
        client_borrower: clientBorrower.trim(),
        financing_opportunity: financingOpportunity.trim(),
        introduced_capital_source: introducedCapitalSource.trim(),
        introduced_program: introducedProgram.trim() || undefined,
        introduced_contact: introducedContact.trim() || undefined,
        method_of_introduction: methodOfIntroduction,
        method_other_description: methodOfIntroduction === "other" ? methodOtherDescription.trim() || undefined : undefined,
        documents_transmitted: documentsTransmitted.trim() || undefined,
        coded_designation: codedDesignation.trim() || undefined,
        capital_source_number: capitalSourceNumber.trim() || undefined,
        date_identity_disclosed: dateIdentityDisclosed ? new Date(dateIdentityDisclosed).toISOString() : undefined,
      },
      {
        onSuccess: (result) => {
          setJustIssued({ number: result.registration_number, url: result.certificate_download_url });
          resetForm();
        },
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Issue Deal Registration — ${companyName}`}>
      <div style={{ display: "grid", gap: 14 }}>
        {justIssued ? (
          <div style={{ border: `1px solid ${t.petrol}`, borderRadius: 10, padding: 12, background: t.petrolSoft, display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800, color: t.ink, fontSize: 13 }}>Issued: {justIssued.number}</div>
            {justIssued.url ? (
              <a href={justIssued.url} target="_blank" rel="noreferrer" style={{ color: t.petrol, fontSize: 12.5, fontWeight: 700 }}>
                Download Exhibit 1 certificate
              </a>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field t={t} label="Date and time of introduction" type="datetime-local" value={introducedAt} onChange={setIntroducedAt} />
          <Field t={t} label="Client / Borrower" value={clientBorrower} onChange={setClientBorrower} />
        </div>
        <Field t={t} label="Financing opportunity (type, amount, use of proceeds)" value={financingOpportunity} onChange={setFinancingOpportunity} multiline />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field t={t} label="Introduced capital source" value={introducedCapitalSource} onChange={setIntroducedCapitalSource} />
          <Field t={t} label="Introduced program / division" value={introducedProgram} onChange={setIntroducedProgram} />
        </div>
        <Field t={t} label="Introduced contact (name, title)" value={introducedContact} onChange={setIntroducedContact} />

        <label style={{ display: "block" }}>
          <div style={fieldLabelStyle(t)}>Method of introduction</div>
          <select value={methodOfIntroduction} onChange={(e) => setMethodOfIntroduction(e.target.value)} style={inputStyle(t)}>
            {METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {methodOfIntroduction === "other" ? (
          <Field t={t} label="Describe method" value={methodOtherDescription} onChange={setMethodOtherDescription} />
        ) : null}

        <Field t={t} label="Documents transmitted" value={documentsTransmitted} onChange={setDocumentsTransmitted} />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field t={t} label="Coded designation (if staged disclosure)" value={codedDesignation} onChange={setCodedDesignation} />
          <Field t={t} label="Capital source no. (staged disclosure)" value={capitalSourceNumber} onChange={setCapitalSourceNumber} />
        </div>
        <Field t={t} label="Date identity disclosed" type="date" value={dateIdentityDisclosed} onChange={setDateIdentityDisclosed} />

        {(formError || issue.error) ? (
          <div style={{ color: t.danger, fontSize: 12.5 }}>
            {formError || (issue.error instanceof Error ? issue.error.message : "Something went wrong.")}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={qcBtn(t)}>Close</button>
          <button type="button" onClick={submit} disabled={issue.isPending} style={{ ...qcBtnPrimary(t), opacity: issue.isPending ? 0.6 : 1 }}>
            {issue.isPending ? "Issuing…" : "Issue registration"}
          </button>
        </div>

        {registrations && registrations.length > 0 ? (
          <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 10, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: t.ink3 }}>
              Previously issued
            </div>
            {registrations.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: t.ink2 }}>
                <span>{r.registration_number} — {r.client_borrower}</span>
                {r.certificate_download_url ? (
                  <a href={r.certificate_download_url} target="_blank" rel="noreferrer" style={{ color: t.petrol, fontWeight: 700 }}>Download</a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function fieldLabelStyle(t: ReturnType<typeof useTheme>["t"]) {
  return { fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: 0.5, color: t.ink3, marginBottom: 4 };
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]) {
  return { width: "100%", boxSizing: "border-box" as const, padding: "9px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, fontSize: 13, outline: "none" };
}

function Field({
  t,
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={fieldLabelStyle(t)}>{label}</div>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={{ ...inputStyle(t), resize: "vertical", font: "inherit" }} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle(t)} />
      )}
    </label>
  );
}
