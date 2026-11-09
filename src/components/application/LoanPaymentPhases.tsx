"use client";

import type { LoanScheduleSummary } from "@/lib/loanSchedule";
import styles from "./LoanScheduleReview.module.css";

const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Not available" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

/** Contractual payments and timing, kept separate from underwriting cash stress. */
export function LoanPaymentPhases({ schedule }: { schedule: LoanScheduleSummary }) {
  const regularRows = schedule.rows.filter((row) => row.phase !== "interest_only");
  const ioRows = schedule.rows.filter((row) => row.phase === "interest_only");
  const hasIo = schedule.payment_io != null;
  const hasRepayment = schedule.payment_after != null;
  const monthly = schedule.periods_per_year === 12;
  const firstYear = schedule.first_year_actual_debt_service ?? schedule.annual_debt_service;
  const range = (rows: typeof schedule.rows) => {
    const values = rows.map((row) => row.regular_payment ?? row.payment);
    const min = Math.min(...values), max = Math.max(...values);
    return values.length && max - min > 0.01 ? `Installments vary from ${money(min)} to ${money(max)} as principal is repaid.` : null;
  };
  const ioRange = range(ioRows), regularRange = range(regularRows);
  const ioEnd = ioRows[ioRows.length - 1]?.month;
  const adjustment = (schedule as LoanScheduleSummary & { cadence_adjustment_note?: string | null }).cadence_adjustment_note;
  return <section className={styles.paymentPhases} aria-label="Scheduled loan payments">
    <div className={styles.phaseCards}>
      {hasIo ? <div><span>{hasRepayment ? "1. Interest-only payments" : "Interest-only payments"}</span><strong>{money(schedule.payment_io)}<small> {ioRange ? "initial " : "per "}{monthly ? "month" : "payment"}</small></strong><small>{ioEnd != null ? `Through month ${ioEnd}` : `First ${schedule.interest_only_months} months`}{!monthly ? ` · ${money(schedule.payment_io_monthly)} initial monthly equivalent` : ""}</small>{ioRange ? <small>{ioRange}</small> : null}</div> : null}
      {hasRepayment ? <div><span>{hasIo ? "2. Principal and interest" : "Principal and interest"}</span><strong>{money(schedule.payment_after)}<small> {regularRange ? "initial " : "per "}{monthly ? "month" : "payment"}</small></strong><small>{hasIo ? `After month ${schedule.interest_only_months} · ` : ""}{regularRows.length} scheduled {monthly ? "monthly " : ""}payment{regularRows.length === 1 ? "" : "s"}{!monthly ? ` · ${money(schedule.payment_after_monthly)} initial monthly equivalent` : ""}</small>{regularRange ? <small>{regularRange}</small> : null}</div> : null}
      <div><span>Residual principal at maturity</span><strong>{money(schedule.balloon)}</strong><small>{schedule.balloon > 0 ? `${schedule.term_months ? `Due in month ${schedule.term_months}` : "Due at maturity"}, plus the last installment` : "No residual principal due"}</small></div>
    </div>
    <p>{schedule.term_months ? `Maturity stays at ${schedule.term_months} months. ` : ""}{schedule.amortization_months != null ? `${schedule.amortization_months}-month amortization starts after any interest-only period; it does not extend maturity. ${hasRepayment && schedule.term_months != null && schedule.amortization_months > schedule.term_months - schedule.interest_only_months ? `Only ${schedule.term_months - schedule.interest_only_months} months of that repayment period occur before maturity, leaving the residual principal above.` : ""}` : hasRepayment ? "The regular repayment period uses the loan term remaining after interest-only." : "Principal is not repaid through the interest-only payments."}</p>
    <p className={styles.phaseStress}><b>First-year scheduled cash:</b> {money(firstYear)}. <b>Underwriting stress:</b> {money(schedule.coverage_payment_monthly)} monthly equivalent / {money(schedule.coverage_annual_debt_service)} annual basis{schedule.repayment_config ? ", including principal due at maturity and scheduled principal payments" : " on the regular payment basis"}. This stress figure is not the regular installment.</p>
    {adjustment ? <p>{adjustment}</p> : null}
  </section>;
}
