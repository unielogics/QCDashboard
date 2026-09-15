import { describe, expect, it, vi } from "vitest";
import {
  PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE,
  assertPdfUploadUnlocked,
  documentUploadErrorMessage,
  isPasswordProtectedPdfUploadError,
  isPdfUpload,
  passwordProtectedPdfUploadNotice,
  screenPdfUploads,
} from "@/lib/documentUpload";

function file(name: string, type = "application/pdf") {
  return {
    name,
    type,
    arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  } as unknown as File;
}

describe("password-protected PDF upload guard", () => {
  it("recognizes PDFs by MIME type or extension", () => {
    expect(isPdfUpload(file("statement.bin"))).toBe(true);
    expect(isPdfUpload(file("STATEMENT.PDF", "application/octet-stream"))).toBe(true);
    expect(isPdfUpload(file("statement.csv", "text/csv"))).toBe(false);
  });

  it("rejects a PDF when pdf.js requests a password", async () => {
    const passwordError = Object.assign(new Error("No password given"), { name: "PasswordException" });
    await expect(assertPdfUploadUnlocked(file("locked.pdf"), async () => { throw passwordError; }))
      .rejects.toMatchObject({
        name: "PasswordProtectedPdfUploadError",
        code: "password_protected_pdf",
        message: PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE,
        fileName: "locked.pdf",
      });
  });

  it("allows permissions-only or empty-password PDFs and defers unrelated parse failures", async () => {
    await expect(assertPdfUploadUnlocked(file("permissions.pdf"), async () => undefined)).resolves.toBeUndefined();
    await expect(assertPdfUploadUnlocked(file("malformed.pdf"), async () => { throw new Error("Invalid PDF structure"); })).resolves.toBeUndefined();
  });

  it("does not inspect non-PDF files", async () => {
    const probe = vi.fn(async () => undefined);
    const csv = file("bank.csv", "text/csv");
    await assertPdfUploadUnlocked(csv, probe);
    expect(probe).not.toHaveBeenCalled();
    expect(csv.arrayBuffer).not.toHaveBeenCalled();
  });

  it("recognizes authoritative backend codes and always returns actionable copy", () => {
    for (const code of ["password_protected_pdf", "password_protected", "password_required", "encrypted_pdf"]) {
      const error = { body: { detail: { code, message: "Internal extraction wording" } } };
      expect(isPasswordProtectedPdfUploadError(error)).toBe(true);
      expect(documentUploadErrorMessage(error)).toBe(PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE);
    }
    expect(documentUploadErrorMessage(new Error("Network unavailable"))).toBe("Network unavailable");
  });

  it("partitions a mixed selection without offering locked PDFs for upload", async () => {
    const locked = file("locked.pdf");
    const open = file("open.pdf");
    const csv = file("bank.csv", "text/csv");
    let calls = 0;
    const result = await screenPdfUploads([locked, open, csv], async (bytes) => {
      if (bytes[0] === 1) {
        // Give just the first call a PasswordException.
        if ((calls += 1) === 1) throw Object.assign(new Error("Password required"), { name: "PasswordException" });
      }
    });
    expect(result.rejected).toEqual([locked]);
    expect(result.uploadable).toEqual([open, csv]);
  });

  it("builds a visible rejection notice with the filename", () => {
    expect(passwordProtectedPdfUploadNotice([file("locked.pdf")]))
      .toBe(`locked.pdf was rejected. ${PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE}`);
  });
});
