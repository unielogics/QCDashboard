"use client";

// The merchant-processing offer, from the desk's side.
//
// Lives inside the Underwriting panel of the lead page. The processing
// partner's terms PDF is dropped here; the system reads it; the figures
// show up in this strip with their provenance, the desk corrects any of
// them, picks the partner and presses Send; the client answers from their
// room; the answer and the partner-email outcome come back here.
//
// The client's decision is shown as a chip, never as a button, so it cannot
// be confused with the desk's own Approved / Denied lifecycle buttons that
// sit below this strip.

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, CellChip, cx, Field, Input, Row, Select, Textarea, WarnLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";

type OfferOption = { label: string | null; effective_rate_pct: number | null; monthly_fees: number | null; monthly_savings: number | null };
type OfferTerms = Record<string, string | number | null | OfferOption[] | undefined> & { options?: OfferOption[] };

export type MerchantOffer = {
  id: string;
  status: "uploaded" | "extracted" | "unreadable" | "sent" | "accepted" | "declined" | string;
  terms: OfferTerms;
  desk_terms: Record<string, string | number | null | undefined>;
  terms_version: number;
  estimated_monthly_savings: number | null;
  estimated_annual_savings: number | null;
  savings_basis: string | null;
  savings_warning: string | null;
  extraction_confidence: string | null;
  extraction_error: string | null;
  lender_id: string | null;
  lender_name: string | null;
  source_file_id: string | null;
  source_file_name: string | null;
  source_file_url: string | null;
  sent_at: string | null;
  sent_by_name: string | null;
  client_response: string | null;
  client_response_at: string | null;
  client_response_reason: string | null;
  client_response_name: string | null;
  client_response_ip: string | null;
  partner_email_status: string | null;
  partner_email_error: string | null;
  partner_email_at: string | null;
  pro_forma: { dscr_now: number; dscr_with_saving: number; annual_saving: number; basis: string } | null;
  created_at: string;
};

type OfferPanel = {
  available: boolean;
  reason: string | null;
  offer: MerchantOffer | null;
  history_count: number;
  room_url: string | null;
  partners: Array<{ id: string; name: string; email: string | null }>;
};

const MONEY_FIELDS: Array<{ key: string; label: string; kind: "money" | "pct" | "bps" | "months" | "text" }> = [
  { key: "provider_name", label: "Partner named on the sheet", kind: "text" },
  { key: "current_processor", label: "Current processor", kind: "text" },
  { key: "current_monthly_volume", label: "Monthly card volume", kind: "money" },
  { key: "current_monthly_fees", label: "Monthly fees today", kind: "money" },
  { key: "current_effective_rate_pct", label: "Effective rate today", kind: "pct" },
  { key: "proposed_monthly_fees", label: "Monthly fees proposed", kind: "money" },
  { key: "proposed_effective_rate_pct", label: "Effective rate proposed", kind: "pct" },
  { key: "proposed_pricing_model", label: "Pricing model", kind: "text" },
  { key: "proposed_markup_bps", label: "Markup (bps)", kind: "bps" },
  { key: "proposed_per_item_fee", label: "Per-item fee", kind: "money" },
  { key: "proposed_fixed_monthly_fees", label: "Fixed monthly fees", kind: "money" },
  { key: "stated_annual_savings", label: "Saving the sheet states (annual)", kind: "money" },
  { key: "contract_term_months", label: "Contract term (months)", kind: "months" },
  { key: "early_termination_fee", label: "Early termination fee", kind: "money" },
];

