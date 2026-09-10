"use client";

// The value store: every cell's raw string, what those strings add up to, and
// the queue that gets them to the server.
//
// It is a plain object with `subscribe`/`getSnapshot` rather than React state,
// for three reasons: the debounce and the in-flight batch are not render
// state and re-rendering on every keystroke of a 120-row grid because of them
// is waste; the save queue has to survive a re-render triggered by a remote
// edit; and a plain store is testable in node, which is where the rules that
// matter — the debounce, the immediate flush, and remote-versus-local — can
// actually be pinned. `useSheetValues` is a thin `useSyncExternalStore` over it.
//
// The transport is injected (`onSave`, `onRowOp`, `onResync`) because the same
// store serves the desk, where the caller is a staff session, and the public
// worksheet, where it is a link token. Neither knows about the other.
//
// The rules:
//
// - **700 ms trailing debounce, and an immediate flush on tab switch, window
//   blur and `visibilitychange`.** Typing should not be one request per
//   keystroke; leaving should never be one unsaved cell.
// - **One POST per queue**, last write winning per cell inside the batch.
// - **The response's `computed` replaces the client's.** What you see while
//   typing is this module's arithmetic; what is filed is the server's.
// - **`resync` re-reads only the named sheets.** The server says so when what
//   it stored is not what was sent — a figure normalised, a row another origin
//   owns — and leaving the typed text on screen would be a lie about what was
//   kept.
// - **A cell being edited locally is never overwritten by a remote edit.**
//   The remote value is discarded and a "changed by X" marker is left on the
//   cell, so the person who was typing finds out that they won.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { planPaste } from "./clipboard";
import { recompute, type SheetSchema } from "./compute";
import type {
  CellAddr,
  ComputedValues,
  Edit,
  SheetColumn,
  SheetKind,
  SheetLayout,
  SheetRow,
  SheetValues,
} from "./types";

export type RowMeta = { editable?: boolean; owner?: string | null };

/** One sheet as the read endpoint sends it. `freeze` arrives as an object from
 *  the API and as a pair from `sheet_layout` itself; both are accepted rather
 *  than making every caller normalise. */
export type SheetPayload = {
  kind: SheetKind;
  title?: string;
  schema_version?: string;
  layout_version?: string;
  name_prefix?: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  freeze?: [number, number] | { rows: number; cols: number } | null;
  values?: SheetValues | null;
  computed?: ComputedValues | null;
  schema?: SheetSchema | null;
  rev?: number | null;
  status?: string | null;
  completed?: boolean;
  row_meta?: Record<string, RowMeta> | null;
};

/** A row as `/rows` returns it: the layout row plus that row's values. */
export type RowPayload = SheetRow & { values?: Record<string, string> | null };

/** What a save answers with, when it answers at all. Both containers absorb
 *  the response themselves and hand the sheets back down as props, so a
 *  transport that returns nothing is normal rather than a failure. */
export type SaveResponse = {
  rev?: Record<string, number> | null;
  computed?: Partial<Record<SheetKind, ComputedValues>> | null;
  resync?: SheetKind[] | null;
};

/** The row operation's wire shape — `row_id` in the server's spelling, because
 *  this object is handed to the transport and posted as it stands. */
export type RowOpRequest = {
  sheet: SheetKind;
  op: "insert" | "delete";
  /** The row to remove, or (on an insert) the row the new line follows. */
  row_id?: string | null;
  after?: string | null;
  block?: string | null;
};
export type RowOpResponse = {
  rows?: RowPayload[] | null;
  row_meta?: Record<string, RowMeta> | null;
  rev?: Record<string, number> | null;
};

export type SheetState = {
  layout: SheetLayout;
  values: SheetValues;
  computed: ComputedValues;
  schema: SheetSchema | null;
  rev: number;
  status: string | null;
  completed: boolean;
  rowMeta: Record<string, RowMeta>;
};

/** A remote edit's provenance, for the marker left on a cell that was defended. */
export type RemoteBy = { name?: string | null } | null;

export type CellMark = { name: string; at: number };

export type StoreSnapshot = {
  sheets: Record<string, SheetState>;
  order: SheetKind[];
  /** "kind:key" for every cell changed locally and not yet saved. */
  dirty: string[];
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  /** A 409: this client is too far behind to patch and has to reload. */
  stale: boolean;
  /** "kind:key" → the remote edit that was discarded because you were typing. */
  marks: Record<string, CellMark>;
};

