"use client";

// Negative days and overdrafts, called out: which days the balance went
// negative, the NSF, overdraft and returned-item fees the statements show,
// the lowest balance each month, and how many months dipped below zero.

import { CellChip } from "@/components/ds";
import { count, money, monthShort, type CockpitMonth, type CockpitOverdrafts } from "@/lib/financialCockpit";
import { ChartCard, ColumnChart, SERIES, type ChartTable } from "./CockpitCharts";

const TYPE_LABEL: Record<string, string> = { nsf_fee: "NSF fee", overdraft_fee: "Overdraft fee", returned_item: "Returned item", negative_balance: "Negative balance", other: "Other" };

function overdraftsFor(months: CockpitMonth[]): CockpitOverdrafts {
  const byMonth = months.map((m) => ({ month: m.month, label: m.label, negative_dates: m.negative_dates ?? [], negative_days: m.negative_days ?? 0, nsf: m.nsf ?? 0, returned_checks: m.returned_checks ?? 0, low_balance: m.low_balance, ending_balance: m.ending_balance, fees: m.fees ?? null, items: (m.overdraft_items ?? []).map((i) => ({ ...i, month: m.month })) }));
  const items = byMonth.flatMap((m) => m.items);
  const fees = byMonth.reduce((s, m) => s + (m.fees ?? 0), 0);
  const lows = byMonth.map((m) => m.low_balance).filter((v): v is number => v != null);
  return {
    by_month: byMonth,
    items,
    negative_days_total: byMonth.reduce((s, m) => s + m.negative_days, 0),
    negative_months: byMonth.filter((m) => m.negative_days || (m.low_balance != null && m.low_balance < 0)).map((m) => m.month),
    nsf_total: byMonth.reduce((s, m) => s + m.nsf, 0),
    returned_total: byMonth.reduce((s, m) => s + m.returned_checks, 0),
    fees_total: fees || null,
    lowest_balance: lows.length ? Math.min(...lows) : null,
  };
}

export function OverdraftCard({ months, accountLabel, needReread }: { months: CockpitMonth[]; accountLabel: string; needReread: number }) {
  const od = overdraftsFor(months);
  const bands = months.map((m) => ({ key: m.month, label: m.label, short: monthShort(m.month) }));
  const table: ChartTable = {
    caption: "Negative days and overdrafts by month",
    cols: ["Month", "Lowest", "Ending", "Negative days", "NSF / overdraft", "Returned", "Fees"],
    rows: od.by_month.map((m) => ({ key: m.month, cells: [`${m.label}${m.negative_dates.length ? ` · ${m.negative_dates.map((d) => d.slice(5)).join(", ")}` : ""}`, money(m.low_balance), money(m.ending_balance), count(m.negative_days), count(m.nsf), count(m.returned_checks), money(m.fees)] })),
  };
  return (
    <ChartCard
      title="Negative days and overdrafts"
      sub={
        <span className="fc-chips">
          <CellChip tone={od.negative_days_total ? "bad" : "ok"}>{od.negative_days_total} negative-balance day{od.negative_days_total === 1 ? "" : "s"}</CellChip>
          <CellChip tone={od.negative_months.length ? "warn" : "ok"}>{od.negative_months.length ? `Dipped below zero in ${od.negative_months.map(monthShort).join(", ")}` : "Never below zero"}</CellChip>
          <CellChip tone={od.nsf_total ? "bad" : "ok"}>{od.nsf_total} NSF / overdraft item{od.nsf_total === 1 ? "" : "s"}</CellChip>
          {od.fees_total ? <CellChip tone="warn">{money(od.fees_total)} in fees</CellChip> : null}
          <CellChip tone="mut">Lowest {money(od.lowest_balance)} · {accountLabel}</CellChip>
          {needReread ? <CellChip tone="mut">Fee items appear after a re-read</CellChip> : null}
        </span>
      }
      table={table}
      chart={
        <div className="grid g8">
          <ColumnChart ariaLabel="Negative-balance days per month" bands={bands} format={(v) => count(v)} series={[{ key: "neg", label: "Negative-balance days", color: SERIES.two, values: months.map((m) => m.negative_days ?? 0) }]} emptyLabel="No months to chart." height={150} />
          {od.items.length ? (
            <ul className="fc-notes" aria-label="Overdraft items">
              {od.items.slice(0, 12).map((item, i) => (
                <li key={`${item.month}-${i}`}>
                  {item.date ?? item.month} · {TYPE_LABEL[item.type] ?? item.type}{item.amount != null ? ` · ${money(item.amount)}` : ""}{item.description ? ` · ${item.description}` : ""}{item.account ? ` · ${item.account}` : ""}
                </li>
              ))}
              {od.items.length > 12 ? <li>and {od.items.length - 12} more in the table.</li> : null}
            </ul>
          ) : null}
        </div>
      }
    />
  );
}
