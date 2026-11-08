import { describe, expect, it } from "vitest";
import { previewMetricComposition, roundCompositionMoney } from "../metricCompositionPreview";
import type { MetricRecipe } from "../financialMetrics";
const recipe = { source_stamp: "a", revision: 0, kind: "dscr", can_edit: true, annualization_factor: 1, required_anchor: "income", denominator: { input_key: "debt", label: "Debt", value: 12000, editable: false }, components: [{ input_key: "income", label: "Income", value: -24000, contribution: -24000, included: true, required: true }, { input_key: "interest", label: "Interest", value: 1200, included: true }], adjustments: [], base_value: -1.9, reviewed_value: -1.9 } as MetricRecipe;
const choices = [{ input_key: "income", included: true }, { input_key: "interest", included: true }];
describe("reviewed component preview matches saved arithmetic", () => {
  it("keeps signed losses and applies period adjustments before annualization", () => {
    expect(previewMetricComposition(recipe, choices, [{ id: "a", label: "Operating adjustment", amount: -1200 }])).toMatchObject({ value: -2, numerator: -24000, valid: true });
  });
  it("quantizes each adjustment before summing, like the API", () => {
    const zero = { ...recipe, kind: "earnings" as const, denominator: null, components: [{ ...recipe.components[0], value: 0, contribution: 0 }] };
    expect(previewMetricComposition(zero, choices.slice(0, 1), [{ id: "a", label: "A", amount: 0.005 }, { id: "b", label: "B", amount: 0.005 }]).value).toBe(0);
    expect(roundCompositionMoney(2.675)).toBe(2.68);
    expect(roundCompositionMoney(-2.625)).toBe(-2.62);
  });
  it("requires every component exactly once and protects the income anchor", () => {
    expect(previewMetricComposition(recipe, [{ input_key: "income", included: false }, choices[1]], []).valid).toBe(false);
    expect(previewMetricComposition(recipe, choices.slice(0, 1), []).valid).toBe(false);
    expect(previewMetricComposition(recipe, [choices[0], choices[0]], []).valid).toBe(false);
  });
  it("rejects selected unknown values and missing annualization", () => {
    expect(previewMetricComposition({ ...recipe, components: [{ ...recipe.components[0], contribution: null }, recipe.components[1]] }, choices, []).value).toBeNull();
    expect(previewMetricComposition({ ...recipe, annualization_factor: null }, choices, []).valid).toBe(false);
  });
  it("sums source decimals exactly before cent rounding and annualization", () => {
    const components = [-51.942, 321.181, 924.319, 530.66, -764.783].map((value, i) => ({ input_key: String(i), label: String(i), value, included: true }));
    const adjusted = previewMetricComposition({ ...recipe, required_anchor: "0", components, annualization_factor: 2 }, components.map((row) => ({ input_key: row.input_key, included: true })), [-0.311, 85.126, -95.358].map((amount, i) => ({ id: String(i), label: String(i), amount })));
    expect(adjusted.subtotal).toBe(948.90);
    expect(adjusted.numerator).toBe(1897.80);
  });
});
