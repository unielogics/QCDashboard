"use client";

import { useMemo } from "react";
import { Btn, Input, Select, StatusLine } from "@/components/ds";
import { deliveryTimes, recipients, timeZones, type Draft, type Preview } from "./campaign";
import styles from "./page.module.css";

export type Timing = { now: boolean; date: string; time: string; zone: string; occurrence: number; };
export function displayTime(date: Date, zone: string) {
  return date.toLocaleString(undefined, { timeZone: zone, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
export default function Schedule({ timing, setTiming, draft, count, audience, preview, back, review }: {
  timing: Timing; setTiming: (t: Timing) => void; draft: Draft; count: number; audience: string; preview?: Preview;
  back: () => void; review: (timestamp: string | null) => void;
}) {
  const zones = useMemo(timeZones, []);
  const times = useMemo(() => deliveryTimes(timing.date, timing.time, timing.zone), [timing.date, timing.time, timing.zone]);
  const chosen = times[timing.occurrence] ?? times[0];
  const invalid = !timing.now && (!chosen || chosen.getTime() <= Date.now());
  const change = (patch: Partial<Timing>) => setTiming({ ...timing, occurrence: 0, ...patch });
  return <section className={styles.panel} aria-labelledby="schedule-heading">
    <div className={styles.sectionHead}><h2 id="schedule-heading">Schedule delivery</h2></div>
    <div className={styles.schedule}>
      <div className={styles.editor}>
        <div className={styles.modes} role="group" aria-label="Delivery timing">
          <Btn aria-pressed={!timing.now} onClick={() => change({ now: false })}>Schedule for later</Btn>
          <Btn aria-pressed={timing.now} onClick={() => change({ now: true })}>Send now</Btn>
        </div>
        {!timing.now && <>
          <div className={styles.clock}><label><span>Delivery date</span><Input type="date" value={timing.date} onChange={e => change({ date: e.target.value })} /></label>
            <label><span>Delivery time</span><Input type="time" value={timing.time} onChange={e => change({ time: e.target.value })} /></label></div>
          <label><span>Time zone</span><Select value={timing.zone} onChange={e => change({ zone: e.target.value })}>{zones.map(z => <option value={z} key={z}>{z.replaceAll("_", " ")}</option>)}</Select></label>
          {times.length > 1 && <label><span>This time occurs twice. Choose an occurrence.</span><Select value={timing.occurrence} onChange={e => change({ occurrence: Number(e.target.value) })}>{times.map((t, i) => <option key={t.toISOString()} value={i}>{displayTime(t, timing.zone)}</option>)}</Select></label>}
          {timing.date && timing.time && invalid && <StatusLine tone="warn">{!chosen ? "This local time does not exist in that time zone. Choose another time." : "Choose a delivery time in the future."}</StatusLine>}
        </>}
      </div>
      <div className={styles.summary}><h3>{draft.name}</h3><dl>
        <dt>Audience</dt><dd>{recipients(count)}<small>{audience}</small></dd>
        <dt>Subject</dt><dd>{draft.subject}</dd>
        <dt>Delivery</dt><dd>{timing.now ? "Immediately after confirmation" : chosen ? displayTime(chosen, timing.zone) : "Choose a date and time"}</dd>
        {preview?.sample_email && <><dt>Previewed for</dt><dd>{preview.sample_email}</dd></>}
      </dl></div>
    </div>
    <div className={styles.actions}><Btn onClick={back}>Back to compose</Btn><Btn variant="pri" disabled={invalid || !count || !preview} onClick={() => review(timing.now ? null : chosen.toISOString())}>Review campaign</Btn></div>
  </section>;
}
