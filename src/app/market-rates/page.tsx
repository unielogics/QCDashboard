"use client";

// Market Rates Explorer — full-screen view of every FRED series we track
// plus the operator-side spread editor for super-admins. Reachable from:
//   - Dashboard "Today's Market Rates" widget → "view all"
//   - (super-admin) → "Open Rate Sheet" button here goes to /rates
//
// Anyone signed in can read this page; the spread-editing controls are
// gated to super-admin (UI-side; the /lender-spreads endpoint enforces
// the same gate server-side).
//
// Styling: migrated off inline token objects onto the plain-CSS design system
// in globals.css. The page owns no padding or max-width of its own — the app
// shell's `.content` already sets both, and repeating them here is how you get
// a double gutter nobody can find.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Btn,
  CG,
  Card,
  CellChip,
  Field,
  Input,
  Kpi,
  KpiRow,
  Note,
  PageHeader,
  Panel,
  Row,
  Seg,
  Tag,
  Textarea,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import {
  useCurrentUser,
  useFredSeries,
  useRefreshFred,
  useUpsertLenderSpread,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { FredSeriesSummary } from "@/lib/types";
import { FredChart } from "@/components/FredChart";

type RangeDays = 7 | 14 | 30 | 60 | 90;
// `Seg` is generic over a string union, so the range lives as a string key in
// the control and is widened back to the numeric RangeDays the query takes.
type RangeKey = "7" | "14" | "30" | "60" | "90";
const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "14", label: "14d" },
  { value: "30", label: "30d" },
  { value: "60", label: "60d" },
  { value: "90", label: "90d" },
];

// Series → product / use-case copy. Mirrors the dashboard widget so the
// borrower sees the same "this is what this benchmark drives" framing.
const SERIES_LABELS: Record<string, { headline: string; sub: string }> = {
  DGS10: { headline: "10-Year Treasury", sub: "Long-term fixed (DSCR 30-yr)" },
  SOFR: { headline: "Secured Overnight Financing Rate", sub: "Bridge / floating-rate debt" },
  DPRIME: { headline: "Bank Prime Loan Rate", sub: "Fix & Flip / Ground Up / SBA 7(a)" },
  DGS5: { headline: "5-Year Treasury", sub: "5-year hybrid / fixed products" },
};

export default function MarketRatesPage() {
  const { data: user } = useCurrentUser();
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const { data: series = [], isLoading, error: seriesError } = useFredSeries(rangeDays);
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
    <div className="grid">
      {/* Header */}
      <div>
        <PageHeader
          title="Today's Market Rates"
          lede={
            <>
              Market data · FRED
              {lastUpdated && (
                <>
                  {" · updated "}
                  <strong>
                    {new Date(lastUpdated).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </strong>
                </>
              )}
            </>
          }
          actions={
            <>
              {isSuperAdmin && (
                <Btn onClick={() => refreshFred.mutate()} disabled={refreshFred.isPending}>
                  <Icon name="refresh" size={13} />
                  {refreshFred.isPending ? "Pulling…" : "Refresh from FRED"}
                </Btn>
              )}
              {isSuperAdmin && (
                // next/link, not the ds <BtnLink>: this is an in-app route and
                // client navigation is the affordance, not the styling.
                <Link href="/rates" className="btn pri">
                  <Icon name="sliders" size={13} /> Open Rate Sheet
                </Link>
              )}
            </>
          }
        />
        {/* Mirrors the `h2 + .sub` rule in globals.css, which is scoped to h2
            and so does not reach the h1 that PageHeader emits. */}
        <p className="sub" style={{ margin: "4px 0 0", maxWidth: 760 }}>
          Live benchmarks from the Federal Reserve, combined with our lender spread to produce the
          estimated interest rate quoted on your dashboard.
        </p>
      </div>

      {/* Range filter — applies to every chart on the page */}
      {!fredNotDeployed && (
        <Card className="row">
          <span className="lbl">Range</span>
          <Seg
            value={String(rangeDays) as RangeKey}
            onChange={(v) => setRangeDays(Number(v) as RangeDays)}
            options={RANGE_OPTIONS}
            ariaLabel="Chart range"
          />
          <span className="sp" />
          <span className="sub">Hover any chart to see the value on that date.</span>
        </Card>
      )}

      {fredNotDeployed && (
        <Card>
          <div className="sub">
            <strong>Market data not yet enabled.</strong> The backend at this environment
            doesn&apos;t expose <code>/fred/series</code> yet — redeploy <code>qcbackend</code> to
            pick up the FRED router and run <code>alembic upgrade head</code> for the matching
            schema.
          </div>
        </Card>
      )}

      {!fredNotDeployed && isLoading && series.length === 0 && (
        <Card>
          <div className="sub">Loading market data…</div>
        </Card>
      )}

      {refreshFred.error && (
        <div role="alert">
          <CellChip tone="bad">
            Refresh failed:{" "}
            {refreshFred.error instanceof Error ? refreshFred.error.message : "unknown"}
          </CellChip>
        </div>
      )}

      {/* One detailed card per series */}
      <div className="grid">
        {series.map((s) => (
          <SeriesCard
            key={s.series_id}
            series={s}
            canEditSpread={isSuperAdmin}
            rangeDays={rangeDays}
          />
        ))}
      </div>

      {/* Footer note for non-super-admin operators */}
      {isOperator && !isSuperAdmin && (
        <div className="demo">
          Spread adjustments are super-admin only. Contact your super-admin to update lender spreads.
        </div>
      )}
    </div>
  );
}

