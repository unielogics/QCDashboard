"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/ds";
import { Icon } from "./Icon";

// Restyled onto the plain-CSS design system (globals.css + app-extras.css).
// Every export and every prop signature below is UNCHANGED — 200+ files render
// these — but the chrome now comes from classes rather than from `t.*` reads.
// Where a value is data-derived (a caller-supplied colour, a size prop, a
// computed bar width) it stays inline and says so at the site.

// — Card —
export function Card({
  children,
  pad,
  glass: _glass = false,
  onClick,
  style,
  className,
}: {
  children: ReactNode;
  /** Override .card's padding. Prefer leaving it unset. */
  pad?: number;
  /** Retired with dark mode; accepted so ~112 call sites need no edit. */
  glass?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
}) {
  // Renders `.card` from globals.css. Reskinned in place rather than at the
  // call sites: Card appears in 112 files, so changing it here restyles all of
  // them without a single page edit — the highest-leverage move in this
  // migration, and the riskiest, which is why it lands on its own commit.
  return (
    <div
      onClick={onClick}
      className={cx("card", className)}
      // `pad` is a caller-supplied override of `.card`'s padding: exactly one
      // of the two applies, and the inline one wins deliberately.
      style={pad != null ? { padding: pad, ...style } : style}
    >
      {children}
    </div>
  );
}

export function SectionLabel({
  children,
  action,
  style,
}: {
  children: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    // `.seclbl` (app-extras) owns the baseline-aligned label/action row.
    // `style` stays a passthrough because 36 call sites nudge its margins.
    <div className="seclbl" style={style}>
      <div className="lbl">{children}</div>
      {action && <div className="seclbl-a">{action}</div>}
    </div>
  );
}

export function Pill({
  children,
  color,
  bg,
  style,
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
  style?: CSSProperties;
}) {
  // `.cellchip` owns the geometry and deliberately sets neither background nor
  // colour, so the tone has exactly one owner: the `.c-mut` class by default,
  // or the caller's data-derived pair. Never both.
  const tinted = color != null || bg != null;
  return (
    <span
      className={cx("cellchip", !tinted && "c-mut")}
      style={
        tinted
          ? { background: bg ?? "var(--sunken)", color: color ?? "var(--muted)", ...style }
          : style
      }
    >
      {children}
    </span>
  );
}

// — Sparkline (port of primitives.jsx) —
export function Sparkline({
  data,
  color,
  width = 80,
  height = 28,
  fill = false,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.075;
    return [x, y] as [number, number];
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  // Measured geometry: every attribute here is computed from `data`, and the
  // overflow lets the last-point dot sit proud of the viewBox.
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {fill && <path d={area} fill={color} opacity={0.12} />}
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.2} fill={color} />
    </svg>
  );
}

// — VerifiedBadge — petrol "Center of Truth" tint (port of design primitives.jsx)
export function VerifiedBadge({ kind = "verified" }: { kind?: "verified" | "pending" | "flagged" }) {
  if (kind === "pending") {
    return (
      <span className="cellchip caps c-warn">
        {/* `.cellchip > .repdot` sizes and tints it from the chip. */}
        <span className="repdot" />
        Pending
      </span>
    );
  }
  if (kind === "flagged") {
    return <span className="cellchip caps c-bad">Flagged</span>;
  }
  return (
    <span className="cellchip caps c-pet">
      <Icon name="shieldChk" size={9} stroke={2.5} />
      Verified
    </span>
  );
}

// — Avatar —
export function Avatar({
  label,
  color,
  size = 32,
  ring = false,
}: {
  label: string;
  color?: string;
  size?: number;
  ring?: boolean;
}) {
  // `.avatar` in globals.css is a fixed 30px identity chip for the sidebar
  // foot. This one is fully parameterised — size drives width, height, radius
  // and font-size, and `color` is caller-supplied — so the geometry is
  // data-derived and stays inline. Only the palette moved onto the sheet.
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: color ?? "var(--accent)",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.4,
        boxShadow: ring ? "0 0 0 2px var(--surface), 0 0 0 4px var(--line)" : undefined,
        flexShrink: 0,
      }}
    >
      {label}
    </div>
  );
}

