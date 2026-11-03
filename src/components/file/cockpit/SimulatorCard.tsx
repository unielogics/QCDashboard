"use client";

// What if these regular payments stopped? Tick the recurring debits to
// remove (the advance remittances are ticked by default), optionally add
// the payment a refinance would bring, and the card replays the statements:
// withdrawals, net cash flow and ending balances month by month, with the
// cash kept carried forward, plus the coverage the file would show.

import { useEffect, useMemo, useState } from "react";
import { CellChip, Input, Lbl, cx } from "@/components/ds";
import { simulateRemovals } from "@/lib/cockpitSimulation";
import { cadenceLabel, compactMoney, dscrLabel, dscrStatusOf, dscrTone, money, monthShort, multiple, payeeKindTone, type CockpitBankSummary, type CockpitMonth, type FinancialCockpit as Cockpit, type RecurringPayee } from "@/lib/financialCockpit";
import { ChartCard, LineChart, SERIES, type ChartTable } from "./CockpitCharts";

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export function SimulatorCard({ cockpit, months, summary, accountLabel, payees }: { cockpit: Cockpit; months: CockpitMonth[]; summary: CockpitBankSummary; accountLabel: string; payees: RecurringPayee[] }) {
  const recurring = useMemo(() => ({ payees, months_read: cockpit.bank.recurring.months_read }), [payees, cockpit.bank.recurring.months_read]);
  const candidates = useMemo(() => recurring.payees.filter((p) => p.is_debt || p.is_card || (p.monthly_average ?? 0) >= 500), [recurring.payees]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set(recurring.payees.filter((p) => p.kind === "merchant_cash_advance").map((p) => p.key)));
  const [added, setAdded] = useState<string>(() => (cockpit.dscr.proposed?.monthly_payment ? String(cockpit.dscr.proposed.monthly_payment) : ""));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    setRemoved(new Set(recurring.payees.filter((p) => p.kind === "merchant_cash_advance").map((p) => p.key)));
  }, [recurring.payees, touched]);

  const addedMonthly = Number(added.replace(/[^0-9.]/g, "")) || 0;
  const result = useMemo(() => simulateRemovals(months, recurring.payees, removed, addedMonthly, recurring.months_read), [months, recurring.payees, recurring.months_read, removed, addedMonthly]);
  const toggle = (key: string) => {
    setTouched(true);
    setRemoved((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const income = cockpit.dscr.headline?.numerator ?? cockpit.dscr.candidates[0]?.numerator ?? null;
  const serviceNow = cockpit.debt.service.monthly ?? 0;
  const serviceAfter = Math.max(0, serviceNow - result.removedMonthlyAverage + result.addedMonthly);
  const dscrNow = income != null && serviceNow > 0 ? Math.round((income / (serviceNow * 12)) * 100) / 100 : null;
  const dscrAfter = income != null && serviceAfter > 0 ? Math.round((income / (serviceAfter * 12)) * 100) / 100 : null;
  const bands = result.rows.map((r) => ({ key: r.month, label: r.label, short: monthShort(r.month) }));
  const table: ChartTable = {
    caption: "Simulated months",
    cols: ["Month", "Deposits", "Withdrawals", "After", "Net", "Net after", "Ending", "Ending after", "Lowest", "Lowest after (est.)"],
    rows: result.rows.map((r) => ({ key: r.month, cells: [r.label, money(r.deposits), money(r.withdrawals), money(r.withdrawalsAfter), money(r.net), money(r.netAfter), money(r.ending), money(r.endingAfter), money(r.lowest), money(r.lowestAfter)] })),
  };
  if (!months.length) return null;
  return (
    <section className="fc-card fc-wide fc-sim">
      <div className="fc-card-h">
        <div>
          <h4>What if these payments stopped?</h4>
          <div className="sub">
            Tick the regular payments to remove, add the payment a refinance would bring, and the statements replay with the cash kept carried into every later month ({accountLabel}). Lowest balances are estimated: prior months' cash kept plus half of the current month's change.
          </div>
        </div>
        <CellChip tone="mut">{recurring.months_read.length ? `Payees read for ${recurring.months_read.length} of ${months.length} months` : "Payees not read yet"}</CellChip>
      </div>
      {candidates.length ? (
        <div className="fc-sim-picks">
          {candidates.map((p) => (
            <label key={p.key} className={cx("fc-sim-pick", removed.has(p.key) && "on")}>
              <input type="checkbox" checked={removed.has(p.key)} onChange={() => toggle(p.key)} />
              <span className="fc-sim-pick-name">{p.payee}</span>
              <CellChip tone={payeeKindTone(p.kind)}>{p.kind_label}</CellChip>
              <span className="sub">{cadenceLabel(p.cadence)} · {money(p.monthly_average)} / mo</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="fc-empty">No recurring payments to remove yet. Re-read the statements above to extract them.</div>
      )}
      <div className="fc-listing-grid">
        <div className="fc-listing-item">
          <Lbl>Add a monthly payment (the refinance)</Lbl>
          <Input aria-label="Monthly payment to add" inputMode="decimal" placeholder="0" value={added} onChange={(e) => { setTouched(true); setAdded(e.target.value); }} />
          <span className="sub">{cockpit.dscr.proposed ? `Recorded loan terms: ${money(cockpit.dscr.proposed.monthly_payment)} / mo` : "No loan terms recorded; type the payment to test."}</span>
        </div>
        <div className="fc-listing-item">
          <Lbl>Payments removed</Lbl>
          <strong>{money(result.removedMonthlyAverage)} / mo</strong>
          <span className="sub">{removed.size} payee{removed.size === 1 ? "" : "s"} · {money(result.cashKept)} kept over {months.length} months</span>
        </div>
        <div className="fc-listing-item">
          <Lbl>Net cash flow per month</Lbl>
          <strong>{money(result.netBeforeAverage)} → {money(result.netAfterAverage)}</strong>
          <span className="sub">today → simulated</span>
        </div>
        <div className="fc-listing-item">
          <Lbl>Ending balance, last month</Lbl>
          <strong>{money(result.endingBeforeLast)} → {money(result.endingAfterLast)}</strong>
          <span className="sub">months ending negative {result.monthsEndingNegativeBefore} → {result.monthsEndingNegativeAfter} · dipping negative {result.monthsDippingNegativeBefore} → {result.monthsDippingNegativeAfter}</span>
        </div>
        <div className="fc-listing-item">
          <Lbl>Coverage</Lbl>
          <strong>
            {multiple(dscrNow)} → {multiple(dscrAfter)} <CellChip tone={dscrTone(dscrStatusOf(dscrAfter))}>{dscrLabel(dscrStatusOf(dscrAfter)).split(" (")[0]}</CellChip>
          </strong>
          <span className="sub">debt service {money(serviceNow)} → {money(serviceAfter)} / mo on the same income figure{income == null ? " (none yet)" : ""}</span>
        </div>
      </div>
      <ChartCard
        plain
        title="Ending balance, actual against simulated"
        sub={`Lowest balance ${compactMoney(summary.lowest_balance)} today; ${yesNo(result.lowestAfter != null && result.lowestAfter >= 0)} stays above zero simulated (${compactMoney(result.lowestAfter)}).`}
        table={table}
        chart={
          <LineChart
            ariaLabel="Ending balance, actual and simulated"
            bands={bands}
            series={[
              { key: "after", label: "Simulated", color: SERIES.one, values: result.rows.map((r) => r.endingAfter), emphasis: true },
              { key: "before", label: "Actual", color: SERIES.two, values: result.rows.map((r) => r.ending) },
            ]}
          />
        }
      />
    </section>
  );
}
