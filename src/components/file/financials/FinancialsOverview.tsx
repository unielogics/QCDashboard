"use client";

// The Financials tab, drawn as the File design: six metrics before and after,
// the earnings plan, then rows of read-only cards. Every figure is worked out
// in src/lib/financialsOverview.ts from the cockpit; the cards only print it
// and open the editors that already exist (loan terms, the coverage review,
// the debt schedule, programs, the package).

import { useEffect, type ReactNode } from "react";
import { Btn, cx } from "@/components/ds";
import { FileWorkspaceLink, useFileWorkspace } from "@/components/file/FileWorkspaceContext";
import type { ApplicationProgramReadiness } from "@/lib/applicationProfile";
import type { CockpitBankSummary, CockpitMonth, FinancialCockpit } from "@/lib/financialCockpit";
import type { FinancialStatementRequestKind } from "@/lib/financialStatementRequests";
import {
  accountMovement,
  balanceSheet,
  bankTrends,
  coverageCard,
  coverageNotice,
  debtSchedule,
  earningsPotential,
  earningsSources,
  metricStrip,
  overdrafts,
  profitAndLoss,
  revenueTrend,
  statementPayments,
  taxReturns,
  trackedExpenses,
  type OverviewTable,
  type OverviewTag,
  type OverviewTone,
  type StripKey,
} from "@/lib/financialsOverview";
import { programCriterionLabel, programObservedValue, programRequiredValue } from "@/lib/programOpportunityPresentation";
import type { CoverageNoticeValue } from "./CoverageNotice";
import { EarningsPlanCard, usePlanSummary } from "./EarningsPlanCard";
import styles from "./FinancialsOverview.module.css";

/** The tabs of the advanced financial review a card can open. */
export type OverviewReviewTab = "plan" | "statements" | "risk" | "movements";
export type OverviewPackageState = { generated: boolean; inSync: boolean; summaryVersion: number | null; packetVersion: number | null };

export type FinancialsOverviewProps = {
  cockpit: FinancialCockpit;
  profileId: string;
  businessName: string;
  /** The bank months in view (the account switcher narrows them). */
  months: CockpitMonth[];
  summary: CockpitBankSummary;
  accountLabel?: string | null;
  canUnderwrite: boolean;
  /** The coverage scenario holds changes that are not saved yet. */
  unsavedScenario?: boolean;
  /** What the desk can do while the file has no debt schedule (enter it, ask for it, record no debt). */
  debtControls?: ReactNode;
  programReadiness: ApplicationProgramReadiness | null;
  packageState: OverviewPackageState;
  onOpenTerms: () => void;
  onOpenReview: (tab: OverviewReviewTab) => void;
  onOpenDebtSchedule: () => void;
  onOpenMetric: (key: "ebitda" | "noi" | "dscr") => void;
  onOpenEvidence: () => void;
  onRequestStatement?: (kind: FinancialStatementRequestKind) => void;
  onOpenPackage: () => void;
  onOpenMarketplace: () => void;
  /** The file's saved offer, when it has one: the link goes straight to it. */
  offerHref?: string | null;
  onRefresh: () => void | Promise<unknown>;
  onRequested: () => void;
  /** Coverage after the terms as one sentence, for the Underwriting tab; told again whenever it changes. */
  onCoverageNotice?: (notice: CoverageNoticeValue | null) => void;
};

function Tag({ tag }: { tag: OverviewTag | null | undefined }) {
  return tag ? <span className={cx(styles.tag, styles[`tag_${tag.tone}`])}>{tag.label}</span> : null;
}

