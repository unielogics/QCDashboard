"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, Callout, CellChip, Field, Input, Select, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";
import { fileRequestsApi, type FileRequestItem, type FileRequestRead } from "@/lib/fileRequestsApi";
import { queueFileRequestPrefill } from "@/lib/financialStatementRequests";

const TYPES = [
  ["bank_statement", "Bank statements", "months", 6],
  ["tax_return", "Tax returns", "years", 2],
  ["debt_schedule", "Business debt schedule", "files", 1],
  ["pfs", "Personal financial statement", "files", 1],
  ["profit_and_loss", "Profit and loss statement", "files", 1],
  ["balance_sheet", "Balance sheet", "files", 1],
  ["real_estate_schedule", "Real estate schedule", "files", 1],
  ["operating_plan", "Operating expenses and earnings plan", "files", 1],
  ["mortgage_statement", "Latest mortgage statement", "files", 1],
  ["payoff_letter", "Payoff letters", "files", 1],
  ["loan_agreement", "Loan agreements", "files", 1],
  ["other", "Other document", "files", 1],
] as const;

const blank = (): FileRequestItem => ({ document_type: "bank_statement", name: "Bank statements", quantity: 6, unit: "months", subject: "business", period: "current", instructions: "" });
const message = (error: unknown) => error instanceof Error ? error.message : "The file request could not be saved.";

