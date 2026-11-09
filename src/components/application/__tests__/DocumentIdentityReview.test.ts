import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { DocumentIdentityReview } from "../DocumentIdentityReview";
import type { DocumentAssociation, DocumentAssociationDraft } from "@/lib/documentAssociation";

vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => vi.fn(), useDevUser: () => "reviewer" }));

const record: DocumentAssociation = { file_id: "file", file_name: "Original return.pdf", content_hash: "a".repeat(64), analysis_id: "analysis", expected_entity: "Expected Business LLC", observed_entities: ["Observed Original Corporation"], status: "conflict", allows_financial_use: false, document_accepted: true, source_stamp: "b".repeat(64), can_review: true, document_version_number: 2, current_decision: null, history: [] };
const draft: DocumentAssociationDraft = { profileId: "profile", fileId: "file", revision: 3, sourceStamp: record.source_stamp, action: "accept", reason: "Confirmed the legal business association", idempotencyKey: "stable-retry" };
const render = (props: Partial<Parameters<typeof DocumentIdentityReview>[0]> = {}, working?: DocumentAssociationDraft, current = record) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["document-associations", "profile", "reviewer"], { profile_id: "profile", revision: 3, expected_entity: "Expected Business LLC", documents: [current] });
  if (working) client.setQueryData(["document-association-draft", "profile", "file"], working);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(DocumentIdentityReview, { profileId: "profile", fileId: "file", canEdit: true, initiallyOpen: true, ...props })));
};

describe("inline document business association review", () => {
  it("shows expected and original observed identity, source version, and separate verification meaning", () => {
    const html = render({}, draft);
    expect(html).toContain("Expected Business LLC"); expect(html).toContain("Observed Original Corporation"); expect(html).toContain("Version 2"); expect(html).toContain("aaaaaaaaaaaa");
    expect(html).toContain("Belongs to this business"); expect(html).toContain("Does not belong to this business"); expect(html).toContain("does not verify financial figures"); expect(html).toContain("Document acceptance recorded separately");
    expect(html).not.toContain('role="dialog"'); expect(html).toMatch(/<button[^>]*>Save business association<\/button>/); expect(html).toContain('maxLength="2000"');
  });
  it("requires explicit action and retains a stale draft with guidance instead of silently rebasing it", () => {
    expect(render({}, { ...draft, action: null })).toMatch(/<button[^>]*disabled=""[^>]*>Save business association<\/button>/);
    const html = render({}, { ...draft, sourceStamp: "old-source" });
    expect(html).toContain(draft.reason); expect(html).toContain("Your draft is retained"); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save business association<\/button>/);
  });
  it("fails closed for a missing or different content hash and gates writes by the supplied underwriting permission", () => {
    for (const html of [render({ expectedContentHash: "c".repeat(64) }, draft), render({}, draft, { ...record, content_hash: null })]) expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save business association<\/button>/);
    const html = render({ canEdit: false }, draft);
    expect(html).not.toContain("Save business association"); expect(html).not.toContain('type="radio"'); expect(html).toContain("underwriting staff");
  });
  it("does not display another file's cached notes and shows prior staff decisions with actor and reason", () => {
    expect(render({}, { ...draft, fileId: "other-file", reason: "Notes for a different client file" })).not.toContain("Notes for a different client file");
    const event = { id: "event", action: "deny" as const, reason: "Different business in the original source", actor_name: "Underwriter Jane", at: "2026-11-09T14:00:00Z", source_stamp: record.source_stamp, revision: 2, stale: true };
    const html = render({}, undefined, { ...record, status: "denied", current_decision: event, history: [event] });
    expect(html).toContain("Underwriter Jane"); expect(html).toContain(event.reason); expect(html).toContain("Earlier source"); expect(html).toContain("Business association denied");
  });
});
