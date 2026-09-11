// The value store: the debounce, the immediate flush, what happens when the
// server disagrees, and the one rule the live half depends on — a cell being
// typed into is never overwritten by somebody else's edit.
//
// The store is a plain object on purpose, so all of this is testable in node
// with fake timers and no DOM. `useSheetValues` is a `useSyncExternalStore`
// wrapper around exactly what is exercised here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSheetStore, type SheetPayload, type SheetStore } from "../useSheetValues";
import type { SheetRow } from "../types";
import { DS_LAYOUT, PL_LAYOUT, PL_SCHEMA } from "./fixtures.test";

function plPayload(values: Record<string, string> = {}): SheetPayload {
  return {
    kind: "p_and_l",
    title: PL_LAYOUT.title,
    columns: PL_LAYOUT.columns,
    rows: PL_LAYOUT.rows,
    freeze: { rows: 6, cols: 1 },
    schema: PL_SCHEMA,
    values,
    computed: null,
    rev: 1,
    status: "draft",
  };
}

function dsPayload(values: Record<string, string> = {}): SheetPayload {
  return {
    kind: "debt_schedule",
    title: DS_LAYOUT.title,
    columns: DS_LAYOUT.columns,
    rows: DS_LAYOUT.rows,
    freeze: { rows: 5, cols: 1 },
    schema: null,
    values,
    computed: null,
    rev: 1,
  };
}

let store: SheetStore;
const onSave = vi.fn();
const onRowOp = vi.fn();
const onResync = vi.fn();

function build(sheets: SheetPayload[] = [plPayload(), dsPayload()]): SheetStore {
  return createSheetStore({ sheets, onSave, onRowOp, onResync });
}

beforeEach(() => {
  vi.useFakeTimers();
  onSave.mockReset().mockResolvedValue({ rev: { p_and_l: 2 }, computed: {}, resync: [] });
  onRowOp.mockReset();
  onResync.mockReset();
  store = build();
});

afterEach(() => {
  store.dispose();
  vi.useRealTimers();
});

const values = (kind: "p_and_l" | "debt_schedule" = "p_and_l") => store.getSnapshot().sheets[kind].values;

describe("the debounce", () => {
  it("shows the value at once and sends it 700 ms later", async () => {
    store.applyEdits([{ sheet: "p_and_l", key: "gross_revenue", value: "1,250" }]);
    expect(values().gross_revenue).toBe("1,250");
    expect(store.getSnapshot().dirty).toEqual(["p_and_l:gross_revenue"]);
    expect(onSave).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(699);
    expect(onSave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual([
      expect.objectContaining({ sheet: "p_and_l", key: "gross_revenue", value: "1,250" }),
    ]);
    expect(store.getSnapshot().dirty).toEqual([]);
    expect(store.getSnapshot().savedAt).not.toBeNull();
  });

  it("sends one request for the whole queue, last value winning per cell", async () => {
    store.applyEdits([{ sheet: "p_and_l", key: "gross_revenue", value: "100" }]);
    await vi.advanceTimersByTimeAsync(300);
    store.applyEdits([{ sheet: "p_and_l", key: "gross_revenue", value: "150" }]);
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "40" }]);
    await vi.advanceTimersByTimeAsync(700);

    expect(onSave).toHaveBeenCalledTimes(1);
    const sent = onSave.mock.calls[0][0] as Array<{ key: string; value: string }>;
    expect(sent).toHaveLength(2);
    expect(sent.find((edit) => edit.key === "gross_revenue")?.value).toBe("150");
  });

  it("computes what you see while you type", () => {
    store.applyEdits([
      { sheet: "p_and_l", key: "gross_revenue", value: "1000" },
      { sheet: "p_and_l", key: "cost_of_goods_sold", value: "(250)" },
    ]);
    // Accounting parentheses are a negative, on the way in as on the wire.
    expect(store.getSnapshot().sheets.p_and_l.computed.gross_profit).toBe(1250);
  });
});

describe("the immediate flush", () => {
  it("sends now and cancels the pending one", async () => {
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "12" }]);
    await store.flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is nothing queued", async () => {
    await store.flush();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("queues behind a request already in flight rather than racing it", async () => {
    let release: (value: unknown) => void = () => undefined;
    onSave.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "1" }]);
    // Not awaited: this request is deliberately left hanging.
    void store.flush();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledTimes(1);

    store.applyEdits([{ sheet: "p_and_l", key: "payroll", value: "2" }]);
    await store.flush();
    expect(onSave).toHaveBeenCalledTimes(1);

    release({ rev: { p_and_l: 2 }, computed: {}, resync: [] });
    await vi.advanceTimersByTimeAsync(700);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect((onSave.mock.calls[1][0] as Array<{ key: string }>)[0].key).toBe("payroll");
  });
});

