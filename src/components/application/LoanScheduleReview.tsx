"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnChart, LineChart, SERIES } from "@/components/file/cockpit/CockpitCharts";
import { riskProfile, type LoanScheduleSummary } from "@/lib/loanSchedule";
import { LOAN_SCHEDULE_PAGE_SIZE, loanScheduleRows } from "@/lib/loanScheduleView";
import { LoanScheduleTable } from "./LoanScheduleTable";
import styles from "./LoanScheduleReview.module.css";

const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const ratio = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}x`;
const month = (value: number | null | undefined) => value == null ? "Not reached" : `Month ${value}`;

/** A full workspace for the same working loan shown by the terms editor. */
export function LoanScheduleReview({ schedule, incomeMonthly, existingServiceMonthly, incomeCurrencyComparable = false, earningsBasis }: { schedule: LoanScheduleSummary; incomeMonthly?: number | null; existingServiceMonthly?: number | null; incomeCurrencyComparable?: boolean; earningsBasis?: string }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const risk = useMemo(() => riskProfile(schedule, incomeMonthly, existingServiceMonthly, incomeCurrencyComparable), [schedule, incomeMonthly, existingServiceMonthly, incomeCurrencyComparable]);
  const rows = useMemo(() => loanScheduleRows(schedule, risk), [schedule, risk]);
  const scheduleKey = JSON.stringify([schedule.amount, schedule.rate_pct, schedule.term_months, schedule.structure, schedule.interest_only_months, schedule.periods_per_year, schedule.repayment_config]);
  useEffect(() => { setPageIndex(0); setSelectedPeriod(null); }, [scheduleKey]);
  const page = Math.min(pageIndex, Math.max(0, Math.ceil(rows.length / LOAN_SCHEDULE_PAGE_SIZE) - 1));
  const shown = rows.slice(page * LOAN_SCHEDULE_PAGE_SIZE, (page + 1) * LOAN_SCHEDULE_PAGE_SIZE);
  const selected = shown.find((row) => row.period === selectedPeriod) ?? shown[0];
  const bands = shown.map((row, index) => ({ key: String(row.period), label: `Payment ${row.period}, month ${row.month}`, short: shown.length > 12 && index % 3 !== 0 && index !== shown.length - 1 ? "" : String(row.period), muted: row.phase === "interest_only" }));
  return <section className={styles.review} aria-label="Amortization and loan risk review">
    <div className={styles.head}><div><h3>Amortization schedule</h3><p>Principal, interest and actual cash due from the current working loan.</p></div><span className="sub">{schedule.periods_per_year} payments per year · {schedule.periods} payments</span></div>
    <div className={styles.metrics}>
      <div><span>Loan principal</span><strong>{money(schedule.amount)}</strong><small>{schedule.rate_pct}% APR · {schedule.structure_label}</small></div>
      <div><span>Loan maturity</span><strong>{schedule.term_months == null ? "Not set" : `${schedule.term_months} months`}</strong><small>{schedule.amortization_months != null ? `${schedule.amortization_months}-month amortization after ${schedule.interest_only_months} interest-only months` : schedule.interest_only_months ? `${schedule.interest_only_months} interest-only months first` : "Repayment follows the loan term"}</small></div>
      <div><span>Regular payment after interest-only</span><strong>{money(schedule.payment_after ?? schedule.payment_io)}</strong><small>{schedule.payment_io != null && schedule.payment_after != null ? `${money(schedule.payment_io)} during the interest-only period` : "Per scheduled payment"}</small></div>
      <div><span>Residual balloon at maturity</span><strong>{money(schedule.balloon)}</strong><small>{schedule.balloon_pct}% of original principal · included once in actual cash due</small></div>
    </div>
    <div className={styles.charts}>
      <section className={styles.chart}><h4>Principal and interest due</h4><ColumnChart ariaLabel="Actual principal and interest by payment, including balloon principal" bands={bands} series={[{ key: "interest", label: "Interest", color: SERIES.two, values: shown.map((row) => row.interest) }, { key: "principal", label: "Principal, including balloons", color: SERIES.one, values: shown.map((row) => row.principal), emphasis: true }]} height={210} /></section>
      <section className={styles.chart}><h4>Principal paid down and remaining exposure</h4><LineChart ariaLabel="Principal paid down and remaining principal as percentages of original loan" bands={bands} series={[{ key: "paid", label: "Principal paid down", color: SERIES.one, values: shown.map((row) => row.paidDownPct), emphasis: true }, { key: "remaining", label: "Principal still outstanding", color: SERIES.two, values: shown.map((row) => row.principalExposurePct) }]} format={(value) => value == null ? "—" : `${value.toFixed(1)}%`} axisFormat={(value) => `${Math.round(value)}%`} height={210} /></section>
      {risk?.coverage_by_period.length ? <section className={`${styles.chart} ${styles.riskChart}`}><h4>Coverage on each payment</h4><LineChart ariaLabel="Cash coverage on each actual payment including maturity balloon" bands={bands} series={[{ key: "coverage", label: "Payment-period coverage", color: SERIES.one, values: shown.map((row) => row.coverage), emphasis: true }]} format={ratio} axisFormat={(value) => `${value.toFixed(2)}x`} height={175} /><p>Payment-period liquidity uses actual cash due. Annual underwriting coverage uses {schedule.repayment_config ? "peak rolling twelve-month cash due" : "the recorded regular payment basis"}.</p></section> : null}
    </div>
    {rows.length > LOAN_SCHEDULE_PAGE_SIZE ? <p>Charts follow the payment page selected below. Browse the final page to inspect the maturity payment.</p> : null}
    <LoanScheduleTable full schedule={schedule} risk={risk} pageIndex={page} onPageIndex={(next) => { setPageIndex(next); setSelectedPeriod(null); }} selectedPeriod={selected?.period} onSelectPeriod={setSelectedPeriod} />
    {selected ? <section className={styles.inspector} aria-label={`Payment ${selected.period} details`}>
      <div><h4>Payment {selected.period} · month {selected.month}</h4><p>{selected.maturity_balloon ? `Includes ${money(selected.maturity_balloon)} of residual principal due at maturity.` : selected.scheduled_balloon ? `Includes ${money(selected.scheduled_balloon)} of additional principal.` : selected.phase === "interest_only" ? "Interest-only period; principal remains outstanding." : "Regular principal and interest payment."}</p></div>
      <dl><div><dt>Cash due</dt><dd>{money(selected.cash)}</dd></div><div><dt>Principal / interest</dt><dd>{money(selected.principal)} / {money(selected.interest)}</dd></div><div><dt>Remaining principal</dt><dd>{money(selected.balance)}</dd></div><div><dt>Principal paid down</dt><dd>{selected.paidDownPct.toFixed(1)}%</dd></div><div><dt>Interest received to date</dt><dd>{money(selected.interestPaid)}</dd></div><div><dt>Payment coverage</dt><dd>{ratio(selected.coverage)}</dd></div></dl>
    </section> : null}
    <section className={styles.risk} aria-label="Loan repayment risk calculations"><h4>Repayment and exposure</h4>
      <p>Coverage basis: {earningsBasis ?? "Selected annual earnings"}. Annual earnings divided by twelve: {incomeMonthly == null ? "unavailable" : incomeCurrencyComparable ? money(incomeMonthly) : `${incomeMonthly.toLocaleString(undefined, { maximumFractionDigits: 2 })} (currency unconfirmed)`}; remaining existing debt service: {money(existingServiceMonthly)} per month.</p>
      <div className={styles.metrics}><div><span>Weighted average principal life</span><strong>{schedule.weighted_average_life_months} months</strong></div><div><span>Half of principal repaid</span><strong>{month(schedule.recovery_milestones["50"])}</strong></div><div><span>Full principal repaid</span><strong>{month(schedule.recovery_milestones["100"])}</strong></div><div><span>Minimum actual payment-period ratio</span><strong>{ratio(risk?.lowest_cash_coverage)}</strong></div></div>
      <p>{risk?.words}</p><p>{schedule.breakeven_month == null ? "Cash receipts have not recovered the original advance within the modeled schedule." : `Cash receipts recover the original advance by month ${schedule.breakeven_month}, counting interest received.`} Remaining principal continues to be credit exposure until it is paid.</p>
      <p>Peak coverage shortfall · monthly equivalent: {money(risk?.peak_cash_shortfall_monthly)}{risk?.peak_cash_shortfall_month != null ? ` at month ${risk.peak_cash_shortfall_month}` : ""}. This uses the selected earnings basis against cash due, rather than a forecast of actual bank balances.</p>
      {risk?.coverage_note && !risk.words.includes(risk.coverage_note) ? <p>{risk.coverage_note}</p> : null}
      {risk?.coverage_unavailable_reason && !risk.words.includes(risk.coverage_unavailable_reason) ? <p>{risk.coverage_unavailable_reason}</p> : null}
      <p>Total interest {money(schedule.total_interest)} · total cash paid {money(schedule.total_paid)} · annual debt-service basis {money(schedule.coverage_annual_debt_service)}.</p>
      {incomeMonthly == null || existingServiceMonthly == null ? <p>Establish annual earnings and remaining debt service to calculate payment coverage.</p> : null}
    </section>
  </section>;
}
