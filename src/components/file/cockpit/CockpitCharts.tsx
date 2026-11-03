"use client";

// Chart primitives for the financial cockpit: grouped columns, lines with a
// crosshair, a meter, a sparkline and a horizontal bar ladder. Plain SVG on
// the design tokens. Two categorical series at most: the house palette
// validates exactly two (the accent blue and the cockpit orange declared in
// app-extras.css); gray carries context; status tokens appear only where a
// colour means good or bad. Every chart has a legend when it draws two
// series, a hover and keyboard-focus tooltip that lists every series at that
// month, selective direct labels (the latest value), hairline solid grid
// lines and a table twin the ChartCard renders on demand.

import { useState, type ReactNode } from "react";
import { Table, Td, Tr, cx } from "@/components/ds";
import { compactMoney, linePath, money, niceTicks } from "@/lib/financialCockpit";

export const SERIES = { one: "var(--accent)", two: "var(--fc-series-2)", context: "var(--faint)" } as const;

export type ChartSeries = { key: string; label: string; color: string; values: Array<number | null>; emphasis?: boolean };
export type ChartBand = { key: string; label: string; short: string; muted?: boolean };
type Formatter = (value: number | null | undefined) => string;

const VIEW_W = 640;
const PAD = { top: 22, right: 16, bottom: 28, left: 52 };
const LINE_RIGHT_PAD = 52;

const clampPct = (value: number) => Math.max(14, Math.min(86, value));

type TooltipRow = { label: string; value: string; color: string; kind: "rect" | "line" };

