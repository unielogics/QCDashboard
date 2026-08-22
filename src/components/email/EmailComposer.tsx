"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/design-system/Modal";
import { useToast, Toast } from "@/components/design-system/primitives";
import { Btn, Input, Sub, Textarea } from "@/components/ds";
import { ApiError } from "@/lib/api";

// Surface a FastAPI 422/400 `detail` (string or [{msg}]) instead of a bare status.
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : ""))
        .filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

// Validate/unwrap recipients: requires a real dot-TLD and unwraps "Name <addr>".
export function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const token of raw.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)) {
    const m = token.match(EMAIL_RE);
    if (m) valid.push(m[0]);
    else invalid.push(token);
  }
  return { valid, invalid };
}

export type EmailComposerSend = {
  to_emails: string[];
  cc_emails: string[];
  subject: string;
  body: string;
};

export function EmailComposer({
  open,
  onClose,
  title = "Compose email",
  defaultTo = "",
  defaultCc = "",
  defaultSubject = "",
  defaultBody = "",
  toReadonly = false,
  helpText,
  sendLabel = "Send via your Gmail",
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  defaultTo?: string;
  defaultCc?: string;
  defaultSubject?: string;
  defaultBody?: string;
  /** When the recipient is fixed (e.g. the loan's client), lock the To field. */
  toReadonly?: boolean;
  helpText?: string;
  sendLabel?: string;
  onSend: (payload: EmailComposerSend) => Promise<{ ok?: boolean; detail?: string | null } | void>;
}) {
  const toast = useToast();
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState(defaultCc);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [busy, setBusy] = useState(false);

  // Re-seed fields each time the composer opens (defaults may change per target).
  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setCc(defaultCc);
      setSubject(defaultSubject);
      setBody(defaultBody);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    const toParsed = parseEmails(to);
    const ccParsed = parseEmails(cc);
    if (toParsed.invalid.length || ccParsed.invalid.length) {
      toast.show(`Fix these email addresses: ${[...toParsed.invalid, ...ccParsed.invalid].join(", ")}`);
      return;
    }
    if (!toParsed.valid.length) {
      toast.show("Add at least one recipient email");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.show("Add a subject and body");
      return;
    }
    if (subject.trim().length > 512) { toast.show("Subject is too long (max 512)"); return; }
    if (body.trim().length > 12000) { toast.show("Body is too long (max 12,000)"); return; }
    setBusy(true);
    try {
      const res = await onSend({
        to_emails: toParsed.valid,
        cc_emails: ccParsed.valid,
        subject: subject.trim(),
        body: body.trim(),
      });
      const ok = !res || res.ok !== false;
      toast.show(ok ? "Email sent" : (res && res.detail) ? `Send failed: ${res.detail}` : "Send failed — check status");
      if (ok) onClose();
    } catch (error) {
      toast.show(apiErrorMessage(error, "Send failed"));
    } finally {
      setBusy(false);
    }
  }

  // Deliberately still the old `Modal` and not `Drawer`. /admin/buckets opens
  // this composer from INSIDE its bucket detail modal (z-index 300); `.drawer`
  // sits at 61 and would render behind it.
  return (
    <Modal open={open} onClose={onClose} title={title} icon="mail" size="lg">
      {/* Bespoke: Modal hands its children an unpadded box. */}
      <div className="grid" style={{ padding: 16 }}>
        {helpText ? <Sub>{helpText}</Sub> : null}
        <div className="fldgrid two">
          <label className="grid g4">
            <span className="lbl">To</span>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              readOnly={toReadonly}
              placeholder="name@company.com"
            />
          </label>
          <label className="grid g4">
            {/* `.lbl` uppercases its whole subtree, so the qualifier is part of
                the label rather than a differently-cased span inside it. */}
            <span className="lbl">Cc — optional</span>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma-separated" />
          </label>
        </div>
        <label className="grid g4">
          <span className="lbl">Subject</span>
          <Input value={subject} maxLength={512} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject line" />
        </label>
        <label className="grid g4">
          <span className="lbl">Body</span>
          {/* Bespoke: the composing area is sized to a real message, not to its
              content. `textarea.field` already carries resize: vertical. */}
          <Textarea
            value={body}
            maxLength={12000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message"
            style={{ minHeight: 220 }}
          />
        </label>
        <div className="row end">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="pri" onClick={submit} disabled={busy}>
            {busy ? "Sending…" : sendLabel}
          </Btn>
        </div>
      </div>
      <Toast msg={toast.msg} />
    </Modal>
  );
}
