"use client";

import { CellChip, Field, StatusLine } from "@/components/ds";
import { FeeAllocationEditor } from "@/components/payments/FeeAllocationEditor";
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
  /** Canonical application profile. Enables the shared, audited fee allocation. */
  profileId?: string | null;
  vertical?: "real_estate" | "main_street" | "dealer" | "mca";
  qcFeeCapPercent?: number | null;
  qcFeeReviewRequired?: boolean;
  qcFeeReviewReason?: string | null;
  feeLabel?: string | null;
  autoFocus?: boolean;
  /** The fees are set on the Financials tab and only reflected here; the inputs read-only and a way there. */
  feesReadOnly?: boolean;
  onEditFees?: () => void;
  /** The estimated close date is set once the client has accepted. */
  closeDateDisabled?: boolean;
  closeDateHint?: string;
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
  profileId,
  vertical,
  qcFeeCapPercent,
  qcFeeReviewRequired = false,
  qcFeeReviewReason,
  feeLabel,
  autoFocus = false,
  feesReadOnly = false,
  onEditFees,
  closeDateDisabled = false,
  closeDateHint,
}: DealEconomicsFieldsProps) {
  const effectiveFeeCap = vertical === "mca" ? 3 : qcFeeCapPercent ?? 100;
  const parsed = parseDealEconomicsDraft(
    { acceptedAmount, originationFeePoints, consultingFee },
    { maxOriginationFeePoints: effectiveFeeCap },
  );
  const percentageEarnings = parsed.acceptedAmount != null && parsed.originationFeePoints != null
    ? parsed.acceptedAmount * parsed.originationFeePoints / 100
    : null;
  const pointsNeedAcceptedAmount = parsed.originationFeePoints != null && parsed.acceptedAmount == null;
  const savedFeeValue = Number(originationFeePoints);
  const historicalMcaReview = vertical === "mca" && originationFeePoints.trim() !== "" && Number.isFinite(savedFeeValue) && savedFeeValue > 3;

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
          label={feeLabel || "QC origination/success fee"}
          hint={feesReadOnly ? `Set on the Financials tab, with the loan's true cost beside it. Current file cap: ${effectiveFeeCap.toFixed(2)}%.` : `Percentage charged on the accepted amount. Current file cap: ${effectiveFeeCap.toFixed(2)}%.`}
          error={originationFeePoints.trim() !== "" && !parsed.originationFeePointsValid ? `Enter a percentage from 0 to ${effectiveFeeCap.toFixed(2)}.` : pointsNeedAcceptedAmount ? "Add the accepted amount to calculate percentage earnings." : undefined}
        >
          <div className="field box file-economics-points">
            <input
              type="number"
              min="0"
              max={vertical === "mca" ? 3 : effectiveFeeCap}
              step="0.01"
              inputMode="decimal"
              value={originationFeePoints}
              onChange={(event) => onOriginationFeePointsChange(event.target.value)}
              placeholder="For example, 2.5"
              aria-label="Origination fee percentage"
              disabled={feesReadOnly}
            />
            <CellChip tone="mut">%</CellChip>
            {feesReadOnly && onEditFees ? <button type="button" className="linklike" onClick={onEditFees}>Edit in Financials</button> : null}
          </div>
        </Field>
        <Field
          className="s6"
          label="Consulting fee"
          hint={feesReadOnly ? "Set on the Financials tab; reflected here and in the fee allocation below." : "Fixed QC fee added to percentage earnings. Leave blank when none applies."}
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
              disabled={feesReadOnly}
            />
            {feesReadOnly && onEditFees ? <button type="button" className="linklike" onClick={onEditFees}>Edit in Financials</button> : null}
          </div>
        </Field>
        <Field className="s6" label="Estimated closing" hint={closeDateHint ?? "Internal milestone shown on the Field Desk calendar."}>
          <input
            className="field"
            type="date"
            value={estimatedCloseDate}
            onChange={(event) => onEstimatedCloseDateChange(event.target.value)}
            aria-label="Expected closing date"
            disabled={closeDateDisabled}
          />
        </Field>
      </div>
      <div className="hintbox mt deal-economics-formula">
        <b>Expected earnings = accepted amount x origination fee + consulting fee</b>
        <div className="sub">The approved amount remains visible for comparison, but it never replaces the accepted amount in this calculation.</div>
      </div>
      {qcFeeReviewRequired || historicalMcaReview ? (
        <StatusLine tone="bad">
          {qcFeeReviewReason || `This saved fee requires review against the ${effectiveFeeCap.toFixed(2)}% file cap.`}
        </StatusLine>
      ) : null}
      {profileId ? (
        <FeeAllocationEditor
          profileId={profileId}
          originationFee={percentageEarnings ?? 0}
          consultingFee={parsed.consultingFee ?? 0}
          compact
        />
      ) : null}
    </>
  );
}
