"use client";

// The worksheet, opened by somebody with no login.
//
// This is the surface the owner asked for: *"this link should be able to be
// shared without login, example the accountant."* One URL, one opaque token,
// and a scope the desk decided when it minted the link — which sheets it
// opens, and whether the holder may type in them. None of that is derived from
// anything this page sends; it arrives in `scope` and is enforced on the
// server twice over.
//
// **The fork at 760px is the important thing in this file, and it is not a
// media query.** Below 760 the grid is not merely hidden — it is never
// mounted, because it installs clipboard listeners, a roving tabindex and an
// offscreen focus catcher that fight iOS Safari. Below 760 this page renders
// the stacked forms the borrower already knows, and the standing decision this
// obeys is recorded twice in the codebase:
//
//   BusinessStatementForm.tsx:12 — "Phone-first, the DebtScheduleForm lesson:
//   a stacked label-and-money field per line, one disclosure per section with
//   its running subtotal in the summary, and never a table. Nothing scrolls
//   sideways."
//
//   DebtScheduleForm.tsx:5-13 — "This was four columns in a table. A real
//   schedule states more than that … Squeezing eleven fields into a table
//   meant horizontal scrolling, which on a phone means a borrower filling in a
//   column they cannot see the heading of. So each obligation is a card with a
//   wrapping grid. Nothing ever scrolls sideways: at 380px it is one field per
//   line, at desktop three."
//
// The grid is imported with `next/dynamic`, so a phone downloads none of it.
// That is what keeps the public forms chunk honest and makes the fork
// enforceable rather than aspirational.
//
// Five states, in the order a visitor meets them: a skeleton, the PIN, the
// "what should we call you" prompt, the worksheet, and the one uniform
// sentence for a link that has stopped working. **Any non-ok save lands in
// that last state** — the desk can close a forwarded link mid-edit, and
// "Progress saved" would be a lie. The single exception is the per-link write
// cap, which is the server asking for a pause and not a revocation; treating
// it as a revocation would throw away work over a fast typist.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import {
  BusinessStatementForm,
  type StatementBody,
  type StatementSchema,
} from "@/components/application/BusinessStatementForm";
import { DebtScheduleForm, type DebtBody, type DebtRow } from "@/components/application/DebtScheduleForm";
import {
  Pfs413Form,
  scheduleFields,
  type PfsBody,
  type PfsSchema,
} from "@/components/application/Pfs413Form";
import { statementBody } from "@/components/sheet/compute";
import type { SheetKind } from "@/components/sheet/types";
import { useMediaQuery, WORKSHEET_MIN_WIDTH } from "@/lib/useMediaQuery";
import {
  cleanWorksheetName,
  clearWorksheetSession,
  readPublicWorksheet,
  readWorksheetName,
  readWorksheetSession,
  unlockPublicWorksheet,
  writePublicCells,
  writePublicRow,
  writeWorksheetName,
  writeWorksheetSession,
  WorksheetGone,
  WorksheetPinInvalid,
  WorksheetPinLocked,
  WorksheetPinRequired,
  WorksheetTooFast,
  type WorksheetCellEdit,
  type WorksheetPayload,
  type WorksheetRowOp,
  type WorksheetSheet,
} from "@/lib/worksheetApi";

// The grid, only ever fetched on a wide screen. `ssr: false` because it is a
// DOM-owning control and there is nothing useful to render for it on the
// server; the skeleton below stands in while it arrives.
const Worksheet = dynamic(() => import("@/components/sheet/Worksheet").then((m) => m.Worksheet), {
  ssr: false,
  loading: () => <GridSkeleton />,
});

const TITLES: Record<SheetKind, string> = {
  p_and_l: "Profit & loss",
  balance_sheet: "Balance sheet",
  debt_schedule: "Debt schedule",
  pfs: "Personal financial statement",
};

/** The stacked branch's autosave. Longer than the grid's 700ms because a
 *  phone keyboard is slower and every flush is a round trip on mobile data. */
const AUTOSAVE_MS = 1400;

const GONE = "This link is no longer available";

