import { describe, expect, it } from "vitest";
import { collateralAssetDraft, collateralAssetPayload, collateralDraftErrors, collateralPropertyDraft, collateralPropertyPayload, investorReferenceLabel } from "../investorCollateral";

describe("investor collateral proposals", () => {
  it("round-trips Decimal JSON strings without converting unknown amounts to zero", () => {
    const draft = collateralPropertyDraft({ id: "property", currency: "USD", estimated_value: "250000.00", existing_liens_total: "0.00", available_lien_amount: null });
    expect(draft.estimated_value).toBe("250000.00");
    const payload = collateralPropertyPayload(draft);
    expect(payload.estimated_value).toBe(250000);
    expect(payload.existing_liens_total).toBe(0);
    expect(payload.available_lien_amount).toBeNull();
  });
  it("requires a complete address and currency when offering a schedule property", () => {
    const draft = collateralPropertyDraft({ id: "property", address: { street: "12 Example St", city: "", state: "", postal_code: "" }, currency: "" });
    expect(collateralDraftErrors(true, [draft])).toEqual(expect.arrayContaining([expect.stringContaining("complete the street"), expect.stringContaining("currency")]));
    expect(collateralDraftErrors(false, [{ ...draft, currency: "USD" }])).toEqual([]);
  });
  it("rejects negative amounts, excessive precision and unsupported lien positions", () => {
    const draft = collateralPropertyDraft({ id: "property", currency: "USD" });
    expect(collateralDraftErrors(false, [{ ...draft, estimated_value: "-1", existing_liens_total: "12.123", proposed_lien_position: "0" }])).toHaveLength(3);
  });
  it("does not expose raw credit source labels in the report register", () => {
    expect(investorReferenceLabel({ id: "S1", label: "Jane Example 123-45-6789 report", kind: "owner_credit" })).toBe("Linked owner credit report");
  });
  it("accepts asset-only security and preserves unknowns, zero liens and source links", () => {
    const asset = collateralAssetDraft({ id: "asset", asset_type: "equipment", description: "  Two commercial ovens  ", currency: "USD", estimated_value: "32000.50", existing_liens_total: "0.00", source_file_ids: ["valuation"] });
    expect(collateralDraftErrors(true, [], [asset])).toEqual([]);
    expect(collateralAssetPayload(asset)).toMatchObject({ asset_type: "equipment", description: "Two commercial ovens", estimated_value: 32000.5, existing_liens_total: 0, available_lien_amount: null, source_file_ids: ["valuation"] });
    expect(collateralAssetPayload(asset)).not.toHaveProperty("address");
  });
  it("requires a described asset and never assumes a blank value provides borrowing capacity", () => {
    const asset = collateralAssetDraft({ id: "asset", description: "", estimated_value: "-20", proposed_lien_position: 11 });
    expect(collateralDraftErrors(true, [], [asset])).toHaveLength(3);
    expect(collateralDraftErrors(true, [], [])).toContain("Add a property or other asset before including collateral.");
  });
});
