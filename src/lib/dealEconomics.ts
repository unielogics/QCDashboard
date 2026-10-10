export type DealEconomicsDraftValues = {
  acceptedAmount: string;
  originationFeePoints: string;
  consultingFee: string;
};

export type ParsedDealEconomics = {
  acceptedAmount: number | null;
  originationFeePoints: number | null;
  consultingFee: number | null;
  acceptedAmountValid: boolean;
  originationFeePointsValid: boolean;
  consultingFeeValid: boolean;
  valid: boolean;
  earnings: number | null;
};

function parseOptionalNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Expected QC earnings use the amount the client accepted, never a requested
 * or approved fallback. A fixed consulting fee can stand on its own.
 */
export function calculateDealEarnings(
  acceptedAmount: number | null | undefined,
  originationFeePoints: number | null | undefined,
  consultingFee: number | null | undefined,
): number | null {
  const hasPercentageEarnings = acceptedAmount != null && originationFeePoints != null;
  if (!hasPercentageEarnings && consultingFee == null) return null;
  const percentageEarnings = hasPercentageEarnings
    ? Number(acceptedAmount) * Number(originationFeePoints) / 100
    : 0;
  return percentageEarnings + Number(consultingFee ?? 0);
}

export function parseDealEconomicsDraft(
  values: DealEconomicsDraftValues,
  options: { maxOriginationFeePoints?: number | null } = {},
): ParsedDealEconomics {
  const acceptedAmount = parseOptionalNumber(values.acceptedAmount);
  const originationFeePoints = parseOptionalNumber(values.originationFeePoints);
  const consultingFee = parseOptionalNumber(values.consultingFee);
  const acceptedAmountValid = values.acceptedAmount.trim() === "" || (acceptedAmount != null && acceptedAmount >= 0);
  const maxOriginationFeePoints = options.maxOriginationFeePoints ?? 100;
  const originationFeePointsValid = values.originationFeePoints.trim() === ""
    || (originationFeePoints != null && originationFeePoints >= 0 && originationFeePoints <= maxOriginationFeePoints);
  const consultingFeeValid = values.consultingFee.trim() === "" || (consultingFee != null && consultingFee >= 0);
  return {
    acceptedAmount,
    originationFeePoints,
    consultingFee,
    acceptedAmountValid,
    originationFeePointsValid,
    consultingFeeValid,
    valid: acceptedAmountValid && originationFeePointsValid && consultingFeeValid,
    earnings: calculateDealEarnings(acceptedAmount, originationFeePoints, consultingFee),
  };
}
