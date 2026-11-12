import { describe, expect, it } from "vitest";
import { ppmApplyEditsToLatest, ppmApprovalValues, ppmCanReview, ppmConflict, ppmDirty, ppmEdit, ppmFailure, ppmMissingIssue, ppmMissingLegalKey, ppmNeedsPreparation, ppmNeedsRefresh, type MarketplacePpm, type PpmMissing, type PpmVersion } from "../marketplacePpm";

const version = (overrides: Partial<PpmVersion> = {}): PpmVersion => ({ document_id: "draft-1", version: 1, source: "generated_ppm", status: "draft", source_fingerprint: "current-facts", stale: false, created_at: "2026-11-11T12:00:00Z", reviewed_at: null, document: { title: "Draft PPM", listing_ref: "QC-1", issuer: "Fictional business", source_fingerprint: "current-facts", sections: [], missing: [], warnings: [] }, legal_inputs: { issuer_legal_name: "Fictional LLC", jurisdiction: "NY" }, narrative_sections: {}, ai_sections: { overview: "Suggested wording" }, ...overrides });
const state = (overrides: Partial<MarketplacePpm> = {}): MarketplacePpm => ({ managed: true, auto_refresh: true, status: "draft", generation_status: "source_based", source_fingerprint: "current-facts", current_draft: version(), current_approved: null, history: [], missing: [], warnings: [], legal_fields: [{ key: "issuer_legal_name", label: "Issuer legal name", required: true }, { key: "offering_currency", label: "Offering currency", required: false }], narrative_fields: [{ key: "overview", label: "Overview" }], ...overrides });

