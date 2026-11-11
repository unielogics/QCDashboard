import { describe, expect, it, vi } from "vitest";
import { readSavedTermsPdf, savedTermsFilename, savedTermsPdfPath, SavedTermsPdfError } from "../savedTermsDownload";

const pdf = () => new Response("%PDF-1.4 synthetic saved snapshot", { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="Synthetic-Financing-Terms-v6.pdf"' } });
const input = { base: "https://api.example.test", profileId: "saved/profile", kind: "application_term_sheet" as const, version: 6 };

describe("read-only saved terms PDF", () => {
  it("uses version-guarded client and dealer saved endpoints", () => {
    expect(savedTermsPdfPath(input.profileId, input.kind, 6)).toBe("/application-profiles/saved%2Fprofile/client-terms.pdf?expected_version=6");
    expect(savedTermsPdfPath(input.profileId, "production_term_sheet", 6)).toBe("/production-packages/term-sheets/saved%2Fprofile/client.pdf?expected_version=6&disposition=attachment");
    expect(() => savedTermsPdfPath("profile", input.kind, 0)).toThrow("Save a terms version");
  });

  it("authenticates a GET with no working draft or mutation payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(pdf());
    const result = await readSavedTermsPdf({ ...input, token: "synthetic-token", devUser: "synthetic@example.test", fetcher });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("https://api.example.test/api/v1/application-profiles/saved%2Fprofile/client-terms.pdf?expected_version=6", {
      method: "GET", signal: undefined, cache: "no-store", headers: { Accept: "application/pdf", Authorization: "Bearer synthetic-token" },
    });
    expect(result.filename).toBe("Synthetic-Financing-Terms-v6.pdf");
    expect(await result.blob.text()).toContain("synthetic saved snapshot");
  });

  it("preserves the supported dev identity when no bearer is available", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(pdf());
    await readSavedTermsPdf({ ...input, devUser: "synthetic@example.test", fetcher });
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ Accept: "application/pdf", "X-Dev-User": "synthetic@example.test" });
  });

  it("honors UTF-8 attachment filenames and strips path/control characters", () => {
    expect(savedTermsFilename("attachment; filename*=UTF-8''Caf%C3%A9-Terms-v6.pdf", input.kind, 6)).toBe("Café-Terms-v6.pdf");
    expect(savedTermsFilename('attachment; filename="folder/terms.pdf"', input.kind, 6)).toBe("folder_terms.pdf");
    expect(savedTermsFilename("attachment; filename=error.html", input.kind, 6)).toBe("financing-terms-v6.pdf");
    expect(savedTermsFilename(null, "production_term_sheet", 6)).toBe("loan-terms-v6.pdf");
  });

  it("exposes a stale version for explicit metadata refresh without issuing or retrying a write", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ detail: { message: "Saved terms changed" } }), { status: 409 }));
    const failure = await readSavedTermsPdf({ ...input, fetcher }).catch(error => error);
    expect(failure).toBeInstanceOf(SavedTermsPdfError);
    expect(failure.status).toBe(409);
    expect(failure.message).toBe("Saved terms changed");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps an unsuccessful response retryable rather than returning an error page as a PDF", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ detail: "PDF temporarily unavailable" }), { status: 500 })).mockResolvedValueOnce(pdf());
    await expect(readSavedTermsPdf({ ...input, fetcher })).rejects.toThrow("PDF temporarily unavailable");
    await expect(readSavedTermsPdf({ ...input, fetcher })).resolves.toMatchObject({ filename: "Synthetic-Financing-Terms-v6.pdf" });
    expect(fetcher.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });

  it.each([
    new Response("<html>Sign in</html>", { headers: { "Content-Type": "text/html" } }),
    new Response("", { headers: { "Content-Type": "application/pdf" } }),
  ])("rejects a successful response that contains no usable PDF", async response => {
    await expect(readSavedTermsPdf({ ...input, fetcher: vi.fn<typeof fetch>().mockResolvedValue(response) })).rejects.toThrow(/PDF/);
  });
});
