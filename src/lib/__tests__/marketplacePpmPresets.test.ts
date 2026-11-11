import { describe, expect, it } from "vitest";
import { ppmApplyEditsToLatest, ppmChoosePreset, ppmDirty, ppmEdit, ppmSelectedPreset, ppmSetLegalText, type PpmLegalField, type PpmVersion } from "../marketplacePpm";

const field: PpmLegalField = { key: "jurisdiction", label: "Governing law", required: true, options: [{ key: "to_be_confirmed", label: "To be confirmed", text: "", unresolved: true }, { key: "us_state_NY", label: "New York", text: "New York draft wording" }] };
const saved = (overrides: Partial<PpmVersion> = {}): PpmVersion => ({ document_id: "draft-1", version: 1, source: "generated_ppm", status: "draft", source_fingerprint: "facts-1", stale: false, created_at: "2026-11-11T12:00:00Z", reviewed_at: null, legal_inputs: { issuer_legal_name: "Qualified Commercial LLC", jurisdiction: "" }, legal_presets: { issuer_legal_name: "issuer_settings", jurisdiction: "to_be_confirmed" }, narrative_sections: { overview: "Saved custom narrative" }, document: { title: "Draft", listing_ref: "TEST", issuer: "Qualified Commercial LLC", source_fingerprint: "facts-1", sections: [], missing: [], warnings: [] }, ...overrides });

describe("PPM disclosure preset intent", () => {
  it("copies only the explicitly selected server wording and stable identifier", () => {
    const base = ppmEdit(saved()), next = ppmChoosePreset(base, field, "us_state_NY");
    expect(next.legalInputs).toEqual({ issuer_legal_name: "Qualified Commercial LLC", jurisdiction: "New York draft wording" });
    expect(next.legalPresets.jurisdiction).toBe("us_state_NY");
    expect(next.narrativeSections).toEqual(base.narrativeSections);
    expect(next.sourceFingerprint).toBe("facts-1");
    expect(base.legalInputs.jurisdiction).toBe("");
  });
  it("records typing and intentional blank wording as custom instead of restoring defaults", () => {
    const chosen = ppmChoosePreset(ppmEdit(saved()), field, "us_state_NY");
    const blank = ppmSetLegalText(chosen, "jurisdiction", "");
    expect(blank.legalPresets.jurisdiction).toBe("custom");
    expect(blank.legalInputs.jurisdiction).toBe("");
    expect(ppmSelectedPreset(field, blank)).toBe("custom");
    expect(ppmSelectedPreset(field, ppmSetLegalText(chosen, "jurisdiction", "New York draft wording"))).toBe("custom");
  });
  it("keeps unresolved choices selected while preserving their empty required value", () => {
    const draft = ppmEdit(saved());
    expect(ppmSelectedPreset(field, draft)).toBe("to_be_confirmed");
    expect(draft.legalInputs.jurisdiction).toBe("");
  });
  it("does not infer preset intent from matching legacy text or apply unknown options", () => {
    const legacy = ppmEdit(saved({ legal_inputs: { jurisdiction: "New York draft wording" }, legal_presets: undefined }));
    expect(ppmSelectedPreset(field, legacy)).toBe("custom");
    expect(ppmChoosePreset(legacy, field, "not-an-option")).toBe(legacy);
    const changedPolicy = { ...field, options: [{ key: "us_state_NY", label: "New York", text: "Changed server wording" }] };
    expect(ppmSelectedPreset(changedPolicy, ppmChoosePreset(legacy, field, "us_state_NY"))).toBe("custom");
  });
  it("treats a custom choice as an edit even when the displayed wording is unchanged", () => {
    const base = ppmChoosePreset(ppmEdit(saved()), field, "us_state_NY");
    const next = ppmChoosePreset(base, field, "custom");
    expect(next.legalInputs).toEqual(base.legalInputs);
    expect(ppmDirty(next, base)).toBe(true);
  });
  it("pins unchanged wording when Custom is selected before the preset source changes", () => {
    const base = ppmEdit(saved()), local = ppmChoosePreset(base, { key: "issuer_legal_name", label: "Issuer", required: true }, "custom");
    const latest = saved({ version: 2, source_fingerprint: "facts-2", legal_inputs: { issuer_legal_name: "Changed saved issuer LLC", jurisdiction: "Remote law" }, legal_presets: { issuer_legal_name: "issuer_settings", jurisdiction: "custom" } });
    const merged = ppmApplyEditsToLatest(base, local, latest);
    expect(merged.legalInputs.issuer_legal_name).toBe("Qualified Commercial LLC");
    expect(merged.legalPresets.issuer_legal_name).toBe("custom");
    expect(merged.legalInputs.jurisdiction).toBe("Remote law");
  });
  it("rebases local custom text and intent while retaining another staff member’s presets", () => {
    const base = ppmEdit(saved()), local = ppmSetLegalText(base, "jurisdiction", "Reviewed custom provision");
    const latest = saved({ version: 2, source_fingerprint: "facts-2", legal_inputs: { issuer_legal_name: "Remote issuer wording", jurisdiction: "Remote provision" }, legal_presets: { issuer_legal_name: "custom", jurisdiction: "us_state_NY", offering_structure: "platform_loan_participation" } });
    const merged = ppmApplyEditsToLatest(base, local, latest);
    expect(merged.legalInputs).toEqual({ issuer_legal_name: "Remote issuer wording", jurisdiction: "Reviewed custom provision" });
    expect(merged.legalPresets).toEqual({ issuer_legal_name: "custom", jurisdiction: "custom", offering_structure: "platform_loan_participation" });
    expect(merged.sourceFingerprint).toBe("facts-2");
    merged.legalPresets.issuer_legal_name = "issuer_settings";
    expect(latest.legal_presets?.issuer_legal_name).toBe("custom");
  });
});
