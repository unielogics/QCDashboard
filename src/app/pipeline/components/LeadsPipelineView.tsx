"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { QC_FMT } from "@/components/design-system/tokens";
import { useClients, useLoans } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
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
  const profile = useActiveProfile();
  const isAgent = profile.role === "broker";
  const isInternal = profile.role === "super_admin" || profile.role === "loan_exec";
  // Scope hint: agents always run "mine" so the network surface matches
  // the backend's role-based filter. Operators (super_admin / loan_exec)
  // see every relationship and can identify the owning agent via the
  // broker_name pill rendered below.
  const scope = isAgent ? "mine" : undefined;
  const { data: clients = [] } = useClients(scope);
  const { data: loans = [] } = useLoans(scope);

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

  // Side filter — buyer / seller / all. Defaults to "all". The
  // top-level Agent Relationships toggle was getting overloaded; agents
  // wanted a way to slice WITHIN their relationships. Persists in URL?
  // Local state is fine for v1.
  const [sideFilter, setSideFilter] = useState<"all" | "buyer" | "seller">("all");

  const visible = useMemo(() => {
    let rows = enriched;
    if (sideFilter !== "all") {
      rows = rows.filter((c) => (c.client_type ?? "buyer") === sideFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (client) =>
          client.name.toLowerCase().includes(q) ||
          (client.email ?? "").toLowerCase().includes(q) ||
          (client.city ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [enriched, search, sideFilter]);

  const sideCounts = useMemo(() => ({
    buyer: enriched.filter((c) => (c.client_type ?? "buyer") === "buyer").length,
    seller: enriched.filter((c) => c.client_type === "seller").length,
  }), [enriched]);

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
      <div style={{ fontSize: 12, color: t.ink3 }}>
        {visible.length} {visible.length === 1 ? "relationship" : "relationships"}
        {search ? ` matching "${search}"` : ""}
        {sideFilter !== "all" ? ` · ${sideFilter}s only` : ""}
      </div>
      <SideFilter
        value={sideFilter}
        onChange={setSideFilter}
        buyerCount={sideCounts.buyer}
        sellerCount={sideCounts.seller}
        t={t}
      />
    </div>
  );

  if (view === "table") {
    // gridTemplateColumns shared between header + rows. Inserted a
    // Property column between Workflow and Readiness so the agent sees
    // the address the relationship is centered on without drilling in.
    const gridCols = "minmax(0, 1.35fr) 130px minmax(0, 1.1fr) 140px 140px minmax(200px, 1fr)";
    return (
      <>
        <RelationshipSummaryRow clients={visible} t={t} />
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
              gridTemplateColumns: gridCols,
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
            <div>Property</div>
            <div>Readiness</div>
            <div>Funding File</div>
            <div>Next Agent Move</div>
          </div>
          {visible.map((client) => (
            <Link
              key={client.id}
              href={destForClient(client)}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
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
                <div style={{ marginTop: 3, fontSize: 11.5, color: t.ink3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {client.email ?? "No email"}{client.city ? ` · ${client.city}` : ""}
                  </span>
                  {/* Owner reference — operator-only. Helps super-admin /
                      UW see which agent owns each relationship without
                      drilling in. Agents see only their own clients so
                      this is implicit for them. */}
                  {isInternal && client.broker_name ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "1px 6px", borderRadius: 4,
                      background: t.brandSoft, color: t.brand,
                      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
                    }}>
                      Agent: {client.broker_name}
                    </span>
                  ) : null}
                </div>
              </div>
              <StagePill stage={client._stage} />
              <PropertyCell client={client} t={t} />
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
                    href={destForClient(client)}
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
                    {/* Owner reference — operator-only. */}
                    {isInternal && client.broker_name ? (
                      <div style={{ marginTop: 4 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "1px 6px", borderRadius: 4,
                          background: t.brandSoft, color: t.brand,
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                        }}>
                          {client.broker_name}
                        </span>
                      </div>
                    ) : null}
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

// Where a click on a relationship row should land. If the client has
// active loans, jump straight to the loan detail page — the agent gets
// the full funding pipeline view (stage strip, AI Secretary, docs,
// conditions). When they don't, fall back to the relationship
// workspace (Overview / Properties / Activity / Documents / Notes).
//
// Multiple active loans → pick the one furthest along the pipeline
// (later LOAN_STAGE_ORDER index), then most-recent close_date as the
// tiebreaker. That's the one the agent is most likely chasing.
const STAGE_RANK: Record<string, number> = {
  prequalified: 0,
  collecting_docs: 1,
  lender_connected: 2,
  processing: 3,
  closing: 4,
  funded: 5,
};
function destForClient(client: EnrichedClient): string {
  const base = `/clients/${client.id}/workspace`;
  const loans = client._activeLoans ?? [];
  if (loans.length === 0) return `${base}?tab=deals`;
  const best = [...loans].sort((a, b) => {
    const ra = STAGE_RANK[String(a.stage)] ?? 0;
    const rb = STAGE_RANK[String(b.stage)] ?? 0;
    if (ra !== rb) return rb - ra;
    const ca = a.close_date ? new Date(a.close_date).getTime() : 0;
    const cb = b.close_date ? new Date(b.close_date).getTime() : 0;
    return cb - ca;
  })[0];
  return `${base}?tab=funding&fundingFileId=${best.id}&loanId=${best.id}`;
}


function SideFilter({
  value, onChange, buyerCount, sellerCount, t,
}: {
  value: "all" | "buyer" | "seller";
  onChange: (next: "all" | "buyer" | "seller") => void;
  buyerCount: number;
  sellerCount: number;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const opts: Array<{ k: "all" | "buyer" | "seller"; label: string; count?: number }> = [
    { k: "all", label: "All" },
    { k: "buyer", label: "Buyers", count: buyerCount },
    { k: "seller", label: "Sellers", count: sellerCount },
  ];
  return (
    <div style={{
      display: "inline-flex", padding: 3, gap: 2,
      borderRadius: 9,
      background: t.surface2,
      border: `1px solid ${t.line}`,
    }}>
      {opts.map((o) => {
        const active = o.k === value;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange(o.k)}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "5px 11px",
              borderRadius: 7,
              background: active ? t.surface : "transparent",
              color: active ? t.ink : t.ink3,
              fontSize: 11.5, fontWeight: 850,
              display: "inline-flex", alignItems: "center", gap: 6,
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {o.label}
            {o.count !== undefined ? (
              <span style={{
                fontSize: 10, fontWeight: 800,
                padding: "1px 5px", borderRadius: 999,
                background: active ? t.brandSoft : t.surface,
                color: active ? t.brand : t.ink3,
              }}>
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
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


// Property column — surfaces the address the relationship is centered
// on (for buyers, the target property if known; for sellers, the
// listing). Falls back gracefully through city → "—" so the column
// never looks broken on empty rows.
function PropertyCell({
  client, t,
}: {
  client: Client;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const addr = (client.address || "").trim() || null;
  const line2 = [client.city, client.client_type === "seller" ? "Listing" : "Target"].filter(Boolean).join(" · ");
  if (!addr) {
    return (
      <div style={{ minWidth: 0, color: t.ink3, fontSize: 12 }}>
        <div style={{ fontWeight: 700, color: t.ink3 }}>{client.city || "No address"}</div>
        <div style={{ marginTop: 2, fontSize: 11, color: t.ink3 }}>
          {client.client_type === "seller" ? "Seller relationship" : "Buyer relationship"}
        </div>
      </div>
    );
  }
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontWeight: 800, color: t.ink, fontSize: 12.5,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {addr}
      </div>
      <div style={{
        marginTop: 2, fontSize: 11, color: t.ink3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {line2 || "—"}
      </div>
    </div>
  );
}


// Summary row above the Agent Relationship Pipeline. Four pulse tiles:
//   Buyers + Sellers — split of visible relationships by side
//   Alerts — relationships with documented contact-permission missing
//            or financing-support flagged (proxy for "needs human")
//   AI issues — relationships that have AI-cadence overrides set
//            (proxy for "AI is being told to do something non-default")
// All four read from the same `visible` list the table consumes so the
// counts and the rows stay in lockstep.
function RelationshipSummaryRow({
  clients, t,
}: {
  clients: Client[];
  t: ReturnType<typeof useTheme>["t"];
}) {
  const buyers = clients.filter((c) => (c.client_type ?? "buyer") === "buyer").length;
  const sellers = clients.filter((c) => c.client_type === "seller").length;
  // Alerts — relationships that need a human touch right now.
  //   • Cold leads (lead_temperature === "nurture")
  //   • Borrowers who need financing help but haven't been routed yet
  //   • Contact permission gated to "agent introduces first" (lead
  //     is dormant until the agent acts)
  const alerts = clients.filter((c) =>
    c.lead_temperature === "nurture" ||
    c.financing_support_needed === "yes" ||
    c.contact_permission === "agent_will_introduce_first",
  ).length;
  // AI issues — relationships flagged "lead_promotion_status =
  // agent_requested_review" (agent has actively asked funding to look
  // at it). Proxy until we wire a dedicated AI-issue stream.
  const aiIssues = clients.filter((c) =>
    c.lead_promotion_status === "agent_requested_review",
  ).length;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 8,
      marginBottom: 10,
    }}>
      <SummaryTile icon="user" label="Buyers" value={buyers} tone="brand" t={t} />
      <SummaryTile icon="user" label="Sellers" value={sellers} tone="warn" t={t} />
      <SummaryTile icon="alert" label="Alerts" value={alerts} tone={alerts ? "danger" : "neutral"} t={t} />
      <SummaryTile icon="ai" label="AI overrides" value={aiIssues} tone={aiIssues ? "watch" : "neutral"} t={t} />
    </div>
  );
}

function SummaryTile({
  icon, label, value, tone, t,
}: {
  icon: string;
  label: string;
  value: number;
  tone: "brand" | "warn" | "danger" | "watch" | "neutral";
  t: ReturnType<typeof useTheme>["t"];
}) {
  const color =
    tone === "brand" ? t.brand
    : tone === "warn" ? t.warn
    : tone === "danger" ? t.danger
    : tone === "watch" ? t.warn
    : t.ink2;
  const bg =
    tone === "brand" ? t.brandSoft
    : tone === "warn" ? t.warnBg
    : tone === "danger" ? t.dangerBg
    : tone === "watch" ? t.warnBg
    : t.surface2;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px",
      borderRadius: 10,
      background: t.surface,
      border: `1px solid ${t.line}`,
      minWidth: 0,
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 8,
        display: "grid", placeItems: "center",
        background: bg, color,
        flex: "0 0 auto",
      }}>
        <Icon name={icon} size={14} stroke={2.2} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 950, color, lineHeight: 1.1, fontFeatureSettings: '"tnum"' }}>{value}</div>
      </div>
    </div>
  );
}
