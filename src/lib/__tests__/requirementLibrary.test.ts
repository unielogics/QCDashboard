import { describe, expect, it } from "vitest";

import { filterLibrary, groupLibrary, type LibraryItem } from "@/lib/requirementLibrary";

const item = (over: Partial<LibraryItem>): LibraryItem => ({
  key: "k", label: "Label", category: "financials", category_label: "Financials", kind: "document", required_level: "required",
  description: "", form_kind: null, source: "library", on_file: false, source_requirement_id: "id", ...over,
});

const LIBRARY = [
  item({ key: "tax", label: "Business tax returns", description: "Last two filed years" }),
  item({ key: "pfs", label: "Personal financial statement", kind: "form", form_kind: "pfs", category: "credit", category_label: "Credit" }),
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

  it("shows only documents or only forms when asked", () => {
    expect(filterLibrary(LIBRARY, "", "form").map((i) => i.key)).toEqual(["pfs"]);
    expect(filterLibrary(LIBRARY, "", "document")).toHaveLength(3);
  });

  it("groups by category alphabetically and puts what is already on the file last", () => {
    const groups = groupLibrary(LIBRARY);
    expect(groups.map((g) => g.label)).toEqual(["Agreements", "Credit", "Financials"]);
    expect(groups[2].items.map((i) => i.key)).toEqual(["tax", "bank"]);
  });
});
