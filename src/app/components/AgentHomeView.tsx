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
//
// Restyled onto the class design system: the sections that were SectionLabel +
// bare Card are now Panels, the tiles are `.kpi`, and every state colour that
// used to be a token lookup is a chip tone. No data flow changed.

import Link from "next/link";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
import { CG, Callout, CellChip, Kpi, KpiRow, PageHeader, Panel, cx, type ChipTone } from "@/components/ds";
import {
  useAdminPrequalQueue,
  useCurrentUser,
  useLeadFunnel,
  useLoans,
  useNextActions,
  type FunnelStat,
  type NextAction,
} from "@/hooks/useApi";

const PLACEHOLDER = "—";

// Stage → label + chip tone. Mirrors the six-step ramp the old StageBadge
// carried (neutral → warn → petrol → accent → warn → ok) in the chip
// vocabulary, so a stage reads the same here as it does in a table cell.
// An unknown stage (indexOf → -1) falls through to "—" / mut, exactly as
// StageBadge's `STAGE_LABELS[stage] ?? "—"` did.
const STAGE_KEYS = [
  "prequalified",
  "collecting_docs",
  "lender_connected",
  "processing",
  "closing",
  "funded",
];
const STAGE_LABELS = [
  "Prequalified",
  "Collecting Docs",
  "Lender Connected",
  "Processing",
  "Closing",
  "Funded",
];
const STAGE_TONES: ChipTone[] = ["mut", "warn", "pet", "acc", "warn", "ok"];