export type SheetStoreOptions = {
  sheets: SheetPayload[];
  /** Post these edits. Addressed by `key`, never by address. */
  onSave: (edits: Edit[]) => Promise<unknown> | unknown;
  onRowOp?: (request: RowOpRequest) => Promise<unknown> | unknown;
  /** Re-read the named sheets. Returning payloads loads them; returning
   *  nothing leaves it to the caller to call `load` when its fetch lands. */
  onResync?: (kinds: SheetKind[]) => Promise<SheetPayload[] | void> | void;
  debounceMs?: number;
  now?: () => number;
};

export type PasteOutcome = {
  /** Cells written. */
  applied: number;
  /** Matrix rows that had nowhere to go on a fixed sheet. */
  clipped: number;
  /** List rows created to make room. */
  appended: number;
  error?: string | null;
};

const DEFAULT_DEBOUNCE = 700;

function freezeRows(freeze: SheetPayload["freeze"]): [number, number] {
  if (Array.isArray(freeze)) return [Number(freeze[0]) || 0, Number(freeze[1]) || 0];
  if (freeze && typeof freeze === "object") return [Number(freeze.rows) || 0, Number(freeze.cols) || 0];
  return [0, 0];
}

/** A payload as the pure modules want it. The two fields the API keeps at the
 *  top of the envelope rather than on each sheet are defaulted, because
 *  nothing in the grid reads them and forcing every caller to fabricate them
 *  would be ceremony. */
export function normalizeLayout(payload: SheetPayload): SheetLayout {
  return {
    kind: payload.kind,
    title: payload.title ?? payload.kind,
    schema_version: payload.schema_version ?? "",
    layout_version: payload.layout_version ?? "",
    name_prefix: payload.name_prefix ?? "",
    columns: payload.columns ?? [],
    rows: payload.rows ?? [],
    freeze: freezeRows(payload.freeze),
  };
}

function stateFrom(payload: SheetPayload): SheetState {
  const layout = normalizeLayout(payload);
  const values = { ...(payload.values ?? {}) };
  const schema = payload.schema ?? null;
  return {
    layout,
    values,
    schema,
    computed: payload.computed ? { ...payload.computed } : recompute(payload.kind, schema, values),
    rev: Number(payload.rev ?? 0),
    status: payload.status ?? null,
    completed: !!payload.completed,
    rowMeta: { ...(payload.row_meta ?? {}) },
  };
}

const cellId = (sheet: string, key: string) => `${sheet}:${key}`;

export class SheetStore {
  private snapshot: StoreSnapshot;
  private listeners = new Set<() => void>();
  private queue = new Map<string, Edit>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private again = false;
  private editingCell: string | null = null;
  private disposed = false;
  private options: SheetStoreOptions;
  private seq = 0;

  constructor(options: SheetStoreOptions) {
    this.options = options;
    const sheets: Record<string, SheetState> = {};
    const order: SheetKind[] = [];
    for (const payload of options.sheets ?? []) {
      sheets[payload.kind] = stateFrom(payload);
      order.push(payload.kind);
    }
    this.snapshot = {
      sheets,
      order,
      dirty: [],
      saving: false,
      savedAt: null,
      error: null,
      stale: false,
      marks: {},
    };
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this.flush = this.flush.bind(this);
  }

