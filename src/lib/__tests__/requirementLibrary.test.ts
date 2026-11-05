import { describe, expect, it } from "vitest";

import { filterLibrary, groupLibrary, isFormItem, type LibraryItem } from "@/lib/requirementLibrary";

const item = (over: Partial<LibraryItem>): LibraryItem => ({
  key: "k", label: "Label", category: "financials", category_label: "Financials", kind: "document", required_level: "required",
  description: "", form_kind: null, source: "library", on_file: false, source_requirement_id: "id", ...over,
});

const LIBRARY = [
  item({ key: "tax", label: "Business tax returns", description: "Last two filed years" }),
  item({ key: "pfs", label: "Personal financial statement", kind: "document", form_kind: "pfs", form_kinds: ["pfs"], category: "credit", category_label: "Credit" }),
  item({ key: "lease", label: "Signed lease", category: "agreements", category_label: "Agreements", description: "Every location" }),
  item({ key: "bank", label: "Bank statements", on_file: true }),
];

describe("the requirement library", () => {
  it("finds what the desk types in the label, the description or the category", () => {
    expect(filterLibrary(LIBRARY, "tax", "all").map((i) => i.key)).toEqual(["tax"]);
    expect(filterLibrary(LIBRARY, "every location", "all").map((i) => i.key)).toEqual(["lease"]);
    expect(filterLibrary(LIBRARY, "credit", "all").map((i) => i.key)).toEqual(["pfs"]);
    expect(filterLibrary(LIBRARY, "  ", "all")).toHaveLength(4);
    expect(filterLibrary(LIBRARY, "tax returns business", "all").map((i) => i.key)).toEqual(["tax"]);
  });

  it("shows only forms (anything the client can fill in online) or only plain documents when asked", () => {
    // The library files every item under "document"; what makes one a form is the form it maps to.
    expect(filterLibrary(LIBRARY, "", "form").map((i) => i.key)).toEqual(["pfs"]);
    expect(filterLibrary(LIBRARY, "", "document").map((i) => i.key)).toEqual(["tax", "lease", "bank"]);
    expect(isFormItem(item({ form_kinds: ["p_and_l", "balance_sheet"] }))).toBe(true);
    expect(isFormItem(item({}))).toBe(false);
  });

  it("puts internal-only checks after what is asked of the client", () => {
    const rows = [item({ key: "internal", label: "Analyst check", client_visible: false }), item({ key: "client", label: "Zoning letter", client_visible: true })];
    expect(groupLibrary(rows)[0].items.map((i) => i.key)).toEqual(["client", "internal"]);
  });

  it("lists what the desk already added with the addable ones, not at the bottom with the required ones", () => {
    const rows = [item({ key: "req", label: "Aaa required", on_file: true }), item({ key: "mine", label: "Zzz added", on_file: true, added: true })];
    expect(groupLibrary(rows)[0].items.map((i) => i.key)).toEqual(["mine", "req"]);
  });

  it("groups by category alphabetically and puts what is already on the file last", () => {
    const groups = groupLibrary(LIBRARY);
    expect(groups.map((g) => g.label)).toEqual(["Agreements", "Credit", "Financials"]);
    expect(groups[2].items.map((i) => i.key)).toEqual(["tax", "bank"]);
  });
});
