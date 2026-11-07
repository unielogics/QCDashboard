import type { LocalPlanEvaluation } from "./cockpitSimulation";
import type { Obligation } from "./financialCockpit";

type Evaluation = Pick<LocalPlanEvaluation, "retiredMonthly" | "payoffTotal" | "payoffUnknown" | "newPayment"
  | "serviceBefore" | "serviceAfter" | "serviceBeforeNewPayment">;

export type RefinanceSelectionTotals = {
  selectedCount: number;
  payoffTotal: number | null;
  payoffUnknown: number;
  monthlyRemoved: number | null;
  monthlyUnknown: number;
  monthlyAdded: number | null;
  netMonthly: number | null;
  monthlyAfter: number | null;
  remainingMonthly: number | null;
  basisAdjusted: boolean;
  needsReview: boolean;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Presentation of the existing plan evaluation; never a second coverage model. */
export function refinanceSelectionTotals(
  obligations: Obligation[], retire: string[], evaluation: Evaluation,
  options: { unresolvedSelections: boolean; debtServiceKnown: boolean },
): RefinanceSelectionTotals {
  const requested = new Set(retire);
  const shown = new Map(obligations.filter((row) => row.kind !== "payee").map((row) => [row.id, row]));
  const selected = [...shown.values()].filter((row) => requested.has(row.id));
  const needsReview = options.unresolvedSelections || [...requested].some((id) => !shown.has(id));
  const inService = selected.filter((row) => row.in_debt_service);
  const monthlyUnknown = inService.filter((row) => row.monthly == null || !Number.isFinite(row.monthly)).length;
  const monthlyAdded = evaluation.newPayment;
  const selectionKnown = !needsReview && monthlyUnknown === 0;
  const remainingKnown = selectionKnown && options.debtServiceKnown;
  const afterKnown = remainingKnown && monthlyAdded != null;
  const netMonthly = afterKnown ? round2(evaluation.serviceAfter - evaluation.serviceBefore) : null;
  const evaluatedChange = round2(evaluation.serviceAfter - evaluation.serviceBefore);
  const basisAdjusted = monthlyAdded != null && round2(monthlyAdded - evaluation.retiredMonthly) !== evaluatedChange;

  return {
    selectedCount: selected.length,
    payoffTotal: needsReview ? null : selected.length ? evaluation.payoffTotal : 0,
    payoffUnknown: selected.length ? evaluation.payoffUnknown : 0,
    monthlyRemoved: needsReview || (inService.length > 0 && monthlyUnknown === inService.length)
      ? null : selected.length ? evaluation.retiredMonthly : 0,
    monthlyUnknown,
    monthlyAdded,
    netMonthly,
    monthlyAfter: afterKnown ? evaluation.serviceAfter : null,
    remainingMonthly: remainingKnown ? evaluation.serviceBeforeNewPayment : null,
    basisAdjusted,
    needsReview,
  };
}
