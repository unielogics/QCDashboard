"use client";

import { CellChip } from "@/components/ds";
import { debtTypeLabel } from "@/lib/debtTypes";
import { money, type Obligation } from "@/lib/financialCockpit";
import { formatLoanOriginationDate, formatLoanPaidDown, formatLoanPaidDownPct, loanPaidDownDescription } from "@/lib/loanProgress";
import styles from "./FinancialReview.module.css";

/** Financial values come from the saved schedule. Only the payoff plan is edited here. */
export function ObligationPlanRow({ o, canEdit, on, onToggleRetire, onReviewEvidence }: {
  o: Obligation; canEdit: boolean; on: boolean; onToggleRetire: () => void; onReviewEvidence?: () => void;
}) {
  return <tr className={[!o.in_debt_service ? "is-muted" : "", on ? "is-on" : ""].join(" ").trim() || undefined}>
    <td className={styles.payoffSelectionCell}><label className={styles.payoffSelectionTarget}><input type="checkbox" checked={on} disabled={!canEdit} aria-label={`Pay off ${o.lender} with the new loan`} onChange={onToggleRetire} /></label></td>
    <td><strong>{o.lender}</strong><div className="fc-chips" style={{ marginTop: 2 }}><CellChip tone="mut">{debtTypeLabel(o.category) || "Type not stated"}</CellChip><CellChip tone="mut">{o.kind === "row" ? "Saved schedule" : o.kind === "document" ? "Advance terms" : o.kind === "schedule_document" ? "Read from uploaded schedule" : "Seen in statements"}</CellChip>{o.replay_requires_review ? <CellChip tone="warn">Bank payments need review</CellChip> : null}</div>{o.replay_requires_review ? <small className="sub" style={{ display: "block", whiteSpace: "normal" }} title={o.replay_review_reason || undefined}>Statement payments need loan-level links.{onReviewEvidence ? <button type="button" className={styles.textAction} onClick={onReviewEvidence}>Review bank evidence</button> : null}</small> : null}</td>
    <td>{formatLoanOriginationDate(o.originated_on)}</td>
    <td className="r num">{money(o.monthly)}{o.cadence ? <small className="sub" style={{ display: "block" }}>{o.cadence}</small> : null}</td>
    <td className="r num">{o.balance == null ? <span className="sub">Balance unknown</span> : money(o.balance)}{o.payoff_requires_review ? <><CellChip tone="warn">Payoff needs review</CellChip><small className="sub" style={{ display: "block", whiteSpace: "normal" }}>{o.payoff_review_reason || "Review the latest payoff document and save its amount before using it in the plan."}</small></> : o.payoff != null && o.payoff !== o.balance ? <small className="sub" style={{ display: "block" }}>Payoff {money(o.payoff)}</small> : null}</td>
    <td className="r num" title={loanPaidDownDescription(Object.hasOwn(o, "paid_down_pct") && o.paid_down_pct == null ? null : o.original_amount, o.balance)}>{Object.hasOwn(o, "paid_down_pct") ? formatLoanPaidDownPct(o.paid_down_pct) : formatLoanPaidDown(o.original_amount, o.balance)}</td>
    <td>{o.in_debt_service ? <CellChip tone="ok">Yes</CellChip> : <CellChip tone="mut">No</CellChip>}</td>
  </tr>;
}
