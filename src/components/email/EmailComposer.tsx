"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Modal } from "@/components/design-system/Modal";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useToast, Toast } from "@/components/design-system/primitives";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
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
  const { t } = useTheme();
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

  const input: CSSProperties = {
    background: t.surface,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.ink,
    padding: "8px 10px",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  };
  const label: CSSProperties = {
    color: t.ink3,
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 1,
  };

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

  return (
    <Modal open={open} onClose={onClose} title={title} icon="mail" size="lg">
      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        {helpText ? (
          <span style={{ color: t.ink3, fontSize: 12, lineHeight: 1.45 }}>{helpText}</span>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={label}>To</label>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              readOnly={toReadonly}
              placeholder="name@company.com"
              style={{ ...input, width: "100%", opacity: toReadonly ? 0.75 : 1 }}
            />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={label}>Cc <span style={{ textTransform: "none", fontWeight: 500 }}>(optional)</span></label>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma-separated" style={{ ...input, width: "100%" }} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={label}>Subject</label>
          <input value={subject} maxLength={512} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject line" style={{ ...input, width: "100%" }} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={label}>Body</label>
          <textarea value={body} maxLength={12000} onChange={(e) => setBody(e.target.value)} placeholder="Write your message" style={{ ...input, width: "100%", minHeight: 220, lineHeight: 1.5, resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={qcBtn(t)} onClick={onClose} disabled={busy}>Cancel</button>
          <button style={qcBtnPrimary(t)} onClick={submit} disabled={busy}>
            {busy ? "Sending…" : sendLabel}
          </button>
        </div>
      </div>
      <Toast msg={toast.msg} />
    </Modal>
  );
}
