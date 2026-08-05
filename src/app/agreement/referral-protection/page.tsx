"use client";

// Public, unauthenticated fill-and-sign page for the Referral Protection
// Agreement (agreement.qualifiedcommercial.com/referral-protection). No
// login, no token -- the counterparty identifies their own company by what
// they type, exactly like the platform's other public "fill and submit"
// pages (buckets/request, funding-review, dealer-ai-underwriter). The
// document body itself is entirely server-rendered (GET
// /contracts/referral-protection/preview) so no legal text is duplicated
// here -- only the handful of user-facing fields this page collects and
// maps into the full field_values payload the backend expects.
//
// The backend's field_schema has ~17 in-scope blanks, but several of them
// are the SAME real-world value repeated in different places in the
// document (the Referral Partner's legal name appears on the cover page,
// in the main recital, and again in the notice block). This form collects
// each real-world fact ONCE and fans it out to every backend field that
// needs it, rather than asking the signer to type their own company name
// three times.

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { QCMark } from "@/components/QCMark";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import { useContractPreview, useSignReferralProtection } from "@/hooks/useApi";

type FormState = {
  companyName: string;
  companyEntityType: string;
  companyStateOfFormation: string;
  companyAddress: string;
  noticeAttn: string;
  noticeAddressLine1: string;
  noticeAddressLine2: string;
  noticeEmail: string;
  noticeCounselCopy: string;
  officerName: string;
  officerTitle: string;
  effectiveDate: string;
};

const EMPTY_FORM: FormState = {
  companyName: "",
  companyEntityType: "",
  companyStateOfFormation: "",
  companyAddress: "",
  noticeAttn: "",
  noticeAddressLine1: "",
  noticeAddressLine2: "",
  noticeEmail: "",
  noticeCounselCopy: "N/A",
  officerName: "",
  officerTitle: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
};

