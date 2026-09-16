"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Callout, CellChip, Field, IconBtn, Input, Select, Textarea, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { useActiveProfile } from "@/store/role";

export type OfferItemRef =
  | { kind: "merchant_offer"; offer_id: string; expected_version: number }
  | { kind: "production_term_sheet"; term_sheet_id: string; expected_version: number }
  | { kind: "application_term_sheet"; term_sheet_id: string; expected_version: number };

export type OfferSelection = {
  key: string;
  ref: OfferItemRef;
  label: string;
  description: string;
  fileName?: string | null;
};

type CommunicationContact = {
  id: string;
  name: string;
  email: string | null;
  is_primary: boolean;
};

type AttachmentOption = {
  kind: "merchant_offer" | "production_term_sheet" | "application_term_sheet" | "evidence_file";
  id: string;
  label: string;
  file_name: string;
  content_type: string;
  size_bytes: number | null;
  expected_version: number | null;
};

type AttachmentOptionsResponse = {
  direct_client_contact_suppressed: boolean;
  suppression_reason: string | null;
  options: AttachmentOption[];
};

type CanonicalSection = {
  item_key: string;
  title: string;
  lines: string[];
};

type DraftItem = {
  item_key: string;
  kind: OfferItemRef["kind"];
  label: string;
  file_name: string;
  expected_version: number;
  preview_url?: string | null;
  download_url?: string | null;
};

type OfferEmailDraft = {
  subject: string;
  personal_message: string;
  canonical_sections: CanonicalSection[];
  deadline_notice: string;
  disclaimer: string;
  expires_in_hours: number;
  draft_source: "ai" | "fallback" | string;
  draft_fingerprint?: string | null;
  items: DraftItem[];
};

export type OfferDeliveryReceipt = {
  id: string;
  status: string;
  sent_at: string;
  expires_at: string;
  thread_id?: string | null;
  recipient_emails?: string[];
  items: Array<{
    id: string;
    kind: OfferItemRef["kind"] | "evidence_file";
    label: string;
    file_name: string;
    status: string;
    preview_url?: string | null;
    download_url?: string | null;
  }>;
};

function fallbackDraft(clientName: string | null | undefined, items: OfferSelection[]): OfferEmailDraft {
  const firstName = (clientName || "there").trim().split(/\s+/)[0] || "there";
  return {
    subject: items.length > 1 ? "Your financing and merchant processing offers" : `Your ${items[0]?.label.toLowerCase() || "offer"}`,
    personal_message: `Hi ${firstName},\n\nWe have prepared the following offer for your review. Please review the exact terms below and the attached PDF. Reply to this email if you would like us to walk through anything with you.`,
    canonical_sections: [],
    deadline_notice: "These terms must be accepted within 48 hours after delivery. After that time, they must be reconfirmed and may change.",
    disclaimer: "Loan terms are indicative, non-binding, and subject to final underwriting, documentation, and approval.",
    expires_in_hours: 48,
    draft_source: "fallback",
    items: items.map((item) => ({
      item_key: item.key,
      kind: item.ref.kind,
      label: item.label,
      file_name: item.fileName || `${item.label}.pdf`,
      expected_version: item.ref.expected_version,
    })),
  };
}

function normalizeDraft(value: Partial<OfferEmailDraft> & { body?: string; sections?: CanonicalSection[] }, fallback: OfferEmailDraft): OfferEmailDraft {
  return {
    ...fallback,
    ...value,
    subject: value.subject?.trim() || fallback.subject,
    personal_message: value.personal_message?.trim() || value.body?.trim() || fallback.personal_message,
    canonical_sections: Array.isArray(value.canonical_sections) ? value.canonical_sections : Array.isArray(value.sections) ? value.sections : fallback.canonical_sections,
    deadline_notice: value.deadline_notice?.trim() || fallback.deadline_notice,
    disclaimer: value.disclaimer?.trim() || fallback.disclaimer,
    expires_in_hours: Number(value.expires_in_hours) || 48,
    items: Array.isArray(value.items) && value.items.length ? value.items : fallback.items,
  };
}

