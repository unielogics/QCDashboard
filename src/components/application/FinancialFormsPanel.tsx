"use client";

// The four financial forms, in one place, with where each one stands.
//
// This replaces two panels that overlapped: an older one that could request a
// form and open a modal whose figures were then discarded, and a newer one that
// only handled the statement. Two panels on two tabs meant the answer to "has
// this borrower given us their debt schedule" depended on which screen you
// happened to be looking at.
//
// The status line is the point. "Filled in" means we hold the figures and they
// can be corrected here; "Uploaded" means a document satisfies the request and
// only the borrower can replace it. Both are done, and they are not the same
// kind of done — one is a thirty-second fix, the other is a phone call.
//
// The profit and loss statement and the balance sheet joined the personal
// statement and the debt schedule here. They come with one more thing: a
// packet link that opens all four at once, which the desk copies and forwards
// — to the borrower, or on to their accountant — and can close from here.

import { useCallback, useEffect, useState } from "react";
import { Btn, CellChip, Panel, StatusLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import type { StatementKind } from "./BusinessStatementForm";
import { ShareWorksheetDialog } from "./WorksheetModal";
import { FinancialWorkspace } from "./FinancialWorkspace";
import { RequestFilesDialog } from "./RequestFilesDialog";
import type { SheetKind } from "@/components/sheet/types";

type FormKind = "pfs" | "debt_schedule" | StatementKind;

/** What a link can be minted for: any one form, or the packet of all four. */
type LinkKind = FormKind | "packet";

type UploadedStatement = {
  statement_date: string | null;
  total_assets: number | null;
  total_liabilities: number | null;
  net_worth: number | null;
  liquid_assets: number | null;
};

type FormStatus = {
  kind: FormKind;
  label: string;
  requested: boolean;
  satisfied: boolean;
  source: "filled" | "uploaded" | "none";
  statement_id: string | null;
  row_count: number;
  total_monthly: number | null;
  total_balance: number | null;
  net_worth: number | null;
  updated_at: string | null;
  filled_by_staff: boolean;
  /** Where the figures came from — a typed form or an analyzed upload. */
  figures_from: "form" | "document" | null;
  /** One per analyzed PFS. Two documents are two people, never one balance sheet. */
  statements: UploadedStatement[];
  /** A document is on file but has not been read yet. The figures are coming. */
  analysis_pending: boolean;
  /** The two business statements only: the period or the as-of date, and the
   *  headline figures the server derived on save (or read off an upload). */
  period_label?: string | null;
  net_income?: number | null;
  ebitda?: number | null;
  total_assets?: number | null;
  total_liabilities?: number | null;
  total_equity?: number | null;
  balances?: boolean | null;
  /** The debt schedule only: the desk declared the business carries no debt. */
  voided?: { reason: string; by: string | null; by_user_id: string | null; at: string | null } | null;
};

type Packet = {
  packet_id: string;
  created_at: string;
  expires_at: string;
  completed_kinds: string[];
  revoked: boolean;
};

const currency = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const shortDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const isStatementKind = (kind: FormKind): kind is StatementKind =>
  kind === "p_and_l" || kind === "balance_sheet";

/** What the desk needs to know at a glance, in words rather than a tick. */
function statusChip(form: FormStatus) {
  if (form.voided) return <CellChip tone="ok">Voided · no debt</CellChip>;
  if (form.source === "filled") return <CellChip tone="ok">Filled in</CellChip>;
  if (form.source === "uploaded") return <CellChip tone="ok">Uploaded</CellChip>;
  if (form.requested) return <CellChip tone="warn">Outstanding</CellChip>;
  return <CellChip tone="mut">Not requested</CellChip>;
}

/** One statement, spelled out. Assets and liabilities travel with net worth
 *  rather than standing behind it: a document whose net-worth line reads zero
 *  against several million in assets is a misread, and the desk can only see
 *  that if all three are on screen. */
function statementLine(one: UploadedStatement): string {
  const parts: string[] = [];
  if (one.net_worth !== null) parts.push(`Net worth ${currency(one.net_worth)}`);
  if (one.total_assets !== null) parts.push(`assets ${currency(one.total_assets)}`);
  if (one.total_liabilities !== null) parts.push(`liabilities ${currency(one.total_liabilities)}`);
  if (one.liquid_assets !== null) parts.push(`liquid ${currency(one.liquid_assets)}`);
  const dated = one.statement_date ? ` (as of ${one.statement_date})` : "";
  return `${parts.join(" · ")}${dated}`;
}

/** "as of Jun 30, 2026" — unless the label already says so. */
function asOf(label: string): string {
  return /^as of/i.test(label.trim()) ? label.trim() : `as of ${label.trim()}`;
}

/** Everything worth saying about where this form stands, one line each.
 *
 *  An upload is the other way either form gets satisfied, and the figures on it
 *  are already read — so they belong here beside the typed ones rather than
 *  behind a line saying there is nothing to see. */
function summaryLines(form: FormStatus): string[] {
  // A document is on file but the analyzer has not finished. "Coming" and
  // "absent" are different answers and the desk should not have to guess which.
  if (form.analysis_pending) {
    return ["Reading the uploaded document — the figures will appear here shortly."];
  }

  if (form.kind === "pfs") {
    // Net worth is only a figure once the statement has been filed. A draft
    // nobody has typed into totals to zero, and "Net worth $0" sitting beside
    // "Outstanding" reads as a finding about the borrower rather than an empty
    // form — so say what is actually there instead.
    if (form.source === "filled" && form.net_worth !== null) {
      return [`Net worth ${currency(form.net_worth)}`];
    }
    if (form.statements.length > 0) {
      // A PFS belongs to one person. Two documents are two people, so they get
      // a line each — the combined figure would be a household balance sheet
      // neither of them signed.
      return form.statements.map(statementLine).filter(Boolean);
    }
    if (form.source === "none" && form.statement_id) {
      return ["A draft has been started. Open it to carry on where it was left."];
    }
  }

  if (form.kind === "debt_schedule" && form.voided) {
    const who = form.voided.by ? `by ${form.voided.by}` : "by the desk";
    const when = form.voided.at ? ` on ${shortDate(form.voided.at)}` : "";
    return [`No debt on the business, declared ${who}${when}. ${form.voided.reason}`];
  }

  if (form.kind === "debt_schedule" && form.row_count > 0) {
    return [
      `${form.row_count} obligation${form.row_count === 1 ? "" : "s"} · ${form.total_monthly == null ? "monthly payments incomplete" : `${currency(form.total_monthly)} a month`} · ${form.total_balance == null ? "balances incomplete" : `${currency(form.total_balance)} outstanding`}`,
    ];
  }

  // "Net income $X · EBITDA $Y · Jan–Jun 2026". EBITDA sits beside net income
  // because it is the figure the desk actually prices off, and the period
  // because six months and twelve are not the same number.
  if (form.kind === "p_and_l") {
    const parts: string[] = [];
    if (form.net_income !== null && form.net_income !== undefined) parts.push(`Net income ${currency(form.net_income)}`);
    if (form.ebitda !== null && form.ebitda !== undefined) parts.push(`EBITDA ${currency(form.ebitda)}`);
    if (parts.length > 0) {
      if (form.period_label) parts.push(form.period_label);
      return [parts.join(" · ")];
    }
    if (form.source === "none" && form.statement_id) {
      return ["A draft has been started. Open it to carry on where it was left."];
    }
  }

  // "Assets $A · liabilities $L · equity $E as of … (does not balance)". The
  // imbalance is said out loud: a sheet that does not balance is not wrong to
  // hold, but it is wrong to quote without saying so.
  if (form.kind === "balance_sheet") {
    const parts: string[] = [];
    if (form.total_assets !== null && form.total_assets !== undefined) parts.push(`Assets ${currency(form.total_assets)}`);
    if (form.total_liabilities !== null && form.total_liabilities !== undefined) {
      parts.push(`liabilities ${currency(form.total_liabilities)}`);
    }
    if (form.total_equity !== null && form.total_equity !== undefined) parts.push(`equity ${currency(form.total_equity)}`);
    if (parts.length > 0) {
      const dated = form.period_label ? ` ${asOf(form.period_label)}` : "";
      const unbalanced = form.balances === false ? " (does not balance)" : "";
      return [`${parts.join(" · ")}${dated}${unbalanced}`];
    }
    if (form.source === "none" && form.statement_id) {
      return ["A draft has been started. Open it to carry on where it was left."];
    }
  }

  if (form.source === "uploaded") {
    return [
      "Satisfied by a document, but no figures could be read off it. Open the file to check it, or fill the form in to hold the numbers.",
    ];
  }
  return [];
}

export function FinancialFormsPanel({ profileId, intakeId, nested = false, onChange, onUploadFiles }: {
  profileId?: string | null; intakeId?: string | null; nested?: boolean; onChange?: () => void; onUploadFiles?: (files: File[]) => Promise<void>; onPreviewFile?: (fileId: string) => void;
}) {
  const api = useAuthedApi();
  const [resolvedId, setResolvedId] = useState<string | null>(profileId ?? null);
  const [forms, setForms] = useState<FormStatus[]>([]);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [workspace, setWorkspace] = useState<{ kind: SheetKind; view: "form" | "worksheet" | "pdf" } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [shown, setShown] = useState<{ kind: LinkKind; url: string } | null>(null);
  const [copied, setCopied] = useState<LinkKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    let id = profileId ?? resolvedId;
    if (!id && intakeId) {
      const profile = await api<{ id: string }>("/application-profiles/resolve", { method: "POST", body: JSON.stringify({ source_kind: "intake", source_id: intakeId }) });
      id = profile.id; setResolvedId(id);
    }
    if (!id) return;
    const status = await api<{ forms: FormStatus[]; packets?: Packet[] }>(`/application-profiles/${id}/financial-forms`);
    setForms(status.forms); setPackets(status.packets ?? []);
  }, [api, intakeId, profileId, resolvedId]);
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Financial forms could not be loaded.")); }, [load]);
  const pending = forms.some((form) => form.analysis_pending);
  useEffect(() => {
    if (!pending) return;
    const until = Date.now() + 4 * 60 * 1000;
    const timer = window.setInterval(() => { if (Date.now() > until) window.clearInterval(timer); else void load().catch(() => undefined); }, 6000);
    return () => window.clearInterval(timer);
  }, [load, pending]);
  const fileId = profileId ?? resolvedId;
  if (!fileId) return null;
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label); setError(null);
    try { await work(); await load(); onChange?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That did not work."); }
    finally { setBusy(""); }
  };
  const copyLink = (kind: LinkKind) => void run(`link:${kind}`, async () => {
    const result = await api<{ url: string }>(`/application-profiles/${fileId}/financial-forms/${kind}/link`, { method: "POST" });
    setShown({ kind, url: result.url });
    try { await navigator.clipboard.writeText(result.url); setCopied(kind); window.setTimeout(() => setCopied(null), 4000); } catch { /* The link remains selectable below. */ }
  });
  const body = <>
    {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    <div className="row"><span className="sub grow">Open any form to work with its form, worksheet, source PDFs, and dated versions.</span><Btn size="sm" onClick={() => setRequestOpen(true)}><Icon name="mail" size={14} />Request files</Btn></div>
    {shown ? <div className="form-link-out"><span className="lbl">{copied === shown.kind ? "Copied" : "Secure borrower link"}</span><input readOnly value={shown.url} onFocus={(event) => event.currentTarget.select()} /><span className="sub">Expires in 30 days.</span></div> : null}
    {forms.map((form) => <div key={form.kind} className="filerow">
      <Icon name="doc" size={15} /><div className="grow grid g4"><div className="row"><b>{form.label}</b>{statusChip(form)}{form.figures_from === "document" ? <CellChip tone="mut">Read from document</CellChip> : null}</div>{summaryLines(form).map((line) => <span key={line} className="sub">{line}</span>)}</div>
      <Btn size="sm" disabled={Boolean(busy)} onClick={() => setWorkspace({ kind: form.kind, view: "form" })}>Open workspace</Btn>
      <Btn size="sm" disabled={Boolean(busy)} onClick={() => copyLink(form.kind)}>{copied === form.kind ? "Copied" : "Copy link"}</Btn>
      {form.source !== "none" || form.statement_id || form.row_count > 0 ? <Btn size="sm" onClick={() => setWorkspace({ kind: form.kind, view: "pdf" })}>PDF & versions</Btn> : null}
    </div>)}
    <div className="filerow"><Icon name="calc" size={15} /><div className="grow grid g4"><b>Financial worksheet</b><span className="sub">The same draft figures in a grid. Save a version to update financials and AI.</span></div><Btn size="sm" onClick={() => setWorkspace({ kind: "debt_schedule", view: "worksheet" })}>Open worksheet</Btn><Btn size="sm" onClick={() => setShareOpen(true)}>Share worksheet</Btn></div>
    <div className="filerow"><Icon name="link" size={15} /><div className="grow grid g4"><b>All four forms, one link</b><span className="sub">Send the borrower one link to complete all four forms. Expires in 30 days.</span></div><Btn size="sm" disabled={Boolean(busy)} onClick={() => copyLink("packet")}>Copy packet link</Btn></div>
    {packets.filter((packet) => !packet.revoked).map((packet) => <div className="filerow" key={packet.packet_id}><Icon name="send" size={15} /><div className="grow grid g4"><b>Packet sent {shortDate(packet.created_at)}</b><span className="sub">{packet.completed_kinds.length} of 4 sent back · expires {shortDate(packet.expires_at)}</span></div><Btn size="sm" disabled={Boolean(busy)} onClick={() => void run("revoke", async () => { await api(`/application-profiles/${fileId}/financial-forms/packets/${packet.packet_id}/revoke`, { method: "POST" }); if (shown?.kind === "packet") setShown(null); })}>Close link</Btn></div>)}
    {workspace ? <FinancialWorkspace open profileId={fileId} initialKind={workspace.kind} initialView={workspace.view} onClose={() => { setWorkspace(null); void load(); }} onPublished={async () => { await load(); onChange?.(); }} onUploadFiles={onUploadFiles} /> : null}
    {shareOpen ? <ShareWorksheetDialog open profileId={fileId} onClose={() => setShareOpen(false)} /> : null}
    {requestOpen ? <RequestFilesDialog open profileId={fileId} onClose={() => setRequestOpen(false)} onRequested={() => { void load(); onChange?.(); }} /> : null}
  </>;
  const blurb = "A profit and loss statement, balance sheet, business debt schedule, and personal financial statement, each with one shared workspace and dated versions.";
  return nested ? <div className="grid g10 mt"><div><strong>Financial forms</strong><div className="sub">{blurb}</div></div>{body}</div> : <Panel title="Financial forms" sub={blurb} bodyClass="grid g10">{body}</Panel>;
}
