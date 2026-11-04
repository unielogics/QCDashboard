import { describe, expect, it } from "vitest";

import { archiveFileName, attachmentFileName, fileNamesPreview, removalSummary } from "@/lib/bucketFileSelection";

describe("archiveFileName", () => {
  it("names the zip after the room, the way the API does", () => {
    expect(archiveFileName("Little Star Therapy Services Inc")).toBe("Little Star Therapy Services Inc files.zip");
    expect(archiveFileName("Café ☕ / Nov")).toBe("Caf Nov files.zip");
    expect(archiveFileName(null)).toBe("room files.zip");
    expect(archiveFileName(".. ..")).toBe("room files.zip");
  });
});

describe("attachmentFileName", () => {
  it("prefers the UTF-8 name, then the quoted one, then a bare one", () => {
    expect(attachmentFileName("attachment; filename=\"Little Star files.zip\"; filename*=UTF-8''Little%20Star%20files.zip")).toBe("Little Star files.zip");
    expect(attachmentFileName('attachment; filename="October \\"final\\".zip"')).toBe('October "final".zip');
    expect(attachmentFileName("attachment; filename=plain.zip")).toBe("plain.zip");
    expect(attachmentFileName("inline")).toBeNull();
    expect(attachmentFileName(null)).toBeNull();
  });
});

describe("fileNamesPreview", () => {
  it("shows three names and counts the rest", () => {
    expect(fileNamesPreview(["a", "b", "c", "d", "e"])).toBe("a, b, c +2 more");
    expect(fileNamesPreview(["a"])).toBe("a");
  });
});

describe("removalSummary", () => {
  it("counts what moved, what stayed and what was already gone", () => {
    const summary = removalSummary(
      { removed: ["a", "b"], blocked: [{ file_id: "c", file_name: "Signed ACH.pdf", reason: "Protected" }], missing: ["d"] },
      ["Agreement.pdf"],
    );
    expect(summary).toBe(
      "2 files moved to Removed files. The stored documents were kept and can be restored. 2 files stayed, protected by retention or legal hold: Agreement.pdf, Signed ACH.pdf. 1 file had already been removed.",
    );
    expect(removalSummary({ removed: [], blocked: [], missing: [] }, [])).toBe("Nothing was removed.");
    expect(removalSummary({ removed: ["a"], blocked: [], missing: [] }, [])).toBe(
      "1 file moved to Removed files. The stored documents were kept and can be restored.",
    );
  });
});
