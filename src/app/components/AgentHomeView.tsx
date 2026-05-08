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
import { useMemo } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { useCurrentUser, useLoans } from "@/hooks/useApi";
import type { Loan } from "@/lib/types";

const PLACEHOLDER = "—";

export function AgentHomeView() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();

  // TODO(P0A backend): replace client-side loan filtering with server-side
  // useLoans({ scope: "mine" }). This is demo-only. Do not ship to production
  // with firm-wide loans pulled into Agent browsers — both a privacy issue
  // (Agents see other Agents' books in DevTools) and a scale issue (the whole
  // firm's pipeline gets serialized to every Agent on every dashboard load).
  const myLoans: Loan[] = useMemo(() => {
    if (!user) return [];
    return loans.filter((l) => l.broker_id === user.id);
  }, [loans, user]);

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
        <KPI label="Leads This Week" value={PLACEHOLDER} sub="Awaiting backend" icon="user" />
        <KPI label="Contacted" value={PLACEHOLDER} sub="Awaiting backend" icon="chat" />
        <KPI label="Intake Completion" value={PLACEHOLDER} deltaSuffix="%" sub="Awaiting backend" icon="audit" />
        <KPI label="Prequal Conversion" value={PLACEHOLDER} deltaSuffix="%" sub="Awaiting backend" icon="check" />
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
        <KPI label="Lead → Prequal" value={PLACEHOLDER} sub="Avg days · awaiting backend" icon="audit" />
        <KPI label="Prequal → Funded" value={PLACEHOLDER} sub="Avg days · awaiting backend" icon="audit" />
        <KPI label="Stale Leads" value={PLACEHOLDER} sub="No movement 7d+ · awaiting backend" icon="bell" accent={t.warn} />
      </div>

      {/* Action queue — Next Best Actions + blockers. Real engine is P1; P0A
          shows the empty/awaiting state so the surface exists in the layout. */}
      <SectionLabel action={<Link href="/ai-inbox" style={{ color: t.petrol, textDecoration: "none" }}>View inbox →</Link>}>
        Next Best Actions
      </SectionLabel>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ink3, fontSize: 13 }}>
            <Icon name="spark" size={14} />
            The Next Best Action engine is P1. It will surface contextual tasks here based on
            engagement signals, missing documents, and deal-readiness gaps.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Pill bg={t.warnBg} color={t.warn}>{atRisk.length} at-risk loans</Pill>
            <Pill bg={t.chip} color={t.ink2}>{closing.length} closing this period</Pill>
            <Pill bg={t.petrolSoft} color={t.petrol}>0 follow-ups awaiting approval</Pill>
          </div>
        </div>
      </Card>

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
