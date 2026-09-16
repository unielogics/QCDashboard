import { describe, expect, it } from "vitest";
import {
  normalizePinnedIds,
  orderPinnedRows,
  readPinnedIds,
  tablePinStorageKey,
  togglePinnedId,
  writePinnedIds,
} from "@/lib/tablePinning";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("table pinning", () => {
  it("stably moves pinned rows above unpinned rows", () => {
    const rows = [
      { id: "a", score: 3 },
      { id: "b", score: 2 },
      { id: "c", score: 1 },
      { id: "d", score: 0 },
    ];

    expect(orderPinnedRows(rows, ["c", "a"], (row) => row.id).map((row) => row.id))
      .toEqual(["a", "c", "b", "d"]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("normalizes malformed and duplicate persisted ids", () => {
    expect(normalizePinnedIds(["a", "a", 42, " ", null, {}, "b"]))
      .toEqual(["a", "42", "b"]);
  });

  it("toggles ids without disturbing the order of the remaining pins", () => {
    expect(togglePinnedId(["a", "b"], "a")).toEqual(["b"]);
    expect(togglePinnedId(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("round-trips pins through the namespaced storage key", () => {
    const storage = new MemoryStorage();
    writePinnedIds(storage, "ai-intake", ["lead-1", "lead-2"]);

    expect(storage.getItem(tablePinStorageKey("ai-intake")))
      .toBe('["lead-1","lead-2"]');
    expect(readPinnedIds(storage, "ai-intake")).toEqual(["lead-1", "lead-2"]);

    writePinnedIds(storage, "ai-intake", []);
    expect(storage.getItem(tablePinStorageKey("ai-intake"))).toBeNull();
  });

  it("fails closed when stored JSON is corrupt", () => {
    const storage = new MemoryStorage();
    storage.setItem(tablePinStorageKey("broken"), "not-json");
    expect(readPinnedIds(storage, "broken")).toEqual([]);
  });

  it("stays usable when browser storage is unavailable", () => {
    const unavailable = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };

    expect(readPinnedIds(unavailable, "private-mode")).toEqual([]);
    expect(() => writePinnedIds(unavailable, "private-mode", ["lead-1"])).not.toThrow();
  });
});
