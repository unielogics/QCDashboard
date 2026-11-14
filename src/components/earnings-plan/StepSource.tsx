"use client";

import { useState } from "react";
import { amount, confirmGroup, restoreSourceAmount, saveCorrection } from "@/lib/earningsPlan/edit";
import { usd } from "@/lib/earningsPlan/format";
import { sourceView, type DebtBasis } from "@/lib/earningsPlan/view";
import type { EarningsPlanBody } from "@/lib/earningsPlan/types";
import type { PlanBusy, PlanFacts } from "./useEarningsPlan";
import { Card, NumberField, TagChip, cx } from "./parts";
import styles from "./EarningsPlan.module.css";

export type StepCommon = {
  body: EarningsPlanBody;
  facts: PlanFacts;
  /** Editing is off: a view-only link, or the plan is waiting on the API. */
  disabled: boolean;
  staff: boolean;
  edit: (change: (body: EarningsPlanBody) => EarningsPlanBody) => void;
};

/** Step 1: the figures the plan starts from. Read-only; the business confirms each one or records a correction. */
export function StepSource({ body, facts, disabled, staff, edit, basis, applyTerms, onApplyTerms, busy, onResync, onSetGoal, onOpenSource }: StepCommon & {
  basis: DebtBasis; applyTerms: boolean; onApplyTerms: (value: boolean) => void; busy: PlanBusy;
  onResync: () => void; onSetGoal?: (amount: number) => Promise<void>; onOpenSource?: (fileId: string) => void;
}) {
  const view = sourceView(body, facts.baseline, facts.sourceChanged);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [corrected, setCorrected] = useState("");
  const [reason, setReason] = useState("");
  const [goalText, setGoalText] = useState<string | null>(null);
  const [goalError, setGoalError] = useState("");
  const group = view.groups.find(row => row.key === correcting) ?? null;
  const goal = facts.goal?.status === "set" ? facts.goal.amount : null;
  const sourceFile = facts.baseline.source?.file_id ?? null;
  const statementFile = facts.baseline.statement?.file_id ?? null;
  const columns = view.statementColumn ? 6 : 4;

  const startCorrection = (key: string) => {
    const row = view.groups.find(item => item.key === key)!;
    setCorrecting(key);
    setCorrected(String(row.correction?.amount ?? row.amount));
    setReason(row.correction?.reason ?? "");
  };
  const saveGoal = async () => {
    const value = amount(goalText ?? "");
    if (!onSetGoal || !value) { setGoalError("Enter the annual NOI goal as a positive amount."); return; }
    try { await onSetGoal(value); setGoalText(null); setGoalError(""); }
    catch (error) { setGoalError(error instanceof Error ? error.message : "The goal could not be saved."); }
  };

  return (
    <div className={styles.stack}>
      <Card label="Selected reporting source">
        <div className={styles.cardHead}>
          <div>
            <h2>Selected reporting source</h2>
            <p className={styles.lead}>
              Source figures stay read-only. {facts.baseline.source?.kind === "profit_and_loss"
                ? "No filed business return is in use on this file, so the profit and loss statement stands in for it."
                : "The filed return is primary. The latest P&L is shown beside it for comparison and never replaces a line the return prints."}
            </p>
          </div>
          {onOpenSource && (sourceFile || statementFile) ? (
            <div className={styles.row}>
              {sourceFile ? <button type="button" className={styles.btn} onClick={() => onOpenSource(sourceFile)}>{facts.baseline.source?.kind === "profit_and_loss" ? "View P&L" : "View return"}</button> : null}
              {statementFile && statementFile !== sourceFile ? <button type="button" className={styles.ghost} onClick={() => onOpenSource(statementFile)}>View P&amp;L</button> : null}
            </div>
          ) : null}
        </div>
        <div className={styles.facts}>
          <div className={styles.fact}><span>Primary source</span><b>{view.primary}</b></div>
          <div className={styles.fact}><span>Reporting period</span><b className={styles.num}>{view.period}</b></div>
          <div className={styles.fact}><span>Currency and basis</span><b>{view.currencyBasis}</b></div>
          <div className={styles.fact}>
            <span>Annual NOI goal · set by staff</span>
            <div className={styles.row}>
              {goalText !== null
                ? <NumberField label="Annual NOI goal" className={styles.w130} value={goalText} onChange={setGoalText} disabled={busy === "goal"} />
                : <b className={styles.num}>{goal ? `${usd(goal)} / yr` : "Not set yet"}</b>}
              {staff && onSetGoal ? goalText !== null ? (
                <>
                  <button type="button" className={styles.btn} disabled={busy === "goal"} onClick={() => void saveGoal()}>{busy === "goal" ? "Saving…" : "Save goal"}</button>
                  <button type="button" className={styles.ghost} disabled={busy === "goal"} onClick={() => { setGoalText(null); setGoalError(""); }}>Cancel</button>
                </>
              ) : <button type="button" className={styles.ghost} onClick={() => setGoalText(goal ? String(goal) : "")}>{goal ? "Edit goal" : "Set goal"}</button> : null}
            </div>
            {goalError ? <span className={styles.neg} role="alert">{goalError}</span> : null}
          </div>
        </div>
      </Card>

      {!view.available ? (
        <div className={styles.state} role="status">
          <h2>This file has no earnings source yet</h2>
          <p>{facts.baseline.reason || "Add a filed business return or a profit and loss statement to the file. As soon as one is in use, its figures appear here and the plan computes from them."}</p>
        </div>
      ) : (
        <Card label="Source amounts">
          <div className={styles.cardHead}>
            <div>
              <h2>Do these annual costs match the source?</h2>
              <p className={styles.lead}>Confirm each group or record a correction. A correction is kept for preparer review. It never changes the source or raises verified income.</p>
            </div>
            <span className={cx(styles.tag, styles.tag_mut, styles.num)}>{view.confirmedText}</span>
          </div>
          {facts.sourceChanged ? (
            <div className={cx(styles.notice, styles.notice_warn)} style={{ marginTop: 12 }} role="status">
              <span>The source figures changed after this plan was built. Update the plan to the current figures, then confirm the amounts again.</span>
              <button type="button" className={styles.btn} disabled={disabled || busy === "resync"} onClick={onResync}>{busy === "resync" ? "Updating…" : "Update to current figures"}</button>
            </div>
          ) : null}
          <div className={styles.tableWrap}>
            <table className={cx(styles.table, styles.min560, styles.stacked)}>
              <thead>
                <tr>
                  <th>Group</th>
                  <th className={styles.end}>{view.sourceColumn}</th>
                  {view.statementColumn ? <><th className={styles.end}>{view.statementColumn}</th><th className={cx(styles.end, styles.optional)}>Variance</th></> : null}
                  <th>Status</th>
                  <th className={styles.end}><span className={styles.sr}>Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {view.groups.map(row => (
                  <tr key={row.key} data-group={row.key}>
                    <td className={styles.name}>{row.label}{row.correction ? <span className={styles.sub}>Correction noted: {row.correction.text}</span> : null}</td>
                    <td className={styles.end}>{row.source}</td>
                    {view.statementColumn ? <><td className={cx(styles.end, styles.muted, styles.extra)}>{row.statement}</td><td className={cx(styles.end, styles.muted, styles.optional, styles.extra)}>{row.variance}</td></> : null}
                    <td><TagChip tag={row.tag} num={false} /></td>
                    <td className={styles.end}>
                      <span className={styles.actions}>
                        <button type="button" className={styles.btn} disabled={disabled || facts.sourceChanged || row.state !== "open"} onClick={() => edit(current => confirmGroup(current, row.key))}>Confirm</button>
                        <button type="button" className={styles.ghost} disabled={disabled || facts.sourceChanged} onClick={() => startCorrection(row.key)}>Correct</button>
                      </span>
                    </td>
                  </tr>
                ))}
                {!view.groups.length ? <tr><td colSpan={columns} className={cx(styles.muted, styles.whole)}>The source prints no expense lines to confirm.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {group ? (
            <div className={styles.sunken}>
              <b className={styles.num}>Correct {group.label} · {group.source} / year on the source</b>
              <div className={styles.row} style={{ alignItems: "flex-start", gap: 12 }}>
                <label className={styles.label}>Corrected annual amount
                  <NumberField label="Corrected annual amount" className={styles.w150} value={corrected} onChange={setCorrected} disabled={disabled} />
                </label>
                <label className={styles.label} style={{ flex: "1 1 280px" }}>What needs correcting?
                  <textarea className={styles.input} value={reason} maxLength={4000} disabled={disabled} placeholder="Wrong amount, wrong category, or already included elsewhere" onChange={event => setReason(event.target.value)} />
                </label>
              </div>
              <div className={styles.row}>
                <button type="button" className={cx(styles.btn, styles.primary)} disabled={disabled || reason.trim().length < 3 || amount(corrected) == null}
                  onClick={() => { edit(current => saveCorrection(current, group.key, corrected, reason)); setCorrecting(null); }}>Save correction for review</button>
                <button type="button" className={styles.ghost} onClick={() => setCorrecting(null)}>Cancel</button>
                {group.correction ? <button type="button" className={styles.ghost} disabled={disabled} onClick={() => { edit(current => restoreSourceAmount(current, group.key)); setCorrecting(null); }}>Restore original source amount</button> : null}
              </div>
              <p className={styles.fine} style={{ margin: 0 }}>The original source stays unchanged. This difference is recorded for review and does not increase verified income.</p>
            </div>
          ) : null}
          <div className={cx(styles.facts, styles.topRule, styles.num)}>
            {view.totals.map(total => <div className={styles.fact} key={total.label}><span>{total.label}</span><b className={total.negative ? styles.neg : undefined}>{total.value}</b></div>)}
          </div>
          {view.footnote ? <p className={styles.fine}>{view.footnote}</p> : null}
        </Card>
      )}

      {view.terms ? (
        <Card label="Loan terms on file">
          <div className={styles.cardHead}>
            <div>
              <h2>Loan terms on file</h2>
              <p className={cx(styles.lead, styles.num)}>{view.terms.label}</p>
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={applyTerms} onChange={event => onApplyTerms(event.target.checked)} />Apply to plan
            </label>
          </div>
          <div className={cx(styles.facts, styles.num)}>
            <div className={styles.fact}><span>Current payments</span><strong>{view.terms.current}</strong></div>
            <div className={styles.fact}><span>New payment</span><strong>{view.terms.next}</strong></div>
            <div className={styles.fact}><span>Cash released</span><strong className={styles.pos}>{basis === "with_terms" ? view.terms.released : "$0 / mo"}</strong></div>
            <div className={styles.fact}><span>DSCR from terms alone</span><strong>{view.terms.coverage}</strong></div>
          </div>
          <p className={styles.fine}>Lower payments release cash but do not change EBITDA or NOI. Earnings still have to turn positive for coverage to follow. Released cash is assigned in step 3.</p>
        </Card>
      ) : null}
    </div>
  );
}
