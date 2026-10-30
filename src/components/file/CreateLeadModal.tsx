"use client";

import { Spinner } from "./LeadDetailPanel";
import { useRef, useState } from "react";
import { Btn, Callout, cx, Field, IconBtn, Input, Select, StatusLine } from "@/components/ds";
import { Drawer, DrawerSteps } from "@/components/ds/Drawer";
import { AddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import { LENDING_INTENTS, MAIN_STREET_INDUSTRIES, MAIN_STREET_INTENTS } from "@/lib/intakeIndustries";
import { Icon } from "@/components/design-system/Icon";
import { validPhone } from "@/lib/formCoerce";
import { CreateLeadPayload, LeadDetail, LeadVariant, formatSize, variantLabel } from "./leadFile";

export function CreateLeadModal({
  onClose,
  onCreate,
  creating,
}: {
  onClose: () => void;
  onCreate: (payload: CreateLeadPayload, evidenceFiles: File[]) => Promise<LeadDetail | undefined>;
  creating: boolean;
}) {
  const [variant, setVariant] = useState<LeadVariant>("dealer");
  const [industry, setIndustry] = useState<string>("other");
  const [intent, setIntent] = useState<string>("working_capital");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [investorName, setInvestorName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [propertyValue, setPropertyValue] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [creditTier, setCreditTier] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "es">("en");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [roomPin, setRoomPin] = useState("");
  const [roomPinConfirm, setRoomPinConfirm] = useState("");
  const [created, setCreated] = useState<LeadDetail | null>(null);
  const evidencePicker = useRef<HTMLInputElement>(null);

  const isRE = variant === "real_estate";
  const isMS = variant === "main_street";
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  async function submit() {
    if (!fullName.trim()) { setError("Client name is required."); return; }
    if (!email.trim() || !email.includes("@")) { setError("A valid client email is required."); return; }
    if (!phone.trim()) { setError("A client mobile number is required."); return; }
    if (!validPhone(phone)) { setError("That number does not look complete. Enter a 10-digit US mobile, or include the country code for an international number."); return; }
    setError("");
    const result = await onCreate({
      variant,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      business_name: isRE ? undefined : (businessName.trim() || undefined),
      investor_name: isRE ? (investorName.trim() || undefined) : undefined,
      target_property_address: isRE ? (propertyAddress.trim() || undefined) : undefined,
      transaction_type: isRE ? (transactionType.trim() || undefined) : undefined,
      requested_amount: isRE ? num(requestedAmount) : undefined,
      estimated_value_or_purchase_price: isRE ? num(propertyValue) : undefined,
      monthly_rent: isRE ? num(monthlyRent) : undefined,
      estimated_credit_tier: isRE ? (creditTier.trim() || undefined) : undefined,
      industry: isMS ? industry : undefined,
      intent: isMS ? intent : undefined,
      notify_client: notifyClient,
      preferred_language: preferredLanguage,
      secure_room_pin: roomPin,
    }, evidenceFiles);
    if (result) setCreated(result);
  }

  function next() {
    if (step === 1) {
      if (variant === "main_street" && (!industry || !intent)) { setError("Choose an industry and funding need."); return; }
      if (!/^\d{6}$/.test(roomPin)) { setError("Create a six-digit room PIN."); return; }
      if (roomPin !== roomPinConfirm) { setError("The room PIN entries do not match."); return; }
      setError(""); setStep(2); return;
    }
    if (step === 2) {
      if (!fullName.trim()) { setError("Client name is required."); return; }
      if (!email.trim() || !email.includes("@")) { setError("A valid client email is required."); return; }
      if (!phone.trim()) { setError("A client mobile number is required."); return; }
      if (!validPhone(phone)) { setError("That number does not look complete. Enter a 10-digit US mobile, or include the country code for an international number."); return; }
      if (!isRE && !businessName.trim()) { setError("Legal business name is required."); return; }
      setError(""); setStep(3); return;
    }
    if (step === 3) { setError(""); setStep(4); return; }
    void submit();
  }

  if (created) {
    const roomUrl = created.upload_url || "";
    const sent = created.room_delivery_status === "sent";
    return (
      <Drawer
        open
        onClose={onClose}
        width="md"
        title="Application room created"
        sub="The intake is open at Step 1. Share the room link and PIN through separate channels."
        footer={<><span className="sp" /><Btn variant="pri" onClick={onClose}>Continue to Step 1</Btn></>}
      >
        <div className="grid g12">
          <Callout tone={sent ? "ok" : created.room_delivery_status === "failed" ? "bad" : "acc"} icon={<Icon name={sent ? "check" : "alert"} size={16} />}>
            {created.room_delivery_detail || (sent ? "The room link was accepted by the email provider." : "The room was created without sending.")}
          </Callout>
          <div className="secure-room-created-grid">
            <div><span className="lbl">Room URL</span><b className="trunc">{roomUrl || "Unavailable"}</b><Btn disabled={!roomUrl} onClick={() => void navigator.clipboard.writeText(roomUrl)}><Icon name="copy" size={14} />Copy link</Btn></div>
            <div><span className="lbl">Room PIN</span><b className="secure-room-pin num">{roomPin}</b><Btn onClick={() => void navigator.clipboard.writeText(roomPin)}><Icon name="copy" size={14} />Copy PIN</Btn></div>
          </div>
          <Callout tone="warn">Do not place the PIN in the room-link email. Read it to the client or send it separately through an approved channel.</Callout>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={`Create AI intake · ${step === 1 ? "File type" : step === 2 ? "Client and entity" : step === 3 ? "Evidence" : "Review"}`}
      bodyClass="grid g10"
      footer={
        <>
          {step > 1 ? <Btn onClick={() => { setError(""); setStep((value) => value - 1); }} disabled={creating}>Back</Btn> : <Btn onClick={onClose} disabled={creating}>Cancel</Btn>}
          <span className="sp" />
          <Btn variant="pri" onClick={next} disabled={creating}>
            {creating ? <><Spinner /> Creating draft and uploading…</> : step === 4 ? "Create draft and open Step 1" : "Continue"}
          </Btn>
        </>
      }
    >
      <DrawerSteps steps={["File type", "Client and entity", "Evidence", "Review"]} current={step} />
      {step === 1 ? <>
        <p className="sub">Start with the file classification. This controls requirements, evidence, and program screening.</p>
        <div className="fldgrid two"><Field label="Lead type"><Select value={variant} onChange={(e) => setVariant(e.target.value as LeadVariant)}><option value="dealer">Dealer</option><option value="real_estate">Real estate</option><option value="main_street">Main Street (operating business)</option><option value="mca_refinance">MCA refinance</option></Select></Field><Field label="Preferred language"><Select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value as "en" | "es")}><option value="en">English</option><option value="es">Spanish</option></Select></Field></div>
      {isMS ? (
        <div className="fldgrid two">
          <Field label="Industry *">
            <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {MAIN_STREET_INDUSTRIES.map((i) => (
                <option key={i.slug} value={i.slug}>{i.label}</option>
              ))}
            </Select>
          </Field>
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
        <Field label="Six-digit room PIN *"><Input value={roomPin} onChange={(event) => setRoomPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="000000" /></Field>
        <Field label="Confirm room PIN *"><Input value={roomPinConfirm} onChange={(event) => setRoomPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="000000" /></Field>
        <p className="sub" style={{ gridColumn: "1 / -1" }}>The client enters this PIN in the application room. It cannot be recovered after creation; staff can rotate it later.</p>
      </div> : null}

      {step === 2 ? <>
        <p className="sub">The client and legal entity anchor ownership, private credit links, bank evidence, and the secure room.</p>
        <div className="fldgrid two"><Field label="Client full name *"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" /></Field><Field label="Personal email *"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" /></Field><Field label="Personal mobile *"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(973) 555-0148" /></Field>{!isRE ? <Field label="Legal business name *"><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business LLC" /></Field> : <Field label="Investor / entity name"><Input value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="Holdings LLC" /></Field>}</div>
      </> : null}

      {step === 3 && isRE ? (
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
      {step === 3 ? <>
        <input ref={evidencePicker} type="file" hidden multiple accept=".pdf,.csv,.xlsx,.xls,.zip,image/*" onChange={(event) => setEvidenceFiles(Array.from(event.target.files ?? []))} />
        <button type="button" className={cx("create-evidence-dropzone", dragging && "dragging")} onClick={() => evidencePicker.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setEvidenceFiles((rows) => [...rows, ...Array.from(event.dataTransfer.files)]); }}><Icon name="upload" size={24} /><b>Drop initial evidence here or click to browse</b><span>Upload multiple files or a ZIP. The draft opens immediately after creation while extraction continues in the background.</span></button>
        {evidenceFiles.length ? <div className="create-evidence-files">{evidenceFiles.map((file, index) => <div key={`${file.name}-${file.size}-${index}`}><Icon name="file" size={14} /><span className="grow trunc"><b className="trunc">{file.name}</b><small>{formatSize(file.size)}</small></span><IconBtn aria-label={`Remove ${file.name}`} title="Remove file" onClick={() => setEvidenceFiles((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={13} /></IconBtn></div>)}</div> : <Callout tone="mut">Evidence is optional during creation and can be uploaded later from the file header.</Callout>}
      </> : null}
      {step === 4 ? <>
        <div className="create-intake-review"><div><span>File type</span><b>{variantLabel(variant)}</b></div><div><span>Client</span><b>{fullName || "Not entered"}</b></div><div><span>Entity</span><b>{isRE ? investorName || "Not entered" : businessName || "Not entered"}</b></div><div><span>Primary email</span><b>{email || "Not entered"}</b></div></div>
        <Callout tone="acc" icon={<Icon name="arrowR" size={16} />}>The file opens at Step 1 for ownership. Uploaded evidence is analyzed independently; owner credit and LLC banking each retain their own readiness state.</Callout>
        <div className="line"><span className="sub">Initial evidence</span><strong>{evidenceFiles.length ? `${evidenceFiles.length} file${evidenceFiles.length === 1 ? "" : "s"}` : "None yet"}</strong></div>
        <label className={cx("pick", notifyClient && "on")}><input type="checkbox" checked={notifyClient} onChange={(e) => setNotifyClient(e.target.checked)} />Email the secure application-room link now</label>
      </> : null}

      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    </Drawer>
  );
}
