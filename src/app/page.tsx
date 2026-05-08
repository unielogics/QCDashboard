"use client";

// Dashboard — operator + borrower overview. Containers (top→bottom):
//   1. Greeting + header buttons
//   2. KPI row (4 tiles, /reports/dashboard)
//   3. Today's Overdue panel
//   4. Today's Market Rates (4 product cards — for all roles, ported from mobile)
//   5. ProTermsCard (CLIENT role only — soft-pull lock/unlock)
//   6. Pipeline at a glance + Today (operator: 5-stage counters; borrower/broker: top-3 loan cards)
//   7. Portfolio Health (3 stat tiles — for all roles, ported from mobile)
//   8. AI co-pilot + Top brokers (renamed from Top exposures, source swapped)

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, StageBadge } from "@/components/design-system/primitives";
import { FredChart } from "@/components/FredChart";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useAITasks,
  useBrokerLeaderboard,
  useBrokers,
  useCalendar,
  useCurrentUser,
  useDashboardReport,
  useFredSeries,
  useLoans,
  useMyCredit,
  useRefreshFred,
} from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { AITask, Broker, CalendarEvent, FredSeriesSummary, Loan } from "@/lib/types";
import { Role } from "@/lib/enums.generated";
import { CreditPullModal } from "@/components/CreditPullModal";
import { RateDetailModal } from "@/components/RateDetailModal";
import { AgentHomeView } from "./components/AgentHomeView";

const STAGE_KEYS = [
  "prequalified",
  "collecting_docs",
  "lender_connected",
  "processing",
  "closing",
  "funded",
] as const;
const STAGE_LABELS = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];