type Phase =
  | { kind: "loading" }
  | { kind: "pin"; label: string | null; problem: string | null }
  | { kind: "name"; suggested: string }
  | { kind: "ready" }
  | { kind: "gone" };

// ---------------------------------------------------------------------------
// flat values ⇄ the shapes the stacked forms take
//
// The worksheet holds one flat map of cell key → raw string, which is what the
// grid and the save endpoint both speak. The stacked forms take a body. These
// two functions are the only place the two shapes meet, and they are exact
// inverses — `flattenBody(sheet, bodyFor(sheet, values))` is `values`, which
// is what lets the mobile branch save through the same per-cell endpoint the
// grid uses rather than needing a whole-body write of its own.
// ---------------------------------------------------------------------------

type Values = Record<string, string>;

/** The applicant block on the 413. `statement_date` is the cell key; `as_of`
 *  is where it is stored — see `sheet_layout.PFS_AS_OF_KEY`. */
const PFS_APPLICANT_KEYS = ["name", "business_name", "home_address", "business_phone"] as const;

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

/** A list row's identity, the way `sheet_layout._list_row_key` computes it:
 *  its stored id when it has one, else its 1-based position. */
const rowKeyOf = (row: { id?: string } | null | undefined, ordinal: number): string =>
  (row && typeof row.id === "string" && row.id.trim()) || `r${ordinal}`;

const ORDINAL = /^r\d+$/;

/** The debt schedule's columns, as the sheet's own schema states them — never
 *  a list hardcoded here, so a column added on the server appears on the phone
 *  without a second edit. */
function debtColumns(sheet: WorksheetSheet): string[] {
  const schema = sheet.schema as { columns?: unknown } | null;
  const columns = schema?.columns;
  return Array.isArray(columns) ? columns.map(String) : [];
}

/** The body one stacked form takes, built from the flat values. */
function bodyFor(sheet: WorksheetSheet, values: Values): StatementBody | PfsBody | DebtBody {
  if (sheet.kind === "p_and_l" || sheet.kind === "balance_sheet") {
    return statementBody(sheet.schema as StatementSchema, values);
  }
  if (sheet.kind === "debt_schedule") {
    const columns = debtColumns(sheet);
    // Row order and row identity come from the layout the server sent, not
    // from the value keys: two rows can hold identical figures, and the order
    // they were entered in is part of the schedule.
    const debts: DebtRow[] = [];
    for (const row of sheet.rows ?? []) {
      if (row.kind !== "data" || !row.row_key) continue;
      const meta = sheet.row_meta?.[row.row_key];
      const built: DebtRow = { id: ORDINAL.test(row.row_key) ? undefined : row.row_key };
      if (meta) {
        built.editable = meta.editable;
        if (meta.owner) built.owner = meta.owner;
      }
      for (const column of columns) {
        (built as Record<string, unknown>)[column] = values[`${row.row_key}.${column}`] ?? "";
      }
      debts.push(built);
    }
    return { business_name: values.business_name ?? "", debts };
  }
  const schema = sheet.schema as PfsSchema;
  const section = (rows: PfsSchema["assets"]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const row of rows ?? []) out[row.key] = values[row.key] ?? "";
    return out;
  };
  const applicant: Record<string, string> = {};
  for (const key of PFS_APPLICANT_KEYS) applicant[key] = values[key] ?? "";
  const schedules: Record<string, Record<string, string>[]> = {};
  for (const spec of schema?.schedules ?? []) {
    const fields = scheduleFields(spec);
    const rows: Record<string, string>[] = [];
    for (const row of sheet.rows ?? []) {
      if (row.kind !== "data" || row.block !== spec.key || !row.row_key) continue;
      const built: Record<string, string> = {};
      for (const field of fields) built[field.key] = values[`${spec.key}.${row.row_key}.${field.key}`] ?? "";
      rows.push(built);
    }
    schedules[spec.key] = rows;
  }
  return {
    schema_version: sheet.schema_version,
    applicant,
    as_of: values.statement_date ?? "",
    assets: section(schema?.assets ?? []),
    liabilities: section(schema?.liabilities ?? []),
    income: section(schema?.income ?? []),
    contingent: section(schema?.contingent ?? []),
    schedules,
  };
}

