"use client";

import { CellChip, Field } from "@/components/ds";
import { parseDealEconomicsDraft } from "@/lib/dealEconomics";
import { formatUnifiedAmount } from "@/lib/unifiedOperator";

export type DealEconomicsFieldsProps = {
  approvedAmount: number | null | undefined;
  acceptedAmount: string;
  originationFeePoints: string;
  consultingFee: string;
  estimatedCloseDate: string;
  onAcceptedAmountChange: (value: string) => void;
  onOriginationFeePointsChange: (value: string) => void;
  onConsultingFeeChange: (value: string) => void;
  onEstimatedCloseDateChange: (value: string) => void;
  autoFocus?: boolean;
};

export function DealEconomicsFields({
  approvedAmount,
  acceptedAmount,
  originationFeePoints,
  consultingFee,
  estimatedCloseDate,
  onAcceptedAmountChange,
  onOriginationFeePointsChange,
  onConsultingFeeChange,
  onEstimatedCloseDateChange,
  autoFocus = false,
}: DealEconomicsFieldsProps) {
  const parsed = parseDealEconomicsDraft({ acceptedAmount, originationFeePoints, consultingFee });
  const percentageEarnings = parsed.acceptedAmount != null && parsed.originationFeePoints != null
    ? parsed.acceptedAmount * parsed.originationFeePoints / 100
    : null;
  const pointsNeedAcceptedAmount = parsed.originationFeePoints != null && parsed.acceptedAmount == null;

  return (
    <>
      <div className="file-economics-summary deal-economics-summary" aria-label="Deal economics summary">
        <span><small>Approved amount</small><b>{approvedAmount == null ? "Not approved" : formatUnifiedAmount(approvedAmount)}</b><em>Lender approval; kept separate</em></span>
        <span><small>Accepted amount</small><b>{parsed.acceptedAmount == null ? "Not recorded" : formatUnifiedAmount(parsed.acceptedAmount)}</b><em>Client-accepted amount</em></span>
        <span><small>Origination earnings</small><b>{percentageEarnings == null ? "Not calculated" : formatUnifiedAmount(percentageEarnings)}</b><em>Accepted amount x fee percentage</em></span>
        <span><small>Expected QC earnings</small><b>{parsed.earnings == null ? "Not configured" : formatUnifiedAmount(parsed.earnings)}</b><em>Origination + consulting fee</em></span>
      </div>
      <div className="cg mt deal-economics-fields">
        <Field
          className="s6"
          label="Accepted amount"
          hint="Enter what the client accepted. This is the only amount used for percentage earnings."
          error={acceptedAmount.trim() !== "" && !parsed.acceptedAmountValid ? "Enter a valid amount of zero or more." : undefined}
        >
          <div className="field box file-economics-points">
            <span className="sub">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={acceptedAmount}
              onChange={(event) => onAcceptedAmountChange(event.target.value)}
              placeholder="Client-accepted amount"
              aria-label="Accepted amount"
              autoFocus={autoFocus}
            />
          </div>
        </Field>
        <Field
          className="s6"
          label="Origination fee"
          hint="Percentage charged on the accepted amount. One point equals 1%."
          error={originationFeePoints.trim() !== "" && !parsed.originationFeePointsValid ? "Enter a percentage from 0 to 100." : pointsNeedAcceptedAmount ? "Add the accepted amount to calculate percentage earnings." : undefined}
        >
          <div className="field box file-economics-points">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={originationFeePoints}
              onChange={(event) => onOriginationFeePointsChange(event.target.value)}
              placeholder="For example, 2.5"
              aria-label="Origination fee percentage"
            />
            <CellChip tone="mut">%</CellChip>
          </div>
        </Field>
        <Field
          className="s6"
          label="Consulting fee"
          hint="Fixed QC fee added to percentage earnings. Leave blank when none applies."
          error={consultingFee.trim() !== "" && !parsed.consultingFeeValid ? "Enter a valid amount of zero or more." : undefined}
        >
          <div className="field box file-economics-points">
            <span className="sub">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={consultingFee}
              onChange={(event) => onConsultingFeeChange(event.target.value)}
              placeholder="Fixed consulting fee"
              aria-label="Consulting fee"
            />
          </div>
        </Field>
        <Field className="s6" label="Expected closing" hint="Internal milestone shown on the Field Desk calendar.">
          <input
            className="field"
            type="date"
            value={estimatedCloseDate}
            onChange={(event) => onEstimatedCloseDateChange(event.target.value)}
            aria-label="Expected closing date"
          />
        </Field>
      </div>
      <div className="hintbox mt deal-economics-formula">
        <b>Expected earnings = accepted amount x origination fee + consulting fee</b>
        <div className="sub">The approved amount remains visible for comparison, but it never replaces the accepted amount in this calculation.</div>
      </div>
    </>
  );
}
