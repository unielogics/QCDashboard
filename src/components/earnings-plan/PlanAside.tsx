"use client";

import { useState } from "react";
import { coverageScale, goalView, liveMetrics, type DebtBasis } from "@/lib/earningsPlan/view";
import type { PlanBaseline, PlanResult, PlanView, ToFinishItem } from "@/lib/earningsPlan/types";
import { Card, Seg, cx } from "./parts";
import styles from "./EarningsPlan.module.css";

const VIEWS = [{ value: "proposed" as const, label: "Proposed" }, { value: "reviewed" as const, label: "Reviewed" }];
const SHOWN = 5;

/** The figures that follow every keystroke: the six metrics, coverage against the threshold, the NOI goal, and what is left to finish. */
export function PlanAside({ baseline, result, view, basis, staff, onView, onIssue }: {
  baseline: PlanBaseline; result: PlanResult; view: PlanView; basis: DebtBasis; staff: boolean;
  onView: (view: PlanView) => void; onIssue: (item: ToFinishItem) => void;
}) {
  const [all, setAll] = useState(false);
  const metrics = liveMetrics(baseline, result, view, basis);
  const scale = coverageScale(baseline, result, view, basis);
  const goal = goalView(baseline, result, view);
  const issues = result.to_finish;
  return (
    <aside className={styles.aside} aria-label="Live metrics">
      <Card className={styles.side} label="Live impact">
        <div className={cx(styles.cardHead, styles.center)}>
          <span className={styles.kicker}>Live impact</span>
          <Seg label="Which changes count" value={view} options={VIEWS} onChange={onView} small />
        </div>
        <div style={{ marginTop: 8 }}>
          {metrics.map(row => (
            <div className={styles.metric} key={row.key} data-metric={row.key}>
              <span>{row.label}</span>
              <span className={cx(styles.tag, styles[`tag_${row.tone}`], styles.num)}>{row.delta}</span>
              <span className={cx(styles.metricValue, styles.num)}>
                <span>{row.before}</span><span aria-hidden="true">→</span><b className={row.negative ? styles.neg : undefined}>{row.after}</b>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className={styles.side} label="DSCR against the lender threshold">
        <div className={cx(styles.cardHead, styles.base)}>
          <span className={styles.kicker}>DSCR · lender threshold</span>
          {scale ? <span className={cx(styles.tag, styles[`tag_${scale.state.tone}`])}>{scale.state.label}</span> : null}
        </div>
        {scale ? (
          <>
            <div className={styles.scale}>
              <i className={styles.scaleTrack} />
              <i className={cx(styles.scaleFill, !scale.improved && styles.worse)} style={{ left: `${scale.fillLeft}%`, width: `${scale.fillWidth}%` }} />
              <i className={styles.scaleOne} style={{ left: `${scale.one}%` }} />
              <i className={styles.scaleTarget} style={{ left: `${scale.target}%` }} />
              <i className={styles.scaleBefore} style={{ left: `${scale.before}%` }} />
              <i className={styles.scaleAfter} style={{ left: `${scale.after}%` }} />
              <span className={cx(styles.scaleTargetLabel, styles.num)} style={{ left: `${scale.target}%` }}>{scale.targetLabel}</span>
              <span className={cx(styles.scaleOneLabel, styles.num)} style={{ left: `${scale.one}%` }}>1.00x</span>
            </div>
            <div className={cx(styles.scaleText, styles.num)}><span>{scale.baselineText}</span><span>{scale.planText}</span><span>{scale.needText}</span></div>
          </>
        ) : <p className={styles.fine}>{baseline.available === false ? "Coverage appears once the file has an earnings source." : "The file lists no debt payments, so there is no coverage to measure."}</p>}
      </Card>

      <Card className={styles.side} label="Annual NOI goal">
        <span className={styles.kicker}>Annual NOI goal</span>
        {goal ? (
          <>
            <div className={cx(styles.goalHead, styles.num)}><b>{goal.percent}</b><span>{goal.of}</span></div>
            <div className={styles.goalScale}>
              <i className={styles.goalTrack} />
              <i className={styles.goalZero} style={{ left: `${goal.zero}%` }} />
              <i className={styles.goalMark} style={{ left: `${goal.goal}%` }} />
              <i className={cx(styles.goalDot, styles.current)} style={{ left: `${goal.current}%` }} />
              <i className={cx(styles.goalDot, styles.reviewed)} style={{ left: `${goal.reviewed}%` }} />
              <i className={cx(styles.goalDot, styles.proposed)} style={{ left: `${goal.proposed}%` }} />
            </div>
            <div className={cx(styles.legend, styles.num)}>
              <span><i style={{ background: "var(--ep-n500)" }} />Current NOI</span><span>{goal.currentText}</span>
              <span><i style={{ background: "var(--accent, #1b4b9e)" }} />Proposed</span><span>{goal.proposedText}</span>
              <span><i style={{ background: "var(--ep-a300)" }} />Reviewed</span><span>{goal.reviewedText}</span>
              <span><i className={styles.line} />Goal</span><span>{goal.goalText}</span>
              <span className={styles.gap}>{goal.gapLabel}</span><span className={goal.gapTone === "warn" ? undefined : styles.pos} style={{ fontWeight: 600, color: goal.gapTone === "warn" ? "var(--warn, #a15c07)" : undefined }}>{goal.gapText}</span>
            </div>
          </>
        ) : <p className={styles.fine}>{baseline.available === false ? "The goal is measured once the file has an earnings source." : staff ? "No goal is set yet. Set it in step 1 to measure the plan against it." : "Your team has not set a goal yet."}</p>}
      </Card>

      <Card className={styles.side} label="To finish">
        <div className={cx(styles.cardHead, styles.base)}>
          <span className={styles.kicker}>To finish</span>
          <span className={cx(styles.tag, issues.length ? styles.tag_warn : styles.tag_ok, styles.num)}>{issues.length}</span>
        </div>
        <div className={styles.issues}>
          {(all ? issues : issues.slice(0, SHOWN)).map((item, index) => (
            <button type="button" className={styles.issue} key={`${item.code}:${item.key ?? item.item_id ?? index}`} onClick={() => onIssue(item)}>{item.label}</button>
          ))}
          {issues.length > SHOWN ? <button type="button" className={styles.ghost} onClick={() => setAll(value => !value)}>{all ? "Show fewer" : `Show all ${issues.length}`}</button> : null}
          {!issues.length ? <span className={styles.done}>Required items complete</span> : null}
        </div>
      </Card>
    </aside>
  );
}