/** The inverse: the flat values a body implies. */
function flattenBody(sheet: WorksheetSheet, body: StatementBody | PfsBody | DebtBody): Values {
  const out: Values = {};
  if (sheet.kind === "p_and_l" || sheet.kind === "balance_sheet") {
    const schema = sheet.schema as StatementSchema;
    const statement = body as StatementBody;
    for (const field of schema?.header ?? []) out[field.key] = text(statement.header?.[field.key]);
    for (const group of schema?.sections ?? []) {
      const lines = (statement.sections?.[group.key] ?? {}) as Record<string, unknown>;
      for (const row of group.rows) out[row.key] = text(lines[row.key]);
    }
    out.notes = text(statement.notes);
    return out;
  }
  if (sheet.kind === "debt_schedule") {
    const columns = debtColumns(sheet);
    const debt = body as DebtBody;
    out.business_name = text(debt.business_name);
    (debt.debts ?? []).forEach((row, index) => {
      const key = rowKeyOf(row, index + 1);
      for (const column of columns) {
        out[`${key}.${column}`] = text((row as Record<string, unknown>)[column]);
      }
    });
    return out;
  }
  const schema = sheet.schema as PfsSchema;
  const pfs = body as PfsBody;
  for (const key of PFS_APPLICANT_KEYS) out[key] = text((pfs.applicant ?? {})[key]);
  out.statement_date = text(pfs.as_of);
  const section = (rows: PfsSchema["assets"], held: Record<string, unknown> | undefined) => {
    for (const row of rows ?? []) out[row.key] = text(held?.[row.key]);
  };
  section(schema?.assets ?? [], pfs.assets);
  section(schema?.liabilities ?? [], pfs.liabilities);
  section(schema?.income ?? [], pfs.income);
  section(schema?.contingent ?? [], pfs.contingent);
  for (const spec of schema?.schedules ?? []) {
    const fields = scheduleFields(spec);
    (pfs.schedules?.[spec.key] ?? []).forEach((row, index) => {
      for (const field of fields) {
        out[`${spec.key}.${rowKeyOf(row as { id?: string }, index + 1)}.${field.key}`] = text(row[field.key]);
      }
    });
  }
  return out;
}

/** The identities of a sheet's list rows, in order. */
function rowKeys(sheet: WorksheetSheet, body: StatementBody | PfsBody | DebtBody): string[] {
  if (sheet.kind === "debt_schedule") {
    return ((body as DebtBody).debts ?? []).map((row, index) => rowKeyOf(row, index + 1));
  }
  if (sheet.kind === "pfs") {
    const schema = sheet.schema as PfsSchema;
    const pfs = body as PfsBody;
    return (schema?.schedules ?? []).flatMap((spec) =>
      (pfs.schedules?.[spec.key] ?? []).map(
        (row, index) => `${spec.key}:${rowKeyOf(row as { id?: string }, index + 1)}`,
      ),
    );
  }
  return [];
}

/** What changed between two flat maps, as edits. A key that disappeared is a
 *  cleared cell, not an absent one — blank is stored as null on the server, so
 *  sending "" is how a figure is taken back out. */
function diffEdits(sheet: SheetKind, before: Values, after: Values): WorksheetCellEdit[] {
  const edits: WorksheetCellEdit[] = [];
  for (const key of Object.keys(after)) {
    if ((before[key] ?? "") !== after[key]) edits.push({ sheet, key, value: after[key] });
  }
  for (const key of Object.keys(before)) {
    if (!(key in after) && before[key] !== "") edits.push({ sheet, key, value: "" });
  }
  return edits;
}

// ---------------------------------------------------------------------------
// chrome
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="fp">
      <header className="fp-header">
        <div className="fp-header-inner">
          <span className="fp-mark">Qualified Commercial</span>
        </div>
      </header>
      {children}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="fp-card" aria-busy="true">
      <span className="fp-skel fp-skel-line w60" />
      <div className="fp-grid fp-grid-skel">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className="fp-skel fp-skel-field" />
        ))}
      </div>
    </div>
  );
}

