"use client";

import { Btn, CellChip } from "@/components/ds";
import { meaningfulFinancialDebts, financialDebtReviewSummary, financialDebtTotals, type FinancialDebtRow, type FinancialWorkspaceSnapshot } from "@/lib/financialWorkspaceApi";
import { parseMoney } from "@/components/sheet/money";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { hasPendingDebtIntakeReview } from "@/lib/financialDebtIntake";
import { formatLoanOriginationDate, formatLoanPaidDown, loanPaidDownDescription } from "@/lib/loanProgress";
import styles from "./DebtScheduleReadback.module.css";

const money = (value: unknown) => {
  const parsed = parseMoney(value);
  return parsed.blank || parsed.warn || ["-", "."].includes(String(value)) ? "Not provided"
    : parsed.value.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
};
const paymentFrequency = (value: unknown) => ({ daily: "Business day", weekly: "Week", biweekly: "Two weeks", monthly: "Month" }[String(value)] ?? (value ? String(value).replaceAll("_", " ") : "Not provided"));
const fieldLabel = (value: string) => ({ balance: "current balance", monthly_payment: "monthly payment or payment terms", lender: "lender" }[value.split(".").at(-1) ?? ""] ?? value.split(".").at(-1)?.replaceAll("_", " ") ?? value);

