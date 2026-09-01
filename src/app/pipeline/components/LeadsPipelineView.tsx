"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
import {
  Btn,
  CellChip,
  Panel,
  Seg,
  Tag,
  WarnLine,
  type ChipTone,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useClients, useCreateDeal, useLoans, usePipelineClientSummary, type DealCreateBody } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import type { Client, ClientStage, ClientType, DealType, Loan, PipelineClientSummary } from "@/lib/types";
import { AiStatusBadge } from "@/components/AiStatusBadge";
import { useAiAgents, useAssignWarmupLeads } from "@/hooks/useAiAgents";
import { AIAgentAssignPicker } from "./AIAgentAssignPicker";

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

  // Batch fetch the AI / blocker / handoff summary for every visible
  // row so each card can render real-time pipeline state without an
  // N+1 storm. 60s refetch matches the cadence-engine heartbeat.
  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const { data: summaries = [] } = usePipelineClientSummary(visibleIds);
  const summariesByClient = useMemo(() => {
    const m = new Map<string, PipelineClientSummary>();
    for (const s of summaries) m.set(s.client_id, s);
    return m;
  }, [summaries]);

  // Click → if the client already has a primary deal, route to
  // /deals/{id}. Otherwise open the create-file modal first.
  const router = useRouter();
  const [createFor, setCreateFor] = useState<EnrichedClient | null>(null);
  // Right-click on a client card → AIAgentAssignPicker. Single-item
  // context (no intermediate menu) since this is the only broker
  // action that currently lives on these cards.
  const [assignAiFor, setAssignAiFor] = useState<{
    clientId: string;
    x: number;
    y: number;
  } | null>(null);
  function openFile(client: EnrichedClient) {
    const s = summariesByClient.get(client.id);
    if (s?.primary_deal_id) {
      router.push(`/deals/${s.primary_deal_id}`);
    } else {
      setCreateFor(client);
    }
  }

  // Tiny color legend so the agent knows what the row tints mean.
  // Hidden when zero rows are in funding state (nothing to explain).
  const fundingActiveCount = summaries.filter(
    (s) => s.handoff_status === "promoted" || s.loans_count > 0,
  ).length;
  const readyCount = summaries.filter(
    (s) => s.ready_for_lending_eligible && s.handoff_status !== "promoted",
  ).length;

  const header = (
    <div className="pagebar">
      <span className="sub">
        {visible.length} {visible.length === 1 ? "relationship" : "relationships"}
        {search ? ` matching "${search}"` : ""}
        {sideFilter !== "all" ? ` · ${sideFilter}s only` : ""}
      </span>
      {fundingActiveCount > 0 ? (
        <CellChip tone="acc">{fundingActiveCount} in funding</CellChip>
      ) : null}
      {readyCount > 0 ? (
        <CellChip tone="warn">{readyCount} ready for funding</CellChip>
      ) : null}
      <span className="spacer" />
      <SideFilter
        value={sideFilter}
        onChange={setSideFilter}
        buyerCount={sideCounts.buyer}
        sellerCount={sideCounts.seller}
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
        <RelationshipSummaryRow clients={visible} />
        {header}
        <Panel
          noPad
          title="Agent Relationship Pipeline"
          sub="Buyer and seller work stays agent-owned here. Funding files open only after handoff."
        >
          <div
            className="lbl"
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: 12,
              padding: "12px 16px",
              background: "var(--sunken2)",
              borderBottom: "1px solid var(--line2)",
            }}
          >
            <div>Relationship</div>
            <div>Workflow</div>
            <div>Property</div>
            <div>Readiness</div>
            <div>Funding File</div>
            <div>Next Agent Move</div>
          </div>
          {visible.map((client) => {
            const summary = summariesByClient.get(client.id);
            const tint = fundingTint(summary);
            return (
            <button
              key={client.id}
              onClick={() => openFile(client)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setAssignAiFor({ clientId: client.id, x: e.clientX, y: e.clientY });
              }}
              // The funding tint + left stripe are data-derived — a row already
              // in funding has to be spottable without reading it.
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 12,
                padding: "14px 16px",
                borderBottom: "1px solid var(--line)",
                borderLeft: `3px solid ${tint ? tint.border : "transparent"}`,
                alignItems: "center",
                color: "var(--ink)",
                background: tint ? tint.bg : "transparent",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <b style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {client.name}
                  </b>
                  <SidePill type={clientSide(client)} />
                </div>
                <div className="sub row">
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {client.email ?? "No email"}{client.city ? ` · ${client.city}` : ""}
                  </span>
                  {/* Owner reference — operator-only. Helps super-admin /
                      UW see which agent owns each relationship without
                      drilling in. Agents see only their own clients so
                      this is implicit for them. */}
                  {isInternal && client.broker_name ? (
                    <CellChip tone="acc">Agent: {client.broker_name}</CellChip>
                  ) : null}
                </div>
              </div>
              <StagePill stage={client._stage} />
              <PropertyCell client={client} />
              <div>
                <b>{readinessLabel(client, client._stage)}</b>
                <div className="sub">FICO {client.fico ?? "not pulled"}</div>
              </div>
              <div>
                <div className={client._activeLoanCount > 0 ? undefined : "sub"}>
                  <b>{client._activeLoanCount > 0 ? `${client._activeLoanCount} active` : "No file"}</b>
                </div>
                <div className="sub">
                  {client._activeLoanValue > 0 ? QC_FMT.short(client._activeLoanValue) : "Agent owned"}
                </div>
              </div>
              <div>
                {nextMove(client, client._stage)}
                <PipelineSignals summary={summariesByClient.get(client.id)} />
              </div>
            </button>
            );
          })}
          {visible.length === 0 && (
            <div className="sub" style={{ padding: 24, textAlign: "center" }}>
              {search ? `No relationships match "${search}".` : "No active relationships in the pipeline right now."}
            </div>
          )}
        </Panel>
        {createFor ? <CreateFileModal client={createFor} onClose={() => setCreateFor(null)} /> : null}
        {assignAiFor ? (
          <AIAgentAssignPicker
            clientId={assignAiFor.clientId}
            source="clients"
            anchor={{ x: assignAiFor.x, y: assignAiFor.y }}
            onClose={() => setAssignAiFor(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      {header}
      <div className="kanban">
        {RELATIONSHIP_STAGES.map((stage) => {
          const stageClients = visible.filter((client) => client._stage === stage);
          return (
            <div key={stage} className="kcol">
              <div className="lbl">
                <div>
                  <StagePill stage={stage} />
                  <div className="sub">{STAGE_SUBTITLES[stage]}</div>
                </div>
                <span className="num">{stageClients.length}</span>
              </div>
              <div>
                {stageClients.map((client) => {
                  const summary = summariesByClient.get(client.id);
                  const tint = fundingTint(summary);
                  return (
                  <button
                    key={client.id}
                    onClick={() => openFile(client)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAssignAiFor({
                        clientId: client.id,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    className="kcard"
                    // Funding tint + left stripe are data-derived.
                    style={{
                      background: tint ? tint.bg : undefined,
                      borderLeft: `3px solid ${tint ? tint.border : "transparent"}`,
                      color: "var(--ink)",
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <b style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {client.name}
                      </b>
                      <SidePill type={clientSide(client)} />
                    </div>
                    {/* Owner reference — operator-only. */}
                    {isInternal && client.broker_name ? (
                      <div className="mt">
                        <CellChip tone="acc">{client.broker_name}</CellChip>
                      </div>
                    ) : null}
                    <div className="sub">{workflowLabel(clientSide(client))}</div>
                    <div>{nextMove(client, client._stage)}</div>
                    <div className="sub" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>FICO {client.fico ?? "new"}</span>
                      <span>{client._activeLoanCount > 0 ? QC_FMT.short(client._activeLoanValue) : "agent file"}</span>
                    </div>
                    <PipelineSignals summary={summariesByClient.get(client.id)} compact />
                  </button>
                  );
                })}
                {stageClients.length === 0 && (
                  <div className="sub" style={{ padding: "8px 0", textAlign: "center" }}>
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {createFor ? <CreateFileModal client={createFor} onClose={() => setCreateFor(null)} /> : null}
      {assignAiFor ? (
        <AIAgentAssignPicker
          clientId={assignAiFor.clientId}
          source="clients"
          anchor={{ x: assignAiFor.x, y: assignAiFor.y }}
          onClose={() => setAssignAiFor(null)}
        />
      ) : null}
    </>
  );
}

// Where a click on a relationship row should land. If the client has
// active loans, jump straight to the loan detail page — the agent gets
// the full funding pipeline view (stage strip, Elara, docs,
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
  value, onChange, buyerCount, sellerCount,
}: {
  value: "all" | "buyer" | "seller";
  onChange: (next: "all" | "buyer" | "seller") => void;
  buyerCount: number;
  sellerCount: number;
}) {
  return (
    <Seg<"all" | "buyer" | "seller">
      ariaLabel="Relationship side"
      value={value}
      onChange={onChange}
      options={[
        { value: "all", label: "All" },
        { value: "buyer", label: <>Buyers <Tag>{buyerCount}</Tag></> },
        { value: "seller", label: <>Sellers <Tag>{sellerCount}</Tag></> },
      ]}
    />
  );
}


function SidePill({ type }: { type: ClientType }) {
  return (
    <CellChip tone={type === "buyer" ? "acc" : "warn"}>
      {type === "buyer" ? "Buyer" : "Seller"}
    </CellChip>
  );
}

function StagePill({ stage }: { stage: (typeof RELATIONSHIP_STAGES)[number] }) {
  const tones: Record<(typeof RELATIONSHIP_STAGES)[number], ChipTone> = {
    lead: "mut",
    contacted: "warn",
    verified: "pet",
    ready_for_lending: "acc",
    processing: "warn",
    funded: "ok",
  };
  return <CellChip tone={tones[stage]}>{STAGE_LABELS[stage]}</CellChip>;
}


// Property column — surfaces the address the relationship is centered
// on (for buyers, the target property if known; for sellers, the
// listing). Falls back gracefully through city → "—" so the column
// never looks broken on empty rows.
function PropertyCell({ client }: { client: Client }) {
  const addr = (client.address || "").trim() || null;
  const line2 = [client.city, client.client_type === "seller" ? "Listing" : "Target"].filter(Boolean).join(" · ");
  if (!addr) {
    return (
      <div className="sub" style={{ minWidth: 0 }}>
        <b>{client.city || "No address"}</b>
        <div>{client.client_type === "seller" ? "Seller relationship" : "Buyer relationship"}</div>
      </div>
    );
  }
  return (
    <div style={{ minWidth: 0 }}>
      <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {addr}
      </b>
      <div className="sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
function RelationshipSummaryRow({ clients }: { clients: Client[] }) {
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
    <div className="kpis">
      <SummaryTile icon="user" label="Buyers" value={buyers} tone="brand" />
      <SummaryTile icon="user" label="Sellers" value={sellers} tone="warn" />
      <SummaryTile icon="alert" label="Alerts" value={alerts} tone={alerts ? "danger" : "neutral"} />
      <SummaryTile icon="ai" label="AI overrides" value={aiIssues} tone={aiIssues ? "watch" : "neutral"} />
    </div>
  );
}

function SummaryTile({
  icon, label, value, tone,
}: {
  icon: string;
  label: string;
  value: number;
  tone: "brand" | "warn" | "danger" | "watch" | "neutral";
}) {
  // The figure's colour IS the signal here, so it stays an inline value.
  const color =
    tone === "brand" ? "var(--accent)"
    : tone === "warn" || tone === "watch" ? "var(--warn)"
    : tone === "danger" ? "var(--danger)"
    : "var(--ink2)";
  return (
    <div className="kpi">
      <div className="lbl">
        <Icon name={icon} size={12} stroke={2.2} /> {label}
      </div>
      <div className="knum num" style={{ color }}>{value}</div>
    </div>
  );
}


// Pipeline enrichment chips (Phase 6) — AI state, blocker, next
// follow-up, missing items, handoff badge, human-needed warning,
// Ready-for-Lending eligibility. Backed by /pipeline/client-summary.
function PipelineSignals({
  summary,
  compact = false,
}: {
  summary: PipelineClientSummary | undefined;
  compact?: boolean;
}) {
  if (!summary) return null;
  const fmt = (iso: string | null) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms < 0) return "now";
    const hrs = ms / 36e5;
    if (hrs < 1) return `${Math.max(1, Math.round(ms / 6e4))}m`;
    if (hrs < 24) return `${Math.round(hrs)}h`;
    return `${Math.round(hrs / 24)}d`;
  };
  const next = fmt(summary.next_follow_up_at);
  return (
    <div className="row" style={{ marginTop: 6 }}>
      <AiStatusBadge state={summary.ai_state} size={compact ? "sm" : "sm"} />
      {summary.missing_items_count > 0 ? (
        <CellChip tone="warn">{summary.missing_items_count} missing</CellChip>
      ) : null}
      {next ? <span className="sub">Next: {next}</span> : null}
      {summary.human_needed ? (
        <span title="No AI follow-up scheduled — human attention needed">
          <CellChip tone="warn">
            <Icon name="bolt" size={9} /> Needs human
          </CellChip>
        </span>
      ) : null}
      {summary.handoff_status === "promoted" ? (
        <CellChip tone="acc">Funding live</CellChip>
      ) : summary.ready_for_lending_eligible ? (
        <CellChip tone="acc">Ready for Lending</CellChip>
      ) : null}
    </div>
  );
}


// Create-file modal — fires when the pipeline row click resolves to
// a client with no Deal yet. The agent fills in the bare minimum
// (deal type + title) and we POST /clients/{id}/deals, then route
// to /deals/{new_deal_id} so they land directly on their file.
function CreateFileModal({ client, onClose }: { client: EnrichedClient; onClose: () => void }) {
  const router = useRouter();
  const create = useCreateDeal(client.id);
  const { data: aiAgents = [] } = useAiAgents();
  const assignAgent = useAssignWarmupLeads();
  const defaultType: DealType =
    client.client_type === "seller" ? "seller" : "buyer";
  const defaultTitle =
    defaultType === "seller"
      ? `Listing — ${client.name}`
      : `Buyer search — ${client.name}`;
  const [body, setBody] = useState<DealCreateBody>({
    deal_type: defaultType,
    title: defaultTitle,
  });
  const [aiAgentId, setAiAgentId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Filter the agent dropdown to ones that make sense for this deal
  // side. New-deal-buyer / -seller agents are the canonical fit; we
  // also surface the broader nurture / outreach kinds so a broker who
  // configured their own past-deal flow can pick it.
  const eligibleAgents = aiAgents.filter((a) => {
    if (a.status === "archived") return false;
    if (a.kind === "past_client" || a.kind === "review_request") return false;
    if (body.deal_type === "seller") {
      return [
        "new_deal_seller",
        "seller_followup",
        "open_house",
        "custom",
      ].includes(a.kind);
    }
    return [
      "new_deal_buyer",
      "buyer_nurture",
      "investor_outreach",
      "custom",
    ].includes(a.kind);
  });

  // Auto-select the broker's default new-deal agent (if starred) the
  // first time the form is rendered for this side. The broker can
  // still override the pick.
  const defaultSelected = useRef(false);
  useEffect(() => {
    if (defaultSelected.current) return;
    if (aiAgentId) {
      defaultSelected.current = true;
      return;
    }
    const def = aiAgents.find((a) =>
      body.deal_type === "seller"
        ? a.is_default_new_deal_seller
        : a.is_default_new_deal_buyer,
    );
    if (def) {
      defaultSelected.current = true;
      setAiAgentId(def.id);
    }
  }, [aiAgents, body.deal_type, aiAgentId]);

  async function save() {
    if (!body.title.trim()) {
      setErr("Title is required");
      return;
    }
    setErr(null);
    try {
      const created = await create.mutateAsync(body);
      // If an agent was picked, enroll the lead with the new deal_id
      // so the AI starts working it immediately.
      if (aiAgentId) {
        try {
          await assignAgent.mutateAsync({
            id: aiAgentId,
            client_ids: [client.id],
            deal_id: created.id,
          });
        } catch (assignErr) {
          // Don't block the navigation on assign failure — the file
          // was created. Surface a soft warning.
          console.warn("AI agent assign failed:", assignErr);
        }
      }
      onClose();
      router.push(`/deals/${created.id}?tab=verification&step=1`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create file");
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={`New file for ${client.name}`}
      sub="Each file is a transaction path you're working — buyer search, seller listing, investor purchase. A client can carry multiple files at once."
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={save} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Open file"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "block" }}>
          <span className="lbl">Type</span>
          <select
            className="field"
            value={body.deal_type}
            onChange={(e) => setBody({ ...body, deal_type: e.target.value as DealType })}
            style={{ marginTop: 4, width: "100%" }}
          >
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="investor">Investor</option>
            <option value="borrower">Borrower</option>
          </select>
        </label>
        <label style={{ display: "block" }}>
          <span className="lbl">Title</span>
          <input
            className="field"
            value={body.title}
            onChange={(e) => setBody({ ...body, title: e.target.value })}
            style={{ marginTop: 4, width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="lbl">Assign AI agent (optional)</span>
          <select
            className="field"
            value={aiAgentId}
            onChange={(e) => setAiAgentId(e.target.value)}
            style={{ marginTop: 4, width: "100%" }}
          >
            <option value="">— None for now —</option>
            {eligibleAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.ai_display_name ? ` (${a.ai_display_name})` : ""}
              </option>
            ))}
          </select>
          <div className="sub">
            The AI will start drafting outreach for this lead the moment
            the file is created.
          </div>
        </label>
        {err ? <WarnLine>{err}</WarnLine> : null}
      </div>
    </Drawer>
  );
}


// Color coding — rows already in the funding process get a tinted
// background + a left stripe so the agent can spot them at a glance.
//   funding live (handoff_status='promoted' OR loans_count>0) → brand tint
//   ready-for-lending eligible                                 → warn tint
//   default (active relationship, no funding)                  → no tint
function fundingTint(
  summary: PipelineClientSummary | undefined,
): { bg: string; border: string } | null {
  if (!summary) return null;
  if (summary.handoff_status === "promoted" || summary.loans_count > 0) {
    return { bg: "var(--accent-100)", border: "var(--accent)" };
  }
  if (summary.ready_for_lending_eligible) {
    return { bg: "var(--warn-tint)", border: "var(--warn)" };
  }
  return null;
}
