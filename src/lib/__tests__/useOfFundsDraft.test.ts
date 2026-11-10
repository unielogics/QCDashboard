import { describe, expect, it } from "vitest";
import { createUseOfFundsDraftStore, budgetDraftMatchesCurrent } from "../useOfFundsDraft";
import type { UseOfFundsBudget, UseOfFundsRow } from "../useOfFunds";

const budget = (patch: Partial<UseOfFundsBudget> = {}): UseOfFundsBudget => ({
  items: [], requested_amount: "1000.00", requested_amount_source: "current_request", total: 0,
  category_totals: {}, unallocated_amount: 1000, complete: false, real_estate_equipment_amount: 0,
  real_estate_equipment_pct: null, revision: 4, funding_request_revision: 2,
  updated_at: null, updated_by_user_id: null, can_edit: true, ...patch,
});
const rows: UseOfFundsRow[] = [{ id: "row-1", category: "inventory", label: "Unsaved order", amount: "012.30" }];

describe("file-owned use-of-funds drafts", () => {
  it("retains raw entries and their original budget/request basis without saving", () => {
    const store = createUseOfFundsDraftStore("file-a");
    const base = budget();
    store.write(base, rows);
    base.revision = 9;
    const draft = store.read()!;
    expect(draft.rows).toEqual(rows);
    expect(draft.budget).toMatchObject({ revision: 4, requested_amount: "1000.00", funding_request_revision: 2 });
    draft.rows[0].label = "Changed outside the store";
    expect(store.read()!.rows[0].label).toBe("Unsaved order");
  });

  it("keeps files isolated and does not let a late save clear a newer draft", () => {
    const a = createUseOfFundsDraftStore("file-a");
    const b = createUseOfFundsDraftStore("file-b");
    const first = a.write(budget(), rows);
    const later = a.write(budget(), [{ ...rows[0], label: "Later edit" }]);
    b.write(budget(), rows);
    expect(a.clear(first.generation)).toBe(false);
    expect(a.read()!.rows[0].label).toBe("Later edit");
    expect(a.clear(later.generation)).toBe(true);
    expect(a.read()).toBeNull();
    expect(b.read()!.rows).toEqual(rows);
  });

  it("rejects a changed budget revision or funding request even if the amount is unchanged", () => {
    const base = budget();
    for (const patch of [
      { revision: 5 }, { requested_amount: 1001 }, { requested_amount: null },
      { requested_amount_source: "reviewed_request" }, { funding_request_revision: 3 },
      { requires_exact_allocation: true },
    ]) expect(budgetDraftMatchesCurrent(base, budget(patch))).toBe(false);
  });

  it("compares the request in cents and refreshes permissions independently", () => {
    expect(budgetDraftMatchesCurrent(budget(), budget({ requested_amount: 1000, can_edit: false }))).toBe(true);
    expect(budgetDraftMatchesCurrent(budget(), budget({ requested_amount: "1000.01" }))).toBe(false);
  });

  it("explicit discard clears the draft without changing the server budget", () => {
    const store = createUseOfFundsDraftStore("file-a");
    const base = budget();
    store.write(base, rows);
    expect(store.clear()).toBe(true);
    expect(store.read()).toBeNull();
    expect(base.items).toEqual([]);
    expect(base.revision).toBe(4);
  });
});