const DESK_FIELDS: Array<{ key: string; label: string }> = [
  { key: "agent_residual_pct", label: "Our residual (%)" },
  { key: "agent_residual_monthly", label: "Our residual ($/mo)" },
  { key: "signing_bonus", label: "Signing bonus ($)" },
];

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function when(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function draftFromOffer(offer: MerchantOffer | null): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of MONEY_FIELDS) {
    const value = offer?.terms?.[field.key];
    draft[field.key] = value === null || value === undefined ? "" : String(value);
  }
  for (const field of DESK_FIELDS) {
    const value = offer?.desk_terms?.[field.key];
    draft[field.key] = value === null || value === undefined ? "" : String(value);
  }
  draft.notes = typeof offer?.terms?.notes === "string" ? offer.terms.notes : "";
  draft.override_annual = "";
  return draft;
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[$,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const BASIS_LABEL: Record<string, string> = {
  fees_diff: "fees today minus fees proposed",
  rate_x_volume: "volume × the rate difference",
  stated: "the figure the sheet states",
  manual: "entered by the desk",
};

export function MerchantOfferStrip({
  profileId,
  onStatus,
  onTargetDscr,
}: {
  profileId?: string | null;
  /** The page shows a chip in its header from this. */
  onStatus?: (status: string | null) => void;
  /** Fills the panel's Target DSCR input; the human presses Save. */
  onTargetDscr?: (value: number) => void;
}) {
  const api = useAuthedApi();
  const [panel, setPanel] = useState<OfferPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => draftFromOffer(null));
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sendAnyway, setSendAnyway] = useState(false);
  const [sendNoPartner, setSendNoPartner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const base = profileId ? `/application-profiles/${profileId}/merchant-offer` : null;
  const offer = panel?.offer ?? null;

  const load = useCallback(async () => {
    if (!base) return;
    try {
      const next = await api<OfferPanel>(base);
      setPanel(next);
      setError(null);
      onStatus?.(next.offer?.status ?? null);
      if (!dirty) setDraft(draftFromOffer(next.offer));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The processing offer could not be loaded.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, base, dirty]);

  useEffect(() => {
    void load();
  }, [load]);

  // While the drain reads the PDF, ask again every few seconds.
  useEffect(() => {
    if (offer?.status !== "uploaded") return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [offer?.status, load]);

  if (!base) return null;

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
      setDirty(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That did not work.");
    } finally {
      setBusy("");
    }
  };

  const post = <T,>(path: string, body?: unknown) =>
    api<T>(`${base}${path}`, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });

  async function upload(files: File[]) {
    const file = files[0];
    if (!file || !base) return;
    setUploading(true);
    setError(null);
    setUploadStatus(`Uploading ${file.name}…`);
    try {
      const init = await post<{ file_id: string; upload_url: string; required_headers: Record<string, string> }>("/upload-init", {
        file_name: file.name,
        content_type: file.type || "application/pdf",
        size_bytes: file.size,
      });
      const put = await fetch(init.upload_url, { method: "PUT", body: file, headers: init.required_headers });
      if (!put.ok) throw new Error(`${file.name} could not be uploaded.`);
      setUploadStatus("Reading the terms…");
      const next = await post<OfferPanel>("/upload-complete", { file_id: init.file_id });
      setPanel(next);
      setDirty(false);
      setDraft(draftFromOffer(next.offer));
      onStatus?.(next.offer?.status ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadStatus("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const save = () =>
    run("save", async () => {
      const terms: Record<string, string | number | null> = {};
      for (const field of MONEY_FIELDS) {
        terms[field.key] = field.kind === "text" ? draft[field.key].trim() || null : numberOrNull(draft[field.key]);
      }
      terms.notes = draft.notes.trim() || null;
      const desk_terms: Record<string, number | null> = {};
      for (const field of DESK_FIELDS) desk_terms[field.key] = numberOrNull(draft[field.key]);
      const override = numberOrNull(draft.override_annual);
      const body: Record<string, unknown> = { terms, desk_terms };
      if (override !== null) body.estimated_annual_savings = override;
      await api(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setEditing(false);
    });

  const choosePartner = (lenderId: string) =>
    run("partner", () =>
      api(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lenderId ? { lender_id: lenderId } : { clear_lender: true }),
      }),
    );

  const send = () => run("send", () => post("/send", { confirm_no_saving: sendAnyway, confirm_no_partner: sendNoPartner }));
  const withdraw = () => run("withdraw", () => post("/withdraw"));
  const reread = () => run("reread", () => post("/reanalyze"));
  const resend = () => run("resend", () => post("/partner-email/resend"));
  const notifyClient = () =>
    run("notify", async () => {
      const result = await post<{ overall_status: string; room_url: string }>("/notify-client", {});
      setNotifyResult(result.overall_status === "success" ? "Room link emailed to the client." : `Room link email ${result.overall_status}.`);
    });

  const copyRoomLink = async () => {
    if (!panel?.room_url) return;
    try {
      await navigator.clipboard.writeText(panel.room_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      // The link stays on screen to select by hand.
    }
  };

  const setField = (key: string, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const dropzone = (
    <>
      <input ref={fileInputRef} type="file" hidden accept=".pdf,application/pdf" aria-label="Upload the processing partner's terms PDF" onChange={(event) => void upload(Array.from(event.target.files ?? []))} />
      <button
        type="button"
        className={cx("intake-evidence-dropzone", dragging && "dragging")}
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); if (!uploading) setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (!uploading) void upload(Array.from(event.dataTransfer.files)); }}
      >
        <span className="intake-evidence-dropzone-icon"><Icon name="upload" size={21} /></span>
        <span className="intake-evidence-dropzone-copy">
          <b>{uploading ? uploadStatus || "Uploading…" : offer ? "Drop a newer terms PDF to replace this offer" : "Drop the processing partner's terms PDF here"}</b>
          <small>{uploading ? "Keep this file open while the upload finishes." : "The system reads it, works out the estimated annual saving, and you send it to the client from here. The PDF never reaches the client's file list or a lender package."}</small>
        </span>
        <span className="intake-evidence-browse-label">{uploading ? "Uploading" : "Browse computer"}</span>
      </button>
    </>
  );

  const decisionChip = offer?.client_response ? (
    <CellChip tone={offer.client_response === "accepted" ? "ok" : "bad"}>
      {offer.client_response === "accepted" ? "Accepted" : "Declined"} by {offer.client_response_name || "the client"} · {when(offer.client_response_at)}
    </CellChip>
  ) : null;

  const partnerLine = offer?.client_response ? (
    offer.partner_email_status === "sent" ? (
      <span className="sub">Partner emailed {when(offer.partner_email_at)}{offer.lender_name ? ` (${offer.lender_name})` : ""}.</span>
    ) : (
      <span className="sub c-bad">
        {offer.partner_email_status === "skipped" ? `Partner not emailed — ${offer.partner_email_error || "skipped"}` : `Partner email failed — ${offer.partner_email_error || "unknown error"}`}
      </span>
    )
  ) : null;

  const provenance = offer ? (
    offer.savings_basis === "manual" || offer.terms_version > 1 ? (
      <CellChip tone="warn">Edited by the desk · v{offer.terms_version}</CellChip>
    ) : offer.extraction_confidence ? (
      <CellChip tone="acc">Read by AI from {offer.source_file_name || "the PDF"} · confidence {offer.extraction_confidence}</CellChip>
    ) : null
  ) : null;

  return (
    <div className="underwriting-status-strip underwriting-merchant-strip" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
      <div>
        <span className="lbl">Merchant processing offer</span>
        {!panel ? (
          <b>Loading the processing offer…</b>
        ) : !panel.available ? (
          <>
            <b>Not available on this file</b>
            <span className="sub">{panel.reason}</span>
          </>
        ) : !offer ? (
          <>
            <b>No offer on this file yet</b>
            <span className="sub">Drop the processing partner&apos;s terms sheet for this client. {panel.history_count ? `${panel.history_count} earlier offer${panel.history_count === 1 ? "" : "s"} on this file.` : ""}</span>
          </>
        ) : (
          <>
            <b>
              {offer.status === "uploaded"
                ? "Reading the terms…"
                : offer.estimated_annual_savings !== null
                  ? `Estimated annual savings ${money(offer.estimated_annual_savings)}`
                  : offer.status === "unreadable"
                    ? "The PDF could not be read — enter the figures below"
                    : "No saving computed yet"}
            </b>
            <span className="sub">
              {offer.status === "uploaded" ? "The system is reading the partner's sheet; this refreshes on its own." : null}
              {offer.status !== "uploaded" && offer.estimated_monthly_savings !== null ? `About ${money(offer.estimated_monthly_savings)} a month · basis: ${BASIS_LABEL[offer.savings_basis || ""] || offer.savings_basis || "—"}. ` : null}
              {offer.status === "sent" ? `Sent ${when(offer.sent_at)}${offer.sent_by_name ? ` by ${offer.sent_by_name}` : ""} · awaiting the client.` : null}
              {offer.status === "unreadable" && offer.extraction_error ? offer.extraction_error : null}
            </span>
            <div className="row" style={{ marginTop: 6, flexWrap: "wrap", gap: 6 }}>
              {provenance}
              {decisionChip}
              {offer.lender_name && !offer.client_response ? <CellChip>Partner: {offer.lender_name}</CellChip> : null}
              {offer.pro_forma ? <CellChip tone="acc">DSCR {offer.pro_forma.dscr_now.toFixed(2)}x → {offer.pro_forma.dscr_with_saving.toFixed(2)}x with the saving (pro-forma)</CellChip> : null}
            </div>
            {partnerLine ? <div style={{ marginTop: 4 }}>{partnerLine}</div> : null}
          </>
        )}
      </div>

      {error ? <WarnLine>{error}</WarnLine> : null}
      {offer?.savings_warning && !offer.client_response ? <WarnLine>{offer.savings_warning}</WarnLine> : null}
      {notifyResult ? <div className="statusline">{notifyResult}</div> : null}

      {panel?.available && (!offer || offer.status === "uploaded" || offer.status === "extracted" || offer.status === "unreadable") ? dropzone : null}

      {offer && offer.status !== "uploaded" && !offer.client_response ? (
        <>
          {editing || offer.status === "unreadable" ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="fldgrid three">
                {MONEY_FIELDS.map((field) => (
                  <Field key={field.key} label={field.label}>
                    <Input inputMode={field.kind === "text" ? undefined : "decimal"} value={draft[field.key] ?? ""} onChange={(event) => setField(field.key, event.target.value)} placeholder={field.kind === "money" ? "0.00" : field.kind === "pct" ? "0.00" : ""} />
                  </Field>
                ))}
              </div>
              <Field label="Notes on the sheet (the client can see these)">
                <Textarea rows={2} value={draft.notes} onChange={(event) => setField("notes", event.target.value)} />
              </Field>
              <div>
                <span className="lbl">Desk only — never shown to the client</span>
                <div className="fldgrid three">
                  {DESK_FIELDS.map((field) => (
                    <Field key={field.key} label={field.label}>
                      <Input inputMode="decimal" value={draft[field.key] ?? ""} onChange={(event) => setField(field.key, event.target.value)} />
                    </Field>
                  ))}
                  <Field label="Annual saving override ($)">
                    <Input inputMode="decimal" value={draft.override_annual} onChange={(event) => setField("override_annual", event.target.value)} placeholder="Leave blank to compute from the figures" />
                  </Field>
                </div>
              </div>
              <Row>
                <Btn variant="pri" onClick={save} disabled={busy !== ""}>{busy === "save" ? "Saving…" : "Save figures"}</Btn>
                {offer.status !== "unreadable" ? <Btn onClick={() => { setEditing(false); setDirty(false); setDraft(draftFromOffer(offer)); }} disabled={busy !== ""}>Cancel</Btn> : null}
              </Row>
            </div>
          ) : (
            <div className="fldgrid three" style={{ rowGap: 4 }}>
              {MONEY_FIELDS.filter((field) => offer.terms?.[field.key] !== null && offer.terms?.[field.key] !== undefined).map((field) => {
                const value = offer.terms[field.key];
                const text = field.kind === "money" ? money(typeof value === "number" ? value : null) : field.kind === "pct" ? `${value}%` : String(value);
                return (
                  <div key={field.key}>
                    <span className="lbl">{field.label}</span>
                    <b>{text}</b>
                  </div>
                );
              })}
              {Array.isArray(offer.terms?.options) && offer.terms.options.length ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span className="lbl">Options the sheet prints</span>
                  <b>{offer.terms.options.map((option) => `${option.label || "Option"}${option.effective_rate_pct !== null ? ` · ${option.effective_rate_pct}%` : ""}${option.monthly_savings !== null ? ` · saves ${money(option.monthly_savings)}/mo` : ""}`).join(" — ")}</b>
                </div>
              ) : null}
              {DESK_FIELDS.some((field) => offer.desk_terms?.[field.key] !== null && offer.desk_terms?.[field.key] !== undefined) ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span className="lbl">Desk only</span>
                  <b>{DESK_FIELDS.filter((field) => offer.desk_terms?.[field.key] !== null && offer.desk_terms?.[field.key] !== undefined).map((field) => `${field.label}: ${offer.desk_terms[field.key]}`).join(" · ")}</b>
                </div>
              ) : null}
            </div>
          )}

          <div className="fldgrid three" style={{ alignItems: "end" }}>
            <Field label="Processing partner (emailed when the client answers)">
              <Select value={offer.lender_id ?? ""} disabled={busy !== "" || offer.status === "sent"} onChange={(event) => void choosePartner(event.target.value)}>
                <option value="">No partner selected</option>
                {panel?.partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}{partner.email ? "" : " (no email on roster)"}</option>)}
              </Select>
            </Field>
            {offer.pro_forma && onTargetDscr ? (
              <Field label="Pro-forma DSCR with the saving">
                <Row>
                  <b>{offer.pro_forma.dscr_with_saving.toFixed(2)}x</b>
                  <Btn onClick={() => onTargetDscr(offer.pro_forma!.dscr_with_saving)} disabled={busy !== ""}>Use as target DSCR</Btn>
                </Row>
              </Field>
            ) : null}
          </div>

          {offer.status !== "sent" ? (
            <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {!editing && offer.status !== "unreadable" ? <Btn onClick={() => setEditing(true)} disabled={busy !== ""}>Correct figures</Btn> : null}
              <Btn variant="pri" onClick={send} disabled={busy !== "" || editing || offer.estimated_annual_savings === null}>{busy === "send" ? "Sending…" : "Send to client"}</Btn>
              {offer.estimated_annual_savings !== null && offer.estimated_annual_savings <= 0 ? (
                <label className="sub" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={sendAnyway} onChange={(event) => setSendAnyway(event.target.checked)} /> send anyway (no saving)</label>
              ) : null}
              {!offer.lender_id ? (
                <label className="sub" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={sendNoPartner} onChange={(event) => setSendNoPartner(event.target.checked)} /> send without a partner</label>
              ) : null}
              {offer.source_file_id ? <Btn onClick={reread} disabled={busy !== ""}>{busy === "reread" ? "Reading…" : "Re-read PDF"}</Btn> : null}
              {offer.source_file_url ? <a className="btn" href={offer.source_file_url} target="_blank" rel="noreferrer">Open PDF</a> : null}
              <Btn onClick={withdraw} disabled={busy !== ""}>Withdraw</Btn>
            </div>
          ) : (
            <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {panel?.room_url ? <Btn onClick={() => void copyRoomLink()}>{copied ? "Link copied" : "Copy room link"}</Btn> : null}
              <Btn onClick={notifyClient} disabled={busy !== ""}>{busy === "notify" ? "Emailing…" : "Email the room link"}</Btn>
              {offer.source_file_url ? <a className="btn" href={offer.source_file_url} target="_blank" rel="noreferrer">Open PDF</a> : null}
              <Btn onClick={withdraw} disabled={busy !== ""}>Withdraw</Btn>
            </div>
          )}
        </>
      ) : null}

      {offer?.client_response ? (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {offer.client_response_reason ? <span className="sub">Reason: {offer.client_response_reason}</span> : null}
          {offer.partner_email_status !== "sent" ? <Btn onClick={resend} disabled={busy !== ""}>{busy === "resend" ? "Sending…" : "Resend partner email"}</Btn> : null}
          {offer.partner_email_status !== "sent" && !offer.lender_id ? (
            <Select value="" disabled={busy !== ""} onChange={(event) => void choosePartner(event.target.value)} aria-label="Pick the processing partner">
              <option value="">Pick a partner first…</option>
              {panel?.partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
            </Select>
          ) : null}
          {offer.source_file_url ? <a className="btn" href={offer.source_file_url} target="_blank" rel="noreferrer">Open PDF</a> : null}
          <Btn onClick={withdraw} disabled={busy !== ""}>Withdraw</Btn>
        </div>
      ) : null}
    </div>
  );
}
