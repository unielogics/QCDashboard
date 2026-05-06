"use client";

// Interactive FRED chart — used in two places:
//   - Dashboard widget rate cards (compact: ~180×40, no axes, no tooltip
//     until hover, last-point dot only).
//   - /market-rates explorer (large: ~680×220, axes, hover crosshair with
//     a tooltip showing the date + value + delta vs prior point).
//
// Pure SVG, no chart library — keeps bundle small and matches the
// existing Sparkline visual language. Themed via useTheme tokens.

import { useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";

export interface FredChartPoint {
  date: string; // ISO date
  value: number | null;
}

interface Props {
  data: FredChartPoint[];
  width?: number;
  height?: number;
  /**
   * "compact" — small inline sparkline (matches mobile design). No axes,
   *             no value labels, hover overlays a thin crosshair + tiny
   *             tooltip pinned above the cursor.
   * "expanded" — full chart with axes, gridlines, value labels, full
   *              tooltip card on hover.
   */
  variant?: "compact" | "expanded";
  /** Override the line color. Defaults to t.spark. */
  color?: string;
  /** Show the area fill below the line. */
  fill?: boolean;
}

interface PlottedPoint {
  iso: string;
  date: Date;
  value: number;
  x: number;
  y: number;
  index: number;
}

export function FredChart({
  data,
  width = 180,
  height = 40,
  variant = "compact",
  color,
  fill,
}: Props) {
  const { t } = useTheme();
  const lineColor = color ?? t.spark;
  const fillEnabled = fill ?? variant === "compact";

  // Filter to plottable (non-null) points, normalize timestamps.
  const points: PlottedPoint[] = useMemo(() => {
    const valid = data.filter((p) => p.value != null) as { date: string; value: number }[];
    if (valid.length === 0) return [];
    const min = Math.min(...valid.map((p) => p.value));
    const max = Math.max(...valid.map((p) => p.value));
    const range = max - min || 1;
    // Leave room for axes when expanded.
    const padX = variant === "expanded" ? 36 : 0;
    const padTop = variant === "expanded" ? 14 : height * 0.12;
    const padBottom = variant === "expanded" ? 22 : height * 0.12;
    const innerW = width - padX - 8;
    const innerH = height - padTop - padBottom;
    return valid.map((p, i) => {
      const x = padX + (i / Math.max(valid.length - 1, 1)) * innerW;
      const y = padTop + (1 - (p.value - min) / range) * innerH;
      return {
        iso: p.date,
        date: new Date(p.date),
        value: p.value,
        x,
        y,
        index: i,
      };
    });
  }, [data, width, height, variant]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: t.ink4,
          fontStyle: "italic",
        }}
      >
        no data
      </div>
    );
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;

  const minVal = Math.min(...points.map((p) => p.value));
  const maxVal = Math.max(...points.map((p) => p.value));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xInSvg = ((e.clientX - rect.left) / rect.width) * width;
    // Find the nearest point by x distance.
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - xInSvg);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  };

  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const prevValue =
    hovered && hovered.index > 0 ? points[hovered.index - 1].value : null;
  const deltaBps = hovered && prevValue != null
    ? Math.round((hovered.value - prevValue) * 100)
    : null;

  return (
    <div style={{ position: "relative", width, height, fontFamily: "inherit" }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ overflow: "visible", display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Expanded variant: axes + gridlines */}
        {variant === "expanded" && (
          <ExpandedAxes
            t={t}
            width={width}
            height={height}
            min={minVal}
            max={maxVal}
            firstDate={points[0].date}
            lastDate={points[points.length - 1].date}
          />
        )}

        {fillEnabled && <path d={areaPath} fill={lineColor} opacity={0.12} />}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={variant === "expanded" ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last-point dot in compact mode */}
        {variant === "compact" && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={2.4}
            fill={lineColor}
          />
        )}

        {/* Hover crosshair + dot */}
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={0}
              y2={height}
              stroke={t.ink3}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5}
            />
            <circle cx={hovered.x} cy={hovered.y} r={3.5} fill={lineColor} />
            <circle cx={hovered.x} cy={hovered.y} r={6} fill={lineColor} opacity={0.2} />
          </>
        )}
      </svg>

      {/* Tooltip — pinned above the hovered point */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(hovered.x, 60), width - 60),
            top: Math.max(hovered.y - (variant === "expanded" ? 60 : 42), 0),
            transform: "translateX(-50%)",
            background: t.ink,
            color: t.inverse,
            padding: variant === "expanded" ? "8px 11px" : "5px 8px",
            borderRadius: 7,
            fontSize: variant === "expanded" ? 12 : 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: t.shadow,
            zIndex: 5,
            lineHeight: 1.35,
          }}
        >
          <div style={{ fontFeatureSettings: '"tnum"', fontWeight: 800 }}>
            {hovered.value.toFixed(3)}%
          </div>
          <div style={{ fontSize: variant === "expanded" ? 10.5 : 9.5, opacity: 0.75, fontWeight: 600 }}>
            {hovered.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: variant === "expanded" ? "numeric" : undefined,
            })}
            {deltaBps != null && (
              <>
                {" · "}
                <span style={{ color: deltaBps > 0 ? "#fca5a5" : deltaBps < 0 ? "#86efac" : undefined }}>
                  {deltaBps > 0 ? "+" : ""}
                  {deltaBps} bps
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Axes / gridlines for the expanded variant. Two horizontal grid lines
// (min, max) with labels on the left, two date labels on the bottom (start,
// end) — minimal and clean, doesn't fight the line.
function ExpandedAxes({
  t,
  width,
  height,
  min,
  max,
  firstDate,
  lastDate,
}: {
  t: ReturnType<typeof useTheme>["t"];
  width: number;
  height: number;
  min: number;
  max: number;
  firstDate: Date;
  lastDate: Date;
}) {
  const padX = 36;
  const padTop = 14;
  const padBottom = 22;
  const innerH = height - padTop - padBottom;
  const midVal = (min + max) / 2;

  const yFor = (v: number) => padTop + (1 - (v - min) / (max - min || 1)) * innerH;

  return (
    <g>
      {/* Top + mid + bottom gridlines */}
      {[max, midVal, min].map((v, i) => (
        <g key={i}>
          <line
            x1={padX}
            x2={width - 8}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke={t.line}
            strokeWidth={1}
          />
          <text
            x={padX - 6}
            y={yFor(v) + 3}
            textAnchor="end"
            style={{
              fontSize: 10,
              fill: t.ink3,
              fontFeatureSettings: '"tnum"',
              fontFamily: "inherit",
            }}
          >
            {v.toFixed(2)}%
          </text>
        </g>
      ))}
      {/* Date labels — first / last */}
      <text
        x={padX}
        y={height - 6}
        textAnchor="start"
        style={{ fontSize: 10, fill: t.ink3, fontFamily: "inherit" }}
      >
        {firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </text>
      <text
        x={width - 8}
        y={height - 6}
        textAnchor="end"
        style={{ fontSize: 10, fill: t.ink3, fontFamily: "inherit" }}
      >
        {lastDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </text>
    </g>
  );
}