// ── Per-series detail card ────────────────────────────────────────────────

function SeriesCard({
  series,
  canEditSpread,
  rangeDays,
}: {
  series: FredSeriesSummary;
  canEditSpread: boolean;
  rangeDays: RangeDays;
}) {
  const meta = SERIES_LABELS[series.series_id] ?? { headline: series.series_id, sub: "" };
  const upsertSpread = useUpsertLenderSpread();
  const [editing, setEditing] = useState(false);
  const [draftBps, setDraftBps] = useState<number>(series.spread_bps);
  const [draftNotes, setDraftNotes] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // Reset draft whenever the underlying spread changes (e.g. after save).
  useEffect(() => setDraftBps(series.spread_bps), [series.spread_bps]);

  // Pick the chart points to plot:
  //   - prefer the variable-window `history` field set by the new backend
  //   - fall back to history_30d when the backend hasn't been redeployed
  //     yet (older API doesn't ship the `history` field)
  const chartPoints = useMemo(() => {
    if (series.history && series.history.length > 0) return series.history;
    return series.history_30d ?? [];
  }, [series.history, series.history_30d]);
  const validCount = chartPoints.filter((p) => p.value != null).length;

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

  // Data-derived, so it stays an inline value: a fall in the index is an
  // improvement and a rise is not, and no class encodes a sign.
  const deltaColor =
    series.delta_bps == null
      ? "var(--muted)"
      : series.delta_bps < 0
        ? "var(--ok)"
        : series.delta_bps > 0
          ? "var(--danger)"
          : "var(--muted)";

  // Derive a 7-day trend from history_7d (first vs last) since the backend
  // response doesn't ship a separate trend field.
  const trend7d = (() => {
    const valid = series.history_7d.filter((p) => p.value != null);
    if (valid.length < 2) return undefined;
    const first = valid[0].value as number;
    const last = valid[valid.length - 1].value as number;
    const trendBps = Math.round((last - first) * 100);
    return `7-day: ${trendBps > 0 ? "+" : ""}${trendBps} bps`;
  })();

  return (
    <Panel title={meta.headline} sub={meta.sub} actions={<Tag className="num">{series.series_id}</Tag>}>
      <CG>
        {/* Left: identity + chart over the selected window */}
        <div className="s7 grid">
          {validCount >= 2 ? (
            // No `color` prop: FredChart already defaults to the same spark
            // colour the page used to pass in explicitly.
            <FredChart data={chartPoints} width={620} height={220} variant="expanded" fill />
          ) : (
            <div className="sub">Not enough history yet for a {rangeDays}-day window.</div>
          )}
          <div className="sub">
            {rangeDays}-day window · {validCount} data points
          </div>
        </div>

        {/* Right: numbers + spread editor */}
        <div className="s5">
          <KpiRow>
            <Kpi
              label="Index"
              value={series.current_value != null ? `${series.current_value.toFixed(3)}%` : "—"}
              sub={
                series.current_date
                  ? `as of ${new Date(series.current_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : undefined
              }
            />
            {/* The petrol accent said "this is the customer-facing number";
                the petrol chip tone carries that without a colour lookup. */}
            <Kpi
              label="Estimated rate"
              value={series.estimated_rate != null ? `${series.estimated_rate.toFixed(3)}%` : "—"}
              delta="customer-facing"
              tone="pet"
            />
            <Kpi
              label="Lender spread"
              value={`${(series.spread_bps / 100).toFixed(2)}%`}
              sub={`${series.spread_bps} bps`}
            />
            <Kpi
              label="vs prior"
              value={
                <span style={{ color: deltaColor }}>
                  {series.delta_bps == null
                    ? "—"
                    : `${series.delta_bps > 0 ? "+" : ""}${series.delta_bps} bps`}
                </span>
              }
              sub={trend7d}
            />
          </KpiRow>

          {/* Formula breakdown */}
          <Note>
            <div>
              <div className="lbl">Formula</div>
              <span className="num">
                {series.current_value != null ? series.current_value.toFixed(3) : "—"}%
              </span>
              <span className="sub"> (index) + </span>
              <span className="num">{(series.spread_bps / 100).toFixed(2)}%</span>
              <span className="sub"> (spread) = </span>
              <b className="num">
                {series.estimated_rate != null ? series.estimated_rate.toFixed(3) : "—"}%
              </b>
            </div>
          </Note>

          {/* Spread editor (super-admin) */}
          {canEditSpread && (
            <div className="card mt">
              <Row>
                <span className="lbl">Adjust spread</span>
                <span className="sp" />
                {!editing && (
                  <Btn size="sm" onClick={() => setEditing(true)}>
                    <Icon name="pencil" size={11} /> Edit
                  </Btn>
                )}
              </Row>

              {editing ? (
                <div className="grid mt">
                  <Row>
                    <Field label="Spread (basis points)">
                      <Input
                        type="number"
                        className="num"
                        value={draftBps}
                        onChange={(e) => setDraftBps(Number(e.target.value) || 0)}
                        min={-1000}
                        max={2000}
                        step={5}
                      />
                    </Field>
                    <span className="sub">
                      = <b>{(draftBps / 100).toFixed(2)}%</b>
                    </span>
                  </Row>
                  <Field label="Notes (audit trail)">
                    <Textarea
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      rows={2}
                      placeholder="e.g. Q2 repricing — tightening spread on bridge"
                    />
                  </Field>
                  <Row>
                    <span className="sp" />
                    <Btn
                      onClick={() => {
                        setEditing(false);
                        setDraftBps(series.spread_bps);
                        setDraftNotes("");
                      }}
                    >
                      Cancel
                    </Btn>
                    <Btn
                      variant="pri"
                      onClick={submit}
                      disabled={
                        upsertSpread.isPending ||
                        (draftBps === series.spread_bps && !draftNotes.trim())
                      }
                    >
                      <Icon name="check" size={13} />
                      {upsertSpread.isPending ? "Saving…" : "Save spread"}
                    </Btn>
                  </Row>
                </div>
              ) : (
                <div className="sub mt">
                  Current spread is <b>{series.spread_bps} bps</b> (
                  {(series.spread_bps / 100).toFixed(2)}%). Each save creates a new audit-trail row.
                </div>
              )}

              {flash && (
                <div className="mt">
                  <CellChip tone={flash === "Spread updated." ? "ok" : "bad"}>{flash}</CellChip>
                </div>
              )}
            </div>
          )}
        </div>
      </CG>
    </Panel>
  );
}
