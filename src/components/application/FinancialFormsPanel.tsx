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
import { Btn, CellChip, Panel, Row, StatusLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi, useFinancialFormPdf } from "@/hooks/useApi";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";
import { DebtScheduleForm, type DebtBody } from "@/components/application/DebtScheduleForm";
import {
  BusinessStatementForm,
  type StatementBody,
  type StatementKind,
  type StatementSchema,
} from "@/components/application/BusinessStatementForm";
import { ShareWorksheetDialog, WorksheetModal } from "@/components/application/WorksheetModal";

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
  total_monthly: number;
  total_balance: number;
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

  if (form.kind === "debt_schedule" && form.row_count > 0) {
    return [
      `${form.row_count} obligation${form.row_count === 1 ? "" : "s"} · ${currency(
        form.total_monthly,
      )} a month · ${currency(form.total_balance)} outstanding`,
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

export function FinancialFormsPanel({
  profileId,
  intakeId,
  nested = false,
}: {
  profileId?: string | null;
  /** Resolve the profile ourselves when the caller has not loaded it. The
   *  evidence tab renders before the underwriting state does, and a panel that
   *  silently shows nothing is worse than one that fetches what it needs. */
  intakeId?: string | null;
  /** Rendered inside another panel, so it drops its own frame. */
  nested?: boolean;
}) {
  const api = useAuthedApi();
  const pdf = useFinancialFormPdf();
  const [resolvedId, setResolvedId] = useState<string | null>(profileId ?? null);
  const [forms, setForms] = useState<FormStatus[]>([]);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [schema, setSchema] = useState<PfsSchema | null>(null);
  // The two statement schemas, fetched the first time either editor opens and
  // kept for the session. They are static per deployment.
  const [statementSchemas, setStatementSchemas] = useState<Partial<Record<StatementKind, StatementSchema>>>({});
  const [editing, setEditing] = useState<FormKind | null>(null);
  const [pfsBody, setPfsBody] = useState<PfsBody>({});
  const [debtBody, setDebtBody] = useState<DebtBody>({});
  const [statementBody, setStatementBody] = useState<StatementBody>({});
  const [statementId, setStatementId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState<LinkKind | null>(null);
  const [shown, setShown] = useState<{ kind: LinkKind; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The same four forms as one workbook — the grid over the file, and the link
  // that opens part of it to somebody with no login. Both live in
  // WorksheetModal.tsx; this panel only says when they are on screen.
  const [worksheetOpen, setWorksheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    let id = profileId ?? resolvedId;
    if (!id && intakeId) {
      const profile = await api<{ id: string }>("/application-profiles/resolve", {
        method: "POST",
        body: JSON.stringify({ source_kind: "intake", source_id: intakeId }),
      });
      id = profile.id;
      setResolvedId(profile.id);
    }
    if (!id) return;
    setError(null);
    try {
      const [status, fields] = await Promise.all([
        api<{ forms: FormStatus[]; packets?: Packet[] }>(`/application-profiles/${id}/financial-forms`),
        api<PfsSchema>("/application-profiles/financial-statements/schema"),
      ]);
      setForms(status.forms);
      setPackets(status.packets ?? []);
      setSchema(fields);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Financial forms could not be loaded.");
    }
  }, [api, intakeId, profileId, resolvedId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A document is read after it lands, not as it lands, so the figures show up
  // a little behind the upload. Poll while anything is still being read and
  // stop the moment it is — an idle panel should not be talking to the server.
  const analysisPending = forms.some((form) => form.analysis_pending);
  useEffect(() => {
    if (!analysisPending) return;
    // And give up after a few minutes. An analysis that gets stuck should not
    // leave a forgotten tab polling the API for the rest of the day.
    const until = Date.now() + 4 * 60 * 1000;
    const timer = window.setInterval(() => {
      if (Date.now() > until) {
        window.clearInterval(timer);
        return;
      }
      void load();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [analysisPending, load]);

  const fileId = profileId ?? resolvedId;
  if (!fileId) return null;

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That did not work.");
    } finally {
      setBusy("");
    }
  };

  /** A fresh token each time: only its hash is stored, so an old link cannot be
   *  read back — and one sent to the wrong address can be left to expire.
   *
   *  `packet` mints four links behind one URL; the server answers with the
   *  same `url` field, so the desk handles it exactly like the others. */
  const copyLink = (kind: LinkKind) =>
    run(`link:${kind}`, async () => {
      const minted = await api<{ url: string }>(
        `/application-profiles/${fileId}/financial-forms/${kind}/link`,
        { method: "POST" },
      );
      // Shown as well as copied. navigator.clipboard refuses in ways nobody can
      // diagnose from the outside — an unfocused document is enough — and a
      // link that was minted but never reached the clipboard leaves someone
      // certain the feature is broken. The text is the source of truth; the
      // copy is a convenience on top of it.
      setShown({ kind, url: minted.url });
      try {
        await navigator.clipboard.writeText(minted.url);
        setCopied(kind);
        window.setTimeout(() => setCopied(null), 4000);
      } catch {
        // Left on screen to select by hand.
      }
    });

  /** Close a forwarded packet: all four links behind it stop answering, and a
   *  tab somebody still has open flips to "no longer available" on its next
   *  save. The one way to take back a credential that was sent on. */
  const closePacket = (packetId: string) =>
    run(`close:${packetId}`, async () => {
      await api(`/application-profiles/${fileId}/financial-forms/packets/${packetId}/revoke`, {
        method: "POST",
      });
      if (shown?.kind === "packet") setShown(null);
    });

  /** The filled form as a PDF, rendered from what the file holds right now.
   *
   *  Opened in a tab rather than downloaded: the desk's usual next move is to
   *  read it before forwarding, and a file that lands in a downloads folder has
   *  to be found again first. The object URL is released on the next tick —
   *  long enough for the tab to have taken it, short of leaking the blob for
   *  the life of the session. */
  const openPdf = (kind: FormKind) =>
    run(`pdf:${kind}`, async () => {
      const { blob } = await pdf.mutateAsync({ profileId: fileId, kind });
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener");
      if (!opened) {
        // Popup blocked. Nothing opened and nothing said so, which is the same
        // silent failure the copy-link button used to have. Download still works.
        setError("Your browser blocked the new tab. Use Download instead, or allow pop-ups for this site.");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });

  /** The same document, saved rather than opened — for forwarding to a partner
   *  rather than reading. Uses the filename the server chose, which carries the
   *  business, the applicant and the date. */
  const downloadPdf = (kind: FormKind) =>
    run(`dl:${kind}`, async () => {
      const { blob, filename } = await pdf.mutateAsync({ profileId: fileId, kind });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });

  /** Put it on the checklist. Idempotent server-side, so a double click is
   *  harmless rather than producing two rows for the same thing. */
  const request = (kind: FormKind) =>
    run(`request:${kind}`, async () => {
      await api(`/application-profiles/${fileId}/financial-forms/${kind}/request`, {
        method: "POST",
      });
    });

  const open = (form: FormStatus) =>
    run(`open:${form.kind}`, async () => {
      if (form.kind === "debt_schedule") {
        // Opening an empty editor on a failed load used to be harmless, because
        // a save only replaced the desk's own rows. It still only touches the
        // desk's rows — but an explicit empty list now means "clear them", so
        // a load that failed must not open a form whose Save would do that.
        const rows = await api<{ debts: DebtBody["debts"] }>(
          `/application-profiles/${fileId}/financial-forms/debt-schedule/body`,
        ).catch(() => null);
        if (!rows) {
          setError("The debt schedule could not be loaded, so it was not opened. Try again in a moment.");
          return;
        }
        setDebtBody({ debts: rows.debts ?? [] });
        setEditing("debt_schedule");
        return;
      }
      if (isStatementKind(form.kind)) {
        const kind = form.kind;
        let fields = statementSchemas[kind];
        if (!fields) {
          fields = await api<StatementSchema>(`/application-profiles/financial-forms/schema/${kind}`);
          setStatementSchemas((current) => ({ ...current, [kind]: fields }));
        }
        // The body read answers an empty, seeded body when nothing has been
        // saved yet, so there is no create step the way the 413 has.
        const saved = await api<StatementBody & { status?: string | null; statement_id?: string | null }>(
          `/application-profiles/${fileId}/financial-forms/${kind}/body`,
        );
        setStatementBody({
          schema_version: saved.schema_version,
          header: saved.header ?? {},
          sections: saved.sections ?? {},
          notes: saved.notes ?? "",
        });
        setEditing(kind);
        return;
      }
      const statements = await api<Array<{ id: string; body: PfsBody }>>(
        `/application-profiles/${fileId}/financial-statements`,
      );
      const current = statements[0];
      if (current) {
        setStatementId(current.id);
        setPfsBody(current.body ?? {});
      } else {
        const created = await api<{ id: string; body: PfsBody }>(
          `/application-profiles/${fileId}/financial-statements`,
          { method: "POST", body: JSON.stringify({ body: {}, owners: [] }) },
        );
        setStatementId(created.id);
        setPfsBody(created.body ?? {});
      }
      setEditing("pfs");
    });

  const savePfs = () =>
    run("save", async () => {
      if (!statementId) return;
      await api(`/application-profiles/${fileId}/financial-statements/${statementId}`, {
        method: "PATCH",
        body: JSON.stringify({ body: pfsBody, owners: [] }),
      });
    });

  const filePfs = () =>
    run("file", async () => {
      if (!statementId) return;
      await api(
        `/application-profiles/${fileId}/financial-statements/${statementId}/submit`,
        { method: "POST" },
      );
      setEditing(null);
    });

  /** Save keeps the figures as a draft; File also renders the PDF onto the
   *  checklist — one call, `submit` decides which. */
  const saveStatement = (kind: StatementKind, submit: boolean) =>
    run(submit ? "file" : "save", async () => {
      await api(`/application-profiles/${fileId}/financial-forms/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ body: statementBody, submit }),
      });
      if (submit) setEditing(null);
    });

  const openPackets = packets.filter((packet) => !packet.revoked);
  const editingStatementSchema = editing && isStatementKind(editing) ? statementSchemas[editing] : null;

  const body = (
    <>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}

      {shown ? (
        <div className="form-link-out">
          <span className="lbl">
            {copied === shown.kind ? "Copied — also here if you need it" : "Send this to the borrower"}
          </span>
          <input readOnly value={shown.url} onFocus={(event) => event.currentTarget.select()} />
          <span className="sub">
            {shown.kind === "packet"
              ? "Opens all four forms. Expires in 30 days. Safe to forward to their accountant."
              : "Opens the form directly. Expires in 30 days."}
          </span>
        </div>
      ) : null}

      {forms.map((form) => (
        <div key={form.kind} className="filerow">
          <Icon name="doc" size={15} />
          <div className="grow grid g4">
            <div className="row">
              <b>{form.label}</b>
              {statusChip(form)}
              {form.filled_by_staff ? <CellChip tone="mut">Completed by staff</CellChip> : null}
              {/* Provenance, because a figure typed by the borrower and one read
                  off a scan carry different weight in a conversation with a lender. */}
              {form.figures_from === "document" ? <CellChip tone="mut">Read from the document</CellChip> : null}
            </div>
            {summaryLines(form).map((line) => (
              <span key={line} className="sub">
                {line}
              </span>
            ))}
          </div>
          {!form.requested ? (
            <Btn size="sm" disabled={busy !== ""} onClick={() => void request(form.kind)}>
              {busy === `request:${form.kind}` ? "Requesting…" : "Request it"}
            </Btn>
          ) : null}
          <Btn size="sm" disabled={busy !== ""} onClick={() => void copyLink(form.kind)}>
            {copied === form.kind
              ? "Copied"
              : busy === `link:${form.kind}`
                ? "Making a link…"
                : "Copy link"}
          </Btn>
          <Btn size="sm" disabled={busy !== ""} onClick={() => void open(form)}>
            {form.source === "filled" ? "Open" : "Fill in"}
          </Btn>
          {/* Wherever there is something to hand back: figures we hold, a draft
              to render, or the document the borrower uploaded instead — the
              route serves all three. Hidden only when the slot is genuinely
              empty, because a button that always 404s teaches the desk to stop
              pressing it. */}
          {form.figures_from === "form" ||
          form.statement_id ||
          (form.row_count ?? 0) > 0 ||
          form.source === "uploaded" ? (
            <>
              <Btn size="sm" disabled={busy !== ""} onClick={() => void openPdf(form.kind)}>
                {busy === `pdf:${form.kind}` ? "Making it…" : "View PDF"}
              </Btn>
              <Btn size="sm" disabled={busy !== ""} onClick={() => void downloadPdf(form.kind)}>
                {busy === `dl:${form.kind}` ? "Saving…" : "Download"}
              </Btn>
            </>
          ) : null}
        </div>
      ))}

      {/* The four forms as one workbook, rather than four forms one at a time.
          Open it to work the file like a spreadsheet; share it to hand part of
          it — chosen sheet by sheet — to somebody with no login. The share
          link's scope is stored on the link rather than derived from its
          token, which is what makes "this opens the P&L only" true. */}
      <div className="filerow">
        <Icon name="calc" size={15} />
        <div className="grow grid g4">
          <div className="row">
            <b>Worksheet</b>
            <CellChip tone="acc">Live</CellChip>
          </div>
          <span className="sub">
            All four forms as one grid, edited a cell at a time. Share any part of it — the
            personal financial statement is left out unless you tick it.
          </span>
        </div>
        <Btn size="sm" disabled={busy !== ""} onClick={() => setWorksheetOpen(true)}>
          Open worksheet
        </Btn>
        <Btn size="sm" disabled={busy !== ""} onClick={() => setShareOpen(true)}>
          Share worksheet
        </Btn>
      </div>

      {worksheetOpen ? (
        <WorksheetModal open onClose={() => setWorksheetOpen(false)} profileId={fileId} />
      ) : null}
      {shareOpen ? (
        <ShareWorksheetDialog open onClose={() => setShareOpen(false)} profileId={fileId} />
      ) : null}

      {/* One link for all four. The packet is what gets forwarded to an
          accountant, so it is minted from here and can be closed from here. */}
      <div className="filerow">
        <Icon name="link" size={15} />
        <div className="grow grid g4">
          <div className="row">
            <b>All four forms, one link</b>
            {openPackets.length > 0 ? (
              <CellChip tone="acc">
                {openPackets.length === 1 ? "1 link open" : `${openPackets.length} links open`}
              </CellChip>
            ) : null}
          </div>
          <span className="sub">
            Opens all four forms. Expires in 30 days. Safe to forward to their accountant.
          </span>
        </div>
        <Btn size="sm" disabled={busy !== ""} onClick={() => void copyLink("packet")}>
          {copied === "packet"
            ? "Copied"
            : busy === "link:packet"
              ? "Making a link…"
              : "Copy packet link"}
        </Btn>
      </div>

      {openPackets.map((packet) => (
        <div key={packet.packet_id} className="filerow">
          <Icon name="send" size={15} />
          <div className="grow grid g4">
            <div className="row">
              <b>Packet sent {shortDate(packet.created_at)}</b>
              <CellChip tone={packet.completed_kinds.length === 4 ? "ok" : "mut"}>
                {packet.completed_kinds.length} of 4 sent back
              </CellChip>
            </div>
            <span className="sub">Expires {shortDate(packet.expires_at)}.</span>
          </div>
          <Btn size="sm" disabled={busy !== ""} onClick={() => void closePacket(packet.packet_id)}>
            {busy === `close:${packet.packet_id}` ? "Closing…" : "Close"}
          </Btn>
        </div>
      ))}

      {editing === "pfs" && schema ? (
        <div className="pfs-editor">
          <Pfs413Form schema={schema} value={pfsBody} onChange={setPfsBody} disabled={busy !== ""} />
          <Row>
            <Btn variant="pri" disabled={busy !== ""} onClick={() => void savePfs()}>
              {busy === "save" ? "Saving…" : "Save"}
            </Btn>
            <Btn disabled={busy !== ""} onClick={() => void filePfs()}>
              {busy === "file" ? "Filing…" : "File on the checklist"}
            </Btn>
            <Btn onClick={() => setEditing(null)}>Close</Btn>
            <span className="sub grow">
              Saving keeps the figures. Filing generates the sheet and satisfies the request — the
              borrower is not notified either way.
            </span>
          </Row>
        </div>
      ) : null}

      {editing === "debt_schedule" ? (
        <div className="pfs-editor">
          <DebtScheduleForm value={debtBody} onChange={setDebtBody} disabled={busy !== ""} />
          <Row>
            <Btn
              variant="pri"
              disabled={busy !== ""}
              onClick={() =>
                void run("save", async () => {
                  await api(
                    `/application-profiles/${fileId}/financial-forms/debt-schedule`,
                    { method: "PUT", body: JSON.stringify({ body: debtBody, submit: true }) },
                  );
                  setEditing(null);
                })
              }
            >
              {busy === "save" ? "Saving…" : "Save the schedule"}
            </Btn>
            <Btn onClick={() => setEditing(null)}>Close</Btn>
            <span className="sub grow">
              These rows go on the file&apos;s debt schedule, which is what the DSCR reads.
            </span>
          </Row>
        </div>
      ) : null}

      {editing && isStatementKind(editing) && editingStatementSchema ? (
        <div className="pfs-editor">
          <BusinessStatementForm
            schema={editingStatementSchema}
            value={statementBody}
            onChange={setStatementBody}
            disabled={busy !== ""}
          />
          <Row>
            <Btn variant="pri" disabled={busy !== ""} onClick={() => void saveStatement(editing, false)}>
              {busy === "save" ? "Saving…" : "Save"}
            </Btn>
            <Btn disabled={busy !== ""} onClick={() => void saveStatement(editing, true)}>
              {busy === "file" ? "Filing…" : "File on the checklist"}
            </Btn>
            <Btn onClick={() => setEditing(null)}>Close</Btn>
            <span className="sub grow">
              Saving keeps the figures. Filing generates the sheet and satisfies the request — the
              borrower is not notified either way.
            </span>
          </Row>
        </div>
      ) : null}
    </>
  );

  const blurb =
    "A profit and loss statement, a balance sheet, a business debt schedule and a personal financial statement. Send the borrower one link that opens all four, or fill any of them in on their behalf.";

  if (nested) {
    return (
      <div className="grid g10 mt">
        <div>
          <strong>Financial forms</strong>
          <div className="sub">{blurb}</div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Panel title="Financial forms" sub={blurb} bodyClass="grid g10">
      {body}
    </Panel>
  );
}
