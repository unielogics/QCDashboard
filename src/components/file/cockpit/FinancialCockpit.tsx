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
//
// The tab opens on the overview grid (components/file/financials): six metrics
// before and after, the earnings plan, then read-only cards. The editors stay
// where they were: the coverage card is mounted for its drawers, and the
// source metrics, the statement detail and the package workspace fold away
// under the grid.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, KpiRow, Loading, Seg, StatusLine, cx, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { FinancialWorkspace } from "@/components/application/FinancialWorkspace";
import { FinancialsOverview, type OverviewReviewTab } from "@/components/file/financials/FinancialsOverview";
import overviewStyles from "@/components/file/financials/FinancialsOverview.module.css";
import type { CoverageNoticeValue } from "@/components/file/financials/CoverageNotice";
import { RequestFilesDialog } from "@/components/application/RequestFilesDialog";
import { balanceSheetIsEmpty, financialStatementRequest, profitAndLossIsEmpty, type FinancialStatementRequestKind } from "@/lib/financialStatementRequests";
import { BucketFileReviewPanel, type BucketFileReview, type BucketReviewFile } from "@/components/buckets/BucketFileReviewPanel";
import { loadFinancialSourcePreview, restoreFinancialSourceFocus } from "@/lib/financialSourcePreview";
import { validPdfSourcePage } from "@/lib/pdfSourceNavigation";
import { balanceRiskMonths, riskCountLabel, riskTotals } from "@/lib/balanceRisk";
import { ebitdaIsStaffCorrected, ebitdaKpi, metricAmountLabel, metricCurrency } from "@/lib/financialMetrics";
import { ApplicationProgramReadiness } from "@/components/application/ApplicationProgramReadiness";
import type { BudgetEditorControls } from "@/components/application/UseOfFundsBudgetEditor";
import { createUseOfFundsDraftStore } from "@/lib/useOfFundsDraft";
import type { MarketplaceFinancialAction } from "@/lib/marketplaceIssues";
import { noiGovernancePresentation } from "@/lib/noiGovernance";
import { useAuthedApi, useFinancialCockpit } from "@/hooks/useApi";
import type { WorkingFinancing } from "@/lib/workingFinancing";
import type { ApplicationProgramReadiness as ProgramReadiness, ApplicationTermSheetState } from "@/lib/applicationProfile";
import type { FundingProgramVertical } from "@/lib/fundingPrograms";
import {
  compactMoney,
  count,
  dscrLabel,
  dscrTone,
  money,
  monthShort,
  multiple,
  ratioPct,
  signedPct,
  trendDirection,
  type CockpitDscrCandidate,
  type CockpitBankSummary,
  type CockpitMonth,
  type FinancialCockpit as Cockpit,
  scheduleStatusShort,
  scheduleStatusTone,
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
  /** Go to the Underwriting tab, where the client terms are the first step. */
  onOpenUnderwriting?: () => void;
  /** Bumped by the file page to unfold the package workspace and bring it into view. */
  packageRequest?: number;
  /** Coverage after the terms, in one sentence, for the Underwriting tab (the same figures as the strip here). */
  onCoverageNotice?: (notice: (CoverageNoticeValue & { profileId: string }) | null) => void;
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

// ---------------------------------------------------------------------------
// The cockpit
// ---------------------------------------------------------------------------

export function FinancialCockpit(props: Props) {
  const fileWorkspace = useFileWorkspace();
  const { profileId, onRefreshProgramReadiness, onWorkingFinancingChange, onCoverageNotice } = props;
  const coverageNoticeChanged = useCallback((notice: CoverageNoticeValue | null) => { onCoverageNotice?.(notice ? { ...notice, profileId } : null); }, [onCoverageNotice, profileId]);
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
  const [reviewTabWanted, setReviewTabWanted] = useState<OverviewReviewTab>("plan");
  // On the file page the tools open in their own tabs, so the package workspace starts folded under the grid and a
  // deep link (or its card) opens it. Where the cockpit is the only surface, it holds the working panel and starts open.
  const [packageOpen, setPackageOpen] = useState(() => !fileWorkspace || (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("workspace") === "package" || window.location.hash === "#package-readiness")));
  const [packageShown, setPackageShown] = useState(0);
  const packageRef = useRef<HTMLDetailsElement>(null);
  const packageTarget = useRef<"package" | "marketplace" | null>(null);
  const showPackage = useCallback((target: "package" | "marketplace" = "package") => { packageTarget.current = target; setPackageOpen(true); setPackageShown((value) => value + 1); }, []);
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
  const { focus, onFocusHandled, packageRequest } = props;
  useEffect(() => {
    if (focus === "marketplace" && query.data) {
      showPackage("marketplace");
      onFocusHandled();
    }
  }, [focus, onFocusHandled, query.data, showPackage]);
  useEffect(() => { if (packageRequest) showPackage(); }, [packageRequest, showPackage]);
  useEffect(() => {
    const target = packageTarget.current;
    if (!target || !packageOpen) return;
    const node = (target === "marketplace" ? marketplaceRef.current : null) ?? packageRef.current;
    if (!node) return;
    packageTarget.current = null;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [packageOpen, packageShown, query.data]);
  useEffect(() => {
    const open = () => setMetricDebtOpen(true);
    window.addEventListener(OPEN_DEBT_SCHEDULE_EVENT, open);
    return () => window.removeEventListener(OPEN_DEBT_SCHEDULE_EVENT, open);
  }, []);

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
  const coverageView = (<CoverageCard workspaceTool={props.workspaceTool} key={props.profileId} businessName={props.businessName} cockpit={cockpit} months={selection.months} summary={selection.summary} accountLabel={selection.label} accountKey={resolvedAccountChoice} canEdit={props.canUnderwrite || props.canRecordTerms || props.canPublish} canReviewDebt={props.canUnderwrite} canCorrectMetrics={props.canUnderwrite} profileId={props.profileId} canRecordTerms={props.canRecordTerms} onRecordTerms={props.onRecordTerms} onEconomicsSaved={props.onEconomicsSaved} termsKind={props.termsKind} onOpenEvidence={props.onOpenEvidence} onRefresh={refreshFinancialFacts} onPreviewSource={openSourcePreview} onRequestStatement={props.canUnderwrite ? requestFinancialStatement : undefined} onWorkingPlanChange={workingPlanChanged} reviewRequest={planReviewRequest} reviewTab={reviewTabWanted} showSummary={false} termsRequest={termsOpenRequest}
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
  const openReview = (tab: OverviewReviewTab) => { setReviewTabWanted(tab); setPlanReviewRequest((value) => value + 1); };
  const openTerms = props.termsKind !== "production" && props.onOpenUnderwriting ? props.onOpenUnderwriting : structureLoan;
  const packageStatus = !props.packageState.generated ? "Not generated yet" : props.packageState.inSync ? "Saved package is current" : "Saved package needs a refresh";
  return (
    <div className={cx("fin-cockpit", layoutStyles.layout)}>
      <div className="fc-head" style={{ flexWrap: "nowrap" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <h3 className="sr-only">Financial cockpit</h3>
          <div className="fc-coverage">
            <CellChip tone={coverage.bank_months_accepted >= coverage.bank_months_required ? "ok" : "warn"}>Statements {coverage.bank_months_accepted}/{coverage.bank_months_required}</CellChip>
            <CellChip tone={coverage.tax_years.length ? "ok" : "mut"}>Tax returns {coverage.tax_years.length ? coverage.tax_years.join(", ") : "none"}</CellChip>
            <CellChip tone={coverage.has_profit_and_loss ? "ok" : "mut"}>P&amp;L {yesNo(coverage.has_profit_and_loss)}</CellChip>
            <CellChip tone={scheduleStatusTone(coverage.debt_schedule_status ?? "missing")}>Debt schedule · {scheduleStatusShort(coverage.debt_schedule_status ?? "missing", coverage.debt_rows)}</CellChip>
            <span className="sub">
              {props.businessName} · read from {coverage.files_analyzed} analyzed file{coverage.files_analyzed === 1 ? "" : "s"} ({coverage.files_accepted} accepted){Number.isNaN(generated.getTime()) ? "" : ` · ${generated.toLocaleString()}`}
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 8, flex: "none", flexWrap: "nowrap" }}>
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

      <FinancialsOverview
        key={`overview:${profileId}`}
        cockpit={cockpit}
        profileId={profileId}
        businessName={props.businessName}
        months={selection.months}
        summary={selection.summary}
        accountLabel={cockpit.bank.accounts.length > 1 ? selection.label : null}
        canUnderwrite={props.canUnderwrite}
        unsavedScenario={workingPlan?.profileId === props.profileId && workingPlan.dirty}
        debtControls={cockpit.debt?.schedule ? <DebtScheduleControls cockpit={cockpit} profileId={profileId} canEdit={props.canUnderwrite} onOpenEvidence={props.onOpenEvidence} compact /> : undefined}
        programReadiness={props.programReadiness}
        packageState={props.packageState}
        onOpenTerms={openTerms}
        onOpenReview={openReview}
        onOpenDebtSchedule={() => setMetricDebtOpen(true)}
        onOpenMetric={openMetricReview}
        onOpenEvidence={props.onOpenEvidence}
        onRequestStatement={props.canUnderwrite ? requestFinancialStatement : undefined}
        onOpenPackage={() => showPackage()}
        onOpenMarketplace={() => showPackage("marketplace")}
        onRefresh={refreshFinancialFacts}
        onRequested={refreshFileRequests}
        onCoverageNotice={coverageNoticeChanged}
      />

      <details className={cx(overviewStyles.fold, layoutStyles.sourceMetrics)}>
        <summary>Review financial source metrics<span>Source evidence, corrections and bank indicators</span></summary>
        <div className={metricStyles.metricSection}><KpiRow className={metricStyles.metricGrid}>
        {metricCards.map((entry) => {
          const tone = entry.key === "dscr" ? cockpit.dscr.no_debt ? "ok" : dscrTone(headline?.status) : entry.key === "nsf_overdrafts" ? risks.fees.value ? "bad" : nsfIncomplete ? "mut" : "ok" : entry.key === "noi" && noiGovernancePresentation(cockpit.noi).tone === "warn" ? "warn" : entry.key === "ebitda" && ebitdaTile.provisional ? "warn" : ["cash_flow", "net_profit", "ebitda", "noi", "average_balance"].includes(entry.key) ? toneForSign(entry.currentValue) : "mut";
          const valueLabel = entry.unit === "currency" && entry.currentValue != null ? metricAmountLabel(entry.currentValue, entry.currency, 0, false) : entry.valueLabel;
          const afterLabel = entry.unit === "currency" && entry.projection.value != null ? metricAmountLabel(entry.projection.value, entry.currency, 0, false) : entry.projection.valueLabel;
          const sub = ["deposits", "cash_flow", "average_balance", "nsf_overdrafts"].includes(entry.key) ? bankPeriod : entry.key === "ebitda" ? ebitda ? `${ebitda.kind === "tax_estimate" ? "Filed return" : "P&L"} · ${ebitda.period?.split(" (")[0] ?? "Period unconfirmed"}` : "No earnings source" : entry.subLabel;
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

      <details className={overviewStyles.fold}>
        <summary>Statement detail<span>Every tax line, the profit-and-loss ladder, the balance sheet and the bank months</span></summary>
        <div className={overviewStyles.foldBody}>
          <div className={layoutStyles.evidenceColumns}>
            <div>
              <TaxCard cockpit={cockpit} onOpenEvidence={props.onOpenEvidence} />
            </div>
            <div>
              <ProfitAndLossCard cockpit={cockpit} onRequest={props.canUnderwrite ? () => requestFinancialStatement("profit_and_loss") : undefined} />
              <BalanceSheetCard cockpit={cockpit} onRequest={props.canUnderwrite ? () => requestFinancialStatement("balance_sheet") : undefined} />
            </div>
            <div>
              <details className={`fc-card ${financialReviewStyles.mainDetails} ${layoutStyles.bankDetails}`} open>
                <summary>Bank trends and cash flow<span>{summary.months} statement months</span></summary>
                <div className={layoutStyles.bankCards}><BankCards cockpit={cockpit} months={selection.months} summary={selection.summary} accountLabel={selection.label} onOpenEvidence={props.onOpenEvidence} /></div>
              </details>
            </div>
          </div>
        </div>
      </details>

      <details className={overviewStyles.fold} id="financials-package" ref={packageRef} open={packageOpen} onToggle={(event) => setPackageOpen(event.currentTarget.open)}>
        <summary>Investor package and capital partners<span>{packageStatus}</span></summary>
        <div className={overviewStyles.foldBody}>
          <div className="fc-grid">
            {props.renderFundingPackage ? props.renderFundingPackage(<OfferPanel cockpit={cockpit} props={{ ...props, onStructureLoan: structureLoan }} workingFinancing={workingPlan} planSaveControls={marketplacePlanControls} innerRef={marketplaceRef} embedded />, cockpit) : <OfferPanel cockpit={cockpit} props={{ ...props, onStructureLoan: structureLoan }} workingFinancing={workingPlan} planSaveControls={marketplacePlanControls} innerRef={marketplaceRef} />}
          </div>
        </div>
      </details>

      {coverageView}
      {auxiliaryContent}
    </div>
  );
}