export function RequestFilesDialog({ profileId, open, onClose, onRequested, prefill, prefillKey }: {
  profileId: string;
  open: boolean;
  onClose: () => void;
  onRequested?: () => void;
  prefill?: FileRequestItem;
  prefillKey?: string;
}) {
  const call = useAuthedApi();
  const api = useMemo(() => fileRequestsApi(call, profileId), [call, profileId]);
  const [items, setItems] = useState<FileRequestItem[]>([blank()]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [history, setHistory] = useState<FileRequestRead[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const appliedPrefill = useRef<{ profileId: string; key?: string } | null>(null);
  const activeProfile = useRef(profileId);
  activeProfile.current = profileId;

  const load = useCallback(async () => {
    try { const response = await api.list(); if (activeProfile.current === profileId) setHistory(response.requests); }
    catch (reason) { if (activeProfile.current === profileId) setError(message(reason)); }
  }, [api, profileId]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    const profileChanged = appliedPrefill.current?.profileId !== profileId;
    const key = prefillKey ?? (prefill ? JSON.stringify(prefill) : undefined);
    const addPrefill = open && prefill && (profileChanged || appliedPrefill.current?.key !== key);
    if (!profileChanged && !addPrefill) return;
    const baseline = profileChanged ? [blank()] : items;
    const next = addPrefill ? queueFileRequestPrefill(baseline, prefill, blank()) : baseline;
    appliedPrefill.current = { profileId, key: addPrefill ? key : profileChanged ? undefined : appliedPrefill.current?.key };
    if (profileChanged) { setHistory([]); setError(""); setBusy(""); }
    if (next !== items) { setItems(next); setRequestId(null); setNotice(""); }
  }, [profileId, open, prefill, prefillKey, items]);

  function patch(index: number, changes: Partial<FileRequestItem>) {
    setItems((current) => current.map((item, at) => at === index ? { ...item, ...changes } : item));
    setRequestId(null);
    setNotice("");
  }

  async function submit() {
    setBusy("create"); setError(""); setNotice("");
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    try {
      const response = await api.create(id, items, notify);
      if (activeProfile.current !== profileId) return;
      setHistory(response.requests);
      const failed = response.notification?.status === "failed";
      setNotice(failed ? "Requests saved. The email could not be delivered; retry it below." : response.notification?.status === "sent" ? "Requests saved. The client email was accepted for delivery." : notify ? "Requests saved. Email delivery is pending." : "Requests saved in the client’s secure room.");
      setItems([blank()]); setRequestId(null);
      onRequested?.();
    } catch (reason) { if (activeProfile.current === profileId) setError(message(reason)); }
    finally { if (activeProfile.current === profileId) setBusy(""); }
  }

  async function action(row: FileRequestRead, kind: "retry" | "cancel") {
    setBusy(`${kind}:${row.request_id}`); setError("");
    try {
      if (kind === "retry") {
        const result = await api.retry(row.request_id, crypto.randomUUID());
        if (activeProfile.current !== profileId) return;
        setNotice(result.notification.status === "sent" ? "The request email was sent." : result.notification.detail || "Delivery failed; the request remains available in the client’s room.");
      } else { await api.cancel(row.request_id); if (activeProfile.current !== profileId) return; setNotice("Request cancelled. Uploaded files are retained."); }
      await load(); onRequested?.();
    } catch (reason) { if (activeProfile.current === profileId) setError(message(reason)); }
    finally { if (activeProfile.current === profileId) setBusy(""); }
  }

  const invalid = items.some((item) => item.name.trim().length < 2 || !item.subject.trim() || !item.period.trim() || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > ({ files: 100, months: 60, years: 10 }[item.unit]));
  return <Drawer open={open} onClose={() => { if (!busy) onClose(); }} title="Request files" sub="Ask for several documents in one request. Track their coverage in the same checklist the client sees." width="lg" closeOnBackdrop={!busy}
    footer={<><Btn onClick={onClose} disabled={!!busy}>Close</Btn><Btn variant="pri" disabled={!!busy || invalid} onClick={() => void submit()}>{busy === "create" ? "Saving…" : notify ? "Save and email request" : "Save request"}</Btn></>}>
    <div className="fp-stack">
      {error ? <Callout tone="warn">{error}</Callout> : null}
      {notice ? <Callout tone="mut">{notice}</Callout> : null}
      {items.map((item, index) => <section key={index} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><b>Document {index + 1}</b><Btn size="sm" disabled={items.length === 1 || !!busy} onClick={() => { setItems((current) => current.filter((_, at) => at !== index)); setRequestId(null); }}>Remove</Btn></div>
        <div className="fldgrid two">
          <Field label="Document type"><Select aria-label={`Document ${index + 1} type`} value={item.document_type} disabled={!!busy} onChange={(event) => {
            const type = TYPES.find((entry) => entry[0] === event.target.value)!;
            patch(index, { document_type: type[0], name: type[1], unit: type[2], quantity: type[3] });
          }}>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="Request name"><Input aria-label={`Document ${index + 1} name`} maxLength={180} value={item.name} disabled={!!busy} onChange={(event) => patch(index, { name: event.target.value })} /></Field>
          <Field label="Quantity"><Input aria-label={`Document ${index + 1} quantity`} type="number" min={1} max={{ files: 100, months: 60, years: 10 }[item.unit]} value={item.quantity || ""} disabled={!!busy} onChange={(event) => patch(index, { quantity: Number(event.target.value) })} /></Field>
          <Field label="Count by"><Select aria-label={`Document ${index + 1} unit`} value={item.unit} disabled={!!busy} onChange={(event) => patch(index, { unit: event.target.value as FileRequestItem["unit"] })}><option value="files">Files</option><option value="months">Distinct months</option><option value="years">Distinct years</option></Select></Field>
          <Field label="Business or person"><Input aria-label={`Document ${index + 1} subject`} value={item.subject} maxLength={160} disabled={!!busy} onChange={(event) => patch(index, { subject: event.target.value })} placeholder="Business or owner name" /></Field>
          <Field label="Period"><Input aria-label={`Document ${index + 1} period`} value={item.period} maxLength={160} disabled={!!busy} onChange={(event) => patch(index, { period: event.target.value })} placeholder="For example: May–October 2026" /></Field>
        </div>
        <Field label="Instructions"><Textarea aria-label={`Document ${index + 1} instructions`} value={item.instructions} maxLength={2000} rows={2} disabled={!!busy} onChange={(event) => patch(index, { instructions: event.target.value })} placeholder="What the client should provide" /></Field>
      </section>)}
      <div><Btn size="sm" disabled={!!busy || items.length >= 30} onClick={() => { setItems((current) => [...current, blank()]); setRequestId(null); }}>Add document</Btn></div>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={notify} disabled={!!busy} onChange={(event) => setNotify(event.target.checked)} /> Email the client one message with every requested item</label>
      {history.length ? <section aria-label="File request history"><h3>Previous requests</h3>{[...history].reverse().map((row) => {
        const last = row.deliveries.at(-1);
        const cancelled = row.items.every((item) => item.status === "cancelled");
        return <div key={row.request_id} style={{ padding: "14px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><b>{new Date(row.created_at).toLocaleString()}</b><CellChip tone={last?.status === "failed" ? "warn" : "mut"}>{cancelled ? "Cancelled" : last?.status === "sent" ? "Email accepted by provider" : last?.status === "failed" ? "Email failed" : "Saved"}</CellChip>
            {!cancelled && last?.status === "failed" ? <Btn size="sm" disabled={!!busy} onClick={() => void action(row, "retry")}>Retry email</Btn> : null}
            {!cancelled && row.items.some((item) => !["verified", "waived", "not_applicable"].includes(item.status)) ? <Btn size="sm" disabled={!!busy} onClick={() => void action(row, "cancel")}>Cancel request</Btn> : null}</div>
          {row.items.map((item) => <div key={item.requirement_key} style={{ margin: "8px 0 0" }}><span>{item.label}</span> <span className="sub">· {item.verified_coverage.current ?? item.coverage.current ?? 0}/{item.verified_coverage.required ?? item.coverage.required ?? item.quantity} {item.coverage.unit ?? item.unit} · {item.status.replaceAll("_", " ")}</span>{!cancelled && !["verified", "waived", "not_applicable"].includes(item.status) ? <div className="sub">Next reminder: {item.next_reminder_at ? new Date(item.next_reminder_at).toLocaleString() : "Not scheduled"}</div> : null}</div>)}
          {last ? <p className="sub">{last.recipient_email ? `Email to ${last.recipient_email} · ` : ""}{new Date(last.created_at).toLocaleString()}{last.detail ? ` · ${last.detail}` : ""}</p> : null}
        </div>;
      })}</section> : null}
    </div>
  </Drawer>;
}
