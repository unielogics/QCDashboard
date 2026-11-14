"use client";

import { useState } from "react";
import {
  addFactor, addLine, addStream, answerCategory, balanceRevenue, removeFactor, removeLine, removeStream, renameStream, setFactor, setLine, setLineBehavior, setLineLink,
} from "@/lib/earningsPlan/edit";
import { itemization } from "@/lib/earningsPlan/issues";
import { ALL } from "@/lib/earningsPlan/math";
import { CATEGORY_OPTIONS, categoryRows, costRows, reconciliation, streamCards } from "@/lib/earningsPlan/view";
import type { LineBehavior, PlanResult, StreamType } from "@/lib/earningsPlan/types";
import type { StepCommon } from "./StepSource";
import { Card, NumberField, Seg, TagChip, cx } from "./parts";
import styles from "./EarningsPlan.module.css";

/** Step 2: how the revenue on the source is made, and what each cost follows. */
export function StepModel({ body, facts, disabled, edit, result }: StepCommon & { result: PlanResult }) {
  const { baseline, templates, questions } = facts;
  const [newType, setNewType] = useState<StreamType>("units");
  const groups = baseline.groups ?? [];
  const [splitGroup, setSplitGroup] = useState("");
  const streams = streamCards(body, result, templates);
  const match = reconciliation(body, baseline, result);
  const costs = costRows(body, baseline, result, templates);
  const splits = itemization(body, baseline, result.behaviors);
  const categories = categoryRows(body, questions);
  const types = Object.entries(templates).map(([value, template]) => ({ value: value as StreamType, label: template.label }));
  const links = [...body.streams.map(stream => ({ value: stream.id, label: stream.name || "Revenue stream" })), { value: ALL, label: "All revenue" }];
  const group = splitGroup || groups[0]?.key || "";

  return (
    <div className={styles.stack}>
      <Card label="Revenue model">
        <div className={styles.cardHead}>
          <div>
            <h2>Revenue model</h2>
            <p className={styles.lead}>
              A return prints one revenue total. Describe each stream with the metrics that produce it, whether units sold, billable hours, engagements, contracts,
              occupancy or processed volume. Every metric can be changed in the plan, and costs linked to the stream follow.
            </p>
          </div>
          <TagChip tag={match.tag} />
        </div>
        {streams.map(stream => (
          <div className={styles.stream} key={stream.id} data-stream={stream.id}>
            <div className={styles.streamHead}>
              <input className={cx(styles.input, styles.strong)} aria-label="Revenue stream name" value={stream.name} maxLength={240} disabled={disabled}
                onChange={event => edit(current => renameStream(current, stream.id, event.target.value))} />
              <span className={cx(styles.tag, styles.tag_outline)}>{stream.typeLabel}</span>
              <span className={cx(styles.total, styles.num)}><b>{stream.annual}</b> / yr</span>
              <button type="button" className={styles.ghost} disabled={disabled} onClick={() => edit(current => removeStream(current, stream.id))}>Remove</button>
            </div>
            <div className={cx(styles.formula, styles.num)}>
              {stream.factors.map((factor, index) => (
                <div className={styles.factor} key={factor.id}>
                  {index > 0 ? <i aria-hidden="true">×</i> : null}
                  <div>
                    {factor.custom ? (
                      <span className={styles.inline}>
                        <input className={cx(styles.input, styles.factorName)} aria-label="Metric name" value={factor.label} maxLength={120} disabled={disabled}
                          onChange={event => edit(current => setFactor(current, stream.id, factor.id, { label: event.target.value }))} />
                        <button type="button" className={styles.ghost} style={{ minHeight: 24, padding: "0 4px" }} aria-label={`Remove ${factor.label || "metric"}`} disabled={disabled}
                          onClick={() => edit(current => removeFactor(current, stream.id, factor.id))}>×</button>
                      </span>
                    ) : <span>{factor.label}</span>}
                    <span>
                      {factor.prefix}
                      <NumberField label={`${stream.name || "Revenue stream"}: ${factor.label}`} className={styles.w96} value={factor.value} disabled={disabled}
                        onChange={value => edit(current => setFactor(current, stream.id, factor.id, { value }))} />
                      {factor.unit}
                    </span>
                  </div>
                </div>
              ))}
              <span className={styles.equals} aria-hidden="true">=</span>
              <span className={styles.result}>{stream.monthly}</span>
              {stream.canAddFactor ? <button type="button" className={styles.ghost} disabled={disabled} onClick={() => edit(current => addFactor(current, stream.id))}>Add metric</button> : null}
            </div>
            <div className={cx(styles.small, styles.num)}>{stream.volumeText}</div>
          </div>
        ))}
        {!streams.length ? <p className={styles.sectionEmpty}>No revenue stream is described yet. Add the first one below: what the business sells, and the numbers that produce its revenue.</p> : null}
        <div className={styles.row} style={{ marginTop: 14 }}>
          <select className={styles.input} aria-label="Revenue stream type" value={newType} disabled={disabled} onChange={event => setNewType(event.target.value as StreamType)}>
            {types.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <button type="button" className={styles.btn} disabled={disabled} onClick={() => edit(current => addStream(current, newType, templates))}>Add revenue stream</button>
          <span className={cx(styles.small, styles.num)}>{match.text}</span>
          {match.balance ? <button type="button" className={styles.ghost} disabled={disabled} onClick={() => edit(current => balanceRevenue(current, baseline))}>{match.balance}</button> : null}
        </div>
      </Card>

      <Card label="Cost relationships">
        <h2>Cost relationships</h2>
        <p className={styles.lead}>
          Each cost from the source is fixed, a cost per business unit of a stream, or a percent of revenue. Rates are derived so the baseline still equals the source.
          In the plan, linked costs move with their stream on their own.
        </p>
        <div className={styles.tableWrap}>
          <table className={cx(styles.table, styles.min560, styles.stacked)}>
            <thead><tr><th>Cost</th><th>Behaves as · linked to</th><th>Rate</th><th className={styles.end}>Baseline / yr</th></tr></thead>
            <tbody>
              {costs.map(row => (
                <tr key={row.id} data-line={row.id}>
                  <td>
                    {row.added ? (
                      <span className={styles.inline}>
                        <input className={cx(styles.input, styles.strong)} aria-label="Cost item name" placeholder="Name this item" value={row.label} maxLength={240} disabled={disabled}
                          onChange={event => edit(current => setLine(current, baseline, row.id, { label: event.target.value }))} />
                        <button type="button" className={styles.ghost} disabled={disabled} onClick={() => edit(current => removeLine(current, baseline, row.id))}>Remove</button>
                      </span>
                    ) : <span className={styles.name}>{row.label}</span>}
                    {row.added || row.groupLabel !== row.label ? <span className={styles.sub}>{row.groupLabel}</span> : null}
                  </td>
                  <td className={styles.whole}>
                    <div className={styles.follows}>
                      <select className={styles.input} aria-label={`${row.label || "Cost"}: behaves as`} value={row.behavior} disabled={disabled}
                        onChange={event => edit(current => setLineBehavior(current, row.id, event.target.value as LineBehavior))}>
                        <option value="fixed">Fixed</option>
                        <option value="unit" disabled={!body.streams.length}>Per business unit</option>
                        <option value="pct">% of revenue</option>
                      </select>
                      {/* A fixed cost follows nothing, so there is nothing to choose. */}
                      {row.fixed ? null : (
                        <select className={styles.input} aria-label={`${row.label || "Cost"}: linked to`} value={row.link} disabled={disabled}
                          onChange={event => edit(current => setLineLink(current, row.id, event.target.value))}>
                          {links.map(link => <option key={link.value} value={link.value}>{link.label}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className={styles.num}>{row.rate}</td>
                  <td className={styles.end}>
                    {row.added
                      ? <span className={styles.inline}>$<NumberField label={`${row.label || "Cost item"}: annual amount`} className={styles.w110} value={row.baseValue} disabled={disabled}
                          onChange={value => edit(current => setLine(current, baseline, row.id, { base: value }))} /></span>
                      : row.base}
                  </td>
                </tr>
              ))}
              {!costs.length ? <tr><td colSpan={4} className={cx(styles.muted, styles.whole)}>The source prints no costs yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {splits.length ? (
          <div className={styles.list} style={{ gap: 6, marginTop: 12 }}>
            {splits.map(split => (
              <div className={cx(styles.row, styles.num)} key={split.key} style={{ fontSize: 13 }}>
                <span className={cx(styles.tag, split.state === "balanced" ? styles.tag_ok : styles.tag_warn)}>{split.tag}</span>
                <span>{split.text}</span>
              </div>
            ))}
          </div>
        ) : null}
        {groups.length ? (
          <div className={styles.row} style={{ marginTop: 12 }}>
            <span className={styles.small}>Split a cost into items, so each can follow its own stream:</span>
            <select className={styles.input} aria-label="Cost group to split" value={group} disabled={disabled} onChange={event => setSplitGroup(event.target.value)}>
              {groups.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}
            </select>
            <button type="button" className={styles.btn} disabled={disabled || !group} onClick={() => edit(current => addLine(current, baseline, group))}>Add item</button>
          </div>
        ) : null}
        <p className={styles.fine}>Items you add come out of their group&rsquo;s own line, so the group keeps adding up to the source.</p>
      </Card>

      {categories.length ? (
        <Card label="Categories the source does not show">
          <h2>Categories the source does not show</h2>
          <p className={styles.lead}>Answer each one so the plan does not miss a cost.</p>
          <div className={styles.list} style={{ marginTop: 8 }}>
            {categories.map(row => (
              <div className={styles.listRow} key={row.key} data-category={row.key}>
                <b>{row.label}</b>
                <TagChip tag={row.tag} num={false} />
                <Seg label={`${row.label}: any current cost?`} value={row.answer} options={CATEGORY_OPTIONS} disabled={disabled}
                  onChange={answer => edit(current => answerCategory(current, row.key, answer))} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
