"use client";

import { useState } from "react";
import type { LoanScheduleSummary } from "@/lib/loanSchedule";

const money = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

/** The schedule as a table the terms preview can fold open: every period's payment, interest, principal and balance,
 *  rolled up by year past 36 periods so a ten-year loan stays readable. */
export function LoanScheduleTable({ schedule, title }: { schedule: LoanScheduleSummary; title?: string }) {
  const [open, setOpen] = useState(false);
  const perYear = Math.max(1, Math.round(schedule.periods_per_year));
  const rollUp = schedule.rows.length > 36;
  const rows = rollUp
    ? Array.from({ length: Math.ceil(schedule.rows.length / perYear) }, (_, year) => {
        const slice = schedule.rows.slice(year * perYear, (year + 1) * perYear);
        const last = slice[slice.length - 1];
        return { key: `y${year + 1}`, label: `Year ${year + 1}`, phase: slice.every((r) => r.phase === "interest_only") ? "interest_only" : last.phase, payment: slice.reduce((s, r) => s + r.payment, 0), interest: slice.reduce((s, r) => s + r.interest, 0), principal: slice.reduce((s, r) => s + r.principal, 0), balance: last.balance, balloon: last.balloon, exposure_pct: last.exposure_pct };
      })
    : schedule.rows.map((r) => ({ key: String(r.period), label: String(r.period), ...r }));
  return (
    <details className="terms-preview-schedule" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary>{title ?? "Amortization schedule"}<small>{schedule.payment_io != null && schedule.payment_after != null ? `${money(schedule.payment_io)} for ${schedule.interest_only_months} months, then ${money(schedule.payment_after)}` : schedule.structure === "interest_only" ? `${money(schedule.payment_io)} of interest each period; ${money(schedule.balloon, 0)} due at maturity` : `${money(schedule.payment_after ?? schedule.payment_io)} each period`} · total interest {money(schedule.total_interest, 0)} · total paid {money(schedule.total_paid, 0)}</small></summary>
      {open ? (
        <table>
          <thead><tr><th>{rollUp ? "Year" : "Period"}</th><th>Phase</th><th>Payment</th><th>Interest</th><th>Principal</th><th>Balance</th><th>Still out</th></tr></thead>
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
      ) : null}
    </details>
  );
}
