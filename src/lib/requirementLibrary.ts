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
  form_kind: FormKind | null;
  source: "library" | "custom";
  on_file: boolean;
  source_requirement_id: string;
};

export type RequirementLibrary = {
  items: LibraryItem[];
  categories: { key: string; label: string }[];
};

/** What the desk typed against what the library holds, and the kind they asked to see. */
export function filterLibrary(items: LibraryItem[], query: string, kind: "all" | "document" | "form"): LibraryItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (!words.length) return true;
    const haystack = `${item.label} ${item.description} ${item.category_label}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Category groups in alphabetical order; inside a group what is still addable comes first. */
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
      items: [...rows].sort((a, b) => Number(a.on_file) - Number(b.on_file) || a.label.localeCompare(b.label)),
    }));
}