  // ── plumbing ────────────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): StoreSnapshot {
    return this.snapshot;
  }

  getSheet(kind: SheetKind): SheetState | undefined {
    return this.snapshot.sheets[kind];
  }

  /** Swap the transport without rebuilding the store: the callbacks close over
   *  a token and a query client and are new on every render, and losing the
   *  queue on each of those would lose keystrokes. */
  setTransport(next: Partial<SheetStoreOptions>): void {
    this.options = { ...this.options, ...next };
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private emit(patch: Partial<StoreSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private dirtyList(): string[] {
    return [...this.queue.keys()];
  }

  // ── loading ─────────────────────────────────────────────────────────────

  /** Replace what is held for the sheets in `payloads`, keeping the rest.
   *  Anything queued survives: a resync answers what the server stored, and a
   *  cell typed a moment ago has not reached it yet. */
  load(payloads: SheetPayload[]): void {
    const sheets = { ...this.snapshot.sheets };
    const order = [...this.snapshot.order];
    for (const payload of payloads ?? []) {
      const state = stateFrom(payload);
      if (!order.includes(payload.kind)) order.push(payload.kind);
      // Anything still queued was typed after the server answered, so it goes
      // back on top — otherwise a resync would visibly undo the keystroke that
      // triggered it.
      const pending = [...this.queue.values()].filter((edit) => edit.sheet === payload.kind);
      if (pending.length) {
        const values = { ...state.values };
        for (const edit of pending) values[edit.key] = edit.value;
        state.values = values;
        state.computed = recompute(payload.kind, state.schema, values);
      }
      sheets[payload.kind] = state;
    }
    this.emit({ sheets, order });
  }

  // ── editing ─────────────────────────────────────────────────────────────

  /** The editor opened. From here until `endEdit`, a remote edit to this cell
   *  is refused rather than applied. */
  beginEdit(sheet: SheetKind, key: string): void {
    this.editingCell = cellId(sheet, key);
  }

  endEdit(sheet: SheetKind, key: string): void {
    if (this.editingCell === cellId(sheet, key)) this.editingCell = null;
  }

  isEditing(sheet: SheetKind, key: string): boolean {
    return this.editingCell === cellId(sheet, key);
  }

  clearMark(sheet: SheetKind, key: string): void {
    const id = cellId(sheet, key);
    if (!this.snapshot.marks[id]) return;
    const marks = { ...this.snapshot.marks };
    delete marks[id];
    this.emit({ marks });
  }

  /** Apply a batch of edits. A local batch is queued for the server; a remote
   *  one is display only, and never touches the cell being typed into. */
  applyEdits(
    edits: Edit[],
    options: { source?: "local" | "remote"; by?: RemoteBy } = {},
  ): void {
    const source = options.source ?? "local";
    if (!edits?.length) return;
    const sheets = { ...this.snapshot.sheets };
    const marks = { ...this.snapshot.marks };
    const touched = new Set<SheetKind>();
    let markChanged = false;

    for (const edit of edits) {
      const state = sheets[edit.sheet];
      if (!state) continue;
      const id = cellId(edit.sheet, edit.key);
      if (source === "remote" && this.editingCell === id) {
        // The rule the live half depends on: your keystrokes are not
        // overwritten mid-word. The value is dropped and the fact is kept.
        marks[id] = { name: options.by?.name?.trim() || "someone else", at: this.now() };
        markChanged = true;
        continue;
      }
      const value = String(edit.value ?? "");
      if (state.values[edit.key] === value && source === "remote") continue;
      sheets[edit.sheet] = { ...state, values: { ...state.values, [edit.key]: value } };
      touched.add(edit.sheet);
      if (source === "local") {
        this.seq += 1;
        this.queue.set(id, { sheet: edit.sheet, key: edit.key, value, addr: edit.addr, clientSeq: this.seq });
      }
    }

    for (const kind of touched) {
      const state = sheets[kind];
      sheets[kind] = { ...state, computed: recompute(kind, state.schema, state.values) };
    }

    this.emit({
      sheets,
      marks: markChanged ? marks : this.snapshot.marks,
      dirty: source === "local" ? this.dirtyList() : this.snapshot.dirty,
      error: source === "local" ? null : this.snapshot.error,
    });
    if (source === "local" && this.queue.size) this.schedule();
  }

  // ── saving ──────────────────────────────────────────────────────────────

  private schedule(): void {
    if (this.disposed || this.snapshot.stale) return;
    if (this.timer) clearTimeout(this.timer);
    const wait = this.options.debounceMs ?? DEFAULT_DEBOUNCE;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }

  /** The clock reading per sheet. The containers send this with the write;
   *  it is exposed rather than sent from here because they own the request. */
  baseRev(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [kind, state] of Object.entries(this.snapshot.sheets)) out[kind] = state.rev;
    return out;
  }

  /** Send the queue now. Called on the debounce, on a tab switch, on window
   *  blur and on `visibilitychange` — the three moments where waiting another
   *  700 ms is how an edit gets lost. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.disposed || this.snapshot.stale) return;
    if (!this.queue.size) return;
    if (this.inflight) {
      this.again = true;
      return;
    }
    const batch = [...this.queue.values()];
    this.queue.clear();
    this.inflight = true;
    this.emit({ saving: true, dirty: this.dirtyList() });
    try {
      const response = asSaveResponse(await this.options.onSave(batch));
      this.absorb(response);
      this.emit({ saving: false, savedAt: this.now(), error: null, dirty: this.dirtyList() });
      const resync = response.resync ?? [];
      if (resync.length && this.options.onResync) {
        const fresh = await this.options.onResync(resync);
        if (fresh && Array.isArray(fresh)) this.load(fresh);
      }
    } catch (error) {
      this.requeue(batch);
      const stale = isStale(error);
      this.emit({
        saving: false,
        stale,
        error: messageOf(error),
        dirty: this.dirtyList(),
      });
      if (!stale) this.schedule();
      return;
    } finally {
      this.inflight = false;
    }
    if (this.again || this.queue.size) {
      this.again = false;
      this.schedule();
    }
  }

  /** Put a failed batch back, without stepping on anything typed since. */
  private requeue(batch: Edit[]): void {
    for (const edit of batch) {
      const id = cellId(edit.sheet, edit.key);
      if (!this.queue.has(id)) this.queue.set(id, edit);
    }
  }

  private absorb(response: SaveResponse): void {
    const sheets = { ...this.snapshot.sheets };
    let changed = false;
    for (const [kind, rev] of Object.entries(response.rev ?? {})) {
      const state = sheets[kind];
      if (!state || typeof rev !== "number") continue;
      sheets[kind] = { ...state, rev };
      changed = true;
    }
    for (const [kind, computed] of Object.entries(response.computed ?? {})) {
      const state = sheets[kind];
      if (!state || !computed) continue;
      // The server's arithmetic is the filed one. Ours was the preview.
      sheets[kind] = { ...sheets[kind], computed: { ...computed } };
      changed = true;
    }
    if (changed) this.emit({ sheets });
  }

  // ── rows ────────────────────────────────────────────────────────────────

  /** Add or remove a line on one of the two list-shaped sheets. Queued edits
   *  go first: the row list comes back from the server built from the stored
   *  body, and anything still in the queue would be missing from it. */
  async rowOp(request: RowOpRequest): Promise<RowOpResponse | null> {
    if (!this.options.onRowOp) return null;
    await this.flush();
    const response = asRowOpResponse(await this.options.onRowOp(request));
    this.applyRows(request.sheet, response);
    return response;
  }

  applyRows(kind: SheetKind, response: RowOpResponse): void {
    const state = this.snapshot.sheets[kind];
    if (!state) return;
    const sheets = { ...this.snapshot.sheets };
    const rows = response.rows ?? null;
    let values = state.values;
    let layout = state.layout;
    if (rows) {
      values = {};
      for (const row of rows) {
        for (const [key, value] of Object.entries(row.values ?? {})) values[key] = String(value ?? "");
      }
      // Keys outside the row list (a sheet's header fields) are not in a row
      // payload and must not be dropped.
      for (const [key, value] of Object.entries(state.values)) {
        if (!(key in values) && !rowOwns(rows, key)) values[key] = value;
      }
      layout = {
        ...layout,
        rows: rows.map(({ values: _rowValues, ...row }) => row),
      };
    }
    const rev = response.rev?.[kind];
    sheets[kind] = {
      ...state,
      layout,
      values,
      rowMeta: response.row_meta ? { ...response.row_meta } : state.rowMeta,
      rev: typeof rev === "number" ? rev : state.rev,
      computed: recompute(kind, state.schema, values),
    };
    this.emit({ sheets });
  }

  // ── paste ───────────────────────────────────────────────────────────────

  /** A block of clipboard values onto the sheet.
   *
   *  Rows past the end of a list are made first, one server round trip each,
   *  and then the paste is planned *again* against the row list that came
   *  back. `planPaste` gives an appended row a minted key and a nominal
   *  address, neither of which the server knows; re-planning means every edit
   *  sent is addressed by a key the layout actually has. */
  async pasteInto(kind: SheetKind, topLeft: CellAddr, matrix: string[][]): Promise<PasteOutcome> {
    const state = this.snapshot.sheets[kind];
    if (!state) return { applied: 0, clipped: 0, appended: 0 };
    let plan = planPaste(state.layout, state.values, topLeft, matrix);
    let appended = 0;
    if (plan.newRows.length && this.options.onRowOp) {
      const block = plan.newRows[0].block;
      let after = plan.newRows[0].after;
      try {
        for (let index = 0; index < plan.newRows.length; index += 1) {
          const response = await this.rowOp({ sheet: kind, op: "insert", block, after });
          appended += 1;
          const rows = response?.rows ?? [];
          const last = [...rows].reverse().find((row) => row.block === block && row.row_key);
          after = last?.row_key ?? after;
        }
      } catch (error) {
        return { applied: 0, clipped: plan.clipped, appended, error: messageOf(error) };
      }
      const fresh = this.snapshot.sheets[kind];
      plan = planPaste(fresh.layout, fresh.values, topLeft, matrix);
    }
    this.applyEdits(plan.edits, { source: "local" });
    return { applied: plan.edits.length, clipped: plan.clipped, appended };
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}

/** The transports are typed loosely — the containers own the request and may
 *  answer with nothing — so what comes back is read defensively rather than
 *  asserted. */
function asSaveResponse(value: unknown): SaveResponse {
  if (!value || typeof value !== "object") return {};
  const shape = value as SaveResponse;
  return {
    rev: shape.rev && typeof shape.rev === "object" ? shape.rev : null,
    computed: shape.computed && typeof shape.computed === "object" ? shape.computed : null,
    resync: Array.isArray(shape.resync) ? shape.resync : null,
  };
}

function asRowOpResponse(value: unknown): RowOpResponse {
  if (!value || typeof value !== "object") return {};
  const shape = value as RowOpResponse;
  return {
    rows: Array.isArray(shape.rows) ? shape.rows : null,
    row_meta: shape.row_meta && typeof shape.row_meta === "object" ? shape.row_meta : null,
    rev: shape.rev && typeof shape.rev === "object" ? shape.rev : null,
  };
}

function rowOwns(rows: RowPayload[], key: string): boolean {
  for (const row of rows) {
    for (const cell of row.cells ?? []) {
      if (cell.key === key) return true;
    }
  }
  return false;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "That change could not be saved.";
}

/** A 409 from `sheets.apply_cell_edits`: hundreds of revisions behind is a
 *  dropped connection, not a race, and the answer is to reload. */
function isStale(error: unknown): boolean {
  const shape = error as { status?: number; code?: string; response?: { status?: number } } | null;
  if (!shape || typeof shape !== "object") return false;
  return shape.status === 409 || shape.response?.status === 409 || shape.code === "stale_worksheet";
}

export function createSheetStore(options: SheetStoreOptions): SheetStore {
  return new SheetStore(options);
}

export type SheetValuesHandle = {
  store: SheetStore;
  snapshot: StoreSnapshot;
  sheet: (kind: SheetKind) => SheetState | undefined;
  applyEdits: (edits: Edit[], options?: { source?: "local" | "remote"; by?: RemoteBy }) => void;
  beginEdit: (sheet: SheetKind, key: string) => void;
  endEdit: (sheet: SheetKind, key: string) => void;
  clearMark: (sheet: SheetKind, key: string) => void;
  flushNow: () => void;
  rowOp: (request: RowOpRequest) => Promise<RowOpResponse | null>;
  pasteInto: (kind: SheetKind, topLeft: CellAddr, matrix: string[][]) => Promise<PasteOutcome>;
};

/** The hook. One store per mount; the transport is refreshed on every render
 *  rather than rebuilding it, and the queue is flushed the moment the window
 *  goes away. */
export function useSheetValues(options: SheetStoreOptions): SheetValuesHandle {
  const ref = useRef<SheetStore | null>(null);
  if (ref.current === null) ref.current = createSheetStore(options);
  const store = ref.current;
  store.setTransport({
    onSave: options.onSave,
    onRowOp: options.onRowOp,
    onResync: options.onResync,
    debounceMs: options.debounceMs,
    now: options.now,
  });

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flush = () => {
      void store.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibility);
    // `pagehide` is the one iOS Safari actually fires when a tab goes away.
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [store]);

  useEffect(() => () => store.dispose(), [store]);

  const applyEdits = useCallback(
    (edits: Edit[], opts?: { source?: "local" | "remote"; by?: RemoteBy }) => store.applyEdits(edits, opts),
    [store],
  );
  const beginEdit = useCallback((sheet: SheetKind, key: string) => store.beginEdit(sheet, key), [store]);
  const endEdit = useCallback((sheet: SheetKind, key: string) => store.endEdit(sheet, key), [store]);
  const clearMark = useCallback((sheet: SheetKind, key: string) => store.clearMark(sheet, key), [store]);
  const flushNow = useCallback(() => {
    void store.flush();
  }, [store]);
  const rowOp = useCallback((request: RowOpRequest) => store.rowOp(request), [store]);
  const pasteInto = useCallback(
    (kind: SheetKind, topLeft: CellAddr, matrix: string[][]) => store.pasteInto(kind, topLeft, matrix),
    [store],
  );
  const sheet = useCallback((kind: SheetKind) => snapshot.sheets[kind], [snapshot]);

  return useMemo(
    () => ({ store, snapshot, sheet, applyEdits, beginEdit, endEdit, clearMark, flushNow, rowOp, pasteInto }),
    [store, snapshot, sheet, applyEdits, beginEdit, endEdit, clearMark, flushNow, rowOp, pasteInto],
  );
}
