"use client";

import { operatingMoney, operatingNumber, type OperatingPlanBody, type ReleasedCashFlowAllocation as Allocation, type ReleasedCashFlowEvaluation } from "@/lib/operatingPlan";
import styles from "./ReleasedCashFlowAllocation.module.css";

/** Recurring allocations do not change earnings or the one-time loan budget. */
export function ReleasedCashFlowAllocation({ value, onChange, source, disabled = false, evaluating = false }: {
  value: OperatingPlanBody; onChange: (value: OperatingPlanBody) => void;
  source?: ReleasedCashFlowEvaluation | null; disabled?: boolean; evaluating?: boolean;
}) {
  const release = value.released_cash_flow;
  const rows = release?.allocations ?? [];
  if (!source?.required && !rows.length && !release?.source_fingerprint) return null;
  const current = Boolean(source?.source_fingerprint && source.source_fingerprint === release?.source_fingerprint);
  const currency = source?.currency || "USD";
  const operatingCosts = source?.source?.new_operating_expenses_monthly ?? 0;
  const financingFees = source?.source?.new_financing_fees_monthly ?? 0;
  const allocated = rows.reduce((total, row) => total + (operatingNumber(row.amount_monthly) ?? 0), 0);
  const remaining = source?.amount_monthly == null ? null : Math.round((source.amount_monthly - allocated) * 100) / 100;
  const save = (allocations: Allocation[], fingerprint = release?.source_fingerprint ?? null) => onChange({ ...value, released_cash_flow: { source_fingerprint: fingerprint, allocations } });
  const update = (id: string, patch: Partial<Allocation>) => save(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  const expenses = (value.expenses ?? []).filter((row) => !row.excluded && !row.duplicate_of);
  return <section className={styles.section} aria-label="Released cash flow allocation">
    <div className={styles.heading}><div><h4>{source && !source.required ? "Recorded cash flow allocations" : "Allocate released cash flow"}</h4><p>{source && !source.required ? "The current coverage plan does not require a recurring allocation. Previously recorded purposes remain here for review." : "The saved coverage plan releases recurring cash flow. Assign its monthly amount to specific business purposes."}</p></div><strong>{source?.amount_monthly == null ? "Amount unavailable" : `${operatingMoney(source.amount_monthly, currency)} / month`}</strong></div>
    {source?.source ? <p className={styles.note}>Saved debt service: {operatingMoney(source.source.before_monthly, currency)} before → {operatingMoney(source.source.after_monthly, currency)} with the plan, per month.</p> : null}
    {operatingCosts > 0 ? <p className={styles.note}>New recurring operating costs of {operatingMoney(operatingCosts, currency)} / month are deducted before allocation.</p> : null}
    {financingFees > 0 ? <p className={styles.note}>New financing charges of {operatingMoney(financingFees, currency)} / month are included in the plan payments above.</p> : null}
    {!source?.available ? <p role="status" className={styles.warning}>A current saved coverage plan is needed to confirm the amount. Existing allocations are preserved.</p> : source.required && !current ? <div className={styles.warning}><p>{release?.source_fingerprint ? "The saved coverage plan has changed. Review these allocations against its current monthly release." : "Use the saved coverage plan as the source for these allocations."}</p>{!disabled ? <button type="button" onClick={() => save(rows, source.source_fingerprint)}>Use saved coverage plan</button> : null}</div> : null}
    {!disabled && source && (!source.available || source.amount_monthly === 0) && (rows.length > 0 || release?.source_fingerprint) ? <div className={styles.warning}><p>The previous allocation remains on file. Clear it if the saved plan no longer releases this cash flow.</p><button type="button" onClick={() => save([], null)}>Clear previous allocation</button></div> : null}
    <div className={styles.totals} aria-live="polite"><span>Allocated <strong>{operatingMoney(allocated, currency)} / month</strong></span><span>{remaining != null && remaining < 0 ? "Over allocated" : "Still to allocate"} <strong>{remaining == null ? "—" : `${operatingMoney(Math.abs(remaining), currency)} / month`}</strong></span></div>
    {rows.map((row, index) => <div className={styles.row} key={row.id}>
      <label>Purpose<input aria-label={`Allocation purpose ${index + 1}`} value={row.label} disabled={disabled} onChange={(event) => update(row.id, { label: event.target.value })} placeholder="For example, hiring or cash reserve" /></label>
      <label>Monthly amount<input type="number" min="0.01" step="0.01" aria-label={`Allocation monthly amount ${index + 1}`} inputMode="decimal" value={row.amount_monthly ?? ""} disabled={disabled} onChange={(event) => update(row.id, { amount_monthly: event.target.value })} placeholder="0.00" /></label>
      <label>Related expense (optional)<select aria-label={`Allocation related expense ${index + 1}`} value={row.expense_row_id ?? ""} disabled={disabled} onChange={(event) => update(row.id, { expense_row_id: event.target.value || null })}><option value="">Separate purpose or reserve</option>{row.expense_row_id && !expenses.some((expense) => expense.id === row.expense_row_id) ? <option value={row.expense_row_id}>Previous expense · review link</option> : null}{expenses.map((expense) => <option key={expense.id} value={expense.id}>{expense.label || "Unnamed expense"}</option>)}</select></label>
      <label className={styles.notes}>Allocation explanation (optional)<textarea aria-label={`Allocation explanation ${index + 1}`} value={row.notes} disabled={disabled} rows={2} onChange={(event) => update(row.id, { notes: event.target.value })} placeholder="Explain how the business will use this recurring amount" /></label>
      {!disabled ? <button type="button" onClick={() => save(rows.filter((item) => item.id !== row.id))} aria-label={`Remove allocation ${index + 1}`}>Remove</button> : null}
    </div>)}
    {!disabled && source?.required ? <button type="button" onClick={() => save([...rows, { id: crypto.randomUUID(), label: "", amount_monthly: null, expense_row_id: null, notes: "" }])}>Add cash flow allocation</button> : null}
    <p className={styles.note}>{evaluating ? "Checking the allocation…" : source && !source.required ? "No recurring allocation is currently required." : source?.complete && current && remaining === 0 && rows.length > 0 && rows.every((row) => row.label.trim() && (operatingNumber(row.amount_monthly) ?? 0) > 0) ? "The saved-plan release is fully allocated. Save version to publish the operating plan." : "Allocate the full monthly release and name each purpose before publishing the operating plan."} These assignments do not add revenue, reduce expenses, or change the loan’s one-time use of proceeds.</p>
  </section>;
}
