"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, CellChip, Field } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useUpdateOperatorFileEconomics } from "@/hooks/useApi";
import {
  forecastAmountBasisLabel,
  formatUnifiedAmount,
  type OperatorFileForecastResult,
  type UnifiedFileRow,
} from "@/lib/unifiedOperator";

export type FileEconomicsDrawerProps = {
  open: boolean;
  row: UnifiedFileRow | null;
  onClose: () => void;
  onSaved?: (result: OperatorFileForecastResult) => void;
};

export function FileEconomicsDrawer({ open, row, onClose, onSaved }: FileEconomicsDrawerProps) {
  const update = useUpdateOperatorFileEconomics();
  const [points, setPoints] = useState("");
  const [estimatedCloseDate, setEstimatedCloseDate] = useState("");
  const [fundedAmount, setFundedAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rowId = row?.id;
  const rowPoints = row?.forecast_fee_points;
  const rowCloseDate = row?.estimated_close_date;
  const rowFundedAmount = row?.funded_amount;

  useEffect(() => {
    if (!open || !rowId) return;
    setPoints(rowPoints == null ? "" : String(rowPoints));
    setEstimatedCloseDate(rowCloseDate?.slice(0, 10) ?? "");
    setFundedAmount(rowFundedAmount == null ? "" : String(rowFundedAmount));
    setError(null);
  }, [open, rowCloseDate, rowFundedAmount, rowId, rowPoints]);

  const isFunded = (row?.pipeline_status ?? row?.underwriting_status) === "closed_won";
  const parsedFundedAmount = fundedAmount.trim() === "" ? null : Number(fundedAmount);
  const amount = useMemo(() => {
    if (!row) return null;
    if (isFunded) {
      return parsedFundedAmount ?? row.approved_amount ?? row.requested_amount ?? row.amount;
    }
    return row.forecast_amount ?? row.requested_amount ?? row.approved_amount ?? row.funded_amount ?? row.amount;
  }, [isFunded, parsedFundedAmount, row]);
  const parsedPoints = points.trim() === "" ? null : Number(points);
  const preview = parsedPoints != null && Number.isFinite(parsedPoints) && amount != null
    ? (Number(amount) * parsedPoints) / 100
    : null;
  const pointsValid = parsedPoints == null || (Number.isFinite(parsedPoints) && parsedPoints >= 0 && parsedPoints <= 100);
  const fundedAmountValid = !isFunded || parsedFundedAmount == null || (Number.isFinite(parsedFundedAmount) && parsedFundedAmount >= 0);
  const canSave = Boolean(row) && !update.isPending && pointsValid && fundedAmountValid;

  async function save() {
    if (!row || !canSave) return;
    setError(null);
    try {
      const result = await update.mutateAsync({
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        body: {
          forecast_fee_points: parsedPoints,
          estimated_close_date: estimatedCloseDate || null,
          ...(isFunded ? { funded_amount: parsedFundedAmount } : {}),
        },
      });
      onSaved?.(result);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this forecast.");
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => { if (!update.isPending) onClose(); }}
      title="File earnings forecast"
      sub={row ? `${row.title || row.label} · internal planning only` : "Internal planning only"}
      ariaLabel="Edit file earnings forecast"
      width="md"
      closeOnBackdrop={!update.isPending}
      footer={(
        <>
          <Btn onClick={onClose} disabled={update.isPending}>Cancel</Btn>
          <span className="sp" />
          <Btn variant="pri" onClick={save} disabled={!canSave}>
            {update.isPending ? "Saving…" : "Save forecast"}
          </Btn>
        </>
      )}
    >
      {error ? <div className="warnline" style={{ marginBottom: 14 }}>{error}</div> : null}
      <div className="file-economics-summary">
        <span><small>Forecast basis</small><b>{formatUnifiedAmount(amount)}</b><em>{forecastAmountBasisLabel(row?.forecast_amount_basis)}</em></span>
        <span><small>Forecast earnings</small><b>{preview == null ? "Not forecast" : formatUnifiedAmount(preview)}</b><em>{parsedPoints == null ? "Add points to forecast" : `${parsedPoints}% of basis`}</em></span>
      </div>
      <div className="cg mt">
        {isFunded ? (
          <Field
            className="s12"
            label="Funded amount"
            hint="Use the final amount funded. It becomes the basis for funded value and earnings."
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
        ) : null}
        <Field
          className="s6"
          label="QC revenue points"
          hint="One point equals 1% of the current forecast amount. Clear this field to exclude the file from earnings totals."
          error={points.trim() !== "" && !pointsValid ? "Enter a number from 0 to 100." : undefined}
        >
          <div className="field box file-economics-points">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="For example, 2.5"
              aria-label="QC revenue points"
              autoFocus
            />
            <CellChip tone="mut">%</CellChip>
          </div>
        </Field>
        <Field
          className="s6"
          label="Estimated closing"
          hint="This appears on the internal calendar and may be changed later."
        >
          <input
            className="field"
            type="date"
            value={estimatedCloseDate}
            onChange={(event) => setEstimatedCloseDate(event.target.value)}
            aria-label="Estimated closing date"
          />
        </Field>
      </div>
      <div className="hintbox mt">
        <b>Planning forecast, not client pricing</b>
        <div className="sub">Revenue points are kept separate from origination, discount points, and borrower-facing terms.</div>
      </div>
    </Drawer>
  );
}
