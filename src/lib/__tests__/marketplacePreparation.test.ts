import { describe, expect, it, vi } from "vitest";
import { existingMarketplaceListingId, explicitMarketplaceCopy, hasNewerMarketplaceBudgetDraft, marketplaceBudgetDraftFingerprint, prepareMarketplaceFinancing, type MarketplaceBudgetControls, type MarketplaceBudgetReceipt, type MarketplacePlanControls } from "../marketplacePreparation";
import type { DealBudget, DealBudgetWrite, DealCostRow } from "../dealBudget";

const profileId = "synthetic-profile";
function controls() {
  const receipt = { budget: { profile_id: profileId, revision: 2 } as DealBudget, planSaved: false, submittedPlan: null };
  const budget: MarketplaceBudgetControls = { profileId, needsSave: false, busy: false, blocker: null, persist: vi.fn().mockResolvedValue(receipt) };
  const plan: MarketplacePlanControls = { profileId, dirty: false, busy: false, blocker: null, persist: vi.fn().mockResolvedValue(null), assertCurrent: vi.fn() };
  return { budget, plan, receipt, stage: vi.fn() };
}

describe("same-panel marketplace financial preparation", () => {
  it("waits for the real plan acknowledgment before allowing the listing stage", async () => {
    const c = controls(); c.plan.dirty = true;
    let acknowledge!: () => void;
    c.plan.persist = vi.fn(() => new Promise<null>(resolve => { acknowledge = () => resolve(null); }));
    const listing = vi.fn();
    const pending = prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage).then(listing);
    await Promise.resolve(); expect(listing).not.toHaveBeenCalled();
    acknowledge(); await pending; expect(listing).toHaveBeenCalledTimes(1);
  });
  it("hands an atomic budget/loan receipt to the plan owner instead of repeating an old plan write", async () => {
    const c = controls(); c.budget.needsSave = true; c.plan.dirty = true;
    const receipt: MarketplaceBudgetReceipt = { ...c.receipt, planSaved: true };
    c.budget.persist = vi.fn().mockResolvedValue(receipt);
    await prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage);
    expect(c.budget.persist).toHaveBeenCalledTimes(1);
    expect(c.plan.persist).toHaveBeenCalledExactlyOnceWith(receipt);
  });
  it("saves a pending non-principal cost change before the dirty coverage plan", async () => {
    const c = controls(); c.budget.needsSave = true; c.plan.dirty = true;
    const order: string[] = [];
    c.budget.persist = vi.fn(async () => { order.push("budget"); return c.receipt; });
    c.plan.persist = vi.fn(async () => { order.push("plan"); return null; });
    await prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage);
    expect(order).toEqual(["budget", "plan"]);
  });
  it("does not write financial records for an unchanged listing refresh", async () => {
    const c = controls(); await prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage);
    expect(c.budget.persist).not.toHaveBeenCalled(); expect(c.plan.persist).not.toHaveBeenCalled();
  });
  it("stops before any cost save when full terms require review", async () => {
    const c = controls(); c.budget.needsSave = true; c.plan.blocker = "Save or discard the full terms draft";
    await expect(prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage)).rejects.toThrow("full terms draft");
    expect(c.budget.persist).not.toHaveBeenCalled();
  });
  it("keeps invalid pending costs from falling through to a plan or listing save", async () => {
    const c = controls(); c.budget.needsSave = true; c.budget.blocker = "Enter the missing closing cost";
    await expect(prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage)).rejects.toThrow("missing closing cost");
    expect(c.budget.persist).not.toHaveBeenCalled(); expect(c.plan.persist).not.toHaveBeenCalled();
  });
  it("propagates a failed cost save and preserves the next stage for explicit retry", async () => {
    const c = controls(); c.budget.needsSave = true; c.plan.dirty = true;
    c.budget.persist = vi.fn().mockRejectedValue(new Error("Budget revision changed"));
    await expect(prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage)).rejects.toThrow("revision changed");
    expect(c.plan.persist).not.toHaveBeenCalled();
  });
  it("checks file scope again after an awaited budget acknowledgment", async () => {
    const c = controls(); c.budget.needsSave = true; c.plan.dirty = true;
    let active = true; c.budget.persist = vi.fn(async () => { active = false; return c.receipt; });
    await expect(prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage, () => { if (!active) throw new Error("File changed"); })).rejects.toThrow("File changed");
    expect(c.plan.persist).not.toHaveBeenCalled();
  });
  it("rejects another file's controls", async () => {
    const c = controls(); c.plan.profileId = "other";
    await expect(prepareMarketplaceFinancing(profileId, c.budget, c.plan, c.stage)).rejects.toThrow("loading");
    expect(c.plan.persist).not.toHaveBeenCalled();
  });
});

describe("listing copy and duplicate recovery", () => {
  it("retains another editor's newer same-file cost draft after an older save acknowledges", () => {
    const value = { expected_revision: 1, note: "Submitted cost review", rows: [] } as unknown as DealBudgetWrite;
    const fingerprint = marketplaceBudgetDraftFingerprint(value);
    expect(hasNewerMarketplaceBudgetDraft(profileId, fingerprint, { profileId, value: { ...value, note: "Newer unsaved cost review" }, removed: [] })).toBe(true);
    expect(hasNewerMarketplaceBudgetDraft(profileId, fingerprint, { profileId, value: structuredClone(value), removed: [{ id: "newly-removed-cost" } as DealCostRow] })).toBe(true);
  });
  it("allows an acknowledged unchanged cost draft to clear without affecting a different file", () => {
    const value = { expected_revision: 1, note: "Reviewed costs", rows: [] } as unknown as DealBudgetWrite;
    const fingerprint = marketplaceBudgetDraftFingerprint(value);
    expect(hasNewerMarketplaceBudgetDraft(profileId, fingerprint, { profileId, value: structuredClone(value), removed: [] })).toBe(false);
    expect(hasNewerMarketplaceBudgetDraft(profileId, fingerprint, { profileId: "other", value: { ...value, note: "Other file" }, removed: [] })).toBe(false);
    expect(hasNewerMarketplaceBudgetDraft(profileId, fingerprint, null)).toBe(false);
  });
  it("keeps explicit manual copy and an intentionally cleared summary", () => {
    expect(explicitMarketplaceCopy({ name: " Reviewed title ", summary: "" }, { title: true, summary: true })).toEqual({ name: "Reviewed title", summary: "" });
    expect(explicitMarketplaceCopy({ name: "", summary: "" }, { title: false, summary: false })).toEqual({});
  });
  it("recognizes only the server's scoped existing-listing conflict", () => {
    expect(existingMarketplaceListingId({ body: { detail: { code: "listing_exists", listing_id: "existing" } } })).toBe("existing");
    expect(existingMarketplaceListingId({ body: { detail: { code: "stale_source", listing_id: "other" } } })).toBeNull();
  });
});
