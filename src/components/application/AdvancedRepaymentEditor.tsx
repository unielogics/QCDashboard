"use client";

import { useId } from "react";
import type { LoanStructure, RepaymentConfig } from "@/lib/loanSchedule";
import { repaymentPreview } from "@/lib/repaymentConfig";
import styles from "./AdvancedRepaymentEditor.module.css";

const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const numberText = (value: number | undefined) => value == null || !Number.isFinite(value) ? "" : String(value);
const numeric = (value: string) => value.trim() === "" ? Number.NaN : Number(value);

/** One optional schedule editor. The ordinary loan controls remain outside it. */
export function AdvancedRepaymentEditor({ value, onChange, amount, ratePct, termMonths, structure, interestOnlyMonths, periodsPerYear = 12, disabled = false, unsupportedReason, amortizationAlreadyVisible = false }: {
  value: RepaymentConfig | null | undefined; onChange: (value: RepaymentConfig | null) => void;
  amount: number | null; ratePct: number | null; termMonths: number | null; structure: LoanStructure | string | null;
  interestOnlyMonths?: number | null; periodsPerYear?: number; disabled?: boolean; unsupportedReason?: string | null;
  amortizationAlreadyVisible?: boolean;
}) {
  const id = useId();
  const config = { ...value, after_balloon: value?.after_balloon ?? "keep_payment" as const, balloons: value?.balloons ?? [] };
  const preview = repaymentPreview(amount, ratePct, termMonths, { structure, interestOnlyMonths, periodsPerYear, repaymentConfig: value });
  const update = (patch: Partial<RepaymentConfig>) => onChange({ ...config, ...patch });
  const error = value && unsupportedReason ? unsupportedReason : preview.error;
  const events = preview.schedule?.scheduled_balloons ?? [];
  return <details className={styles.editor}>
    <summary>Advanced repayment <span>{value ? `${config.balloons.length} scheduled payment${config.balloons.length === 1 ? "" : "s"}${config.amortization_months != null ? ` · ${numberText(config.amortization_months)}-month amortization` : ""}` : "Amortization and principal payments"}</span></summary>
    <div className={styles.content}>
      <p>Maturity remains {termMonths ?? "the term entered above"} months. Amortization sets the regular principal payment after any interest-only period; unpaid principal is due at maturity.</p>
      {unsupportedReason ? <p role={value ? "alert" : undefined}>{unsupportedReason}</p> : null}
      <div className={styles.fields}>
        {!amortizationAlreadyVisible ? <label htmlFor={`${id}-amortization`}>Amortization after interest-only (months)<input id={`${id}-amortization`} inputMode="numeric" type="number" min={1} max={1200} placeholder="Use remaining term" value={numberText(config.amortization_months)} disabled={disabled || !!unsupportedReason || structure === "interest_only"} onChange={(event) => update({ amortization_months: event.target.value === "" ? undefined : numeric(event.target.value) })} />{structure === "interest_only" && config.amortization_months != null ? <button type="button" disabled={disabled} onClick={() => update({ amortization_months: undefined })}>Remove amortization; keep principal payments</button> : null}</label> : null}
        <label htmlFor={`${id}-after`}>After a principal payment<select id={`${id}-after`} value={config.after_balloon} disabled={disabled || !!unsupportedReason} onChange={(event) => update({ after_balloon: event.target.value as RepaymentConfig["after_balloon"] })}><option value="keep_payment">Keep regular payment</option><option value="recast">Recast remaining regular payments</option></select></label>
      </div>
      <p>Each percentage uses the remaining principal after that period’s regular payment. Payments in the same period apply in listed order. Monthly dates map to the nearest payment period for other cadences.</p>
      <div className={styles.rows} role="region" aria-label="Scheduled principal payments" tabIndex={0}>
        {config.balloons.map((row, index) => <div className={styles.balloon} key={row.id}>
          <label>Month<input aria-label={`Principal payment ${index + 1} month`} type="number" inputMode="numeric" min={1} max={termMonths ?? 600} value={numberText(row.month)} disabled={disabled || !!unsupportedReason} onChange={(event) => update({ balloons: config.balloons.map((item, i) => i === index ? { ...item, month: numeric(event.target.value) } : item) })} /></label>
          <label>Basis<select aria-label={`Principal payment ${index + 1} basis`} value={row.type} disabled={disabled || !!unsupportedReason} onChange={(event) => update({ balloons: config.balloons.map((item, i) => i === index ? { ...item, type: event.target.value as typeof item.type } : item) })}><option value="amount">Dollar amount</option><option value="percent_balance">% of remaining balance</option></select></label>
          <label>{row.type === "amount" ? "Amount ($)" : "Remaining balance (%)"}<input aria-label={`Principal payment ${index + 1} value`} type="number" inputMode="decimal" min={0.01} max={row.type === "percent_balance" ? 100 : undefined} step="any" value={numberText(row.value)} disabled={disabled || !!unsupportedReason} onChange={(event) => update({ balloons: config.balloons.map((item, i) => i === index ? { ...item, value: numeric(event.target.value) } : item) })} /></label>
          <button type="button" disabled={disabled} aria-label={`Remove principal payment ${index + 1}`} onClick={() => update({ balloons: config.balloons.filter((_item, i) => i !== index) })}>Remove</button>
        </div>)}
      </div>
      <div className={styles.actions}><button type="button" disabled={disabled || !!unsupportedReason || config.balloons.length >= 60} onClick={() => update({ balloons: [...config.balloons, { id: globalThis.crypto?.randomUUID?.() ?? `principal-${Date.now()}-${config.balloons.length}`, month: Math.min(termMonths ?? 12, 12), type: "amount", value: Number.NaN }] })}>Add principal payment</button>{value && (!amortizationAlreadyVisible || config.balloons.length > 0) ? <button type="button" disabled={disabled} onClick={() => amortizationAlreadyVisible ? update({ balloons: [] }) : onChange(null)}>{amortizationAlreadyVisible ? "Remove additional principal payments" : "Reset all advanced repayment"}</button> : null}</div>
      {error ? <p className={styles.error} role="alert">{error} Changes cannot be saved until this is resolved.</p> : null}
      {!error && preview.schedule && value ? <div className={styles.preview}>
        {events.map((row) => <div key={row.id}>Month {row.month}{row.due_month !== row.month ? ` (applied at ${row.due_month} months)` : ""}: {money(row.amount)} principal payment · {money(row.balance_after)} remaining{row.recast_payment != null && row.recast_effective_period != null ? ` · recast payment ${money(row.recast_payment)} from period ${row.recast_effective_period}` : " · regular payment retained"}</div>)}
        <div>Residual principal at maturity: <b>{money(preview.schedule.balloon)}</b> · coverage annual service: <b>{money(preview.schedule.coverage_annual_debt_service)}</b> (includes principal due).</div>
      </div> : null}
    </div>
  </details>;
}
