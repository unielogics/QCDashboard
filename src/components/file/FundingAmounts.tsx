import { formatUnifiedAmount, type UnifiedFileRow } from "@/lib/unifiedOperator";

/** A client's current request stays distinct from the recorded loan or stage amount. */
export function FundingAmounts({ requestedAmount, amount, amountLabel = "Loan amount", showSecondaryAmount = true }: {
  requestedAmount?: number | null;
  amount?: number | null;
  amountLabel?: string;
  showSecondaryAmount?: boolean;
}) {
  const hasRequest = requestedAmount != null;
  return <div>
    {hasRequest ? <div><b className="num" title={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(requestedAmount)}>Current request {formatUnifiedAmount(requestedAmount)}</b></div> : null}
    {amount !== undefined && (!hasRequest || showSecondaryAmount) ? <div className={hasRequest ? "sub num" : "num"}>{amountLabel} {formatUnifiedAmount(amount)}</div> : null}
  </div>;
}

export function UnifiedFundingAmounts({ row }: { row: UnifiedFileRow }) {
  const amountLabel = row.source_kind === "loan" ? "Loan amount" : row.forecast_amount_basis === "funded" ? "Funded" : row.forecast_amount_basis === "approved" ? "Approved" : "File amount";
  return <FundingAmounts requestedAmount={row.requested_amount} amount={row.amount} amountLabel={amountLabel} showSecondaryAmount={row.source_kind === "loan" || row.amount !== row.requested_amount} />;
}
