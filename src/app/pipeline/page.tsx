"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CellChip,
  PageHeader,
  Panel,
  Seg,
  Select,
  Tag,
  cx,
  type ChipTone,
} from "@/components/ds";
import {
  useClients,
  useDealSecretarySummary,
  useDocuments,
  useLoans,
  usePipelineClientSummary,
  useCurrentUser,
  type DSPipelineSummaryItem,
} from "@/hooks/useApi";
import { QC_FMT } from "@/lib/fmt";
import { loanTypeLabel, type Client, type Document } from "@/lib/types";
import { getFileCompletion } from "@/app/loans/[id]/fileReadiness";
import { SmartIntakeModal } from "./components/SmartIntakeModal";
import { ClientFilePipeline } from "./components/ClientFilePipeline";
import { LoanAgentPicker } from "@/components/LoanAgentPicker";
import { AIAgentAssignPicker } from "./components/AIAgentAssignPicker";
import type { Loan } from "@/lib/types";

type PipelineMode = "leads" | "funding";

// Role split: a CLIENT (borrower) login gets the merged file table +
// stage-aware modal; everyone else (agent/broker, loan-exec, super-admin)
// gets the operator pipeline below, byte-for-byte unchanged. Branching in
// a thin wrapper keeps each side's hooks from running for the other role.
export default function PipelinePage() {
  const { data: user, isLoading } = useCurrentUser();

  if (!user) {
    return (
      <div className="sub">{isLoading ? "Loading pipeline..." : "Loading account..."}</div>
    );
  }

  if (user.role === "client") return <ClientFilePipeline />;
  return <OperatorPipelinePage role={user.role} />;
}

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"] as const;
const STAGE_LABELS = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];

type SortKey = "deal_id" | "address" | "type" | "amount" | "dscr" | "stage" | "close_date";

// Bespoke column tracks. These do not correspond to the 12-column `.cg`
// system — chevron, name, three figures and a date is not "n equal columns" —
// so the template stays inline and only the typography moves to classes.
const AGENT_GRID = "32px minmax(0, 1.45fr) 118px 118px 118px 150px";
const AGENT_FILE_GRID = "86px minmax(0, 1.35fr) 120px 110px 90px 112px";

type FundingRow = {
  loan: Loan;
  loanDocs: Document[];
  readiness: { score: number; label: string };
  openDocs: Document[];
  flaggedDocs: Document[];
  summary: DSPipelineSummaryItem | undefined;
  action: PipelineAction;
};

