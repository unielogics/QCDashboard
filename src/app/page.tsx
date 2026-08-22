"use client";

// Dashboard — operator + borrower overview. Containers (top→bottom):
//   1. Greeting + header buttons
//   2. KPI row (4 tiles, /reports/dashboard)
//   3. Today's Overdue panel
//   4. Today's Market Rates (4 product cards — for all roles, ported from mobile)
//   5. ProTermsCard (CLIENT role only — soft-pull lock/unlock)
//   6. Pipeline at a glance + Today (operator: 5-stage counters; borrower/broker: top-3 loan cards)
//   7. Portfolio Health (3 stat tiles — for all roles, ported from mobile)
//   8. Elara + Top brokers (renamed from Top exposures, source swapped)
//
// Restyled onto the class design system. The page is now a `.cg` twelve-column
// grid whose children carry `.s12` / `.s7` / `.s5` / `.s6`, and every state
// colour that used to be a theme-token lookup is a chip tone or a `.tone-*`
// surface class. Data flow, role branching and every link target are unchanged.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FredChart } from "@/components/FredChart";
import { Icon } from "@/components/design-system/Icon";
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
import {
  Btn,
  CG,
  Card,
  CellChip,
  Kpi,
  KpiRow,
  Note,
  PageHeader,
  Panel,
  StatusLine,
  Table,
  Td,
  Tr,
  cx,
  type ChipTone,
  type Col,
} from "@/components/ds";

const STAGE_KEYS = [
  "prequalified",
  "collecting_docs",
  "lender_connected",
  "processing",
  "closing",
  "funded",
] as const;
const STAGE_LABELS = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];

// Stage → chip tone. The six-colour ramp the old StageBadge carried
// (neutral → warn → petrol → accent → warn → ok), expressed in the chip
// vocabulary instead of hand-mixed fg/bg token pairs. An unknown stage
// (indexOf → -1) still renders "—", exactly as StageBadge did.
const STAGE_TONES: ChipTone[] = ["mut", "warn", "pet", "acc", "warn", "ok"];

function StageChip({ stage }: { stage: string }) {
  const i = (STAGE_KEYS as readonly string[]).indexOf(stage);
  return <CellChip tone={STAGE_TONES[i] ?? "mut"}>{STAGE_LABELS[i] ?? "—"}</CellChip>;
}

/**
 * A KPI delta as a chip. Replaces the old KPI primitive's trend icon + tinted
 * pill: the sign still carries the direction, and the tone carries good/bad.
 */
function deltaChip(v: number | null | undefined, suffix = "%"): { delta?: string; tone: ChipTone } {
  if (v == null) return { tone: "mut" };
  return { delta: `${v >= 0 ? "+" : ""}${v}${suffix}`, tone: v >= 0 ? "ok" : "bad" };
}

