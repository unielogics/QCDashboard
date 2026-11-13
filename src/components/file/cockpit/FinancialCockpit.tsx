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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, KpiRow, Lbl, Loading, Seg, StatusLine, cx, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { FinancialWorkspace } from "@/components/application/FinancialWorkspace";
import { OperatingPlanEntry } from "./OperatingPlanEntry";
import { RequestFilesDialog } from "@/components/application/RequestFilesDialog";
import { balanceSheetIsEmpty, financialStatementRequest, profitAndLossIsEmpty, type FinancialStatementRequestKind } from "@/lib/financialStatementRequests";
import { BucketFileReviewPanel, type BucketFileReview, type BucketReviewFile } from "@/components/buckets/BucketFileReviewPanel";
import { loadFinancialSourcePreview, restoreFinancialSourceFocus } from "@/lib/financialSourcePreview";
import { validPdfSourcePage } from "@/lib/pdfSourceNavigation";
import { balanceRiskMonths, riskCountLabel, riskTotals } from "@/lib/balanceRisk";
import { ebitdaIsStaffCorrected, ebitdaKpi, metricAmountLabel, metricCurrency } from "@/lib/financialMetrics";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { ApplicationProgramReadiness } from "@/components/application/ApplicationProgramReadiness";
import type { BudgetEditorControls } from "@/components/application/UseOfFundsBudgetEditor";
import { createUseOfFundsDraftStore } from "@/lib/useOfFundsDraft";
import type { MarketplaceFinancialAction } from "@/lib/marketplaceIssues";
import { noiGovernancePresentation } from "@/lib/noiGovernance";
import { useAuthedApi, useFinancialCockpit, useRestoreDebtSchedule, useVoidDebtSchedule } from "@/hooks/useApi";
import type { WorkingFinancing } from "@/lib/workingFinancing";
import type { ApplicationProgramReadiness as ProgramReadiness, ApplicationTermSheetState } from "@/lib/applicationProfile";
import type { FundingProgramVertical } from "@/lib/fundingPrograms";
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
  type CockpitBankSummary,
  type CockpitMonth,
  type CockpitProfitCandidate,
  type FinancialCockpit as Cockpit,
  EMPTY_SCHEDULE,
  declaredBy,
  scheduleStatusShort,
  scheduleStatusTone,
  type CockpitDebtRow,
} from "@/lib/financialCockpit";
import { OfferPanel } from "./OfferPanel";
import type { MarketplacePlanControls } from "@/lib/marketplacePreparation";
import { CoverageCard } from "./CoverageCard";
import { FinancialKpiCard } from "./FinancialKpiCard";
import { FinancialMetricReviewWorkspace } from "./FinancialMetricReviewWorkspace";
import { metricEntries, type FinancialKpiKey } from "@/lib/financialKpiReview";
import type { FinancialPlanWrite } from "@/lib/financialCockpit";
import financialReviewStyles from "./FinancialReview.module.css";
import metricStyles from "./FinancialMetricReview.module.css";
import layoutStyles from "./FileFinancialLayout.module.css";
import { ChartCard, ColumnChart, HBarList, LineChart, Meter, SERIES, Sparkline, type ChartBand, type ChartTable } from "./CockpitCharts";
import type { FileWorkspaceTool } from "@/lib/fileWorkspace";
import { useFileWorkspace, FileWorkspaceLink } from "@/components/file/FileWorkspaceContext";
import { DebtScheduleControls, OPEN_DEBT_SCHEDULE_EVENT } from "./DebtScheduleControls";

export type CockpitPackageState = { generated: boolean; inSync: boolean; summaryVersion: number | null; packetVersion: number | null };

