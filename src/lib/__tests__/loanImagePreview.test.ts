import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLoanImagePreview, loanPreviewPosition, loanPreviewReference } from "../loanImagePreview";
import type { FinancialImport } from "../financialWorkspaceApi";
afterEach(() => vi.unstubAllGlobals());
const hash = "a".repeat(64);
const file = { file_id: "source/one", file_name: "Original.HEIC", content_type: "image/heic" };

describe("read-only loan image preview", () => {
  it("uses a single exact-file source hash and actual MIME, without borrowing another loan's source", () => {
    const body = { field_sources: { "loan.balance": { file_id: file.file_id, content_hash: hash, content_type: "image/png" }, "other.balance": { file_id: "other-file", content_hash: "b".repeat(64), content_type: "image/jpeg" } } };
    expect(loanPreviewReference({ ...file, file_name: "Misnamed.pdf", content_type: "application/pdf" }, body)).toMatchObject({ content_hash: hash, content_type: "image/png" });
    expect(loanPreviewReference({ ...file, file_id: "missing" }, body).content_hash).toBeUndefined();
    const proposal = { mappings: [{ source: { file_id: file.file_id, content_hash: "b".repeat(64) } }] } as FinancialImport;
    expect(loanPreviewReference(file, body, proposal).content_hash).toBeUndefined();
  });
  it("loads the authenticated JPEG derivative lazily with exact profile, file, hash and abort signal", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Blob(["jpeg"], { type: "image/jpeg" }), { headers: { "Content-Type": "image/jpeg" } })); vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await fetchLoanImagePreview({ profileId: "profile/one", file: { ...file, content_hash: hash }, signal: controller.signal, getToken: async () => "scoped-token", devUser: "qa" });
    expect(fetch.mock.calls[0][0]).toContain(`/application-profiles/profile%2Fone/financial-workspace/evidence/source%2Fone/image-preview?expected_content_hash=${hash}`);
    expect(fetch.mock.calls[0][1]).toEqual({ cache: "no-store", signal: controller.signal, headers: { Authorization: "Bearer scoped-token", "X-Dev-User": "qa" } });
  });
  it("never sends a late request after the hovered profile/source was aborted during token loading", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); const controller = new AbortController();
    let token!: (value: string | null) => void;
    const request = fetchLoanImagePreview({ profileId: "profile", file, signal: controller.signal, getToken: () => new Promise((resolve) => { token = resolve; }) });
    controller.abort(); token("late-token");
    await expect(request).rejects.toMatchObject({ name: "AbortError" }); expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed for changed sources and unexpected preview responses", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("changed", { status: 409 })).mockResolvedValueOnce(new Response("html", { headers: { "Content-Type": "text/html" } })); vi.stubGlobal("fetch", fetch);
    const request = { profileId: "profile", file, signal: new AbortController().signal, getToken: async () => null };
    await expect(fetchLoanImagePreview(request)).rejects.toThrow("source changed");
    await expect(fetchLoanImagePreview(request)).rejects.toThrow("readable image preview");
  });
  it("keeps thumbnails within the viewport at narrow widths and near every edge", () => {
    for (const viewport of [{ width: 390, height: 700 }, { width: 1200, height: 900 }]) for (const point of [{ left: 0, top: 0 }, { left: viewport.width - 20, top: viewport.height - 20 }, { left: 150, top: 350 }]) {
      const result = loanPreviewPosition({ ...point, right: point.left + 20, bottom: point.top + 20 }, viewport);
      expect(result.left).toBeGreaterThanOrEqual(12); expect(result.top).toBeGreaterThanOrEqual(12); expect(result.left + result.width).toBeLessThanOrEqual(viewport.width - 12);
      expect(result.top + Math.min(370, result.maxHeight)).toBeLessThanOrEqual(viewport.height - 12);
      expect(result.top + result.maxHeight).toBeLessThanOrEqual(viewport.height - 12);
    }
  });
});
