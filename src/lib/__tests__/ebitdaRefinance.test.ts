import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/ebitdaRefinance.json";
import { evaluateRefinanceEbitda, roundEbitdaMoney, type RefinanceEbitda } from "../ebitdaRefinance";
import type { FinancialCockpit, FinancialPlanWrite } from "../financialCockpit";

describe("refinance EBITDA server/local preview parity", () => {
  for (const [name, fixture] of Object.entries(fixtures)) it(`matches actual backend projection: ${name}`, () => {
    const cockpit = { plan: { evaluation: { ebitda: fixture.projection } }, debt: { service: { monthly: fixture.service } } } as unknown as FinancialCockpit;
    const result = evaluateRefinanceEbitda(cockpit, fixture.plan as FinancialPlanWrite, fixture.context);
    expect(result).toEqual(fixture.projection);
    expect(result?.before).toBe(result?.after);
    expect(result?.annual_before).toBe(result?.annual_after);
  });
  it("does not compound saved scenario addbacks or silently convert a DSCR override into EBITDA", () => {
    const fixture = fixtures.operating;
    const cockpit = { plan: { evaluation: { ebitda: fixture.projection } }, debt: { service: { monthly: fixture.service } } } as unknown as FinancialCockpit;
    const plan = { ...fixture.plan, add_backs: [], overrides: { income_annual: 999999 } } as unknown as FinancialPlanWrite;
    const result = evaluateRefinanceEbitda(cockpit, plan, fixture.context);
    expect(result?.adjusted_annual.after).toBe(52000);
    expect(result?.annual_after).toBe(52000);
    expect(fixture.projection.adjusted_annual.after).toBe(70000);
  });
  it("never invents annual eligibility from a foreign or unsupported source", () => {
    for (const fixture of [fixtures.foreign, fixtures.short, fixtures.conflict, fixtures["tax-only"]]) expect((fixture.projection as RefinanceEbitda).adjusted_annual.before).toBeNull();
  });
  it("matches server monetary rounding at binary ties", () => {
    expect(roundEbitdaMoney(2.625)).toBe(2.62);
    expect(roundEbitdaMoney(2.675)).toBe(2.67);
    expect(roundEbitdaMoney(-2.625)).toBe(-2.62);
    expect(roundEbitdaMoney(0)).toBe(0);
  });
  it("preserves negative source EBITDA and separates identified operating hypotheses", () => {
    const fixture = fixtures.baseline;
    const baseline = structuredClone(fixture.projection) as RefinanceEbitda;
    Object.assign(baseline, { before: -6000, after: -6000, annual_before: -12000, annual_after: -12000 });
    baseline.adjusted_annual.before = -12000;
    const cockpit = { plan: { evaluation: { ebitda: baseline } }, debt: { service: { monthly: 5000 } } } as unknown as FinancialCockpit;
    const plan = { ...fixture.plan, add_backs: [{ id: "owner", kind: "owner_salary", label: "Owner adjustment", amount_monthly: 800, source: "Reviewed P&L", note: "Hypothetical operating adjustment" }], overrides: { income_annual: 999999 } } as unknown as FinancialPlanWrite;
    const result = evaluateRefinanceEbitda(cockpit, plan, { serviceAfter: 2000, netBefore: null, netAfter: null, retiredCount: 1, newPayment: 1000 })!;
    expect(result.before).toBe(-6000);
    expect(result.after).toBe(-6000);
    expect(result.annual_after).toBe(-12000);
    expect(result.adjusted_annual.after).toBe(-2400);
    expect(result.debt_service_savings_monthly).toBe(3000);
    expect(baseline.adjusted_annual.before).toBe(-12000);
  });
});
