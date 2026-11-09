import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RequirementCollectionActions } from "../RequirementCollectionActions";
import { DocumentReviewChecks } from "../DocumentReviewChecks";
import type { ApplicationRequirement } from "@/lib/applicationProfile";

vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => vi.fn() }));
const requirement = { requirement_key: "business_tax", label: "Most recently filed business tax return", evidence_files: [{ file_id: "business-2025", file_name: "Business 2025.pdf" }, { file_id: "personal", file_name: "Personal 2025.pdf" }], collection_completion: { source: "files", complete: false, can_complete: true, fingerprint: "a".repeat(64), eligible_file_ids: ["business-2025"], suggested_file_ids: ["business-2025"], reason: null } } as ApplicationRequirement;
const props = { profileId: "profile", requirement, canEdit: true, onPending: () => {}, onSaved: () => {}, onReload: () => {}, onPreview: () => {} };

describe("collection actions", () => {
  it("shows an immediate completion action for the actual business source and keeps personal files out of the selection", () => {
    const html = renderToStaticMarkup(createElement(RequirementCollectionActions, props));
    expect(html).toContain("Mark complete");
    expect(html).toContain("Business 2025.pdf");
    expect(html).not.toContain("Personal 2025.pdf");
    expect(html).toContain("Program earnings, credit and other qualification conditions remain separate");
  });
  it("shows a received single-bureau report as collected without requiring a document selection", () => {
    const html = renderToStaticMarkup(createElement(RequirementCollectionActions, { ...props, requirement: { ...requirement, collection_completion: { ...requirement.collection_completion!, source: "linked_owner_credit", complete: true, can_complete: false, eligible_file_ids: [], suggested_file_ids: [] } } }));
    expect(html).toContain("Collection complete");
    expect(html).not.toContain("Mark complete");
    expect(html).not.toContain("file selected");
  });
  it("does not expose completion mutations to readers", () => {
    expect(renderToStaticMarkup(createElement(RequirementCollectionActions, { ...props, canEdit: false }))).not.toContain("Mark complete");
  });
  it("labels failed earnings conditions separately from accepted document collection", () => {
    const checks = [{ key: "positive_ebitda", label: "Positive EBITDA", instructions: "Use the current business return", severity: "block" as const }];
    const html = renderToStaticMarkup(createElement(DocumentReviewChecks, { checks, collectionComplete: true, qualification: { status: "failed", blocking: true, reasons: ["Negative earnings remain a program concern"], checks } }));
    expect(html).toContain("Program conditions");
    expect(html).toContain("Document collection is complete");
    expect(html).toContain("Condition not met");
    expect(html).toContain("Negative earnings remain a program concern");
    expect(html).not.toContain("Resolve before acceptance");
    expect(html).not.toContain("staff-only step");
  });
});