function Card({ title, sub, tag, actions, top, children }: { title: string; sub?: ReactNode; tag?: OverviewTag | null; actions?: ReactNode; top?: boolean; children: ReactNode }) {
  return (
    <section className={styles.card} aria-label={title}>
      <div className={cx(styles.cardHead, top && styles.top)}>
        <div>
          <h3>{title}</h3>
          {sub ? <p>{sub}</p> : null}
        </div>
        {tag || actions ? <div className={styles.cardActions}><Tag tag={tag} />{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Columns from `numeric` on are figures: right-aligned and never wrapped. The first column wraps, and so do those named in `wrap`. */
function DataTable({ table, numeric = 1, wrap, label }: { table: OverviewTable; numeric?: number; wrap?: number[]; label: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>{table.head.map((head, index) => <th key={`${head}-${index}`} scope="col" className={index >= numeric ? styles.end : undefined}>{head}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key} className={cx(row.strong && styles.strong, row.muted && styles.muted)}>
              {row.cells.map((cell, index) => <td key={index} className={cx(index >= numeric ? styles.end : index > 0 && !wrap?.includes(index) && styles.tight, cell.tone && styles[`tone_${cell.tone}`])}>{cell.text}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className={styles.empty}><span>{children}</span>{action}</div>;
}

function Foot({ note, children }: { note?: string | null; children?: ReactNode }) {
  if (!note && !children) return null;
  return <div className={styles.cardFoot}>{note ? <p className={styles.note}>{note}</p> : null}{children}</div>;
}

const toneClass = (tone: OverviewTone | undefined) => (tone ? styles[`tone_${tone}`] : undefined);

/** Which metric review a strip cell opens. */
const REVIEWABLE: Partial<Record<StripKey, "ebitda" | "noi" | "dscr">> = { ebitda: "ebitda", noi: "noi", dscr: "dscr" };

const RULE_ORDER = ["dscr", "business_age_years", "use_of_funds_complete", "use_of_funds_total", "credit_score", "estimated_credit_score", "annual_revenue", "revenue"];

function programRows(readiness: ApplicationProgramReadiness) {
  const selection = readiness.selections?.[0];
  if (!selection) return [];
  const candidate = (readiness.candidates ?? []).find((row) => row.program_key === selection.program_key);
  const rules = (candidate?.rule_results ?? [])
    .map((rule) => ({ field: rule.field ?? "", operator: rule.operator ?? rule.op ?? "", required: rule.required, observed: rule.observed, status: String(rule.status ?? rule.state ?? "unknown"), negated: rule.negated }))
    .filter((rule) => rule.field && rule.operator && rule.operator !== "evidence_available");
  const rank = (field: string) => { const at = RULE_ORDER.indexOf(field); return at < 0 ? RULE_ORDER.length : at; };
  return [...rules].sort((a, b) => rank(a.field) - rank(b.field)).slice(0, 4).map((rule) => ({
    key: `${rule.field}:${rule.operator}`,
    label: programCriterionLabel(rule.field, "en"),
    value: `${programRequiredValue(rule, "en")} · ${rule.status === "pass" ? "met" : rule.status === "fail" ? "not met" : "to confirm"} · ${programObservedValue(rule.observed, rule.field, "en")} on file`,
    tone: (rule.status === "pass" ? "ok" : rule.status === "fail" ? "bad" : "mut") as OverviewTone,
  }));
}

export function FinancialsOverview(props: FinancialsOverviewProps) {
  const { cockpit, months, summary, canUnderwrite } = props;
  const fileWorkspace = useFileWorkspace();
  const linked = Boolean(fileWorkspace && !fileWorkspace.pageMode);
  const plan = usePlanSummary(props.profileId);
  const evaluation = plan.data?.evaluation ?? cockpit.operating_plan?.evaluation;
  const strip = metricStrip(cockpit, evaluation);
  const notice = coverageNotice(cockpit, evaluation);
  const noticeText = notice?.text ?? null, noticeTone = notice?.tone ?? null;
  const { onCoverageNotice } = props;
  useEffect(() => {
    onCoverageNotice?.(noticeText && noticeTone ? { text: noticeText, tone: noticeTone } : null);
  }, [noticeText, noticeTone, onCoverageNotice]);
  const coverage = coverageCard(cockpit);
  const debt = debtSchedule(cockpit);
  const tax = taxReturns(cockpit);
  const statement = profitAndLoss(cockpit);
  const sheet = balanceSheet(cockpit);
  const potential = earningsPotential(cockpit);
  const trend = revenueTrend(cockpit);
  const sources = earningsSources(cockpit);
  const expenses = trackedExpenses(cockpit, summary);
  const risk = overdrafts(months);
  const movement = accountMovement(cockpit);
  const bank = bankTrends(months, summary, props.accountLabel);
  const payments = statementPayments(cockpit, months);
  const readiness = props.programReadiness;
  const programs = readiness?.selections ?? [];
  const criteria = readiness ? programRows(readiness) : [];
  const packageState = props.packageState;
  const packageVersion = Math.max(packageState.summaryVersion ?? 0, packageState.packetVersion ?? 0);
  const packageTag: OverviewTag = !packageState.generated
    ? { label: "Not generated", tone: "mut" }
    : packageState.inSync
      ? { label: `Current${packageVersion ? ` · v${packageVersion}` : ""}`, tone: "ok" }
      : { label: "Needs refresh", tone: "warn" };

  return (
    <div className={styles.overview}>
      <section className={styles.strip} aria-label="Debt coverage and financial review">
        {strip.map((cell) => {
          const review = REVIEWABLE[cell.key];
          const body = (
            <>
              <div className={styles.stripLabel}>{cell.label}</div>
              <div className={cx(styles.stripValue, styles.num, cell.negative && styles.neg)}>{cell.value}</div>
              <div className={cx(styles.stripAfter, styles.num, toneClass(cell.tone))}>{cell.after ? `${cell.after} ${cell.note}` : cell.note}</div>
            </>
          );
          return review ? (
            <button key={cell.key} type="button" className={styles.stripCell} data-metric={cell.key} title={`Review how ${cell.label} is worked out`} onClick={() => props.onOpenMetric(review)}>{body}</button>
          ) : (
            <div key={cell.key} className={styles.stripCell} data-metric={cell.key}>{body}</div>
          );
        })}
      </section>

      <EarningsPlanCard cockpit={cockpit} summary={plan} profileId={props.profileId} businessName={props.businessName} canEdit={canUnderwrite} onRefresh={props.onRefresh} onRequested={props.onRequested} />

      <div className={styles.two}>
        <Card
          title="Debt service coverage and the plan"
          sub="The new loan against today's obligations."
          top
          actions={
            <>
              {props.unsavedScenario ? <Tag tag={{ label: "Unsaved scenario", tone: "warn" }} /> : null}
              <Btn size="sm" onClick={props.onOpenTerms}>Open loan terms</Btn>
            </>
          }
        >
          <div className={cx(styles.stats3, styles.num)}>
            <span>Today</span><strong>{coverage.today.value}</strong><span>{coverage.today.sub}</span>
            <span>With the plan</span><strong>{coverage.plan.value}</strong><span>{coverage.plan.sub}</span>
            <span>Cash released</span><strong className={toneClass(coverage.released.tone)}>{coverage.released.value}</strong><span>{coverage.released.sub}</span>
          </div>
          <div className={cx(styles.pairBars, styles.num)} aria-label="Annual debt service, today and with the plan">
            <div className={styles.today}><span>Today</span><span><i style={{ width: `${coverage.bars.todayShare}%` }} /></span><span>{coverage.bars.today}</span></div>
            <div className={styles.planned}><span>Plan</span><span><i style={{ width: `${coverage.bars.planShare}%` }} /></span><span>{coverage.bars.plan ?? "—"}</span></div>
          </div>
          <Foot note={coverage.note}>
            {linked ? <FileWorkspaceLink tool="coverage" className={styles.link}>Advanced review</FileWorkspaceLink> : <Btn size="sm" onClick={() => props.onOpenReview("plan")}>Advanced review</Btn>}
          </Foot>
        </Card>

        <Card title="Debt schedule and debt service" sub="Rows a person entered or confirmed win." top tag={debt.tag}>
          {debt.table ? <DataTable table={debt.table} numeric={2} wrap={[1]} label="Debt schedule" /> : null}
          {debt.empty ? <Empty action={props.debtControls}>{debt.empty}</Empty> : null}
          {debt.table ? (
            <Foot note={debt.more ? `${debt.more} more ${debt.more === 1 ? "row" : "rows"} on the schedule.` : null}>
              {canUnderwrite ? linked ? <FileWorkspaceLink tool="forms" kind="debt_schedule" view="form" className={styles.link}>Edit debt schedule</FileWorkspaceLink> : <button type="button" className={styles.link} onClick={props.onOpenDebtSchedule}>Edit debt schedule</button> : null}
            </Foot>
          ) : null}
        </Card>
      </div>

      <div className={styles.three}>
        <Card title="Tax returns" tag={tax.tag}>
          {tax.table ? <DataTable table={tax.table} label="Tax return lines by year" /> : null}
          {tax.empty ? <Empty action={canUnderwrite ? <Btn size="sm" onClick={props.onOpenEvidence}>Request tax returns</Btn> : undefined}>{tax.empty}</Empty> : null}
          <Foot note={tax.footer} />
        </Card>
        <Card title="Profit and loss" tag={statement.tag}>
          {statement.table ? <DataTable table={statement.table} label="Profit and loss lines" /> : null}
          {statement.empty ? <Empty action={props.onRequestStatement ? <Btn size="sm" onClick={() => props.onRequestStatement?.("profit_and_loss")}>Request profit and loss</Btn> : undefined}>{statement.empty}</Empty> : null}
          <Foot note={statement.footer} />
        </Card>
        <Card title="Balance sheet" tag={sheet.tag}>
          {sheet.table ? <DataTable table={sheet.table} label="Balance sheet lines" /> : null}
          {sheet.empty ? <Empty action={props.onRequestStatement ? <Btn size="sm" onClick={() => props.onRequestStatement?.("balance_sheet")}>Request balance sheet</Btn> : undefined}>{sheet.empty}</Empty> : null}
          <Foot note={sheet.footer} />
        </Card>
      </div>

      <div className={styles.three}>
        <Card title="DSCR and earnings potential" tag={potential.tag}>
          {potential.table ? <DataTable table={potential.table} label="Earnings needed for each coverage goal" /> : null}
          {potential.empty ? <Empty>{potential.empty}</Empty> : <Foot note={potential.footer} />}
        </Card>
        <Card title="Revenue trend and outlook" tag={trend.tag}>
          {trend.bars.length ? (
            <>
              <div className={styles.columns} role="img" aria-label={`Revenue by period: ${trend.bars.map((bar) => bar.label).join(", ")}`}>
                {trend.bars.map((bar) => <div key={bar.key} className={bar.latest ? styles.latest : undefined}><i style={{ height: `${bar.share}%` }} /></div>)}
              </div>
              <div className={cx(styles.columnLabels, styles.num)}>{trend.bars.map((bar) => <span key={bar.key}>{bar.label}</span>)}</div>
            </>
          ) : null}
          {trend.empty ? <Empty>{trend.empty}</Empty> : <Foot note={trend.footer} />}
        </Card>
        <Card title="Net profit and EBITDA sources" tag={sources.tag}>
          {sources.table ? <DataTable table={sources.table} label="Earnings sources" /> : null}
          {sources.empty ? <Empty>{sources.empty}</Empty> : null}
          <Foot note={sources.table ? sources.footer : null}>
            {canUnderwrite ? <button type="button" className={styles.link} onClick={() => props.onOpenMetric("ebitda")}>Review sources</button> : null}
          </Foot>
        </Card>
      </div>

      <div className={styles.three}>
        <Card title="Expenses we can track" tag={expenses.tag}>
          {expenses.table ? <DataTable table={expenses.table} numeric={2} label="Expense lines" /> : null}
          {expenses.empty ? <Empty>{expenses.empty}</Empty> : null}
          <Foot note={expenses.footer} />
        </Card>
        <Card title="Overdrafts and negative balances" tag={risk.tag}>
          {risk.stats.length ? (
            <div className={cx(styles.stats3, styles.num)}>
              {risk.stats.flatMap((stat) => [<span key={`${stat.label}-l`}>{stat.label}</span>, <strong key={`${stat.label}-v`} className={toneClass(stat.tone)}>{stat.value}</strong>, <span key={`${stat.label}-s`} />])}
            </div>
          ) : null}
          {risk.empty ? <Empty>{risk.empty}</Empty> : (
            <Foot note={risk.footer}><button type="button" className={styles.link} onClick={() => props.onOpenReview("risk")}>Balance risk</button></Foot>
          )}
        </Card>
        <Card title="Movement between accounts">
          {movement.table ? <DataTable table={movement.table} label="Transfers between accounts" /> : null}
          {movement.empty ? <Empty>{movement.empty}</Empty> : null}
          <Foot note={movement.footer}>
            {movement.table ? <button type="button" className={styles.link} onClick={() => props.onOpenReview("movements")}>Account movement</button> : null}
          </Foot>
        </Card>
      </div>

      <div className={styles.two}>
        <Card
          title="Program criteria and use of funds"
          tag={programs.length ? { label: `${programs[0].program_name}${programs.length > 1 ? ` +${programs.length - 1}` : ""}`, tone: "outline" } : { label: "No program chosen", tone: "mut" }}
        >
          {criteria.length ? (
            <div className={cx(styles.rows, styles.num)}>
              {criteria.map((row) => <div key={row.key}><span>{row.label}</span><span className={toneClass(row.tone === "mut" ? undefined : row.tone)}>{row.value}</span></div>)}
            </div>
          ) : programs.length ? (
            <div className={cx(styles.rows, styles.num)}>
              {(readiness?.programs ?? []).slice(0, 3).map((row) => <div key={row.selection_id}><span>{row.program_name}</span><span className={toneClass(row.complete ? "ok" : undefined)}>{row.satisfied_count} of {row.required_count} requirements met</span></div>)}
            </div>
          ) : (
            <Empty>Choose the funding programs for this file. They decide the criteria it is measured against and the documents it needs.</Empty>
          )}
          <Foot note={programs.length ? "The programs decide which documents the file needs; those are listed on Evidence and banking." : null}>
            {linked ? <FileWorkspaceLink tool="use-of-funds" className={styles.link}>Programs and use of funds</FileWorkspaceLink> : <button type="button" className={styles.link} onClick={() => props.onOpenReview("plan")}>Programs and use of funds</button>}
          </Foot>
        </Card>

        <Card title="Investor package and capital partners" tag={packageTag}>
          <p className={styles.note} style={{ fontSize: 13 }}>Executive summary, lender packet and investor presentation are generated together from saved file data.</p>
          <div className={styles.cardFoot}>
            <Btn size="sm" onClick={props.onOpenPackage}>{packageState.generated ? "Review investor package" : "Prepare investor package"}</Btn>
            {linked
              ? props.offerHref
                ? <a className={styles.link} href={props.offerHref} target="_blank" rel="noopener noreferrer">Review and publish offer</a>
                : <FileWorkspaceLink tool="marketplace" className={styles.link}>Review and publish offer</FileWorkspaceLink>
              : <button type="button" className={styles.link} onClick={props.onOpenMarketplace}>Review and publish offer</button>}
          </div>
        </Card>
      </div>

      <div className={styles.two}>
        <Card title="Bank trends and cash flow" sub={null} actions={<span className={styles.note} style={{ margin: 0 }}>{bank.sub}</span>}>
          {bank.columns.length ? (
            <>
              <div className={styles.months} role="img" aria-label={`Deposits and withdrawals for ${bank.columns.length} months`}>
                {bank.columns.map((column) => <div key={column.key} title={column.title} className={column.muted ? styles.pending : undefined}><i style={{ height: `${column.deposits}%` }} /><i style={{ height: `${column.withdrawals}%` }} /></div>)}
              </div>
              <div className={styles.monthLabels}>{bank.columns.map((column) => <span key={column.key}>{column.label}</span>)}</div>
              <div className={styles.legend}><span><i className={styles.dep} />Deposits</span><span><i className={styles.wd} />Withdrawals</span></div>
              <div className={cx(styles.inlineStats, styles.num)}>
                {bank.stats.map((stat) => <span key={stat.label}>{stat.label} <b className={toneClass(stat.tone)}>{stat.value}</b></span>)}
              </div>
            </>
          ) : null}
          {bank.empty ? <Empty action={<Btn size="sm" onClick={props.onOpenEvidence}>Open the evidence room</Btn>}>{bank.empty}</Empty> : null}
        </Card>
        <Card title="Statement payments and advances" tag={payments.tag}>
          {payments.table ? <DataTable table={payments.table} numeric={2} label="Lender and funder payments seen in the statements" /> : null}
          {payments.empty ? <Empty>{payments.empty}</Empty> : null}
          <Foot note={payments.table ? payments.footer : null}>
            {payments.table ? <button type="button" className={styles.link} onClick={() => props.onOpenReview("statements")}>Statement payments</button> : null}
          </Foot>
        </Card>
      </div>
    </div>
  );
}
