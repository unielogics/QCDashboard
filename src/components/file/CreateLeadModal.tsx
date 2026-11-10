"use client";

import { Spinner } from "./LeadDetailPanel";
import { useRef, useState } from "react";
import { Btn, Callout, cx, Field, IconBtn, Input, Select, StatusLine } from "@/components/ds";
import { Drawer, DrawerSteps } from "@/components/ds/Drawer";
import { AddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import { LENDING_INTENTS, MAIN_STREET_INTENTS } from "@/lib/intakeIndustries";
import { emptyBusinessProfile, newBusinessProfileBody, newBusinessProfileProblem } from "@/lib/businessProfile";
import { BusinessProfileFields } from "@/components/intake/BusinessProfileFields";
import { Icon } from "@/components/design-system/Icon";
import { validPhone } from "@/lib/formCoerce";
import { CreateLeadPayload, LeadDetail, LeadVariant, formatSize } from "./leadFile";

export type LeadCreationClient = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  business_name?: string | null;
  language?: string | null;
};

export function CreateLeadModal({
  onClose,
  onCreate,
  creating,
  createError,
  onOpen,
  initialVariant = "dealer",
  sourceClient,
}: {
  onClose: () => void;
  onCreate: (payload: CreateLeadPayload, evidenceFiles: File[]) => Promise<LeadDetail | undefined>;
  creating: boolean;
  createError?: string;
  onOpen: (id: string) => void;
  initialVariant?: LeadVariant;
  sourceClient?: LeadCreationClient;
}) {
  const [completion, setCompletion] = useState<"client" | "operator">("client");
  const [variant, setVariant] = useState<LeadVariant>(initialVariant);
  const [businessProfile, setBusinessProfile] = useState(emptyBusinessProfile);
  const [intent, setIntent] = useState<string>("working_capital");
  const [fullName, setFullName] = useState(sourceClient?.name ?? "");
  const [email, setEmail] = useState(sourceClient?.email ?? "");
  const [phone, setPhone] = useState(sourceClient?.phone ?? "");
  const [businessName, setBusinessName] = useState(sourceClient?.business_name ?? "");
  const [investorName, setInvestorName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [propertyValue, setPropertyValue] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [creditTier, setCreditTier] = useState("");
  const [emailInvite, setEmailInvite] = useState(!sourceClient || Boolean(sourceClient.email));
  const [smsInvite, setSmsInvite] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "es">(sourceClient?.language === "es" ? "es" : "en");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [roomPin, setRoomPin] = useState("");
  const [roomPinConfirm, setRoomPinConfirm] = useState("");
  const [created, setCreated] = useState<LeadDetail | null>(null);
  const [copied, setCopied] = useState("");
  const submitting = useRef(false);
  const evidencePicker = useRef<HTMLInputElement>(null);

  const isRE = variant === "real_estate";
  const isMS = variant === "main_street";
  const isMcaFunding = variant === "mca_funding";
  const clientCompletes = completion === "client";
  const steps = clientCompletes ? ["File type", "Client and invite", "Review"] : ["File type", "Client and entity", "Evidence", "Review"];
  const reviewStep = steps.length;
  const typeLabel = ({ dealer: "Dealer", real_estate: "Real estate", main_street: "Main Street", mca_funding: "MCA funding", mca_refinance: "MCA refinance" } as const)[variant];
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  function contactError() {
    if (!fullName.trim()) return "Client name is required.";
    if ((!clientCompletes || emailInvite) && !email.trim()) return clientCompletes ? "A valid client email is required for the email invitation." : "A valid client email is required.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid client email address.";
    if ((!clientCompletes || smsInvite) && !phone.trim()) return clientCompletes ? "Enter a mobile number for the SMS invitation." : "A client mobile number is required.";
    if (phone.trim() && !validPhone(phone)) return "That number does not look complete. Enter a 10-digit US mobile, or include the country code for an international number.";
    if (!clientCompletes && !isRE && !businessName.trim()) return "Legal business name is required.";
    if (!clientCompletes) return newBusinessProfileProblem(businessProfile) || "";
    return "";
  }

  async function submit() {
    if (submitting.current || creating) return;
    const validation = contactError();
    if (validation) { setError(validation); setStep(2); return; }
    setError("");
    submitting.current = true;
    try {
      const shared = {
        variant: isMcaFunding ? "main_street" as const : variant,
        client_id: sourceClient?.id,
        invitation_channels: [...(emailInvite ? ["email" as const] : []), ...(smsInvite ? ["sms" as const] : [])],
        full_name: fullName.trim(),
        business_name: isRE ? undefined : (businessName.trim() || undefined),
        investor_name: isRE ? (investorName.trim() || undefined) : undefined,
        target_property_address: isRE ? (propertyAddress.trim() || undefined) : undefined,
        transaction_type: isRE ? (transactionType.trim() || undefined) : undefined,
        requested_amount: isRE ? num(requestedAmount) : undefined,
        estimated_value_or_purchase_price: isRE ? num(propertyValue) : undefined,
        monthly_rent: isRE ? num(monthlyRent) : undefined,
        estimated_credit_tier: isRE ? (creditTier.trim() || undefined) : undefined,
        intent: isMcaFunding ? "merchant_cash_advance" : isMS && !clientCompletes ? intent : undefined,
        notify_client: false,
        preferred_language: preferredLanguage,
        secure_room_pin: roomPin,
      };
      const payload: CreateLeadPayload = clientCompletes
        ? { ...shared, application_completion: "client", email: email.trim() || undefined, phone: phone.trim() || undefined }
        : { ...shared, ...newBusinessProfileBody(businessProfile), application_completion: "operator", email: email.trim(), phone: phone.trim() };
      const result = await onCreate(payload, clientCompletes ? [] : evidenceFiles);
      if (result) setCreated(result);
    } finally {
      submitting.current = false;
    }
  }

  function next() {
    if (step === 1) {
      if (!clientCompletes && variant === "main_street" && !intent) { setError("Choose a funding need."); return; }
      if (!/^\d{6}$/.test(roomPin)) { setError("Create a six-digit room PIN."); return; }
      if (roomPin !== roomPinConfirm) { setError("The room PIN entries do not match."); return; }
      setError(""); setStep(2); return;
    }
    if (step === 2) {
      const validation = contactError();
      if (validation) { setError(validation); return; }
      setError(""); setStep(3); return;
    }
    if (step < reviewStep) { setError(""); setStep(step + 1); return; }
    void submit();
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${label} copied.`);
    } catch {
      setCopied(`Could not copy ${label.toLowerCase()}. Select and copy it below.`);
    }
  }

  if (created) {
    const roomUrl = created.upload_url || "";
    const sent = created.room_delivery_status === "sent";
    return (
      <Drawer
        open
        onClose={onClose}
        width="md"
        title="Application invitation ready"
        sub="The file is saved. The client can use this link to complete the application."
        footer={<><Btn onClick={onClose}>Done</Btn><span className="sp" /><Btn variant="pri" onClick={() => onOpen(created.intake.id)}>Open file</Btn></>}
      >
        <div className="grid g12">
          <Callout tone={sent ? "ok" : created.room_delivery_status === "failed" ? "bad" : created.room_delivery_status === "partial" ? "warn" : "acc"} icon={<Icon name={sent ? "check" : "link"} size={16} />}>
            {created.room_delivery_detail || (sent ? "The invitation was accepted by the delivery provider." : "The link was created without sending. Copy it to share with the client.")}
          </Callout>
          {created.room_deliveries?.map((receipt) => <div className="line" key={receipt.id}><div><b>{receipt.channel.toUpperCase()}{receipt.recipient_masked ? ` · ${receipt.recipient_masked}` : ""}</b><div className="sub">{receipt.detail || receipt.status}</div></div><span>{receipt.provider_accepted ? "Accepted by provider" : receipt.status}</span></div>)}
          {created.creation_warning ? <Callout tone="warn">{created.creation_warning}</Callout> : null}
          <div className="secure-room-created-grid">
            <div><span className="lbl">Direct application link</span><Input aria-label="Direct application link" readOnly value={roomUrl} onFocus={(event) => event.target.select()} /><Btn disabled={!roomUrl} onClick={() => void copy(roomUrl, "Link")}><Icon name="copy" size={14} />Copy link</Btn></div>
            <div><span className="lbl">Room PIN</span><b className="secure-room-pin num">{roomPin}</b><Btn onClick={() => void copy(roomPin, "PIN")}><Icon name="copy" size={14} />Copy PIN</Btn></div>
          </div>
          {copied ? <div role="status">{copied}</div> : null}
          <Callout tone="warn">Share the PIN separately from the application link. The client will need both to open the application.</Callout>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open
      onClose={() => { if (!creating && !submitting.current) onClose(); }}
      closeOnBackdrop={!creating}
      width="md"
      title={`New file · ${steps[step - 1]}`}
      ariaLabel="New file"
      bodyClass="grid g10"
      footer={
        <>
          {step > 1 ? <Btn onClick={() => { setError(""); setStep((value) => value - 1); }} disabled={creating}>Back</Btn> : <Btn onClick={onClose} disabled={creating}>Cancel</Btn>}
          <span className="sp" />
          <Btn variant="pri" onClick={next} disabled={creating}>
            {creating ? <><Spinner /> Creating file…</> : step === reviewStep ? (emailInvite || smsInvite ? "Create file and send invite" : "Create file and get link") : "Continue"}
          </Btn>
        </>
      }
    >
      <DrawerSteps steps={steps} current={step} />
      {step === 1 ? <>
        <div role="radiogroup" aria-label="Application completion" className="grid g10">
          <label className={cx("pick", clientCompletes && "on")}><input type="radio" name="application-completion" checked={clientCompletes} onChange={() => { setCompletion("client"); setEmailInvite(true); setSmsInvite(false); }} />Invite client to complete</label>
          <label className={cx("pick", !clientCompletes && "on")}><input type="radio" name="application-completion" checked={!clientCompletes} onChange={() => { setCompletion("operator"); setEmailInvite(false); setSmsInvite(false); }} />Complete with staff</label>
        </div>
        <p className="sub">Choose the application type. {clientCompletes ? "Create the file with basic contact details and let the client complete the rest." : "Enter the client details and add any initial evidence before creating the file."}</p>
        <div className="fldgrid two"><Field label="File type"><Select aria-label="File type" value={variant} disabled={Boolean(sourceClient)} onChange={(e) => setVariant(e.target.value as LeadVariant)}><option value="dealer">Dealer</option><option value="real_estate">Real estate</option><option value="main_street">Main Street (operating business)</option><option value="mca_funding">MCA funding</option><option value="mca_refinance">MCA refinance</option></Select></Field><Field label="Preferred language"><Select aria-label="Preferred language" value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value as "en" | "es")}><option value="en">English</option><option value="es">Spanish</option></Select></Field></div>
      {isMcaFunding ? <Callout tone="acc">MCA funding · 1.22–1.38× factor. Collect six months of bank statements, a debt schedule, and last year&apos;s business tax return. Staff review confirms no more than two existing MCAs, no modified MCA, and nonnegative reported ordinary business income before addbacks.</Callout> : null}
      {isMS && !clientCompletes ? (
        <div className="fldgrid two">
          <Field label="What they need *">
            <Select value={intent} onChange={(e) => setIntent(e.target.value)}>
              {MAIN_STREET_INTENTS.map((i) => (
                <option key={i.slug} value={i.slug}>{i.label}</option>
              ))}
            </Select>
          </Field>
          <p className="sub" style={{ gridColumn: "1 / -1" }}>
            {LENDING_INTENTS.has(intent)
              ? "These decide the document checklist and which programs get screened, so they are worth getting right at creation."
              : "This is a qualification conversation, not a loan file — no documents will be requested and no fundability verdict is computed."}
          </p>
        </div>
      ) : null}</> : null}
      {step === 1 ? <div className="fldgrid two">
        <Field label="Six-digit room PIN *"><Input aria-label="Six-digit room PIN" value={roomPin} onChange={(event) => setRoomPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="000000" /></Field>
        <Field label="Confirm room PIN *"><Input aria-label="Confirm room PIN" value={roomPinConfirm} onChange={(event) => setRoomPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="000000" /></Field>
        <p className="sub" style={{ gridColumn: "1 / -1" }}>The client enters this PIN in the application room. It cannot be recovered after creation; staff can rotate it later.</p>
      </div> : null}

      {step === 2 ? <>
        <p className="sub">{clientCompletes ? "Enter the client's name and choose how to share the invitation. Business details and evidence can be completed by the client." : "Enter the client and legal entity details."}</p>
        {clientCompletes ? <div className="grid g10" role="group" aria-label="Invitation delivery">
          <label className={cx("pick", emailInvite && "on")}><input type="checkbox" checked={emailInvite} onChange={(event) => setEmailInvite(event.target.checked)} />Email invitation</label>
          <label className={cx("pick", smsInvite && "on")}><input type="checkbox" checked={smsInvite} onChange={(event) => setSmsInvite(event.target.checked)} />SMS invitation</label>
          {smsInvite ? <span className="sub">Text invitations require the client's recorded SMS consent.</span> : null}
          <span className="sub">{emailInvite || smsInvite ? "The selected messages include the application link. A direct link will also be available to copy." : "Link only: no message will be sent. Copy the direct link after creating the file."}</span>
        </div> : null}
        <div className="fldgrid two"><Field label="Client full name *"><Input aria-label="Client full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" /></Field><Field label={`Personal email${!clientCompletes || emailInvite ? " *" : " (optional)"}`}><Input aria-label="Personal email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" /></Field><Field label={`Personal mobile${!clientCompletes || smsInvite ? " *" : " (optional)"}`}><Input aria-label="Personal mobile" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(973) 555-0148" /></Field>{!isRE ? <Field label={`Legal business name${clientCompletes ? " (optional)" : " *"}`}><Input aria-label="Legal business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business LLC" /></Field> : <Field label="Investor / entity name (optional)"><Input aria-label="Investor / entity name" value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="Holdings LLC" /></Field>}</div>
        {!clientCompletes ? <BusinessProfileFields value={businessProfile} onChange={(patch) => setBusinessProfile((current) => ({ ...current, ...patch }))} disabled={creating} /> : null}
      </> : null}

      {step === 3 && !clientCompletes && isRE ? (
        <div className="fldgrid two">
          <div style={{ gridColumn: "1 / -1" }}>
            <AddressInput
              label="Target property address"
              value={propertyAddress ? { full: propertyAddress } : null}
              onChange={(next) => setPropertyAddress(formatAddressParts(next))}
            />
          </div>
          <Field label="Transaction type">
            <Input value={transactionType} onChange={(e) => setTransactionType(e.target.value)} placeholder="purchase / refinance / cash-out" />
          </Field>
          <Field label="Estimated credit tier">
            <Input value={creditTier} onChange={(e) => setCreditTier(e.target.value)} placeholder="e.g. 700+" />
          </Field>
          <Field label="Requested amount ($)">
            <Input value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} inputMode="numeric" placeholder="500000" />
          </Field>
          <Field label="Property value / price ($)">
            <Input value={propertyValue} onChange={(e) => setPropertyValue(e.target.value)} inputMode="numeric" placeholder="800000" />
          </Field>
          <Field label="Monthly rent ($)">
            <Input value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} inputMode="numeric" placeholder="4500" />
          </Field>
        </div>
      ) : null}
      {step === 3 && !clientCompletes ? <>
        <input ref={evidencePicker} type="file" hidden multiple accept=".pdf,.csv,.xlsx,.xls,.zip,image/*" onChange={(event) => setEvidenceFiles(Array.from(event.target.files ?? []))} />
        <button type="button" className={cx("create-evidence-dropzone", dragging && "dragging")} onClick={() => evidencePicker.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setEvidenceFiles((rows) => [...rows, ...Array.from(event.dataTransfer.files)]); }}><Icon name="upload" size={24} /><b>Drop initial evidence here or click to browse</b><span>Upload multiple files or a ZIP. The draft opens immediately after creation while extraction continues in the background.</span></button>
        {evidenceFiles.length ? <div className="create-evidence-files">{evidenceFiles.map((file, index) => <div key={`${file.name}-${file.size}-${index}`}><Icon name="file" size={14} /><span className="grow trunc"><b className="trunc">{file.name}</b><small>{formatSize(file.size)}</small></span><IconBtn aria-label={`Remove ${file.name}`} title="Remove file" onClick={() => setEvidenceFiles((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={13} /></IconBtn></div>)}</div> : <Callout tone="mut">Evidence is optional during creation and can be uploaded later from the file header.</Callout>}
      </> : null}
      {step === reviewStep ? <>
        <div className="create-intake-review"><div><span>File type</span><b>{typeLabel}</b></div><div><span>Client</span><b>{fullName}</b></div><div><span>Entity</span><b>{isRE ? investorName || "Client will complete" : businessName || "Client will complete"}</b></div><div><span>Email</span><b>{email || "Client will complete"}</b></div><div><span>Mobile</span><b>{phone || "Client will complete"}</b></div><div><span>Invitation</span><b>{[emailInvite && "Email", smsInvite && "SMS"].filter(Boolean).join(" + ") || "Direct link only"}</b></div></div>
        <Callout tone="acc" icon={<Icon name="arrowR" size={16} />}>{clientCompletes ? "The client can complete the remaining application, ownership details, and documents in the secure application room. You can follow their progress from this file." : "The file opens at Step 1 for ownership. Uploaded evidence is analyzed in the background."} A direct application link is available after creation.</Callout>
        {!clientCompletes ? <>
          <div className="line"><span className="sub">Initial evidence</span><strong>{evidenceFiles.length ? `${evidenceFiles.length} file${evidenceFiles.length === 1 ? "" : "s"}` : "None yet"}</strong></div>
          <label className={cx("pick", emailInvite && "on")}><input type="checkbox" checked={emailInvite} onChange={(event) => setEmailInvite(event.target.checked)} />Email invitation</label>
          <label className={cx("pick", smsInvite && "on")}><input type="checkbox" checked={smsInvite} onChange={(event) => setSmsInvite(event.target.checked)} />SMS invitation</label>
        </> : null}
        <p className="sub">Share the six-digit room PIN separately from the link.</p>
      </> : null}

      {error || createError ? <StatusLine tone="bad">{error || createError}</StatusLine> : null}
    </Drawer>
  );
}
