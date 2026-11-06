import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadFinancialEvidence } from "../financialEvidenceUpload";
import type { AuthedApi } from "../worksheetApi";
vi.mock("../documentUpload", () => ({ assertPdfUploadUnlocked: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => vi.unstubAllGlobals());
const file = { name: "Original.HEIC", type: "", size: 120 } as File;

describe("retained batch source uploads", () => {
  it("keeps the original HEIC type and uses required upload headers before completion", async () => {
    const api = vi.fn().mockResolvedValueOnce({ file_id: "file", upload_url: "https://upload.example/source", required_headers: { "Content-Type": "image/heic", "x-required": "yes" } }).mockResolvedValueOnce({}) as unknown as AuthedApi;
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    expect(await uploadFinancialEvidence(api, "profile", file)).toBe("file");
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string)).toMatchObject({ file_name: "Original.HEIC", content_type: "image/heic" });
    expect(fetch).toHaveBeenCalledWith("https://upload.example/source", { method: "PUT", headers: { "Content-Type": "image/heic", "x-required": "yes" }, body: file });
    expect(vi.mocked(api).mock.calls[1][0]).toMatch(/files\/complete$/);
  });
  it("reuses a received original without uploading or completing it again", async () => {
    const api = vi.fn().mockResolvedValue({ file_id: "retained", already_uploaded: true, upload_url: null }) as unknown as AuthedApi;
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await uploadFinancialEvidence(api, "profile", file)).toBe("retained");
    expect(fetch).not.toHaveBeenCalled(); expect(api).toHaveBeenCalledTimes(1);
  });
});