describe("what the server says", () => {
  it("replaces the client's arithmetic with the server's", async () => {
    onSave.mockResolvedValue({ rev: { p_and_l: 9 }, computed: { p_and_l: { gross_profit: 4242 } }, resync: [] });
    store.applyEdits([{ sheet: "p_and_l", key: "gross_revenue", value: "10" }]);
    await vi.advanceTimersByTimeAsync(700);
    expect(store.getSnapshot().sheets.p_and_l.computed.gross_profit).toBe(4242);
    expect(store.baseRev().p_and_l).toBe(9);
  });

  it("re-reads only the sheets it named, and keeps what was typed meanwhile", async () => {
    onSave.mockResolvedValue({ rev: { p_and_l: 3 }, computed: {}, resync: ["p_and_l"] });
    onResync.mockImplementation(async () => {
      // Answers with the stored figure — normalised, and without the cell that
      // was typed while the request was in the air.
      store.applyEdits([{ sheet: "p_and_l", key: "payroll", value: "999" }]);
      return [plPayload({ gross_revenue: "1250.00" })];
    });

    store.applyEdits([{ sheet: "p_and_l", key: "gross_revenue", value: "1,250" }]);
    await vi.advanceTimersByTimeAsync(700);

    expect(onResync).toHaveBeenCalledWith(["p_and_l"]);
    expect(values().gross_revenue).toBe("1250.00");
    expect(values().payroll).toBe("999");
    expect(values("debt_schedule")).toEqual({});
  });

  it("puts a failed batch back and tries again", async () => {
    onSave.mockRejectedValueOnce(new Error("The network went away."));
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "40" }]);
    await vi.advanceTimersByTimeAsync(700);

    expect(store.getSnapshot().error).toBe("The network went away.");
    expect(store.getSnapshot().dirty).toEqual(["p_and_l:supplies"]);
    expect(values().supplies).toBe("40");

    await vi.advanceTimersByTimeAsync(700);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().error).toBeNull();
    expect(store.getSnapshot().dirty).toEqual([]);
  });

  it("stops on the one 409 rather than retrying forever", async () => {
    onSave.mockRejectedValue(Object.assign(new Error("stale"), { status: 409 }));
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "40" }]);
    await vi.advanceTimersByTimeAsync(700);
    expect(store.getSnapshot().stale).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("a remote edit never lands on the cell you are typing in", () => {
  it("keeps your value and leaves the fact of it on the cell", async () => {
    store.beginEdit("p_and_l", "supplies");
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "777" }], {
      source: "remote",
      by: { name: "Dana R." },
    });

    expect(values().supplies).toBeUndefined();
    expect(store.getSnapshot().marks["p_and_l:supplies"]).toMatchObject({ name: "Dana R." });

    // And the discarded value is not sent back as though it were ours.
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("applies once the editor has closed", () => {
    store.beginEdit("p_and_l", "supplies");
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "777" }], { source: "remote" });
    store.endEdit("p_and_l", "supplies");
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "888" }], { source: "remote" });
    expect(values().supplies).toBe("888");
  });

  it("applies to every other cell, and queues none of it", async () => {
    store.beginEdit("p_and_l", "supplies");
    store.applyEdits(
      [
        { sheet: "p_and_l", key: "supplies", value: "777" },
        { sheet: "p_and_l", key: "payroll", value: "500" },
      ],
      { source: "remote", by: { name: "Dana R." } },
    );
    expect(values().payroll).toBe("500");
    expect(store.getSnapshot().dirty).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("names the marker for an anonymous editor rather than leaving it blank", () => {
    store.beginEdit("p_and_l", "supplies");
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "1" }], { source: "remote", by: { name: "  " } });
    expect(store.getSnapshot().marks["p_and_l:supplies"].name).toBe("someone else");
    store.clearMark("p_and_l", "supplies");
    expect(store.getSnapshot().marks["p_and_l:supplies"]).toBeUndefined();
  });
});