function OperatorPipelinePage({ role }: { role: string }) {
  const { data: loans = [] } = useLoans();
  const loanIds = useMemo(() => loans.map((l) => l.id), [loans]);
  const { data: secretarySummaries = [] } = useDealSecretarySummary(loanIds);
  const summaryByLoanId = useMemo(() => {
    const map = new Map<string, DSPipelineSummaryItem>();
    secretarySummaries.forEach((s) => map.set(s.loan_id, s));
    return map;
  }, [secretarySummaries]);
  // Top-level mode: Funding Files (loan/deal files keyed on deal_id)
  // vs Agent Relationships (the client funnel). Mirrors the mobile
  // PipelineScreen, which defaults brokers to the "files" view and
  // offers a Files/Relationships toggle. The relationship DETAIL
  // (workflow / property / readiness per client) lives on the
  // Clients tab → /clients/[id], not as the pipeline default.
  const isBroker = role === "broker";
  const isInternal = role === "super_admin" || role === "loan_exec";
  const { data: allDocs = [] } = useDocuments();
  const { data: clients = [] } = useClients();
  // Everyone lands on Funding Files. Brokers stay there; operators can
  // switch into the firm-wide relationship view.
  const [mode, setMode] = useState<PipelineMode>("funding");
  const activeMode: PipelineMode = isBroker ? "funding" : mode;
  const [view, setView] = useState<"table" | "kanban">("table");
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // Isolates loans promoted from a realtor's Deal (source_deal_id set) —
  // lets admin/underwriter spot freshly-handed-off files within the
  // existing pipeline list instead of a separate queue.
  const [handoffOnly, setHandoffOnly] = useState(false);
  const [search, setSearch] = useState<string>("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  // `/pipeline?new=1` (e.g. the dashboard "Add Lead" button) opens the
  // intake modal straight away — there's no standalone /leads route.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams?.get("new") === "1") setIntakeOpen(true);
  }, [searchParams]);
  // Right-click → context menu. Internal users get "Reassign agent…"
  // (broker reassignment); brokers + internal both get "Assign AI
  // agent…" which opens the AIAgentAssignPicker.
  const [reassignTarget, setReassignTarget] = useState<{ loan: Loan; x: number; y: number } | null>(null);
  const [assignAiTarget, setAssignAiTarget] = useState<{ loan: Loan; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ loan: Loan; x: number; y: number } | null>(null);

  const canCreateLead = role === "super_admin";
  // Brokers now default to (and live in) Funding Files mode, mirroring
  // the mobile pipeline FAB → /agent/loan/new. They must be able to
  // start a file here too — SmartIntakeModal finds-or-creates the
  // client and originates the loan.
  const canCreateDeal = isInternal || isBroker;

  const docsByLoan = useMemo(() => {
    const grouped = new Map<string, Document[]>();
    for (const doc of allDocs) {
      const current = grouped.get(doc.loan_id) ?? [];
      current.push(doc);
      grouped.set(doc.loan_id, current);
    }
    return grouped;
  }, [allDocs]);

  const sorted = useMemo(() => {
    let filtered = typeFilter === "all" ? loans : loans.filter((l) => l.type === typeFilter);
    if (handoffOnly) filtered = filtered.filter((l) => l.source_deal_id != null);
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * (sortDir === "asc" ? 1 : -1);
      return String(av).localeCompare(String(bv)) * (sortDir === "asc" ? 1 : -1);
    });
  }, [loans, sortKey, sortDir, typeFilter, handoffOnly]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  // Search filters down by deal_id or address (case-insensitive).
  const visibleLoans = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    return sorted.filter(
      (l) =>
        l.deal_id.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.city ?? "").toLowerCase().includes(q) ||
        (l.client_name ?? "").toLowerCase().includes(q) ||
        (l.broker_name ?? "").toLowerCase().includes(q),
    );
  }, [sorted, search]);

  const buildFundingRow = useCallback((loan: Loan): FundingRow => {
    const loanDocs = docsByLoan.get(loan.id) ?? [];
    const readiness = getFileCompletion(loan, loanDocs);
    const openDocs = loanDocs.filter((doc) => doc.status !== "verified" && doc.status !== "skipped");
    const flaggedDocs = loanDocs.filter((doc) => doc.status === "flagged");
    const summary = summaryByLoanId.get(loan.id);
    return {
      loan,
      loanDocs,
      readiness,
      openDocs,
      flaggedDocs,
      summary,
      action: getPipelineAction(readiness.score, openDocs.length, flaggedDocs.length, summary),
    };
  }, [docsByLoan, summaryByLoanId]);
  const totalValue = visibleLoans.reduce((acc, l) => acc + Number(l.amount), 0);
  const fundingRows = useMemo(() => visibleLoans.map(buildFundingRow), [visibleLoans, buildFundingRow]);
  const allFundingRows = useMemo(() => loans.map(buildFundingRow), [loans, buildFundingRow]);
  const underwritingReady = fundingRows.filter((row) => row.readiness.score >= 85 && row.openDocs.length === 0).length;
  const needsStructure = fundingRows.filter((row) => row.readiness.score < 65).length;
  const openConditionCount = fundingRows.reduce((acc, row) => acc + row.openDocs.length, 0);
  const blockedAiCount = fundingRows.filter((row) => row.summary?.state === "blocked").length;

  return (
    <>
      <PageHeader
        title={isInternal && activeMode === "funding" ? "Underwriting CRM" : "Pipeline"}
        lede={
          activeMode === "funding"
            ? `${visibleLoans.length} loans · ${QC_FMT.short(totalValue)} value`
            : undefined
        }
        actions={
          (activeMode === "funding" ? canCreateDeal : canCreateLead) ? (
            <Btn variant="pri" onClick={() => setIntakeOpen(true)}>
              <Icon name="plus" size={14} /> New file
            </Btn>
          ) : undefined
        }
      />

      <div className="pagebar">
        {isInternal ? (
          <Seg<PipelineMode>
            ariaLabel="Pipeline mode"
            value={activeMode}
            onChange={setMode}
            options={[
              {
                value: "funding",
                label: (
                  <>
                    <Icon name="file" size={12} stroke={2.2} /> Funding Files
                  </>
                ),
              },
              {
                value: "leads",
                label: (
                  <>
                    <Icon name="user" size={12} stroke={2.2} /> Agents
                  </>
                ),
              },
            ]}
          />
        ) : null}

        <span className="spacer" />

        {/* Search address or ID */}
        {/* `.field.box` owns the row and the bare-input reset; the 240px
            measure is this toolbar's alone. */}
        <div className="field box" style={{ width: 240 }}>
          <Icon name="search" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search pipeline"
            placeholder={activeMode === "funding" ? "Search address or ID..." : "Search agents, clients, files..."}
          />
        </div>

        {/* Loan-type filter only applies in Funding mode (Leads don't have a
            loan type yet; that gets locked when Start Funding fires). */}
        {activeMode === "funding" && (
          <Select
            aria-label="Loan type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All types</option>
            <option value="dscr">DSCR</option>
            <option value="fix_and_flip">Fix &amp; Flip</option>
            <option value="ground_up">Ground Up</option>
            <option value="bridge">Bridge</option>
          </Select>
        )}

        {/* Isolate loans promoted from a realtor's Deal — admins/underwriters
            only; brokers only ever see their own book anyway. */}
        {activeMode === "funding" && isInternal && (
          <Btn
            variant={handoffOnly ? "pri" : "default"}
            aria-pressed={handoffOnly}
            onClick={() => setHandoffOnly((v) => !v)}
          >
            <Icon name="spark" size={13} /> From realtor handoff
          </Btn>
        )}

        {activeMode === "funding" ? (
          <Seg<"table" | "kanban">
            ariaLabel="Pipeline layout"
            value={view}
            onChange={setView}
            options={[
              {
                value: "kanban",
                label: (
                  <>
                    <Icon name="layers" size={14} /> Kanban
                  </>
                ),
              },
              {
                value: "table",
                label: (
                  <>
                    <Icon name="filter" size={14} /> Table
                  </>
                ),
              },
            ]}
          />
        ) : null}
      </div>

      {/* Pipeline owns loan-file creation (the funding target the AI
          nurtures), separate from the client/person creation on the
          Clients tab. Both broker and operator open the same
          SmartIntake flow — it finds-or-creates the client by email,
          then originates a Loan with property + ask + AI cadence. */}
      <SmartIntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />

      {activeMode === "funding" ? (
        <FundingMetricsRow
          totalFiles={fundingRows.length}
          ready={underwritingReady}
          needsStructure={needsStructure}
          openConditions={openConditionCount}
          blockedAi={blockedAiCount}
          totalValue={totalValue}
          rows={fundingRows}
        />
      ) : null}

      {activeMode === "leads" ? (
        <AgentsPipelineView
          clients={clients}
          rows={allFundingRows}
          search={search}
        />
      ) : view === "table" ? (
        // Operators (super_admin / loan_exec) get an extra "Agent" column —
        // brokers don't see it because their list is implicitly scoped to
        // themselves. Grid template flexes accordingly so the row layout
        // doesn't shift between roles.
        (() => {
          // Added a 70px Credit column between Amount and DSCR. Reading
          // order matches an UW's mental model: Property → Readiness →
          // Type/Amount → Credit → DSCR → Conditions → Next action.
          const gridCols = isInternal
            ? "78px minmax(0, 1.55fr) 130px 122px 96px 110px 70px 82px 104px 126px"
            : "78px minmax(0, 1.55fr) 122px 96px 110px 70px 82px 104px 126px";
          return (
            <Panel className="mt" noPad>
              {/* Bespoke ten-column track (rule 3); `.gridhd` owns the rest,
                  and `.lbl` the header typography its plain cells inherit. */}
              <div className="lbl gridhd" style={{ gridTemplateColumns: gridCols }}>
                <SortHead label="ID" k="deal_id" current={sortKey} dir={sortDir} onClick={setSort} />
                <SortHead label="Property" k="address" current={sortKey} dir={sortDir} onClick={setSort} />
                {isInternal ? <div>Agent</div> : null}
                <div>Readiness</div>
                <SortHead label="Type" k="type" current={sortKey} dir={sortDir} onClick={setSort} />
                <SortHead label="Amount" k="amount" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
                <div className="align-r">Credit</div>
                <SortHead label="DSCR" k="dscr" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
                <div>Conditions</div>
                <div>Next action</div>
              </div>
              {fundingRows.map(({ loan, loanDocs, readiness, openDocs, flaggedDocs, summary, action }) => {
                return (
                  <Link
                    key={loan.id}
                    href={`/loans/${loan.id}`}
                    onContextMenu={
                      isInternal || isBroker
                        ? (e) => {
                            // Internal users get "Reassign agent…" +
                            // "Assign AI agent…". Brokers get just the AI
                            // assign action — same popover, role-gated
                            // items inside.
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({ loan, x: e.clientX, y: e.clientY });
                          }
                        : undefined
                    }
                    className="gridrow act linkreset"
                    style={{ gridTemplateColumns: gridCols }}>
                    <div className="num"><b>{loan.deal_id}</b></div>
                    <div>
                      <div className="trunc"><b>{loan.address}</b></div>
                      <div className="sub row">
                        <span>{loan.city}</span>
                        {isInternal && loan.client_name ? (
                          <>
                            <span aria-hidden>/</span>
                            <b>{loan.client_name}</b>
                          </>
                        ) : null}
                        {isInternal && loan.source_deal_id ? (
                          <>
                            <span aria-hidden>/</span>
                            <b style={{ color: "var(--accent)" }}>From realtor handoff</b>
                          </>
                        ) : null}
                        {loan.close_date ? (
                          <>
                            <span aria-hidden>/</span>
                            <span>Close {new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          </>
                        ) : null}
                        <DealSecretaryBadge summary={summary} />
                      </div>
                    </div>
                    {isInternal ? (
                      <div className={cx("trunc", !loan.broker_name && "sub")}>
                        {loan.broker_name ? <b>{loan.broker_name}</b> : "Not assigned"}
                      </div>
                    ) : null}
                    <ReadinessCell score={readiness.score} label={readiness.label} />
                    <div><CellChip tone="mut">{loanTypeLabel(loan.type)}</CellChip></div>
                    <div className="align-r num"><b>{QC_FMT.short(Number(loan.amount))}</b></div>
                    <CreditCell fico={loan.fico_override ?? loan.client_fico ?? null} override={loan.fico_override != null} />
                    {/* A tone chosen from a number — inline, per rule 2. */}
                    <div
                      className="align-r num"
                      style={{ color: loan.dscr && loan.dscr >= 1.25 ? "var(--ok)" : loan.dscr && loan.dscr >= 1.0 ? "var(--warn)" : "var(--muted)" }}
                    >
                      <b>{loan.dscr ? loan.dscr.toFixed(2) : "—"}</b>
                    </div>
                    <ConditionCell open={openDocs.length} flagged={flaggedDocs.length} total={loanDocs.length} />
                    <PipelineActionCell action={action} />
                  </Link>
                );
              })}
            </Panel>
          );
        })()
      ) : (
        <div className="kanban mt">
          {STAGE_KEYS.map((k, i) => {
            const stageLoans = fundingRows.filter((row) => row.loan.stage === k);
            return (
              <div key={k} className="kcol">
                <div className="lbl">
                  <StageBadge stage={i} />
                  <span className="num">{stageLoans.length}</span>
                </div>
                <div>
                  {stageLoans.map(({ loan, readiness, openDocs, action }) => {
                    return (
                      <Link
                        key={loan.id}
                        href={`/loans/${loan.id}`}
                        onContextMenu={
                          isInternal || isBroker
                            ? (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({ loan, x: e.clientX, y: e.clientY });
                              }
                            : undefined
                        }
                        className="kcard grid g8 linkreset">
                        <div>
                          <div className="lbl">{loan.deal_id}</div>
                          <b style={{ display: "block", marginTop: 2, lineHeight: 1.25 }}>{loan.address}</b>
                          <div className="sub">{QC_FMT.short(Number(loan.amount))} / {loanTypeLabel(loan.type)}</div>
                        </div>
                        <ReadinessBar score={readiness.score} label={readiness.label} />
                        <div className="row split">
                          <CellChip tone={openDocs.length ? "warn" : "ok"}>{openDocs.length} open</CellChip>
                          <CellChip tone={loan.dscr && loan.dscr >= 1.25 ? "ok" : loan.dscr ? "warn" : "mut"}>
                            DSCR {loan.dscr ? loan.dscr.toFixed(2) : "—"}
                          </CellChip>
                        </div>
                        <PipelineActionCell action={action} compact />
                        {isInternal && (loan.broker_name || loan.client_name) ? (
                          <div className="row">
                            {loan.broker_name ? (
                              <CellChip tone="acc">{loan.broker_name}</CellChip>
                            ) : null}
                            {loan.client_name ? (
                              <Tag>{loan.client_name}</Tag>
                            ) : null}
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contextMenu ? (
        <PipelineRowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          loan={contextMenu.loan}
          canReassign={isInternal}
          onReassign={() =>
            setReassignTarget({ loan: contextMenu.loan, x: contextMenu.x, y: contextMenu.y })
          }
          onAssignAI={() =>
            setAssignAiTarget({ loan: contextMenu.loan, x: contextMenu.x, y: contextMenu.y })
          }
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      {reassignTarget ? (
        <LoanAgentPicker
          loan={reassignTarget.loan}
          anchor={{ x: reassignTarget.x, y: reassignTarget.y }}
          onClose={() => {
            setReassignTarget(null);
            setContextMenu(null);
          }}
        />
      ) : null}
      {assignAiTarget ? (
        <AIAgentAssignPicker
          clientId={assignAiTarget.loan.client_id}
          dealId={assignAiTarget.loan.source_deal_id ?? undefined}
          source="pipeline"
          anchor={{ x: assignAiTarget.x, y: assignAiTarget.y }}
          onClose={() => {
            setAssignAiTarget(null);
            setContextMenu(null);
          }}
        />
      ) : null}
    </>
  );
}

interface AgentGroup {
  key: string;
  brokerId: string | null;
  name: string;
  loans: FundingRow[];
  activeLoans: FundingRow[];
  clients: Client[];
  latestFileAt: number;
  latestRelationshipAt: number;
  totalValue: number;
}

function toTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatShortDate(value: number): string {
  if (!value) return "No files";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatRelativeDays(value: number): string {
  if (!value) return "No file activity";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  return `Updated ${days}d ago`;
}

function buildAgentGroups(clients: Client[], rows: FundingRow[]): AgentGroup[] {
  const groups = new Map<string, AgentGroup>();
  const ensure = (brokerId: string | null, name: string | null | undefined) => {
    const key = brokerId ?? "unassigned";
    const existing = groups.get(key);
    if (existing) {
      if (!existing.name || existing.name === "Unassigned") {
        existing.name = name || "Unassigned";
      }
      return existing;
    }
    const group: AgentGroup = {
      key,
      brokerId,
      name: name || "Unassigned",
      loans: [],
      activeLoans: [],
      clients: [],
      latestFileAt: 0,
      latestRelationshipAt: 0,
      totalValue: 0,
    };
    groups.set(key, group);
    return group;
  };

  rows.forEach((row) => {
    const group = ensure(row.loan.broker_id ?? null, row.loan.broker_name);
    const updatedAt = toTime(row.loan.updated_at) || toTime(row.loan.created_at) || toTime(row.loan.close_date);
    group.loans.push(row);
    if (String(row.loan.stage) !== "funded") {
      group.activeLoans.push(row);
      group.totalValue += Number(row.loan.amount || 0);
    }
    group.latestFileAt = Math.max(group.latestFileAt, updatedAt);
  });

  clients.forEach((client) => {
    const group = ensure(client.broker_id ?? null, client.broker_name);
    group.clients.push(client);
    group.latestRelationshipAt = Math.max(group.latestRelationshipAt, toTime(client.last_seen_at) || toTime(client.since));
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      loans: [...group.loans].sort((a, b) => toTime(b.loan.updated_at) - toTime(a.loan.updated_at)),
      activeLoans: [...group.activeLoans].sort((a, b) => toTime(b.loan.updated_at) - toTime(a.loan.updated_at)),
      clients: [...group.clients].sort((a, b) => {
        const bt = toTime(b.last_seen_at) || toTime(b.since);
        const at = toTime(a.last_seen_at) || toTime(a.since);
        return bt - at;
      }),
    }))
    .sort((a, b) => {
      if (b.latestFileAt !== a.latestFileAt) return b.latestFileAt - a.latestFileAt;
      if (b.latestRelationshipAt !== a.latestRelationshipAt) return b.latestRelationshipAt - a.latestRelationshipAt;
      return a.name.localeCompare(b.name);
    });
}

function AgentsPipelineView({
  clients,
  rows,
  search,
}: {
  clients: Client[];
  rows: FundingRow[];
  search: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const clientIds = useMemo(() => clients.map((client) => client.id), [clients]);
  const { data: summaries = [] } = usePipelineClientSummary(clientIds);
  const summaryByClientId = useMemo(() => {
    const map = new Map<string, (typeof summaries)[number]>();
    summaries.forEach((summary) => map.set(summary.client_id, summary));
    return map;
  }, [summaries]);

  const groups = useMemo(() => buildAgentGroups(clients, rows), [clients, rows]);
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => {
        const agentMatch = group.name.toLowerCase().includes(q);
        if (agentMatch) return group;
        const activeLoans = group.activeLoans.filter((row) =>
          row.loan.deal_id.toLowerCase().includes(q) ||
          row.loan.address.toLowerCase().includes(q) ||
          (row.loan.client_name ?? "").toLowerCase().includes(q) ||
          (row.loan.city ?? "").toLowerCase().includes(q),
        );
        const clients = group.clients.filter((client) =>
          client.name.toLowerCase().includes(q) ||
          (client.email ?? "").toLowerCase().includes(q) ||
          (client.city ?? "").toLowerCase().includes(q),
        );
        return { ...group, activeLoans, clients };
      })
      .filter((group) => group.activeLoans.length > 0 || group.clients.length > 0);
  }, [groups, search]);

  const totalAgents = groups.filter((group) => group.key !== "unassigned").length;
  const totalActiveFiles = groups.reduce((sum, group) => sum + group.activeLoans.length, 0);
  const totalRelationships = groups.reduce((sum, group) => sum + group.clients.length, 0);
  const totalValue = groups.reduce((sum, group) => sum + group.totalValue, 0);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <div className="kpis mt">
        <MiniMetric label="Agents" value={totalAgents} tone="neutral" />
        <MiniMetric label="Active files" value={totalActiveFiles} tone={totalActiveFiles ? "watch" : "neutral"} />
        <MiniMetric label="Relationships" value={totalRelationships} tone="neutral" />
        <MiniMetric label="Active volume" value={QC_FMT.short(totalValue)} tone={totalValue ? "ready" : "neutral"} />
      </div>

      <Panel
        className="mt"
        noPad
        title="Agents"
        sub="Latest activity, active files, assigned relationships, and volume by owner."
      >
        {/* Bespoke six-column track (rule 3); `.gridhd` owns the rest. */}
        <div className="lbl gridhd" style={{ gridTemplateColumns: AGENT_GRID }}>
          <div />
          <div>Agent</div>
          <div className="align-r">Active files</div>
          <div className="align-r">Relationships</div>
          <div className="align-r">Volume</div>
          <div>Latest file</div>
        </div>

        {visibleGroups.map((group) => {
          const isOpen = expanded.has(group.key);
          return (
            <div key={group.key}>
              {/* The row IS the control, so it stays a real <button>:
                  `.gridrow.act` carries the hover and the focus ring,
                  `.btnreset` the four things the UA button brings with it. */}
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(group.key)}
                className={cx("gridrow", "act", "btnreset", isOpen && "on")}
                style={{ gridTemplateColumns: AGENT_GRID }}
              >
                <Icon name={isOpen ? "chevD" : "chevR"} size={16} />
                <div>
                  <div className="trunc"><b>{group.name}</b></div>
                  <div className="sub row">
                    <span>{formatRelativeDays(group.latestFileAt)}</span>
                    {group.key === "unassigned" ? <CellChip tone="warn">Needs owner</CellChip> : null}
                  </div>
                </div>
                <div className={cx("align-r num", !group.activeLoans.length && "sub")}>
                  <b>{group.activeLoans.length}</b>
                </div>
                <div className={cx("align-r num", !group.clients.length && "sub")}>
                  <b>{group.clients.length}</b>
                </div>
                <div className={cx("align-r num", !group.totalValue && "sub")}>
                  <b>{group.totalValue ? QC_FMT.short(group.totalValue) : "-"}</b>
                </div>
                <div className={cx("num", !group.latestFileAt && "sub")}>
                  <b>{formatShortDate(group.latestFileAt)}</b>
                </div>
              </button>

              {isOpen ? (
                // Indented to clear the chevron column — a measured inset,
                // so it stays inline; `.grid` owns the stack.
                <div className="grid" style={{ padding: "0 16px 16px 48px" }}>
                  <div>
                    <div className="lbl" style={{ margin: "4px 0 8px" }}>
                      Active funding files
                    </div>
                    {group.activeLoans.length > 0 ? (
                      <div>
                        {group.activeLoans.map((row) => (
                          <Link
                            key={row.loan.id}
                            href={`/loans/${row.loan.id}`}
                            className="kcard linkreset"
                            // Bespoke six-column track (rule 3).
                            style={{
                              display: "grid",
                              gridTemplateColumns: AGENT_FILE_GRID,
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <div className="num"><b>{row.loan.deal_id}</b></div>
                            <div style={{ minWidth: 0 }}>
                              <div className="trunc"><b>{row.loan.address}</b></div>
                              <div className="sub trunc">
                                {row.loan.client_name ?? "No client"}{row.loan.city ? ` / ${row.loan.city}` : ""}
                              </div>
                            </div>
                            <ReadinessCell score={row.readiness.score} label={row.readiness.label} />
                            <div>
                              <b>{loanTypeLabel(row.loan.type)}</b>
                              <div className="sub">{String(row.loan.stage).replace(/_/g, " ")}</div>
                            </div>
                            <div className="align-r num"><b>{QC_FMT.short(Number(row.loan.amount))}</b></div>
                            <div className="row end">
                              <ConditionCell open={row.openDocs.length} flagged={row.flaggedDocs.length} total={row.loanDocs.length} />
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="empty">No active funding files for this agent.</div>
                    )}
                  </div>

                  <div>
                    <div className="lbl" style={{ margin: "2px 0 8px" }}>
                      Relationships
                    </div>
                    {group.clients.length > 0 ? (
                      <div className="grid cols-auto">
                        {group.clients.map((client) => {
                          const summary = summaryByClientId.get(client.id);
                          return (
                            <div key={client.id} className="card grid g8">
                              <div>
                                <div className="trunc"><b>{client.name}</b></div>
                                <div className="sub trunc">
                                  {client.email ?? "No email"}{client.city ? ` / ${client.city}` : ""}
                                </div>
                              </div>
                              <div className="row">
                                <Link href={`/clients/${client.id}/workspace`} className="btn sm">
                                  <Icon name="clients" size={11} /> Client
                                </Link>
                                {summary?.primary_deal_id ? (
                                  <Link href={`/deals/${summary.primary_deal_id}`} className="btn sm">
                                    <Icon name="file" size={11} /> Deal
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty">No relationships assigned to this agent.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {visibleGroups.length === 0 ? (
          <div className="empty">
            {search ? `No agents, files, or relationships match "${search}".` : "No agents or relationships found."}
          </div>
        ) : null}
      </Panel>
    </>
  );
}

// Right-click context menu for funding-mode pipeline rows. Currently
// only carries the "Reassign agent…" action — kept as a generic
// container so future row-level actions (e.g. open in new tab, copy
// link, archive) can drop in without restructuring.
function PipelineRowContextMenu({
  x,
  y,
  loan,
  canReassign,
  onReassign,
  onAssignAI,
  onClose,
}: {
  x: number;
  y: number;
  loan: Loan;
  canReassign: boolean;
  onReassign: () => void;
  onAssignAI: () => void;
  onClose: () => void;
}) {
  // Dismiss on Escape + outside-click. Defer the click handler one
  // tick so the right-click that opened this doesn't immediately
  // close it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = () => onClose();
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => {
      window.addEventListener("click", onClick);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      window.clearTimeout(id);
    };
  }, [onClose]);
  // The cursor coordinates are the one genuinely dynamic value here. They sit
  // on a zero-size fixed anchor so `.popmenu` — which positions itself
  // absolutely against its offset parent — keeps owning the panel's own box.
  // Hover feedback moved from the JS mouseover handlers to `.popmenu .mi:hover`.
  return (
    <div
      className="popmenu atcursor"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ top: y, left: x }}
    >
      <div className="lbl mhd">
        {loan.deal_id} · {loan.broker_name ?? "Unassigned"}
      </div>
      {canReassign && (
        <button
          type="button"
          className="mi"
          onClick={(e) => {
            e.stopPropagation();
            onReassign();
          }}
        >
          <span className="row">
            <Icon name="user" size={12} stroke={2.2} />
            {loan.broker_id ? "Reassign agent…" : "Assign agent…"}
          </span>
        </button>
      )}
      <button
        type="button"
        className="mi"
        onClick={(e) => {
          e.stopPropagation();
          onAssignAI();
        }}
      >
        <span className="row">
          <Icon name="spark" size={12} stroke={2.2} />
          Assign AI agent…
        </span>
      </button>
    </div>
  );
}

// FundingMetricsRow — slim ~30% replacement for the old FundingCommandStrip.
// One row of compact tiles (no big "Funding command" hero copy), paired
// with a Next Closing card that pulls the soonest close_date out of the
// visible loans. The card is the operator's "what does this week look
// like" pulse — what's about to fund, when, and how much.
function FundingMetricsRow({
  totalFiles, ready, needsStructure, openConditions, blockedAi, totalValue, rows,
}: {
  totalFiles: number;
  ready: number;
  needsStructure: number;
  openConditions: number;
  blockedAi: number;
  totalValue: number;
  rows: { loan: import("@/lib/types").Loan }[];
}) {
  // Next closing — earliest close_date in the visible set that hasn't
  // already passed (or, if everything's past, the soonest past one so
  // the operator notices the slipped close).
  const nextClose = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const withDate = rows
      .map((r) => r.loan)
      .filter((l) => !!l.close_date)
      .map((l) => ({ loan: l, ts: new Date(l.close_date as string).getTime() }))
      .sort((a, b) => a.ts - b.ts);
    if (withDate.length === 0) return null;
    const upcoming = withDate.find((x) => x.ts >= today.getTime());
    return upcoming ?? withDate[withDate.length - 1];
  }, [rows]);

  // Five stat tiles beside one "next closing" card. Deliberately NOT the
  // 12-column grid: the ratio is a design decision about how much room the
  // closing card needs, not a column span.
  return (
    <div
      className="mt"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        gap: 10,
        alignItems: "stretch",
      }}
    >
      <div className="kpis">
        <MiniMetric label="Files" value={totalFiles} tone="neutral" />
        <MiniMetric label="UW ready" value={ready} tone={ready ? "ready" : "neutral"} />
        <MiniMetric label="Needs structure" value={needsStructure} tone={needsStructure ? "watch" : "ready"} />
        <MiniMetric label="Open conditions" value={openConditions} tone={openConditions ? "watch" : "ready"} />
        <MiniMetric label="AI blocked" value={blockedAi} tone={blockedAi ? "danger" : "ready"} sub={QC_FMT.short(totalValue)} />
      </div>
      <NextClosingCard item={nextClose} />
    </div>
  );
}

/** Tone is the status signal, so it goes on `.kpi.tone-*` — the tile carries
 *  it on the surface AND on the figure. This band is scanned, not read: a
 *  colour on the number alone means visiting all five tiles to find the one
 *  that is blocking you. Not the shared `Kpi`, which reads its tone off a
 *  delta chip this row does not have. */
function MiniMetric({
  label, value, tone = "neutral", sub,
}: {
  label: string;
  value: string | number;
  tone?: "ready" | "watch" | "danger" | "neutral";
  sub?: string;
}) {
  const toneClass =
    tone === "ready" ? "tone-ok"
      : tone === "watch" ? "tone-warn"
        : tone === "danger" ? "tone-bad"
          : null;
  return (
    <div className={cx("kpi", toneClass)}>
      <div className="lbl trunc">{label}</div>
      <div className="knum num">{value}</div>
      {sub ? <div className="sub">{sub} total</div> : null}
    </div>
  );
}

function NextClosingCard({
  item,
}: {
  item: { loan: import("@/lib/types").Loan; ts: number } | null;
}) {
  if (item === null) {
    return (
      <div className="card row">
        <Icon name="cal" size={16} />
        <div className="grow">
          <div className="lbl">Next closing</div>
          <div className="sub">No close dates on any file yet.</div>
        </div>
      </div>
    );
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((item.ts - today.getTime()) / 86_400_000);
  const overdue = days < 0;
  const daysLabel = days === 0 ? "today" : overdue ? `${Math.abs(days)}d overdue` : `in ${days}d`;
  const tone: ChipTone = overdue ? "bad" : days <= 3 ? "warn" : days <= 10 ? "acc" : "mut";
  const dateStr = new Date(item.ts).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  return (
    <Link
      href={`/loans/${item.loan.id}`}
      className="card linkreset"
      // Bespoke three-column track (rule 3).
      style={{
        display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 10,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 64, textAlign: "center" }}>
        <div className="lbl">{overdue ? "Slipped" : "Closes"}</div>
        <CellChip tone={tone}>{daysLabel}</CellChip>
      </div>
      <div>
        <div className="lbl">Next closing</div>
        <div className="trunc"><b>{item.loan.address}</b></div>
        <div className="sub trunc">
          {dateStr} · {item.loan.deal_id}
          {item.loan.client_name ? ` · ${item.loan.client_name}` : ""}
        </div>
      </div>
      <div className="align-r" style={{ whiteSpace: "nowrap" }}>
        <div className="num"><b>{QC_FMT.short(Number(item.loan.amount))}</b></div>
        <div className="lbl">{String(item.loan.type).replace("_", " ")}</div>
      </div>
    </Link>
  );
}

/** Readiness colour is data-derived, so it stays an inline value on both the
 *  figure and the `.track` fill — the bar itself is a class. */
function readinessColor(score: number): string {
  return score >= 85 ? "var(--ok)" : score >= 65 ? "var(--warn)" : "var(--accent)";
}

function CreditCell({ fico, override }: { fico: number | null; override: boolean }) {
  if (fico === null) {
    return <div className="align-r sub">—</div>;
  }
  const tone = fico >= 740 ? "var(--ok)" : fico >= 680 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="align-r num">
      <b style={{ color: tone }}>{fico}</b>
      {override ? <div className="lbl">override</div> : null}
    </div>
  );
}

function ReadinessCell({ score, label }: { score: number; label: string }) {
  const color = readinessColor(score);
  return (
    // minWidth stays: this cell is also rendered inside a `.kcard` grid,
    // where nothing else zeroes the item's automatic minimum size.
    <div style={{ minWidth: 0 }}>
      <div className="row split">
        <b className="num" style={{ color }}>{score}%</b>
        <span className="sub trunc">{label}</span>
      </div>
      <div className="track" style={{ marginTop: 5 }}>
        {/* Width and tone are the data; `.fill` owns the rest of the bar. */}
        <div className="fill" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

function ReadinessBar({ score, label }: { score: number; label: string }) {
  const color = readinessColor(score);
  return (
    <div>
      <div className="row split">
        <span className="sub trunc">{label}</span>
        <b className="num" style={{ color }}>{score}%</b>
      </div>
      <div className="track" style={{ marginTop: 5 }}>
        {/* Width and tone are the data; `.fill` owns the rest of the bar. */}
        <div className="fill" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

type PipelineAction = {
  label: string;
  tone: "ready" | "watch" | "danger" | "brand";
};

function getPipelineAction(
  readiness: number,
  openDocs: number,
  flaggedDocs: number,
  summary: DSPipelineSummaryItem | undefined,
): PipelineAction {
  if (summary?.state === "blocked") return { label: "AI blocked", tone: "danger" };
  if (flaggedDocs > 0) return { label: "Review docs", tone: "danger" };
  if (readiness < 65) return { label: "Build criteria", tone: "brand" };
  if (openDocs > 0) return { label: "Collect docs", tone: "watch" };
  if (summary?.state === "waiting_borrower") return { label: "Waiting borrower", tone: "watch" };
  if (readiness >= 85) return { label: "Submit UW", tone: "ready" };
  return { label: "File review", tone: "brand" };
}

function PipelineActionCell({ action, compact }: { action: PipelineAction; compact?: boolean }) {
  const tone: ChipTone =
    action.tone === "ready" ? "ok"
      : action.tone === "danger" ? "bad"
        : action.tone === "watch" ? "warn"
          : "acc";
  // `compact` is the kanban card's left-aligned variant; the table cell centres.
  return (
    <div style={{ minWidth: 0, textAlign: compact ? "left" : "center" }}>
      <CellChip tone={tone}>{action.label}</CellChip>
    </div>
  );
}

function ConditionCell({ open, flagged, total }: { open: number; flagged: number; total: number }) {
  const tone: ChipTone = flagged ? "bad" : open ? "warn" : total ? "ok" : "mut";
  return (
    <CellChip tone={tone}>
      <span className="repdot" />
      {flagged ? `${flagged} flagged` : open ? `${open} open` : total ? "clear" : "none"}
    </CellChip>
  );
}

function SortHead({
  label, k, current, dir, onClick, align,
}: { label: string; k: SortKey; current: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void; align?: "left" | "right" }) {
  const active = current === k;
  // `.gridhd-c` is the sortable column head — the typography, the button
  // reset and the active-state colour all live there. Alignment is
  // per-column data, so it stays inline (same call as SortableTableHead).
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      aria-label={`Sort by ${label}`}
      className={cx("gridhd-c", active && "on")}
      style={align === "right" ? { justifyContent: "flex-end" } : undefined}
    >
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </button>
  );
}

function DealSecretaryBadge({ summary }: { summary: DSPipelineSummaryItem | undefined }) {
  if (!summary || summary.ai_task_count === 0) return null;

  // Map state → icon + tone.
  let icon = "ai";
  let tone: ChipTone = "acc";
  let label = "";
  if (summary.state === "blocked") {
    icon = "alert"; tone = "warn";
    label = summary.current_blocker
      ? `Blocked · ${summary.current_blocker}`
      : `Blocked · ${summary.blocked_count} task${summary.blocked_count === 1 ? "" : "s"}`;
  } else if (summary.state === "waiting_borrower") {
    label = "Waiting on borrower";
    if (summary.next_outreach_at) {
      const at = new Date(summary.next_outreach_at);
      label += ` · next ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
  } else if (summary.state === "active_work") {
    label = `AI working · ${summary.ai_task_count} task${summary.ai_task_count === 1 ? "" : "s"}`;
  } else {
    // setup
    icon = "pause"; tone = "mut";
    label = `Setup · ${summary.ai_task_count} assigned, outreach off`;
  }

  return (
    <>
      <span aria-hidden>·</span>
      <CellChip tone={tone}>
        <Icon name={icon} size={11} />
        {label}
      </CellChip>
    </>
  );
}
