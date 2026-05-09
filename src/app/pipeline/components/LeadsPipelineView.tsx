"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, Pill } from "@/components/design-system/primitives";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { QC_FMT } from "@/components/design-system/tokens";
import { useClients, useLoans } from "@/hooks/useApi";
import type { Client, ClientStage, ClientType, Loan } from "@/lib/types";

const RELATIONSHIP_STAGES = [
  "lead",
  "contacted",
  "verified",
  "ready_for_lending",
  "processing",
  "funded",
] as const;

const STAGE_LABELS: Record<(typeof RELATIONSHIP_STAGES)[number], string> = {
  lead: "New",
  contacted: "Nurturing",
  verified: "Qualified",
  ready_for_lending: "Handoff",
  processing: "Funding",
  funded: "Closed",
};

const STAGE_SUBTITLES: Record<(typeof RELATIONSHIP_STAGES)[number], string> = {
  lead: "Relationship opened",
  contacted: "Needs agent follow-up",
  verified: "Ready for funding review",
  ready_for_lending: "Funding team intake",
  processing: "Conditions and updates",
  funded: "Post-close relationship",
};

function inferStage(c: Client, activeLoans: number): ClientStage {
  if (c.stage) return c.stage;
  if (c.funded_count > 0) return "funded";
  if (activeLoans > 0) return "processing";
  return "lead";
}

function isPipelineStage(s: ClientStage): s is (typeof RELATIONSHIP_STAGES)[number] {
  return (RELATIONSHIP_STAGES as readonly ClientStage[]).includes(s);
}

function clientSide(c: Client): ClientType {
  return c.client_type ?? "buyer";
}

function workflowLabel(type: ClientType) {
  return type === "seller" ? "Seller relationship" : "Buyer relationship";
}

function readinessLabel(client: Client, stage: ClientStage) {
  if (stage === "funded") return "Closed relationship";
  if (stage === "processing") return "Funding active";
  if (stage === "ready_for_lending") return "Submitted to funding";
  if (stage === "verified") return "Qualified for handoff";
  if (client.fico && client.fico >= 680) return "Credit profile strong";
  if (client.fico) return "Credit needs review";
  return "Profile incomplete";
}

function nextMove(client: Client, stage: ClientStage) {
  const type = clientSide(client);
  if (type === "seller") {
    if (stage === "lead") return "Confirm sell-side timeline and property facts.";
    if (stage === "contacted") return "Collect listing goals, payoff, and target net.";
    if (stage === "verified") return "Package seller context for buyer financing or listing prep.";
    if (stage === "ready_for_lending") return "Track funding handoff and keep seller updated.";
    if (stage === "processing") return "Coordinate offer, conditions, and close logistics.";
    if (stage === "funded") return "Log outcome and schedule post-close follow-up.";
  }
  if (stage === "lead") return "Confirm buy box, budget, and target purchase timeline.";
  if (stage === "contacted") return "Send intake, soft-pull consent, and document request.";
  if (stage === "verified") return "Review financing readiness before funding handoff.";
  if (stage === "ready_for_lending") return "Monitor funding team's criteria review.";
  if (stage === "processing") return "Help borrower clear conditions and seller deadlines.";
  if (stage === "funded") return "Capture next purchase goal and referral opportunity.";
  return "Review relationship status.";
}

interface EnrichedClient extends Client {
  _stage: (typeof RELATIONSHIP_STAGES)[number];
  _activeLoans: Loan[];
  _activeLoanCount: number;
  _activeLoanValue: number;
}

interface Props {
  view: "kanban" | "table";
  search: string;
}