export default function ReferralProtectionSignPage() {
  const { data: preview } = useContractPreview("referral-protection");
  const sign = useSignReferralProtection();
  const sigPadRef = useRef<SignaturePadHandle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [typedName, setTypedName] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [formError, setFormError] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const fieldValues = useMemo(() => {
    const entityTypeState = [form.companyEntityType, form.companyStateOfFormation].filter(Boolean).join(", ");
    return {
      referral_partner_legal_name_coverpage: form.companyName,
      referral_partner_legal_name: form.companyName,
      referral_partner_entity_type_state: entityTypeState,
      referral_partner_state_of_organization: form.companyStateOfFormation,
      referral_partner_entity_type: form.companyEntityType,
      referral_partner_principal_place_of_business: form.companyAddress,
      referral_partner_notice_name: form.companyName,
      referral_partner_notice_attn: form.noticeAttn,
      referral_partner_notice_address_line1: form.noticeAddressLine1,
      referral_partner_notice_address_line2: form.noticeAddressLine2,
      referral_partner_notice_email: form.noticeEmail,
      referral_partner_notice_counsel_copy: form.noticeCounselCopy,
      schedule_a_certifying_officer_name: form.officerName,
      schedule_a_certifying_officer_title: form.officerTitle,
      schedule_a_certification_date: form.effectiveDate,
      effective_date: form.effectiveDate,
    };
  }, [form]);

  function submit() {
    if (!form.companyName.trim()) { setFormError("Enter your company's legal name."); return; }
    if (!form.officerName.trim()) { setFormError("Enter the certifying officer's name."); return; }
    if (!typedName.trim()) { setFormError("Type your full legal name to sign."); return; }
    if (!esignConsent) { setFormError("Check the E-SIGN consent box."); return; }
    const sigPad = sigPadRef.current;
    if (!sigPad?.hasSignature()) { setFormError("Draw your signature."); return; }
    setFormError("");
    sign.mutate({
      typed_name: typedName.trim(),
      esign_consent: true,
      signature_data_url: sigPad.getDataUrl(),
      field_values: fieldValues,
      signer_email: form.noticeEmail.trim() || undefined,
      company_name: form.companyName.trim(),
      company_entity_type: form.companyEntityType.trim() || undefined,
      company_state_of_formation: form.companyStateOfFormation.trim() || undefined,
      company_principal_address: form.companyAddress.trim() || undefined,
    });
  }

  const doc = preview?.document;

  if (sign.data) {
    return (
      <div style={page}>
        <div style={shell}>
          <BrandHeader />
          <h1 style={title}>Agreement signed</h1>
          <p style={copy}>
            Contract number <strong>{sign.data.contract_number}</strong> is on file for{" "}
            <strong>{form.companyName}</strong>. A copy has been recorded with your signature and timestamp.
          </p>
          {sign.data.certificate_download_url ? (
            <a href={sign.data.certificate_download_url} target="_blank" rel="noreferrer" style={{ ...primaryButton, display: "inline-block", marginTop: 8, textDecoration: "none" }}>
              Download signed copy
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main style={page}>
      <div style={shell}>
        <BrandHeader />
        <h1 style={title}>{doc?.title ?? "Loading agreement…"}</h1>
        {preview?.document_version ? <p style={versionLine}>Version {preview.document_version}</p> : null}

        <div style={docCard}>
          {!doc ? (
            <div style={muted}>Loading agreement…</div>
          ) : (
            <>
              {doc.party_facing_notice ? <p style={noticeBox}>{doc.party_facing_notice}</p> : null}
              <div style={docScroll}>
                {doc.preamble.map((p, i) => (p.trim() ? <p key={`pre-${i}`} style={docPara}>{p}</p> : null))}
                {doc.sections.map((section, i) => (
                  <div key={i}>
                    <div style={docHeading}>{section.heading}</div>
                    {section.paragraphs.map((p, j) => (<p key={j} style={docPara}>{p}</p>))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={formCard}>
          <SectionTitle>Your company</SectionTitle>
          <Field label="Company legal name" value={form.companyName} onChange={(v) => set("companyName", v)} />
          <Row>
            <Field label="Entity type (e.g. LLC, corporation)" value={form.companyEntityType} onChange={(v) => set("companyEntityType", v)} />
            <Field label="State of formation" value={form.companyStateOfFormation} onChange={(v) => set("companyStateOfFormation", v)} />
          </Row>
          <Field label="Principal place of business (address)" value={form.companyAddress} onChange={(v) => set("companyAddress", v)} />

          <SectionTitle>Notice contact</SectionTitle>
          <p style={hint}>Where Qualified Commercial should send legal notices under this Agreement.</p>
          <Field label="Attn (name/title)" value={form.noticeAttn} onChange={(v) => set("noticeAttn", v)} />
          <Row>
            <Field label="Address line 1" value={form.noticeAddressLine1} onChange={(v) => set("noticeAddressLine1", v)} />
            <Field label="Address line 2 (city, state, ZIP)" value={form.noticeAddressLine2} onChange={(v) => set("noticeAddressLine2", v)} />
          </Row>
          <Row>
            <Field label="Notice email" value={form.noticeEmail} onChange={(v) => set("noticeEmail", v)} />
            <Field label="Copy to counsel (optional)" value={form.noticeCounselCopy} onChange={(v) => set("noticeCounselCopy", v)} />
          </Row>

          <SectionTitle>Certifying officer</SectionTitle>
          <p style={hint}>The officer certifying Schedule A's disclosure of existing capital relationships on behalf of the company.</p>
          <Row>
            <Field label="Officer name" value={form.officerName} onChange={(v) => set("officerName", v)} />
            <Field label="Officer title" value={form.officerTitle} onChange={(v) => set("officerTitle", v)} />
          </Row>
          <Field label="Effective date" value={form.effectiveDate} onChange={(v) => set("effectiveDate", v)} type="date" />

          <SectionTitle>Sign</SectionTitle>
          <Field label="Type your full legal name" value={typedName} onChange={setTypedName} />
          <label style={consentLabel}>
            <input type="checkbox" checked={esignConsent} onChange={(e) => setEsignConsent(e.target.checked)} style={{ marginTop: 2 }} />
            I consent to use electronic records and signatures under the U.S. E-SIGN Act and UETA, and I agree to the
            terms above on behalf of the company identified. I understand I may request a paper copy of this signed
            agreement at any time by contacting support@qualifiedcommercial.com, and that I may withdraw consent to
            electronic records prospectively through that same address.
          </label>

          <div>
            <div style={sigLabel}>Draw your signature</div>
            <SignaturePad ref={sigPadRef} />
            <button type="button" onClick={() => sigPadRef.current?.clear()} style={clearButton}>Clear signature</button>
          </div>

          {(formError || sign.error) ? (
            <div style={errorText}>{formError || (sign.error instanceof Error ? sign.error.message : "Something went wrong.")}</div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={submit} disabled={sign.isPending || !doc} style={{ ...primaryButton, opacity: sign.isPending || !doc ? 0.6 : 1 }}>
              {sign.isPending ? "Submitting…" : "Sign & submit"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function BrandHeader() {
  return (
    <div style={brandHeader}>
      <QCMark size={34} />
      <div>
        <div style={brand}>Qualified Commercial</div>
        <div style={brandName}>
          <Link href="/agreement" style={{ color: "inherit", textDecoration: "none" }}>Agreement Portal</Link>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={sectionTitle}>{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={row}>{children}</div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={fieldWrap}>
      <div style={fieldLabel}>{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={input} />
    </label>
  );
}

const page: CSSProperties = { minHeight: "100vh", background: "radial-gradient(1200px 620px at 50% -12%, #0C1428 0%, #060B1A 62%)", color: "#F1F5F9", padding: 24, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" };
const shell: CSSProperties = { maxWidth: 760, margin: "6vh auto 60px", display: "grid", gap: 18 };
const brandHeader: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const brand: CSSProperties = { color: "#21D3C7", fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" };
const brandName: CSSProperties = { color: "#F8FAFC", fontSize: 15, fontWeight: 900, lineHeight: 1.2 };
const title: CSSProperties = { margin: "8px 0 0", fontSize: 24, lineHeight: 1.2, color: "#F8FAFC" };
const versionLine: CSSProperties = { margin: "4px 0 0", color: "#95A3B6", fontSize: 12.5 };
const docCard: CSSProperties = { border: "1px solid rgba(255,255,255,.10)", borderRadius: 14, background: "rgba(255,255,255,.03)", padding: 16 };
const docScroll: CSSProperties = { maxHeight: 320, overflowY: "auto", display: "grid", gap: 10, paddingRight: 4 };
const noticeBox: CSSProperties = { margin: "0 0 12px", color: "#F0C36D", fontSize: 12, lineHeight: 1.5, fontWeight: 700 };
const docHeading: CSSProperties = { fontWeight: 800, fontSize: 12.5, color: "#F8FAFC", marginTop: 10, marginBottom: 4 };
const docPara: CSSProperties = { margin: "0 0 6px", color: "#B8C4D6", fontSize: 12.5, lineHeight: 1.55 };
const muted: CSSProperties = { color: "#95A3B6", fontSize: 13 };
const formCard: CSSProperties = { border: "1px solid rgba(255,255,255,.10)", borderRadius: 14, background: "rgba(255,255,255,.03)", padding: 18, display: "grid", gap: 12 };
const sectionTitle: CSSProperties = { fontSize: 13, fontWeight: 800, color: "#7FE7DE", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 };
const hint: CSSProperties = { margin: "-4px 0 4px", color: "#95A3B6", fontSize: 12, lineHeight: 1.4 };
const row: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 10 };
const fieldWrap: CSSProperties = { display: "block" };
const fieldLabel: CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#95A3B6", marginBottom: 4 };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "#1B1F2A", color: "#F8FAFC", fontSize: 13, outline: "none" };
const consentLabel: CSSProperties = { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#B8C4D6", cursor: "pointer", lineHeight: 1.45 };
const sigLabel: CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#95A3B6", marginBottom: 6 };
const clearButton: CSSProperties = { marginTop: 8, fontSize: 12, background: "none", border: "1px solid rgba(255,255,255,.14)", color: "#B8C4D6", borderRadius: 8, padding: "6px 10px", cursor: "pointer" };
const errorText: CSSProperties = { color: "#FCA5A5", fontSize: 12.5 };
const copy: CSSProperties = { color: "#B8C4D6", fontSize: 14, lineHeight: 1.6 };
const primaryButton: CSSProperties = { height: 44, border: "none", borderRadius: 999, padding: "0 18px", font: "inherit", fontWeight: 900, background: "linear-gradient(135deg,#E9D58A,#D4AF37)", color: "#0B1326", cursor: "pointer" };
