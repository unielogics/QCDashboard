"use client";

// The financial cockpit: the file's numbers as a reader sees them, on demand,
// without generating a package. Bank statements month by month (deposits,
// withdrawals, beginning, average, ending and low balances, NSF), tax years,
// the profit-and-loss ladder, the expense lines worth tracking, the debt
// schedule and the debt service it implies, a DSCR whose basis is spelled
// out, and a net-profit conclusion, every figure naming its source. The last
// panel ties readiness, the recorded loan terms and the package to the one
// action the desk was missing on this page: publishing the file to the
// capital-partner marketplace.
//
// Everything numeric comes from GET /application-profiles/{id}/financial-cockpit
// (app/services/financial_cockpit.py); this component only arranges it.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Btn, Callout, CellChip, Kpi, KpiRow, Lbl, Loading, StatusLine, cx, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useFinancialCockpit } from "@/hooks/useApi";
import { useCpCreateListing, useCpPrefill, useCpSourceLookup } from "@/hooks/useCapitalPartners";
import type { ApplicationProgramReadiness, ApplicationTermSheetState } from "@/lib/applicationProfile";
import {
  compactMoney,
  confidenceLabel,
  confidenceTone,
  count,
  dscrLabel,
  dscrTone,
  money,
  monthShort,
  multiple,
  ratioPct,
  signedPct,
  sourceLabel,
  trendDirection,
  type CockpitDscrCandidate,
  type CockpitMonth,
  type CockpitProfitCandidate,
  type FinancialCockpit as Cockpit,
} from "@/lib/financialCockpit";
import { ChartCard, ColumnChart, HBarList, LineChart, Meter, SERIES, Sparkline, type ChartBand, type ChartTable } from "./CockpitCharts";

export type CockpitPackageState = { generated: boolean; inSync: boolean; summaryVersion: number | null; packetVersion: number | null };

type Props = {
  profileId: string;
  businessName: string;
  canPublish: boolean;
  canRecordTerms: boolean;
  programReadiness: ApplicationProgramReadiness | null;
  termSheet: ApplicationTermSheetState | null;
  packageState: CockpitPackageState;
  focus: "marketplace" | null;
  onFocusHandled: () => void;
  onRecordTerms: () => void;
  onOpenEvidence: () => void;
  onOpenPackage: () => void;
};

const toneForSign = (value: number | null | undefined): ChipTone => (value == null ? "mut" : value < 0 ? "bad" : "ok");
const yesNo = (value: boolean) => (value ? "Yes" : "No");

