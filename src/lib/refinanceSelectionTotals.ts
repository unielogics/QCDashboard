import type { LocalPlanEvaluation } from "./cockpitSimulation";
import type { Obligation } from "./financialCockpit";

type Evaluation = Pick<LocalPlanEvaluation, "retiredMonthly" | "payoffTotal" | "payoffUnknown" | "newPayment"
  | "serviceBefore" | "serviceAfter" | "serviceBeforeNewPayment"> & Partial<Pick<LocalPlanEvaluation,
    "newRegularPayment" | "newInterestOnlyPayment" | "serviceAfterRegular" | "serviceAfterInterestOnly">>;

export type RefinanceSelectionTotals = {
  selectedCount: number;
  payoffTotal: number | null;
  payoffUnknown: number;
  monthlyRemoved: number | null;
  monthlyUnknown: number;
  monthlyAdded: number | null;
  monthlyAddedIo: number | null;
  monthlyAfterIo: number | null;
  netMonthlyIo: number | null;
  stressMonthlyAdded: number | null;
  stressMonthlyAfter: number | null;
  stressNetMonthly: number | null;
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
  const phased = "newRegularPayment" in evaluation;
  const monthlyAdded = phased ? evaluation.newRegularPayment ?? null : evaluation.newPayment;
  const monthlyAddedIo = evaluation.newInterestOnlyPayment ?? null;
  const selectionKnown = !needsReview && monthlyUnknown === 0;
  const before = evaluation.serviceBefore, after = phased ? evaluation.serviceAfterRegular : evaluation.serviceAfter;
  const evaluatedChange = before != null && after != null && Number.isFinite(before) && Number.isFinite(after)
    ? round2(after - before) : null;
  const remainingKnown = selectionKnown && options.debtServiceKnown && before != null && Number.isFinite(before)
    && evaluation.serviceBeforeNewPayment != null && Number.isFinite(evaluation.serviceBeforeNewPayment);
  const afterKnown = remainingKnown && monthlyAdded != null && Number.isFinite(monthlyAdded) && evaluatedChange != null;
  const netMonthly = afterKnown ? evaluatedChange : null;
  const basisAdjusted = afterKnown && monthlyAdded != null && round2(monthlyAdded - evaluation.retiredMonthly) !== evaluatedChange;
  const ioAfter = evaluation.serviceAfterInterestOnly;
  const ioKnown = remainingKnown && monthlyAddedIo != null && Number.isFinite(monthlyAddedIo) && ioAfter != null && Number.isFinite(ioAfter);
  const stressAfter = evaluation.serviceAfter;
  const stressKnown = remainingKnown && evaluation.newPayment != null && Number.isFinite(evaluation.newPayment) && stressAfter != null && Number.isFinite(stressAfter);

  return {
    selectedCount: selected.length,
    payoffTotal: needsReview ? null : selected.length ? evaluation.payoffTotal : 0,
    payoffUnknown: selected.length ? evaluation.payoffUnknown : 0,
    monthlyRemoved: needsReview || (inService.length > 0 && monthlyUnknown === inService.length)
      ? null : selected.length ? evaluation.retiredMonthly : 0,
    monthlyUnknown,
    monthlyAdded,
    monthlyAddedIo,
    monthlyAfterIo: ioKnown ? ioAfter : null,
    netMonthlyIo: ioKnown ? round2(ioAfter - before!) : null,
    stressMonthlyAdded: evaluation.newPayment,
    stressMonthlyAfter: stressKnown ? stressAfter : null,
    stressNetMonthly: stressKnown ? round2(stressAfter - before!) : null,
    netMonthly,
    monthlyAfter: afterKnown ? after! : null,
    remainingMonthly: remainingKnown ? evaluation.serviceBeforeNewPayment : null,
    basisAdjusted,
    needsReview,
  };
}
