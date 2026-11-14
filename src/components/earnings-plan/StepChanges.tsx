"use client";

import { useState } from "react";
import {
  addActivity, addAllocation, addChange, addGrowth, patchAllocation, patchItem, removeAllocation, removeItem, resolveCarriedOver, restoreItem, setGrowthStream,
  setPlanStart, type ItemPatch, type RemovedItem,
} from "@/lib/earningsPlan/edit";
import { planMonth, planStartOptions, signedUsd } from "@/lib/earningsPlan/format";
import { startMonth } from "@/lib/earningsPlan/math";
import { changeSections, releasedView, type ChangeRow, type DebtBasis } from "@/lib/earningsPlan/view";
import type { PlanActivity, PlanAllocation, PlanChange, PlanGrowth, PlanResult } from "@/lib/earningsPlan/types";
import type { StepCommon } from "./StepSource";
import { Card, NumberField, Seg, TagChip, cx } from "./parts";
import styles from "./EarningsPlan.module.css";

const DIRECTIONS = [{ value: "up" as const, label: "Increase +" }, { value: "down" as const, label: "Decrease −" }];
const CADENCES = [{ value: "one_time" as const, label: "One time" }, { value: "monthly" as const, label: "Monthly" }];
const PURPOSES: Array<{ value: PlanAllocation["purpose"]; label: string }> = [
  { value: "existing", label: "Existing cost" }, { value: "planned", label: "Planned increment" }, { value: "reserve", label: "Reserve" }, { value: "other", label: "Other" },
];

