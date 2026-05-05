"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useTheme } from "./ThemeProvider";

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
}: {
  label: string;
  value: string | number;
  delta?: number;
  deltaSuffix?: string;
  sub?: string;
  accent?: string;
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
            {positive ? "▲" : "▼"} {(positive ? "+" : "") + delta}
            {deltaSuffix}
          </span>
        )}
        {sub && <span style={{ color: t.ink3 }}>{sub}</span>}
      </div>
    </div>
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
      {label ?? STAGE_LABELS[stage] ?? "—"}
    </span>
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
