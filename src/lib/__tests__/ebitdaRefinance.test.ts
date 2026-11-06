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
});
