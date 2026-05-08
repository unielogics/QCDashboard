"use client";

// AgentHomeView — sales-driven personal dashboard for the Agent (BROKER role).
//
// This is the first user-visible surface of the Agent Funding Command Center.
// It replaces the firm-wide operator dashboard for Agents with a personal,
// closing-oriented view that answers "who do I call today, who's ready, who's
// stuck, who can close this month?"
//
// P0A scope: layout + KPIs + NBA + recent activity sections render. Real
// counts come from the existing useLoans hook filtered to the Agent's book;
// funnel-stage KPIs (leads/intake/conversion) are mocked until the Lead
// table and the agent-scoped backend endpoints land. Mocked values are
// labelled "—" so they don't read as real numbers in screenshots.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  useCurrentUser,
  useLeadFunnel,
  useLoans,
  useNextActions,
  type FunnelStat,
  type NextAction,
} from "@/hooks/useApi";

const PLACEHOLDER = "—";

function fmtPct(stat: FunnelStat | undefined): string {
  if (!stat || stat.value == null) return PLACEHOLDER;
  return `${Math.round(stat.value)}%`;
}

function fmtDays(stat: FunnelStat | undefined): string {
  if (!stat || stat.value == null) return PLACEHOLDER;
  return `${stat.value.toFixed(1)}d`;
}

function sampleSub(stat: FunnelStat | undefined): string {
  if (!stat || stat.sample_size === 0) return "Awaiting data";
  return `Based on ${stat.sample_size} ${stat.sample_size === 1 ? "loan" : "loans"}`;
}

