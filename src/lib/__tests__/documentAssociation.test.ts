import { describe, expect, it, vi } from "vitest";
import type { AuthedApi } from "../worksheetApi";
import { associationDraftIsStale, readDocumentAssociations, saveDocumentAssociation, type DocumentAssociation, type DocumentAssociationDraft } from "../documentAssociation";

const record: DocumentAssociation = { file_id: "file/a", file_name: "Business return.pdf", content_hash: "a".repeat(64), analysis_id: "analysis", expected_entity: "Expected Business LLC", observed_entities: ["Original Observed Name Inc"], status: "conflict", allows_financial_use: false, document_accepted: false, source_stamp: "b".repeat(64), can_review: true, current_decision: null, history: [] };
const draft: DocumentAssociationDraft = { profileId: "profile/a", fileId: "file/a", sourceStamp: record.source_stamp, revision: 3, action: "accept", reason: "  Confirmed legal business association  ", idempotencyKey: "same-retry-key" };

describe("document business-association API", () => {
  it("reads the profile inventory and sends an explicit immutable-source decision without changing extracted names", async () => {
    const api = vi.fn(async (_path: string, _options?: import("../api").ApiOptions) => ({}));
    const caller = api as unknown as AuthedApi;
    await readDocumentAssociations(caller, "profile/a");
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile%2Fa/document-associations");
    await saveDocumentAssociation(caller, "profile/a", record, 3, draft);
    const [path, options] = api.mock.calls[1];
    expect(path).toBe("/application-profiles/profile%2Fa/documents/file%2Fa/association");
    expect(JSON.parse(options!.body as string)).toEqual({ action: "accept", reason: "Confirmed legal business association", expected_revision: 3, source_stamp: record.source_stamp, idempotency_key: "same-retry-key" });
    expect(record.observed_entities).toEqual(["Original Observed Name Inc"]);
  });
  it("reuses the retry idempotency key and supports denial/reset as independent reviewed actions", async () => {
    const api = vi.fn(async (_path: string, _options?: import("../api").ApiOptions) => ({}));
    const caller = api as unknown as AuthedApi;
    for (const action of ["deny", "reset", "reset"] as const) await saveDocumentAssociation(caller, "profile/a", record, 3, { ...draft, action });
    expect(api.mock.calls.map(([, options]) => JSON.parse(options!.body as string).action)).toEqual(["deny", "reset", "reset"]);
    expect(new Set(api.mock.calls.map(([, options]) => JSON.parse(options!.body as string).idempotency_key))).toEqual(new Set(["same-retry-key"]));
  });
  it("rejects another profile/file, changed source, stale revision, unknown hash and absent explicit decision", () => {
    const api = vi.fn(async (_path: string, _options?: import("../api").ApiOptions) => ({}));
    const caller = api as unknown as AuthedApi;
    for (const changed of [{ profileId: "other" }, { fileId: "other" }, { sourceStamp: "c".repeat(64) }, { revision: 2 }]) expect(() => saveDocumentAssociation(caller, "profile/a", record, 3, { ...draft, ...changed })).toThrow(/changed/);
    expect(() => saveDocumentAssociation(caller, "profile/a", { ...record, content_hash: null }, 3, draft)).toThrow(/current-source/);
    expect(() => saveDocumentAssociation(caller, "profile/a", record, 3, { ...draft, action: null })).toThrow(/explicit/);
    expect(() => saveDocumentAssociation(caller, "profile/a", record, 3, { ...draft, reason: "x".repeat(2001) })).toThrow(/2,000/);
    expect(() => saveDocumentAssociation(caller, "profile/a", { ...record, can_review: false }, 3, draft)).toThrow(/authorized/);
    expect(api).not.toHaveBeenCalled();
    expect(associationDraftIsStale(draft, "profile/a", record, 4)).toBe(true);
  });
});
