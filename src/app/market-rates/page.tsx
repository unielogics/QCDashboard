"use client";

// Market Rates Explorer — full-screen view of every FRED series we track
// plus the operator-side spread editor for super-admins. Reachable from:
//   - Dashboard "Today's Market Rates" widget → "view all"
//   - (super-admin) → "Open Rate Sheet" button here goes to /rates
//
// Anyone signed in can read this page; the spread-editing controls are
// gated to super-admin (UI-side; the /lender-spreads endpoint enforces
// the same gate server-side).

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel, Sparkline } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useCurrentUser,
  useFredSeries,
  useRefreshFred,
  useUpsertLenderSpread,
} from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { Role } from "@/lib/enums.generated";
import type { FredSeriesSummary } from "@/lib/types";

// Series → product / use-case copy. Mirrors the dashboard widget so the
// borrower sees the same "this is what this benchmark drives" framing.
const SERIES_LABELS: Record<string, { headline: string; sub: string }> = {
  DGS10: { headline: "10-Year Treasury", sub: "Long-term fixed (DSCR 30-yr)" },
  SOFR: { headline: "Secured Overnight Financing Rate", sub: "Bridge / floating-rate debt" },
  DPRIME: { headline: "Bank Prime Loan Rate", sub: "Fix & Flip / Ground Up / SBA 7(a)" },
  DGS5: { headline: "5-Year Treasury", sub: "5-year hybrid / fixed products" },
};

