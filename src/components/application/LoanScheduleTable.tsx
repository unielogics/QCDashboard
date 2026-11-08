"use client";

import { useState } from "react";
import type { LoanScheduleSummary, RiskProfile } from "@/lib/loanSchedule";
import { LOAN_SCHEDULE_PAGE_SIZE, loanScheduleRows } from "@/lib/loanScheduleView";
import { Btn } from "@/components/ds";
import styles from "./LoanScheduleReview.module.css";

const money = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

/** The schedule as a table the terms preview can fold open: every period's payment, interest, principal and balance,
 *  rolled up by year past 36 periods so a ten-year loan stays readable. */
export function LoanScheduleTable({ schedule, title, full = false, risk, pageIndex = 0, onPageIndex, selectedPeriod, onSelectPeriod }: { schedule: LoanScheduleSummary; title?: string; full?: boolean; risk?: RiskProfile | null; pageIndex?: number; onPageIndex?: (page: number) => void; selectedPeriod?: number | null; onSelectPeriod?: (period: number) => void }) {
  const [open, setOpen] = useState(false);
  const [everyPayment, setEveryPayment] = useState(false);
  if (full) {
    const all = loanScheduleRows(schedule, risk);
    const page = Math.min(Math.max(0, pageIndex), Math.max(0, Math.ceil(all.length / LOAN_SCHEDULE_PAGE_SIZE) - 1));
    const first = page * LOAN_SCHEDULE_PAGE_SIZE;
    const shown = all.slice(first, first + LOAN_SCHEDULE_PAGE_SIZE);
    return <section className={styles.paymentTable} aria-label="Detailed amortization schedule">
      <div className={styles.tableToolbar}><h3>{title ?? "Payment details"}</h3><span role="status">Payments {first + 1}–{Math.min(first + LOAN_SCHEDULE_PAGE_SIZE, all.length)} of {all.length}</span>{all.length > LOAN_SCHEDULE_PAGE_SIZE ? <><Btn size="sm" aria-label="Previous payment page" disabled={page === 0} onClick={() => onPageIndex?.(page - 1)}>Previous</Btn><Btn size="sm" aria-label="Next payment page" disabled={first + LOAN_SCHEDULE_PAGE_SIZE >= all.length} onClick={() => onPageIndex?.(page + 1)}>Next</Btn></> : null}</div>
      <div className={styles.tableScroll} role="region" aria-label="Amortization payments, scroll across for payoff progress and coverage" tabIndex={0}>
        <table><thead><tr><th>Payment / month</th><th>Phase</th><th>Cash due</th><th>Interest</th><th>Principal</th><th>Remaining principal</th><th>Paid down</th><th>Coverage</th></tr></thead><tbody>{shown.map((row) => <tr key={row.period} className={row.period === selectedPeriod ? styles.selectedRow : undefined}>
          <td><button type="button" className={styles.periodButton} aria-label={`Inspect payment ${row.period}, month ${row.month}`} aria-pressed={row.period === selectedPeriod} onClick={() => onSelectPeriod?.(row.period)}>{row.period} · month {row.month}</button></td>
          <td>{row.phase === "interest_only" ? "Interest-only" : row.phase === "amortizing" ? "Amortizing" : "Simple interest"}{row.maturity_balloon ? <small>Maturity balloon</small> : row.scheduled_balloon ? <small>Additional principal</small> : null}</td>
          <td>{money(row.cash)}</td><td>{money(row.interest)}</td><td>{money(row.principal)}</td><td>{money(row.balance)}</td><td>{row.paidDownPct.toFixed(1)}%</td><td>{row.coverage == null ? "—" : `${row.coverage.toFixed(2)}x`}</td>
        </tr>)}</tbody></table>
      </div>
    </section>;
  }
  const perYear = Math.max(1, Math.round(schedule.periods_per_year));
  const rollUp = schedule.rows.length > 36 && !everyPayment;
  const rows = rollUp
    ? Array.from({ length: Math.ceil(schedule.rows.length / perYear) }, (_, year) => {
        const slice = schedule.rows.slice(year * perYear, (year + 1) * perYear);
        const last = slice[slice.length - 1];
        return { key: `y${year + 1}`, label: `Year ${year + 1}`, phase: slice.every((r) => r.phase === "interest_only") ? "interest_only" : last.phase, payment: slice.reduce((s, r) => s + (schedule.repayment_config ? r.cash_payment ?? r.payment : r.payment), 0), interest: slice.reduce((s, r) => s + r.interest, 0), principal: slice.reduce((s, r) => s + (schedule.repayment_config ? r.total_principal ?? r.principal : r.principal), 0), balance: schedule.repayment_config ? last.balance_after_cash ?? last.balance : last.balance, balloon: last.balloon, exposure_pct: last.exposure_pct };
      })
    : schedule.rows.map((r) => ({ ...r, key: String(r.period), label: `${r.period}${schedule.repayment_config ? ` · month ${r.month}` : ""}`, payment: schedule.repayment_config ? r.cash_payment ?? r.payment : r.payment, principal: schedule.repayment_config ? r.total_principal ?? r.principal : r.principal, balance: schedule.repayment_config ? r.balance_after_cash ?? r.balance : r.balance }));
  return (
    <details className="terms-preview-schedule" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary>{title ?? "Amortization schedule"}<small>{schedule.payment_io != null && schedule.payment_after != null ? `${money(schedule.payment_io)} for ${schedule.interest_only_months} months, then ${money(schedule.payment_after)}` : schedule.structure === "interest_only" ? `${money(schedule.payment_io)} of interest each period; ${money(schedule.balloon, 0)} due at maturity` : `${money(schedule.payment_after ?? schedule.payment_io)} each period`} · total interest {money(schedule.total_interest, 0)} · total paid {money(schedule.total_paid, 0)}</small></summary>
      {open ? (
        <>
        {schedule.repayment_config ? <div className="sub" style={{ padding: 10 }}><b>Actual cash due.</b> Scheduled principal payments are included in payment totals; residual principal is separate until maturity. Coverage uses the peak rolling 12 months: {money(schedule.coverage_annual_debt_service)} annual service ({money(schedule.coverage_payment_monthly)} monthly equivalent).<br />
          {schedule.scheduled_balloons?.map((event) => <div key={event.id}>Month {event.month}{event.due_month !== event.month ? ` → payment at month ${event.due_month}` : ""}: {money(event.amount)} principal · {money(event.balance_after)} remaining{event.recast_payment != null && event.recast_effective_period != null ? ` · recast payment ${money(event.recast_payment)} from period ${event.recast_effective_period}` : ""}</div>)}
          Residual at maturity: {money(schedule.balloon)}.
        </div> : null}
        {schedule.rows.length > 36 ? <button type="button" className="linky" onClick={() => setEveryPayment((value) => !value)}>{everyPayment ? "Group payments by year" : "Show every payment"}</button> : null}
        <div role="region" aria-label="Loan payment schedule" tabIndex={0} style={{ maxHeight: 420, maxWidth: "100%", overflow: "auto" }}>
        <table>
          <thead><tr><th>{rollUp ? "Year" : "Period"}</th><th>Phase</th><th>{schedule.repayment_config ? "Cash due" : "Payment"}</th><th>Interest</th><th>Principal</th><th>{schedule.repayment_config ? "Balance after cash" : "Balance"}</th><th>Still out</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.phase === "interest_only" ? "io" : undefined}>
                <td>{r.label}</td>
                <td>{r.phase === "interest_only" ? "Interest-only" : r.phase === "amortizing" ? "Amortizing" : "Simple interest"}</td>
                <td>{money(r.payment)}</td><td>{money(r.interest)}</td><td>{money(r.principal)}</td>
                <td>{r.balloon ? `${money(r.balance)} · ${money(r.balloon)} due` : money(r.balance)}</td>
                <td>{r.exposure_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </>
      ) : null}
    </details>
  );
}
