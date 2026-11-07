import { afterEach, describe, expect, it, vi } from "vitest";
import { createSheetStore, type RowOpResponse, type SheetPayload, type SheetStore } from "../useSheetValues";
import type { SheetCell, SheetLayout, SheetValues } from "../types";

const fields = ["lender", "debt_type", "original_amount", "balance", "rate", "monthly_payment", "originated_on", "maturity_on", "secured", "payment_status", "collateral", "mca_modified", "mca_modification_note", "notes", "factor_rate", "payment_amount", "payment_frequency"];
const stores: SheetStore[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.dispose()));

function payload(ids = ["a"]): SheetPayload {
  const values: SheetValues = { business_name: "Synthetic business" };
  for (const id of ids) for (const field of fields) values[`${id}.${field}`] = ({ lender: `Lender ${id}`, original_amount: "100", balance: "75", monthly_payment: "10", originated_on: "2025-01-02" } as Record<string, string>)[field] ?? "";
  return { kind: "debt_schedule", title: "Debt schedule", columns: [...fields.map((field, index) => ({ c: index + 1, label: field, width: 18 })), { c: 18, label: "Paid down (%)", width: 18 }], freeze: { rows: 2, cols: 1 }, schema: null, rev: 1, values, rows: [
    { r: 1, kind: "field", cells: [{ c: 1, type: "label", label: "Business name" }, { c: 2, type: "text", key: "business_name", path: ["business_name"], editable: true, colspan: 3 }] },
    { r: 2, kind: "colhead", cells: [...fields, "Paid down (%)"].map((field, index) => ({ c: index + 1, type: "label", label: field })) },
    ...ids.map((id, index) => ({ r: index + 4, kind: "data" as const, block: "debts", row_key: id, cells: [...fields.map((field, at): SheetCell => ({ c: at + 1, type: field.endsWith("_on") ? "date" : "text", key: `${id}.${field}`, path: ["debts", id, field], editable: true })), { c: 18, type: "formula" as const, format: "percent" as const, compute: `${id}.paid_down_pct`, editable: false, formula: `=100*({${id}.original_amount}-{${id}.balance})/{${id}.original_amount}` }] })),
    { r: ids.length + 4, kind: "formula", cells: [{ c: 1, type: "label", label: "Totals" }, { c: 4, type: "formula", compute: "total_balance", format: "money" }, { c: 6, type: "formula", compute: "total_monthly_payment", format: "money" }] },
  ] };
}
function build(input = payload(), extra: Partial<Parameters<typeof createSheetStore>[0]> = {}) {
  const save = vi.fn().mockResolvedValue({});
  const store = createSheetStore({ sheets: [input], onSave: save, ...extra });
  stores.push(store);
  return { store, save };
}
const state = (store: SheetStore) => store.getSnapshot().sheets.debt_schedule;
const dataRow = (layout: SheetLayout, id: string) => layout.rows.find((row) => row.row_key === id)!;
const column = (layout: SheetLayout, id: string, field: string) => dataRow(layout, id).cells!.find((cell) => cell.path?.at(-1) === field)!.c;
function expectOrder(layout: SheetLayout, id: string) {
  expect(column(layout, id, "originated_on")).toBe(column(layout, id, "lender") + 1);
  expect(dataRow(layout, id).cells!.find((cell) => cell.compute === `${id}.paid_down_pct`)!.c).toBe(column(layout, id, "balance") + 1);
  expect(layout.columns.map((item) => item.c)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
}
function response(input: SheetPayload): RowOpResponse {
  return { rows: input.rows.map((row) => ({ ...row, values: Object.fromEntries((row.cells ?? []).filter((cell) => cell.key).map((cell) => [cell.key!, input.values?.[cell.key!] ?? ""])) })), row_meta: {}, rev: { debt_schedule: 3 } };
}

describe("the debt worksheet store uses the same display order for navigation and writes", () => {
  it("orders on initial read without changing source geometry or field identity", () => {
    const source = payload(); const before = JSON.stringify(source);
    const { store } = build(source); const layout = state(store).layout;
    expectOrder(layout, "a");
    expect(layout.rows[0]).toEqual(source.rows[0]); // merged business-name control is structural
    expect(dataRow(layout, "a").cells!.filter((cell) => cell.editable).map((cell) => cell.key).sort()).toEqual(fields.map((field) => `a.${field}`).sort());
    expect(JSON.stringify(source)).toBe(before);
  });

  it("pastes lender/date and balance/readonly-percent/rate into their actual keys", async () => {
    const { store, save } = build(); const layout = state(store).layout;
    await store.pasteInto("debt_schedule", { r: 4, c: 1 }, [["New lender", "2026-07-08"]]);
    await store.pasteInto("debt_schedule", { r: 4, c: column(layout, "a", "balance") }, [["50", "99.0%", "9.5"]]);
    expect(state(store).values).toMatchObject({ "a.lender": "New lender", "a.originated_on": "2026-07-08", "a.balance": "50", "a.rate": "9.5", "a.original_amount": "100", "a.debt_type": "" });
    expect(state(store).values).not.toHaveProperty("a.paid_down_pct");
    expect(state(store).computed["a.paid_down_pct"]).toBe(50);
    await store.flushAndWait();
    expect(save.mock.calls[0][0].map((edit: { key: string }) => edit.key).sort()).toEqual(["a.lender", "a.originated_on", "a.balance", "a.rate"].sort());
  });

  it("reorders subsequent server loads while preserving unsent keyed edits", () => {
    const { store } = build();
    store.applyEdits([{ sheet: "debt_schedule", key: "a.originated_on", value: "2026-07-08" }]);
    const fresh = payload(["a", "b"]); const before = JSON.stringify(fresh);
    store.load([fresh]);
    expectOrder(state(store).layout, "a"); expectOrder(state(store).layout, "b");
    expect(state(store).values["a.originated_on"]).toBe("2026-07-08");
    expect(state(store).values["b.originated_on"]).toBe("2025-01-02");
    expect(JSON.stringify(fresh)).toBe(before);
  });

  it("absorbs canonical row replies before replanning a multi-row paste", async () => {
    const fresh = payload(["a", "b"]); const wire = response(fresh); const before = JSON.stringify(wire);
    const onRowOp = vi.fn().mockResolvedValue(wire);
    const { store, save } = build(payload(), { onRowOp });
    const result = await store.pasteInto("debt_schedule", { r: 4, c: 1 }, [["First", "2026-01-02"], ["Second", "2026-03-04"]]);
    expect(result).toMatchObject({ appended: 1, applied: 4, clipped: 0 });
    expect(onRowOp).toHaveBeenCalledWith(expect.objectContaining({ op: "insert", after: "a", visible: 1 }));
    expectOrder(state(store).layout, "a"); expectOrder(state(store).layout, "b");
    expect(state(store).layout.columns[1].label).toBe("originated_on");
    expect(state(store).values).toMatchObject({ "a.lender": "First", "a.originated_on": "2026-01-02", "b.lender": "Second", "b.originated_on": "2026-03-04", "b.debt_type": "" });
    await store.flushAndWait();
    expect(save.mock.calls.flatMap(([edits]) => edits.map((edit: { key: string }) => edit.key)).sort()).toEqual(["a.lender", "a.originated_on", "b.lender", "b.originated_on"].sort());
    expect(JSON.stringify(wire)).toBe(before);
  });

  it("keeps the order through deletion and through a server-triggered resync", async () => {
    const incoming = payload(["a", "b"]);
    const onSave = vi.fn().mockResolvedValue({ resync: ["debt_schedule"] });
    const onResync = vi.fn().mockResolvedValue([incoming]);
    const { store } = build(payload(), { onSave, onResync });
    store.applyEdits([{ sheet: "debt_schedule", key: "a.lender", value: "Changed" }]);
    await store.flushAndWait();
    expect(onResync).toHaveBeenCalledWith(["debt_schedule"]);
    expectOrder(state(store).layout, "b");
    const deleted = response(payload(["b"]));
    store.applyRows("debt_schedule", deleted);
    expect(state(store).layout.rows.filter((row) => row.kind === "data").map((row) => row.row_key)).toEqual(["b"]);
    expectOrder(state(store).layout, "b");
    expect(state(store).layout.columns[1].label).toBe("originated_on");
    expect(state(store).values.business_name).toBe("Synthetic business");
  });

  it("leaves another form's layout unchanged and handles a small debt fixture safely", () => {
    const other = { ...payload(), kind: "balance_sheet" as const };
    const { store } = build(other);
    expect(store.getSnapshot().sheets.balance_sheet.layout.columns).toBe(other.columns);
    expect(store.getSnapshot().sheets.balance_sheet.layout.rows).toBe(other.rows);
    const partial = payload(); partial.columns = partial.columns.slice(0, 2); partial.rows = partial.rows.map((row) => ({ ...row, cells: row.cells?.filter((cell) => cell.c <= 2) }));
    store.load([partial]);
    expect(state(store).layout.columns).toEqual(partial.columns);
    expect(state(store).layout.rows).toEqual(partial.rows);
  });
});


describe("public worksheet paste respects explicit row permissions", () => {
  it("does not change or post a locked target, while keeping remote updates permitted", async () => {
    const input = payload(["a", "b"]); input.row_meta = { b: { editable: false, owner: "admin" } };
    const { store, save } = build(input); const layout = state(store).layout;
    const result = await store.pasteInto("debt_schedule", { r: 5, c: column(layout, "b", "originated_on") }, [["2030-01-01"]]);
    expect(result).toMatchObject({ applied: 0, appended: 0, clipped: 0 });
    store.applyEdits([{ sheet: "debt_schedule", key: "b.originated_on", value: "2031-01-01" }]);
    expect(state(store).values["b.originated_on"]).toBe("2025-01-02");
    const progress = dataRow(layout, "b").cells!.find((cell) => cell.compute === "b.paid_down_pct")!;
    expect((await store.pasteInto("debt_schedule", { r: 5, c: progress.c }, [["99.0%"]])).applied).toBe(0);
    expect(state(store).values).not.toHaveProperty("b.paid_down_pct");
    await store.flushAndWait();
    expect(save).not.toHaveBeenCalled();
    store.applyEdits([{ sheet: "debt_schedule", key: "b.originated_on", value: "2026-09-10" }], { source: "remote" });
    expect(state(store).values["b.originated_on"]).toBe("2026-09-10");
    await store.flushAndWait(); expect(save).not.toHaveBeenCalled();
  });

  it("writes only permitted inputs from a mixed editable and locked range", async () => {
    const input = payload(["a", "b"]); input.row_meta = { a: { editable: true }, b: { editable: false } };
    const { store, save } = build(input); const layout = state(store).layout;
    const result = await store.pasteInto("debt_schedule", { r: 4, c: column(layout, "a", "balance") }, [["50", "99.0%", "9.5"], ["10", "90.0%", "7.5"]]);
    expect(result).toMatchObject({ applied: 2, appended: 0, clipped: 0 });
    expect(state(store).values).toMatchObject({ "a.balance": "50", "a.rate": "9.5", "b.balance": "75", "b.rate": "" });
    expect(state(store).computed).toMatchObject({ "a.paid_down_pct": 50, "b.paid_down_pct": 25 });
    await store.flushAndWait();
    expect(save.mock.calls[0][0].map((edit: { key: string }) => edit.key).sort()).toEqual(["a.balance", "a.rate"]);
  });

  it.each([true, false])("rechecks authoritative permissions after appending a row (new row editable=%s)", async (editable) => {
    const input = payload(["a", "b"]); input.row_meta = { b: { editable: false } };
    const wire = response(payload(["a", "b", "c"])); wire.row_meta = { b: { editable: false }, c: { editable } };
    const onRowOp = vi.fn().mockResolvedValue(wire);
    const { store, save } = build(input, { onRowOp });
    const result = await store.pasteInto("debt_schedule", { r: 5, c: 1 }, [["Must not replace B", "2030-01-01"], ["New permitted C", "2028-04-05"]]);
    expect(result).toMatchObject({ applied: editable ? 2 : 0, appended: 1, clipped: 0 });
    expect(onRowOp).toHaveBeenCalledWith(expect.objectContaining({ op: "insert", after: "b", visible: 2 }));
    expect(state(store).values).toMatchObject({ "b.lender": "Lender b", "b.originated_on": "2025-01-02", "c.lender": editable ? "New permitted C" : "Lender c", "c.originated_on": editable ? "2028-04-05" : "2025-01-02" });
    await store.flushAndWait();
    if (editable) expect(save.mock.calls[0][0].map((edit: { key: string }) => edit.key).sort()).toEqual(["c.lender", "c.originated_on"]);
    else expect(save).not.toHaveBeenCalled();
  });
});
