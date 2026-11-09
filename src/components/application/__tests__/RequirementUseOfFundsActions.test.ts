import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RequirementUseOfFundsActions } from "../RequirementUseOfFundsActions";
import { RequirementCollectionActions } from "../RequirementCollectionActions";
import type { ApplicationRequirement } from "@/lib/applicationProfile";

vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => vi.fn() }));

describe("use of proceeds actions", () => {
  it("offers filling and link sharing to operators while withholding both from readers", () => {
    const props = { profileId: "profile", canEdit: true, onFill: vi.fn() };
    const html = renderToStaticMarkup(createElement(RequirementUseOfFundsActions, props));
    expect(html).toContain("Fill in use of proceeds");
    expect(html).toContain("Share link");
    expect(renderToStaticMarkup(createElement(RequirementUseOfFundsActions, { ...props, canEdit: false }))).toBe("");
  });
  it("enables explicit review for a balanced structured allocation without a document selection", () => {
    const requirement: ApplicationRequirement = { requirement_key: "use_of_proceeds", label: "Business use of proceeds", evidence_files: [], collection_completion: { source: "use_of_funds", complete: false, can_complete: true, fingerprint: "a".repeat(64), eligible_file_ids: [], suggested_file_ids: [], reason: null },
      category: "borrower_info", required_level: "required", status: "received_unverified", requested_document_id: null, evidence_file_id: null, evidence_file_name: null,
      evidence_count: 0, verified_evidence_count: 0, coverage: {}, verified_coverage: {}, coverage_complete: false, verified_coverage_complete: false,
      allow_multiple_files: false, verification_required: true, source_program_keys: [], source_policy_keys: [], program_overrides: {}, client_visible: true, can_waive: true,
      state_reason: null, last_requested_at: null, received_at: null, verified_at: null, provenance: {} };
    const html = renderToStaticMarkup(createElement(RequirementCollectionActions, { profileId: "profile", requirement, canEdit: true, onPending: vi.fn(), onSaved: vi.fn(), onReload: vi.fn() }));
    expect(html).toContain("Mark complete");
    expect(html).not.toContain("disabled=");
    expect(html).not.toContain("file selected");
  });
});