// — KPI tile (desktop) —
export function KPI({
  label,
  value,
  delta,
  deltaSuffix = "%",
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  delta?: number;
  deltaSuffix?: string;
  sub?: string;
  accent?: string;
  icon?: string;
}) {
  const positive = delta != null && delta >= 0;
  return (
    <div className="kpi">
      <div className="row">
        <div className="lbl grow">{label}</div>
        {icon && (
          // `accent` is a caller-supplied tint for the corner glyph.
          <span style={{ color: accent || "var(--muted)", display: "inline-flex" }}>
            <Icon name={icon} size={14} />
          </span>
        )}
      </div>
      <div className="knum num">{value}</div>
      {(delta != null || sub) && (
        <div className="kdelta row">
          {delta != null && (
            <span className={cx("cellchip", positive ? "c-ok" : "c-bad")}>
              <Icon name={positive ? "trend" : "trendDn"} size={11} stroke={2.4} />
              {(positive ? "+" : "") + delta}
              {deltaSuffix}
            </span>
          )}
          {sub && <span className="sub">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// — TopButton — header pill button (used in TopBar)
// Nothing imports this any more — TopBar builds its own header controls — but
// it is migrated rather than dropped: deleting an export is a separate call.
export function TopButton({
  icon,
  children,
  onClick,
  active,
  badge,
}: {
  icon?: string;
  children?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  badge?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx("btn", active && "tone-acc")}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
      {badge != null && badge > 0 && <span className="cnt sm">{badge}</span>}
    </button>
  );
}

// — Stage badge (6 stages) —
const STAGE_LABELS = [
  "Prequalified",
  "Collecting Docs",
  "Lender Connected",
  "Processing",
  "Closing",
  "Funded",
];

export function StageBadge({ stage, label }: { stage: number; label?: string }) {
  // The tone is chosen from the stage number, but it resolves to one of the
  // sheet's `c-*` classes rather than to a pair of hex values.
  const tones = ["c-mut", "c-warn", "c-pet", "c-acc", "c-warn", "c-ok"];
  const tone = tones[stage] ?? tones[0];
  return (
    <span className={cx("cellchip", "caps", tone)}>
      {/* `.cellchip > .repdot` sizes and tints it from the chip. */}
      <span className="repdot" />
      {label ?? STAGE_LABELS[stage] ?? "—"}
    </span>
  );
}

// — StageBar — mini horizontal stage progress (used on Loan Detail hero)
export function StageBar({
  stages,
  current,
  accent,
}: {
  stages: number;
  current: number;
  accent?: string;
}) {
  const ac = accent || "var(--petrol)";
  return (
    // A segmented progress rail: `.track`/`.fill` are one bar with a computed
    // width, this is N equal segments, so the track stays bespoke.
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: stages }).map((_, i) => (
        <div
          key={i}
          // Filled state is derived from `current`.
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: i <= current ? ac : "var(--line)",
          }}
        />
      ))}
    </div>
  );
}

// — Panel — bordered section container
export function Panel({
  title,
  action,
  children,
  pad,
  style,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Override .panel-b's padding. Prefer leaving it unset. */
  pad?: number;
  style?: CSSProperties;
  className?: string;
}) {
  // Renders `.panel` / `.panel-h` / `.panel-b`. One flat container with a
  // header hairline, replacing the card-in-card nesting this used to produce.
  return (
    <div className={cx("panel", className)} style={style}>
      {(title || action) && (
        <div className="panel-h">
          {title && <h3>{title}</h3>}
          {action && (
            <>
              <span className="sp" />
              {action}
            </>
          )}
        </div>
      )}
      {/* `pad` is a caller-supplied override of `.panel-b`'s padding. */}
      <div className="panel-b" style={pad != null ? { padding: pad } : undefined}>
        {children}
      </div>
    </div>
  );
}

// — Sortable table head — clickable column headers with asc/desc indicator.
// Cols with `key` are sortable; others render as static headers.
export interface SortCol {
  label: string;
  w?: string;
  align?: "left" | "right" | "center";
  key?: string;
}
export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export function useSort(initialKey: string, initialDir: "asc" | "desc" = "desc") {
  const [sort, setSort] = useState<SortState>({ key: initialKey, dir: initialDir });
  const onSort = (key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };
  // Stable comparator. Numbers, strings, dates (parseable) all handled.
  const compare = <T extends Record<string, unknown>>(a: T, b: T) => {
    const k = sort.key as keyof T;
    const av = a[k];
    const bv = b[k];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return sort.dir === "asc" ? cmp : -cmp;
  };
  return { sort, onSort, compare };
}

export function SortableTableHead({
  cols,
  sort,
  onSort,
}: {
  cols: SortCol[];
  sort: SortState;
  onSort: (key: string) => void;
}) {
  return (
    // A div pretending to be a <thead>: the column track is built from `cols`,
    // so it is data-derived and cannot become a class. `.tbl th` is the class
    // for this look but only applies inside a real <table>, which this is not.
    <div
      className="gridhd"
      style={{ gridTemplateColumns: cols.map((c) => c.w || "1fr").join(" ") }}
    >
      {cols.map((c, i) => {
        const sortable = !!c.key;
        const active = sortable && sort.key === c.key;
        const dir = active ? sort.dir : null;
        return (
          <button
            key={i}
            type="button"
            onClick={() => sortable && c.key && onSort(c.key)}
            disabled={!sortable}
            className={cx("gridhd-c", active && "on")}
            // Alignment is per-column data.
            style={{
              textAlign: c.align || "left",
              justifyContent:
                c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start",
            }}
          >
            {c.label}
            {sortable && (
              <span className="sortarr" style={{ opacity: active ? 1 : 0.4 }}>
                <span style={{ color: dir === "asc" ? "var(--ink)" : "currentColor" }}>▲</span>
                <span style={{ color: dir === "desc" ? "var(--ink)" : "currentColor" }}>▼</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TableRow({
  cols,
  values,
  onClick,
  active,
}: {
  cols: SortCol[];
  values: ReactNode[];
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cx("gridrow", active && "on")}
      // Column track comes from `cols`; the pointer affordance from `onClick`.
      style={{
        gridTemplateColumns: cols.map((c) => c.w || "1fr").join(" "),
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {values.map((v, i) => (
        // Per-column alignment is data.
        <div key={i} className="trunc" style={{ textAlign: cols[i].align || "left" }}>
          {v}
        </div>
      ))}
    </div>
  );
}

// — Toast — lightweight bottom-center notification
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2400);
    return () => clearTimeout(id);
  }, [msg]);
  return { msg, show: (m: string) => setMsg(m) };
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="check" size={14} stroke={3} />
      {msg}
    </div>
  );
}