export default function DashboardPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: tasks = [] } = useAITasks();
  const { data: events = [] } = useCalendar();
  const { data: report } = useDashboardReport();

  const firstName = (() => {
    if (!user) return null;
    const n = (user.name ?? "").trim();
    if (n && n !== user.email) return n.split(" ")[0];
    if (user.email) return user.email.split("@")[0].split(".")[0];
    return null;
  })();
  const today = new Date();
  const greeting =
    today.getHours() < 12 ? "Good morning" : today.getHours() < 18 ? "Good afternoon" : "Good evening";

  const highPriority = tasks.filter((task) => task.priority === "high" && task.status === "pending");
  const inFlight = loans.filter((l) => l.stage !== "funded");
  const todayEvents = events.filter((e) => isSameDay(new Date(e.starts_at), today));

  const stageCounts =
    report?.by_stage ??
    STAGE_KEYS.map((k) => ({
      stage: k,
      count: loans.filter((l) => l.stage === k).length,
      value: loans.filter((l) => l.stage === k).reduce((s, l) => s + Number(l.amount), 0),
    }));

  const isClient = user?.role === Role.CLIENT;
  const isBroker = user?.role === Role.BROKER;
  const showOperatorPipeline = !isClient && !isBroker;

  const datelineDate = today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const datelineTime = today.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  // Agent (BROKER) gets the Funding Command Center — a sales-driven personal
  // dashboard distinct from the firm-wide operator view used by Super Admin /
  // Underwriter. The existing operator dashboard below stays as-is for them.
  if (isBroker) {
    return <AgentHomeView />;
  }

  return (
    <div
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      {/* Greeting + header action buttons */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: t.petrol,
              letterSpacing: 1.6,
              textTransform: "uppercase",
            }}
          >
            {datelineDate} · {datelineTime} ET
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 30, fontWeight: 700, letterSpacing: -0.8, color: t.ink }}>
            {firstName ? `${greeting}, ${firstName}.` : greeting + "."}
          </h1>
          <div style={{ fontSize: 14, color: t.ink2, marginTop: 4 }}>
            {highPriority.length} high-priority items, {todayEvents.length} events today, {inFlight.length} loans in flight.
          </div>
        </div>
        {!isClient && (
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/pipeline" style={{ ...qcBtn(t), textDecoration: "none" }}>
              <Icon name="layers" size={14} /> Open Pipeline
            </Link>
            <Link href="/ai-inbox" style={{ ...qcBtnPrimary(t), textDecoration: "none" }}>
              <Icon name="bolt" size={14} /> Review AI Tasks
            </Link>
          </div>
        )}
      </div>

      {/* KPI row — operator-only. Borrowers don't need (and shouldn't see)
          firm-wide funded/pipeline/pull-through metrics. */}
      {!isClient && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <KPI
            label="Funded YTD"
            value={report ? QC_FMT.short(report.funded_ytd) : "—"}
            delta={report?.funded_ytd_delta ?? undefined}
            sub="vs. prior year"
            icon="dollar"
            accent={t.profit}
          />
          <KPI
            label="Pipeline"
            value={report ? QC_FMT.short(report.pipeline_value) : "—"}
            sub={report ? `${report.pipeline_count} loans` : undefined}
            icon="layers"
          />
          <KPI
            label="Avg close"
            value={report?.avg_close_days ? `${report.avg_close_days}d` : "—"}
            delta={report?.avg_close_delta ?? undefined}
            deltaSuffix="d"
            sub="from app to wire"
            icon="audit"
          />
          <KPI
            label="Pull-through"
            value={report?.pull_through != null ? `${(report.pull_through * 100).toFixed(0)}%` : "—"}
            delta={
              report?.pull_through_delta != null
                ? Math.round(report.pull_through_delta * 100)
                : undefined
            }
            sub="last 90d"
            icon="trend"
          />
        </div>
      )}

      <TodaysOverduePanel tasks={tasks} events={events} loans={loans} />

      {/* Today's Market Rates — for all roles (ported from mobile dashboard) */}
      <TodaysMarketRates />

      {/* Pro Terms Lock/Unlock — clients only */}
      {isClient && <ProTermsCard userName={user?.name ?? ""} userEmail={user?.email ?? ""} />}

      {/* Pipeline at a glance + Today */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        <Card pad={16}>
          <SectionLabel
            action={
              <Link href="/pipeline" style={{ color: t.petrol, fontWeight: 700, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                View all <Icon name="arrowR" size={12} />
              </Link>
            }
          >
            {showOperatorPipeline ? "Pipeline at a glance" : "Your loans"}
          </SectionLabel>

          {showOperatorPipeline ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              {stageCounts.slice(0, 5).map((s, i) => (
                <Link
                  key={s.stage}
                  href="/pipeline"
                  style={{
                    background: t.surface2,
                    border: `1px solid ${t.line}`,
                    borderRadius: 10,
                    padding: 12,
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: t.ink3,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    {STAGE_LABELS[i]}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: t.ink,
                      marginTop: 4,
                      fontFeatureSettings: '"tnum"',
                    }}
                  >
                    {s.count}
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
                    {QC_FMT.short(Number(s.value))}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            // Borrower/broker variant — mobile-style top-3 loan cards
            <BorrowerPipelineCards loans={loans} />
          )}

          <div style={{ height: 16 }} />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: t.ink3,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Closing in next 14 days
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {loans
              .filter((l) => l.stage === "closing" || l.stage === "processing")
              .slice(0, 5)
              .map((loan) => (
                <Link
                  key={loan.id}
                  href={`/loans/${loan.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px minmax(0, 1fr) 90px 130px 90px 24px",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 9,
                    border: `1px solid ${t.line}`,
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "ui-monospace, SF Mono, monospace",
                      fontSize: 11,
                      color: t.ink3,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {loan.deal_id}
                  </span>
                  <div style={{ minWidth: 0, overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: t.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {loan.address}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: t.ink3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {loan.type.replace("_", " ")}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: t.ink,
                      fontWeight: 700,
                      fontFeatureSettings: '"tnum"',
                      whiteSpace: "nowrap",
                      textAlign: "right",
                    }}
                  >
                    {QC_FMT.short(Number(loan.amount))}
                  </div>
                  <StageBadge stage={STAGE_KEYS.indexOf(loan.stage)} />
                  <div style={{ fontSize: 11.5, color: t.ink2, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {loan.close_date
                      ? `Close ${new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : "—"}
                  </div>
                  <Icon name="chevR" size={14} style={{ color: t.ink4 }} />
                </Link>
              ))}
            {inFlight.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: t.ink3, textAlign: "center" }}>
                No loans in flight yet. Create one from the Pipeline page.
              </div>
            )}
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel
            action={
              <Link href="/calendar" style={{ color: t.petrol, fontWeight: 700, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                Calendar <Icon name="arrowR" size={12} />
              </Link>
            }
          >
            Today
          </SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todayEvents.length === 0 && (
              <div style={{ fontSize: 12.5, color: t.ink3 }}>No events scheduled for today.</div>
            )}
            {todayEvents.slice(0, 6).map((ev) => {
              const k = ev.kind;
              const color = k === "closing" ? t.profit : k === "doc" ? t.warn : k === "ai" ? t.petrol : t.brand;
              const bg = k === "closing" ? t.profitBg : k === "doc" ? t.warnBg : k === "ai" ? t.petrolSoft : t.brandSoft;
              return (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: 10,
                    borderRadius: 9,
                    border: `1px solid ${t.line}`,
                    background: ev.priority === "high" ? bg : "transparent",
                  }}
                >
                  <div
                    style={{
                      minWidth: 56,
                      fontFamily: "ui-monospace, SF Mono, monospace",
                      fontSize: 12,
                      fontWeight: 700,
                      color,
                      fontFeatureSettings: '"tnum"',
                    }}
                  >
                    {new Date(ev.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, lineHeight: 1.4 }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                      {ev.who ?? "—"}
                      {ev.duration_min ? ` · ${ev.duration_min}m` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Portfolio Health — borrower-facing only. Operators have their own
          KPI/exposure surfaces (Reports, Top Brokers, Pipeline). */}
      {isClient && <PortfolioHealth loans={loans} />}

      {/* AI tasks + Top brokers — operator-only. Borrowers don't have an
          AI-task queue and shouldn't see the broker leaderboard. */}
      {!isClient && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card pad={16}>
          <SectionLabel
            action={
              <Link href="/ai-inbox" style={{ color: t.petrol, fontWeight: 700, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                Queue <Icon name="arrowR" size={12} />
              </Link>
            }
          >
            AI co-pilot · pending approval
          </SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.filter((task) => task.status === "pending").slice(0, 3).map((task) => (
              <Link
                key={task.id}
                href="/ai-inbox"
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${t.line}`,
                  background: t.surface2,
                  textDecoration: "none",
                }}
              >
                <Icon name="bolt" size={14} style={{ color: t.petrol, marginTop: 2 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <Pill bg={task.priority === "high" ? t.dangerBg : t.chip} color={task.priority === "high" ? t.danger : t.ink2}>
                      {task.priority}
                    </Pill>
                    <Pill>{task.source}</Pill>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{task.title}</div>
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{task.summary}</div>
                </div>
              </Link>
            ))}
            {tasks.filter((task) => task.status === "pending").length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: t.ink3, textAlign: "center" }}>
                Nothing pending — the co-pilot is caught up.
              </div>
            )}
          </div>
        </Card>

        <TopBrokersPanel />
      </div>
      )}
    </div>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── Today's Market Rates ────────────────────────────────────────────────
//
// Driven by the FRED API (services/fred.py). Each product card maps to a
// FRED series via PRODUCT_TO_SERIES below. The displayed rate is:
//
//     Estimated Interest Rate = Index (FRED) + Spread (lender_spreads)
//
// 7-day sparkline by default. Click a card → RateDetailModal with the
// 30-day chart + super-admin spread editor.

const PRODUCT_CARDS: Array<{ id: string; label: string; term: string; sub: string; series_id: string }> = [
  { id: "ff", label: "Fix & Flip", term: "12 mo", sub: "90% LTC / 75% ARV", series_id: "DPRIME" },
  { id: "gu", label: "Ground Up Construction", term: "18 mo", sub: "85% LTC / 70% LTFC", series_id: "DPRIME" },
  { id: "dscr", label: "DSCR Rental", term: "30 yr", sub: "80% LTV", series_id: "DGS10" },
  { id: "br", label: "Bridge", term: "24 mo", sub: "75% LTV", series_id: "SOFR" },
];

function TodaysMarketRates() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: series = [], isLoading, error: seriesError } = useFredSeries();
  const refreshFred = useRefreshFred();
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const autoRefreshFired = useRef(false);

  // 404 from /fred/series means the backend doesn't have the FRED router
  // mounted yet (deploy lag). Treat it as a "feature not enabled" state
  // rather than an error — quiet message, no auto-refresh attempts that
  // would also 404.
  const fredNotDeployed =
    !!seriesError && seriesError instanceof Error && /404/.test(String(seriesError.message));

  const seriesById = new Map(series.map((s) => [s.series_id, s] as const));
  const hasAnyData = series.some((s) => s.current_value != null);
  const lastUpdated = series
    .map((s) => s.current_date)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  // Auto-bootstrap: super-admin lands on a fresh DB, the widget triggers
  // the cron-style refresh exactly once so the dashboard is never empty.
  // Other roles just see the empty-state message until super-admin / the
  // cron populates it. Skip entirely when the FRED endpoint isn't deployed.
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  useEffect(() => {
    if (
      !autoRefreshFired.current &&
      isSuperAdmin &&
      !isLoading &&
      !hasAnyData &&
      !refreshFred.isPending &&
      !fredNotDeployed
    ) {
      autoRefreshFired.current = true;
      refreshFred.mutate();
    }
  }, [isSuperAdmin, isLoading, hasAnyData, refreshFred, fredNotDeployed]);

  return (
    <>
      <Card pad={16}>
        <SectionLabel
          action={
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              {lastUpdated && (
                <span style={{ fontSize: 11, color: t.ink3 }}>
                  FRED · updated {new Date(lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              {isSuperAdmin && (
                <button
                  onClick={() => refreshFred.mutate()}
                  disabled={refreshFred.isPending}
                  title="Force a FRED pull now (normally runs via the morning cron)"
                  style={{
                    all: "unset",
                    cursor: refreshFred.isPending ? "wait" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    borderRadius: 7,
                    background: t.surface2,
                    border: `1px solid ${t.line}`,
                    color: t.ink2,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <Icon name="refresh" size={11} />
                  {refreshFred.isPending ? "Pulling…" : "Refresh"}
                </button>
              )}
              <Link
                href="/market-rates"
                style={{
                  color: t.petrol,
                  fontWeight: 700,
                  fontSize: 12,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                view all <Icon name="arrowR" size={12} />
              </Link>
            </div>
          }
        >
          Today&apos;s market rates
        </SectionLabel>

        {(isLoading || refreshFred.isPending) && !hasAnyData && !fredNotDeployed && (
          <div style={{ padding: 14, fontSize: 12.5, color: t.ink3 }}>
            {refreshFred.isPending ? "Pulling latest from FRED…" : "Loading rates…"}
          </div>
        )}

        {fredNotDeployed && (
          <div style={{ padding: 14, fontSize: 12.5, color: t.ink2, background: t.surface2, borderRadius: 9, border: `1px solid ${t.line}` }}>
            <strong>Market data not yet enabled.</strong> The backend at this environment doesn&apos;t expose
            <code> /fred/series</code> yet — redeploy <code>qcbackend</code> to pick up the FRED router and
            run <code>alembic upgrade head</code> for the matching schema.
          </div>
        )}

        {!fredNotDeployed && !isLoading && !refreshFred.isPending && !hasAnyData && (
          <div style={{ padding: 14, fontSize: 12.5, color: t.warn, background: t.warnBg, borderRadius: 9 }}>
            {isSuperAdmin ? (
              <>
                No FRED data yet — auto-pull failed. Check that <code>FRED_API_KEY</code> is set on
                the backend, then click <strong>Refresh</strong> above.
              </>
            ) : (
              <>Market data refreshing — check back shortly.</>
            )}
          </div>
        )}

        {refreshFred.error && (
          <div style={{ padding: 10, fontSize: 11.5, color: t.danger, fontWeight: 700 }}>
            FRED refresh failed: {refreshFred.error instanceof Error ? refreshFred.error.message : "unknown"}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {PRODUCT_CARDS.map((card) => {
            const s = seriesById.get(card.series_id);
            return (
              <RateCard
                key={card.id}
                t={t}
                card={card}
                series={s}
                onClick={() => setActiveSeries(card.series_id)}
              />
            );
          })}
        </div>
      </Card>
      <RateDetailModal
        seriesId={activeSeries}
        productLabel={PRODUCT_CARDS.find((c) => c.series_id === activeSeries)?.label ?? null}
        onClose={() => setActiveSeries(null)}
      />
    </>
  );
}

function RateCard({
  t,
  card,
  series,
  onClick,
}: {
  t: ReturnType<typeof useTheme>["t"];
  card: { id: string; label: string; term: string; sub: string; series_id: string };
  series: FredSeriesSummary | undefined;
  onClick: () => void;
}) {
  const hasData = !!series && series.current_value != null;
  const estimated = series?.estimated_rate;
  const indexValue = series?.current_value;
  const spreadBps = series?.spread_bps ?? 0;
  const delta = series?.delta_bps ?? null;
  const deltaColor = delta == null ? t.ink3 : delta < 0 ? t.profit : delta > 0 ? t.danger : t.ink3;
  // Inline chart points. DPRIME (Fix & Flip + Ground Up) publishes
  // weekly so its history_7d window is empty most days — fall back
  // to the most recent valid points from history_30d so the chart
  // renders for sparse series too.
  const chartPoints = (() => {
    const seven = (series?.history_7d ?? []).filter((p) => p.value != null);
    if (seven.length >= 2) return seven;
    const thirty = (series?.history_30d ?? []).filter((p) => p.value != null);
    // Take the last 7 valid points, regardless of how far back they
    // span. Keeps the chart shape readable on weekly-published series.
    return thirty.slice(-7);
  })();
  const hasEnoughHistory = chartPoints.length >= 2;

  return (
    <button
      onClick={onClick}
      aria-label={`${card.label} rate detail`}
      style={{
        all: "unset",
        cursor: "pointer",
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>
          {card.label} <span style={{ color: t.ink3, fontWeight: 600 }}>· {card.term}</span>
        </div>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{card.sub}</div>
      </div>
      {hasEnoughHistory ? (
        // Wrap so the chart's hover doesn't trigger the card's click on
        // mouse-up — FredChart's tooltip swallows pointer events but the
        // chart svg itself is inside the button, so a click anywhere on
        // the card (including over the chart) still opens the modal.
        <FredChart data={chartPoints} width={200} height={44} variant="compact" fill />
      ) : (
        <div style={{ height: 44, fontSize: 11, color: t.ink4, fontStyle: "italic", display: "flex", alignItems: "center" }}>
          {hasData ? "Building chart history…" : "Awaiting first FRED pull"}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: t.ink,
            fontFeatureSettings: '"tnum"',
            letterSpacing: -0.4,
          }}
        >
          {estimated != null ? estimated.toFixed(3) : "—"}
          <span style={{ fontSize: 13, fontWeight: 700, color: t.ink3 }}>%</span>
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: deltaColor,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {delta == null ? "—" : QC_FMT.bps(delta)}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: t.ink3, fontFeatureSettings: '"tnum"', display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ color: t.ink3 }}>{card.series_id}</span>
        <span>{indexValue != null ? `${indexValue.toFixed(2)}%` : "—"}</span>
        <span>+</span>
        <span>{(spreadBps / 100).toFixed(2)}%</span>
        <span style={{ color: t.ink4 }}>(spread)</span>
      </div>
    </button>
  );
}

// ── Pro Terms Card (clients only) ──────────────────────────────────────────
function ProTermsCard({ userName, userEmail }: { userName: string; userEmail: string }) {
  const { t } = useTheme();
  const { data: credit } = useMyCredit();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"first" | "rerun" | "expired">("first");

  const unlocked = !!credit && !!credit.fico && !credit.is_expired;

  return (
    <>
      <Card
        pad={18}
        style={{
          background: unlocked ? t.profitBg : t.dangerBg,
          borderColor: unlocked ? `${t.profit}40` : `${t.danger}40`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: unlocked ? t.profit : t.danger,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name={unlocked ? "unlock" : "lock"} size={20} stroke={2.4} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: unlocked ? t.profit : t.danger,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              {unlocked ? "Pro Terms Unlocked" : "Pro Terms Locked"}
            </div>
            {unlocked ? (
              <div style={{ fontSize: 12, color: t.ink2, marginTop: 1 }}>
                FICO {credit.fico} · valid through{" "}
                {credit.expires_at ? new Date(credit.expires_at).toLocaleDateString() : "—"}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: t.ink2, marginTop: 1 }}>
                One soft pull unlocks all applications for 90 days · no score impact.
              </div>
            )}
          </div>
          <button
            onClick={() => {
              const next: "first" | "rerun" | "expired" = credit?.is_expired
                ? "expired"
                : unlocked
                  ? "rerun"
                  : "first";
              setMode(next);
              setOpen(true);
            }}
            style={{
              ...qcBtnPrimary(t),
              background: unlocked ? t.surface : t.danger,
              color: unlocked ? t.ink : "#fff",
              border: unlocked ? `1px solid ${t.line}` : "none",
              padding: "10px 16px",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            <Icon name={unlocked ? "refresh" : "lock"} size={14} />
            {unlocked ? "Re-run pull" : "Unlock Pro Terms · Soft Pull"}
          </button>
        </div>
      </Card>
      <CreditPullModal
        open={open}
        onClose={() => setOpen(false)}
        initialName={userName}
        initialEmail={userEmail}
        mode={mode}
      />
    </>
  );
}

// ── Borrower / broker pipeline cards (mobile-style) ──────────────────────
function BorrowerPipelineCards({ loans }: { loans: Loan[] }) {
  const { t } = useTheme();
  if (loans.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: t.ink3, textAlign: "center" }}>
        No loans yet.
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {loans.slice(0, 3).map((l) => (
        <Link
          key={l.id}
          href={`/loans/${l.id}`}
          style={{
            background: t.surface2,
            border: `1px solid ${t.line}`,
            borderRadius: 12,
            padding: 14,
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span
              style={{
                fontFamily: "ui-monospace, SF Mono, monospace",
                fontSize: 11,
                color: t.ink3,
                fontWeight: 700,
              }}
            >
              {l.deal_id}
            </span>
            <StageBadge stage={STAGE_KEYS.indexOf(l.stage)} />
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: t.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {l.address}
          </div>
          <div style={{ fontSize: 12, color: t.ink3 }}>
            {QC_FMT.short(Number(l.amount))} · {l.type.replace("_", " ")}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Portfolio Health ────────────────────────────────────────────────────
function PortfolioHealth({ loans }: { loans: Loan[] }) {
  const { t } = useTheme();
  const equityUnlocked = loans.reduce((s, l) => s + Number(l.amount) * 0.3, 0);
  const dscrLoans = loans.filter((l) => l.dscr != null);
  const globalDSCR =
    dscrLoans.length > 0
      ? dscrLoans.reduce((s, l) => s + Number(l.dscr ?? 0), 0) / dscrLoans.length
      : null;
  const activeLoans = loans.filter((l) => l.stage !== "funded").length;
  return (
    <Card pad={16}>
      <SectionLabel
        action={
          <Link
            href="/vault"
            style={{
              color: t.petrol,
              fontWeight: 700,
              fontSize: 12,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            title="Manage properties, upload HUDs, and review your investor profile"
          >
            view all <Icon name="arrowR" size={12} />
          </Link>
        }
      >
        Portfolio Health
      </SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <Stat label="Equity Unlocked" value={QC_FMT.short(equityUnlocked)} sub="estimated 30% of loan vol." />
        <Stat
          label="Global DSCR"
          value={globalDSCR != null ? globalDSCR.toFixed(2) : "—"}
          sub={dscrLoans.length > 0 ? `avg of ${dscrLoans.length} loans` : "no DSCR data"}
        />
        <Stat label="Active loans" value={String(activeLoans)} sub={`${loans.length - activeLoans} funded`} />
      </div>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
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
          fontSize: 26,
          fontWeight: 800,
          color: t.ink,
          marginTop: 6,
          fontFeatureSettings: '"tnum"',
          letterSpacing: -0.4,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Top brokers (replaces Top exposures) ─────────────────────────────────
function TopBrokersPanel() {
  const { t } = useTheme();
  // Try the leaderboard first (super-admin only). Fall back to /brokers (broader
  // access) so the panel still renders for AE/UW roles. The fallback hook is
  // always wired but we only consume it when the leaderboard 403s.
  const leaderboard = useBrokerLeaderboard();
  const fallbackBrokers = useBrokers();
  const data: Broker[] = leaderboard.data ?? fallbackBrokers.data ?? [];
  const sorted = [...data]
    .sort((a, b) => Number(b.funded_total ?? 0) - Number(a.funded_total ?? 0))
    .slice(0, 5);

  return (
    <Card pad={16}>
      <SectionLabel
        action={
          <Link
            href="/rewards"
            style={{
              color: t.petrol,
              fontWeight: 700,
              fontSize: 12,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Leaderboard <Icon name="arrowR" size={12} />
          </Link>
        }
      >
        Top brokers
      </SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map((b) => {
          const initials = (b.display_name ?? "?")
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("");
          return (
            <div
              key={b.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 6px",
                borderBottom: `1px solid ${t.line}`,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: t.petrol,
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{b.display_name}</div>
                <div style={{ fontSize: 11, color: t.ink3 }}>
                  {b.tier ?? "—"}
                  {b.funded_count != null ? ` · ${b.funded_count} loans` : ""}
                  {b.lifetime_points != null ? ` · ${b.lifetime_points.toLocaleString()} pts` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, fontFeatureSettings: '"tnum"' }}>
                  {QC_FMT.short(Number(b.funded_total ?? 0))}
                </div>
                <div style={{ fontSize: 10.5, color: t.ink3 }}>funded</div>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: t.ink3, textAlign: "center" }}>
            No brokers to show yet.
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Today's Overdue panel ────────────────────────────────────────────────
function TodaysOverduePanel({ tasks, events, loans }: { tasks: AITask[]; events: CalendarEvent[]; loans: Loan[] }) {
  const { t } = useTheme();
  const now = Date.now();
  const todayEnd = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();
  const loansByLoanId = Object.fromEntries(loans.map((l) => [l.id, l]));

  const items: Array<{
    key: string;
    kind: "task" | "event";
    urgency: "overdue" | "today" | "soon";
    label: string;
    sub: string;
    href: string;
  }> = [];

  for (const ev of events) {
    const ts = new Date(ev.starts_at).getTime();
    let urgency: "overdue" | "today" | "soon" | null = null;
    if (ts < now) urgency = "overdue";
    else if (ts <= todayEnd) urgency = "today";
    else if (ts <= now + 24 * 60 * 60 * 1000 * 3) urgency = "soon";
    if (!urgency) continue;
    items.push({
      key: `ev-${ev.id}`,
      kind: "event",
      urgency,
      label: ev.title,
      sub: `${new Date(ev.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${ev.who ? ` · ${ev.who}` : ""}`,
      href: ev.loan_id ? `/loans/${ev.loan_id}` : "/calendar",
    });
  }

  for (const task of tasks) {
    if (task.priority !== "high" || task.status !== "pending") continue;
    const ageH = (now - new Date(task.created_at).getTime()) / (1000 * 60 * 60);
    let urgency: "overdue" | "today" | "soon" = "soon";
    if (ageH > 8) urgency = "overdue";
    else if (ageH > 2) urgency = "today";
    items.push({
      key: `task-${task.id}`,
      kind: "task",
      urgency,
      label: task.title,
      sub: `${task.source} · conf ${(task.confidence * 100).toFixed(0)}%${task.loan_id && loansByLoanId[task.loan_id] ? ` · ${loansByLoanId[task.loan_id].deal_id}` : ""}`,
      href: "/ai-inbox",
    });
  }

  const order = { overdue: 0, today: 1, soon: 2 } as const;
  const ranked = items.sort((a, b) => order[a.urgency] - order[b.urgency]).slice(0, 6);
  if (ranked.length === 0) return null;

  const overdueCount = items.filter((i) => i.urgency === "overdue").length;
  const todayCount = items.filter((i) => i.urgency === "today").length;

  const urgencyStyle = (u: "overdue" | "today" | "soon") => ({
    color: u === "overdue" ? t.danger : u === "today" ? t.warn : t.ink2,
    bg: u === "overdue" ? t.dangerBg : u === "today" ? t.warnBg : t.chip,
  });

  return (
    <Card pad={16} style={{ background: overdueCount > 0 ? t.dangerBg : t.warnBg, borderColor: overdueCount > 0 ? `${t.danger}40` : `${t.warn}40` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: overdueCount > 0 ? t.danger : t.warn,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="bell" size={16} stroke={2.4} />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: overdueCount > 0 ? t.danger : t.warn,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Needs attention
          </div>
          <div style={{ fontSize: 12, color: t.ink2, marginTop: 1 }}>
            {overdueCount > 0 && (
              <span>
                <strong style={{ color: t.danger }}>{overdueCount} overdue</strong> ·{" "}
              </span>
            )}
            {todayCount > 0 && (
              <span>
                <strong>{todayCount} due today</strong> ·{" "}
              </span>
            )}
            {ranked.length} actionable item{ranked.length > 1 ? "s" : ""} surfaced.
          </div>
        </div>
        <Link
          href="/ai-inbox"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: t.surface,
            color: t.ink2,
            border: `1px solid ${t.line}`,
            fontSize: 12,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          AI Inbox <Icon name="chevR" size={11} />
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {ranked.map((item) => {
          const us = urgencyStyle(item.urgency);
          return (
            <Link
              key={item.key}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: t.surface,
                border: `1px solid ${t.line}`,
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 9.5,
                  fontWeight: 800,
                  background: us.bg,
                  color: us.color,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  marginTop: 2,
                }}
              >
                {item.urgency}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: t.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{item.sub}</div>
              </div>
              <Icon name="chevR" size={13} style={{ color: t.ink4, marginTop: 4, flexShrink: 0 }} />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