/** Step 3: what the business proposes to change, each with its own effect, and where released cash goes. */
export function StepChanges({ body, facts, disabled, edit, result, basis, open, onOpen }: StepCommon & {
  result: PlanResult; basis: DebtBasis;
  /** The change whose details are open; the to-finish list opens one from outside. */
  open: string | null; onOpen: (id: string | null) => void;
}) {
  const [removed, setRemoved] = useState<RemovedItem | null>(null);
  const sections = changeSections(body, facts.baseline, result, facts.templates, basis);
  const released = releasedView(facts.baseline, result, basis);
  const months = Array.from({ length: 12 }, (_unused, index) => ({ value: index + 1, label: planMonth(body.plan_start, index) }));
  const streams = body.streams.filter(stream => stream.factors.some(factor => factor.volume)).map(stream => ({ value: stream.id, label: stream.name || "Revenue stream" }));
  const patch = (id: string, change: ItemPatch) => edit(current => patchItem(current, id, change));

  // `edit` runs its change at once, so what the change made or removed is known on the next line.
  const addAt = (row: ChangeRow) => {
    const made: { id: string | null } = { id: null };
    edit(current => { const next = addChange(current, row.target!, { direction: row.direction }); made.id = next.id; return next.body; });
    if (made.id) onOpen(made.id);
  };
  const addNamed = (kind: "growth" | "activity") => {
    const made: { id: string | null } = { id: null };
    edit(current => { const next = kind === "growth" ? addGrowth(current) : addActivity(current); made.id = next.id; return next.body; });
    if (made.id) onOpen(made.id);
  };
  const remove = (id: string) => {
    const gone: { item: RemovedItem | null } = { item: null };
    edit(current => { const next = removeItem(current, id); gone.item = next.removed; return next.body; });
    if (gone.item) { setRemoved(gone.item); if (open === id) onOpen(null); }
  };

  return (
    <div className={styles.stack}>
      <Card className={styles.tight} label="Plan start">
        <div className={styles.row} style={{ gap: "10px 20px" }}>
          <label className={styles.inline} style={{ fontSize: 13 }}>Plan starts
            <select className={styles.input} aria-label="Plan start" value={body.plan_start ?? ""} disabled={disabled} onChange={event => edit(current => setPlanStart(current, event.target.value))}>
              {!body.plan_start ? <option value="">Choose a month</option> : null}
              {planStartOptions(body.plan_start).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <p className={styles.fine} style={{ margin: 0, flex: "1 1 320px" }}>
            Increase or decrease any line by an amount or a percent. Run-rate results assume every included change is in effect. First-year results follow each start month and one-time setup costs.
          </p>
          {removed ? (
            <span className={styles.inline} style={{ fontSize: 13 }} role="status">Planned change removed.
              <button type="button" className={styles.ghost} disabled={disabled} onClick={() => { edit(current => restoreItem(current, removed)); setRemoved(null); }}>Undo</button>
            </span>
          ) : null}
        </div>
      </Card>

      {sections.map(section => (
        <Card className={styles.tight} key={section.key} label={section.title}>
          <div className={cx(styles.cardHead, styles.center)}>
            <h2 style={{ flex: "1 1 200px" }}>{section.title}</h2>
            <TagChip tag={section.total} />
            {section.add ? <button type="button" className={styles.btn} disabled={disabled || !section.canAdd} onClick={() => addNamed(section.add!)}>{section.addLabel}</button> : null}
          </div>
          <p className={styles.lead} style={{ marginBottom: 4 }}>{section.sub}</p>
          {section.rows.map(row => (
            <ChangeLine key={row.rowKey} row={row} disabled={disabled} months={months} streams={streams} open={row.itemId !== null && open === row.itemId}
              onAdd={() => addAt(row)} onPatch={change => row.itemId && patch(row.itemId, change)} onRemove={() => row.itemId && remove(row.itemId)}
              onToggle={() => onOpen(open === row.itemId ? null : row.itemId)}
              onStream={streamId => row.itemId && edit(current => setGrowthStream(current, row.itemId!, streamId))} />
          ))}
          {section.empty ? <p className={styles.sectionEmpty}>{section.empty}</p> : null}
        </Card>
      ))}

      {body.carried_over.length ? (
        <Card className={styles.tight} label="Items from the earlier plan to re-enter">
          <h2>From the earlier plan, to re-enter</h2>
          <p className={styles.lead}>These were in the earlier plan in a form this one says differently. None is counted in the figures. Re-enter each above, then mark it handled.</p>
          <div className={styles.list}>
            {body.carried_over.map(item => (
              <div className={styles.listRow} key={item.id} style={{ alignItems: "flex-start", opacity: item.resolved ? 0.55 : 1 }}>
                <div className={styles.grow}>
                  <b>{item.label}</b>
                  <div className={styles.small}>{item.detail}</div>
                </div>
                {item.annual_amount != null ? <span className={styles.num}>{signedUsd(item.annual_amount)} / yr in the earlier plan</span> : null}
                <label className={styles.check}>
                  <input type="checkbox" checked={item.resolved} disabled={disabled} onChange={event => edit(current => resolveCarriedOver(current, item.id, event.target.checked))} />Handled
                </label>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className={styles.tight} label="Released cash and reinvestment">
        <div className={cx(styles.cardHead, styles.center)}>
          <h2 style={{ flex: "1 1 220px" }}>Released cash and reinvestment</h2>
          <TagChip tag={released.tag} />
          <button type="button" className={styles.btn} disabled={disabled} onClick={() => edit(addAllocation)}>Add allocation</button>
        </div>
        <p className={cx(styles.lead, styles.num)}>{released.text}</p>
        <div className={styles.list} style={{ marginTop: 8 }}>
          {body.allocations.map(row => (
            <div className={cx(styles.listRow, styles.num)} key={row.id}>
              <input className={styles.input} style={{ flex: "1 1 140px", maxWidth: 320 }} aria-label="Allocation" value={row.label} maxLength={240} disabled={disabled}
                onChange={event => edit(current => patchAllocation(current, row.id, { label: event.target.value }))} />
              <select className={styles.input} aria-label="Purpose" value={row.purpose} disabled={disabled}
                onChange={event => edit(current => patchAllocation(current, row.id, { purpose: event.target.value as PlanAllocation["purpose"] }))}>
                {PURPOSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className={styles.inline}>$
                <NumberField label={`${row.label || "Allocation"}: monthly amount`} className={styles.w110} value={row.monthly_amount} disabled={disabled}
                  onChange={value => edit(current => patchAllocation(current, row.id, { monthly_amount: value }))} />/ month
              </span>
              <button type="button" className={styles.ghost} disabled={disabled} onClick={() => edit(current => removeAllocation(current, row.id))}>Remove</button>
            </div>
          ))}
        </div>
        <p className={styles.fine}>Assignments do not change NOI. They show where released cash goes; unused funding stays as cash and reinvesting is optional.</p>
      </Card>
    </div>
  );
}

function ChangeLine({ row, disabled, months, streams, open, onAdd, onPatch, onRemove, onToggle, onStream }: {
  row: ChangeRow; disabled: boolean; months: Array<{ value: number; label: string }>; streams: Array<{ value: string; label: string }>; open: boolean;
  onAdd: () => void; onPatch: (change: ItemPatch) => void; onRemove: () => void; onToggle: () => void; onStream: (streamId: string) => void;
}) {
  const { item, effect } = row;
  const tone = row.planTone === "bad" ? styles.neg : row.planTone === "ok" ? styles.pos : undefined;
  return (
    <div className={cx(styles.changeRow, effect?.needsNote && styles.needs, effect?.dimmed && styles.dim)} data-row={row.rowKey} data-item={row.itemId ?? undefined}>
      <div className={styles.changeTop}>
        <div className={styles.changeName}>
          {item && row.kind !== "command"
            ? <input className={styles.input} aria-label="Activity name" value={row.label} maxLength={240} disabled={disabled} onChange={event => onPatch({ name: event.target.value })} />
            : <b>{row.label}</b>}
          <span className={styles.num}>{row.sub}</span>
        </div>
        <div className={cx(styles.changeFigures, styles.num)}>
          <span>{row.current}</span>
          <span className={tone}>{row.plan}</span>
        </div>
        {item && effect ? (
          <div className={styles.changeEffect}>
            <TagChip tag={effect.chip} />
            <span className={styles.spark} aria-hidden="true">
              {effect.spark.map((live, index) => <i key={index} className={cx(live && styles.on, live && !effect.positive && styles.down)} />)}
            </span>
          </div>
        ) : <button type="button" className={styles.btn} disabled={disabled} onClick={onAdd}>Change</button>}
      </div>

      {item && effect ? (
        <>
          <div className={cx(styles.changeControls, styles.num)}>
            <label className={styles.check}>
              <input type="checkbox" checked={item.included !== false} disabled={disabled} onChange={event => onPatch({ included: event.target.checked })} />Include
            </label>
            {row.kind === "command" ? (
              <>
                <Seg label={`${row.label}: direction`} value={(item as PlanChange).direction} options={DIRECTIONS} disabled={disabled} onChange={direction => onPatch({ direction })} />
                <NumberField label={`${row.label}: change amount`} className={styles.w110} value={(item as PlanChange).value} disabled={disabled} onChange={value => onPatch({ value })} />
                <Seg label={`${row.label}: by amount or percent`} value={(item as PlanChange).mode} disabled={disabled} onChange={mode => onPatch({ mode })}
                  options={[{ value: "amount" as const, label: row.amountLabel }, { value: "percent" as const, label: "%" }]} />
              </>
            ) : null}
            {row.kind === "growth" ? (
              <>
                <span className={styles.inline}>Spend $
                  <NumberField label={`${row.label}: monthly spend`} className={styles.w96} value={(item as PlanGrowth).monthly_spend} disabled={disabled} onChange={value => onPatch({ monthly_spend: value })} />/ mo adds
                </span>
                <NumberField label={`${row.label}: added volume per month`} className={styles.w80} value={(item as PlanGrowth).added_per_month} disabled={disabled} onChange={value => onPatch({ added_per_month: value })} />
                <select className={styles.input} aria-label={`${row.label}: metric`} value={(item as PlanGrowth).factor_id} disabled={disabled} onChange={event => onPatch({ factor_id: event.target.value })}>
                  {(row.factorOptions ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <span>in</span>
                <select className={styles.input} aria-label={`${row.label}: revenue stream`} value={(item as PlanGrowth).stream_id} disabled={disabled} onChange={event => onStream(event.target.value)}>
                  {streams.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </>
            ) : null}
            {row.kind === "activity" ? (
              <span className={styles.inline}>Cost $
                <NumberField label={`${row.label}: monthly cost`} className={styles.w96} value={(item as PlanActivity).monthly_amount} disabled={disabled} onChange={value => onPatch({ monthly_amount: value })} />/ month
              </span>
            ) : null}
            <label className={cx(styles.inline, styles.muted)}>Starts
              <select className={styles.input} aria-label={`${row.label}: start month`} value={startMonth(item)} disabled={disabled} onChange={event => onPatch({ start_month: Number(event.target.value) })}>
                {months.map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
              </select>
            </label>
            <span className={styles.rowEnd}>
              <button type="button" className={styles.ghost} aria-expanded={open} onClick={onToggle}>{open ? "Close details" : effect.needsNote ? "Explain change" : "Details"}</button>
              <button type="button" className={styles.ghost} disabled={disabled} onClick={onRemove}>Remove</button>
            </span>
          </div>
          <div className={cx(styles.changeMeta, styles.num)}>
            {effect.dscr ? <span>{effect.dscr}</span> : null}
            <span>{effect.firstYear}</span>
            <span>{effect.moves}</span>
            <TagChip tag={effect.status} num={false} />
          </div>
          {open ? (
            <div className={styles.sunkenGrid}>
              <div className={styles.label}>Setup or implementation cost
                <span className={styles.inline}>
                  <NumberField label={`${row.label}: setup cost`} className={styles.w110} value={item.setup_cost} disabled={disabled} onChange={value => onPatch({ setup_cost: value })} />
                  <Seg label={`${row.label}: setup cost timing`} value={item.setup_cadence} options={CADENCES} disabled={disabled} onChange={cadence => onPatch({ setup_cadence: cadence })} />
                </span>
              </div>
              <label className={styles.label}>Owner
                <input className={styles.input} value={item.owner} maxLength={180} disabled={disabled} placeholder="Who carries this out" onChange={event => onPatch({ owner: event.target.value })} />
              </label>
              <label className={cx(styles.label, styles.wide)}>Why this will work
                <textarea className={cx(styles.input, effect.needsNote && styles.needs)} value={item.note} maxLength={4000} disabled={disabled} placeholder="Operational reason, timing and what supports it"
                  onChange={event => onPatch({ note: event.target.value })} />
              </label>
              <label className={cx(styles.label, styles.wide)}>Evidence and notes (optional)
                <input className={styles.input} value={item.evidence_note} maxLength={4000} disabled={disabled} placeholder="Quote, contract, statement or other support" onChange={event => onPatch({ evidence_note: event.target.value })} />
              </label>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