type Props = {
  workspaceTool?: FileWorkspaceTool;
  profileId: string;
  businessName: string;
  canPublish: boolean;
  canRecordTerms: boolean;
  /** Admin or underwriter: may enter, request or void the debt schedule. */
  canUnderwrite: boolean;
  programReadiness: ProgramReadiness | null;
  /** Programs are chosen here, not on Evidence & banking, so the card below edits the same snapshot the page holds. */
  onProgramReadinessChange?: (readiness: ProgramReadiness) => void;
  onRefreshProgramReadiness?: () => Promise<unknown> | void;
  canCreatePrograms?: boolean;
  programVertical?: FundingProgramVertical;
  intakeVariant?: string | null;
  termSheet: ApplicationTermSheetState | null;
  packageState: CockpitPackageState;
  focus: "marketplace" | null;
  onFocusHandled: () => void;
  onRecordTerms: () => void;
  onOpenEvidence: () => void;
  onOpenPackage: () => void;
  renderFundingPackage?: (marketplace: ReactNode, cockpit: Cockpit) => ReactNode;
  /** The fees were saved on the coverage card; the file page re-reads the underwriting state. */
  onEconomicsSaved?: () => void;
  /** Which record the loan in the plan becomes. */
  termsKind?: "production" | "client";
  /** Open the same mounted editor from Underwriting without leaving that tab. */
  termsRequest?: number;
  initialFinancialAction?: MarketplaceFinancialAction | null;
  coverageRequest?: number;
  noiReviewRequest?: number;
  onWorkingFinancingChange?: (value: WorkingFinancing) => void;
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

function BankCards({ cockpit, months, summary, accountLabel, onOpenEvidence }: { cockpit: Cockpit; months: CockpitMonth[]; summary: CockpitBankSummary; accountLabel: string; onOpenEvidence: () => void }) {
  const bands = monthBands(months);
  const risks = riskTotals(balanceRiskMonths(months));
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
      <CellChip tone="acc">{accountLabel}</CellChip>
      {accounts.map((a) => (
        <CellChip key={a.key} tone={a.counted ? "mut" : "warn"}>{a.label} · {a.months.length} mo{a.counted ? "" : " · not counted"}</CellChip>
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
        sub={risks.accountDays ? "Combined balances. Monthly account lows are summed and may occur on different dates; inspect individual accounts in Balance risk." : summary.average_balance_basis === "ending_balance" ? "Average balance is read from ending balances; the statements print no average ledger balance." : "Ending, average ledger and lowest daily balance; beginning balances sit in the table."}
        table={balanceTable}
        chart={
          <LineChart
            ariaLabel={`Ending, average and lowest balances for ${months.length} months`}
            bands={bands}
            series={[
              { key: "ending", label: "Ending balance", color: SERIES.one, values: months.map((m) => m.ending_balance), emphasis: true },
              { key: "average", label: "Average balance", color: SERIES.two, values: months.map((m) => m.average_balance) },
              { key: "low", label: risks.accountDays ? "Sum of account lows" : "Lowest balance", color: SERIES.context, values: months.map((m) => m.low_balance) },
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
          <Stat label={`NSF or overdraft items · returned checks · negative ${risks.accountDays ? "account-days" : "days"}`}>{`${riskCountLabel(risks.fees)} · ${riskCountLabel(risks.returned)} · ${riskCountLabel(risks.negative)}`}</Stat>
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
  ["depreciation", "Depreciation & amortization"],
  ["taxes_and_licenses", "Taxes and licenses"],
  ["total_deductions", "Total deductions"],
  ["ebitda", "Tax-derived earnings estimate (income + interest + D&A)"],
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
      {!latest.ebitda_complete ? <CellChip tone="warn">Interest or D&amp;A incomplete</CellChip> : null}
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

function ProfitAndLossCard({ cockpit, onRequest }: { cockpit: Cockpit; onRequest?: () => void }) {
  const pl = cockpit.profit_and_loss;
  if (!pl || profitAndLossIsEmpty(pl)) {
    return (
      <Card title="Profit and loss">
        <Empty action={onRequest ? <Btn size="sm" onClick={onRequest}>Request profit and loss</Btn> : undefined}>{pl ? "The available profit-and-loss file has no readable financial figures yet." : "No profit-and-loss statement has been analyzed yet."} Request it from the client to track it in the checklist and client account.</Empty>
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

function BalanceSheetCard({ cockpit, onRequest }: { cockpit: Cockpit; onRequest?: () => void }) {
  const bs = cockpit.balance_sheet;
  if (!bs || balanceSheetIsEmpty(bs)) return <Card title="Balance sheet"><Empty action={onRequest ? <Btn size="sm" onClick={onRequest}>Request balance sheet</Btn> : undefined}>{bs ? "The available balance-sheet file has no readable financial figures yet." : "No balance sheet has been analyzed yet."} Request it from the client to track it in the checklist and client account.</Empty></Card>;
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

/** The type as the schedule PDF prints it — the label when the file knows one,
 *  the slug's words otherwise — with the advance answer beside an advance. */
function debtTypeCell(r: CockpitDebtRow): string {
  const label = r.category_label || (r.is_mca ? "Advance" : r.category.replace(/_/g, " "));
  if (r.mca_modified === true) return `${label} · modified for lower sales${r.mca_modification_note ? `: ${r.mca_modification_note}` : ""}`;
  if (r.mca_modified === false) return `${label} · not modified`;
  return label;
}

function statusCell(r: CockpitDebtRow): string {
  if (!r.payment_status) return "—";
  return r.payment_status.charAt(0).toUpperCase() + r.payment_status.slice(1);
}

/** An ISO date the way a US lender reads one. */
function usDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value ?? "—";
}

function DebtCard({ cockpit, profileId, canEdit, onRefresh, onOpenEvidence }: { cockpit: Cockpit; profileId: string; canEdit: boolean; onRefresh: () => void; onOpenEvidence?: () => void }) {
  const { rows, documented, document, service } = cockpit.debt;
  const schedule = cockpit.debt.schedule ?? EMPTY_SCHEDULE;
  const voided = schedule.voided;
  const api = useAuthedApi();
  const voidIt = useVoidDebtSchedule(profileId);
  const restore = useRestoreDebtSchedule(profileId);
  const confirmAction = useConfirmAction();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"" | "open" | "save" | "request">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => { void openForm(); };
    window.addEventListener(OPEN_DEBT_SCHEDULE_EVENT, handler);
    return () => window.removeEventListener(OPEN_DEBT_SCHEDULE_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);
  const openForm = async () => { setEditing(true); };
  const requestIt = async () => {
    setError(null);
    setBusy("request");
    try {
      const result = await api<{ requested: boolean; already: boolean }>(`/application-profiles/${profileId}/financial-forms/debt_schedule/request`, { method: "POST" });
      setNotice(result.already ? "The borrower was already asked for the debt schedule." : "The debt schedule is on the borrower's checklist now.");
      onRefresh();
    } catch (e) {
      setError(errorMessage(e, "The request could not be sent."));
    } finally {
      setBusy("");
    }
  };
  const declareNoDebt = async () => {
    const confirmed = await confirmAction({
      title: "Void the debt schedule?",
      body: "This records that the business carries no debt. The schedule stops being asked for, the debt service becomes zero and the coverage reads the proposed payment alone. Your name and the date go on the file. It can be undone.",
      confirmLabel: "No debt on the business",
      tone: "danger",
      reversible: true,
    });
    if (!confirmed) return;
    setError(null);
    try {
      await voidIt.mutateAsync({ reason: "No debt on the business" });
      setNotice("Voided: the business carries no debt.");
    } catch (e) {
      setError(errorMessage(e, "The schedule could not be voided."));
    }
  };
  const restoreIt = async () => {
    setError(null);
    try {
      await restore.mutateAsync();
      setNotice("The debt schedule is required again.");
    } catch (e) {
      setError(errorMessage(e, "The schedule could not be restored."));
    }
  };

  const scheduleTable: ChartTable | null = rows.length
    ? {
        caption: "Debt schedule rows on the file",
        cols: ["Lender", "Type", "Balance", "Monthly", "Rate / factor", "Status", "Maturity", "In DSCR"],
        rows: rows.map((r) => ({
          key: r.id || r.lender,
          muted: !r.count_in_dscr,
          cells: [
            r.lender,
            debtTypeCell(r),
            money(r.balance),
            money(r.monthly_payment),
            r.factor_rate != null ? `${r.factor_rate.toFixed(2)} factor` : r.rate != null ? `${r.rate}%` : "—",
            statusCell(r),
            usDate(r.maturity_on),
            yesNo(r.count_in_dscr),
          ],
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
  const uploadedLines = (document?.debts ?? []).filter((d) => d && d.lender);
  const uploadedTable: ChartTable | null = uploadedLines.length && !rows.length
    ? {
        caption: "Lines read off the uploaded schedule",
        cols: ["Lender", "Type", "Balance", "Monthly", "Rate", "Maturity", "Secured by"],
        rows: uploadedLines.map((d, i) => ({ key: `${d.lender}-${i}`, cells: [String(d.lender), String(d.debt_type ?? "—"), money(d.current_balance ?? d.balance ?? null), money(d.monthly_payment ?? null), d.rate_pct != null ? `${d.rate_pct}%` : "—", usDate(d.maturity_date ?? null), String(d.secured_by ?? "—")] })),
      }
    : null;
  const canRequest = !voided && !schedule.requested_at && !["rows", "document", "received"].includes(schedule.status);
  const actions = canEdit ? (
    <>
      {voided ? <Btn size="sm" onClick={() => void restoreIt()} disabled={restore.isPending}>{restore.isPending ? "Restoring…" : "Undo: the business carries debt"}</Btn> : null}
      {!voided ? <Btn size="sm" onClick={() => void openForm()} disabled={busy !== ""}>{busy === "open" ? "Opening…" : rows.length ? "Edit the schedule" : "Enter the schedule"}</Btn> : null}
      {canRequest ? <Btn size="sm" onClick={() => void requestIt()} disabled={busy !== ""}>{busy === "request" ? "Requesting…" : "Request from the borrower"}</Btn> : null}
      {schedule.can_void ? <Btn size="sm" onClick={() => void declareNoDebt()} disabled={voidIt.isPending}>{voidIt.isPending ? "Voiding…" : "No debt on the business"}</Btn> : null}
    </>
  ) : null;
  const emptyText = voided
    ? `No debt on the business, declared ${declaredBy(voided)}.`
    : schedule.status === "document"
      ? "The uploaded schedule printed no rows we could read; its totals are above."
      : schedule.status === "requested" || schedule.status === "received"
        ? "Waiting on the borrower's schedule. If they gave you the terms verbally, enter them here and the coverage reads them."
        : "Nothing on the schedule yet. Enter it, ask the borrower for it, or void it if the business carries no debt.";
  return (
    <>
      <Card title="Debt schedule and debt service" sub="Every file carries a debt schedule. Rows a person entered or confirmed win; then the total printed on an uploaded schedule; then the payments read off advance terms. Only the desk sets it aside, by declaring the business carries no debt." actions={actions}>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <CellChip tone={scheduleStatusTone(schedule.status)}>{schedule.label}</CellChip>
          {voided ? (
            <span className="sub">{declaredBy(voided)} · {voided.reason}</span>
          ) : schedule.requested_at ? (
            <span className="sub">Asked {declaredBy({ reason: "", by: null, by_user_id: null, at: schedule.requested_at }).replace("by the desk ", "")}</span>
          ) : schedule.status === "missing" ? (
            <span className="sub">Every file carries a debt schedule: ask the borrower for it here, or void it if the business carries no debt.</span>
          ) : null}
        </div>
        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
        {notice && !error ? <StatusLine tone="ok">{notice}</StatusLine> : null}
        {service.declaration_conflict ? <StatusLine tone="warn">The statements still show {money(service.observed_monthly)} a month going to lenders or funders. The debt service keeps that figure until the schedule is restored or those payees are reclassified.</StatusLine> : null}
        <div className="fc-stat-list">
          <Stat label={<>Monthly debt service <CellChip tone={service.source === "none" ? "warn" : service.source === "declared_none" ? "ok" : "mut"}>{sourceLabel(service.source)}</CellChip></>}>{money(service.monthly)}</Stat>
          <Stat label="Annual debt service">{money(service.annual)}</Stat>
          {service.schedule_monthly != null ? <Stat label={`Schedule rows (${service.schedule_rows_counted} counted)`}>{`${money(service.schedule_monthly)} / mo · ${compactMoney(service.schedule_balance)} owed`}</Stat> : null}
          {service.document_monthly != null || service.document_balance != null ? <Stat label="Uploaded schedule total">{`${money(service.document_monthly)} / mo · ${compactMoney(service.document_balance)} owed`}</Stat> : null}
          {service.documented_monthly != null ? <Stat label="Advance terms read off documents">{`${money(service.documented_monthly)} / mo · ${compactMoney(service.documented_balance)} owed`}</Stat> : null}
          <Stat label="Active advances (MCA)">{service.mca_count ? `${service.mca_count} · ${money(service.mca_monthly)} / mo · ${compactMoney(service.mca_balance)} owed` : "None on file"}</Stat>
          {service.observed_monthly != null ? <Stat label="Lender and funder debits seen in the statements">{`${money(service.observed_monthly)} / mo${service.unexplained_observed_monthly ? ` · ${money(service.unexplained_observed_monthly)} not on any row` : ""}`}</Stat> : null}
        </div>
        {scheduleTable ? <ChartCard plain title="Schedule rows" table={scheduleTable} chart={<HBarList rows={rows.map((r) => ({ key: r.id || r.lender, label: r.lender, value: r.monthly_payment, muted: !r.count_in_dscr, sub: `${r.is_mca ? "Advance" : r.category.replace(/_/g, " ")}${r.balance != null ? ` · ${compactMoney(r.balance)} owed` : ""}${r.count_in_dscr ? "" : " · excluded from DSCR"}` }))} />} /> : null}
        {uploadedTable ? <ChartCard plain title="Read off the uploaded schedule" sub="The AI read these lines; adopt them so the file carries them as its own rows, then edit from there." table={uploadedTable} chart={<HBarList rows={uploadedLines.map((d, i) => ({ key: `${d.lender}-${i}`, label: String(d.lender), value: d.monthly_payment ?? null, sub: `${d.debt_type ?? "Loan"}${d.current_balance != null ? ` · ${compactMoney(d.current_balance)} owed` : ""}` }))} />} /> : null}
        {documentedTable ? <ChartCard plain title="Read off documents" table={documentedTable} chart={<HBarList rows={documented.map((d, i) => ({ key: `${d.lender}-${i}`, label: d.lender, value: d.monthly_payment, sub: `${d.is_mca ? "Advance" : "Loan"}${d.balance != null ? ` · ${compactMoney(d.balance)} owed` : ""}${d.payment_frequency ? ` · ${d.payment_frequency}` : ""}` }))} />} /> : null}
        {!scheduleTable && !documentedTable && !uploadedTable ? <Empty>{emptyText}</Empty> : null}
        {canEdit && (!rows.length || voided) ? <DebtScheduleControls cockpit={cockpit} profileId={profileId} canEdit={canEdit} onOpenEvidence={onOpenEvidence} /> : null}
      </Card>
      {editing ? <FinancialWorkspace open profileId={profileId} initialKind="debt_schedule" onClose={() => setEditing(false)} onPublished={onRefresh} /> : null}
    </>
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
// The cockpit
// ---------------------------------------------------------------------------

export function FinancialCockpit(props: Props) {
  const fileWorkspace = useFileWorkspace();
  const { profileId, onRefreshProgramReadiness, onWorkingFinancingChange } = props;
  const budgetDraftStore = useMemo(() => createUseOfFundsDraftStore(profileId), [profileId]);
  const activeBudgetStore = useRef(budgetDraftStore);
  activeBudgetStore.current = budgetDraftStore;
  const [budgetSaving, setBudgetSaving] = useState(false);
  const budgetControlsChanged = useCallback((controls: BudgetEditorControls | null) => {
    if (activeBudgetStore.current === budgetDraftStore) setBudgetSaving(controls?.saving ?? false);
  }, [budgetDraftStore]);
  const query = useFinancialCockpit(props.profileId);
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const [statementRequest, setStatementRequest] = useState<{ profileId: string; kind: FinancialStatementRequestKind; key: string; open: boolean } | null>(null);
  const requestFinancialStatement = useCallback((kind: FinancialStatementRequestKind) => {
    setStatementRequest({ profileId: props.profileId, kind, key: crypto.randomUUID(), open: true });
  }, [props.profileId]);
  const refreshFileRequests = useCallback(() => {
    for (const key of ["financial-cockpit", "application-evidence-workspace", "application-collection-tasks", "application-profile-audit"])
      void queryClient.invalidateQueries({ queryKey: [key, profileId] });
    void queryClient.invalidateQueries({ queryKey: ["application-profile"] });
    void onRefreshProgramReadiness?.();
  }, [profileId, onRefreshProgramReadiness, queryClient]);
  const marketplaceRef = useRef<HTMLElement>(null);
  const [accountChoice, setAccountChoice] = useState<string>("counted");
  const [metricReview, setMetricReview] = useState<{ profileId: string; key: FinancialKpiKey; open: boolean } | null>(null);
  const [workingPlan, setWorkingPlan] = useState<WorkingFinancing | null>(null);
  const [marketplacePlanControls, setMarketplacePlanControls] = useState<MarketplacePlanControls | null>(null);
  const marketplaceControlsChanged = useCallback((controls: MarketplacePlanControls | null) => {
    if (controls?.profileId === profileId) setMarketplacePlanControls(controls);
    else if (!controls) setMarketplacePlanControls(current => current?.profileId === profileId ? null : current);
  }, [profileId]);
  const [metricDebtOpen, setMetricDebtOpen] = useState(false);
  const [planReviewRequest, setPlanReviewRequest] = useState(0);
  const [termsOpenRequest, setTermsOpenRequest] = useState(0);
  const returnToMetric = useRef(false);
  const workingPlanChanged = useCallback((value: WorkingFinancing) => { setWorkingPlan(value); onWorkingFinancingChange?.(value); }, [onWorkingFinancingChange]);
  useEffect(() => { if (props.termsRequest) setTermsOpenRequest((value) => value + 1); }, [props.termsRequest]);
  useEffect(() => { if (props.coverageRequest) setPlanReviewRequest((value) => value + 1); }, [props.coverageRequest]);
  const structureLoan = () => props.termsKind === "production" ? props.onRecordTerms() : setTermsOpenRequest((value) => value + 1);
  const [sourcePreview, setSourcePreview] = useState<{ profileId: string; fileId: string; page?: number; requestId: number } | null>(null);
  const [sourceFiles, setSourceFiles] = useState<BucketReviewFile[]>([]);
  const activeProfileRef = useRef(props.profileId);
  const refetchCockpit = query.refetch;
  const refreshFinancialFacts = useCallback(async () => {
    const refreshed = await refetchCockpit();
    if (activeProfileRef.current !== profileId) return refreshed;
    for (const key of ["application-assessment", "application-intelligence", "application-evidence-workspace"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
    void queryClient.invalidateQueries({ queryKey: ["lead-program-fit"] });
    await onRefreshProgramReadiness?.();
    return refreshed;
  }, [onRefreshProgramReadiness, profileId, queryClient, refetchCockpit]);
  const sourceFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    activeProfileRef.current = props.profileId;
    setBudgetSaving(false);
    setSourcePreview(null);
    setSourceFiles([]);
    setAccountChoice("counted");
    setMetricReview(null); setWorkingPlan(null); setMetricDebtOpen(false); setPlanReviewRequest(0); returnToMetric.current = false;
  }, [props.profileId]);
  useEffect(() => {
    if (props.noiReviewRequest) setMetricReview({ profileId: props.profileId, key: "noi", open: true });
  }, [props.noiReviewRequest, props.profileId]);
  const openSourcePreview = useCallback((fileId: string, page?: number) => {
    sourceFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSourcePreview((current) => ({ profileId: props.profileId, fileId, page: validPdfSourcePage(page) ?? undefined, requestId: (current?.requestId ?? 0) + 1 }));
  }, [props.profileId]);
  const loadSourceReview = useCallback(async (): Promise<BucketFileReview> => {
    if (!sourcePreview || sourcePreview.profileId !== props.profileId) throw new Error("Source reference needs review.");
    const loaded = await loadFinancialSourcePreview(sourcePreview, api, () => activeProfileRef.current);
    setSourceFiles(loaded.files);
    return loaded.review;
  }, [api, props.profileId, sourcePreview]);
  const closeSourcePreview = useCallback(() => {
    setSourcePreview(null);
    const sourceButton = sourceFocusRef.current;
    requestAnimationFrame(() => restoreFinancialSourceFocus(sourceButton));
  }, []);
  const { focus, onFocusHandled } = props;
  useEffect(() => {
    if (focus === "marketplace" && query.data && marketplaceRef.current) {
      marketplaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      onFocusHandled();
    }
  }, [focus, onFocusHandled, query.data]);

  const cockpit = query.data?.profile_id === props.profileId ? query.data : undefined;
  if (query.isLoading && !cockpit) {
    return (
      <section className="fc-card">
        <Loading>Reading the file's numbers…</Loading>
      </section>
    );
  }
  if (!cockpit) {
    return <StatusLine tone="bad">{errorMessage(query.error, "The financial cockpit could not be read.")}</StatusLine>;
  }
  const coverage = cockpit.coverage;
  const narrowed = cockpit.bank.all_months != null;
  const accountOptions = [
    { value: "counted", label: narrowed ? "Counted accounts" : "All accounts" },
    ...(narrowed ? [{ value: "all", label: "All accounts" }] : []),
    ...cockpit.bank.accounts.map((a) => ({ value: a.key, label: a.counted ? a.label : `${a.label} (not counted)` })),
  ];
  const chosen = cockpit.bank.accounts.find((a) => a.key === accountChoice) ?? null;
  const resolvedAccountChoice = accountChoice === "all" && narrowed ? "all" : chosen?.key ?? "counted";
  const selection =
    accountChoice === "all" && cockpit.bank.all_months && cockpit.bank.all_summary
      ? { months: cockpit.bank.all_months, summary: cockpit.bank.all_summary, label: "All accounts", accountLabel: null as string | null }
      : chosen
        ? { months: chosen.series, summary: chosen.summary, label: chosen.label, accountLabel: chosen.label as string | null }
        : { months: cockpit.bank.months, summary: cockpit.bank.summary, label: narrowed ? "Counted accounts" : "All accounts", accountLabel: null as string | null };
  const summary = selection.summary;
  const metricOptions = { budgetEvaluation: workingPlan?.profileId === props.profileId ? workingPlan.budgetEvaluation : undefined, budgetPending: workingPlan?.profileId === props.profileId ? workingPlan.budgetPending : false, months: selection.months, summary, accountKey: resolvedAccountChoice, label: selection.label, plan: workingPlan?.profileId === props.profileId ? workingPlan.plan : undefined, dirty: workingPlan?.profileId === props.profileId ? workingPlan.dirty : false };
  const metricCards = metricEntries(cockpit, metricOptions);
  const openMetricReview = (key: FinancialKpiKey) => setMetricReview({ profileId: props.profileId, key, open: true });
  const openMetricDebt = () => { setMetricReview((current) => current ? { ...current, open: false } : null); setMetricDebtOpen(true); };
  const openMetricPlan = () => { returnToMetric.current = true; setMetricReview((current) => current ? { ...current, open: false } : null); setPlanReviewRequest((value) => value + 1); };
  const headline = cockpit.dscr.headline;
  const ebitda = cockpit.ebitda?.headline;
  const ebitdaTile = ebitdaKpi(ebitda);
  const ebitdaCorrected = ebitdaIsStaffCorrected(ebitda, cockpit.metric_review);
  const ebitdaCurrency = metricCurrency(ebitda?.currency, ebitda?.source_refs);
  const generated = new Date(cockpit.generated_at);
  const depositValues = selection.months.map((m) => m.deposits);
  const risks = riskTotals(balanceRiskMonths(selection.months));
  const nsfIncomplete = !risks.fees.complete;
  const negativeIncomplete = !risks.negative.complete;
  const negativeUnit = risks.accountDays ? "account-days" : "days";
  const negativeCaption = negativeIncomplete && !risks.negative.value
    ? "Negative days not fully reported"
    : `${riskCountLabel(risks.negative)} negative ${negativeUnit}`;
  const bankPeriod = summary.first_month && summary.last_month ? summary.first_month === summary.last_month ? monthShort(summary.first_month) : `${monthShort(summary.first_month)} – ${monthShort(summary.last_month)}` : "Period unconfirmed";
  const auxiliaryContent = <>{metricReview?.profileId === props.profileId ? <FinancialMetricReviewWorkspace key={props.profileId} open={metricReview.open} metricKey={metricReview.key} cockpit={cockpit} options={metricOptions} profileId={props.profileId} canEdit={props.canUnderwrite} onClose={() => setMetricReview((current) => current ? { ...current, open: false } : null)} onRefresh={refreshFinancialFacts} onOpenDebt={openMetricDebt} onOpenPlan={openMetricPlan} /> : null}
      {metricDebtOpen ? <FinancialWorkspace inline={Boolean(fileWorkspace?.pageMode)} open profileId={props.profileId} initialKind="debt_schedule" initialView="worksheet" onClose={() => { setMetricDebtOpen(false); setMetricReview((current) => current ? { ...current, open: true } : null); void refreshFinancialFacts(); }} onPublished={async () => { await refreshFinancialFacts(); }} /> : null}
      {sourcePreview && sourcePreview.profileId === props.profileId ? <BucketFileReviewPanel
        title="Bank statement evidence"
        files={sourceFiles}
        activeFileId={sourcePreview.fileId}
        initialPage={sourcePreview.page}
        pageRequestId={sourcePreview.requestId}
        reviewKey={`${sourcePreview.profileId}:${sourcePreview.fileId}`}
        loadReview={loadSourceReview}
        annotationsEnabled={false}
        onSelectFile={(fileId) => setSourcePreview((current) => current ? { ...current, fileId, page: undefined, requestId: current.requestId + 1 } : null)}
        onClose={closeSourcePreview}
      /> : null}
      {statementRequest?.profileId === props.profileId ? <RequestFilesDialog key={props.profileId} open={statementRequest.open} profileId={props.profileId}
        prefill={financialStatementRequest(statementRequest.kind, props.businessName)} prefillKey={statementRequest.key}
        onClose={() => setStatementRequest((current) => current ? { ...current, open: false } : null)} onRequested={refreshFileRequests} /> : null}</>;
  const coverageView = (<CoverageCard workspaceTool={props.workspaceTool} key={props.profileId} businessName={props.businessName} cockpit={cockpit} months={selection.months} summary={selection.summary} accountLabel={selection.label} accountKey={resolvedAccountChoice} canEdit={props.canUnderwrite || props.canRecordTerms || props.canPublish} canReviewDebt={props.canUnderwrite} canCorrectMetrics={props.canUnderwrite} profileId={props.profileId} canRecordTerms={props.canRecordTerms} onRecordTerms={props.onRecordTerms} onEconomicsSaved={props.onEconomicsSaved} termsKind={props.termsKind} onOpenEvidence={props.onOpenEvidence} onRefresh={refreshFinancialFacts} onPreviewSource={openSourcePreview} onRequestStatement={props.canUnderwrite ? requestFinancialStatement : undefined} onWorkingPlanChange={workingPlanChanged} reviewRequest={planReviewRequest} termsRequest={termsOpenRequest}
          onMarketplaceSaveControlsChange={marketplaceControlsChanged}
          setupBudgetSaving={budgetSaving}
          initialFinancialAction={props.initialFinancialAction}
          programSelection={props.programReadiness ? <details className="fc-card fc-wide" id="fc-programs" open>
            <summary><strong>Program criteria and use of funds</strong><span className="sub"> · {props.programReadiness.selections?.map((row) => row.program_name).join(", ") || "Choose programs"}</span></summary>
            <div className="fc-card-h">
              <div>
                <h4>Programs and use of funds</h4>
                <div className="sub">Choose the funding programs for this file and itemize how the money will be used. The programs decide which documents the file needs; those are listed on Evidence &amp; banking.</div>
              </div>
            </div>
            <ApplicationProgramReadiness
              section="setup"
              initiallyOpenUseOfFunds={props.initialFinancialAction === "use-of-funds" || props.workspaceTool === "use-of-funds"}
              canEditPrograms={props.canUnderwrite}
              useOfFundsDraftStore={budgetDraftStore}
              onUseOfFundsControlsChange={budgetControlsChanged}
              onPreviewFinancialEvidence={openSourcePreview}
              onRequestFinancialEvidence={props.canUnderwrite ? () => requestFinancialStatement("profit_and_loss") : undefined}
              profileId={props.profileId}
              files={[]}
              value={props.programReadiness}
              onValueChange={props.onProgramReadinessChange}
              onRefresh={props.onRefreshProgramReadiness}
              showUploader={false}
              canCreatePrograms={props.canCreatePrograms}
              programVertical={props.programVertical}
              intakeVariant={props.intakeVariant}
            />
          </details> : null}
          onReviewClose={() => { if (returnToMetric.current) { returnToMetric.current = false; setMetricReview((current) => current ? { ...current, open: true } : null); } }} />);
  if (props.workspaceTool) return <div className="fin-cockpit">{coverageView}{props.workspaceTool === "marketplace" ? <OfferPanel cockpit={cockpit} props={{ ...props, onStructureLoan: structureLoan }} workingFinancing={workingPlan} planSaveControls={marketplacePlanControls} innerRef={marketplaceRef} /> : null}{auxiliaryContent}</div>;
  return (
    <div className={cx("fin-cockpit", layoutStyles.layout, query.isFetching && "is-refreshing")}>
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
            <CellChip tone={scheduleStatusTone(coverage.debt_schedule_status ?? "missing")}>Debt schedule · {scheduleStatusShort(coverage.debt_schedule_status ?? "missing", coverage.debt_rows)}</CellChip>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <ActionIcon icon="vault" label="Open the evidence room" onClick={props.onOpenEvidence} />
          <ActionIcon icon="refresh" label={query.isFetching ? "Refreshing the figures..." : "Refresh the figures"} busy={query.isFetching} disabled={query.isFetching} onClick={() => void query.refetch()} />
        </div>
      </div>

      {query.error ? <Callout tone="warn"><div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><span>Financial figures could not be refreshed. Showing the last loaded figures; your open edits are preserved.</span><Btn size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Retrying…" : "Retry financial figures"}</Btn></div></Callout> : null}
      {cockpit.notes.length ? (
        <Callout tone="warn">
          <ul className="fc-notes">
            {cockpit.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {cockpit.bank.accounts.length > 1 ? (
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="lbl">Account</span>
          <Seg as="filter" ariaLabel="Checking account" value={resolvedAccountChoice} onChange={setAccountChoice} options={accountOptions} />
          <span className="sub">Choose which accounts count on Evidence &amp; banking → Banking.</span>
        </div>
      ) : null}
      <OperatingPlanEntry key={profileId} profileId={profileId} businessName={props.businessName} evaluation={cockpit.operating_plan?.evaluation} version={cockpit.operating_plan?.version_number} currentDscr={cockpit.dscr.headline?.value ?? null} coverageEvaluation={cockpit.plan?.evaluation} canEdit={props.canUnderwrite} onRefresh={refreshFinancialFacts} onRequested={refreshFileRequests} />
      <details className={layoutStyles.sourceMetrics}>
        <summary>Review financial source metrics<span>Source evidence, corrections and bank indicators</span></summary>
        <div className={metricStyles.metricSection}><KpiRow className={metricStyles.metricGrid}>
        {metricCards.map((entry) => {
          const tone = entry.key === "dscr" ? cockpit.dscr.no_debt ? "ok" : dscrTone(headline?.status) : entry.key === "nsf_overdrafts" ? risks.fees.value ? "bad" : nsfIncomplete ? "mut" : "ok" : entry.key === "noi" && noiGovernancePresentation(cockpit.noi).tone === "warn" ? "warn" : entry.key === "ebitda" && ebitdaTile.provisional ? "warn" : ["cash_flow", "net_profit", "ebitda", "noi", "average_balance"].includes(entry.key) ? toneForSign(entry.currentValue) : "mut";
          const valueLabel = entry.unit === "currency" && entry.currentValue != null ? metricAmountLabel(entry.currentValue, entry.currency, 0, false) : entry.valueLabel;
          const afterLabel = entry.unit === "currency" && entry.projection.value != null ? metricAmountLabel(entry.projection.value, entry.currency, 0, false) : entry.projection.valueLabel;
          const sub = ["deposits", "cash_flow", "average_balance", "nsf_overdrafts"].includes(entry.key) ? bankPeriod : entry.key === "ebitda" ? ebitda ? `${ebitda.kind === "tax_estimate" ? "Tax estimate" : "P&L"} · ${ebitda.period?.split(" (")[0] ?? "Period unconfirmed"}` : "No earnings source" : entry.subLabel;
          return <FinancialKpiCard key={entry.key} label={entry.title} value={valueLabel} currencyNote={entry.unit === "currency" && !entry.currency ? "Currency unconfirmed" : undefined} tone={tone} sub={entry.key === "deposits" ? <span className="fc-kpi-spark"><span>{sub}</span><Sparkline values={depositValues} /></span> : sub} onClick={() => openMetricReview(entry.key)} projection={entry.projection.source !== "none" ? <><span>{entry.projection.source === "filed_offer" ? "Offer · illustration" : entry.projection.source === "working_plan" ? "Working plan · unsaved" : "Saved plan"}</span><br /><strong>{afterLabel}</strong>{entry.projection.status === "partial" ? " · partial estimate" : entry.projection.status === "unavailable" ? " · needs inputs" : entry.projection.status === "unchanged" ? " · unchanged" : ""}</> : undefined}>
            {entry.key === "deposits" && summary.deposit_trend_pct != null ? <span className="kdelta"><CellChip tone={summary.deposit_trend_pct >= 0 ? "ok" : "warn"}><Icon name={trendDirection(summary.deposit_trend_pct) === "down" ? "trendDn" : "trend"} size={11} />{signedPct(summary.deposit_trend_pct)}</CellChip></span> : null}
            {entry.key === "noi" ? <span className="sub" title={noiGovernancePresentation(cockpit.noi).reason}><CellChip tone={noiGovernancePresentation(cockpit.noi).tone}>{noiGovernancePresentation(cockpit.noi).label}</CellChip></span> : null}
            {entry.key === "dscr" ? <span className="sub">{cockpit.dscr.no_debt ? "No outstanding debt confirmed" : dscrLabel(headline?.status)}</span> : null}
            {entry.key === "nsf_overdrafts" ? <span className="sub">{negativeCaption}{nsfIncomplete || negativeIncomplete ? " · partial detail" : ""}</span> : null}
            {entry.key === "ebitda" ? <span className="sub">{[ebitda?.months_covered != null ? `${ebitda.months_covered} months` : null, ebitdaCurrency, ebitdaTile.provisional ? "provisional" : null, ebitdaCorrected ? "source corrected" : null, ebitdaTile.annualized ? "annualized" : null].filter(Boolean).join(" · ")}</span> : null}
          </FinancialKpiCard>;
        })}
      </KpiRow></div>
      </details>

      <div className="fc-grid">
        {coverageView}
      </div>

      <div className={layoutStyles.evidenceColumns}>
        <div>
          <TaxCard cockpit={cockpit} onOpenEvidence={props.onOpenEvidence} />
          <NetProfitCard cockpit={cockpit} />
        </div>
        <div>
          <ProfitAndLossCard cockpit={cockpit} onRequest={props.canUnderwrite ? () => requestFinancialStatement("profit_and_loss") : undefined} />
          <ExpensesCard cockpit={cockpit} />
        </div>
        <div>
          <BalanceSheetCard cockpit={cockpit} onRequest={props.canUnderwrite ? () => requestFinancialStatement("balance_sheet") : undefined} />
          <details className={`fc-card ${financialReviewStyles.mainDetails} ${layoutStyles.bankDetails}`} open>
            <summary>Bank trends and cash flow<span>{summary.months} statement months</span></summary>
            <div className={layoutStyles.bankCards}><BankCards cockpit={cockpit} months={selection.months} summary={selection.summary} accountLabel={selection.label} onOpenEvidence={props.onOpenEvidence} /></div>
          </details>
        </div>
      </div>

      <div className="fc-grid">
        {props.renderFundingPackage ? props.renderFundingPackage(<OfferPanel cockpit={cockpit} props={{ ...props, onStructureLoan: structureLoan }} workingFinancing={workingPlan} planSaveControls={marketplacePlanControls} innerRef={marketplaceRef} embedded />, cockpit) : <OfferPanel cockpit={cockpit} props={{ ...props, onStructureLoan: structureLoan }} workingFinancing={workingPlan} planSaveControls={marketplacePlanControls} innerRef={marketplaceRef} />}
      </div>
      {auxiliaryContent}
    </div>
  );
}