describe("managed PPM draft lifecycle", () => {
  it("explains a source conflict in the action that failed instead of sending approval failures back to a save loop", () => {
    const conflict = Object.assign(new Error("Server conflict"), { body: { detail: { code: "ppm_source_changed" } } });
    expect(ppmFailure("review", conflict).message).toContain("Approval could not finish");
    expect(ppmFailure("review", conflict).message).toContain("Prepare latest offer");
    expect(ppmFailure("review", conflict).message).not.toContain("Finish saving");
    expect(ppmFailure("generate", conflict).message).toContain("draft could not be prepared");
    expect(ppmFailure("reinstate", conflict).message).toContain("choose the historical version again");
    expect(ppmFailure("review", new Error("Storage unavailable"))).toEqual({ code: "", message: "Storage unavailable" });
  });
  it("prepares stale listing figures even when the saved PPM fingerprint matches, while preserving approval authority", () => {
    const missing: PpmMissing[] = [{ key: "listing_snapshot", label: "Refresh saved figures", section: "snapshot", required: true }];
    const current = state({ missing });
    expect(ppmNeedsRefresh(current)).toBe(false);
    expect(ppmNeedsPreparation(current)).toBe(true);
    expect(ppmCanReview(current, false, false)).toBe(false);
    expect(ppmNeedsPreparation(state({ missing: [{ ...missing[0], required: false }] }))).toBe(false);
    expect(ppmNeedsPreparation(state({ managed: false, current_draft: null, current_approved: version({ source: "uploaded", status: "approved" }), missing }))).toBe(false);
  });
  it("does not automatically adopt an existing uploaded legal document", () => {
    const legacy = state({ managed: false, status: "approved", current_draft: null, current_approved: version({ source: "uploaded", status: "approved", source_fingerprint: "" }) });
    expect(ppmNeedsRefresh(legacy)).toBe(false);
    expect(ppmConflict(ppmEdit(legacy.current_approved!), legacy)).toBe(false);
    expect(ppmNeedsRefresh(state({ managed: false, status: "not_started", current_draft: null }))).toBe(true);
  });
  it("does not regenerate forever after approval creates a derivative and clears the draft", () => {
    const reviewed = state({ status: "approved", current_draft: null, current_approved: version({ document_id: "reviewed-2", version: 2, status: "approved" }) });
    expect(ppmNeedsRefresh(reviewed)).toBe(false);
    expect(ppmNeedsRefresh({ ...reviewed, source_fingerprint: "changed-facts" })).toBe(true);
  });
  it("requires refresh after a saved source changes without treating current facts as approval", () => {
    expect(ppmNeedsRefresh(state({ source_fingerprint: "changed-facts" }))).toBe(true);
    expect(ppmCanReview(state({ source_fingerprint: "changed-facts" }), false, false)).toBe(false);
    expect(ppmCanReview(state(), false, false)).toBe(true);
    expect(ppmCanReview(state(), true, false)).toBe(false);
    expect(ppmCanReview(state({ missing: [{ key: "jurisdiction", label: "Jurisdiction", section: "legal", required: true }] }), false, false)).toBe(false);
  });
  it("keeps AI suggestions separate from manually saved wording, including explicit blank text", () => {
    const saved = version(), base = ppmEdit(saved);
    expect(base.narrativeSections).toEqual({});
    expect(ppmDirty({ ...base, narrativeSections: { overview: "" } }, base)).toBe(true);
    const edited = ppmEdit(saved); edited.legalInputs.issuer_legal_name = "Edited LLC";
    expect(saved.legal_inputs.issuer_legal_name).toBe("Fictional LLC");
  });
  it("compares field values rather than object insertion order", () => {
    const base = ppmEdit(version());
    expect(ppmDirty({ ...base, legalInputs: { jurisdiction: "NY", issuer_legal_name: "Fictional LLC" } }, base)).toBe(false);
  });
  it("applies only local changes onto the newest version and preserves other staff edits", () => {
    const base = ppmEdit(version({ narrative_sections: { overview: "Original manual text" } }));
    const local = { ...base, legalInputs: { ...base.legalInputs, issuer_legal_name: "Local edit LLC" }, narrativeSections: {} };
    const next = ppmApplyEditsToLatest(base, local, version({ version: 3, source_fingerprint: "new-facts", legal_inputs: { issuer_legal_name: "Remote LLC", jurisdiction: "CA" }, narrative_sections: { overview: "Remote text", servicing: "Other staff note" } }));
    expect(next).toMatchObject({ version: 3, sourceFingerprint: "new-facts", legalInputs: { issuer_legal_name: "Local edit LLC", jurisdiction: "CA" }, narrativeSections: { servicing: "Other staff note" } });
    expect(next.narrativeSections).not.toHaveProperty("overview");
  });
  it("detects both a new version and a new saved-source fingerprint", () => {
    const edit = ppmEdit(version());
    expect(ppmConflict(edit, state())).toBe(false);
    expect(ppmConflict(edit, state({ current_draft: version({ version: 2 }) }))).toBe(true);
    expect(ppmConflict(edit, state({ source_fingerprint: "new-facts" }))).toBe(true);
    expect(ppmConflict(edit, state({ current_draft: null, current_approved: version({ status: "approved" }) }))).toBe(false);
  });
  it("routes only known legal and canonical facts, including an explicitly unknown currency", () => {
    const fields = state().legal_fields;
    expect(ppmMissingLegalKey({ key: "currency", label: "Currency missing", section: "legal", required: true }, fields)).toBe("offering_currency");
    expect(ppmMissingLegalKey({ key: "currency", label: "Currency missing", section: "budget", required: true }, fields)).toBe("offering_currency");
    expect(ppmMissingLegalKey({ key: "unknown", label: "Unknown", section: "legal", required: true }, fields)).toBeNull();
    expect(ppmMissingIssue({ key: "loan_amount", label: "Loan amount missing", section: "coverage_plan", required: true }, true)?.target).toEqual({ kind: "file", action: "coverage" });
    expect(ppmMissingIssue({ key: "unknown.path", label: "Unknown", section: "terms", required: true }, false)).toBeNull();
    expect(ppmMissingIssue({ key: "name_required", label: "Deal title missing", section: "terms", required: true }, false)?.target).toEqual({ kind: "field", field: "name" });
  });
  it("refreshes a server-identified legacy disclosure upgrade even with unchanged source facts", () => {
    const old = state({ draft_upgrade_available: true });
    expect(ppmNeedsRefresh(old)).toBe(true);
    expect(ppmCanReview(old, false, false)).toBe(false);
    expect(ppmEdit(old.current_draft!).legalInputs).toEqual(old.current_draft!.legal_inputs);
    const reviewed = state({ draft_upgrade_available: true, current_draft: null, current_approved: version({ status: "approved" }) });
    expect(ppmNeedsRefresh(reviewed)).toBe(true);
  });
  it("does not invent an upgrade or saved defaults for intentional current custom blanks", () => {
    const saved = version({ legal_inputs: { jurisdiction: "" }, legal_presets: { jurisdiction: "custom" } });
    const current = state({ current_draft: saved, legal_defaults: { jurisdiction: "Suggested law" }, draft_upgrade_available: false, missing: [{ key: "jurisdiction", label: "Governing law", section: "legal", required: true }] });
    expect(ppmNeedsRefresh(current)).toBe(false);
    expect(ppmEdit(saved).legalInputs.jurisdiction).toBe("");
    expect(ppmCanReview(current, false, false)).toBe(false);
  });
  it("binds action-only approval to the exact current saved version without requiring a note", () => {
    expect(ppmApprovalValues(state(), false, false)).toEqual({ expected_version: 1, expected_source_fingerprint: "current-facts", confirmed: true, decision: "approve" });
    expect(ppmApprovalValues(state(), false, false, "  ")).not.toHaveProperty("reason");
    expect(ppmApprovalValues(state(), false, false, " ok ")).toMatchObject({ reason: "ok" });
    expect(ppmApprovalValues(state(), false, false, "x".repeat(2001))).toBeNull();
  });
  it("keeps action-only approval blocked for unsaved, stale, missing or upgrading content", () => {
    expect(ppmApprovalValues(state(), true, false)).toBeNull();
    expect(ppmApprovalValues(state(), false, true)).toBeNull();
    expect(ppmApprovalValues(state({ source_fingerprint: "changed" }), false, false)).toBeNull();
    expect(ppmApprovalValues(state({ draft_upgrade_available: true }), false, false)).toBeNull();
    expect(ppmApprovalValues(state({ missing: [{ key: "jurisdiction", label: "Governing law", section: "legal", required: true }] }), false, false)).toBeNull();
  });
});
