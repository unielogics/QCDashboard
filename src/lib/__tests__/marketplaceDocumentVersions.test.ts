import { describe, expect, it } from "vitest";
import { offeringDocumentStatus, offeringDocumentUrl, offeringDocumentVersions, type OfferingPpmVersions } from "../marketplaceDocumentVersions";
import type { CpDocument } from "@/hooks/useCapitalPartners";
import type { PpmVersion } from "../marketplacePpm";

const document = (version: number, status = "pending", kind: CpDocument["kind"] = "ppm"): CpDocument => ({ id: `doc-${version}`, kind, kind_label: kind, name: `Document v${version}`, content_type: "application/pdf", size_bytes: 1024, version, status, source: kind === "ppm" ? "generated_ppm" : "uploaded" });
const version = (number: number, status: PpmVersion["status"] = "draft"): PpmVersion => ({ document_id: `doc-${number}`, version: number, status, source: "generated_ppm", source_fingerprint: "saved-facts", stale: false, created_at: "2026-11-12T12:00:00Z", reviewed_at: status === "approved" ? "2026-11-12T13:00:00Z" : null, document: { title: `Saved PPM v${number}`, listing_ref: "SYNTHETIC", issuer: "Synthetic issuer", source_fingerprint: "saved-facts", sections: [], missing: [], warnings: [] }, legal_inputs: {}, narrative_sections: {} });
const state = (overrides: Partial<OfferingPpmVersions> = {}): OfferingPpmVersions => ({ active_version: version(2, "approved"), current_draft: version(4), working_draft_document_id: "doc-4", current_approved: version(5, "approved"), history: [version(1), version(2, "approved"), version(3), version(4), version(5, "approved")], ...overrides });

describe("offering document lifecycle", () => {
  it("keeps the published pointer separate from a higher draft and a reviewed unpublished version", () => {
    const result = offeringDocumentVersions([document(1), document(2, "ready"), document(3), document(4), document(5, "ready")], state());
    expect(result.active?.document.id).toBe("doc-2");
    expect(result.working?.document.id).toBe("doc-4");
    expect(result.reviewed?.document.id).toBe("doc-5");
    expect(result.current.map(row => row.role)).toEqual(["published", "working", "reviewed"]);
    expect(result.history.map(row => row.document.id)).toEqual(["doc-3", "doc-1"]);
    expect(offeringDocumentStatus(result.reviewed!)).toBe("Reviewed · not published");
  });
  it("does not describe a READY reviewed candidate as published on a never-published offer", () => {
    const result = offeringDocumentVersions([document(5, "ready")], state({ active_version: null, current_draft: null, working_draft_document_id: null, history: [] }));
    expect(result.publicationKnown).toBe(true);
    expect(result.active).toBeNull();
    expect(result.reviewed?.document.id).toBe("doc-5");
  });
  it("does not invent a publication pointer for older API responses", () => {
    const result = offeringDocumentVersions([document(5, "ready")], { current_draft: null, current_approved: version(5, "approved"), history: [] });
    expect(result.publicationKnown).toBe(false);
    expect(result.active).toBeNull();
  });
  it("retains the published pointer when facts change without promoting the reviewed candidate", () => {
    const result = offeringDocumentVersions([], state({ active_version: { ...version(2, "approved"), stale: true } }));
    expect(result.active?.document.id).toBe("doc-2");
    expect(result.reviewed?.document.id).toBe("doc-5");
    expect(offeringDocumentStatus(result.active!)).toBe("Published version · update needed");
  });
  it("shows an acknowledged saved draft before the separate listing read includes its document row", () => {
    const records = [document(2, "ready")], saved = state();
    const result = offeringDocumentVersions(records, saved);
    expect(result.working?.document).toMatchObject({ id: "doc-4", version: 4, name: "Saved PPM v4" });
    expect(records).toHaveLength(1);
    expect(saved.history.map(row => row.version)).toEqual([1, 2, 3, 4, 5]);
  });
  it("preserves independent ready attachments and all historical rows", () => {
    const result = offeringDocumentVersions([document(6, "ready", "note"), document(7, "ready", "valuation"), document(8, "superseded", "note")], state());
    expect(result.current.filter(row => row.role === "attachment").map(row => row.document.id)).toEqual(["doc-7", "doc-6"]);
    expect(result.history.map(row => row.document.id)).toContain("doc-8");
    expect(result.current.map(row => row.document.id).filter(id => id === "doc-2")).toHaveLength(1);
  });
  it("keeps archived generated drafts distinct from uploaded PPM history", () => {
    const uploaded = { ...document(9, "superseded"), source: "uploaded" as const };
    const result = offeringDocumentVersions([document(1, "superseded"), uploaded], state({ history: [version(1, "superseded")] }));
    expect(offeringDocumentStatus(result.history.find(row => row.document.id === "doc-1")!)).toBe("Previous draft");
    expect(offeringDocumentStatus(result.history.find(row => row.document.id === "doc-9")!)).toBe("Historical PPM");
    const reviewed = offeringDocumentVersions([], state({ history: [{ ...version(1, "superseded"), reviewed_at: "2026-11-12T13:00:00Z" }] }));
    expect(offeringDocumentStatus(reviewed.history.find(row => row.document.id === "doc-1")!)).toBe("Reviewed history");
  });
  it("uses protected PPM URLs for pending and historical PPM versions and encodes IDs", () => {
    expect(offeringDocumentUrl("listing/a", { id: "saved/b", kind: "ppm" }, false)).toBe("/capital/admin/listings/listing%2Fa/ppm/versions/saved%2Fb/url?download=false");
    expect(offeringDocumentUrl("listing", { id: "attachment", kind: "note" }, true)).toBe("/capital/admin/listings/listing/documents/attachment/url?download=true");
  });
});
