"use client";

// Both financial forms, in one place, with where each one stands.
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

import { useCallback, useEffect, useState } from "react";
import { Btn, CellChip, Panel, Row, StatusLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi, useFinancialFormPdf } from "@/hooks/useApi";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";
import { DebtScheduleForm, type DebtBody } from "@/components/application/DebtScheduleForm";

type FormKind = "pfs" | "debt_schedule";

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
};

const currency = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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
  const [schema, setSchema] = useState<PfsSchema | null>(null);
  const [editing, setEditing] = useState<FormKind | null>(null);
  const [pfsBody, setPfsBody] = useState<PfsBody>({});
  const [debtBody, setDebtBody] = useState<DebtBody>({});
  const [statementId, setStatementId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState<FormKind | null>(null);
  const [shown, setShown] = useState<{ kind: FormKind; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        api<{ forms: FormStatus[] }>(`/application-profiles/${id}/financial-forms`),
        api<PfsSchema>("/application-profiles/financial-statements/schema"),
      ]);
      setForms(status.forms);
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
   *  read back — and one sent to the wrong address can be left to expire. */
  const copyLink = (kind: FormKind) =>
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

  /** The filled form as a PDF, rendered from what the file holds right now.
   *
   *  Opened in a tab rather than downloaded: the desk's usual next move is to
   *  read it before forwarding, and a file that lands in a downloads folder has
   *  to be found again first. The object URL is released on the next tick —
   *  long enough for the tab to have taken it, short of leaking the blob for
   *  the life of the session. */
  const openPdf = (kind: FormKind) =>
    run(`pdf:${kind}`, async () => {
      const blob = await pdf.mutateAsync({ profileId: fileId, kind });
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener");
      if (!opened) {
        // Popup blocked. Nothing was downloaded and nothing said so, which is
        // the same silent failure the copy-link button used to have.
        setError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
      }
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
        const rows = await api<{ debts: DebtBody["debts"] }>(
          `/application-profiles/${fileId}/financial-forms/debt-schedule/body`,
        ).catch(() => ({ debts: [] }));
        setDebtBody({ debts: rows.debts ?? [] });
        setEditing("debt_schedule");
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

  const body = (
    <>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}

      {shown ? (
        <div className="form-link-out">
          <span className="lbl">
            {copied === shown.kind ? "Copied — also here if you need it" : "Send this to the borrower"}
          </span>
          <input readOnly value={shown.url} onFocus={(event) => event.currentTarget.select()} />
          <span className="sub">Opens the form directly. Expires in 30 days.</span>
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
          {/* Only where figures exist to render. An empty 413 is not a document
              anyone wants to open, and a button that always 404s teaches the
              desk to stop pressing it. */}
          {form.figures_from === "form" || form.statement_id || form.row_count > 0 ? (
            <Btn size="sm" disabled={busy !== ""} onClick={() => void openPdf(form.kind)}>
              {busy === `pdf:${form.kind}` ? "Making it…" : "PDF"}
            </Btn>
          ) : null}
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
    </>
  );

  if (nested) {
    return (
      <div className="grid g10 mt">
        <div>
          <strong>Financial forms</strong>
          <div className="sub">
            A personal financial statement and a business debt schedule. Send the borrower a
            link, or fill either one in on their behalf.
          </div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Panel
      title="Financial forms"
      sub="A personal financial statement and a business debt schedule. Send the borrower a link, or fill either one in on their behalf."
      bodyClass="grid g10"
    >
      {body}
    </Panel>
  );
}
