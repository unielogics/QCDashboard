import { roundEbitdaMoney } from "./ebitdaRefinance";
import type { FinancialCockpit } from "./financialCockpit";

export type CoverageInputs = { incomeAnnual: number | null | undefined; debtServiceAnnual: number | null | undefined };
const finite = (value: number | null | undefined) => value != null && Number.isFinite(value) ? value : null;

/** Keep the signed ratio; compare funding needs separately when earnings are a loss. */
export function coverageReview(before: CoverageInputs, after: CoverageInputs, comparable: boolean | { before: boolean; after: boolean } = true) {
  const comparableBefore = typeof comparable === "boolean" ? comparable : comparable.before;
  const comparableAfter = typeof comparable === "boolean" ? comparable : comparable.after;
  const snapshot = (inputs: CoverageInputs, commonBasis: boolean) => {
    const income = finite(inputs.incomeAnnual);
    const debt = finite(inputs.debtServiceAnnual);
    const service = debt != null && debt >= 0 ? debt : null;
    const surplus = commonBasis && income != null && service != null ? roundEbitdaMoney(income - service) : null;
    return { incomeAnnual: income, debtServiceAnnual: service,
      dscr: income != null && service != null && service > 0 ? roundEbitdaMoney(income / service) : null,
      cashSurplusAnnual: surplus, cashShortfallAnnual: surplus == null ? null : Math.max(0, -surplus) };
  };
  const current = snapshot(before, comparableBefore), planned = snapshot(after, comparableAfter);
  const delta = (left: number | null, right: number | null) => left == null || right == null ? null : roundEbitdaMoney(right - left);
  const cashSurplusChangeAnnual = delta(current.cashSurplusAnnual, planned.cashSurplusAnnual);
  const debtServiceSavingsAnnual = current.debtServiceAnnual == null || planned.debtServiceAnnual == null ? null : roundEbitdaMoney(current.debtServiceAnnual - planned.debtServiceAnnual);
  const hasNonpositiveEarnings = current.incomeAnnual != null && current.incomeAnnual <= 0 || planned.incomeAnnual != null && planned.incomeAnnual <= 0;
  const ratioDeltaDirectionMeaningful = comparableBefore && comparableAfter && !hasNonpositiveEarnings && current.dscr != null && planned.dscr != null;
  return { before: current, after: planned, hasNonpositiveEarnings, ratioDeltaDirectionMeaningful, cashSurplusChangeAnnual, debtServiceSavingsAnnual,
    shortfallReductionAnnual: current.cashShortfallAnnual == null || planned.cashShortfallAnnual == null ? null : roundEbitdaMoney(current.cashShortfallAnnual - planned.cashShortfallAnnual),
    effect: cashSurplusChangeAnnual == null ? "unavailable" as const : cashSurplusChangeAnnual > 0 ? "cash_relief" as const : cashSurplusChangeAnnual < 0 ? "cash_worsens" as const : "unchanged" as const,
    note: !comparableBefore || !comparableAfter ? "Confirm a common currency and reporting basis before comparing earnings with debt service. No currency conversion is assumed."
      : hasNonpositiveEarnings ? current.incomeAnnual != null && current.incomeAnnual < 0 || planned.incomeAnnual != null && planned.incomeAnnual < 0
        ? "DSCR is annual earnings divided by annual debt service. With negative earnings, lower payments can make the signed ratio more negative. Compare the coverage shortfall and payment savings; refinancing alone does not change EBITDA."
        : "DSCR is annual earnings divided by annual debt service. With zero earnings, reducing payments leaves the ratio at zero while debt service remains. Compare the coverage shortfall and payment savings; refinancing alone does not change EBITDA."
        : null };
}

/** A source ratio may be shown provisionally; a dollar funding gap needs confirmed USD inputs. */
export function coverageCurrencyComparable(cockpit: FinancialCockpit, incomeOverride = false): boolean {
  if (incomeOverride) return true;
  const candidate = cockpit.dscr.headline ?? cockpit.dscr.candidates?.find((row) => row.numerator != null && Number.isFinite(row.numerator));
  const key = candidate?.key;
  const calculation = cockpit.metric_review?.calculations.find((row) => row.key === `dscr.${key}`);
  return calculation ? calculation.currency_comparable === true : candidate?.currency_comparable === true;
}