export default function MarketRatesPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: series = [], isLoading, error: seriesError } = useFredSeries();
  const refreshFred = useRefreshFred();

  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const isOperator =
    user?.role === Role.SUPER_ADMIN || user?.role === Role.BROKER || user?.role === Role.LOAN_EXEC;

  const fredNotDeployed = !!seriesError && /404/.test(String((seriesError as Error).message));
  const lastUpdated = series
    .map((s) => s.current_date)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: t.petrol,
            }}
          >
            Market data · FRED
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, color: t.ink, letterSpacing: -0.6 }}>
            Today&apos;s Market Rates
          </h1>
          <div style={{ fontSize: 13, color: t.ink2, marginTop: 4 }}>
            Live benchmarks from the Federal Reserve, combined with our lender spread to produce
            the estimated interest rate quoted on your dashboard.
            {lastUpdated && (
              <>
                {" "}Updated{" "}
                <strong>{new Date(lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong>.
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isSuperAdmin && (
            <button
              onClick={() => refreshFred.mutate()}
              disabled={refreshFred.isPending}
              style={qcBtn(t)}
            >
              <Icon name="refresh" size={13} />
              {refreshFred.isPending ? "Pulling…" : "Refresh from FRED"}
            </button>
          )}
          {isSuperAdmin && (
            <Link href="/rates" style={{ ...qcBtnPrimary(t), textDecoration: "none" }}>
              <Icon name="sliders" size={13} /> Open Rate Sheet
            </Link>
          )}
        </div>
      </div>

      {fredNotDeployed && (
        <Card pad={16} style={{ background: t.surface2 }}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            <strong>Market data not yet enabled.</strong> The backend at this environment doesn&apos;t expose
            <code> /fred/series</code> yet — redeploy <code>qcbackend</code> to pick up the FRED router and run
            <code> alembic upgrade head</code> for the matching schema.
          </div>
        </Card>
      )}

      {!fredNotDeployed && isLoading && series.length === 0 && (
        <Card pad={20}>
          <div style={{ color: t.ink3, fontSize: 13 }}>Loading market data…</div>
        </Card>
      )}

      {refreshFred.error && (
        <Pill bg={t.dangerBg} color={t.danger}>
          Refresh failed: {refreshFred.error instanceof Error ? refreshFred.error.message : "unknown"}
        </Pill>
      )}

      {/* One detailed card per series */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {series.map((s) => (
          <SeriesCard
            key={s.series_id}
            t={t}
            series={s}
            canEditSpread={isSuperAdmin}
          />
        ))}
      </div>

      {/* Footer note for non-super-admin operators */}
      {isOperator && !isSuperAdmin && (
        <div style={{ fontSize: 11.5, color: t.ink3, textAlign: "center", padding: 8 }}>
          Spread adjustments are super-admin only. Contact your super-admin to update lender spreads.
        </div>
      )}
    </div>
  );
}

// ── Per-series detail card ────────────────────────────────────────────────

function SeriesCard({
  t,
  series,
  canEditSpread,
}: {
  t: ReturnType<typeof useTheme>["t"];
  series: FredSeriesSummary;
  canEditSpread: boolean;
}) {
  const meta = SERIES_LABELS[series.series_id] ?? { headline: series.series_id, sub: "" };
  const upsertSpread = useUpsertLenderSpread();
  const [editing, setEditing] = useState(false);
  const [draftBps, setDraftBps] = useState<number>(series.spread_bps);
  const [draftNotes, setDraftNotes] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // Reset draft whenever the underlying spread changes (e.g. after save).
  useEffect(() => setDraftBps(series.spread_bps), [series.spread_bps]);

  const sparkValues = useMemo(
    () => (series.history_30d ?? []).map((p) => p.value).filter((v): v is number => v != null),
    [series.history_30d],
  );

  const submit = async () => {
    setFlash(null);
    try {
      await upsertSpread.mutateAsync({
        series_id: series.series_id,
        spread_bps: draftBps,
        notes: draftNotes.trim() || null,
      });
      setEditing(false);
      setDraftNotes("");
      setFlash("Spread updated.");
      setTimeout(() => setFlash(null), 1800);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Save failed");
    }
  };

  const deltaColor =
    series.delta_bps == null
      ? t.ink3
      : series.delta_bps < 0
        ? t.profit
        : series.delta_bps > 0
          ? t.danger
          : t.ink3;

  return (
    <Card pad={20}>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18, alignItems: "flex-start" }}>
        {/* Left: identity + 30-day chart */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "ui-monospace, SF Mono, monospace",
                fontSize: 11.5,
                fontWeight: 700,
                color: t.ink3,
                padding: "2px 7px",
                borderRadius: 6,
                background: t.surface2,
              }}
            >
              {series.series_id}
            </span>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: t.ink, margin: 0, letterSpacing: -0.3 }}>
              {meta.headline}
            </h2>
          </div>
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>{meta.sub}</div>

          <div style={{ marginTop: 14 }}>
            {sparkValues.length >= 2 ? (
              <Sparkline data={sparkValues} color={t.spark} width={620} height={140} fill />
            ) : (
              <div style={{ fontSize: 12, color: t.ink3, padding: 24, textAlign: "center" }}>
                Not enough history yet.
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
              color: t.ink3,
              fontFeatureSettings: '"tnum"',
            }}
          >
            <span>
              {series.history_30d[0]?.date
                ? new Date(series.history_30d[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "—"}
            </span>
            <span style={{ color: t.ink2 }}>30-day window</span>
            <span>
              {series.history_30d.at(-1)?.date
                ? new Date(series.history_30d.at(-1)!.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "—"}
            </span>
          </div>
        </div>

        {/* Right: numbers + spread editor */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <BigStat
              t={t}
              label="Index"
              value={series.current_value != null ? `${series.current_value.toFixed(3)}%` : "—"}
              sub={
                series.current_date
                  ? `as of ${new Date(series.current_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : undefined
              }
            />
            <BigStat
              t={t}
              label="Estimated rate"
              accent={t.petrol}
              value={
                series.estimated_rate != null ? `${series.estimated_rate.toFixed(3)}%` : "—"
              }
              sub="customer-facing"
            />
            <BigStat
              t={t}
              label="Lender spread"
              value={`${(series.spread_bps / 100).toFixed(2)}%`}
              sub={`${series.spread_bps} bps`}
            />
            <BigStat
              t={t}
              label="vs prior"
              value={
                series.delta_bps == null
                  ? "—"
                  : `${series.delta_bps > 0 ? "+" : ""}${series.delta_bps} bps`
              }
              valueColor={deltaColor}
              sub={(() => {
                // Derive a 7-day trend from history_7d (first vs last) since
                // the backend response doesn't ship a separate trend field.
                const valid = series.history_7d.filter((p) => p.value != null);
                if (valid.length < 2) return undefined;
                const first = valid[0].value as number;
                const last = valid[valid.length - 1].value as number;
                const trendBps = Math.round((last - first) * 100);
                return `7-day: ${trendBps > 0 ? "+" : ""}${trendBps} bps`;
              })()}
            />
          </div>

          {/* Formula breakdown */}
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 9,
              background: t.surface2,
              border: `1px solid ${t.line}`,
              fontSize: 12,
              color: t.ink2,
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>
              Formula
            </div>
            <span style={{ fontFamily: "ui-monospace, SF Mono, monospace", color: t.ink }}>
              {series.current_value != null ? series.current_value.toFixed(3) : "—"}%
            </span>
            <span style={{ color: t.ink3 }}> (index)  + </span>
            <span style={{ fontFamily: "ui-monospace, SF Mono, monospace", color: t.ink }}>
              {(series.spread_bps / 100).toFixed(2)}%
            </span>
            <span style={{ color: t.ink3 }}> (spread)  = </span>
            <span style={{ fontFamily: "ui-monospace, SF Mono, monospace", color: t.petrol, fontWeight: 700 }}>
              {series.estimated_rate != null ? series.estimated_rate.toFixed(3) : "—"}%
            </span>
          </div>

          {/* Spread editor (super-admin) */}
          {canEditSpread && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${t.line}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SectionLabel>Adjust spread</SectionLabel>
                {!editing && (
                  <button onClick={() => setEditing(true)} style={{ ...qcBtn(t), padding: "4px 9px", fontSize: 11.5 }}>
                    <Icon name="pencil" size={11} /> Edit
                  </button>
                )}
              </div>

              {editing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
                    <Field t={t} label="Spread (basis points)">
                      <input
                        type="number"
                        value={draftBps}
                        onChange={(e) => setDraftBps(Number(e.target.value) || 0)}
                        min={-1000}
                        max={2000}
                        step={5}
                        style={inputStyle(t)}
                      />
                    </Field>
                    <div style={{ fontSize: 12, color: t.ink3, paddingBottom: 10 }}>
                      = <strong style={{ color: t.ink }}>{(draftBps / 100).toFixed(2)}%</strong>
                    </div>
                  </div>
                  <Field t={t} label="Notes (audit trail)">
                    <textarea
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. Q2 repricing — tightening spread on bridge"
                      style={{ ...inputStyle(t), resize: "vertical" }}
                    />
                  </Field>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setDraftBps(series.spread_bps);
                        setDraftNotes("");
                      }}
                      style={qcBtn(t)}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submit}
                      disabled={upsertSpread.isPending || (draftBps === series.spread_bps && !draftNotes.trim())}
                      style={qcBtnPrimary(t)}
                    >
                      <Icon name="check" size={13} />
                      {upsertSpread.isPending ? "Saving…" : "Save spread"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.55 }}>
                  Current spread is <strong style={{ color: t.ink }}>{series.spread_bps} bps</strong>{" "}
                  ({(series.spread_bps / 100).toFixed(2)}%). Each save creates a new audit-trail row.
                </div>
              )}

              {flash && (
                <div style={{ marginTop: 8 }}>
                  <Pill
                    bg={flash === "Spread updated." ? t.profitBg : t.dangerBg}
                    color={flash === "Spread updated." ? t.profit : t.danger}
                  >
                    {flash}
                  </Pill>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function BigStat({
  t,
  label,
  value,
  sub,
  accent,
  valueColor,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: valueColor ?? accent ?? t.ink,
          marginTop: 4,
          fontFeatureSettings: '"tnum"',
          letterSpacing: -0.4,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.0,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    background: t.surface,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    fontFeatureSettings: '"tnum"',
  };
}
