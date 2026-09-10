"use client";

// The worksheet: a toolbar, one grid, and the four tabs under it.
//
// This is the stateful piece the two containers mount — the desk's fullscreen
// drawer and the no-login link page — and it is deliberately the *only* place
// the two have in common. Each of them owns its own transport (a Clerk-authed
// `api()` on one side, a bare token fetch on the other), its own error copy
// and its own idea of what a session is; this component owns the values, the
// save queue and the keyboard.
//
// Three decisions worth keeping:
//
// - **The sheets prop is the server's answer, and it wins on arrival.** Both
//   containers absorb their own write responses and hand the sheets back down.
//   A sheet is reloaded into the store when its payload object changes
//   identity, and anything still queued is re-applied on top, so a resync
//   never visibly undoes the keystroke that caused it.
// - **The tab switch flushes.** Changing tabs is one of the three moments the
//   debounce must not be allowed to swallow (the other two, window blur and
//   `visibilitychange`, are handled inside the store).
// - **No Ctrl+Z, and the reason is on screen.** With remote edits arriving, an
//   undo stack reverts somebody else's cell. The keystroke answers with a
//   sentence instead of doing the wrong thing quietly.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Btn } from "@/components/ds";
import { SheetGrid, type GridCursor } from "./SheetGrid";
import { SheetTabs, type SheetTab } from "./SheetTabs";
import { SheetToolbar } from "./SheetToolbar";
import {
  useSheetValues,
  type RowMeta,
  type RowOpRequest,
  type SheetPayload,
} from "./useSheetValues";
import type { Edit, SheetColumn, SheetKind, SheetRow } from "./types";

/** One sheet as `sheets.read_sheets` sends it. Typed structurally rather than
 *  imported from `@/lib/worksheetApi`, so the grid keeps no dependency on a
 *  transport: `schema` is `unknown` here for the same reason — it is handed
 *  straight to `recompute`, which decides what it is by looking. */
export type WorksheetSheetInput = {
  kind: SheetKind;
  title: string;
  schema_version?: string;
  status?: string | null;
  completed?: boolean;
  rev?: number;
  columns: SheetColumn[];
  freeze?: { rows: number; cols: number } | [number, number] | null;
  rows: SheetRow[];
  schema?: unknown;
  values: Record<string, string>;
  row_meta?: Record<string, RowMeta> | null;
  computed?: Record<string, number | null> | null;
};

export type WorksheetScopeInput = {
  can_edit: boolean;
  sheets: SheetKind[];
  open_at: SheetKind | null;
};

/** A batch of cell values from somebody else, handed in by the live half.
 *  `seq` is what makes it applied once: the same array re-rendered is not a
 *  new batch. Values only — a cursor never carries one. */
export type RemoteEditBatch = {
  seq: number;
  edits: Array<{ sheet: SheetKind; key: string; value: string }>;
  by?: { name?: string | null } | null;
};

export type WorksheetProps = {
  sheets: WorksheetSheetInput[];
  scope: WorksheetScopeInput;
  onSave: (edits: Edit[]) => Promise<unknown> | unknown;
  onRowOp?: (request: RowOpRequest) => Promise<unknown> | unknown;
  onDownload?: () => void;
  onSubmit?: () => void;
  submitting?: boolean;
  /** The live half's participant strip. */
  presenceSlot?: ReactNode;
  /** The live half's cursor overlay, drawn over the grid. */
  overlay?: ReactNode;
  /** Where this browser's caret is, for the live half to broadcast. */
  onCursor?: (cursor: GridCursor & { sheet: SheetKind }) => void;
  remoteEdits?: RemoteEditBatch | null;
  title?: string;
  subtitle?: string | null;
};

const LIST_SHEETS: SheetKind[] = ["debt_schedule", "pfs"];

function toPayload(sheet: WorksheetSheetInput): SheetPayload {
  return {
    kind: sheet.kind,
    title: sheet.title,
    schema_version: sheet.schema_version,
    columns: sheet.columns,
    rows: sheet.rows,
    freeze: sheet.freeze ?? null,
    values: sheet.values,
    computed: sheet.computed ?? null,
    // `recompute` reads the shape it was given and answers `{}` for anything
    // it does not recognise, which is the right answer for a sheet whose
    // schema the server did not ship.
    schema: (sheet.schema ?? null) as SheetPayload["schema"],
    rev: sheet.rev ?? 0,
    status: sheet.status ?? null,
    completed: sheet.completed,
    row_meta: sheet.row_meta ?? null,
  };
}

