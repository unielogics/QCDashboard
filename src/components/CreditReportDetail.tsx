"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { CreditRiskReview } from "@/components/CreditRiskReview";
import { Btn, BtnLink, CellChip, Empty, Input, Panel, Sub } from "@/components/ds";
import type { ParsedReport, ParsedTradeAccount } from "@/lib/types";
import {
  creditAccountField, creditAccountLabel, creditAccountState, creditDisplayField, creditFieldGroups,
  creditMoney, creditMonthlyPayment, creditPretty, creditReportSummary, filterCreditAccounts, type CreditAccountFilter,
} from "@/lib/creditReportCockpit";
import styles from "./CreditReportDetail.module.css";

type View = "accounts" | "scores" | "review" | "inquiries" | "identity" | "records" | "report";
type RecordSelection = { kind: "collections" | "public_records"; index: number };

export function CreditReportDetail({ report, loading, reportLink }: {
  report: ParsedReport | undefined; loading?: boolean; reportLink?: string | null;
}) {
  if (loading) return <Panel><Sub>Loading credit report…</Sub></Panel>;
  if (!report) return <Panel><Sub>No parsed credit report on file.</Sub></Panel>;
  return <CreditCockpit report={report} reportLink={reportLink} />;
}

function CreditCockpit({ report, reportLink }: { report: ParsedReport; reportLink?: string | null }) {
  const [view, setView] = useState<View>("accounts");
  const [filter, setFilter] = useState<CreditAccountFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [scoreIndex, setScoreIndex] = useState(0);
  const [inquiryIndex, setInquiryIndex] = useState<number | null>(null);
  const [record, setRecord] = useState<RecordSelection | null>(null);
  const [basis, setBasis] = useState<"balance" | "monthly" | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summary = creditReportSummary(report);
  const visible = filterCreditAccounts(report.trade_accounts, filter, search);
  const account = selected == null ? undefined : report.trade_accounts[selected];
  const selectedPosition = visible.findIndex((item) => item.index === selected);
  const displayTotal = (value: number | null) => value == null ? "Not provided" : value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });

  function openAccounts(next: CreditAccountFilter, metric: "balance" | "monthly" | null = null) {
    setView("accounts"); setFilter(next); setSearch(""); setSelected(null); setBasis(metric);
  }
  function openAccount(index: number) {
    setSelected(index);
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      if (listRef.current && getComputedStyle(listRef.current).display === "none") {
        headingRef.current?.closest("section")?.scrollIntoView({ block: "start" });
      }
    });
  }
  function backToAccounts() {
    const previous = selected;
    const narrow = listRef.current && getComputedStyle(listRef.current).display === "none";
    setSelected(null);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>('[data-account-index="' + previous + '"]')?.focus({ preventScroll: !narrow }));
  }
  function openSource(source: string) {
    const trade = source.match(/(?:^|\.)trade_accounts\[(\d+)\]/);
    if (trade && Number(trade[1]) < report.trade_accounts.length) {
      setView("accounts"); setFilter("all"); setSearch(""); setBasis(null); openAccount(Number(trade[1])); return;
    }
    const item = source.match(/(?:^|\.)(collections|public_records)\[(\d+)\]/);
    if (item && Number(item[2]) < report[item[1] as RecordSelection["kind"]].length) {
      setView("records"); setRecord({ kind: item[1] as RecordSelection["kind"], index: Number(item[2]) }); return;
    }
    const score = source.match(/(?:^|\.)scores\[(\d+)\]/);
    if (score && Number(score[1]) < report.scores.length) { setView("scores"); setScoreIndex(Number(score[1])); return; }
    const inquiry = source.match(/(?:^|\.)inquiries\[(\d+)\]/);
    if (inquiry && Number(inquiry[1]) < report.inquiries.length) { setView("inquiries"); setInquiryIndex(Number(inquiry[1])); return; }
    if (/identity_risk|personal_info|addresses|employment/.test(source)) { setView("identity"); return; }
    setView("report");
  }

  const views: { id: View; label: string }[] = [
    { id: "accounts", label: "Accounts (" + summary.accounts + ")" },
    { id: "scores", label: "Scores" },
    { id: "review", label: "Review flags (" + (report.intelligence?.flag_count ?? 0) + ")" },
    { id: "inquiries", label: "Inquiries (" + summary.inquiries + ")" },
    { id: "identity", label: "Identity & history" },
    { id: "records", label: "Records (" + (summary.collections + summary.publicRecords) + ")" },
    { id: "report", label: "Full report details" },
  ];

  return <div className={styles.cockpit}>
    <header className={styles.header}>
      <div><h3>Credit report cockpit</h3><p className="sub">Choose a metric, account or report section to see its supporting details.</p></div>
      <div className="row">
        {report.intelligence?.high_count ? <Btn size="sm" onClick={() => setView("review")}><CellChip tone="bad">{report.intelligence.high_count} high priority</CellChip></Btn> : null}
        {reportLink ? <BtnLink size="sm" href={reportLink} target="_blank" rel="noopener noreferrer">Open source report<Icon name="arrowR" size={12} /></BtnLink> : null}
      </div>
    </header>

    {report.scores.length ? <div className={styles.scores} aria-label="Reported credit scores">
      {report.scores.map((score, index) => <button type="button" key={index} className={styles.score} aria-label={"View " + score.model + " score details"} onClick={() => { setScoreIndex(index); setView("scores"); }}>
        <span className="lbl">{score.model}</span><strong className="num">{score.score ?? "Not provided"}</strong>
        <span className="sub">{score.reason_codes.length ? score.reason_codes.length + (score.reason_codes.length === 1 ? " score factor" : " score factors") : "View reported details"} <Icon name="arrowR" size={12} /></span>
      </button>)}
    </div> : null}

    <div className={styles.metrics} aria-label="Credit report summary">
      <Metric label="Trade accounts" value={String(summary.accounts)} detail={summary.open + " reported open"} onClick={() => openAccounts("all")} />
      <Metric label="Adverse accounts" value={String(summary.adverse)} detail={summary.pastDue + " with reported past-due evidence"} danger={summary.adverse > 0} onClick={() => openAccounts("adverse")} />
      <Metric label="Reported balances" value={displayTotal(summary.balance)} detail={summary.balancesReported + " of " + summary.accounts + " accounts reported"} onClick={() => openAccounts("all", "balance")} />
      <Metric label="Monthly payments" value={displayTotal(summary.monthly)} detail={summary.paymentsReported + " of " + summary.accounts + " accounts reported"} onClick={() => openAccounts("all", "monthly")} />
    </div>

    <nav className={styles.navigation} aria-label="Credit report sections">
      {views.map((item) => <button type="button" key={item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
    </nav>

    {view === "accounts" ? <div className={[styles.workspace, account ? styles.detailsOpen : ""].join(" ")}>
      <div className={styles.accountList} ref={listRef}>
        <div className={styles.tools}>
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setSelected(null); }} aria-label="Search reported accounts" placeholder="Search creditor, account type or reported field…" />
          <div className={styles.filters} aria-label="Account filters">
            {([["all", "All", summary.accounts], ["open", "Open", summary.open], ["adverse", "Adverse", summary.adverse], ["past_due", "Past due", summary.pastDue]] as const).map(([id, label, count]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setSelected(null); }}>{label} <span className="num">{count}</span></button>)}
          </div>
          {basis ? <p className={styles.basis}>{basis === "balance" ? "Reported balances" : "Reported monthly payments"} are summed only where the provider supplied a numeric value. Missing values are not treated as zero. Review each contributing account below.</p> : null}
          <Sub>{visible.length} of {summary.accounts} accounts · Select a row for every reported field</Sub>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className="sr-only">Reported trade accounts</caption>
            <thead><tr><th>Creditor / account</th><th>Status</th><th>Balance</th><th>Monthly</th><th>Reported</th></tr></thead>
            <tbody>{visible.map(({ account: item, index }) => {
              const state = creditAccountState(item);
              const field = (names: string[]) => creditAccountField(item, names);
              return <tr key={index} data-selected={selected === index || undefined} data-adverse={state.isAdverse || undefined} onClick={() => openAccount(index)}>
                <td><button type="button" className={styles.rowButton} data-account-index={index} aria-current={selected === index ? "true" : undefined} aria-label={"View account " + (index + 1) + ": " + creditAccountLabel(item)} onClick={(event) => { event.stopPropagation(); openAccount(index); }}><strong>{creditAccountLabel(item)}</strong><Icon name="arrowR" size={13} /></button><div className="sub">{field(["account_type"]) || "Type not provided"}{field(["portfolio_type"]) ? " · " + field(["portfolio_type"]) : ""}</div><small className={styles.accountReference}>{field(["account_number", "account_no", "account_num"]) ? creditDisplayField("account_number", field(["account_number", "account_no", "account_num"])) + " · " : ""}Account {index + 1}</small></td>
                <td><CellChip tone={state.isOpen ? "ok" : "mut"}>{field(["account_status", "status"]) || "Not provided"}</CellChip>{state.isAdverse ? <div><CellChip tone="bad">Adverse</CellChip></div> : null}</td>
                <td className={basis === "balance" ? styles.highlight : undefined}>{creditMoney(field(["balance", "current_balance", "outstanding_balance"]))}</td>
                <td className={basis === "monthly" ? styles.highlight : undefined}>{creditMoney(creditMonthlyPayment(item))}</td>
                <td>{field(["date_reported", "reported_date"]) || "Not provided"}</td>
              </tr>;
            })}</tbody>
          </table>
          {!visible.length ? <Empty>{summary.accounts ? "No accounts match these filters." : "No trade accounts were provided in this report."}</Empty> : null}
        </div>
      </div>
      {account && selected != null ? <section className={styles.inspector} aria-label="Selected account details">
        <div className={styles.detailToolbar}><Btn size="sm" onClick={backToAccounts}>Back to accounts</Btn><div className="row"><Btn size="sm" disabled={selectedPosition <= 0} aria-label="Previous account" onClick={() => openAccount(visible[selectedPosition - 1].index)}>Previous</Btn><Btn size="sm" disabled={selectedPosition < 0 || selectedPosition >= visible.length - 1} aria-label="Next account" onClick={() => openAccount(visible[selectedPosition + 1].index)}>Next</Btn></div></div>
        <h3 ref={headingRef} tabIndex={-1}>{creditAccountLabel(account)}</h3><Sub>Account {selected + 1} · All fields supplied for this account</Sub>
        {creditAccountField(account, ["account_rating", "rating"]) ? <p className={creditAccountState(account).isAdverse ? styles.adverseText : "sub"}>{creditAccountField(account, ["account_rating", "rating"])}</p> : null}
        <AccountDetails account={account} />
      </section> : null}
    </div> : null}

    {view === "scores" ? <Panel title="Score details">
      {report.scores.length ? <><div className={styles.filters}>{report.scores.map((score, index) => <button type="button" key={index} aria-pressed={scoreIndex === index} onClick={() => setScoreIndex(index)}>{score.model}</button>)}</div>
        <h3>{report.scores[scoreIndex]?.model}</h3><p className={styles.scoreValue}>{report.scores[scoreIndex]?.score ?? "Not provided"}</p><h4>Reported score factors</h4>
        {report.scores[scoreIndex]?.reason_codes.length ? <ul className={styles.reasonList}>{report.scores[scoreIndex].reason_codes.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : <Sub>No score factors were supplied for this model.</Sub>}
      </> : <Empty>No scores were provided in this report.</Empty>}
    </Panel> : null}

    {view === "review" ? report.intelligence ? <CreditRiskReview review={report.intelligence} onSourceOpen={openSource} /> : <Panel title="Credit review"><Empty>No structured review flags are available. The reported account details remain available.</Empty></Panel> : null}

    {view === "inquiries" ? <Panel title={"Inquiries (" + report.inquiries.length + ")"}>
      {report.inquiries.length ? <div className={styles.inquiryList}>{report.inquiries.map((inquiry, index) => <details key={index} open={inquiryIndex === index ? true : undefined}><summary><strong>{inquiry.fields.company || "Inquiring company not provided"}</strong><span>{inquiry.fields.date || "Date not provided"}</span><Icon name="arrowR" size={13} /></summary><ReportFields value={inquiry.fields} /></details>)}</div> : <Empty>No inquiries were provided in this report.</Empty>}
    </Panel> : null}

    {view === "identity" ? <IdentityDetails report={report} /> : null}

    {view === "records" ? <div className={styles.records}>
      <Panel title="Collections & public records">
        {!(report.collections.length + report.public_records.length) ? <Empty>No collections or public records were provided.</Empty> : null}
        {(["collections", "public_records"] as const).map((kind) => report[kind].map((item, index) => <button type="button" className={styles.recordButton} key={kind + index} aria-pressed={record?.kind === kind && record.index === index} onClick={() => setRecord({ kind, index })}><span><strong>{kind === "collections" ? "Collection " : "Public record "}{index + 1}</strong><small>{item.company || item.creditor || item.court || item.type || "View all reported fields"}</small></span><Icon name="arrowR" size={14} /></button>))}
      </Panel>
      {record && report[record.kind][record.index] ? <Panel title={(record.kind === "collections" ? "Collection " : "Public record ") + (record.index + 1)}><ReportFields value={report[record.kind][record.index]} /></Panel> : null}
    </div> : null}

    {view === "report" ? <div className={styles.fullReport} aria-label="Full reported details">
      <Panel title="Full report details"><Sub>All structured sections supplied by the report provider. Open an account or section below to inspect its fields.</Sub>
        <ReportSection title="Scores" value={report.scores} />
        <ReportSection title="Personal information" value={report.personal_info} />
        <ReportSection title="Identity risk" value={report.identity_risk} />
        <ReportSection title="Address history" value={report.addresses} />
        <ReportSection title="Employment history" value={report.employment} />
        <details><summary>Trade accounts ({report.trade_accounts.length})</summary><div className="grid g12">{report.trade_accounts.map((item, index) => <details key={index}><summary>{creditAccountLabel(item)} · Account {index + 1}</summary><Btn size="sm" onClick={() => openSource("trade_accounts[" + index + "]")}>Open account details</Btn><AccountDetails account={item} /></details>)}{!report.trade_accounts.length ? <Sub>No trade accounts supplied.</Sub> : null}</div></details>
        <ReportSection title="Inquiries" value={report.inquiries} />
        <ReportSection title="Collections" value={report.collections} />
        <ReportSection title="Public records" value={report.public_records} />
        {Object.entries(report.additional_sections ?? {}).map(([title, value]) => <ReportSection key={title} title={creditPretty(title)} value={value} />)}
        {report.intelligence ? <details><summary>Credit review findings</summary><CreditRiskReview review={report.intelligence} onSourceOpen={openSource} /></details> : null}
      </Panel>
    </div> : null}
  </div>;
}
function Metric({ label, value, detail, danger, onClick }: { label: string; value: string; detail: string; danger?: boolean; onClick: () => void }) {
  return <button type="button" className={styles.metric} onClick={onClick}><span className="lbl">{label}</span><strong className={danger ? styles.adverseText : "num"}>{value}</strong><span className="sub">{detail}<Icon name="arrowR" size={12} /></span></button>;
}

