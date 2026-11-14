"use client";

import { useEffect, useState } from "react";
import type { ReviewInput } from "@/lib/earningsPlan/api";
import { setAttestation, setNotes } from "@/lib/earningsPlan/edit";
import { count, stamp } from "@/lib/earningsPlan/format";
import { beforeAfterTable, bridgeRows, compareBars, handoffRows, liveMetrics, ramp, reviewRows, type DebtBasis } from "@/lib/earningsPlan/view";
import type { BaselineTreatment, PlanResult, PlanVersion, PlanView } from "@/lib/earningsPlan/types";
import type { PlanBusy } from "./useEarningsPlan";
import type { StepCommon } from "./StepSource";
import { Card, TagChip, cx } from "./parts";
import styles from "./EarningsPlan.module.css";

const TREATMENTS: Array<{ value: BaselineTreatment; label: string }> = [
  { value: "unreconciled", label: "Not yet reconciled" },
  { value: "included_in_baseline", label: "Current cost or revenue included in baseline" },
  { value: "incremental_to_baseline", label: "Incremental to baseline" },
  { value: "outside_operating_earnings", label: "Outside operating earnings" },
];
const RAMP_HEIGHT = 120;

/** Step 4: today against the plan, the bridge and the ramp, the saved report, staff review, and the business's confirmation. */
export function StepReview({ body, facts, disabled, staff, edit, result, view, basis, busy, unsavedInReport, businessName, onOpenPdf, onReview }: StepCommon & {
  result: PlanResult; view: PlanView; basis: DebtBasis; busy: PlanBusy;
  /** The working copy holds changes the latest saved version does not. */
  unsavedInReport: boolean; businessName: string;
  onOpenPdf: (version: PlanVersion) => Promise<void>;
  onReview?: (input: Omit<ReviewInput, "contextStamp" | "key">) => Promise<void>;
}) {
  const { baseline } = facts;
  const metrics = liveMetrics(baseline, result, view, basis);
  const table = beforeAfterTable(baseline, result, basis);
  const bars = compareBars(metrics);
  const bridge = bridgeRows(baseline, result, view);
  const months = ramp(baseline, result, view, basis, body.plan_start);
  const handoff = handoffRows(body, baseline);
  const reports = facts.versions.filter(version => version.pdf_file_id || version.pdf_url);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState("");
  const report = reports.find(version => version.id === chosen) ?? reports.find(version => version.id === facts.currentVersionId) ?? reports[0] ?? null;

  return (
    <div className={styles.stack}>
      <Card label="Before and after">
        <div className={cx(styles.cardHead, styles.base)}>
          <h2 style={{ flex: "1 1 auto" }}>Before and after</h2>
          <span className={styles.small}>Reviewed uses approved changes only</span>
        </div>
        {table.length ? (
          <div className={styles.tableWrap}>
            <table className={cx(styles.table, styles.min560)}>
              <thead><tr><th>Metric</th><th className={styles.end}>Current</th><th className={styles.end}>Working plan</th><th className={styles.end}>Reviewed</th><th className={styles.end}>Change</th></tr></thead>
              <tbody>
                {table.map(row => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className={cx(styles.end, styles.muted)}>{row.current}</td>
                    <td className={styles.end} style={{ fontWeight: 600 }}>{row.plan}</td>
                    <td className={styles.end}>{row.reviewed}</td>
                    <td className={cx(styles.end, row.tone === "ok" ? styles.pos : row.tone === "bad" ? styles.neg : styles.muted)}>{row.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.sectionEmpty}>The comparison appears once the file has an earnings source.</p>}
        <p className={styles.fine}>
          Cash after debt uses earnings and loan payments; it is not a bank balance. A projection is not a profit guarantee or financing approval.
          Below 1.00x means illustrated earnings do not cover stated debt service.
        </p>
      </Card>

      <div className={styles.three}>
        <Card label="Baseline against plan">
          <h2>Baseline against plan</h2>
          <div className={styles.bars}>
            {bars.map(bar => (
              <div className={styles.barRow} key={bar.label}>
                <b>{bar.label}</b>
                <div className={cx(styles.barLine, styles.before)}><span><i className={styles[`fill_${bar.beforeTone}`]} style={{ width: `${bar.beforeWidth}%` }} /></span><span className={styles.num}>{bar.before}</span></div>
                <div className={cx(styles.barLine, styles.after)}><span><i className={styles[`fill_${bar.afterTone}`]} style={{ width: `${bar.afterWidth}%` }} /></span><span className={styles.num}>{bar.after}</span></div>
              </div>
            ))}
          </div>
          <p className={styles.fine} style={{ marginTop: 14 }}>Top bar is the baseline, bottom bar is the plan. Red marks a negative value.</p>
        </Card>

        <Card label="EBITDA bridge">
          <h2>EBITDA bridge</h2>
          {bridge.length ? (
            <div className={styles.bridge}>
              {bridge.map(row => (
                <div className={cx(styles.bridgeRow, row.total && styles.total)} key={row.label}>
                  <span>{row.label}</span>
                  <span><i style={{ left: `${row.zero}%` }} />{row.bar ? <i className={styles[`fill_${row.bar.tone}`]} style={{ left: `${row.bar.left}%`, right: `${row.bar.right}%` }} /> : null}</span>
                  <span className={styles.num}>{row.value}</span>
                </div>
              ))}
            </div>
          ) : <p className={styles.sectionEmpty}>The bridge appears once the file has an earnings source.</p>}
          <p className={styles.fine} style={{ marginTop: 14 }}>Each step is applied in this order on top of the ones above, so the steps add up exactly to the plan figure.</p>
        </Card>

        <Card label="12-month ramp">
          <div className={cx(styles.cardHead, styles.base)}>
            <h2>12-month ramp</h2>
            {months ? <span className={cx(styles.small, styles.num)}>{months.text}</span> : null}
          </div>
          {months ? (
            <>
              <div className={styles.ramp}>
                {months.payment != null ? <div className={styles.rampPay} style={{ top: RAMP_HEIGHT - months.payment * RAMP_HEIGHT }} /> : null}
                <div className={styles.rampAxis} />
                <div className={styles.rampBars}>
                  {months.months.map((month, index) => (
                    <div key={index} title={`${month.label}: ${month.value}`}>
                      <span><i style={{ height: month.up * RAMP_HEIGHT }} /></span>
                      <span><i style={{ height: month.down * RAMP_HEIGHT }} /></span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={cx(styles.rampLabels, styles.num)}>{months.months.map((month, index) => <span key={index}>{month.label}</span>)}</div>
              {/* Under the chart, where it cannot cover a bar. */}
              {months.paymentText ? <div className={cx(styles.rampLegend, styles.num)}><i aria-hidden="true" />{months.paymentText}</div> : null}
            </>
          ) : <p className={styles.sectionEmpty}>The ramp appears once the file has an earnings source.</p>}
          <p className={styles.fine} style={{ marginTop: 12 }}>
            Monthly EBITDA as each change takes effect, after one-time setup costs.{months?.payment != null ? " Bars above the dashed line cover the monthly debt payment." : ""}
          </p>
        </Card>

        <Card label="Plan report">
          <div className={cx(styles.cardHead, styles.center)}>
            <h2>Plan report</h2>
            {reports.length ? (
              <select className={styles.input} aria-label="Report version" value={report?.id ?? ""} onChange={event => setChosen(event.target.value)}>
                {reports.map(version => (
                  <option key={version.id} value={version.id}>v{version.version_number} · {stamp(version.created_at)}{version.id === facts.currentVersionId ? " · Current" : ""}</option>
                ))}
              </select>
            ) : null}
          </div>
          <div className={styles.report}>
            <div className={styles.page} aria-hidden="true">
              <div className={styles.pageBrand}>Qualified Commercial</div>
              <div className={styles.pageTitle}>Operating Expenses and Earnings Plan</div>
              <div className={styles.pageSub}>{businessName}{report ? ` · v${report.version_number}` : ""}</div>
              <div className={cx(styles.pageMetrics, styles.num)}>
                {metrics.map(row => [<span key={`${row.key}-l`}>{row.label}</span>, <span key={`${row.key}-b`}>{row.before}</span>, <b key={`${row.key}-a`}>{row.after}</b>])}
              </div>
              <div className={styles.pageBars}>
                {bridge.map(row => <span key={row.label}>{row.bar ? <i className={styles[`fill_${row.bar.tone}`]} style={{ left: `${row.bar.left}%`, right: `${row.bar.right}%` }} /> : null}</span>)}
              </div>
            </div>
            <div className={styles.reportSide}>
              <p className={styles.muted} style={{ margin: 0 }}>Each saved version produces a dated PDF of the plan as it stood: the source figures, the changes with their reasons, and the before and after.</p>
              {report
                ? <button type="button" className={styles.btn} onClick={() => { setPdfError(""); onOpenPdf(report).catch(error => setPdfError(error instanceof Error ? error.message : "The PDF could not be opened.")); }}>Open PDF v{report.version_number}</button>
                : <span className={styles.small}>No version is saved yet.</span>}
              {pdfError ? <span className={styles.neg} role="alert">{pdfError}</span> : null}
              {unsavedInReport && !disabled ? <p className={styles.fine} style={{ margin: 0 }}>Draft changes are not in {report ? "this PDF" : "a PDF"}. Save a version to include them.</p> : null}
            </div>
          </div>
        </Card>
      </div>

      {staff && onReview
        ? <StaffReview key={facts.familyId ?? "new"} rows={reviewRows(body, result, facts.staleReviews)} busy={busy} disabled={disabled} onReview={onReview} />
        : <div className={styles.notice} role="note"><span>Underwriting reviews proposed changes before they can enter a reviewed projection.</span></div>}

      <Card label="Confirmation and handoff">
        <label className={styles.check}>
          <input type="checkbox" checked={body.attestation} disabled={disabled} onChange={event => edit(current => setAttestation(current, event.target.checked))} />
          I confirm these disclosures and proposals
        </label>
        <label className={styles.label} style={{ marginTop: 12 }}>Plan and handoff notes
          <textarea className={styles.input} value={body.notes} maxLength={10000} disabled={disabled} onChange={event => edit(current => setNotes(current, event.target.value))} />
        </label>
        <div className={styles.handoff}>
          <b style={{ fontSize: 13 }}>Tax preparer handoff</b>
          <p className={styles.fine} style={{ margin: "4px 0 8px" }}>
            Historical source corrections stay separate from future plans. Share the saved PDF with the tax preparer for review. This does not file or amend a return.
          </p>
          {handoff.map(row => <div className={styles.num} key={row.key}><b>{row.label}</b> · {row.reason}</div>)}
          {!handoff.length ? <span className={styles.small}>No historical differences recorded.</span> : null}
        </div>
      </Card>
    </div>
  );
}

function StaffReview({ rows, busy, disabled, onReview }: {
  rows: ReturnType<typeof reviewRows>; busy: PlanBusy; disabled: boolean; onReview: (input: Omit<ReviewInput, "contextStamp" | "key">) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [treatment, setTreatment] = useState<BaselineTreatment>("unreconciled");
  const [reconciliation, setReconciliation] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  // A change that was removed cannot stay selected.
  useEffect(() => { setSelected(current => { const kept = current.filter(id => rows.some(row => row.id === id && row.reviewable)); return kept.length === current.length ? current : kept; }); }, [rows]);
  const chosen = rows.filter(row => selected.includes(row.id));
  const unexplained = chosen.filter(row => row.why);
  const reconciled = (treatment === "included_in_baseline" || treatment === "incremental_to_baseline") && reconciliation.trim().length > 0;
  const working = busy === "review";
  const decide = async (decision: "approved" | "rejected" | "proposed") => {
    setMessage(null);
    try {
      await onReview({ itemIds: selected, decision, reason: reason.trim(), treatment, reconciliation: reconciliation.trim() });
      const verb = decision === "approved" ? "Approved" : decision === "rejected" ? "Rejected" : "Reopened";
      setMessage({ text: `${verb} ${count(selected.length, "change")}. Reviewed projection updated.`, bad: false });
      setSelected([]); setReason(""); setReconciliation(""); setTreatment("unreconciled");
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "The review could not be recorded.", bad: true });
    }
  };
  const hint = !selected.length ? "Select changes to review"
    : !reason.trim() ? `${count(selected.length, "change")} selected · add a review reason`
    : unexplained.length ? `${unexplained[0].label}: ${unexplained[0].why!.toLowerCase()}, so it cannot be approved`
    : !reconciled ? "To approve, say how the change relates to the baseline and reconcile it to the source"
    : `${count(selected.length, "change")} selected`;
  return (
    <Card label="Staff review and reconciliation">
      <h2>Staff review and reconciliation</h2>
      <p className={styles.lead}>Only approved changes enter the reviewed projection and coverage. Editing an approved change returns it to proposed.</p>
      <div className={styles.tableWrap}>
        <table className={cx(styles.table, styles.min520)}>
          <thead><tr><th style={{ width: 28 }}><span className={styles.sr}>Select</span></th><th>Change</th><th>Status</th><th className={styles.end}>EBITDA / yr</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} data-review={row.id}>
                <td>
                  <input type="checkbox" aria-label={`Select ${row.label}`} checked={selected.includes(row.id)} disabled={disabled || working || !row.reviewable}
                    style={{ width: 16, height: 16, accentColor: "var(--accent, #1b4b9e)" }}
                    onChange={() => setSelected(current => (current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id]))} />
                </td>
                <td>{row.label}{row.why ? <span className={styles.sub}>{row.why}</span> : null}</td>
                <td><TagChip tag={row.status} num={false} /></td>
                <td className={styles.end}>{row.effect}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={4} className={styles.muted}>No changes are proposed yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className={styles.reviewGrid}>
        <label className={styles.label}>Relation to earnings baseline
          <select className={styles.input} value={treatment} disabled={disabled || working} onChange={event => setTreatment(event.target.value as BaselineTreatment)}>
            {TREATMENTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className={styles.label}>Reconciliation to source and period
          <textarea className={styles.input} value={reconciliation} maxLength={2000} disabled={disabled || working} placeholder="Identify the source and period; explain differences from the baseline"
            onChange={event => setReconciliation(event.target.value)} />
        </label>
        <label className={cx(styles.label, styles.wide)}>Review reason
          <textarea className={styles.input} value={reason} maxLength={2000} disabled={disabled || working} placeholder="Evidence, feasibility and any conditions" onChange={event => setReason(event.target.value)} />
        </label>
      </div>
      <div className={styles.row} style={{ marginTop: 12 }}>
        <button type="button" className={styles.btn} disabled={disabled || working || !selected.length || !reason.trim()} onClick={() => void decide("rejected")}>Reject selected</button>
        <button type="button" className={cx(styles.btn, styles.primary)} disabled={disabled || working || !selected.length || !reason.trim() || !reconciled || unexplained.length > 0} onClick={() => void decide("approved")}>
          {working ? "Recording…" : "Approve selected"}
        </button>
        <button type="button" className={styles.ghost} disabled={disabled || working || !selected.length || !reason.trim()} onClick={() => void decide("proposed")}>Return to proposed</button>
        <span className={cx(styles.small, message?.bad && styles.neg)} role={message?.bad ? "alert" : "status"}>{message?.text ?? hint}</span>
      </div>
    </Card>
  );
}
