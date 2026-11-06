import { describe, expect, it } from "vitest";
import { financialSourceIsImage, financialUploadContentType, financialVersionSourceKind } from "../financialSourceFiles";

describe("loan source files", () => {
  it("recognizes raster uploads and HEIC without treating active documents as images", () => {
    expect(financialSourceIsImage({ file_name: "loan.HEIC" })).toBe(true);
    expect(financialSourceIsImage({ file_name: "contract.jpg" })).toBe(true);
    expect(financialSourceIsImage({ content_type: "image/png" })).toBe(true);
    expect(financialSourceIsImage({ file_name: "unsafe.svg", content_type: "image/svg+xml" })).toBe(false);
    expect(financialSourceIsImage({ file_name: "contract.pdf" })).toBe(false);
    expect(financialUploadContentType({ name: "screenshot.heic", type: "" })).toBe("image/heic");
  });
  it("distinguishes original sources from later generated PDFs including misnamed image originals", () => {
    const snapshot = { evidence: [{ file_id: "image", file_name: "original.pdf", content_type: "application/pdf" }], versions: [{ id: "v1", source_file_id: "image", pdf_file_id: null, source_content_type: "image/heic" }, { id: "v2", source_file_id: "image", pdf_file_id: "generated" }, { id: "legacy", source_file_id: "image", pdf_file_id: null }] };
    expect(financialVersionSourceKind(snapshot, "v1")).toBe("image");
    expect(financialVersionSourceKind(snapshot, "v2")).toBe("pdf");
    expect(financialVersionSourceKind(snapshot, "legacy")).toBe("source");
  });
});