/** The few classes this page needs that the `.fp-*` block does not already
 *  own. Scoped here rather than added to app-extras.css so the public
 *  worksheet ships self-contained; every one is `.sg-` prefixed, because
 *  globals.css already owns `.grid`, `.row`, `.cellchip` and `.field` and
 *  naming a row `.row` would flex-wrap the grid into rubble. */
const STYLE = `
.sg-pin-input { letter-spacing: 0.42em; text-align: center; font-size: 22px; font-weight: 600; }
.sg-lock { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px;
  background: var(--fp-accent-soft); color: var(--fp-accent-deep); font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.02em; }
.sg-tabbar { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; padding: 0; list-style: none; }
.sg-tab { display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 999px;
  border: 1.5px solid var(--fp-line); background: var(--fp-card); color: var(--fp-ink);
  font: inherit; font-size: 13.5px; font-weight: 560; cursor: pointer; }
.sg-tab[aria-current="page"] { border-color: var(--fp-accent); background: var(--fp-accent-soft);
  color: var(--fp-accent-deep); }
.sg-readonly { border: 1.5px solid var(--fp-line); border-radius: var(--fp-r-sm); background: var(--fp-card); }
.sg-readonly dl { display: grid; grid-template-columns: 1fr auto; gap: 0; margin: 0; }
.sg-readonly dt, .sg-readonly dd { margin: 0; padding: 9px 13px; border-bottom: 1px solid var(--fp-line); }
.sg-readonly dt { color: var(--fp-muted); font-size: 13.5px; }
.sg-readonly dd { text-align: right; font-variant-numeric: tabular-nums; font-weight: 550; }
.sg-readonly dt:last-of-type, .sg-readonly dd:last-of-type { border-bottom: 0; }
.sg-name-form { display: grid; gap: 12px; max-width: 380px; margin: 0 auto; text-align: left; }
.sg-name-actions { display: flex; gap: 10px; align-items: center; }
`;

// ---------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------