function refKey(ref: OfferItemRef): string {
  if (ref.kind === "merchant_offer") return `${ref.kind}:${ref.offer_id}:${ref.expected_version}`;
  return `${ref.kind}:${ref.term_sheet_id}:${ref.expected_version}`;
}

function itemIcon(kind: OfferItemRef["kind"] | "evidence_file"): "building" | "dollar" | "file" {
  return kind === "merchant_offer" ? "dollar" : kind === "evidence_file" ? "file" : "building";
}

function when(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function OfferDeliveryComposer({
  profileId,
  clientName,
  open,
  selections,
  contactSuppressed = false,
  onClose,
  onSent,
}: {
  profileId: string;
  clientName?: string | null;
  open: boolean;
  selections: OfferSelection[];
  contactSuppressed?: boolean;
  onClose: () => void;
  onSent?: (receipt: OfferDeliveryReceipt) => void;
}) {
  const call = useAuthedApi();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = visualQaUser(useActiveProfile().email);
  const [contacts, setContacts] = useState<CommunicationContact[]>([]);
  const [attachmentOptions, setAttachmentOptions] = useState<AttachmentOption[]>([]);
  const [toContactId, setToContactId] = useState("");
  const [ccContactIds, setCcContactIds] = useState<string[]>([]);
  const [evidenceFileIds, setEvidenceFileIds] = useState<string[]>([]);
  const [guidance, setGuidance] = useState("");
  const [subject, setSubject] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
  const [draft, setDraft] = useState<OfferEmailDraft | null>(null);
  const [receipt, setReceipt] = useState<OfferDeliveryReceipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [suppressionReason, setSuppressionReason] = useState<string | null>(null);
  const [documentBusy, setDocumentBusy] = useState("");
  const [documentPreview, setDocumentPreview] = useState<{ key: string; title: string; url: string } | null>(null);
  const idempotencyKey = useRef("");
  const requestGeneration = useRef(0);

  const selectionSignature = useMemo(() => selections.map((item) => refKey(item.ref)).sort().join("|"), [selections]);
  const selectedContact = contacts.find((contact) => contact.id === toContactId);
  const evidence = attachmentOptions.filter((item) => item.kind === "evidence_file");
  const effectiveSuppressed = contactSuppressed || Boolean(suppressionReason);

  useEffect(() => {
    if (!open) return;
    idempotencyKey.current = crypto.randomUUID();
    setReceipt(null);
    setError("");
    setEvidenceFileIds([]);
    setCcContactIds([]);
    setGuidance("");
  }, [open, selectionSignature]);

  useEffect(() => {
    if (open) return;
    setDocumentPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, [open]);

  useEffect(() => () => {
    if (documentPreview) URL.revokeObjectURL(documentPreview.url);
  }, [documentPreview]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.all([
      call<CommunicationContact[]>(`/application-profiles/${profileId}/communications/contacts`),
      call<AttachmentOptionsResponse>(`/application-profiles/${profileId}/communications/email/attachments`),
    ]).then(([nextContacts, options]) => {
      if (!active) return;
      setContacts(nextContacts);
      setAttachmentOptions(options.options ?? []);
      setSuppressionReason(options.direct_client_contact_suppressed ? options.suppression_reason || "Direct client email is suppressed on this file." : null);
      const primary = nextContacts.find((contact) => contact.is_primary && contact.email) ?? nextContacts.find((contact) => contact.email);
      setToContactId((current) => current && nextContacts.some((contact) => contact.id === current) ? current : primary?.id || "");
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Verified contacts and attachments could not be loaded.");
    });
    return () => { active = false; };
  }, [call, open, profileId]);

  async function generateDraft() {
    if (!selections.length) return;
    const generation = ++requestGeneration.current;
    const fallback = fallbackDraft(clientName, selections);
    setLoading(true);
    setError("");
    try {
      const response = await call<Partial<OfferEmailDraft> & { body?: string; sections?: CanonicalSection[] }>(
        `/application-profiles/${profileId}/communications/email/offer-draft`,
        {
          method: "POST",
          body: JSON.stringify({
            items: selections.map((item) => item.ref),
            guidance: guidance.trim() || null,
          }),
        },
      );
      if (requestGeneration.current !== generation) return;
      const normalized = normalizeDraft(response, fallback);
      setDraft(normalized);
      setSubject(normalized.subject);
      setPersonalMessage(normalized.personal_message);
    } catch (reason) {
      if (requestGeneration.current !== generation) return;
      setDraft(fallback);
      setSubject(fallback.subject);
      setPersonalMessage(fallback.personal_message);
      setError(`${reason instanceof Error ? reason.message : "The AI draft was unavailable."} A safe standard draft is ready for review.`);
    } finally {
      if (requestGeneration.current === generation) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open || !selections.length) return;
    void generateDraft();
    // `guidance` intentionally does not regenerate while someone is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profileId, selectionSignature]);

  async function send() {
    if (!draft || !selectedContact?.email || effectiveSuppressed || sending) return;
    setSending(true);
    setError("");
    try {
      const created = await call<OfferDeliveryReceipt>(`/application-profiles/${profileId}/offer-deliveries`, {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: idempotencyKey.current,
          to_contact_id: toContactId,
          cc_contact_ids: ccContactIds,
          subject: subject.trim(),
          personal_message: personalMessage.trim(),
          items: selections.map((item) => item.ref),
          evidence_attachments: evidenceFileIds.map((file_id) => ({ kind: "evidence_file", file_id })),
          draft_fingerprint: draft.draft_fingerprint || null,
        }),
      });
      setReceipt(created);
      onSent?.(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The offer package could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function openProtectedDocument(key: string, title: string, fileName: string, path: string, mode: "preview" | "download") {
    const allowedPrefix = `/api/v1/application-profiles/${profileId}/`;
    if (!path.startsWith(allowedPrefix)) {
      setError("The document link returned by the server was not valid for this file.");
      return;
    }
    setDocumentBusy(`${mode}:${key}`);
    setError("");
    try {
      const token = isSignedIn ? await getToken() : null;
      const response = await fetch(new URL(path, apiBase).toString(), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(!token && devUser ? { "X-Dev-User": devUser } : {}),
        },
      });
      if (!response.ok) throw new Error("The exact offer PDF could not be opened.");
      const objectUrl = URL.createObjectURL(await response.blob());
      if (mode === "download") {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      } else {
        setDocumentPreview((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return { key, title, url: objectUrl };
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The exact offer PDF could not be opened.");
    } finally {
      setDocumentBusy("");
    }
  }

  const close = () => {
    if (!sending) onClose();
  };

  return <Drawer
    open={open}
    onClose={close}
    closeOnBackdrop={!sending}
    width="lg"
    title={receipt ? "Offer package sent" : "Email client offer"}
    sub={receipt ? "The email and these exact PDF snapshots are now in the client inbox." : "AI drafts the personal note. Exact offer terms and the 48-hour deadline remain locked."}
    headerActions={!receipt ? <CellChip tone={draft?.draft_source === "ai" ? "acc" : "mut"}><Icon name="spark" size={12} />{loading ? "Drafting" : draft?.draft_source === "ai" ? "AI draft" : "Standard draft"}</CellChip> : undefined}
    footer={receipt ? <Btn variant="pri" onClick={close}>Done</Btn> : (
      <>
        <Btn onClick={close} disabled={sending}>Cancel</Btn>
        <span className="sp" />
        <Btn
          variant="pri"
          onClick={() => void send()}
          disabled={effectiveSuppressed || loading || sending || !draft || !selectedContact?.email || !subject.trim() || !personalMessage.trim()}
        >
          <Icon name="send" size={14} />{sending ? "Sending package…" : `Send ${selections.length > 1 ? "both offers" : "offer"}`}
        </Btn>
      </>
    )}
  >
    {receipt ? <div className="offer-delivery-receipt">
      <div className="offer-delivery-success"><span><Icon name="check" size={20} /></span><div><b>Delivered to {receipt.recipient_emails?.join(", ") || selectedContact?.email}</b><small>Sent {when(receipt.sent_at)} · response deadline {when(receipt.expires_at)}</small></div></div>
      <div className="offer-delivery-documents">
        {receipt.items.map((item) => <article key={item.id}><span className="offer-delivery-document-icon"><Icon name={itemIcon(item.kind)} size={17} /></span><div><b>{item.label}</b><small>{item.file_name} · immutable sent copy</small></div><CellChip tone="ok">In client inbox</CellChip>{item.preview_url ? <IconBtn onClick={() => void openProtectedDocument(item.id, item.label, item.file_name, item.preview_url!, "preview")} disabled={documentBusy !== ""} aria-label={`Preview ${item.label}`} title="Preview sent PDF"><Icon name={documentBusy === `preview:${item.id}` ? "refresh" : "eye"} size={14} /></IconBtn> : null}{item.download_url ? <IconBtn onClick={() => void openProtectedDocument(item.id, item.label, item.file_name, item.download_url!, "download")} disabled={documentBusy !== ""} aria-label={`Download ${item.label}`} title="Download sent PDF"><Icon name={documentBusy === `download:${item.id}` ? "refresh" : "download"} size={14} /></IconBtn> : null}</article>)}
      </div>
      <Callout tone="mut">The client can decide on each offer separately. Their response will be recorded against this exact version.</Callout>
      {documentPreview ? <section className="offer-delivery-inline-preview"><header><div><span className="lbl">Exact sent copy</span><b>{documentPreview.title}</b></div><IconBtn onClick={() => setDocumentPreview((current) => { if (current) URL.revokeObjectURL(current.url); return null; })} aria-label="Close PDF preview" title="Close preview"><Icon name="close" size={14} /></IconBtn></header><iframe src={documentPreview.url} title={`${documentPreview.title} PDF preview`} /></section> : null}
    </div> : <div className="offer-delivery-composer">
      {effectiveSuppressed ? <Callout tone="warn"><b>Client email is disabled.</b> {suppressionReason || "This referral-managed file suppresses direct client contact."}</Callout> : null}
      {error ? <Callout tone={draft ? "warn" : "bad"}><span role="alert">{error}</span></Callout> : null}

      <section className="offer-delivery-selected" aria-label="Selected offers">
        <header><div><span className="lbl">Selected for delivery</span><b>{selections.length} client offer{selections.length === 1 ? "" : "s"}</b></div><CellChip tone="warn"><Icon name="audit" size={12} />48-hour response window</CellChip></header>
        {selections.map((item) => {
          const prepared = draft?.items.find((draftItem) => draftItem.item_key === item.key || (draftItem.kind === item.ref.kind && draftItem.expected_version === item.ref.expected_version));
          return <article key={item.key}><span className="offer-delivery-document-icon"><Icon name={itemIcon(item.ref.kind)} size={17} /></span><div><b>{item.label}</b><small>{item.description}</small></div>{prepared?.preview_url ? <IconBtn onClick={() => void openProtectedDocument(item.key, item.label, prepared.file_name, prepared.preview_url!, "preview")} disabled={documentBusy !== ""} aria-label={`Preview ${item.label}`} title="Preview PDF"><Icon name={documentBusy === `preview:${item.key}` ? "refresh" : "eye"} size={14} /></IconBtn> : <IconBtn disabled aria-label={`${item.label} preview is prepared when sent`} title="The immutable preview is prepared when sent"><Icon name="eye" size={14} /></IconBtn>}{prepared?.download_url ? <IconBtn onClick={() => void openProtectedDocument(item.key, item.label, prepared.file_name, prepared.download_url!, "download")} disabled={documentBusy !== ""} aria-label={`Download ${item.label}`} title="Download PDF"><Icon name={documentBusy === `download:${item.key}` ? "refresh" : "download"} size={14} /></IconBtn> : null}</article>;
        })}
      </section>

      {documentPreview ? <section className="offer-delivery-inline-preview"><header><div><span className="lbl">Client PDF preview</span><b>{documentPreview.title}</b></div><IconBtn onClick={() => setDocumentPreview((current) => { if (current) URL.revokeObjectURL(current.url); return null; })} aria-label="Close PDF preview" title="Close preview"><Icon name="close" size={14} /></IconBtn></header><iframe src={documentPreview.url} title={`${documentPreview.title} PDF preview`} /></section> : null}

      <div className="fldgrid two">
        <Field label="To" hint="Verified contacts on this file only.">
          <Select aria-label="Offer email recipient" value={toContactId} disabled={effectiveSuppressed || loading} onChange={(event) => { setToContactId(event.target.value); setCcContactIds((current) => current.filter((id) => id !== event.target.value)); }}>
            <option value="">Choose a recipient</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id} disabled={!contact.email}>{contact.name}{contact.email ? ` — ${contact.email}` : " — no email"}</option>)}
          </Select>
        </Field>
        <Field label="Cc" hint="Optional verified contacts.">
          <div className="offer-delivery-cc">
            {contacts.filter((contact) => contact.email && contact.id !== toContactId).map((contact) => <label key={contact.id}><input type="checkbox" checked={ccContactIds.includes(contact.id)} disabled={effectiveSuppressed} onChange={(event) => setCcContactIds((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} />{contact.name}</label>)}
            {!contacts.some((contact) => contact.email && contact.id !== toContactId) ? <span className="sub">No additional contacts</span> : null}
          </div>
        </Field>
      </div>

      <Field label="Subject"><Input aria-label="Offer email subject" value={subject} maxLength={200} disabled={effectiveSuppressed || loading} onChange={(event) => setSubject(event.target.value)} /></Field>
      <Field label="Personal message" hint="Edit the greeting and explanation. Exact terms below are locked to the selected versions.">
        <Textarea aria-label="Offer email personal message" rows={7} value={personalMessage} disabled={effectiveSuppressed || loading} onChange={(event) => setPersonalMessage(event.target.value)} />
      </Field>

      <section className={cx("offer-delivery-locked", loading && "loading")} aria-busy={loading}>
        <header><div><Icon name="lock" size={14} /><span><b>Locked offer details</b><small>Inserted into the email body and generated PDFs by the server.</small></span></div><CellChip tone="ok">Version checked</CellChip></header>
        {loading ? <div className="empty"><span className="spinner solo" />Drafting the email and exact term summary…</div> : null}
        {!loading && draft?.canonical_sections.length ? draft.canonical_sections.map((section) => <article key={`${section.item_key}:${section.title}`}><b>{section.title}</b><ul>{section.lines.map((line, index) => <li key={`${line}:${index}`}>{line}</li>)}</ul></article>) : null}
        {!loading && draft && !draft.canonical_sections.length ? selections.map((item) => <article key={item.key}><b>{item.label}</b><p>{item.description}</p></article>) : null}
        {draft ? <div className="offer-delivery-deadline"><Icon name="audit" size={16} /><div><b>Acceptance required within {draft.expires_in_hours || 48} hours</b><p>{draft.deadline_notice}</p></div></div> : null}
        {draft?.disclaimer ? <p className="offer-delivery-disclaimer">{draft.disclaimer}</p> : null}
      </section>

      <Field label="Optional file-room attachments" hint="The selected offer PDFs are always attached. Add supporting client-safe files here.">
        <Select aria-label="Tag a file for the offer email" value="" disabled={effectiveSuppressed || !evidence.some((item) => !evidenceFileIds.includes(item.id))} onChange={(event) => { if (event.target.value) setEvidenceFileIds((current) => [...current, event.target.value]); }}>
          <option value="">{evidence.length ? "Tag a file…" : "No file-room files available"}</option>
          {evidence.filter((item) => !evidenceFileIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.label || item.file_name}</option>)}
        </Select>
        {evidenceFileIds.length ? <div className="email-attachment-chips">{evidenceFileIds.map((id) => { const item = evidence.find((option) => option.id === id); return <span key={id} className="email-attachment-chip"><Icon name="paperclip" size={12} /><span>{item?.label || item?.file_name || "File"}</span><button type="button" onClick={() => setEvidenceFileIds((current) => current.filter((value) => value !== id))} aria-label={`Remove ${item?.label || item?.file_name || "file"}`}><Icon name="close" size={11} /></button></span>; })}</div> : null}
      </Field>

      <div className="offer-delivery-ai-controls">
        <Field label="Instructions for the draft" hint="Optional tone or context. Exact figures cannot be changed by AI."><Input value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Example: Keep it brief and mention our call Tuesday" /></Field>
        <IconBtn onClick={() => void generateDraft()} disabled={effectiveSuppressed || loading || sending} aria-label="Regenerate email draft" title="Regenerate with light AI"><Icon name="refresh" size={15} /></IconBtn>
      </div>
    </div>}
  </Drawer>;
}