function chipFor(sheet: WorksheetSheetInput): SheetTab["chip"] {
  if (sheet.completed || sheet.status === "submitted") {
    return { label: "Sent", tone: "ok", title: "This form has been submitted. Edits still save." };
  }
  const filled = Object.values(sheet.values ?? {}).some((value) => String(value ?? "").trim() !== "");
  if (filled) return { label: "Draft", tone: "warn", title: "Started, not sent yet." };
  return { label: "Empty", tone: "mut", title: "Nothing has been entered on this sheet." };
}

export function Worksheet({
  sheets,
  scope,
  onSave,
  onRowOp,
  onDownload,
  onSubmit,
  submitting,
  presenceSlot,
  overlay,
  onCursor,
  remoteEdits,
  title,
  subtitle,
}: WorksheetProps) {
  const canEdit = !!scope?.can_edit;
  const payloads = useMemo(() => sheets.map(toPayload), [sheets]);

  const values = useSheetValues({
    sheets: payloads,
    onSave,
    onRowOp,
  });
  const { store, snapshot } = values;

  // ── the props are the server's answer ───────────────────────────────────

  const loaded = useRef<Map<SheetKind, WorksheetSheetInput> | null>(null);
  if (loaded.current === null) {
    loaded.current = new Map(sheets.map((sheet) => [sheet.kind, sheet]));
  }
  useEffect(() => {
    const seen = loaded.current;
    if (!seen) return;
    const fresh = sheets.filter((sheet) => seen.get(sheet.kind) !== sheet);
    if (!fresh.length) return;
    for (const sheet of fresh) seen.set(sheet.kind, sheet);
    store.load(fresh.map(toPayload));
  }, [sheets, store]);

  // ── remote edits ────────────────────────────────────────────────────────

  const lastRemote = useRef<number>(-1);
  useEffect(() => {
    if (!remoteEdits || remoteEdits.seq === lastRemote.current) return;
    lastRemote.current = remoteEdits.seq;
    store.applyEdits(remoteEdits.edits as Edit[], { source: "remote", by: remoteEdits.by ?? null });
  }, [remoteEdits, store]);

  // ── tabs ────────────────────────────────────────────────────────────────

  const order = useMemo(
    () => sheets.map((sheet) => sheet.kind).filter((kind) => !scope?.sheets || scope.sheets.includes(kind)),
    [scope, sheets],
  );
  const [active, setActive] = useState<SheetKind>(() => scope?.open_at ?? order[0] ?? "p_and_l");
  const [notice, setNotice] = useState<string | null>(null);
  const [cursor, setCursor] = useState<GridCursor | null>(null);
  const shown = order.includes(active) ? active : order[0];

  const onTab = useCallback(
    (kind: SheetKind) => {
      // Leaving the sheet must not leave a cell in the debounce window.
      values.flushNow();
      setActive(kind);
      setNotice(null);
    },
    [values],
  );

  const state = shown ? snapshot.sheets[shown] : undefined;
  const input = sheets.find((sheet) => sheet.kind === shown);

  const lockedRows = useMemo(() => {
    const locked = new Set<string>();
    for (const [rowKey, meta] of Object.entries(state?.rowMeta ?? {})) {
      if (meta && meta.editable === false) locked.add(rowKey);
    }
    return locked;
  }, [state?.rowMeta]);

  const onEdits = useCallback(
    (edits: Edit[]) => {
      if (!canEdit || !edits.length) return;
      store.applyEdits(edits, { source: "local" });
    },
    [canEdit, store],
  );

  const onBeginEdit = useCallback(
    (key: string) => {
      if (shown) store.beginEdit(shown, key);
    },
    [shown, store],
  );
  const onEndEdit = useCallback(
    (key: string) => {
      if (shown) store.endEdit(shown, key);
    },
    [shown, store],
  );

  const onPaste = useCallback(
    (topLeft: { r: number; c: number }, matrix: string[][]) => {
      if (!shown || !canEdit) return;
      void store.pasteInto(shown, topLeft, matrix).then((outcome) => {
        if (outcome.error) {
          setNotice(outcome.error);
          return;
        }
        const rows = matrix.length;
        if (outcome.clipped > 0) {
          setNotice(
            `${rows - outcome.clipped} of ${rows} rows pasted — the section ends here, so the rest was not filed anywhere.`,
          );
          return;
        }
        setNotice(
          outcome.appended > 0
            ? `Pasted ${rows} rows, ${outcome.appended} of them on new lines.`
            : `Pasted ${outcome.applied} cell${outcome.applied === 1 ? "" : "s"}.`,
        );
      });
    },
    [canEdit, shown, store],
  );

  const handleCursor = useCallback(
    (next: GridCursor) => {
      setCursor(next);
      if (shown) onCursor?.({ ...next, sheet: shown });
    },
    [onCursor, shown],
  );

  // ── row buttons ─────────────────────────────────────────────────────────

  const listSheet = !!shown && LIST_SHEETS.includes(shown);
  const block = cursor?.block ?? null;
  const canAddRow = canEdit && listSheet && !!onRowOp && !!block;
  const canRemoveRow = canAddRow && !!cursor?.rowKey && !lockedRows.has(cursor.rowKey);

  const addRow = useCallback(() => {
    if (!shown || !block) return;
    void store.rowOp({ sheet: shown, op: "insert", block, after: cursor?.rowKey ?? null });
  }, [block, cursor?.rowKey, shown, store]);

  const removeRow = useCallback(() => {
    if (!shown || !block || !cursor?.rowKey) return;
    void store.rowOp({ sheet: shown, op: "delete", block, row_id: cursor.rowKey });
  }, [block, cursor?.rowKey, shown, store]);

  const tabs: SheetTab[] = useMemo(
    () =>
      order
        .map((kind) => sheets.find((sheet) => sheet.kind === kind))
        .filter((sheet): sheet is WorksheetSheetInput => !!sheet)
        .map((sheet) => ({ kind: sheet.kind, title: sheet.title, chip: chipFor(sheet) })),
    [order, sheets],
  );

  if (!shown || !state) {
    return <p className="sub">There is nothing on this worksheet to show.</p>;
  }

  return (
    <div className="sg">
      <SheetToolbar
        title={title ?? state.layout.title ?? input?.title ?? "Worksheet"}
        subtitle={subtitle}
        saving={snapshot.saving}
        savedAt={snapshot.savedAt}
        dirty={snapshot.dirty.length}
        error={snapshot.error}
        stale={snapshot.stale}
        canEdit={canEdit}
        presenceSlot={presenceSlot}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        onDownload={onDownload}
        onSubmit={onSubmit}
        submitting={submitting}
        actions={
          canAddRow ? (
            <>
              <Btn size="sm" onClick={addRow}>
                Add a line
              </Btn>
              {canRemoveRow ? (
                <Btn size="sm" onClick={removeRow}>
                  Remove this line
                </Btn>
              ) : null}
            </>
          ) : null
        }
      />

      <SheetGrid
        // A new sheet is a new keyboard: the selection starts at its first
        // input rather than at whatever address the last tab was on.
        key={shown}
        layout={state.layout}
        values={state.values}
        computed={state.computed}
        canEdit={canEdit}
        lockedRows={lockedRows}
        marks={snapshot.marks}
        overlay={overlay}
        onEdits={onEdits}
        onBeginEdit={onBeginEdit}
        onEndEdit={onEndEdit}
        onPaste={onPaste}
        onCursor={handleCursor}
        onNotice={setNotice}
      />

      <SheetTabs tabs={tabs} active={shown} onChange={onTab} canEdit={canEdit} />

      <p className="sg-foot">
        Figures save as you type, so there is no undo — other people may be editing the same sheet.
        Copy and paste work across columns: paste a column out of your own spreadsheet and it fills
        down from the cell you are on.
      </p>
    </div>
  );
}

export type { GridCursor };