export default function PublicWorksheetPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const wide = useMediaQuery(WORKSHEET_MIN_WIDTH);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [payload, setPayload] = useState<WorksheetPayload | null>(null);
  const [name, setName] = useState<string>("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState<SheetKind>("p_and_l");

  const sessionRef = useRef<string | null>(null);
  const nameRef = useRef<string>("");
  nameRef.current = name;

  const canEdit = payload?.scope?.can_edit ?? false;
  const sheets = useMemo(() => payload?.sheets ?? [], [payload]);
  const sheet = useMemo(() => sheets.find((one) => one.kind === active) ?? sheets[0], [sheets, active]);

  /** Every failure that is not a PIN question ends the page. The one exception
   *  is the write cap: the server is asking for a pause, the edits are still
   *  in hand, and throwing the grid away over a fast typist would lose them. */
  const fail = useCallback((reason: unknown) => {
    if (reason instanceof WorksheetTooFast) {
      setNotice(reason.message);
      return;
    }
    if (reason instanceof Error && reason.message === "network") {
      setNotice("We could not reach the server. Your last change has not been saved yet.");
      return;
    }
    setPhase({ kind: "gone" });
  }, []);

  /** The read, and the two questions that can come back instead of it. */
  const load = useCallback(
    async (session: string | null, pinLabel: string | null) => {
      try {
        const answer = await readPublicWorksheet(token, session);
        setPayload(answer);
        setActive((current) => {
          const scope = answer.scope?.sheets ?? [];
          return scope.includes(current) ? current : (answer.scope?.open_at ?? scope[0] ?? "p_and_l");
        });
        const known = readWorksheetName(token);
        if (known) {
          setName(known);
          setPhase({ kind: "ready" });
        } else {
          // Asked once, like Google Docs, and skippable. The prompt is not a
          // gate: a name is a courtesy to the other people on the sheet, and a
          // stranger being made to identify themselves before they can read a
          // document their client forwarded them is not the deal.
          setPhase({ kind: "name", suggested: pinLabel ? cleanWorksheetName(pinLabel) : "" });
        }
      } catch (reason) {
        if (reason instanceof WorksheetPinRequired) {
          clearWorksheetSession(token);
          sessionRef.current = null;
          setPhase({ kind: "pin", label: reason.label, problem: null });
          return;
        }
        if (reason instanceof Error && reason.message === "network") {
          setPhase({ kind: "pin", label: null, problem: null });
          setNotice("We could not reach the server. Try again in a moment.");
          return;
        }
        setPhase({ kind: "gone" });
      }
    },
    [token],
  );

  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!token || opened.current === token) return;
    opened.current = token;
    const session = readWorksheetSession(token);
    sessionRef.current = session;
    void load(session, null);
  }, [load, token]);

  const unlock = async () => {
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const out = await unlockPublicWorksheet(token, pin);
      if (out.session) {
        sessionRef.current = out.session;
        writeWorksheetSession(token, out.session);
      }
      const label = phase.kind === "pin" ? phase.label : null;
      setPhase({ kind: "loading" });
      await load(out.session ?? null, label);
    } catch (reason) {
      setPin("");
      const label = phase.kind === "pin" ? phase.label : null;
      if (reason instanceof WorksheetPinLocked) {
        setPhase({ kind: "pin", label, problem: reason.message });
      } else if (reason instanceof WorksheetPinInvalid) {
        setPhase({ kind: "pin", label, problem: reason.message });
      } else if (reason instanceof WorksheetGone) {
        setPhase({ kind: "gone" });
      } else {
        setPhase({ kind: "pin", label, problem: "The PIN did not work. Try again in a moment." });
      }
    } finally {
      setBusy(false);
    }
  };

  const acceptName = (chosen: string) => {
    // A skipper becomes "Guest" — the presence strip needs something to draw,
    // and an empty label reads as a bug rather than as anonymity.
    const cleaned = cleanWorksheetName(chosen) || "Guest";
    setName(cleaned);
    writeWorksheetName(token, cleaned);
    setPhase({ kind: "ready" });
  };

  /** Merge a write's answer back in: the server's revisions and its authoritative
   *  computed figures, and a refetch of any sheet it says drifted. */
  const absorb = useCallback(
    (result: { rev: Record<string, number>; computed: Record<string, Record<string, number | null>>; resync: string[] }) => {
      setPayload((current) => {
        if (!current) return current;
        return {
          ...current,
          sheets: current.sheets.map((one) => ({
            ...one,
            rev: result.rev?.[one.kind] ?? one.rev,
            computed: result.computed?.[one.kind] ?? one.computed,
          })),
        };
      });
      if ((result.resync ?? []).length > 0) void load(sessionRef.current, null);
    },
    [load],
  );

  const baseRev = useCallback((): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const one of sheets) if (typeof one.rev === "number") out[one.kind] = one.rev;
    return out;
  }, [sheets]);

  /** The grid's save. Edits are addressed by `key`, never by grid address —
   *  `planPaste` gives an appended row a nominal address that can collide with
   *  a real row number, so the address is display-only on the wire. */
  const onSave = useCallback(
    async (edits: WorksheetCellEdit[]) => {
      if (edits.length === 0) return;
      setSaving(true);
      setNotice(null);
      try {
        const result = await writePublicCells(token, sessionRef.current, edits, baseRev(), nameRef.current);
        absorb(result);
        setPayload((current) => {
          if (!current) return current;
          return {
            ...current,
            sheets: current.sheets.map((one) => {
              const mine = edits.filter((edit) => edit.sheet === one.kind);
              if (mine.length === 0) return one;
              const values = { ...one.values };
              for (const edit of mine) values[edit.key] = edit.value;
              return { ...one, values };
            }),
          };
        });
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      } catch (reason) {
        fail(reason);
      } finally {
        setSaving(false);
      }
    },
    [absorb, baseRev, fail, token],
  );

  const onRowOp = useCallback(
    async (op: WorksheetRowOp) => {
      setNotice(null);
      try {
        const result = await writePublicRow(token, sessionRef.current, op, nameRef.current);
        setPayload((current) => {
          if (!current) return current;
          return {
            ...current,
            sheets: current.sheets.map((one) =>
              one.kind === op.sheet
                ? { ...one, rows: result.rows, row_meta: result.row_meta, rev: result.rev?.[one.kind] ?? one.rev }
                : one,
            ),
          };
        });
        return result;
      } catch (reason) {
        fail(reason);
        return undefined;
      }
    },
    [fail, token],
  );

  // ---- states ------------------------------------------------------------

  if (phase.kind === "loading") {
    return (
      <Shell>
        <main className="fp-main" aria-busy="true" aria-live="polite">
          <span className="fp-sr">Opening the worksheet</span>
          <GridSkeleton />
        </main>
      </Shell>
    );
  }

  if (phase.kind === "gone") {
    return (
      <Shell>
        <main className="fp-main fp-centered">
          <div className="fp-card fp-terminal">
            <span className="fp-terminal-glyph" aria-hidden="true">
              ⧗
            </span>
            <h1>{GONE}</h1>
            <p>
              It may have expired or been closed. Ask your contact at Qualified Commercial to send
              you a new one.
            </p>
          </div>
        </main>
      </Shell>
    );
  }

  if (phase.kind === "pin") {
    return (
      <Shell>
        <style>{STYLE}</style>
        <main className="fp-main fp-centered">
          <div className="fp-card fp-terminal">
            <h1>Enter the PIN</h1>
            <p>
              {phase.label ? `${phase.label} — this` : "This"} worksheet is protected by a
              six-digit PIN. Whoever shared the link sent it to you separately.
            </p>
            <div className="fp-field" style={{ width: "100%", maxWidth: 240 }}>
              <label htmlFor="sg-pin">PIN</label>
              <input
                id="sg-pin"
                className="sg-pin-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void unlock();
                }}
              />
            </div>
            {phase.problem ? (
              <p className="fp-error" role="alert">
                {phase.problem}
              </p>
            ) : null}
            <button
              type="button"
              className="fp-submit"
              disabled={pin.length !== 6 || busy}
              onClick={() => void unlock()}
            >
              {busy ? (
                <>
                  <span className="fp-spinner" aria-hidden="true" /> Opening…
                </>
              ) : (
                "Open the worksheet"
              )}
            </button>
          </div>
        </main>
      </Shell>
    );
  }

  if (phase.kind === "name") {
    return (
      <Shell>
        <style>{STYLE}</style>
        <main className="fp-main fp-centered">
          <div className="fp-card fp-terminal">
            <h1>What should we call you?</h1>
            <p>
              Everyone else on this worksheet sees this name beside the cell you are working in. It
              is a label, not a sign-in — nothing is verified and nothing is kept.
            </p>
            <form
              className="sg-name-form"
              onSubmit={(event) => {
                event.preventDefault();
                acceptName(phase.suggested);
              }}
            >
              <div className="fp-field">
                <label htmlFor="sg-name">Your name</label>
                <input
                  id="sg-name"
                  autoFocus
                  maxLength={40}
                  placeholder="Dana R."
                  value={phase.suggested}
                  onChange={(event) => setPhase({ kind: "name", suggested: event.target.value })}
                />
              </div>
              <div className="sg-name-actions">
                <button type="submit" className="fp-submit" style={{ flex: "0 0 auto" }}>
                  Continue
                </button>
                <button type="button" className="fp-link-btn" onClick={() => acceptName("")}>
                  Skip
                </button>
              </div>
            </form>
          </div>
        </main>
      </Shell>
    );
  }

  // ---- ready -------------------------------------------------------------

  if (!payload || sheets.length === 0) {
    return (
      <Shell>
        <main className="fp-main fp-centered">
          <div className="fp-card fp-terminal">
            <h1>{GONE}</h1>
          </div>
        </main>
      </Shell>
    );
  }

  const businessName = payload.business_name;

  return (
    <div className="fp">
      <style>{STYLE}</style>
      <header className="fp-header">
        <div className="fp-header-inner">
          <span className="fp-mark">Qualified Commercial</span>
          <h1>Financial worksheet{businessName ? ` for ${businessName}` : ""}</h1>
          <p className="fp-for">
            {canEdit
              ? "Figures save as you type. Everyone with this link sees the same sheet."
              : "You are looking at this worksheet. Nothing here can be changed from this link."}
          </p>
        </div>
      </header>

      <main className="fp-main">
        {notice ? (
          <p className="fp-error" role="alert">
            {notice}
          </p>
        ) : null}

        {/* `wide === null` is "the browser has not told us yet". Neither branch
            renders until it has: guessing would hydrate a tree that does not
            match the one Next rendered, and the two branches here are
            different components rather than a different class name. */}
        {wide === null ? (
          <GridSkeleton />
        ) : wide ? (
          <Worksheet
            sheets={sheets}
            scope={payload.scope}
            onSave={onSave}
            onRowOp={onRowOp}
          />
        ) : (
          <StackedWorksheet
            sheets={sheets}
            canEdit={canEdit}
            active={active}
            onActive={setActive}
            onSave={onSave}
            onRowOp={onRowOp}
          />
        )}
      </main>

      <div className="fp-actions">
        <div className="fp-actions-inner">
          <span className="fp-autosave" aria-live="polite">
            {!canEdit ? (
              "This link opens the worksheet for reading only."
            ) : saving ? (
              <>
                <span className="fp-pulse" aria-hidden="true" /> Saving…
              </>
            ) : savedAt ? (
              `Saved at ${savedAt}.`
            ) : (
              "Your figures save as you type."
            )}
          </span>
        </div>
      </div>

      {/* The grid used to be the only place a tab could be picked; on a phone
          the tab bar lives above the form instead. Kept out of the sheet body
          so the same `active` drives both branches. */}
      <span className="fp-sr" aria-live="polite">
        {sheet ? TITLES[sheet.kind] : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the stacked branch
// ---------------------------------------------------------------------------

/** The four forms as a phone renders them, saving through the same per-cell
 *  endpoint the grid uses. The body is derived from the flat values and
 *  flattened back on change, so the two branches are one document. */
function StackedWorksheet({
  sheets,
  canEdit,
  active,
  onActive,
  onSave,
  onRowOp,
}: {
  sheets: WorksheetSheet[];
  canEdit: boolean;
  active: SheetKind;
  onActive: (kind: SheetKind) => void;
  onSave: (edits: WorksheetCellEdit[]) => Promise<void>;
  onRowOp: (op: WorksheetRowOp) => Promise<unknown>;
}) {
  const sheet = sheets.find((one) => one.kind === active) ?? sheets[0];
  const [draft, setDraft] = useState<StatementBody | PfsBody | DebtBody | null>(null);
  const draftRef = useRef<StatementBody | PfsBody | DebtBody | null>(null);
  draftRef.current = draft;

  // A new tab, or a row list the server replaced, resets the local draft to
  // what the file holds.
  //
  // **The trigger is the row list, not the sheet object.** A save hands back a
  // sheet object with new `values` — the very edits that were just sent — and
  // resetting on that would throw away whatever was typed in the second and a
  // half between the flush and its answer. `rows` is only ever replaced by a
  // row operation or a full refetch, which are exactly the two moments the
  // draft genuinely has to be rebuilt.
  const shownKind = useRef<SheetKind | null>(null);
  const shownRows = useRef<unknown>(null);
  useEffect(() => {
    if (!sheet) return;
    if (shownKind.current === sheet.kind && shownRows.current === sheet.rows) return;
    shownKind.current = sheet.kind;
    shownRows.current = sheet.rows;
    setDraft(bodyFor(sheet, sheet.values));
  }, [sheet]);

  /** What has been typed since the file last acknowledged a write.
   *
   *  The baseline is `sheet.values` — the server-acknowledged state — and not a
   *  local "last sent" copy, which is the difference between a failed save
   *  being retried and a failed save being forgotten. `values` advances only
   *  when a write comes back accepted, so a flush that never landed is still
   *  in the diff the next time round. Re-sending a value the file already
   *  holds is idempotent, which is the cheap half of that trade. */
  const flush = useCallback(
    async (body: StatementBody | PfsBody | DebtBody) => {
      if (!sheet || !canEdit) return;
      const edits = diffEdits(sheet.kind, sheet.values, flattenBody(sheet, body));
      if (edits.length === 0) return;
      await onSave(edits);
    },
    [canEdit, onSave, sheet],
  );

  useEffect(() => {
    if (!draft || !canEdit) return;
    const timer = window.setTimeout(() => {
      const body = draftRef.current;
      if (body) void flush(body);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, canEdit, flush]);

  const change = (next: StatementBody | PfsBody | DebtBody) => {
    if (!sheet) return;
    // A row that carried a real identity and is now gone was deleted, not
    // emptied — a blanked debt row is still an obligation on the file, and
    // `count_in_dscr` defaults to true, so leaving one behind understates
    // coverage. Rows keyed by ordinal never existed on the server under that
    // name, so blanking their cells is the whole of their removal.
    const before = draftRef.current;
    if (before) {
      const was = rowKeys(sheet, before);
      const now = new Set(rowKeys(sheet, next));
      for (const key of was) {
        if (now.has(key)) continue;
        const [block, rowKey] = key.includes(":") ? key.split(":") : [null, key];
        if (ORDINAL.test(rowKey)) continue;
        void onRowOp({ sheet: sheet.kind, op: "delete", row_id: rowKey, block });
        return;
      }
    }
    setDraft(next);
  };

  if (!sheet || !draft) return <GridSkeleton />;

  return (
    <>
      <ul className="sg-tabbar">
        {sheets.map((one) => (
          <li key={one.kind}>
            <button
              type="button"
              className="sg-tab"
              aria-current={one.kind === active ? "page" : undefined}
              onClick={() => onActive(one.kind)}
            >
              {TITLES[one.kind]}
              {!canEdit ? (
                <span className="sg-lock">
                  <span aria-hidden="true">🔒</span> View only
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <div className="fp-card">
        <div className="fp-packet-form-head">
          <h2>{TITLES[sheet.kind]}</h2>
        </div>
        {/* A view-only link renders values, never inputs. The disabled prop on
            the shared forms is a courtesy; this is the boundary, and the
            server refuses the write regardless. */}
        {!canEdit ? (
          <ReadOnlySheet sheet={sheet} />
        ) : sheet.kind === "debt_schedule" ? (
          <DebtScheduleForm value={draft as DebtBody} onChange={change} />
        ) : sheet.kind === "pfs" ? (
          <Pfs413Form schema={sheet.schema as PfsSchema} value={draft as PfsBody} onChange={change} />
        ) : (
          <BusinessStatementForm
            schema={sheet.schema as StatementSchema}
            value={draft as StatementBody}
            onChange={change}
          />
        )}
      </div>
    </>
  );
}

/** A view-only sheet on a phone: the labels and the figures, and no input to
 *  type into. Built from the layout the server sent, so it says exactly what
 *  the grid would show on a laptop, in the same order. */
function ReadOnlySheet({ sheet }: { sheet: WorksheetSheet }) {
  const lines: Array<{ label: string; value: string }> = [];
  for (const row of sheet.rows ?? []) {
    const cells = row.cells ?? [];
    if (cells.length === 0) continue;
    if (row.kind === "title" || row.kind === "subtitle" || row.kind === "heading") {
      lines.push({ label: String(cells[0]?.label ?? row.label ?? ""), value: "" });
      continue;
    }
    if (row.kind === "blank" || row.kind === "note" || row.kind === "colhead") continue;
    const label = String(cells[0]?.label ?? row.label ?? "");
    const rest = cells.slice(1);
    const shown = rest
      .map((cell) => {
        if (cell.key) return sheet.values[cell.key] ?? "";
        if (cell.compute) {
          const figure = sheet.computed?.[cell.compute];
          return figure === null || figure === undefined ? "—" : String(figure);
        }
        return String(cell.label ?? "");
      })
      .filter((one) => one !== "")
      .join(" · ");
    if (!label && !shown) continue;
    lines.push({ label, value: shown });
  }
  return (
    <div className="sg-readonly">
      <dl>
        {lines.map((line, index) => (
          <div key={`${line.label}-${index}`} style={{ display: "contents" }}>
            <dt>{line.label}</dt>
            <dd>{line.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