function AccountDetails({ account }: { account: ParsedTradeAccount }) {
  return <div className={styles.accountDetails}>{creditFieldGroups(account.fields).map((group) => <section key={group.title}><h4>{group.title}</h4><dl className={styles.fields}>{group.fields.map(([key, value]) => <div key={key}><dt>{creditPretty(key)}</dt><dd>{creditDisplayField(key, value)}</dd></div>)}</dl></section>)}
    {!Object.keys(account.fields).some((key) => /history|payment_pattern|payment_record/.test(key)) ? <Sub>A detailed payment-history timeline was not supplied for this account.</Sub> : null}
  </div>;
}

function IdentityDetails({ report }: { report: ParsedReport }) {
  return <div className="grid g12"><Panel title="Identity checks"><ReportFields value={report.identity_risk} /></Panel><Panel title="Personal information"><ReportFields value={report.personal_info} /></Panel><Panel title="Address history"><ReportFields value={report.addresses} /></Panel><Panel title="Employment history"><ReportFields value={report.employment} /></Panel></div>;
}

function ReportSection({ title, value }: { title: string; value: unknown }) {
  return <details><summary>{title}</summary><ReportFields value={value} /></details>;
}

function ReportFields({ value, field = "" }: { value: unknown; field?: string }) {
  if (Array.isArray(value)) return value.length ? <div className="grid g12">{value.map((item, index) => <section className={styles.reportItem} key={index}><ReportFields value={item} field={field} /></section>)}</div> : <Sub>Not provided.</Sub>;
  if (value && typeof value === "object") return Object.keys(value).length ? <dl className={styles.fields}>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{creditPretty(key)}</dt><dd><ReportFields value={item} field={key} /></dd></div>)}</dl> : <Sub>Not provided.</Sub>;
  return <span>{creditDisplayField(field, value)}</span>;
}
