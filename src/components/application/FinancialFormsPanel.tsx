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
import { useAuthedApi } from "@/hooks/useApi";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";
import { DebtScheduleForm, type DebtBody } from "@/components/application/DebtScheduleForm";

type FormKind = "pfs" | "debt_schedule";

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

function summaryLine(form: FormStatus): string | null {
  if (form.kind === "pfs" && form.net_worth !== null) {
    return `Net worth ${currency(form.net_worth)}`;
  }
  if (form.kind === "debt_schedule" && form.row_count > 0) {
    return `${form.row_count} obligation${form.row_count === 1 ? "" : "s"} · ${currency(
      form.total_monthly,
    )} a month · ${currency(form.total_balance)} outstanding`;
  }
  if (form.source === "uploaded") {
    return "Satisfied by a document the borrower sent. There are no figures behind it to edit.";
  }
  return null;
}

export function FinancialFormsPanel({ profileId }: { profileId: string | null | undefined }) {
  const api = useAuthedApi();
  const [forms, setForms] = useState<FormStatus[]>([]);
  const [schema, setSchema] = useState<PfsSchema | null>(null);
  const [editing, setEditing] = useState<FormKind | null>(null);
  const [pfsBody, setPfsBody] = useState<PfsBody>({});
  const [debtBody, setDebtBody] = useState<DebtBody>({});
  const [statementId, setStatementId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState<FormKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    setError(null);
    try {
      const [status, fields] = await Promise.all([
        api<{ forms: FormStatus[] }>(`/application-profiles/${profileId}/financial-forms`),
        api<PfsSchema>("/application-profiles/financial-statements/schema"),
      ]);
      setForms(status.forms);
      setSchema(fields);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Financial forms could not be loaded.");
    }
  }, [api, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profileId) return null;

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
        `/application-profiles/${profileId}/financial-forms/${kind}/link`,
        { method: "POST" },
      );
      await navigator.clipboard.writeText(minted.url);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 4000);
    });

  const open = (form: FormStatus) =>
    run(`open:${form.kind}`, async () => {
      if (form.kind === "debt_schedule") {
        const rows = await api<{ debts: DebtBody["debts"] }>(
          `/application-profiles/${profileId}/financial-forms/debt-schedule/body`,
        ).catch(() => ({ debts: [] }));
        setDebtBody({ debts: rows.debts ?? [] });
        setEditing("debt_schedule");
        return;
      }
      const statements = await api<Array<{ id: string; body: PfsBody }>>(
        `/application-profiles/${profileId}/financial-statements`,
      );
      const current = statements[0];
      if (current) {
        setStatementId(current.id);
        setPfsBody(current.body ?? {});
      } else {
        const created = await api<{ id: string; body: PfsBody }>(
          `/application-profiles/${profileId}/financial-statements`,
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
      await api(`/application-profiles/${profileId}/financial-statements/${statementId}`, {
        method: "PATCH",
        body: JSON.stringify({ body: pfsBody, owners: [] }),
      });
    });

  const filePfs = () =>
    run("file", async () => {
      if (!statementId) return;
      await api(
        `/application-profiles/${profileId}/financial-statements/${statementId}/submit`,
        { method: "POST" },
      );
      setEditing(null);
    });

  return (
    <Panel
      title="Financial forms"
      sub="A personal financial statement and a business debt schedule. Send the borrower a link, or fill either one in on their behalf."
      bodyClass="grid g10"
    >
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}

      {forms.map((form) => (
        <div key={form.kind} className="filerow">
          <Icon name="doc" size={15} />
          <div className="grow grid g4">
            <div className="row">
              <b>{form.label}</b>
              {statusChip(form)}
              {form.filled_by_staff ? <CellChip tone="mut">Completed by staff</CellChip> : null}
            </div>
            {summaryLine(form) ? <span className="sub">{summaryLine(form)}</span> : null}
          </div>
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
                    `/application-profiles/${profileId}/financial-forms/debt-schedule`,
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
    </Panel>
  );
}
