import { describe, expect, it } from "vitest";
import { evaluatePlanLocally } from "../cockpitSimulation";
import type { FinancialCockpit, FinancialPlanWrite, PlanAddBack } from "../financialCockpit";
import fixtures from "./fixtures/ebitdaRefinance.json";

const plan = { retire: [], exclude: [], add_backs: [], overrides: null, new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null, note: null } as FinancialPlanWrite;
function cockpit(monthly: number | null = 1000): FinancialCockpit {
  return {
    debt: { obligations: [], service: { monthly } }, bank: { recurring: { payees: [], months_read: [] } },
    dscr: { headline: { key: "profit_and_loss", numerator: 52000, value: monthly == null ? null : 4.33 }, candidates: ["tax_return", "profit_and_loss", "bank_cash_flow"].map((key) => ({ key, numerator: 52000, label: key, value: monthly == null ? null : 4.33 })) },
    plan: { evaluation: { ebitda: fixtures.baseline.projection } },
  } as unknown as FinancialCockpit;
}
const adjustment = (kind: PlanAddBack["kind"], amount = 1000): PlanAddBack => ({ id: kind, kind, label: kind, amount_monthly: amount, source: "desk", note: "Reviewed operating assumption" });

describe("financial plan earnings and missing debt service", () => {
  it.each(["interest_refinanced", "depreciation"] as const)("does not add %s twice on any earnings basis and preserves the record", (kind) => {
    const row = adjustment(kind);
    const input = { ...plan, add_backs: [row] };
    const result = evaluatePlanLocally(cockpit(), input, []);
    expect(result.candidates.map((candidate) => candidate.numerator_after)).toEqual([52000, 52000, 52000]);
    expect(result.candidates.map((candidate) => candidate.value_after)).toEqual([4.33, 4.33, 4.33]);
    expect(result.addBacksMonthly).toBe(0);
    expect(result.excludedAddBacks).toEqual([{ ...row, reason: expect.stringMatching(/double count/) }]);
    expect(input.add_backs).toEqual([row]);
    expect(row).not.toHaveProperty("reason");
  });

  it("preserves identified operating adjustments while excluding previously saved interest and D&A", () => {
    const add_backs = [adjustment("owner_salary", 500), adjustment("one_time_expense", 200), adjustment("rent_to_owner", 100), adjustment("other", 50), adjustment("interest_refinanced"), adjustment("depreciation")];
    const result = evaluatePlanLocally(cockpit(), { ...plan, add_backs }, []);
    expect(result.addBacksMonthly).toBe(850);
    expect(result.candidates.map((candidate) => candidate.numerator_after)).toEqual([62200, 62200, 62200]);
    expect(result.excludedAddBacks).toHaveLength(2);
  });

  it.each([null, 1000])("keeps unknown existing service unknown with proposed monthly payment %s", (new_payment_monthly) => {
    const result = evaluatePlanLocally(cockpit(null), { ...plan, new_payment_monthly, new_payment_source: "manual" }, []);
    expect(result.serviceBefore).toBeNull();
    expect(result.serviceBeforeNewPayment).toBeNull();
    expect(result.serviceAfter).toBeNull();
    expect(result.serviceAfterAnnual).toBeNull();
    expect(result.headlineAfter).toBeNull();
    expect(result.noDebtLeft).toBe(false);
    expect(result.candidates.every((candidate) => candidate.value_after == null && !candidate.no_debt_left && candidate.status_after === "unavailable")).toBe(true);
    expect(result.coverageUnavailableReason).toMatch(/debt service is unknown/);
    expect(result.newPayment).toBe(new_payment_monthly);
    expect(result.ebitda?.debt_service_savings_monthly).toBeNull();
  });

  it("does not infer known debt service from an income override or retiring a known row", () => {
    const source = cockpit(null);
    source.debt.obligations = [{ id: "loan", monthly: 300, payoff: 10000, in_debt_service: true }] as FinancialCockpit["debt"]["obligations"];
    const result = evaluatePlanLocally(source, { ...plan, retire: ["loan"], overrides: { income_annual: 90000, income_note: "Reviewed income", debt_service_monthly: null, debt_service_note: null } }, []);
    expect(result.retiredMonthly).toBe(300);
    expect(result.incomeAfter).toBe(90000);
    expect(result.headlineAfter).toBeNull();
    expect(result.noDebtLeft).toBe(false);
  });

  it("allows an explicitly established zero burden and an explicit zero override", () => {
    const proposed = { ...plan, new_payment_monthly: 1000, new_payment_source: "manual" as const };
    for (const [source, input] of [
      [cockpit(0), proposed],
      [cockpit(null), { ...proposed, overrides: { income_annual: null, income_note: null, debt_service_monthly: 0, debt_service_note: "Full payoff reviewed" } }],
    ] as const) {
      const result = evaluatePlanLocally(source, input, []);
      expect(result.serviceBefore).toBe(0);
      expect(result.serviceAfterAnnual).toBe(12000);
      expect(result.headlineAfter).toBe(4.33);
      expect(result.coverageUnavailableReason).toBeNull();
    }
    expect(evaluatePlanLocally(cockpit(0), plan, []).noDebtLeft).toBe(true);
  });

  it("keeps a finite reviewed override and the twelve-month debt convention", () => {
    const result = evaluatePlanLocally(cockpit(null), { ...plan, new_payment_monthly: 500, overrides: { income_annual: null, income_note: null, debt_service_monthly: 2000, debt_service_note: "Reviewed current debt" } }, []);
    expect(result.serviceBefore).toBe(2000);
    expect(result.serviceAfter).toBe(2500);
    expect(result.serviceAfterAnnual).toBe(30000);
    expect(result.headlineAfter).toBe(1.73);
  });
});
