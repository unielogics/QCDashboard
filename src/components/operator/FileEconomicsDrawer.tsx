"use client";

import { useEffect, useState } from "react";
import { Btn, Field } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { DealEconomicsFields } from "@/components/operator/DealEconomicsFields";
import { useUpdateOperatorFileEconomics } from "@/hooks/useApi";
import { parseDealEconomicsDraft } from "@/lib/dealEconomics";
import { type OperatorFileForecastResult, type UnifiedFileRow } from "@/lib/unifiedOperator";

export type FileEconomicsDrawerProps = {
  open: boolean;
  row: UnifiedFileRow | null;
  onClose: () => void;
  onSaved?: (result: OperatorFileForecastResult) => void;
};

export function FileEconomicsDrawer({ open, row, onClose, onSaved }: FileEconomicsDrawerProps) {
  const update = useUpdateOperatorFileEconomics();
  const [acceptedAmount, setAcceptedAmount] = useState("");
  const [originationFeePoints, setOriginationFeePoints] = useState("");
  const [consultingFee, setConsultingFee] = useState("");
  const [estimatedCloseDate, setEstimatedCloseDate] = useState("");
  const [fundedAmount, setFundedAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rowId = row?.id;
  const rowPoints = row?.forecast_fee_points;
  const rowAcceptedAmount = row?.accepted_amount;
  const rowConsultingFee = row?.forecast_consulting_fee;
  const rowCloseDate = row?.estimated_close_date;
  const rowFundedAmount = row?.funded_amount;

  useEffect(() => {
    if (!open || !rowId) return;
    setAcceptedAmount(rowAcceptedAmount == null ? "" : String(rowAcceptedAmount));
    setOriginationFeePoints(rowPoints == null ? "" : String(rowPoints));
    setConsultingFee(rowConsultingFee == null ? "" : String(rowConsultingFee));
    setEstimatedCloseDate(rowCloseDate?.slice(0, 10) ?? "");
    setFundedAmount(rowFundedAmount == null ? "" : String(rowFundedAmount));
    setError(null);
  }, [open, rowAcceptedAmount, rowCloseDate, rowConsultingFee, rowFundedAmount, rowId, rowPoints]);

  const isFunded = (row?.pipeline_status ?? row?.underwriting_status) === "closed_won";
  const parsedFundedAmount = fundedAmount.trim() === "" ? null : Number(fundedAmount);
  const parsed = parseDealEconomicsDraft({ acceptedAmount, originationFeePoints, consultingFee });
  const fundedAmountValid = !isFunded || parsedFundedAmount == null || (Number.isFinite(parsedFundedAmount) && parsedFundedAmount >= 0);
  const canSave = Boolean(row) && !update.isPending && parsed.valid && fundedAmountValid;

  async function save() {
    if (!row || !canSave) return;
    setError(null);
    try {
      const result = await update.mutateAsync({
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        body: {
          accepted_amount: parsed.acceptedAmount,
          forecast_fee_points: parsed.originationFeePoints,
          forecast_consulting_fee: parsed.consultingFee,
          estimated_close_date: estimatedCloseDate || null,
          ...(isFunded ? { funded_amount: parsedFundedAmount } : {}),
        },
      });
      onSaved?.(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save these deal economics.");
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => { if (!update.isPending) onClose(); }}
      title="Deal economics"
      sub={row ? `${row.title || row.label} · approved and accepted amounts stay separate` : "Internal deal economics"}
      ariaLabel="Edit deal economics"
      width="md"
      closeOnBackdrop={!update.isPending}
      footer={(
        <>
          <Btn onClick={onClose} disabled={update.isPending}>Cancel</Btn>
          <span className="sp" />
          <Btn variant="pri" onClick={save} disabled={!canSave}>
            {update.isPending ? "Saving…" : "Save deal economics"}
          </Btn>
        </>
      )}
    >
      {error ? <div className="warnline" style={{ marginBottom: 14 }}>{error}</div> : null}
      <DealEconomicsFields
        profileId={row?.profile_id}
        approvedAmount={row?.approved_amount}
        acceptedAmount={acceptedAmount}
        originationFeePoints={originationFeePoints}
        consultingFee={consultingFee}
        estimatedCloseDate={estimatedCloseDate}
        onAcceptedAmountChange={setAcceptedAmount}
        onOriginationFeePointsChange={setOriginationFeePoints}
        onConsultingFeeChange={setConsultingFee}
        onEstimatedCloseDateChange={setEstimatedCloseDate}
        autoFocus
      />
      {isFunded ? (
        <div className="cg mt">
          <Field
            className="s12"
            label="Funded amount"
            hint="Use the final amount funded for pipeline reporting. Expected earnings remain based on the accepted amount."
            error={fundedAmount.trim() !== "" && !fundedAmountValid ? "Enter a valid funded amount." : undefined}
          >
            <div className="field box file-economics-points">
              <span className="sub">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={fundedAmount}
                onChange={(event) => setFundedAmount(event.target.value)}
                placeholder="Final funded amount"
                aria-label="Funded amount"
              />
            </div>
          </Field>
        </div>
      ) : null}
    </Drawer>
  );
}
