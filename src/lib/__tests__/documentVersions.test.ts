import { afterEach, describe, expect, it, vi } from "vitest";
import { documentVersionLabel, documentVersionNumber, documentVersionService, documentVersionUploadLabel, duplicateDocumentUpload, historicalDocumentReference, latestDocumentFiles, managedFinancialDocument } from "../documentVersions";
import { uploadFile } from "../fileUpload";
import { legacyDocumentVersions } from "@/components/documents/LegacyDocumentVersionControl";

afterEach(() => vi.unstubAllGlobals());
const version = (id: string, family: string, number: number, status: string) => ({ id, file_name: "statement.pdf", document_family_id: family, document_version_number: number, document_version_status: status });
describe("document versions", () => {
  it("groups only explicit families, preserving same-name months, accounts and loans", () => {
    const current = version("a1", "account-a-january", 1, "superseded");
    const pending = version("a2", "account-a-january", 2, "pending");
    const february = version("b1", "account-a-february", 1, "current");
    const otherAccount = version("c1", "account-b-january", 1, "current");
    const unrelated = { id: "legacy", file_name: "statement.pdf" };
    expect(latestDocumentFiles([current, february, otherAccount, pending, unrelated])).toEqual([pending, february, otherAccount, unrelated]);
  });
  it("does not label an unversioned legacy upload as a verified current source", () => {
    expect(documentVersionNumber({})).toBe(1);
    expect(documentVersionLabel({})).toBe("v1");
    expect(documentVersionLabel({ document_version_number: 2, document_version_status: "pending" })).toBe("v2 · Being checked");
    expect(documentVersionLabel({ document_version_number: 1, document_version_status: "superseded" })).toBe("v1 · Historical");
  });
  it("does not fabricate an upload date for a legacy baseline", () => {
    expect(documentVersionUploadLabel({ id: "baseline", file_name: "Prior file", source: "legacy_baseline", created_at: "2026-01-01T00:00:00Z", uploaded_at: null })).toBe("Existing file baseline · Upload date not recorded");
    expect(documentVersionUploadLabel({ id: "undated", file_name: "Unknown upload", uploaded_at: null, created_at: "2026-01-01T00:00:00Z" })).toBe("Upload date not recorded");
    expect(documentVersionUploadLabel({ id: "dated", file_name: "New upload", created_at: "2026-01-01T00:00:00Z" })).toContain("Uploaded ");
  });
  it("keeps generated financial PDFs within their existing form history", () => {
    expect(managedFinancialDocument({ source_detail: "financial_version:immutable-version" })).toBe(true);
    expect(managedFinancialDocument({ managed_financial_form_history: true })).toBe(true);
    expect(managedFinancialDocument({ source_kind: "uploaded" })).toBe(false);
  });
  it("does not mistake an idempotent upload retry for a duplicate document", () => {
    expect(duplicateDocumentUpload({ complete: { document_version_status: "duplicate" } })).toBe(true);
    expect(duplicateDocumentUpload({ duplicate_of_file_id: "prior-version" })).toBe(true);
    expect(duplicateDocumentUpload({ complete: { document_version_status: "current", already_uploaded: true } })).toBe(false);
  });
  it("does not treat a saved payoff link as current after a newer document arrives", () => {
    expect(historicalDocumentReference({ document_version_status: "superseded", latest_file_id: "v2" }, "v1")).toBe(true);
    expect(historicalDocumentReference({ is_current_document_version: true, latest_file_id: "v2" }, "v1")).toBe(true);
    expect(historicalDocumentReference({ document_version_status: "pending", latest_file_id: "v2" }, "v2")).toBe(true);
    expect(historicalDocumentReference({ document_version_status: "current", latest_file_id: "v2" }, "v2")).toBe(false);
  });
  it("keeps the room credential in scoped request bodies and sends the latest expected revision", async () => {
    const call = vi.fn().mockResolvedValueOnce({ versions: [] }).mockResolvedValueOnce({ file_id: "v3", upload_url: "https://storage.example/new", already_uploaded: true }).mockResolvedValueOnce({ id: "v3" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const service = documentVersionService(call, "/buckets/request/token", { historyMethod: "POST", credential: { passcode: "123456" } });
    await service.load("v1");
    expect(call.mock.calls[0][0]).toBe("/buckets/request/token/files/v1/versions");
    expect(JSON.parse(call.mock.calls[0][1].body)).toEqual({ passcode: "123456" });
    await service.upload({ file: new File(["updated"], "payoff.txt", { type: "text/plain" }), previous: version("v2", "loan-a", 2, "current"), idempotencyKey: "same-key", onStored: vi.fn(), onStage: vi.fn() });
    expect(JSON.parse(call.mock.calls[1][1].body)).toMatchObject({ replaces_file_id: "v2", expected_document_version: 2, idempotency_key: "same-key", passcode: "123456" });
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(call.mock.calls[2][1].body)).toEqual({ file_id: "v3", passcode: "123456" });
  });
  it("retries an already stored legacy version without uploading bytes or losing its immutable version ID", async () => {
    const call = vi.fn().mockResolvedValue({ document_id: "logical-document" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const service = legacyDocumentVersions(call, { id: "logical-document", loan_id: "loan", name: "Payoff", category: "active_asset" });
    await service.upload({ file: new File(["updated"], "payoff.txt", { type: "text/plain" }), previous: version("old-version", "logical-document", 2, "current"), idempotencyKey: "same-key", storedFileId: "logical-document", storedVersionId: "immutable-v3", onStored: vi.fn(), onStage: vi.fn() });
    expect(fetch).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
    expect(JSON.parse(call.mock.calls[0][1].body)).toEqual({ document_id: "logical-document", version_id: "immutable-v3" });
  });
  it("does not replace a legacy document identity with the selected immutable version ID", async () => {
    const call = vi.fn().mockResolvedValueOnce({ document_id: "logical-document", version_id: "immutable-v3", upload_url: "https://storage.example/new" }).mockResolvedValueOnce({ id: "logical-document" });
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const stored = vi.fn();
    const service = legacyDocumentVersions(call, { id: "logical-document", loan_id: "loan", name: "Payoff", category: "active_asset" });
    await service.upload({ file: new File(["updated"], "payoff.txt", { type: "text/plain" }), previous: version("immutable-v2", "logical-document", 2, "current"), idempotencyKey: "same-key", onStored: stored, onStage: vi.fn() });
    const input = JSON.parse(call.mock.calls[0][1].body);
    expect(input).toMatchObject({ replace_document_id: "logical-document", expected_document_version: 2, loan_id: "loan", idempotency_key: "same-key" });
    expect(input).not.toHaveProperty("fulfill_document_id");
    expect(stored).toHaveBeenCalledWith("logical-document", "immutable-v3");
    expect(JSON.parse(call.mock.calls[1][1].body)).toEqual({ document_id: "logical-document", version_id: "immutable-v3" });
  });
  it("skips byte transfer when an idempotent init already completed storage", async () => {
    const call = vi.fn().mockResolvedValueOnce({ file_id: "stored", version_id: "v2", upload_url: "", already_uploaded: true }).mockResolvedValueOnce({ id: "stored" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await uploadFile({ initPath: "/init", completePath: "/complete", call }, new File(["ok"], "test.txt", { type: "text/plain" }), { onStored: vi.fn() });
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(call.mock.calls[1][1].body)).toEqual({ file_id: "stored", version_id: "v2" });
  });
});
