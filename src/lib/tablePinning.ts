"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type TableRowId = string | number;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem" | "removeItem">;

const STORAGE_PREFIX = "qc.table-pins.v1";

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The single namespaced key used by both the hook and cross-tab updates. */
export function tablePinStorageKey(storageKey: string): string {
  return `${STORAGE_PREFIX}.${storageKey}`;
}

/**
 * Coerce persisted input into a small, deterministic set of usable row ids.
 * Corrupt localStorage must never prevent a table from rendering.
 */
export function normalizePinnedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string" && typeof candidate !== "number") continue;
    const id = String(candidate).trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Stable partition: pinned rows first, existing sort order intact in each group. */
export function orderPinnedRows<T>(
  rows: readonly T[],
  pinnedIds: readonly TableRowId[],
  getId: (row: T) => TableRowId,
): T[] {
  if (!rows.length || !pinnedIds.length) return [...rows];

  const pinned = new Set(pinnedIds.map((id) => String(id)));
  const top: T[] = [];
  const rest: T[] = [];

  for (const row of rows) {
    (pinned.has(String(getId(row))) ? top : rest).push(row);
  }

  return [...top, ...rest];
}

export function togglePinnedId(
  pinnedIds: readonly TableRowId[],
  id: TableRowId,
): string[] {
  const normalized = normalizePinnedIds(pinnedIds);
  const target = String(id);
  return normalized.includes(target)
    ? normalized.filter((candidate) => candidate !== target)
    : [...normalized, target];
}

export function readPinnedIds(
  storage: StorageReader | null | undefined,
  storageKey: string,
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(tablePinStorageKey(storageKey));
    return raw ? normalizePinnedIds(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writePinnedIds(
  storage: StorageWriter | null | undefined,
  storageKey: string,
  pinnedIds: readonly TableRowId[],
): void {
  if (!storage) return;
  try {
    const normalized = normalizePinnedIds(pinnedIds);
    if (normalized.length) {
      storage.setItem(tablePinStorageKey(storageKey), JSON.stringify(normalized));
    } else {
      storage.removeItem(tablePinStorageKey(storageKey));
    }
  } catch {
    // Pinning is an enhancement. Storage quotas/privacy modes must not break rows.
  }
}

export interface UsePinnedRowsOptions<T> {
  rows: readonly T[];
  getId: (row: T) => TableRowId;
  /** Stable per-table identifier, for example `ai-intake`. */
  storageKey: string | null;
}

export interface UsePinnedRowsResult<T> {
  /** Same rows, stably partitioned so pinned records render first. */
  rows: T[];
  pinnedIds: string[];
  isPinned: (id: TableRowId) => boolean;
  togglePin: (id: TableRowId) => void;
  clearPins: () => void;
}

/**
 * Browser-local row pinning with cross-tab synchronization.
 *
 * This deliberately does not mutate server sort state. Each operator can keep
 * their own working set without changing what colleagues see.
 */
export function usePinnedRows<T>({
  rows,
  getId,
  storageKey,
}: UsePinnedRowsOptions<T>): UsePinnedRowsResult<T> {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!storageKey) {
      setPinnedIds([]);
      return;
    }
    const storage = getBrowserStorage();
    setPinnedIds(readPinnedIds(storage, storageKey));

    const onStorage = (event: StorageEvent) => {
      if (event.key !== tablePinStorageKey(storageKey)) return;
      if (event.storageArea && storage && event.storageArea !== storage) return;
      try {
        setPinnedIds(event.newValue ? normalizePinnedIds(JSON.parse(event.newValue)) : []);
      } catch {
        setPinnedIds([]);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const update = useCallback(
    (next: (current: string[]) => string[]) => {
      setPinnedIds((current) => {
        const value = next(current);
        if (storageKey) writePinnedIds(getBrowserStorage(), storageKey, value);
        return value;
      });
    },
    [storageKey],
  );

  const togglePin = useCallback(
    (id: TableRowId) => update((current) => togglePinnedId(current, id)),
    [update],
  );
  const clearPins = useCallback(() => update(() => []), [update]);
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const isPinned = useCallback(
    (id: TableRowId) => pinnedSet.has(String(id)),
    [pinnedSet],
  );
  const orderedRows = useMemo(
    () => orderPinnedRows(rows, pinnedIds, getId),
    [getId, pinnedIds, rows],
  );

  return { rows: orderedRows, pinnedIds, isPinned, togglePin, clearPins };
}