function StageChip({ stage }: { stage: string }) {
  const i = STAGE_KEYS.indexOf(stage);
  return <CellChip tone={STAGE_TONES[i] ?? "mut"}>{STAGE_LABELS[i] ?? "—"}</CellChip>;
}

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
  const { data: prequalRequests = [] } = useAdminPrequalQueue();

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
  const pendingPrequals = prequalRequests.filter((r) => r.status === "pending").length;
  const approvedPrequals = prequalRequests.filter((r) => r.status === "approved").length;

  return (
    <CG>
      {/* Greeting */}
      <div className="s12">
        <div className="lbl">Dashboard</div>
        <PageHeader
          title={`${greeting}${firstName ? `, ${firstName}` : ""}.`}
          lede={dateline}
          actions={
            <Link href="/pipeline?new=1" className="btn pri">
              <Icon name="plus" size={13} /> Add Lead
            </Link>
          }
        />
      </div>

      {/* Funnel KPIs — leads added / contacted / intake / conversion. Mocked
          for P0A; populated by backend funnel rollups in P0B. */}
      <Panel className="s12" title="My Funnel">
        <KpiRow>
          <Kpi
            label="Leads This Week"
            value={funnel?.leads_this_week ?? PLACEHOLDER}
            sub="New leads added in last 7d"
          />
          <Kpi
            label="Contacted"
            value={funnel?.contacted ?? PLACEHOLDER}
            sub="Clients past initial outreach"
          />
          <Kpi
            label="Intake Completion"
            value={fmtPct(funnel?.intake_completion)}
            sub={sampleSub(funnel?.intake_completion)}
          />
          <Kpi
            label="Prequal Conversion"
            value={fmtPct(funnel?.prequal_conversion)}
            sub={sampleSub(funnel?.prequal_conversion)}
          />
        </KpiRow>
      </Panel>

      <Panel className="s12" title="Prequalifications">
        {/* Both tiles are links into the prequal queue filtered by status, so
            they are anchors carrying `.kpi` rather than the Kpi component,
            which renders a div. The state-tinted corner icon is the signal —
            the same one the primitive carried via its `accent` prop. */}
        <KpiRow>
          <Link href="/admin/prequal-requests?status=pending" className="kpi">
            <div className="kpi-h">
              <span className="lbl">Pending Prequals</span>
              <span className={cx("kpi-i", pendingPrequals ? "c-warn" : "c-mut")}>
                <Icon name="docCheck" size={14} />
              </span>
            </div>
            <div className="knum num">{pendingPrequals}</div>
            <div className="sub">Awaiting funding review</div>
          </Link>
          <Link href="/admin/prequal-requests?status=approved" className="kpi">
            <div className="kpi-h">
              <span className="lbl">Approved Prequals</span>
              <span className={cx("kpi-i", approvedPrequals ? "c-ok" : "c-mut")}>
                <Icon name="check" size={14} />
              </span>
            </div>
            <div className="knum num">{approvedPrequals}</div>
            <div className="sub">Letters issued</div>
          </Link>
        </KpiRow>
      </Panel>

      {/* Active state — pulled from current Loans list filtered to broker_id */}
      <Panel className="s12" title="My Book">
        <KpiRow>
          <Kpi label="In-Flight Loans" value={inFlight.length} sub={QC_FMT.short(inFlightVolume)} />
          <Kpi label="Under Contract" value={underContract.length} />
          <Kpi label="Closing" value={closing.length} />
          <Kpi label="Funded YTD" value={QC_FMT.short(fundedVolume)} sub={`${funded.length} loans`} />
        </KpiRow>
      </Panel>

      {/* Velocity — placeholders for P0A */}
      <Panel className="s12" title="Velocity">
        <KpiRow>
          <Kpi
            label="Lead → Prequal"
            value={fmtDays(funnel?.lead_to_prequal)}
            sub={sampleSub(funnel?.lead_to_prequal)}
          />
          <Kpi
            label="Prequal → Funded"
            value={fmtDays(funnel?.prequal_to_funded)}
            sub={sampleSub(funnel?.prequal_to_funded)}
          />
          {/* The amber accent on this tile was the whole point of it — a stale
              lead is a warning, not a statistic. It moves to the chip tone. */}
          <Kpi
            label="Stale Leads"
            value={funnel?.stale_lead_count ?? PLACEHOLDER}
            sub="No movement 7d+"
            delta="stale"
            tone="warn"
          />
        </KpiRow>
      </Panel>

      {/* Action queue — Next Best Actions + blockers. Real engine is P1; P0A
          shows the empty/awaiting state so the surface exists in the layout. */}
      <Panel
        className="s12"
        title="Next Best Actions"
        actions={
          <Link href="/ai-inbox" className="linky">
            View inbox →
          </Link>
        }
      >
        {nextActions.length === 0 ? (
          <Callout tone="acc" icon={<Icon name="check" size={16} />}>
            <b>All caught up — nothing urgent.</b>
            <div className="sub">
              Stale leads, overdue docs, and closing-soon files will surface here as they need
              attention.
            </div>
          </Callout>
        ) : (
          <div>
            {nextActions.map((a) => (
              <NbaRow key={a.id} action={a} />
            ))}
          </div>
        )}
        <div className="row mt">
          <CellChip tone="warn">{atRisk.length} at-risk loans</CellChip>
          <CellChip tone="mut">{closing.length} closing this period</CellChip>
        </div>
      </Panel>

      {/* Recent loans on my book */}
      <Panel
        className="s12"
        title="My Pipeline"
        actions={
          <Link href="/pipeline" className="linky">
            Open pipeline →
          </Link>
        }
      >
        {inFlight.length === 0 ? (
          <div className="sub">No in-flight loans yet. Add a Lead to start a deal.</div>
        ) : (
          <div>
            {inFlight.slice(0, 6).map((l) => (
              // `.pick` rather than a table row: these were already links, and
              // a <tr onClick> is neither focusable nor Enter-activatable.
              <Link key={l.id} href={`/loans/${l.id}`} className="pick">
                <div className="grow">
                  <div className="trunc">
                    <b>{l.address}</b>
                  </div>
                  <div className="sub">
                    {l.type.replace(/_/g, " ")} · {QC_FMT.short(Number(l.amount))}
                  </div>
                </div>
                <StageChip stage={l.stage} />
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </CG>
  );
}

const KIND_ICON: Record<NextAction["kind"], string> = {
  call_lead: "user",
  chase_doc: "doc",
  closing_prep: "cal",
  pending_task: "spark",
};

// Priority → chip tone. Replaces the hand-mixed fg/bg token pairs
// (danger / warn / ink3 over dangerBg / warnBg / surface2).
function priorityTone(priority: NextAction["priority"]): ChipTone {
  return priority === "high" ? "bad" : priority === "medium" ? "warn" : "mut";
}

function NbaRow({ action }: { action: NextAction }) {
  const tone = priorityTone(action.priority);
  return (
    <Link href={action.deeplink} className="pick">
      <Icon name={KIND_ICON[action.kind] as never} size={14} />
      <div className="grow">
        <div className="trunc">
          <b>{action.title}</b>
        </div>
        <div className="sub">{action.subtitle}</div>
      </div>
      <CellChip tone={tone}>{action.priority}</CellChip>
      <Icon name="chevR" size={13} />
    </Link>
  );
}