function Card({ title, sub, children, wide, actions, id, innerRef }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean; actions?: ReactNode; id?: string; innerRef?: React.Ref<HTMLElement> }) {
  return (
    <section className={cx("fc-card", wide && "fc-wide")} id={id} ref={innerRef}>
      <div className="fc-card-h">
        <div>
          <h4>{title}</h4>
          {sub ? <div className="sub">{sub}</div> : null}
        </div>
        {actions ? <div className="row" style={{ gap: 8, alignItems: "center" }}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="fc-stat">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="fc-empty">
      <div className="grid g6" style={{ justifyItems: "center" }}>
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bank statements
// ---------------------------------------------------------------------------

function monthBands(months: CockpitMonth[]): ChartBand[] {
  return months.map((m) => ({ key: m.month, label: m.label, short: monthShort(m.month), muted: !m.accepted }));
}

function BankCards({ cockpit, onOpenEvidence }: { cockpit: Cockpit; onOpenEvidence: () => void }) {
  const months = cockpit.bank.months;
  const summary = cockpit.bank.summary;
  const bands = monthBands(months);
  if (!months.length) {
    return (
      <Card title="Bank statements" wide>
        <Empty action={<Btn size="sm" onClick={onOpenEvidence}>Open the evidence room</Btn>}>No bank statement has been analyzed yet. Upload or request statements and the months fill in here.</Empty>
      </Card>
    );
  }
  const unaccepted = months.filter((m) => !m.accepted).length;
  const accounts = cockpit.bank.accounts;
  const coverageSub = (
    <span className="fc-chips">
      {accounts.map((a) => (
        <CellChip key={a.key} tone="mut">{a.label} · {a.months.length} mo</CellChip>
      ))}
      {summary.gaps.length ? <CellChip tone="warn">Missing {summary.gaps.map((g) => monthShort(g)).join(", ")}</CellChip> : null}
      {unaccepted ? <CellChip tone="warn">{unaccepted} month{unaccepted === 1 ? "" : "s"} not yet accepted (lighter marks)</CellChip> : null}
    </span>
  );
  const flowTable: ChartTable = {
    caption: "Deposits and withdrawals by month",
    cols: ["Month", "Deposits", "Deposits (#)", "Withdrawals", "Net", "Outflow ratio", "Accepted"],
    rows: months.map((m) => ({ key: m.month, muted: !m.accepted, cells: [m.label, money(m.deposits), count(m.deposit_count), money(m.withdrawals), money(m.net), ratioPct(m.outflow_ratio), yesNo(m.accepted)] })),
  };
  const balanceTable: ChartTable = {
    caption: "Balances by month",
    cols: ["Month", "Beginning", "Average", "Ending", "Lowest", "NSF", "Negative days"],
    rows: months.map((m) => ({ key: m.month, muted: !m.accepted, cells: [m.label, money(m.beginning_balance), money(m.average_balance), money(m.ending_balance), money(m.low_balance), count(m.nsf), count(m.negative_days)] })),
  };
  const netTable: ChartTable = {
    caption: "Net cash flow by month",
    cols: ["Month", "Deposits", "Withdrawals", "Net"],
    rows: months.map((m) => ({ key: m.month, muted: !m.accepted, cells: [m.label, money(m.deposits), money(m.withdrawals), money(m.net)] })),
  };
  return (
    <>
      <ChartCard
        title="Deposits and withdrawals"
        sub={coverageSub}
        table={flowTable}
        chart={
          <ColumnChart
            ariaLabel={`Deposits and withdrawals for ${months.length} months`}
            bands={bands}
            series={[
              { key: "deposits", label: "Deposits", color: SERIES.one, values: months.map((m) => m.deposits), emphasis: true },
              { key: "withdrawals", label: "Withdrawals", color: SERIES.two, values: months.map((m) => m.withdrawals) },
            ]}
          />
        }
      />
      <ChartCard
        title="Balances"
        sub={summary.average_balance_basis === "ending_balance" ? "Average balance is read from ending balances; the statements print no average ledger balance." : "Ending, average ledger and lowest daily balance; beginning balances sit in the table."}
        table={balanceTable}
        chart={
          <LineChart
            ariaLabel={`Ending, average and lowest balances for ${months.length} months`}
            bands={bands}
            series={[
              { key: "ending", label: "Ending balance", color: SERIES.one, values: months.map((m) => m.ending_balance), emphasis: true },
              { key: "average", label: "Average balance", color: SERIES.two, values: months.map((m) => m.average_balance) },
              { key: "low", label: "Lowest balance", color: SERIES.context, values: months.map((m) => m.low_balance) },
            ]}
          />
        }
      />
      <ChartCard
        title="Net cash flow"
        sub="Deposits minus withdrawals each month. Owner draws, transfers and advance payments count as withdrawals, so read it as a floor."
        table={netTable}
        chart={
          <ColumnChart
            ariaLabel={`Net cash flow for ${months.length} months`}
            bands={bands}
            diverging={{ positive: "Cash kept", negative: "Cash shortfall" }}
            series={[{ key: "net", label: "Net cash flow", color: SERIES.one, values: months.map((m) => m.net) }]}
          />
        }
      />
      <Card title="Statement patterns" sub={`${summary.months} months, ${summary.first_month ? monthShort(summary.first_month) : ""} to ${summary.last_month ? monthShort(summary.last_month) : ""}`}>
        <div className="fc-stat-list">
          <Stat label="Deposit trend, later months against earlier">{signedPct(summary.deposit_trend_pct)}</Stat>
          <Stat label="Deposit volatility (swing around the average)">{summary.deposit_volatility_pct == null ? "—" : `${summary.deposit_volatility_pct.toFixed(0)}%`}</Stat>
          <Stat label="Highest and lowest deposit months">{summary.highest_month ? `${monthShort(summary.highest_month)} · ${summary.lowest_month ? monthShort(summary.lowest_month) : "—"}` : "—"}</Stat>
          <Stat label="Average deposits per month (count)">{summary.avg_deposit_count == null ? "—" : summary.avg_deposit_count.toFixed(1)}</Stat>
          <Stat label="Average outflow ratio (withdrawals ÷ deposits)">{ratioPct(summary.avg_outflow_ratio)}</Stat>
          <Stat label="NSF or overdraft items · returned checks · negative-balance days">{`${summary.nsf_total} · ${summary.returned_checks_total} · ${summary.negative_days_total}`}</Stat>
          <Stat label="Annualized deposits · withdrawals · net">{summary.estimates_available ? `${compactMoney(summary.annualized_deposits)} · ${compactMoney(summary.annualized_withdrawals)} · ${compactMoney(summary.annualized_net)}` : "Needs three months"}</Stat>
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tax returns, profit and loss, balance sheet, expenses
// ---------------------------------------------------------------------------

const TAX_LINES: Array<[keyof Cockpit["tax"]["years"][number], string]> = [
  ["gross_receipts", "Gross receipts"],
  ["total_income", "Total income"],
  ["cost_of_goods_sold", "Cost of goods sold"],
  ["ordinary_business_income", "Ordinary business income"],
  ["net_income", "Net income"],
  ["net_income_per_books", "Net income per books"],
  ["taxable_income", "Taxable income"],
  ["officer_compensation", "Officer compensation"],
  ["salaries_and_wages", "Salaries and wages"],
  ["rent", "Rent"],
  ["interest", "Interest"],
  ["depreciation", "Depreciation"],
  ["taxes_and_licenses", "Taxes and licenses"],
  ["total_deductions", "Total deductions"],
  ["ebitda", "EBITDA (income + interest + depreciation)"],
];

function TaxCard({ cockpit, onOpenEvidence }: { cockpit: Cockpit; onOpenEvidence: () => void }) {
  const years = cockpit.tax.years;
  if (!years.length) {
    return (
      <Card title="Tax returns">
        <Empty action={<Btn size="sm" onClick={onOpenEvidence}>Request tax returns</Btn>}>No tax return analyzed yet. Until one lands, EBITDA, DSCR and net profit lean on statements.</Empty>
      </Card>
    );
  }
  const latest = years[years.length - 1];
  const bands: ChartBand[] = years.map((y) => ({ key: y.year, label: `Tax year ${y.year}`, short: y.year, muted: !y.accepted }));
  const table: ChartTable = {
    caption: "Tax return lines by year",
    cols: ["Line", ...years.map((y) => y.year)],
    rows: TAX_LINES.filter(([key]) => years.some((y) => y[key] != null)).map(([key, label]) => ({ key: String(key), cells: [label, ...years.map((y) => money(y[key] as number | null))] })),
  };
  const sub = (
    <span className="fc-chips">
      {latest.entity ? <CellChip tone="mut">{latest.entity}</CellChip> : null}
      {latest.gross_receipts_change_pct != null ? <CellChip tone={latest.gross_receipts_change_pct >= 0 ? "ok" : "warn"}>Receipts {signedPct(latest.gross_receipts_change_pct)} vs prior year</CellChip> : null}
      {latest.income_change_pct != null ? <CellChip tone={latest.income_change_pct >= 0 ? "ok" : "warn"}>Income {signedPct(latest.income_change_pct)} vs prior year</CellChip> : null}
      {latest.income_basis ? <CellChip tone="mut">Income basis: {latest.income_basis}</CellChip> : null}
      {!latest.ebitda_complete ? <CellChip tone="warn">Interest or depreciation not read</CellChip> : null}
    </span>
  );
  return (
    <ChartCard
      title="Tax returns"
      sub={sub}
      table={table}
      chart={
        <ColumnChart
          ariaLabel={`Gross receipts and income by tax year`}
          bands={bands}
          series={[
            { key: "receipts", label: "Gross receipts", color: SERIES.one, values: years.map((y) => y.gross_receipts), emphasis: true },
            { key: "income", label: latest.income_basis ? `Income (${latest.income_basis})` : "Income", color: SERIES.two, values: years.map((y) => y.income) },
          ]}
        />
      }
    />
  );
}

function ProfitAndLossCard({ cockpit }: { cockpit: Cockpit }) {
  const pl = cockpit.profit_and_loss;
  if (!pl) {
    return (
      <Card title="Profit and loss">
        <Empty>No profit-and-loss statement analyzed. The template on the resources page extracts cleanly when the client fills it in.</Empty>
      </Card>
    );
  }
  const months = pl.months_covered ?? null;
  const sub = (
    <span className="fc-chips">
      <CellChip tone="mut">{pl.period_label ?? "Period unknown"}{months ? ` · ${months} months` : ""}</CellChip>
      {pl.basis ? <CellChip tone="mut">{pl.basis}</CellChip> : null}
      <CellChip tone={pl.typed ? "ok" : "warn"}>{pl.typed ? "Typed statement" : "Free-form statement"}</CellChip>
      <CellChip tone={pl.accepted ? "ok" : "warn"}>{pl.accepted ? "Accepted" : "Not yet accepted"}</CellChip>
    </span>
  );
  const rows = [
    { key: "revenue", label: "Gross revenue", value: pl.gross_revenue },
    { key: "cogs", label: "Cost of goods sold", value: pl.cost_of_goods_sold == null ? null : -Math.abs(pl.cost_of_goods_sold), muted: true },
    { key: "gross", label: "Gross profit", value: pl.gross_profit, sub: pl.gross_margin == null ? undefined : `${ratioPct(pl.gross_margin)} margin` },
    { key: "opex", label: "Operating expenses", value: pl.total_operating_expenses == null ? null : -Math.abs(pl.total_operating_expenses), muted: true, sub: pl.opex_ratio == null ? undefined : `${ratioPct(pl.opex_ratio)} of revenue` },
    { key: "operating", label: "Operating income", value: pl.operating_income },
    { key: "net", label: "Net income", value: pl.net_income, sub: pl.net_margin == null ? undefined : `${ratioPct(pl.net_margin)} margin` },
    { key: "ebitda", label: "EBITDA", value: pl.ebitda, sub: "net income + interest + income taxes + D&A" },
  ].filter((row) => row.value != null);
  return (
    <Card title="Profit and loss" sub={sub}>
      <HBarList rows={rows} />
      {months && months < 12 ? (
        <div className="fc-stat-list">
          <Stat label="Annualized revenue">{money(pl.annualized_revenue)}</Stat>
          <Stat label="Annualized net income">{money(pl.annualized_net_income)}</Stat>
          <Stat label="Annualized EBITDA">{money(pl.annualized_ebitda)}</Stat>
        </div>
      ) : null}
      {pl.statements.length > 1 ? <div className="sub">{pl.statements.length} statements analyzed; the latest period leads.</div> : null}
    </Card>
  );
}

function BalanceSheetCard({ cockpit }: { cockpit: Cockpit }) {
  const bs = cockpit.balance_sheet;
  if (!bs) return null;
  return (
    <Card title="Balance sheet" sub={`${bs.as_of_date ? `As of ${bs.as_of_date}` : "Date unknown"}${bs.basis ? ` · ${bs.basis}` : ""}`}>
      <div className="fc-stat-list">
        <Stat label="Cash">{money(bs.cash)}</Stat>
        <Stat label="Current assets · current liabilities">{`${compactMoney(bs.total_current_assets)} · ${compactMoney(bs.total_current_liabilities)}`}</Stat>
        <Stat label="Current ratio">{bs.current_ratio == null ? "—" : `${bs.current_ratio.toFixed(2)}x`}</Stat>
        <Stat label="Total assets · total liabilities">{`${compactMoney(bs.total_assets)} · ${compactMoney(bs.total_liabilities)}`}</Stat>
        <Stat label="Equity">{money(bs.total_equity)}</Stat>
        <Stat label="Debt to equity">{bs.debt_to_equity == null ? "—" : `${bs.debt_to_equity.toFixed(2)}x`}</Stat>
      </div>
    </Card>
  );
}

function ExpensesCard({ cockpit }: { cockpit: Cockpit }) {
  const { lines, outflow_ratio, opex_ratio, cogs_ratio, debt_service_to_deposits } = cockpit.expenses;
  const table: ChartTable | null = lines.length
    ? {
        caption: "Expense lines",
        cols: ["Line", "Amount", "Period", "Annualized", "Of revenue", "Source"],
        rows: lines.map((line) => ({ key: line.key, cells: [line.label, money(line.amount), line.period ?? "—", money(line.annualized), ratioPct(line.ratio_to_revenue), sourceLabel(line.source)] })),
      }
    : null;
  return (
    <Card title="Expenses we can track" sub="Lines the documents print, each with its period and source; bank outflows and debt service sit beside them for scale.">
      <div className="fc-stat-list">
        <Stat label="Outflows as a share of deposits">{ratioPct(outflow_ratio)}</Stat>
        <Stat label="Operating expenses as a share of revenue">{ratioPct(opex_ratio)}</Stat>
        <Stat label="Cost of goods sold as a share of revenue">{ratioPct(cogs_ratio)}</Stat>
        <Stat label="Debt service as a share of monthly deposits">{ratioPct(debt_service_to_deposits)}</Stat>
      </div>
      {table ? (
        <ChartCard plain title="Lines" table={table} chart={<HBarList rows={lines.filter((l) => l.amount != null).slice(0, 10).map((l) => ({ key: l.key, label: l.label, value: l.annualized ?? l.amount, sub: `${sourceLabel(l.source)}${l.period ? ` · ${l.period}` : ""}${l.annualized != null && l.annualized !== l.amount ? " · annualized" : ""}` }))} />} />
      ) : (
        <Empty>No expense lines yet: a profit-and-loss statement or a tax return fills this in.</Empty>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Debt, DSCR, net profit
// ---------------------------------------------------------------------------

function DebtCard({ cockpit }: { cockpit: Cockpit }) {
  const { rows, documented, document, service } = cockpit.debt;
  const scheduleTable: ChartTable | null = rows.length
    ? {
        caption: "Debt schedule rows on the file",
        cols: ["Lender", "Type", "Balance", "Monthly", "Rate / factor", "Maturity", "In DSCR"],
        rows: rows.map((r) => ({
          key: r.id || r.lender,
          muted: !r.count_in_dscr,
          cells: [r.lender, r.is_mca ? "Advance" : r.category.replace(/_/g, " "), money(r.balance), money(r.monthly_payment), r.factor_rate != null ? `${r.factor_rate.toFixed(2)} factor` : r.rate != null ? `${r.rate}%` : "—", r.maturity_on ?? "—", yesNo(r.count_in_dscr)],
        })),
      }
    : null;
  const documentedTable: ChartTable | null = documented.length
    ? {
        caption: "Debts read off documents",
        cols: ["Funder", "Balance", "Monthly", "Cadence", "Maturity"],
        rows: documented.map((d, i) => ({ key: `${d.lender}-${i}`, cells: [d.lender, money(d.balance), money(d.monthly_payment), d.payment_frequency ? `${money(d.payment_amount)} ${d.payment_frequency}` : "monthly", d.maturity_on ?? "—"] })),
      }
    : null;
  return (
    <Card title="Debt schedule and debt service" sub="Rows a person entered or confirmed win; then the total printed on an uploaded schedule; then the payments read off advance terms. Edit rows under Underwriting → Financial forms.">
      <div className="fc-stat-list">
        <Stat label={<>Monthly debt service <CellChip tone={service.source === "none" ? "warn" : "mut"}>{sourceLabel(service.source)}</CellChip></>}>{money(service.monthly)}</Stat>
        <Stat label="Annual debt service">{money(service.annual)}</Stat>
        {service.schedule_monthly != null ? <Stat label={`Schedule rows (${service.schedule_rows_counted} counted)`}>{`${money(service.schedule_monthly)} / mo · ${compactMoney(service.schedule_balance)} owed`}</Stat> : null}
        {service.document_monthly != null || service.document_balance != null ? <Stat label="Uploaded schedule total">{`${money(service.document_monthly)} / mo · ${compactMoney(service.document_balance)} owed`}</Stat> : null}
        {service.documented_monthly != null ? <Stat label="Advance terms read off documents">{`${money(service.documented_monthly)} / mo · ${compactMoney(service.documented_balance)} owed`}</Stat> : null}
        <Stat label="Active advances (MCA)">{service.mca_count ? `${service.mca_count} · ${money(service.mca_monthly)} / mo · ${compactMoney(service.mca_balance)} owed` : "None on file"}</Stat>
      </div>
      {scheduleTable ? <ChartCard plain title="Schedule rows" table={scheduleTable} chart={<HBarList rows={rows.map((r) => ({ key: r.id || r.lender, label: r.lender, value: r.monthly_payment, muted: !r.count_in_dscr, sub: `${r.is_mca ? "Advance" : r.category.replace(/_/g, " ")}${r.balance != null ? ` · ${compactMoney(r.balance)} owed` : ""}${r.count_in_dscr ? "" : " · excluded from DSCR"}` }))} />} /> : null}
      {documentedTable ? <ChartCard plain title="Read off documents" table={documentedTable} chart={<HBarList rows={documented.map((d, i) => ({ key: `${d.lender}-${i}`, label: d.lender, value: d.monthly_payment, sub: `${d.is_mca ? "Advance" : "Loan"}${d.balance != null ? ` · ${compactMoney(d.balance)} owed` : ""}${d.payment_frequency ? ` · ${d.payment_frequency}` : ""}` }))} />} /> : null}
      {!scheduleTable && !documentedTable ? <Empty>No debt on file. {document ? "The uploaded schedule printed no rows." : "Enter the debt schedule, or upload one, to compute the coverage."}</Empty> : null}
    </Card>
  );
}

function CandidateRows({ candidates }: { candidates: CockpitDscrCandidate[] }) {
  return (
    <table className="tbl fc-candidates">
      <thead>
        <tr>
          <th>Basis</th>
          <th className="r">Income figure</th>
          <th className="r">Debt service</th>
          <th className="r">DSCR</th>
          <th className="r">With the new loan</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        {candidates.map((c) => (
          <tr key={c.key}>
            <td>
              {c.label}
              <small>{c.numerator_label}{c.period ? ` · ${c.period}` : ""}</small>
              {c.note ? <small>{c.note}</small> : null}
            </td>
            <td className="r num">{money(c.numerator)}</td>
            <td className="r num">{money(c.annual_debt_service)}</td>
            <td className="r num">
              {multiple(c.value)} {c.value != null ? <CellChip tone={dscrTone(c.status)}>{dscrLabel(c.status).split(" (")[0]}</CellChip> : null}
            </td>
            <td className="r num">{multiple(c.pro_forma_value)}</td>
            <td>
              <CellChip tone={confidenceTone(c.confidence)}>{confidenceLabel(c.confidence)}</CellChip>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DscrCard({ cockpit, canRecordTerms, onRecordTerms }: { cockpit: Cockpit; canRecordTerms: boolean; onRecordTerms: () => void }) {
  const { headline, pro_forma_headline, candidates, proposed, thresholds, reason, annual_debt_service, debt_service_source } = cockpit.dscr;
  const tone = dscrTone(headline?.status);
  const marks = [
    { at: thresholds.acceptable, label: `${thresholds.acceptable.toFixed(2)}x` },
    { at: thresholds.healthy, label: `${thresholds.healthy.toFixed(2)}x` },
    { at: thresholds.very_strong, label: `${thresholds.very_strong.toFixed(2)}x` },
  ];
  return (
    <Card title="Debt service coverage" wide sub="Income available for debt payments against the payments due. Below 1.00x the business does not cover its debt; lenders usually look for 1.25x.">
      <div className="fc-grid">
        <div className="grid g8">
          <div className="fc-hero">
            {multiple(headline?.value)}
            <small>{headline ? headline.label : "not available"}</small>
          </div>
          <div className="fc-chips">
            <CellChip tone={tone}>{dscrLabel(headline?.status)}</CellChip>
            {headline ? <CellChip tone={confidenceTone(headline.confidence)}>{confidenceLabel(headline.confidence)}</CellChip> : null}
            <CellChip tone={debt_service_source === "none" ? "warn" : "mut"}>Debt service: {sourceLabel(debt_service_source)}{annual_debt_service != null ? ` · ${compactMoney(annual_debt_service)} a year` : ""}</CellChip>
          </div>
          <Meter value={headline?.value ?? null} tone={tone === "acc" ? "mut" : tone} marks={marks} label="Debt service coverage" />
          {reason ? <StatusLine tone="warn">{reason}</StatusLine> : null}
          {headline?.note ? <div className="sub">{headline.note}</div> : null}
        </div>
        <div className="grid g8">
          <Lbl>With the loan on record</Lbl>
          {proposed ? (
            <>
              <div className="fc-stat-list">
                <Stat label={proposed.label ?? sourceLabel(proposed.source)}>{`${money(proposed.amount)}${proposed.rate_pct != null ? ` at ${proposed.rate_pct}%` : ""}${proposed.term_months ? ` for ${proposed.term_months} mo` : ""}`}</Stat>
                <Stat label="Payment it adds">{`${money(proposed.monthly_payment)} / mo · ${money(proposed.annual_payment)} a year`}</Stat>
                <Stat label="Coverage with that payment">{pro_forma_headline ? <>{multiple(pro_forma_headline.pro_forma_value)} <CellChip tone={dscrTone(pro_forma_headline.pro_forma_status)}>{dscrLabel(pro_forma_headline.pro_forma_status).split(" (")[0]}</CellChip></> : "—"}</Stat>
              </div>
              {canRecordTerms ? <Btn size="sm" onClick={onRecordTerms}>Update loan terms</Btn> : null}
            </>
          ) : (
            <Empty action={canRecordTerms ? <Btn size="sm" variant="pri" onClick={onRecordTerms}>Record loan terms</Btn> : null}>No loan terms recorded yet, so the coverage with the new payment is not shown.{cockpit.requested_amount != null ? ` The client asked for ${money(cockpit.requested_amount)}.` : ""}</Empty>
          )}
        </div>
      </div>
      {candidates.length ? <CandidateRows candidates={candidates} /> : null}
    </Card>
  );
}

function ProfitRow({ candidate, lead }: { candidate: CockpitProfitCandidate; lead?: boolean }) {
  return (
    <div className="fc-stat">
      <span>
        {candidate.label}
        {candidate.period && candidate.key !== "tax_return" ? ` · ${candidate.period}` : ""}
        <br />
        <small className="sub">{candidate.basis}{candidate.revenue != null ? ` · on ${compactMoney(candidate.revenue)}` : ""}{candidate.margin != null ? ` · ${ratioPct(candidate.margin)} margin` : ""}</small>
      </span>
      <strong className={cx(lead && "fc-lead")}>
        {money(candidate.value)}
        <CellChip tone={confidenceTone(candidate.confidence)}>{confidenceLabel(candidate.confidence)}</CellChip>
      </strong>
    </div>
  );
}

function NetProfitCard({ cockpit }: { cockpit: Cockpit }) {
  const { conclusion, candidates, note } = cockpit.net_profit;
  return (
    <Card title="Net profit" sub="The conclusion follows the AI review's precedence: a filed return first, a profit-and-loss statement as the labelled fallback, bank cash retained as a proxy.">
      {conclusion ? (
        <div className="grid g4">
          <Lbl>Conclusion</Lbl>
          <div className="fc-figure num">
            {money(conclusion.value)} <CellChip tone={toneForSign(conclusion.value)}>{conclusion.value < 0 ? "Loss" : "Profit"}</CellChip>
          </div>
          <div className="sub">{conclusion.label}{conclusion.period ? ` · ${conclusion.period}` : ""}{conclusion.margin != null ? ` · ${ratioPct(conclusion.margin)} margin` : ""}</div>
        </div>
      ) : (
        <Empty>No income figure yet. A tax return, a profit-and-loss statement or three months of bank statements gives one.</Empty>
      )}
      {note ? <StatusLine tone="warn">{note}</StatusLine> : null}
      {candidates.length > 1 ? (
        <div className="fc-stat-list">
          {candidates.map((c) => (
            <ProfitRow key={c.key} candidate={c} lead={c.key === conclusion?.key} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Capital partners
// ---------------------------------------------------------------------------

function MarketplaceCard({ cockpit, props, innerRef }: { cockpit: Cockpit; props: Props; innerRef: React.Ref<HTMLElement> }) {
  const { programReadiness, termSheet, packageState, canPublish, canRecordTerms, onRecordTerms, onOpenEvidence, onOpenPackage, profileId } = props;
  const lookup = useCpSourceLookup({ profile_id: profileId }, canPublish);
  const prefill = useCpPrefill();
  const create = useCpCreateListing();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selection = programReadiness?.selections?.[0] ?? null;
  const candidate = selection ? programReadiness?.candidates?.find((c) => c.program_key === selection.program_key) ?? null : null;
  const programItem = selection ? programReadiness?.programs?.find((p) => p.program_key === selection.program_key) ?? null : null;
  const eligibility: { tone: ChipTone; label: string } = !selection
    ? { tone: "mut", label: "No program selected" }
    : candidate?.eligible
      ? { tone: "ok", label: candidate.requires_review ? "Eligible on estimates" : "Eligible" }
      : candidate
        ? { tone: "bad", label: "Not eligible" }
        : { tone: "mut", label: "Eligibility unknown" };
  const coverage = cockpit.coverage;
  const sheet = termSheet?.current ?? null;
  const headline = cockpit.dscr.headline;
  const listing = lookup.data?.listing ?? null;
  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const draft = await prefill.mutateAsync({ profile_id: profileId });
      if (draft.existing_listing) {
        window.location.assign(`/admin/marketplace/${draft.existing_listing.id}`);
        return;
      }
      const { existing_listing: _existing, ...rest } = draft;
      const created = await create.mutateAsync(rest);
      window.location.assign(`/admin/marketplace/${created.id}`);
    } catch (e) {
      setError(errorMessage(e, "Could not start the listing."));
      setBusy(false);
    }
  };
  return (
    <Card
      title="Send the file to capital partners"
      wide
      id="fc-marketplace"
      innerRef={innerRef}
      sub="A listing draft is cut from this file: readiness, the recorded loan terms, the package and the figures above travel with it, and the desk finishes the terms and the narrative in the marketplace editor."
      actions={
        listing ? (
          <>
            <CellChip tone={listing.status === "draft" ? "mut" : "ok"}>Listed as {listing.ref} · {listing.status.replace(/_/g, " ")}</CellChip>
            <Btn size="sm" variant="pri" onClick={() => window.location.assign(`/admin/marketplace/${listing.id}`)}>
              Open listing <Icon name="arrowR" size={13} />
            </Btn>
          </>
        ) : canPublish ? (
          <Btn size="sm" variant="pri" disabled={busy || lookup.isLoading} onClick={() => void start()}>
            {busy ? "Cutting the draft…" : "Publish to marketplace"}
          </Btn>
        ) : (
          <span className="sub">A super admin publishes listings.</span>
        )
      }
    >
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      <div className="fc-listing-grid">
        <div className="fc-listing-item">
          <Lbl>Program</Lbl>
          <strong>{selection?.program_name ?? "None selected"}</strong>
          <div className="fc-chips">
            <CellChip tone={eligibility.tone}>{eligibility.label}</CellChip>
            {programItem ? <CellChip tone={programItem.complete ? "ok" : "warn"}>{programItem.satisfied_count} of {programItem.required_count} requirements</CellChip> : null}
          </div>
          {candidate?.reasons?.length ? <div className="sub">{candidate.reasons.slice(0, 2).join(" ")}</div> : null}
        </div>
        <div className="fc-listing-item">
          <Lbl>Evidence</Lbl>
          <strong>{coverage.bank_months_accepted} of {coverage.bank_months_required} statement months accepted</strong>
          <div className="fc-chips">
            <CellChip tone={coverage.tax_years.length ? "ok" : "warn"}>{coverage.tax_years.length ? `Tax years ${coverage.tax_years.join(", ")}` : "No tax return"}</CellChip>
            <CellChip tone={coverage.debt_rows || coverage.has_debt_schedule_document ? "ok" : "warn"}>{coverage.debt_rows || coverage.has_debt_schedule_document ? "Debt schedule on file" : "No debt schedule"}</CellChip>
          </div>
          <Btn size="sm" onClick={onOpenEvidence}>Open the evidence room</Btn>
        </div>
        <div className="fc-listing-item">
          <Lbl>Loan terms on record</Lbl>
          <strong>{sheet ? `${money(sheet.approved_amount)} at ${sheet.rate_pct}% for ${sheet.term_months} mo` : "Not recorded"}</strong>
          <div className="sub">{sheet ? `${sheet.funding_party_name} · v${sheet.version}` : lookup.data?.has_term_sheet ? "Recorded on the profile" : "The listing's rate, term and amount come from here."}</div>
          {canRecordTerms ? <Btn size="sm" onClick={onRecordTerms}>{sheet ? "Update loan terms" : "Record loan terms"}</Btn> : null}
        </div>
        <div className="fc-listing-item">
          <Lbl>Package</Lbl>
          <strong>{packageState.generated ? `Summary v${packageState.summaryVersion ?? "?"} · packet v${packageState.packetVersion ?? "?"}` : "Not generated"}</strong>
          <div className="fc-chips">
            <CellChip tone={!packageState.generated ? "mut" : packageState.inSync ? "ok" : "warn"}>{!packageState.generated ? "Optional for a listing" : packageState.inSync ? "Current" : "Needs a refresh"}</CellChip>
          </div>
          <Btn size="sm" onClick={onOpenPackage}>Package readiness</Btn>
        </div>
        <div className="fc-listing-item">
          <Lbl>Coverage and profit</Lbl>
          <strong>
            {multiple(headline?.value)} <CellChip tone={dscrTone(headline?.status)}>{dscrLabel(headline?.status).split(" (")[0]}</CellChip>
          </strong>
          <div className="sub">
            {headline ? `${headline.label}` : "DSCR not available"}
            {cockpit.net_profit.conclusion ? ` · net profit ${money(cockpit.net_profit.conclusion.value)} (${sourceLabel(cockpit.net_profit.conclusion.key)})` : ""}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The cockpit
// ---------------------------------------------------------------------------

export function FinancialCockpit(props: Props) {
  const query = useFinancialCockpit(props.profileId);
  const marketplaceRef = useRef<HTMLElement>(null);
  const { focus, onFocusHandled } = props;
  useEffect(() => {
    if (focus === "marketplace" && query.data && marketplaceRef.current) {
      marketplaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      onFocusHandled();
    }
  }, [focus, onFocusHandled, query.data]);

  if (query.isLoading && !query.data) {
    return (
      <section className="fc-card">
        <Loading>Reading the file's numbers…</Loading>
      </section>
    );
  }
  if (query.error || !query.data) {
    return <StatusLine tone="bad">{errorMessage(query.error, "The financial cockpit could not be read.")}</StatusLine>;
  }
  const cockpit = query.data;
  const summary = cockpit.bank.summary;
  const coverage = cockpit.coverage;
  const headline = cockpit.dscr.headline;
  const conclusion = cockpit.net_profit.conclusion;
  const generated = new Date(cockpit.generated_at);
  const depositValues = cockpit.bank.months.map((m) => m.deposits);
  return (
    <div className={cx("fin-cockpit", query.isFetching && "is-refreshing")}>
      <div className="fc-head">
        <div>
          <h3>Financial cockpit</h3>
          <div className="sub">
            {props.businessName} · read from {coverage.files_analyzed} analyzed file{coverage.files_analyzed === 1 ? "" : "s"} ({coverage.files_accepted} accepted) · {Number.isNaN(generated.getTime()) ? "" : generated.toLocaleString()}
          </div>
          <div className="fc-coverage" style={{ marginTop: 6 }}>
            <CellChip tone={coverage.bank_months_accepted >= coverage.bank_months_required ? "ok" : "warn"}>Statements {coverage.bank_months_accepted}/{coverage.bank_months_required}</CellChip>
            <CellChip tone={coverage.tax_years.length ? "ok" : "mut"}>Tax returns {coverage.tax_years.length ? coverage.tax_years.join(", ") : "none"}</CellChip>
            <CellChip tone={coverage.has_profit_and_loss ? "ok" : "mut"}>P&amp;L {yesNo(coverage.has_profit_and_loss)}</CellChip>
            <CellChip tone={coverage.debt_rows || coverage.has_debt_schedule_document || coverage.documented_debts ? "ok" : "mut"}>Debt {coverage.debt_rows ? `${coverage.debt_rows} rows` : coverage.has_debt_schedule_document ? "document" : coverage.documented_debts ? `${coverage.documented_debts} read off documents` : "none"}</CellChip>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn size="sm" onClick={props.onOpenEvidence}>Evidence room</Btn>
          <Btn size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <Icon name="refresh" size={14} /> {query.isFetching ? "Refreshing…" : "Refresh"}
          </Btn>
        </div>
      </div>

      {cockpit.notes.length ? (
        <Callout tone="warn">
          <ul className="fc-notes">
            {cockpit.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <KpiRow>
        <Kpi
          label="Average monthly deposits"
          value={money(summary.avg_deposits)}
          sub={
            <span className="fc-kpi-spark">
              <span>{summary.months} months{summary.annualized_deposits != null ? ` · ${compactMoney(summary.annualized_deposits)} a year` : ""}</span>
              <Sparkline values={depositValues} />
            </span>
          }
          delta={summary.deposit_trend_pct != null ? signedPct(summary.deposit_trend_pct) : undefined}
          trend={trendDirection(summary.deposit_trend_pct)}
          tone={summary.deposit_trend_pct == null ? "mut" : summary.deposit_trend_pct >= 0 ? "ok" : "warn"}
        />
        <Kpi label="Net cash flow per month" value={money(summary.avg_net)} sub={summary.annualized_net != null ? `${compactMoney(summary.annualized_net)} a year · deposits minus withdrawals` : "deposits minus withdrawals"} tone={toneForSign(summary.avg_net)} />
        <Kpi label="Average balance" value={money(summary.average_balance)} sub={`begins ${compactMoney(summary.beginning_balance)} · ends ${compactMoney(summary.ending_balance)} · low ${compactMoney(summary.lowest_balance)}`} />
        <Kpi label="NSF and overdrafts" value={count(summary.nsf_total)} sub={`${summary.negative_days_total} negative-balance day${summary.negative_days_total === 1 ? "" : "s"}`} tone={summary.nsf_total ? "bad" : "ok"} />
        <Kpi label={`DSCR · ${headline ? sourceLabel(headline.key) : "no basis"}`} value={multiple(headline?.value)} sub={dscrLabel(headline?.status)} tone={dscrTone(headline?.status)} />
        <Kpi label="Net profit" value={money(conclusion?.value)} sub={conclusion ? `${conclusion.label}${conclusion.period && conclusion.key !== "tax_return" ? ` · ${conclusion.period}` : ""}` : "No income figure yet"} tone={toneForSign(conclusion?.value)} />
      </KpiRow>

      <div className="fc-grid fc-grid-charts">
        <BankCards cockpit={cockpit} onOpenEvidence={props.onOpenEvidence} />
      </div>

      <div className="fc-grid fc-grid-charts">
        <TaxCard cockpit={cockpit} onOpenEvidence={props.onOpenEvidence} />
        <ProfitAndLossCard cockpit={cockpit} />
        <BalanceSheetCard cockpit={cockpit} />
      </div>

      <div className="fc-grid">
        <DscrCard cockpit={cockpit} canRecordTerms={props.canRecordTerms} onRecordTerms={props.onRecordTerms} />
      </div>

      <div className="fc-grid">
        <NetProfitCard cockpit={cockpit} />
        <ExpensesCard cockpit={cockpit} />
        <DebtCard cockpit={cockpit} />
      </div>

      <div className="fc-grid">
        <MarketplaceCard cockpit={cockpit} props={props} innerRef={marketplaceRef} />
      </div>
    </div>
  );
}