export default function DashboardPage() {
  const router = useRouter();
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
  const isVendor = user?.role === Role.VENDOR;
  const isRegionalManager = user?.role === Role.REGIONAL_MANAGER;
  // External loan-referral partner -- no book-of-business (see
  // Role.DEALER_PARTNER's docstring in app/enums.py). Must never render
  // this firm-wide operator dashboard; redirect to their own portal, same
  // pattern as isVendor below.
  const isDealerPartner = user?.role === Role.DEALER_PARTNER;
  const showOperatorPipeline = !isClient && !isBroker;

  useEffect(() => {
    if (isVendor) router.replace("/vendor/buckets");
    if (isDealerPartner) router.replace("/broker/ai-underwriter-leads");
  }, [isVendor, isDealerPartner, router]);

  const datelineDate = today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const datelineTime = today.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  // Agent (BROKER) gets the Funding Command Center — a sales-driven personal
  // dashboard distinct from the firm-wide operator view used by Super Admin /
  // Underwriter. The existing operator dashboard below stays as-is for them.
  if (isBroker) {
    return <AgentHomeView />;
  }
  if (isVendor) {
    return null;
  }
  if (isDealerPartner) {
    return null;
  }

  const closingSoon = loans
    .filter((l) => l.stage === "closing" || l.stage === "processing")
    .slice(0, 5);

  return (
    <CG>
      {/* Greeting + header action buttons */}
      <div className="s12">
        <div className="lbl">
          {datelineDate} · {datelineTime} ET
        </div>
        <PageHeader
          title={firstName ? `${greeting}, ${firstName}.` : greeting + "."}
          lede={`${highPriority.length} high-priority items, ${todayEvents.length} events today, ${inFlight.length} loans in flight.`}
          actions={
            !isClient ? (
              <>
                <Link href="/pipeline" className="btn">
                  <Icon name="layers" size={14} /> Open Pipeline
                </Link>
                <Link href="/ai-inbox" className="btn pri">
                  <Icon name="bolt" size={14} /> Review AI Tasks
                </Link>
              </>
            ) : undefined
          }
        />
      </div>

      {/* KPI row — operator-only. Borrowers don't need (and shouldn't see)
          firm-wide funded/pipeline/pull-through metrics. */}
      {!isClient && (
        <KpiRow className="s12">
          <Kpi
            label="Funded YTD"
            value={report ? QC_FMT.short(report.funded_ytd) : "—"}
            sub="vs. prior year"
            {...deltaChip(report?.funded_ytd_delta)}
          />
          <Kpi
            label="Pipeline"
            value={report ? QC_FMT.short(report.pipeline_value) : "—"}
            sub={report ? `${report.pipeline_count} loans` : undefined}
          />
          <Kpi
            label="Avg close"
            value={report?.avg_close_days ? `${report.avg_close_days}d` : "—"}
            sub="from app to wire"
            {...deltaChip(report?.avg_close_delta, "d")}
          />
          <Kpi
            label="Pull-through"
            value={report?.pull_through != null ? `${(report.pull_through * 100).toFixed(0)}%` : "—"}
            sub="last 90d"
            {...deltaChip(
              report?.pull_through_delta != null ? Math.round(report.pull_through_delta * 100) : null,
            )}
          />
        </KpiRow>
      )}

      <TodaysOverduePanel tasks={tasks} events={events} loans={loans} isClient={isClient} />

      {/* Today's Market Rates — for all roles (ported from mobile dashboard) */}
      <TodaysMarketRates />

      {/* Pro Terms Lock/Unlock — clients only */}
      {isClient && <ProTermsCard userName={user?.name ?? ""} userEmail={user?.email ?? ""} />}

      {/* Pipeline at a glance + Today */}
      <Panel
        className="s7"
        title={isRegionalManager ? "Portfolio pipeline" : showOperatorPipeline ? "Pipeline at a glance" : "Your loans"}
        actions={
          <Link href="/pipeline" className="linky">
            View all <Icon name="arrowR" size={12} />
          </Link>
        }
      >
        {showOperatorPipeline ? (
          // Bespoke track: five stage counters always sit five-across, which is
          // narrower than `.kpis`' 150px auto-fit would allow. `.grid`/`.g10`
          // own display and gap; only the track is set here.
          <div className="grid g10" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
            {stageCounts.slice(0, 5).map((s, i) => (
              <Link key={s.stage} href="/pipeline" className="kpi">
                <div className="lbl">{STAGE_LABELS[i]}</div>
                <div className="knum num">{s.count}</div>
                <div className="sub num">{QC_FMT.short(Number(s.value))}</div>
              </Link>
            ))}
          </div>
        ) : (
          // Borrower/broker variant — mobile-style top-3 loan cards
          <BorrowerPipelineCards loans={loans} />
        )}

        <div className="lbl mt mb">Closing in next 14 days</div>
        <Table cols={CLOSING_COLS} caption="Loans closing in the next 14 days">
          {closingSoon.map((loan) => (
            // The row is clickable AND the deal id is a real link, so the row
            // stays reachable by keyboard — a bare <tr onClick> is not.
            <Tr key={loan.id} onClick={() => router.push(`/loans/${loan.id}`)}>
              <Td>
                <Link href={`/loans/${loan.id}`} className="linky num">
                  {loan.deal_id}
                </Link>
              </Td>
              <Td>
                <b>{loan.address}</b>
                <div className="sub">{loan.type.replace("_", " ")}</div>
              </Td>
              <Td align="r">
                <b className="num">{QC_FMT.short(Number(loan.amount))}</b>
              </Td>
              <Td>
                <StageChip stage={loan.stage} />
              </Td>
              <Td>
                <span className="sub">
                  {loan.close_date
                    ? `Close ${new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : "—"}
                </span>
              </Td>
            </Tr>
          ))}
          {inFlight.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <span className="sub">No loans in flight yet. Create one from the Pipeline page.</span>
              </Td>
            </Tr>
          )}
        </Table>
      </Panel>

      <Panel
        className="s5"
        title="Today"
        actions={
          <Link href="/calendar" className="linky">
            Calendar <Icon name="arrowR" size={12} />
          </Link>
        }
      >
        {/* Compact rates list — same FRED data as the full "Today's Market
            Rates" widget above, rendered tighter for the half-width column. */}
        <TodayRatesGrid />

        <div className="lbl mt mb">On the calendar</div>
        {todayEvents.length === 0 && <div className="sub">No events scheduled for today.</div>}
        {todayEvents.slice(0, 6).map((ev) => (
          <div key={ev.id} className={cx("itemrow", ev.priority === "high" && "flagged")}>
            <CellChip tone={eventTone(ev.kind)}>
              {new Date(ev.starts_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </CellChip>
            <div className="grow">
              <b>{ev.title}</b>
              <div className="sub">
                {ev.who ?? "—"}
                {ev.duration_min ? ` · ${ev.duration_min}m` : ""}
              </div>
            </div>
          </div>
        ))}
      </Panel>

      {/* Portfolio Health — borrower-facing only. Operators have their own
          KPI/exposure surfaces (Reports, Top Brokers, Pipeline). */}
      {isClient && <PortfolioHealth loans={loans} />}

      {/* AI tasks + Top brokers — operator-only. Borrowers don't have an
          AI-task queue and shouldn't see the broker leaderboard. */}
      {!isClient && (
        <>
          <Panel
            className="s6"
            title="Elara · pending approval"
            actions={
              <Link href="/ai-inbox" className="linky">
                Queue <Icon name="arrowR" size={12} />
              </Link>
            }
          >
            {tasks
              .filter((task) => task.status === "pending")
              .slice(0, 3)
              .map((task) => (
                <Link key={task.id} href="/ai-inbox" className="pick">
                  <Icon name="bolt" size={14} />
                  <div className="grow">
                    <div className="row">
                      <CellChip tone={task.priority === "high" ? "bad" : "mut"}>{task.priority}</CellChip>
                      <span className="tag">{task.source}</span>
                    </div>
                    <div>
                      <b>{task.title}</b>
                    </div>
                    <div className="sub">{task.summary}</div>
                  </div>
                </Link>
              ))}
            {tasks.filter((task) => task.status === "pending").length === 0 && (
              <div className="sub">Nothing pending — Elara is caught up.</div>
            )}
          </Panel>

          {isRegionalManager ? <RegionalAgentsPanel /> : <TopBrokersPanel />}
        </>
      )}
    </CG>
  );
}

const CLOSING_COLS: Col[] = [
  { label: "Deal", width: 96 },
  { label: "Property" },
  { label: "Amount", align: "r" },
  { label: "Stage" },
  { label: "Close" },
];

// Calendar-event kind → chip tone. Same four-way split the inline colour
// lookup made (closing = profit, doc = warn, ai = petrol, else = brand).
function eventTone(kind: string): ChipTone {
  return kind === "closing" ? "ok" : kind === "doc" ? "warn" : kind === "ai" ? "pet" : "acc";
}

function RegionalAgentsPanel() {
  return (
    <Panel
      className="s6"
      title="Regional portfolio"
      actions={
        <Link href="/regional-agents" className="linky">
          Agents <Icon name="arrowR" size={12} />
        </Link>
      }
    >
      <div className="sub">
        View your assigned agents, invite new agents, and monitor portfolio metrics.
      </div>
    </Panel>
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

// A falling rate is good news and a rising one is bad news, so the delta's
// sign picks the tone. Data-derived, but expressed as a tone rather than a
// colour so it stays inside the chip vocabulary.
function rateDeltaTone(delta: number | null | undefined): ChipTone {
  if (delta == null || delta === 0) return "mut";
  return delta < 0 ? "ok" : "bad";
}

// Compact rate list for the half-width "Today" panel.
// Reuses the same FRED series the wide widget shows; just a tighter
// layout (label + estimated rate + delta, no inline chart).
function TodayRatesGrid() {
  const { data: series = [] } = useFredSeries();
  const seriesById = new Map(series.map((s) => [s.series_id, s] as const));
  return (
    <>
      {PRODUCT_CARDS.map((card) => {
        const s = seriesById.get(card.series_id);
        const estimated = s?.estimated_rate;
        const delta = s?.delta_bps ?? null;
        return (
          <Link key={card.id} href="/market-rates" className="itemrow">
            <div className="grow">
              <div className="trunc">
                <b>{card.label}</b>
              </div>
              <div className="sub">{card.term}</div>
            </div>
            <b className="num">{estimated != null ? `${estimated.toFixed(2)}%` : "—"}</b>
            {delta != null && (
              <CellChip tone={rateDeltaTone(delta)}>
                {delta > 0 ? "+" : ""}
                {delta} bps
              </CellChip>
            )}
          </Link>
        );
      })}
    </>
  );
}

function TodaysMarketRates() {
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
      <Panel
        className="s12"
        title="Today's market rates"
        actions={
          <>
            {lastUpdated && (
              <span className="sub">
                FRED · updated{" "}
                {new Date(lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {isSuperAdmin && (
              <Btn
                size="sm"
                onClick={() => refreshFred.mutate()}
                disabled={refreshFred.isPending}
                title="Force a FRED pull now (normally runs via the morning cron)"
              >
                <Icon name="refresh" size={11} />
                {refreshFred.isPending ? "Pulling…" : "Refresh"}
              </Btn>
            )}
            <Link href="/market-rates" className="linky">
              view all <Icon name="arrowR" size={12} />
            </Link>
          </>
        }
      >
        {(isLoading || refreshFred.isPending) && !hasAnyData && !fredNotDeployed && (
          <div className="sub mb">
            {refreshFred.isPending ? "Pulling latest from FRED…" : "Loading rates…"}
          </div>
        )}

        {fredNotDeployed && (
          <Note className="mb">
            <div>
              <b>Market data not yet enabled.</b> The backend at this environment doesn&apos;t expose
              <code> /fred/series</code> yet — redeploy <code>qcbackend</code> to pick up the FRED router
              and run <code>alembic upgrade head</code> for the matching schema.
            </div>
          </Note>
        )}

        {!fredNotDeployed && !isLoading && !refreshFred.isPending && !hasAnyData && (
          <StatusLine tone="warn" className="mb">
            {isSuperAdmin ? (
              <>
                No FRED data yet — auto-pull failed. Check that <code>FRED_API_KEY</code> is set on
                the backend, then click <b>Refresh</b> above.
              </>
            ) : (
              <>Market data refreshing — check back shortly.</>
            )}
          </StatusLine>
        )}

        {refreshFred.error && (
          <StatusLine tone="bad" className="mb">
            FRED refresh failed: {refreshFred.error instanceof Error ? refreshFred.error.message : "unknown"}
          </StatusLine>
        )}

        {/* Bespoke track: the four product cards are a fixed four-across row,
            not an auto-fit one — they are read as a set. */}
        <div className="grid g10" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {PRODUCT_CARDS.map((card) => {
            const s = seriesById.get(card.series_id);
            return (
              <RateCard
                key={card.id}
                card={card}
                series={s}
                onClick={() => setActiveSeries(card.series_id)}
              />
            );
          })}
        </div>
      </Panel>
      <RateDetailModal
        seriesId={activeSeries}
        productLabel={PRODUCT_CARDS.find((c) => c.series_id === activeSeries)?.label ?? null}
        onClose={() => setActiveSeries(null)}
      />
    </>
  );
}

function RateCard({
  card,
  series,
  onClick,
}: {
  card: { id: string; label: string; term: string; sub: string; series_id: string };
  series: FredSeriesSummary | undefined;
  onClick: () => void;
}) {
  const hasData = !!series && series.current_value != null;
  const estimated = series?.estimated_rate;
  const indexValue = series?.current_value;
  const spreadBps = series?.spread_bps ?? 0;
  const delta = series?.delta_bps ?? null;
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
      className="kpi"
      // Button reset only — `.kpi` owns every visual property here. Same
      // shape FundingFileTab uses for its clickable `.card`.
      style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}
    >
      <div className="lbl">
        {card.label} · {card.term}
      </div>
      <div className="sub">{card.sub}</div>
      {hasEnoughHistory ? (
        // The chart's hover doesn't trigger the card's click on mouse-up —
        // FredChart's tooltip swallows pointer events but the chart svg
        // itself is inside the button, so a click anywhere on the card
        // (including over the chart) still opens the modal.
        <FredChart data={chartPoints} width={200} height={44} variant="compact" fill />
      ) : (
        // 44px reserved so a series without history keeps the tile the same
        // height as its neighbours — measured geometry, matched to the chart.
        <div className="sub" style={{ height: 44, display: "flex", alignItems: "center" }}>
          {hasData ? "Building chart history…" : "Awaiting first FRED pull"}
        </div>
      )}
      <div className="knum num">
        {estimated != null ? estimated.toFixed(3) : "—"}
        <span className="sub">%</span>
      </div>
      <div className="kdelta">
        <CellChip tone={rateDeltaTone(delta)}>{delta == null ? "—" : QC_FMT.bps(delta)}</CellChip>
      </div>
      <div className="sub num">
        {card.series_id} {indexValue != null ? `${indexValue.toFixed(2)}%` : "—"} +{" "}
        {(spreadBps / 100).toFixed(2)}% (spread)
      </div>
    </button>
  );
}

// ── Pro Terms Card (clients only) ──────────────────────────────────────────
function ProTermsCard({ userName, userEmail }: { userName: string; userEmail: string }) {
  const { data: credit } = useMyCredit();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"first" | "rerun" | "expired">("first");

  const unlocked = !!credit && !!credit.fico && !credit.is_expired;

  return (
    <>
      {/* The whole surface carries the state — a locked card is scanned, not
          read, and a badge inside a neutral card makes you read it. */}
      <Card className={cx("s12", unlocked ? "tone-ok" : "tone-bad")}>
        <div className="row">
          <Icon name={unlocked ? "unlock" : "lock"} size={20} stroke={2.4} />
          <div className="grow">
            <CellChip tone={unlocked ? "ok" : "bad"}>
              {unlocked ? "Pro Terms Unlocked" : "Pro Terms Locked"}
            </CellChip>
            {unlocked ? (
              <div className="sub">
                {creditTierLabel(credit.fico)} · valid through{" "}
                {credit.expires_at ? new Date(credit.expires_at).toLocaleDateString() : "—"}
              </div>
            ) : (
              <div className="sub">
                One soft pull unlocks all applications for 90 days · no score impact.
              </div>
            )}
          </div>
          {/* Solid danger while locked, not the tint: this is the primary
              conversion CTA on a borrower's dashboard and was solid-filled
              before the migration. */}
          <Btn
            className={unlocked ? undefined : "pri-bad"}
            onClick={() => {
              const next: "first" | "rerun" | "expired" = credit?.is_expired
                ? "expired"
                : unlocked
                  ? "rerun"
                  : "first";
              setMode(next);
              setOpen(true);
            }}
          >
            <Icon name={unlocked ? "refresh" : "lock"} size={14} />
            {unlocked ? "Re-run pull" : "Unlock Pro Terms · Soft Pull"}
          </Btn>
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

function creditTierLabel(fico: number | null | undefined): string {
  if (fico == null) return "Credit Not Verified";
  if (fico < 620) return "Below Threshold";
  if (fico < 720) return "Mid Credit";
  return "Strong Credit";
}

// ── Borrower / broker pipeline cards (mobile-style) ──────────────────────
function BorrowerPipelineCards({ loans }: { loans: Loan[] }) {
  if (loans.length === 0) {
    return <div className="sub">No loans yet.</div>;
  }
  return (
    // Bespoke track: always three across, matching the mobile card row.
    <div className="grid g10" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      {loans.slice(0, 3).map((l) => (
        <Link key={l.id} href={`/loans/${l.id}`} className="kpi">
          <div className="row">
            <span className="sub num">{l.deal_id}</span>
            <StageChip stage={l.stage} />
          </div>
          <div className="trunc">
            <b>{l.address}</b>
          </div>
          <div className="sub">
            {QC_FMT.short(Number(l.amount))} · {l.type.replace("_", " ")}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Portfolio Health ────────────────────────────────────────────────────
function PortfolioHealth({ loans }: { loans: Loan[] }) {
  const equityUnlocked = loans.reduce((s, l) => s + Number(l.amount) * 0.3, 0);
  const dscrLoans = loans.filter((l) => l.dscr != null);
  const globalDSCR =
    dscrLoans.length > 0
      ? dscrLoans.reduce((s, l) => s + Number(l.dscr ?? 0), 0) / dscrLoans.length
      : null;
  const activeLoans = loans.filter((l) => l.stage !== "funded").length;
  return (
    <Panel
      className="s12"
      title="Portfolio Health"
      actions={
        <Link
          href="/vault"
          className="linky"
          title="Manage properties, upload HUDs, and review your investor profile"
        >
          view all <Icon name="arrowR" size={12} />
        </Link>
      }
    >
      <KpiRow>
        <Stat label="Equity Unlocked" value={QC_FMT.short(equityUnlocked)} sub="estimated 30% of loan vol." />
        <Stat
          label="Global DSCR"
          value={globalDSCR != null ? globalDSCR.toFixed(2) : "—"}
          sub={dscrLoans.length > 0 ? `avg of ${dscrLoans.length} loans` : "no DSCR data"}
        />
        <Stat label="Active loans" value={String(activeLoans)} sub={`${loans.length - activeLoans} funded`} />
      </KpiRow>
    </Panel>
  );
}

/** Kept as its own name — it is the borrower-facing stat tile, now a `.kpi`. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Kpi label={label} value={value} sub={sub} />;
}

// ── Top brokers (replaces Top exposures) ─────────────────────────────────
function TopBrokersPanel() {
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
    <Panel
      className="s6"
      title="Top brokers"
      actions={
        <Link href="/rewards" className="linky">
          Leaderboard <Icon name="arrowR" size={12} />
        </Link>
      }
    >
      {sorted.map((b) => {
        const initials = (b.display_name ?? "?")
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("");
        return (
          <div key={b.id} className="itemrow">
            <span className="avatar">{initials}</span>
            <div className="grow">
              <b>{b.display_name}</b>
              <div className="sub">
                {b.tier ?? "—"}
                {b.funded_count != null ? ` · ${b.funded_count} loans` : ""}
                {b.lifetime_points != null ? ` · ${b.lifetime_points.toLocaleString()} pts` : ""}
              </div>
            </div>
            <div className="align-r">
              <b className="num">{QC_FMT.short(Number(b.funded_total ?? 0))}</b>
              <div className="sub">funded</div>
            </div>
          </div>
        );
      })}
      {sorted.length === 0 && <div className="sub">No brokers to show yet.</div>}
    </Panel>
  );
}

// ── Today's Overdue panel ────────────────────────────────────────────────

// Urgency → chip tone. Same three-way split the inline `urgencyStyle` helper
// made (danger / warn / neutral).
function urgencyTone(u: "overdue" | "today" | "soon"): ChipTone {
  return u === "overdue" ? "bad" : u === "today" ? "warn" : "mut";
}

function TodaysOverduePanel({
  tasks,
  events,
  loans,
  isClient,
}: {
  tasks: AITask[];
  events: CalendarEvent[];
  loans: Loan[];
  isClient: boolean;
}) {
  const now = Date.now();
  const todayEnd = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();
  const loansByLoanId = Object.fromEntries(loans.map((l) => [l.id, l]));

  // Borrower-facing item wiring. Each "needs attention" item names the
  // loan file it belongs to, and clicking it deep-links into the client
  // file modal on the relevant tab (documents for tasks, schedule for
  // events) rather than the operator surfaces.
  const loanLabel = (loanId: string | null | undefined): string | null => {
    if (!loanId) return null;
    const ln = loansByLoanId[loanId];
    if (!ln) return null;
    return ln.address ? `${ln.deal_id} · ${ln.address}` : ln.deal_id;
  };
  const clientHref = (loanId: string | null | undefined, tab: string): string =>
    loanId && loansByLoanId[loanId]
      ? `/pipeline?file=${loanId}&tab=${tab}`
      : "/pipeline";
  // Route the deep-link by what the item is ABOUT, not just task-vs-event.
  // A calendar event of kind "doc" (a document-due reminder) and a task
  // from the documents source both open the Documents tab — only genuine
  // schedule items (calls, inspections, closings) open Schedule.
  const tabForEvent = (kind: string): string =>
    kind === "doc" ? "documents" : "schedule";
  const tabForTask = (source: string): string =>
    source === "calendar" ? "schedule" : "documents";

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
    const evWhen = `${new Date(ev.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${ev.who ? ` · ${ev.who}` : ""}`;
    const evFile = loanLabel(ev.loan_id);
    items.push({
      key: `ev-${ev.id}`,
      kind: "event",
      urgency,
      label: ev.title,
      sub: isClient && evFile ? `${evFile} · ${evWhen}` : evWhen,
      href: isClient
        ? clientHref(ev.loan_id, tabForEvent(ev.kind))
        : ev.loan_id ? `/loans/${ev.loan_id}` : "/calendar",
    });
  }

  for (const task of tasks) {
    if (task.priority !== "high" || task.status !== "pending") continue;
    const ageH = (now - new Date(task.created_at).getTime()) / (1000 * 60 * 60);
    let urgency: "overdue" | "today" | "soon" = "soon";
    if (ageH > 8) urgency = "overdue";
    else if (ageH > 2) urgency = "today";
    const taskFile = loanLabel(task.loan_id);
    items.push({
      key: `task-${task.id}`,
      kind: "task",
      urgency,
      label: task.title,
      // Borrower view names the file plainly; operators keep the
      // source/confidence diagnostics.
      sub: isClient
        ? taskFile ?? "Your file"
        : `${task.source} · conf ${(task.confidence * 100).toFixed(0)}%${task.loan_id && loansByLoanId[task.loan_id] ? ` · ${loansByLoanId[task.loan_id].deal_id}` : ""}`,
      href: isClient ? clientHref(task.loan_id, tabForTask(task.source)) : "/ai-inbox",
    });
  }

  const order = { overdue: 0, today: 1, soon: 2 } as const;
  const ranked = items.sort((a, b) => order[a.urgency] - order[b.urgency]).slice(0, 6);
  if (ranked.length === 0) return null;

  const overdueCount = items.filter((i) => i.urgency === "overdue").length;
  const todayCount = items.filter((i) => i.urgency === "today").length;

  return (
    // The card itself carries the worst state on it, so the panel is legible
    // at a glance rather than only after reading the counts.
    <Card className={cx("s12", overdueCount > 0 ? "tone-bad" : "tone-warn")}>
      <div className="row mb">
        <Icon name="bell" size={16} stroke={2.4} />
        <div className="grow">
          <CellChip tone={overdueCount > 0 ? "bad" : "warn"}>Needs attention</CellChip>
          <div className="sub">
            {overdueCount > 0 && (
              <span>
                <b>{overdueCount} overdue</b> ·{" "}
              </span>
            )}
            {todayCount > 0 && (
              <span>
                <b>{todayCount} due today</b> ·{" "}
              </span>
            )}
            {ranked.length} actionable item{ranked.length > 1 ? "s" : ""} surfaced.
          </div>
        </div>
        {isClient ? (
          <Link href="/pipeline" className="btn sm">
            My Files <Icon name="chevR" size={11} />
          </Link>
        ) : (
          <Link href="/ai-inbox" className="btn sm">
            Elara Inbox <Icon name="chevR" size={11} />
          </Link>
        )}
      </div>
      {ranked.map((item) => (
        <Link key={item.key} href={item.href} className="pick">
          <CellChip tone={urgencyTone(item.urgency)}>{item.urgency}</CellChip>
          <div className="grow">
            <div className="trunc">
              <b>{item.label}</b>
            </div>
            <div className="sub">{item.sub}</div>
          </div>
          <Icon name="chevR" size={13} />
        </Link>
      ))}
    </Card>
  );
}
