"use client";

// Personal financial statements on the underwriting screen.
//
// The desk could already *send* a PFS request and a borrower could already fill
// one in, but nobody could open one afterwards: the numbers were rendered into
// a PDF and discarded, so there was nothing to retrieve, correct, or finish.
// This is the other half — read what was filed, edit it, or complete one on the
// borrower's behalf when they have given the figures over the phone.
//
// The distinction the panel is careful to draw is how a request was met.
// "Filled in" means we hold the rows and they can be corrected. "Uploaded"
// means a document satisfies the request and we do not hold anything — still
// perfectly valid, and the more common case by a wide margin, but not editable.
// Showing both as a green tick would flatten a difference that decides whether
// a correction takes thirty seconds or a phone call.

import { useCallback, useEffect, useState } from "react";
import { Btn, CellChip, Panel, Row, StatusLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";

type OwnerLink = { owner_id: string; storage: string; name: string | null };
type FileOwner = { id: string; first_name: string; last_name: string; is_primary: boolean };

type Statement = {
  id: string;
  profile_id: string;
  statement_date: string | null;
  status: "draft" | "submitted";
  body: PfsBody;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  liquid_assets: number;
  submitted_at: string | null;
  filled_by_staff: boolean;
  bucket_file_id: string | null;
  owners: OwnerLink[];
  updated_at: string;
};

const currency = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function FinancialStatementsPanel({ profileId }: { profileId: string | null | undefined }) {
  const api = useAuthedApi();
  const [schema, setSchema] = useState<PfsSchema | null>(null);
  const [rows, setRows] = useState<Statement[]>([]);
  const [owners, setOwners] = useState<FileOwner[]>([]);
  const [applies, setApplies] = useState<string[]>([]);
  const [editing, setEditing] = useState<Statement | null>(null);
  const [draft, setDraft] = useState<PfsBody>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    setError(null);
    try {
      const [fields, statements, people] = await Promise.all([
        api<PfsSchema>("/application-profiles/financial-statements/schema"),
        api<Statement[]>(`/application-profiles/${profileId}/financial-statements`),
        api<FileOwner[]>(`/application-profiles/${profileId}/owners`),
      ]);
      setSchema(fields);
      setRows(statements);
      setOwners(people);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Financial statements could not be loaded.");
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

  const startNew = () =>
    run("new", async () => {
      const created = await api<Statement>(`/application-profiles/${profileId}/financial-statements`, {
        method: "POST",
        body: JSON.stringify({ body: {}, owners: [] }),
      });
      setEditing(created);
      setDraft(created.body ?? {});
      setApplies([]);
    });

  const save = (statement: Statement) =>
    run("save", async () => {
      const updated = await api<Statement>(
        `/application-profiles/${profileId}/financial-statements/${statement.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            body: draft,
            statement_date: statement.statement_date,
            // The server decides which owner table these live in; sending
            // ids alone avoids the browser guessing at something it cannot know.
            owners: applies.map((owner_id) => ({ owner_id })),
          }),
        },
      );
      setEditing(updated);
    });

  const file = (statement: Statement) =>
    run("file", async () => {
      await api(
        `/application-profiles/${profileId}/financial-statements/${statement.id}/submit`,
        { method: "POST" },
      );
      setEditing(null);
    });

  return (
    <Panel
      title="Personal financial statements"
      sub="Open what a borrower filed, correct it, or complete one on their behalf."
      actions={
        <Btn onClick={startNew} disabled={busy !== ""}>
          {busy === "new" ? "Starting…" : "Start a statement"}
        </Btn>
      }
      bodyClass="grid g10"
    >
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}

      {rows.length === 0 ? (
        <div className="empty">
          No statement has been filed on this file yet. If the borrower uploaded a document
          instead, it satisfies the request but cannot be edited here — there are no figures
          behind it, only the file they sent.
        </div>
      ) : (
        rows.map((statement) => (
          <div key={statement.id} className="filerow">
            <Icon name="doc" size={15} />
            <div className="grow grid g4">
              <div className="row">
                <b>{statement.body?.applicant?.name || "Unnamed applicant"}</b>
                <CellChip tone={statement.status === "submitted" ? "ok" : "warn"}>
                  {statement.status === "submitted" ? "Filed" : "Draft"}
                </CellChip>
                {statement.filled_by_staff ? (
                  // Worth saying plainly: a partner reading the sheet should not
                  // assume the borrower typed every figure on it.
                  <CellChip tone="mut">Completed by staff</CellChip>
                ) : null}
                {statement.owners.length > 1 ? (
                  <CellChip tone="acc">
                    Joint — {statement.owners.map((owner) => owner.name).filter(Boolean).join(" and ")}
                  </CellChip>
                ) : null}
              </div>
              <span className="sub">
                Net worth {currency(statement.net_worth)} · assets{" "}
                {currency(statement.total_assets)} · liquid {currency(statement.liquid_assets)}
              </span>
            </div>
            <Btn
              size="sm"
              onClick={() => {
                setEditing(statement);
                setDraft(statement.body ?? {});
                setApplies(statement.owners.map((owner) => owner.owner_id));
              }}
            >
              {statement.status === "submitted" ? "Open" : "Continue"}
            </Btn>
          </div>
        ))
      )}

      {editing && schema ? (
        <div className="pfs-editor">
          {owners.length > 0 ? (
            <div className="pfs-applies">
              <span className="lbl">Applies to</span>
              {/* A married couple filing one sheet is the case this exists for.
                  Tick both and the statement counts for both applicants; almost
                  every file has one owner, so leaving it alone is the norm. */}
              <div className="row">
                {owners.map((owner) => {
                  const on = applies.includes(owner.id);
                  return (
                    <Btn
                      key={owner.id}
                      size="sm"
                      variant={on ? "pri" : "default"}
                      aria-pressed={on}
                      onClick={() =>
                        setApplies((current) =>
                          on ? current.filter((id) => id !== owner.id) : [...current, owner.id],
                        )
                      }
                    >
                      {on ? <Icon name="check" size={12} /> : null}
                      {`${owner.first_name} ${owner.last_name}`.trim()}
                    </Btn>
                  );
                })}
              </div>
              {applies.length > 1 ? (
                <span className="sub">
                  One joint statement, counted for {applies.length} applicants.
                </span>
              ) : null}
            </div>
          ) : null}
          <Pfs413Form schema={schema} value={draft} onChange={setDraft} disabled={busy !== ""} />
          <Row>
            <Btn variant="pri" disabled={busy !== ""} onClick={() => void save(editing)}>
              {busy === "save" ? "Saving…" : "Save"}
            </Btn>
            <Btn disabled={busy !== ""} onClick={() => void file(editing)}>
              {busy === "file" ? "Filing…" : editing.status === "submitted" ? "File again" : "File on the checklist"}
            </Btn>
            <Btn onClick={() => setEditing(null)}>Close</Btn>
            <span className="sub grow">
              Saving keeps the figures. Filing generates the sheet and satisfies the personal
              financials request — the borrower is not notified either way.
            </span>
          </Row>
        </div>
      ) : null}
    </Panel>
  );
}
