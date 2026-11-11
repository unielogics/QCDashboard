import { describe, expect, it } from "vitest";
import { dealBudgetChanged, dealBudgetWrite, newDealCost, type DealBudget } from "../dealBudget";
import { COMPANY_FEE_CATEGORIES, investorAmount, investorFeeStatus, investorMoney, newCompanyFee } from "../investorEconomics";

const budget = (): DealBudget => ({ profile_id: "profile-a", revision: 7, can_edit: true, funding_mode: "single_investor", costs_confirmed: true, investor_funding_amount: 100000, minimum_investor_contribution: null, currency: "USD", rows: [{ ...newDealCost(), id: "existing", label: "Existing cost", value: 0 }], calculation: {}, servicing_mode: "transferred", software_monitoring: { software_status: "in_progress", monitoring_status: "configured", provider: "Recorded provider", notes: "Staff setup record" }, payoff_terms: { interest_policy: "minimum_months", minimum_interest_months: 9, charge_amount: 0, charge_recipient: "company", reserve_release: "at_payoff" } });

describe("investor fee presentation and budget retention", () => {
  it("preserves all servicing, setup and explicit zero payoff terms through an unrelated cost edit", () => {
    const saved = budget();
    const write = dealBudgetWrite(saved);
    expect(write).toMatchObject({ expected_revision: 7, servicing_mode: "transferred", software_monitoring: saved.software_monitoring, payoff_terms: saved.payoff_terms, rows: [{ value: 0 }] });
    expect(dealBudgetChanged(write, saved)).toBe(false);
    write.rows[0].label = "Edited cost label";
    expect(saved.rows[0].label).toBe("Existing cost");
    expect(write.payoff_terms?.charge_amount).toBe(0);
    expect(dealBudgetChanged(write, saved)).toBe(true);
  });

  it("keeps legacy missing setup and payoff terms unconfirmed without inventing rates or provisioning", () => {
    const saved = budget(); delete saved.servicing_mode; delete saved.software_monitoring; delete saved.payoff_terms;
    const write = dealBudgetWrite(saved);
    expect(write).toMatchObject({ servicing_mode: "not_set", software_monitoring: { software_status: "not_set", monitoring_status: "not_set", provider: null }, payoff_terms: { interest_policy: "unknown", charge_amount: null, reserve_release: "unknown" } });
    expect(dealBudgetChanged(write, saved)).toBe(false);
  });

  it("includes a changed servicing arrangement or payoff assumption in dirty detection", () => {
    const saved = budget(), write = dealBudgetWrite(saved);
    expect(dealBudgetChanged({ ...write, servicing_mode: "company_managed" }, saved)).toBe(true);
    expect(dealBudgetChanged({ ...write, payoff_terms: { ...write.payoff_terms!, charge_amount: 25 } }, saved)).toBe(true);
    expect(dealBudgetChanged({ ...write, software_monitoring: { ...write.software_monitoring!, monitoring_status: "planned" } }, saved)).toBe(true);
  });

  it("requires staff to price every newly added company fee", () => {
    for (const category of COMPANY_FEE_CATEGORIES) {
      const row = newCompanyFee(category);
      expect(row).toMatchObject({ category, value: null, enabled: true, payer: "investor", timing: "monthly", applicability: "all", origin: "manual" });
      expect(row.id).not.toBe(newCompanyFee(category).id);
    }
  });

  it("distinguishes excluded conditional fees from unknown applicability and pending calculations", () => {
    const row = newCompanyFee("servicing");
    expect(investorFeeStatus(row, { id: row.id, applies: false, total_amount: 0 })).toBe("Not charged for this servicing arrangement");
    expect(investorFeeStatus(row, { id: row.id, applies: null, total_amount: null })).toBe("Servicing arrangement needs confirmation");
    expect(investorFeeStatus(row, { id: row.id, applies: true, total_amount: 0 })).toBeNull();
    expect(investorFeeStatus(row, { id: row.id, total_amount: 999 }, true)).toBe("Calculating…");
    expect(investorFeeStatus({ ...row, enabled: false }, { id: row.id, applies: true })).toBe("Excluded by staff");
  });

  it("preserves known zero and losses while leaving unknown returns unknown and currency explicit", () => {
    expect(investorAmount(null)).toBeNull(); expect(investorAmount(" ")).toBeNull(); expect(investorAmount(Infinity)).toBeNull();
    expect(investorAmount("0.00")).toBe(0); expect(investorAmount(-15.25)).toBe(-15.25);
    expect(investorMoney(null)).toBe("Not established");
    expect(investorMoney(0)).toMatch(/USD\s+0\.00/);
    expect(investorMoney(1000, null)).toBe("1,000.00 · currency not confirmed");
    expect(investorMoney(-15.25, "EUR")).toContain("15.25"); expect(investorMoney(-15.25, "EUR")).toContain("EUR");
  });
});
