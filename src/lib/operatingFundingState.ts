import type { OperatingCashBridge } from "./operatingGoal";
import type { ReleasedCashFlowEvaluation } from "./operatingPlan";

/** Field selection only: enhanced plan-funding authority supersedes legacy loan-only observations. */
export function operatingFundingState(bridge?: OperatingCashBridge | null, source?: ReleasedCashFlowEvaluation | null) {
  return {
    enhanced: bridge?.funding_available !== undefined,
    available: bridge?.funding_available !== undefined ? bridge.funding_available : bridge?.available ?? source?.available ?? false,
    required: bridge?.funding_required !== undefined ? bridge.funding_required : bridge?.required ?? source?.required ?? false,
    complete: bridge?.funding_complete !== undefined ? bridge.funding_complete : bridge?.complete ?? source?.complete ?? false,
    stale: bridge?.funding_stale !== undefined ? bridge.funding_stale : bridge?.stale ?? source?.status === "stale",
    fingerprint: bridge?.funding_source_fingerprint !== undefined ? bridge.funding_source_fingerprint : bridge ? bridge.source_fingerprint : source?.source_fingerprint,
    currency: bridge?.funding_currency !== undefined ? bridge.funding_currency : bridge ? bridge.currency : source?.currency,
    capacity: bridge?.funding_capacity_monthly !== undefined ? bridge.funding_capacity_monthly : bridge ? bridge.recurring_cash_released_monthly : source?.amount_monthly,
    unallocated: bridge?.funding_unallocated_monthly !== undefined ? bridge.funding_unallocated_monthly : bridge ? bridge.unallocated_monthly : source?.unallocated_monthly,
    missing: bridge?.funding_missing !== undefined ? bridge.funding_missing : bridge?.missing ?? source?.missing ?? [],
  };
}
