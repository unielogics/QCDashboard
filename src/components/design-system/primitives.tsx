"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "./ThemeProvider";
import { Icon } from "./Icon";

// — Card —
export function Card({
  children,
  pad = 18,
  glass = false,
  onClick,
  style,
}: {
  children: ReactNode;
  pad?: number;
  glass?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const { t, isDark } = useTheme();
  return (
    <div
      onClick={onClick}
      style={{
        background:
          glass && isDark
            ? "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))"
            : t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 18,
        padding: pad,
        boxShadow: isDark ? "none" : t.shadow,
        backdropFilter: glass ? "blur(12px) saturate(160%)" : undefined,
        WebkitBackdropFilter: glass ? "blur(12px) saturate(160%)" : undefined,
        cursor: onClick ? "pointer" : "default",
        transition: "transform .15s ease, border-color .15s ease",
        ...style,
      }}
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
  const { t } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "0 4px",
        marginBottom: 10,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: t.ink3,
        }}
      >
        {children}
      </div>
      {action && (
        <div style={{ fontSize: 13, fontWeight: 600, color: t.ink2 }}>{action}</div>
      )}
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
  const { t } = useTheme();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 0.2,
        background: bg ?? t.chip,
        color: color ?? t.ink2,
        whiteSpace: "nowrap",
        ...style,
      }}
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
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {fill && <path d={area} fill={color} opacity={0.12} />}
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.2} fill={color} />
    </svg>
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
  const { t } = useTheme();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: color ?? t.brand,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.4,
        boxShadow: ring ? `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.line}` : undefined,
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
  const { t } = useTheme();
  const positive = delta != null && delta >= 0;
  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 14,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: t.ink3,
          }}
        >
          {label}
        </div>
        {icon && (
          <div style={{ color: accent || t.ink3, display: "inline-flex" }}>
            <Icon name={icon} size={14} />
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: t.ink,
          letterSpacing: -0.6,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        {delta != null && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "2px 7px",
              borderRadius: 6,
              background: positive ? t.profitBg : t.dangerBg,
              color: positive ? t.profit : t.danger,
              fontWeight: 700,
            }}
          >
            <Icon name={positive ? "trend" : "trendDn"} size={11} stroke={2.4} />
            {(positive ? "+" : "") + delta}
            {deltaSuffix}
          </span>
        )}
        {sub && <span style={{ color: t.ink3 }}>{sub}</span>}
      </div>
    </div>
  );
}

// — TopButton — header pill button (used in TopBar)
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
  const { t } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        position: "relative",
        padding: "8px 12px",
        borderRadius: 10,
        background: active ? t.brandSoft : "transparent",
        color: active ? t.ink : t.ink2,
        border: `1px solid ${active ? t.line : "transparent"}`,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
      {badge != null && badge > 0 && (
        <span
          style={{
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 999,
            background: t.danger,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {badge}
        </span>
      )}
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
  const { t } = useTheme();
  const map = [
    { bg: t.chip, fg: t.ink2 },
    { bg: t.warnBg, fg: t.warn },
    { bg: t.petrolSoft, fg: t.petrol },
    { bg: t.brandSoft, fg: t.brand },
    { bg: t.warnBg, fg: t.warn },
    { bg: t.profitBg, fg: t.profit },
  ];
  const { bg, fg } = map[stage] ?? map[0];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: fg }} />
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
  const { t } = useTheme();
  const ac = accent || t.petrol;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: stages }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: i <= current ? ac : t.line,
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
  pad = 16,
  style,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  pad?: number;
  style?: CSSProperties;
}) {
  const { t } = useTheme();
  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 14,
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{title}</div>
          {action}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
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
  const { t } = useTheme();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: cols.map((c) => c.w || "1fr").join(" "),
        gap: 10,
        padding: "10px 14px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: t.ink3,
        borderBottom: `1px solid ${t.line}`,
        background: t.surface2,
        position: "sticky",
        top: 0,
        zIndex: 1,
      }}
    >
      {cols.map((c, i) => {
        const sortable = !!c.key;
        const active = sortable && sort.key === c.key;
        const dir = active ? sort.dir : null;
        return (
          <button
            key={i}
            onClick={() => sortable && c.key && onSort(c.key)}
            disabled={!sortable}
            style={{
              all: "unset",
              cursor: sortable ? "pointer" : "default",
              textAlign: c.align || "left",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              justifyContent:
                c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start",
              color: active ? t.ink : t.ink3,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              userSelect: "none",
            }}
          >
            {c.label}
            {sortable && (
              <span
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  lineHeight: 0.6,
                  fontSize: 9,
                  opacity: active ? 1 : 0.4,
                }}
              >
                <span style={{ color: dir === "asc" ? t.ink : "currentColor" }}>▲</span>
                <span style={{ color: dir === "desc" ? t.ink : "currentColor" }}>▼</span>
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
  const { t } = useTheme();
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: cols.map((c) => c.w || "1fr").join(" "),
        gap: 10,
        padding: "12px 14px",
        borderBottom: `1px solid ${t.line}`,
        cursor: onClick ? "pointer" : "default",
        background: active ? t.brandSoft : "transparent",
        alignItems: "center",
        fontSize: 13,
      }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            textAlign: cols[i].align || "left",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
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
  const { t } = useTheme();
  if (!msg) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        background: t.ink,
        color: t.inverse,
        padding: "10px 16px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: t.shadowLg,
        zIndex: 200,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Icon name="check" size={14} stroke={3} />
      {msg}
    </div>
  );
}
