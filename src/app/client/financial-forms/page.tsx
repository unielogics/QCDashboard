"use client";

// A signed-in client's financial statement, on its own page.
//
// The same form exists in a modal on the intake screen, and a Form 413 in a
// modal is a bad trade: it is long, it wants the width, and someone part-way
// through should be able to leave and come back. So this is the full-page
// version, it autosaves, and Save finishes.
//
// Which file it belongs to comes from `?intake=`, or from the client's only
// intake when they have one. Guessing when there are several would be worse
// than asking — a statement filed against the wrong application is difficult to
// notice and annoying to unpick.

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Btn, Panel, StatusLine } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";

type Intake = { id: string; business_name?: string | null; full_name?: string | null };
type StatementState = {
  schema: PfsSchema;
  statement_id: string | null;
  status: string | null;
  body: PfsBody;
};

export default function ClientFinancialFormsPage() {
  const api = useAuthedApi();
  const params = useSearchParams();
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [intakeId, setIntakeId] = useState<string | null>(params?.get("intake") ?? null);
  const [state, setState] = useState<StatementState | null>(null);
  const [body, setBody] = useState<PfsBody>({});
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await api<Intake[]>("/buckets/client/intakes");
        setIntakes(rows);
        if (!intakeId && rows.length === 1) setIntakeId(rows[0].id);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "We could not load your files.");
      }
    })();
    // Once, on mount: re-running would fight the selection below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!intakeId) return;
    setError(null);
    try {
      const data = await api<StatementState>(
        `/buckets/client/intakes/${intakeId}/financial-statement`,
      );
      setState(data);
      setBody(data.body ?? {});
      setDone(data.status === "submitted");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "We could not open your financial statement.",
      );
    }
  }, [api, intakeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep progress without being asked. A 413 is long and most people meet it on
  // a phone; losing it to a closed tab is most of why the old form went unused.
  useEffect(() => {
    if (!intakeId || !state || done) return;
    const timer = window.setTimeout(async () => {
      try {
        await api(`/buckets/client/intakes/${intakeId}/financial-statement`, {
          method: "PUT",
          body: JSON.stringify({ body, submit: false }),
        });
        setSavedAt(new Date().toLocaleTimeString());
      } catch {
        // Silent. A failed autosave must not interrupt someone mid-form; Save
        // reports its own failure.
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [api, body, done, intakeId, state]);

  const save = async () => {
    if (!intakeId) return;
    setBusy("save");
    setError(null);
    try {
      await api(`/buckets/client/intakes/${intakeId}/financial-statement`, {
        method: "PUT",
        body: JSON.stringify({ body, submit: true }),
      });
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That did not save. Please try again.");
    } finally {
      setBusy("");
    }
  };

  if (done) {
    return (
      <Panel title="Thank you — you can close this window.">
        <p>
          Your financial statement has been saved to your file. Nothing else is needed from you
          here.
        </p>
        <p className="sub">If you spot a mistake, you can reopen this page and correct it.</p>
        <Btn onClick={() => setDone(false)}>Make a correction</Btn>
      </Panel>
    );
  }

  if (!intakeId) {
    return (
      <Panel title="Personal financial statement" sub="Choose which application this is for.">
        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
        {intakes.length === 0 ? (
          <div className="empty">You have no open applications.</div>
        ) : (
          <div className="grid g8">
            {intakes.map((intake) => (
              <Btn key={intake.id} onClick={() => setIntakeId(intake.id)}>
                {intake.business_name || intake.full_name || "Your application"}
              </Btn>
            ))}
          </div>
        )}
      </Panel>
    );
  }

  return (
    <Panel
      title="Personal financial statement"
      sub="This follows the standard SBA Form 413 that lenders ask for. Leave anything that does not apply blank."
    >
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {state ? (
        <>
          <Pfs413Form schema={state.schema} value={body} onChange={setBody} disabled={busy !== ""} />
          <div className="form-page-actions">
            <Btn variant="pri" disabled={busy !== ""} onClick={() => void save()}>
              {busy === "save" ? "Saving…" : "Save"}
            </Btn>
            <span className="sub">
              {savedAt ? `Your progress was saved at ${savedAt}.` : "Your progress saves as you type."}
            </span>
          </div>
        </>
      ) : (
        <div className="empty">Loading your form…</div>
      )}
    </Panel>
  );
}