export function DebtScheduleReadback({ workspace, onEdit, onFiles, onHistory }: {
  workspace: FinancialWorkspaceSnapshot;
  onEdit: (rowId?: string) => void;
  onFiles: (rowId: string) => void;
  onHistory: () => void;
}) {
  const summary = financialDebtReviewSummary(workspace);
  const rows = meaningfulFinancialDebts(workspace.body);
  const excluded = ((workspace.body.debts as FinancialDebtRow[] | undefined) ?? []).filter((row) => row.status === "dismissed" || row.status === "duplicate" || row.duplicate_of_id);
  const totals = financialDebtTotals(workspace.body);
  const published = workspace.versions.find((version) => version.id === (workspace.accepted_version_id ?? workspace.current_version_id));
  const aiDraft = hasPendingDebtIntakeReview(workspace);
  const guidance = aiDraft ? "These obligations were drafted from existing evidence. Review each lender, amount, and linked source, then Save version to confirm the schedule and generate its dated PDF."
    : summary.publishedComplete && summary.publishNeeded
    ? "The last saved schedule is complete. Changes shown here are still a working draft; Save version updates the financial figures and dated PDF."
    : summary.draftComplete && summary.publishNeeded
      ? "Every required answer is filled in. Review the schedule, then choose Edit schedule → Save version to file its dated PDF and update the financial figures."
      : summary.draftComplete
        ? "This completed schedule is saved. The financial figures and AI use its saved version."
        : rows.length
          ? `${summary.missingAnswers} required ${summary.missingAnswers === 1 ? "answer is" : "answers are"} still needed in this working draft. Open Edit schedule to finish them.`
          : "Add the business’s obligations, or confirm in the editor that the business has no outstanding debt.";
  return <section className={styles.panel} aria-label="Debt schedule details">
    <div className={styles.header}>
      <div className={styles.heading}>
        <strong>Business debt schedule</strong>
        <CellChip tone={summary.draftComplete && !aiDraft ? "ok" : "warn"}>{rows.length} {rows.length === 1 ? "obligation" : "obligations"}{aiDraft ? " · AI draft for review" : summary.draftComplete ? " · complete" : summary.missingAnswers ? ` · ${summary.missingAnswers} ${summary.missingAnswers === 1 ? "answer" : "answers"} needed` : ""}</CellChip>
        <CellChip tone={summary.publishNeeded ? "acc" : "mut"}>{summary.publishNeeded ? "Working draft" : "Saved version"}</CellChip>
      </div>
      <div className={styles.actions}>
        <Btn size="sm" onClick={() => onEdit()}>Edit schedule</Btn>
        {workspace.versions.length ? <Btn size="sm" onClick={onHistory}>PDFs and history</Btn> : null}
      </div>
    </div>
    <p className={styles.guidance} role="status">{guidance}</p>
    {summary.publishNeeded && !summary.publishedComplete && workspace.versions.some((version) => version.source_file_id || version.pdf_file_id) ? <p className={styles.note}>Existing PDFs are preserved. A completed schedule version has not been filed yet.</p> : null}
    {rows.length ? <>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Debt schedule obligations, scroll across columns if needed">
        <table>
          <caption>{summary.publishNeeded ? "Working draft" : "Saved schedule"} · active obligations only</caption>
          <thead><tr><th scope="col">Lender</th><th scope="col">Origination date</th><th scope="col">Current balance</th><th scope="col">% paid down</th><th scope="col">Payment</th><th scope="col">Per</th><th scope="col">Monthly equivalent</th><th scope="col">Loan documents</th><th scope="col">Edit</th></tr></thead>
          <tbody>{rows.map((row) => {
            const missing = summary.missingFields.filter((field) => field.includes(row.id)).map(fieldLabel);
            return <tr key={row.id}>
              <th scope="row"><span>{String(row.lender || "Lender needed")}</span>{missing.length ? <small>Needed: {[...new Set(missing)].join(", ")}</small> : null}</th>
              <td>{formatLoanOriginationDate(row.originated_on)}</td><td>{money(row.balance)}</td><td title={loanPaidDownDescription(row.original_amount, row.balance)}>{formatLoanPaidDown(row.original_amount, row.balance)}</td><td>{money(row.payment_amount)}</td><td>{paymentFrequency(row.payment_frequency)}</td><td>{money(row.monthly_payment)}</td>
              <td><button type="button" className={styles.link} onClick={() => onFiles(row.id)}>{row.evidence_links?.length ? `${row.evidence_links.length} linked ${row.evidence_links.length === 1 ? "file" : "files"}` : "Link files"}</button></td>
              <td><div className={styles.actions}><Btn size="sm" onClick={() => onEdit(row.id)} aria-label={`Edit ${row.lender || "obligation"}`}>Edit</Btn><PageActionMenu label={`Manage ${row.lender || "obligation"}`} items={[{ label: "Remove row…", onSelect: () => onEdit(row.id) }, { label: "Mark duplicate of another obligation…", onSelect: () => onEdit(row.id) }, { label: "Link supporting documents", onSelect: () => onFiles(row.id) }]} /></div></td>
            </tr>;
          })}</tbody>
          <tfoot><tr><th scope="row" colSpan={2}>Totals</th><td>{money(totals.total_balance)}</td><td title="Paid-down percentages are calculated per loan, not combined in totals.">—</td><td colSpan={2}>Active obligations only</td><td>{money(totals.total_monthly_payment)}</td><td colSpan={2}>{summary.removed} excluded</td></tr></tfoot>
        </table>
      </div>
      {summary.publishedComplete && published ? <p className={styles.note}>Last completed version: v{published.version_number}{published.created_at ? ` · ${new Date(published.created_at).toLocaleString()}` : ""}. {summary.publishedRows} saved {summary.publishedRows === 1 ? "obligation" : "obligations"}.</p> : null}
    </> : workspace.body.no_debt === true ? <p className={styles.note}>The working schedule explicitly declares no outstanding business debt.</p> : null}
    {excluded.length ? <details className={styles.excluded}><summary>{excluded.length} excluded {excluded.length === 1 ? "row" : "rows"} · kept for history</summary><ul>{excluded.map((row) => <li key={row.id}><span>{String(row.lender || "Unnamed obligation")} · {row.duplicate_of_id ? "Duplicate" : "Removed"}</span><button type="button" className={styles.link} onClick={() => onEdit(row.id)}>Review or restore</button></li>)}</ul></details> : null}
  </section>;
}
