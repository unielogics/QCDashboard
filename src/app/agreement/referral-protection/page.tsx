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
// The backend's field_schema has ~17 scalar in-scope blanks plus 3
// "disclosure_rows" fields (Schedule A's existing-capital-relationship
// tables, see DisclosureRowsEditor below) -- several scalar fields are the
// SAME real-world value repeated in different places in the document (the
// Referral Partner's legal name appears on the cover page, in the main
// recital, and again in the notice block). This form collects each
// real-world fact ONCE and fans it out to every backend field that needs
// it, rather than asking the signer to type their own company name three
// times.
//
// The document's SIGNATURES section (backend: scripts/patch_signature_blocks.py)
// is rendered by a dedicated SignatureBlock component here, NOT the generic
// section-paragraph loop -- Qualified Commercial's side shows its standing
// signature image, and the counterparty's Name/Title lines are live inline
// inputs anchored at the exact spot in the document where they're needed,
// with the drawn-signature pad directly beneath. The server-rendered text
// for that one section is never displayed; the final signed document gets
// the real values via field_values at submit time.
//
// Public/unauthenticated. Colour comes from the one palette in globals.css
// but still sits inside the app's ThemeProvider (see providers.tsx), so it
// respects the visitor's light/dark/system preference, with an inline
// toggle in the header since there's no Settings page to reach otherwise.

import { useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { V, type CssVars } from "@/components/design-system/cssVars";
import Link from "next/link";
import { QCMark } from "@/components/QCMark";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import { Icon } from "@/components/design-system/Icon";
import { DisclosureRowsEditor, type DisclosureRow } from "@/components/DisclosureRowsEditor";
import { useContractPreview, useRenderContract, useSignReferralProtection } from "@/hooks/useApi";
import { ContractType } from "@/lib/enums.generated";
import type { ContractSection, TableColumn } from "@/hooks/useApi";

type Step = "fill" | "review" | "signed";

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

const SIGNATURE_SECTION_HEADING = "SIGNATURES";
const DISCLOSURE_FIELD_ADD_LABEL: Record<string, string> = {
  schedule_a_institutional_rows: "Institutional relationship",
  schedule_a_other_capital_rows: "Other capital relationship",
  schedule_a_pending_rows: "Pending application",
};

export default function ReferralProtectionSignPage() {
  const { data: preview } = useContractPreview(ContractType.REFERRAL_PROTECTION);
  const render = useRenderContract();
  const sign = useSignReferralProtection();
  const sigPadRef = useRef<SignaturePadHandle | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const sigAnchorRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<Step>("fill");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [typedName, setTypedName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [formError, setFormError] = useState("");
  const [docScale, setDocScale] = useState(1);
  // Disclosure rows for Schedule A's 3 tables, keyed by the backend's
  // disclosure_rows field name. Starts empty on every field -- nothing is
  // disclosed until the signer explicitly adds a row.
  const [disclosureRows, setDisclosureRows] = useState<Record<string, DisclosureRow[]>>({});
  // SignaturePad exposes hasSignature() only imperatively (no onChange --
  // it's a shared primitive also used by PlatformAccessGate/
  // PaymentAuthorizationPanel/SignRequestedDocument, not worth changing for
  // this one page). Drawing on the canvas never triggers a React re-render
  // on its own, so the checklist below would show "Signature" as incomplete
  // forever even after the user actually draws one. Re-check on pointer-up,
  // bubbled up from the canvas's own (non-stopPropagation'd) handler.
  const [sigDrawn, setSigDrawn] = useState(false);

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
      // The main SIGNATURES block's counterparty Name/Title lines -- filled
      // live from the sign panel's own state, empty until the signer reaches
      // it. Harmless to include at the fill step's /render call (renders
      // blank there, but that section is never shown using this fetched
      // text -- see SignatureBlock below); required at actual /sign time so
      // the final hashed, certificate-rendered document is complete.
      counterparty_signatory_name: typedName,
      counterparty_signatory_title: signerTitle,
      // Schedule A's 3 disclosure tables -- list[dict], not scalars; the
      // backend validates shape defensively per declared column.
      ...disclosureRows,
    };
  }, [form, typedName, signerTitle, disclosureRows]);

  function continueToReview() {
    if (!form.companyName.trim()) { setFormError("Enter your company's legal name."); return; }
    if (!form.officerName.trim()) { setFormError("Enter the certifying officer's name."); return; }
    setFormError("");
    render.mutate(
      { contractType: ContractType.REFERRAL_PROTECTION, fieldValues: fieldValues },
      { onSuccess: () => setStep("review") },
    );
  }

  function backToForm() {
    setStep("fill");
  }

  function focusAndScroll(ref: RefObject<HTMLElement>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (ref.current instanceof HTMLInputElement) ref.current.focus();
  }

  function submit() {
    if (!typedName.trim()) { setFormError("Type your full legal name in the signature block below."); focusAndScroll(nameInputRef); return; }
    if (!signerTitle.trim()) { setFormError("Enter your title in the signature block below."); focusAndScroll(titleInputRef); return; }
    if (!esignConsent) { setFormError("Check the E-SIGN consent box."); return; }
    const sigPad = sigPadRef.current;
    if (!sigPad?.hasSignature()) { setFormError("Draw your signature."); focusAndScroll(sigAnchorRef); return; }
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

  const blankDoc = preview?.document;
  const filledDoc = render.data?.document;
  const disclosureFields = preview?.fields.filter((f) => f.field_type === "disclosure_rows") ?? [];

  if (sign.data) {
    return (
      <div style={page()}>
        <div style={shell}>
          <BrandHeader />
          <h1 style={title()}>Agreement signed</h1>
          <p style={copy()}>
            Contract number <strong>{sign.data.contract_number}</strong> is on file for{" "}
            <strong>{form.companyName}</strong>. A copy has been recorded with your signature and timestamp, emailed
            to the address you provided, and is available to download below at any time.
          </p>
          {sign.data.certificate_download_url ? (
            <a href={sign.data.certificate_download_url} target="_blank" rel="noreferrer" style={{ ...primaryButton(), display: "inline-block", marginTop: 8, textDecoration: "none" }}>
              Download signed copy
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === "review") {
    const nonSignatureSections = (filledDoc?.sections ?? []).filter((s) => s.heading !== SIGNATURE_SECTION_HEADING);
    const signatureSection = (filledDoc?.sections ?? []).find((s) => s.heading === SIGNATURE_SECTION_HEADING);
    const preambleBlocks = filledDoc ? splitPreamble(filledDoc.preamble) : null;

    const nameComplete = typedName.trim().length > 0;
    const titleComplete = signerTitle.trim().length > 0;
    const sigComplete = sigDrawn;

    return (
      <main style={reviewPage()}>
        <div style={reviewShell}>
          <div style={{ flexShrink: 0 }}>
            <BrandHeader />
            <h1 style={title()}>Review your agreement</h1>
            <p style={copy()}>Check the filled agreement below reflects your information correctly, then sign at the bottom.</p>
            {render.data?.document_version ? <p style={versionLine()}>Version {render.data.document_version}</p> : null}
          </div>

          <div style={reviewBody}>
            <div style={docCardFull()}>
              <ZoomToolbar scale={docScale} onChange={setDocScale} />
              {!filledDoc || !preambleBlocks ? (
                <div style={muted()}>Rendering agreement…</div>
              ) : (
                <div style={{ ...docScrollFull, fontSize: `${16 * docScale}px` }}>
                  {filledDoc.party_facing_notice ? <p style={noticeBox()}>{filledDoc.party_facing_notice}</p> : null}

                  {preambleBlocks.titleLines.length > 0 ? (
                    <div style={coverTitleBlock()}>
                      {preambleBlocks.titleLines.map((p, i) => <div key={`t-${i}`}>{p}</div>)}
                    </div>
                  ) : null}

                  {preambleBlocks.partyLines.length > 0 ? (
                    <div style={partyBlock}>
                      {preambleBlocks.partyLines.map((p, i) => <div key={`pt-${i}`} style={partyLine(p)}>{p}</div>)}
                    </div>
                  ) : null}

                  {preambleBlocks.repeatedTitleLines.length > 0 ? (
                    <div style={repeatedTitleBlock()}>
                      {preambleBlocks.repeatedTitleLines.map((p, i) => <div key={`rt-${i}`}>{p}</div>)}
                    </div>
                  ) : null}

                  {preambleBlocks.bodyLines.map((p, i) => (p.trim() ? <p key={`pre-${i}`} style={docPara()}>{p}</p> : null))}

                  {nonSignatureSections.map((section, i) => (
                    <div key={i}>
                      <div style={docHeading()}>{section.heading}</div>
                      {section.paragraphs.map((p, j) => (<p key={j} style={docPara()}>{p}</p>))}
                      {section.rows ? <DocTable section={section} /> : null}
                    </div>
                  ))}

                  {signatureSection ? (
                    <SignatureBlock
                      section={signatureSection}
                      companyName={form.companyName}
                      effectiveDate={form.effectiveDate}
                      typedName={typedName}
                      onTypedNameChange={setTypedName}
                      signerTitle={signerTitle}
                      onSignerTitleChange={setSignerTitle}
                      nameInputRef={nameInputRef}
                      titleInputRef={titleInputRef}
                      sigAnchorRef={sigAnchorRef}
                      sigPadRef={sigPadRef}
                      onSignatureChange={setSigDrawn}
                    />
                  ) : null}
                </div>
              )}
            </div>

            <div style={signSidebar()}>
              <div style={checklistRow}>
                <ChecklistItem done={nameComplete} label="Name" onClick={() => focusAndScroll(nameInputRef)} />
                <ChecklistItem done={titleComplete} label="Title" onClick={() => focusAndScroll(titleInputRef)} />
                <ChecklistItem done={sigComplete} label="Signature" onClick={() => focusAndScroll(sigAnchorRef)} />
              </div>

              <label style={consentLabel()}>
                <input type="checkbox" checked={esignConsent} onChange={(e) => setEsignConsent(e.target.checked)} style={{ marginTop: 2 }} />
                I consent to use electronic records and signatures under the U.S. E-SIGN Act and UETA, and I agree to the
                terms above on behalf of the company identified. I understand I may request a paper copy of this signed
                agreement at any time by contacting support@qualifiedcommercial.com, and that I may withdraw consent to
                electronic records prospectively through that same address.
              </label>

              <div style={emailNotice()}>
                A copy of the signed agreement will be emailed to {form.noticeEmail.trim() || "the notice email you provided"}{" "}
                and will always be available to download from this page after signing.
              </div>

              {(formError || sign.error) ? (
                <div style={errorText()}>{formError || (sign.error instanceof Error ? sign.error.message : "Something went wrong.")}</div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <button type="button" onClick={backToForm} style={secondaryButton()}>Back to form</button>
                <button type="button" onClick={submit} disabled={sign.isPending || !filledDoc} style={{ ...primaryButton(), opacity: sign.isPending || !filledDoc ? 0.6 : 1 }}>
                  {sign.isPending ? "Submitting…" : "Sign & submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={page()}>
      <div style={shell}>
        <BrandHeader />
        <h1 style={title()}>{blankDoc?.title ?? "Loading agreement…"}</h1>
        {preview?.document_version ? <p style={versionLine()}>Version {preview.document_version}</p> : null}
        <p style={copy()}>Fill in your company's details below. On the next step you'll review the completed agreement before signing.</p>

        <div style={formCard()}>
          <SectionTitle>Your company</SectionTitle>
          <Field label="Company legal name" value={form.companyName} onChange={(v) => set("companyName", v)} />
          <Row>
            <Field label="Entity type (e.g. LLC, corporation)" value={form.companyEntityType} onChange={(v) => set("companyEntityType", v)} />
            <Field label="State of formation" value={form.companyStateOfFormation} onChange={(v) => set("companyStateOfFormation", v)} />
          </Row>
          <Field label="Principal place of business (address)" value={form.companyAddress} onChange={(v) => set("companyAddress", v)} />

          <SectionTitle>Notice contact</SectionTitle>
          <p style={hint()}>Where Qualified Commercial should send legal notices under this Agreement.</p>
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
          <p style={hint()}>The officer certifying Schedule A's disclosure of existing capital relationships on behalf of the company.</p>
          <Row>
            <Field label="Officer name" value={form.officerName} onChange={(v) => set("officerName", v)} />
            <Field label="Officer title" value={form.officerTitle} onChange={(v) => set("officerTitle", v)} />
          </Row>
          <Field label="Effective date" value={form.effectiveDate} onChange={(v) => set("effectiveDate", v)} type="date" />

          {disclosureFields.length > 0 ? (
            <>
              <SectionTitle>Existing capital relationships (Schedule A)</SectionTitle>
              <p style={hint()}>
                List every existing relationship your company has with a bank, lender, or other capital source, and
                any application currently pending, so it's excluded from this agreement's non-circumvention scope.
                Leave a table empty if nothing applies.
              </p>
              {disclosureFields.map((field) => (
                <div key={field.name} style={{ display: "grid", gap: 6 }}>
                  <div style={disclosureFieldLabel()}>{field.label}</div>
                  <DisclosureRowsEditor
                    columns={field.table_columns || []}
                    rows={disclosureRows[field.name] || []}
                    onChange={(rows) => setDisclosureRows((cur) => ({ ...cur, [field.name]: rows }))}
                    addLabel={DISCLOSURE_FIELD_ADD_LABEL[field.name] || "Row"}
                  />
                </div>
              ))}
            </>
          ) : null}

          {(formError || render.error) ? (
            <div style={errorText()}>{formError || (render.error instanceof Error ? render.error.message : "Something went wrong.")}</div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={continueToReview} disabled={render.isPending} style={{ ...primaryButton(), opacity: render.isPending ? 0.6 : 1 }}>
              {render.isPending ? "Preparing agreement…" : "Continue to review"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// Splits a document's preamble into structural blocks so the review page can
// give each a distinct visual weight instead of one flat paragraph list:
// the cover title (repeated multi-line ALL-CAPS heading), the party-identity
// block (both parties' names/entity lines + Effective Date, bounded by the
// literal "QUALIFIED COMMERCIAL LLC" line -- constant across every contract
// -- through the "Effective Date:" line), any immediately-following
// re-stated title lines (the source .docx's own page-break running header,
// kept per this session's "never silently drop content" precedent but
// de-emphasized rather than shown at full weight), and the actual recital
// prose.
function splitPreamble(preamble: string[]): {
  titleLines: string[];
  partyLines: string[];
  repeatedTitleLines: string[];
  bodyLines: string[];
} {
  const partyStartIdx = preamble.findIndex((p) => p.trim() === "QUALIFIED COMMERCIAL LLC");
  if (partyStartIdx === -1) {
    return { titleLines: [], partyLines: [], repeatedTitleLines: [], bodyLines: preamble };
  }
  const titleLines = preamble.slice(0, partyStartIdx);
  const effectiveDateIdx = preamble.findIndex((p, i) => i > partyStartIdx && p.trim().startsWith("Effective Date:"));
  const partyEndIdx = effectiveDateIdx === -1 ? partyStartIdx : effectiveDateIdx;
  const partyLines = preamble.slice(partyStartIdx, partyEndIdx + 1);
  const rest = preamble.slice(partyEndIdx + 1);
  let repeatedCount = 0;
  while (repeatedCount < rest.length && isAllCapsLine(rest[repeatedCount])) repeatedCount++;
  return { titleLines, partyLines, repeatedTitleLines: rest.slice(0, repeatedCount), bodyLines: rest.slice(repeatedCount) };
}

function isAllCapsLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && trimmed === trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase();
}

function partyLine(text: string): CSSProperties {
  if (text.trim() === "and") return { ...partyLineBase(), color: V.ink3, fontStyle: "italic" };
  if (text.trim() === "QUALIFIED COMMERCIAL LLC") return { ...partyLineBase(), fontWeight: 800, fontSize: 14 };
  return partyLineBase();
}

// Renders a static reference table (Schedule B fee schedules, Schedule C
// registry, Exhibit 1's Field/Detail rows) as an actual HTML table instead
// of the flat paragraph loop -- see ContractSection.columns/rows in
// useApi.ts. Schedule A's disclosure tables also render through here once
// filled server-side with the signer's submitted rows (or a "None
// disclosed" placeholder), same as any other table section.
function DocTable({ section }: { section: ContractSection }) {
  if (!section.rows) return null;
  return (
    <table style={docTable()}>
      {section.columns ? (
        <thead>
          <tr>
            {section.columns.map((c, i) => <th key={i} style={docTableHeadCell()}>{c}</th>)}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {section.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => <td key={j} style={docTableCell()}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Renders the document's real SIGNATURES/ACKNOWLEDGMENT section (see
// scripts/patch_signature_blocks.py) at the exact point it appears in the
// document flow, instead of a generic sign panel floating at the very
// bottom. Qualified Commercial's own By:/Name:/Title:/Date: lines render
// read-only (already-executed styling) with its standing signature image;
// the counterparty's Name/Title lines are live inline inputs, and the
// drawn-signature pad sits directly beneath the counterparty's "By:" line
// -- guided to the exact spot it's needed.
function SignatureBlock({ section,
  companyName,
  effectiveDate,
  typedName,
  onTypedNameChange,
  signerTitle,
  onSignerTitleChange,
  nameInputRef,
  titleInputRef,
  sigAnchorRef,
  sigPadRef,
  onSignatureChange,
}: {
  section: ContractSection;
  companyName: string;
  effectiveDate: string;
  typedName: string;
  onTypedNameChange: (v: string) => void;
  signerTitle: string;
  onSignerTitleChange: (v: string) => void;
  nameInputRef: RefObject<HTMLInputElement>;
  titleInputRef: RefObject<HTMLInputElement>;
  sigAnchorRef: RefObject<HTMLDivElement>;
  sigPadRef: RefObject<SignaturePadHandle>;
  onSignatureChange: (drawn: boolean) => void;
}) {
  const witnessLine = section.paragraphs[0];
  const qcLabel = section.paragraphs[1];
  const counterpartyLabel = companyName.trim() || section.paragraphs[6] || "Referral Partner";

  return (
    <div style={signatureSectionWrap}>
      <div style={docHeading()}>{section.heading}</div>
      <p style={docPara()}>{witnessLine}</p>

      <div style={signatureColumns}>
        <div style={signatureCard()}>
          <div style={signatureCardLabel()}>{qcLabel}</div>
          <div style={sigFieldRow}>
            <span style={sigFieldLabel()}>By:</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- static public asset, not a next/image candidate */}
            <img src="/qc-signature.png" alt="Jonathan Franco signature" style={qcSignatureImg} />
          </div>
          <SignatureFieldRow label="Name" value="Jonathan Franco" readOnly />
          <SignatureFieldRow label="Title" value="Executive Partner" readOnly />
          <SignatureFieldRow label="Date" value={effectiveDate || "—"} readOnly />
          <div style={executedPill()}>Already executed</div>
        </div>

        <div ref={sigAnchorRef} style={signatureCard()}>
          <div style={signatureCardLabel()}>{counterpartyLabel}</div>
          <SignatureFieldRow label="Name" inputRef={nameInputRef} value={typedName} onChange={onTypedNameChange} placeholder="Type your full legal name" />
          <SignatureFieldRow label="Title" inputRef={titleInputRef} value={signerTitle} onChange={onSignerTitleChange} placeholder="Your title (e.g. Managing Member)" />
          <SignatureFieldRow label="Date" value={effectiveDate || "—"} readOnly />
          <div style={{ marginTop: 10 }} onPointerUp={() => onSignatureChange(!!sigPadRef.current?.hasSignature())}>
            <div style={sigLabel()}>Draw your signature</div>
            <SignaturePad ref={sigPadRef} />
            <button
              type="button"
              onClick={() => { sigPadRef.current?.clear(); onSignatureChange(false); }}
              style={clearButton()}
            >
              Clear signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignatureFieldRow({ label,
  value,
  onChange,
  readOnly,
  placeholder,
  inputRef,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  return (
    <div style={sigFieldRow}>
      <span style={sigFieldLabel()}>{label}:</span>
      {readOnly ? (
        <span style={sigFieldReadOnly()}>{value}</span>
      ) : (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          style={sigFieldInput()}
        />
      )}
    </div>
  );
}

function ChecklistItem({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...checklistItem(), borderColor: done ? V.petrol : V.line }}>
      <span style={{ ...checklistDot(), background: done ? V.petrol : "transparent", borderColor: done ? V.petrol : V.ink3 }}>
        {done ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

// In-app document-scale control ("−  100%  +") -- drives the review pane's
// fontSize directly (real text scaling via em-derived styles below, not a
// CSS transform: scale() hack), so the document reflows correctly and
// zooming doesn't shrink/clip the usable reading area the way relying on
// browser/OS zoom did.
function ZoomToolbar({ scale, onChange }: { scale: number; onChange: (s: number) => void }) {
  return (
    <div style={zoomToolbar()}>
      <button type="button" onClick={() => onChange(Math.max(0.85, Math.round((scale - 0.05) * 100) / 100))} style={zoomButton()} aria-label="Decrease text size">
        −
      </button>
      <span style={zoomLabel()}>{Math.round(scale * 100)}%</span>
      <button type="button" onClick={() => onChange(Math.min(1.4, Math.round((scale + 0.05) * 100) / 100))} style={zoomButton()} aria-label="Increase text size">
        +
      </button>
    </div>
  );
}

function BrandHeader() {
  // The light/system/dark cycler that used to sit on the right of this header
  // is gone. Dark mode was removed when the app moved onto the Capital OS
  // sheet, which left `setPreference` a no-op — so the button rendered, took a
  // click, changed the icon to nothing and changed the theme to nothing. A
  // control that does nothing is worse than no control anywhere; on a page a
  // counterparty is being asked to SIGN A LEGAL AGREEMENT on, it is worse
  // still.
  return (
    <div style={brandHeader}>
      <QCMark size={34} />
      <div style={{ flex: 1 }}>
        <div style={brand()}>Qualified Commercial</div>
        <div style={brandName()}>
          <Link href="/agreement" style={{ color: "inherit", textDecoration: "none" }}>Agreement Portal</Link>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={sectionTitle()}>{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={row}>{children}</div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={fieldWrap}>
      <div style={fieldLabel()}>{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={input()} />
    </label>
  );
}

// --- Theme-aware styles ---
// This page is a public unauthenticated portal, but still lives inside the
// app's ThemeProvider (see providers.tsx), so every color here is a
// function of the active theme's tokens (V.bg/V.ink/V.line/etc. -- see
// design-system/tokens.ts) rather than a hardcoded hex value, matching the
// pattern already used by PlatformAccessGate.tsx and LegalDocumentView.tsx.

// Was the theme object handed down by useTheme(). The palette is now a
// module constant of CSS variables, so this alias points at that.
type Theme = CssVars;

const page = (): CSSProperties => ({ minHeight: "100vh", background: V.bg, color: V.ink, padding: 24, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" });
const shell: CSSProperties = { maxWidth: 760, margin: "6vh auto 60px", display: "grid", gap: 18 };
// Full-viewport layout for the review step: the page itself is exactly the
// viewport height with no outer scroll, and the shell is a flex column
// (min-height:0 required so the inner reading pane can actually shrink/
// scroll instead of pushing the page taller) so the long document scrolls
// WITHIN a bounded area that fills the desktop window. reviewBody splits
// into a wide reading pane + a narrower sticky sign sidebar on desktop
// widths (see signSidebar's media query below), collapsing to a stacked
// column on narrow viewports.
const reviewPage = (): CSSProperties => ({ ...page(), height: "100vh", minHeight: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" });
const reviewShell: CSSProperties = { maxWidth: "min(1600px, 97vw)", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 14, flex: 1, minHeight: 0, paddingBottom: 16 };
const reviewBody: CSSProperties = { display: "flex", gap: 16, flex: 1, minHeight: 0, flexWrap: "wrap" };
const brandHeader: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const brand = (): CSSProperties => ({ color: V.petrol, fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" });
const brandName = (): CSSProperties => ({ color: V.ink, fontSize: 15, fontWeight: 900, lineHeight: 1.2 });
const themeToggleButton = (): CSSProperties => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 999, border: `1px solid ${V.line}`, background: V.surface2, color: V.ink2, cursor: "pointer" });
const title = (): CSSProperties => ({ margin: "8px 0 0", fontSize: 24, lineHeight: 1.2, color: V.ink });
const versionLine = (): CSSProperties => ({ margin: "4px 0 0", color: V.ink3, fontSize: 12.5 });
// Wider, flatter "reading pane" -- no boxed card treatment, just a page-
// like surface, so the document reads like a real document rather than a
// narrow column stretched onto a monitor.
const docCardFull = (): CSSProperties => ({ border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, flex: "3 1 620px", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", padding: "16px clamp(16px, 4vw, 56px)" });
const docScrollFull: CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gap: "0.7em", paddingRight: 6 };
const signSidebar = (): CSSProperties => ({ flex: "1 1 300px", minWidth: 280, maxWidth: 420, display: "grid", gap: 12, alignContent: "start", border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface2, padding: 18, position: "sticky", top: 0, maxHeight: "100%", overflowY: "auto" });
const noticeBox = (): CSSProperties => ({ margin: "0 0 1em", color: V.warn, fontSize: "0.85em", lineHeight: 1.5, fontWeight: 700, border: `1px solid ${V.warn}`, borderRadius: 8, padding: "0.7em 0.8em", background: V.warnBg });
const docHeading = (): CSSProperties => ({ fontWeight: 900, fontSize: "0.95em", color: V.ink, marginTop: "1.5em", marginBottom: "0.5em", letterSpacing: 0.3, borderBottom: `1px solid ${V.line}`, paddingBottom: "0.4em" });
const docPara = (): CSSProperties => ({ margin: "0 0 0.5em", color: V.ink2, fontSize: "0.85em", lineHeight: 1.6 });
const muted = (): CSSProperties => ({ color: V.ink3, fontSize: 13 });
const formCard = (): CSSProperties => ({ border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18, display: "grid", gap: 12 });
const sectionTitle = (): CSSProperties => ({ fontSize: 13, fontWeight: 800, color: V.petrol, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 });
const disclosureFieldLabel = (): CSSProperties => ({ fontSize: 12.5, fontWeight: 700, color: V.ink, marginTop: 4 });
const hint = (): CSSProperties => ({ margin: "-4px 0 4px", color: V.ink3, fontSize: 12, lineHeight: 1.4 });
const row: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 10 };
const fieldWrap: CSSProperties = { display: "block" };
const fieldLabel = (): CSSProperties => ({ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: V.ink3, marginBottom: 4 });
const input = (): CSSProperties => ({ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${V.line}`, background: V.surface2, color: V.ink, fontSize: 13, outline: "none" });
const consentLabel = (): CSSProperties => ({ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: V.ink2, cursor: "pointer", lineHeight: 1.45 });
const emailNotice = (): CSSProperties => ({ fontSize: 12, color: V.ink3, lineHeight: 1.45, border: `1px solid ${V.line}`, borderRadius: 8, padding: "8px 10px", background: V.surface });
const sigLabel = (): CSSProperties => ({ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: V.ink3, marginBottom: 6 });
const clearButton = (): CSSProperties => ({ marginTop: 8, fontSize: 12, background: "none", border: `1px solid ${V.line}`, color: V.ink2, borderRadius: 8, padding: "6px 10px", cursor: "pointer" });
const errorText = (): CSSProperties => ({ color: V.danger, fontSize: 12.5 });
const copy = (): CSSProperties => ({ color: V.ink2, fontSize: 14, lineHeight: 1.6 });
const primaryButton = (): CSSProperties => ({ height: 44, border: "none", borderRadius: 999, padding: "0 18px", font: "inherit", fontWeight: 900, background: V.gold, color: V.inverse, cursor: "pointer" });
const secondaryButton = (): CSSProperties => ({ height: 44, border: `1px solid ${V.line}`, borderRadius: 999, padding: "0 18px", font: "inherit", fontWeight: 700, background: "none", color: V.ink2, cursor: "pointer" });

// Document visual hierarchy styles
const coverTitleBlock = (): CSSProperties => ({ textAlign: "center", fontWeight: 900, fontSize: "1.4em", lineHeight: 1.3, color: V.ink, letterSpacing: 0.4, margin: "0.3em 0 1.2em" });
const partyBlock: CSSProperties = { textAlign: "center", margin: "0 0 1.2em", display: "grid", gap: 3 };
const partyLineBase = (): CSSProperties => ({ fontSize: "0.9em", color: V.ink2, lineHeight: 1.45 });
const repeatedTitleBlock = (): CSSProperties => ({ textAlign: "center", fontWeight: 700, fontSize: "0.8em", lineHeight: 1.4, color: V.ink3, margin: "0 0 1em", opacity: 0.75 });

// Table rendering (fee schedules, registries, Exhibit 1, Schedule A)
const docTable = (): CSSProperties => ({ width: "100%", borderCollapse: "collapse", margin: "0.4em 0 1em", fontSize: "0.82em" });
const docTableHeadCell = (): CSSProperties => ({ textAlign: "left", padding: "0.5em 0.6em", background: V.surface2, color: V.ink, fontWeight: 800, border: `1px solid ${V.line}` });
const docTableCell = (): CSSProperties => ({ padding: "0.5em 0.6em", color: V.ink2, border: `1px solid ${V.line}`, verticalAlign: "top" });

// SignatureBlock styles
const signatureSectionWrap: CSSProperties = { marginTop: "1.6em" };
const signatureColumns: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: "0.8em" };
const signatureCard = (): CSSProperties => ({ border: `1px solid ${V.lineStrong}`, borderRadius: 12, padding: 16, background: V.surface2 });
const signatureCardLabel = (): CSSProperties => ({ fontWeight: 800, fontSize: "0.85em", color: V.ink, marginBottom: 10 });
const sigFieldRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 };
const sigFieldLabel = (): CSSProperties => ({ fontSize: "0.78em", fontWeight: 700, color: V.ink3, minWidth: 36 });
const sigFieldReadOnly = (): CSSProperties => ({ fontSize: "0.85em", color: V.ink2, borderBottom: `1px solid ${V.line}`, flex: 1, paddingBottom: 2 });
const sigFieldInput = (): CSSProperties => ({ fontSize: "0.85em", color: V.ink, background: "transparent", border: "none", borderBottom: `1px solid ${V.petrol}`, flex: 1, paddingBottom: 2, outline: "none", font: "inherit" });
const qcSignatureImg: CSSProperties = { height: 30, objectFit: "contain", flex: 1 };
const executedPill = (): CSSProperties => ({ marginTop: 10, display: "inline-block", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: V.petrol, background: V.petrolSoft, borderRadius: 999, padding: "4px 10px" });
const checklistRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const checklistItem = (): CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: V.ink2, background: "none", border: `1px solid ${V.line}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer" });
const checklistDot = (): CSSProperties => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", border: `1px solid ${V.ink3}`, fontSize: 10, color: V.inverse });

// Zoom toolbar
const zoomToolbar = (): CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-end", marginBottom: 6, position: "sticky", top: 0, background: V.surface, paddingBottom: 6, zIndex: 1 });
const zoomButton = (): CSSProperties => ({ width: 26, height: 26, borderRadius: 8, border: `1px solid ${V.line}`, background: V.surface2, color: V.ink2, fontSize: 15, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" });
const zoomLabel = (): CSSProperties => ({ fontSize: 11.5, fontWeight: 700, color: V.ink3, minWidth: 34, textAlign: "center" });
