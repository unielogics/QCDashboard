// The library of requirements a file's checklist can be extended with
// (qcbackend GET /application-profiles/{id}/requirement-library): the documents
// and forms we already know how to ask for, grouped the way the desk thinks of
// them. Pure helpers only; the drawer does the fetching and the adding.

import type { FormKind } from "@/lib/formAnswers";

export type LibraryLevel = "required" | "recommended" | "optional";

export type LibraryItem = {
  key: string;
  label: string;
  category: string;
  category_label: string;
  kind: "document" | "form";
  required_level: LibraryLevel;
  description: string;
  /** The online form this item can be filled in on, when there is one (P&L and balance sheet share an item, so see form_kinds). */
  form_kind: FormKind | null;
  form_kinds?: FormKind[];
  /** False for checks only the team sees: adding one asks the client for nothing. */
  client_visible?: boolean;
  verification_required?: boolean;
  source: "library" | "baseline" | "custom";
  /** The file already requires it (the checklist or a program). */
  on_file: boolean;
  /** The desk added it to this file, so it can be taken off again. */
  added?: boolean;
  source_requirement_id: string;
};

export type RequirementLibrary = {
  items: LibraryItem[];
  categories: { key: string; label: string }[];
};

/** A form the client can fill in online, whatever kind the library filed it under. */
export function isFormItem(item: Pick<LibraryItem, "kind" | "form_kind" | "form_kinds">): boolean {
  return item.kind === "form" || Boolean(item.form_kind) || Boolean(item.form_kinds?.length);
}

/** What the desk typed against what the library holds, and the kind they asked to see. */
export function filterLibrary(items: LibraryItem[], query: string, kind: "all" | "document" | "form", includeInternal = true): LibraryItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (!includeInternal && item.client_visible === false && !item.added) return false;
    if (kind === "form" && !isFormItem(item)) return false;
    if (kind === "document" && isFormItem(item)) return false;
    if (!words.length) return true;
    const haystack = `${item.label} ${item.description} ${item.category_label}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Category groups in alphabetical order; inside a group what can still be added and is asked of the client comes first. */
export function groupLibrary(items: LibraryItem[]): { label: string; items: LibraryItem[] }[] {
  const groups = new Map<string, LibraryItem[]>();
  for (const item of items) {
    const label = item.category_label || "Other";
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => ({
      label,
      items: [...rows].sort((a, b) =>
        Number(a.on_file && !a.added) - Number(b.on_file && !b.added)
        || Number(a.client_visible === false) - Number(b.client_visible === false)
        || a.label.localeCompare(b.label)),
    }));
}