export function AgentHomeView() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  // Scope assertion is now hook-driven — `useLoans("mine")` adds `?scope=mine`
  // to the request so the backend filters to this Agent's book before sending.
  // The earlier client-side `broker_id === user.id` filter was demo-only and
  // is intentionally NOT used here: it leaked firm-wide pipeline through
  // DevTools and didn't scale.
  //
  // TODO(production blocker): backend must enforce `?scope=mine` server-side
  // — today the Loans endpoint may still return firm-wide rows even with the
  // query param set. Verify in qcbackend before this view is allowed in prod.
  const { data: myLoans = [] } = useLoans("mine");
  const { data: funnel } = useLeadFunnel();
  const { data: nextActions = [] } = useNextActions();

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
  const dateline = today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const inFlight = myLoans.filter((l) => l.stage !== "funded");
  const underContract = myLoans.filter(
    (l) => l.stage === "lender_connected" || l.stage === "processing",
  );
  const closing = myLoans.filter((l) => l.stage === "closing");
  const funded = myLoans.filter((l) => l.stage === "funded");
  const fundedVolume = funded.reduce((s, l) => s + Number(l.amount || 0), 0);
  const inFlightVolume = inFlight.reduce((s, l) => s + Number(l.amount || 0), 0);
  const atRisk = myLoans.filter((l) => l.deal_health === "at_risk" || l.deal_health === "stuck");

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
      {/* Greeting */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
            Dashboard
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, color: t.ink, margin: "4px 0 0" }}>
            {greeting}{firstName ? `, ${firstName}` : ""}.
          </h1>
          <div style={{ color: t.ink3, fontSize: 13, marginTop: 4 }}>{dateline}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/leads" style={{ ...qcBtnPrimary(t), textDecoration: "none" }}>
            <Icon name="plus" size={13} /> Add Lead
          </Link>
        </div>
      </div>

      {/* Funnel KPIs — leads added / contacted / intake / conversion. Mocked
          for P0A; populated by backend funnel rollups in P0B. */}
      <SectionLabel>My Funnel</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <KPI
          label="Leads This Week"
          value={funnel?.leads_this_week ?? PLACEHOLDER}
          sub="New leads added in last 7d"
          icon="user"
        />
        <KPI
          label="Contacted"
          value={funnel?.contacted ?? PLACEHOLDER}
          sub="Clients past initial outreach"
          icon="chat"
        />
        <KPI
          label="Intake Completion"
          value={fmtPct(funnel?.intake_completion)}
          sub={sampleSub(funnel?.intake_completion)}
          icon="audit"
        />
        <KPI
          label="Prequal Conversion"
          value={fmtPct(funnel?.prequal_conversion)}
          sub={sampleSub(funnel?.prequal_conversion)}
          icon="check"
        />
      </div>

      {/* Active state — pulled from current Loans list filtered to broker_id */}
      <SectionLabel>My Book</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <KPI label="In-Flight Loans" value={inFlight.length} sub={QC_FMT.short(inFlightVolume)} icon="dollar" />
        <KPI label="Under Contract" value={underContract.length} icon="doc" />
        <KPI label="Closing" value={closing.length} icon="cal" />
        <KPI label="Funded YTD" value={QC_FMT.short(fundedVolume)} sub={`${funded.length} loans`} icon="trophy" />
      </div>

      {/* Velocity — placeholders for P0A */}
      <SectionLabel>Velocity</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <KPI
          label="Lead → Prequal"
          value={fmtDays(funnel?.lead_to_prequal)}
          sub={sampleSub(funnel?.lead_to_prequal)}
          icon="audit"
        />
        <KPI
          label="Prequal → Funded"
          value={fmtDays(funnel?.prequal_to_funded)}
          sub={sampleSub(funnel?.prequal_to_funded)}
          icon="audit"
        />
        <KPI
          label="Stale Leads"
          value={funnel?.stale_lead_count ?? PLACEHOLDER}
          sub="No movement 7d+"
          icon="bell"
          accent={t.warn}
        />
      </div>

      {/* Action queue — Next Best Actions + blockers. Real engine is P1; P0A
          shows the empty/awaiting state so the surface exists in the layout. */}
      <SectionLabel action={<Link href="/ai-inbox" style={{ color: t.petrol, textDecoration: "none" }}>View inbox →</Link>}>
        Next Best Actions
      </SectionLabel>
      <Card pad={0}>
        {nextActions.length === 0 ? (
          <div style={{ padding: 20, color: t.ink3, fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, color: t.ink, marginBottom: 4 }}>
              All caught up — nothing urgent.
            </div>
            Stale leads, overdue docs, and closing-soon files will surface here as they
            need attention.
          </div>
        ) : (
          <div>
            {nextActions.map((a) => (
              <NbaRow key={a.id} action={a} t={t} />
            ))}
          </div>
        )}
      </Card>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Pill bg={t.warnBg} color={t.warn}>{atRisk.length} at-risk loans</Pill>
        <Pill bg={t.chip} color={t.ink2}>{closing.length} closing this period</Pill>
      </div>

      {/* Recent loans on my book */}
      <SectionLabel action={<Link href="/pipeline" style={{ color: t.petrol, textDecoration: "none" }}>Open pipeline →</Link>}>
        My Pipeline
      </SectionLabel>
      <Card pad={0}>
        {inFlight.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: t.ink3, fontSize: 13 }}>
            No in-flight loans yet. Add a Lead to start a deal.
          </div>
        ) : (
          <div>
            {inFlight.slice(0, 6).map((l) => (
              <Link
                key={l.id}
                href={`/loans/${l.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  borderBottom: `1px solid ${t.line}`,
                  textDecoration: "none",
                  color: t.ink,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.address}
                  </div>
                  <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
                    {l.type.replace(/_/g, " ")} · {QC_FMT.short(Number(l.amount))}
                  </div>
                </div>
                <StageBadge stage={["prequalified","collecting_docs","lender_connected","processing","closing","funded"].indexOf(l.stage)} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const KIND_ICON: Record<NextAction["kind"], string> = {
  call_lead: "user",
  chase_doc: "doc",
  closing_prep: "cal",
  pending_task: "spark",
};

function NbaRow({ action, t }: { action: NextAction; t: ReturnType<typeof useTheme>["t"] }) {
  const priorityFg =
    action.priority === "high" ? t.danger :
    action.priority === "medium" ? t.warn :
    t.ink3;
  const priorityBg =
    action.priority === "high" ? t.dangerBg :
    action.priority === "medium" ? t.warnBg :
    t.surface2;
  return (
    <Link
      href={action.deeplink}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: `1px solid ${t.line}`,
        textDecoration: "none",
        color: t.ink,
      }}
    >
      <div
        style={{
          width: 30, height: 30, borderRadius: 8,
          background: priorityBg, color: priorityFg,
          display: "flex", alignItems: "center", justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        <Icon name={KIND_ICON[action.kind] as never} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: t.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {action.title}
        </div>
        <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 1 }}>
          {action.subtitle}
        </div>
      </div>
      <Pill bg={priorityBg} color={priorityFg}>{action.priority}</Pill>
      <Icon name="chevR" size={13} style={{ color: t.ink4 }} />
    </Link>
  );
}