function Tooltip({ left, title, rows }: { left: number; title: string; rows: TooltipRow[] }) {
  return (
    <div className="fc-tip" style={{ left: `${left}%` }} role="status">
      <b>{title}</b>
      {rows.map((row) => (
        <div key={row.label} className="fc-tip-row">
          <span>
            <i className={cx("fc-key", row.kind === "rect" && "is-rect")} style={{ background: row.color }} />
            {row.label}
          </span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function Legend({ items, kind }: { items: Array<{ key: string; label: string; color: string }>; kind: "rect" | "line" }) {
  if (items.length < 2) return null;
  return (
    <div className="fc-legend">
      {items.map((item) => (
        <span key={item.key}>
          <i className={cx(kind === "line" && "is-line")} style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function useScale(series: ChartSeries[], height: number) {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null && Number.isFinite(v));
  const ticks = niceTicks(all.length ? Math.min(...all) : 0, all.length ? Math.max(...all) : 0);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const range = hi - lo || 1;
  const innerH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + innerH - ((v - lo) / range) * innerH;
  return { ticks, y, hasData: all.length > 0 };
}

function barPath(x: number, top: number, bottom: number, w: number, positive: boolean): string {
  const h = Math.max(0, bottom - top);
  if (h === 0) return "";
  const r = Math.min(4, w / 2, h);
  if (positive) {
    return `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${bottom} Z`;
  }
  return `M${x},${top} L${x + w},${top} L${x + w},${bottom - r} Q${x + w},${bottom} ${x + w - r},${bottom} L${x + r},${bottom} Q${x},${bottom} ${x},${bottom - r} Z`;
}

function GridLines({ ticks, y, right }: { ticks: number[]; y: (v: number) => number; right: number }) {
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="fc-grid-line" x1={PAD.left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text className="fc-axis-text" x={PAD.left - 8} y={y(tick) + 3.5} textAnchor="end">
            {compactMoney(tick)}
          </text>
        </g>
      ))}
    </>
  );
}

function HitBand({ x, width, height, label, index, onActive }: { x: number; width: number; height: number; label: string; index: number; onActive: (i: number | null) => void }) {
  return (
    <rect
      className="fc-hit"
      x={x}
      y={PAD.top}
      width={width}
      height={height - PAD.top - PAD.bottom}
      tabIndex={0}
      role="button"
      aria-label={label}
      onPointerEnter={() => onActive(index)}
      onPointerLeave={() => onActive(null)}
      onFocus={() => onActive(index)}
      onBlur={() => onActive(null)}
    />
  );
}

export function ColumnChart({
  bands,
  series,
  height = 210,
  format = money,
  ariaLabel,
  diverging = null,
  emptyLabel = "Nothing to chart yet.",
}: {
  bands: ChartBand[];
  series: ChartSeries[];
  height?: number;
  format?: Formatter;
  ariaLabel: string;
  /** Colour by sign instead of by series: positive in the first series' hue, negative in the second slot. */
  diverging?: { positive: string; negative: string } | null;
  emptyLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const { ticks, y, hasData } = useScale(series, height);
  if (!bands.length || !hasData) return <div className="fc-empty">{emptyLabel}</div>;
  const right = VIEW_W - PAD.right;
  const innerW = right - PAD.left;
  const bandW = innerW / bands.length;
  const n = series.length;
  const gap = 2;
  const barW = Math.min(24, Math.max(4, (bandW * 0.72 - gap * (n - 1)) / n));
  const groupW = barW * n + gap * (n - 1);
  const baseline = y(0);
  const last = bands.length - 1;
  const colorFor = (s: ChartSeries, v: number) => (diverging ? (v >= 0 ? series[0].color : SERIES.two) : s.color);
  const legend = diverging
    ? [
        { key: "pos", label: diverging.positive, color: series[0].color },
        { key: "neg", label: diverging.negative, color: SERIES.two },
      ]
    : series;
  const activeBand = active != null ? bands[active] : null;
  const latest = series[0].values[last];
  return (
    <div className="fc-chart">
      <svg viewBox={`0 0 ${VIEW_W} ${height}`} role="img" aria-label={ariaLabel}>
        <GridLines ticks={ticks} y={y} right={right} />
        {bands.map((band, i) => {
          const x0 = PAD.left + bandW * i + (bandW - groupW) / 2;
          return (
            <g key={band.key}>
              {series.map((s, j) => {
                const v = s.values[i];
                if (v == null) return null;
                const positive = v >= 0;
                return (
                  <path
                    key={s.key}
                    className={cx("fc-bar", active === i && "is-active")}
                    d={barPath(x0 + j * (barW + gap), positive ? y(v) : baseline, positive ? baseline : y(v), barW, positive)}
                    fill={colorFor(s, v)}
                    opacity={band.muted ? 0.45 : 1}
                  />
                );
              })}
              {i === last && latest != null ? (
                <text className="fc-label" x={x0 + barW / 2} y={latest >= 0 ? y(latest) - 6 : y(latest) + 13} textAnchor="middle">
                  {compactMoney(latest)}
                </text>
              ) : null}
              <text className="fc-axis-text" x={PAD.left + bandW * i + bandW / 2} y={height - 9} textAnchor="middle">
                {band.short}
              </text>
              <HitBand x={PAD.left + bandW * i} width={bandW} height={height} index={i} onActive={setActive} label={`${band.label}: ${series.map((s) => `${s.label} ${format(s.values[i])}`).join(", ")}`} />
            </g>
          );
        })}
        <line className="fc-grid-line fc-baseline" x1={PAD.left} x2={right} y1={baseline} y2={baseline} />
      </svg>
      {activeBand && active != null ? (
        <Tooltip
          left={clampPct(((PAD.left + bandW * active + bandW / 2) / VIEW_W) * 100)}
          title={activeBand.label}
          rows={series.map((s) => ({ label: s.label, value: format(s.values[active]), color: colorFor(s, s.values[active] ?? 0), kind: "rect" as const }))}
        />
      ) : null}
      <Legend items={legend} kind="rect" />
    </div>
  );
}

export function LineChart({
  bands,
  series,
  height = 210,
  format = money,
  ariaLabel,
  emptyLabel = "Nothing to chart yet.",
}: {
  bands: ChartBand[];
  series: ChartSeries[];
  height?: number;
  format?: Formatter;
  ariaLabel: string;
  emptyLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const { ticks, y, hasData } = useScale(series, height);
  if (!bands.length || !hasData) return <div className="fc-empty">{emptyLabel}</div>;
  const right = VIEW_W - LINE_RIGHT_PAD;
  const innerW = right - PAD.left;
  const bandW = innerW / bands.length;
  const centre = (i: number) => PAD.left + bandW * i + bandW / 2;
  const points = series.map((s) => s.values.map((v, i) => (v == null ? null : { x: centre(i), y: y(v) })));
  // End labels: one per series when they do not collide; the emphasized
  // series wins a collision and the legend plus tooltip carry the rest.
  const ends = series
    .map((s, si) => {
      for (let i = s.values.length - 1; i >= 0; i--) {
        const v = s.values[i];
        if (v != null) return { si, x: centre(i), y: y(v), text: compactMoney(v), emphasis: !!s.emphasis };
      }
      return null;
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
    .sort((a, b) => Number(b.emphasis) - Number(a.emphasis) || a.si - b.si);
  const shown: typeof ends = [];
  for (const end of ends) if (shown.every((kept) => Math.abs(kept.y - end.y) >= 13)) shown.push(end);
  const activeBand = active != null ? bands[active] : null;
  return (
    <div className="fc-chart">
      <svg viewBox={`0 0 ${VIEW_W} ${height}`} role="img" aria-label={ariaLabel}>
        <GridLines ticks={ticks} y={y} right={right} />
        {bands.map((band, i) => (
          <text key={band.key} className="fc-axis-text" x={centre(i)} y={height - 9} textAnchor="middle">
            {band.short}
          </text>
        ))}
        {active != null ? <line className="fc-crosshair" x1={centre(active)} x2={centre(active)} y1={PAD.top} y2={height - PAD.bottom} /> : null}
        {series.map((s, si) => (
          <g key={s.key}>
            <path d={linePath(points[si])} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points[si].map((p, i) =>
              p ? <circle key={bands[i].key} cx={p.x} cy={p.y} r={active === i ? 5 : 4} fill={s.color} stroke="var(--surface)" strokeWidth={2} opacity={bands[i].muted ? 0.55 : 1} /> : null,
            )}
          </g>
        ))}
        {shown.map((end) => (
          <text key={end.si} className="fc-label" x={end.x + 9} y={end.y + 3.5} textAnchor="start">
            {end.text}
          </text>
        ))}
        {bands.map((band, i) => (
          <HitBand key={band.key} x={PAD.left + bandW * i} width={bandW} height={height} index={i} onActive={setActive} label={`${band.label}: ${series.map((s) => `${s.label} ${format(s.values[i])}`).join(", ")}`} />
        ))}
      </svg>
      {activeBand && active != null ? (
        <Tooltip left={clampPct((centre(active) / VIEW_W) * 100)} title={activeBand.label} rows={series.map((s) => ({ label: s.label, value: format(s.values[active]), color: s.color, kind: "line" as const }))} />
      ) : null}
      <Legend items={series} kind="line" />
    </div>
  );
}

export function Meter({ value, max = 3, tone, marks, label }: { value: number | null; max?: number; tone: "ok" | "warn" | "bad" | "mut"; marks: Array<{ at: number; label: string }>; label: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const fill = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--danger)" : "var(--faint)";
  const track = tone === "ok" ? "var(--ok-tint)" : tone === "warn" ? "var(--warn-tint)" : tone === "bad" ? "var(--danger-tint)" : "var(--sunken)";
  return (
    <div className="fc-meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value ?? undefined} aria-label={label}>
      <div className="fc-meter-track" style={{ background: track }}>
        <div className="fc-meter-fill" style={{ width: `${pct}%`, background: fill }} />
        {marks.map((mark) => (
          <span key={mark.at} className="fc-meter-mark" style={{ left: `${(mark.at / max) * 100}%` }}>
            <small>{mark.label}</small>
          </span>
        ))}
      </div>
      <div className="fc-meter-marks" aria-hidden="true" />
    </div>
  );
}

export function Sparkline({ values, width = 96, height = 28 }: { values: Array<number | null>; width?: number; height?: number }) {
  const numbers = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (numbers.length < 2) return null;
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  const range = hi - lo || 1;
  const inner = height - 8;
  const stepX = (width - 4) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => (v == null ? null : { x: 2 + i * stepX, y: 4 + inner - ((v - lo) / range) * inner }));
  let last: { x: number; y: number } | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i]) {
      last = points[i];
      break;
    }
  }
  return (
    <svg className="fc-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={linePath(points)} fill="none" stroke={SERIES.context} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {last ? <circle cx={last.x} cy={last.y} r={3.5} fill={SERIES.one} stroke="var(--surface)" strokeWidth={2} /> : null}
    </svg>
  );
}

/** Horizontal bars for a ladder of lines (revenue → net income): one hue, negatives in the second slot. */
export function HBarList({ rows, format = money }: { rows: Array<{ key: string; label: string; value: number | null; muted?: boolean; sub?: string }>; format?: Formatter }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value ?? 0)));
  return (
    <div className="fc-hbars">
      {rows.map((row) => {
        const width = row.value == null ? 0 : (Math.abs(row.value) / max) * 100;
        return (
          <div key={row.key} className={cx("fc-hbar", row.muted && "is-muted")}>
            <span className="fc-hbar-label">
              {row.label}
              {row.sub ? <small>{row.sub}</small> : null}
            </span>
            <span className="fc-hbar-track">
              <span className="fc-hbar-fill" style={{ width: `${width}%`, background: row.value != null && row.value < 0 ? SERIES.two : SERIES.one }} />
            </span>
            <strong className="fc-hbar-value num">{format(row.value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

export type ChartTable = { cols: string[]; rows: Array<{ key: string; cells: ReactNode[]; muted?: boolean }>; caption: string };

/** A chart with its table twin behind a toggle, so every value is reachable without hovering. */
export function ChartCard({ title, sub, chart, table, wide, actions, plain }: { title: string; sub?: ReactNode; chart: ReactNode; table: ChartTable | null; wide?: boolean; actions?: ReactNode; /** Inside another card: no border or shadow of its own. */ plain?: boolean }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cx(plain ? "fc-plain" : "fc-card", wide && "fc-wide")}>
      <div className="fc-card-h">
        <div>
          <h4>{title}</h4>
          {sub ? <div className="sub">{sub}</div> : null}
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {actions}
          {table ? (
            <div className="fc-toggle" role="tablist" aria-label={`${title} view`}>
              <button type="button" role="tab" aria-selected={view === "chart"} className={cx(view === "chart" && "on")} onClick={() => setView("chart")}>
                Chart
              </button>
              <button type="button" role="tab" aria-selected={view === "table"} className={cx(view === "table" && "on")} onClick={() => setView("table")}>
                Table
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {view === "table" && table ? (
        <Table caption={table.caption} cols={table.cols.map((label, i) => ({ label, align: i === 0 ? undefined : ("r" as const) }))} focusable={false}>
          {table.rows.map((row) => (
            <Tr key={row.key} className={cx(row.muted && "is-muted")}>
              {row.cells.map((cell, i) => (
                <Td key={i} className={i === 0 ? undefined : "num"} align={i === 0 ? undefined : "r"}>
                  {cell}
                </Td>
              ))}
            </Tr>
          ))}
        </Table>
      ) : (
        chart
      )}
    </section>
  );
}