export function LeadsPipelineView({ view, search }: Props) {
  const { t } = useTheme();
  const { data: clients = [] } = useClients("mine");
  const { data: loans = [] } = useLoans("mine");

  const enriched = useMemo<EnrichedClient[]>(() => {
    const loansByClient = new Map<string, Loan[]>();
    for (const loan of loans) {
      if (loan.stage === "funded") continue;
      const rows = loansByClient.get(loan.client_id) ?? [];
      rows.push(loan);
      loansByClient.set(loan.client_id, rows);
    }
    return clients
      .map((client) => {
        const activeLoans = loansByClient.get(client.id) ?? [];
        const stage = inferStage(client, activeLoans.length);
        return {
          ...client,
          _stage: isPipelineStage(stage) ? stage : "lead",
          _activeLoans: activeLoans,
          _activeLoanCount: activeLoans.length,
          _activeLoanValue: activeLoans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0),
        };
      })
      .filter((client) => client._stage !== "funded" || client.funded_count > 0)
      .sort((a, b) => {
        const stageDelta = RELATIONSHIP_STAGES.indexOf(a._stage) - RELATIONSHIP_STAGES.indexOf(b._stage);
        if (stageDelta !== 0) return stageDelta;
        return a.name.localeCompare(b.name);
      });
  }, [clients, loans]);

  const visible = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.trim().toLowerCase();
    return enriched.filter(
      (client) =>
        client.name.toLowerCase().includes(q) ||
        (client.email ?? "").toLowerCase().includes(q) ||
        (client.city ?? "").toLowerCase().includes(q),
    );
  }, [enriched, search]);

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: t.ink3 }}>
        {visible.length} {visible.length === 1 ? "relationship" : "relationships"}
        {search ? ` matching "${search}"` : ""}
      </div>
    </div>
  );

  if (view === "table") {
    return (
      <>
        {header}
        <Card pad={0}>
          <div style={{ padding: 16, borderBottom: `1px solid ${t.line}`, background: t.surface2 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: t.ink3, textTransform: "uppercase" }}>
              Agent Relationship Pipeline
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: t.ink2 }}>
              Buyer and seller work stays agent-owned here. Funding files open only after handoff.
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.45fr) 132px 150px 150px minmax(220px, 1fr)",
              gap: 12,
              padding: "12px 16px",
              fontSize: 11,
              fontWeight: 700,
              color: t.ink3,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              borderBottom: `1px solid ${t.line}`,
            }}
          >
            <div>Relationship</div>
            <div>Workflow</div>
            <div>Readiness</div>
            <div>Funding File</div>
            <div>Next Agent Move</div>
          </div>
          {visible.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}/workspace`}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.45fr) 132px 150px 150px minmax(220px, 1fr)",
                gap: 12,
                padding: "14px 16px",
                borderBottom: `1px solid ${t.line}`,
                alignItems: "center",
                fontSize: 13,
                color: t.ink,
                textDecoration: "none",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {client.name}
                  </div>
                  <SidePill type={clientSide(client)} />
                </div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: t.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {client.email ?? "No email"}{client.city ? ` · ${client.city}` : ""}
                </div>
              </div>
              <StagePill stage={client._stage} />
              <div>
                <div style={{ fontWeight: 700, color: t.ink2 }}>{readinessLabel(client, client._stage)}</div>
                <div style={{ marginTop: 2, color: t.ink3, fontSize: 11.5 }}>
                  FICO {client.fico ?? "not pulled"}
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 800, color: client._activeLoanCount > 0 ? t.ink : t.ink3 }}>
                  {client._activeLoanCount > 0 ? `${client._activeLoanCount} active` : "No file"}
                </div>
                <div style={{ marginTop: 2, color: t.ink3, fontSize: 11.5 }}>
                  {client._activeLoanValue > 0 ? QC_FMT.short(client._activeLoanValue) : "Agent owned"}
                </div>
              </div>
              <div style={{ color: t.ink2, lineHeight: 1.35 }}>{nextMove(client, client._stage)}</div>
            </Link>
          ))}
          {visible.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: t.ink3 }}>
              {search ? `No relationships match "${search}".` : "No active relationships in the pipeline right now."}
            </div>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(150px, 1fr))", gap: 12 }}>
        {RELATIONSHIP_STAGES.map((stage) => {
          const stageClients = visible.filter((client) => client._stage === stage);
          return (
            <div
              key={stage}
              style={{
                background: t.surface2,
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${t.line}`,
                minWidth: 0,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                <div>
                  <StagePill stage={stage} />
                  <div style={{ marginTop: 5, fontSize: 11.5, color: t.ink3 }}>{STAGE_SUBTITLES[stage]}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.ink3 }}>{stageClients.length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stageClients.map((client) => (
                  <Link
                    key={client.id}
                    href={`/clients/${client.id}/workspace`}
                    style={{
                      background: t.surface,
                      padding: 11,
                      borderRadius: 10,
                      border: `1px solid ${t.line}`,
                      textDecoration: "none",
                      color: t.ink,
                      display: "block",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: t.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {client.name}
                      </div>
                      <SidePill type={clientSide(client)} />
                    </div>
                    <div style={{ marginTop: 7, fontSize: 11.5, color: t.ink3, lineHeight: 1.35 }}>
                      {workflowLabel(clientSide(client))}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 11.5, color: t.ink2, lineHeight: 1.35 }}>
                      {nextMove(client, client._stage)}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 11, color: t.ink3 }}>
                      <span>FICO {client.fico ?? "new"}</span>
                      <span>{client._activeLoanCount > 0 ? QC_FMT.short(client._activeLoanValue) : "agent file"}</span>
                    </div>
                  </Link>
                ))}
                {stageClients.length === 0 && (
                  <div style={{ fontSize: 12, color: t.ink3, padding: "8px 0", textAlign: "center" }}>
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SidePill({ type }: { type: ClientType }) {
  const { t } = useTheme();
  return (
    <Pill bg={type === "buyer" ? t.brandSoft : t.warnBg} color={type === "buyer" ? t.brand : t.warn}>
      {type === "buyer" ? "Buyer" : "Seller"}
    </Pill>
  );
}

function StagePill({ stage }: { stage: (typeof RELATIONSHIP_STAGES)[number] }) {
  const { t } = useTheme();
  const palette: Record<(typeof RELATIONSHIP_STAGES)[number], { bg: string; fg: string }> = {
    lead: { bg: t.chip, fg: t.ink2 },
    contacted: { bg: t.warnBg, fg: t.warn },
    verified: { bg: t.petrolSoft, fg: t.petrol },
    ready_for_lending: { bg: t.brandSoft, fg: t.brand },
    processing: { bg: t.warnBg, fg: t.warn },
    funded: { bg: t.profitBg, fg: t.profit },
  };
  const { bg, fg } = palette[stage];
  return <Pill bg={bg} color={fg}>{STAGE_LABELS[stage]}</Pill>;
}