describe("pasting", () => {
  it("stops at the end of the section and says how much did not fit", async () => {
    // Row 12 is the last input of Revenue; row 13 is its subtotal.
    const outcome = await store.pasteInto("p_and_l", { r: 12, c: 2 }, [["1"], ["2"], ["3"]]);
    expect(outcome).toMatchObject({ applied: 1, clipped: 2, appended: 0 });
    expect(values().cost_of_goods_sold).toBe("1");
  });

  it("makes the rows it needs and addresses the edits by the keys that come back", async () => {
    const rows: SheetRow[] = DS_LAYOUT.rows.map((row) => ({ ...row }));
    let next = 4;
    onRowOp.mockImplementation(async () => {
      const template = [...rows].reverse().find((row) => row.kind === "data")!;
      const from = template.row_key as string;
      const to = `d${next}`;
      next += 1;
      const fresh: SheetRow = {
        ...template,
        r: template.r + 1,
        row_key: to,
        ordinal: (template.ordinal ?? 0) + 1,
        cells: (template.cells ?? []).map((cell) => ({
          ...cell,
          key: cell.key ? cell.key.replace(`${from}.`, `${to}.`) : cell.key,
        })),
      };
      const at = rows.indexOf(template);
      rows.splice(at + 1, 0, fresh);
      return { rows: rows.map((row) => ({ ...row, values: {} })), row_meta: {}, rev: { debt_schedule: next } };
    });

    const matrix = [
      ["Bank of A", "term"],
      ["Bank of B", "term"],
      ["Bank of C", "term"],
      ["Bank of D", "line"],
      ["Bank of E", "line"],
    ];
    const outcome = await store.pasteInto("debt_schedule", { r: 7, c: 1 }, matrix);

    expect(outcome.appended).toBe(2);
    expect(onRowOp).toHaveBeenCalledTimes(2);
    expect(onRowOp.mock.calls[0][0]).toMatchObject({ sheet: "debt_schedule", op: "insert", block: "debts", after: "d3" });
    expect(onRowOp.mock.calls[1][0]).toMatchObject({ after: "d4" });

    expect(values("debt_schedule")["d5.lender"]).toBe("Bank of E");

    await vi.advanceTimersByTimeAsync(700);
    const sent = onSave.mock.calls[0][0] as Array<{ key: string }>;
    const keys = sent.map((edit) => edit.key);
    // Every edit is addressed by a key the server knows. `planPaste` mints a
    // key and a nominal address for an appended row, and neither may reach
    // the wire — hence the re-plan once the rows exist.
    expect(keys).toContain("d5.lender");
    expect(keys.some((key) => key.startsWith("n"))).toBe(false);
  });
});

describe("loading the server's answer over what is held", () => {
  it("replaces the sheet and re-applies anything still queued", async () => {
    store.applyEdits([{ sheet: "p_and_l", key: "supplies", value: "40" }]);
    store.load([plPayload({ gross_revenue: "9000", supplies: "1" })]);
    expect(values().gross_revenue).toBe("9000");
    expect(values().supplies).toBe("40");
    await vi.advanceTimersByTimeAsync(700);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("telling the server how many lines are on screen", () => {
  // The debt schedule's blank lines are not in the stored body — an empty row
  // there would be an invented obligation, and `count_in_dscr` defaults true.
  // So the server pads the list back up on every read, and without being told
  // what the grid is actually showing it would add one to the same short list
  // every time. That is what made the first "Add a line" work and every one
  // after it do nothing. The count is taken here, from the layout the store
  // holds, so no caller has to remember to send it.
  const rowOpReturns = (rows: SheetRow[]) =>
    onRowOp.mockResolvedValue({ rows: rows.map((row) => ({ ...row, values: {} })), row_meta: {}, rev: { debt_schedule: 2 } });

  it("counts the lines of the block being added to", async () => {
    rowOpReturns(DS_LAYOUT.rows as SheetRow[]);
    await store.rowOp({ sheet: "debt_schedule", op: "insert", block: "debts", after: "d3" });
    // Three debt lines in the fixture. The title, the column heads and the
    // total line carry the block too and are not lines.
    expect(onRowOp.mock.calls[0][0]).toMatchObject({ visible: 3 });
  });

  it("moves the count as the grid grows, so a second add is not a no-op", async () => {
    const rows: SheetRow[] = DS_LAYOUT.rows.map((row) => ({ ...row }));
    let next = 4;
    onRowOp.mockImplementation(async () => {
      const last = [...rows].reverse().find((row) => row.kind === "data")!;
      const key = `d${next}`;
      next += 1;
      rows.splice(rows.indexOf(last) + 1, 0, { ...last, r: last.r + 1, row_key: key, ordinal: (last.ordinal ?? 0) + 1 });
      return { rows: rows.map((row) => ({ ...row, values: {} })), row_meta: {}, rev: { debt_schedule: next } };
    });

    await store.rowOp({ sheet: "debt_schedule", op: "insert", block: "debts", after: "d3" });
    await store.rowOp({ sheet: "debt_schedule", op: "insert", block: "debts", after: "d4" });
    await store.rowOp({ sheet: "debt_schedule", op: "insert", block: "debts", after: "d5" });

    expect(onRowOp.mock.calls.map((call) => call[0].visible)).toEqual([3, 4, 5]);
  });

  it("leaves a count the caller supplied alone", async () => {
    rowOpReturns(DS_LAYOUT.rows as SheetRow[]);
    await store.rowOp({ sheet: "debt_schedule", op: "insert", block: "debts", visible: 11 });
    expect(onRowOp.mock.calls[0][0]).toMatchObject({ visible: 11 });
  });

  it("sends nothing to count when the operation names no block", async () => {
    rowOpReturns(DS_LAYOUT.rows as SheetRow[]);
    await store.rowOp({ sheet: "debt_schedule", op: "insert" });
    expect(onRowOp.mock.calls[0][0]).toMatchObject({ visible: 0 });
  });
});
