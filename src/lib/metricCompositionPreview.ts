import type { MetricCompositionAdjustment, MetricRecipe } from "./financialMetrics";
import { roundEbitdaMoney } from "./ebitdaRefinance";

type Decimal = { digits: bigint; power: number };
function decimal(value: number): Decimal {
  const [mantissa, exp = "0"] = Math.abs(value).toString().toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return { digits: BigInt(whole + fraction) * (value < 0 ? -1n : 1n), power: Number(exp) - fraction.length };
}
function add(values: Decimal[]): Decimal {
  const power = Math.min(0, ...values.map((value) => value.power));
  return { digits: values.reduce((sum, value) => sum + value.digits * 10n ** BigInt(value.power - power), 0n), power };
}
function cents(value: Decimal): Decimal {
  const power = value.power + 2, sign = value.digits < 0 ? -1n : 1n, digits = value.digits * sign;
  if (power >= 0) return { digits: value.digits * 10n ** BigInt(power), power: -2 };
  const divisor = 10n ** BigInt(-power), quotient = digits / divisor, remainder = digits % divisor;
  const rounded = quotient + (remainder * 2n > divisor || remainder * 2n === divisor && quotient % 2n !== 0n ? 1n : 0n);
  return { digits: rounded * sign, power: -2 };
}
/** Decimal(str(number)).quantize(.01, HALF_EVEN), matching the review service. */
export function roundCompositionMoney(value: number): number {
  return Number.isFinite(value) ? Number(cents(decimal(value)).digits) / 100 : value;
}

export function previewMetricComposition(recipe: MetricRecipe, components: Array<{ input_key: string; included: boolean }>, adjustments: MetricCompositionAdjustment[]) {
  const selected = new Map(components.map((row) => [row.input_key, row.included]));
  const missingInputs: string[] = [];
  const sourceValues: Decimal[] = [], adjustmentValues: Decimal[] = [];
  let error: string | null = selected.size !== components.length || components.length !== recipe.components.length || components.some((row) => !recipe.components.some((input) => input.input_key === row.input_key)) ? "Review every calculation component exactly once." : null;
  const included = components.filter((row) => row.included).map((row) => row.input_key);
  const reported = "profit_and_loss.reported_ebitda";
  if (included.includes(reported) && included.length !== 1) error = "Choose reported EBITDA or the net-income reconciliation, not both.";
  if (!included.length || recipe.required_anchor && !included.includes(reported) && !included.includes(recipe.required_anchor)) error = "The source income anchor is required; correct that source input instead of removing the loss.";
  for (const input of recipe.components) {
    if (!(selected.get(input.input_key) ?? input.included) || input.role === "denominator" || input.role === "annualization") continue;
    const value = input.contribution !== undefined ? input.contribution : input.value == null ? null : input.value * (input.coefficient ?? 1);
    if (value == null || !Number.isFinite(value)) missingInputs.push(input.input_key);
    else sourceValues.push(decimal(value));
  }
  const ids = new Set<string>();
  for (const adjustment of adjustments) {
    if (!adjustment.id || ids.has(adjustment.id) || !adjustment.label.trim() || !Number.isFinite(adjustment.amount)) error = "Each adjustment needs a unique identity, a description and a finite signed amount.";
    ids.add(adjustment.id);
    if (Number.isFinite(adjustment.amount)) adjustmentValues.push(cents(decimal(adjustment.amount)));
  }
  const factor = recipe.annualization_factor;
  if (factor == null || !Number.isFinite(factor) || factor <= 0) error = "The reporting-period annualization factor is not established.";
  if (missingInputs.length) error = "An included source component is unknown; review it before saving.";
  const subtotalDecimal = error ? null : cents(add([...sourceValues, ...adjustmentValues]));
  const periodSubtotal = subtotalDecimal == null ? null : Number(subtotalDecimal.digits) / 100;
  const factorDecimal = factor != null && Number.isFinite(factor) ? decimal(factor) : null;
  const numerator = subtotalDecimal == null || factorDecimal == null ? null : Number(cents({ digits: subtotalDecimal.digits * factorDecimal.digits, power: subtotalDecimal.power + factorDecimal.power }).digits) / 100;
  const denominator = recipe.denominator?.value;
  const value = recipe.kind === "dscr" || recipe.denominator ? numerator == null || denominator == null || !Number.isFinite(denominator) || denominator <= 0 ? null : roundEbitdaMoney(numerator / denominator) : numerator;
  return { value, numerator, subtotal: periodSubtotal, valid: !error, error, missingInputs };
}
